create extension if not exists pgcrypto;

create table if not exists public.institutional_leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text,
  institution_name text not null,
  institution_type text,
  country text,
  city text,
  referee_count integer check (referee_count is null or referee_count >= 0),
  instructor_count integer check (instructor_count is null or instructor_count >= 0),
  email text not null,
  whatsapp text,
  interest_areas text[] not null default '{}',
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_type text check (institution_type in ('school', 'league', 'association')),
  country text,
  city text,
  status text not null default 'pending',
  seats_total integer not null default 0 check (seats_total >= 0),
  seats_used integer not null default 0 check (seats_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id text,
  role text not null check (
    role in (
      'individual_referee',
      'institution_admin',
      'institutional_instructor',
      'institutional_student'
    )
  ),
  cohort text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists institutional_leads_status_idx
  on public.institutional_leads (status);

create index if not exists institutional_leads_created_at_idx
  on public.institutional_leads (created_at desc);

create index if not exists institution_members_institution_id_idx
  on public.institution_members (institution_id);

create index if not exists institution_members_user_id_idx
  on public.institution_members (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_institutional_leads_updated_at on public.institutional_leads;
create trigger set_institutional_leads_updated_at
before update on public.institutional_leads
for each row
execute function public.set_updated_at();

drop trigger if exists set_institutions_updated_at on public.institutions;
create trigger set_institutions_updated_at
before update on public.institutions
for each row
execute function public.set_updated_at();

alter table public.institutional_leads enable row level security;
alter table public.institutions enable row level security;
alter table public.institution_members enable row level security;

grant insert on table public.institutional_leads to anon, authenticated;
grant select, insert, update, delete on table public.institutional_leads to service_role;
grant select, insert, update, delete on table public.institutions to service_role;
grant select, insert, update, delete on table public.institution_members to service_role;

drop policy if exists "Public can create institutional leads" on public.institutional_leads;
create policy "Public can create institutional leads"
on public.institutional_leads
for insert
to anon, authenticated
with check (
  length(trim(full_name)) >= 2
  and length(trim(institution_name)) >= 2
  and position('@' in email) > 1
);
