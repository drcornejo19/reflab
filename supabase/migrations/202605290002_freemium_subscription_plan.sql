alter table if exists public.user_profiles
  add column if not exists subscription_plan text not null default 'free';

alter table if exists public.user_profiles
  add column if not exists email text;

alter table if exists public.user_roles
  add column if not exists subscription_plan text not null default 'free';

update public.user_profiles
set subscription_plan = 'free'
where subscription_plan is null
  or subscription_plan not in ('free', 'pro');

update public.user_roles
set subscription_plan = 'free'
where subscription_plan is null
  or subscription_plan not in ('free', 'pro');

alter table if exists public.user_profiles
  drop constraint if exists user_profiles_subscription_plan_check;

alter table if exists public.user_profiles
  add constraint user_profiles_subscription_plan_check
  check (subscription_plan in ('free', 'pro'));

alter table if exists public.user_roles
  drop constraint if exists user_roles_subscription_plan_check;

alter table if exists public.user_roles
  add constraint user_roles_subscription_plan_check
  check (subscription_plan in ('free', 'pro'));

create index if not exists user_profiles_subscription_plan_idx
  on public.user_profiles (subscription_plan);

create index if not exists user_roles_subscription_plan_idx
  on public.user_roles (subscription_plan);

grant select, insert, update, delete on table public.user_profiles to service_role;
grant select, insert, update, delete on table public.user_roles to service_role;
