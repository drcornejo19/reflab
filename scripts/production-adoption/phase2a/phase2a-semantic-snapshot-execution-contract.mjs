import { buildSqlBatch, jsonQuery, semanticAuditSnapshotQuery } from "../../production-preflight/queries.mjs";
import { expandSemanticAuditSnapshot } from "../../production-preflight/semantic-audit.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase1ExamTrainingPostQuery } from "../bootstrap/phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS,
  classifyExamTrainingAfter310003,
  classifyPhase1PsychologyNotificationsPost,
  phase1PsychologyNotificationsMutationFingerprintQuery,
  phase1PsychologyNotificationsPostQuery,
} from "../bootstrap/phase1-psychology-notifications-ddl-contract.mjs";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "./phase2a-semantic-audit-ddl-contract.mjs";

export const PHASE2A_SIDECAR_ATTESTATION_FORMAT =
  "REFLAB_PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_V1";
export const PHASE2A_SIDECAR_ATTESTATION_OPERATION =
  "--production-phase2a-sidecar-privileged-attestation";
export const PHASE2A_SIDECAR_ATTESTATION_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION";
export const PHASE2A_SIDECAR_ATTESTATION_APPROVED_HEAD =
  "REFLAB_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION_APPROVED_HEAD";

export const SEMANTIC_AUDIT_CALLER_PROBE_FORMAT =
  "REFLAB_SEMANTIC_AUDIT_CALLER_CONTRACT_PROBE_V1";
export const SEMANTIC_AUDIT_CALLER_PROBE_OPERATION =
  "--production-semantic-audit-caller-contract-probe";
export const SEMANTIC_AUDIT_CALLER_PROBE_OPT_IN =
  "ALLOW_PRODUCTION_SEMANTIC_AUDIT_CALLER_PROBE";
export const SEMANTIC_AUDIT_CALLER_PROBE_APPROVED_HEAD =
  "REFLAB_PRODUCTION_SEMANTIC_AUDIT_CALLER_PROBE_APPROVED_HEAD";

export const SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION_EXACT";

// Pinned from reviewed REFLAB_SEMANTIC_AUDIT_CALLER_CONTRACT_PROBE_V1
// Production evidence for nagjddldrldwavmfaytc.
export const SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY = "on";

export const PHASE2A_SESSION_QUERY_ID = "phase2a_snapshot_session";
export const phase2aSnapshotSessionQuery = jsonQuery(
  PHASE2A_SESSION_QUERY_ID,
  `pg_catalog.json_build_object(
    'current_user', current_user,
    'session_user', session_user,
    'database', pg_catalog.current_database(),
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'default_transaction_read_only', pg_catalog.current_setting('default_transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer
  )`,
);

const guardedSemanticAuditSnapshotQuery = jsonQuery(
  semanticAuditSnapshotQuery.id,
  `case when current_user = 'reflab_prod_preflight_ro'
      and session_user = 'reflab_prod_preflight_ro'
      and pg_catalog.current_database() = 'postgres'
      and pg_catalog.current_setting('transaction_read_only') = 'on'
      and pg_catalog.current_setting('default_transaction_read_only') = 'on'
      and pg_catalog.current_setting('server_version_num')::integer / 10000 = 17
    then ${semanticAuditSnapshotQuery.payloadSql}
    else null::jsonb
  end`,
);

export const PHASE2A_SIDECAR_ATTESTATION_CHECK_COUNT =
  5 + PHASE2A_SEMANTIC_AUDIT_POST_CHECKS.length
  + PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS.length + 3;

export function assertStrictSessionPoolerTarget(target, expectedUsername) {
  const connection = target?.connectionEnvironment;
  if (target?.projectRef !== PRODUCTION_PROJECT_REF
      || target?.host !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGHOST !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGPORT !== "5432"
      || connection?.PGDATABASE !== "postgres"
      || connection?.PGUSER !== expectedUsername
      || connection?.PGSSLMODE !== "require") {
    throw new Error("Phase 2A snapshot operation requires the exact Session Pooler target.");
  }
  return target;
}

export function buildPhase2aSidecarAttestationBatch() {
  return buildSqlBatch([
    phase2aSnapshotSessionQuery,
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsMutationFingerprintQuery,
    phase1PsychologyNotificationsPostQuery,
    phase2aSemanticAuditPostQuery,
  ]);
}

export function buildSemanticAuditCallerProbeBatch() {
  return buildSqlBatch([phase2aSnapshotSessionQuery]);
}

export function buildSemanticAuditSnapshotSessionBatch() {
  return buildSqlBatch([phase2aSnapshotSessionQuery]);
}

