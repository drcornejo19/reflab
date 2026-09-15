import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "./production-managed-postgres-target.mjs";
import { assertNoInheritedPgState } from "./run-production-installer-identity-attestation.mjs";
import {
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN,
  assertPrivilegedPsychologyReconciliationArtifacts,
  buildPrivilegedPsychologyReconciliationAggregateBatch,
  buildPrivilegedPsychologyReconciliationCatalogBatch,
  classifyPrivilegedPsychologyReconciliationEvidence,
  shouldRunPrivilegedPsychologyReconciliationAggregate,
} from "./psychology-module-reconciliation-privileged-evidence-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const PRIVILEGED_PSYCHOLOGY_EVIDENCE_FAILURE_PREFIX =
  "PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_FAIL";

class PrivilegedPsychologyEvidenceError extends Error {
  constructor(stage, reason, cause) {
    super(`${stage}:${reason}`, { cause });
    this.name = "PrivilegedPsychologyEvidenceError";
    this.stage = stage;
    this.reason = reason;
  }
}

function staged(stage, reason, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof PrivilegedPsychologyEvidenceError) throw error;
    throw new PrivilegedPsychologyEvidenceError(stage, reason, error);
  }
}

function executeFixedReadOnlyBatch(execute, sql, target, environment, reason) {
  try {
    return execute(sql, target.connectionEnvironment, { processEnvironment: environment });
  } catch (error) {
    const stage = /invalid result frame/i.test(String(error?.message ?? ""))
      ? "QUERY_RESULT_PARSE" : "PSQL_EXECUTION";
    throw new PrivilegedPsychologyEvidenceError(stage, reason, error);
  }
}

export function formatPrivilegedPsychologyEvidenceFailure(error) {
  const allowedStages = new Set([
    "TARGET_GUARD", "HEAD_ATTESTATION", "INSTALLER_PROFILE", "SQL_BUILD",
    "PSQL_EXECUTION", "QUERY_RESULT_PARSE", "CATALOG_CLASSIFICATION",
    "AGGREGATE_CLASSIFICATION", "OUTPUT_SERIALIZATION", "ERROR_SANITIZATION", "OTHER",
  ]);
  const stage = allowedStages.has(error?.stage) ? error.stage : "ERROR_SANITIZATION";
  const reason = /^[A-Z][A-Z0-9_]{2,80}$/.test(error?.reason ?? "")
    ? error.reason : "SAFE_DIAGNOSTIC_UNAVAILABLE";
  return `${PRIVILEGED_PSYCHOLOGY_EVIDENCE_FAILURE_PREFIX}:\nstage=${stage}\nreason=${reason}\n`;
}

function hostCategory(host) {
  return host.startsWith("db.") ? "DIRECT" : "SESSION_POOLER";
}

export function authorizePrivilegedPsychologyReconciliationEvidenceTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN] !== "true") {
    throw new Error("Privileged Psychology evidence requires all three explicit read-only opt-ins.");
  }
  if (environment.ALLOW_PRODUCTION_DDL !== undefined) {
    throw new Error("Privileged Psychology evidence rejects the Production DDL opt-in.");
  }
  return resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "Production privileged Psychology reconciliation evidence",
  });
}

export function runProductionPsychologyModuleReconciliationPrivilegedEvidence(
  environment = process.env,
  dependencies = {},
) {
  staged("TARGET_GUARD", "OPERATION_OR_INHERITED_ENV_REJECTED", () => {
    if (dependencies.argument !== PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION) {
      throw new Error("Privileged Psychology evidence requires its exact operation argument.");
    }
    assertNoInheritedPgState(environment);
  });
  const git = dependencies.git ?? ((args) => execFileSync(
    "git", args, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    },
  ));
  const actualHead = staged("HEAD_ATTESTATION", "HEAD_OR_WORKTREE_REJECTED", () => {
    const observedHead = git(["rev-parse", "HEAD"]).trim();
    assertRepositoryAttestation({
      expectedHead: environment[PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD],
      actualHead: observedHead,
      status: git(["status", "--short"]),
    });
    return observedHead;
  });
  const artifacts = staged("SQL_BUILD", "PINNED_ARTIFACT_REJECTED", () => (
    dependencies.assertArtifacts ?? assertPrivilegedPsychologyReconciliationArtifacts
  )(root));
  const authorize = dependencies.authorize
    ?? authorizePrivilegedPsychologyReconciliationEvidenceTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = staged("TARGET_GUARD", "TARGET_OR_OPT_IN_REJECTED", () => authorize(environment));
  const catalogSql = staged(
    "SQL_BUILD", "CATALOG_BATCH_BUILD_FAILED",
    () => buildPrivilegedPsychologyReconciliationCatalogBatch(),
  );
  const catalogResults = executeFixedReadOnlyBatch(
    execute, catalogSql, target, environment, "CATALOG_BATCH_FAILED",
  );
  const runAggregate = staged(
    "CATALOG_CLASSIFICATION", "CATALOG_GATE_FAILED",
    () => shouldRunPrivilegedPsychologyReconciliationAggregate(catalogResults),
  );
  let aggregateResults;
  if (runAggregate) {
    const aggregateSql = staged(
      "SQL_BUILD", "AGGREGATE_BATCH_BUILD_FAILED",
      () => buildPrivilegedPsychologyReconciliationAggregateBatch(),
    );
    aggregateResults = executeFixedReadOnlyBatch(
      execute, aggregateSql, target, environment, "AGGREGATE_BATCH_FAILED",
    );
  }
  const decision = staged(
    aggregateResults ? "AGGREGATE_CLASSIFICATION" : "CATALOG_CLASSIFICATION",
    aggregateResults ? "AGGREGATE_RESULT_REJECTED" : "CATALOG_RESULT_REJECTED",
    () => classifyPrivilegedPsychologyReconciliationEvidence(catalogResults, aggregateResults),
  );
  return {
    format: PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT,
    head: actualHead,
    provider: artifacts.provider,
    targetArtifact: artifacts.target,
    target: {
      projectRef: target.projectRef,
      hostCategory: hostCategory(target.host),
      postgresMajor: decision.postgresMajorExact ? 17 : null,
      caller: decision.callerExact ? "postgres" : null,
      readOnly: decision.readOnlyExact === true,
    },
    installerProfile: decision.installerExact ? "READY_POST_BOOTSTRAP" : "BLOCKER",
    productFingerprint: decision.productFingerprintExact ? "EXACT" : "BLOCKER",
    historicalFingerprint: decision.historicalFingerprint ?? null,
    tables: decision.tables,
    metrics: decision.metrics ?? [],
    reconciliationEligibility: decision.reconciliationEligibility,
    classification: decision.classification,
    nextAllowedRemoteOperation: "NONE",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    process.env,
    { argument },
  )).then((result) => {
    let output;
    try {
      output = `${JSON.stringify(result, null, 2)}\n`;
    } catch (error) {
      throw new PrivilegedPsychologyEvidenceError(
        "OUTPUT_SERIALIZATION", "RESULT_SERIALIZATION_FAILED", error,
      );
    }
    process.stdout.write(output);
  })
    .catch((error) => {
      process.stderr.write(formatPrivilegedPsychologyEvidenceFailure(error));
      process.exitCode = 1;
    });
}
