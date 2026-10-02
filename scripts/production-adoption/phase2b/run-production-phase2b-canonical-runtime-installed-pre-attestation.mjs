import { execFileSync, spawnSync } from "node:child_process";
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
export const CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID =
  "phase2b_canonical_runtime_installed_pre_batch";

const safeFailureReasons = new Set([
  "AUTHENTICATION_FAILED", "CONNECTION_FAILED", "DATABASE_UNAVAILABLE",
  "DDL_CONFIGURATION_REJECTED", "HEAD_MISMATCH", "HOST_RESOLUTION_FAILED",
  "INHERITED_PG_STATE", "JSON_PARSE_FAILED", "LOCAL_PROGRAMMING_ERROR",
  "OPERATION_NOT_AUTHORIZED", "OPT_IN_REQUIRED", "OUTPUT_LIMIT_EXCEEDED",
  "PRE_CLASSIFICATION_FAILED", "PSQL_NOT_FOUND", "PSQL_PROCESS_FAILED",
  "QUERY_RESULT_SHAPE_MISMATCH", "READ_ONLY_GUARD_FAILED",
  "REPOSITORY_HEAD_READ_FAILED", "TARGET_MISMATCH", "TIMEOUT", "TLS_FAILED",
  "WORKTREE_DIRTY", "WORKTREE_READ_FAILED",
]);

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

export class CanonicalRuntimeInstalledPreAttestationFailure extends Error {
  constructor(stage, substage, reason, details = {}) {
    super(`${stage}:${substage}:${reason}`);
    this.stage = stage;
    this.substage = substage;
    this.reason = reason;
    this.query = details.query ?? "NONE";
    this.sqlstate = details.sqlstate ?? "UNKNOWN";
    this.psqlExitStatus = Number.isInteger(details.psqlExitStatus)
      ? details.psqlExitStatus : null;
    this.stderrClass = details.stderrClass ?? "NOT_AVAILABLE";
  }
}

function sqlstateFrom(value) {
  return String(value ?? "").match(
    /(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5}):|SQLSTATE[_=:\s-]*([0-9A-Z]{5})/i,
  )?.slice(1).find(Boolean)?.toUpperCase() ?? null;
}

function queryFrom(value) {
  return String(value ?? "").match(/(?:query|frame for query)\s+([a-z][a-z0-9_]*)/i)?.[1]
    ?? null;
}

function classifyProcessText(value, processEvidence = {}) {
  const text = String(value ?? "");
  const sqlstate = sqlstateFrom(text);
  if (processEvidence.errorCode === "ENOENT") {
    return { reason: "PSQL_NOT_FOUND", sqlstate, stderrClass: "PROCESS_SPAWN_ERROR" };
  }
  if (processEvidence.errorCode === "ENOBUFS" || /maxbuffer|buffer limit/i.test(text)) {
    return { reason: "OUTPUT_LIMIT_EXCEEDED", sqlstate, stderrClass: "PROCESS_BUFFER_ERROR" };
  }
  if (processEvidence.errorCode === "ETIMEDOUT" || sqlstate === "57014"
      || /statement timeout|canceling statement due to statement timeout/i.test(text)) {
    return { reason: "TIMEOUT", sqlstate, stderrClass: "TIMEOUT" };
  }
  if (sqlstate?.startsWith("28")
      || /password authentication failed|no password supplied|authentication failed|sasl authentication/i.test(text)) {
    return { reason: "AUTHENTICATION_FAILED", sqlstate, stderrClass: "AUTHENTICATION_ERROR" };
  }
  if (/could not translate host name|getaddrinfo|name or service not known|temporary failure in name resolution/i.test(text)) {
    return { reason: "HOST_RESOLUTION_FAILED", sqlstate, stderrClass: "HOST_RESOLUTION_ERROR" };
  }
  if (/ssl|tls|certificate/i.test(text)) {
    return { reason: "TLS_FAILED", sqlstate, stderrClass: "TLS_ERROR" };
  }
  if (sqlstate === "3D000" || /database .* does not exist|invalid catalog name/i.test(text)) {
    return { reason: "DATABASE_UNAVAILABLE", sqlstate, stderrClass: "DATABASE_ERROR" };
  }
  if (sqlstate?.startsWith("08")
      || /connection to server|could not connect|connection refused|server closed the connection|network is unreachable/i.test(text)) {
    return { reason: "CONNECTION_FAILED", sqlstate, stderrClass: "CONNECTION_ERROR" };
  }
  if (sqlstate) {
    return { reason: `SQLSTATE_${sqlstate}`, sqlstate, stderrClass: "SQLSTATE_ERROR" };
  }
  return { reason: "PSQL_PROCESS_FAILED", sqlstate: null,
    stderrClass: "UNCLASSIFIED_PROCESS_ERROR" };
}

