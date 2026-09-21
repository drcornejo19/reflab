import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { buildPsqlEnvironment, executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
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

function postgresDiagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: match?.[1] ?? "UNKNOWN", message: match?.[2]?.slice(0, 240) ?? "sanitized diagnostic unavailable" };
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--quiet"], {
    input: sql, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    const diagnostic = postgresDiagnostic(result.stderr);
    throw Object.assign(new Error(`Production 310004 failed; SQLSTATE=${diagnostic.sqlstate}; message=${diagnostic.message}.`), { sqlstate: diagnostic.sqlstate });
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
  const prior = classifyPrior310003(results, "POST_BOOTSTRAP");
  const sidecar = classifyPhase2aSemanticAuditPre(results.get(PHASE2A_SEMANTIC_AUDIT_PRE_QUERY_ID));
  if (prior.installer.managedProfile !== "READY" || prior.installer.lifecycleState !== "POST_BOOTSTRAP"
      || prior.examTraining !== "EXACT" || prior.psychology.postState !== "EXACT" || sidecar !== "EXACT") {
    throw new Error("Production 310004 pre-DDL attestation failed.");
  }
  return { ...prior, sidecar };
}

function classifyPostDdl(results, before) {
  const prior = classifyPrior310003(results, "POST_PHASE2A_SEMANTIC_AUDIT", true);
  const sidecarPayload = results.get(PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID);
  const sidecar = classifyPhase2aSemanticAuditPost(sidecarPayload);
  const fingerprintsPreserved = JSON.stringify(prior.fingerprint) === JSON.stringify(before.fingerprint)
    && JSON.stringify(prior.mutationFingerprint) === JSON.stringify(before.mutationFingerprint);
  if (prior.installer.managedProfile !== "READY"
      || prior.installer.lifecycleState !== "POST_PHASE2A_SEMANTIC_AUDIT"
      || prior.examTraining !== "EXACT" || prior.psychology.postState !== "EXACT"
      || sidecar.postState !== "EXACT" || !fingerprintsPreserved) {
    const failedChecks = Object.entries(sidecarPayload?.checks ?? {})
      .filter(([, value]) => value !== true).map(([field]) => field).join(",") || "incomplete-output";
    throw new Error(`Production 310004 post-DDL attestation failed; installer=${prior.installer.lifecycleState}/${prior.installer.managedProfile}; examTraining=${prior.examTraining}; psychology=${prior.psychology.postState}; sidecar=${sidecar.postState}; fingerprints=${fingerprintsPreserved}; checks=${failedChecks}.`);
  }
  return { ...prior, sidecar, fingerprintsPreserved };
}

export function runProductionPhase2aSemanticAudit(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== PHASE2A_SEMANTIC_AUDIT_OPERATION) throw new Error("Production 310004 requires its exact operation argument.");
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({ expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status });
  const artifact = (dependencies.assertArtifact ?? assertPhase2aSemanticAuditArtifact)(root);
  const target = (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, { operationOptIn: PHASE2A_SEMANTIC_AUDIT_OPT_IN });
  if (target.host !== PRODUCTION_SESSION_POOLER_HOST && !dependencies.allowLocalTarget) throw new Error("Production 310004 requires the exact approved Session Pooler host.");
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(sql, connectionEnvironment, environment, dependencies.spawn ?? spawnSync));
  const before = classifyPreDdl(executeReadOnly(buildPhase2aSemanticAuditPreBatch(), target.connectionEnvironment, { processEnvironment: environment }));
  try {
    executeApprovedMigration(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "UNKNOWN";
    try {
      classifyPreDdl(executeReadOnly(buildPhase2aSemanticAuditPreBatch(), target.connectionEnvironment, { processEnvironment: environment }));
      rollback = "PASS";
    } catch { rollback = "BLOCKER"; }
    throw new Error(`${sanitizeProcessOutput(error.message)} rollback=${rollback}.`);
  }
  const post = classifyPostDdl(executeReadOnly(buildPhase2aSemanticAuditPostBatch(), target.connectionEnvironment, { processEnvironment: environment }), before);
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPhase2aSemanticAudit(process.env, { argument }))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`PRODUCTION_310004_FAIL: ${sanitizeProcessOutput(error.message)}\n`); process.exitCode = 1; });
}
