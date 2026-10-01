export const TRAINING_STAGE_CANONICAL_JSONB_TEXT_ACL_EXTENSION = Object.freeze([
  Object.freeze({
    grantee: "reflab_rls_owner",
    grantor: "postgres",
    privilege_type: "EXECUTE",
    is_grantable: false,
  }),
]);

export const TRAINING_STAGE_SCHEMA_ACL_EXTENSIONS = Object.freeze([
  Object.freeze({
    schema_name: "extensions",
    grantee: "reflab_rls_owner",
    grantor: "postgres",
    privilege_type: "USAGE",
    is_grantable: false,
  }),
  Object.freeze({
    schema_name: "reflab_private",
    grantee: "reflab_rls_owner",
    grantor: "postgres",
    privilege_type: "USAGE",
    is_grantable: false,
  }),
]);

const tablePrivileges = Object.freeze({
  "reflab_meta.reflab_schema_state": Object.freeze(["SELECT"]),
  "public.user_profiles": Object.freeze(["SELECT"]),
  "public.user_global_roles": Object.freeze(["SELECT", "UPDATE"]),
  "public.user_subscriptions": Object.freeze(["SELECT", "UPDATE"]),
  "public.institution_memberships": Object.freeze(["SELECT", "UPDATE"]),
  "public.institutions": Object.freeze(["SELECT", "UPDATE"]),
  "public.institution_subscriptions": Object.freeze(["SELECT", "UPDATE"]),
  "public.clips": Object.freeze(["SELECT"]),
  "public.attempts": Object.freeze(["INSERT", "SELECT"]),
});

export const TRAINING_STAGE_TABLE_ACL = Object.freeze(
  Object.entries(tablePrivileges).flatMap(([relation, privileges]) => {
    const [schema_name, table_name] = relation.split(".");
    return privileges.map((privilege_type) => Object.freeze({
      schema_name,
      table_name,
      grantee: "reflab_rls_owner",
      grantor: "postgres",
      privilege_type,
      is_grantable: false,
    }));
  }),
);

const adminScopeRelations = new Set([
  "reflab_meta.reflab_schema_state",
  "public.user_profiles",
  "public.user_global_roles",
  "public.user_subscriptions",
  "public.access_change_audit",
]);

export const TRAINING_STAGE_ADMIN_SCOPE_TABLE_ACL = Object.freeze(
  TRAINING_STAGE_TABLE_ACL.filter(({ schema_name, table_name }) =>
    adminScopeRelations.has(`${schema_name}.${table_name}`)),
);

export function classifyTrainingProviderStage(checks) {
  if (typeof checks?.trainingProviderAbsent !== "boolean"
      || typeof checks?.canonicalPayloadHashAbsent !== "boolean") {
    return "UNKNOWN";
  }
  if (checks.trainingProviderAbsent && checks.canonicalPayloadHashAbsent) {
    return "PRE_TRAINING";
  }
  if (!checks.trainingProviderAbsent && !checks.canonicalPayloadHashAbsent) {
    return "POST_TRAINING";
  }
  return "INCONSISTENT";
}
