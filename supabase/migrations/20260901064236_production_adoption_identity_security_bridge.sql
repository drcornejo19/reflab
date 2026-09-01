-- Production adoption Phase 3A: canonical identity boundary with legacy-safe wrappers.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  role_state record;
  helper_contract record;
  helper_state record;
  helper_definition text;
  helper_source_hash text;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (
       select 1 from reflab_meta.production_adoption_state
       where phase_order = 4 and phase_key = 'canonical_objects'
     ) then
    raise exception 'Reviewed Phase 2B state is required before identity reconciliation'
      using errcode = '55000';
  end if;

  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  into role_state
  from pg_catalog.pg_roles
  where rolname = 'reflab_rls_owner';
  if not found or role_state.rolcanlogin or role_state.rolsuper or role_state.rolcreatedb
     or role_state.rolcreaterole or role_state.rolinherit or role_state.rolbypassrls then
    raise exception 'Canonical RLS owner is missing or unsafe' using errcode = '55000';
  end if;

  -- The reviewed bootstrap allowlist is empty in both membership directions.
  if exists (
    select 1
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where granted.rolname in (
      'anon',
      'authenticated',
      'service_role',
      'legacy_runtime',
      'reflab_rls_owner',
      'reflab_prod_preflight_ro',
      'reflab_preflight_audit_owner'
    )
       or member_role.rolname in (
         'anon',
         'authenticated',
         'service_role',
         'legacy_runtime',
         'reflab_rls_owner',
         'reflab_prod_preflight_ro',
         'reflab_preflight_audit_owner'
       )
       or granted.rolname = current_user
       or member_role.rolname = current_user
  ) then
    raise exception 'Unexpected application role membership blocks identity reconciliation'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_private.request_user_id()') is not null
     or pg_catalog.to_regprocedure('reflab_private.is_super_admin()') is not null then
    raise exception 'Canonical identity function provider conflict' using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.resolve_development_clerk_identity(text)',
      'public.link_development_clerk_identity(text)',
      'public.link_development_super_admin_clerk_identity(text)'
    ]::text[]) forbidden(signature)
    where pg_catalog.to_regprocedure(forbidden.signature) is not null
  ) or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Development identity infrastructure is forbidden in Production adoption'
      using errcode = '55000';
  end if;

  for helper_contract in
    select * from (values
      ('public.institution_request_user_id()', '9893e8f1ed47027aed9529c192d2afc6da54de996a1385691facdc8a776010de'),
      ('public.platform_request_user_id()', '9893e8f1ed47027aed9529c192d2afc6da54de996a1385691facdc8a776010de'),
      ('public.reflab_request_user_id()', '9893e8f1ed47027aed9529c192d2afc6da54de996a1385691facdc8a776010de')
    ) expected(signature, source_hash)
  loop
    if pg_catalog.to_regprocedure(helper_contract.signature) is null then
      raise exception 'Reviewed legacy identity helper is missing' using errcode = '55000';
    end if;

    select
      routine.prosecdef,
      routine.provolatile,
      routine.proconfig,
      routine.prorettype,
      language.lanname,
      pg_catalog.pg_get_userbyid(routine.proowner) as owner_name,
      pg_catalog.pg_get_function_identity_arguments(routine.oid) as identity_arguments,
      (
        select pg_catalog.count(*)
        from pg_catalog.pg_proc overload
        where overload.pronamespace = routine.pronamespace
          and overload.proname = routine.proname
          and overload.prokind = 'f'
      ) as overload_count
    into helper_state
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_language language on language.oid = routine.prolang
    where routine.oid = pg_catalog.to_regprocedure(helper_contract.signature);

    helper_source_hash := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(
          pg_catalog.regexp_replace(
            (select routine.prosrc from pg_catalog.pg_proc routine
             where routine.oid = pg_catalog.to_regprocedure(helper_contract.signature)),
            '^[[:space:]]+|[[:space:]]+$',
            '',
            'g'
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    if helper_state.prosecdef
       or helper_state.provolatile <> 's'
       or helper_state.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or helper_state.prorettype <> 'pg_catalog.text'::pg_catalog.regtype
       or helper_state.lanname <> 'sql'
       or helper_state.owner_name <> 'postgres'
       or helper_state.identity_arguments <> ''
       or helper_state.overload_count <> 1
       or helper_source_hash <> helper_contract.source_hash then
      raise exception 'Legacy identity helper contract or source hash is unexpected'
        using errcode = '55000';
    end if;

    select pg_catalog.lower(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(helper_contract.signature)))
    into helper_definition;
    if pg_catalog.strpos(helper_definition, 'auth.jwt()') = 0
       and pg_catalog.strpos(helper_definition, 'request.jwt.claims') = 0
       and pg_catalog.strpos(helper_definition, 'request.jwt.claim.sub') = 0
       and pg_catalog.strpos(helper_definition, 'auth.uid()') = 0 then
      raise exception 'Legacy identity helper no longer matches reviewed direct-reader state'
        using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'reflab_private')
      and routine.prokind = 'f'
      and routine.oid <> all (array[
        pg_catalog.to_regprocedure('public.institution_request_user_id()')::oid,
        pg_catalog.to_regprocedure('public.platform_request_user_id()')::oid,
        pg_catalog.to_regprocedure('public.reflab_request_user_id()')::oid
      ]::oid[])
      and (
        pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.jwt()') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claims') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claim.sub') > 0
        or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.uid()') > 0
      )
  ) then
    raise exception 'Unexpected direct external identity reader blocks reconciliation'
      using errcode = '55000';
  end if;
