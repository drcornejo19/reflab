import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  assertNoInheritedPgState,
} from "./run-production-installer-identity-attestation.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "./production-managed-postgres-target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_FORMAT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
  assertPhase1PsychologyNotificationsPrivilegedArtifacts,
  buildPhase1PsychologyNotificationsPrivilegedBatch,
  classifyPhase1PsychologyNotificationsPrivilegedEntry,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function hostCategory(host) {
  return host.startsWith("db.") ? "DIRECT" : "SESSION_POOLER";
}

export function authorizeProductionPrivilegedReadOnlyTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true") {
    throw new Error("Production privileged read-only attestation requires both explicit read-only opt-ins.");
  }
  return resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "Production privileged read-only attestation",
  });
}

export function runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION) {
    throw new Error("Production privileged read-only attestation requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync(
    "git", args, { cwd: root, encoding: "utf8", windowsHide: true },
  ));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead,
    status,
  });
  const artifacts = (dependencies.assertArtifacts
    ?? assertPhase1PsychologyNotificationsPrivilegedArtifacts)(root);
  const authorize = dependencies.authorize ?? authorizeProductionPrivilegedReadOnlyTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const results = execute(
    buildPhase1PsychologyNotificationsPrivilegedBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(results);

  return {
    format: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_FORMAT,
    head: actualHead,
    artifact: artifacts.psychologyNotifications,
    target: {
      projectRef: target.projectRef,
      hostCategory: hostCategory(target.host),
      postgresMajor: decision.postgresMajorExact ? 17 : null,
      caller: decision.callerExact ? "postgres" : null,
      readOnly: decision.readOnlyExact === true,
    },
    attestations: {
      installerProfile: decision.installerExact ? "READY_POST_BOOTSTRAP" : "BLOCKER",
      artifactSpecificCatalog: decision.catalogAttestation ?? "UNKNOWN",
      protectedPreState: decision.protectedStateAttestation ?? "UNKNOWN",
      examTrainingPostState: decision.examTrainingState ?? "UNKNOWN",
      productFingerprint: decision.fingerprintExact ? "EXACT" : "BLOCKER",
    },
    checks: decision.checks ?? null,
    classification: decision.classification,
    nextAllowedRemoteOperation: decision.nextAllowedRemoteOperation,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation(
    process.env,
    { argument },
  ))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        `PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_ATTESTATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`,
      );
      process.exitCode = 1;
    });
}
