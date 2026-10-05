import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN, PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
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
  installerIdentityQuery,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  adminCanonicalAccessPostQuery,
} from "../phase2b/phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_COMMUNICATION_POST_QUERY_ID,
  canonicalCommunicationPostQuery,
} from "../phase2b/phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID,
  canonicalRuntimeInstalledPostQuery,
} from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  canonicalRuntimePrerequisitesPostQuery,
} from "../phase2b/phase2b-canonical-runtime-prerequisites-contract.mjs";
import { classifyCanonicalRuntimeInstalledEvidence } from "../phase2b/run-production-phase2b-canonical-runtime-installed.mjs";
import {
  IDENTITY_SECURITY_BRIDGE_PRE_CHECKS,
  IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
  assertIdentitySecurityBridgeArtifact,
  classifyIdentitySecurityBridgePreState,
  identitySecurityBridgePreQuery,
} from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_FORMAT =
  "REFLAB_20260901064236_CURRENT_PRODUCTION_PRE_ATTESTATION_V1";
export const IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPERATION =
  "--production-identity-security-bridge-pre-attestation";
export const IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN =
  "ALLOW_PRODUCTION_IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION";
export const IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID =
  "phase3_identity_security_bridge_pre_batch";

const safeFailureReasons = new Set([
  "AUTHENTICATION_FAILED", "CONNECTION_FAILED", "DATABASE_UNAVAILABLE",
  "DDL_CONFIGURATION_REJECTED", "HEAD_MISMATCH", "HOST_RESOLUTION_FAILED",
  "INHERITED_PG_STATE", "JSON_PARSE_FAILED", "LOCAL_PROGRAMMING_ERROR",
  "OPERATION_NOT_AUTHORIZED", "OPT_IN_REQUIRED", "OUTPUT_LIMIT_EXCEEDED",
  "PRE_CLASSIFICATION_FAILED", "PSQL_NOT_FOUND", "PSQL_PROCESS_FAILED",
  "QUERY_RESULT_SHAPE_MISMATCH", "READ_ONLY_GUARD_FAILED",
  "REPOSITORY_ARTIFACT_MISMATCH", "REPOSITORY_HEAD_READ_FAILED",
  "TARGET_MISMATCH", "TIMEOUT", "TLS_FAILED", "WORKTREE_DIRTY",
  "WORKTREE_READ_FAILED",
]);

const allowedProductionReadOnlyVariables = new Set([
  PREFLIGHT_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN,
]);

const requiredQueryIds = Object.freeze([
  INSTALLER_IDENTITY_QUERY_ID,
  phase1ProductFingerprintQuery.id,
  phase2aSemanticAuditPostQuery.id,
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  CANONICAL_COMMUNICATION_POST_QUERY_ID,
  CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID,
  IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
]);

const componentChecks = Object.freeze([
  "installerManagedProfileExact",
  "installerLifecycleExact",
  "historicalFingerprintPreservedExact",
  "phase2aPostExact",
  "canonicalJsonbTextPreservedExact",
  "adminCanonicalAccessPreservedExact",
  "communicationAndTrainingPreservedExact",
  "canonicalRuntimeInstalledExact",
  "predecessorCompositionExact",
  "identitySecurityBridgePreExact",
]);

const runtimeChecks = Object.freeze([
  "sessionExact", "historicalFingerprintsExact", "historicalProviderDataExact",
  "schemaStateEmpty", "canonicalMarkerAbsent", "developmentObjectsAbsent",
  "cutoverAbsent", "ledgerRelationExact", "ledgerTriggerExact", "noLaterLedgerPhase",
  "columnsExact", "constraintsExact", "guardFunctionExact", "ledgerAclExact",
  "schemaAclExact", "guardAclExact", "ledgerRowsExact",
]);

export const IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS = Object.freeze([
  ...componentChecks,
  ...runtimeChecks.map((name) => `runtime.${name}`),
  ...IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.map((name) => `identity.${name}`),
]);

