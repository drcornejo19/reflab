import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalObjectManifest } from "../../production-preflight/manifest.mjs";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import {
  buildFingerprintInventory,
  buildFingerprintSql,
  fingerprintBaseQueries,
  fingerprintInventoryQueries,
} from "./fingerprint-queries.mjs";
import {
  buildFingerprint,
  canonicalJson,
  runProductionFingerprint,
} from "./fingerprint.mjs";
import { buildGitMigrationEvidence, compareFingerprint } from "./compare.mjs";
import { authorizeLocalPostgresTarget } from "./local-target.mjs";
import { runPhase1SecurityRehearsal } from "./run-security-rehearsal.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const positiveRehearsal = readFileSync(resolve(directory, "phase1-security-rehearsal.sql"), "utf8");
const negativeRehearsal = readFileSync(resolve(directory, "phase1-security-rehearsal-failure.sql"), "utf8");

function completeResultMap(overrides = {}) {
  const values = {
    fingerprint_role: {
      rolname: "reflab_prod_preflight_ro",
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolbypassrls: false,
      rolcanlogin: true,
    },
    schema_inventory: [],
    table_inventory: [],
    column_inventory: [],
    constraint_inventory: [],
    index_inventory: [],
    function_inventory: [],
    trigger_inventory: [],
    policy_inventory: [],
    explicit_acl_inventory: [],
    default_acl_inventory: [],
    role_membership_inventory: [],
    migration_history_structure: {},
    storage_bucket_inventory: [],
    storage_object_aggregate: [],
    institution_catalog_aggregate: {},
    ...overrides,
  };
  return new Map(Object.entries(values));
}

test("fingerprint SQL is fully wrapped in BEGIN READ ONLY and ROLLBACK", () => {
  const sql = buildFingerprintSql([...fingerprintBaseQueries, ...fingerprintInventoryQueries]);
  const statements = assertReadOnlyBatch(sql);
  assert.match(statements[0], /^begin read only$/i);
  assert.match(statements.at(-1), /^rollback$/i);
  assert.equal((sql.match(/begin read only/gi) ?? []).length, 1);
  assert.match(sql, /statement_timeout = '15s'/);
  assert.match(sql, /lock_timeout = '2s'/);
});

test("fingerprint queries inventory every required structural evidence category", () => {
  const ids = new Set(fingerprintInventoryQueries.map((query) => query.id));
  for (const id of [
    "schema_inventory", "table_inventory", "column_inventory", "constraint_inventory",
    "index_inventory", "function_inventory", "trigger_inventory", "policy_inventory",
    "explicit_acl_inventory", "default_acl_inventory", "role_membership_inventory",
    "migration_history_structure", "storage_bucket_inventory", "storage_object_aggregate",
    "institution_catalog_aggregate",
  ]) assert.ok(ids.has(id), `missing fingerprint query ${id}`);
});

test("fingerprint never selects Storage paths or user identity values", () => {
  const sql = fingerprintInventoryQueries.map((query) => query.payloadSql).join("\n");
  assert.doesNotMatch(sql, /storage[.]objects\s+o[\s\S]{0,200}\bo[.]name\b/i);
  assert.doesNotMatch(sql, /\b(email|token|external_subject|user_id)\b/i);
  assert.match(sql, /group by o[.]bucket_id/i);
});

test("missing optional dependencies become UNKNOWN rather than MISSING", () => {
  const catalog = { schemas: ["public"], tables: [], columns: [] };
  const { runnable, skipped } = buildFingerprintInventory(catalog);
  assert.ok(skipped.some((entry) => entry.query === "storage_bucket_inventory" && entry.status === "UNKNOWN_MISSING_DEPENDENCY"));
  assert.ok(skipped.some((entry) => entry.query === "institution_catalog_aggregate"));
  assert.ok(!runnable.some((query) => query.id === "storage_object_aggregate"));
});