export function classifyCanonicalRuntimeInstalledPreAttestationFailure(
  error,
  context = {},
  processEvidence = {},
) {
  if (error instanceof CanonicalRuntimeInstalledPreAttestationFailure) return error;
  const message = String(error?.message ?? error ?? "");
  const combinedProcessText = [processEvidence.stderr, processEvidence.errorMessage, message]
    .filter(Boolean).join("\n");
  const baseDetails = {
    query: error?.query ?? queryFrom(message) ?? context.query ?? "NONE",
    psqlExitStatus: Number.isInteger(error?.psqlExitStatus)
      ? error.psqlExitStatus : processEvidence.exitStatus,
  };
  if (error instanceof SyntaxError) {
    return new CanonicalRuntimeInstalledPreAttestationFailure(
      context.stage ?? "RESULT_PARSE", context.substage ?? "JSON_RESULT",
      "JSON_PARSE_FAILED", baseDetails,
    );
  }
  if (error?.safeReason
      && (safeFailureReasons.has(error.safeReason)
        || /^SQLSTATE_[0-9A-Z]{5}$/.test(error.safeReason))) {
    return new CanonicalRuntimeInstalledPreAttestationFailure(
      context.stage ?? "OTHER", context.substage ?? "UNKNOWN", error.safeReason,
      {
        ...baseDetails,
        sqlstate: error.sqlstate,
        stderrClass: error.stderrClass,
      },
    );
  }
  if (/invalid result frame|expected a Map/i.test(message)) {
    return new CanonicalRuntimeInstalledPreAttestationFailure(
      "RESULT_PARSE", context.substage ?? "QUERY_RESULTS",
      "QUERY_RESULT_SHAPE_MISMATCH", baseDetails,
    );
  }
  if (/transaction_read_only was not confirmed as on/i.test(message)) {
    return new CanonicalRuntimeInstalledPreAttestationFailure(
      "READ_ONLY_GUARD", context.substage ?? "TRANSACTION_READ_ONLY",
      "READ_ONLY_GUARD_FAILED", baseDetails,
    );
  }
  if (context.stage === "PSQL_EXECUTION" || processEvidence.spawnAttempted) {
    const classified = classifyProcessText(combinedProcessText, processEvidence);
    return new CanonicalRuntimeInstalledPreAttestationFailure(
      "PSQL_EXECUTION", context.substage ?? "PRE_BATCH", classified.reason,
      {
        ...baseDetails,
        sqlstate: classified.sqlstate,
        stderrClass: classified.stderrClass,
      },
    );
  }
  const localReason = [
    [/exact .*argument/i, "OPERATION_NOT_AUTHORIZED"],
    [/inherited PostgreSQL/i, "INHERITED_PG_STATE"],
    [/clean worktree/i, "WORKTREE_DIRTY"],
    [/HEAD attestation/i, "HEAD_MISMATCH"],
    [/REJECTS_DDL_CONFIGURATION/i, "DDL_CONFIGURATION_REJECTED"],
    [/NOT_AUTHORIZED|explicit read-only opt-in/i, "OPT_IN_REQUIRED"],
    [/TARGET_REJECTED|project reference|target is not the exact allowlisted host|database URL is invalid/i,
      "TARGET_MISMATCH"],
  ].find(([pattern]) => pattern.test(message))?.[1];
  return new CanonicalRuntimeInstalledPreAttestationFailure(
    context.stage ?? "OTHER", context.substage ?? "UNKNOWN",
    localReason ?? context.reason ?? "LOCAL_PROGRAMMING_ERROR", baseDetails,
  );
}

function atAttestationStage(context, operation) {
  try {
    return operation();
  } catch (error) {
    throw classifyCanonicalRuntimeInstalledPreAttestationFailure(error, context);
  }
}