export class IdentitySecurityBridgePreAttestationFailure extends Error {
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
  if (sqlstate) return { reason: `SQLSTATE_${sqlstate}`, sqlstate, stderrClass: "SQLSTATE_ERROR" };
  return { reason: "PSQL_PROCESS_FAILED", sqlstate: null,
    stderrClass: "UNCLASSIFIED_PROCESS_ERROR" };
}

export function classifyIdentitySecurityBridgePreAttestationFailure(
  error,
  context = {},
  processEvidence = {},
) {
  if (error instanceof IdentitySecurityBridgePreAttestationFailure) return error;
  const message = String(error?.message ?? error ?? "");
  const processText = [processEvidence.stderr, processEvidence.errorMessage, message]
    .filter(Boolean).join("\n");
  const details = {
    query: error?.query ?? context.query ?? "NONE",
    psqlExitStatus: Number.isInteger(error?.psqlExitStatus)
      ? error.psqlExitStatus : processEvidence.exitStatus,
  };
  if (error instanceof SyntaxError) {
    return new IdentitySecurityBridgePreAttestationFailure(
      context.stage ?? "RESULT_PARSE", context.substage ?? "JSON_RESULT",
      "JSON_PARSE_FAILED", details,
    );
  }
  if (/invalid result frame|expected a Map/i.test(message)) {
    return new IdentitySecurityBridgePreAttestationFailure(
      "RESULT_PARSE", context.substage ?? "QUERY_RESULTS",
      "QUERY_RESULT_SHAPE_MISMATCH", details,
    );
  }
  if (/transaction_read_only was not confirmed as on/i.test(message)) {
    return new IdentitySecurityBridgePreAttestationFailure(
      "READ_ONLY_GUARD", "TRANSACTION_READ_ONLY", "READ_ONLY_GUARD_FAILED", details,
    );
  }
  if (context.stage === "PSQL_EXECUTION" || processEvidence.spawnAttempted) {
    const classified = classifyProcessText(processText, processEvidence);
    return new IdentitySecurityBridgePreAttestationFailure(
      "PSQL_EXECUTION", context.substage ?? "PRE_BATCH", classified.reason,
      { ...details, sqlstate: classified.sqlstate, stderrClass: classified.stderrClass },
    );
  }
  const reason = [
    [/exact .*argument/i, "OPERATION_NOT_AUTHORIZED"],
    [/inherited PostgreSQL/i, "INHERITED_PG_STATE"],
    [/clean worktree/i, "WORKTREE_DIRTY"],
    [/HEAD attestation/i, "HEAD_MISMATCH"],
    [/artifact hash mismatch/i, "REPOSITORY_ARTIFACT_MISMATCH"],
    [/REJECTS_DDL_CONFIGURATION/i, "DDL_CONFIGURATION_REJECTED"],
    [/NOT_AUTHORIZED|explicit read-only opt-in/i, "OPT_IN_REQUIRED"],
    [/TARGET_REJECTED|project reference|target is not the exact allowlisted host|database URL is invalid/i,
      "TARGET_MISMATCH"],
  ].find(([pattern]) => pattern.test(message))?.[1]
    ?? context.reason ?? "LOCAL_PROGRAMMING_ERROR";
  return new IdentitySecurityBridgePreAttestationFailure(
    context.stage ?? "OTHER", context.substage ?? "UNKNOWN", reason, details,
  );
}

function atStage(context, operation) {
  try {
    return operation();
  } catch (error) {
    throw classifyIdentitySecurityBridgePreAttestationFailure(error, context);
  }
}

export function buildIdentitySecurityBridgePreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    canonicalCommunicationPostQuery,
    canonicalRuntimeInstalledPostQuery,
    identitySecurityBridgePreQuery,
  ]);
}

