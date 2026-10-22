import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import {
  buildPsqlEnvironment,
  executeReadOnlyBatch,
  sanitizeProcessOutput,
} from "../../production-preflight/run.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  assertRepositoryAttestation,
  authorizeProductionDdlTarget,
} from "./run-production-role-bootstrap.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_PRODUCT_FINGERPRINT_QUERY_ID,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  classifyPhase1ExamTrainingPost,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  phase1PsychologyNotificationsCatalogQuery,
  phase1PsychologyNotificationsDataAuditQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  classifyPhase1PsychologyNotificationsPrivilegedEntry,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_FORMAT,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPT_IN,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID,
  assertPsychologyModuleSlugReconciliationArtifact,
  classifyPsychologyModuleSlugReconciliationPost,
  classifyPsychologyModuleSlugReconciliationPre,
  psychologyModuleSlugReconciliationPostQuery,
  psychologyModuleSlugReconciliationPreQuery,
} from "./psychology-module-slug-reconciliation-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function postgresDiagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return {
    sqlstate: match?.[1] ?? "UNKNOWN",
    message: match?.[2]?.slice(0, 240) ?? "sanitized diagnostic unavailable",
  };
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", [
    "-X", "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--set", "VERBOSITY=verbose",
    "--quiet",
  ], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    const diagnostic = postgresDiagnostic(result.stderr);
    throw Object.assign(new Error(
      `Production Psychology module_slug reconciliation failed; SQLSTATE=${diagnostic.sqlstate}; message=${diagnostic.message}.`,
    ), { sqlstate: diagnostic.sqlstate });
  }
}

export function buildPsychologyModuleSlugReconciliationPreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    psychologyModuleSlugReconciliationPreQuery,
  ]);
}

export function buildPsychologyModuleSlugReconciliationPostBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    psychologyModuleSlugReconciliationPostQuery,
    phase1PsychologyNotificationsCatalogQuery,
  ]);
}

export function buildPsychologyModuleSlugReconciliationReentryDataBatch() {
  return buildSqlBatch([phase1PsychologyNotificationsDataAuditQuery]);
}

function classifyExamTraining(results, installer, fingerprint) {
  return classifyPhase1ExamTrainingPost(
    results.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID),
    installer,
    fingerprint,
    fingerprint,
  ).postState;
}

function classifyPreDdl(results) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const examTrainingState = classifyExamTraining(results, installer, fingerprint);
  const reconciliation = classifyPsychologyModuleSlugReconciliationPre(
    results.get(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID),
    installer,
    examTrainingState,
    fingerprint,
  );
  if (reconciliation.classification !== "PASS") {
    throw new Error("Psychology module_slug reconciliation pre-DDL attestation failed.");
  }
  return { installer, fingerprint, examTrainingState, reconciliation };
}

function classifyPostDdl(results, dataResults) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const examTrainingState = classifyExamTraining(results, installer, fingerprint);
  const psychologyEntry = classifyPhase1PsychologyNotificationsPrivilegedEntry(
    results,
    dataResults,
  );
  const reconciliation = classifyPsychologyModuleSlugReconciliationPost(
    results.get(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID),
    installer,
    examTrainingState,
    fingerprint,
    psychologyEntry,
  );
  if (reconciliation.classification !== "EXACT") {
    throw new Error("Psychology module_slug reconciliation post-DDL attestation failed.");
  }
  return { installer, fingerprint, examTrainingState, psychologyEntry, reconciliation };
}

export function runProductionPsychologyModuleSlugReconciliation(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION) {
    throw new Error("Psychology module_slug reconciliation requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status,
  });
  const artifact = (dependencies.assertArtifact
    ?? assertPsychologyModuleSlugReconciliationArtifact)(root);
  const target = (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, {
    operationOptIn: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPT_IN,
  });
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(
      sql,
      connectionEnvironment,
      environment,
      dependencies.spawn ?? spawnSync,
    ));

  const beforeResults = executeReadOnly(
    buildPsychologyModuleSlugReconciliationPreBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const before = classifyPreDdl(beforeResults);
  try {
    executeApprovedMigration(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "UNKNOWN";
    try {
      const rollbackResults = executeReadOnly(
        buildPsychologyModuleSlugReconciliationPreBatch(),
        target.connectionEnvironment,
        { processEnvironment: environment },
      );
      classifyPreDdl(rollbackResults);
      rollback = "PASS";
    } catch {
      rollback = "BLOCKER";
    }
    throw new Error(`${sanitizeProcessOutput(error.message)} rollback=${rollback}.`);
  }

  const postResults = executeReadOnly(
    buildPsychologyModuleSlugReconciliationPostBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const postDataResults = executeReadOnly(
    buildPsychologyModuleSlugReconciliationReentryDataBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const post = classifyPostDdl(postResults, postDataResults);

  return {
    format: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head: actualHead,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: {
      installer: before.installer.managedProfile,
      examTraining: before.examTrainingState,
      reconciliation: before.reconciliation.classification,
    },
    migration: "PASS",
    productRowMutations: {
      psychologyCheckinUpdates: 3,
      otherProductUpdates: 0,
      productInserts: 0,
      productDeletes: 0,
    },
    postDdl: {
      reconciliation: post.reconciliation.classification,
      examTraining: post.examTrainingState,
      psychology310003Entry: post.psychologyEntry.classification,
      next310003Review: post.psychologyEntry.nextAllowedRemoteOperation,
    },
    nextMigration: "NOT_AUTHORIZED",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPsychologyModuleSlugReconciliation(
    process.env,
    { argument },
  )).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