test("fingerprint output is deterministic and strips function source", () => {
  const results = completeResultMap({
    function_inventory: [{
      signature: "public.sample()", owner: "reflab_rls_owner", security: "INVOKER",
      search_path: "pg_catalog", source_hash: "a".repeat(64), source_definition: "sensitive body",
    }],
    trigger_inventory: [{
      schema_name: "public", table_name: "sample", trigger_name: "sample_trigger",
      enabled_state: "O", function_signature: "public.sample()",
      definition: "CREATE TRIGGER sample_trigger BEFORE UPDATE ON public.sample EXECUTE FUNCTION public.sample()",
    }],
  });
  const first = buildFingerprint(results);
  const second = buildFingerprint(results);
  assert.equal(first.fingerprintHash, second.fingerprintHash);
  assert.equal(canonicalJson(first).includes("source_definition"), false);
  assert.equal(canonicalJson(first).includes("sensitive body"), false);
  assert.match(first.sections.triggers[0].definition_hash, /^[a-f0-9]{64}$/);
});

test("privileged aggregate visibility is not claimed without bypass evidence", () => {
  const fingerprint = buildFingerprint(completeResultMap());
  assert.equal(fingerprint.visibility.storageBuckets, "OBSERVED_NOT_PROVEN_COMPLETE");
  assert.equal(fingerprint.visibility.institutionCatalog, "OBSERVED_NOT_PROVEN_COMPLETE");
});

test("unsafe fingerprint credentials fail closed", () => {
  for (const property of ["rolsuper", "rolcreatedb", "rolcreaterole"]) {
    const role = { ...completeResultMap().get("fingerprint_role"), [property]: true };
    assert.throws(() => buildFingerprint(completeResultMap({ fingerprint_role: role })), /non-superuser/);
  }
});

test("fingerprint runner rejects an unauthorized target before spawning psql", () => {
  let spawned = false;
  assert.throws(() => runProductionFingerprint({}, {
    spawn() { spawned = true; throw new Error("must not run"); },
  }), /opt-in/);
  assert.equal(spawned, false);
});

