import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { semanticAuditExpectedFields } from "./semantic-audit-contract.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_ARTIFACT,
  PHASE2A_SEMANTIC_AUDIT_FIXED_QUERY_COUNT,
  PHASE2A_SEMANTIC_AUDIT_MUTATIONS,
  PHASE2A_SEMANTIC_AUDIT_OPERATION,
  PHASE2A_SEMANTIC_AUDIT_SHA256,
  PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT,
  assertPhase2aSemanticAuditArtifact,
  assertSemanticAuditTeardownArtifact,
  classifyPhase2aSemanticAuditPost,
  classifyPhase2aSemanticAuditPre,
  generateSemanticAuditTeardown,
} from "./phase2a-semantic-audit-ddl-contract.mjs";
import {
  buildPhase2aSemanticAuditPostBatch,
  buildPhase2aSemanticAuditPreBatch,
  runProductionPhase2aSemanticAudit,
} from "./run-production-phase2a-semantic-audit.mjs";
import {
  SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
  buildSemanticAuditSnapshotBatch,
  runProductionSemanticAuditSnapshot,
} from "./run-production-semantic-audit-snapshot.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerSource = readFileSync(resolve(import.meta.dirname, "run-production-phase2a-semantic-audit.mjs"), "utf8");
const snapshotSource = readFileSync(resolve(import.meta.dirname, "run-production-semantic-audit-snapshot.mjs"), "utf8");

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactSnapshot() {
  return Object.fromEntries(Object.entries(semanticAuditExpectedFields)
    .map(([group, fields]) => [group, Object.fromEntries(fields.map((field) => [field, 0]))]));
}

test("310004 is pinned byte-for-byte and contains no product DML", () => {
  const artifact = assertPhase2aSemanticAuditArtifact(root);
  assert.equal(artifact.path, PHASE2A_SEMANTIC_AUDIT_ARTIFACT);
  assert.equal(artifact.sha256, PHASE2A_SEMANTIC_AUDIT_SHA256);
  assert.equal(sha256(readFileSync(resolve(root, PHASE2A_SEMANTIC_AUDIT_ARTIFACT))), PHASE2A_SEMANTIC_AUDIT_SHA256);
  assert.deepEqual(PHASE2A_SEMANTIC_AUDIT_MUTATIONS, {
    auditRoleCreates: 1, auditSchemaCreates: 1, auditFunctionCreates: 1,
    auditPolicies: 58, auditColumnSelectGrants: 101,
    historicalProductInserts: 0, historicalProductUpdates: 0, historicalProductDeletes: 0,
    backfills: 0, ledgerWrites: 0, schemaStateWrites: 0,
  });
});

