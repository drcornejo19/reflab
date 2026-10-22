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
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
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
  ADMIN_CANONICAL_ACCESS_CHECKS,
  ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  assertAdminCanonicalAccessSessionPoolerTarget,
  buildAdminCanonicalAccessPreBatch,
} from "./run-production-phase2b-admin-canonical-access.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_FORMAT =
  "REFLAB_202608110001_READ_ONLY_DIAGNOSTIC_V1";
export const ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION =
  "--production-phase2b-admin-canonical-access-read-only-diagnostic";
export const ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS_DIAGNOSTIC";

export const ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS = Object.freeze([
  "installerManagedProfileExact",
  "installerLifecycleExact",
  "historicalFingerprintExact",
  "phase2aSidecarExact",
  "adminCanonicalAccessPreStateExact",
]);

export const ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS = Object.freeze([
  "helperSourceExact",
  "helperAclExact",
  "functionsExact",
  "functionAclExact",
  "policiesExact",
  "schemaAclExact",
  "tableAclExact",
  "columnAclExact",
]);

export const ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS = Object.freeze([
  ...ADMIN_CANONICAL_ACCESS_CHECKS,
  ...ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS,
]);

const rejectedDdlVariables = Object.freeze([
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS",
  "REFLAB_PRODUCTION_DDL_DB_URL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
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
  if (typeof value !== "string" || value === "UNKNOWN") return null;
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

export function authorizeProductionAdminCanonicalAccessDiagnosticTarget(
  environment = process.env,
) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPT_IN] !== "true") {
    throw new Error("202608110001_READ_ONLY_DIAGNOSTIC_NOT_AUTHORIZED");
  }
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("202608110001_READ_ONLY_DIAGNOSTIC_REJECTS_DDL_CONFIGURATION");
  }
  return assertAdminCanonicalAccessSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "202608110001 privileged read-only diagnostic",
    }),
  );
}

export function classifyAdminCanonicalAccessDiagnostic(results) {
  const installerPayload = results instanceof Map
    ? results.get(installerIdentityQuery.id) : undefined;
  const fingerprintPayload = results instanceof Map
    ? results.get(phase1ProductFingerprintQuery.id) : undefined;
  const sidecarPayload = results instanceof Map
    ? results.get(phase2aSemanticAuditPostQuery.id) : undefined;
  const statePayload = results instanceof Map
    ? results.get(ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID) : undefined;

  const installer = classifyInstallerIdentity(installerPayload);
  const fingerprintExact = historicalFingerprintComponent(fingerprintPayload);
  const adjustedSidecar = {
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  };
  const sidecar = classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const state = classifyAdminCanonicalAccessState(statePayload);

  const components = {
    installerManagedProfileExact: exactLabel(installer.managedProfile, "READY"),
    installerLifecycleExact: exactLabel(
      installer.lifecycleState, "POST_PHASE2A_SEMANTIC_AUDIT",
    ),
    historicalFingerprintExact: fingerprintExact,
    phase2aSidecarExact: classificationExact(sidecar.postState, "EXACT"),
    adminCanonicalAccessPreStateExact: classificationExact(state.classification, "PASS"),
  };
  const checks = Object.fromEntries(ADMIN_CANONICAL_ACCESS_CHECKS.map((name) => [
    name,
    observedBoolean(statePayload?.checks?.[name]),
  ]));
  for (const name of ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS) {
    checks[name] = observedBoolean(state.checks?.[name]);
  }
  const failedComponents = ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS
    .filter((name) => components[name] === false);
  const unknownComponents = ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS
    .filter((name) => components[name] === null);
  const failedChecks = ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS
    .filter((name) => checks[name] === false);
  const unknownChecks = ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS
    .filter((name) => checks[name] === null);
  const classification = failedComponents.length > 0 || failedChecks.length > 0
    ? "BLOCKER"
    : unknownComponents.length > 0 || unknownChecks.length > 0
      ? "UNKNOWN"
      : "EXACT";

  return {
    classification,
    componentCount: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS.length,
    components,
    failedComponents,
    unknownComponents,
    checkCount: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS.length,
    checks,
    failedChecks,
    unknownChecks,
    expected: {
      installerManagedProfile: "READY",
      installerLifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT",
      phase2aSidecarPostState: "EXACT",
      adminCanonicalAccessPreState: "PASS",
      counts: expectedCounts,
    },
    observed: {
      installerManagedProfile: installer.managedProfile ?? null,
      installerLifecycleState: installer.lifecycleState ?? null,
      phase2aSidecarPostState: sidecar.postState ?? null,
      phase2aSourceHashExact: typeof sidecar.sourceHashExact === "boolean"
        ? sidecar.sourceHashExact : null,
      adminCanonicalAccessPreState: state.classification ?? null,
      counts: observedCounts(statePayload),
    },
  };
}

export function runProductionAdminCanonicalAccessReadOnlyDiagnostic(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION) {
    throw new Error("EXACT_202608110001_DIAGNOSTIC_ARGUMENT_REQUIRED");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead,
    status,
  });
  const target = (dependencies.authorize
    ?? authorizeProductionAdminCanonicalAccessDiagnosticTarget)(environment);
  assertAdminCanonicalAccessSessionPoolerTarget(target);
  const batch = buildAdminCanonicalAccessPreBatch();
  const results = (dependencies.executeReadOnly ?? executeReadOnlyBatch)(
    batch,
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  return {
    format: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_FORMAT,
    ...classifyAdminCanonicalAccessDiagnostic(results),
  };
}

export async function runProductionAdminCanonicalAccessReadOnlyDiagnosticCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run
      ?? runProductionAdminCanonicalAccessReadOnlyDiagnostic)(environment, {
        ...dependencies,
        argument,
      });
    const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch {
    const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
    writeStderr([
      "REFLAB_202608110001_READ_ONLY_DIAGNOSTIC_FAIL",
      "stage=READ_ONLY_DIAGNOSTIC",
      "reason=READ_ONLY_DIAGNOSTIC_ABORTED",
      "",
    ].join("\n"));
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionAdminCanonicalAccessReadOnlyDiagnosticCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