export function executeIdentitySecurityBridgePreReadOnlyBatch(
  sql,
  connectionEnvironment,
  { processEnvironment = process.env, spawn = spawnSync } = {},
) {
  const evidence = { spawnAttempted: false, exitStatus: null, errorCode: null,
    errorMessage: null, stderr: null };
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
      processEnvironment, spawn: observingSpawn,
    });
  } catch (error) {
    throw classifyIdentitySecurityBridgePreAttestationFailure(error, {
      stage: "PSQL_EXECUTION", substage: "PRE_BATCH",
      query: IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID,
    }, evidence);
  }
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function exactLabel(value) {
  return value === true ? "EXACT" : value === false ? "BLOCKER" : "UNKNOWN";
}

function unknownReport() {
  const checks = Object.fromEntries(
    IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS.map((name) => [name, null]),
  );
  return {
    classification: "UNKNOWN",
    checkCount: IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS.length,
    checks,
    failedChecks: [],
    unknownChecks: [...IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS],
    adoptionState: { classification: "UNKNOWN", ledgerRows: null, finalPhaseOrder: null,
      finalPhaseKey: null, schemaStateRows: null, runtime: "UNKNOWN", cutover: "UNKNOWN" },
    predecessorState: { classification: "UNKNOWN" },
    identitySecurityState: { classification: "UNKNOWN" },
    securityState: { classification: "UNKNOWN" },
    historicalState: { classification: "UNKNOWN", evidenceRole: "SHARED_PRESERVATION_EVIDENCE" },
  };
}

