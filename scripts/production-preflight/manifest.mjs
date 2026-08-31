import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichFunctionContract, enrichPolicyContract } from "./canonical-contracts.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const baselineManifest = JSON.parse(
  readFileSync(resolve(repositoryRoot, "supabase", "baseline", "manifest.json"), "utf8")
);

export const PRODUCTION_PROJECT_REF = "nagjddldrldwavmfaytc";
export const DEVELOPMENT_PROJECT_REF = "bthnhbpgiyuajsgoccrp";

const historicalMigrationManifest = [
  ["202605260001", "refcard_privacy_attempt_metrics"],
  ["202605260002", "ref_performance"],
  ["202605270001", "ref_performance_persistence"],
  ["202605270002", "institutional_leads"],
  ["202605280001", "institutional_b2b_foundation"],
  ["202605280002", "institutional_profiles_clips"],
  ["202605290001", "institutional_roles_architecture"],
  ["202605290002", "freemium_subscription_plan"],
  ["202606030001", "smart_notifications"],
  ["202606070001", "user_profile_admin_avatar_fix"],
  ["202606090001", "profile_association_logo"],
  ["202606090002", "communication_arbitral_metrics"],
  ["202606160001", "psychology_checkins"],
  ["202606160002", "psychology_wellbeing_assessments"],
  ["202606160003", "psychology_exercise_sessions"],
  ["202606180001", "ifab_library_documents"],
  ["202606240001", "psychology_module_categories"],
  ["202607090001", "sport_foundation"],
  ["202607100001", "video_analysis_answers"],
  ["202607130001", "matches_foundation"],
  ["202607130002", "fixture_sync_logs"],
  ["202607160001", "institutional_multitenant_foundation"],
  ["202607200001", "reflab_coach_foundation"],
  ["202607240001", "access_control_foundation"],
  ["202607240002", "core_rls_lockdown"],
  ["202607240003", "access_schema_reconciliation"],
].map(([version, name]) => ({
  version,
  name,
  classification: "legacy_historical_not_for_replay",
  productionAction: "INVENTORY_ONLY",
}));

const canonicalMigrationManifest = [
  ["202607270000", "reflab_canonical_baseline", "empty_database_only"],
  ["202607300001", "clerk_identity_links", "development_only"],
  ["202608030001", "development_identity_resolution", "development_only"],
  ["202608110001", "canonical_admin_user_access", "incremental_requires_adoption"],
  ["202608110002", "development_super_admin_identity_link", "development_only"],
  ["202608130001", "canonical_training_attempts", "incremental_requires_adoption"],
  ["202608150001", "canonical_communication_feedback", "incremental_requires_adoption"],
  ["202608200001", "canonical_coach_rate_limit", "incremental_requires_adoption"],
  ["202608210001", "canonical_institution_invitation_acceptance", "incremental_requires_adoption"],
  ["202608240001", "canonical_institution_catalog_alignment", "incremental_requires_adoption"],
  ["202608310001", "production_adoption_foundation", "production_adoption_bridge"],
  ["202608310002", "production_adoption_exam_training_prerequisites", "production_adoption_bridge"],
  ["202608310003", "production_adoption_psychology_notifications_prerequisites", "production_adoption_bridge"],
].map(([version, name, classification]) => ({
  version,
  name,
  classification,
  productionAction: classification === "incremental_requires_adoption"
    ? "MANUAL_ADOPTION_AFTER_ALL_GATES"
    : classification === "production_adoption_bridge"
      ? "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE"
      : "NEVER_EXECUTE_IN_PRODUCTION",
}));

export const migrationManifest = [...historicalMigrationManifest, ...canonicalMigrationManifest];

export const REQUIRED_IN_PRODUCTION = Object.freeze([
  "public.admin_set_canonical_user_plan(text, text, text, text)",
  "public.admin_set_canonical_global_role(text, text, text, text)",
  "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)",
  "public.submit_referee_exam(text, uuid, uuid, text, jsonb)",
  "public.consume_coach_rate_limit(text, text, integer, integer)",
  "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)",
  "public.accept_canonical_institution_invitation(text, uuid, text[])",
]);

