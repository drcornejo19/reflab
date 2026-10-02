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
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_COMMUNICATION_POST_QUERY_ID,
} from "./phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
} from "./phase2b-canonical-runtime-installed-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  classifyCanonicalTrainingPreservation,
} from "./phase2b-canonical-training-attempts-contract.mjs";
import { classifyPrePhase2bPreservation } from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  assertCanonicalRuntimeInstalledSessionPoolerTarget,
  buildCanonicalRuntimeInstalledPreBatch,
  classifyCanonicalRuntimeInstalledEvidence,
} from "./run-production-phase2b-canonical-runtime-installed.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_FORMAT =
  "REFLAB_310006_CURRENT_PRODUCTION_PRE_ATTESTATION_V1";
export const CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION =
  "--production-phase2b-canonical-runtime-installed-pre-attestation";
export const CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION";

const rejectedDdlVariables = Object.freeze([
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  "REFLAB_PRODUCTION_DDL_DB_URL",
]);

const requiredQueryIds = Object.freeze([
  INSTALLER_IDENTITY_QUERY_ID,
  phase1ProductFingerprintQuery.id,
  phase2aSemanticAuditPostQuery.id,
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  CANONICAL_COMMUNICATION_POST_QUERY_ID,
  CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
]);

const componentChecks = Object.freeze([
  "installerManagedProfileExact",
  "installerLifecycleExact",
  "historicalFingerprintExact",
  "phase2aPostExact",
  "canonicalJsonbTextExact",
  "adminCanonicalAccessExact",
  "prerequisitePostPreservedExact",
  "trainingPostPreservedExact",
  "communicationPostExact",
  "runtimeInstalledPreExact",
  "compositionExact",
]);

const runtimeChecks = Object.freeze([
  "sessionExact",
  "historicalFingerprintsExact",
  "historicalProviderDataExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "developmentObjectsAbsent",
  "cutoverAbsent",
  "ledgerRelationExact",
  "ledgerTriggerExact",
  "noLaterLedgerPhase",
  "columnsExact",
  "constraintsExact",
  "guardFunctionExact",
  "ledgerAclExact",
  "schemaAclExact",
  "guardAclExact",
  "ledgerRowsExact",
]);

export const CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS = Object.freeze([
  ...componentChecks,
  ...runtimeChecks.map((name) => `runtime.${name}`),
]);

const expectedCounts = Object.freeze({
  attempts: 37,
  exam_results: 6,
  notification_events: 60,
  clips: 30,
  payload_hash_nulls: 37,
  communication_attempts: 0,
  ledger_rows: 3,
  schema_state_rows: 0,
});

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function exactClassification(value, expected = "EXACT") {
  if (typeof value !== "string" || value === "UNKNOWN") return null;
  return value === expected;
}

function safeCount(payload, name) {
  return Number.isInteger(payload?.counts?.[name]) ? payload.counts[name] : null;
}

function stateLabel(value, expected = "EXACT") {
  const exact = exactClassification(value, expected);
  return exact === null ? "UNKNOWN" : exact ? "EXACT" : "BLOCKER";
}

function unknownReport() {
  const checks = Object.fromEntries(
    CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS.map((name) => [name, null]),
  );
  return {
    classification: "UNKNOWN",
    checkCount: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS.length,
    checks,
    failedChecks: [],
    unknownChecks: [...CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS],
    counts: Object.fromEntries(Object.keys(expectedCounts).map((name) => [name, null])),
    predecessorState: {
      phase2a: "UNKNOWN", canonicalRuntimePrerequisites310005: "UNKNOWN",
      adminCanonicalAccess202608110001: "UNKNOWN", prePhase2bPrerequisite: "UNKNOWN",
      canonicalTrainingAttempts202608130001: "UNKNOWN",
      canonicalCommunicationFeedback202608150001: "UNKNOWN",
    },
    historicalState: { exact: null, countsExact: null, providerDataExact: null },
    adoptionState: {
      ledgerRows: null, finalPhaseOrder: null, finalPhaseKey: null,
      phase3MetadataExact: null, canonicalObjectsAbsent: null,
      schemaStateRows: null, canonicalMarkerAbsent: null,
      developmentObjectsAbsent: null, cutoverAbsent: null, phase4Absent: null,
      runtime: "UNKNOWN",
    },
    securityState: {
      canonicalJsonbTextExact: null, adminCanonicalAccessExact: null,
      canonicalTrainingExact: null, canonicalCommunicationExact: null,
      predecessorSecurityExact: null, serviceRoleAccessExact: null,
      browserExposureAbsent: null, rlsOwnerCreateAbsent: null,
    },
  };
}

