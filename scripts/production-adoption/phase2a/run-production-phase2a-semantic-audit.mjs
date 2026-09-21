import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { buildPsqlEnvironment, executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { PHASE1_PRODUCT_FINGERPRINT_QUERY_ID, phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { PHASE1_EXAM_TRAINING_POST_QUERY_ID, phase1ExamTrainingPostQuery } from "../bootstrap/phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID,
  classifyExamTrainingAfter310003,
  classifyPhase1PsychologyNotificationsPost,
  phase1PsychologyNotificationsMutationFingerprintQuery,
  phase1PsychologyNotificationsPostQuery,
} from "../bootstrap/phase1-psychology-notifications-ddl-contract.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  assertRepositoryAttestation,
  authorizeProductionDdlTarget,
} from "../bootstrap/run-production-role-bootstrap.mjs";
import { assertNoInheritedPgState, classifyInstallerIdentity, installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_FORMAT,
  PHASE2A_SEMANTIC_AUDIT_MUTATIONS,
  PHASE2A_SEMANTIC_AUDIT_OPERATION,
  PHASE2A_SEMANTIC_AUDIT_OPT_IN,
  PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID,
  PHASE2A_SEMANTIC_AUDIT_PRE_QUERY_ID,
  assertPhase2aSemanticAuditArtifact,
  classifyPhase2aSemanticAuditPost,
  classifyPhase2aSemanticAuditPre,
  phase2aSemanticAuditPostQuery,
  phase2aSemanticAuditPreQuery,
} from "./phase2a-semantic-audit-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const PHASE2A_FAILURE_STAGES = Object.freeze([
  "OPERATION_GUARD", "TARGET_GUARD", "HEAD_GUARD", "WORKTREE_GUARD", "ARTIFACT_HASH",
  "INSTALLER_PROFILE", "PRE_DDL_ATTESTATION", "SQL_BUILD", "PSQL_EXECUTION",
  "MIGRATION_SQL", "POST_DDL_ATTESTATION", "ROLLBACK_ATTESTATION", "RESULT_PARSE",
  "OUTPUT_SERIALIZATION", "ERROR_SANITIZATION", "OTHER",
]);

const failureStageSet = new Set(PHASE2A_FAILURE_STAGES);
const defaultReasons = Object.freeze({
  OPERATION_GUARD: "OPERATION_NOT_AUTHORIZED",
  TARGET_GUARD: "TARGET_GUARD_REJECTED",
  HEAD_GUARD: "HEAD_ATTESTATION_FAILED",
  WORKTREE_GUARD: "WORKTREE_NOT_CLEAN",
  ARTIFACT_HASH: "ARTIFACT_HASH_MISMATCH",
  INSTALLER_PROFILE: "INSTALLER_PROFILE_NOT_READY",
  PRE_DDL_ATTESTATION: "PRE_DDL_CONTRACT_MISMATCH",
  SQL_BUILD: "SQL_BUILD_FAILED",
  PSQL_EXECUTION: "PSQL_EXECUTION_FAILED",
  MIGRATION_SQL: "MIGRATION_SQL_FAILED",
  POST_DDL_ATTESTATION: "POST_DDL_CONTRACT_MISMATCH",
  ROLLBACK_ATTESTATION: "ROLLBACK_ATTESTATION_FAILED",
  RESULT_PARSE: "RESULT_PARSE_FAILED",
  OUTPUT_SERIALIZATION: "OUTPUT_SERIALIZATION_FAILED",
  ERROR_SANITIZATION: "ERROR_SANITIZATION_FAILED",
  OTHER: "UNCLASSIFIED_FAILURE",
});

class Phase2aRunnerFailure extends Error {
  constructor(stage, reason, { cause, rollback } = {}) {
    super(cause instanceof Error && cause.message ? cause.message : `${stage}: ${reason}`);
    this.name = "Phase2aRunnerFailure";
    this.stage = failureStageSet.has(stage) ? stage : "OTHER";
    this.reason = /^[A-Z0-9_]+$/.test(reason ?? "") ? reason : defaultReasons[this.stage];
    this.rollback = rollback === "PASS" || rollback === "BLOCKER" ? rollback : undefined;
  }
}

