import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { buildPsqlEnvironment, executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { PHASE1_PRODUCT_FINGERPRINT_QUERY_ID, phase1ProductFingerprintQuery } from "./phase1-foundation-ddl-contract.mjs";
import { PHASE1_EXAM_TRAINING_POST_QUERY_ID, phase1ExamTrainingPostQuery } from "./phase1-exam-training-ddl-contract.mjs";
import { phase1PsychologyNotificationsCatalogQuery, phase1PsychologyNotificationsDataAuditQuery } from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import { classifyPhase1PsychologyNotificationsPrivilegedEntry } from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID,
  classifyPsychologyModuleSlugReconciliationPost,
  psychologyModuleSlugReconciliationPostQuery,
} from "./psychology-module-slug-reconciliation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_FORMAT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID,
  assertPhase1PsychologyNotificationsDdlArtifact,
  classifyExamTrainingAfter310003,
  classifyPhase1PsychologyNotificationsPost,
  phase1PsychologyNotificationsMutationFingerprintQuery,
  phase1PsychologyNotificationsPostQuery,
} from "./phase1-psychology-notifications-ddl-contract.mjs";
import { PRODUCTION_DDL_APPROVED_HEAD, assertRepositoryAttestation, authorizeProductionDdlTarget } from "./run-production-role-bootstrap.mjs";
import { assertNoInheritedPgState, classifyInstallerIdentity, installerIdentityQuery } from "./run-production-installer-identity-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function postgresDiagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: match?.[1] ?? "UNKNOWN", message: match?.[2]?.slice(0, 240) ?? "sanitized diagnostic unavailable" };
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--quiet"], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    const diagnostic = postgresDiagnostic(result.stderr);
    throw Object.assign(new Error(`Production 310003 failed; SQLSTATE=${diagnostic.sqlstate}; message=${diagnostic.message}.`), { sqlstate: diagnostic.sqlstate });
  }
}

export function buildPhase1PsychologyNotificationsPreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    psychologyModuleSlugReconciliationPostQuery,
    phase1PsychologyNotificationsCatalogQuery,
    phase1PsychologyNotificationsMutationFingerprintQuery,
  ]);
}

export function buildPhase1PsychologyNotificationsPreDataBatch() {
  return buildSqlBatch([phase1PsychologyNotificationsDataAuditQuery]);
}

export function buildPhase1PsychologyNotificationsPostBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsMutationFingerprintQuery,
    phase1PsychologyNotificationsPostQuery,
  ]);
}

function classifyPreDdl(results, dataResults) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const entry = classifyPhase1PsychologyNotificationsPrivilegedEntry(results, dataResults);
  const reconciliation = classifyPsychologyModuleSlugReconciliationPost(
    results.get(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID), installer, "EXACT", fingerprint, entry,
  );
  const mutationFingerprint = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID);
  const exact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP"
    && entry.classification === "PASS"
    && entry.nextAllowedRemoteOperation === "310003_EXECUTION_REVIEW"
    && reconciliation.classification === "EXACT"
    && mutationFingerprint?.caller === "postgres"
    && mutationFingerprint?.session_user === "postgres"
    && mutationFingerprint?.transaction_read_only === "on"
    && mutationFingerprint?.default_transaction_read_only === "off"
    && mutationFingerprint?.notification_count === 60
    && typeof mutationFingerprint?.notification_rows_hash === "string";
  if (!exact) throw new Error("Production 310003 pre-DDL attestation failed.");
  return { installer, fingerprint, entry, reconciliation, mutationFingerprint };
}

function classifyPostDdl(results, before) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const examTraining = classifyExamTrainingAfter310003(results.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID));
  const mutationFingerprint = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID);
  const postPayload = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID);
  const post = classifyPhase1PsychologyNotificationsPost(
    postPayload, installer,
    before.fingerprint, fingerprint, before.mutationFingerprint, mutationFingerprint, examTraining,
  );
  if (post.postState !== "EXACT") {
    const failedChecks = Object.entries(postPayload?.checks ?? {})
      .filter(([, value]) => value !== true).map(([field]) => field).join(",") || "incomplete-output";
    const diagnostics = JSON.stringify(postPayload?.structural_diagnostics ?? {});
    throw new Error(`Production 310003 post-DDL attestation failed; checks=${failedChecks}; structural=${diagnostics}.`);
  }
  return { installer, fingerprint, examTraining, mutationFingerprint, post };
}

export function runProductionPhase1PsychologyNotificationsPrerequisites(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION) {
    throw new Error("Production 310003 requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({ expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status });
  const artifact = (dependencies.assertArtifact ?? assertPhase1PsychologyNotificationsDdlArtifact)(root);
  const target = (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, { operationOptIn: PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPT_IN });
  if (target.host !== PRODUCTION_SESSION_POOLER_HOST && !dependencies.allowLocalTarget) {
    throw new Error("Production 310003 requires the exact approved Session Pooler host.");
  }
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(sql, connectionEnvironment, environment, dependencies.spawn ?? spawnSync));

  const beforeResults = executeReadOnly(buildPhase1PsychologyNotificationsPreBatch(), target.connectionEnvironment, { processEnvironment: environment });
  const beforeDataResults = executeReadOnly(buildPhase1PsychologyNotificationsPreDataBatch(), target.connectionEnvironment, { processEnvironment: environment });
  const before = classifyPreDdl(beforeResults, beforeDataResults);
  try {
    executeApprovedMigration(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "UNKNOWN";
    try {
      const rollbackResults = executeReadOnly(buildPhase1PsychologyNotificationsPreBatch(), target.connectionEnvironment, { processEnvironment: environment });
      const rollbackDataResults = executeReadOnly(buildPhase1PsychologyNotificationsPreDataBatch(), target.connectionEnvironment, { processEnvironment: environment });
      classifyPreDdl(rollbackResults, rollbackDataResults);
      rollback = "PASS";
    } catch {
      rollback = "BLOCKER";
    }
    throw new Error(`${sanitizeProcessOutput(error.message)} rollback=${rollback}.`);
  }
  const postResults = executeReadOnly(buildPhase1PsychologyNotificationsPostBatch(), target.connectionEnvironment, { processEnvironment: environment });
  const post = classifyPostDdl(postResults, before);
  return {
    format: PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head: actualHead,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, reconciliation: before.reconciliation.classification, entry: before.entry.classification },
    migration: "PASS",
    mutationAccounting: { catalogInserts: 8, ledgerInserts: 1, historicalProductUpdates: 0, historicalProductDeletes: 0, notificationBackfills: 0, psychologyHistoricalUpdates: 0 },
    postDdl: post.post.postState,
    next310004Review: "310004_EXECUTION_REVIEW",
    nextMigration: "NOT_AUTHORIZED",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPhase1PsychologyNotificationsPrerequisites(process.env, { argument }))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_310003_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
