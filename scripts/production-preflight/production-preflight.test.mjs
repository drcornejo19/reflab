import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalObjectManifest,
  DEVELOPMENT_PROJECT_REF,
  migrationManifest,
  MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION,
  PRODUCTION_PROJECT_REF,
  REQUIRED_IN_PRODUCTION,
  runtimeRpcSignatures,
} from "./manifest.mjs";
import { baseInventoryQueries, buildIdentityQueries, buildSqlBatch, compareInventoryWithManifest, semanticQueries } from "./queries.mjs";
import { assertReadOnlyBatch, assertReadOnlySql } from "./sql-safety.mjs";
import { buildConditionalInventory, classifyMigrationHistory, runProductionPreflight } from "./run.mjs";
import { authorizeProductionPreflightTarget } from "./target.mjs";

const productionEnvironment = {
  ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
  REFLAB_PRODUCTION_PREFLIGHT_PROJECT_REF: PRODUCTION_PROJECT_REF,
  REFLAB_PRODUCTION_PREFLIGHT_DB_URL: `postgresql://readonly:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
};

test("target guard accepts only the exact Production database host", () => {
  const result = authorizeProductionPreflightTarget(productionEnvironment);
  assert.equal(result.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(result.host, `db.${PRODUCTION_PROJECT_REF}.supabase.co`);
  assert.equal(result.connectionEnvironment.PGSSLMODE, "require");
});

test("target guard fails closed for missing opt-in, unknown hosts and any Development reference", () => {
  assert.throws(() => authorizeProductionPreflightTarget({}), /opt-in/);
  assert.throws(() => authorizeProductionPreflightTarget({ ...productionEnvironment, REFLAB_PRODUCTION_PREFLIGHT_DB_URL: "postgresql://readonly:secret@example.com/postgres?sslmode=require" }), /allowlisted host/);
  assert.throws(() => authorizeProductionPreflightTarget({ ...productionEnvironment, UNRELATED_VALUE: DEVELOPMENT_PROJECT_REF }), /Development project reference/);
});

test("an unauthorized target aborts before psql can be started", () => {
  let spawned = false;
  assert.throws(() => runProductionPreflight({}, {
    spawn() {
      spawned = true;
      throw new Error("must not run");
    },
  }), /opt-in/);
  assert.equal(spawned, false);
});

test("generated SQL is wrapped, time-limited and restricted to the read-only allowlist", () => {
  const sql = buildSqlBatch([...baseInventoryQueries, ...semanticQueries, ...buildIdentityQueries({ includeLinks: true })]);
  const statements = assertReadOnlyBatch(sql);
  assert.match(statements[0], /^begin read only$/i);
  assert.match(statements.at(-1), /^rollback$/i);
  assert.ok(statements.some((statement) => /^show default_transaction_read_only$/i.test(statement)));
  assert.ok(statements.some((statement) => /^show transaction_read_only$/i.test(statement)));
  assert.ok(statements.some((statement) => /^select current_user, session_user$/i.test(statement)));
  assert.ok(statements.findIndex((statement) => /current_setting\(\s*\) =/i.test(statement)) < statements.findIndex((statement) => /pg_catalog\.pg_namespace/i.test(statement)));
  assert.match(sql, /statement_timeout = '15s'/);
  assert.match(sql, /lock_timeout = '2s'/);
});

test("both runner phases independently enforce a read-only transaction before inventory", () => {
  const batches = [];
  const outputs = [
    `${JSON.stringify({ query: "catalog_gate", payload: { tables: [], columns: [] } })}\n`,
    "",
  ];
  runProductionPreflight(productionEnvironment, {
    spawn(_command, _arguments, options) {
      batches.push(options.input);
      return { status: 0, stdout: outputs.shift(), stderr: "" };
    },
    writeReport() {},
  });
  assert.equal(batches.length, 2);
  for (const sql of batches) {
    const statements = assertReadOnlyBatch(sql);
    const guardIndex = statements.findIndex((statement) => /current_setting\(\s*\) =/i.test(statement));
    const substantiveIndex = statements.findIndex((statement, index) => index > guardIndex && /^select\b/i.test(statement));
    assert.ok(guardIndex >= 0);
    assert.ok(substantiveIndex > guardIndex);
  }
});

test("forbidden SQL is rejected while controlled comments and strings are ignored", () => {
  for (const keyword of ["insert", "update", "delete", "upsert", "merge", "create", "alter", "drop", "truncate", "grant", "revoke", "call", "copy"]) {
    assert.throws(() => assertReadOnlySql(`select 1; ${keyword} unsafe_target`), /Forbidden SQL keyword|not allowlisted/);
  }
  assert.doesNotThrow(() => assertReadOnlySql("select 'INSERT UPDATE DELETE' as harmless /* DROP */ -- GRANT\n"));
  assert.doesNotThrow(() => assertReadOnlySql("select $$ALTER DROP$$ as harmless, 'CaLl CoPy' as text"));
  assert.throws(() => assertReadOnlySql("select 1; /* harmless */ UpDaTe unsafe_target set value = 1"), /Forbidden SQL keyword/);
  assert.throws(() => assertReadOnlySql("with changed as (\n  DELETE from unsafe_target\n) select 1"), /Forbidden SQL keyword/);
  assert.throws(() => assertReadOnlySql("select 1 /* unterminated"), /unterminated/);
  assert.throws(() => assertReadOnlySql("select 'unterminated"), /unterminated/);
  assert.throws(() => assertReadOnlySql("select 1; \\copy x to 'file'"), /meta-commands/);
});

test("P5 detects direct claims, auth.jwt, sub extraction and external-subject fallback", () => {
  const p5 = baseInventoryQueries.find((query) => query.id === "p5_direct_identity_readers").sql;
  assert.match(p5, /request\.jwt\.claims/i);
  assert.match(p5, /auth\[\.\]jwt/i);
  assert.match(p5, /->>''sub''/i);
  assert.match(p5, /request\.jwt\.claim\.sub/i);
  assert.match(p5, /auth\[\.\]uid/i);
  assert.match(p5, /external_subject_fallback/i);
  assert.doesNotMatch(p5, /select\s+external_subject\s+as/i);
});

test("optional identity and semantic queries declare existence dependencies", () => {
  for (const query of [...semanticQueries, ...buildIdentityQueries({ includeLinks: true })]) {
    if (query.id === "storage_object_policies") continue;
    assert.ok((query.requires.tables?.length ?? 0) > 0, `${query.id} lacks a table gate`);
  }
  const catalog = { tables: ["public.attempts"], columns: ["public.attempts.user_id"] };
  const conditional = buildConditionalInventory(catalog);
  assert.equal(conditional.linksAvailable, false);
  assert.ok(conditional.skipped.some((entry) => entry.query === "identity_link_structure"));
});

test("trigger, grant and Storage inventories remain separate and complete", () => {
  const ids = new Set(baseInventoryQueries.map((query) => query.id).concat(semanticQueries.map((query) => query.id)));
  for (const id of ["trigger_inventory", "index_inventory", "unique_constraint_inventory", "table_grants", "schema_grants", "routine_grants", "sequence_grants", "role_memberships", "storage_buckets", "storage_object_counts", "storage_object_policies"]) {
    assert.ok(ids.has(id), `Missing ${id}`);
  }
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /enabled_state/);
  assert.match(baseInventoryQueries.find((query) => query.id === "trigger_inventory").sql, /function_executed/);
  assert.match(baseInventoryQueries.find((query) => query.id === "index_inventory").sql, /constraint_state\.conindid = index_class\.oid/);
  assert.match(baseInventoryQueries.find((query) => query.id === "unique_constraint_inventory").sql, /constraint_state\.contype = 'u'/);
  assert.doesNotMatch(baseInventoryQueries.find((query) => query.id === "policy_inventory").sql, /\bcmd, qual, with_check\b/i);
  assert.doesNotMatch(semanticQueries.find((query) => query.id === "storage_object_policies").sql, /\bcmd, qual, with_check\b/i);
  assert.match(baseInventoryQueries.find((query) => query.id === "role_memberships").sql, /with recursive inherited_roles/i);
  for (const id of ["table_grants", "schema_grants", "routine_grants", "sequence_grants"]) {
    assert.doesNotMatch(baseInventoryQueries.find((query) => query.id === id).sql, /and \(acl\.grantee = 0/);
  }
});

test("token ownership conflicts always return an integer", () => {
  const query = semanticQueries.find((entry) => entry.id === "notification_integrity").sql;
  assert.match(query, /token_owner_conflicts', coalesce\(\(select count\(\*\)/i);
  assert.match(query, /\), 0\)/);
});

test("canonical manifest separates required and forbidden Production RPC categories", () => {
  assert.deepEqual(canonicalObjectManifest.sanityCounts, { tables: 81, functions: 30, policies: 150, triggers: 82, explicitIndexes: 111 });
  assert.equal(canonicalObjectManifest.tables.length, 81);
  assert.equal(canonicalObjectManifest.functions.length, 30);
  assert.equal(canonicalObjectManifest.policies.length, 150);
  assert.equal(canonicalObjectManifest.triggers.length, 82);
  assert.equal(canonicalObjectManifest.explicitIndexes.length, 111);
  assert.ok(canonicalObjectManifest.policies.every((entry) =>
    entry.schema && entry.table && entry.name && entry.command && entry.mode && entry.roles?.length
  ));
  assert.equal(canonicalObjectManifest.sanityCounts.tables, 81);
  assert.deepEqual(
    REQUIRED_IN_PRODUCTION.filter((signature) => MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.includes(signature)),
    []
  );
  assert.equal(REQUIRED_IN_PRODUCTION.length, 7);
  assert.equal(MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.length, 3);
  assert.equal(runtimeRpcSignatures.length, 10);
  assert.deepEqual(REQUIRED_IN_PRODUCTION, [
    "public.admin_set_canonical_user_plan(text, text, text, text)",
    "public.admin_set_canonical_global_role(text, text, text, text)",
    "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)",
    "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
    "public.consume_coach_rate_limit(text, text, integer, integer)",
    "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)",
    "public.accept_canonical_institution_invitation(text, uuid, text[])",
  ]);
  assert.deepEqual(MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION, [
    "public.resolve_development_clerk_identity(text)",
    "public.link_development_clerk_identity(text)",
    "public.link_development_super_admin_clerk_identity(text)",
  ]);
  assert.ok(runtimeRpcSignatures
    .filter((entry) => entry.productionCategory === "REQUIRED_IN_PRODUCTION")
    .every((entry) => !MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.includes(entry.signature)));
});

test("migration history classifies known and unknown versions without executing them", () => {
  const rows = classifyMigrationHistory([
    { version: "202607270000", name: "reflab_canonical_baseline" },
    { version: "999999999999", name: "unknown_remote_change" },
  ]);
  assert.equal(rows.find((entry) => entry.version === "202607270000").classification, "empty_database_only");
  assert.equal(rows.find((entry) => entry.version === "202607270000").status, "applied");
  assert.equal(rows.find((entry) => entry.version === "202607300001").status, "missing");
  assert.equal(rows.find((entry) => entry.version === "999999999999").classification, "unknown");
  assert.equal(rows.find((entry) => entry.version === "999999999999").gate, "BLOCKER_UNKNOWN_MIGRATION");
});

test("migration manifest covers every local migration and distinguishes adoption safety", () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const localVersions = readdirSync(resolve(repositoryRoot, "supabase", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.slice(0, 12))
    .sort();
  assert.deepEqual(migrationManifest.map((entry) => entry.version).sort(), localVersions);
  assert.ok(migrationManifest.some((entry) => entry.classification === "legacy_historical_not_for_replay"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "empty_database_only"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "development_only"));
  assert.ok(migrationManifest.some((entry) => entry.classification === "incremental_requires_adoption"));
  assert.ok(migrationManifest
    .filter((entry) => ["empty_database_only", "development_only"].includes(entry.classification))
    .every((entry) => entry.productionAction === "NEVER_EXECUTE_IN_PRODUCTION"));
  assert.ok(migrationManifest
    .filter((entry) => entry.classification === "incremental_requires_adoption")
    .every((entry) => entry.productionAction === "MANUAL_ADOPTION_AFTER_ALL_GATES"));
});

test("an applied Development migration is a Production blocker", () => {
  const rows = classifyMigrationHistory([
    { version: "202607300001", name: "clerk_identity_links" },
  ]);
  assert.equal(
    rows.find((entry) => entry.version === "202607300001").gate,
    "BLOCKER_DEVELOPMENT_MIGRATION_IN_PRODUCTION"
  );
});

test("policy comparison is scoped by schema and table, not only by policy name", () => {
  const expected = canonicalObjectManifest.policies.find((entry) => entry.scope === "shared");
  const results = new Map([
    ["catalog_gate", { tables: canonicalObjectManifest.tables, columns: [] }],
    ["policy_inventory", [{ schema_name: "wrong_schema", table_name: "wrong_table", policy_name: expected.name }]],
  ]);
  const comparison = compareInventoryWithManifest(results);
  assert.ok(comparison.missingPolicies.includes(`${expected.schema}.${expected.table}.${expected.name}`));
});

test("Development RPCs are blockers only when executable by an application role", () => {
  const signature = MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION[0];
  const baseResults = new Map([
    ["catalog_gate", { tables: [], columns: [] }],
    ["function_inventory", [{ signature, security: "DEFINER", search_path: "search_path=pg_catalog" }]],
    ["routine_grants", []],
  ]);
  const nonExecutable = compareInventoryWithManifest(baseResults);
  assert.deepEqual(nonExecutable.developmentRpcInventory, [signature]);
  assert.deepEqual(nonExecutable.executableDevelopmentRpcs, []);

  baseResults.set("routine_grants", [{ signature, grantee: "service_role", privilege: "EXECUTE" }]);
  const executable = compareInventoryWithManifest(baseResults);
  assert.deepEqual(executable.executableDevelopmentRpcs, [signature]);
  assert.deepEqual(executable.forbiddenDevelopmentFunctions, [signature]);

  baseResults.set("routine_grants", [{ signature, grantee: "inherited_app_role", privilege: "EXECUTE" }]);
  baseResults.set("role_memberships", [{ effective_for: "authenticated", granted_role: "inherited_app_role" }]);
  assert.deepEqual(compareInventoryWithManifest(baseResults).executableDevelopmentRpcs, [signature]);
});

test("sanity counts never approve and extra historical objects remain inventory only", () => {
  const results = new Map([
    ["catalog_gate", { tables: ["public.historical_extra"], columns: [] }],
  ]);
  const comparison = compareInventoryWithManifest(results);
  assert.equal(comparison.sanity.approvalCriterion, false);
  assert.equal(comparison.approvalBasis, "OBJECT_BY_OBJECT");
  assert.ok(comparison.objectBlockers.length > 0);
  assert.equal(comparison.extraHistoricalObjects.disposition, "INVENTORY_ONLY_UNLESS_CONFLICTING");
  assert.deepEqual(comparison.extraHistoricalObjects.tables, ["public.historical_extra"]);
  assert.ok(comparison.missingTables.length > 0);
});

test("identity queries return only aggregates and never raw PII values", () => {
  const sql = buildIdentityQueries({ includeLinks: true }).map((query) => query.sql).join("\n");
  assert.doesNotMatch(sql, /json_build_object\([^)]*'external_subject'\s*,\s*l\.external_subject/i);
  assert.doesNotMatch(sql, /json_build_object\([^)]*'token'\s*,\s*t\.token/i);
  assert.doesNotMatch(sql, /\bemail\b|\bfirst_name\b|\blast_name\b|\bstorage_path\b/i);
});
