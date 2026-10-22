import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE4B_WAVE5_CATALOG = JSON.parse(readFileSync(resolve(
  dirname(fileURLToPath(import.meta.url)),
  "phase4b-wave5-effective-canonical-catalog-pg18.json",
), "utf8"));

export const PHASE4B_WAVE5_GATE = "scripts/production-adoption/phase4/phase4b-wave5-gate.sql";
export const PHASE4B_WAVE5_CUTOVER_CHECK = "public.attempts.attempts_exam_source_check";
export const PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS = Object.freeze({ checks: 297, foreignKeys: 61 });
export const PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS = Object.freeze([
  "public.institutional_clips.institutional_clips_sport_type_check",
  "public.institutions.institutions_plan_key_check",
  "public.user_profiles.user_profiles_subscription_plan_check",
]);
export const PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS = Object.freeze([
  "public.appointments.appointments_association_fk",
  "public.appointments.appointments_competition_fk",
  "public.appointments.appointments_institution_fk",
  "public.appointments.appointments_replacement_fk",
  "public.appointments.appointments_role_fk",
  "public.attempts.attempts_assessment_session_fk",
  "public.attempts.attempts_group_fk",
  "public.attempts.attempts_institution_fk",
  "public.capability_overrides.capability_overrides_capability_fk",
  "public.competition_categories.competition_categories_season_fk",
  "public.exam_results.exam_results_assessment_session_fk",
  "public.exam_results.exam_results_group_fk",
  "public.exam_results.exam_results_institution_fk",
  "public.fixtures.fixtures_association_fk",
  "public.fixtures.fixtures_away_team_fk",
  "public.fixtures.fixtures_category_fk",
  "public.fixtures.fixtures_competition_fk",
  "public.fixtures.fixtures_home_team_fk",
  "public.fixtures.fixtures_season_fk",
  "public.fixtures.fixtures_venue_fk",
  "public.institution_assessment_assignments.institution_assessment_assignments_assessment_fk",
  "public.institution_assessment_assignments.institution_assessment_assignments_group_fk",
  "public.institution_assessment_feedback.institution_assessment_feedback_session_fk",
  "public.institution_assessment_history.institution_assessment_history_assessment_fk",
  "public.institution_assessment_items.institution_assessment_items_assessment_fk",
  "public.institution_assessment_sessions.institution_assessment_sessions_assessment_fk",
  "public.institution_assessment_sessions.institution_assessment_sessions_assignment_fk",
  "public.institution_assessment_sessions.institution_assessment_sessions_group_fk",
  "public.institution_audit_logs.institution_audit_logs_membership_fk",
  "public.institution_content_assignments.institution_content_assignments_content_fk",
  "public.institution_content_assignments.institution_content_assignments_group_fk",
  "public.institution_data_consents.institution_data_consents_membership_fk",
  "public.institution_group_memberships.institution_group_memberships_group_fk",
  "public.institution_group_memberships.institution_group_memberships_membership_fk",
  "public.institution_groups.institution_groups_cohort_fk",
  "public.institution_membership_permission_overrides.institution_permission_overrides_membership_fk",
  "public.institution_membership_permission_overrides.institution_permission_overrides_permission_fk",
  "public.institution_membership_roles.institution_membership_roles_membership_fk",
  "public.institution_membership_roles.institution_membership_roles_role_fk",
  "public.institution_notification_recipients.institution_notification_recipients_campaign_fk",
  "public.institution_role_permissions.institution_role_permissions_permission_fk",
  "public.institution_role_permissions.institution_role_permissions_role_fk",
  "public.institution_subscriptions.institution_subscriptions_plan_fk",
  "public.match_officials.match_officials_appointment_fk",
  "public.match_officials.match_officials_role_fk",
  "public.notification_events.notification_events_fixture_fk",
  "public.performance_checkins.performance_checkins_fixture_fk",
  "public.performance_sessions.performance_sessions_appointment_fk",
  "public.performance_sessions.performance_sessions_fixture_fk",
  "public.plan_capabilities.plan_capabilities_capability_fk",
  "public.psychology_checkins.psychology_checkins_appointment_fk",
  "public.psychology_checkins.psychology_checkins_fixture_fk",
  "public.psychology_exercise_sessions.psychology_exercise_appointment_fk",
  "public.psychology_exercise_sessions.psychology_exercise_fixture_fk",
  "public.readiness_scores.readiness_scores_appointment_fk",
  "public.readiness_scores.readiness_scores_fixture_fk",
  "public.referee_eligibility.referee_eligibility_association_fk",
  "public.referee_eligibility.referee_eligibility_category_fk",
  "public.referee_eligibility.referee_eligibility_competition_fk",
  "public.referee_eligibility.referee_eligibility_country_fk",
  "public.referee_eligibility.referee_eligibility_role_fk",
  "public.referee_exam_sessions.referee_exam_sessions_assessment_session_fk",
  "public.referee_exam_sessions.referee_exam_sessions_group_fk",
  "public.teams.teams_association_fk",
  "public.user_profiles.user_profiles_institution_fk",
  "public.venues.venues_association_fk",
  "public.wellness_logs.wellness_logs_appointment_fk",
  "public.wellness_logs.wellness_logs_fixture_fk",
]);
export const PHASE4B_WAVE5_DATA_EVIDENCE = Object.freeze({
  SYNTHETIC_FIXTURE: "SYNTHETIC_FIXTURE",
  REVIEWED_HISTORICAL: "REVIEWED_HISTORICAL",
  PRIVILEGED_PRODUCTION: "PRIVILEGED_PRODUCTION",
  NONE: "NONE",
});
const WAVE5_DATA_EVIDENCE_VALUES = Object.freeze(Object.values(PHASE4B_WAVE5_DATA_EVIDENCE));
const WAVE5_AUTHORITATIVE_DATA_EVIDENCE = new Set([
  PHASE4B_WAVE5_DATA_EVIDENCE.REVIEWED_HISTORICAL,
  PHASE4B_WAVE5_DATA_EVIDENCE.PRIVILEGED_PRODUCTION,
]);
export const PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE = Object.freeze({
  identity: "public.notification_events.notification_events_status_check",
  dataEvidence: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
  fixtureProvider: "scripts/production-adoption/phase2b/phase2b-production-fixture.sql",
  fixtureStatus: "pending",
  canonicalStatuses: Object.freeze(["queued", "sent", "failed", "skipped"]),
  productionEvidenceAvailable: false,
  classification: "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
});
export const PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION = Object.freeze({
  identity: "public.exam_results.exam_results_payload_hash_check",
  provider: "202608310002_production_adoption_exam_training_prerequisites.sql",
  catalogExpression: "((payload_hash IS NULL) OR (payload_hash ~ '^[0-9a-f]{64}$'::text))",
  expressionHash: "3c5a5b63b9d1d77d0d66cb4084cd73f95768627e9d21eaafeabe898e952bc241",
  referencedColumns: Object.freeze(["payload_hash"]),
  requiredNullableColumns: Object.freeze(["payload_hash", "exam_session_id"]),
  validated: true,
  noInherit: false,
});

