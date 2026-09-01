-- Production adoption bridge, Phase 1/3. Historical Production only.
-- The schema-state table is infrastructure; its absent row keeps runtime closed.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
declare
  role_state record;
  installer_state record;
begin
  select role.rolsuper, role.rolcreatedb, role.rolcreaterole, role.rolbypassrls
  into installer_state
  from pg_catalog.pg_roles role
  where role.rolname = current_user;

  if not found
     or not pg_catalog.has_database_privilege(
       current_user,
       pg_catalog.current_database(),
       'CREATE'
     ) then
    raise exception 'Production adoption installer cannot create reviewed infrastructure'
      using errcode = '42501';
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
    raise exception 'reflab_rls_owner is absent or unsafe; rerun Phase 0'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regnamespace('reflab_meta') is not null
     or pg_catalog.to_regnamespace('reflab_private') is not null then
    raise exception 'Adoption schemas are no longer in the audited absent state'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is not null
     or pg_catalog.to_regclass('reflab_meta.production_adoption_state') is not null then
    raise exception 'Unexpected identity or schema marker infrastructure exists'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null then
    raise exception 'Development identity RPCs must be absent before Production adoption'
      using errcode = '55000';
  end if;
end
$preflight$;

create schema reflab_meta authorization current_user;
create schema reflab_private authorization current_user;

revoke all on schema reflab_meta, reflab_private
  from public, anon, authenticated, service_role, reflab_rls_owner;

-- This is the exact canonical table contract, intentionally without a row.
create table reflab_meta.reflab_schema_state (
  installation_id uuid primary key default gen_random_uuid(),
  baseline_version text not null unique,
  sql_checksum text not null
    check (sql_checksum ~ '^[0-9a-f]{64}$'),
  manifest_hash text not null
    check (manifest_hash ~ '^[0-9a-f]{64}$'),
  environment text not null
    check (environment in ('development', 'test', 'preview', 'staging', 'production')),
  installed_at timestamptz not null default pg_catalog.now(),
  postgres_version text not null,
  supabase_platform_version text,
  schema_version integer not null check (schema_version > 0),
  installation_status text not null check (installation_status = 'installed'),
  constraint reflab_schema_state_singleton unique (installation_status)
);

create function reflab_meta.reject_schema_state_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception 'reflab_schema_state is immutable';
end
$function$;

create trigger reflab_schema_state_immutable
before update or delete on reflab_meta.reflab_schema_state
for each row execute function reflab_meta.reject_schema_state_mutation();

alter table reflab_meta.reflab_schema_state enable row level security;
revoke all on table reflab_meta.reflab_schema_state
  from public, anon, authenticated, service_role, reflab_rls_owner;
revoke all on function reflab_meta.reject_schema_state_mutation()
  from public, anon, authenticated, service_role, reflab_rls_owner;

create table reflab_meta.production_adoption_state (
  phase_order smallint primary key
    check (phase_order between 1 and 7),
  phase_key text not null unique,
  previous_phase_key text,
  plan_version text not null,
  plan_hash text not null
    check (plan_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null
    check (evidence_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default pg_catalog.now(),
  constraint production_adoption_previous_phase_check check (
    (phase_order = 1 and previous_phase_key is null)
    or (phase_order > 1 and previous_phase_key is not null)
  )
);

create function reflab_meta.guard_production_adoption_state()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  expected_phases constant text[] := array[
    'foundation',
    'exam_training_prerequisites',
    'psychology_notification_prerequisites',
    'canonical_objects',
    'security_cutover',
    'runtime_cutover',
    'canonical_finalized'
  ]::text[];
  latest_order smallint;
  latest_key text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'production_adoption_state is append-only'
      using errcode = '55000';
  end if;

  select state.phase_order, state.phase_key
  into latest_order, latest_key
  from reflab_meta.production_adoption_state state
  order by state.phase_order desc
  limit 1;

  if new.phase_order <> coalesce(latest_order, 0) + 1
     or new.phase_key is distinct from expected_phases[new.phase_order]
     or new.previous_phase_key is distinct from latest_key then
    raise exception 'Invalid or non-monotonic Production adoption transition'
      using errcode = '55000';
  end if;

  return new;
end
$function$;

create trigger production_adoption_state_guard
before insert or update or delete on reflab_meta.production_adoption_state
for each row execute function reflab_meta.guard_production_adoption_state();

alter table reflab_meta.production_adoption_state enable row level security;

revoke all on table reflab_meta.production_adoption_state
  from public, anon, authenticated, service_role, reflab_rls_owner;
revoke all on function reflab_meta.guard_production_adoption_state()
  from public, anon, authenticated, service_role, reflab_rls_owner;

insert into reflab_meta.production_adoption_state (
  phase_order,
  phase_key,
  previous_phase_key,
  plan_version,
  plan_hash,
  evidence_hash
)
values (
  1,
  'foundation',
  null,
  'production_adoption_bridge_v1',
  'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f',
  '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
);

do $assertions$
declare
  unsafe_acl_count integer;
  relation_name text;
begin
  if pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Foundation schema-state or Development identity contract is invalid';
  end if;

  foreach relation_name in array array[
    'reflab_schema_state',
    'production_adoption_state'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'reflab_meta'
        and relation.relname = relation_name
        and pg_catalog.pg_get_userbyid(relation.relowner) = current_user
        and relation.relrowsecurity
        and not relation.relforcerowsecurity
    ) then
      raise exception 'Foundation owner or RLS contract is unsafe for %', relation_name;
    end if;
  end loop;

  select pg_catalog.count(*)
  into unsafe_acl_count
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  cross join lateral pg_catalog.aclexplode(relation.relacl) acl
  left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
  where namespace.nspname = 'reflab_meta'
    and relation.relname in ('reflab_schema_state', 'production_adoption_state')
    and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'reflab_rls_owner'));

  if unsafe_acl_count <> 0 then
    raise exception 'Foundation state retained an application-role ACL';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 1
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Foundation transition or empty schema-state contract is invalid';
  end if;
end
$assertions$;

commit;
