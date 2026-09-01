export const PHASE2B_MIGRATIONS = Object.freeze([
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
  "202608310004_production_adoption_semantic_audit.sql",
  "202608310005_production_adoption_canonical_runtime_prerequisites.sql",
  "202608110001_canonical_admin_user_access.sql",
  "202608130001_canonical_training_attempts.sql",
  "202608150001_canonical_communication_feedback.sql",
  "202608310006_production_adoption_canonical_runtime_installed.sql",
]);

export const PHASE2B_FORBIDDEN_MIGRATIONS = Object.freeze([
  "202607300001_clerk_identity_links.sql",
  "202608030001_development_identity_resolution.sql",
  "202608110002_development_super_admin_identity_link.sql",
]);

export const PHASE2B_RUNTIME_RPCS = Object.freeze([
  "public.admin_set_canonical_user_plan(text,text,text,text)",
  "public.admin_set_canonical_global_role(text,text,text,text)",
  "public.submit_canonical_training_attempt(text,uuid,jsonb,integer)",
  "public.submit_canonical_communication_feedback(text,uuid,text,jsonb)",
]);

export const PHASE2B_DEVELOPMENT_RPCS = Object.freeze([
  "public.resolve_development_clerk_identity(text)",
  "public.link_development_clerk_identity(text)",
  "public.link_development_super_admin_clerk_identity(text)",
]);

export const PHASE2B_OBJECT_PROVIDERS = Object.freeze({
  "reflab_private.canonical_jsonb_text(jsonb)": "202608310005",
  "public.admin_set_canonical_user_plan(text,text,text,text)": "202608110001",
  "public.admin_set_canonical_global_role(text,text,text,text)": "202608110001",
  "public.attempts.canonical_payload_hash": "202608130001",
  "public.attempts.attempts_canonical_payload_hash_check": "202608130001",
  "public.submit_canonical_training_attempt(text,uuid,jsonb,integer)": "202608130001",
  "public.attempts.attempts_source_type_check.communication_feedback": "202608150001",
  "public.submit_canonical_communication_feedback(text,uuid,text,jsonb)": "202608150001",
  "reflab_meta.production_adoption_state.canonical_objects": "202608310006",
});

export const PHASE2B_DEPENDENCY_GRAPH = Object.freeze([
  {
    migration: "202608310005",
    requires: [
      "Phase 1 ledger through phase 3",
      "empty reflab_schema_state",
      "Phase 2A semantic audit sidecar",
      "safe reflab_rls_owner",
      "pgcrypto digest and UUID functions",
      "nullable Exam/Training/Notification prerequisites",
    ],
    provides: ["canonical JSON normalization helper"],
  },
  {
    migration: "202608110001",
    requires: ["canonical access tables", "safe reflab_rls_owner", "Phase 2B helper gate"],
    provides: ["Admin policies", "two disabled Admin RPCs"],
  },
  {
    migration: "202608130001",
    requires: [
      "nullable attempt source tuple",
      "canonical JSON helper",
      "canonical access and institution tables",
      "clips",
    ],
    provides: ["canonical payload hash column/check", "Training policies", "disabled Training RPC"],
  },
  {
    migration: "202608150001",
    requires: ["202608130001", "legacy-safe attempts_source_type_check"],
    provides: ["communication_feedback source type", "disabled Communication RPC"],
  },
  {
    migration: "202608310006",
    requires: ["all Phase 2B functions and security contracts", "empty canonical marker"],
    provides: ["Phase 4 canonical_objects adoption transition"],
  },
]);

export const PHASE2B_HISTORICAL_COUNTS = Object.freeze({
  attempts: 37,
  examResults: 6,
  notificationEvents: 60,
});
