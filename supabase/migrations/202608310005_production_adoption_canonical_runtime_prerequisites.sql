-- Production adoption Phase 2B prerequisite: the canonical JSON helper that
-- is otherwise supplied only by the empty-database baseline.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  role_state record;
  required_table text;
  required_column record;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or not exists (
       select 1
       from reflab_meta.production_adoption_state state
       where state.phase_order = 3
         and state.phase_key = 'psychology_notification_prerequisites'
         and state.plan_version = 'production_adoption_bridge_v1'
     ) then
    raise exception 'Reviewed disabled Production adoption state is required for Phase 2B'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null then
    raise exception 'Reviewed semantic audit sidecar is required for Phase 2B'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null then
    raise exception 'Development identity infrastructure is forbidden during Production adoption'
      using errcode = '55000';
  end if;

  select
    role.rolcanlogin,
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolinherit,
    role.rolbypassrls
  into role_state
  from pg_catalog.pg_roles role
  where role.rolname = 'reflab_rls_owner';

  if not found
     or role_state.rolcanlogin
     or role_state.rolsuper
     or role_state.rolcreatedb
     or role_state.rolcreaterole
     or role_state.rolinherit
     or role_state.rolbypassrls then
    raise exception 'Canonical RLS owner is missing or unsafe'
      using errcode = '55000';
  end if;

  foreach required_table in array array[
    'public.access_change_audit',
    'public.attempts',
    'public.clips',
    'public.exam_results',
    'public.institution_memberships',
    'public.institution_subscriptions',
    'public.institutions',
    'public.notification_events',
    'public.user_global_roles',
    'public.user_profiles',
    'public.user_subscriptions'
  ] loop
    if pg_catalog.to_regclass(required_table) is null then
      raise exception 'Phase 2B dependency is missing: %', required_table
        using errcode = '55000';
    end if;
  end loop;

  for required_column in
    select * from (values
      ('attempts', 'canonical_payload_hash', 'absent'),
      ('attempts', 'source_item_type', 'text'),
      ('attempts', 'source_item_id', 'text'),
      ('attempts', 'source_occurrence_id', 'uuid'),
      ('attempts', 'institution_assessment_session_id', 'uuid'),
      ('exam_results', 'exam_session_id', 'uuid'),
      ('exam_results', 'payload_hash', 'text'),
      ('notification_events', 'deduplication_key', 'text')
    ) expected(table_name, column_name, expected_type)
  loop
    if required_column.expected_type = 'absent' then
      if exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = pg_catalog.to_regclass(
          'public.' || required_column.table_name
        )
          and attribute.attname = required_column.column_name
          and attribute.attnum > 0
          and not attribute.attisdropped
      ) then
        raise exception 'Phase 2B duplicate provider conflict: %.%',
          required_column.table_name,
          required_column.column_name
          using errcode = '55000';
      end if;
    elsif not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass(
        'public.' || required_column.table_name
      )
        and attribute.attname = required_column.column_name
        and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
          = required_column.expected_type
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Phase 2B dependency column is missing or incompatible: %.%',
        required_column.table_name,
        required_column.column_name
        using errcode = '55000';
    end if;
  end loop;

  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null
     or pg_catalog.to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Phase 2B requires the reviewed pgcrypto functions'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is not null
     or pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is not null
     or pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)') is not null
     or pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null
     or pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is not null then
    raise exception 'Phase 2B canonical function provider conflict'
      using errcode = '55000';
  end if;
end
$preflight$;

create function reflab_private.canonical_jsonb_text(p_value jsonb)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  value_type text;
  canonical_value text;
begin
  value_type := pg_catalog.jsonb_typeof(p_value);

  case value_type
    when 'object' then
      select
        '{'
        || coalesce(
          pg_catalog.string_agg(
            pg_catalog.to_jsonb(entry.key)::text
            || ':'
            || reflab_private.canonical_jsonb_text(entry.value),
            ','
            order by entry.key collate "C"
          ),
          ''
        )
        || '}'
      into canonical_value
      from pg_catalog.jsonb_each(p_value) as entry(key, value);
    when 'array' then
      select
        '['
        || coalesce(
          pg_catalog.string_agg(
            reflab_private.canonical_jsonb_text(entry.value),
            ','
            order by entry.ordinality
          ),
          ''
        )
        || ']'
      into canonical_value
      from pg_catalog.jsonb_array_elements(p_value)
        with ordinality as entry(value, ordinality);
    when 'string' then
      canonical_value := pg_catalog.to_jsonb(p_value #>> '{}')::text;
    when 'number' then
      canonical_value := pg_catalog.trim_scale(
        (p_value #>> '{}')::numeric
      )::text;
    when 'boolean' then
      canonical_value := p_value::text;
    when 'null' then
      canonical_value := 'null';
    else
      raise exception 'unsupported JSON type: %', value_type;
  end case;

  return canonical_value;
end
$function$;

revoke all on function reflab_private.canonical_jsonb_text(jsonb)
  from public, anon, authenticated, service_role, reflab_rls_owner;
grant usage on schema reflab_private, extensions to service_role;
grant execute on function reflab_private.canonical_jsonb_text(jsonb)
  to service_role;

do $verification$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where procedure.oid = pg_catalog.to_regprocedure(
      'reflab_private.canonical_jsonb_text(jsonb)'
    )
      and (
        procedure.prosecdef
        or not procedure.proisstrict
        or procedure.provolatile <> 'i'
        or procedure.proconfig is distinct from array['search_path=pg_catalog']::text[]
      )
  ) then
    raise exception 'Canonical JSON helper contract is unsafe'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    where procedure.oid = pg_catalog.to_regprocedure(
      'reflab_private.canonical_jsonb_text(jsonb)'
    )
      and acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
  ) then
    raise exception 'Canonical JSON helper retained browser execution'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3 then
    raise exception 'Phase 2B prerequisite changed an adoption marker'
      using errcode = '55000';
  end if;
end
$verification$;

commit;
