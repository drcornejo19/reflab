-- Production adoption Phase 2A: aggregate-only semantic audit bridge.
-- This migration is local/review-only until the Production adoption gates authorize it.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  installer record;
  caller record;
  missing_table text;
  missing_column text;
begin
  select rolsuper, rolcreaterole into installer
  from pg_catalog.pg_roles where rolname = current_user;
  if not found or not (installer.rolsuper or installer.rolcreaterole) then
    raise exception 'Semantic audit installer requires reviewed role-management capability'
      using errcode = '42501';
  end if;

  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  into caller from pg_catalog.pg_roles where rolname = 'reflab_prod_preflight_ro';
  if not found or not caller.rolcanlogin or caller.rolsuper or caller.rolcreatedb
     or caller.rolcreaterole or caller.rolinherit or caller.rolbypassrls then
    raise exception 'Production preflight caller is absent or unsafe' using errcode = '55000';
  end if;

  if pg_catalog.to_regrole('reflab_preflight_audit_owner') is not null
     or pg_catalog.to_regnamespace('reflab_audit') is not null
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null then
    raise exception 'Semantic audit infrastructure is not in the reviewed absent state'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or not exists (
       select 1 from reflab_meta.production_adoption_state
       where phase_order = 3 and phase_key = 'psychology_notification_prerequisites'
     ) then
    raise exception 'Reviewed Phase 1 bridge is required before semantic audit adoption'
      using errcode = '55000';
  end if;

  select expected_table into missing_table
  from unnest(array['public.access_change_audit', 'public.ai_usage_ledger', 'public.appointment_history', 'public.appointments', 'public.attempts', 'public.capability_overrides', 'public.coach_data_consents', 'public.coach_rate_limit_buckets', 'public.coach_runs', 'public.exam_results', 'public.fixtures', 'public.ifab_library_documents', 'public.institution_assessment_assignments', 'public.institution_assessment_history', 'public.institution_assessment_sessions', 'public.institution_assessments', 'public.institution_audit_logs', 'public.institution_cohorts', 'public.institution_content_assignments', 'public.institution_data_consents', 'public.institution_demo_sessions', 'public.institution_group_memberships', 'public.institution_groups', 'public.institution_members', 'public.institution_membership_permission_overrides', 'public.institution_membership_roles', 'public.institution_memberships', 'public.institution_notification_campaigns', 'public.institution_notification_recipients', 'public.institution_permissions', 'public.institution_role_permissions', 'public.institution_roles', 'public.institutional_clips', 'public.institutional_lead_activities', 'public.institutional_leads', 'public.institutions', 'public.match_officials', 'public.match_preparations', 'public.notification_events', 'public.notification_preferences', 'public.notification_tokens', 'public.performance_checkins', 'public.performance_sessions', 'public.physical_tests', 'public.platform_audit_logs', 'public.post_match_reviews', 'public.psychology_checkins', 'public.psychology_exercise_sessions', 'public.psychology_wellbeing_assessments', 'public.readiness_scores', 'public.referee_eligibility', 'public.referee_exam_sessions', 'public.rules_exam_results', 'public.user_global_roles', 'public.user_profiles', 'public.user_roles', 'public.user_subscriptions', 'public.wellness_logs']::text[]) expected_table
  where pg_catalog.to_regclass(expected_table) is null
  limit 1;
  if missing_table is not null then
    raise exception 'Semantic audit dependency table is missing' using errcode = '55000';
  end if;

  select expected_column into missing_column
  from unnest(array['public.access_change_audit.actor_user_id', 'public.access_change_audit.target_user_id', 'public.ai_usage_ledger.user_id', 'public.appointment_history.changed_by_user_id', 'public.appointment_history.user_id', 'public.appointments.created_by_user_id', 'public.appointments.id', 'public.appointments.institution_id', 'public.appointments.user_id', 'public.attempts.criterion_result', 'public.attempts.exam_result_id', 'public.attempts.id', 'public.attempts.score', 'public.attempts.source_item_type', 'public.attempts.user_id', 'public.capability_overrides.assigned_by_user_id', 'public.capability_overrides.user_id', 'public.coach_data_consents.user_id', 'public.coach_rate_limit_buckets.user_id', 'public.coach_runs.user_id', 'public.exam_results.exam_session_id', 'public.exam_results.id', 'public.exam_results.submission_id', 'public.exam_results.user_id', 'public.fixtures.id', 'public.fixtures.raw_source_reference', 'public.ifab_library_documents.uploaded_by', 'public.institution_assessment_assignments.assigned_by_user_id', 'public.institution_assessment_assignments.user_id', 'public.institution_assessment_history.actor_user_id', 'public.institution_assessment_sessions.user_id', 'public.institution_assessments.created_by_user_id', 'public.institution_audit_logs.actor_user_id', 'public.institution_cohorts.created_by_user_id', 'public.institution_content_assignments.assigned_by_user_id', 'public.institution_content_assignments.user_id', 'public.institution_data_consents.user_id', 'public.institution_demo_sessions.user_id', 'public.institution_group_memberships.group_id', 'public.institution_group_memberships.institution_id', 'public.institution_group_memberships.membership_id', 'public.institution_groups.created_by_user_id', 'public.institution_groups.id', 'public.institution_groups.institution_id', 'public.institution_members.user_id', 'public.institution_membership_permission_overrides.assigned_by_user_id', 'public.institution_membership_permission_overrides.institution_id', 'public.institution_membership_permission_overrides.membership_id', 'public.institution_membership_roles.assigned_by_user_id', 'public.institution_membership_roles.institution_id', 'public.institution_membership_roles.membership_id', 'public.institution_memberships.id', 'public.institution_memberships.institution_id', 'public.institution_memberships.invited_by_user_id', 'public.institution_memberships.status', 'public.institution_memberships.user_id', 'public.institution_notification_campaigns.created_by_user_id', 'public.institution_notification_recipients.user_id', 'public.institution_permissions.permission_key', 'public.institution_role_permissions.role_id', 'public.institution_roles.id', 'public.institution_roles.institution_id', 'public.institution_roles.role_key', 'public.institutional_clips.uploaded_by', 'public.institutional_lead_activities.actor_user_id', 'public.institutional_leads.converted_by_user_id', 'public.institutional_leads.owner_user_id', 'public.institutions.created_by_user_id', 'public.match_officials.user_id', 'public.match_preparations.user_id', 'public.notification_events.id', 'public.notification_events.user_id', 'public.notification_preferences.id', 'public.notification_preferences.user_id', 'public.notification_tokens.id', 'public.notification_tokens.token', 'public.notification_tokens.user_id', 'public.performance_checkins.user_id', 'public.performance_sessions.user_id', 'public.physical_tests.user_id', 'public.platform_audit_logs.actor_user_id', 'public.post_match_reviews.user_id', 'public.psychology_checkins.user_id', 'public.psychology_exercise_sessions.user_id', 'public.psychology_wellbeing_assessments.user_id', 'public.readiness_scores.user_id', 'public.referee_eligibility.user_id', 'public.referee_exam_sessions.id', 'public.referee_exam_sessions.submission_id', 'public.referee_exam_sessions.user_id', 'public.rules_exam_results.user_id', 'public.user_global_roles.assigned_by_user_id', 'public.user_global_roles.role_key', 'public.user_global_roles.source', 'public.user_global_roles.user_id', 'public.user_profiles.user_id', 'public.user_roles.user_id', 'public.user_subscriptions.assigned_by_user_id', 'public.user_subscriptions.source', 'public.user_subscriptions.user_id', 'public.wellness_logs.user_id']::text[]) expected_column
  where not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = pg_catalog.to_regclass(
      pg_catalog.split_part(expected_column, '.', 1) || '.' || pg_catalog.split_part(expected_column, '.', 2)
    )
      and attribute.attname = pg_catalog.split_part(expected_column, '.', 3)
      and attribute.attnum > 0
      and not attribute.attisdropped
  )
  limit 1;
  if missing_column is not null then
    raise exception 'Semantic audit dependency column is missing' using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(array['public.access_change_audit', 'public.ai_usage_ledger', 'public.appointment_history', 'public.appointments', 'public.attempts', 'public.capability_overrides', 'public.coach_data_consents', 'public.coach_rate_limit_buckets', 'public.coach_runs', 'public.exam_results', 'public.fixtures', 'public.ifab_library_documents', 'public.institution_assessment_assignments', 'public.institution_assessment_history', 'public.institution_assessment_sessions', 'public.institution_assessments', 'public.institution_audit_logs', 'public.institution_cohorts', 'public.institution_content_assignments', 'public.institution_data_consents', 'public.institution_demo_sessions', 'public.institution_group_memberships', 'public.institution_groups', 'public.institution_members', 'public.institution_membership_permission_overrides', 'public.institution_membership_roles', 'public.institution_memberships', 'public.institution_notification_campaigns', 'public.institution_notification_recipients', 'public.institution_permissions', 'public.institution_role_permissions', 'public.institution_roles', 'public.institutional_clips', 'public.institutional_lead_activities', 'public.institutional_leads', 'public.institutions', 'public.match_officials', 'public.match_preparations', 'public.notification_events', 'public.notification_preferences', 'public.notification_tokens', 'public.performance_checkins', 'public.performance_sessions', 'public.physical_tests', 'public.platform_audit_logs', 'public.post_match_reviews', 'public.psychology_checkins', 'public.psychology_exercise_sessions', 'public.psychology_wellbeing_assessments', 'public.readiness_scores', 'public.referee_eligibility', 'public.referee_exam_sessions', 'public.rules_exam_results', 'public.user_global_roles', 'public.user_profiles', 'public.user_roles', 'public.user_subscriptions', 'public.wellness_logs']::text[]) expected_table
    join pg_catalog.pg_class relation on relation.oid = pg_catalog.to_regclass(expected_table)
    where not relation.relrowsecurity
       or relation.relowner = (select oid from pg_catalog.pg_roles where rolname = 'reflab_preflight_audit_owner')
  ) then
    raise exception 'Semantic audit requires RLS-enabled, independently owned product tables'
      using errcode = '55000';
  end if;
