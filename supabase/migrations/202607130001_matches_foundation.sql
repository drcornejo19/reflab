create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint countries_code_length_check check (char_length(code) between 2 and 3)
);

create table if not exists public.associations (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete set null,
  code text,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint associations_country_name_unique unique (country_id, name)
);

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  association_id uuid references public.associations(id) on delete cascade,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  name text not null,
  short_name text,
  competition_type text not null default 'league' check (
    competition_type in ('league', 'cup', 'playoff', 'friendly', 'tournament', 'other')
  ),
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('institutional', 'api', 'manual')
  ),
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competitions_association_sport_name_unique unique (association_id, sport_type, name)
);

create table if not exists public.competition_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  label text not null,
  start_date date,
  end_date date,
  status text not null default 'active' check (
    status in ('draft', 'active', 'archived')
  ),
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('institutional', 'api', 'manual')
  ),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_seasons_competition_label_unique unique (competition_id, label)
);

create table if not exists public.competition_categories (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  season_id uuid references public.competition_seasons(id) on delete cascade,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  name text not null,
  level_order integer,
  referee_system text,
  var_supported boolean not null default false,
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('institutional', 'api', 'manual')
  ),
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint competition_categories_scope_unique unique (competition_id, season_id, name)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  country_id uuid references public.countries(id) on delete set null,
  association_id uuid references public.associations(id) on delete set null,
  name text not null,
  short_name text,
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('institutional', 'api', 'manual')
  ),
  external_id text,
  crest_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete set null,
  association_id uuid references public.associations(id) on delete set null,
  name text not null,
  city text,
  address text,
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('institutional', 'api', 'manual')
  ),
  external_id text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referee_roles (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  role_key text not null,
  label text not null,
  role_group text,
  requires_var boolean not null default false,
  is_reserve boolean not null default false,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint referee_roles_sport_key_unique unique (sport_type, role_key)
);

create table if not exists public.fixtures (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  country_id uuid references public.countries(id) on delete set null,
  association_id uuid references public.associations(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  season_id uuid references public.competition_seasons(id) on delete set null,
  category_id uuid references public.competition_categories(id) on delete set null,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  kickoff_at timestamptz not null,
  round_label text,
  matchday_number integer,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'confirmed', 'live', 'completed', 'postponed', 'suspended', 'cancelled')
  ),
  referee_system text,
  var_enabled boolean not null default false,
  data_source text not null default 'manual' check (
    data_source in ('institutional', 'api', 'manual')
  ),
  provider text,
  external_id text,
  raw_source_reference jsonb not null default '{}'::jsonb,
  notes text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixtures_raw_source_reference_object_check check (
    jsonb_typeof(raw_source_reference) = 'object'
  ),
  constraint fixtures_distinct_teams_check check (
    home_team_id is null or away_team_id is null or home_team_id <> away_team_id
  )
);

create table if not exists public.referee_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  institution_id uuid references public.institutions(id) on delete set null,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  country_id uuid references public.countries(id) on delete set null,
  association_id uuid references public.associations(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  category_id uuid references public.competition_categories(id) on delete set null,
  role_id uuid not null references public.referee_roles(id) on delete cascade,
  eligibility_mode text not null default 'eligible' check (
    eligibility_mode in ('eligible', 'view_only', 'blocked')
  ),
  allow_lower_categories boolean not null default false,
  allow_higher_categories boolean not null default false,
  source_type text not null default 'profile' check (
    source_type in ('profile', 'institutional', 'admin', 'system')
  ),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  role_id uuid not null references public.referee_roles(id) on delete restrict,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  competition_id uuid references public.competitions(id) on delete set null,
  association_id uuid references public.associations(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  source_type text not null default 'manual' check (
    source_type in ('manual', 'institutional', 'api')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'pending_confirmation', 'confirmed', 'modified', 'replaced', 'cancelled', 'suspended', 'postponed', 'completed')
  ),
  created_by_user_id text,
  confirmed_at timestamptz,
  observations text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

alter table public.appointments
  add column if not exists replaced_by_appointment_id uuid references public.appointments(id) on delete set null;

create table if not exists public.appointment_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id text not null,
  changed_by_user_id text,
  change_type text not null default 'created' check (
    change_type in ('created', 'status_changed', 'role_changed', 'fixture_changed', 'note_updated', 'system_sync')
  ),
  from_status text,
  to_status text,
  reason text,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint appointment_history_snapshot_object_check check (
    jsonb_typeof(snapshot) = 'object'
  )
);