test("comparison never infers a Git migration as applied", () => {
  const evidence = buildGitMigrationEvidence();
  assert.ok(evidence.length > 0);
  assert.ok(evidence.every((entry) => entry.appliedStatus === "NOT_INFERRED"));
  assert.ok(evidence.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
});

test("comparison uses EXACT, DRIFTED, ABSENT, LEGACY_EXTRA and AMBIGUOUS conservatively", () => {
  const expectedBucket = canonicalObjectManifest.buckets.find((bucket) => bucket.id === "avatars");
  const fingerprint = buildFingerprint(completeResultMap({
    table_inventory: [
      { schema_name: "public", table_name: "access_plans", owner: "reflab_rls_owner", rls_enabled: true, rls_forced: false },
      { schema_name: "public", table_name: "profiles", owner: "postgres", rls_enabled: true, rls_forced: false },
      { schema_name: "public", table_name: "unattributed_table", owner: "postgres", rls_enabled: true, rls_forced: false },
    ],
    storage_bucket_inventory: [{
      id: expectedBucket.id, public: expectedBucket.public,
      file_size_limit: expectedBucket.file_size_limit_bytes,
      allowed_mime_types: expectedBucket.allowed_mime_types,
    }],
  }));
  fingerprint.visibility.storageBuckets = "CONFIRMED";
  const comparison = compareFingerprint(fingerprint);
  assert.ok(comparison.objects.some((entry) => entry.kind === "table" && entry.key === "public.access_plans" && entry.state === "EXACT"));
  assert.ok(comparison.objects.some((entry) => entry.key === "public.profiles" && entry.state === "LEGACY_EXTRA"));
  assert.ok(comparison.objects.some((entry) => entry.key === "public.unattributed_table" && entry.state === "AMBIGUOUS"));
  assert.ok(comparison.objects.some((entry) => entry.kind === "bucket" && entry.key === "avatars" && entry.state === "EXACT"));
  assert.ok(comparison.objects.some((entry) => entry.kind === "bucket" && entry.key === "Videos" && entry.state === "ABSENT"));
  assert.equal(comparison.migrationInference, "PROHIBITED");
});

test("unknown Storage visibility produces AMBIGUOUS rather than ABSENT", () => {
  const fingerprint = buildFingerprint(completeResultMap(), [{
    query: "storage_bucket_inventory", status: "UNKNOWN_MISSING_DEPENDENCY", requires: { tables: ["storage.buckets"] },
  }]);
  const comparison = compareFingerprint(fingerprint);
  const buckets = comparison.objects.filter((entry) => entry.kind === "bucket");
  assert.ok(buckets.length > 0);
  assert.ok(buckets.every((entry) => entry.state === "AMBIGUOUS"));
});

test("local rehearsal target rejects every remote host and transaction pooler port", () => {
  assert.throws(() => authorizeLocalPostgresTarget({ PGHOST: "db.example.supabase.co", PGDATABASE: "postgres" }), /local/);
  assert.throws(() => authorizeLocalPostgresTarget({ PGHOST: "127.0.0.1", PGPORT: "6543", PGDATABASE: "local" }), /session port/);
  assert.doesNotThrow(() => authorizeLocalPostgresTarget({ PGHOST: "localhost", PGPORT: "54322", PGDATABASE: "local" }));
});

test("positive rehearsal covers both fail-closed creation strategies", () => {
  assert.equal((positiveRehearsal.match(/^begin;/gim) ?? []).length, 2);
  assert.equal((positiveRehearsal.match(/^rollback;/gim) ?? []).length, 2);
  assert.match(positiveRehearsal, /authorization postgres/i);
  assert.match(positiveRehearsal, /set local role reflab_rls_owner/i);
  assert.equal((positiveRehearsal.match(/force row level security/gi) ?? []).length, 2);
  assert.ok((positiveRehearsal.match(/revoke all on table/gi) ?? []).length >= 2);
  assert.ok((positiveRehearsal.match(/revoke all on function/gi) ?? []).length >= 2);
  assert.match(positiveRehearsal, /has_table_privilege/i);
  assert.match(positiveRehearsal, /has_function_privilege/i);
});

test("negative rehearsal deliberately aborts on an unexpected browser grant", () => {
  assert.match(negativeRehearsal, /grant insert[\s\S]*to authenticated/i);
  assert.match(negativeRehearsal, /PHASE0_EXPECTED_SECURITY_ABORT/);
  assert.match(negativeRehearsal, /^begin;/im);
  assert.match(negativeRehearsal, /^rollback;/im);
});

test("rehearsal runner uses an allowlisted subprocess environment and verifies rollback", () => {
  const calls = [];
  const result = runPhase1SecurityRehearsal({
    PGHOST: "127.0.0.1", PGPORT: "54322", PGDATABASE: "phase0_local", PGUSER: "postgres",
    PGOPTIONS: "-c role=unsafe", PGSERVICE: "unsafe", PATH: process.env.PATH,
  }, {
    spawn(command, args, options) {
      calls.push({ command, args, options });
      if (calls.length === 1) return { status: 0, stdout: "", stderr: "" };
      if (calls.length === 2) return { status: 1, stdout: "", stderr: "ERROR: PHASE0_EXPECTED_SECURITY_ABORT" };
      return { status: 0, stdout: "t\n", stderr: "" };
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(result.rollbackVerified, true);
  assert.ok(calls.every((call) => !Object.hasOwn(call.options.env, "PGOPTIONS")));
  assert.ok(calls.every((call) => !Object.hasOwn(call.options.env, "PGSERVICE")));
  assert.ok(calls.every((call) => call.options.env.PGHOST === "127.0.0.1"));
});
