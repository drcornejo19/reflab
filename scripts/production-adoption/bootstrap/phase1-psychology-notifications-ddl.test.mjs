import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SHA256,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_FIXED_QUERY_COUNT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATIONS,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS,
  assertPhase1PsychologyNotificationsDdlArtifact,
  classifyExamTrainingAfter310003,
  classifyPhase1PsychologyNotificationsPost,
} from "./phase1-psychology-notifications-ddl-contract.mjs";
import { PRODUCTION_DDL_APPROVED_HEAD } from "./run-production-role-bootstrap.mjs";
import {
  buildPhase1PsychologyNotificationsPostBatch,
  buildPhase1PsychologyNotificationsPreBatch,
  buildPhase1PsychologyNotificationsPreDataBatch,
  runProductionPhase1PsychologyNotificationsPrerequisites,
} from "./run-production-phase1-psychology-notifications-prerequisites.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

const examChecks = {
  foundationStatePreserved: true, targetTableExact: true, targetTableColumnsExact: true,
  targetPrimaryKeyExact: true, targetTableEmpty: true, targetAclExact: true,
  targetColumnsExact: true, targetColumnsNullable: true, targetIndexesExact: true,
  targetConstraintsExact: true, targetCheckSemanticsExact: true,
  targetFkSemanticsExact: true, targetUniqueSemanticsExact: true,
  ledgerExact: false, schemaStateEmpty: true, canonicalMarkerAbsent: true,
  identityLinksAbsent: true, developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: false, fabricatedAssociationsAbsent: true,
};

function exactPostPayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170006,
    checks: Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS.map((field) => [field, true])),
    counts: { catalog_rows: 8, notification_events: 60, notification_backfills: 0,
      checkins: 3, wellbeing: 0, exercise_sessions: 0, ledger_rows: 3 },
    ...overrides,
  };
}

function examPayload(overrides = {}) {
  return {
    checks: examChecks,
    counts: { target_columns: 6, target_indexes: 3, target_constraints: 20,
      check_constraints: 13, foreign_keys: 5, unique_constraints: 2,
      target_rows: 0, schema_state_rows: 0, ledger_rows: 3 },
    ...overrides,
  };
}

test("310003 artifact, catalog scope, and mutation accounting are pinned", () => {
  const artifact = assertPhase1PsychologyNotificationsDdlArtifact(root);
  assert.equal(artifact.sha256, PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SHA256);
  assert.deepEqual(PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATIONS, {
    catalogInserts: 8, ledgerInserts: 1, historicalProductUpdates: 0,
    historicalProductDeletes: 0, notificationBackfills: 0, psychologyHistoricalUpdates: 0,
  });
});

test("fixed pre/post inventories are read-only and exact", () => {
  const batches = [
    buildPhase1PsychologyNotificationsPreBatch(),
    buildPhase1PsychologyNotificationsPreDataBatch(),
    buildPhase1PsychologyNotificationsPostBatch(),
  ];
  for (const batch of batches) {
    assert.doesNotThrow(() => assertReadOnlyBatch(batch));
    assert.doesNotMatch(batch, /\bset\s+role\b|\bcreate\s+temp\b/i);
  }
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_FIXED_QUERY_COUNT, 8);
  assert.doesNotMatch(batches.join("\n"), /pg_catalog\.coalesce\s*\(/i);
  assert.doesNotMatch(batches.join("\n"), /index_record\.indexpred/i);
  assert.match(batches.join("\n"), /index_record\.indpred/i);
  assert.match(batches.join("\n"), /to_jsonb\(event_record\)\s*-\s*'deduplication_key'/i);
});