create table if not exists public.match_officials (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  role_id uuid not null references public.referee_roles(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete set null,
  user_id text,
  official_name text,
  source_type text not null default 'manual' check (
    source_type in ('manual', 'institutional', 'api')
  ),
  status text not null default 'assigned' check (
    status in ('assigned', 'confirmed', 'replaced', 'removed')
  ),
  is_primary_assignment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  provider text,
  source_type text not null default 'manual' check (
    source_type in ('manual', 'institutional', 'api')
  ),
  snapshot_type text not null check (
    snapshot_type in ('standings', 'form', 'disciplinary', 'official_note', 'summary')
  ),
  period_label text,
  updated_source_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_context_snapshots_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  )
);

create table if not exists public.match_preparations (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id text not null,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  stage text not null check (
    stage in ('72_48_hours', '24_hours', 'matchday')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'completed')
  ),
  technical_focus text,
  physical_focus text,
  communication_focus text,
  psychological_focus text,
  checklist jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_preparations_stage_unique unique (appointment_id, stage),
  constraint match_preparations_checklist_array_check check (
    jsonb_typeof(checklist) = 'array'
  ),
  constraint match_preparations_answers_object_check check (
    jsonb_typeof(answers) = 'object'
  )
);

create table if not exists public.post_match_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  user_id text not null,
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  result_summary text,
  minutes_played integer check (
    minutes_played is null or minutes_played between 0 and 180
  ),
  incidents jsonb not null default '[]'::jsonb,
  key_decisions jsonb not null default '[]'::jsonb,
  perceived_load integer check (
    perceived_load is null or perceived_load between 1 and 10
  ),
  fatigue_score integer check (
    fatigue_score is null or fatigue_score between 1 and 10
  ),
  soreness text,
  emotional_state text,
  strengths text[] not null default '{}',
  perceived_errors text[] not null default '{}',
  situations_to_review text[] not null default '{}',
  notes text,
  closure_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_match_reviews_incidents_array_check check (
    jsonb_typeof(incidents) = 'array'
  ),
  constraint post_match_reviews_key_decisions_array_check check (
    jsonb_typeof(key_decisions) = 'array'
  )
);

insert into public.referee_roles (sport_type, role_key, label, role_group, display_order)
values
  ('football_11', 'referee', 'Arbitro', 'field', 10),
  ('football_11', 'assistant_1', 'Arbitro asistente n. 1', 'assistant', 20),
  ('football_11', 'assistant_2', 'Arbitro asistente n. 2', 'assistant', 30),
  ('football_11', 'fourth_official', 'Cuarto arbitro', 'support', 40),
  ('football_11', 'fifth_official', 'Quinto arbitro', 'support', 50),
  ('football_11', 'var', 'VAR', 'video', 60),
  ('football_11', 'avar', 'AVAR', 'video', 70),
  ('football_11', 'reserve_assistant', 'Asistente de reserva', 'assistant', 80),
  ('football_11', 'other', 'Otro rol configurable', 'other', 90),
  ('futsal', 'first_referee', 'Primer arbitro', 'field', 10),
  ('futsal', 'second_referee', 'Segundo arbitro', 'field', 20),
  ('futsal', 'third_referee', 'Tercer arbitro', 'support', 30),
  ('futsal', 'timekeeper', 'Cronometrador', 'support', 40),
  ('futsal', 'reserve_assistant', 'Arbitro asistente de reserva', 'support', 50),
  ('futsal', 'other', 'Otro rol configurable', 'other', 60)
on conflict (sport_type, role_key) do update
set
  label = excluded.label,
  role_group = excluded.role_group,
  display_order = excluded.display_order,
  updated_at = now();

update public.referee_roles
set requires_var = true
where sport_type = 'football_11'
  and role_key in ('var', 'avar');

update public.referee_roles
set is_reserve = true
where role_key in ('reserve_assistant');

create unique index if not exists teams_provider_external_unique
  on public.teams (provider, external_id)
  where external_id is not null;

create unique index if not exists venues_provider_external_unique
  on public.venues (provider, external_id)
  where external_id is not null;

create unique index if not exists fixtures_provider_external_unique
  on public.fixtures (provider, external_id)
  where external_id is not null;

create unique index if not exists appointments_user_fixture_role_active_idx
  on public.appointments (user_id, fixture_id, role_id)
  where status not in ('cancelled', 'replaced');

create index if not exists countries_name_idx
  on public.countries (name);

create index if not exists associations_country_idx
  on public.associations (country_id, name);

create index if not exists competitions_association_sport_idx
  on public.competitions (association_id, sport_type);

