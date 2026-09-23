import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  PHASE2A_FAILURE_STAGES,
  buildPhase2aSemanticAuditPostBatch,
  buildPhase2aSemanticAuditPreBatch,
  formatPhase2aFailureDiagnostic,
  runProductionPhase2aSemanticAudit,
  runProductionPhase2aSemanticAuditCli,
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
    auditPolicies: 58, auditColumnSelectGrants: 100,
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
    counts: { dependency_tables: 58, dependency_columns: 100 } };
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
    counts: { policies: 58, column_grants: 100, effective_select_columns: 100, ledger_rows: 3, schema_state_rows: 0 },
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

test("every required failure stage emits a finite non-secret diagnostic", async () => {
  const stages = ["TARGET_GUARD", "HEAD_GUARD", "WORKTREE_GUARD", "ARTIFACT_HASH",
    "INSTALLER_PROFILE", "PRE_DDL_ATTESTATION", "SQL_BUILD", "PSQL_EXECUTION",
    "MIGRATION_SQL", "POST_DDL_ATTESTATION", "ROLLBACK_ATTESTATION", "RESULT_PARSE",
    "OUTPUT_SERIALIZATION", "ERROR_SANITIZATION", "OTHER"];
  for (const stage of stages) {
    let stderr = "";
    const failure = Object.assign(new Error("postgresql://unsafe:secret@example.invalid/postgres"), {
      stage,
      reason: stage === "MIGRATION_SQL" ? "SQLSTATE_42501" : `${stage}_TEST_FAILURE`,
      rollback: stage === "MIGRATION_SQL" ? "PASS" : undefined,
    });
    const exitCode = await runProductionPhase2aSemanticAuditCli({}, {
      run: () => { throw failure; },
      writeStdout: () => { throw new Error("unexpected stdout"); },
      writeStderr: (value) => { stderr += value; },
    });
    assert.equal(exitCode, 1);
    assert.match(stderr, /^PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=[A-Z0-9_]+\nreason=[A-Z0-9_]+/);
    assert.match(stderr, new RegExp(`stage=${stage}`));
    assert.doesNotMatch(stderr, /unsafe|secret|example\.invalid|postgresql:\/\//i);
  }
  assert.deepEqual(new Set(PHASE2A_FAILURE_STAGES), new Set(["OPERATION_GUARD", ...stages]));
});

test("empty errors, serialization failures, and diagnostic-write failures remain observable", async () => {
  let emptyDiagnostic = "";
  assert.equal(await runProductionPhase2aSemanticAuditCli({}, {
    run: () => { throw undefined; },
    writeStderr: (value) => { emptyDiagnostic += value; },
  }), 1);
  assert.equal(emptyDiagnostic,
    "PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=OTHER\nreason=UNCLASSIFIED_FAILURE\n");

  const circular = {};
  circular.self = circular;
  let serializationDiagnostic = "";
  assert.equal(await runProductionPhase2aSemanticAuditCli({}, {
    run: () => circular,
    writeStderr: (value) => { serializationDiagnostic += value; },
  }), 1);
  assert.match(serializationDiagnostic, /stage=OUTPUT_SERIALIZATION\nreason=OUTPUT_SERIALIZATION_FAILED/);

  let fallback = "";
  assert.equal(await runProductionPhase2aSemanticAuditCli({}, {
    run: () => { throw new Error("empty diagnostic path"); },
    writeStderr: () => { throw new Error("stderr unavailable"); },
    writeStdout: (value) => { fallback += value; },
  }), 1);
  assert.equal(fallback,
    "PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=ERROR_SANITIZATION\nreason=DIAGNOSTIC_WRITE_FAILED\n");
});

test("safe diagnostic formatting retains only an approved SQLSTATE", () => {
  const error = Object.assign(new Error("password=secret raw statement"), {
    stage: "MIGRATION_SQL", reason: "SQLSTATE_42501", rollback: "PASS",
  });
  assert.equal(formatPhase2aFailureDiagnostic(error),
    "PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=MIGRATION_SQL\nreason=SQLSTATE_42501\nrollback=PASS\n");
  assert.equal(formatPhase2aFailureDiagnostic(Object.assign(
    new Error("ERROR: 42501: password=secret raw statement"), { stage: "PSQL_EXECUTION" },
  )), "PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=PSQL_EXECUTION\nreason=SQLSTATE_42501\n");
});

test("the real CLI cannot exit one without a safe diagnostic", () => {
  const result = spawnSync(process.execPath,
    [resolve(import.meta.dirname, "run-production-phase2a-semantic-audit.mjs")],
    { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr,
    /^PHASE2A_SEMANTIC_AUDIT_FAIL:\r?\nstage=OPERATION_GUARD\r?\nreason=OPERATION_NOT_AUTHORIZED\r?\n$/);
  assert.equal(result.stdout, "");
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
  assert.doesNotMatch(snapshotSource, /REFLAB_PRODUCTION_DDL_DB_URL/);
  assert.match(snapshotSource, /rejects Production DDL configuration/);
});

test("snapshot runner requires its operation, opt-in, clean HEAD and strict aggregate shape", () => {
  const base = { ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION_EXACT: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: "a".repeat(40) };
  assert.throws(() => runProductionSemanticAuditSnapshot(base, {}), /TARGET_GUARD:OPERATION_NOT_AUTHORIZED/);
  assert.throws(() => runProductionSemanticAuditSnapshot({ ...base, ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "false" }, { argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION }), /TARGET_GUARD:OPERATION_NOT_AUTHORIZED/);
  const dependencies = { argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? "a".repeat(40) : "",
    allowLocalTarget: true,
    authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "local", connectionEnvironment: {} }),
    executeReadOnly: (sql) => /production_semantic_snapshot\(\)/i.test(sql)
      ? new Map([
        ["phase2a_snapshot_session", { current_user: "reflab_prod_preflight_ro",
          session_user: "reflab_prod_preflight_ro", database: "postgres",
          transaction_read_only: "on", default_transaction_read_only: "on",
          server_version_num: 170011 }],
        ["semantic_audit_snapshot", exactSnapshot()],
      ])
      : new Map([["phase2a_snapshot_session", { current_user: "reflab_prod_preflight_ro",
        session_user: "reflab_prod_preflight_ro", database: "postgres",
        transaction_read_only: "on", default_transaction_read_only: "on",
        server_version_num: 170011 }]]) };
  assert.equal(runProductionSemanticAuditSnapshot(base, dependencies).readOnly, true);
  assert.throws(() => runProductionSemanticAuditSnapshot(base, { ...dependencies,
    executeReadOnly: (sql) => /production_semantic_snapshot\(\)/i.test(sql)
      ? new Map([
        ["phase2a_snapshot_session", { current_user: "reflab_prod_preflight_ro",
          session_user: "reflab_prod_preflight_ro", database: "postgres",
          transaction_read_only: "on", default_transaction_read_only: "on",
          server_version_num: 170011 }],
        ["semantic_audit_snapshot", { unexpected: {} }],
      ])
      : new Map([["phase2a_snapshot_session", { current_user: "reflab_prod_preflight_ro",
        session_user: "reflab_prod_preflight_ro", database: "postgres",
        transaction_read_only: "on", default_transaction_read_only: "on",
        server_version_num: 170011 }]]) }), /OUTPUT_CONTRACT:SNAPSHOT_CONTRACT_MISMATCH/);
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
