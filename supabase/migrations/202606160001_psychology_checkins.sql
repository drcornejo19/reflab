create extension if not exists pgcrypto;

create table if not exists public.psychology_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  checkin_type text not null default 'pre_match'
    check (checkin_type in ('pre_match', 'post_match', 'error_recovery')),
  match_context text,
  pressure_source text,
  focus_goal text,
  reset_cue text,
  incident_minute integer check (incident_minute is null or incident_minute between 0 and 130),
  incident_summary text,
  error_factors text[] not null default '{}',
  learning text,
  next_action text,
  activation_score integer check (activation_score is null or activation_score between 1 and 10),
  confidence_score integer check (confidence_score is null or confidence_score between 1 and 10),
  pressure_score integer check (pressure_score is null or pressure_score between 1 and 10),
  concentration_score integer check (concentration_score is null or concentration_score between 1 and 10),
  emotional_control_score integer check (emotional_control_score is null or emotional_control_score between 1 and 10),
  mental_fatigue_score integer check (mental_fatigue_score is null or mental_fatigue_score between 1 and 10),
  error_impact_score integer check (error_impact_score is null or error_impact_score between 1 and 10),
  recovery_score integer check (recovery_score is null or recovery_score between 1 and 10),
  process_orientation_score integer check (process_orientation_score is null or process_orientation_score between 1 and 10),
  mental_score integer check (mental_score is null or mental_score between 0 and 100),
  mental_status text,
  feedback jsonb not null default '{}'::jsonb,
  responses jsonb not null default '{}'::jsonb,
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

drop trigger if exists set_psychology_checkins_updated_at on public.psychology_checkins;
create trigger set_psychology_checkins_updated_at
before update on public.psychology_checkins
for each row execute function public.set_updated_at();

create index if not exists psychology_checkins_user_created_idx
  on public.psychology_checkins (user_id, created_at desc);

create index if not exists psychology_checkins_user_type_created_idx
  on public.psychology_checkins (user_id, checkin_type, created_at desc);

alter table public.psychology_checkins enable row level security;

grant select, insert, update, delete on public.psychology_checkins to service_role;

-- Psychology check-ins are written through authenticated server routes.
-- Do not expose these personal wellness records directly to anon clients.
