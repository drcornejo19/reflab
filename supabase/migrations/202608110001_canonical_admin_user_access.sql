-- Canonical, server-only global role and individual plan administration.
-- Production adoption requires the reviewed Phase 2B prerequisites. It never
-- depends on the Development-only identity-resolution chain.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $preflight$
begin
  if pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or pg_catalog.to_regclass('public.user_profiles') is null
     or pg_catalog.to_regclass('public.user_global_roles') is null
     or pg_catalog.to_regclass('public.user_subscriptions') is null
     or pg_catalog.to_regclass('public.access_change_audit') is null then
    raise exception 'Canonical access administration requires an installed baseline'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles role
    where role.rolname = 'reflab_rls_owner'
      and not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolbypassrls
  ) then
    raise exception 'Canonical RLS owner is missing or unsafe'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is not null then
    if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
       or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
       or not exists (
         select 1
         from reflab_meta.production_adoption_state state
         where state.phase_order = 3
           and state.phase_key = 'psychology_notification_prerequisites'
       ) then
      raise exception 'Canonical Admin requires the reviewed disabled Production adoption state'
        using errcode = '55000';
    end if;

    if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
       or pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null
       or pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is not null
       or pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null then
      raise exception 'Development identity infrastructure is forbidden during Production adoption'
        using errcode = '55000';
    end if;

    if pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null then
      raise exception 'Canonical Admin Production prerequisites are incomplete'
        using errcode = '55000';
    end if;
  end if;

  if pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is not null
     or pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)') is not null then
    raise exception 'Canonical Admin provider conflict'
      using errcode = '55000';
  end if;
end
$preflight$;

grant usage on schema public, reflab_meta to reflab_rls_owner;

grant select (installation_status, environment)
on table reflab_meta.reflab_schema_state
to reflab_rls_owner;

grant select (user_id)
on table public.user_profiles
to reflab_rls_owner;

grant select (user_id, role_key)
on table public.user_global_roles
to reflab_rls_owner;

grant update (role_key, source, assigned_by_user_id, updated_at)
on table public.user_global_roles
to reflab_rls_owner;

grant select (
  user_id,
  plan_key,
  status,
  starts_at,
  ends_at,
  source,
  assigned_by_user_id
)
on table public.user_subscriptions
to reflab_rls_owner;

grant update (
  plan_key,
  status,
  starts_at,
  ends_at,
  source,
  assigned_by_user_id,
  updated_at
)
on table public.user_subscriptions
to reflab_rls_owner;

grant insert (
  actor_user_id,
  target_user_id,
  action,
  entity_type,
  entity_id,
  old_data,
  new_data,
  reason
)
on table public.access_change_audit
to reflab_rls_owner;

create policy reflab_schema_state_admin_mutation_read
on reflab_meta.reflab_schema_state
for select
to reflab_rls_owner
using (
  installation_status = 'installed'
  and environment in ('development', 'production')
);

create policy user_profiles_admin_mutation_target_read
on public.user_profiles
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
);

create policy user_subscriptions_admin_mutation_target_read
on public.user_subscriptions
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
);

create policy user_subscriptions_admin_mutation_target_update
on public.user_subscriptions
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
)
with check (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
);

create policy user_global_roles_admin_mutation_target_update
on public.user_global_roles
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
)
with check (
  user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
);

-- PostgreSQL applies UPDATE policies to SELECT ... FOR UPDATE. This policy
-- exposes only the actor row to the lock operation and can never authorize a
-- resulting UPDATE; target mutation remains governed by the policy above.
create policy user_global_roles_admin_actor_lock
on public.user_global_roles
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting(
    'reflab.admin_actor_user_id',
    true
  )
)
with check (false);

create policy access_change_audit_admin_mutation_insert
on public.access_change_audit
for insert
to reflab_rls_owner
with check (
  actor_user_id = pg_catalog.current_setting(
    'reflab.admin_actor_user_id',
    true
  )
  and target_user_id = pg_catalog.current_setting(
    'reflab.admin_target_user_id',
    true
  )
  and entity_id = target_user_id
  and (
    (
      action = 'access.plan.changed'
      and entity_type = 'user_subscription'
    )
    or (
      action = 'access.global_role.changed'
      and entity_type = 'user_global_role'
    )
  )
);

