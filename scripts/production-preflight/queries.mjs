import { createHash } from "node:crypto";
import {
  canonicalObjectManifest,
  criticalColumns,
  identityColumns,
  MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION,
  REQUIRED_IN_PRODUCTION,
} from "./manifest.mjs";
import {
  expectedTriggerDefinition,
  expressionHash,
  indexDefinitionParts,
  normalizeFunctionSource,
  normalizeSqlExpression,
  normalizeTriggerDefinition,
} from "./canonical-contracts.mjs";

export const RESULT_FRAME_PREFIX = "REFLAB_PREFLIGHT_V1";

const jsonQuery = (id, payloadSql, requires = {}) => {
  const envelopeSql = `pg_catalog.json_build_object('query', '${id}', 'payload', ${payloadSql})::text`;
  return {
    id,
    requires,
    sql: `select '${RESULT_FRAME_PREFIX}' || pg_catalog.chr(9) || '${id}' || pg_catalog.chr(9) ||
      pg_catalog.translate(
        pg_catalog.encode(pg_catalog.convert_to(${envelopeSql}, 'UTF8'), 'base64'),
        pg_catalog.chr(10) || pg_catalog.chr(13),
        ''
      )`,
  };
};

export const READ_ONLY_GUARD_QUERY_ID = "read_only_guard";

export const catalogGateQuery = jsonQuery(
  "catalog_gate",
  `pg_catalog.json_build_object(
    'schemas', (select coalesce(pg_catalog.json_agg(n.nspname order by n.nspname), '[]'::json) from pg_catalog.pg_namespace n),
    'tables', (select coalesce(pg_catalog.json_agg(x.name order by x.name), '[]'::json) from (
      select n.nspname || '.' || c.relname as name
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
    ) x),
    'columns', (select coalesce(pg_catalog.json_agg(x.name order by x.name), '[]'::json) from (
      select table_schema || '.' || table_name || '.' || column_name as name
      from information_schema.columns
    ) x)
  )`
);