end
$preflight$;

create role reflab_preflight_audit_owner
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

do $membership$
begin
  execute pg_catalog.format('grant reflab_preflight_audit_owner to %I', current_user);
end
$membership$;

create schema reflab_audit authorization current_user;
revoke all on schema reflab_audit
  from public, anon, authenticated, service_role, reflab_rls_owner;
grant usage on schema public to reflab_preflight_audit_owner;
grant usage on schema reflab_audit to reflab_preflight_audit_owner, reflab_prod_preflight_ro;

grant select (actor_user_id, target_user_id) on table public.access_change_audit to reflab_preflight_audit_owner;
grant select (user_id) on table public.ai_usage_ledger to reflab_preflight_audit_owner;
grant select (changed_by_user_id, user_id) on table public.appointment_history to reflab_preflight_audit_owner;
grant select (created_by_user_id, id, institution_id, user_id) on table public.appointments to reflab_preflight_audit_owner;
grant select (criterion_result, exam_result_id, id, score, source_item_type, user_id) on table public.attempts to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, user_id) on table public.capability_overrides to reflab_preflight_audit_owner;
grant select (user_id) on table public.coach_data_consents to reflab_preflight_audit_owner;
grant select (user_id) on table public.coach_rate_limit_buckets to reflab_preflight_audit_owner;
grant select (user_id) on table public.coach_runs to reflab_preflight_audit_owner;
grant select (exam_session_id, id, submission_id, user_id) on table public.exam_results to reflab_preflight_audit_owner;
grant select (id, raw_source_reference) on table public.fixtures to reflab_preflight_audit_owner;
grant select (uploaded_by) on table public.ifab_library_documents to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, user_id) on table public.institution_assessment_assignments to reflab_preflight_audit_owner;
grant select (actor_user_id) on table public.institution_assessment_history to reflab_preflight_audit_owner;
grant select (user_id) on table public.institution_assessment_sessions to reflab_preflight_audit_owner;
grant select (created_by_user_id) on table public.institution_assessments to reflab_preflight_audit_owner;
grant select (actor_user_id) on table public.institution_audit_logs to reflab_preflight_audit_owner;
grant select (created_by_user_id) on table public.institution_cohorts to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, user_id) on table public.institution_content_assignments to reflab_preflight_audit_owner;
grant select (user_id) on table public.institution_data_consents to reflab_preflight_audit_owner;
grant select (user_id) on table public.institution_demo_sessions to reflab_preflight_audit_owner;
grant select (group_id, institution_id, membership_id) on table public.institution_group_memberships to reflab_preflight_audit_owner;
grant select (created_by_user_id, id, institution_id) on table public.institution_groups to reflab_preflight_audit_owner;
grant select (user_id) on table public.institution_members to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, institution_id, membership_id) on table public.institution_membership_permission_overrides to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, institution_id, membership_id) on table public.institution_membership_roles to reflab_preflight_audit_owner;
grant select (id, institution_id, invited_by_user_id, status, user_id) on table public.institution_memberships to reflab_preflight_audit_owner;
grant select (created_by_user_id) on table public.institution_notification_campaigns to reflab_preflight_audit_owner;
grant select (user_id) on table public.institution_notification_recipients to reflab_preflight_audit_owner;
grant select (permission_key) on table public.institution_permissions to reflab_preflight_audit_owner;
grant select (role_id) on table public.institution_role_permissions to reflab_preflight_audit_owner;
grant select (id, institution_id, role_key) on table public.institution_roles to reflab_preflight_audit_owner;
grant select (uploaded_by) on table public.institutional_clips to reflab_preflight_audit_owner;
grant select (actor_user_id) on table public.institutional_lead_activities to reflab_preflight_audit_owner;
grant select (converted_by_user_id, owner_user_id) on table public.institutional_leads to reflab_preflight_audit_owner;
grant select (created_by_user_id) on table public.institutions to reflab_preflight_audit_owner;
grant select (user_id) on table public.match_officials to reflab_preflight_audit_owner;
grant select (user_id) on table public.match_preparations to reflab_preflight_audit_owner;
grant select (id, user_id) on table public.notification_events to reflab_preflight_audit_owner;
grant select (id, user_id) on table public.notification_preferences to reflab_preflight_audit_owner;
grant select (id, token, user_id) on table public.notification_tokens to reflab_preflight_audit_owner;
grant select (user_id) on table public.performance_checkins to reflab_preflight_audit_owner;
grant select (user_id) on table public.performance_sessions to reflab_preflight_audit_owner;
grant select (user_id) on table public.physical_tests to reflab_preflight_audit_owner;
grant select (actor_user_id) on table public.platform_audit_logs to reflab_preflight_audit_owner;
grant select (user_id) on table public.post_match_reviews to reflab_preflight_audit_owner;
grant select (user_id) on table public.psychology_checkins to reflab_preflight_audit_owner;
grant select (user_id) on table public.psychology_exercise_sessions to reflab_preflight_audit_owner;
grant select (user_id) on table public.psychology_wellbeing_assessments to reflab_preflight_audit_owner;
grant select (user_id) on table public.readiness_scores to reflab_preflight_audit_owner;
grant select (user_id) on table public.referee_eligibility to reflab_preflight_audit_owner;
grant select (id, submission_id, user_id) on table public.referee_exam_sessions to reflab_preflight_audit_owner;
grant select (user_id) on table public.rules_exam_results to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, role_key, source, user_id) on table public.user_global_roles to reflab_preflight_audit_owner;
grant select (user_id) on table public.user_profiles to reflab_preflight_audit_owner;
grant select (user_id) on table public.user_roles to reflab_preflight_audit_owner;
grant select (assigned_by_user_id, source, user_id) on table public.user_subscriptions to reflab_preflight_audit_owner;
grant select (user_id) on table public.wellness_logs to reflab_preflight_audit_owner;