function isExamPayloadHashCheck(entry) {
  return entry.schema === "public" && entry.table === "exam_results"
    && (entry.catalogConstraintName ?? entry.constraintName) === "exam_results_payload_hash_check";
}

export function canonicalCheckIdentityKey(entry) {
  const constraintName = entry.catalogConstraintName ?? entry.constraintName;
  if (!entry.schema || !entry.table || !constraintName) throw new Error("Wave 5 CHECK identity is incomplete.");
  return `${entry.schema}.${entry.table}.${constraintName}`;
}

export function canonicalForeignKeyIdentityKey(entry) {
  const schema = entry.schema ?? entry.sourceSchema;
  const table = entry.table ?? entry.sourceTable;
  const sourceColumns = entry.sourceColumns ?? [];
  const targetSchema = entry.targetSchema;
  const targetTable = entry.targetTable;
  const targetColumns = entry.targetColumns ?? [];
  if (!schema || !table || !entry.constraintName || sourceColumns.length === 0
      || !targetSchema || !targetTable || sourceColumns.length !== targetColumns.length) {
    throw new Error("Wave 5 FK identity is incomplete.");
  }
  return `${schema}.${table}.${entry.constraintName}|${sourceColumns.join(",")}->${targetSchema}.${targetTable}(${targetColumns.join(",")})`;
}

