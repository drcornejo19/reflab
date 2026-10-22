import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { hashFunctionSource } from "../../production-preflight/queries.mjs";
import {
  CANONICAL_TRAINING_ARTIFACT,
  CANONICAL_TRAINING_CHECK_EXPRESSION,
  CANONICAL_TRAINING_COLUMN_ACL,
  CANONICAL_TRAINING_FUNCTION,
  CANONICAL_TRAINING_FUNCTION_ACL,
  CANONICAL_TRAINING_INDEX_DEFINITION,
  CANONICAL_TRAINING_OPERATION,
  CANONICAL_TRAINING_POLICIES,
  CANONICAL_TRAINING_RLS,
  CANONICAL_TRAINING_SCHEMA_ACL,
  CANONICAL_TRAINING_SHA256,
  CANONICAL_TRAINING_SOURCE_SHA256,
  CANONICAL_TRAINING_TABLE_ACL,
  assertCanonicalTrainingArtifact,
  canonicalTrainingPostQuery,
  canonicalTrainingPreQuery,
  classifyCanonicalTrainingState,
} from "./phase2b-canonical-training-attempts-contract.mjs";
import {
  assertCanonicalTrainingSessionPoolerTarget,
  runProductionPhase2bCanonicalTrainingAttempts,
} from "./run-production-phase2b-canonical-training-attempts.mjs";
import { ADMIN_CANONICAL_ACCESS_SCHEMA_ACL } from "./phase2b-admin-canonical-access-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migration = readFileSync(resolve(root, CANONICAL_TRAINING_ARTIFACT), "utf8");
const runner = readFileSync(resolve(import.meta.dirname,
  "run-production-phase2b-canonical-training-attempts.mjs"), "utf8");
const body = migration.match(/create function public[.]submit_canonical_training_attempt[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";

function prerequisitePreservationPayload() {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170011,
    checks: {
      sessionExact: true, columnShapeExact: true, historicalCountsExact: true,
      historicalSemanticsExact: true, clipsExact: true, sidecarExact: true,
      providerStateExact: false, ledgerExact: true, markerAbsent: true,
      leaderboardExact: true, createdAtIndexesExact: true, phase2bEntryExact: false,
    },
    counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      score_non_null: 36, score_null: 1, training_duplicate_groups: 0 },
  };
}

function payload(post = false) {
  const checks = Object.fromEntries([
    "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
    "canonicalMarkerAbsent", "providerObjectsExact", "columnStateExact",
    "historicalPayloadHashNullsExact", "trainingDuplicatesAbsent", "laterProvidersAbsent",
    "rlsOwnerCreateAbsent",
  ].map((name) => [name, true]));
  return {
    checks,
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      payload_hash_nulls: post ? 37 : null, training_duplicate_groups: 0,
    },
    function: post ? {
      ...CANONICAL_TRAINING_FUNCTION,
      configuration: [...CANONICAL_TRAINING_FUNCTION.configuration],
      source_base64: Buffer.from(body, "utf8").toString("base64"),
    } : null,
    function_acl: post ? CANONICAL_TRAINING_FUNCTION_ACL.map((entry) => ({ ...entry })) : [],
    policies: post ? CANONICAL_TRAINING_POLICIES.map((entry) => ({
      ...entry, roles: [...entry.roles],
    })) : [],
    schema_acl: (post ? CANONICAL_TRAINING_SCHEMA_ACL : ADMIN_CANONICAL_ACCESS_SCHEMA_ACL)
      .map((entry) => ({ ...entry })),
    table_acl: post ? CANONICAL_TRAINING_TABLE_ACL.map((entry) => ({ ...entry })) : [],
    column_acl: CANONICAL_TRAINING_COLUMN_ACL.map((entry) => ({ ...entry })),
    rls: post ? CANONICAL_TRAINING_RLS.map((entry) => ({ ...entry })) : [],
    check_expression: post ? CANONICAL_TRAINING_CHECK_EXPRESSION : null,
    index_definition: post ? CANONICAL_TRAINING_INDEX_DEFINITION : null,
    prerequisite_preservation: post ? prerequisitePreservationPayload() : null,
  };
}

