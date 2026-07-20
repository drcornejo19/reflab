-- Rollback document for 202607090001_sport_foundation.sql
-- Use only if no later migration depends on these columns or on public.rule_questions.

begin;

drop policy if exists "rule_questions_authenticated_read"
  on public.rule_questions;

drop trigger if exists set_rule_questions_updated_at
  on public.rule_questions;

drop table if exists public.rule_questions;

drop index if exists public.ifab_library_documents_sport_status_idx;
alter table if exists public.ifab_library_documents
  drop column if exists source_version,
  drop column if exists reviewed_at,
  drop column if exists published_at,
  drop column if exists season,
  drop column if exists governing_body,
  drop column if exists sport_type;

drop index if exists public.institutional_clips_sport_topic_idx;
alter table if exists public.institutional_clips
  drop column if exists reviewed_at,
  drop column if exists language,
  drop column if exists normative_status,
  drop column if exists disciplinary_resolution,
  drop column if exists technical_resolution,
  drop column if exists governing_body,
  drop column if exists source_official,
  drop column if exists source_version,
  drop column if exists season,
  drop column if exists rule_reference,
  drop column if exists subtopic,
  drop column if exists sport_type;

drop index if exists public.clips_sport_topic_idx;
alter table if exists public.clips
  drop column if exists reviewed_at,
  drop column if exists language,
  drop column if exists normative_status,
  drop column if exists disciplinary_resolution,
  drop column if exists technical_resolution,
  drop column if exists governing_body,
  drop column if exists source_official,
  drop column if exists source_version,
  drop column if exists season,
  drop column if exists rule_reference,
  drop column if exists subtopic,
  drop column if exists sport_type;

drop index if exists public.rules_exam_results_user_sport_created_idx;
alter table if exists public.rules_exam_results
  drop column if exists source_version,
  drop column if exists season,
  drop column if exists activity_type,
  drop column if exists sport_type;

drop index if exists public.exam_results_user_sport_created_idx;
alter table if exists public.exam_results
  drop column if exists source_version,
  drop column if exists season,
  drop column if exists activity_type,
  drop column if exists sport_type;

drop index if exists public.attempts_sport_topic_created_idx;
drop index if exists public.attempts_user_sport_created_idx;
alter table if exists public.attempts
  drop column if exists source_version,
  drop column if exists season,
  drop column if exists goalkeeper_correct,
  drop column if exists four_second_correct,
  drop column if exists accumulated_foul_correct,
  drop column if exists disciplinary_correct,
  drop column if exists rule_reference,
  drop column if exists subtopic,
  drop column if exists activity_type,
  drop column if exists sport_type;

commit;