end
$preflight$;

create function reflab_private.request_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(
    pg_catalog.btrim(
      coalesce(
        (
          coalesce(
            nullif(pg_catalog.btrim(pg_catalog.current_setting('request.jwt.claims', true)), ''),
            '{}'
          )::pg_catalog.jsonb
        )->>'sub',
        ''
      )
    ),
    ''
  );
$function$;

create function reflab_private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.user_global_roles global_role
    where global_role.user_id = reflab_private.request_user_id()
      and global_role.role_key = 'super_admin'
  );
$function$;

grant usage on schema public, reflab_private to reflab_rls_owner;
grant create on schema reflab_private to reflab_rls_owner;
grant execute on function reflab_private.request_user_id() to reflab_rls_owner;
grant select on table public.user_global_roles to reflab_rls_owner;
alter function reflab_private.is_super_admin() owner to reflab_rls_owner;
revoke create on schema reflab_private from reflab_rls_owner;

revoke all on function reflab_private.request_user_id() from public, anon, authenticated, service_role;
revoke all on function reflab_private.is_super_admin() from public, anon, authenticated, service_role;
grant usage on schema reflab_private to authenticated;
grant execute on function reflab_private.request_user_id() to authenticated;
grant execute on function reflab_private.is_super_admin() to authenticated;

create or replace function public.institution_request_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select reflab_private.request_user_id();
$function$;

create or replace function public.platform_request_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select reflab_private.request_user_id();
$function$;

create or replace function public.reflab_request_user_id()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select reflab_private.request_user_id();
$function$;

revoke all on function public.institution_request_user_id() from public, anon, authenticated, service_role;
revoke all on function public.platform_request_user_id() from public, anon, authenticated, service_role;
revoke all on function public.reflab_request_user_id() from public, anon, authenticated, service_role;
grant execute on function public.institution_request_user_id() to authenticated, service_role;
grant execute on function public.platform_request_user_id() to authenticated, service_role;
grant execute on function public.reflab_request_user_id() to authenticated, service_role;

do $assertions$
declare
  helper_signature text;
  helper_definition text;
  direct_reader_count integer;
begin
  foreach helper_signature in array array[
    'public.institution_request_user_id()',
    'public.platform_request_user_id()',
    'public.reflab_request_user_id()'
  ]::text[] loop
    select pg_catalog.lower(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(helper_signature)))
    into helper_definition;
    if pg_catalog.strpos(helper_definition, 'reflab_private.request_user_id()') = 0
       or pg_catalog.strpos(helper_definition, 'auth.jwt()') > 0
       or pg_catalog.strpos(helper_definition, 'request.jwt.claims') > 0
       or pg_catalog.has_function_privilege('anon', helper_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('authenticated', helper_signature, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', helper_signature, 'EXECUTE') then
      raise exception 'Legacy identity wrapper contract is unsafe' using errcode = '55000';
    end if;
  end loop;

  select pg_catalog.count(*) into direct_reader_count
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname in ('public', 'reflab_private')
    and routine.prokind = 'f'
    and (
      pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.jwt()') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claims') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'request.jwt.claim.sub') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(routine.oid)), 'auth.uid()') > 0
    )
    and routine.oid <> pg_catalog.to_regprocedure('reflab_private.request_user_id()')::oid;

  if pg_catalog.has_function_privilege('anon', 'reflab_private.is_super_admin()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'reflab_private.is_super_admin()', 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', 'reflab_private.is_super_admin()', 'EXECUTE')
     or pg_catalog.pg_get_userbyid(
       (select proowner from pg_catalog.pg_proc where oid = 'reflab_private.is_super_admin()'::regprocedure)
     ) <> 'reflab_rls_owner'
     or direct_reader_count <> 0
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception 'Canonical identity boundary contract is incomplete' using errcode = '55000';
  end if;
end
$assertions$;

commit;
