create extension if not exists pgcrypto;

alter table if exists public.user_profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists ref_card_id text,
  add column if not exists ranking_display_name text,
  add column if not exists show_real_name_in_ranking boolean not null default false;

update public.user_profiles
set ref_card_id = 'RF-2026-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where ref_card_id is null or ref_card_id = '';

create unique index if not exists user_profiles_ref_card_id_unique
  on public.user_profiles (ref_card_id)
  where ref_card_id is not null;

alter table if exists public.attempts
  add column if not exists ref_card_id text,
  add column if not exists clip_id text,
  add column if not exists module text,
  add column if not exists mode text,
  add column if not exists is_correct boolean,
  add column if not exists selected_decision text,
  add column if not exists correct_decision text,
  add column if not exists selected_restart text,
  add column if not exists correct_restart text,
  add column if not exists selected_discipline text,
  add column if not exists correct_discipline text,
  add column if not exists criterion_result jsonb,
  add column if not exists feedback text,
  add column if not exists time_spent_seconds integer;

alter table if exists public.exam_results
  add column if not exists ref_card_id text;