create function public.admin_set_canonical_user_plan(
  p_actor_user_id text,
  p_target_user_id text,
  p_plan_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id text;
  target_user_id text;
  normalized_reason text;
  current_subscription public.user_subscriptions%rowtype;
begin
  actor_user_id := nullif(pg_catalog.btrim(p_actor_user_id), '');
  target_user_id := nullif(pg_catalog.btrim(p_target_user_id), '');
  normalized_reason := nullif(pg_catalog.btrim(p_reason), '');

  if actor_user_id is null
     or actor_user_id <> p_actor_user_id
     or pg_catalog.char_length(actor_user_id) > 255
     or target_user_id is null
     or target_user_id <> p_target_user_id
     or pg_catalog.char_length(target_user_id) > 255 then
    raise exception 'Invalid canonical user identifier'
      using errcode = '22023';
  end if;

  if p_plan_key is null
     or p_plan_key not in ('basic', 'pro') then
    raise exception 'Invalid individual plan'
      using errcode = '22023';
  end if;

  if normalized_reason is not null
     and pg_catalog.char_length(normalized_reason) > 500 then
    raise exception 'Change reason exceeds 500 characters'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'reflab.admin_actor_user_id',
    actor_user_id,
    true
  );
  perform pg_catalog.set_config(
    'reflab.admin_target_user_id',
    target_user_id,
    true
  );

  if not exists (
    select 1
    from reflab_meta.reflab_schema_state schema_state
    where schema_state.installation_status = 'installed'
      and schema_state.environment in ('development', 'production')
  ) then
    raise exception 'Canonical schema marker is invalid for administration'
      using errcode = '55000';
  end if;

  -- Both RPCs lock actor and target roles in the same order. This prevents
  -- authorization from racing a concurrent role change without deadlocks.
  perform global_role.user_id
  from public.user_global_roles global_role
  where global_role.user_id in (actor_user_id, target_user_id)
  order by global_role.user_id
  for update;

  select subscription.*
  into current_subscription
  from public.user_subscriptions subscription
  where subscription.user_id = target_user_id
  for update;

  if not exists (
    select 1
    from public.user_global_roles actor_role
    where actor_role.user_id = actor_user_id
      and actor_role.role_key = 'super_admin'
  ) then
    raise exception 'Only a canonical Super Admin can change plans'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_profiles target_profile
    where target_profile.user_id = target_user_id
  ) or not exists (
    select 1
    from public.user_global_roles target_role
    where target_role.user_id = target_user_id
  ) or current_subscription.user_id is null then
    raise exception 'Canonical target access records are incomplete'
      using errcode = 'P0002';
  end if;

  if current_subscription.plan_key = p_plan_key
     and current_subscription.status = 'active'
     and current_subscription.ends_at is null then
    return pg_catalog.jsonb_build_object(
      'status', 'unchanged',
      'plan_key', current_subscription.plan_key
    );
  end if;

  update public.user_subscriptions subscription
  set plan_key = p_plan_key,
      status = 'active',
      starts_at = pg_catalog.now(),
      ends_at = null,
      source = 'admin_canonical',
      assigned_by_user_id = actor_user_id,
      updated_at = pg_catalog.now()
  where subscription.user_id = target_user_id;

  if not found then
    raise exception 'Canonical target subscription update failed'
      using errcode = 'P0002';
  end if;

  insert into public.access_change_audit (
    actor_user_id,
    target_user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    reason
  )
  values (
    actor_user_id,
    target_user_id,
    'access.plan.changed',
    'user_subscription',
    target_user_id,
    pg_catalog.jsonb_build_object(
      'plan_key', current_subscription.plan_key,
      'status', current_subscription.status,
      'starts_at', current_subscription.starts_at,
      'ends_at', current_subscription.ends_at,
      'source', current_subscription.source,
      'assigned_by_user_id', current_subscription.assigned_by_user_id
    ),
    pg_catalog.jsonb_build_object(
      'plan_key', p_plan_key,
      'status', 'active',
      'starts_at', pg_catalog.now(),
      'ends_at', null,
      'source', 'admin_canonical',
      'assigned_by_user_id', actor_user_id
    ),
    normalized_reason
  );

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'plan_key', p_plan_key
  );
end
$function$;