test("post classifier accepts only the exact independent contract", () => {
  const mutation = { notification_count: 60, notification_rows_hash: "same" };
  const installer = { managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" };
  const exact = classifyPhase1PsychologyNotificationsPost(
    exactPostPayload(), installer, PHASE1_HISTORICAL_FINGERPRINT,
    PHASE1_HISTORICAL_FINGERPRINT, mutation, mutation, "EXACT",
  );
  assert.equal(exact.postState, "EXACT");
  const drift = exactPostPayload({ checks: {
    ...exactPostPayload().checks, psychologyModulesAclExact: false,
  } });
  assert.equal(classifyPhase1PsychologyNotificationsPost(
    drift, installer, PHASE1_HISTORICAL_FINGERPRINT,
    PHASE1_HISTORICAL_FINGERPRINT, mutation, mutation, "EXACT",
  ).postState, "BLOCKER");
  assert.equal(classifyPhase1PsychologyNotificationsPost(
    undefined, installer, PHASE1_HISTORICAL_FINGERPRINT,
    PHASE1_HISTORICAL_FINGERPRINT, mutation, mutation, "EXACT",
  ).postState, "UNKNOWN");
});

test("310002 preservation permits only the reviewed later-phase differences", () => {
  assert.equal(classifyExamTrainingAfter310003(examPayload()), "EXACT");
  assert.equal(classifyExamTrainingAfter310003(examPayload({ checks: {
    ...examChecks, targetFkSemanticsExact: false,
  } })), "BLOCKER");
  assert.equal(classifyExamTrainingAfter310003(undefined), "UNKNOWN");
});

function runnerDependencies(overrides = {}) {
  return {
    argument: PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifact: () => assertPhase1PsychologyNotificationsDdlArtifact(root),
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: PRODUCTION_SESSION_POOLER_HOST, connectionEnvironment: {} }),
    executeReadOnly: () => { throw new Error("stop-before-sql"); },
    executeMigration: () => { throw new Error("migration-must-not-run"); },
    ...overrides,
  };
}

for (const [name, environment, dependencies] of [
  ["wrong operation", { [PRODUCTION_DDL_APPROVED_HEAD]: head }, { argument: "--wrong" }],
  ["dirty worktree", { [PRODUCTION_DDL_APPROVED_HEAD]: head }, { git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M drift.sql" }],
  ["wrong HEAD", { [PRODUCTION_DDL_APPROVED_HEAD]: "b".repeat(40) }, {}],
  ["artifact hash drift", { [PRODUCTION_DDL_APPROVED_HEAD]: head }, { assertArtifact: () => { throw new Error("hash mismatch"); } }],
  ["wrong target", { [PRODUCTION_DDL_APPROVED_HEAD]: head }, { authorize: () => { throw new Error("target mismatch"); } }],
  ["wrong host", { [PRODUCTION_DDL_APPROVED_HEAD]: head }, { authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "db.nagjddldrldwavmfaytc.supabase.co", connectionEnvironment: {} }) }],
]) {
  test(`${name} blocks before DDL`, () => {
    let migrationCalls = 0;
    assert.throws(() => runProductionPhase1PsychologyNotificationsPrerequisites(
      environment,
      runnerDependencies({ ...dependencies, executeMigration: () => { migrationCalls += 1; } }),
    ));
    assert.equal(migrationCalls, 0);
  });
}

test("runner source has no arbitrary path, migration discovery, push, retry, or 310004 execution", () => {
  const source = readFileSync(resolve(root,
    "scripts/production-adoption/bootstrap/run-production-phase1-psychology-notifications-prerequisites.mjs"), "utf8");
  assert.doesNotMatch(source, /process\.argv\[[^\]]+\].*(?:\.sql|path)|readdir|glob|supabase\s+db\s+push|migration\s+(?:up|apply)|retry/i);
  assert.doesNotMatch(source, /executeMigration\([^)]*310004|readFileSync\([^)]*310004/i);
  assert.match(source, /next310004Review:\s*"310004_EXECUTION_REVIEW"/);
  assert.match(source, /nextMigration:\s*"NOT_AUTHORIZED"/);
});

test("migration execution uses one pinned SQL payload", () => {
  const source = readFileSync(resolve(root,
    "scripts/production-adoption/bootstrap/run-production-phase1-psychology-notifications-prerequisites.mjs"), "utf8");
  assert.equal((source.match(/executeApprovedMigration\(artifact\.sql/g) ?? []).length, 1);
  assert.match(source, /"-X",\s*"--no-psqlrc"/);
  assert.match(source, /"ON_ERROR_STOP=1"/);
});