test("runner is bound to one operation and one immutable artifact", () => {
  assert.match(runnerSource, /PHASE2A_SEMANTIC_AUDIT_OPERATION/);
  assert.match(runnerSource, /assertPhase2aSemanticAuditArtifact/);
  assert.doesNotMatch(runnerSource, /process\.argv\[3\]|glob|db push|310005|310006|pending migration/i);
  assert.doesNotMatch(runnerSource, /semanticAuditSnapshotQuery|production_semantic_snapshot\s*\(/i);
  assert.match(runnerSource, /nextMigration: "NOT_AUTHORIZED"/);
  assert.match(runnerSource, /classifyPrior310003\(results, "POST_BOOTSTRAP"\)/);
  assert.match(runnerSource, /classifyPrior310003\(results, "POST_PHASE2A_SEMANTIC_AUDIT", true\)/);
  assert.match(runnerSource, /expectedPhase310004Absent: !phase2aInstalled/);
  assert.match(runnerSource, /expectedTargetAclExact: !phase2aInstalled/);
});

test("temporary schema CREATE is scoped to ownership transfer and revoked before commit", () => {
  const sql = readFileSync(resolve(root, PHASE2A_SEMANTIC_AUDIT_ARTIFACT), "utf8");
  const grant = sql.indexOf("grant create on schema reflab_audit to reflab_preflight_audit_owner;");
  const transfer = sql.indexOf("alter function reflab_audit.production_semantic_snapshot() owner to reflab_preflight_audit_owner;");
  const revoke = sql.indexOf("revoke create on schema reflab_audit from reflab_preflight_audit_owner;");
  assert.ok(grant > sql.indexOf("create function reflab_audit.production_semantic_snapshot()"));
  assert.ok(grant < transfer && transfer < revoke && revoke < sql.lastIndexOf("commit;"));
  assert.equal((sql.match(/grant create on schema reflab_audit/gi) ?? []).length, 1);
  assert.equal((sql.match(/revoke create on schema reflab_audit/gi) ?? []).length, 1);
});

test("pre and post inventories are fixed read-only transactions", () => {
  for (const batch of [buildPhase2aSemanticAuditPreBatch(), buildPhase2aSemanticAuditPostBatch()]) {
    assert.match(batch, /^begin read only;/i);
    assert.match(batch, /show transaction_read_only/i);
    assert.match(batch, /rollback;\s*$/i);
    assert.doesNotMatch(batch, /^\s*(insert|update|delete|truncate|create|alter|drop|grant|revoke|set role)\b/gmi);
  }
  assert.equal(PHASE2A_SEMANTIC_AUDIT_FIXED_QUERY_COUNT, 7);
});

test("pre classifier fails closed on incomplete and drifted state", () => {
  assert.equal(classifyPhase2aSemanticAuditPre({}), "UNKNOWN");
  const payload = { caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    default_transaction_read_only: "off", server_version_num: 170006,
    checks: { dependenciesExact: true, installerOwnsDependencies: true, postgresCanCreatePublic: true,
      sidecarAbsent: true, phase2bAbsent: true, laterAdoptionAbsent: true, developmentObjectsAbsent: true },
    counts: { dependency_tables: 58, dependency_columns: 101 } };
  assert.equal(classifyPhase2aSemanticAuditPre(payload), "EXACT");
  assert.equal(classifyPhase2aSemanticAuditPre({ ...payload, checks: { ...payload.checks, sidecarAbsent: false } }), "BLOCKER");
  assert.equal(classifyPhase2aSemanticAuditPre({ ...payload, server_version_num: 180003 }), "BLOCKER");
});

test("post classifier requires every structural and security check", () => {
  assert.equal(classifyPhase2aSemanticAuditPost({}).classification, "UNKNOWN");
  const checkNames = ["ownerRoleExact", "ownerMembershipsExact", "ownerOwnershipExact", "auditSchemaExact",
    "auditFunctionExact", "functionExecuteAclExact", "columnGrantsExact", "effectiveSelectColumnsExact",
    "tableGrantsAbsent", "auditPoliciesExact", "effectiveWritesAbsent", "productTablesIndependentlyOwned",
    "ledgerExact", "schemaStateEmpty", "canonicalMarkerAbsent", "phase2bAbsent", "laterAdoptionAbsent",
    "developmentObjectsAbsent"];
  const source = readFileSync(resolve(root, PHASE2A_SEMANTIC_AUDIT_ARTIFACT), "utf8")
    .match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i)[1];
  const payload = { caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170006, checks: Object.fromEntries(checkNames.map((name) => [name, true])),
    counts: { policies: 58, column_grants: 101, effective_select_columns: 101, ledger_rows: 3, schema_state_rows: 0 },
    function_source_base64: Buffer.from(source).toString("base64") };
  assert.equal(classifyPhase2aSemanticAuditPost(payload).postState, "EXACT");
  assert.equal(classifyPhase2aSemanticAuditPost({ ...payload, checks: { ...payload.checks, auditPoliciesExact: false } }).postState, "BLOCKER");
  assert.equal(classifyPhase2aSemanticAuditPost({ ...payload, checks: { ...payload.checks, ownerMembershipsExact: false } }).postState, "BLOCKER");
});

test("post-DDL and teardown pin the one PostgreSQL 17 creator-admin membership", () => {
  const postBatch = buildPhase2aSemanticAuditPostBatch();
  const teardown = generateSemanticAuditTeardown();
  for (const sql of [postBatch, teardown]) {
    assert.match(sql, /count\(\*\)=1/i);
    assert.match(sql, /granted_role\.rolname='reflab_preflight_audit_owner'/i);
    assert.match(sql, /member_role\.rolname='postgres'/i);
    assert.match(sql, /grantor_role\.rolname='supabase_admin'/i);
    assert.match(sql, /membership\.admin_option/i);
    assert.match(sql, /not membership\.inherit_option/i);
    assert.match(sql, /not membership\.set_option/i);
  }
  assert.doesNotMatch(postBatch, /ownerMembershipsAbsent/);
  assert.match(postBatch, /ownerMembershipsExact/);
});

