-- REFLAB_PHASE2A_SEMANTIC_AUDIT_TEARDOWN_V1
-- Local/review-only teardown for the temporary Phase 2A semantic audit sidecar.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  owner_state record;
begin
  select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole
  into owner_state from pg_catalog.pg_roles where rolname='reflab_preflight_audit_owner';
  if not found or owner_state.rolcanlogin or owner_state.rolinherit or owner_state.rolbypassrls
     or owner_state.rolsuper or owner_state.rolcreatedb or owner_state.rolcreaterole then
    raise exception 'Phase 2A teardown requires the exact audit owner' using errcode='55000';
  end if;
  if pg_catalog.to_regnamespace('reflab_audit') is null
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or (select pg_catalog.md5(pg_catalog.btrim(prosrc, E' \n\r\t')) from pg_catalog.pg_proc
         where oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')) <> '7696e670d5925a08ae7d01b53fe15d83' then
    raise exception 'Phase 2A teardown requires the exact audit function' using errcode='55000';
  end if;
  if (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        granted_role.rolname='reflab_preflight_audit_owner'
        and member_role.rolname='postgres'
        and grantor_role.rolname='supabase_admin'
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
      )
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid=membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid=membership.member
      join pg_catalog.pg_roles grantor_role on grantor_role.oid=membership.grantor
      where granted_role.rolname='reflab_preflight_audit_owner'
         or member_role.rolname='reflab_preflight_audit_owner') is not true then
    raise exception 'Phase 2A teardown audit-owner membership contract drifted' using errcode='55000';
  end if;
  if exists (select 1 from pg_catalog.pg_class where relowner='reflab_preflight_audit_owner'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_namespace where nspowner='reflab_preflight_audit_owner'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_type where typowner='reflab_preflight_audit_owner'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_proc
       where proowner='reflab_preflight_audit_owner'::pg_catalog.regrole
         and oid<>pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')) then
    raise exception 'Phase 2A teardown found unexpected audit-owner ownership' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policy policy
      join pg_catalog.pg_class relation on relation.oid=policy.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      where policy.polname='reflab_preflight_audit_owner_read'
        and namespace.nspname||'.'||relation.relname=any(array['public.access_change_audit','public.ai_usage_ledger','public.appointment_history','public.appointments','public.attempts','public.capability_overrides','public.coach_data_consents','public.coach_rate_limit_buckets','public.coach_runs','public.exam_results','public.fixtures','public.ifab_library_documents','public.institution_assessment_assignments','public.institution_assessment_history','public.institution_assessment_sessions','public.institution_assessments','public.institution_audit_logs','public.institution_cohorts','public.institution_content_assignments','public.institution_data_consents','public.institution_demo_sessions','public.institution_group_memberships','public.institution_groups','public.institution_members','public.institution_membership_permission_overrides','public.institution_membership_roles','public.institution_memberships','public.institution_notification_campaigns','public.institution_notification_recipients','public.institution_permissions','public.institution_role_permissions','public.institution_roles','public.institutional_clips','public.institutional_lead_activities','public.institutional_leads','public.institutions','public.match_officials','public.match_preparations','public.notification_events','public.notification_preferences','public.notification_tokens','public.performance_checkins','public.performance_sessions','public.physical_tests','public.platform_audit_logs','public.post_match_reviews','public.psychology_checkins','public.psychology_exercise_sessions','public.psychology_wellbeing_assessments','public.readiness_scores','public.referee_eligibility','public.referee_exam_sessions','public.rules_exam_results','public.user_global_roles','public.user_profiles','public.user_roles','public.user_subscriptions','public.wellness_logs']::text[])
        and policy.polcmd='r' and policy.polpermissive
        and policy.polroles=array[('reflab_preflight_audit_owner'::pg_catalog.regrole)::oid]
        and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'[()[:space:]]','','g')='true'
        and policy.polwithcheck is null) <> 58
     or exists (select 1 from pg_catalog.pg_policy policy
       join pg_catalog.pg_class relation on relation.oid=policy.polrelid
       join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
       where ('reflab_preflight_audit_owner'::pg_catalog.regrole)::oid=any(policy.polroles)
         and not (policy.polname='reflab_preflight_audit_owner_read'
           and namespace.nspname||'.'||relation.relname=any(array['public.access_change_audit','public.ai_usage_ledger','public.appointment_history','public.appointments','public.attempts','public.capability_overrides','public.coach_data_consents','public.coach_rate_limit_buckets','public.coach_runs','public.exam_results','public.fixtures','public.ifab_library_documents','public.institution_assessment_assignments','public.institution_assessment_history','public.institution_assessment_sessions','public.institution_assessments','public.institution_audit_logs','public.institution_cohorts','public.institution_content_assignments','public.institution_data_consents','public.institution_demo_sessions','public.institution_group_memberships','public.institution_groups','public.institution_members','public.institution_membership_permission_overrides','public.institution_membership_roles','public.institution_memberships','public.institution_notification_campaigns','public.institution_notification_recipients','public.institution_permissions','public.institution_role_permissions','public.institution_roles','public.institutional_clips','public.institutional_lead_activities','public.institutional_leads','public.institutions','public.match_officials','public.match_preparations','public.notification_events','public.notification_preferences','public.notification_tokens','public.performance_checkins','public.performance_sessions','public.physical_tests','public.platform_audit_logs','public.post_match_reviews','public.psychology_checkins','public.psychology_exercise_sessions','public.psychology_wellbeing_assessments','public.readiness_scores','public.referee_eligibility','public.referee_exam_sessions','public.rules_exam_results','public.user_global_roles','public.user_profiles','public.user_roles','public.user_subscriptions','public.wellness_logs']::text[]))) then
    raise exception 'Phase 2A teardown policy contract drifted' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
      join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
      where acl.grantee='reflab_preflight_audit_owner'::pg_catalog.regrole
        and namespace.nspname||'.'||relation.relname||'.'||attribute.attname=any(array['public.access_change_audit.actor_user_id','public.access_change_audit.target_user_id','public.ai_usage_ledger.user_id','public.appointment_history.changed_by_user_id','public.appointment_history.user_id','public.appointments.created_by_user_id','public.appointments.id','public.appointments.institution_id','public.appointments.user_id','public.attempts.criterion_result','public.attempts.exam_result_id','public.attempts.id','public.attempts.score','public.attempts.source_item_type','public.attempts.user_id','public.capability_overrides.assigned_by_user_id','public.capability_overrides.user_id','public.coach_data_consents.user_id','public.coach_rate_limit_buckets.user_id','public.coach_runs.user_id','public.exam_results.exam_session_id','public.exam_results.id','public.exam_results.submission_id','public.exam_results.user_id','public.fixtures.id','public.fixtures.raw_source_reference','public.ifab_library_documents.uploaded_by','public.institution_assessment_assignments.assigned_by_user_id','public.institution_assessment_assignments.user_id','public.institution_assessment_history.actor_user_id','public.institution_assessment_sessions.user_id','public.institution_assessments.created_by_user_id','public.institution_audit_logs.actor_user_id','public.institution_cohorts.created_by_user_id','public.institution_content_assignments.assigned_by_user_id','public.institution_content_assignments.user_id','public.institution_data_consents.user_id','public.institution_demo_sessions.user_id','public.institution_group_memberships.group_id','public.institution_group_memberships.institution_id','public.institution_group_memberships.membership_id','public.institution_groups.created_by_user_id','public.institution_groups.id','public.institution_groups.institution_id','public.institution_members.user_id','public.institution_membership_permission_overrides.assigned_by_user_id','public.institution_membership_permission_overrides.institution_id','public.institution_membership_permission_overrides.membership_id','public.institution_membership_roles.assigned_by_user_id','public.institution_membership_roles.institution_id','public.institution_membership_roles.membership_id','public.institution_memberships.id','public.institution_memberships.institution_id','public.institution_memberships.invited_by_user_id','public.institution_memberships.status','public.institution_memberships.user_id','public.institution_notification_campaigns.created_by_user_id','public.institution_notification_recipients.user_id','public.institution_permissions.permission_key','public.institution_role_permissions.role_id','public.institution_roles.id','public.institution_roles.institution_id','public.institution_roles.role_key','public.institutional_clips.uploaded_by','public.institutional_lead_activities.actor_user_id','public.institutional_leads.converted_by_user_id','public.institutional_leads.owner_user_id','public.institutions.created_by_user_id','public.match_officials.user_id','public.match_preparations.user_id','public.notification_events.id','public.notification_events.user_id','public.notification_preferences.user_id','public.notification_tokens.id','public.notification_tokens.token','public.notification_tokens.user_id','public.performance_checkins.user_id','public.performance_sessions.user_id','public.physical_tests.user_id','public.platform_audit_logs.actor_user_id','public.post_match_reviews.user_id','public.psychology_checkins.user_id','public.psychology_exercise_sessions.user_id','public.psychology_wellbeing_assessments.user_id','public.readiness_scores.user_id','public.referee_eligibility.user_id','public.referee_exam_sessions.id','public.referee_exam_sessions.submission_id','public.referee_exam_sessions.user_id','public.rules_exam_results.user_id','public.user_global_roles.assigned_by_user_id','public.user_global_roles.role_key','public.user_global_roles.source','public.user_global_roles.user_id','public.user_profiles.user_id','public.user_roles.user_id','public.user_subscriptions.assigned_by_user_id','public.user_subscriptions.source','public.user_subscriptions.user_id','public.wellness_logs.user_id']::text[])
        and acl.privilege_type='SELECT' and not acl.is_grantable) <> 100
     or exists (
       select 1 from pg_catalog.pg_attribute attribute
       join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
       join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
       cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
       where acl.grantee='reflab_preflight_audit_owner'::pg_catalog.regrole
         and not (
           namespace.nspname||'.'||relation.relname||'.'||attribute.attname=any(array['public.access_change_audit.actor_user_id','public.access_change_audit.target_user_id','public.ai_usage_ledger.user_id','public.appointment_history.changed_by_user_id','public.appointment_history.user_id','public.appointments.created_by_user_id','public.appointments.id','public.appointments.institution_id','public.appointments.user_id','public.attempts.criterion_result','public.attempts.exam_result_id','public.attempts.id','public.attempts.score','public.attempts.source_item_type','public.attempts.user_id','public.capability_overrides.assigned_by_user_id','public.capability_overrides.user_id','public.coach_data_consents.user_id','public.coach_rate_limit_buckets.user_id','public.coach_runs.user_id','public.exam_results.exam_session_id','public.exam_results.id','public.exam_results.submission_id','public.exam_results.user_id','public.fixtures.id','public.fixtures.raw_source_reference','public.ifab_library_documents.uploaded_by','public.institution_assessment_assignments.assigned_by_user_id','public.institution_assessment_assignments.user_id','public.institution_assessment_history.actor_user_id','public.institution_assessment_sessions.user_id','public.institution_assessments.created_by_user_id','public.institution_audit_logs.actor_user_id','public.institution_cohorts.created_by_user_id','public.institution_content_assignments.assigned_by_user_id','public.institution_content_assignments.user_id','public.institution_data_consents.user_id','public.institution_demo_sessions.user_id','public.institution_group_memberships.group_id','public.institution_group_memberships.institution_id','public.institution_group_memberships.membership_id','public.institution_groups.created_by_user_id','public.institution_groups.id','public.institution_groups.institution_id','public.institution_members.user_id','public.institution_membership_permission_overrides.assigned_by_user_id','public.institution_membership_permission_overrides.institution_id','public.institution_membership_permission_overrides.membership_id','public.institution_membership_roles.assigned_by_user_id','public.institution_membership_roles.institution_id','public.institution_membership_roles.membership_id','public.institution_memberships.id','public.institution_memberships.institution_id','public.institution_memberships.invited_by_user_id','public.institution_memberships.status','public.institution_memberships.user_id','public.institution_notification_campaigns.created_by_user_id','public.institution_notification_recipients.user_id','public.institution_permissions.permission_key','public.institution_role_permissions.role_id','public.institution_roles.id','public.institution_roles.institution_id','public.institution_roles.role_key','public.institutional_clips.uploaded_by','public.institutional_lead_activities.actor_user_id','public.institutional_leads.converted_by_user_id','public.institutional_leads.owner_user_id','public.institutions.created_by_user_id','public.match_officials.user_id','public.match_preparations.user_id','public.notification_events.id','public.notification_events.user_id','public.notification_preferences.user_id','public.notification_tokens.id','public.notification_tokens.token','public.notification_tokens.user_id','public.performance_checkins.user_id','public.performance_sessions.user_id','public.physical_tests.user_id','public.platform_audit_logs.actor_user_id','public.post_match_reviews.user_id','public.psychology_checkins.user_id','public.psychology_exercise_sessions.user_id','public.psychology_wellbeing_assessments.user_id','public.readiness_scores.user_id','public.referee_eligibility.user_id','public.referee_exam_sessions.id','public.referee_exam_sessions.submission_id','public.referee_exam_sessions.user_id','public.rules_exam_results.user_id','public.user_global_roles.assigned_by_user_id','public.user_global_roles.role_key','public.user_global_roles.source','public.user_global_roles.user_id','public.user_profiles.user_id','public.user_roles.user_id','public.user_subscriptions.assigned_by_user_id','public.user_subscriptions.source','public.user_subscriptions.user_id','public.wellness_logs.user_id']::text[])
           and acl.privilege_type='SELECT' and not acl.is_grantable
         )
     ) then
    raise exception 'Phase 2A teardown column grant contract drifted' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) not in (3,4) then
    raise exception 'Phase state is inconsistent with semantic audit teardown' using errcode='55000';
  end if;