create policy reflab_preflight_audit_owner_read
  on public.access_change_audit
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.ai_usage_ledger
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.appointment_history
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.appointments
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.attempts
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.capability_overrides
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.coach_data_consents
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.coach_rate_limit_buckets
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.coach_runs
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.exam_results
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.fixtures
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.ifab_library_documents
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_assessment_assignments
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_assessment_history
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_assessment_sessions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_assessments
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_audit_logs
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_cohorts
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_content_assignments
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_data_consents
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_demo_sessions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_group_memberships
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_groups
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_members
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_membership_permission_overrides
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_membership_roles
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_memberships
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_notification_campaigns
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_notification_recipients
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_permissions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_role_permissions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institution_roles
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institutional_clips
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institutional_lead_activities
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institutional_leads
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.institutions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.match_officials
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.match_preparations
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.notification_events
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.notification_preferences
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.notification_tokens
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.performance_checkins
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.performance_sessions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.physical_tests
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.platform_audit_logs
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.post_match_reviews
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.psychology_checkins
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.psychology_exercise_sessions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.psychology_wellbeing_assessments
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.readiness_scores
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.referee_eligibility
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.referee_exam_sessions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.rules_exam_results
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.user_global_roles
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.user_profiles
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.user_roles
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.user_subscriptions
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create policy reflab_preflight_audit_owner_read
  on public.wellness_logs
  as permissive for select
  to reflab_preflight_audit_owner
  using (true);