test("runner rejects missing operation, inherited PG state, wrong HEAD and dirty worktree before SQL", () => {
  const environment = { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40) };
  assert.throws(() => runProductionPhase2aSemanticAudit(environment, {}), /exact operation/);
  assert.throws(() => runProductionPhase2aSemanticAudit({ ...environment, PGOPTIONS: "unsafe" }, { argument: PHASE2A_SEMANTIC_AUDIT_OPERATION }), /inherited PostgreSQL/i);
  assert.throws(() => runProductionPhase2aSemanticAudit(environment, { argument: PHASE2A_SEMANTIC_AUDIT_OPERATION,
    git: () => "b".repeat(40) }), /HEAD attestation/);
  let calls = 0;
  assert.throws(() => runProductionPhase2aSemanticAudit(environment, { argument: PHASE2A_SEMANTIC_AUDIT_OPERATION,
    git: () => (++calls === 1 ? "a".repeat(40) : " M unsafe") }), /clean worktree/);
});

test("artifact hash drift aborts before target authorization or SQL", () => {
  let authorized = false;
  assert.throws(() => runProductionPhase2aSemanticAudit({ REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "a".repeat(40) }, {
    argument: PHASE2A_SEMANTIC_AUDIT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? "a".repeat(40) : "",
    assertArtifact: () => { throw new Error("hash drift"); },
    authorize: () => { authorized = true; },
  }), /hash drift/);
  assert.equal(authorized, false);
});

test("snapshot boundary is separate, fixed, aggregate-only and read-only", () => {
  const batch = buildSemanticAuditSnapshotBatch();
  assert.match(batch, /^begin read only;/i);
  assert.match(batch, /reflab_audit\.production_semantic_snapshot\(\)/i);
  assert.match(batch, /rollback;\s*$/i);
  assert.doesNotMatch(batch, /\b(insert|update|delete|truncate|create|alter|drop|grant|revoke|set role)\b/i);
  assert.doesNotMatch(snapshotSource, /ALLOW_PRODUCTION_DDL|REFLAB_PRODUCTION_DDL_DB_URL/);
});

test("snapshot runner requires its operation, opt-in, clean HEAD and strict aggregate shape", () => {
  const base = { ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: "a".repeat(40) };
  assert.throws(() => runProductionSemanticAuditSnapshot(base, {}), /exact operation/);
  assert.throws(() => runProductionSemanticAuditSnapshot({ ...base, ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "false" }, { argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION }), /dedicated opt-in/);
  const dependencies = { argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? "a".repeat(40) : "",
    authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "local", connectionEnvironment: {} }),
    executeReadOnly: () => new Map([["semantic_audit_snapshot", exactSnapshot()]]) };
  assert.equal(runProductionSemanticAuditSnapshot(base, dependencies).readOnly, true);
  assert.throws(() => runProductionSemanticAuditSnapshot(base, { ...dependencies,
    executeReadOnly: () => new Map([["semantic_audit_snapshot", { unexpected: {} }]]) }), /unexpected aggregate contract/);
});

test("teardown is deterministic, exact-scope and has no CASCADE or product DML", () => {
  const artifact = assertSemanticAuditTeardownArtifact(root);
  assert.equal(artifact.path, PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT);
  assert.equal(artifact.sql, generateSemanticAuditTeardown());
  assert.doesNotMatch(artifact.sql, /\bcascade\b/i);
  assert.doesNotMatch(artifact.sql, /\b(insert|update|delete|truncate)\b/i);
  assert.equal((artifact.sql.match(/^drop policy /gmi) ?? []).length, 58);
  assert.equal((artifact.sql.match(/^revoke select \(/gmi) ?? []).length, 58);
  assert.match(artifact.sql, /audit-owner membership contract drifted/);
});