export function classifyIdentitySecurityBridgePreAttestation(results, dependencies = {}) {
  if (!(results instanceof Map)
      || requiredQueryIds.some((id) => !results.has(id) || !results.get(id)
        || typeof results.get(id) !== "object")) return unknownReport();
  let predecessor;
  let identity;
  try {
    predecessor = (dependencies.classifyPredecessor
      ?? classifyCanonicalRuntimeInstalledEvidence)(results, { post: true });
    identity = (dependencies.classifyIdentity
      ?? classifyIdentitySecurityBridgePreState)(results.get(IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID));
  } catch {
    return unknownReport();
  }
  const runtimePayload = results.get(CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID);
  const identityPayload = results.get(IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID);
  const checks = {
    installerManagedProfileExact: predecessor.installer?.managedProfile === "READY" ? true
      : predecessor.installer?.managedProfile === "UNKNOWN" ? null : false,
    installerLifecycleExact:
      predecessor.installer?.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT" ? true
        : predecessor.installer?.lifecycleState === "UNKNOWN" ? null : false,
    historicalFingerprintPreservedExact: booleanOrNull(predecessor.historicalFingerprintExact),
    phase2aPostExact: predecessor.phase2a?.postState === "EXACT" ? true
      : predecessor.phase2a?.postState === "UNKNOWN" ? null : false,
    canonicalJsonbTextPreservedExact: predecessor.helper?.classification === "EXACT" ? true
      : predecessor.helper?.classification === "UNKNOWN" ? null : false,
    adminCanonicalAccessPreservedExact: predecessor.admin?.classification === "EXACT" ? true
      : predecessor.admin?.classification === "UNKNOWN" ? null : false,
    communicationAndTrainingPreservedExact:
      predecessor.communication?.classification === "EXACT" ? true
        : predecessor.communication?.classification === "UNKNOWN" ? null : false,
    canonicalRuntimeInstalledExact:
      predecessor.runtimeInstalled?.classification === "EXACT" ? true
        : predecessor.runtimeInstalled?.classification === "UNKNOWN" ? null : false,
    predecessorCompositionExact: predecessor.composition?.classification === "EXACT" ? true
      : predecessor.composition?.classification === "UNKNOWN" ? null : false,
    identitySecurityBridgePreExact: identity.classification === "EXACT_EXPECTED_PRE_STATE" ? true
      : identity.classification === "UNKNOWN" ? null : false,
  };
  for (const name of runtimeChecks) {
    checks[`runtime.${name}`] = booleanOrNull(predecessor.runtimeInstalled?.checks?.[name]);
  }
  for (const name of IDENTITY_SECURITY_BRIDGE_PRE_CHECKS) {
    checks[`identity.${name}`] = booleanOrNull(identity.checks?.[name]);
  }
  const failedChecks = IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS
    .filter((name) => checks[name] === false);
  const unknownChecks = IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS
    .filter((name) => checks[name] === null);
  const classification = failedChecks.length > 0
    ? "BLOCKER" : unknownChecks.length > 0 ? "UNKNOWN" : "64236_PRE_EXACT";
  const ledgerRows = Array.isArray(runtimePayload.ledger_rows) ? runtimePayload.ledger_rows : [];
  const finalLedgerRow = ledgerRows.at(-1);
  const counts = runtimePayload.counts ?? {};
  const output = {
    classification,
    checkCount: IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS.length,
    checks,
    failedChecks,
    unknownChecks,
    adoptionState: {
      classification: exactLabel(checks.canonicalRuntimeInstalledExact),
      ledgerRows: Number.isInteger(counts.ledger_rows) ? counts.ledger_rows : null,
      finalPhaseOrder: Number.isInteger(finalLedgerRow?.phase_order)
        ? finalLedgerRow.phase_order : null,
      finalPhaseKey: typeof finalLedgerRow?.phase_key === "string"
        ? finalLedgerRow.phase_key : null,
      schemaStateRows: Number.isInteger(counts.schema_state_rows)
        ? counts.schema_state_rows : null,
      runtime: counts.schema_state_rows === 0
        && checks["runtime.canonicalMarkerAbsent"] === true ? "DISABLED" : "UNKNOWN",
      cutover: checks["runtime.cutoverAbsent"] === true ? "ABSENT" : "UNKNOWN",
      phase4Providers: checks["identity.canonicalIdentityFunctionsAbsent"] === true
        ? "ABSENT" : "PRESENT_OR_DRIFTED",
    },
    predecessorState: {
      classification: exactLabel(checks.predecessorCompositionExact),
      phase2a: exactLabel(checks.phase2aPostExact),
      canonicalRuntimePrerequisites310005: exactLabel(checks.canonicalJsonbTextPreservedExact),
      adminCanonicalAccess202608110001: exactLabel(checks.adminCanonicalAccessPreservedExact),
      trainingAndCommunication: exactLabel(checks.communicationAndTrainingPreservedExact),
      canonicalObjects310006: exactLabel(checks.canonicalRuntimeInstalledExact),
    },
    identitySecurityState: {
      classification: identity.classification,
      legacyHelpers: identityPayload.legacy_helpers,
      legacyHelperAcl: identityPayload.legacy_helper_acl,
      directIdentityReaders: identityPayload.direct_identity_readers,
      canonicalFunctions: identityPayload.canonical_functions,
      developmentIdentityObjectsPresent: identityPayload.developmentIdentityObjectsPresent,
      roleMemberships: identityPayload.roleMemberships,
    },
    securityState: {
      classification: exactLabel(checks.identitySecurityBridgePreExact),
      wrapperAclExact: checks["identity.legacyHelperAclsExact"],
      canonicalFunctionsAbsent: checks["identity.canonicalIdentityFunctionsAbsent"],
      unexpectedBrowserExecuteAbsent: checks["identity.legacyHelperAclsExact"],
      serviceRoleAccessExact: checks["identity.legacyHelperAclsExact"],
      rlsOwnerCreateAbsent: checks["identity.rlsOwnerCreateAbsent"],
      browserSchemaCreateAbsent: checks["identity.browserSchemaCreateAbsent"],
    },
    historicalState: {
      classification: exactLabel(checks.historicalFingerprintPreservedExact),
      evidenceRole: "SHARED_PRESERVATION_EVIDENCE",
      attempts: Number.isInteger(counts.attempts) ? counts.attempts : null,
      examResults: Number.isInteger(counts.exam_results) ? counts.exam_results : null,
      notificationEvents: Number.isInteger(counts.notification_events)
        ? counts.notification_events : null,
      clips: Number.isInteger(counts.clips) ? counts.clips : null,
    },
  };
  if (classification === "64236_PRE_EXACT") {
    output.PRODUCTION_64236_PRE_STATE = "CURRENTLY_ATTESTED_EXACT";
  }
  return output;
}

