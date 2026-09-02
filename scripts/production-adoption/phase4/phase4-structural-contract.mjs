import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalObjectManifest } from "../../production-preflight/manifest.mjs";
import { productionObjectProviders } from "../phase1/bridge-manifest.mjs";
import { PHASE2B_OBJECT_PROVIDERS } from "../phase2b/phase2b-contract.mjs";
import { PHASE4B_WAVE1_HELPERS, PHASE4B_WAVE1_VERSION } from "./phase4b-wave1-contract.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const baselineManifest = JSON.parse(readFileSync(resolve(root, "supabase", "baseline", "manifest.json"), "utf8"));

export const PHASE4A_CONTRACT_VERSION = "production_structural_evidence_v2";

export const PHASE4_CLASSIFICATIONS = Object.freeze([
  "SAFE_INSTALL_PHASE4B",
  "SAFE_RENAME_OR_REUSE",
  "SAFE_REPLACE",
  "LEGACY_REQUIRED_TEMPORARILY",
  "CUTOVER_ONLY",
  "REQUIRES_DATA_VALIDATION",
  "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  "UNKNOWN_REQUIRES_EVIDENCE",
]);

export const TRIGGER_CONTRADICTION_RESOLUTION = Object.freeze([
  "performance_sessions",
  "readiness_scores",
  "wellness_logs",
].map((table) => ({
  table: `public.${table}`,
  classification: "duplicate_manifest_bug",
  appointmentTrigger: `${table}_validate_appointment_context`,
  appointmentFunction: "reflab_private.validate_user_appointment_context()",
  checkinTrigger: `${table}_validate_checkin_owner`,
  checkinFunction: "reflab_private.validate_performance_checkin_owner()",
  evidence: "The canonical SQL creates two independent triggers over appointment_id and checkin_id; the manifest generator reused the first suffix.",
})));

export const INDEX_SEMANTIC_DRIFTS = Object.freeze([
  ["public.coach_data_consents", "coach_data_consents_user_idx", "(user_id, data_category, purpose)", "(user_id, purpose, data_category)", "wrong_order"],
  ["public.coach_runs", "coach_runs_institution_created_idx", "(institution_id, created_at desc)", "(institution_id, created_at desc) where institution_id is not null", "subset_index"],
  ["public.competitions", "competitions_association_sport_idx", "(association_id, sport_type, is_active)", "(association_id, sport_type)", "subset_index"],
  ["public.fixtures", "fixtures_provider_external_unique", "(provider, external_id) where provider is not null and external_id is not null", "(provider, external_id) where external_id is not null", "wrong_predicate"],
  ["public.institution_assessment_sessions", "institution_assessment_sessions_tenant_group_idx", "(institution_id, group_id, status)", "(institution_id, group_id, created_at desc)", "truly_incompatible"],
  ["public.institution_demo_sessions", "institution_demo_sessions_user_status_idx", "(user_id, status, expires_at)", "(user_id, status, expires_at desc)", "wrong_order"],
  ["public.institution_group_memberships", "institution_group_memberships_member_idx", "(membership_id, status)", "(membership_id, status, group_id)", "superset_index"],
  ["public.institution_notification_recipients", "institution_notification_recipients_user_idx", "(user_id, delivery_status)", "(user_id, delivery_status, created_at desc)", "superset_index"],
  ["public.performance_checkins", "performance_checkins_user_date_type_idx", "(user_id, date, checkin_type)", "(user_id, date desc, checkin_type)", "wrong_order"],
  ["public.teams", "teams_provider_external_unique", "(provider, external_id) where provider is not null and external_id is not null", "(provider, external_id) where external_id is not null", "wrong_predicate"],
  ["public.venues", "venues_provider_external_unique", "(provider, external_id) where provider is not null and external_id is not null", "(provider, external_id) where external_id is not null", "wrong_predicate"],
].map(([table, name, canonical, observed, classification]) => ({
  table, name, canonical, observed, classification,
  evidenceRequiredBeforeWrite: true,
})));

export const RENAMED_EQUIVALENT_INDEXES = Object.freeze([{
  table: "public.clips",
  canonicalName: "clips_sport_topic_idx",
  observedName: "clips_sport_topic_active_idx",
  keys: ["sport_type", "topic", "is_active"],
  classification: "SAFE_RENAME_OR_REUSE",
}]);

