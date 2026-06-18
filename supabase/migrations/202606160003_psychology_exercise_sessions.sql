create extension if not exists pgcrypto;

create table if not exists public.psychology_exercise_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  exercise_type text not null
    check (exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
  scenario_id text,
  scenario_title text,
  pressure_level integer check (pressure_level is null or pressure_level between 1 and 10),
  before_score integer check (before_score is null or before_score between 1 and 10),
  after_score integer check (after_score is null or after_score between 1 and 10),
  clarity_score integer check (clarity_score is null or clarity_score between 1 and 10),
  response_strategy text,
  internal_dialogue_before text,
  internal_dialogue_after text,
  communication_phrase text,
  action_plan text,
  feedback jsonb not null default '{}'::jsonb,
  notes text,
  source_documents text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

drop trigger if exists set_psychology_exercise_sessions_updated_at on public.psychology_exercise_sessions;
create trigger set_psychology_exercise_sessions_updated_at
before update on public.psychology_exercise_sessions
for each row execute function public.set_updated_at();

create index if not exists psychology_exercises_user_created_idx
  on public.psychology_exercise_sessions (user_id, created_at desc);

create index if not exists psychology_exercises_user_type_created_idx
  on public.psychology_exercise_sessions (user_id, exercise_type, created_at desc);

alter table public.psychology_exercise_sessions enable row level security;

grant select, insert, update, delete on public.psychology_exercise_sessions to service_role;

-- Guided psychology exercises are personal training records written through authenticated server routes.