create function public.admin_set_canonical_global_role(
  p_actor_user_id text,
  p_target_user_id text,
  p_role_key text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id text;
  target_user_id text;
  normalized_reason text;
  current_global_role public.user_global_roles%rowtype;
  current_subscription public.user_subscriptions%rowtype;
begin
  actor_user_id := nullif(pg_catalog.btrim(p_actor_user_id), '');
  target_user_id := nullif(pg_catalog.btrim(p_target_user_id), '');
  normalized_reason := nullif(pg_catalog.btrim(p_reason), '');

  if actor_user_id is null
     or actor_user_id <> p_actor_user_id
     or pg_catalog.char_length(actor_user_id) > 255
     or target_user_id is null
     or target_user_id <> p_target_user_id
     or pg_catalog.char_length(target_user_id) > 255 then
    raise exception 'Invalid canonical user identifier'
      using errcode = '22023';
  end if;

  if p_role_key is null
     or p_role_key not in ('referee', 'super_admin') then
    raise exception 'Invalid global role'
      using errcode = '22023';
  end if;

  if normalized_reason is not null
     and pg_catalog.char_length(normalized_reason) > 500 then
    raise exception 'Change reason exceeds 500 characters'
      using errcode = '22023';
  end if;

  if actor_user_id = target_user_id and p_role_key <> 'super_admin' then
    raise exception 'A Super Admin cannot remove their own global access'
      using errcode = '42501';
  end if;

  perform pg_catalog.set_config(
    'reflab.admin_actor_user_id',
    actor_user_id,
    true
  );
  perform pg_catalog.set_config(
    'reflab.admin_target_user_id',
    target_user_id,
    true
  );

  if not exists (
    select 1
    from reflab_meta.reflab_schema_state schema_state
    where schema_state.installation_status = 'installed'
      and schema_state.environment in ('development', 'production')
  ) then
    raise exception 'Canonical schema marker is invalid for administration'
      using errcode = '55000';
  end if;

  -- Match the plan RPC lock order so concurrent cross-user changes serialize.
  perform global_role.user_id
  from public.user_global_roles global_role
  where global_role.user_id in (actor_user_id, target_user_id)
  order by global_role.user_id
  for update;

  select subscription.*
  into current_subscription
  from public.user_subscriptions subscription
  where subscription.user_id = target_user_id
  for update;

  if not exists (
    select 1
    from public.user_global_roles actor_role
    where actor_role.user_id = actor_user_id
      and actor_role.role_key = 'super_admin'
  ) then
    raise exception 'Only a canonical Super Admin can change global roles'
      using errcode = '42501';
  end if;

  select global_role.*
  into current_global_role
  from public.user_global_roles global_role
  where global_role.user_id = target_user_id;

  if not exists (
    select 1
    from public.user_profiles target_profile
    where target_profile.user_id = target_user_id
  ) or current_global_role.user_id is null
    or current_subscription.user_id is null then
    raise exception 'Canonical target access records are incomplete'
      using errcode = 'P0002';
  end if;

  if current_global_role.role_key = p_role_key then
    return pg_catalog.jsonb_build_object(
      'status', 'unchanged',
      'role_key', current_global_role.role_key
    );
  end if;

  update public.user_global_roles global_role
  set role_key = p_role_key,
      source = 'admin_canonical',
      assigned_by_user_id = actor_user_id,
      updated_at = pg_catalog.now()
  where global_role.user_id = target_user_id;

  if not found then
    raise exception 'Canonical target global role update failed'
      using errcode = 'P0002';
  end if;

  insert into public.access_change_audit (
    actor_user_id,
    target_user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data,
    reason
  )
  values (
    actor_user_id,
    target_user_id,
    'access.global_role.changed',
    'user_global_role',
    target_user_id,
    pg_catalog.jsonb_build_object(
      'role_key', current_global_role.role_key,
      'source', current_global_role.source,
      'assigned_by_user_id', current_global_role.assigned_by_user_id
    ),
    pg_catalog.jsonb_build_object(
      'role_key', p_role_key,
      'source', 'admin_canonical',
      'assigned_by_user_id', actor_user_id
    ),
    normalized_reason
  );

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'role_key', p_role_key
  );
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.admin_set_canonical_user_plan(text, text, text, text)
  owner to reflab_rls_owner;
alter function public.admin_set_canonical_global_role(text, text, text, text)
  owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

do $ownership_postflight$
begin
  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on public'
      using errcode = '55000';
  end if;
end
$ownership_postflight$;

revoke all on function
  public.admin_set_canonical_user_plan(text, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function
  public.admin_set_canonical_global_role(text, text, text, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_set_canonical_user_plan(text, text, text, text)
to service_role;
grant execute on function
  public.admin_set_canonical_global_role(text, text, text, text)
to service_role;

notify pgrst, 'reload schema';

commit;