create function reflab_audit.production_semantic_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $semantic_audit$
  select pg_catalog.jsonb_build_object(
    'attempt_semantics', (
      select pg_catalog.jsonb_build_object(
        'training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null),
        'official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null),
        'official_orphans', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and exam_result.id is null),
        'official_owner_mismatches', pg_catalog.count(attempt_row.id) filter (where exam_result.id is not null and exam_result.user_id <> attempt_row.user_id),
        'invalid_communication_feedback', pg_catalog.count(attempt_row.id) filter (
          where attempt_row.source_item_type = 'communication_feedback'
            and (attempt_row.exam_result_id is not null or attempt_row.score is not null)
        )
      )
      from public.attempts attempt_row
      left join public.exam_results exam_result on exam_result.id = attempt_row.exam_result_id
    ),
    'scoring_versions', (
      select pg_catalog.jsonb_build_object(
        'legacy_unversioned_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>'scoring_version', '') is null),
        'legacy_unversioned_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>'scoring_version', '') is null),
        'field_applicable_v2_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and attempt_row.criterion_result->>'scoring_version' = 'field_applicable_v2'),
        'field_applicable_v2_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and attempt_row.criterion_result->>'scoring_version' = 'field_applicable_v2'),
        'unknown_training', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>'scoring_version', '') is not null and attempt_row.criterion_result->>'scoring_version' <> 'field_applicable_v2'),
        'unknown_official', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>'scoring_version', '') is not null and attempt_row.criterion_result->>'scoring_version' <> 'field_applicable_v2')
      ) from public.attempts attempt_row
    ),
    'exam_integrity', (
      select pg_catalog.jsonb_build_object(
        'results_without_session', pg_catalog.count(exam_result.id) filter (where exam_session.id is null),
        'session_owner_mismatches', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.user_id <> exam_result.user_id),
        'session_submission_mismatches', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.submission_id <> exam_result.submission_id)
      )
      from public.exam_results exam_result
      left join public.referee_exam_sessions exam_session on exam_session.id = exam_result.exam_session_id
    ),
    'legacy_access', pg_catalog.jsonb_build_object(
      'user_roles', (select pg_catalog.count(user_id) from public.user_roles),
      'automatic_default_global_roles', (select pg_catalog.count(user_id) from public.user_global_roles where source = 'automatic_default'),
      'automatic_default_subscriptions', (select pg_catalog.count(user_id) from public.user_subscriptions where source = 'automatic_default'),
      'unknown_global_roles', (select pg_catalog.count(user_id) from public.user_global_roles where role_key not in ('super_admin', 'referee'))
    ),
    'institution_catalog', pg_catalog.jsonb_build_object(
      'permissions', (select pg_catalog.count(permission_key) from public.institution_permissions),
      'system_roles', (select pg_catalog.count(id) from public.institution_roles where institution_id is null),
      'system_relations', (select pg_catalog.count(relation.role_id) from public.institution_role_permissions relation join public.institution_roles role on role.id = relation.role_id where role.institution_id is null),
      'forbidden_roles', (select pg_catalog.count(id) from public.institution_roles where role_key in ('physical_trainer', 'institution_psychologist', 'super_admin', 'video_admin', 'institutional_instructor', 'institutional_student', 'individual_referee'))
    ),
    'institution_tenant_integrity', pg_catalog.jsonb_build_object(
      'membership_role_mismatches', (select pg_catalog.count(role_link.membership_id) from public.institution_membership_roles role_link join public.institution_memberships membership on membership.id = role_link.membership_id where role_link.institution_id <> membership.institution_id),
      'group_membership_mismatches', (select pg_catalog.count(group_link.membership_id) from public.institution_group_memberships group_link join public.institution_groups group_row on group_row.id = group_link.group_id join public.institution_memberships membership on membership.id = group_link.membership_id where group_link.institution_id <> group_row.institution_id or group_link.institution_id <> membership.institution_id),
      'permission_override_mismatches', (select pg_catalog.count(override_row.membership_id) from public.institution_membership_permission_overrides override_row join public.institution_memberships membership on membership.id = override_row.membership_id where override_row.institution_id <> membership.institution_id)
    ),
    'matches_tenant_integrity', (
      select pg_catalog.jsonb_build_object(
        'institutional_appointments_without_active_membership', pg_catalog.count(appointment.id)
      )
      from public.appointments appointment
      left join public.institution_memberships membership
        on membership.institution_id = appointment.institution_id
       and membership.user_id = appointment.user_id
       and membership.status = 'active'
      where appointment.institution_id is not null and membership.id is null
    ),
    'fixture_creator_identity', (
      select pg_catalog.jsonb_build_object(
        'creator_refs', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>'created_by', '') is not null),
        'user_subject_refs', pg_catalog.count(fixture.id) filter (where fixture.raw_source_reference->>'created_by' like 'user\_%' escape '\'),
        'profile_backed_refs', pg_catalog.count(fixture.id) filter (where profile.user_id is not null),
        'unresolved_profile_refs', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>'created_by', '') is not null and profile.user_id is null)
      )
      from public.fixtures fixture
      left join public.user_profiles profile on profile.user_id = fixture.raw_source_reference->>'created_by'
    ),
    'notification_integrity', pg_catalog.jsonb_build_object(
      'token_owner_conflicts', coalesce((select pg_catalog.count(token) from (select token from public.notification_tokens group by token having pg_catalog.count(distinct user_id) > 1) conflict), 0),
      'events_without_profile', (select pg_catalog.count(event.id) from public.notification_events event left join public.user_profiles profile on profile.user_id = event.user_id where profile.user_id is null),
      'preferences_without_profile', (select pg_catalog.count(preference.id) from public.notification_preferences preference left join public.user_profiles profile on profile.user_id = preference.user_id where profile.user_id is null)
    ),
    'identity_reference_integrity', (
      select pg_catalog.jsonb_build_object(
        'total_non_null', coalesce(pg_catalog.sum(identity_count.total_non_null), 0),
        'user_subject_ids', coalesce(pg_catalog.sum(identity_count.user_subject_ids), 0),
        'profile_backed_ids', coalesce(pg_catalog.sum(identity_count.profile_backed_ids), 0),
        'unresolved_profile_refs', coalesce(pg_catalog.sum(identity_count.unresolved_profile_refs), 0)
      )
      from (
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.user_profiles source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.user_global_roles source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.user_global_roles source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.user_subscriptions source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.user_subscriptions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.capability_overrides source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.capability_overrides source
      union all
      select
        pg_catalog.count(actor_user_id)::bigint as total_non_null,
        pg_catalog.count(actor_user_id) filter (where actor_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as unresolved_profile_refs
      from public.access_change_audit source
      union all
      select
        pg_catalog.count(target_user_id)::bigint as total_non_null,
        pg_catalog.count(target_user_id) filter (where target_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(target_user_id) filter (
          where target_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.target_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(target_user_id) filter (
          where target_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.target_user_id)
        )::bigint as unresolved_profile_refs
      from public.access_change_audit source
      union all
      select
        pg_catalog.count(actor_user_id)::bigint as total_non_null,
        pg_catalog.count(actor_user_id) filter (where actor_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as unresolved_profile_refs
      from public.platform_audit_logs source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.user_roles source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institutions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_memberships source
      union all
      select
        pg_catalog.count(invited_by_user_id)::bigint as total_non_null,
        pg_catalog.count(invited_by_user_id) filter (where invited_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(invited_by_user_id) filter (
          where invited_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.invited_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(invited_by_user_id) filter (
          where invited_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.invited_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_memberships source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_membership_roles source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_membership_permission_overrides source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_members source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_cohorts source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_groups source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_content_assignments source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_content_assignments source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_assessments source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_assessment_assignments source
      union all
      select
        pg_catalog.count(assigned_by_user_id)::bigint as total_non_null,
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(assigned_by_user_id) filter (
          where assigned_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.assigned_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_assessment_assignments source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_assessment_sessions source
      union all
      select
        pg_catalog.count(actor_user_id)::bigint as total_non_null,
        pg_catalog.count(actor_user_id) filter (where actor_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_assessment_history source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_notification_campaigns source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_notification_recipients source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_data_consents source
      union all
      select
        pg_catalog.count(actor_user_id)::bigint as total_non_null,
        pg_catalog.count(actor_user_id) filter (where actor_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_audit_logs source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.institution_demo_sessions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.referee_eligibility source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.appointments source
      union all
      select
        pg_catalog.count(created_by_user_id)::bigint as total_non_null,
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(created_by_user_id) filter (
          where created_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.created_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.appointments source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.appointment_history source
      union all
      select
        pg_catalog.count(changed_by_user_id)::bigint as total_non_null,
        pg_catalog.count(changed_by_user_id) filter (where changed_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(changed_by_user_id) filter (
          where changed_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.changed_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(changed_by_user_id) filter (
          where changed_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.changed_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.appointment_history source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.match_officials source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.match_preparations source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.post_match_reviews source
      union all
      select
        pg_catalog.count(uploaded_by)::bigint as total_non_null,
        pg_catalog.count(uploaded_by) filter (where uploaded_by like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(uploaded_by) filter (
          where uploaded_by is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.uploaded_by)
        )::bigint as profile_backed_ids,
        pg_catalog.count(uploaded_by) filter (
          where uploaded_by is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.uploaded_by)
        )::bigint as unresolved_profile_refs
      from public.institutional_clips source
      union all
      select
        pg_catalog.count(uploaded_by)::bigint as total_non_null,
        pg_catalog.count(uploaded_by) filter (where uploaded_by like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(uploaded_by) filter (
          where uploaded_by is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.uploaded_by)
        )::bigint as profile_backed_ids,
        pg_catalog.count(uploaded_by) filter (
          where uploaded_by is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.uploaded_by)
        )::bigint as unresolved_profile_refs
      from public.ifab_library_documents source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.referee_exam_sessions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.exam_results source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.attempts source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.rules_exam_results source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.performance_checkins source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.performance_sessions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.wellness_logs source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.readiness_scores source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.physical_tests source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.psychology_checkins source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.psychology_wellbeing_assessments source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.psychology_exercise_sessions source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.coach_rate_limit_buckets source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.coach_runs source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.coach_data_consents source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.ai_usage_ledger source
      union all
      select
        pg_catalog.count(owner_user_id)::bigint as total_non_null,
        pg_catalog.count(owner_user_id) filter (where owner_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(owner_user_id) filter (
          where owner_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.owner_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(owner_user_id) filter (
          where owner_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.owner_user_id)
        )::bigint as unresolved_profile_refs
      from public.institutional_leads source
      union all
      select
        pg_catalog.count(converted_by_user_id)::bigint as total_non_null,
        pg_catalog.count(converted_by_user_id) filter (where converted_by_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(converted_by_user_id) filter (
          where converted_by_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.converted_by_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(converted_by_user_id) filter (
          where converted_by_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.converted_by_user_id)
        )::bigint as unresolved_profile_refs
      from public.institutional_leads source
      union all
      select
        pg_catalog.count(actor_user_id)::bigint as total_non_null,
        pg_catalog.count(actor_user_id) filter (where actor_user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(actor_user_id) filter (
          where actor_user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.actor_user_id)
        )::bigint as unresolved_profile_refs
      from public.institutional_lead_activities source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.notification_preferences source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.notification_tokens source
      union all
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like 'user\_%' escape '\')::bigint as user_subject_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as profile_backed_ids,
        pg_catalog.count(user_id) filter (
          where user_id is not null
            and not exists (select 1 from public.user_profiles profile where profile.user_id = source.user_id)
        )::bigint as unresolved_profile_refs
      from public.notification_events source
      ) identity_count
    )
  );
$semantic_audit$;

alter function reflab_audit.production_semantic_snapshot() owner to reflab_preflight_audit_owner;
revoke all on function reflab_audit.production_semantic_snapshot()
  from public, anon, authenticated, service_role, reflab_rls_owner;
grant execute on function reflab_audit.production_semantic_snapshot() to reflab_prod_preflight_ro;

do $membership_cleanup$
begin
  execute pg_catalog.format('revoke reflab_preflight_audit_owner from %I', current_user);
end
$membership_cleanup$;

do $assertions$
declare
  owner_state record;
  expected_policy_count constant integer := 58;
begin
  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  into owner_state from pg_catalog.pg_roles where rolname = 'reflab_preflight_audit_owner';
  if not found or owner_state.rolcanlogin or owner_state.rolsuper or owner_state.rolcreatedb
     or owner_state.rolcreaterole or owner_state.rolinherit or owner_state.rolbypassrls then
    raise exception 'Semantic audit owner attributes are unsafe' using errcode = '55000';
  end if;

  if pg_catalog.pg_has_role('reflab_prod_preflight_ro', 'reflab_preflight_audit_owner', 'MEMBER')
     or exists (
       select 1 from pg_catalog.pg_auth_members membership
       join pg_catalog.pg_roles owner_role on owner_role.oid = membership.member
       where owner_role.rolname = 'reflab_preflight_audit_owner'
     ) then
    raise exception 'Semantic audit role membership is unsafe' using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from pg_catalog.pg_policy policy
      join pg_catalog.pg_class relation on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where policy.polname = 'reflab_preflight_audit_owner_read'
        and namespace.nspname || '.' || relation.relname = any (array['public.access_change_audit', 'public.ai_usage_ledger', 'public.appointment_history', 'public.appointments', 'public.attempts', 'public.capability_overrides', 'public.coach_data_consents', 'public.coach_rate_limit_buckets', 'public.coach_runs', 'public.exam_results', 'public.fixtures', 'public.ifab_library_documents', 'public.institution_assessment_assignments', 'public.institution_assessment_history', 'public.institution_assessment_sessions', 'public.institution_assessments', 'public.institution_audit_logs', 'public.institution_cohorts', 'public.institution_content_assignments', 'public.institution_data_consents', 'public.institution_demo_sessions', 'public.institution_group_memberships', 'public.institution_groups', 'public.institution_members', 'public.institution_membership_permission_overrides', 'public.institution_membership_roles', 'public.institution_memberships', 'public.institution_notification_campaigns', 'public.institution_notification_recipients', 'public.institution_permissions', 'public.institution_role_permissions', 'public.institution_roles', 'public.institutional_clips', 'public.institutional_lead_activities', 'public.institutional_leads', 'public.institutions', 'public.match_officials', 'public.match_preparations', 'public.notification_events', 'public.notification_preferences', 'public.notification_tokens', 'public.performance_checkins', 'public.performance_sessions', 'public.physical_tests', 'public.platform_audit_logs', 'public.post_match_reviews', 'public.psychology_checkins', 'public.psychology_exercise_sessions', 'public.psychology_wellbeing_assessments', 'public.readiness_scores', 'public.referee_eligibility', 'public.referee_exam_sessions', 'public.rules_exam_results', 'public.user_global_roles', 'public.user_profiles', 'public.user_roles', 'public.user_subscriptions', 'public.wellness_logs']::text[])
        and policy.polcmd = 'r'
        and policy.polpermissive
        and policy.polroles = array[(select oid from pg_catalog.pg_roles where rolname = 'reflab_preflight_audit_owner')]
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) in ('true', '(true)')
        and policy.polwithcheck is null) <> expected_policy_count then
    raise exception 'Semantic audit policy contract is incomplete' using errcode = '55000';
  end if;

  if exists (
    select 1 from unnest(array['public.access_change_audit', 'public.ai_usage_ledger', 'public.appointment_history', 'public.appointments', 'public.attempts', 'public.capability_overrides', 'public.coach_data_consents', 'public.coach_rate_limit_buckets', 'public.coach_runs', 'public.exam_results', 'public.fixtures', 'public.ifab_library_documents', 'public.institution_assessment_assignments', 'public.institution_assessment_history', 'public.institution_assessment_sessions', 'public.institution_assessments', 'public.institution_audit_logs', 'public.institution_cohorts', 'public.institution_content_assignments', 'public.institution_data_consents', 'public.institution_demo_sessions', 'public.institution_group_memberships', 'public.institution_groups', 'public.institution_members', 'public.institution_membership_permission_overrides', 'public.institution_membership_roles', 'public.institution_memberships', 'public.institution_notification_campaigns', 'public.institution_notification_recipients', 'public.institution_permissions', 'public.institution_role_permissions', 'public.institution_roles', 'public.institutional_clips', 'public.institutional_lead_activities', 'public.institutional_leads', 'public.institutions', 'public.match_officials', 'public.match_preparations', 'public.notification_events', 'public.notification_preferences', 'public.notification_tokens', 'public.performance_checkins', 'public.performance_sessions', 'public.physical_tests', 'public.platform_audit_logs', 'public.post_match_reviews', 'public.psychology_checkins', 'public.psychology_exercise_sessions', 'public.psychology_wellbeing_assessments', 'public.readiness_scores', 'public.referee_eligibility', 'public.referee_exam_sessions', 'public.rules_exam_results', 'public.user_global_roles', 'public.user_profiles', 'public.user_roles', 'public.user_subscriptions', 'public.wellness_logs']::text[]) expected_table
    where pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'INSERT')
       or pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'UPDATE')
       or pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'DELETE')
       or pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'TRUNCATE')
       or pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'REFERENCES')
       or pg_catalog.has_table_privilege('reflab_preflight_audit_owner', expected_table, 'TRIGGER')
  ) then
    raise exception 'Semantic audit owner inherited an unsafe product-table privilege'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege('reflab_prod_preflight_ro', 'reflab_audit.production_semantic_snapshot()', 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc function_state
       cross join lateral pg_catalog.aclexplode(
         coalesce(function_state.proacl, pg_catalog.acldefault('f'::"char", function_state.proowner))
       ) function_acl
       where function_state.oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
         and function_acl.grantee = 0
         and function_acl.privilege_type = 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', 'reflab_audit.production_semantic_snapshot()', 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', 'reflab_audit.production_semantic_snapshot()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'reflab_audit.production_semantic_snapshot()', 'EXECUTE')
     or pg_catalog.has_function_privilege('reflab_rls_owner', 'reflab_audit.production_semantic_snapshot()', 'EXECUTE') then
    raise exception 'Semantic audit function execution grants are unsafe' using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3 then
    raise exception 'Semantic audit must not advance canonical or adoption markers'
      using errcode = '55000';
  end if;
end
$assertions$;

commit;