export const MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION = Object.freeze([
  "public.resolve_development_clerk_identity(text)",
  "public.link_development_clerk_identity(text)",
  "public.link_development_super_admin_clerk_identity(text)",
]);

export const runtimeRpcSignatures = Object.freeze([
  ...REQUIRED_IN_PRODUCTION.map((signature) => ({ signature, productionCategory: "REQUIRED_IN_PRODUCTION" })),
  ...MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.map((signature) => ({
    signature,
    productionCategory: "MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION",
  })),
]);

const incrementalFunctions = [
  { signature: "public.link_development_clerk_identity(text)", security: "DEFINER", search_path: "pg_catalog", scope: "development_only" },
  { signature: "public.resolve_development_clerk_identity(text)", security: "DEFINER", search_path: "pg_catalog", scope: "development_only" },
  { signature: "public.admin_set_canonical_user_plan(text, text, text, text)", security: "DEFINER", search_path: "pg_catalog", scope: "shared" },
  { signature: "public.admin_set_canonical_global_role(text, text, text, text)", security: "DEFINER", search_path: "pg_catalog", scope: "shared" },
  { signature: "public.link_development_super_admin_clerk_identity(text)", security: "DEFINER", search_path: "pg_catalog", scope: "development_only" },
  { signature: "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)", security: "DEFINER", search_path: "pg_catalog", scope: "shared" },
  { signature: "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)", security: "DEFINER", search_path: "pg_catalog", scope: "shared" },
  { signature: "public.consume_coach_rate_limit(text, text, integer, integer)", security: "INVOKER", search_path: "pg_catalog", scope: "shared" },
  { signature: "public.accept_canonical_institution_invitation(text, uuid, text[])", security: "INVOKER", search_path: "pg_catalog", scope: "shared" },
];

const incrementalPolicies = [
  ["reflab_private", "user_identity_links", "user_identity_links_rls_owner_read", "development_chain"],
  ["reflab_private", "user_identity_links", "user_identity_links_rls_owner_insert", "development_chain"],
  ["reflab_meta", "reflab_schema_state", "reflab_schema_state_identity_rls_owner_read", "development_chain"],
  ["public", "user_profiles", "user_profiles_identity_rls_owner_read", "development_chain"],
  ["public", "user_subscriptions", "user_subscriptions_identity_rls_owner_read", "development_chain"],
  ["reflab_meta", "reflab_schema_state", "reflab_schema_state_admin_mutation_read", "shared"],
  ["public", "user_profiles", "user_profiles_admin_mutation_target_read", "shared"],
  ["public", "user_subscriptions", "user_subscriptions_admin_mutation_target_read", "shared"],
  ["public", "user_subscriptions", "user_subscriptions_admin_mutation_target_update", "shared"],
  ["public", "user_global_roles", "user_global_roles_admin_mutation_target_update", "shared"],
  ["public", "user_global_roles", "user_global_roles_admin_actor_lock", "shared"],
  ["public", "access_change_audit", "access_change_audit_admin_mutation_insert", "shared"],
  ["reflab_private", "user_identity_links", "user_identity_links_super_admin_rls_owner_insert", "development_chain"],
  ["public", "user_profiles", "user_profiles_super_admin_identity_rls_owner_read", "development_chain"],
  ["public", "user_subscriptions", "user_subscriptions_super_admin_identity_rls_owner_read", "development_chain"],
  ["reflab_meta", "reflab_schema_state", "training_attempt_marker_read", "shared"],
  ["public", "user_profiles", "training_attempt_profile_read", "shared"],
  ["public", "user_global_roles", "training_attempt_global_role_read", "shared"],
  ["public", "user_global_roles", "training_attempt_global_role_lock", "shared"],
  ["public", "user_subscriptions", "training_attempt_subscription_read", "shared"],
  ["public", "user_subscriptions", "training_attempt_subscription_lock", "shared"],
  ["public", "institution_memberships", "training_attempt_membership_read", "shared"],
  ["public", "institution_memberships", "training_attempt_membership_lock", "shared"],
  ["public", "institutions", "training_attempt_institution_read", "shared"],
  ["public", "institutions", "training_attempt_institution_lock", "shared"],
  ["public", "institution_subscriptions", "training_attempt_institution_subscription_read", "shared"],
  ["public", "institution_subscriptions", "training_attempt_institution_subscription_lock", "shared"],
  ["public", "clips", "training_attempt_clip_read", "shared"],
  ["public", "attempts", "training_attempt_existing_read", "shared"],
  ["public", "attempts", "training_attempt_insert", "shared"],
].map(([schema, table, name, scope]) => ({
  schema,
  table,
  name,
  scope,
  command: name.endsWith("_insert") ? "INSERT" : name.endsWith("_update") || name.endsWith("_lock") ? "UPDATE" : "SELECT",
  roles: ["reflab_rls_owner"],
  mode: "PERMISSIVE",
}));

