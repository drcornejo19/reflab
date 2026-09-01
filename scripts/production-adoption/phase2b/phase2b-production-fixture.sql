-- Synthetic historical Production contract for disposable local PostgreSQL.

create table public.institutions (
  id uuid primary key,
  status text not null default 'active',
  deleted_at timestamptz,
  created_by_user_id text
);
create table public.institution_groups (id uuid primary key, institution_id uuid, created_by_user_id text);
create table public.institution_assessment_sessions (id uuid primary key, user_id text);
create table public.user_profiles (user_id text primary key, ref_card_id text);
create table public.user_global_roles (
  user_id text primary key,
  role_key text not null,
  source text not null,
  assigned_by_user_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.user_subscriptions (
  user_id text primary key,
  plan_key text not null,
  status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  source text not null,
  assigned_by_user_id text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.institution_subscriptions (
  institution_id uuid primary key,
  plan_key text not null,
  status text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now()
);
create table public.access_change_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id text not null,
  target_user_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.institution_memberships (
  id uuid primary key,
  institution_id uuid not null,
  user_id text not null,
  status text not null,
  invited_by_user_id text
);
create table public.clips (
  id uuid primary key,
  sport_type text not null,
  title text not null,
  topic text not null,
  subtopic text,
  sub_type text,
  rule_reference text,
  season text,
  source_version text,
  difficulty text,
  is_active boolean not null default true,
  status text not null default 'published'
);
create table public.attempts (
  id uuid primary key,
  user_id text,
  sport_type text,
  activity_type text,
  ref_card_id text,
  exam_result_id uuid,
  submission_id uuid,
  clip_id text,
  clip_title text,
  module text,
  mode text,
  topic text,
  subtopic text,
  rule_reference text,
  season text,
  source_version text,
  difficulty text,
  score numeric(7,2),
  is_correct boolean,
  selected_decision text,
  correct_decision text,
  selected_restart text,
  correct_restart text,
  selected_discipline text,
  correct_discipline text,
  foul boolean,
  restart text,
  discipline text,
  technical_correct boolean,
  restart_correct boolean,
  discipline_correct boolean,
  disciplinary_correct boolean,
  subtype_correct boolean,
  accumulated_foul_correct boolean,
  four_second_correct boolean,
  goalkeeper_correct boolean,
  justification_correct boolean,
  var_correct boolean,
  app_correct boolean,
  ofr_correct boolean,
  var_intervention_correct boolean,
  factual_vs_interpretative_correct boolean,
  final_decision_correct boolean,
  criterion_result jsonb,
  feedback text,
  answer_text text,
  time_spent integer,
  time_spent_seconds integer,
  english_score integer,
  communication_score integer,
  vocabulary_score integer,
  clarity_score integer,
  terminology_score integer,
  grammar_score integer,
  technical_accuracy_score integer,
  pronunciation_score integer,
  structure_score integer,
  protocol_score integer,
  justification_score integer,
  communication_mode text,
  global_communication_label text,
  vocabulary_level text,
  mastered_concepts jsonb not null default '[]'::jsonb,
  pending_concepts jsonb not null default '[]'::jsonb,
  workout_name text,
  total_duration integer,
  completed_rounds integer,
  total_rounds integer,
  completed boolean,
  perceived_effort integer,
  fatigue_level integer,
  notes text,
  institution_id uuid,
  institution_group_id uuid,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.exam_results (
  id uuid primary key,
  user_id text not null,
  submission_id uuid,
  sport_type text,
  activity_type text,
  season text,
  source_version text,
  ref_card_id text,
  institution_id uuid,
  institution_group_id uuid,
  institution_assessment_session_id uuid,
  total_questions integer,
  total_score numeric(10,2),
  avg_score numeric(5,2),
  correct_count integer,
  details jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);
create table public.notification_events (id uuid primary key, user_id text not null, status text not null default 'pending');
create table public.psychology_checkins (id uuid primary key, user_id text, module_slug text);
create table public.psychology_wellbeing_assessments (id uuid primary key, user_id text, module_slug text);
create table public.psychology_exercise_sessions (id uuid primary key, user_id text, module_slug text);
create table public.match_preparations (id uuid primary key, appointment_id uuid, user_id text);
create table public.post_match_reviews (id uuid primary key, appointment_id uuid, user_id text);

insert into public.user_profiles (user_id, ref_card_id)
select 'user_synthetic_' || pg_catalog.lpad(value::text, 3, '0'), 'REF-' || value
from pg_catalog.generate_series(1, 13) value;
insert into public.user_global_roles (user_id, role_key, source)
select user_id, 'referee', 'manual' from public.user_profiles;
insert into public.user_subscriptions (user_id, plan_key, status, starts_at, source)
select user_id, 'basic', 'active', '2026-01-01T00:00:00Z', 'manual'
from public.user_profiles;
insert into public.institutions (id, created_by_user_id)
values ('90000000-0000-4000-8000-000000000001', 'user_synthetic_001');
insert into public.institution_subscriptions (institution_id, plan_key, status, starts_at)
values ('90000000-0000-4000-8000-000000000001', 'academy', 'active', '2026-01-01T00:00:00Z');
insert into public.institution_memberships (id, institution_id, user_id, status)
values ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'user_synthetic_001', 'active');
insert into public.clips (id, sport_type, title, topic, difficulty)
values ('d3f00000-0000-4000-8000-000000000003', 'football_11', 'Synthetic communication clip', 'Communication', 'medium');

insert into public.attempts (id, user_id, exam_result_id, submission_id, sport_type)
select
  ('10000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((value - 1) % 13 + 1)::text, 3, '0'),
  null,
  null,
  'football_11'
from pg_catalog.generate_series(1, 37) value;
insert into public.exam_results (id, user_id, submission_id, activity_type, source_version, submitted_at)
select
  ('20000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((value - 1) % 2 + 1)::text, 3, '0'),
  null,
  null,
  null,
  '2026-01-01T00:00:00Z'::timestamptz + ((value - 1) * interval '1 day')
from pg_catalog.generate_series(1, 6) value;
insert into public.notification_events (id, user_id)
select
  ('30000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((value - 1) % 13 + 1)::text, 3, '0')
from pg_catalog.generate_series(1, 60) value;
insert into public.psychology_checkins (id, user_id, module_slug)
values ('40000000-0000-4000-8000-000000000001', 'user_synthetic_001', 'gestion-error');
insert into public.psychology_wellbeing_assessments (id, user_id, module_slug)
values ('50000000-0000-4000-8000-000000000001', 'user_synthetic_001', 'resiliencia');
insert into public.psychology_exercise_sessions (id, user_id, module_slug)
values ('60000000-0000-4000-8000-000000000001', 'user_synthetic_001', null);

alter table public.attempts enable row level security;
alter table public.exam_results enable row level security;
alter table public.notification_events enable row level security;
alter table public.psychology_checkins enable row level security;
alter table public.psychology_wellbeing_assessments enable row level security;
alter table public.psychology_exercise_sessions enable row level security;
create policy phase2b_legacy_attempt_insert on public.attempts
for insert to legacy_runtime with check (true);
grant usage on schema public to legacy_runtime;
grant insert on public.attempts to legacy_runtime;