function assertResultContainer(results) {
  if (!(results instanceof Map)) {
    throw Object.assign(new Error("Expected a Map of framed query results."), {
      safeReason: "QUERY_RESULT_SHAPE_MISMATCH",
      query: CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID,
    });
  }
  return results;
}

export function executeCanonicalRuntimeInstalledPreAttestationReadOnlyBatch(
  sql,
  connectionEnvironment,
  { processEnvironment = process.env, spawn = spawnSync } = {},
) {
  const evidence = {
    spawnAttempted: false,
    exitStatus: null,
    errorCode: null,
    errorMessage: null,
    stderr: null,
  };
  const observingSpawn = (...args) => {
    evidence.spawnAttempted = true;
    try {
      const result = spawn(...args);
      evidence.exitStatus = Number.isInteger(result?.status) ? result.status : null;
      evidence.errorCode = result?.error?.code ?? null;
      evidence.errorMessage = result?.error?.message ?? null;
      evidence.stderr = result?.stderr ?? null;
      return result;
    } catch (error) {
      evidence.errorCode = error?.code ?? null;
      evidence.errorMessage = error?.message ?? null;
      throw error;
    }
  };
  try {
    return executeReadOnlyBatch(sql, connectionEnvironment, {
      processEnvironment,
      spawn: observingSpawn,
    });
  } catch (error) {
    throw classifyCanonicalRuntimeInstalledPreAttestationFailure(error, {
      stage: "PSQL_EXECUTION",
      substage: "PRE_BATCH",
      query: CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID,
    }, evidence);
  }
}

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
  assertProductionCanonicalRuntimeInstalledPreAttestationOptIns(environment);
  assertProductionCanonicalRuntimeInstalledPreAttestationNoDdl(environment);
  return assertCanonicalRuntimeInstalledSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "310006 privileged read-only PRE attestation",
    }),
  );
}

function assertProductionCanonicalRuntimeInstalledPreAttestationOptIns(environment) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN] !== "true") {
    throw new Error("310006_PRE_ATTESTATION_NOT_AUTHORIZED");
  }
  return true;
}

function assertProductionCanonicalRuntimeInstalledPreAttestationNoDdl(environment) {
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("310006_PRE_ATTESTATION_REJECTS_DDL_CONFIGURATION");
  }
  return true;
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
  atAttestationStage({
    stage: "OPERATION_GUARD", substage: "ARGUMENT", reason: "OPERATION_NOT_AUTHORIZED",
  }, () => {
    if (dependencies.argument !== CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION) {
      throw new Error("EXACT_310006_PRE_ATTESTATION_ARGUMENT_REQUIRED");
    }
  });
  atAttestationStage({
    stage: "ENVIRONMENT_GUARD", substage: "INHERITED_PG_STATE",
    reason: "INHERITED_PG_STATE",
  }, () => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = atAttestationStage({
    stage: "REPOSITORY_GUARD", substage: "HEAD_READ",
    reason: "REPOSITORY_HEAD_READ_FAILED",
  }, () => git(["rev-parse", "HEAD"]).trim());
  const status = atAttestationStage({
    stage: "REPOSITORY_GUARD", substage: "WORKTREE_READ",
    reason: "WORKTREE_READ_FAILED",
  }, () => git(["status", "--short"]));
  atAttestationStage({
    stage: "REPOSITORY_GUARD", substage: "ATTESTATION", reason: "HEAD_MISMATCH",
  }, () => assertRepositoryAttestation({
    expectedHead: environment[
      PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD
    ],
    actualHead, status,
  }));
  atAttestationStage({
    stage: "AUTHORIZATION_GUARD", substage: "READ_ONLY_OPT_INS", reason: "OPT_IN_REQUIRED",
  }, () => assertProductionCanonicalRuntimeInstalledPreAttestationOptIns(environment));
  atAttestationStage({
    stage: "AUTHORIZATION_GUARD", substage: "DDL_CONFIGURATION",
    reason: "DDL_CONFIGURATION_REJECTED",
  }, () => assertProductionCanonicalRuntimeInstalledPreAttestationNoDdl(environment));
  const target = atAttestationStage({
    stage: "TARGET_GUARD", substage: "PRIVILEGED_READ_ONLY_TARGET", reason: "TARGET_MISMATCH",
  }, () => (dependencies.resolveTarget ?? resolveProductionManagedPostgresTarget)(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "310006 privileged read-only PRE attestation",
  }));
  atAttestationStage({
    stage: "TARGET_GUARD", substage: "SESSION_POOLER", reason: "TARGET_MISMATCH",
  }, () => (dependencies.assertTarget
    ?? assertCanonicalRuntimeInstalledSessionPoolerTarget)(target));
  const batch = atAttestationStage({
    stage: "SQL_BUILD", substage: "PRE_BATCH",
    query: CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID,
    reason: "LOCAL_PROGRAMMING_ERROR",
  }, () => (dependencies.buildBatch ?? buildCanonicalRuntimeInstalledPreBatch)());
  const results = atAttestationStage({
    stage: "PSQL_EXECUTION", substage: "PRE_BATCH",
    query: CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID,
  }, () => (dependencies.executeReadOnly
    ?? executeCanonicalRuntimeInstalledPreAttestationReadOnlyBatch)(
    batch,
    target.connectionEnvironment,
    { processEnvironment: environment, spawn: dependencies.spawn ?? spawnSync },
  ));
  atAttestationStage({
    stage: "RESULT_PARSE", substage: "PRE_RESULTS",
    query: CANONICAL_RUNTIME_INSTALLED_PRE_BATCH_QUERY_ID,
    reason: "QUERY_RESULT_SHAPE_MISMATCH",
  }, () => assertResultContainer(results));
  const classification = atAttestationStage({
    stage: "CLASSIFICATION", substage: "PRE_CONTRACT",
    query: CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
    reason: "PRE_CLASSIFICATION_FAILED",
  }, () => (dependencies.classify
    ?? classifyCanonicalRuntimeInstalledPreAttestation)(results));
  atAttestationStage({
    stage: "CLASSIFICATION", substage: "PRE_CONTRACT_RESULT",
    query: CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
    reason: "PRE_CLASSIFICATION_FAILED",
  }, () => {
    if (!classification || typeof classification !== "object") {
      throw new Error("PRE classifier returned an invalid result.");
    }
  });
  return {
    format: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_FORMAT,
    ...classification,
  };
}