export const PENDING_UNIQUES = Object.freeze([
  ["public.exam_results", "exam_results_user_submission_unique", ["user_id", "submission_id"], "exam_results_user_submission_unique", "partial_equivalent"],
  ["public.institution_assessment_assignments", "institution_assessment_assignments_id_tenant_assessment_unique", ["id", "institution_id", "assessment_id"], null, "requires_data_validation"],
  ["public.institution_assessment_sessions", "institution_assessment_sessions_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_assessments", "institution_assessments_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_cohorts", "institution_cohorts_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_contents", "institution_contents_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_groups", "institution_groups_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_memberships", "institution_memberships_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_notification_campaigns", "institution_notification_campaigns_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_roles", "institution_roles_id_tenant_unique", ["id", "institution_id"], null, "requires_data_validation"],
  ["public.institution_subscriptions", null, ["institution_id"], null, "requires_data_validation"],
  ["public.user_profiles", null, ["ref_card_id"], "user_profiles_ref_card_id_unique", "partial_equivalent"],
  ["public.user_subscriptions", null, ["user_id"], null, "requires_data_validation"],
].map(([table, name, columns, equivalentIndex, evidence]) => ({
  table, name, columns, equivalentIndex, evidence,
  classification: "REQUIRES_DATA_VALIDATION",
  duplicateCount: null,
  maxDuplicateGroupSize: null,
})));

const baselineOnlyHelpers = Object.freeze(PHASE4B_WAVE1_HELPERS.map((helperContract) => helperContract.signature));

const missingRuntimeFunctions = Object.freeze([
  "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
  "public.accept_canonical_institution_invitation(text, uuid, text[])",
]);

export const FUNCTION_CLASSIFICATION = Object.freeze([
  ...baselineOnlyHelpers.map((signature) => ({
    signature,
    provider: PHASE4B_WAVE1_VERSION,
    classification: "SAFE_INSTALL_PHASE4B",
    activation: "inert_until_trigger_or_policy_references_it",
  })),
  ...missingRuntimeFunctions.map((signature) => ({
    signature,
    provider: signature.startsWith("public.accept_") ? "202608210001" : "future_production_adoption_incremental",
    classification: "CUTOVER_ONLY",
    activation: "runtime_rpc",
  })),
  {
    signature: "public.consume_coach_rate_limit(text, text, integer, integer)",
    provider: "202608200001",
    classification: "CUTOVER_ONLY",
    activation: "replace_historical_function_after_caller_and_write_contract_validation",
  },
]);

export const TRIGGER_PAIR_SUMMARY = Object.freeze({
  totalHistoricalPairs: 50,
  updatedAtEquivalentDifferentNameOrHelper: 44,
  institutionalValidatorSemanticDrift: 6,
  canonicalMissingWithNoHistoricalSameEvent: 31,
  canonicalExactAfterPhase1: 1,
});

export const CONSTRAINT_EVIDENCE = Object.freeze({
  checks: {
    canonicalTotal: baselineManifest.object_inventory.check_constraints.length,
    cutoverOnly: ["public.attempts.attempts_exam_source_check"],
    exact: 0,
    missing: 0,
    drift: 0,
    unknownRequiresV2: baselineManifest.object_inventory.check_constraints.length - 1,
  },
  foreignKeys: {
    canonicalTotal: baselineManifest.object_inventory.foreign_keys.length,
    exact: 0,
    missing: 0,
    drift: 0,
    unknownRequiresV2: baselineManifest.object_inventory.foreign_keys.length,
  },
});

export const PHASE4B_WAVES = Object.freeze([
  { order: 1, name: "inert_helper_functions", objects: baselineOnlyHelpers, gate: "exact function contract and no implicit EXECUTE" },
  { order: 2, name: "confirmed_non_unique_indexes", objects: "32 missing non-unique indexes, minus any V2 equivalent", gate: "V2 semantic absence plus lock-duration plan" },
  { order: 3, name: "updated_at_trigger_reuse", objects: "44 historical updated_at pairs", gate: "single-execution proof and reviewed replacement transaction" },
  { order: 4, name: "validated_uniques", objects: PENDING_UNIQUES.map((entry) => `${entry.table}.${entry.name ?? `unique(${entry.columns.join(",")})`}`), gate: "privileged duplicate aggregates and legacy-write compatibility" },
  { order: 5, name: "safe_checks_and_foreign_keys", objects: "only V2-proven safe constraints", gate: "historical rows and between-phase writes both pass" },
  { order: 6, name: "runtime_and_validator_cutover", objects: ["attempts_exam_source_check", "six institutional validator replacements", ...missingRuntimeFunctions], gate: "runtime deployment and rollback window" },
]);