function assertReadOnlyOptIns(environment) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN] !== "true") {
    throw new Error("64236_PRE_ATTESTATION_NOT_AUTHORIZED");
  }
}

function assertNoWriteConfiguration(environment) {
  const forbidden = Object.keys(environment).find((name) =>
    name.startsWith("REFLAB_PRODUCTION_DDL_")
      || (name.startsWith("ALLOW_PRODUCTION_")
        && !allowedProductionReadOnlyVariables.has(name)));
  if (forbidden) throw new Error("64236_PRE_ATTESTATION_REJECTS_DDL_CONFIGURATION");
}

export function assertIdentitySecurityBridgeSessionPoolerTarget(target) {
  const connection = target?.connectionEnvironment;
  if (target?.projectRef !== PRODUCTION_PROJECT_REF
      || target?.host !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGHOST !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGPORT !== "5432" || connection?.PGDATABASE !== "postgres"
      || connection?.PGUSER !== `postgres.${PRODUCTION_PROJECT_REF}`
      || connection?.PGSSLMODE !== "require") {
    throw new Error("20260901064236_TARGET_REJECTED");
  }
  return target;
}

export function authorizeProductionIdentitySecurityBridgePreAttestationTarget(
  environment = process.env,
) {
  assertReadOnlyOptIns(environment);
  assertNoWriteConfiguration(environment);
  return assertIdentitySecurityBridgeSessionPoolerTarget(resolveProductionManagedPostgresTarget(
    environment,
    {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "64236 privileged read-only PRE attestation",
    },
  ));
}

export function runProductionIdentitySecurityBridgePreAttestation(
  environment = process.env,
  dependencies = {},
) {
  atStage({ stage: "OPERATION_GUARD", substage: "ARGUMENT",
    reason: "OPERATION_NOT_AUTHORIZED" }, () => {
    if (dependencies.argument !== IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPERATION) {
      throw new Error("EXACT_64236_PRE_ATTESTATION_ARGUMENT_REQUIRED");
    }
  });
  atStage({ stage: "ENVIRONMENT_GUARD", substage: "INHERITED_PG_STATE",
    reason: "INHERITED_PG_STATE" }, () => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = atStage({ stage: "REPOSITORY_GUARD", substage: "HEAD_READ",
    reason: "REPOSITORY_HEAD_READ_FAILED" }, () => git(["rev-parse", "HEAD"]).trim());
  const status = atStage({ stage: "REPOSITORY_GUARD", substage: "WORKTREE_READ",
    reason: "WORKTREE_READ_FAILED" }, () => git(["status", "--short"]));
  atStage({ stage: "REPOSITORY_GUARD", substage: "ATTESTATION",
    reason: "HEAD_MISMATCH" }, () => assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead, status,
  }));
  atStage({ stage: "REPOSITORY_GUARD", substage: "ARTIFACT_HASH",
    reason: "REPOSITORY_ARTIFACT_MISMATCH" }, () =>
    (dependencies.assertArtifact ?? assertIdentitySecurityBridgeArtifact)(root));
  atStage({ stage: "AUTHORIZATION_GUARD", substage: "READ_ONLY_OPT_INS",
    reason: "OPT_IN_REQUIRED" }, () => assertReadOnlyOptIns(environment));
  atStage({ stage: "AUTHORIZATION_GUARD", substage: "DDL_CONFIGURATION",
    reason: "DDL_CONFIGURATION_REJECTED" }, () => assertNoWriteConfiguration(environment));
  const target = atStage({ stage: "TARGET_GUARD", substage: "PRIVILEGED_READ_ONLY_TARGET",
    reason: "TARGET_MISMATCH" }, () => (dependencies.resolveTarget
    ?? resolveProductionManagedPostgresTarget)(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "64236 privileged read-only PRE attestation",
  }));
  atStage({ stage: "TARGET_GUARD", substage: "SESSION_POOLER",
    reason: "TARGET_MISMATCH" }, () => (dependencies.assertTarget
    ?? assertIdentitySecurityBridgeSessionPoolerTarget)(target));
  const batch = atStage({ stage: "SQL_BUILD", substage: "PRE_BATCH",
    query: IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID,
    reason: "LOCAL_PROGRAMMING_ERROR" }, () =>
    (dependencies.buildBatch ?? buildIdentitySecurityBridgePreBatch)());
  const results = atStage({ stage: "PSQL_EXECUTION", substage: "PRE_BATCH",
    query: IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID }, () =>
    (dependencies.executeReadOnly ?? executeIdentitySecurityBridgePreReadOnlyBatch)(
      batch, target.connectionEnvironment,
      { processEnvironment: environment, spawn: dependencies.spawn ?? spawnSync },
    ));
  atStage({ stage: "RESULT_PARSE", substage: "PRE_RESULTS",
    query: IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID,
    reason: "QUERY_RESULT_SHAPE_MISMATCH" }, () => {
    if (!(results instanceof Map)) throw new Error("Expected a Map of framed query results.");
  });
  const classification = atStage({ stage: "CLASSIFICATION", substage: "PRE_CONTRACT",
    query: IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
    reason: "PRE_CLASSIFICATION_FAILED" }, () =>
    (dependencies.classify ?? classifyIdentitySecurityBridgePreAttestation)(results));
  atStage({ stage: "CLASSIFICATION", substage: "PRE_CONTRACT_RESULT",
    query: IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
    reason: "PRE_CLASSIFICATION_FAILED" }, () => {
    if (!classification || typeof classification !== "object") {
      throw new Error("PRE classifier returned an invalid result.");
    }
  });
  return { format: IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_FORMAT, ...classification };
}

