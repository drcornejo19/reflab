import { createHash } from "node:crypto";
import { identityColumns } from "../../production-preflight/manifest.mjs";

export const SEMANTIC_AUDIT_OWNER = "reflab_preflight_audit_owner";
export const SEMANTIC_AUDIT_CALLER = "reflab_prod_preflight_ro";
export const SEMANTIC_AUDIT_SCHEMA = "reflab_audit";
export const SEMANTIC_AUDIT_FUNCTION = "reflab_audit.production_semantic_snapshot()";
export const SEMANTIC_AUDIT_POLICY = "reflab_preflight_audit_owner_read";
export const SEMANTIC_AUDIT_QUERY_ID = "semantic_audit_snapshot";

export const SEMANTIC_AUDIT_DOMAIN_QUERY_IDS = Object.freeze([
  "attempt_semantics",
  "scoring_versions",
  "exam_integrity",
  "legacy_access",
  "institution_catalog",
  "institution_tenant_integrity",
  "matches_tenant_integrity",
  "fixture_creator_identity",
  "notification_integrity",
]);

export const semanticAuditIdentityQueryIds = Object.freeze(
  Object.entries(identityColumns).flatMap(([table, columns]) => {
    const [schema, relation] = table.split(".");
    return columns.map((column) => `identity_${schema}_${relation}_${column}`);
  }),
);

export const SEMANTIC_AUDIT_REPLACED_QUERY_IDS = Object.freeze([
  ...SEMANTIC_AUDIT_DOMAIN_QUERY_IDS,
  ...semanticAuditIdentityQueryIds,
]);

export const semanticAuditTableColumns = Object.freeze({
  "public.access_change_audit": ["actor_user_id", "target_user_id"],
  "public.ai_usage_ledger": ["user_id"],
  "public.appointment_history": ["changed_by_user_id", "user_id"],
  "public.appointments": ["created_by_user_id", "id", "institution_id", "user_id"],
  "public.attempts": ["criterion_result", "exam_result_id", "id", "score", "source_item_type", "user_id"],
  "public.capability_overrides": ["assigned_by_user_id", "user_id"],
  "public.coach_data_consents": ["user_id"],
  "public.coach_rate_limit_buckets": ["user_id"],
  "public.coach_runs": ["user_id"],
  "public.exam_results": ["exam_session_id", "id", "submission_id", "user_id"],
  "public.fixtures": ["id", "raw_source_reference"],
  "public.ifab_library_documents": ["uploaded_by"],
  "public.institution_assessment_assignments": ["assigned_by_user_id", "user_id"],
  "public.institution_assessment_history": ["actor_user_id"],
  "public.institution_assessment_sessions": ["user_id"],
  "public.institution_assessments": ["created_by_user_id"],
  "public.institution_audit_logs": ["actor_user_id"],
  "public.institution_cohorts": ["created_by_user_id"],
  "public.institution_content_assignments": ["assigned_by_user_id", "user_id"],
  "public.institution_data_consents": ["user_id"],
  "public.institution_demo_sessions": ["user_id"],
  "public.institution_group_memberships": ["group_id", "institution_id", "membership_id"],
  "public.institution_groups": ["created_by_user_id", "id", "institution_id"],
  "public.institution_members": ["user_id"],
  "public.institution_membership_permission_overrides": ["assigned_by_user_id", "institution_id", "membership_id"],
  "public.institution_membership_roles": ["assigned_by_user_id", "institution_id", "membership_id"],
  "public.institution_memberships": ["id", "institution_id", "invited_by_user_id", "status", "user_id"],
  "public.institution_notification_campaigns": ["created_by_user_id"],
  "public.institution_notification_recipients": ["user_id"],
  "public.institution_permissions": ["permission_key"],
  "public.institution_role_permissions": ["role_id"],
  "public.institution_roles": ["id", "institution_id", "role_key"],
  "public.institutional_clips": ["uploaded_by"],
  "public.institutional_lead_activities": ["actor_user_id"],
  "public.institutional_leads": ["converted_by_user_id", "owner_user_id"],
  "public.institutions": ["created_by_user_id"],
  "public.match_officials": ["user_id"],
  "public.match_preparations": ["user_id"],
  "public.notification_events": ["id", "user_id"],
  "public.notification_preferences": ["id", "user_id"],
  "public.notification_tokens": ["id", "token", "user_id"],
  "public.performance_checkins": ["user_id"],
  "public.performance_sessions": ["user_id"],
  "public.physical_tests": ["user_id"],
  "public.platform_audit_logs": ["actor_user_id"],
  "public.post_match_reviews": ["user_id"],
  "public.psychology_checkins": ["user_id"],
  "public.psychology_exercise_sessions": ["user_id"],
  "public.psychology_wellbeing_assessments": ["user_id"],
  "public.readiness_scores": ["user_id"],
  "public.referee_eligibility": ["user_id"],
  "public.referee_exam_sessions": ["id", "submission_id", "user_id"],
  "public.rules_exam_results": ["user_id"],
  "public.user_global_roles": ["assigned_by_user_id", "role_key", "source", "user_id"],
  "public.user_profiles": ["user_id"],
  "public.user_roles": ["user_id"],
  "public.user_subscriptions": ["assigned_by_user_id", "source", "user_id"],
  "public.wellness_logs": ["user_id"],
});