export const criticalColumns = {
  "public.user_profiles": ["user_id"],
  "public.user_global_roles": ["user_id", "role_key", "source", "assigned_by_user_id"],
  "public.user_subscriptions": ["user_id", "plan_key", "status", "source", "assigned_by_user_id"],
  "public.referee_exam_sessions": ["id", "user_id", "submission_id", "manifest_hash", "status"],
  "public.exam_results": ["id", "user_id", "exam_session_id", "submission_id", "payload_hash", "avg_score", "sport_type"],
  "public.attempts": ["id", "user_id", "exam_result_id", "submission_id", "canonical_payload_hash", "source_item_type", "source_item_id", "score", "criterion_result"],
  "public.institution_memberships": ["id", "institution_id", "user_id", "status", "invited_by_user_id"],
  "public.institution_membership_roles": ["institution_id", "membership_id", "role_id", "assigned_by_user_id"],
  "public.institution_group_memberships": ["institution_id", "group_id", "membership_id", "status"],
  "public.appointments": ["id", "user_id", "institution_id", "created_by_user_id"],
  "public.appointment_history": ["appointment_id", "user_id", "changed_by_user_id"],
  "public.match_officials": ["fixture_id", "appointment_id", "user_id"],
  "public.match_preparations": ["appointment_id", "user_id"],
  "public.post_match_reviews": ["appointment_id", "user_id"],
  "public.fixtures": ["id", "raw_source_reference"],
  "public.notification_preferences": ["user_id"],
  "public.notification_tokens": ["user_id", "token"],
  "public.notification_events": ["user_id", "status", "deduplication_key"],
  "public.psychology_checkins": ["user_id"],
  "public.psychology_wellbeing_assessments": ["user_id"],
  "public.psychology_exercise_sessions": ["user_id"],
  "public.performance_checkins": ["user_id"],
  "public.performance_sessions": ["user_id"],
  "public.wellness_logs": ["user_id"],
  "public.readiness_scores": ["user_id"],
  "public.physical_tests": ["user_id"],
  "public.coach_rate_limit_buckets": ["user_id", "feature"],
  "public.coach_runs": ["id", "user_id", "feature"],
  "public.ai_usage_ledger": ["run_id", "user_id"],
};

