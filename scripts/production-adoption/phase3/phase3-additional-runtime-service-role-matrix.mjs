import { PG17_TABLE_PRIVILEGES } from "./phase3-browser-privilege-matrix.mjs";

const groups = {
  S: "capabilities capability_overrides institution_subscriptions plan_capabilities institution_data_consents institution_membership_permission_overrides institution_permissions institution_role_permissions institution_roles match_context_snapshots referee_eligibility referee_roles",
  I: "ai_usage_ledger coach_evidence platform_audit_logs appointment_history institution_assessment_history institution_audit_logs",
  SI: "fixture_sync_logs institutions performance_checkins performance_sessions physical_tests readiness_scores wellness_logs ifab_library_documents",
  SIU: "appointments competition_categories competition_seasons competitions countries fixtures institution_assessment_assignments institution_assessment_sessions institution_assessments institution_cohorts institution_contents institution_demo_sessions institution_group_memberships institution_groups institution_memberships institution_notification_recipients institutional_clips match_officials notification_preferences notification_tokens teams venues associations clips coach_runs",
  SID: "institution_assessment_items institution_content_assignments institution_notification_campaigns",
  SIUD: "institution_membership_roles",
  SU: "institutional_leads",
  NONE: "coach_rate_limit_buckets",
};
const letters = { S: "SELECT", I: "INSERT", U: "UPDATE", D: "DELETE" };
export const ADDITIONAL_CURRENT_MATRIX = Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([key, names]) =>
  names.split(" ").map((table) => [table, Object.freeze(key === "NONE" ? [] : [...key].map((letter) => letters[letter]))]))));
export const ADDITIONAL_SERVICE_TABLES = Object.freeze(Object.keys(ADDITIONAL_CURRENT_MATRIX).sort());
export const ADDITIONAL_PRIVILEGES = PG17_TABLE_PRIVILEGES;
export const ADDITIONAL_MIGRATION_PATH = "supabase/migrations/20261013131628_production_adoption_additional_runtime_service_role_privilege_reconciliation.sql";
export const ADDITIONAL_OBSERVATION = Object.freeze({
  status: "OBSERVED_CURRENT_PRODUCTION_ADJUDICATED_INPUT",
  forensicHead: "95a8809ce1db3b088f4bd13beace04182217e700",
  evidenceSha256: "56af017f8e98fe32d3f829f6e88cd8473bcdeea3e6c2d46c3292bec9f849a15c",
  classification: "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE",
  approval: "NOT_PERFORMED", mutationCount: 0,
});
const noBrowser = new Set("ai_usage_ledger coach_evidence coach_rate_limit_buckets coach_runs institutional_leads platform_audit_logs".split(" "));
const authenticatedOnly = new Set("associations capabilities capability_overrides clips ifab_library_documents institution_subscriptions plan_capabilities".split(" "));
export function additionalMatrix(post = false) {
  return ADDITIONAL_SERVICE_TABLES.flatMap((table) => ADDITIONAL_PRIVILEGES.map((privilege) => ({
    schema: "public", table, role: "service_role", privilege,
    granted: !post || ADDITIONAL_CURRENT_MATRIX[table].includes(privilege),
  })));
}
// This is an explicit expansion of the archived ACL observation, not a fixture-derived target.
export function additionalAcls(post = false) {
  return ADDITIONAL_SERVICE_TABLES.flatMap((table) => {
    const roles = { postgres: ADDITIONAL_PRIVILEGES, reflab_prod_preflight_ro: ["SELECT"],
      service_role: post ? ADDITIONAL_CURRENT_MATRIX[table] : ADDITIONAL_PRIVILEGES };
    if (!noBrowser.has(table)) {
      roles.authenticated = ADDITIONAL_PRIVILEGES;
      if (!authenticatedOnly.has(table)) roles.anon = ADDITIONAL_PRIVILEGES;
    }
    if (["clips", "institution_memberships", "institution_subscriptions", "institutions"].includes(table))
      roles.reflab_rls_owner = table === "clips" ? ["SELECT"] : ["SELECT", "UPDATE"];
    return Object.entries(roles).flatMap(([grantee, privileges]) => privileges.map((privilege) =>
      ({ schema: "public", table, grantee, grantor: "postgres", privilege, grantable: false })));
  });
}
export function additionalBrowserMatrix() {
  const grants = new Set(additionalAcls().map((a) => `${a.table}:${a.grantee}:${a.privilege}`));
  return ADDITIONAL_SERVICE_TABLES.flatMap((table) => ["anon", "authenticated"].flatMap((role) =>
    ADDITIONAL_PRIVILEGES.map((privilege) => ({ schema: "public", table, role, privilege,
      granted: grants.has(`${table}:${role}:${privilege}`) }))));
}
export function additionalAccounting() {
  const before = additionalMatrix(), after = additionalMatrix(true);
  const revoked = before.filter((r, i) => r.granted && !after[i].granted);
  const granted = after.filter((r, i) => r.granted && !before[i].granted);
  const unchanged = before.filter((r, i) => r.granted === after[i].granted);
  const statements = ADDITIONAL_SERVICE_TABLES.map((table) =>
    `revoke ${revoked.filter((r) => r.table === table).map((r) => r.privilege.toLowerCase()).join(", ")} on table public.${table} from service_role;`);
  return { revoked, granted, unchanged, statements, totalCells: before.length,
    preGrantedCells: before.filter((r) => r.granted).length, preAbsentCells: before.filter((r) => !r.granted).length,
    postGrantedCells: after.filter((r) => r.granted).length, postAbsentCells: after.filter((r) => !r.granted).length,
    privilegeEntryRevocations: revoked.length, privilegeEntryGrants: granted.length, unchangedCells: unchanged.length,
    sqlRevokeStatements: statements.filter((s) => s.startsWith("revoke ")).length, sqlGrantStatements: 0 };
}
export const FUTURE_COACH_ONLY = Object.freeze(["SELECT", "INSERT", "UPDATE"]);