export function buildSemanticAuditSnapshotInvocationBatch() {
  return buildSqlBatch([phase2aSnapshotSessionQuery, guardedSemanticAuditSnapshotQuery]);
}

function sessionShapeExact(payload) {
  return payload && typeof payload.current_user === "string"
    && typeof payload.session_user === "string"
    && typeof payload.database === "string"
    && typeof payload.transaction_read_only === "string"
    && typeof payload.default_transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num);
}

export function classifySession(payload, expectedCaller, expectedDefault) {
  if (!sessionShapeExact(payload)) return { classification: "UNKNOWN" };
  const transactionReadOnlyExact = payload.transaction_read_only === "on";
  const defaultTransactionReadOnlyObservable = payload.default_transaction_read_only === "on"
    || payload.default_transaction_read_only === "off";
  const defaultContractPinned = expectedDefault === "on" || expectedDefault === "off";
  const defaultTransactionReadOnlyExact = defaultContractPinned
    ? payload.default_transaction_read_only === expectedDefault
    : null;
  const exact = payload.current_user === expectedCaller
    && payload.session_user === expectedCaller
    && payload.database === "postgres"
    && transactionReadOnlyExact
    && defaultTransactionReadOnlyObservable
    && Math.trunc(payload.server_version_num / 10000) === 17
    && (!defaultContractPinned || defaultTransactionReadOnlyExact);
  return {
    classification: exact ? "EXACT" : "BLOCKER",
    currentUserExact: payload.current_user === expectedCaller,
    sessionUserExact: payload.session_user === expectedCaller,
    databaseExact: payload.database === "postgres",
    transactionReadOnlyExact,
    defaultTransactionReadOnlyObservable,
    defaultContractPinned,
    defaultTransactionReadOnlyExact,
    observedDefaultTransactionReadOnly: payload.default_transaction_read_only,
    postgresMajorExact: Math.trunc(payload.server_version_num / 10000) === 17,
  };
}

export function classifyPhase2aSidecarAttestation(results) {
  const session = classifySession(results.get(PHASE2A_SESSION_QUERY_ID), "postgres");
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(phase1ProductFingerprintQuery.id);
  const fingerprintExact = phase1HistoricalFingerprintExact(fingerprint);
  const examTraining = classifyExamTrainingAfter310003(
    results.get(phase1ExamTrainingPostQuery.id),
    { expectedTargetAclExact: false },
  );
  const mutationFingerprint = results.get(phase1PsychologyNotificationsMutationFingerprintQuery.id);
  const psychologyInstaller = installer.managedProfile === "READY"
      && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT"
    ? { ...installer, lifecycleState: "POST_BOOTSTRAP" }
    : installer;
  const psychology = classifyPhase1PsychologyNotificationsPost(
    results.get(phase1PsychologyNotificationsPostQuery.id),
    psychologyInstaller,
    fingerprint,
    fingerprint,
    mutationFingerprint,
    mutationFingerprint,
    examTraining,
    { expectedPhase310004Absent: false },
  );
  const sidecar = classifyPhase2aSemanticAuditPost(results.get(phase2aSemanticAuditPostQuery.id));
  const incomplete = session.classification === "UNKNOWN"
    || installer.managedProfile === "UNKNOWN"
    || psychology.postState === "UNKNOWN"
    || sidecar.postState === "UNKNOWN";
  const exact = session.classification === "EXACT"
    && installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT"
    && fingerprintExact
    && examTraining === "EXACT"
    && psychology.postState === "EXACT"
    && sidecar.postState === "EXACT";
  return {
    classification: incomplete
      ? "UNKNOWN"
      : exact ? "PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_EXACT" : "BLOCKER",
    checks: {
      sessionExact: session.classification === "EXACT",
      installerExact: installer.managedProfile === "READY"
        && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT",
      fingerprintExact,
      examTrainingExact: examTraining === "EXACT",
      psychologyExact: psychology.postState === "EXACT",
      sidecarExact: sidecar.postState === "EXACT",
    },
    counts: {
      attempts: fingerprint?.attempts ?? null,
      examResults: fingerprint?.exam_results ?? null,
      notificationEvents: fingerprint?.notification_events ?? null,
      policies: results.get(phase2aSemanticAuditPostQuery.id)?.counts?.policies ?? null,
      columnGrants: results.get(phase2aSemanticAuditPostQuery.id)?.counts?.column_grants ?? null,
      ledgerRows: results.get(phase2aSemanticAuditPostQuery.id)?.counts?.ledger_rows ?? null,
      schemaStateRows: results.get(phase2aSemanticAuditPostQuery.id)?.counts?.schema_state_rows ?? null,
    },
    expectedFingerprint: PHASE1_HISTORICAL_FINGERPRINT,
    session,
  };
}