function safeToken(value, fallback, pattern = /^[A-Z][A-Z0-9_]*$/) {
  const text = String(value ?? "");
  return pattern.test(text) ? text : fallback;
}

export function formatCanonicalRuntimeInstalledPreAttestationFailure(error) {
  const failure = classifyCanonicalRuntimeInstalledPreAttestationFailure(error, {
    stage: "OTHER", substage: "UNKNOWN", reason: "LOCAL_PROGRAMMING_ERROR",
  });
  const query = safeToken(failure.query, "NONE", /^[a-z][a-z0-9_]*$/);
  const reason = /^SQLSTATE_[0-9A-Z]{5}$/.test(failure.reason)
    ? failure.reason : safeFailureReasons.has(failure.reason)
      ? failure.reason : "LOCAL_PROGRAMMING_ERROR";
  return [
    "REFLAB_310006_PRE_ATTESTATION_FAIL",
    `stage=${safeToken(failure.stage, "OTHER")}`,
    `substage=${safeToken(failure.substage, "UNKNOWN")}`,
    `query=${query}`,
    `reason=${reason}`,
    `sqlstate=${safeToken(failure.sqlstate, "UNKNOWN", /^[0-9A-Z]{5}$/)}`,
    `psqlExitStatus=${failure.psqlExitStatus ?? "UNKNOWN"}`,
    `stderrClass=${safeToken(failure.stderrClass, "NOT_AVAILABLE")}`,
    "",
  ].join("\n");
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
    const serialized = atAttestationStage({
      stage: "OUTPUT_SERIALIZATION", substage: "JSON_STRINGIFY",
      reason: "JSON_PARSE_FAILED",
    }, () => `${(dependencies.serialize ?? JSON.stringify)(result, null, 2)}\n`);
    const writeStdout = dependencies.writeStdout ?? ((value) => process.stdout.write(value));
    atAttestationStage({
      stage: "OUTPUT_WRITE", substage: "STDOUT", reason: "LOCAL_PROGRAMMING_ERROR",
    }, () => writeStdout(serialized));
    return 0;
  } catch (error) {
    const writeStderr = dependencies.writeStderr ?? ((value) => process.stderr.write(value));
    writeStderr(formatCanonicalRuntimeInstalledPreAttestationFailure(error));
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionCanonicalRuntimeInstalledPreAttestationCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
