drop index if exists public.notification_events_appointment_idx;
drop index if exists public.psychology_exercises_user_appointment_idx;
drop index if exists public.psychology_checkins_user_appointment_idx;
drop index if exists public.readiness_scores_user_appointment_idx;
drop index if exists public.wellness_logs_user_appointment_idx;
drop index if exists public.performance_sessions_user_appointment_idx;
drop index if exists public.performance_checkins_user_appointment_idx;

alter table if exists public.notification_events
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.psychology_exercise_sessions
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.psychology_checkins
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.readiness_scores
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.wellness_logs
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.performance_sessions
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

alter table if exists public.performance_checkins
  drop column if exists referee_role_key,
  drop column if exists sport_type,
  drop column if exists fixture_id,
  drop column if exists appointment_id;

drop table if exists public.post_match_reviews;
drop table if exists public.match_preparations;
drop table if exists public.match_context_snapshots;
drop table if exists public.match_officials;
drop table if exists public.appointment_history;
drop table if exists public.appointments;
drop table if exists public.referee_eligibility;
drop table if exists public.fixtures;
drop table if exists public.referee_roles;
drop table if exists public.venues;
drop table if exists public.teams;
drop table if exists public.competition_categories;
drop table if exists public.competition_seasons;
drop table if exists public.competitions;
drop table if exists public.associations;
drop table if exists public.countries;

notify pgrst, 'reload schema';
