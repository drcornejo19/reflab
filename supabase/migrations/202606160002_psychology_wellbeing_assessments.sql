create extension if not exists pgcrypto;

create table if not exists public.psychology_wellbeing_assessments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  week_start date not null default current_date,
  week_context text,
  emotional_exhaustion_score integer check (emotional_exhaustion_score is null or emotional_exhaustion_score between 1 and 10),
  cynicism_score integer check (cynicism_score is null or cynicism_score between 1 and 10),
  motivation_score integer check (motivation_score is null or motivation_score between 1 and 10),
  sleep_disruption_score integer check (sleep_disruption_score is null or sleep_disruption_score between 1 and 10),
  concentration_difficulty_score integer check (concentration_difficulty_score is null or concentration_difficulty_score between 1 and 10),
  external_pressure_score integer check (external_pressure_score is null or external_pressure_score between 1 and 10),
  institutional_support_score integer check (institutional_support_score is null or institutional_support_score between 1 and 10),
  violence_exposure_score integer check (violence_exposure_score is null or violence_exposure_score between 1 and 10),
  recovery_quality_score integer check (recovery_quality_score is null or recovery_quality_score between 1 and 10),
  workload_score integer check (workload_score is null or workload_score between 1 and 10),
  burnout_risk_score integer check (burnout_risk_score is null or burnout_risk_score between 0 and 100),
  burnout_risk_level text,
  stressors text[] not null default '{}',
  protective_factors text[] not null default '{}',
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

drop trigger if exists set_psychology_wellbeing_assessments_updated_at on public.psychology_wellbeing_assessments;
create trigger set_psychology_wellbeing_assessments_updated_at
before update on public.psychology_wellbeing_assessments
for each row execute function public.set_updated_at();

create index if not exists psychology_wellbeing_user_created_idx
  on public.psychology_wellbeing_assessments (user_id, created_at desc);

create index if not exists psychology_wellbeing_user_week_idx
  on public.psychology_wellbeing_assessments (user_id, week_start desc);

alter table public.psychology_wellbeing_assessments enable row level security;

grant select, insert, update, delete on public.psychology_wellbeing_assessments to service_role;

-- Wellness assessments are personal records written through authenticated server routes.
-- Keep institutional/group reporting for a later stage with explicit anonymization rules.
