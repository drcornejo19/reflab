import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  assertPhase1ExamTrainingDdlArtifact,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS,
  assertPhase1PsychologyNotificationsArtifact,
  classifyExamTrainingPreState,
  phase1PsychologyNotificationsCatalogQuery,
  phase1PsychologyNotificationsDataAuditQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  assertPinnedArtifacts,
} from "./production-role-bootstrap-contract.mjs";
import {
  INSTALLER_IDENTITY_QUERY_ID,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_FORMAT =
  "REFLAB_PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_READ_ONLY_ATTESTATION_V1";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION =
  "--production-phase1-psychology-notifications-privileged-read-only-attestation";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN =
  "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF =
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL =
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD =
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD";

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_QUERY_IDS = Object.freeze([
  INSTALLER_IDENTITY_QUERY_ID,
  phase1ProductFingerprintQuery.id,
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID,
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_CHECKS = Object.freeze([
  "requiredTablesExist",
  "requiredTablesOwnedByPostgres",
  "postgresCanCreatePublic",
  "requiredColumnTypesExact",
  "futureFkTypeCompatibilityExact",
  "targetTableAbsent",
  "targetColumnAbsent",
  "targetIndexAbsent",
  "targetConstraintsAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_PROTECTED_CHECKS = Object.freeze([
  "priorStateVisibilityExact",
  "dataVisibilityExact",
  "psychologyDataCompatible",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "laterPhaseInfrastructureAbsent",
]);

export function assertPhase1PsychologyNotificationsPrivilegedArtifacts(repositoryRoot) {
  const psychologyNotifications = assertPhase1PsychologyNotificationsArtifact(repositoryRoot);
  const examTraining = assertPhase1ExamTrainingDdlArtifact(repositoryRoot);
  const roleBootstrap = assertPinnedArtifacts(repositoryRoot);
  return {
    psychologyNotifications: {
      path: psychologyNotifications.path,
      sha256: psychologyNotifications.sha256,
    },
    examTraining: {
      path: examTraining.path,
      sha256: examTraining.sha256,
    },
    roleBootstrap,
  };
}

export function buildPhase1PsychologyNotificationsPrivilegedBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsCatalogQuery,
  ]);
}

export function buildPhase1PsychologyNotificationsPrivilegedDataBatch() {
  return buildSqlBatch([phase1PsychologyNotificationsDataAuditQuery]);
}

export function shouldRunPhase1PsychologyNotificationsDataAudit(results) {
  const checks = results?.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID)?.checks;
  return checks?.requiredTablesExist === true
    && checks?.requiredColumnTypesExact === true
    && checks?.dataVisibilityExact === true;
}

function historicalFingerprintExact(fingerprint) {
  return Object.entries(PHASE1_HISTORICAL_FINGERPRINT).every(
    ([field, expected]) => fingerprint?.[field] === expected,
  );
}