export const semanticAuditTables = Object.freeze(Object.keys(semanticAuditTableColumns).sort());

export const semanticAuditExpectedFields = Object.freeze({
  attempt_semantics: ["training", "official", "official_orphans", "official_owner_mismatches", "invalid_communication_feedback"],
  scoring_versions: ["legacy_unversioned_training", "legacy_unversioned_official", "field_applicable_v2_training", "field_applicable_v2_official", "unknown_training", "unknown_official"],
  exam_integrity: ["results_without_session", "session_owner_mismatches", "session_submission_mismatches"],
  legacy_access: ["user_roles", "automatic_default_global_roles", "automatic_default_subscriptions", "unknown_global_roles"],
  institution_catalog: ["permissions", "system_roles", "system_relations", "forbidden_roles"],
  institution_tenant_integrity: ["membership_role_mismatches", "group_membership_mismatches", "permission_override_mismatches"],
  matches_tenant_integrity: ["institutional_appointments_without_active_membership"],
  fixture_creator_identity: ["creator_refs", "user_subject_refs", "profile_backed_refs", "unresolved_profile_refs"],
  notification_integrity: ["token_owner_conflicts", "events_without_profile", "preferences_without_profile"],
  identity_reference_integrity: ["total_non_null", "user_subject_ids", "profile_backed_ids", "unresolved_profile_refs"],
});

function identityCountsSql() {
  return Object.entries(identityColumns).flatMap(([table, columns]) =>
    columns.map((column) => `      select
        pg_catalog.count(${column})::bigint as total_non_null,
        pg_catalog.count(${column}) filter (where ${column} like 'user\\_%' escape '\\')::bigint as user_subject_ids,
        pg_catalog.count(${column}) filter (
          where ${column} is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.${column})
        )::bigint as profile_backed_ids,
        pg_catalog.count(${column}) filter (
          where ${column} is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.${column})
        )::bigint as unresolved_profile_refs
      from ${table} source`),
  ).join("\n      union all\n");
}

