create extension if not exists pgcrypto;

alter table if exists public.attempts
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists activity_type text,
  add column if not exists subtopic text,
  add column if not exists rule_reference text,
  add column if not exists disciplinary_correct boolean,
  add column if not exists accumulated_foul_correct boolean,
  add column if not exists four_second_correct boolean,
  add column if not exists goalkeeper_correct boolean,
  add column if not exists season text,
  add column if not exists source_version text;

update public.attempts
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

update public.attempts
set disciplinary_correct = discipline_correct
where disciplinary_correct is null and discipline_correct is not null;

create index if not exists attempts_user_sport_created_idx
  on public.attempts (user_id, sport_type, created_at desc);

create index if not exists attempts_sport_topic_created_idx
  on public.attempts (sport_type, topic, created_at desc);

alter table if exists public.exam_results
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists activity_type text,
  add column if not exists season text,
  add column if not exists source_version text;

update public.exam_results
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

create index if not exists exam_results_user_sport_created_idx
  on public.exam_results (user_id, sport_type, created_at desc);

alter table if exists public.rules_exam_results
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists activity_type text,
  add column if not exists season text,
  add column if not exists source_version text;

update public.rules_exam_results
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

create index if not exists rules_exam_results_user_sport_created_idx
  on public.rules_exam_results (user_id, sport_type, created_at desc);

alter table if exists public.clips
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists subtopic text,
  add column if not exists rule_reference text,
  add column if not exists season text,
  add column if not exists source_version text,
  add column if not exists source_official text,
  add column if not exists governing_body text,
  add column if not exists technical_resolution text,
  add column if not exists disciplinary_resolution text,
  add column if not exists normative_status text,
  add column if not exists language text,
  add column if not exists reviewed_at timestamptz;

update public.clips
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

create index if not exists clips_sport_topic_idx
  on public.clips (sport_type, topic);

alter table if exists public.institutional_clips
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists subtopic text,
  add column if not exists rule_reference text,
  add column if not exists season text,
  add column if not exists source_version text,
  add column if not exists source_official text,
  add column if not exists governing_body text,
  add column if not exists technical_resolution text,
  add column if not exists disciplinary_resolution text,
  add column if not exists normative_status text,
  add column if not exists language text,
  add column if not exists reviewed_at timestamptz;

update public.institutional_clips
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

create index if not exists institutional_clips_sport_topic_idx
  on public.institutional_clips (sport_type, topic);

alter table if exists public.ifab_library_documents
  add column if not exists sport_type text not null default 'football_11',
  add column if not exists governing_body text not null default 'IFAB',
  add column if not exists season text,
  add column if not exists published_at date,
  add column if not exists reviewed_at timestamptz,
  add column if not exists source_version text;

update public.ifab_library_documents
set sport_type = 'football_11'
where sport_type is null or btrim(sport_type) = '';

update public.ifab_library_documents
set governing_body = 'IFAB'
where governing_body is null or btrim(governing_body) = '';

create index if not exists ifab_library_documents_sport_status_idx
  on public.ifab_library_documents (sport_type, status);

create table if not exists public.rule_questions (
  id uuid primary key default gen_random_uuid(),
  sport_type text not null check (
    sport_type in ('football_11', 'futsal')
  ),
  governing_body text not null check (
    governing_body in ('IFAB', 'FIFA')
  ),
  question_mode text not null default 'practice' check (
    question_mode in ('practice', 'exam')
  ),
  topic text not null,
  subtopic text,
  rule_reference text not null,
  season text not null,
  difficulty text not null check (
    difficulty in ('Basica', 'Media', 'Avanzada')
  ),
  language text not null default 'es',
  question text not null,
  options jsonb not null default '[]'::jsonb,
  correct_option integer not null,
  explanation text not null,
  official_explanation text,
  normative_reference text,
  source_official text not null,
  source_version text not null,
  criterion_tags jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_questions_options_array_check check (jsonb_typeof(options) = 'array'),
  constraint rule_questions_criterion_tags_array_check check (jsonb_typeof(criterion_tags) = 'array')
);

create index if not exists rule_questions_sport_mode_idx
  on public.rule_questions (sport_type, question_mode, season);

create index if not exists rule_questions_rule_idx
  on public.rule_questions (rule_reference, topic);

drop trigger if exists set_rule_questions_updated_at
  on public.rule_questions;

create trigger set_rule_questions_updated_at
before update on public.rule_questions
for each row
execute function public.set_updated_at();

alter table public.rule_questions enable row level security;

drop policy if exists "rule_questions_authenticated_read"
  on public.rule_questions;

create policy "rule_questions_authenticated_read"
on public.rule_questions
for select
to authenticated
using (true);

grant select, insert, update, delete on table public.rule_questions to service_role;
