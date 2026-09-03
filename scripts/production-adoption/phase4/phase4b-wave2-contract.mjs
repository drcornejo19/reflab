import { canonicalObjectManifest } from "../../production-preflight/manifest.mjs";
import {
  INDEX_SEMANTIC_DRIFTS,
  PHASE4_PROVIDER_MAP,
  RENAMED_EQUIVALENT_INDEXES,
  buildUniqueProviderMap,
} from "./phase4-structural-contract.mjs";

export const PHASE4B_WAVE2_VERSION = "20260901064257";
export const PHASE4B_WAVE2_MIGRATION = `${PHASE4B_WAVE2_VERSION}_production_adoption_non_unique_indexes.sql`;
export const PHASE4B_WAVE2_PROVIDER = `reflab:production_adoption_provider=${PHASE4B_WAVE2_VERSION}`;

const SAFE_INDEX_NAMES = Object.freeze([
  "attempts_exam_result_idx",
  "attempts_sport_topic_created_idx",
  "capability_overrides_user_validity_idx",
  "clips_mode_created_idx",
  "fixture_sync_logs_provider_created_idx",
  "institution_assessment_assignments_group_idx",
  "institution_assessment_assignments_user_idx",
  "institution_assessment_feedback_session_idx",
  "institution_assessment_history_assessment_idx",
  "institution_assessment_items_assessment_idx",
  "institution_assessments_tenant_status_idx",
  "institution_cohorts_tenant_status_idx",
  "institution_content_assignments_group_idx",
  "institution_content_assignments_user_idx",
  "institution_contents_tenant_status_idx",
  "institution_data_consents_user_idx",
  "institution_groups_tenant_status_idx",
  "institution_members_legacy_user_idx",
  "institution_permission_overrides_tenant_idx",
  "institution_memberships_tenant_status_idx",
  "institution_notification_campaigns_status_idx",
  "institution_subscriptions_plan_status_idx",
  "institutional_clips_institution_status_idx",
  "institutional_clips_sport_topic_idx",
  "notification_events_user_status_idx",
  "notification_tokens_user_enabled_idx",
  "psychology_checkins_user_module_created_idx",
  "psychology_exercises_user_module_created_idx",
  "psychology_wellbeing_user_module_created_idx",
  "user_global_roles_role_idx",
  "user_roles_institution_idx",
  "user_subscriptions_plan_status_idx",
]);

function parseSimpleIndexDefinition(definition) {
  const match = String(definition).trim().match(/^\((.+)\)$/);
  if (!match) throw new Error(`Wave 2 index is not a simple non-partial key list: ${definition}`);
  const keys = match[1].split(",").map((entry) => {
    const key = entry.trim().match(/^([a-z_][a-z0-9_]*)(?:\s+(asc|desc))?$/i);
    if (!key) throw new Error(`Wave 2 index key requires unsupported expression syntax: ${entry}`);
    return Object.freeze({ column: key[1], descending: key[2]?.toLowerCase() === "desc" });
  });
  return Object.freeze(keys);
}

const manifestByName = new Map(canonicalObjectManifest.explicitIndexes.map((index) => [index.name, index]));

export const PHASE4B_WAVE2_SAFE_INDEXES = Object.freeze(SAFE_INDEX_NAMES.map((name) => {
  const index = manifestByName.get(name);
  if (!index) throw new Error(`Wave 2 canonical index is missing from the Production manifest: ${name}`);
  if (index.unique) throw new Error(`Wave 2 must not include a unique index: ${name}`);
  const keys = parseSimpleIndexDefinition(index.definition);
  return Object.freeze({
    schema: index.table.split(".")[0],
    table: index.table,
    name,
    identity: `${index.table}.${name}`,
    accessMethod: "btree",
    unique: false,
    keys,
    include: Object.freeze([]),
    predicate: null,
    expressions: Object.freeze([]),
    classification: "SAFE_INSTALL",
    provider: PHASE4B_WAVE2_VERSION,
  });
}));

export const PHASE4B_WAVE2_EQUIVALENT_REUSE = Object.freeze(RENAMED_EQUIVALENT_INDEXES.map((index) => Object.freeze({
  ...index,
  accessMethod: "btree",
  unique: false,
  predicate: null,
  include: Object.freeze([]),
  classification: "EQUIVALENT_REUSE",
})));

const CUTOVER_DRIFT_TYPES = new Set(["wrong_order", "subset_index", "wrong_predicate", "truly_incompatible"]);
export const PHASE4B_WAVE2_DRIFT_DECISIONS = Object.freeze(INDEX_SEMANTIC_DRIFTS.map((index) => Object.freeze({
  ...index,
  decision: CUTOVER_DRIFT_TYPES.has(index.classification)
    ? "REPLACEMENT_REQUIRES_CUTOVER"
    : "LEGACY_REQUIRED_TEMPORARILY",
  wave2Action: "PRESERVE_NO_DDL",
})));

export const PHASE4B_WAVE2_PROVIDER_MAP = buildUniqueProviderMap([
  ...PHASE4_PROVIDER_MAP,
  ...PHASE4B_WAVE2_SAFE_INDEXES.map((index) => [index.identity, PHASE4B_WAVE2_VERSION]),
]);

export const PHASE4B_WAVE2_NEGATIVE_SCENARIOS = Object.freeze([
  "wrong_key_order",
  "wrong_predicate",
  "wrong_access_method",
  "wrong_include",
  "wrong_opclass",
  "duplicate_equivalent_index",
  "invalid_index",
  "missing_prerequisite",
  "provider_conflict",
]);

export const PHASE4B_WAVE2_LOCK_STRATEGY = Object.freeze({
  statement: "CREATE INDEX",
  transactional: true,
  concurrently: false,
  lockTimeout: "5s",
  statementTimeout: "15min",
  reason: "Atomic rollback is required; timeout aborts the entire wave instead of leaving an invalid concurrent index.",
  productionGate: "approved maintenance window plus table-size and lock-duration evidence",
});

export function assertWave2ProviderMap(entries = PHASE4B_WAVE2_PROVIDER_MAP) {
  if (!(entries instanceof Map)) throw new Error("Wave 2 provider map must be a Map.");
  for (const index of PHASE4B_WAVE2_SAFE_INDEXES) {
    if (entries.get(index.identity) !== PHASE4B_WAVE2_VERSION) {
      throw new Error(`Wave 2 provider conflict: ${index.identity}`);
    }
  }
  return true;
}

