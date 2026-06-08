create extension if not exists pgcrypto;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  role text not null default 'individual_referee',
  subscription_plan text not null default 'free',
  institution_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_roles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id text,
  add column if not exists role text not null default 'individual_referee',
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists institution_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_roles
set role = 'super_admin'
where role = 'video_admin';

update public.user_roles
set role = 'individual_referee'
where role is null
  or role not in (
    'super_admin',
    'institution_admin',
    'institutional_instructor',
    'institutional_student',
    'individual_referee'
  );

update public.user_roles
set subscription_plan = 'free'
where subscription_plan is null
  or subscription_plan not in ('free', 'pro');

update public.user_roles
set created_at = now()
where created_at is null;

update public.user_roles
set updated_at = now()
where updated_at is null;

alter table public.user_roles
  drop constraint if exists user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (
    role in (
      'super_admin',
      'institution_admin',
      'institutional_instructor',
      'institutional_student',
      'individual_referee'
    )
  );

alter table public.user_roles
  drop constraint if exists user_roles_subscription_plan_check;

alter table public.user_roles
  add constraint user_roles_subscription_plan_check
  check (subscription_plan in ('free', 'pro'));

create unique index if not exists user_roles_user_id_unique
  on public.user_roles (user_id);

create index if not exists user_roles_subscription_plan_idx
  on public.user_roles (subscription_plan);

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text unique not null,
  email text,
  reflab_name text,
  first_name text,
  last_name text,
  country text,
  city text,
  association text,
  referee_type text,
  main_role text,
  referee_role text,
  category text,
  level text,
  birth_date date,
  avatar_url text,
  ref_card_id text,
  ranking_display_name text,
  show_real_name_in_ranking boolean not null default false,
  public_profile boolean not null default true,
  hide_ranking_name boolean not null default false,
  subscription_plan text not null default 'free',
  institution_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id text,
  add column if not exists email text,
  add column if not exists reflab_name text,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists association text,
  add column if not exists referee_type text,
  add column if not exists main_role text,
  add column if not exists referee_role text,
  add column if not exists category text,
  add column if not exists level text,
  add column if not exists birth_date date,
  add column if not exists avatar_url text,
  add column if not exists ref_card_id text,
  add column if not exists ranking_display_name text,
  add column if not exists show_real_name_in_ranking boolean not null default false,
  add column if not exists public_profile boolean not null default true,
  add column if not exists hide_ranking_name boolean not null default false,
  add column if not exists subscription_plan text not null default 'free',
  add column if not exists institution_id uuid,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_profiles
set subscription_plan = 'free'
where subscription_plan is null
  or subscription_plan not in ('free', 'pro');

update public.user_profiles
set ref_card_id = 'RF-2026-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where ref_card_id is null or ref_card_id = '';

update public.user_profiles
set created_at = now()
where created_at is null;

update public.user_profiles
set updated_at = now()
where updated_at is null;

alter table public.user_profiles
  drop constraint if exists user_profiles_subscription_plan_check;

alter table public.user_profiles
  add constraint user_profiles_subscription_plan_check
  check (subscription_plan in ('free', 'pro'));

create unique index if not exists user_profiles_user_id_unique
  on public.user_profiles (user_id);

create unique index if not exists user_profiles_ref_card_id_unique
  on public.user_profiles (ref_card_id)
  where ref_card_id is not null;

create index if not exists user_profiles_subscription_plan_idx
  on public.user_profiles (subscription_plan);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_roles_updated_at on public.user_roles;

create trigger set_user_roles_updated_at
before update on public.user_roles
for each row
execute function public.set_updated_at();

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;

create policy avatars_public_read
on storage.objects
for select
using (bucket_id = 'avatars');

grant select, insert, update, delete on table public.user_profiles to service_role;
grant select, insert, update, delete on table public.user_roles to service_role;

notify pgrst, 'reload schema';