export function semanticAuditFunctionSource() {
  return `
  select pg_catalog.jsonb_build_object(
    'attempt_semantics', (
      select pg_catalog.jsonb_build_object(
        'training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null),
        'official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null),
        'official_orphans', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and exam_result.id is null),
        'official_owner_mismatches', pg_catalog.count(attempt_row.id) filter (where exam_result.id is not null and exam_result.user_id <> attempt_row.user_id),
        'invalid_communication_feedback', pg_catalog.count(attempt_row.id) filter (
          where attempt_row.source_item_type = 'communication_feedback'
            and (attempt_row.exam_result_id is not null or attempt_row.score is not null)
        )
      )
      from public.attempts attempt_row
      left join public.exam_results exam_result on exam_result.id = attempt_row.exam_result_id
    ),
    'scoring_versions', (
      select pg_catalog.jsonb_build_object(
        'legacy_unversioned_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>'scoring_version', '') is null),
        'legacy_unversioned_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>'scoring_version', '') is null),
        'field_applicable_v2_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and attempt_row.criterion_result->>'scoring_version' = 'field_applicable_v2'),
        'field_applicable_v2_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and attempt_row.criterion_result->>'scoring_version' = 'field_applicable_v2'),
        'unknown_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>'scoring_version', '') is not null and attempt_row.criterion_result->>'scoring_version' <> 'field_applicable_v2'),
        'unknown_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>'scoring_version', '') is not null and attempt_row.criterion_result->>'scoring_version' <> 'field_applicable_v2')
      ) from public.attempts attempt_row
    ),
    'exam_integrity', (
      select pg_catalog.jsonb_build_object(
        'results_without_session', pg_catalog.count(exam_result.id) filter (where exam_session.id is null),
        'session_owner_mismatches', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.user_id <> exam_result.user_id),
        'session_submission_mismatches', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.submission_id <> exam_result.submission_id)
      )
      from public.exam_results exam_result
      left join public.referee_exam_sessions exam_session on exam_session.id = exam_result.exam_session_id
    ),
    'legacy_access', pg_catalog.jsonb_build_object(
      'user_roles', (select pg_catalog.count(user_id) from public.user_roles),
      'automatic_default_global_roles', (select pg_catalog.count(user_id) from public.user_global_roles where source = 'automatic_default'),
      'automatic_default_subscriptions', (select pg_catalog.count(user_id) from public.user_subscriptions where source = 'automatic_default'),
      'unknown_global_roles', (select pg_catalog.count(user_id) from public.user_global_roles where role_key not in ('super_admin', 'referee'))
    ),
    'institution_catalog', pg_catalog.jsonb_build_object(
      'permissions', (select pg_catalog.count(permission_key) from public.institution_permissions),
      'system_roles', (select pg_catalog.count(id) from public.institution_roles where institution_id is null),
      'system_relations', (select pg_catalog.count(relation.role_id) from public.institution_role_permissions relation join public.institution_roles role on role.id = relation.role_id where role.institution_id is null),
      'forbidden_roles', (select pg_catalog.count(id) from public.institution_roles where role_key in ('physical_trainer', 'institution_psychologist', 'super_admin', 'video_admin', 'institutional_instructor', 'institutional_student', 'individual_referee'))
    ),
    'institution_tenant_integrity', pg_catalog.jsonb_build_object(
      'membership_role_mismatches', (select pg_catalog.count(role_link.membership_id) from public.institution_membership_roles role_link join public.institution_memberships membership on membership.id = role_link.membership_id where role_link.institution_id <> membership.institution_id),
      'group_membership_mismatches', (select pg_catalog.count(group_link.membership_id) from public.institution_group_memberships group_link join public.institution_groups group_row on group_row.id = group_link.group_id join public.institution_memberships membership on membership.id = group_link.membership_id where group_link.institution_id <> group_row.institution_id or group_link.institution_id <> membership.institution_id),
      'permission_override_mismatches', (select pg_catalog.count(override_row.membership_id) from public.institution_membership_permission_overrides override_row join public.institution_memberships membership on membership.id = override_row.membership_id where override_row.institution_id <> membership.institution_id)
    ),
    'matches_tenant_integrity', (
      select pg_catalog.jsonb_build_object(
        'institutional_appointments_without_active_membership', pg_catalog.count(appointment.id)
      )
      from public.appointments appointment
      left join public.institution_memberships membership
        on membership.institution_id = appointment.institution_id
       and membership.user_id = appointment.user_id
       and membership.status = 'active'
      where appointment.institution_id is not null and membership.id is null
    ),
    'fixture_creator_identity', (
      select pg_catalog.jsonb_build_object(
        'creator_refs', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>'created_by', '') is not null),
        'user_subject_refs', pg_catalog.count(fixture.id) filter (where fixture.raw_source_reference->>'created_by' like 'user\\_%' escape '\\'),
        'profile_backed_refs', pg_catalog.count(fixture.id) filter (where profile.user_id is not null),
        'unresolved_profile_refs', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>'created_by', '') is not null and profile.user_id is null)
      )
      from public.fixtures fixture
      left join public.user_profiles profile on profile.user_id = fixture.raw_source_reference->>'created_by'
    ),
    'notification_integrity', pg_catalog.jsonb_build_object(
      'token_owner_conflicts', coalesce((select pg_catalog.count(token) from (select token from public.notification_tokens group by token having pg_catalog.count(distinct user_id) > 1) conflict), 0),
      'events_without_profile', (select pg_catalog.count(event.id) from public.notification_events event left join public.user_profiles profile on profile.user_id = event.user_id where profile.user_id is null),
      'preferences_without_profile', (select pg_catalog.count(preference.id) from public.notification_preferences preference left join public.user_profiles profile on profile.user_id = preference.user_id where profile.user_id is null)
    ),
    'identity_reference_integrity', (
      select pg_catalog.jsonb_build_object(
        'total_non_null', coalesce(pg_catalog.sum(identity_count.total_non_null), 0),
        'user_subject_ids', coalesce(pg_catalog.sum(identity_count.user_subject_ids), 0),
        'profile_backed_ids', coalesce(pg_catalog.sum(identity_count.profile_backed_ids), 0),
        'unresolved_profile_refs', coalesce(pg_catalog.sum(identity_count.unresolved_profile_refs), 0)
      )
      from (
${identityCountsSql()}
      ) identity_count
    )
  );
`;
}

