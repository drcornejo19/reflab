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

create index if not exists institutional_leads_status_idx
  on public.institutional_leads (status);

create index if not exists institutional_leads_created_at_idx
  on public.institutional_leads (created_at desc);

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

alter table public.institutional_leads enable row level security;

grant select, insert, update, delete on table public.institutional_leads to service_role;