function target(overrides = {}) {
  return {
    projectRef: "nagjddldrldwavmfaytc",
    host: "aws-1-sa-east-1.pooler.supabase.com",
    connectionEnvironment: {
      PGHOST: "aws-1-sa-east-1.pooler.supabase.com", PGPORT: "5432", PGDATABASE: "postgres",
      PGUSER: "postgres.nagjddldrldwavmfaytc", PGSSLMODE: "require",
    },
    ...overrides,
  };
}

test("corrected artifact is hash-pinned and hardens ACL before ownership transfer", () => {
  const artifact = assertCanonicalTrainingArtifact(root);
  assert.equal(artifact.sha256, CANONICAL_TRAINING_SHA256);
  assert.ok(migration.indexOf("revoke all on function")
    < migration.indexOf("alter function public.submit_canonical_training_attempt"));
  assert.match(migration, /Canonical training RPC ACL is invalid/);
});

test("canonical training source hash is exact and body is unchanged", () => {
  assert.equal(hashFunctionSource(body), CANONICAL_TRAINING_SOURCE_SHA256);
});

test("migration scope is exactly one function, 15 policies, one index and one check", () => {
  assert.equal((migration.match(/^create function public[.]submit_canonical_training_attempt/gmi) ?? []).length, 1);
  assert.equal((migration.match(/^create policy training_attempt_/gmi) ?? []).length, 15);
  assert.equal((migration.match(/^create unique index attempts_canonical_training_submission_unique/gmi) ?? []).length, 1);
  assert.equal((migration.match(/add constraint attempts_canonical_payload_hash_check/gmi) ?? []).length, 1);
});

test("Training preserves historically enabled RLS for clips and institution subscriptions", () => {
  const foundation = readFileSync(resolve(root,
    "supabase/migrations/202607240001_access_control_foundation.sql"), "utf8");
  const coreRls = readFileSync(resolve(root,
    "supabase/migrations/202607240002_core_rls_lockdown.sql"), "utf8");
  const canonicalBaseline = readFileSync(resolve(root,
    "supabase/migrations/202607270000_reflab_canonical_baseline.sql"), "utf8");
  assert.doesNotMatch(migration,
    /alter\s+table\s+public[.](?:clips|institution_subscriptions)\s+(?:enable|disable|force|no\s+force)\s+row\s+level\s+security/i);
  assert.match(foundation,
    /alter table public[.]institution_subscriptions enable row level security;/i);
  assert.match(coreRls, /'clips'/);
  assert.match(coreRls, /alter table public[.]%I enable row level security/i);
  assert.match(canonicalBaseline, /alter table public[.]%I enable row level security/i);
  const expected = new Map([
    ["public.clips", { enabled: true, forced: false }],
    ["public.institution_subscriptions", { enabled: true, forced: false }],
  ]);
  for (const entry of CANONICAL_TRAINING_RLS) {
    const state = expected.get(`${entry.schema_name}.${entry.table_name}`);
    if (state) assert.deepEqual({ enabled: entry.enabled, forced: entry.forced }, state);
  }
  assert.equal(expected.size, 2);
});

test("pre and post queries are bounded catalog and aggregate evidence", () => {
  for (const query of [canonicalTrainingPreQuery, canonicalTrainingPostQuery]) {
    assert.match(query.payloadSql, /transaction_read_only/);
    assert.match(query.payloadSql, /pg_catalog[.]pg_proc/);
    assert.match(query.payloadSql, /pg_catalog[.]pg_policy/);
    assert.doesNotMatch(query.payloadSql, /select\s+[*]\s+from\s+(?:public|reflab_meta)[.]/i);
  }
});

test("exact PRE passes and exact POST is exact", () => {
  assert.equal(classifyCanonicalTrainingState(payload()).classification, "PASS");
  assert.equal(classifyCanonicalTrainingState(payload(true), { post: true }).classification, "EXACT");
});

for (const [name, mutate] of [
  ["historical attempt count", (value) => { value.counts.attempts = 38; }],
  ["payload hash pre-existence", (value) => { value.checks.providerObjectsExact = false; }],
  ["later provider", (value) => { value.checks.laterProvidersAbsent = false; }],
]) test(`PRE ${name} drift fails closed`, () => {
  const value = payload();
  mutate(value);
  assert.equal(classifyCanonicalTrainingState(value).classification, "BLOCKER");
});

