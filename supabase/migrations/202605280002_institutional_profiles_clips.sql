create extension if not exists pgcrypto;

create table if not exists public.institution_profiles (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  institution_type text not null check (
    institution_type in ('school', 'league', 'association', 'federation')
  ),
  training_level text not null default 'introductory',
  custom_video_enabled boolean not null default false,
  public_clip_sharing_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id)
);

create table if not exists public.institutional_clips (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions(id) on delete set null,
  uploaded_by text not null,
  source_url text,
  storage_path text,
  original_filename text,
  title text not null,
  description text,
  match_context text,
  incident_minute text,
  category text,
  topic text,
  correct_decision text,
  correct_restart text,
  correct_discipline text,
  final_expected_answer text,
  explanation text,
  ifab_var_criteria text,
  difficulty text,
  mode text not null default 'institutional_video',
  is_public boolean not null default false,
  status text not null default 'uploaded' check (
    status in (
      'uploaded',
      'under_review',
      'processing',
      'approved',
      'rejected',
      'published'
    )
  ),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists institution_profiles_type_idx
  on public.institution_profiles (institution_type);

create index if not exists institutional_clips_institution_id_idx
  on public.institutional_clips (institution_id);

create index if not exists institutional_clips_uploaded_by_idx
  on public.institutional_clips (uploaded_by);

create index if not exists institutional_clips_status_idx
  on public.institutional_clips (status);

create index if not exists institutional_clips_is_public_idx
  on public.institutional_clips (is_public);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_institution_profiles_updated_at on public.institution_profiles;
create trigger set_institution_profiles_updated_at
before update on public.institution_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_institutional_clips_updated_at on public.institutional_clips;
create trigger set_institutional_clips_updated_at
before update on public.institutional_clips
for each row
execute function public.set_updated_at();

alter table public.institution_profiles enable row level security;
alter table public.institutional_clips enable row level security;

grant select, insert, update, delete on table public.institution_profiles to service_role;
grant select, insert, update, delete on table public.institutional_clips to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'institutional-videos',
  'institutional-videos',
  false,
  524288000,
  array['video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
