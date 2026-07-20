begin;

alter table if exists public.institutional_clips
  drop constraint if exists institutional_clips_analysis_answers_object_check;

alter table if exists public.institutional_clips
  drop column if exists analysis_answers;

alter table if exists public.clips
  drop constraint if exists clips_analysis_answers_object_check;

alter table if exists public.clips
  drop column if exists analysis_answers;

commit;
