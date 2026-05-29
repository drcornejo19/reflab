create extension if not exists pgcrypto;

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  institution_type text check (institution_type in ('school', 'league', 'association')),
  country text,
  city text,
  seats_total integer not null default 0 check (seats_total >= 0),
  seats_used integer not null default 0 check (seats_used >= 0),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.institutions
  add column if not exists institution_type text,
  add column if not exists status text not null default 'pending',
  add column if not exists seats_total integer not null default 0,
  add column if not exists seats_used integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'institutions'
      and column_name = 'type'
  ) then
    execute $sql$
      update public.institutions
      set institution_type = coalesce(institution_type, type)
      where institution_type is null
    $sql$;

    execute $sql$
      update public.institutions
      set type = 'association'
      where type not in ('school', 'league', 'association')
    $sql$;
  end if;
end
$$;

update public.institutions
set institution_type = 'association'
where institution_type not in ('school', 'league', 'association');

update public.institutions
set institution_type = 'school'
where institution_type is null;

alter table if exists public.institutions
  drop constraint if exists institutions_institution_type_check;

alter table if exists public.institutions
  add constraint institutions_institution_type_check
  check (institution_type in ('school', 'league', 'association'));

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  role text not null default 'individual_referee',
  institution_id uuid references public.institutions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.user_roles
  add column if not exists institution_id uuid references public.institutions(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.user_roles
set role = 'super_admin'
where role = 'video_admin';

update public.user_roles
set role = 'individual_referee'
where role = 'user';

update public.user_roles
set role = 'institutional_instructor'
where role = 'instructor';

alter table if exists public.user_roles
  drop constraint if exists user_roles_role_check;

alter table if exists public.user_roles
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

create table if not exists public.institution_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id text,
  role text not null default 'institutional_student',
  cohort text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

update public.institution_members
set role = 'institutional_instructor'
where role = 'instructor';

update public.institution_members
set role = 'individual_referee'
where role = 'user';

alter table if exists public.institution_members
  drop constraint if exists institution_members_role_check;

alter table if exists public.institution_members
  add constraint institution_members_role_check
  check (
    role in (
      'super_admin',
      'institution_admin',
      'institutional_instructor',
      'institutional_student',
      'individual_referee'
    )
  );

create table if not exists public.institution_profiles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  institution_type text not null default 'school',
  training_level text not null default 'initial',
  custom_video_enabled boolean not null default false,
  public_clip_sharing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id)
);

update public.institution_profiles
set institution_type = 'association'
where institution_type not in ('school', 'league', 'association');

alter table if exists public.institution_profiles
  drop constraint if exists institution_profiles_institution_type_check;

alter table if exists public.institution_profiles
  add constraint institution_profiles_institution_type_check
  check (institution_type in ('school', 'league', 'association'));

create table if not exists public.institution_programs (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  name text not null,
  description text,
  program_type text not null default 'school_course',
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_program_items (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.institution_programs(id) on delete cascade,
  week_number integer check (week_number is null or week_number > 0),
  title text not null,
  item_type text not null check (
    item_type in ('rule', 'video', 'activity', 'exam', 'evaluation')
  ),
  ref_rule_number integer check (ref_rule_number is null or ref_rule_number between 1 and 17),
  topic text,
  open_at timestamptz,
  close_at timestamptz,
  required boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'scheduled' check (
    status in ('draft', 'scheduled', 'open', 'closed', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.institution_student_progress (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  program_id uuid references public.institution_programs(id) on delete cascade,
  item_id uuid references public.institution_program_items(id) on delete cascade,
  user_id text not null,
  status text not null default 'not_started' check (
    status in ('not_started', 'in_progress', 'completed')
  ),
  score numeric(5,2),
  percentage numeric(5,2),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institutions_type_idx
  on public.institutions (institution_type);

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id);

create index if not exists user_roles_institution_id_idx
  on public.user_roles (institution_id);

create index if not exists institution_members_institution_id_idx
  on public.institution_members (institution_id);

create index if not exists institution_members_user_id_idx
  on public.institution_members (user_id);

create index if not exists institution_programs_institution_id_idx
  on public.institution_programs (institution_id);

create index if not exists institution_program_items_program_id_idx
  on public.institution_program_items (program_id);

create index if not exists institution_student_progress_user_id_idx
  on public.institution_student_progress (user_id);

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

drop trigger if exists set_institution_members_updated_at on public.institution_members;
create trigger set_institution_members_updated_at
before update on public.institution_members
for each row
execute function public.set_updated_at();

drop trigger if exists set_institution_programs_updated_at on public.institution_programs;
create trigger set_institution_programs_updated_at
before update on public.institution_programs
for each row
execute function public.set_updated_at();

drop trigger if exists set_institution_program_items_updated_at on public.institution_program_items;
create trigger set_institution_program_items_updated_at
before update on public.institution_program_items
for each row
execute function public.set_updated_at();

drop trigger if exists set_institution_student_progress_updated_at on public.institution_student_progress;
create trigger set_institution_student_progress_updated_at
before update on public.institution_student_progress
for each row
execute function public.set_updated_at();

alter table public.institutions enable row level security;
alter table public.user_roles enable row level security;
alter table public.institution_members enable row level security;
alter table public.institution_profiles enable row level security;
alter table public.institution_programs enable row level security;
alter table public.institution_program_items enable row level security;
alter table public.institution_student_progress enable row level security;

grant select, insert, update, delete on table public.institutions to service_role;
grant select, insert, update, delete on table public.user_roles to service_role;
grant select, insert, update, delete on table public.institution_members to service_role;
grant select, insert, update, delete on table public.institution_profiles to service_role;
grant select, insert, update, delete on table public.institution_programs to service_role;
grant select, insert, update, delete on table public.institution_program_items to service_role;
grant select, insert, update, delete on table public.institution_student_progress to service_role;
