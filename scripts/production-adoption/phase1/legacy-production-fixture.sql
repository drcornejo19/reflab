-- Synthetic historical Production shape for disposable local PostgreSQL only.

create table public.institutions (id uuid primary key);
create table public.institution_groups (id uuid primary key);
create table public.institution_assessment_sessions (id uuid primary key);
create table public.match_preparations (
  id uuid primary key,
  appointment_id uuid not null,
  user_id text not null
);
create table public.post_match_reviews (
  id uuid primary key,
  appointment_id uuid not null,
  user_id text not null
);

create table public.attempts (
  id uuid primary key,
  user_id text,
  exam_result_id uuid,
  submission_id uuid
);

create table public.exam_results (
  id uuid primary key,
  user_id text not null,
  submission_id uuid,
  activity_type text,
  source_version text,
  submitted_at timestamptz
);

create table public.notification_events (
  id uuid primary key,
  user_id text not null
);

create table public.psychology_checkins (
  id uuid primary key,
  module_slug text
);

create table public.psychology_wellbeing_assessments (
  id uuid primary key,
  module_slug text
);

create table public.psychology_exercise_sessions (
  id uuid primary key,
  module_slug text
);

alter table public.attempts enable row level security;
alter table public.exam_results enable row level security;
alter table public.notification_events enable row level security;
alter table public.psychology_checkins enable row level security;
alter table public.psychology_wellbeing_assessments enable row level security;
alter table public.psychology_exercise_sessions enable row level security;

insert into public.attempts (id, user_id, exam_result_id, submission_id)
select
  ('10000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((series.value - 1) % 13 + 1)::text, 3, '0'),
  null,
  null
from pg_catalog.generate_series(1, 37) as series(value);

insert into public.exam_results (id, user_id, submission_id, activity_type, source_version, submitted_at)
select
  ('20000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((series.value - 1) % 2 + 1)::text, 3, '0'),
  null,
  null,
  null,
  '2026-01-01T00:00:00Z'::timestamptz + ((series.value - 1) * interval '1 day')
from pg_catalog.generate_series(1, 6) as series(value);

insert into public.notification_events (id, user_id)
select
  ('30000000-0000-4000-8000-' || pg_catalog.lpad(series.value::text, 12, '0'))::uuid,
  'user_synthetic_' || pg_catalog.lpad(((series.value - 1) % 13 + 1)::text, 3, '0')
from pg_catalog.generate_series(1, 60) as series(value);

insert into public.psychology_checkins (id, module_slug)
values ('40000000-0000-4000-8000-000000000001', 'gestion-error');
insert into public.psychology_wellbeing_assessments (id, module_slug)
values ('50000000-0000-4000-8000-000000000001', 'resiliencia');
insert into public.psychology_exercise_sessions (id, module_slug)
values ('60000000-0000-4000-8000-000000000001', null);