export function authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget(
  environment = process.env,
) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN] !== "true") {
    throw new Error("310006_PRE_ATTESTATION_NOT_AUTHORIZED");
  }
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("310006_PRE_ATTESTATION_REJECTS_DDL_CONFIGURATION");
  }
  return assertCanonicalRuntimeInstalledSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "310006 privileged read-only PRE attestation",
    }),
  );
}

export function classifyCanonicalRuntimeInstalledPreAttestation(
  results,
  dependencies = {},
) {
  if (!(results instanceof Map)
      || requiredQueryIds.some((id) => !results.has(id) || !results.get(id)
        || typeof results.get(id) !== "object")) {
    return unknownReport();
  }

  let evidence;
  let training;
  let prerequisite;
  try {
    evidence = (dependencies.classifyEvidence
      ?? classifyCanonicalRuntimeInstalledEvidence)(results, { post: false });
    const communicationPayload = results.get(CANONICAL_COMMUNICATION_POST_QUERY_ID);
    training = (dependencies.classifyTraining
      ?? classifyCanonicalTrainingPreservation)(communicationPayload.training_preservation);
    prerequisite = (dependencies.classifyPrerequisite
      ?? classifyPrePhase2bPreservation)(
      communicationPayload.training_preservation?.prerequisite_preservation,
    );
  } catch {
    return unknownReport();
  }

  const runtimePayload = results.get(CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID);
  const communicationPayload = results.get(CANONICAL_COMMUNICATION_POST_QUERY_ID);
  const checks = {
    installerManagedProfileExact:
      evidence.installer?.managedProfile === "READY" ? true
        : evidence.installer?.managedProfile === "UNKNOWN" ? null : false,
    installerLifecycleExact:
      evidence.installer?.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT" ? true
        : evidence.installer?.lifecycleState === "UNKNOWN" ? null : false,
    historicalFingerprintExact: booleanOrNull(evidence.historicalFingerprintExact),
    phase2aPostExact: exactClassification(evidence.phase2a?.postState),
    canonicalJsonbTextExact: exactClassification(evidence.helper?.classification),
    adminCanonicalAccessExact: exactClassification(evidence.admin?.classification),
    prerequisitePostPreservedExact: exactClassification(prerequisite?.classification),
    trainingPostPreservedExact: exactClassification(training?.classification),
    communicationPostExact: exactClassification(evidence.communication?.classification),
    runtimeInstalledPreExact: exactClassification(evidence.runtimeInstalled?.classification, "PASS"),
    compositionExact: exactClassification(evidence.composition?.classification),
  };
  for (const name of runtimeChecks) {
    checks[`runtime.${name}`] = booleanOrNull(evidence.runtimeInstalled?.checks?.[name]);
  }

  const failedChecks = CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS
    .filter((name) => checks[name] === false);
  const unknownChecks = CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS
    .filter((name) => checks[name] === null);
  const classification = failedChecks.length > 0
    ? "BLOCKER"
    : unknownChecks.length > 0 ? "UNKNOWN" : "310006_PRE_EXACT";
  const counts = Object.fromEntries(Object.keys(expectedCounts).map((name) => [
    name, safeCount(runtimePayload, name),
  ]));
  const finalLedgerRow = Array.isArray(runtimePayload.ledger_rows)
    ? runtimePayload.ledger_rows.at(-1) : null;
  const securityExact = [
    checks.canonicalJsonbTextExact,
    checks.adminCanonicalAccessExact,
    checks.trainingPostPreservedExact,
    checks.communicationPostExact,
  ].every((value) => value === true);

  const output = {
    classification,
    checkCount: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS.length,
    checks,
    failedChecks,
    unknownChecks,
    counts,
    predecessorState: {
      phase2a: stateLabel(evidence.phase2a?.postState),
      canonicalRuntimePrerequisites310005: stateLabel(evidence.helper?.classification),
      adminCanonicalAccess202608110001: stateLabel(evidence.admin?.classification),
      prePhase2bPrerequisite: stateLabel(prerequisite?.classification),
      canonicalTrainingAttempts202608130001: stateLabel(training?.classification),
      canonicalCommunicationFeedback202608150001:
        stateLabel(evidence.communication?.classification),
    },
    historicalState: {
      exact: checks.historicalFingerprintExact,
      countsExact: checks["runtime.historicalFingerprintsExact"],
      providerDataExact: checks["runtime.historicalProviderDataExact"],
    },
    adoptionState: {
      ledgerRows: counts.ledger_rows,
      finalPhaseOrder: Number.isInteger(finalLedgerRow?.phase_order)
        ? finalLedgerRow.phase_order : null,
      finalPhaseKey: typeof finalLedgerRow?.phase_key === "string"
        ? finalLedgerRow.phase_key : null,
      phase3MetadataExact: checks["runtime.ledgerRowsExact"],
      canonicalObjectsAbsent: counts.ledger_rows === 3
        && finalLedgerRow?.phase_key === "psychology_notification_prerequisites",
      schemaStateRows: counts.schema_state_rows,
      canonicalMarkerAbsent: checks["runtime.canonicalMarkerAbsent"],
      developmentObjectsAbsent: checks["runtime.developmentObjectsAbsent"],
      cutoverAbsent: checks["runtime.cutoverAbsent"],
      phase4Absent: checks["runtime.ledgerRowsExact"]
        && checks["runtime.noLaterLedgerPhase"] && counts.ledger_rows === 3,
      runtime: counts.schema_state_rows === 0
        && checks["runtime.canonicalMarkerAbsent"] === true
        ? "DISABLED"
        : "UNKNOWN",
    },
    securityState: {
      canonicalJsonbTextExact: checks.canonicalJsonbTextExact,
      adminCanonicalAccessExact: checks.adminCanonicalAccessExact,
      canonicalTrainingExact: checks.trainingPostPreservedExact,
      canonicalCommunicationExact: checks.communicationPostExact,
      predecessorSecurityExact: securityExact,
      serviceRoleAccessExact: securityExact,
      browserExposureAbsent: securityExact,
      rlsOwnerCreateAbsent: booleanOrNull(
        communicationPayload?.checks?.rlsOwnerCreateAbsent,
      ),
    },
  };
  if (classification === "310006_PRE_EXACT") {
    output.PRODUCTION_PREDECESSOR_STATE = "CURRENTLY_ATTESTED_EXACT";
  }
  return output;
}

export function runProductionCanonicalRuntimeInstalledPreAttestation(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION) {
    throw new Error("EXACT_310006_PRE_ATTESTATION_ARGUMENT_REQUIRED");
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
    ?? authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget)(environment);
  assertCanonicalRuntimeInstalledSessionPoolerTarget(target);
  const results = (dependencies.executeReadOnly ?? executeReadOnlyBatch)(
    buildCanonicalRuntimeInstalledPreBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  return {
    format: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_FORMAT,
    ...(dependencies.classify ?? classifyCanonicalRuntimeInstalledPreAttestation)(results),
  };
}

export async function runProductionCanonicalRuntimeInstalledPreAttestationCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run
      ?? runProductionCanonicalRuntimeInstalledPreAttestation)(environment, {
        ...dependencies,
        argument,
      });
    const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
    writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch {
    const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
    writeStderr([
      "REFLAB_310006_PRE_ATTESTATION_FAIL",
      "stage=READ_ONLY_PRE_ATTESTATION",
      "reason=READ_ONLY_PRE_ATTESTATION_ABORTED",
      "",
    ].join("\n"));
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionCanonicalRuntimeInstalledPreAttestationCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
