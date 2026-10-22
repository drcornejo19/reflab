import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CANONICAL_RUNTIME_INSTALLED_ARTIFACT,
  CANONICAL_RUNTIME_INSTALLED_MUTATIONS,
  CANONICAL_RUNTIME_INSTALLED_SHA256,
  CANONICAL_RUNTIME_LEDGER_ACL,
  CANONICAL_RUNTIME_LEDGER_COLUMNS,
  CANONICAL_RUNTIME_LEDGER_CONSTRAINTS,
  CANONICAL_RUNTIME_LEDGER_GUARD_ACL,
  CANONICAL_RUNTIME_LEDGER_ROWS_POST,
  CANONICAL_RUNTIME_LEDGER_ROWS_PRE,
  CANONICAL_RUNTIME_LEDGER_SCHEMA_ACL,
  CANONICAL_RUNTIME_PLAN,
  PRODUCTION_ADOPTION_GUARD_SOURCE_SHA256,
  assertCanonicalRuntimeInstalledArtifact,
  canonicalRuntimeInstalledPostQuery,
  canonicalRuntimeInstalledPreQuery,
  classifyCanonicalRuntimeInstalledComposition,
  classifyCanonicalRuntimeInstalledState,
} from "./phase2b-canonical-runtime-installed-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(resolve(root, CANONICAL_RUNTIME_INSTALLED_ARTIFACT), "utf8");
const foundation = readFileSync(resolve(root,
  "supabase/migrations/202608310001_production_adoption_foundation.sql"), "utf8");
