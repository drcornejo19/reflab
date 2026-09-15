import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
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
  if (dependencies.argument !== PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION) {
    throw new Error("Privileged Psychology evidence requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync(
    "git", args, { cwd: root, encoding: "utf8", windowsHide: true },
  ));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  assertRepositoryAttestation({
    expectedHead: environment[PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD],
    actualHead,
    status: git(["status", "--short"]),
  });
  const artifacts = (dependencies.assertArtifacts
    ?? assertPrivilegedPsychologyReconciliationArtifacts)(root);
  const authorize = dependencies.authorize
    ?? authorizePrivilegedPsychologyReconciliationEvidenceTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const catalogResults = execute(
    buildPrivilegedPsychologyReconciliationCatalogBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const aggregateResults = shouldRunPrivilegedPsychologyReconciliationAggregate(catalogResults)
    ? execute(
      buildPrivilegedPsychologyReconciliationAggregateBatch(),
      target.connectionEnvironment,
      { processEnvironment: environment },
    )
    : undefined;
  const decision = classifyPrivilegedPsychologyReconciliationEvidence(
    catalogResults,
    aggregateResults,
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
  )).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
