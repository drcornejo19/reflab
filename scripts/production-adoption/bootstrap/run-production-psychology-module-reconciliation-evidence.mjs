import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget, PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import { assertNoInheritedPgState } from "./run-production-installer-identity-attestation.mjs";
import { assertRepositoryAttestation } from "./production-managed-postgres-target.mjs";
import {
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN,
  assertPsychologyReconciliationArtifacts,
  buildPsychologyReconciliationAggregateBatch,
  buildPsychologyReconciliationCatalogBatch,
  classifyPsychologyReconciliationEvidence,
  shouldRunPsychologyReconciliationAggregate,
} from "./psychology-module-reconciliation-evidence-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function hostCategory(host) {
  return host.startsWith("db.") ? "DIRECT" : "SESSION_POOLER";
}

export function authorizePsychologyReconciliationEvidenceTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN] !== "true") {
    throw new Error("Psychology reconciliation evidence requires both explicit read-only opt-ins.");
  }
  return authorizeProductionPreflightTarget(environment);
}

export function runProductionPsychologyModuleReconciliationEvidence(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION) {
    throw new Error("Psychology reconciliation evidence requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync(
    "git", args, { cwd: root, encoding: "utf8", windowsHide: true },
  ));
  const head = git(["rev-parse", "HEAD"]).trim();
  assertRepositoryAttestation({
    expectedHead: environment[PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD],
    actualHead: head,
    status: git(["status", "--short"]),
  });
  const artifacts = (dependencies.assertArtifacts ?? assertPsychologyReconciliationArtifacts)(root);
  const target = (dependencies.authorize ?? authorizePsychologyReconciliationEvidenceTarget)(environment);
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const catalogResults = execute(
    buildPsychologyReconciliationCatalogBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const aggregateResults = shouldRunPsychologyReconciliationAggregate(catalogResults)
    ? execute(
      buildPsychologyReconciliationAggregateBatch(),
      target.connectionEnvironment,
      { processEnvironment: environment },
    )
    : undefined;
  const decision = classifyPsychologyReconciliationEvidence(catalogResults, aggregateResults);
  return {
    format: PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT,
    head,
    artifacts,
    target: {
      projectRef: target.projectRef,
      hostCategory: hostCategory(target.host),
      caller: decision.callerExact ? "reflab_prod_preflight_ro" : null,
      postgresMajor: decision.postgresMajorExact ? 17 : null,
      readOnly: decision.readOnlyExact === true,
    },
    visibilityMethod: decision.classification === "PRIVILEGED_READ_ONLY_REQUIRED"
      ? "PRIVILEGED_READ_ONLY_REQUIRED"
      : "DIRECT_PREFLIGHT_ROLE",
    checks: decision.checks ?? null,
    tables: decision.tables,
    classification: decision.classification,
    nextAllowedRemoteOperation: decision.nextAllowedRemoteOperation,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPsychologyModuleReconciliationEvidence(
    process.env,
    { argument },
  )).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`PSYCHOLOGY_RECONCILIATION_EVIDENCE_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
