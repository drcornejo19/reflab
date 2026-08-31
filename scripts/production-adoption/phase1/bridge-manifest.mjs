export const PHASE1_PLAN_VERSION = "production_adoption_bridge_v1";
export const PHASE1_PLAN_HASH = "ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f";
export const PHASE0_FINGERPRINT_HASH = "07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d";

export const phase1BridgeMigrations = Object.freeze([
  {
    version: "202608310001",
    name: "production_adoption_foundation",
    phase: "foundation",
    order: 1,
    requires: ["safe_reflab_rls_owner", "phase0_fingerprint", "absent_adoption_schemas"],
    provides: [
      "reflab_meta.production_adoption_state",
      "reflab_meta.reflab_schema_state_empty_infrastructure",
      "reflab_meta",
      "reflab_private",
    ],
  },
  {
    version: "202608310002",
    name: "production_adoption_exam_training_prerequisites",
    phase: "exam_training_prerequisites",
    order: 2,
    requires: ["foundation", "legacy_attempts", "legacy_exam_results", "institution_fk_targets"],
    provides: ["public.referee_exam_sessions", "nullable_exam_contract", "nullable_attempt_source_contract"],
  },
  {
    version: "202608310003",
    name: "production_adoption_psychology_notifications_prerequisites",
    phase: "psychology_notification_prerequisites",
    order: 3,
    requires: ["exam_training_prerequisites", "known_psychology_module_slugs", "legacy_notification_events"],
    provides: ["exact_psychology_module_catalog", "nullable_notification_deduplication"],
  },
]);

export const existingCanonicalMigrationDependencies = Object.freeze([
  {
    version: "202608110001",
    developmentOnlyCommentDependency: "202608030001",
    productionRequires: [
      "empty_schema_state_infrastructure",
      "canonical_access_table_shapes",
      "safe_reflab_rls_owner",
      "reviewed_admin_security_cutover",
    ],
    runtimeRequiresInstalledMarker: true,
  },
  {
    version: "202608130001",
    productionRequires: [
      "nullable_attempt_source_contract",
      "empty_schema_state_infrastructure",
      "canonical_json_helper",
      "safe_reflab_rls_owner",
      "reviewed_training_security_cutover",
    ],
    runtimeRequiresInstalledMarker: true,
  },
  {
    version: "202608150001",
    productionRequires: [
      "202608130001",
      "empty_schema_state_infrastructure",
      "reviewed_communication_security_cutover",
    ],
    runtimeRequiresInstalledMarker: true,
  },
  {
    version: "202608200001",
    productionRequires: ["coach_rate_limit_contract", "reviewed_function_owner_and_grants"],
  },
  {
    version: "202608210001",
    productionRequires: ["institution_invitation_shape", "canonical_profile_identity", "reviewed_execute_grant"],
  },
  {
    version: "202608240001",
    productionRequires: ["privileged_catalog_usage_audit", "reviewed_38_12_117_to_27_10_87_diff"],
  },
]);

export const productionObjectProviders = Object.freeze([
  ["reflab_meta.schema", "202608310001"],
  ["reflab_private.schema", "202608310001"],
  ["reflab_meta.reflab_schema_state.table", "202608310001"],
  ["reflab_meta.reject_schema_state_mutation()", "202608310001"],
  ["reflab_meta.reflab_schema_state_immutable", "202608310001"],
  ["reflab_meta.reflab_schema_state.installed_row", "canonical_finalization_future"],
  ["reflab_meta.production_adoption_state.table", "202608310001"],
  ["reflab_meta.guard_production_adoption_state()", "202608310001"],
  ["reflab_meta.production_adoption_state_guard", "202608310001"],
  ["public.referee_exam_sessions.table", "202608310002"],
  ["public.referee_exam_sessions.foreign_keys", "202608310002"],
  ["public.referee_exam_sessions.indexes", "202608310002"],
  ["public.exam_results.exam_session_id", "202608310002"],
  ["public.exam_results.payload_hash", "202608310002"],
  ["public.exam_results.exam_results_payload_hash_check", "202608310002"],
  ["public.exam_results.exam_results_exam_session_unique", "202608310002"],
  ["public.exam_results.exam_results_session_fk", "202608310002"],
  ["public.attempts.source_item_type", "202608310002"],
  ["public.attempts.source_item_id", "202608310002"],
  ["public.attempts.source_occurrence_id", "202608310002"],
  ["public.attempts.institution_assessment_session_id", "202608310002"],
  ["public.attempts.attempts_source_reference_check", "202608310002"],
  ["public.attempts.attempts_source_type_check", "202608310002"],
  ["public.attempts.attempts_adoption_assessment_session_fk", "202608310002"],
  ["public.attempts.attempts_exam_occurrence_unique", "202608310002"],
  ["public.attempts.canonical_payload_hash", "202608130001"],
  ["public.attempts.attempts_canonical_payload_hash_check", "202608130001"],
  ["public.attempts.attempts_exam_source_check", "canonical_exam_cutover_future"],
  ["public.psychology_modules.table", "202608310003"],
  ["public.psychology_modules.canonical_seed_rows", "202608310003"],
  ["public.psychology_module_foreign_keys", "psychology_runtime_cutover_future"],
  ["public.notification_events.deduplication_key", "202608310003"],
  ["public.notification_events.notification_events_deduplication_unique", "202608310003"],
]);

export const deliberatelyDeferredBlockerFamilies = Object.freeze([
  "missing_policies",
  "policy_contract_drift",
  "browser_dml_grants",
  "routine_execute_grants",
  "business_functions",
  "business_triggers",
  "unrelated_indexes",
  "legacy_identity_helper_cutover",
  "semantic_rls_visibility",
  "canonical_marker",
]);
