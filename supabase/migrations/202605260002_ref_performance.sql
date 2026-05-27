create extension if not exists pgcrypto;

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  has_match_today boolean not null default false,
  trains_today boolean not null default false,
  training_type text,
  duration_minutes integer,
  rpe integer check (rpe is null or (rpe between 1 and 10)),
  fatigue integer check (fatigue is null or (fatigue between 1 and 10)),
  sleep_quality text,
  sleep_hours numeric(4,2),
  pain_level text,
  emotional_state text,
  readiness_score integer check (readiness_score is null or (readiness_score between 0 and 100)),
  readiness_status text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  daily_checkin_id uuid references public.daily_checkins(id) on delete set null,
  session_type text,
  duration_minutes integer,
  rpe integer check (rpe is null or (rpe between 1 and 10)),
  internal_load integer,
  completed boolean not null default true,
  perceived_effort integer check (perceived_effort is null or (perceived_effort between 1 and 10)),
  fatigue_level integer check (fatigue_level is null or (fatigue_level between 1 and 10)),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.readiness_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  daily_checkin_id uuid references public.daily_checkins(id) on delete set null,
  score integer not null check (score between 0 and 100),
  status text,
  factors jsonb,
  created_at timestamptz not null default now()
);

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
  created_at timestamptz not null default now()
);

create table if not exists public.fatigue_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  fatigue integer check (fatigue is null or (fatigue between 1 and 10)),
  pain_level text,
  emotional_state text,
  created_at timestamptz not null default now()
);

create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  sleep_quality text,
  sleep_hours numeric(4,2),
  created_at timestamptz not null default now()
);

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  metric_type text not null,
  metric_value numeric,
  metric_payload jsonb,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists daily_checkins_user_created_idx
  on public.daily_checkins (user_id, created_at desc);

create index if not exists training_sessions_user_created_idx
  on public.training_sessions (user_id, created_at desc);

create index if not exists readiness_scores_user_created_idx
  on public.readiness_scores (user_id, created_at desc);

create index if not exists physical_tests_user_date_idx
  on public.physical_tests (user_id, test_date desc);

create index if not exists fatigue_logs_user_created_idx
  on public.fatigue_logs (user_id, created_at desc);

create index if not exists sleep_logs_user_created_idx
  on public.sleep_logs (user_id, created_at desc);

create index if not exists performance_metrics_user_created_idx
  on public.performance_metrics (user_id, created_at desc);

-- RefLab currently stores Clerk user ids in user_id from the client.
-- If Supabase JWT/Clerk RLS claims are later wired, add matching RLS policies here
-- before exposing these tables beyond the existing app access model.
