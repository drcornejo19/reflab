alter table if exists public.clips
  add column if not exists analysis_answers jsonb;

alter table if exists public.institutional_clips
  add column if not exists analysis_answers jsonb;

alter table if exists public.clips
  drop constraint if exists clips_analysis_answers_object_check;

alter table if exists public.clips
  add constraint clips_analysis_answers_object_check
  check (
    analysis_answers is null or jsonb_typeof(analysis_answers) = 'object'
  );

alter table if exists public.institutional_clips
  drop constraint if exists institutional_clips_analysis_answers_object_check;

alter table if exists public.institutional_clips
  add constraint institutional_clips_analysis_answers_object_check
  check (
    analysis_answers is null or jsonb_typeof(analysis_answers) = 'object'
  );