create index if not exists competition_seasons_competition_idx
  on public.competition_seasons (competition_id, status);

create index if not exists competition_categories_competition_idx
  on public.competition_categories (competition_id, sport_type, is_active);

create index if not exists teams_sport_name_idx
  on public.teams (sport_type, name);

create index if not exists venues_name_idx
  on public.venues (name);

create index if not exists referee_roles_sport_order_idx
  on public.referee_roles (sport_type, display_order);

create index if not exists fixtures_sport_kickoff_idx
  on public.fixtures (sport_type, kickoff_at desc);

create index if not exists fixtures_competition_status_idx
  on public.fixtures (competition_id, status, kickoff_at desc);

create index if not exists referee_eligibility_user_sport_idx
  on public.referee_eligibility (user_id, sport_type, is_active);

create index if not exists appointments_user_status_idx
  on public.appointments (user_id, status, created_at desc);

create index if not exists appointments_fixture_idx
  on public.appointments (fixture_id, created_at desc);

create index if not exists appointment_history_appointment_idx
  on public.appointment_history (appointment_id, created_at desc);

create index if not exists match_officials_fixture_idx
  on public.match_officials (fixture_id, status);

create index if not exists match_context_snapshots_fixture_type_idx
  on public.match_context_snapshots (fixture_id, snapshot_type, created_at desc);

create index if not exists match_preparations_appointment_idx
  on public.match_preparations (appointment_id, stage);

create index if not exists post_match_reviews_user_created_idx
  on public.post_match_reviews (user_id, created_at desc);

drop trigger if exists set_countries_updated_at on public.countries;
create trigger set_countries_updated_at
before update on public.countries
for each row execute function public.set_updated_at();

drop trigger if exists set_associations_updated_at on public.associations;
create trigger set_associations_updated_at
before update on public.associations
for each row execute function public.set_updated_at();

drop trigger if exists set_competitions_updated_at on public.competitions;
create trigger set_competitions_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

drop trigger if exists set_competition_seasons_updated_at on public.competition_seasons;
create trigger set_competition_seasons_updated_at
before update on public.competition_seasons
for each row execute function public.set_updated_at();

drop trigger if exists set_competition_categories_updated_at on public.competition_categories;
create trigger set_competition_categories_updated_at
before update on public.competition_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_teams_updated_at on public.teams;
create trigger set_teams_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

drop trigger if exists set_venues_updated_at on public.venues;
create trigger set_venues_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

drop trigger if exists set_referee_roles_updated_at on public.referee_roles;
create trigger set_referee_roles_updated_at
before update on public.referee_roles
for each row execute function public.set_updated_at();

drop trigger if exists set_fixtures_updated_at on public.fixtures;
create trigger set_fixtures_updated_at
before update on public.fixtures
for each row execute function public.set_updated_at();

drop trigger if exists set_referee_eligibility_updated_at on public.referee_eligibility;
create trigger set_referee_eligibility_updated_at
before update on public.referee_eligibility
for each row execute function public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists set_match_officials_updated_at on public.match_officials;
create trigger set_match_officials_updated_at
before update on public.match_officials
for each row execute function public.set_updated_at();

drop trigger if exists set_match_context_snapshots_updated_at on public.match_context_snapshots;
create trigger set_match_context_snapshots_updated_at
before update on public.match_context_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists set_match_preparations_updated_at on public.match_preparations;
create trigger set_match_preparations_updated_at
before update on public.match_preparations
for each row execute function public.set_updated_at();

drop trigger if exists set_post_match_reviews_updated_at on public.post_match_reviews;
create trigger set_post_match_reviews_updated_at
before update on public.post_match_reviews
for each row execute function public.set_updated_at();

alter table if exists public.performance_checkins
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.performance_sessions
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.wellness_logs
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.readiness_scores
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.psychology_checkins
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.psychology_exercise_sessions
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text,
  add column if not exists referee_role_key text;

alter table if exists public.notification_events
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists fixture_id uuid references public.fixtures(id) on delete set null,
  add column if not exists sport_type text;

create index if not exists performance_checkins_user_appointment_idx
  on public.performance_checkins (user_id, appointment_id, created_at desc);

create index if not exists performance_sessions_user_appointment_idx
  on public.performance_sessions (user_id, appointment_id, created_at desc);

create index if not exists wellness_logs_user_appointment_idx
  on public.wellness_logs (user_id, appointment_id, created_at desc);

create index if not exists readiness_scores_user_appointment_idx
  on public.readiness_scores (user_id, appointment_id, created_at desc);