for (const [name, mutate] of [
  ["RPC source", (value) => { value.function.source_base64 = Buffer.from("begin return null; end").toString("base64"); }],
  ["RPC owner", (value) => { value.function.owner_name = "postgres"; }],
  ["RPC security", (value) => { value.function.security_definer = false; }],
  ["RPC search_path", (value) => { value.function.configuration = ["search_path=public"]; }],
  ["PUBLIC EXECUTE", (value) => { value.function_acl.push({ grantee: "PUBLIC", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["anon EXECUTE", (value) => { value.function_acl.push({ grantee: "anon", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["authenticated EXECUTE", (value) => { value.function_acl.push({ grantee: "authenticated", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["missing service_role EXECUTE", (value) => { value.function_acl = value.function_acl.filter(({ grantee }) => grantee !== "service_role"); }],
  ["unexpected EXECUTE grant option", (value) => { value.function_acl[1].is_grantable = true; }],
  ["missing policy", (value) => { value.policies.pop(); }],
  ["policy expression", (value) => { value.policies[0].using_expression = "true"; }],
  ["extra policy", (value) => { value.policies.push({ ...value.policies[0], policy_name: "training_attempt_extra" }); }],
  ["schema ACL", (value) => { value.schema_acl[0].privilege_type = "CREATE"; }],
  ["missing table ACL", (value) => { value.table_acl.pop(); }],
  ["extra table privilege", (value) => { value.table_acl.push({ ...value.table_acl[0], privilege_type: "DELETE" }); }],
  ["rls owner CREATE", (value) => { value.checks.rlsOwnerCreateAbsent = false; }],
  ["unique index", (value) => { value.index_definition += " INCLUDE (id)"; }],
  ["check expression", (value) => { value.check_expression = "canonical_payload_hash is not null"; }],
  ["clips RLS", (value) => { value.rls.find(({ table_name }) => table_name === "clips").enabled = false; }],
  ["institution subscriptions RLS", (value) => {
    value.rls.find(({ table_name }) => table_name === "institution_subscriptions").enabled = false;
  }],
  ["prerequisite historical semantics", (value) => {
    value.prerequisite_preservation.checks.historicalSemanticsExact = false;
  }],
  ["prerequisite ledger", (value) => { value.prerequisite_preservation.checks.ledgerExact = false; }],
  ["prerequisite schema state", (value) => { value.prerequisite_preservation.counts.score_null = 2; }],
  ["prerequisite marker", (value) => { value.prerequisite_preservation.checks.markerAbsent = false; }],
  ["training ledger", (value) => { value.checks.ledgerExact = false; }],
  ["training schema state", (value) => { value.checks.schemaStateEmpty = false; }],
  ["training canonical marker", (value) => { value.checks.canonicalMarkerAbsent = false; }],
  ["training later provider", (value) => { value.checks.laterProvidersAbsent = false; }],
  ["unexpected column ACL", (value) => { value.column_acl.push({ ...value.column_acl[0], column_name: "unexpected" }); }],
]) test(`POST ${name} drift fails closed`, () => {
  const value = payload(true);
  mutate(value);
  assert.equal(classifyCanonicalTrainingState(value, { post: true }).classification, "BLOCKER");
});

test("only the exact Production Session Pooler target is accepted", () => {
  assert.equal(assertCanonicalTrainingSessionPoolerTarget(target()).host,
    "aws-1-sa-east-1.pooler.supabase.com");
});

for (const [name, mutation] of [
  ["direct host", (value) => { value.host = "db.nagjddldrldwavmfaytc.supabase.co"; value.connectionEnvironment.PGHOST = value.host; }],
  ["arbitrary host", (value) => { value.host = "example.invalid"; value.connectionEnvironment.PGHOST = value.host; }],
  ["port", (value) => { value.connectionEnvironment.PGPORT = "6543"; }],
  ["database", (value) => { value.connectionEnvironment.PGDATABASE = "other"; }],
  ["username", (value) => { value.connectionEnvironment.PGUSER = "postgres"; }],
  ["ssl", (value) => { value.connectionEnvironment.PGSSLMODE = "disable"; }],
]) test(`${name} target drift is rejected`, () => {
  const value = target();
  mutation(value);
  assert.throws(() => assertCanonicalTrainingSessionPoolerTarget(value), /TARGET_REJECTED/);
});

for (const predecessorDrift of [
  "Phase2A sidecar",
  "310005 source",
  "310005 ACL",
  "admin RPC source",
  "admin RPC ACL",
  "prerequisite POST state",
]) test(`runner blocks before migration on ${predecessorDrift} drift`, () => {
  let migrations = 0;
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40),
  }, {
    argument: CANONICAL_TRAINING_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${"a".repeat(40)}\n` : "",
    assertArtifact: () => ({ path: CANONICAL_TRAINING_ARTIFACT, sha256: CANONICAL_TRAINING_SHA256, sql: migration }),
    authorize: () => target(),
    executeReadOnly: () => new Map(),
    classifyPre: () => { throw new Error(`${predecessorDrift} drift`); },
    executeMigration: () => { migrations += 1; },
  }), /PRE_DDL_ATTESTATION/);
  assert.equal(migrations, 0);
});

test("wrong operation and inherited PostgreSQL state block before repository or SQL", () => {
  let repositoryReads = 0;
  let sqlCalls = 0;
  const dependencies = {
    git: () => { repositoryReads += 1; return ""; },
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  };
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({}, {
    ...dependencies, argument: "--wrong-operation",
  }), /TARGET_GUARD/);
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({ PGHOST: "inherited" }, {
    ...dependencies, argument: CANONICAL_TRAINING_OPERATION,
  }), /TARGET_GUARD/);
  assert.equal(repositoryReads, 0);
  assert.equal(sqlCalls, 0);
});

for (const [name, git] of [
  ["approved HEAD", (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : ""],
  ["clean worktree", (args) => args[0] === "rev-parse" ? `${"a".repeat(40)}\n` : " M package.json\n"],
]) test(`${name} drift blocks before artifact or SQL`, () => {
  let artifacts = 0;
  let sqlCalls = 0;
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40),
  }, {
    argument: CANONICAL_TRAINING_OPERATION,
    git,
    assertArtifact: () => { artifacts += 1; return {}; },
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  }), /HEAD_GUARD|WORKTREE_GUARD/);
  assert.equal(artifacts, 0);
  assert.equal(sqlCalls, 0);
});

test("artifact hash drift and missing Production opt-ins block before SQL", () => {
  const git = (args) => args[0] === "rev-parse" ? `${"a".repeat(40)}\n` : "";
  let sqlCalls = 0;
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40),
  }, {
    argument: CANONICAL_TRAINING_OPERATION,
    git,
    assertArtifact: () => { throw new Error("hash mismatch"); },
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  }), /ARTIFACT_HASH/);
  assert.throws(() => runProductionPhase2bCanonicalTrainingAttempts({
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40),
  }, {
    argument: CANONICAL_TRAINING_OPERATION,
    git,
    assertArtifact: () => ({ path: CANONICAL_TRAINING_ARTIFACT, sha256: CANONICAL_TRAINING_SHA256, sql: migration }),
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  }), /TARGET_GUARD/);
  assert.equal(sqlCalls, 0);
});

test("exact runner path executes one artifact and stops before 202608150001", () => {
  let migrations = 0;
  const exact = {
    installer: { managedProfile: "READY" }, sidecar: { postState: "EXACT" },
  };
  const result = runProductionPhase2bCanonicalTrainingAttempts({
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "b".repeat(40),
  }, {
    argument: CANONICAL_TRAINING_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "",
    assertArtifact: () => ({ path: CANONICAL_TRAINING_ARTIFACT, sha256: CANONICAL_TRAINING_SHA256, sql: migration }),
    authorize: () => target(),
    executeReadOnly: () => new Map(),
    classifyPre: () => exact,
    classifyPost: () => exact,
    executeMigration: () => { migrations += 1; },
  });
  assert.equal(migrations, 1);
  assert.equal(result.postDdl.contract, "EXACT");
  assert.equal(result.nextProvider, "NOT_AUTHORIZED");
});

test("runner is pinned, warning-aware, non-discovering and has no continuation", () => {
  for (const token of [
    "CANONICAL_TRAINING_OPT_IN", "authorizeProductionDdlTarget", "assertNoInheritedPgState",
    "assertRepositoryAttestation", "assertCanonicalTrainingArtifact", "executeReadOnlyBatch",
    "ON_ERROR_STOP=1", "PRIVILEGE_WARNING", "nextProvider: \"NOT_AUTHORIZED\"",
  ]) assert.match(runner, new RegExp(token.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(runner, /202608150001_canonical_communication_feedback[.]sql/);
  assert.doesNotMatch(runner, /db\s+push|migration\s+list|readdirSync|glob/i);
});
