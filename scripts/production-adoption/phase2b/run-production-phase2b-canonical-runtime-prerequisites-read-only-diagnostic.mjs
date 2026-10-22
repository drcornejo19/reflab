import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "../bootstrap/production-managed-postgres-target.mjs";
import {
  INSTALLER_IDENTITY_QUERY_ID,
  assertNoInheritedPgState,
  classifyInstallerIdentity,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID,
  classifyCanonicalRuntimePrerequisitesState,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  assertCanonicalRuntimePrerequisitesSessionPoolerTarget,
  buildCanonicalRuntimePrerequisitesPreBatch,
} from "./run-production-phase2b-canonical-runtime-prerequisites.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_FORMAT =
  "REFLAB_310005_READ_ONLY_DIAGNOSTIC_V1";
export const CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION =
  "--production-phase2b-canonical-runtime-prerequisites-read-only-diagnostic";
export const CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC";

export const CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS = Object.freeze([
  "installerManagedProfileExact",
  "installerLifecycleExact",
  "historicalFingerprintExact",
  "phase2aSidecarExact",
  "canonicalRuntimePreStateExact",
]);

export const CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS = Object.freeze([
  ...CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  "sourceHashExact",
  "aclExact",
]);

const rejectedDdlVariables = Object.freeze([
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  "REFLAB_PRODUCTION_DDL_DB_URL",
]);

const expectedCounts = Object.freeze({
  attempts: 37,
  exam_results: 6,
  notification_events: 60,
  ledger: 3,
  schema_state: 0,
});

function exactLabel(value, expected) {
  if (typeof value !== "string" || value === "UNKNOWN") return null;
  return value === expected;
}

function classificationExact(value, expected) {
  if (value === "UNKNOWN" || typeof value !== "string") return null;
  return value === expected;
}

function observedBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function observedCounts(payload) {
  return Object.fromEntries(Object.keys(expectedCounts).map((name) => [
    name,
    Number.isInteger(payload?.counts?.[name]) ? payload.counts[name] : null,
  ]));
}

function historicalFingerprintComponent(payload) {
  const complete = ["attempts", "exam_results", "notification_events"]
    .every((name) => Number.isInteger(payload?.[name]));
  return complete ? phase1HistoricalFingerprintExact(payload) : null;
}

export function authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget(
  environment = process.env,
) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPT_IN] !== "true") {
    throw new Error("310005_READ_ONLY_DIAGNOSTIC_NOT_AUTHORIZED");
  }
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("310005_READ_ONLY_DIAGNOSTIC_REJECTS_DDL_CONFIGURATION");
  }
  return assertCanonicalRuntimePrerequisitesSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "310005 privileged read-only diagnostic",
    }),
  );
}

export function classifyCanonicalRuntimePrerequisitesDiagnostic(results) {
  const installerPayload = results instanceof Map
    ? results.get(INSTALLER_IDENTITY_QUERY_ID) : undefined;
  const fingerprintPayload = results instanceof Map
    ? results.get(phase1ProductFingerprintQuery.id) : undefined;
  const sidecarPayload = results instanceof Map
    ? results.get(phase2aSemanticAuditPostQuery.id) : undefined;
  const statePayload = results instanceof Map
    ? results.get(CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID) : undefined;

  const installer = classifyInstallerIdentity(installerPayload);
  const fingerprintExact = historicalFingerprintComponent(fingerprintPayload);
  const adjustedSidecar = {
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  };
  const sidecar = classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const state = classifyCanonicalRuntimePrerequisitesState(statePayload);

  const components = {
    installerManagedProfileExact: exactLabel(installer.managedProfile, "READY"),
    installerLifecycleExact: exactLabel(
      installer.lifecycleState, "POST_PHASE2A_SEMANTIC_AUDIT",
    ),
    historicalFingerprintExact: fingerprintExact,
    phase2aSidecarExact: classificationExact(sidecar.postState, "EXACT"),
    canonicalRuntimePreStateExact: classificationExact(state.classification, "PASS"),
  };
  const checks = Object.fromEntries(CANONICAL_RUNTIME_PREREQUISITES_CHECKS.map((name) => [
    name, observedBoolean(statePayload?.checks?.[name]),
  ]));
  for (const name of ["sourceHashExact", "aclExact"]) {
    checks[name] = observedBoolean(state.checks?.[name]);
  }
  const failedComponents = CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS
    .filter((name) => components[name] === false);
  const unknownComponents = CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS
    .filter((name) => components[name] === null);
  const failedChecks = CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS
    .filter((name) => checks[name] === false);
  const unknownChecks = CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS
    .filter((name) => checks[name] === null);
  const classification = failedComponents.length > 0 || failedChecks.length > 0
    ? "BLOCKER"
    : unknownComponents.length > 0 || unknownChecks.length > 0
      ? "UNKNOWN"
      : "EXACT";

  return {
    classification,
    componentCount: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS.length,
    components,
    failedComponents,
    unknownComponents,
    checkCount: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS.length,
    checks,
    failedChecks,
    unknownChecks,
    expected: {
      installerManagedProfile: "READY",
      installerLifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT",
      phase2aSidecarPostState: "EXACT",
      canonicalRuntimePreState: "PASS",
      counts: expectedCounts,
    },
    observed: {
      installerManagedProfile: installer.managedProfile ?? null,
      installerLifecycleState: installer.lifecycleState ?? null,
      phase2aSidecarPostState: sidecar.postState ?? null,
      phase2aSourceHashExact: typeof sidecar.sourceHashExact === "boolean"
        ? sidecar.sourceHashExact : null,
      canonicalRuntimePreState: state.classification ?? null,
      counts: observedCounts(statePayload),
    },
  };
}

export function runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnostic(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION) {
    throw new Error("EXACT_310005_DIAGNOSTIC_ARGUMENT_REQUIRED");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead,
    status,
  });
  const target = (dependencies.authorize
    ?? authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget)(environment);
  assertCanonicalRuntimePrerequisitesSessionPoolerTarget(target);
  const batch = buildCanonicalRuntimePrerequisitesPreBatch();
  const results = (dependencies.executeReadOnly ?? executeReadOnlyBatch)(
    batch,
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  return {
    format: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_FORMAT,
    ...classifyCanonicalRuntimePrerequisitesDiagnostic(results),
  };
}

export async function runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnosticCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run
      ?? runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnostic)(environment, {
        ...dependencies,
        argument,
      });
    const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch {
    const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
    writeStderr([
      "REFLAB_310005_READ_ONLY_DIAGNOSTIC_FAIL",
      "stage=READ_ONLY_DIAGNOSTIC",
      "reason=READ_ONLY_DIAGNOSTIC_ABORTED",
      "",
    ].join("\n"));
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnosticCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