end
$preflight$;

do $membership$
begin
  execute pg_catalog.format('grant reflab_preflight_audit_owner to %I',current_user);
end
$membership$;

revoke execute on function reflab_audit.production_semantic_snapshot() from reflab_prod_preflight_ro;
drop function reflab_audit.production_semantic_snapshot();
drop policy reflab_preflight_audit_owner_read on public.access_change_audit;
drop policy reflab_preflight_audit_owner_read on public.ai_usage_ledger;
drop policy reflab_preflight_audit_owner_read on public.appointment_history;
drop policy reflab_preflight_audit_owner_read on public.appointments;
drop policy reflab_preflight_audit_owner_read on public.attempts;
drop policy reflab_preflight_audit_owner_read on public.capability_overrides;
drop policy reflab_preflight_audit_owner_read on public.coach_data_consents;
drop policy reflab_preflight_audit_owner_read on public.coach_rate_limit_buckets;
drop policy reflab_preflight_audit_owner_read on public.coach_runs;
drop policy reflab_preflight_audit_owner_read on public.exam_results;
drop policy reflab_preflight_audit_owner_read on public.fixtures;
drop policy reflab_preflight_audit_owner_read on public.ifab_library_documents;
drop policy reflab_preflight_audit_owner_read on public.institution_assessment_assignments;
drop policy reflab_preflight_audit_owner_read on public.institution_assessment_history;
drop policy reflab_preflight_audit_owner_read on public.institution_assessment_sessions;
drop policy reflab_preflight_audit_owner_read on public.institution_assessments;
drop policy reflab_preflight_audit_owner_read on public.institution_audit_logs;
drop policy reflab_preflight_audit_owner_read on public.institution_cohorts;
drop policy reflab_preflight_audit_owner_read on public.institution_content_assignments;
drop policy reflab_preflight_audit_owner_read on public.institution_data_consents;
drop policy reflab_preflight_audit_owner_read on public.institution_demo_sessions;
drop policy reflab_preflight_audit_owner_read on public.institution_group_memberships;
drop policy reflab_preflight_audit_owner_read on public.institution_groups;
drop policy reflab_preflight_audit_owner_read on public.institution_members;
drop policy reflab_preflight_audit_owner_read on public.institution_membership_permission_overrides;
drop policy reflab_preflight_audit_owner_read on public.institution_membership_roles;
drop policy reflab_preflight_audit_owner_read on public.institution_memberships;
drop policy reflab_preflight_audit_owner_read on public.institution_notification_campaigns;
drop policy reflab_preflight_audit_owner_read on public.institution_notification_recipients;
drop policy reflab_preflight_audit_owner_read on public.institution_permissions;
drop policy reflab_preflight_audit_owner_read on public.institution_role_permissions;
drop policy reflab_preflight_audit_owner_read on public.institution_roles;
drop policy reflab_preflight_audit_owner_read on public.institutional_clips;
drop policy reflab_preflight_audit_owner_read on public.institutional_lead_activities;
drop policy reflab_preflight_audit_owner_read on public.institutional_leads;
drop policy reflab_preflight_audit_owner_read on public.institutions;
drop policy reflab_preflight_audit_owner_read on public.match_officials;
drop policy reflab_preflight_audit_owner_read on public.match_preparations;
drop policy reflab_preflight_audit_owner_read on public.notification_events;
drop policy reflab_preflight_audit_owner_read on public.notification_preferences;
drop policy reflab_preflight_audit_owner_read on public.notification_tokens;
drop policy reflab_preflight_audit_owner_read on public.performance_checkins;
drop policy reflab_preflight_audit_owner_read on public.performance_sessions;
drop policy reflab_preflight_audit_owner_read on public.physical_tests;
drop policy reflab_preflight_audit_owner_read on public.platform_audit_logs;
drop policy reflab_preflight_audit_owner_read on public.post_match_reviews;
drop policy reflab_preflight_audit_owner_read on public.psychology_checkins;
drop policy reflab_preflight_audit_owner_read on public.psychology_exercise_sessions;
drop policy reflab_preflight_audit_owner_read on public.psychology_wellbeing_assessments;
drop policy reflab_preflight_audit_owner_read on public.readiness_scores;
drop policy reflab_preflight_audit_owner_read on public.referee_eligibility;
drop policy reflab_preflight_audit_owner_read on public.referee_exam_sessions;
drop policy reflab_preflight_audit_owner_read on public.rules_exam_results;
drop policy reflab_preflight_audit_owner_read on public.user_global_roles;
drop policy reflab_preflight_audit_owner_read on public.user_profiles;
drop policy reflab_preflight_audit_owner_read on public.user_roles;
drop policy reflab_preflight_audit_owner_read on public.user_subscriptions;
drop policy reflab_preflight_audit_owner_read on public.wellness_logs;
revoke select (actor_user_id, target_user_id) on table public.access_change_audit from reflab_preflight_audit_owner;
revoke select (user_id) on table public.ai_usage_ledger from reflab_preflight_audit_owner;
revoke select (changed_by_user_id, user_id) on table public.appointment_history from reflab_preflight_audit_owner;
revoke select (created_by_user_id, id, institution_id, user_id) on table public.appointments from reflab_preflight_audit_owner;
revoke select (criterion_result, exam_result_id, id, score, source_item_type, user_id) on table public.attempts from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, user_id) on table public.capability_overrides from reflab_preflight_audit_owner;
revoke select (user_id) on table public.coach_data_consents from reflab_preflight_audit_owner;
revoke select (user_id) on table public.coach_rate_limit_buckets from reflab_preflight_audit_owner;
revoke select (user_id) on table public.coach_runs from reflab_preflight_audit_owner;
revoke select (exam_session_id, id, submission_id, user_id) on table public.exam_results from reflab_preflight_audit_owner;
revoke select (id, raw_source_reference) on table public.fixtures from reflab_preflight_audit_owner;
revoke select (uploaded_by) on table public.ifab_library_documents from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, user_id) on table public.institution_assessment_assignments from reflab_preflight_audit_owner;
revoke select (actor_user_id) on table public.institution_assessment_history from reflab_preflight_audit_owner;
revoke select (user_id) on table public.institution_assessment_sessions from reflab_preflight_audit_owner;
revoke select (created_by_user_id) on table public.institution_assessments from reflab_preflight_audit_owner;
revoke select (actor_user_id) on table public.institution_audit_logs from reflab_preflight_audit_owner;
revoke select (created_by_user_id) on table public.institution_cohorts from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, user_id) on table public.institution_content_assignments from reflab_preflight_audit_owner;
revoke select (user_id) on table public.institution_data_consents from reflab_preflight_audit_owner;
revoke select (user_id) on table public.institution_demo_sessions from reflab_preflight_audit_owner;
revoke select (group_id, institution_id, membership_id) on table public.institution_group_memberships from reflab_preflight_audit_owner;
revoke select (created_by_user_id, id, institution_id) on table public.institution_groups from reflab_preflight_audit_owner;
revoke select (user_id) on table public.institution_members from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, institution_id, membership_id) on table public.institution_membership_permission_overrides from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, institution_id, membership_id) on table public.institution_membership_roles from reflab_preflight_audit_owner;
revoke select (id, institution_id, invited_by_user_id, status, user_id) on table public.institution_memberships from reflab_preflight_audit_owner;
revoke select (created_by_user_id) on table public.institution_notification_campaigns from reflab_preflight_audit_owner;
revoke select (user_id) on table public.institution_notification_recipients from reflab_preflight_audit_owner;
revoke select (permission_key) on table public.institution_permissions from reflab_preflight_audit_owner;
revoke select (role_id) on table public.institution_role_permissions from reflab_preflight_audit_owner;
revoke select (id, institution_id, role_key) on table public.institution_roles from reflab_preflight_audit_owner;
revoke select (uploaded_by) on table public.institutional_clips from reflab_preflight_audit_owner;
revoke select (actor_user_id) on table public.institutional_lead_activities from reflab_preflight_audit_owner;
revoke select (converted_by_user_id, owner_user_id) on table public.institutional_leads from reflab_preflight_audit_owner;
revoke select (created_by_user_id) on table public.institutions from reflab_preflight_audit_owner;
revoke select (user_id) on table public.match_officials from reflab_preflight_audit_owner;
revoke select (user_id) on table public.match_preparations from reflab_preflight_audit_owner;
revoke select (id, user_id) on table public.notification_events from reflab_preflight_audit_owner;
revoke select (user_id) on table public.notification_preferences from reflab_preflight_audit_owner;
revoke select (id, token, user_id) on table public.notification_tokens from reflab_preflight_audit_owner;
revoke select (user_id) on table public.performance_checkins from reflab_preflight_audit_owner;
revoke select (user_id) on table public.performance_sessions from reflab_preflight_audit_owner;
revoke select (user_id) on table public.physical_tests from reflab_preflight_audit_owner;
revoke select (actor_user_id) on table public.platform_audit_logs from reflab_preflight_audit_owner;
revoke select (user_id) on table public.post_match_reviews from reflab_preflight_audit_owner;
revoke select (user_id) on table public.psychology_checkins from reflab_preflight_audit_owner;
revoke select (user_id) on table public.psychology_exercise_sessions from reflab_preflight_audit_owner;
revoke select (user_id) on table public.psychology_wellbeing_assessments from reflab_preflight_audit_owner;
revoke select (user_id) on table public.readiness_scores from reflab_preflight_audit_owner;
revoke select (user_id) on table public.referee_eligibility from reflab_preflight_audit_owner;
revoke select (id, submission_id, user_id) on table public.referee_exam_sessions from reflab_preflight_audit_owner;
revoke select (user_id) on table public.rules_exam_results from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, role_key, source, user_id) on table public.user_global_roles from reflab_preflight_audit_owner;
revoke select (user_id) on table public.user_profiles from reflab_preflight_audit_owner;
revoke select (user_id) on table public.user_roles from reflab_preflight_audit_owner;
revoke select (assigned_by_user_id, source, user_id) on table public.user_subscriptions from reflab_preflight_audit_owner;
revoke select (user_id) on table public.wellness_logs from reflab_preflight_audit_owner;
revoke usage on schema public from reflab_preflight_audit_owner;
revoke usage on schema reflab_audit from reflab_preflight_audit_owner,reflab_prod_preflight_ro;
drop schema reflab_audit;

do $membership_cleanup$
begin
  execute pg_catalog.format('revoke reflab_preflight_audit_owner from %I',current_user);
end
$membership_cleanup$;

drop role reflab_preflight_audit_owner;

do $postcondition$
begin
  if pg_catalog.to_regrole('reflab_preflight_audit_owner') is not null
     or pg_catalog.to_regnamespace('reflab_audit') is not null
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null
     or exists (select 1 from pg_catalog.pg_policy where polname='reflab_preflight_audit_owner_read') then
    raise exception 'Phase 2A teardown left residual infrastructure' using errcode='55000';
  end if;
end
$postcondition$;
commit;