export const baseInventoryQueries = [
  catalogGateQuery,
  jsonQuery("session_roles", "pg_catalog.json_build_object('current_user', current_user, 'session_user', session_user)"),
  jsonQuery(
    "connection_role_security",
    `coalesce((select pg_catalog.row_to_json(x) from (
      select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
      from pg_catalog.pg_roles where rolname = current_user
    ) x), 'null'::json)`
  ),
  jsonQuery(
    "connection_effective_writes",
    `pg_catalog.json_build_object(
      'schemas_with_create', coalesce((select pg_catalog.json_agg(n.nspname order by n.nspname)
        from pg_catalog.pg_namespace n
        where n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
          and pg_catalog.has_schema_privilege(current_user, n.oid, 'CREATE')), '[]'::json),
      'tables_with_dml', coalesce((select pg_catalog.json_agg(x.object_name order by x.object_name) from (
        select n.nspname || '.' || c.relname as object_name
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p') and n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
          and (pg_catalog.has_table_privilege(current_user, c.oid, 'INSERT')
            or pg_catalog.has_table_privilege(current_user, c.oid, 'UPDATE')
            or pg_catalog.has_table_privilege(current_user, c.oid, 'DELETE')
            or pg_catalog.has_table_privilege(current_user, c.oid, 'TRUNCATE')
            or pg_catalog.has_table_privilege(current_user, c.oid, 'REFERENCES')
            or pg_catalog.has_table_privilege(current_user, c.oid, 'TRIGGER'))
      ) x), '[]'::json),
      'sequences_with_write', coalesce((select pg_catalog.json_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'S' and n.nspname in ('public', 'reflab_private', 'reflab_meta')
          and (pg_catalog.has_sequence_privilege(current_user, c.oid, 'USAGE')
            or pg_catalog.has_sequence_privilege(current_user, c.oid, 'UPDATE'))), '[]'::json)
    )`
  ),
  jsonQuery(
    "rls_owner",
    `coalesce((select pg_catalog.row_to_json(x) from (
      select rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
      from pg_catalog.pg_roles where rolname = 'reflab_rls_owner'
    ) x), 'null'::json)`
  ),
  jsonQuery(
    "function_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.signature) from (
      select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        coalesce((select setting from unnest(p.proconfig) setting where setting like 'search_path=%' limit 1), '') as search_path,
        p.prosrc as source_definition
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'reflab_private', 'reflab_meta')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "rls_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name) from (
      select n.nspname as schema_name, c.relname as table_name,
        c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "p5_direct_identity_readers",
    `coalesce((select pg_catalog.json_agg(x order by x.signature) from (
      select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        pg_catalog.strpos(lower(pg_catalog.pg_get_functiondef(p.oid)), 'request.jwt.claims') > 0 as reads_request_jwt_claims,
        lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'auth[.]jwt[[:space:]]*[(]' as calls_auth_jwt,
        pg_catalog.regexp_replace(lower(pg_catalog.pg_get_functiondef(p.oid)), '[[:space:]]', '', 'g') like '%->>''sub''%' as reads_sub_claim,
        pg_catalog.strpos(lower(pg_catalog.pg_get_functiondef(p.oid)), 'request.jwt.claim.sub') > 0 as reads_direct_sub_setting,
        lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'auth[.]uid[[:space:]]*[(]' as calls_auth_uid,
        lower(pg_catalog.pg_get_functiondef(p.oid)) ~ '(external_subject|external_user_id|clerk_subject|jwt_subject)' as mentions_external_identity,
        lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'reflab_private[.]user_identity_links' as references_identity_links,
        lower(pg_catalog.pg_get_functiondef(p.oid)) ~ '(return[[:space:]]+[^;]*(external_subject|external_user_id|clerk_subject|jwt_subject)|coalesce[(][^;]*(external_subject|external_user_id|clerk_subject|jwt_subject))' as external_subject_fallback
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'reflab_private') and p.prokind = 'f'
        and (
          pg_catalog.strpos(lower(pg_catalog.pg_get_functiondef(p.oid)), 'request.jwt.claims') > 0
          or lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'auth[.]jwt[[:space:]]*[(]'
          or pg_catalog.regexp_replace(lower(pg_catalog.pg_get_functiondef(p.oid)), '[[:space:]]', '', 'g') like '%->>''sub''%'
          or pg_catalog.strpos(lower(pg_catalog.pg_get_functiondef(p.oid)), 'request.jwt.claim.sub') > 0
          or lower(pg_catalog.pg_get_functiondef(p.oid)) ~ 'auth[.]uid[[:space:]]*[(]'
          or lower(pg_catalog.pg_get_functiondef(p.oid)) ~ '(external_subject|external_user_id|clerk_subject|jwt_subject)'
        )
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "policy_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.policy_name) from (
      select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name,
        case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as permissive,
        (select pg_catalog.array_agg(case when role_oid = 0 then 'public' else pg_catalog.pg_get_userbyid(role_oid) end order by role_oid)
          from unnest(p.polroles) role_oid) as roles,
        case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as cmd,
        pg_catalog.pg_get_expr(p.polqual, p.polrelid, false) as using_expression,
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false) as with_check_expression
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "trigger_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.trigger_name) from (
      select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
        t.tgenabled as enabled_state,
        fn_ns.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as function_executed,
        (case when (t.tgtype & 2) <> 0 then 'BEFORE' when (t.tgtype & 64) <> 0 then 'INSTEAD OF' else 'AFTER' end) || ' ' ||
          pg_catalog.array_to_string(array_remove(array[
            case when (t.tgtype & 4) <> 0 then 'INSERT' end,
            case when (t.tgtype & 8) <> 0 then 'DELETE' end,
            case when (t.tgtype & 16) <> 0 then 'UPDATE' end,
            case when (t.tgtype & 32) <> 0 then 'TRUNCATE' end
          ], null), ' OR ') as timing_and_events,
        case when (t.tgtype & 1) <> 0 then 'ROW' else 'STATEMENT' end as orientation,
        pg_catalog.pg_get_triggerdef(t.oid, false) as trigger_definition
      from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace fn_ns on fn_ns.oid = p.pronamespace
      where not t.tgisinternal and n.nspname in ('public', 'reflab_private', 'reflab_meta')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "index_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.index_name) from (
      select n.nspname as schema_name, table_class.relname as table_name,
        index_class.relname as index_name, index_state.indisunique as unique,
        pg_catalog.pg_get_indexdef(index_class.oid) as index_definition,
        (select pg_catalog.json_agg(pg_catalog.pg_get_indexdef(index_class.oid, position, true) order by position)
          from pg_catalog.generate_series(1, index_state.indnkeyatts) position) as columns,
        pg_catalog.pg_get_expr(index_state.indpred, index_state.indrelid, false) as predicate
      from pg_catalog.pg_index index_state
      join pg_catalog.pg_class index_class on index_class.oid = index_state.indexrelid
      join pg_catalog.pg_class table_class on table_class.oid = index_state.indrelid
      join pg_catalog.pg_namespace n on n.oid = table_class.relnamespace
      where n.nspname in ('public', 'reflab_private', 'reflab_meta')
        and not exists (
          select 1 from pg_catalog.pg_constraint constraint_state
          where constraint_state.conindid = index_class.oid
        )
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "unique_constraint_inventory",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.columns) from (
      select n.nspname as schema_name, table_class.relname as table_name,
        constraint_state.conname as constraint_name,
        pg_catalog.array_agg(attribute.attname order by key_column.ordinality) as columns
      from pg_catalog.pg_constraint constraint_state
      join pg_catalog.pg_class table_class on table_class.oid = constraint_state.conrelid
      join pg_catalog.pg_namespace n on n.oid = table_class.relnamespace
      join lateral unnest(constraint_state.conkey) with ordinality as key_column(attribute_number, ordinality) on true
      join pg_catalog.pg_attribute attribute
        on attribute.attrelid = table_class.oid and attribute.attnum = key_column.attribute_number
      where constraint_state.contype = 'u' and n.nspname in ('public', 'reflab_private', 'reflab_meta')
      group by n.nspname, table_class.relname, constraint_state.conname
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "table_grants",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.object_name, x.grantee, x.privilege) from (
      select n.nspname as schema_name, c.relname as object_name,
        case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
        acl.privilege_type as privilege
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault(case when c.relkind = 'S' then 'S'::\"char\" else 'r'::\"char\" end, c.relowner))) acl
      where c.relkind in ('r', 'p') and n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "schema_grants",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.grantee, x.privilege) from (
      select n.nspname as schema_name,
        case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
        acl.privilege_type as privilege
      from pg_catalog.pg_namespace n
      cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n'::\"char\", n.nspowner))) acl
      where n.nspname in ('public', 'reflab_private', 'reflab_meta', 'storage')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "routine_grants",
    `coalesce((select pg_catalog.json_agg(x order by x.signature, x.grantee, x.privilege) from (
      select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
        case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
        acl.privilege_type as privilege
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f'::\"char\", p.proowner))) acl
      where n.nspname in ('public', 'reflab_private', 'reflab_meta')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "sequence_grants",
    `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.sequence_name, x.grantee, x.privilege) from (
      select n.nspname as schema_name, c.relname as sequence_name,
        case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
        acl.privilege_type as privilege
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('S'::\"char\", c.relowner))) acl
      where c.relkind = 'S' and n.nspname in ('public', 'reflab_private', 'reflab_meta')
    ) x), '[]'::json)`
  ),
  jsonQuery(
    "role_memberships",
    `coalesce((with recursive inherited_roles as (
      select root.rolname as effective_for, root.oid as role_oid,
        root.rolname::text as inheritance_path
      from pg_catalog.pg_roles root where root.rolname in ('anon', 'authenticated', 'service_role')
      union
      select inherited.effective_for, membership.roleid,
        inherited.inheritance_path || ' -> ' || granted.rolname
      from inherited_roles inherited
      join pg_catalog.pg_auth_members membership on membership.member = inherited.role_oid
      join pg_catalog.pg_roles granted on granted.oid = membership.roleid
      where pg_catalog.strpos(inherited.inheritance_path, ' -> ' || granted.rolname) = 0
    )
    select pg_catalog.json_agg(x order by x.effective_for, x.inheritance_path) from (
      select inherited.effective_for, granted.rolname as granted_role,
        inherited.inheritance_path
      from inherited_roles inherited
      join pg_catalog.pg_roles granted on granted.oid = inherited.role_oid
      where inherited.inheritance_path <> inherited.effective_for
    ) x), '[]'::json)`
  ),
];

export const semanticQueries = [
  jsonQuery(
    "migration_history",
    `coalesce((select pg_catalog.json_agg(x order by x.version) from (
      select version, name from supabase_migrations.schema_migrations
    ) x), '[]'::json)`,
    { tables: ["supabase_migrations.schema_migrations"], columns: ["supabase_migrations.schema_migrations.version", "supabase_migrations.schema_migrations.name"] }
  ),
  jsonQuery(
    "identity_link_structure",
    `pg_catalog.json_build_object(
      'provider_count', count(distinct l.provider),
      'link_count', count(*),
      'distinct_external_subjects', count(distinct l.external_subject),
      'distinct_canonical_users', count(distinct l.user_id),
      'duplicate_external_subjects', coalesce((select count(*) from (select provider, external_subject from reflab_private.user_identity_links group by provider, external_subject having count(*) > 1) d), 0),
      'duplicate_canonical_users', coalesce((select count(*) from (select provider, user_id from reflab_private.user_identity_links group by provider, user_id having count(*) > 1) d), 0),
      'links_without_profile', count(*) filter (where p.user_id is null),
      'profiles_with_multiple_links', coalesce((select count(*) from (select user_id from reflab_private.user_identity_links group by user_id having count(*) > 1) d), 0)
    ) from reflab_private.user_identity_links l
      left join public.user_profiles p on p.user_id = l.user_id`,
    {
      tables: ["reflab_private.user_identity_links", "public.user_profiles"],
      columns: [
        ...criticalColumns["reflab_private.user_identity_links"].map((column) => `reflab_private.user_identity_links.${column}`),
        "public.user_profiles.user_id",
      ],
    }
  ),
  jsonQuery(
    "attempt_semantics",
    `pg_catalog.json_build_object(
      'training', count(*) filter (where a.exam_result_id is null),
      'official', count(*) filter (where a.exam_result_id is not null),
      'official_orphans', count(*) filter (where a.exam_result_id is not null and e.id is null),
      'official_owner_mismatches', count(*) filter (where e.id is not null and e.user_id <> a.user_id),
      'invalid_communication_feedback', count(*) filter (where a.source_item_type = 'communication_feedback' and (a.exam_result_id is not null or a.score is not null))
    ) from public.attempts a left join public.exam_results e on e.id = a.exam_result_id`,
    { tables: ["public.attempts", "public.exam_results"], columns: ["public.attempts.user_id", "public.attempts.exam_result_id", "public.attempts.source_item_type", "public.attempts.score", "public.exam_results.id", "public.exam_results.user_id"] }
  ),
  jsonQuery(
    "scoring_versions",
    `coalesce((select pg_catalog.json_agg(x order by x.scoring_version, x.official) from (
      select coalesce(criterion_result->>'scoring_version', 'legacy_unversioned') as scoring_version,
        exam_result_id is not null as official, count(*) as row_count
      from public.attempts group by 1, 2
    ) x), '[]'::json)`,
    { tables: ["public.attempts"], columns: ["public.attempts.criterion_result", "public.attempts.exam_result_id"] }
  ),
  jsonQuery(
    "exam_integrity",
    `pg_catalog.json_build_object(
      'results_without_session', count(*) filter (where s.id is null),
      'session_owner_mismatches', count(*) filter (where s.id is not null and s.user_id <> e.user_id),
      'session_submission_mismatches', count(*) filter (where s.id is not null and s.submission_id <> e.submission_id)
    ) from public.exam_results e left join public.referee_exam_sessions s on s.id = e.exam_session_id`,
    { tables: ["public.exam_results", "public.referee_exam_sessions"], columns: ["public.exam_results.user_id", "public.exam_results.exam_session_id", "public.exam_results.submission_id", "public.referee_exam_sessions.id", "public.referee_exam_sessions.user_id", "public.referee_exam_sessions.submission_id"] }
  ),
  jsonQuery(
    "legacy_access",
    `pg_catalog.json_build_object(
      'user_roles', (select count(*) from public.user_roles),
      'automatic_default_global_roles', (select count(*) from public.user_global_roles where source = 'automatic_default'),
      'automatic_default_subscriptions', (select count(*) from public.user_subscriptions where source = 'automatic_default'),
      'unknown_global_roles', (select count(*) from public.user_global_roles where role_key not in ('super_admin', 'referee'))
    )`,
    { tables: ["public.user_roles", "public.user_global_roles", "public.user_subscriptions"], columns: ["public.user_global_roles.source", "public.user_global_roles.role_key", "public.user_subscriptions.source"] }
  ),
  jsonQuery(
    "institution_catalog",
    `pg_catalog.json_build_object(
      'permissions', (select count(*) from public.institution_permissions),
      'system_roles', (select count(*) from public.institution_roles where institution_id is null),
      'system_relations', (select count(*) from public.institution_role_permissions rp join public.institution_roles r on r.id = rp.role_id where r.institution_id is null),
      'forbidden_roles', (select count(*) from public.institution_roles where role_key in ('physical_trainer', 'institution_psychologist', 'super_admin', 'video_admin', 'institutional_instructor', 'institutional_student', 'individual_referee'))
    )`,
    { tables: ["public.institution_permissions", "public.institution_roles", "public.institution_role_permissions"], columns: ["public.institution_roles.id", "public.institution_roles.institution_id", "public.institution_roles.role_key", "public.institution_role_permissions.role_id"] }
  ),
  jsonQuery(
    "institution_tenant_integrity",
    `pg_catalog.json_build_object(
      'membership_role_mismatches', (select count(*) from public.institution_membership_roles mr join public.institution_memberships m on m.id = mr.membership_id where mr.institution_id <> m.institution_id),
      'group_membership_mismatches', (select count(*) from public.institution_group_memberships gm join public.institution_groups g on g.id = gm.group_id join public.institution_memberships m on m.id = gm.membership_id where gm.institution_id <> g.institution_id or gm.institution_id <> m.institution_id),
      'permission_override_mismatches', (select count(*) from public.institution_membership_permission_overrides o join public.institution_memberships m on m.id = o.membership_id where o.institution_id <> m.institution_id)
    )`,
    { tables: ["public.institution_membership_roles", "public.institution_memberships", "public.institution_group_memberships", "public.institution_groups", "public.institution_membership_permission_overrides"], columns: ["public.institution_membership_roles.institution_id", "public.institution_membership_roles.membership_id", "public.institution_memberships.id", "public.institution_memberships.institution_id", "public.institution_group_memberships.institution_id", "public.institution_group_memberships.group_id", "public.institution_group_memberships.membership_id", "public.institution_groups.id", "public.institution_groups.institution_id", "public.institution_membership_permission_overrides.institution_id", "public.institution_membership_permission_overrides.membership_id"] }
  ),
  jsonQuery(
    "matches_tenant_integrity",
    `pg_catalog.json_build_object(
      'institutional_appointments_without_active_membership', count(*)
    ) from public.appointments a
      left join public.institution_memberships m on m.institution_id = a.institution_id and m.user_id = a.user_id and m.status = 'active'
      where a.institution_id is not null and m.id is null`,
    { tables: ["public.appointments", "public.institution_memberships"], columns: ["public.appointments.institution_id", "public.appointments.user_id", "public.institution_memberships.id", "public.institution_memberships.institution_id", "public.institution_memberships.user_id", "public.institution_memberships.status"] }
  ),
  jsonQuery(
    "fixture_creator_identity",
    `pg_catalog.json_build_object(
      'candidate_clerk_refs', count(*) filter (where f.raw_source_reference->>'created_by' like 'user\\_%' escape '\\'),
      'mapped_clerk_refs', count(*) filter (where l.external_subject is not null)
    ) from public.fixtures f left join reflab_private.user_identity_links l
      on l.provider = 'clerk' and l.external_subject = f.raw_source_reference->>'created_by'`,
    { tables: ["public.fixtures", "reflab_private.user_identity_links"], columns: ["public.fixtures.raw_source_reference", "reflab_private.user_identity_links.provider", "reflab_private.user_identity_links.external_subject"] }
  ),
  jsonQuery(
    "notification_integrity",
    `pg_catalog.json_build_object(
      'token_owner_conflicts', coalesce((select count(*) from (select token from public.notification_tokens group by token having count(distinct user_id) > 1) conflicts), 0),
      'events_without_profile', (select count(*) from public.notification_events e left join public.user_profiles p on p.user_id = e.user_id where p.user_id is null),
      'preferences_without_profile', (select count(*) from public.notification_preferences n left join public.user_profiles p on p.user_id = n.user_id where p.user_id is null)
    )`,
    { tables: ["public.notification_tokens", "public.notification_events", "public.notification_preferences", "public.user_profiles"], columns: ["public.notification_tokens.token", "public.notification_tokens.user_id", "public.notification_events.user_id", "public.notification_preferences.user_id", "public.user_profiles.user_id"] }
  ),
  jsonQuery(
    "storage_buckets",
    `coalesce((select pg_catalog.json_agg(x order by x.id) from (
      select id, public, file_size_limit, allowed_mime_types from storage.buckets
    ) x), '[]'::json)`,
    { tables: ["storage.buckets"], columns: ["storage.buckets.id", "storage.buckets.public", "storage.buckets.file_size_limit", "storage.buckets.allowed_mime_types"] }
  ),
  jsonQuery(
    "storage_object_counts",
    `coalesce((select pg_catalog.json_agg(x order by x.bucket_id) from (
      select bucket_id, count(*) as object_count,
        sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end) as total_bytes,
        count(*) filter (where metadata->>'size' is not null and metadata->>'size' !~ '^[0-9]+$') as invalid_size_metadata
      from storage.objects group by bucket_id
    ) x), '[]'::json)`,
    { tables: ["storage.objects"], columns: ["storage.objects.bucket_id", "storage.objects.metadata"] }
  ),
  jsonQuery(
    "storage_object_policies",
    `coalesce((select pg_catalog.json_agg(x order by x.policy_name) from (
      select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name,
        case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as permissive,
        (select pg_catalog.array_agg(case when role_oid = 0 then 'public' else pg_catalog.pg_get_userbyid(role_oid) end order by role_oid)
          from unnest(p.polroles) role_oid) as roles,
        case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as cmd,
        pg_catalog.pg_get_expr(p.polqual, p.polrelid, false) as using_expression,
        pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false) as with_check_expression
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class c on c.oid = p.polrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'
    ) x), '[]'::json)`
  ),
];

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe manifest identifier.");
  return `"${value}"`;
}

export function buildIdentityQueries({ includeLinks }) {
  const queries = [];
  for (const [qualifiedTable, columns] of Object.entries(identityColumns)) {
    const [schema, table] = qualifiedTable.split(".");
    for (const column of columns) {
      const id = `identity_${schema}_${table}_${column}`;
      const tableSql = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
      const columnSql = `t.${quoteIdentifier(column)}`;
      const basePayload = `pg_catalog.json_build_object(
        'total_non_null', count(*) filter (where ${columnSql} is not null),
        'candidate_user_prefix', count(*) filter (where ${columnSql} like 'user\\_%' escape '\\')`;
      const linkedPayload = includeLinks
        ? `,
        'mapped_external_subjects', count(*) filter (where l.external_subject is not null),
        'canonical_profiles', count(*) filter (where p.user_id is not null),
        'unresolved_candidates', count(*) filter (where ${columnSql} like 'user\\_%' escape '\\' and l.external_subject is null and p.user_id is null)`
        : "";
      const joins = includeLinks
        ? ` left join reflab_private.user_identity_links l on l.provider = 'clerk' and l.external_subject = ${columnSql}
            left join public.user_profiles p on p.user_id = ${columnSql}`
        : "";
      const requirements = {
        tables: [qualifiedTable],
        columns: [`${qualifiedTable}.${column}`],
      };
      if (includeLinks) {
        requirements.tables.push("reflab_private.user_identity_links", "public.user_profiles");
        requirements.columns.push(
          "reflab_private.user_identity_links.provider",
          "reflab_private.user_identity_links.external_subject",
          "public.user_profiles.user_id"
        );
      }
      queries.push(jsonQuery(id, `${basePayload}${linkedPayload}) from ${tableSql} t${joins}`, requirements));
    }
  }
  return queries;
}

export function queryDependenciesExist(query, catalog) {
  const tables = new Set(catalog.tables ?? []);
  const columns = new Set(catalog.columns ?? []);
  return (
    (query.requires.tables ?? []).every((table) => tables.has(table)) &&
    (query.requires.columns ?? []).every((column) => columns.has(column))
  );
}

export function buildSqlBatch(queries) {
  const readOnlyGuard = jsonQuery(
    READ_ONLY_GUARD_QUERY_ID,
    "pg_catalog.current_setting('transaction_read_only')"
  );
  const statements = [
    "begin read only",
    "set local statement_timeout = '15s'",
    "set local lock_timeout = '2s'",
    "show default_transaction_read_only",
    "show transaction_read_only",
    "select current_user, session_user",
    readOnlyGuard.sql,
    ...queries.map((query) => query.sql),
    "rollback",
  ];
  return `${statements.join(";\n")};\n`;
}

function compareInventoryLegacy(results) {
  const functionInventory = results.get("function_inventory") ?? [];
  const triggerInventory = results.get("trigger_inventory") ?? [];
  const indexInventory = results.get("index_inventory") ?? [];
  const uniqueConstraintInventory = results.get("unique_constraint_inventory") ?? [];
  const policyInventory = results.get("policy_inventory") ?? [];
  const routineGrants = results.get("routine_grants") ?? [];
  const roleMemberships = results.get("role_memberships") ?? [];
  const catalog = results.get("catalog_gate") ?? { tables: [], columns: [] };
  const bucketInventory = results.get("storage_buckets") ?? [];

  const actualFunctions = new Set(functionInventory.map((entry) => entry.signature));
  const actualTriggers = new Set(triggerInventory.map((entry) => `${entry.schema_name}.${entry.table_name}.${entry.trigger_name}`));
  const actualIndexes = new Set(indexInventory.map((entry) => `${entry.schema_name}.${entry.table_name}.${entry.index_name}`));
  const actualUniqueConstraints = new Set(uniqueConstraintInventory.map((entry) =>
    `${entry.schema_name}.${entry.table_name}|${[...(entry.columns ?? [])].join(",")}`
  ));
  const actualPolicies = new Set(policyInventory.map((entry) => `${entry.schema_name}.${entry.table_name}.${entry.policy_name}`));
  const actualTables = new Set(catalog.tables ?? []);
  const actualColumns = new Set(catalog.columns ?? []);
  const actualBuckets = new Set(bucketInventory.map((entry) => entry.id));
  const functionBySignature = new Map(functionInventory.map((entry) => [entry.signature, entry]));
  const triggerByKey = new Map(triggerInventory.map((entry) => [`${entry.schema_name}.${entry.table_name}.${entry.trigger_name}`, entry]));
  const policyByKey = new Map(policyInventory.map((entry) => [`${entry.schema_name}.${entry.table_name}.${entry.policy_name}`, entry]));
  const indexByKey = new Map(indexInventory.map((entry) => [`${entry.schema_name}.${entry.table_name}.${entry.index_name}`, entry]));
  const bucketById = new Map(bucketInventory.map((entry) => [entry.id, entry]));
  const expectedFunctions = new Set(canonicalObjectManifest.functions.map((entry) => entry.signature));
  const expectedPolicies = new Set(canonicalObjectManifest.policies.map((entry) => `${entry.schema}.${entry.table}.${entry.name}`));
  const expectedTriggers = new Set(canonicalObjectManifest.triggers.map((entry) => `${entry.table}.${entry.name}`));
  const expectedIndexes = new Set(canonicalObjectManifest.explicitIndexes.map((entry) => `${entry.table}.${entry.name}`));
  const expectedUniqueConstraints = new Set(canonicalObjectManifest.uniques.map((entry) =>
    `${entry.table}|${entry.columns.join(",")}`
  ));
  const expectedBuckets = new Set(canonicalObjectManifest.buckets.map((entry) => entry.id));
  const applicationExecuteGrantees = new Set(["PUBLIC", "anon", "authenticated", "service_role"]);
  const executableDevelopmentRpcs = MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.filter((signature) =>
    actualFunctions.has(signature) && routineGrants.some((grant) =>
      grant.signature === signature && grant.privilege === "EXECUTE" && (
        applicationExecuteGrantees.has(grant.grantee) || roleMemberships.some((membership) =>
          applicationExecuteGrantees.has(membership.effective_for) && membership.granted_role === grant.grantee
        )
      )
    )
  );
  const sharedFunctionContractDrift = canonicalObjectManifest.functions.flatMap((expected) => {
    if (expected.scope !== "shared" || !functionBySignature.has(expected.signature)) return [];
    const actual = functionBySignature.get(expected.signature);
    const actualSearchPath = String(actual.search_path ?? "").replace(/^search_path=/, "");
    if (actual.security === expected.security && actualSearchPath === expected.search_path) return [];
    return [{
      signature: expected.signature,
      expectedSecurity: expected.security,
      actualSecurity: actual.security,
      expectedSearchPath: expected.search_path,
      actualSearchPath,
    }];
  });
  const policyContractDrift = canonicalObjectManifest.policies.flatMap((expected) => {
    if (expected.scope !== "shared") return [];
    const key = `${expected.schema}.${expected.table}.${expected.name}`;
    const actual = policyByKey.get(key);
    if (!actual) return [];
    const actualRoles = [...(actual.roles ?? [])].sort();
    const expectedRoles = [...(expected.roles ?? [])].sort();
    const matches = actual.cmd === expected.command && actual.permissive === expected.mode &&
      JSON.stringify(actualRoles) === JSON.stringify(expectedRoles);
    return matches ? [] : [{
      policy: key,
      expected: { command: expected.command, mode: expected.mode, roles: expectedRoles },
      actual: { command: actual.cmd, mode: actual.permissive, roles: actualRoles },
    }];
  });
  const triggerContractDrift = canonicalObjectManifest.triggers.flatMap((expected) => {
    const key = `${expected.table}.${expected.name}`;
    const actual = triggerByKey.get(key);
    if (!actual || (actual.enabled_state === "O" && actual.function_executed === expected.function)) return [];
    return [{
      trigger: key,
      expectedFunction: expected.function,
      actualFunction: actual.function_executed,
      enabledState: actual.enabled_state,
    }];
  });
  const bucketContractDrift = canonicalObjectManifest.buckets.flatMap((expected) => {
    const actual = bucketById.get(expected.id);
    if (!actual) return [];
    const actualMimes = [...(actual.allowed_mime_types ?? [])].sort();
    const expectedMimes = [...(expected.allowed_mime_types ?? [])].sort();
    const matches = actual.public === expected.public &&
      Number(actual.file_size_limit) === expected.file_size_limit_bytes &&
      JSON.stringify(actualMimes) === JSON.stringify(expectedMimes);
    return matches ? [] : [{
      bucket: expected.id,
      expected: {
        public: expected.public,
        fileSizeLimit: expected.file_size_limit_bytes,
        allowedMimeTypes: expectedMimes,
      },
      actual: {
        public: actual.public,
        fileSizeLimit: actual.file_size_limit,
        allowedMimeTypes: actualMimes,
      },
    }];
  });
  const indexContractDrift = canonicalObjectManifest.explicitIndexes.flatMap((expected) => {
    const key = `${expected.table}.${expected.name}`;
    const actual = indexByKey.get(key);
    if (!actual || Boolean(actual.unique) === expected.unique) return [];
    return [{ index: key, expectedUnique: expected.unique, actualUnique: Boolean(actual.unique) }];
  });

  const missingTables = canonicalObjectManifest.tables.filter((name) => !actualTables.has(name));
  const missingCriticalColumns = Object.entries(canonicalObjectManifest.criticalColumns).flatMap(([table, columns]) =>
    columns.filter((column) => !actualColumns.has(`${table}.${column}`)).map((column) => `${table}.${column}`)
  );
  const missingSharedFunctions = canonicalObjectManifest.functions
    .filter((entry) => entry.scope === "shared" && !actualFunctions.has(entry.signature))
    .map((entry) => entry.signature);
  const missingRequiredProductionRpcs = REQUIRED_IN_PRODUCTION.filter((signature) => !actualFunctions.has(signature));
  const missingPolicies = canonicalObjectManifest.policies
    .filter((entry) => entry.scope === "shared" && !actualPolicies.has(`${entry.schema}.${entry.table}.${entry.name}`))
    .map((entry) => `${entry.schema}.${entry.table}.${entry.name}`);
  const missingTriggers = canonicalObjectManifest.triggers
    .filter((entry) => !actualTriggers.has(`${entry.table}.${entry.name}`))
    .map((entry) => `${entry.table}.${entry.name}`);
  const missingIndexes = canonicalObjectManifest.explicitIndexes
    .filter((entry) => !actualIndexes.has(`${entry.table}.${entry.name}`))
    .map((entry) => `${entry.table}.${entry.name}`);
  const missingUniqueConstraints = canonicalObjectManifest.uniques
    .filter((entry) => !actualUniqueConstraints.has(`${entry.table}|${entry.columns.join(",")}`))
    .map((entry) => `${entry.table}(${entry.columns.join(",")})`);
  const missingBuckets = canonicalObjectManifest.buckets
    .filter((entry) => !actualBuckets.has(entry.id))
    .map((entry) => entry.id);
  const objectBlockers = [
    ...missingTables.map((object) => ({ type: "MISSING_TABLE", object })),
    ...missingCriticalColumns.map((object) => ({ type: "MISSING_CRITICAL_COLUMN", object })),
    ...missingSharedFunctions.map((object) => ({ type: "MISSING_FUNCTION", object })),
    ...missingRequiredProductionRpcs.map((object) => ({ type: "MISSING_REQUIRED_RPC", object })),
    ...sharedFunctionContractDrift.map((entry) => ({ type: "FUNCTION_CONTRACT_DRIFT", object: entry.signature })),
    ...executableDevelopmentRpcs.map((object) => ({ type: "EXECUTABLE_DEVELOPMENT_RPC", object })),
    ...missingPolicies.map((object) => ({ type: "MISSING_POLICY", object })),
    ...policyContractDrift.map((entry) => ({ type: "POLICY_CONTRACT_DRIFT", object: entry.policy })),
    ...missingTriggers.map((object) => ({ type: "MISSING_TRIGGER", object })),
    ...triggerContractDrift.map((entry) => ({ type: "TRIGGER_CONTRACT_DRIFT", object: entry.trigger })),
    ...missingIndexes.map((object) => ({ type: "MISSING_INDEX", object })),
    ...indexContractDrift.map((entry) => ({ type: "INDEX_CONTRACT_DRIFT", object: entry.index })),
    ...missingUniqueConstraints.map((object) => ({ type: "MISSING_UNIQUE_CONSTRAINT", object })),
    ...missingBuckets.map((object) => ({ type: "MISSING_BUCKET", object })),
    ...bucketContractDrift.map((entry) => ({ type: "BUCKET_CONTRACT_DRIFT", object: entry.bucket })),
  ];

  return {
    sanity: {
      approvalCriterion: false,
      expected: canonicalObjectManifest.sanityCounts,
      actual: {
        tables: [...actualTables].filter((name) => name.startsWith("public.") || name.startsWith("reflab_")).length,
        functions: functionInventory.length,
        policies: policyInventory.length,
        triggers: triggerInventory.length,
        indexes: indexInventory.length,
      },
    },
    approvalBasis: "OBJECT_BY_OBJECT",
    objectBlockers,
    missingTables,
    missingCriticalColumns,
    missingSharedFunctions,
    missingRequiredProductionRpcs,
    sharedFunctionContractDrift,
    developmentRpcInventory: MUST_BE_ABSENT_OR_NONEXECUTABLE_IN_PRODUCTION.filter((signature) => actualFunctions.has(signature)),
    executableDevelopmentRpcs,
    forbiddenDevelopmentFunctions: executableDevelopmentRpcs,
    missingPolicies,
    policyContractDrift,
    missingTriggers,
    triggerContractDrift,
    missingIndexes,
    indexContractDrift,
    missingUniqueConstraints,
    missingBuckets,
    bucketContractDrift,
    extraHistoricalObjects: {
      disposition: "INVENTORY_ONLY_UNLESS_CONFLICTING",
      tables: [...actualTables]
        .filter((name) => (name.startsWith("public.") || name.startsWith("reflab_")) && !canonicalObjectManifest.tables.includes(name)),
      functions: [...actualFunctions].filter((signature) => !expectedFunctions.has(signature)),
      policies: [...actualPolicies].filter((key) => !expectedPolicies.has(key)),
      triggers: [...actualTriggers].filter((key) => !expectedTriggers.has(key)),
      indexes: [...actualIndexes].filter((key) => !expectedIndexes.has(key)),
      uniqueConstraints: [...actualUniqueConstraints].filter((key) => !expectedUniqueConstraints.has(key)),
      buckets: [...actualBuckets].filter((id) => !expectedBuckets.has(id)),
    },
  };
}

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
export const hashFunctionSource = (value) => sha256(normalizeFunctionSource(value));
const policyKey = (entry) => `${entry.schema_name ?? entry.schema}.${entry.table_name ?? entry.table}.${entry.policy_name ?? entry.name}`;
const tableKey = (entry) => `${entry.schema_name}.${entry.table_name}`;
const searchPathValue = (value) => String(value ?? "").replace(/^search_path=/, "").trim();

function inheritedApplicationRoles(grantee, memberships) {
  const roles = new Set();
  if (["PUBLIC", "public"].includes(grantee)) for (const role of ["public", "anon", "authenticated"]) roles.add(role);
  else if (["anon", "authenticated"].includes(grantee)) roles.add(grantee);
  for (const membership of memberships) {
    if (membership.granted_role === grantee && ["anon", "authenticated"].includes(membership.effective_for)) {
      roles.add(membership.effective_for);
    }
  }
  return roles;
}

function compareGrantContracts(results) {
  const tableGrants = results.get("table_grants") ?? [];
  const schemaGrants = results.get("schema_grants") ?? [];
  const routineGrants = results.get("routine_grants") ?? [];
  const sequenceGrants = results.get("sequence_grants") ?? [];
  const memberships = results.get("role_memberships") ?? [];
  const blockers = [];
  const expectedTablePrivileges = new Set();
  const expectedSchemaUsage = new Set(["authenticated|reflab_private"]);

  for (const policy of canonicalObjectManifest.policies.filter((entry) => entry.scope === "shared")) {
    const privilege = policy.command === "ALL" ? null : policy.command;
    if (!privilege) continue;
    for (const role of policy.roles ?? []) {
      if (["public", "anon", "authenticated"].includes(role.toLowerCase())) {
        const normalizedRole = role.toLowerCase();
        const effectiveRoles = normalizedRole === "public" ? ["public", "anon", "authenticated"] : [normalizedRole];
        for (const effectiveRole of effectiveRoles) {
          expectedTablePrivileges.add(`${effectiveRole}|${policy.schema}.${policy.table}|${privilege}`);
          expectedSchemaUsage.add(`${effectiveRole}|${policy.schema}`);
        }
      }
    }
  }

  const actualTablePrivileges = new Set();
  for (const grant of tableGrants) {
    const roots = inheritedApplicationRoles(grant.grantee, memberships);
    for (const root of roots) {
      const normalizedRoot = root.toLowerCase() === "public" ? "public" : root;
      const key = `${normalizedRoot}|${grant.schema_name}.${grant.object_name}|${grant.privilege}`;
      actualTablePrivileges.add(key);
      if (["INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].includes(grant.privilege) &&
          !expectedTablePrivileges.has(key)) {
        blockers.push({
          code: "BLOCKER_UNEXPECTED_BROWSER_DML",
          role: normalizedRoot,
          object: `${grant.schema_name}.${grant.object_name}`,
          privilege: grant.privilege,
        });
      }
    }
  }
  for (const expected of expectedTablePrivileges) {
    if (!actualTablePrivileges.has(expected)) {
      const [role, object, privilege] = expected.split("|");
      blockers.push({ code: "BLOCKER_MISSING_CANONICAL_TABLE_GRANT", role, object, privilege });
    }
  }

  const actualSchemaUsage = new Set();
  for (const grant of schemaGrants) {
    for (const root of inheritedApplicationRoles(grant.grantee, memberships)) {
      if (grant.privilege === "CREATE") {
        blockers.push({
          code: "BLOCKER_UNEXPECTED_SCHEMA_CREATE",
          role: root,
          object: grant.schema_name,
          privilege: grant.privilege,
        });
      } else if (grant.privilege === "USAGE") {
        const key = `${root}|${grant.schema_name}`;
        actualSchemaUsage.add(key);
        if (!expectedSchemaUsage.has(key)) {
          blockers.push({
            code: "BLOCKER_UNEXPECTED_SCHEMA_USAGE",
            role: root,
            object: grant.schema_name,
            privilege: grant.privilege,
          });
        }
      }
    }
  }
  for (const expected of expectedSchemaUsage) {
    if (!actualSchemaUsage.has(expected)) {
      const [role, object] = expected.split("|");
      blockers.push({ code: "BLOCKER_MISSING_CANONICAL_SCHEMA_USAGE", role, object, privilege: "USAGE" });
    }
  }
  for (const grant of sequenceGrants) {
    for (const root of inheritedApplicationRoles(grant.grantee, memberships)) {
      blockers.push({
        code: "BLOCKER_UNEXPECTED_BROWSER_SEQUENCE_PRIVILEGE",
        role: root,
        object: `${grant.schema_name}.${grant.sequence_name}`,
        privilege: grant.privilege,
      });
    }
  }

  const authenticatedHelpers = new Set([
    "reflab_private.request_user_id()",
    "reflab_private.is_super_admin()",
    "reflab_private.has_active_institution_membership(uuid)",
    "reflab_private.has_institution_permission(uuid, text)",
    "reflab_private.can_access_user_data(text, uuid, text)",
  ]);
  for (const grant of routineGrants.filter((entry) => entry.privilege === "EXECUTE")) {
    const roots = inheritedApplicationRoles(grant.grantee, memberships);
    for (const root of roots) {
      const allowed = root === "authenticated" && authenticatedHelpers.has(grant.signature);
      if (!allowed) {
        blockers.push({
          code: "BLOCKER_UNEXPECTED_ROUTINE_EXECUTE",
          role: root,
          object: grant.signature,
          privilege: "EXECUTE",
        });
      }
    }
    if (REQUIRED_IN_PRODUCTION.includes(grant.signature) && grant.grantee !== "service_role") {
      blockers.push({
        code: "BLOCKER_SENSITIVE_RPC_EXECUTE",
        role: grant.grantee,
        object: grant.signature,
        privilege: "EXECUTE",
      });
    }
  }
  for (const signature of REQUIRED_IN_PRODUCTION) {
    const serviceExecute = routineGrants.some((grant) =>
      grant.signature === signature && grant.grantee === "service_role" && grant.privilege === "EXECUTE"
    );
    if (!serviceExecute) blockers.push({ code: "BLOCKER_MISSING_SERVICE_ROLE_EXECUTE", object: signature });
  }
  return blockers;
}

export function compareInventoryWithManifest(results) {
  const legacy = compareInventoryLegacy(results);
  const functionInventory = results.get("function_inventory") ?? [];
  const policyInventory = results.get("policy_inventory") ?? [];
  const rlsInventory = results.get("rls_inventory") ?? [];
  const triggerInventory = results.get("trigger_inventory") ?? [];
  const indexInventory = results.get("index_inventory") ?? [];
  const directIdentityReaders = results.get("p5_direct_identity_readers") ?? [];
  const functionBySignature = new Map(functionInventory.map((entry) => [entry.signature, entry]));
  const policyByKey = new Map(policyInventory.map((entry) => [policyKey(entry), entry]));
  const rlsByTable = new Map(rlsInventory.map((entry) => [tableKey(entry), entry]));
  const triggerByKey = new Map(triggerInventory.map((entry) => [`${entry.schema_name}.${entry.table_name}.${entry.trigger_name}`, entry]));
  const indexByKey = new Map(indexInventory.map((entry) => [`${entry.schema_name}.${entry.table_name}.${entry.index_name}`, entry]));

  const rlsContractDrift = canonicalObjectManifest.rls.flatMap((expected) => {
    const actual = rlsByTable.get(expected.table);
    if (!actual) return [{ code: "BLOCKER_RLS_INVENTORY_MISSING", table: expected.table }];
    if (expected.enabled && !actual.rls_enabled) return [{ code: "BLOCKER_RLS_DISABLED", table: expected.table }];
    if (Boolean(actual.rls_forced) !== expected.forced) {
      return [{ code: "BLOCKER_RLS_FORCE_DRIFT", table: expected.table, expected: expected.forced, actual: Boolean(actual.rls_forced) }];
    }
    return [];
  });

  const policyContractDrift = canonicalObjectManifest.policies
    .filter((expected) => expected.scope === "shared")
    .flatMap((expected) => {
      const key = `${expected.schema}.${expected.table}.${expected.name}`;
      const actual = policyByKey.get(key);
      if (!actual) return [];
      const expectedRoles = [...(expected.roles ?? [])].map((role) => role.toLowerCase()).sort();
      const actualRoles = [...(actual.roles ?? [])].map((role) => role.toLowerCase()).sort();
      const actualUsingHash = expressionHash(actual.using_expression);
      const actualWithCheckHash = expressionHash(actual.with_check_expression);
      const matches = actual.cmd === expected.command && actual.permissive === expected.mode &&
        JSON.stringify(actualRoles) === JSON.stringify(expectedRoles) &&
        actualUsingHash === expected.usingExpressionHash &&
        actualWithCheckHash === expected.withCheckExpressionHash;
      return matches ? [] : [{
        code: "BLOCKER_POLICY_CONTRACT_DRIFT",
        policy: key,
        expected: {
          command: expected.command,
          mode: expected.mode,
          roles: expectedRoles,
          usingExpressionHash: expected.usingExpressionHash,
          withCheckExpressionHash: expected.withCheckExpressionHash,
        },
        actual: {
          command: actual.cmd,
          mode: actual.permissive,
          roles: actualRoles,
          usingExpressionHash: actualUsingHash,
          withCheckExpressionHash: actualWithCheckHash,
        },
      }];
    });

  const functionContractDrift = canonicalObjectManifest.functions
    .filter((expected) => expected.scope === "shared" || expected.signature === "reflab_private.request_user_id()" || REQUIRED_IN_PRODUCTION.includes(expected.signature))
    .flatMap((expected) => {
      const actual = functionBySignature.get(expected.signature);
      if (!actual) return [];
      const actualSourceHash = actual.source_hash ?? hashFunctionSource(actual.source_definition);
      const matches = actual.security === expected.security &&
        searchPathValue(actual.search_path) === expected.search_path &&
        actual.owner === expected.owner && actualSourceHash === expected.sourceHash;
      return matches ? [] : [{
        code: "BLOCKER_FUNCTION_CONTRACT_DRIFT",
        signature: expected.signature,
        expected: { security: expected.security, searchPath: expected.search_path, owner: expected.owner, sourceHash: expected.sourceHash },
        actual: { security: actual.security, searchPath: searchPathValue(actual.search_path), owner: actual.owner, sourceHash: actualSourceHash },
      }];
    });

  const identityFallbackBlockers = directIdentityReaders
    .filter((entry) => entry.external_subject_fallback || (
      entry.signature === "reflab_private.request_user_id()" && !entry.references_identity_links && (
        entry.reads_request_jwt_claims || entry.calls_auth_jwt || entry.reads_sub_claim ||
        entry.reads_direct_sub_setting || entry.calls_auth_uid
      )
    ))
    .map((entry) => ({
      code: entry.signature === "reflab_private.request_user_id()"
        ? "BLOCKER_LEGACY_IDENTITY_FALLBACK"
        : "BLOCKER_EXTERNAL_IDENTITY_FALLBACK",
      signature: entry.signature,
    }));

  const triggerContractDrift = canonicalObjectManifest.triggers.flatMap((expected) => {
    const key = `${expected.table}.${expected.name}`;
    const actual = triggerByKey.get(key);
    if (!actual) return [];
    const expectedDefinition = expectedTriggerDefinition(expected);
    const actualDefinition = normalizeTriggerDefinition(actual.trigger_definition);
    const matches = actual.enabled_state === "O" && actual.orientation === "ROW" &&
      actual.function_executed === expected.function && actual.timing_and_events === expected.timing_and_events &&
      actualDefinition === expectedDefinition;
    return matches ? [] : [{
      code: "BLOCKER_TRIGGER_CONTRACT_DRIFT",
      trigger: key,
      expected: { enabled: "O", orientation: "ROW", timingAndEvents: expected.timing_and_events, function: expected.function, definition: expectedDefinition },
      actual: { enabled: actual.enabled_state, orientation: actual.orientation, timingAndEvents: actual.timing_and_events, function: actual.function_executed, definition: actualDefinition },
    }];
  });

  const indexContractDrift = canonicalObjectManifest.explicitIndexes.flatMap((expected) => {
    const key = `${expected.table}.${expected.name}`;
    const actual = indexByKey.get(key);
    if (!actual) return [];
    const expectedParts = indexDefinitionParts(expected.definition);
    const actualParts = indexDefinitionParts(actual.index_definition);
    const expectedDefinition = expectedParts.definition;
    const actualDefinition = actualParts.definition;
    const expectedPredicate = expectedParts.predicate;
    const actualPredicate = normalizeSqlExpression(actual.predicate);
    const actualColumns = (actual.columns ?? []).map(normalizeSqlExpression);
    const matches = Boolean(actual.unique) === expected.unique && actualDefinition === expectedDefinition &&
      JSON.stringify(actualColumns) === JSON.stringify(expectedParts.columns) && actualPredicate === expectedPredicate;
    return matches ? [] : [{
      code: "BLOCKER_INDEX_CONTRACT_DRIFT",
      index: key,
      expected: { unique: expected.unique, definition: expectedDefinition, columns: expectedParts.columns, predicate: expectedPredicate },
      actual: { unique: Boolean(actual.unique), definition: actualDefinition, columns: actualColumns, predicate: actualPredicate },
    }];
  });

  const grantBlockers = compareGrantContracts(results);
  const objectBlockers = [
    ...legacy.objectBlockers.filter((entry) => ![
      "FUNCTION_CONTRACT_DRIFT", "POLICY_CONTRACT_DRIFT", "TRIGGER_CONTRACT_DRIFT", "INDEX_CONTRACT_DRIFT",
    ].includes(entry.type)),
    ...triggerContractDrift.map((entry) => ({ type: entry.code, object: entry.trigger })),
    ...indexContractDrift.map((entry) => ({ type: entry.code, object: entry.index })),
  ];

  return {
    ...legacy,
    objectBlockers,
    rlsContractDrift,
    policyContractDrift,
    functionContractDrift,
    identityFallbackBlockers,
    triggerContractDrift,
    indexContractDrift,
    grantBlockers,
  };
}