function safeSqlstate(error) {
  const explicit = String(error?.sqlstate ?? "").toUpperCase();
  if (/^[0-9A-Z]{5}$/.test(explicit)) return explicit;
  const match = String(error?.message ?? "").match(
    /(?:SQLSTATE[=_-]?|(?:ERROR|FATAL):\s+)([0-9A-Z]{5})/i,
  );
  return match?.[1]?.toUpperCase();
}

function asFailure(stage, error, reason = defaultReasons[stage] ?? defaultReasons.OTHER) {
  if (error instanceof Phase2aRunnerFailure) return error;
  if (failureStageSet.has(error?.stage)) {
    const sqlstate = safeSqlstate(error);
    return new Phase2aRunnerFailure(error.stage,
      error.reason ?? (sqlstate ? `SQLSTATE_${sqlstate}` : defaultReasons[error.stage]), {
      cause: error,
      rollback: error.rollback,
    });
  }
  const sqlstate = safeSqlstate(error);
  return new Phase2aRunnerFailure(stage, sqlstate ? `SQLSTATE_${sqlstate}` : reason, { cause: error });
}

function atStage(stage, action, reason) {
  try {
    return action();
  } catch (error) {
    throw asFailure(stage, error, reason);
  }
}

function readOnlyFailureStage(error, fallbackStage) {
  const message = String(error?.message ?? "");
  if (/invalid result frame|invalid envelope|payload_row_count|duplicate query result/i.test(message)) return "RESULT_PARSE";
  if (/read.only batch|forbidden sql|sql batch/i.test(message)) return "SQL_BUILD";
  if (/database output exceeded|unexpected database error|psql failed|spawn/i.test(message)) return "PSQL_EXECUTION";
  return fallbackStage;
}

function executeReadOnlyAtStage(executeReadOnly, sql, connectionEnvironment, environment, fallbackStage) {
  try {
    return executeReadOnly(sql, connectionEnvironment, { processEnvironment: environment });
  } catch (error) {
    throw asFailure(readOnlyFailureStage(error, fallbackStage), error);
  }
}

export function formatPhase2aFailureDiagnostic(error) {
  const failure = error instanceof Phase2aRunnerFailure ? error : asFailure("OTHER", error);
  const rollback = failure.rollback ? `\nrollback=${failure.rollback}` : "";
  return `PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=${failure.stage}\nreason=${failure.reason}${rollback}\n`;
}

function postgresDiagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: match?.[1] ?? "UNKNOWN", message: match?.[2]?.slice(0, 240) ?? "sanitized diagnostic unavailable" };
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--quiet"], {
    input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error) {
    throw new Phase2aRunnerFailure("PSQL_EXECUTION", "PSQL_SPAWN_FAILED", { cause: result.error });
  }
  if (result.status !== 0) {
    const diagnostic = postgresDiagnostic(result.stderr);
    const reason = diagnostic.sqlstate === "UNKNOWN" ? "MIGRATION_SQL_FAILED" : `SQLSTATE_${diagnostic.sqlstate}`;
    throw new Phase2aRunnerFailure("MIGRATION_SQL", reason);
  }
}

export function buildPhase2aSemanticAuditPreBatch() {
  return buildSqlBatch([installerIdentityQuery, phase1ProductFingerprintQuery, phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsMutationFingerprintQuery, phase1PsychologyNotificationsPostQuery,
    phase2aSemanticAuditPreQuery]);
}

export function buildPhase2aSemanticAuditPostBatch() {
  return buildSqlBatch([installerIdentityQuery, phase1ProductFingerprintQuery, phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsMutationFingerprintQuery, phase1PsychologyNotificationsPostQuery,
    phase2aSemanticAuditPostQuery]);
}