create index if not exists psychology_checkins_user_appointment_idx
  on public.psychology_checkins (user_id, appointment_id, created_at desc);

create index if not exists psychology_exercises_user_appointment_idx
  on public.psychology_exercise_sessions (user_id, appointment_id, created_at desc);

create index if not exists notification_events_appointment_idx
  on public.notification_events (appointment_id, created_at desc);

alter table public.countries enable row level security;
alter table public.associations enable row level security;
alter table public.competitions enable row level security;
alter table public.competition_seasons enable row level security;
alter table public.competition_categories enable row level security;
alter table public.teams enable row level security;
alter table public.venues enable row level security;
alter table public.referee_roles enable row level security;
alter table public.fixtures enable row level security;
alter table public.referee_eligibility enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_history enable row level security;
alter table public.match_officials enable row level security;
alter table public.match_context_snapshots enable row level security;
alter table public.match_preparations enable row level security;
alter table public.post_match_reviews enable row level security;

drop policy if exists "countries_authenticated_read" on public.countries;
create policy "countries_authenticated_read"
on public.countries
for select
to authenticated
using (true);

drop policy if exists "associations_authenticated_read" on public.associations;
create policy "associations_authenticated_read"
on public.associations
for select
to authenticated
using (true);

drop policy if exists "competitions_authenticated_read" on public.competitions;
create policy "competitions_authenticated_read"
on public.competitions
for select
to authenticated
using (true);

drop policy if exists "competition_seasons_authenticated_read" on public.competition_seasons;
create policy "competition_seasons_authenticated_read"
on public.competition_seasons
for select
to authenticated
using (true);

drop policy if exists "competition_categories_authenticated_read" on public.competition_categories;
create policy "competition_categories_authenticated_read"
on public.competition_categories
for select
to authenticated
using (true);

drop policy if exists "teams_authenticated_read" on public.teams;
create policy "teams_authenticated_read"
on public.teams
for select
to authenticated
using (true);

drop policy if exists "venues_authenticated_read" on public.venues;
create policy "venues_authenticated_read"
on public.venues
for select
to authenticated
using (true);

drop policy if exists "referee_roles_authenticated_read" on public.referee_roles;
create policy "referee_roles_authenticated_read"
on public.referee_roles
for select
to authenticated
using (true);

drop policy if exists "fixtures_authenticated_read" on public.fixtures;
create policy "fixtures_authenticated_read"
on public.fixtures
for select
to authenticated
using (true);

drop policy if exists "match_officials_authenticated_read" on public.match_officials;
create policy "match_officials_authenticated_read"
on public.match_officials
for select
to authenticated
using (true);

drop policy if exists "match_context_snapshots_authenticated_read" on public.match_context_snapshots;
create policy "match_context_snapshots_authenticated_read"
on public.match_context_snapshots
for select
to authenticated
using (true);

drop policy if exists "referee_eligibility_authenticated_read_own" on public.referee_eligibility;
create policy "referee_eligibility_authenticated_read_own"
on public.referee_eligibility
for select
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

drop policy if exists "appointments_authenticated_read_own" on public.appointments;
create policy "appointments_authenticated_read_own"
on public.appointments
for select
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

drop policy if exists "appointments_authenticated_insert_manual" on public.appointments;
create policy "appointments_authenticated_insert_manual"
on public.appointments
for insert
to authenticated
with check (
  user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  and source_type = 'manual'
);

drop policy if exists "appointments_authenticated_update_manual" on public.appointments;
create policy "appointments_authenticated_update_manual"
on public.appointments
for update
to authenticated
using (
  user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  and source_type = 'manual'
)
with check (
  user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  and source_type = 'manual'
);

drop policy if exists "appointments_authenticated_delete_manual" on public.appointments;
create policy "appointments_authenticated_delete_manual"
on public.appointments
for delete
to authenticated
using (
  user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text)
  and source_type = 'manual'
);

drop policy if exists "appointment_history_authenticated_read_own" on public.appointment_history;
create policy "appointment_history_authenticated_read_own"
on public.appointment_history
for select
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

drop policy if exists "match_preparations_authenticated_manage_own" on public.match_preparations;
create policy "match_preparations_authenticated_manage_own"
on public.match_preparations
for all
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text))
with check (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

drop policy if exists "post_match_reviews_authenticated_manage_own" on public.post_match_reviews;
create policy "post_match_reviews_authenticated_manage_own"
on public.post_match_reviews
for all
to authenticated
using (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text))
with check (user_id = coalesce(auth.jwt() ->> 'sub', auth.uid()::text));

