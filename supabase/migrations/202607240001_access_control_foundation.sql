begin;

create extension if not exists pgcrypto;

create table if not exists public.platform_roles (
  role_key text primary key,
  label text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_global_roles (
  user_id text primary key,
  role_key text not null references public.platform_roles(role_key),
  source text not null default 'automatic_default',
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.access_plans (
  plan_key text primary key,
  label text not null,
  audience text not null check (audience in ('individual', 'institution')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.capabilities (
  capability_key text primary key,
  label text not null,
  description text,
  category text not null default 'general',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_capabilities (
  plan_key text not null references public.access_plans(plan_key) on delete cascade,
  capability_key text not null references public.capabilities(capability_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_key, capability_key)
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  plan_key text not null references public.access_plans(plan_key),
  status text not null default 'active' check (
    status in ('trialing', 'active', 'paused', 'canceled', 'expired')
  ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  source text not null default 'automatic_default',
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_individual_plan_check
    check (plan_key in ('basic', 'pro')),
  constraint user_subscriptions_window_check
    check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.institution_subscriptions (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null unique references public.institutions(id) on delete cascade,
  plan_key text not null references public.access_plans(plan_key),
  status text not null default 'active' check (
    status in ('trialing', 'active', 'paused', 'canceled', 'expired')
  ),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  seat_limit integer check (seat_limit is null or seat_limit >= 0),
  source text not null default 'institution_backfill',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institution_subscriptions_plan_check
    check (plan_key in ('academy', 'enterprise')),
  constraint institution_subscriptions_window_check
    check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.capability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid references public.institutions(id) on delete cascade,
  capability_key text not null references public.capabilities(capability_key) on delete cascade,
  scope_type text not null check (
    scope_type in ('global_user', 'institution_user')
  ),
  effect text not null check (effect in ('allow', 'deny')),
  reason text,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  assigned_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_overrides_scope_check check (
    (scope_type = 'global_user' and institution_id is null)
    or (scope_type = 'institution_user' and institution_id is not null)
  ),
  constraint capability_overrides_window_check check (
    valid_until is null or valid_until > valid_from
  )
);

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

create unique index if not exists capability_overrides_unique_scope
  on public.capability_overrides (
    user_id,
    capability_key,
    scope_type,
    coalesce(institution_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists user_global_roles_role_idx
  on public.user_global_roles (role_key);
create index if not exists user_subscriptions_plan_status_idx
  on public.user_subscriptions (plan_key, status);
create index if not exists institution_subscriptions_plan_status_idx
  on public.institution_subscriptions (plan_key, status);
create index if not exists capability_overrides_user_validity_idx
  on public.capability_overrides (user_id, valid_from, valid_until);
create index if not exists access_change_audit_target_created_idx
  on public.access_change_audit (target_user_id, created_at desc);
create index if not exists access_change_audit_actor_created_idx
  on public.access_change_audit (actor_user_id, created_at desc);

insert into public.platform_roles (role_key, label, description)
values
  ('super_admin', 'Super Admin', 'Acceso global explicito a la plataforma.'),
  ('referee', 'Arbitro', 'Rol global base; los roles institucionales se resuelven por membresia.')
on conflict (role_key) do update
set label = excluded.label,
    description = excluded.description,
    is_active = true,
    updated_at = now();

insert into public.access_plans (plan_key, label, audience, description)
values
  ('basic', 'Basic', 'individual', 'Acceso individual inicial.'),
  ('pro', 'Pro', 'individual', 'Acceso individual avanzado.'),
  ('academy', 'Academy', 'institution', 'Licencia para escuelas y academias.'),
  ('enterprise', 'Enterprise', 'institution', 'Licencia institucional avanzada.')
on conflict (plan_key) do update
set label = excluded.label,
    audience = excluded.audience,
    description = excluded.description,
    is_active = true,
    updated_at = now();

insert into public.capabilities (capability_key, label, category)
values
  ('advanced_dashboard', 'Dashboard tecnico completo', 'individual'),
  ('advanced_individual', 'Funciones individuales avanzadas', 'individual'),
  ('advanced_institutional_analytics', 'Analitica institucional avanzada', 'institution'),
  ('ai_coach', 'RefLab Coach', 'individual'),
  ('audit_access', 'Acceso a auditoria', 'institution'),
  ('basic_history', 'Historial basico', 'individual'),
  ('content_assignment', 'Asignacion de contenidos', 'institution'),
  ('full_assessments', 'Evaluaciones completas', 'individual'),
  ('full_history', 'Historial completo', 'individual'),
  ('group_tracking', 'Seguimiento grupal', 'institution'),
  ('institution_management', 'Gestion institucional', 'institution'),
  ('institutional_assessments', 'Evaluaciones institucionales', 'institution'),
  ('institutional_reports', 'Reportes institucionales', 'institution'),
  ('library', 'Biblioteca oficial', 'individual'),
  ('limited_assessments', 'Evaluaciones limitadas', 'individual'),
  ('multi_site', 'Multiples sedes', 'institution'),
  ('profile', 'Perfil', 'individual'),
  ('recommended_plan', 'Plan recomendado', 'individual'),
  ('ref_card_basic', 'Ref Card basica', 'individual'),
  ('ref_performance', 'Ref Performance', 'individual'),
  ('selected_training', 'Entrenamientos seleccionados', 'individual'),
  ('technical_radar', 'Radar arbitral', 'individual')
on conflict (capability_key) do update
set label = excluded.label,
    category = excluded.category,
    is_active = true,
    updated_at = now();

with plan_matrix(plan_key, capability_key) as (
  values
    ('basic', 'basic_history'),
    ('basic', 'library'),
    ('basic', 'limited_assessments'),
    ('basic', 'profile'),
    ('basic', 'ref_card_basic'),
    ('basic', 'selected_training'),

    ('pro', 'advanced_dashboard'),
    ('pro', 'advanced_individual'),
    ('pro', 'ai_coach'),
    ('pro', 'basic_history'),
    ('pro', 'full_assessments'),
    ('pro', 'full_history'),
    ('pro', 'library'),
    ('pro', 'limited_assessments'),
    ('pro', 'profile'),
    ('pro', 'recommended_plan'),
    ('pro', 'ref_card_basic'),
    ('pro', 'ref_performance'),
    ('pro', 'selected_training'),
    ('pro', 'technical_radar'),

    ('academy', 'advanced_dashboard'),
    ('academy', 'advanced_individual'),
    ('academy', 'ai_coach'),
    ('academy', 'basic_history'),
    ('academy', 'content_assignment'),
    ('academy', 'full_assessments'),
    ('academy', 'full_history'),
    ('academy', 'group_tracking'),
    ('academy', 'institution_management'),
    ('academy', 'institutional_assessments'),
    ('academy', 'institutional_reports'),
    ('academy', 'library'),
    ('academy', 'limited_assessments'),
    ('academy', 'profile'),
    ('academy', 'recommended_plan'),
    ('academy', 'ref_card_basic'),
    ('academy', 'ref_performance'),
    ('academy', 'selected_training'),
    ('academy', 'technical_radar'),

    ('enterprise', 'advanced_dashboard'),
    ('enterprise', 'advanced_individual'),
    ('enterprise', 'advanced_institutional_analytics'),
    ('enterprise', 'ai_coach'),
    ('enterprise', 'audit_access'),
    ('enterprise', 'basic_history'),
    ('enterprise', 'content_assignment'),
    ('enterprise', 'full_assessments'),
    ('enterprise', 'full_history'),
    ('enterprise', 'group_tracking'),
    ('enterprise', 'institution_management'),
    ('enterprise', 'institutional_assessments'),
    ('enterprise', 'institutional_reports'),
    ('enterprise', 'library'),
    ('enterprise', 'limited_assessments'),
    ('enterprise', 'multi_site'),
    ('enterprise', 'profile'),
    ('enterprise', 'recommended_plan'),
    ('enterprise', 'ref_card_basic'),
    ('enterprise', 'ref_performance'),
    ('enterprise', 'selected_training'),
    ('enterprise', 'technical_radar')
)
insert into public.plan_capabilities (plan_key, capability_key)
select plan_key, capability_key
from plan_matrix
on conflict (plan_key, capability_key) do nothing;

with known_users as (
  select user_id from public.user_profiles where user_id is not null
  union
  select user_id from public.user_roles where user_id is not null
)
insert into public.user_global_roles (
  user_id,
  role_key,
  source
)
select
  known_users.user_id,
  case
    when exists (
      select 1
      from public.user_roles legacy_role
      where legacy_role.user_id = known_users.user_id
        and legacy_role.role in ('super_admin', 'video_admin')
    ) then 'super_admin'
    else 'referee'
  end,
  'legacy_backfill'
from known_users
on conflict (user_id) do nothing;

with known_users as (
  select user_id from public.user_profiles where user_id is not null
  union
  select user_id from public.user_roles where user_id is not null
)
insert into public.user_subscriptions (
  user_id,
  plan_key,
  status,
  starts_at,
  source
)
select
  known_users.user_id,
  case
    when exists (
      select 1
      from public.user_roles legacy_role
      where legacy_role.user_id = known_users.user_id
        and legacy_role.subscription_plan = 'pro'
    ) or exists (
      select 1
      from public.user_profiles legacy_profile
      where legacy_profile.user_id = known_users.user_id
        and legacy_profile.subscription_plan = 'pro'
    ) then 'pro'
    else 'basic'
  end,
  'active',
  now(),
  'legacy_backfill'
from known_users
on conflict (user_id) do nothing;

do $$
declare
  starts_expression text := 'coalesce(created_at, now())';
  ends_expression text := 'null';
begin
  if to_regclass('public.institutions') is null then
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'institutions'
      and column_name = 'license_start'
  ) then
    starts_expression := 'coalesce(license_start, created_at, now())';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'institutions'
      and column_name = 'license_end'
  ) then
    ends_expression := 'license_end';
  end if;

  execute format(
    $sql$
      insert into public.institution_subscriptions (
        institution_id,
        plan_key,
        status,
        starts_at,
        ends_at,
        seat_limit,
        source
      )
      select
        id,
        plan_key,
        case when status = 'active' then 'active' else 'paused' end,
        %s,
        %s,
        license_limit,
        'institution_backfill'
      from public.institutions
      where plan_key in ('academy', 'enterprise')
      on conflict (institution_id) do nothing
    $sql$,
    starts_expression,
    ends_expression
  );
end
$$;

create or replace function public.platform_request_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.platform_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_global_roles role_row
    where role_row.user_id = public.platform_request_user_id()
      and role_row.role_key = 'super_admin'
  );
$$;

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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'platform_roles',
    'user_global_roles',
    'access_plans',
    'capabilities',
    'user_subscriptions',
    'institution_subscriptions',
    'capability_overrides'
  ]
  loop
    execute format(
      'drop trigger if exists set_%I_updated_at on public.%I',
      table_name,
      table_name
    );
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

alter table public.platform_roles enable row level security;
alter table public.user_global_roles enable row level security;
alter table public.access_plans enable row level security;
alter table public.capabilities enable row level security;
alter table public.plan_capabilities enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.institution_subscriptions enable row level security;
alter table public.capability_overrides enable row level security;
alter table public.access_change_audit enable row level security;

revoke all on public.platform_roles from anon;
revoke all on public.user_global_roles from anon;
revoke all on public.access_plans from anon;
revoke all on public.capabilities from anon;
revoke all on public.plan_capabilities from anon;
revoke all on public.user_subscriptions from anon;
revoke all on public.institution_subscriptions from anon;
revoke all on public.capability_overrides from anon;
revoke all on public.access_change_audit from anon;

grant select on public.platform_roles to authenticated;
grant select on public.user_global_roles to authenticated;
grant select on public.access_plans to authenticated;
grant select on public.capabilities to authenticated;
grant select on public.plan_capabilities to authenticated;
grant select on public.user_subscriptions to authenticated;
grant select on public.institution_subscriptions to authenticated;
grant select on public.capability_overrides to authenticated;
grant select on public.access_change_audit to authenticated;

grant select, insert, update, delete on public.platform_roles to service_role;
grant select, insert, update, delete on public.user_global_roles to service_role;
grant select, insert, update, delete on public.access_plans to service_role;
grant select, insert, update, delete on public.capabilities to service_role;
grant select, insert, update, delete on public.plan_capabilities to service_role;
grant select, insert, update, delete on public.user_subscriptions to service_role;
grant select, insert, update, delete on public.institution_subscriptions to service_role;
grant select, insert, update, delete on public.capability_overrides to service_role;
grant select, insert, update, delete on public.access_change_audit to service_role;

drop policy if exists platform_roles_authenticated_read on public.platform_roles;
create policy platform_roles_authenticated_read
on public.platform_roles for select to authenticated
using (is_active);

drop policy if exists access_plans_authenticated_read on public.access_plans;
create policy access_plans_authenticated_read
on public.access_plans for select to authenticated
using (is_active);

drop policy if exists capabilities_authenticated_read on public.capabilities;
create policy capabilities_authenticated_read
on public.capabilities for select to authenticated
using (is_active);

drop policy if exists plan_capabilities_authenticated_read on public.plan_capabilities;
create policy plan_capabilities_authenticated_read
on public.plan_capabilities for select to authenticated
using (true);

drop policy if exists user_global_roles_own_read on public.user_global_roles;
create policy user_global_roles_own_read
on public.user_global_roles for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);

drop policy if exists user_subscriptions_own_read on public.user_subscriptions;
create policy user_subscriptions_own_read
on public.user_subscriptions for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);

drop policy if exists institution_subscriptions_member_read on public.institution_subscriptions;
create policy institution_subscriptions_member_read
on public.institution_subscriptions for select to authenticated
using (
  public.platform_is_super_admin()
  or exists (
    select 1
    from public.institution_memberships membership
    where membership.institution_id = institution_subscriptions.institution_id
      and membership.user_id = public.platform_request_user_id()
      and membership.status = 'active'
  )
);

drop policy if exists capability_overrides_own_read on public.capability_overrides;
create policy capability_overrides_own_read
on public.capability_overrides for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);

drop policy if exists access_change_audit_super_admin_read on public.access_change_audit;
create policy access_change_audit_super_admin_read
on public.access_change_audit for select to authenticated
using (public.platform_is_super_admin());

revoke all on function public.platform_request_user_id() from public, anon;
revoke all on function public.platform_is_super_admin() from public, anon;
revoke all on function public.admin_set_user_plan(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_set_global_role(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.platform_request_user_id()
  to authenticated, service_role;
grant execute on function public.platform_is_super_admin()
  to authenticated, service_role;
grant execute on function public.admin_set_user_plan(text, text, text, text)
  to service_role;
grant execute on function public.admin_set_global_role(text, text, text, text)
  to service_role;

comment on table public.user_global_roles is
  'Canonical global platform roles. Institutional roles remain in institution memberships.';
comment on table public.user_subscriptions is
  'Canonical individual subscription. Legacy free/pro columns remain synchronized temporarily.';
comment on table public.institution_subscriptions is
  'Institution license source used for temporary capability inheritance.';
comment on table public.capability_overrides is
  'Future-safe user exceptions. Global denies override all grants; institutional denies affect only that institution source.';
comment on table public.access_change_audit is
  'Immutable audit trail for global role and subscription changes.';

notify pgrst, 'reload schema';

commit;