export const identityColumns = {
  "public.user_profiles": ["user_id"],
  "public.user_global_roles": ["user_id", "assigned_by_user_id"],
  "public.user_subscriptions": ["user_id", "assigned_by_user_id"],
  "public.capability_overrides": ["user_id", "assigned_by_user_id"],
  "public.access_change_audit": ["actor_user_id", "target_user_id"],
  "public.platform_audit_logs": ["actor_user_id"],
  "public.user_roles": ["user_id"],
  "public.institutions": ["created_by_user_id"],
  "public.institution_memberships": ["user_id", "invited_by_user_id"],
  "public.institution_membership_roles": ["assigned_by_user_id"],
  "public.institution_membership_permission_overrides": ["assigned_by_user_id"],
  "public.institution_members": ["user_id"],
  "public.institution_cohorts": ["created_by_user_id"],
  "public.institution_groups": ["created_by_user_id"],
  "public.institution_content_assignments": ["user_id", "assigned_by_user_id"],
  "public.institution_assessments": ["created_by_user_id"],
  "public.institution_assessment_assignments": ["user_id", "assigned_by_user_id"],
  "public.institution_assessment_sessions": ["user_id"],
  "public.institution_assessment_history": ["actor_user_id"],
  "public.institution_notification_campaigns": ["created_by_user_id"],
  "public.institution_notification_recipients": ["user_id"],
  "public.institution_data_consents": ["user_id"],
  "public.institution_audit_logs": ["actor_user_id"],
  "public.institution_demo_sessions": ["user_id"],
  "public.referee_eligibility": ["user_id"],
  "public.appointments": ["user_id", "created_by_user_id"],
  "public.appointment_history": ["user_id", "changed_by_user_id"],
  "public.match_officials": ["user_id"],
  "public.match_preparations": ["user_id"],
  "public.post_match_reviews": ["user_id"],
  "public.institutional_clips": ["uploaded_by"],
  "public.ifab_library_documents": ["uploaded_by"],
  "public.referee_exam_sessions": ["user_id"],
  "public.exam_results": ["user_id"],
  "public.attempts": ["user_id"],
  "public.rules_exam_results": ["user_id"],
  "public.performance_checkins": ["user_id"],
  "public.performance_sessions": ["user_id"],
  "public.wellness_logs": ["user_id"],
  "public.readiness_scores": ["user_id"],
  "public.physical_tests": ["user_id"],
  "public.psychology_checkins": ["user_id"],
  "public.psychology_wellbeing_assessments": ["user_id"],
  "public.psychology_exercise_sessions": ["user_id"],
  "public.coach_rate_limit_buckets": ["user_id"],
  "public.coach_runs": ["user_id"],
  "public.coach_data_consents": ["user_id"],
  "public.ai_usage_ledger": ["user_id"],
  "public.institutional_leads": ["owner_user_id", "converted_by_user_id"],
  "public.institutional_lead_activities": ["actor_user_id"],
  "public.notification_preferences": ["user_id"],
  "public.notification_tokens": ["user_id"],
  "public.notification_events": ["user_id"],
};

const baselineFunctions = baselineManifest.object_inventory.functions.map((entry) => ({
  ...entry,
  scope: "shared",
}));
const functionMap = new Map(baselineFunctions.map((entry) => [entry.signature, entry]));
for (const entry of incrementalFunctions.filter((candidate) => candidate.scope === "shared")) {
  functionMap.set(entry.signature, entry);
}

const productionTables = [...baselineManifest.object_inventory.tables].sort();
const productionFunctions = [...functionMap.values()]
  .map(enrichFunctionContract)
  .sort((left, right) => left.signature.localeCompare(right.signature));
const productionPolicies = [
  ...baselineManifest.object_inventory.policies.map((entry) => ({ ...entry, scope: "shared" })),
  ...incrementalPolicies.filter((entry) => entry.scope === "shared"),
].map(enrichPolicyContract).sort((left, right) => left.name.localeCompare(right.name));
const productionRls = [
  ...baselineManifest.object_inventory.tables.map((table) => ({ table, enabled: true, forced: false })),
  { table: "storage.objects", enabled: true, forced: false },
].sort((left, right) => left.table.localeCompare(right.table));
const productionTriggers = baselineManifest.object_inventory.triggers;
const productionExplicitIndexes = [
  ...baselineManifest.object_inventory.explicit_indexes,
  {
    name: "attempts_canonical_training_submission_unique",
    table: "public.attempts",
    unique: true,
    definition: "(user_id, submission_id) where exam_result_id is null and submission_id is not null",
  },
];
const productionSanityCounts = Object.freeze({
  tables: productionTables.length,
  functions: productionFunctions.length,
  policies: productionPolicies.length,
  triggers: productionTriggers.length,
  explicitIndexes: productionExplicitIndexes.length,
});

export const canonicalObjectManifest = Object.freeze({
  sanityCounts: productionSanityCounts,
  tables: productionTables,
  criticalColumns,
  functions: productionFunctions,
  policies: productionPolicies,
  rls: productionRls,
  triggers: productionTriggers,
  explicitIndexes: productionExplicitIndexes,
  uniques: baselineManifest.object_inventory.unique_constraints,
  buckets: baselineManifest.object_inventory.buckets,
  runtimeRpcSignatures,
  migrations: migrationManifest,
});