function checkIdentity(entry) {
  if (entry.manifestName) return `${entry.schema}.${entry.table}.${entry.manifestName}`;
  return [entry.schema, entry.table, entry.referencedColumns.join(","), entry.expressionHash,
    entry.validated ? "validated" : "not_valid", entry.noInherit ? "no_inherit" : "inheritable"].join("|");
}

export function normalizeCheckExpression(value) {
  let normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.startsWith("check")) normalized = normalized.slice(5).trim();
  return normalized;
}

export const PHASE4B_WAVE5_CHECKS = Object.freeze(PHASE4B_WAVE5_CATALOG.checks.map((catalog) => {
  const identity = checkIdentity(catalog);
  return Object.freeze({
  identity,
  stableIdentity: canonicalCheckIdentityKey(catalog),
  schema: catalog.schema,
  table: catalog.table,
  qualifiedTable: `${catalog.schema}.${catalog.table}`,
  constraintName: catalog.manifestName,
  catalogConstraintName: catalog.constraintName,
  expression: catalog.catalogExpression,
  constraintDefinition: catalog.constraintDefinition,
  expressionHash: catalog.expressionHash,
  normalizedExpression: normalizeCheckExpression(catalog.catalogExpression),
  referencedColumns: Object.freeze([...catalog.referencedColumns]),
  validated: catalog.validated,
  noInherit: catalog.noInherit,
  providerHistory: Object.freeze([...catalog.providerHistory]),
  provider: catalog.finalProvider,
  transitionalState: isExamPayloadHashCheck({ ...catalog, catalogConstraintName: catalog.constraintName })
    ? PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION
    : null,
  dataEvidence: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
  writeImpact: "ENFORCED_ON_NEW_WRITES",
  classification: catalog.schema === "public" && catalog.table === "attempts" && catalog.constraintName === "attempts_exam_source_check"
    ? "CUTOVER_ONLY"
    : "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  });
}));

export const PHASE4B_WAVE5_FOREIGN_KEYS = Object.freeze(PHASE4B_WAVE5_CATALOG.foreignKeys.map((catalog) => {
  return Object.freeze({
  identity: `${catalog.sourceSchema}.${catalog.sourceTable}.${catalog.constraintName}`,
  stableIdentity: canonicalForeignKeyIdentityKey(catalog),
  schema: catalog.sourceSchema,
  table: catalog.sourceTable,
  qualifiedTable: `${catalog.sourceSchema}.${catalog.sourceTable}`,
  constraintName: catalog.constraintName,
  sourceColumns: Object.freeze([...catalog.sourceColumns]),
  targetSchema: catalog.targetSchema,
  targetTable: catalog.targetTable,
  qualifiedTarget: `${catalog.targetSchema}.${catalog.targetTable}`,
  targetColumns: Object.freeze([...catalog.targetColumns]),
  matchType: catalog.matchType,
  onUpdate: catalog.onUpdate,
  onDelete: catalog.onDelete,
  deferrable: catalog.deferrable,
  initiallyDeferred: catalog.initiallyDeferred,
  validated: catalog.validated,
  structuralHash: catalog.structuralHash,
  providerHistory: Object.freeze([...catalog.providerHistory]),
  provider: catalog.finalProvider,
  dataEvidence: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
  writeImpact: "ENFORCED_ON_NEW_WRITES",
  classification: "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  });
}));

const canonicalCheckIdentityCount = new Set(PHASE4B_WAVE5_CHECKS.map((entry) => entry.stableIdentity)).size;
const canonicalForeignKeyIdentityCount = new Set(PHASE4B_WAVE5_FOREIGN_KEYS.map((entry) => entry.stableIdentity)).size;
const incrementalCheckAdditions = PHASE4B_WAVE5_CHECKS.filter((entry) =>
  entry.providerHistory.length === 1 && entry.provider !== "202607270000_reflab_canonical_baseline.sql");
const evolvedCheckProviders = PHASE4B_WAVE5_CHECKS.filter((entry) => entry.providerHistory.length > 1);

export const PHASE4B_WAVE5_CARDINALITY_RECONCILIATION = Object.freeze({
  classificationUniverse: "EFFECTIVE_CANONICAL_IDENTITIES",
  canonicalIdentities: Object.freeze({
    checks: canonicalCheckIdentityCount,
    foreignKeys: canonicalForeignKeyIdentityCount,
  }),
  canonicalBaselinePhysicalIdentities: Object.freeze({
    checks: PHASE4B_WAVE5_CATALOG.baselineExtractionCoverage.checks.physical,
    foreignKeys: PHASE4B_WAVE5_CATALOG.baselineExtractionCoverage.foreignKeys.physical,
  }),
  phase4aReportedIdentities: PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS,
  recoveredExtractorOmissions: Object.freeze({
    classification: "REPORTING_BUG",
    checks: PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS,
    foreignKeys: PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS,
  }),
  canonicalIncrementalAdditions: Object.freeze({
    classification: "GENUINELY_NEW_CANONICAL_IDENTITY",
    checks: Object.freeze(incrementalCheckAdditions.map((entry) => entry.stableIdentity)),
    foreignKeys: Object.freeze([]),
  }),
  providerEvolutions: Object.freeze({
    classification: "PROVIDER_VARIANT",
    checks: Object.freeze(evolvedCheckProviders.map((entry) => entry.stableIdentity)),
    foreignKeys: Object.freeze([]),
  }),
  adoptionTransitionalRepresentations: Object.freeze({
    classification: "TRANSITIONAL_STATE",
    checks: Object.freeze(PHASE4B_WAVE5_CHECKS.filter((entry) => entry.transitionalState).map((entry) => entry.stableIdentity)),
    foreignKeys: Object.freeze([]),
  }),
});

export const PHASE4B_WAVE5_NEGATIVE_SCENARIOS = Object.freeze([
  "check_wrong_expression", "check_parentheses_semantic_drift", "check_validation_drift", "check_write_affecting_mismatch",
  "fk_wrong_source", "fk_wrong_target", "fk_wrong_delete", "fk_wrong_update",
  "fk_wrong_match", "fk_wrong_deferrability", "fk_orphan_data", "missing_dependency", "provider_conflict",
]);

export function assertWave5CatalogMajor(observedMajor, catalog = PHASE4B_WAVE5_CATALOG) {
  if (observedMajor !== catalog.postgresMajor) throw new Error("Wave 5 PostgreSQL major is unsupported.");
  return true;
}

export function assertWave5ReviewedTransition(check) {
  const transition = check?.transitionalState;
  if (!check || !isExamPayloadHashCheck(check)
      || transition?.provider !== PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.provider
      || transition?.expressionHash !== PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.expressionHash
      || transition?.catalogExpression !== PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.catalogExpression
      || JSON.stringify(transition?.referencedColumns) !== JSON.stringify(PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.referencedColumns)
      || JSON.stringify(transition?.requiredNullableColumns) !== JSON.stringify(PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.requiredNullableColumns)
      || transition?.validated !== true || transition?.noInherit !== false) {
    throw new Error("Wave 5 reviewed transitional CHECK provider or contract drifted.");
  }
  return true;
}

export function assertWave5Contract(checks = PHASE4B_WAVE5_CHECKS, foreignKeys = PHASE4B_WAVE5_FOREIGN_KEYS) {
  if (PHASE4B_WAVE5_CATALOG.format !== "REFLAB_PHASE4B_WAVE5_EFFECTIVE_CANONICAL_CATALOG_V1" || PHASE4B_WAVE5_CATALOG.postgresMajor !== 18) {
    throw new Error("Wave 5 canonical catalog version is unsupported.");
  }
  const checkIdentities = checks.map((entry) => canonicalCheckIdentityKey(entry));
  const foreignKeyIdentities = foreignKeys.map((entry) => canonicalForeignKeyIdentityKey(entry));
  if (new Set(checkIdentities).size !== checks.length || new Set(foreignKeyIdentities).size !== foreignKeys.length) {
    throw new Error("Wave 5 canonical identity collision.");
  }
  if (checks.length !== PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalIdentities.checks
      || foreignKeys.length !== PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalIdentities.foreignKeys) {
    throw new Error("Wave 5 effective canonical constraint counts drifted.");
  }
  const recovered = PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.recoveredExtractorOmissions;
  if (PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS.checks + recovered.checks.length
        !== PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalBaselinePhysicalIdentities.checks
      || PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS.foreignKeys + recovered.foreignKeys.length
        !== PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalBaselinePhysicalIdentities.foreignKeys) {
    throw new Error("Wave 5 Phase 4A cardinality reconciliation drifted.");
  }
  if (checks.some((entry) => !entry.expression || entry.validated !== true || entry.noInherit !== false)) {
    throw new Error("Wave 5 CHECK metadata is incomplete.");
  }
  if ([...checks, ...foreignKeys].some((entry) => !WAVE5_DATA_EVIDENCE_VALUES.includes(entry.dataEvidence))) {
    throw new Error("Wave 5 data evidence provenance is unsupported.");
  }
  const transitionalChecks = checks.filter((entry) => entry.transitionalState !== null);
  if (transitionalChecks.length !== 1) throw new Error("Wave 5 reviewed transitional CHECK count drifted.");
  assertWave5ReviewedTransition(transitionalChecks[0]);
  if (foreignKeys.some((entry) => !entry.constraintName || entry.sourceColumns.length === 0
    || entry.sourceColumns.length !== entry.targetColumns.length || !entry.matchType || !entry.onUpdate || !entry.onDelete
    || typeof entry.deferrable !== "boolean" || typeof entry.initiallyDeferred !== "boolean" || typeof entry.validated !== "boolean")) {
    throw new Error("Wave 5 FK metadata is incomplete.");
  }
  return true;
}

export function assessWave5DataValidation({ classification, violationCount, dataEvidence }) {
  if (!WAVE5_DATA_EVIDENCE_VALUES.includes(dataEvidence)) {
    throw new Error("Wave 5 data evidence provenance is unsupported.");
  }
  if (!Number.isSafeInteger(violationCount) || violationCount < 0) {
    throw new Error("Wave 5 aggregate violation count is invalid.");
  }
  if (classification === "SEMANTIC_DRIFT") {
    return Object.freeze({ abort: true, decision: "BLOCKER_STRUCTURAL_DRIFT", classification });
  }
  if (classification === "CUTOVER_ONLY" || violationCount === 0) {
    return Object.freeze({ abort: false, decision: "NO_DATA_BLOCKER", classification });
  }
  if (WAVE5_AUTHORITATIVE_DATA_EVIDENCE.has(dataEvidence)) {
    return Object.freeze({ abort: true, decision: "BLOCKER_DATA_VIOLATION", classification });
  }
  return Object.freeze({
    abort: false,
    decision: "NON_AUTHORITATIVE_FIXTURE_OBSERVATION",
    classification: classification === "EXACT_CANONICAL" || classification === "EQUIVALENT_REUSE"
      ? classification
      : "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  });
}

const sameArray = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function checkMatches(expected, observed) {
  return observed.constraintType === "c"
    && sameArray(observed.referencedColumns, expected.referencedColumns)
    && observed.expressionHash === expected.expressionHash
    && observed.validated === expected.validated
    && observed.noInherit === expected.noInherit;
}

function transitionalCheckMatches(expected, observed) {
  const transition = expected.transitionalState;
  return transition !== null
    && observed.constraintType === "c"
    && sameArray(observed.referencedColumns, transition.referencedColumns)
    && observed.expressionHash === transition.expressionHash
    && observed.validated === transition.validated
    && observed.noInherit === transition.noInherit
    && transition.requiredNullableColumns.every((column) => observed.nullableColumns?.includes(column));
}

function foreignKeyMatches(expected, observed) {
  return observed.constraintType === "f"
    && sameArray(observed.sourceColumns, expected.sourceColumns)
    && observed.targetSchema === expected.targetSchema
    && observed.targetTable === expected.targetTable
    && sameArray(observed.targetColumns, expected.targetColumns)
    && observed.matchType === expected.matchType
    && observed.onUpdate === expected.onUpdate
    && observed.onDelete === expected.onDelete
    && observed.deferrable === expected.deferrable
    && observed.initiallyDeferred === expected.initiallyDeferred
    && observed.validated === expected.validated;
}

function emptyClassification() {
  return {
    EXACT_CANONICAL: 0,
    EQUIVALENT_REUSE: 0,
    REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE: 0,
    LEGACY_REQUIRED_TEMPORARILY: 0,
    CUTOVER_ONLY: 0,
    SEMANTIC_DRIFT: 0,
    UNKNOWN_REQUIRES_EVIDENCE: 0,
  };
}

export function classifyWave5ObservedCatalog(observedCatalog, checks = PHASE4B_WAVE5_CHECKS, foreignKeys = PHASE4B_WAVE5_FOREIGN_KEYS) {
  const result = {
    universe: "EFFECTIVE_CANONICAL_IDENTITIES",
    canonicalIdentityCounts: { checks: checks.length, foreignKeys: foreignKeys.length },
    checks: emptyClassification(),
    foreignKeys: emptyClassification(),
    objects: {},
    observedRepresentations: {
      checks: { equivalentAliases: [], transitionalStates: [] },
      foreignKeys: { equivalentAliases: [], transitionalStates: [] },
    },
  };
  for (const expected of checks) {
    let classification;
    if (expected.classification === "CUTOVER_ONLY") {
      classification = "CUTOVER_ONLY";
    } else {
      const sameName = observedCatalog.checks.find((row) => row.schema === expected.schema
        && row.table === expected.table && row.constraintName === expected.catalogConstraintName);
      if (sameName) {
        classification = checkMatches(expected, sameName)
          ? "EXACT_CANONICAL"
          : transitionalCheckMatches(expected, sameName)
            ? "LEGACY_REQUIRED_TEMPORARILY"
            : "SEMANTIC_DRIFT";
        if (classification === "LEGACY_REQUIRED_TEMPORARILY") {
          result.observedRepresentations.checks.transitionalStates.push({
            canonicalIdentity: expected.stableIdentity,
            observedIdentity: canonicalCheckIdentityKey(sameName),
          });
        }
      }
      else {
        const equivalents = observedCatalog.checks.filter((row) => row.schema === expected.schema
          && row.table === expected.table && checkMatches(expected, row));
        classification = equivalents.length === 1
          ? "EQUIVALENT_REUSE"
          : equivalents.length === 0
            ? "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE"
            : "SEMANTIC_DRIFT";
        if (classification === "EQUIVALENT_REUSE") {
          result.observedRepresentations.checks.equivalentAliases.push({
            canonicalIdentity: expected.stableIdentity,
            observedIdentity: canonicalCheckIdentityKey(equivalents[0]),
          });
        }
      }
    }
    result.checks[classification] += 1;
    result.objects[expected.identity] = classification;
  }
  for (const expected of foreignKeys) {
    const sameName = observedCatalog.foreignKeys.find((row) => row.schema === expected.schema
      && row.table === expected.table && row.constraintName === expected.constraintName);
    let classification;
    if (sameName) classification = foreignKeyMatches(expected, sameName) ? "EXACT_CANONICAL" : "SEMANTIC_DRIFT";
    else {
      const equivalents = observedCatalog.foreignKeys.filter((row) => row.schema === expected.schema
        && row.table === expected.table && foreignKeyMatches(expected, row));
      classification = equivalents.length === 1
        ? "EQUIVALENT_REUSE"
        : equivalents.length === 0
          ? "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE"
          : "SEMANTIC_DRIFT";
      if (classification === "EQUIVALENT_REUSE") {
        result.observedRepresentations.foreignKeys.equivalentAliases.push({
          canonicalIdentity: expected.stableIdentity,
          observedIdentity: canonicalForeignKeyIdentityKey(equivalents[0]),
        });
      }
    }
    result.foreignKeys[classification] += 1;
    result.objects[expected.identity] = classification;
  }
  return result;
}

export const PHASE4B_WAVE5_SUMMARY = Object.freeze({
  classificationUniverse: PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.classificationUniverse,
  classificationStage: "PRE_OBSERVATION_DEFAULTS",
  canonicalIdentities: PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalIdentities,
  observedRepresentations: "CLASSIFIED_AT_REHEARSAL_TIME",
  checks: Object.freeze({ total: 301, safeInstall: 0, cutoverOnly: 1, reviewedLegacyTemporary: 1, requiresPrivilegedProductionEvidence: 299 }),
  foreignKeys: Object.freeze({ total: 129, safeInstall: 0, requiresPrivilegedProductionEvidence: 129 }),
  migrationRequired: false,
});