const guardBody = foundation.match(/create function reflab_meta[.]guard_production_adoption_state[(][)][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";

function payload(post = false) {
  const rows = (post ? CANONICAL_RUNTIME_LEDGER_ROWS_POST : CANONICAL_RUNTIME_LEDGER_ROWS_PRE)
    .map((entry) => ({ ...entry, ...CANONICAL_RUNTIME_PLAN, recorded_at_present: true }));
  return {
    checks: Object.fromEntries([
      "sessionExact", "historicalFingerprintsExact", "historicalProviderDataExact",
      "schemaStateEmpty", "canonicalMarkerAbsent", "developmentObjectsAbsent",
      "cutoverAbsent", "ledgerRelationExact", "ledgerTriggerExact", "noLaterLedgerPhase",
    ].map((name) => [name, true])),
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      payload_hash_nulls: 37, communication_attempts: 0,
      ledger_rows: post ? 4 : 3, schema_state_rows: 0,
    },
    columns: CANONICAL_RUNTIME_LEDGER_COLUMNS.map((entry) => ({ ...entry })),
    constraints: CANONICAL_RUNTIME_LEDGER_CONSTRAINTS.map((entry) => ({
      ...entry, columns: [...entry.columns], validated: true,
    })),
    guard_function: {
      identity_arguments: "", result_type: "trigger", language_name: "plpgsql",
      volatility: "v", strict_mode: false, security_definer: false, leakproof: false,
      function_kind: "f", owner_name: "postgres", configuration: ["search_path=pg_catalog"],
      source_base64: Buffer.from(guardBody).toString("base64"),
    },
    ledger_acl: CANONICAL_RUNTIME_LEDGER_ACL.map((entry) => ({ ...entry })),
    schema_acl: CANONICAL_RUNTIME_LEDGER_SCHEMA_ACL.map((entry) => ({ ...entry })),
    guard_acl: CANONICAL_RUNTIME_LEDGER_GUARD_ACL.map((entry) => ({ ...entry })),
    ledger_rows: rows,
  };
}

test("310006 artifact is hash-pinned and limited to one ledger insert", () => {
  assert.equal(assertCanonicalRuntimeInstalledArtifact(root).sha256,
    CANONICAL_RUNTIME_INSTALLED_SHA256);
  assert.equal((migration.match(/insert into reflab_meta[.]production_adoption_state/gi) ?? []).length, 1);
  assert.match(migration, /lock table reflab_meta[.]production_adoption_state in exclusive mode/i);
  assert.doesNotMatch(migration, /^\s*(?:grant|revoke|notify|create\s+function|create\s+policy|create\s+index|drop\s+index)/gmi);
  assert.doesNotMatch(migration, /^\s*(?:insert\s+into|update|delete\s+from)\s+(?:public|storage)[.]/gmi);
});

test("guard source and migration mutation accounting are independently pinned", async () => {
  const { hashFunctionSource } = await import("../../production-preflight/queries.mjs");
  assert.equal(hashFunctionSource(guardBody), PRODUCTION_ADOPTION_GUARD_SOURCE_SHA256);
  assert.deepEqual(CANONICAL_RUNTIME_INSTALLED_MUTATIONS, {
    productInserts: 0, productUpdates: 0, productDeletes: 0, productBackfills: 0,
    ledgerInserts: 1, ledgerUpdates: 0, ledgerDeletes: 0,
    schemaStateWrites: 0, canonicalMarkerWrites: 0, functionsCreated: 0,
    policiesChanged: 0, indexesChanged: 0, constraintsChanged: 0,
    grantsChanged: 0, ownershipChanges: 0, notifications: 0,
  });
});

test("PRE and POST queries contain bounded metadata and aggregate evidence only", () => {
  for (const query of [canonicalRuntimeInstalledPreQuery, canonicalRuntimeInstalledPostQuery]) {
    assert.match(query.payloadSql, /transaction_read_only/);
    assert.match(query.payloadSql, /pg_catalog[.]pg_constraint/);
    assert.match(query.payloadSql, /production_adoption_state_guard/);
    assert.doesNotMatch(query.payloadSql, /select\s+[*]\s+from\s+(?:public|reflab_meta)[.]/i);
    assert.doesNotMatch(query.payloadSql, /^\s*(?:insert|update|delete|create|alter|drop|grant|revoke|notify)\b/gmi);
  }
});

test("exact three-row PRE passes and exact four-row POST is exact", () => {
  assert.equal(classifyCanonicalRuntimeInstalledState(payload()).classification, "PASS");
  assert.equal(classifyCanonicalRuntimeInstalledState(payload(true), { post: true }).classification, "EXACT");
});

test("exact post-310006 state cannot satisfy the non-idempotent PRE", () => {
  assert.equal(classifyCanonicalRuntimeInstalledState(payload(true)).classification, "BLOCKER");
});

for (const [name, mutate] of [
  ["historical count", (value) => { value.counts.attempts = 38; }],
  ["payload hash state", (value) => { value.counts.payload_hash_nulls = 36; }],
  ["Communication row", (value) => { value.counts.communication_attempts = 1; }],
  ["schema state", (value) => { value.checks.schemaStateEmpty = false; }],
  ["marker", (value) => { value.checks.canonicalMarkerAbsent = false; }],
  ["development object", (value) => { value.checks.developmentObjectsAbsent = false; }],
  ["cutover object", (value) => { value.checks.cutoverAbsent = false; }],
  ["ledger owner", (value) => { value.checks.ledgerRelationExact = false; }],
  ["ledger column", (value) => { value.columns[0].type = "integer"; }],
  ["ledger constraint", (value) => { value.constraints.pop(); }],
  ["ledger trigger", (value) => { value.checks.ledgerTriggerExact = false; }],
  ["guard source", (value) => { value.guard_function.source_base64 = Buffer.from("begin return new; end").toString("base64"); }],
  ["ledger ACL", (value) => { value.ledger_acl.push({ grantee: "anon", grantor: "postgres", privilege_type: "SELECT", is_grantable: false }); }],
  ["schema ACL", (value) => { value.schema_acl.push({ grantee: "PUBLIC", grantor: "postgres", privilege_type: "USAGE", is_grantable: false }); }],
  ["guard ACL", (value) => { value.guard_acl[0].is_grantable = true; }],
  ["phase-3 key", (value) => { value.ledger_rows[2].phase_key = "wrong"; }],
  ["phase-3 plan hash", (value) => { value.ledger_rows[2].plan_hash = "0".repeat(64); }],
  ["phase-3 evidence hash", (value) => { value.ledger_rows[2].evidence_hash = "0".repeat(64); }],
  ["phase 4 already exists", (value) => { value.ledger_rows.push({ ...value.ledger_rows[2], phase_order: 4, phase_key: "canonical_objects" }); value.counts.ledger_rows = 4; }],
  ["later phase", (value) => { value.checks.noLaterLedgerPhase = false; }],
]) test(`PRE ${name} drift fails closed`, () => {
  const value = payload();
  mutate(value);
  assert.equal(classifyCanonicalRuntimeInstalledState(value).classification, "BLOCKER");
});

for (const [name, mutate] of [
  ["missing phase 4", (value) => { value.ledger_rows.pop(); value.counts.ledger_rows = 3; }],
  ["wrong previous key", (value) => { value.ledger_rows[3].previous_phase_key = "foundation"; }],
  ["copied plan drift", (value) => { value.ledger_rows[3].plan_hash = "f".repeat(64); }],
  ["extra row", (value) => { value.ledger_rows.push({ ...value.ledger_rows[3], phase_order: 5 }); value.counts.ledger_rows = 5; }],
]) test(`POST ${name} drift fails closed`, () => {
  const value = payload(true);
  mutate(value);
  assert.equal(classifyCanonicalRuntimeInstalledState(value, { post: true }).classification, "BLOCKER");
});

test("composition requires every predecessor and stage state", () => {
  const exact = {
    installer: { managedProfile: "READY", lifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT" },
    historicalFingerprintExact: true,
    phase2a: { postState: "EXACT" }, helper: { classification: "EXACT" },
    admin: { classification: "EXACT" }, communication: { classification: "EXACT" },
    runtimeInstalled: { classification: "PASS" },
  };
  assert.equal(classifyCanonicalRuntimeInstalledComposition(exact).classification, "EXACT");
  for (const name of Object.keys(exact)) {
    const drift = structuredClone(exact);
    if (name === "installer") drift[name].managedProfile = "BLOCKER";
    else if (name === "historicalFingerprintExact") drift[name] = false;
    else if (name === "phase2a") drift[name].postState = "BLOCKER";
    else drift[name].classification = "BLOCKER";
    assert.equal(classifyCanonicalRuntimeInstalledComposition(drift).classification, "BLOCKER");
  }
});