drop policy if exists "countries_service_role_all" on public.countries;
create policy "countries_service_role_all"
on public.countries
for all
to service_role
using (true)
with check (true);

drop policy if exists "associations_service_role_all" on public.associations;
create policy "associations_service_role_all"
on public.associations
for all
to service_role
using (true)
with check (true);

drop policy if exists "competitions_service_role_all" on public.competitions;
create policy "competitions_service_role_all"
on public.competitions
for all
to service_role
using (true)
with check (true);

drop policy if exists "competition_seasons_service_role_all" on public.competition_seasons;
create policy "competition_seasons_service_role_all"
on public.competition_seasons
for all
to service_role
using (true)
with check (true);

drop policy if exists "competition_categories_service_role_all" on public.competition_categories;
create policy "competition_categories_service_role_all"
on public.competition_categories
for all
to service_role
using (true)
with check (true);

drop policy if exists "teams_service_role_all" on public.teams;
create policy "teams_service_role_all"
on public.teams
for all
to service_role
using (true)
with check (true);

drop policy if exists "venues_service_role_all" on public.venues;
create policy "venues_service_role_all"
on public.venues
for all
to service_role
using (true)
with check (true);

drop policy if exists "referee_roles_service_role_all" on public.referee_roles;
create policy "referee_roles_service_role_all"
on public.referee_roles
for all
to service_role
using (true)
with check (true);

drop policy if exists "fixtures_service_role_all" on public.fixtures;
create policy "fixtures_service_role_all"
on public.fixtures
for all
to service_role
using (true)
with check (true);

drop policy if exists "referee_eligibility_service_role_all" on public.referee_eligibility;
create policy "referee_eligibility_service_role_all"
on public.referee_eligibility
for all
to service_role
using (true)
with check (true);

drop policy if exists "appointments_service_role_all" on public.appointments;
create policy "appointments_service_role_all"
on public.appointments
for all
to service_role
using (true)
with check (true);

drop policy if exists "appointment_history_service_role_all" on public.appointment_history;
create policy "appointment_history_service_role_all"
on public.appointment_history
for all
to service_role
using (true)
with check (true);

drop policy if exists "match_officials_service_role_all" on public.match_officials;
create policy "match_officials_service_role_all"
on public.match_officials
for all
to service_role
using (true)
with check (true);

drop policy if exists "match_context_snapshots_service_role_all" on public.match_context_snapshots;
create policy "match_context_snapshots_service_role_all"
on public.match_context_snapshots
for all
to service_role
using (true)
with check (true);

drop policy if exists "match_preparations_service_role_all" on public.match_preparations;
create policy "match_preparations_service_role_all"
on public.match_preparations
for all
to service_role
using (true)
with check (true);

drop policy if exists "post_match_reviews_service_role_all" on public.post_match_reviews;
create policy "post_match_reviews_service_role_all"
on public.post_match_reviews
for all
to service_role
using (true)
with check (true);

grant select on public.countries to authenticated;
grant select on public.associations to authenticated;
grant select on public.competitions to authenticated;
grant select on public.competition_seasons to authenticated;
grant select on public.competition_categories to authenticated;
grant select on public.teams to authenticated;
grant select on public.venues to authenticated;
grant select on public.referee_roles to authenticated;
grant select on public.fixtures to authenticated;
grant select on public.referee_eligibility to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select on public.appointment_history to authenticated;
grant select on public.match_officials to authenticated;
grant select on public.match_context_snapshots to authenticated;
grant select, insert, update, delete on public.match_preparations to authenticated;
grant select, insert, update, delete on public.post_match_reviews to authenticated;

grant select, insert, update, delete on public.countries to service_role;
grant select, insert, update, delete on public.associations to service_role;
grant select, insert, update, delete on public.competitions to service_role;
grant select, insert, update, delete on public.competition_seasons to service_role;
grant select, insert, update, delete on public.competition_categories to service_role;
grant select, insert, update, delete on public.teams to service_role;
grant select, insert, update, delete on public.venues to service_role;
grant select, insert, update, delete on public.referee_roles to service_role;
grant select, insert, update, delete on public.fixtures to service_role;
grant select, insert, update, delete on public.referee_eligibility to service_role;
grant select, insert, update, delete on public.appointments to service_role;
grant select, insert, update, delete on public.appointment_history to service_role;
grant select, insert, update, delete on public.match_officials to service_role;
grant select, insert, update, delete on public.match_context_snapshots to service_role;
grant select, insert, update, delete on public.match_preparations to service_role;
grant select, insert, update, delete on public.post_match_reviews to service_role;

notify pgrst, 'reload schema';