export function classifyPhase1PsychologyNotificationsPrivilegedEntry(results, dataResults) {
  if (!(results instanceof Map) || (dataResults !== undefined && !(dataResults instanceof Map))) {
    return { classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE" };
  }
  const installerPayload = results.get(INSTALLER_IDENTITY_QUERY_ID);
  const fingerprint = results.get(phase1ProductFingerprintQuery.id);
  const examTrainingPayload = results.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID);
  const entryPayload = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID);
  const dataPayload = dataResults?.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID);
  const checks = entryPayload?.checks;
  const complete = Boolean(installerPayload) && Boolean(fingerprint)
    && Boolean(examTrainingPayload) && Boolean(entryPayload) && Boolean(checks)
    && PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS
      .filter((field) => field !== "psychologyDataCompatible")
      .every((field) => typeof checks[field] === "boolean")
    && typeof entryPayload.caller === "string"
    && typeof entryPayload.session_user === "string"
    && typeof entryPayload.transaction_read_only === "string"
    && Number.isInteger(entryPayload.server_version_num);
  if (!complete) {
    return { classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE" };
  }

  const installer = classifyInstallerIdentity(installerPayload);
  const callerExact = entryPayload.caller === "postgres"
    && entryPayload.session_user === "postgres"
    && installerPayload.caller === "postgres"
    && installerPayload.session_user === "postgres"
    && (dataPayload === undefined
      || (dataPayload.caller === "postgres" && dataPayload.session_user === "postgres"));
  const readOnlyExact = entryPayload.transaction_read_only === "on"
    && examTrainingPayload.transaction_read_only === "on"
    && (dataPayload === undefined || dataPayload.transaction_read_only === "on");
  const postgresMajorExact = Math.trunc(entryPayload.server_version_num / 10000) === 17
    && Math.trunc(examTrainingPayload.server_version_num / 10000) === 17;
  const installerExact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP";
  const catalogAttestation = PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_CHECKS.every(
    (field) => checks[field] === true,
  ) ? "PASS" : "BLOCKER";
  const protectedCatalogChecksExact = PHASE1_PSYCHOLOGY_NOTIFICATIONS_PROTECTED_CHECKS
    .filter((field) => field !== "psychologyDataCompatible")
    .every((field) => checks[field] === true);
  const dataAuditComplete = Boolean(dataPayload)
    && Number.isInteger(dataPayload.unsupported_module_slug_count);
  const psychologyDataCompatible = dataAuditComplete
    ? dataPayload.unsupported_module_slug_count === 0
    : null;
  const fingerprintExact = historicalFingerprintExact(fingerprint);
  const examTrainingState = classifyExamTrainingPreState(
    examTrainingPayload,
    fingerprint,
    checks.priorStateVisibilityExact,
  );
  const protectedStateAttestation = protectedCatalogChecksExact
    && psychologyDataCompatible === true
    && fingerprintExact
    && examTrainingState === "EXACT"
    ? "PASS"
    : catalogAttestation === "BLOCKER" || psychologyDataCompatible === false
      || !protectedCatalogChecksExact || !fingerprintExact || examTrainingState === "BLOCKER"
      ? "BLOCKER"
      : "UNKNOWN";
  const pass = callerExact && readOnlyExact && postgresMajorExact && installerExact
    && catalogAttestation === "PASS" && protectedStateAttestation === "PASS";

  if (!callerExact || !readOnlyExact || !postgresMajorExact || !installerExact
      || catalogAttestation === "BLOCKER" || protectedStateAttestation === "BLOCKER") {
    return {
      classification: "BLOCKER",
      nextAllowedRemoteOperation: "NONE",
      callerExact,
      readOnlyExact,
      postgresMajorExact,
      installerExact,
      catalogAttestation,
      protectedStateAttestation,
      examTrainingState,
      fingerprintExact,
      dataAuditComplete,
      checks: {
        ...Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
          (field) => [field, checks[field]],
        )),
        psychologyDataCompatible,
      },
    };
  }

  if (!dataAuditComplete || protectedStateAttestation === "UNKNOWN") {
    return {
      classification: "UNKNOWN",
      nextAllowedRemoteOperation: "NONE",
      callerExact,
      readOnlyExact,
      postgresMajorExact,
      installerExact,
      catalogAttestation,
      protectedStateAttestation,
      examTrainingState,
      fingerprintExact,
      dataAuditComplete,
      checks: {
        ...Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
          (field) => [field, checks[field]],
        )),
        psychologyDataCompatible,
      },
    };
  }

  return {
    classification: pass ? "PASS" : "BLOCKER",
    nextAllowedRemoteOperation: pass ? "310003_EXECUTION_REVIEW" : "NONE",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    installerExact,
    catalogAttestation,
    protectedStateAttestation,
    examTrainingState,
    fingerprintExact,
    dataAuditComplete,
    checks: {
      ...Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
        (field) => [field, checks[field]],
      )),
      psychologyDataCompatible,
    },
  };
}