export function classifyCallerProbe(results) {
  const session = classifySession(results.get(PHASE2A_SESSION_QUERY_ID), "reflab_prod_preflight_ro");
  return {
    ...session,
    classification: session.classification === "EXACT"
      ? "CALLER_DEFAULT_READ_ONLY_OBSERVED" : session.classification,
  };
}

export function classifySemanticAuditSnapshotSession(results) {
  const session = classifySession(
    results.get(PHASE2A_SESSION_QUERY_ID),
    "reflab_prod_preflight_ro",
    SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY,
  );
  return { classification: session.classification, session };
}

export function classifySemanticAuditSnapshotOutput(results) {
  const snapshot = results.get(semanticAuditSnapshotQuery.id);
  try {
    expandSemanticAuditSnapshot(snapshot);
  } catch {
    return { classification: "BLOCKER", snapshot: null };
  }
  return { classification: "PASS", snapshot };
}

export function classifySemanticAuditSnapshot(results) {
  const sessionDecision = classifySemanticAuditSnapshotSession(results);
  if (sessionDecision.classification !== "EXACT") return sessionDecision;
  const outputDecision = classifySemanticAuditSnapshotOutput(results);
  return { ...outputDecision, session: sessionDecision.session };
}

export const SNAPSHOT_FAILURE_STAGES = Object.freeze([
  "TARGET_GUARD",
  "REPOSITORY_GUARD",
  "SESSION_ATTESTATION",
  "SIDECAR_ATTESTATION",
  "SNAPSHOT_INVOCATION",
  "OUTPUT_CONTRACT",
  "SQL_BUILD",
  "PSQL_EXECUTION",
  "OUTPUT_SERIALIZATION",
  "ROLLBACK",
  "OTHER",
]);

const stageSet = new Set(SNAPSHOT_FAILURE_STAGES);

export class SnapshotGateFailure extends Error {
  constructor(stage, reason, { cause, rollback = "PASS" } = {}) {
    super(`${stage}:${reason}`, { cause });
    this.name = "SnapshotGateFailure";
    this.stage = stageSet.has(stage) ? stage : "OTHER";
    this.reason = /^[A-Z0-9_]{3,100}$/.test(reason ?? "") ? reason : "SAFE_DIAGNOSTIC_UNAVAILABLE";
    this.rollback = rollback === "PASS" || rollback === "BLOCKER" ? rollback : "BLOCKER";
  }
}

function sqlstate(error) {
  const explicit = String(error?.sqlstate ?? "").toUpperCase();
  if (/^[0-9A-Z]{5}$/.test(explicit)) return explicit;
  return String(error?.message ?? "").match(/(?:SQLSTATE[=_-]?|(?:ERROR|FATAL):\s+)([0-9A-Z]{5})/i)?.[1]?.toUpperCase();
}

export function asSnapshotGateFailure(stage, reason, error, rollback = "PASS") {
  if (error instanceof SnapshotGateFailure) return error;
  const observedSqlstate = sqlstate(error);
  return new SnapshotGateFailure(
    stage,
    observedSqlstate ? `SQLSTATE_${observedSqlstate}` : reason,
    { cause: error, rollback },
  );
}

export function atSnapshotStage(stage, reason, operation) {
  try {
    return operation();
  } catch (error) {
    throw asSnapshotGateFailure(stage, reason, error);
  }
}

export function executeSnapshotReadOnlyBatch(execute, sql, target, environment, stage) {
  try {
    return execute(sql, target.connectionEnvironment, { processEnvironment: environment });
  } catch (error) {
    const parseFailure = /invalid result frame|invalid envelope|payload_row_count|duplicate query result/i
      .test(String(error?.message ?? ""));
    throw asSnapshotGateFailure(
      parseFailure ? "OUTPUT_CONTRACT" : "PSQL_EXECUTION",
      parseFailure ? "RESULT_FRAME_REJECTED" : `${stage}_FAILED`,
      error,
    );
  }
}

export function formatSnapshotGateFailure(prefix, error) {
  const failure = error instanceof SnapshotGateFailure
    ? error
    : asSnapshotGateFailure("OTHER", "SAFE_DIAGNOSTIC_UNAVAILABLE", error);
  return `${prefix}:\nstage=${failure.stage}\nreason=${failure.reason}\nrollback=${failure.rollback}\n`;
}