function classifyPrior310003(results, expectedInstallerLifecycle, phase2aInstalled = false) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const priorStateInstaller = installer.managedProfile === "READY"
      && installer.lifecycleState === expectedInstallerLifecycle
    ? { ...installer, lifecycleState: "POST_BOOTSTRAP" }
    : installer;
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const examTraining = classifyExamTrainingAfter310003(
    results.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID),
    { expectedTargetAclExact: !phase2aInstalled },
  );
  const mutationFingerprint = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID);
  const psychology = classifyPhase1PsychologyNotificationsPost(
    results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID), priorStateInstaller,
    fingerprint, fingerprint, mutationFingerprint, mutationFingerprint, examTraining,
    { expectedPhase310004Absent: !phase2aInstalled },
  );
  return { installer, fingerprint, examTraining, mutationFingerprint, psychology };
}

function classifyPreDdl(results) {
  const prior = atStage("RESULT_PARSE", () => classifyPrior310003(results, "POST_BOOTSTRAP"));
  const sidecar = atStage("RESULT_PARSE", () => classifyPhase2aSemanticAuditPre(results.get(PHASE2A_SEMANTIC_AUDIT_PRE_QUERY_ID)));
  if (prior.installer.managedProfile !== "READY" || prior.installer.lifecycleState !== "POST_BOOTSTRAP") {
    throw new Phase2aRunnerFailure("INSTALLER_PROFILE", "INSTALLER_PROFILE_NOT_READY");
  }
  if (prior.examTraining !== "EXACT" || prior.psychology.postState !== "EXACT" || sidecar !== "EXACT") {
    throw new Phase2aRunnerFailure("PRE_DDL_ATTESTATION", "PRE_DDL_CONTRACT_MISMATCH");
  }
  return { ...prior, sidecar };
}

function classifyPostDdl(results, before) {
  const prior = atStage("RESULT_PARSE", () => classifyPrior310003(results, "POST_PHASE2A_SEMANTIC_AUDIT", true));
  const sidecarPayload = results.get(PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID);
  const sidecar = atStage("RESULT_PARSE", () => classifyPhase2aSemanticAuditPost(sidecarPayload));
  const fingerprintsPreserved = JSON.stringify(prior.fingerprint) === JSON.stringify(before.fingerprint)
    && JSON.stringify(prior.mutationFingerprint) === JSON.stringify(before.mutationFingerprint);
  if (prior.installer.managedProfile !== "READY"
      || prior.installer.lifecycleState !== "POST_PHASE2A_SEMANTIC_AUDIT"
      || prior.examTraining !== "EXACT" || prior.psychology.postState !== "EXACT"
      || sidecar.postState !== "EXACT" || !fingerprintsPreserved) {
    throw new Phase2aRunnerFailure("POST_DDL_ATTESTATION", "POST_DDL_CONTRACT_MISMATCH");
  }
  return { ...prior, sidecar, fingerprintsPreserved };
}