export function normalizeSqlExpression(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/::[a-z_][a-z0-9_.]*(?:\[\])?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function triggerIdentity(trigger) {
  return `${trigger.table}.${trigger.name}`;
}

export function duplicateTriggerContracts(triggers) {
  const groups = new Map();
  for (const trigger of triggers) {
    const identity = triggerIdentity(trigger);
    const contracts = groups.get(identity) ?? [];
    contracts.push(trigger);
    groups.set(identity, contracts);
  }
  return [...groups.entries()]
    .filter(([, entries]) => new Set(entries.map((entry) => `${entry.timing_and_events}|${entry.function}`)).size > 1)
    .map(([identity, entries]) => ({ identity, entries }));
}

export function classifyIndexEvidence(expected, observed) {
  if (!observed) return { classification: "canonical_missing" };
  if (Boolean(expected.unique) !== Boolean(observed.unique)) return { classification: "wrong_uniqueness" };
  const expectedKeys = expected.keys ?? [];
  const observedKeys = observed.keys ?? [];
  if (JSON.stringify(expectedKeys) === JSON.stringify(observedKeys)
      && normalizeSqlExpression(expected.predicate) === normalizeSqlExpression(observed.predicate)) {
    return { classification: expected.name === observed.name ? "exact" : "naming_only" };
  }
  if (expectedKeys.every((key, index) => observedKeys[index] === key) && observedKeys.length > expectedKeys.length) {
    return { classification: "superset_index" };
  }
  if (observedKeys.every((key, index) => expectedKeys[index] === key) && expectedKeys.length > observedKeys.length) {
    return { classification: "subset_index" };
  }
  if (JSON.stringify(expectedKeys) !== JSON.stringify(observedKeys)
      && JSON.stringify([...expectedKeys].sort()) === JSON.stringify([...observedKeys].sort())) {
    return { classification: "wrong_order" };
  }
  if (normalizeSqlExpression(expected.predicate) !== normalizeSqlExpression(observed.predicate)) {
    return { classification: "wrong_predicate" };
  }
  return { classification: "truly_incompatible" };
}

export function classifyUniqueEvidence({ duplicateCount, maxDuplicateGroupSize, equivalentIndex }) {
  if (!Number.isInteger(duplicateCount) || !Number.isInteger(maxDuplicateGroupSize)) {
    return "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE";
  }
  if (duplicateCount > 0 || maxDuplicateGroupSize > 1) return "REQUIRES_DATA_VALIDATION";
  return equivalentIndex?.predicate ? "SAFE_RENAME_OR_REUSE" : "SAFE_INSTALL_PHASE4B";
}

export function buildUniqueProviderMap(entries) {
  const providers = new Map();
  for (const [object, provider] of entries) {
    const previous = providers.get(object);
    if (previous && previous !== provider) {
      throw new Error(`Conflicting providers for ${object}.`);
    }
    providers.set(object, provider);
  }
  return providers;
}

export const PHASE4_PROVIDER_MAP = buildUniqueProviderMap([
  ...productionObjectProviders,
  ...Object.entries(PHASE2B_OBJECT_PROVIDERS),
  ...baselineOnlyHelpers.map((signature) => [signature, PHASE4B_WAVE1_VERSION]),
  ["public.submit_referee_exam(text, uuid, uuid, text, jsonb)", "future_phase4_runtime_cutover"],
]);

export function canonicalStructuralInventory() {
  return {
    tables: baselineManifest.object_inventory.tables,
    columns: baselineManifest.object_inventory.table_inventory,
    functions: canonicalObjectManifest.functions,
    triggers: canonicalObjectManifest.triggers,
    indexes: canonicalObjectManifest.explicitIndexes,
    uniques: baselineManifest.object_inventory.unique_constraints,
    checks: baselineManifest.object_inventory.check_constraints,
    foreignKeys: baselineManifest.object_inventory.foreign_keys,
  };
}
