begin;

-- Reconcile the access model created before Phase 1 with the canonical names
-- used by the application. Legacy columns remain available during transition.

alter table public.platform_roles
  add column if not exists label text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.access_plans
  add column if not exists label text,
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.capabilities
  add column if not exists label text,
  add column if not exists category text not null default 'general',
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_global_roles
  add column if not exists assigned_by_user_id text,
  add column if not exists created_at timestamptz not null default now();

alter table public.user_subscriptions
  add column if not exists assigned_by_user_id text;

alter table public.institution_subscriptions
  add column if not exists assigned_by_user_id text;

alter table public.capability_overrides
  add column if not exists assigned_by_user_id text;

alter table if exists public.user_profiles
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.user_roles
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_roles'
      and column_name = 'name'
  ) then
    execute
      'update public.platform_roles set label = coalesce(label, name, role_key)';
  else
    update public.platform_roles
    set label = coalesce(label, role_key);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'access_plans'
      and column_name = 'name'
  ) then
    execute
      'update public.access_plans set label = coalesce(label, name, plan_key)';
  else
    update public.access_plans
    set label = coalesce(label, plan_key);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capabilities'
      and column_name = 'name'
  ) then
    execute
      'update public.capabilities set label = coalesce(label, name, capability_key)';
  else
    update public.capabilities
    set label = coalesce(label, capability_key);
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_global_roles'
      and column_name = 'granted_by_user_id'
  ) then
    execute $sql$
      update public.user_global_roles
      set assigned_by_user_id =
        coalesce(assigned_by_user_id, granted_by_user_id)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_global_roles'
      and column_name = 'granted_at'
  ) then
    execute $sql$
      update public.user_global_roles
      set created_at = coalesce(granted_at, created_at)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_subscriptions'
      and column_name = 'managed_by_user_id'
  ) then
    execute $sql$
      update public.user_subscriptions
      set assigned_by_user_id =
        coalesce(assigned_by_user_id, managed_by_user_id)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'institution_subscriptions'
      and column_name = 'managed_by_user_id'
  ) then
    execute $sql$
      update public.institution_subscriptions
      set assigned_by_user_id =
        coalesce(assigned_by_user_id, managed_by_user_id)
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'capability_overrides'
      and column_name = 'created_by_user_id'
  ) then
    execute $sql$
      update public.capability_overrides
      set assigned_by_user_id =
        coalesce(assigned_by_user_id, created_by_user_id)
    $sql$;
  end if;
end
$$;

alter table public.platform_roles
  alter column label set not null;
alter table public.access_plans
  alter column label set not null;
alter table public.capabilities
  alter column label set not null;

create table if not exists public.access_change_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null,
  target_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  constraint access_change_audit_old_data_check
    check (jsonb_typeof(old_data) = 'object'),
  constraint access_change_audit_new_data_check
    check (jsonb_typeof(new_data) = 'object')
);

create index if not exists access_change_audit_target_created_idx
  on public.access_change_audit (target_user_id, created_at desc);
create index if not exists access_change_audit_actor_created_idx
  on public.access_change_audit (actor_user_id, created_at desc);

create or replace function public.admin_set_user_plan(
  actor_user_id text,
  target_user_id text,
  new_plan_key text,
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_plan text;
  legacy_plan text;
begin
  if not exists (
    select 1
    from public.user_global_roles
    where user_id = actor_user_id
      and role_key = 'super_admin'
  ) then
    raise exception 'Only a canonical Super Admin can change plans';
  end if;

  if new_plan_key not in ('basic', 'pro') then
    raise exception 'Invalid individual plan';
  end if;

  if not exists (
    select 1 from public.user_subscriptions where user_id = target_user_id
    union all
    select 1 from public.user_profiles where user_id = target_user_id
    union all
    select 1 from public.user_roles where user_id = target_user_id
  ) then
    raise exception 'Target user does not exist';
  end if;

  select plan_key
  into previous_plan
  from public.user_subscriptions
  where user_id = target_user_id
  for update;

  previous_plan := coalesce(previous_plan, 'basic');
  legacy_plan := case when new_plan_key = 'pro' then 'pro' else 'free' end;

  insert into public.user_subscriptions (
    user_id,
    plan_key,
    status,
    starts_at,
    ends_at,
    source,
    assigned_by_user_id,
    updated_at
  )
  values (
    target_user_id,
    new_plan_key,
    'active',
    now(),
    null,
    'admin',
    actor_user_id,
    now()
  )
  on conflict (user_id) do update
  set plan_key = excluded.plan_key,
      status = 'active',
      starts_at = case
        when public.user_subscriptions.plan_key is distinct from excluded.plan_key
          then now()
        else public.user_subscriptions.starts_at
      end,
      ends_at = null,
      source = 'admin',
      assigned_by_user_id = actor_user_id,
      updated_at = now();

  update public.user_profiles
  set subscription_plan = legacy_plan,
      updated_at = now()
  where user_id = target_user_id;

  update public.user_roles
  set subscription_plan = legacy_plan,
      updated_at = now()
  where user_id = target_user_id;

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
    jsonb_build_object('plan_key', previous_plan),
    jsonb_build_object('plan_key', new_plan_key),
    nullif(btrim(change_reason), '')
  );
end;
$$;

create or replace function public.admin_set_global_role(
  actor_user_id text,
  target_user_id text,
  new_role_key text,
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_role text;
  legacy_role text;
begin
  if not exists (
    select 1
    from public.user_global_roles
    where user_id = actor_user_id
      and role_key = 'super_admin'
  ) then
    raise exception 'Only a canonical Super Admin can change global roles';
  end if;

  if new_role_key not in ('super_admin', 'referee') then
    raise exception 'Invalid global role';
  end if;

  if actor_user_id = target_user_id and new_role_key <> 'super_admin' then
    raise exception 'A Super Admin cannot remove their own global access';
  end if;

  select role_key
  into previous_role
  from public.user_global_roles
  where user_id = target_user_id
  for update;

  previous_role := coalesce(previous_role, 'referee');
  legacy_role := case
    when new_role_key = 'super_admin' then 'super_admin'
    else 'individual_referee'
  end;

  insert into public.user_global_roles (
    user_id,
    role_key,
    source,
    assigned_by_user_id,
    updated_at
  )
  values (
    target_user_id,
    new_role_key,
    'admin',
    actor_user_id,
    now()
  )
  on conflict (user_id) do update
  set role_key = excluded.role_key,
      source = 'admin',
      assigned_by_user_id = actor_user_id,
      updated_at = now();

  update public.user_roles
  set role = legacy_role,
      updated_at = now()
  where user_id = target_user_id;

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
    jsonb_build_object('role_key', previous_role),
    jsonb_build_object('role_key', new_role_key),
    nullif(btrim(change_reason), '')
  );
end;
$$;

alter table public.access_change_audit enable row level security;
revoke all on public.access_change_audit from anon;
grant select on public.access_change_audit to authenticated;
grant select, insert on public.access_change_audit to service_role;
revoke update, delete on public.access_change_audit from authenticated, service_role;

drop policy if exists access_change_audit_super_admin_read
  on public.access_change_audit;
create policy access_change_audit_super_admin_read
on public.access_change_audit for select to authenticated
using (public.platform_is_super_admin());

revoke all on function public.admin_set_user_plan(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_global_role(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_user_plan(text, text, text, text)
  to service_role;
grant execute on function public.admin_set_global_role(text, text, text, text)
  to service_role;

comment on table public.access_change_audit is
  'Immutable audit trail for canonical global role and individual plan changes.';

notify pgrst, 'reload schema';

commit;