function safeToken(value, fallback, pattern = /^[A-Z][A-Z0-9_]*$/) {
  const text = String(value ?? "");
  return pattern.test(text) ? text : fallback;
}

export function formatIdentitySecurityBridgePreAttestationFailure(error) {
  const failure = classifyIdentitySecurityBridgePreAttestationFailure(error, {
    stage: "OTHER", substage: "UNKNOWN", reason: "LOCAL_PROGRAMMING_ERROR",
  });
  const reason = /^SQLSTATE_[0-9A-Z]{5}$/.test(failure.reason)
    ? failure.reason : safeFailureReasons.has(failure.reason)
      ? failure.reason : "LOCAL_PROGRAMMING_ERROR";
  return [
    "REFLAB_64236_PRE_ATTESTATION_FAIL",
    `stage=${safeToken(failure.stage, "OTHER")}`,
    `substage=${safeToken(failure.substage, "UNKNOWN")}`,
    `query=${safeToken(failure.query, "NONE", /^[a-z][a-z0-9_]*$/)}`,
    `reason=${reason}`,
    `sqlstate=${safeToken(failure.sqlstate, "UNKNOWN", /^[0-9A-Z]{5}$/)}`,
    `psqlExitStatus=${failure.psqlExitStatus ?? "UNKNOWN"}`,
    `stderrClass=${safeToken(failure.stderrClass, "NOT_AVAILABLE")}`,
    "",
  ].join("\n");
}

export async function runProductionIdentitySecurityBridgePreAttestationCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run
      ?? runProductionIdentitySecurityBridgePreAttestation)(environment, {
      ...dependencies, argument,
    });
    const serialized = atStage({ stage: "OUTPUT_SERIALIZATION", substage: "JSON_STRINGIFY",
      reason: "JSON_PARSE_FAILED" }, () =>
      `${(dependencies.serialize ?? JSON.stringify)(result, null, 2)}\n`);
    atStage({ stage: "OUTPUT_WRITE", substage: "STDOUT",
      reason: "LOCAL_PROGRAMMING_ERROR" }, () =>
    (dependencies.writeStdout ?? ((value) => process.stdout.write(value)))(serialized));
    return 0;
  } catch (error) {
    (dependencies.writeStderr ?? ((value) => process.stderr.write(value)))(
      formatIdentitySecurityBridgePreAttestationFailure(error),
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionIdentitySecurityBridgePreAttestationCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
