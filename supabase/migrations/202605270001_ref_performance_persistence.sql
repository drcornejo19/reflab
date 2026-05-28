create extension if not exists pgcrypto;

create table if not exists public.performance_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  date date not null default current_date,
  checkin_type text not null default 'pre' check (checkin_type in ('pre', 'post', 'rest_day')),
  has_match_today boolean not null default false,
  has_training_today boolean not null default false,
  activity_type text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  rpe integer check (rpe is null or rpe between 1 and 10),
  fatigue integer check (fatigue is null or fatigue between 1 and 10),
  sleep_quality text,
  sleep_hours numeric(4,2) check (sleep_hours is null or sleep_hours between 0 and 24),
  soreness text,
  emotional_state text,
  emotional_score integer check (emotional_score is null or emotional_score between 1 and 10),
  readiness_score integer check (readiness_score is null or readiness_score between 0 and 100),
  readiness_status text,
  completed boolean,
  recovery_mobility boolean,
  internal_load integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid references public.performance_checkins(id) on delete set null,
  session_date date not null default current_date,
  session_type text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  rpe integer check (rpe is null or rpe between 1 and 10),
  internal_load integer,
  fatigue_post integer check (fatigue_post is null or fatigue_post between 1 and 10),
  soreness_post text,
  completed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wellness_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid references public.performance_checkins(id) on delete set null,
  date date not null default current_date,
  sleep_quality text,
  sleep_hours numeric(4,2) check (sleep_hours is null or sleep_hours between 0 and 24),
  fatigue integer check (fatigue is null or fatigue between 1 and 10),
  soreness text,
  emotional_state text,
  emotional_score integer check (emotional_score is null or emotional_score between 1 and 10),
  recovery_mobility boolean,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_id uuid references public.performance_checkins(id) on delete set null,
  score integer not null check (score between 0 and 100),
  status text,
  factors jsonb,
  created_at timestamptz not null default now()
);

alter table public.readiness_scores
  add column if not exists checkin_id uuid references public.performance_checkins(id) on delete set null;

create table if not exists public.physical_tests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  test_type text not null,
  score numeric,
  unit text,
  gender_category text,
  target_value numeric,
  notes text,
  test_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.physical_tests
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  metric_type text not null,
  metric_value numeric,
  metric_payload jsonb,
  source text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_performance_checkins_updated_at on public.performance_checkins;
create trigger set_performance_checkins_updated_at
before update on public.performance_checkins
for each row execute function public.set_updated_at();

drop trigger if exists set_performance_sessions_updated_at on public.performance_sessions;
create trigger set_performance_sessions_updated_at
before update on public.performance_sessions
for each row execute function public.set_updated_at();

drop trigger if exists set_wellness_logs_updated_at on public.wellness_logs;
create trigger set_wellness_logs_updated_at
before update on public.wellness_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_physical_tests_updated_at on public.physical_tests;
create trigger set_physical_tests_updated_at
before update on public.physical_tests
for each row execute function public.set_updated_at();

create index if not exists performance_checkins_user_created_idx
  on public.performance_checkins (user_id, created_at desc);

create index if not exists performance_checkins_user_date_type_idx
  on public.performance_checkins (user_id, date desc, checkin_type);

create index if not exists performance_sessions_user_created_idx
  on public.performance_sessions (user_id, created_at desc);

create index if not exists wellness_logs_user_date_idx
  on public.wellness_logs (user_id, date desc);

create index if not exists readiness_scores_user_created_idx
  on public.readiness_scores (user_id, created_at desc);

create index if not exists physical_tests_user_date_idx
  on public.physical_tests (user_id, test_date desc);

create index if not exists performance_metrics_user_created_idx
  on public.performance_metrics (user_id, created_at desc);

alter table public.performance_checkins enable row level security;
alter table public.performance_sessions enable row level security;
alter table public.wellness_logs enable row level security;
alter table public.readiness_scores enable row level security;
alter table public.physical_tests enable row level security;
alter table public.performance_metrics enable row level security;

grant select, insert, update, delete on public.performance_checkins to service_role;
grant select, insert, update, delete on public.performance_sessions to service_role;
grant select, insert, update, delete on public.wellness_logs to service_role;
grant select, insert, update, delete on public.readiness_scores to service_role;
grant select, insert, update, delete on public.physical_tests to service_role;
grant select, insert, update, delete on public.performance_metrics to service_role;

-- Ref Performance writes must go through authenticated server routes.
-- Do not expose these wellness tables directly to anon clients.