export const SEMANTIC_AUDIT_SOURCE_HASH = createHash("sha256")
  .update(semanticAuditFunctionSource().trim(), "utf8")
  .digest("hex");

function quotedArray(values) {
  return `array[${values.map((value) => `'${value}'`).join(", ")}]::text[]`;
}

function grantStatements() {
  return Object.entries(semanticAuditTableColumns).map(([table, columns]) =>
    `grant select (${columns.join(", ")}) on table ${table} to ${SEMANTIC_AUDIT_OWNER};`,
  ).join("\n");
}

function policyStatements() {
  return semanticAuditTables.map((table) =>
    `create policy ${SEMANTIC_AUDIT_POLICY}\n  on ${table}\n  as permissive for select\n  to ${SEMANTIC_AUDIT_OWNER}\n  using (true);`,
  ).join("\n\n");
}

export function generateSemanticAuditMigration() {
  const tableArray = quotedArray(semanticAuditTables);
  const columnArray = quotedArray(Object.entries(semanticAuditTableColumns).flatMap(([table, columns]) =>
    columns.map((column) => `${table}.${column}`),
  ));
  return `-- Production adoption Phase 2A: aggregate-only semantic audit bridge.
-- This migration is local/review-only until the Production adoption gates authorize it.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  installer record;
  caller record;
  missing_table text;
  missing_column text;
begin
  select rolsuper, rolcreaterole into installer
  from pg_catalog.pg_roles where rolname = current_user;
  if not found or not (installer.rolsuper or installer.rolcreaterole) then
    raise exception 'Semantic audit installer requires reviewed role-management capability'
      using errcode = '42501';
  end if;

  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  into caller from pg_catalog.pg_roles where rolname = '${SEMANTIC_AUDIT_CALLER}';
  if not found or not caller.rolcanlogin or caller.rolsuper or caller.rolcreatedb
     or caller.rolcreaterole or caller.rolinherit or caller.rolbypassrls then
    raise exception 'Production preflight caller is absent or unsafe' using errcode = '55000';
  end if;

  if pg_catalog.to_regrole('${SEMANTIC_AUDIT_OWNER}') is not null
     or pg_catalog.to_regnamespace('${SEMANTIC_AUDIT_SCHEMA}') is not null
     or pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}') is not null then
    raise exception 'Semantic audit infrastructure is not in the reviewed absent state'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or not exists (
       select 1 from reflab_meta.production_adoption_state
       where phase_order = 3 and phase_key = 'psychology_notification_prerequisites'
     ) then
    raise exception 'Reviewed Phase 1 bridge is required before semantic audit adoption'
      using errcode = '55000';
  end if;

  select expected_table into missing_table
  from unnest(${tableArray}) expected_table
  where pg_catalog.to_regclass(expected_table) is null
  limit 1;
  if missing_table is not null then
    raise exception 'Semantic audit dependency table is missing' using errcode = '55000';
  end if;

  select expected_column into missing_column
  from unnest(${columnArray}) expected_column
  where not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = pg_catalog.to_regclass(
      pg_catalog.split_part(expected_column, '.', 1) || '.' || pg_catalog.split_part(expected_column, '.', 2)
    )
      and attribute.attname = pg_catalog.split_part(expected_column, '.', 3)
      and attribute.attnum > 0
      and not attribute.attisdropped
  )
  limit 1;
  if missing_column is not null then
    raise exception 'Semantic audit dependency column is missing' using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(${tableArray}) expected_table
    join pg_catalog.pg_class relation on relation.oid = pg_catalog.to_regclass(expected_table)
    where not relation.relrowsecurity
       or relation.relowner = (select oid from pg_catalog.pg_roles where rolname = '${SEMANTIC_AUDIT_OWNER}')
  ) then
    raise exception 'Semantic audit requires RLS-enabled, independently owned product tables'
      using errcode = '55000';
  end if;
end
$preflight$;

create role ${SEMANTIC_AUDIT_OWNER}
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

do $membership$
begin
  execute pg_catalog.format('grant ${SEMANTIC_AUDIT_OWNER} to %I', current_user);
end
$membership$;

create schema ${SEMANTIC_AUDIT_SCHEMA} authorization current_user;
revoke all on schema ${SEMANTIC_AUDIT_SCHEMA}
  from public, anon, authenticated, service_role, reflab_rls_owner;
grant usage on schema public to ${SEMANTIC_AUDIT_OWNER};
grant usage on schema ${SEMANTIC_AUDIT_SCHEMA} to ${SEMANTIC_AUDIT_OWNER}, ${SEMANTIC_AUDIT_CALLER};

${grantStatements()}

${policyStatements()}

create function ${SEMANTIC_AUDIT_FUNCTION}
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $semantic_audit$${semanticAuditFunctionSource()}$semantic_audit$;

alter function ${SEMANTIC_AUDIT_FUNCTION} owner to ${SEMANTIC_AUDIT_OWNER};
revoke all on function ${SEMANTIC_AUDIT_FUNCTION}
  from public, anon, authenticated, service_role, reflab_rls_owner;
grant execute on function ${SEMANTIC_AUDIT_FUNCTION} to ${SEMANTIC_AUDIT_CALLER};

do $membership_cleanup$
begin
  execute pg_catalog.format('revoke ${SEMANTIC_AUDIT_OWNER} from %I', current_user);
end
$membership_cleanup$;

do $assertions$
declare
  owner_state record;
  expected_policy_count constant integer := ${semanticAuditTables.length};
begin
  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  into owner_state from pg_catalog.pg_roles where rolname = '${SEMANTIC_AUDIT_OWNER}';
  if not found or owner_state.rolcanlogin or owner_state.rolsuper or owner_state.rolcreatedb
     or owner_state.rolcreaterole or owner_state.rolinherit or owner_state.rolbypassrls then
    raise exception 'Semantic audit owner attributes are unsafe' using errcode = '55000';
  end if;

  if pg_catalog.pg_has_role('${SEMANTIC_AUDIT_CALLER}', '${SEMANTIC_AUDIT_OWNER}', 'MEMBER')
     or exists (
       select 1 from pg_catalog.pg_auth_members membership
       join pg_catalog.pg_roles owner_role on owner_role.oid = membership.member
       where owner_role.rolname = '${SEMANTIC_AUDIT_OWNER}'
     ) then
    raise exception 'Semantic audit role membership is unsafe' using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_policy policy
      join pg_catalog.pg_class relation on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where policy.polname = '${SEMANTIC_AUDIT_POLICY}'
        and namespace.nspname || '.' || relation.relname = any (${tableArray})
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[(select oid from pg_catalog.pg_roles where rolname = '${SEMANTIC_AUDIT_OWNER}')]
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) in ('true', '(true)')
        and policy.polwithcheck is null) <> expected_policy_count then
    raise exception 'Semantic audit policy contract is incomplete' using errcode = '55000';
  end if;

  if exists (
    select 1 from unnest(${tableArray}) expected_table
    where pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'INSERT')
       or pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'UPDATE')
       or pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'DELETE')
       or pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'TRUNCATE')
       or pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'REFERENCES')
       or pg_catalog.has_table_privilege('${SEMANTIC_AUDIT_OWNER}', expected_table, 'TRIGGER')
  ) then
    raise exception 'Semantic audit owner inherited an unsafe product-table privilege'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege('${SEMANTIC_AUDIT_CALLER}', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc function_state
       cross join lateral pg_catalog.aclexplode(
         coalesce(function_state.proacl, pg_catalog.acldefault('f'::"char", function_state.proowner))
       ) function_acl
       where function_state.oid = pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}')
         and function_acl.grantee = 0
         and function_acl.privilege_type = 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE')
     or pg_catalog.has_function_privilege('reflab_rls_owner', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE') then
    raise exception 'Semantic audit function execution grants are unsafe' using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3 then
    raise exception 'Semantic audit must not advance canonical or adoption markers'
      using errcode = '55000';
  end if;
end
$assertions$;

commit;
`;
}
