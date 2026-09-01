-- Production adoption Phase 2B completion: record canonical runtime objects
-- as installed but deliberately disabled by the empty canonical marker.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  required_function_signature text;
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
     ) then
    raise exception 'Phase 2B completion requires the reviewed disabled adoption state'
      using errcode = '55000';
  end if;

  foreach required_function_signature in array array[
    'reflab_private.canonical_jsonb_text(jsonb)',
    'public.admin_set_canonical_user_plan(text,text,text,text)',
    'public.admin_set_canonical_global_role(text,text,text,text)',
    'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)',
    'public.submit_canonical_communication_feedback(text,uuid,text,jsonb)'
  ] loop
    if pg_catalog.to_regprocedure(required_function_signature) is null then
      raise exception 'Phase 2B canonical function is missing: %', required_function_signature
        using errcode = '55000';
    end if;
  end loop;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is not null
     or pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null then
    raise exception 'Development identity infrastructure is forbidden during Production adoption'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'canonical_payload_hash'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint constraint_state
    where constraint_state.conrelid = 'public.attempts'::pg_catalog.regclass
      and constraint_state.conname = 'attempts_canonical_payload_hash_check'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint constraint_state
    where constraint_state.conrelid = 'public.attempts'::pg_catalog.regclass
      and constraint_state.conname = 'attempts_source_type_check'
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(constraint_state.oid),
        'communication_feedback'
      ) > 0
  ) then
    raise exception 'Phase 2B attempt contract is incomplete'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = procedure.proowner
    where procedure.oid in (
      pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)'),
      pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)'),
      pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)'),
      pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)')
    )
      and (
        not procedure.prosecdef
        or procedure.proconfig is distinct from array['search_path=pg_catalog']::text[]
        or owner_role.rolname <> 'reflab_rls_owner'
      )
  ) then
    raise exception 'Phase 2B canonical RPC security contract is unsafe'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.admin_set_canonical_user_plan(text,text,text,text)',
      'public.admin_set_canonical_global_role(text,text,text,text)',
      'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)',
      'public.submit_canonical_communication_feedback(text,uuid,text,jsonb)'
    ]::text[]) as required_function(function_signature)
    join pg_catalog.pg_proc procedure
      on procedure.oid = pg_catalog.to_regprocedure(
        required_function.function_signature
      )
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure.proacl,
        pg_catalog.acldefault('f', procedure.proowner)
      )
    ) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    where acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
  ) then
    raise exception 'Phase 2B canonical RPC retained browser execution'
      using errcode = '55000';
  end if;
end
$preflight$;

lock table reflab_meta.production_adoption_state in exclusive mode;
insert into reflab_meta.production_adoption_state (
  phase_order,
  phase_key,
  previous_phase_key,
  plan_version,
  plan_hash,
  evidence_hash
)
select
  4,
  'canonical_objects',
  'psychology_notification_prerequisites',
  state.plan_version,
  state.plan_hash,
  state.evidence_hash
from reflab_meta.production_adoption_state state
where state.phase_order = 3;

do $verification$
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (
       select 1
       from reflab_meta.production_adoption_state state
       where state.phase_order = 4
         and state.phase_key = 'canonical_objects'
         and state.previous_phase_key = 'psychology_notification_prerequisites'
     ) then
    raise exception 'Phase 2B completion marker is invalid'
      using errcode = '55000';
  end if;
end
$verification$;

commit;