export function runProductionPhase2aSemanticAudit(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== PHASE2A_SEMANTIC_AUDIT_OPERATION) {
    throw new Phase2aRunnerFailure("OPERATION_GUARD", "OPERATION_NOT_AUTHORIZED",
      { cause: new Error("Production 310004 requires its exact operation argument.") });
  }
  atStage("TARGET_GUARD", () => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const actualHead = atStage("HEAD_GUARD", () => git(["rev-parse", "HEAD"]).trim());
  atStage("HEAD_GUARD", () => assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status: "",
  }));
  const status = atStage("WORKTREE_GUARD", () => git(["status", "--short"]));
  atStage("WORKTREE_GUARD", () => assertRepositoryAttestation({ expectedHead: actualHead, actualHead, status }));
  const artifact = atStage("ARTIFACT_HASH", () => (dependencies.assertArtifact ?? assertPhase2aSemanticAuditArtifact)(root));
  const target = atStage("TARGET_GUARD", () => (dependencies.authorize ?? authorizeProductionDdlTarget)(
    environment, { operationOptIn: PHASE2A_SEMANTIC_AUDIT_OPT_IN },
  ));
  if (target.host !== PRODUCTION_SESSION_POOLER_HOST && !dependencies.allowLocalTarget) {
    throw new Phase2aRunnerFailure("TARGET_GUARD", "SESSION_POOLER_REQUIRED");
  }
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(sql, connectionEnvironment, environment, dependencies.spawn ?? spawnSync));
  const preBatch = atStage("SQL_BUILD", () => buildPhase2aSemanticAuditPreBatch());
  const preResults = executeReadOnlyAtStage(
    executeReadOnly, preBatch, target.connectionEnvironment, environment, "PRE_DDL_ATTESTATION",
  );
  const before = classifyPreDdl(preResults);
  try {
    atStage("MIGRATION_SQL", () => executeApprovedMigration(artifact.sql, target.connectionEnvironment));
  } catch (error) {
    try {
      const rollbackBatch = atStage("ROLLBACK_ATTESTATION", () => buildPhase2aSemanticAuditPreBatch());
      const rollbackResults = executeReadOnlyAtStage(
        executeReadOnly, rollbackBatch, target.connectionEnvironment, environment, "ROLLBACK_ATTESTATION",
      );
      atStage("ROLLBACK_ATTESTATION", () => classifyPreDdl(rollbackResults));
    } catch (rollbackError) {
      throw new Phase2aRunnerFailure("ROLLBACK_ATTESTATION", "ROLLBACK_ATTESTATION_FAILED",
        { cause: rollbackError, rollback: "BLOCKER" });
    }
    const failure = asFailure(error?.stage ?? "MIGRATION_SQL", error);
    failure.rollback = "PASS";
    throw failure;
  }
  const postBatch = atStage("SQL_BUILD", () => buildPhase2aSemanticAuditPostBatch());
  const postResults = executeReadOnlyAtStage(
    executeReadOnly, postBatch, target.connectionEnvironment, environment, "POST_DDL_ATTESTATION",
  );
  const post = classifyPostDdl(postResults, before);
  return {
    format: PHASE2A_SEMANTIC_AUDIT_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" }, installer: "postgres",
    head: actualHead, artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, prior310003: before.psychology.postState, sidecar: before.sidecar },
    migration: "PASS", mutationAccounting: PHASE2A_SEMANTIC_AUDIT_MUTATIONS,
    semanticSnapshotInvoked: false, postDdl: post.sidecar.postState,
    productFingerprintPreserved: post.fingerprintsPreserved,
    nextSemanticAuditReview: "SEMANTIC_AUDIT_EXECUTION_REVIEW", nextMigration: "NOT_AUTHORIZED",
  };
}

export async function runProductionPhase2aSemanticAuditCli(environment = process.env, dependencies = {}) {
  const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
  const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
  try {
    const result = await Promise.resolve().then(() => (dependencies.run ?? runProductionPhase2aSemanticAudit)(
      environment, { ...dependencies, argument: dependencies.argument },
    ));
    const serialized = atStage("OUTPUT_SERIALIZATION", () => `${JSON.stringify(result)}\n`);
    atStage("OUTPUT_SERIALIZATION", () => writeStdout(serialized));
    return 0;
  } catch (error) {
    let diagnostic;
    try {
      diagnostic = formatPhase2aFailureDiagnostic(error);
    } catch {
      diagnostic = "PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=ERROR_SANITIZATION\nreason=ERROR_SANITIZATION_FAILED\n";
    }
    try {
      writeStderr(diagnostic);
    } catch {
      try { writeStdout("PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=ERROR_SANITIZATION\nreason=DIAGNOSTIC_WRITE_FAILED\n"); } catch {}
    }
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  runProductionPhase2aSemanticAuditCli(process.env, { argument })
    .then((exitCode) => { process.exitCode = exitCode; })
    .catch(() => {
      process.stderr.write("PHASE2A_SEMANTIC_AUDIT_FAIL:\nstage=ERROR_SANITIZATION\nreason=UNHANDLED_CLI_FAILURE\n");
      process.exitCode = 1;
    });
}
