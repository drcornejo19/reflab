-- ADOPTION_TEMPORARY teardown: execute only after evidence classification is complete.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $preconditions$
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence teardown marker state drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')='select pg_catalog.jsonb_build_object(
    ''attempt_semantics'', (
      select pg_catalog.jsonb_build_object(
        ''training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null),
        ''official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null),
        ''official_orphans'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and exam_result.id is null),
        ''official_owner_mismatches'', pg_catalog.count(attempt_row.id) filter (where exam_result.id is not null and exam_result.user_id <> attempt_row.user_id),
        ''invalid_communication_feedback'', pg_catalog.count(attempt_row.id) filter (
          where attempt_row.source_item_type = ''communication_feedback''
            and (attempt_row.exam_result_id is not null or attempt_row.score is not null)
        )
      )
      from public.attempts attempt_row
      left join public.exam_results exam_result on exam_result.id = attempt_row.exam_result_id
    ),
    ''scoring_versions'', (
      select pg_catalog.jsonb_build_object(
        ''legacy_unversioned_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is null),
        ''legacy_unversioned_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is null),
        ''field_applicable_v2_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and attempt_row.criterion_result->>''scoring_version'' = ''field_applicable_v2''),
        ''field_applicable_v2_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and attempt_row.criterion_result->>''scoring_version'' = ''field_applicable_v2''),
        ''unknown_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is not null and attempt_row.criterion_result->>''scoring_version'' <> ''field_applicable_v2''),
        ''unknown_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is not null and attempt_row.criterion_result->>''scoring_version'' <> ''field_applicable_v2'')
      ) from public.attempts attempt_row
    ),
    ''exam_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''results_without_session'', pg_catalog.count(exam_result.id) filter (where exam_session.id is null),
        ''session_owner_mismatches'', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.user_id <> exam_result.user_id),
        ''session_submission_mismatches'', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.submission_id <> exam_result.submission_id)
      )
      from public.exam_results exam_result
      left join public.referee_exam_sessions exam_session on exam_session.id = exam_result.exam_session_id
    ),
    ''legacy_access'', pg_catalog.jsonb_build_object(
      ''user_roles'', (select pg_catalog.count(user_id) from public.user_roles),
      ''automatic_default_global_roles'', (select pg_catalog.count(user_id) from public.user_global_roles where source = ''automatic_default''),
      ''automatic_default_subscriptions'', (select pg_catalog.count(user_id) from public.user_subscriptions where source = ''automatic_default''),
      ''unknown_global_roles'', (select pg_catalog.count(user_id) from public.user_global_roles where role_key not in (''super_admin'', ''referee''))
    ),
    ''institution_catalog'', pg_catalog.jsonb_build_object(
      ''permissions'', (select pg_catalog.count(permission_key) from public.institution_permissions),
      ''system_roles'', (select pg_catalog.count(id) from public.institution_roles where institution_id is null),
      ''system_relations'', (select pg_catalog.count(relation.role_id) from public.institution_role_permissions relation join public.institution_roles role on role.id = relation.role_id where role.institution_id is null),
      ''forbidden_roles'', (select pg_catalog.count(id) from public.institution_roles where role_key in (''physical_trainer'', ''institution_psychologist'', ''super_admin'', ''video_admin'', ''institutional_instructor'', ''institutional_student'', ''individual_referee''))
    ),
    ''institution_tenant_integrity'', pg_catalog.jsonb_build_object(
      ''membership_role_mismatches'', (select pg_catalog.count(role_link.membership_id) from public.institution_membership_roles role_link join public.institution_memberships membership on membership.id = role_link.membership_id where role_link.institution_id <> membership.institution_id),
      ''group_membership_mismatches'', (select pg_catalog.count(group_link.membership_id) from public.institution_group_memberships group_link join public.institution_groups group_row on group_row.id = group_link.group_id join public.institution_memberships membership on membership.id = group_link.membership_id where group_link.institution_id <> group_row.institution_id or group_link.institution_id <> membership.institution_id),
      ''permission_override_mismatches'', (select pg_catalog.count(override_row.membership_id) from public.institution_membership_permission_overrides override_row join public.institution_memberships membership on membership.id = override_row.membership_id where override_row.institution_id <> membership.institution_id)
    ),
    ''matches_tenant_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''institutional_appointments_without_active_membership'', pg_catalog.count(appointment.id)
      )
      from public.appointments appointment
      left join public.institution_memberships membership
        on membership.institution_id = appointment.institution_id
       and membership.user_id = appointment.user_id
       and membership.status = ''active''
      where appointment.institution_id is not null and membership.id is null
    ),
    ''fixture_creator_identity'', (
      select pg_catalog.jsonb_build_object(
        ''creator_refs'', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>''created_by'', '''') is not null),
        ''user_subject_refs'', pg_catalog.count(fixture.id) filter (where fixture.raw_source_reference->>''created_by'' like ''user\_%'' escape ''\''),
        ''profile_backed_refs'', pg_catalog.count(fixture.id) filter (where profile.user_id is not null),
        ''unresolved_profile_refs'', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>''created_by'', '''') is not null and profile.user_id is null)
      )
      from public.fixtures fixture
      left join public.user_profiles profile on profile.user_id = fixture.raw_source_reference->>''created_by''
    ),
    ''notification_integrity'', pg_catalog.jsonb_build_object(
      ''token_owner_conflicts'', coalesce((select pg_catalog.count(token) from (select token from public.notification_tokens group by token having pg_catalog.count(distinct user_id) > 1) conflict), 0),
      ''events_without_profile'', (select pg_catalog.count(event.id) from public.notification_events event left join public.user_profiles profile on profile.user_id = event.user_id where profile.user_id is null),
      ''preferences_without_profile'', (select pg_catalog.count(preference.user_id) from public.notification_preferences preference left join public.user_profiles profile on profile.user_id = preference.user_id where profile.user_id is null)
    ),
    ''identity_reference_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''total_non_null'', coalesce(pg_catalog.sum(identity_count.total_non_null), 0),
        ''user_subject_ids'', coalesce(pg_catalog.sum(identity_count.user_subject_ids), 0),
        ''profile_backed_ids'', coalesce(pg_catalog.sum(identity_count.profile_backed_ids), 0),
        ''unresolved_profile_refs'', coalesce(pg_catalog.sum(identity_count.unresolved_profile_refs), 0)
      )
      from (
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(target_user_id) filter (where target_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(invited_by_user_id) filter (where invited_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(changed_by_user_id) filter (where changed_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(uploaded_by) filter (where uploaded_by like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(uploaded_by) filter (where uploaded_by like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(owner_user_id) filter (where owner_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(converted_by_user_id) filter (where converted_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
  );') then
    raise exception 'Phase 2A semantic sidecar drift blocks pre-cutover teardown' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()')
      and n.nspname='reflab_audit' and p.proname='pre_cutover_evidence_snapshot_v1'
      and pg_catalog.pg_get_function_identity_arguments(p.oid)=''
      and pg_catalog.format_type(p.prorettype,null)='jsonb'
      and l.lanname='sql' and p.provolatile='s' and not p.proisstrict and p.prosecdef
      and r.rolname='reflab_pre_cutover_evidence_owner'
      and p.proconfig=array['search_path=pg_catalog']::text[])
     or (select pg_catalog.count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='reflab_audit' and p.proname='pre_cutover_evidence_snapshot_v1')<>1 then
    raise exception 'Pre-cutover evidence boundary function contract drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')='select pg_catalog.jsonb_build_object(
    ''format'', ''REFLAB_PRE_CUTOVER_PRODUCTION_EVIDENCE_V1'',
    ''contract_hash'', ''cc2135a3eb1ba0436d5ea9b0a82de570c35f77e9a4e5bc619e9fc88ccf752c82'',
    ''evidence_provenance'', ''TEMPORARY_SECURITY_BOUNDARY'',
    ''authorizes_ddl'', false,
    ''metrics'', (select pg_catalog.jsonb_agg(metric order by metric->>''id'') from (
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_002'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessment_assignments"
      where "id" is not null and "institution_id" is not null and "assessment_id" is not null group by "id", "institution_id", "assessment_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_003'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessment_sessions"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_004'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessments"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_005'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_cohorts"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_006'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_contents"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_007'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_groups"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_008'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_memberships"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_009'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_notification_campaigns"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_010'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_roles"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_011'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_subscriptions"
      where "institution_id" is not null group by "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_UNIQUE_013'', ''result'', case when pg_catalog.count(*)=0 then ''PASS'' else ''BLOCKER'' end,
      ''duplicate_group_count'', pg_catalog.count(*)::bigint,
      ''max_duplicate_group_size'', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."user_subscriptions"
      where "user_id" is not null group by "user_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_001'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_change_audit"
      where ((jsonb_typeof(new_data) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_002'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_change_audit"
      where ((jsonb_typeof(old_data) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_003'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_plans"
      where ((audience = ANY (ARRAY[''individual''::text, ''institution''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_004'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where (((estimated_cost_usd IS NULL) OR (estimated_cost_usd >= (0)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_005'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((input_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_006'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((output_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_007'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((total_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_008'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointment_history"
      where ((change_type = ANY (ARRAY[''created''::text, ''status_changed''::text, ''role_changed''::text, ''fixture_changed''::text, ''note_updated''::text, ''system_sync''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_009'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointment_history"
      where ((jsonb_typeof(snapshot) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_010'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_011'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((source_type = ANY (ARRAY[''manual''::text, ''institutional''::text, ''api''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_012'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((status = ANY (ARRAY[''draft''::text, ''pending_confirmation''::text, ''confirmed''::text, ''modified''::text, ''replaced''::text, ''cancelled''::text, ''suspended''::text, ''postponed''::text, ''completed''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_013'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."associations"
      where ((source_type = ANY (ARRAY[''manual''::text, ''institutional''::text, ''api''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_014'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((clarity_score IS NULL) OR ((clarity_score >= 0) AND (clarity_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_015'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((communication_score IS NULL) OR ((communication_score >= 0) AND (communication_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_016'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((completed_rounds IS NULL) OR (completed_rounds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_017'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((criterion_result IS NULL) OR (jsonb_typeof(criterion_result) = ''object''::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_018'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((english_score IS NULL) OR ((english_score >= 0) AND (english_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_019'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((exam_result_id IS NULL) OR ((source_item_type IS NOT NULL) AND (source_item_id IS NOT NULL) AND (source_occurrence_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_020'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((fatigue_level IS NULL) OR ((fatigue_level >= 1) AND (fatigue_level <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_021'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((grammar_score IS NULL) OR ((grammar_score >= 0) AND (grammar_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_022'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((justification_score IS NULL) OR ((justification_score >= 0) AND (justification_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_023'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((jsonb_typeof(mastered_concepts) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_024'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((jsonb_typeof(pending_concepts) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_025'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((perceived_effort IS NULL) OR ((perceived_effort >= 1) AND (perceived_effort <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_026'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((pronunciation_score IS NULL) OR ((pronunciation_score >= 0) AND (pronunciation_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_027'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((protocol_score IS NULL) OR ((protocol_score >= 0) AND (protocol_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_028'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_029'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((structure_score IS NULL) OR ((structure_score >= 0) AND (structure_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_030'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((technical_accuracy_score IS NULL) OR ((technical_accuracy_score >= 0) AND (technical_accuracy_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_031'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((terminology_score IS NULL) OR ((terminology_score >= 0) AND (terminology_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_032'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((time_spent IS NULL) OR (time_spent >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_033'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((time_spent_seconds IS NULL) OR (time_spent_seconds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_034'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((total_duration IS NULL) OR (total_duration >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_035'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((total_rounds IS NULL) OR (total_rounds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_036'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((vocabulary_score IS NULL) OR ((vocabulary_score >= 0) AND (vocabulary_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_037'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((effect = ANY (ARRAY[''allow''::text, ''deny''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_038'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((((scope_type = ''global_user''::text) AND (institution_id IS NULL)) OR ((scope_type = ''institution_user''::text) AND (institution_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_039'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((scope_type = ANY (ARRAY[''global_user''::text, ''institution_user''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_040'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where (((valid_until IS NULL) OR (valid_until > valid_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_041'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((analysis_answers IS NULL) OR (jsonb_typeof(analysis_answers) = ''object''::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_042'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_app_status IS NULL) OR (correct_app_status = ANY (ARRAY[''same_app''::text, ''new_app''::text, ''not_relevant''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_043'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_clear_error IS NULL) OR (correct_clear_error = ANY (ARRAY[''yes''::text, ''no''::text, ''unclear''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_044'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_var_decision IS NULL) OR (correct_var_decision = ANY (ARRAY[''check_complete''::text, ''recommend_ofr''::text, ''factual_review''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_045'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_046'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where ((data_category = ANY (ARRAY[''technical_history''::text, ''match_operational''::text, ''physical_summary''::text, ''psychology_summary''::text, ''psychology_detail''::text, ''medical_sensitive''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_047'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where (((granted AND (granted_at IS NOT NULL) AND (revoked_at IS NULL)) OR (NOT granted))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_048'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where ((purpose = ANY (ARRAY[''personal_coaching''::text, ''institutional_sharing''::text, ''model_improvement''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_049'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((jsonb_typeof(evidence_snapshot) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_050'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((evidence_type = ANY (ARRAY[''clip''::text, ''attempt''::text, ''exam''::text, ''official_document''::text, ''metric_snapshot''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_051'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_052'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_rate_limit_buckets"
      where ((request_count >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_053'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((confidence_label = ANY (ARRAY[''high''::text, ''medium''::text, ''human_review''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_054'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((confidence_score >= 0) AND (confidence_score <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_055'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((evidence_count >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_056'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((feature = ANY (ARRAY[''technical_feedback''::text, ''exam_analysis''::text, ''communication_feedback''::text, ''var_feedback''::text, ''coach_conversation''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_057'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((input_tokens IS NULL) OR (input_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_058'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((latency_ms IS NULL) OR (latency_ms >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_059'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((output_tokens IS NULL) OR (output_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_060'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_061'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((status = ANY (ARRAY[''running''::text, ''completed''::text, ''failed''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_062'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((total_tokens IS NULL) OR (total_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_063'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_categories"
      where ((source_type = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_064'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_categories"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_065'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where ((source_type = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_066'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where ((status = ANY (ARRAY[''draft''::text, ''active''::text, ''archived''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_067'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_068'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((competition_type = ANY (ARRAY[''league''::text, ''cup''::text, ''playoff''::text, ''friendly''::text, ''tournament''::text, ''other''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_069'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((source_type = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_070'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_071'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."countries"
      where (((char_length(code) >= 2) AND (char_length(code) <= 3))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_072'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((avg_score >= (0)::numeric) AND (avg_score <= (100)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_073'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((correct_count >= 0) AND (correct_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_074'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((jsonb_typeof(details) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_075'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((payload_hash ~ ''^[0-9a-f]{64}$''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_076'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_077'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((total_questions >= 1) AND (total_questions <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_078'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((total_score >= (0)::numeric)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_079'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((competitions_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_080'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((date_to >= date_from)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_081'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((jsonb_typeof(error_payload) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_082'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((fixtures_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_083'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_084'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((sync_status = ANY (ARRAY[''success''::text, ''partial''::text, ''error''::text, ''skipped''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_085'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((teams_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_086'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((venues_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_087'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((data_source = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_088'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where (((home_team_id IS NULL) OR (away_team_id IS NULL) OR (home_team_id <> away_team_id))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_089'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((jsonb_typeof(raw_source_reference) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_090'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_091'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((status = ANY (ARRAY[''scheduled''::text, ''confirmed''::text, ''live''::text, ''completed''::text, ''postponed''::text, ''suspended''::text, ''cancelled''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_092'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((category = ANY (ARRAY[''reglas''::text, ''circular''::text, ''resumen''::text, ''protocolo_var''::text, ''cambios_reglamentarios''::text, ''mundial''::text, ''material_consulta''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_093'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where (((status <> ''vigente''::text) OR ((source_official IS NOT NULL) AND (btrim(source_official) <> ''''::text)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_094'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((governing_body = ANY (ARRAY[''IFAB''::text, ''FIFA''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_095'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((((sport_type = ''football_11''::text) AND (governing_body = ''IFAB''::text)) OR ((sport_type = ''futsal''::text) AND (governing_body = ''FIFA''::text)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_096'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_097'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((status = ANY (ARRAY[''vigente''::text, ''proxima_actualizacion''::text, ''archivado''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_098'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where (((attempts_override IS NULL) OR (attempts_override > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_099'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where ((((group_id IS NOT NULL) AND (user_id IS NULL)) OR ((group_id IS NULL) AND (user_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_100'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where (((opens_at_override IS NULL) OR (closes_at_override IS NULL) OR (closes_at_override > opens_at_override))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_101'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_feedback"
      where ((action = ANY (ARRAY[''comment''::text, ''approve''::text, ''fail''::text, ''request_retry''::text, ''mark_for_review''::text, ''assign_activity''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_102'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_feedback"
      where ((priority = ANY (ARRAY[''low''::text, ''normal''::text, ''high''::text, ''urgent''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_103'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_history"
      where ((jsonb_typeof(snapshot) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_104'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((jsonb_typeof(item_snapshot) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_105'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((item_type = ANY (ARRAY[''global_clip''::text, ''institutional_clip''::text, ''rule_question''::text, ''institution_content''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_106'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((points >= (0)::numeric)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_107'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((attempt_number > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_108'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where (((percentage IS NULL) OR ((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_109'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((jsonb_typeof(result_payload) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_110'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((status = ANY (ARRAY[''not_started''::text, ''in_progress''::text, ''submitted''::text, ''graded''::text, ''expired''::text, ''cancelled''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_111'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where (((time_spent_seconds IS NULL) OR (time_spent_seconds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_112'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((attempts_allowed > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_113'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_114'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((minimum_score IS NULL) OR ((minimum_score >= (0)::numeric) AND (minimum_score <= (100)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_115'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((modality = ANY (ARRAY[''video_analysis''::text, ''rules_exam''::text, ''trivia''::text, ''referee_exam''::text, ''communication''::text, ''var''::text, ''futsal''::text, ''psychology_orientation''::text, ''physical''::text, ''custom''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_116'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((question_count IS NULL) OR (question_count > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_117'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((jsonb_typeof(settings) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_118'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((video_count IS NULL) OR (video_count > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_119'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((opens_at IS NULL) OR (closes_at IS NULL) OR (closes_at > opens_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_120'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where (((after_state IS NULL) OR (jsonb_typeof(after_state) = ''object''::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_121'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where (((before_state IS NULL) OR (jsonb_typeof(before_state) = ''object''::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_122'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_123'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_cohorts"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_124'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_cohorts"
      where (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_125'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_content_assignments"
      where ((((group_id IS NOT NULL) AND (user_id IS NULL)) OR ((group_id IS NULL) AND (user_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_126'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_content_assignments"
      where (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_127'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((content_type = ANY (ARRAY[''video''::text, ''question''::text, ''trivia''::text, ''document''::text, ''circular''::text, ''class''::text, ''exercise''::text, ''presentation''::text, ''pdf''::text, ''link''::text, ''audio''::text, ''case_study''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_128'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_129'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where (((valid_until IS NULL) OR (valid_from IS NULL) OR (valid_until >= valid_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_130'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((version > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_131'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((visibility = ANY (ARRAY[''private''::text, ''institution''::text, ''assigned_groups''::text, ''public''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_132'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_data_consents"
      where ((data_category = ANY (ARRAY[''availability''::text, ''readiness_summary''::text, ''physical_load''::text, ''physical_detail''::text, ''medical_notes''::text, ''psychology_compliance''::text, ''psychology_detail''::text, ''post_match_review''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_133'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((expires_at > started_at)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_134'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_135'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((status = ANY (ARRAY[''active''::text, ''ended''::text, ''expired''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_136'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_group_memberships"
      where ((group_role = ANY (ARRAY[''participant''::text, ''instructor''::text, ''coordinator''::text, ''observer''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_137'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where ((group_type = ANY (ARRAY[''course''::text, ''cohort''::text, ''commission''::text, ''category''::text, ''role''::text, ''training''::text, ''work_team''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_138'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_139'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_140'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_141'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where (((primary_sport IS NULL) OR (primary_sport = ANY (ARRAY[''football_11''::text, ''futsal''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_142'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where ((status = ANY (ARRAY[''invited''::text, ''active''::text, ''suspended''::text, ''revoked''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_143'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_campaigns"
      where (((cardinality(channels) > 0) AND (channels <@ ARRAY[''web''::text, ''pwa''::text, ''email''::text, ''push''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_144'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_campaigns"
      where ((priority = ANY (ARRAY[''low''::text, ''normal''::text, ''high''::text, ''urgent''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_145'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_recipients"
      where ((delivery_status = ANY (ARRAY[''pending''::text, ''sent''::text, ''failed''::text, ''read''::text, ''dismissed''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_146'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where ((plan_key = ANY (ARRAY[''academy''::text, ''enterprise''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_147'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where (((seat_limit IS NULL) OR (seat_limit >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_148'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where ((status = ANY (ARRAY[''trialing''::text, ''active''::text, ''paused''::text, ''canceled''::text, ''expired''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_149'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where (((ends_at IS NULL) OR (ends_at > starts_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_150'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_lead_activities"
      where ((activity_type = ANY (ARRAY[''created''::text, ''updated''::text, ''status_changed''::text, ''note_added''::text, ''contact_logged''::text, ''archived''::text, ''restored''::text, ''converted''::text, ''deleted''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_151'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_lead_activities"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_152'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((((converted_institution_id IS NULL) AND (converted_at IS NULL)) OR ((converted_institution_id IS NOT NULL) AND (converted_at IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_153'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where (((instructor_count IS NULL) OR (instructor_count >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_154'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((potential_plan = ANY (ARRAY[''academy''::text, ''enterprise''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_155'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where (((referee_count IS NULL) OR (referee_count >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_156'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((status = ANY (ARRAY[''new''::text, ''contacted''::text, ''demo_scheduled''::text, ''demo_completed''::text, ''proposal_sent''::text, ''negotiation''::text, ''won''::text, ''lost''::text, ''archived''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_157'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(assessment_settings) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_158'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((brand_color ~ ''^#[0-9A-Fa-f]{6}$''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_159'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where (((cardinality(enabled_sports) > 0) AND (enabled_sports <@ ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_160'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((institution_type = ANY (ARRAY[''school''::text, ''league''::text, ''association''::text, ''federation''::text, ''private_academy''::text, ''other''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_161'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((license_limit >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_162'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where (((license_end IS NULL) OR (license_start IS NULL) OR (license_end > license_start))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_163'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(metrics_settings) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_164'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((plan_key = ANY (ARRAY[''academy''::text, ''enterprise''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_165'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(privacy_settings) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_166'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_used <= seats_total)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_167'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_total >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_168'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_used >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_169'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((status = ANY (ARRAY[''pending''::text, ''trial''::text, ''active''::text, ''suspended''::text, ''expired''::text, ''archived''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_170'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((jsonb_typeof(payload) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_171'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((snapshot_type = ANY (ARRAY[''standings''::text, ''form''::text, ''disciplinary''::text, ''official_note''::text, ''summary''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_172'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((source_type = ANY (ARRAY[''manual''::text, ''institutional''::text, ''api''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_173'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_174'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_officials"
      where ((source_type = ANY (ARRAY[''manual''::text, ''institutional''::text, ''api''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_175'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_officials"
      where ((status = ANY (ARRAY[''assigned''::text, ''confirmed''::text, ''replaced''::text, ''removed''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_176'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((jsonb_typeof(answers) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_177'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((jsonb_typeof(checklist) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_178'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_179'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((stage = ANY (ARRAY[''72_48_hours''::text, ''24_hours''::text, ''matchday''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_180'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((status = ANY (ARRAY[''draft''::text, ''completed''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_181'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."notification_events"
      where (((sport_type IS NULL) OR (sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_182'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint, ''status_counts'', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(''status'',status,''count'',status_count) order by status),''[]''::jsonb)
        from (select status,pg_catalog.count(*)::bigint status_count from public.notification_events group by status) approved_statuses))
    from (select pg_catalog.count(*)::bigint violation_count from "public"."notification_events"
      where ((status = ANY (ARRAY[''queued''::text, ''sent''::text, ''failed''::text, ''skipped''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_183'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where ((checkin_type = ANY (ARRAY[''pre''::text, ''post''::text, ''rest_day''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_184'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_185'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((emotional_score IS NULL) OR ((emotional_score >= 1) AND (emotional_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_186'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((fatigue IS NULL) OR ((fatigue >= 1) AND (fatigue <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_187'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((internal_load IS NULL) OR (internal_load >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_188'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((readiness_score IS NULL) OR ((readiness_score >= 0) AND (readiness_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_189'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((rpe IS NULL) OR ((rpe >= 1) AND (rpe <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_190'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((sleep_hours IS NULL) OR ((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_191'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_192'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_193'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((fatigue_post IS NULL) OR ((fatigue_post >= 1) AND (fatigue_post <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_194'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((internal_load IS NULL) OR (internal_load >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_195'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((rpe IS NULL) OR ((rpe >= 1) AND (rpe <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_196'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_197'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."physical_tests"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_198'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(after_state) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_199'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(before_state) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_200'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(metadata) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_201'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((fatigue_score IS NULL) OR ((fatigue_score >= 1) AND (fatigue_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_202'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((jsonb_typeof(incidents) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_203'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((jsonb_typeof(key_decisions) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_204'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((minutes_played IS NULL) OR ((minutes_played >= 0) AND (minutes_played <= 180)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_205'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((perceived_load IS NULL) OR ((perceived_load >= 1) AND (perceived_load <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_206'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_207'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((activation_score IS NULL) OR ((activation_score >= 1) AND (activation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_208'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((checkin_type = ANY (ARRAY[''pre_match''::text, ''post_match''::text, ''error_recovery''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_209'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((concentration_score IS NULL) OR ((concentration_score >= 1) AND (concentration_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_210'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((confidence_score IS NULL) OR ((confidence_score >= 1) AND (confidence_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_211'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((emotional_control_score IS NULL) OR ((emotional_control_score >= 1) AND (emotional_control_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_212'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((error_impact_score IS NULL) OR ((error_impact_score >= 1) AND (error_impact_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_213'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((jsonb_typeof(feedback) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_214'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((incident_minute IS NULL) OR ((incident_minute >= 0) AND (incident_minute <= 130)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_215'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((mental_fatigue_score IS NULL) OR ((mental_fatigue_score >= 1) AND (mental_fatigue_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_216'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((mental_score IS NULL) OR ((mental_score >= 0) AND (mental_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_217'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((pressure_score IS NULL) OR ((pressure_score >= 1) AND (pressure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_218'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((process_orientation_score IS NULL) OR ((process_orientation_score >= 1) AND (process_orientation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_219'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((recovery_score IS NULL) OR ((recovery_score >= 1) AND (recovery_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_220'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((jsonb_typeof(responses) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_221'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_222'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((after_score IS NULL) OR ((after_score >= 1) AND (after_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_223'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((before_score IS NULL) OR ((before_score >= 1) AND (before_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_224'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((clarity_score IS NULL) OR ((clarity_score >= 1) AND (clarity_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_225'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((exercise_type = ANY (ARRAY[''focus_reset''::text, ''pressure_scenario''::text, ''self_talk''::text, ''team_prebrief''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_226'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((jsonb_typeof(feedback) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_227'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((pressure_level IS NULL) OR ((pressure_level >= 1) AND (pressure_level <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_228'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_229'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((concentration_difficulty_score IS NULL) OR ((concentration_difficulty_score >= 1) AND (concentration_difficulty_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_230'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((institutional_support_score IS NULL) OR ((institutional_support_score >= 1) AND (institutional_support_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_231'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((emotional_exhaustion_score IS NULL) OR ((emotional_exhaustion_score >= 1) AND (emotional_exhaustion_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_232'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((burnout_risk_score IS NULL) OR ((burnout_risk_score >= 0) AND (burnout_risk_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_233'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((cynicism_score IS NULL) OR ((cynicism_score >= 1) AND (cynicism_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_234'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((external_pressure_score IS NULL) OR ((external_pressure_score >= 1) AND (external_pressure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_235'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where ((jsonb_typeof(feedback) = ''object''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_236'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((motivation_score IS NULL) OR ((motivation_score >= 1) AND (motivation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_237'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((recovery_quality_score IS NULL) OR ((recovery_quality_score >= 1) AND (recovery_quality_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_238'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((sleep_disruption_score IS NULL) OR ((sleep_disruption_score >= 1) AND (sleep_disruption_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_239'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_240'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((violence_exposure_score IS NULL) OR ((violence_exposure_score >= 1) AND (violence_exposure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_241'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((workload_score IS NULL) OR ((workload_score >= 1) AND (workload_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_242'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where (((factors IS NULL) OR (jsonb_typeof(factors) = ''object''::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_243'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where (((score >= 0) AND (score <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_244'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_245'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((eligibility_mode = ANY (ARRAY[''eligible''::text, ''view_only''::text, ''blocked''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_246'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((source_type = ANY (ARRAY[''profile''::text, ''institutional''::text, ''admin''::text, ''system''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_247'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_248'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_roles"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_249'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((correct_count >= 0) AND (correct_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_250'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((unanswered_count >= 0) AND (unanswered_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_251'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((jsonb_typeof(details) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_252'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_253'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_254'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((jsonb_typeof(topic_performance) = ''array''::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_255'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((total_questions > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_256'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."teams"
      where ((source_type = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_257'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."teams"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_258'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_profiles"
      where (((preferred_sport_type IS NULL) OR (preferred_sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_259'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_profiles"
      where ((subscription_plan = ANY (ARRAY[''free''::text, ''basic''::text, ''pro''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_260'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_roles"
      where ((subscription_plan = ANY (ARRAY[''free''::text, ''basic''::text, ''pro''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_261'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where ((plan_key = ANY (ARRAY[''basic''::text, ''pro''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_262'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where ((status = ANY (ARRAY[''trialing''::text, ''active''::text, ''paused''::text, ''canceled''::text, ''expired''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_263'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where (((ends_at IS NULL) OR (ends_at > starts_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_264'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."venues"
      where ((source_type = ANY (ARRAY[''institutional''::text, ''api''::text, ''manual''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_265'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((emotional_score IS NULL) OR ((emotional_score >= 1) AND (emotional_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_266'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((fatigue IS NULL) OR ((fatigue >= 1) AND (fatigue <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_267'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((sleep_hours IS NULL) OR ((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_CHECK_268'', ''result'', case when violation_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''violation_count'', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where ((sport_type = ANY (ARRAY[''football_11''::text, ''futsal''::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_001'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."ai_usage_ledger" source_row
      where (source_row."run_id" is not null) and not exists (select 1 from "public"."coach_runs" target_row where source_row."run_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_002'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointment_history" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_003'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_004'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_005'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_006'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_007'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."replaced_by_appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."replaced_by_appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_008'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_009'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."associations" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_010'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."exam_result_id" is not null) and not exists (select 1 from "public"."exam_results" target_row where source_row."exam_result_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_011'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."institution_group_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."institution_group_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_012'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_013'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."capability_overrides" source_row
      where (source_row."capability_key" is not null) and not exists (select 1 from "public"."capabilities" target_row where source_row."capability_key" = target_row."capability_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_014'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."capability_overrides" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_015'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."coach_evidence" source_row
      where (source_row."run_id" is not null) and not exists (select 1 from "public"."coach_runs" target_row where source_row."run_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_016'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."coach_runs" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_017'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_categories" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_018'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_categories" source_row
      where (source_row."season_id" is not null) and not exists (select 1 from "public"."competition_seasons" target_row where source_row."season_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_019'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_seasons" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_020'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competitions" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_021'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_assessment_session_id" is not null) and not exists (select 1 from "public"."institution_assessment_sessions" target_row where source_row."institution_assessment_session_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_022'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_group_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."institution_group_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_023'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_024'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixture_sync_logs" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_025'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_026'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."away_team_id" is not null) and not exists (select 1 from "public"."teams" target_row where source_row."away_team_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_027'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."category_id" is not null) and not exists (select 1 from "public"."competition_categories" target_row where source_row."category_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_028'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_029'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_030'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."home_team_id" is not null) and not exists (select 1 from "public"."teams" target_row where source_row."home_team_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_031'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."season_id" is not null) and not exists (select 1 from "public"."competition_seasons" target_row where source_row."season_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_032'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."venue_id" is not null) and not exists (select 1 from "public"."venues" target_row where source_row."venue_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_033'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_034'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_035'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_036'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_feedback" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_037'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_feedback" source_row
      where (source_row."session_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessment_sessions" target_row where source_row."session_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_038'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_history" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_039'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_history" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_040'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_items" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_041'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_items" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_042'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_043'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."assignment_id" is not null and source_row."institution_id" is not null and source_row."assessment_id" is not null) and not exists (select 1 from "public"."institution_assessment_assignments" target_row where source_row."assignment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id" and source_row."assessment_id" = target_row."assessment_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_044'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_045'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_046'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_047'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_audit_logs" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_048'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_audit_logs" source_row
      where (source_row."actor_membership_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."actor_membership_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_049'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_cohorts" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_050'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."content_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_contents" target_row where source_row."content_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_051'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_052'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_053'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_contents" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_054'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_data_consents" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_055'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_data_consents" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_056'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_demo_sessions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_057'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_058'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_059'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_060'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_groups" source_row
      where (source_row."cohort_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_cohorts" target_row where source_row."cohort_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_061'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_groups" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_062'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_members" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_063'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_064'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_065'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."permission_id" is not null) and not exists (select 1 from "public"."institution_permissions" target_row where source_row."permission_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_066'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_067'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_068'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."institution_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_069'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_memberships" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_070'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_campaigns" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_071'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_recipients" source_row
      where (source_row."campaign_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_notification_campaigns" target_row where source_row."campaign_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_072'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_recipients" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_073'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_074'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."permission_id" is not null) and not exists (select 1 from "public"."institution_permissions" target_row where source_row."permission_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_075'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."institution_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_076'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_077'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_subscriptions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_078'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_subscriptions" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_079'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_clips" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_080'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_lead_activities" source_row
      where (source_row."lead_id" is not null) and not exists (select 1 from "public"."institutional_leads" target_row where source_row."lead_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_081'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_leads" source_row
      where (source_row."converted_institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."converted_institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_082'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_context_snapshots" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_083'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_084'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_085'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_086'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_preparations" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_087'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."notification_events" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_088'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."notification_events" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_089'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_checkins" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_090'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_checkins" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_091'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_092'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_093'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_094'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."plan_capabilities" source_row
      where (source_row."capability_key" is not null) and not exists (select 1 from "public"."capabilities" target_row where source_row."capability_key" = target_row."capability_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_095'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."plan_capabilities" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_096'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."post_match_reviews" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_097'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_098'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_099'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_100'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_101'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_102'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_103'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_wellbeing_assessments" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_104'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_105'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_106'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_107'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_108'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."category_id" is not null) and not exists (select 1 from "public"."competition_categories" target_row where source_row."category_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_109'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_110'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_111'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_112'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_113'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."teams" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_114'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."teams" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_115'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_global_roles" source_row
      where (source_row."role_key" is not null) and not exists (select 1 from "public"."platform_roles" target_row where source_row."role_key" = target_row."role_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_116'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_profiles" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_117'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_profiles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_118'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_119'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_subscriptions" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_120'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."venues" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_121'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."venues" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_122'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_123'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_FK_124'', ''result'', case when orphan_count=0 then ''PASS'' else ''BLOCKER'' end,
      ''orphan_count'', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_NULLABILITY_001'', ''result'', case when pg_catalog.count(*) filter (where "payload_hash" is null)=0 then ''PASS'' else ''BLOCKER'' end,
      ''total_rows'', pg_catalog.count(*)::bigint,
      ''null_count'', pg_catalog.count(*) filter (where "payload_hash" is null)::bigint)
    from "public"."exam_results"
    union all
    select pg_catalog.jsonb_build_object(
      ''id'', ''PCE_NULLABILITY_002'', ''result'', case when pg_catalog.count(*) filter (where "exam_session_id" is null)=0 then ''PASS'' else ''BLOCKER'' end,
      ''total_rows'', pg_catalog.count(*)::bigint,
      ''null_count'', pg_catalog.count(*) filter (where "exam_session_id" is null)::bigint)
    from "public"."exam_results"
    ) evidence_metrics(metric))
  );') then
    raise exception 'Pre-cutover evidence boundary source drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles r where r.rolname='reflab_pre_cutover_evidence_owner'
      and not r.rolcanlogin and not r.rolinherit and not r.rolbypassrls and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole) then
    raise exception 'Pre-cutover evidence owner drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_auth_members m
    where m.roleid in (pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner'),pg_catalog.to_regrole('reflab_prod_preflight_ro'))
       or m.member in (pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner'),pg_catalog.to_regrole('reflab_prod_preflight_ro'))) then
    raise exception 'Pre-cutover evidence boundary role membership drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()')
      and (acl.privilege_type<>'EXECUTE'
        or acl.grantee not in (p.proowner,pg_catalog.to_regrole('reflab_prod_preflight_ro'))
        or (acl.grantee=pg_catalog.to_regrole('reflab_prod_preflight_ro') and acl.is_grantable)))
     or (select pg_catalog.count(*) from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl
       where p.oid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()')
         and acl.grantee=pg_catalog.to_regrole('reflab_prod_preflight_ro') and acl.privilege_type='EXECUTE' and not acl.is_grantable)<>1 then
    raise exception 'Pre-cutover evidence boundary EXECUTE drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')
      and c.relowner=pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner'))
     or exists(select 1 from pg_catalog.pg_proc p
       where p.proowner=pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')
         and p.oid<>pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()'))
     or exists(select 1 from pg_catalog.pg_namespace n
       where n.nspowner=pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')) then
    raise exception 'Pre-cutover evidence owner has unexpected ownership' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name) as (values ('public','access_change_audit'),('public','access_plans'),('public','ai_usage_ledger'),('public','appointment_history'),('public','appointments'),('public','associations'),('public','attempts'),('public','capabilities'),('public','capability_overrides'),('public','clips'),('public','coach_data_consents'),('public','coach_evidence'),('public','coach_rate_limit_buckets'),('public','coach_runs'),('public','competition_categories'),('public','competition_seasons'),('public','competitions'),('public','countries'),('public','exam_results'),('public','fixture_sync_logs'),('public','fixtures'),('public','ifab_library_documents'),('public','institution_assessment_assignments'),('public','institution_assessment_feedback'),('public','institution_assessment_history'),('public','institution_assessment_items'),('public','institution_assessment_sessions'),('public','institution_assessments'),('public','institution_audit_logs'),('public','institution_cohorts'),('public','institution_content_assignments'),('public','institution_contents'),('public','institution_data_consents'),('public','institution_demo_sessions'),('public','institution_group_memberships'),('public','institution_groups'),('public','institution_members'),('public','institution_membership_permission_overrides'),('public','institution_membership_roles'),('public','institution_memberships'),('public','institution_notification_campaigns'),('public','institution_notification_recipients'),('public','institution_permissions'),('public','institution_role_permissions'),('public','institution_roles'),('public','institution_subscriptions'),('public','institutional_clips'),('public','institutional_lead_activities'),('public','institutional_leads'),('public','institutions'),('public','match_context_snapshots'),('public','match_officials'),('public','match_preparations'),('public','notification_events'),('public','performance_checkins'),('public','performance_sessions'),('public','physical_tests'),('public','plan_capabilities'),('public','platform_audit_logs'),('public','platform_roles'),('public','post_match_reviews'),('public','psychology_checkins'),('public','psychology_exercise_sessions'),('public','psychology_modules'),('public','psychology_wellbeing_assessments'),('public','readiness_scores'),('public','referee_eligibility'),('public','referee_roles'),('public','rules_exam_results'),('public','teams'),('public','user_global_roles'),('public','user_profiles'),('public','user_roles'),('public','user_subscriptions'),('public','venues'),('public','wellness_logs'))
    select 1 from expected
    join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name))
    where pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'SELECT')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'INSERT')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'UPDATE')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'DELETE')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'TRUNCATE')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'REFERENCES')
       or pg_catalog.has_table_privilege('reflab_pre_cutover_evidence_owner',c.oid,'TRIGGER')) then
    raise exception 'Pre-cutover evidence owner has unexpected table privilege' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name,column_name) as (values ('public','access_change_audit','new_data'),('public','access_change_audit','old_data'),('public','access_plans','audience'),('public','access_plans','plan_key'),('public','ai_usage_ledger','estimated_cost_usd'),('public','ai_usage_ledger','input_tokens'),('public','ai_usage_ledger','output_tokens'),('public','ai_usage_ledger','run_id'),('public','ai_usage_ledger','total_tokens'),('public','appointment_history','appointment_id'),('public','appointment_history','change_type'),('public','appointment_history','snapshot'),('public','appointments','association_id'),('public','appointments','competition_id'),('public','appointments','fixture_id'),('public','appointments','id'),('public','appointments','institution_id'),('public','appointments','metadata'),('public','appointments','replaced_by_appointment_id'),('public','appointments','role_id'),('public','appointments','source_type'),('public','appointments','status'),('public','associations','country_id'),('public','associations','id'),('public','associations','source_type'),('public','attempts','clarity_score'),('public','attempts','communication_score'),('public','attempts','completed_rounds'),('public','attempts','criterion_result'),('public','attempts','english_score'),('public','attempts','exam_result_id'),('public','attempts','fatigue_level'),('public','attempts','grammar_score'),('public','attempts','institution_group_id'),('public','attempts','institution_id'),('public','attempts','justification_score'),('public','attempts','mastered_concepts'),('public','attempts','pending_concepts'),('public','attempts','perceived_effort'),('public','attempts','pronunciation_score'),('public','attempts','protocol_score'),('public','attempts','source_item_id'),('public','attempts','source_item_type'),('public','attempts','source_occurrence_id'),('public','attempts','sport_type'),('public','attempts','structure_score'),('public','attempts','technical_accuracy_score'),('public','attempts','terminology_score'),('public','attempts','time_spent'),('public','attempts','time_spent_seconds'),('public','attempts','total_duration'),('public','attempts','total_rounds'),('public','attempts','vocabulary_score'),('public','capabilities','capability_key'),('public','capability_overrides','capability_key'),('public','capability_overrides','effect'),('public','capability_overrides','institution_id'),('public','capability_overrides','scope_type'),('public','capability_overrides','valid_from'),('public','capability_overrides','valid_until'),('public','clips','analysis_answers'),('public','clips','correct_app_status'),('public','clips','correct_clear_error'),('public','clips','correct_var_decision'),('public','clips','sport_type'),('public','coach_data_consents','data_category'),('public','coach_data_consents','granted'),('public','coach_data_consents','granted_at'),('public','coach_data_consents','purpose'),('public','coach_data_consents','revoked_at'),('public','coach_evidence','evidence_snapshot'),('public','coach_evidence','evidence_type'),('public','coach_evidence','run_id'),('public','coach_evidence','sport_type'),('public','coach_rate_limit_buckets','request_count'),('public','coach_runs','confidence_label'),('public','coach_runs','confidence_score'),('public','coach_runs','evidence_count'),('public','coach_runs','feature'),('public','coach_runs','id'),('public','coach_runs','input_tokens'),('public','coach_runs','institution_id'),('public','coach_runs','latency_ms'),('public','coach_runs','output_tokens'),('public','coach_runs','sport_type'),('public','coach_runs','status'),('public','coach_runs','total_tokens'),('public','competition_categories','competition_id'),('public','competition_categories','id'),('public','competition_categories','season_id'),('public','competition_categories','source_type'),('public','competition_categories','sport_type'),('public','competition_seasons','competition_id'),('public','competition_seasons','end_date'),('public','competition_seasons','id'),('public','competition_seasons','source_type'),('public','competition_seasons','start_date'),('public','competition_seasons','status'),('public','competitions','association_id'),('public','competitions','competition_type'),('public','competitions','id'),('public','competitions','source_type'),('public','competitions','sport_type'),('public','countries','code'),('public','countries','id'),('public','exam_results','avg_score'),('public','exam_results','correct_count'),('public','exam_results','details'),('public','exam_results','exam_session_id'),('public','exam_results','id'),('public','exam_results','institution_assessment_session_id'),('public','exam_results','institution_group_id'),('public','exam_results','institution_id'),('public','exam_results','payload_hash'),('public','exam_results','sport_type'),('public','exam_results','total_questions'),('public','exam_results','total_score'),('public','fixture_sync_logs','competition_id'),('public','fixture_sync_logs','competitions_upserted'),('public','fixture_sync_logs','date_from'),('public','fixture_sync_logs','date_to'),('public','fixture_sync_logs','error_payload'),('public','fixture_sync_logs','fixtures_upserted'),('public','fixture_sync_logs','sport_type'),('public','fixture_sync_logs','sync_status'),('public','fixture_sync_logs','teams_upserted'),('public','fixture_sync_logs','venues_upserted'),('public','fixtures','association_id'),('public','fixtures','away_team_id'),('public','fixtures','category_id'),('public','fixtures','competition_id'),('public','fixtures','country_id'),('public','fixtures','data_source'),('public','fixtures','home_team_id'),('public','fixtures','id'),('public','fixtures','raw_source_reference'),('public','fixtures','season_id'),('public','fixtures','sport_type'),('public','fixtures','status'),('public','fixtures','venue_id'),('public','ifab_library_documents','category'),('public','ifab_library_documents','governing_body'),('public','ifab_library_documents','source_official'),('public','ifab_library_documents','sport_type'),('public','ifab_library_documents','status'),('public','institution_assessment_assignments','assessment_id'),('public','institution_assessment_assignments','attempts_override'),('public','institution_assessment_assignments','closes_at_override'),('public','institution_assessment_assignments','group_id'),('public','institution_assessment_assignments','id'),('public','institution_assessment_assignments','institution_id'),('public','institution_assessment_assignments','opens_at_override'),('public','institution_assessment_assignments','user_id'),('public','institution_assessment_feedback','action'),('public','institution_assessment_feedback','institution_id'),('public','institution_assessment_feedback','priority'),('public','institution_assessment_feedback','session_id'),('public','institution_assessment_history','assessment_id'),('public','institution_assessment_history','institution_id'),('public','institution_assessment_history','snapshot'),('public','institution_assessment_items','assessment_id'),('public','institution_assessment_items','institution_id'),('public','institution_assessment_items','item_snapshot'),('public','institution_assessment_items','item_type'),('public','institution_assessment_items','points'),('public','institution_assessment_sessions','assessment_id'),('public','institution_assessment_sessions','assignment_id'),('public','institution_assessment_sessions','attempt_number'),('public','institution_assessment_sessions','group_id'),('public','institution_assessment_sessions','id'),('public','institution_assessment_sessions','institution_id'),('public','institution_assessment_sessions','percentage'),('public','institution_assessment_sessions','result_payload'),('public','institution_assessment_sessions','status'),('public','institution_assessment_sessions','time_spent_seconds'),('public','institution_assessments','attempts_allowed'),('public','institution_assessments','closes_at'),('public','institution_assessments','duration_minutes'),('public','institution_assessments','id'),('public','institution_assessments','institution_id'),('public','institution_assessments','minimum_score'),('public','institution_assessments','modality'),('public','institution_assessments','opens_at'),('public','institution_assessments','question_count'),('public','institution_assessments','settings'),('public','institution_assessments','video_count'),('public','institution_audit_logs','actor_membership_id'),('public','institution_audit_logs','after_state'),('public','institution_audit_logs','before_state'),('public','institution_audit_logs','institution_id'),('public','institution_audit_logs','metadata'),('public','institution_cohorts','ends_on'),('public','institution_cohorts','id'),('public','institution_cohorts','institution_id'),('public','institution_cohorts','sport_type'),('public','institution_cohorts','starts_on'),('public','institution_content_assignments','available_from'),('public','institution_content_assignments','content_id'),('public','institution_content_assignments','due_at'),('public','institution_content_assignments','group_id'),('public','institution_content_assignments','institution_id'),('public','institution_content_assignments','user_id'),('public','institution_contents','content_type'),('public','institution_contents','id'),('public','institution_contents','institution_id'),('public','institution_contents','metadata'),('public','institution_contents','valid_from'),('public','institution_contents','valid_until'),('public','institution_contents','version'),('public','institution_contents','visibility'),('public','institution_data_consents','data_category'),('public','institution_data_consents','institution_id'),('public','institution_data_consents','membership_id'),('public','institution_demo_sessions','expires_at'),('public','institution_demo_sessions','institution_id'),('public','institution_demo_sessions','metadata'),('public','institution_demo_sessions','started_at'),('public','institution_demo_sessions','status'),('public','institution_group_memberships','group_id'),('public','institution_group_memberships','group_role'),('public','institution_group_memberships','institution_id'),('public','institution_group_memberships','membership_id'),('public','institution_groups','cohort_id'),('public','institution_groups','ends_on'),('public','institution_groups','group_type'),('public','institution_groups','id'),('public','institution_groups','institution_id'),('public','institution_groups','metadata'),('public','institution_groups','starts_on'),('public','institution_members','institution_id'),('public','institution_membership_permission_overrides','institution_id'),('public','institution_membership_permission_overrides','membership_id'),('public','institution_membership_permission_overrides','permission_id'),('public','institution_membership_roles','institution_id'),('public','institution_membership_roles','membership_id'),('public','institution_membership_roles','role_id'),('public','institution_memberships','id'),('public','institution_memberships','institution_id'),('public','institution_memberships','metadata'),('public','institution_memberships','primary_sport'),('public','institution_memberships','status'),('public','institution_notification_campaigns','channels'),('public','institution_notification_campaigns','id'),('public','institution_notification_campaigns','institution_id'),('public','institution_notification_campaigns','priority'),('public','institution_notification_recipients','campaign_id'),('public','institution_notification_recipients','delivery_status'),('public','institution_notification_recipients','institution_id'),('public','institution_permissions','id'),('public','institution_role_permissions','institution_id'),('public','institution_role_permissions','permission_id'),('public','institution_role_permissions','role_id'),('public','institution_roles','id'),('public','institution_roles','institution_id'),('public','institution_subscriptions','ends_at'),('public','institution_subscriptions','institution_id'),('public','institution_subscriptions','plan_key'),('public','institution_subscriptions','seat_limit'),('public','institution_subscriptions','starts_at'),('public','institution_subscriptions','status'),('public','institutional_clips','institution_id'),('public','institutional_lead_activities','activity_type'),('public','institutional_lead_activities','lead_id'),('public','institutional_lead_activities','metadata'),('public','institutional_leads','converted_at'),('public','institutional_leads','converted_institution_id'),('public','institutional_leads','id'),('public','institutional_leads','instructor_count'),('public','institutional_leads','potential_plan'),('public','institutional_leads','referee_count'),('public','institutional_leads','status'),('public','institutions','assessment_settings'),('public','institutions','brand_color'),('public','institutions','enabled_sports'),('public','institutions','id'),('public','institutions','institution_type'),('public','institutions','license_end'),('public','institutions','license_limit'),('public','institutions','license_start'),('public','institutions','metrics_settings'),('public','institutions','plan_key'),('public','institutions','privacy_settings'),('public','institutions','seats_total'),('public','institutions','seats_used'),('public','institutions','status'),('public','match_context_snapshots','fixture_id'),('public','match_context_snapshots','payload'),('public','match_context_snapshots','snapshot_type'),('public','match_context_snapshots','source_type'),('public','match_context_snapshots','sport_type'),('public','match_officials','appointment_id'),('public','match_officials','fixture_id'),('public','match_officials','role_id'),('public','match_officials','source_type'),('public','match_officials','status'),('public','match_preparations','answers'),('public','match_preparations','appointment_id'),('public','match_preparations','checklist'),('public','match_preparations','sport_type'),('public','match_preparations','stage'),('public','match_preparations','status'),('public','notification_events','appointment_id'),('public','notification_events','fixture_id'),('public','notification_events','sport_type'),('public','notification_events','status'),('public','performance_checkins','appointment_id'),('public','performance_checkins','checkin_type'),('public','performance_checkins','duration_minutes'),('public','performance_checkins','emotional_score'),('public','performance_checkins','fatigue'),('public','performance_checkins','fixture_id'),('public','performance_checkins','id'),('public','performance_checkins','internal_load'),('public','performance_checkins','readiness_score'),('public','performance_checkins','rpe'),('public','performance_checkins','sleep_hours'),('public','performance_checkins','sport_type'),('public','performance_sessions','appointment_id'),('public','performance_sessions','checkin_id'),('public','performance_sessions','duration_minutes'),('public','performance_sessions','fatigue_post'),('public','performance_sessions','fixture_id'),('public','performance_sessions','internal_load'),('public','performance_sessions','rpe'),('public','performance_sessions','sport_type'),('public','physical_tests','sport_type'),('public','plan_capabilities','capability_key'),('public','plan_capabilities','plan_key'),('public','platform_audit_logs','after_state'),('public','platform_audit_logs','before_state'),('public','platform_audit_logs','metadata'),('public','platform_roles','role_key'),('public','post_match_reviews','appointment_id'),('public','post_match_reviews','fatigue_score'),('public','post_match_reviews','incidents'),('public','post_match_reviews','key_decisions'),('public','post_match_reviews','minutes_played'),('public','post_match_reviews','perceived_load'),('public','post_match_reviews','sport_type'),('public','psychology_checkins','activation_score'),('public','psychology_checkins','appointment_id'),('public','psychology_checkins','checkin_type'),('public','psychology_checkins','concentration_score'),('public','psychology_checkins','confidence_score'),('public','psychology_checkins','emotional_control_score'),('public','psychology_checkins','error_impact_score'),('public','psychology_checkins','feedback'),('public','psychology_checkins','fixture_id'),('public','psychology_checkins','incident_minute'),('public','psychology_checkins','mental_fatigue_score'),('public','psychology_checkins','mental_score'),('public','psychology_checkins','module_slug'),('public','psychology_checkins','pressure_score'),('public','psychology_checkins','process_orientation_score'),('public','psychology_checkins','recovery_score'),('public','psychology_checkins','responses'),('public','psychology_checkins','sport_type'),('public','psychology_exercise_sessions','after_score'),('public','psychology_exercise_sessions','appointment_id'),('public','psychology_exercise_sessions','before_score'),('public','psychology_exercise_sessions','clarity_score'),('public','psychology_exercise_sessions','exercise_type'),('public','psychology_exercise_sessions','feedback'),('public','psychology_exercise_sessions','fixture_id'),('public','psychology_exercise_sessions','module_slug'),('public','psychology_exercise_sessions','pressure_level'),('public','psychology_exercise_sessions','sport_type'),('public','psychology_modules','slug'),('public','psychology_wellbeing_assessments','burnout_risk_score'),('public','psychology_wellbeing_assessments','concentration_difficulty_score'),('public','psychology_wellbeing_assessments','cynicism_score'),('public','psychology_wellbeing_assessments','emotional_exhaustion_score'),('public','psychology_wellbeing_assessments','external_pressure_score'),('public','psychology_wellbeing_assessments','feedback'),('public','psychology_wellbeing_assessments','institutional_support_score'),('public','psychology_wellbeing_assessments','module_slug'),('public','psychology_wellbeing_assessments','motivation_score'),('public','psychology_wellbeing_assessments','recovery_quality_score'),('public','psychology_wellbeing_assessments','sleep_disruption_score'),('public','psychology_wellbeing_assessments','sport_type'),('public','psychology_wellbeing_assessments','violence_exposure_score'),('public','psychology_wellbeing_assessments','workload_score'),('public','readiness_scores','appointment_id'),('public','readiness_scores','checkin_id'),('public','readiness_scores','factors'),('public','readiness_scores','fixture_id'),('public','readiness_scores','score'),('public','readiness_scores','sport_type'),('public','referee_eligibility','association_id'),('public','referee_eligibility','category_id'),('public','referee_eligibility','competition_id'),('public','referee_eligibility','country_id'),('public','referee_eligibility','eligibility_mode'),('public','referee_eligibility','institution_id'),('public','referee_eligibility','role_id'),('public','referee_eligibility','source_type'),('public','referee_eligibility','sport_type'),('public','referee_roles','id'),('public','referee_roles','sport_type'),('public','rules_exam_results','correct_count'),('public','rules_exam_results','details'),('public','rules_exam_results','percentage'),('public','rules_exam_results','sport_type'),('public','rules_exam_results','topic_performance'),('public','rules_exam_results','total_questions'),('public','rules_exam_results','unanswered_count'),('public','teams','association_id'),('public','teams','country_id'),('public','teams','id'),('public','teams','source_type'),('public','teams','sport_type'),('public','user_global_roles','role_key'),('public','user_profiles','association_id'),('public','user_profiles','institution_id'),('public','user_profiles','preferred_sport_type'),('public','user_profiles','subscription_plan'),('public','user_roles','institution_id'),('public','user_roles','subscription_plan'),('public','user_subscriptions','ends_at'),('public','user_subscriptions','plan_key'),('public','user_subscriptions','starts_at'),('public','user_subscriptions','status'),('public','user_subscriptions','user_id'),('public','venues','association_id'),('public','venues','country_id'),('public','venues','id'),('public','venues','source_type'),('public','wellness_logs','appointment_id'),('public','wellness_logs','checkin_id'),('public','wellness_logs','emotional_score'),('public','wellness_logs','fatigue'),('public','wellness_logs','fixture_id'),('public','wellness_logs','sleep_hours'),('public','wellness_logs','sport_type')),
    actual as (
      select n.nspname,c.relname,a.attname from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where n.nspname='public' and c.relkind in ('r','p','v','m','f')
        and pg_catalog.has_column_privilege('reflab_pre_cutover_evidence_owner',c.oid,a.attnum,'SELECT')
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence effective column access drift' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name,column_name,privilege_type) as (
      values ('public','access_change_audit','new_data','SELECT'),('public','access_change_audit','old_data','SELECT'),('public','access_plans','audience','SELECT'),('public','access_plans','plan_key','SELECT'),('public','ai_usage_ledger','estimated_cost_usd','SELECT'),('public','ai_usage_ledger','input_tokens','SELECT'),('public','ai_usage_ledger','output_tokens','SELECT'),('public','ai_usage_ledger','run_id','SELECT'),('public','ai_usage_ledger','total_tokens','SELECT'),('public','appointment_history','appointment_id','SELECT'),('public','appointment_history','change_type','SELECT'),('public','appointment_history','snapshot','SELECT'),('public','appointments','association_id','SELECT'),('public','appointments','competition_id','SELECT'),('public','appointments','fixture_id','SELECT'),('public','appointments','id','SELECT'),('public','appointments','institution_id','SELECT'),('public','appointments','metadata','SELECT'),('public','appointments','replaced_by_appointment_id','SELECT'),('public','appointments','role_id','SELECT'),('public','appointments','source_type','SELECT'),('public','appointments','status','SELECT'),('public','associations','country_id','SELECT'),('public','associations','id','SELECT'),('public','associations','source_type','SELECT'),('public','attempts','clarity_score','SELECT'),('public','attempts','communication_score','SELECT'),('public','attempts','completed_rounds','SELECT'),('public','attempts','criterion_result','SELECT'),('public','attempts','english_score','SELECT'),('public','attempts','exam_result_id','SELECT'),('public','attempts','fatigue_level','SELECT'),('public','attempts','grammar_score','SELECT'),('public','attempts','institution_group_id','SELECT'),('public','attempts','institution_id','SELECT'),('public','attempts','justification_score','SELECT'),('public','attempts','mastered_concepts','SELECT'),('public','attempts','pending_concepts','SELECT'),('public','attempts','perceived_effort','SELECT'),('public','attempts','pronunciation_score','SELECT'),('public','attempts','protocol_score','SELECT'),('public','attempts','source_item_id','SELECT'),('public','attempts','source_item_type','SELECT'),('public','attempts','source_occurrence_id','SELECT'),('public','attempts','sport_type','SELECT'),('public','attempts','structure_score','SELECT'),('public','attempts','technical_accuracy_score','SELECT'),('public','attempts','terminology_score','SELECT'),('public','attempts','time_spent','SELECT'),('public','attempts','time_spent_seconds','SELECT'),('public','attempts','total_duration','SELECT'),('public','attempts','total_rounds','SELECT'),('public','attempts','vocabulary_score','SELECT'),('public','capabilities','capability_key','SELECT'),('public','capability_overrides','capability_key','SELECT'),('public','capability_overrides','effect','SELECT'),('public','capability_overrides','institution_id','SELECT'),('public','capability_overrides','scope_type','SELECT'),('public','capability_overrides','valid_from','SELECT'),('public','capability_overrides','valid_until','SELECT'),('public','clips','analysis_answers','SELECT'),('public','clips','correct_app_status','SELECT'),('public','clips','correct_clear_error','SELECT'),('public','clips','correct_var_decision','SELECT'),('public','clips','sport_type','SELECT'),('public','coach_data_consents','data_category','SELECT'),('public','coach_data_consents','granted','SELECT'),('public','coach_data_consents','granted_at','SELECT'),('public','coach_data_consents','purpose','SELECT'),('public','coach_data_consents','revoked_at','SELECT'),('public','coach_evidence','evidence_snapshot','SELECT'),('public','coach_evidence','evidence_type','SELECT'),('public','coach_evidence','run_id','SELECT'),('public','coach_evidence','sport_type','SELECT'),('public','coach_rate_limit_buckets','request_count','SELECT'),('public','coach_runs','confidence_label','SELECT'),('public','coach_runs','confidence_score','SELECT'),('public','coach_runs','evidence_count','SELECT'),('public','coach_runs','feature','SELECT'),('public','coach_runs','id','SELECT'),('public','coach_runs','input_tokens','SELECT'),('public','coach_runs','institution_id','SELECT'),('public','coach_runs','latency_ms','SELECT'),('public','coach_runs','output_tokens','SELECT'),('public','coach_runs','sport_type','SELECT'),('public','coach_runs','status','SELECT'),('public','coach_runs','total_tokens','SELECT'),('public','competition_categories','competition_id','SELECT'),('public','competition_categories','id','SELECT'),('public','competition_categories','season_id','SELECT'),('public','competition_categories','source_type','SELECT'),('public','competition_categories','sport_type','SELECT'),('public','competition_seasons','competition_id','SELECT'),('public','competition_seasons','end_date','SELECT'),('public','competition_seasons','id','SELECT'),('public','competition_seasons','source_type','SELECT'),('public','competition_seasons','start_date','SELECT'),('public','competition_seasons','status','SELECT'),('public','competitions','association_id','SELECT'),('public','competitions','competition_type','SELECT'),('public','competitions','id','SELECT'),('public','competitions','source_type','SELECT'),('public','competitions','sport_type','SELECT'),('public','countries','code','SELECT'),('public','countries','id','SELECT'),('public','exam_results','avg_score','SELECT'),('public','exam_results','correct_count','SELECT'),('public','exam_results','details','SELECT'),('public','exam_results','exam_session_id','SELECT'),('public','exam_results','id','SELECT'),('public','exam_results','institution_assessment_session_id','SELECT'),('public','exam_results','institution_group_id','SELECT'),('public','exam_results','institution_id','SELECT'),('public','exam_results','payload_hash','SELECT'),('public','exam_results','sport_type','SELECT'),('public','exam_results','total_questions','SELECT'),('public','exam_results','total_score','SELECT'),('public','fixture_sync_logs','competition_id','SELECT'),('public','fixture_sync_logs','competitions_upserted','SELECT'),('public','fixture_sync_logs','date_from','SELECT'),('public','fixture_sync_logs','date_to','SELECT'),('public','fixture_sync_logs','error_payload','SELECT'),('public','fixture_sync_logs','fixtures_upserted','SELECT'),('public','fixture_sync_logs','sport_type','SELECT'),('public','fixture_sync_logs','sync_status','SELECT'),('public','fixture_sync_logs','teams_upserted','SELECT'),('public','fixture_sync_logs','venues_upserted','SELECT'),('public','fixtures','association_id','SELECT'),('public','fixtures','away_team_id','SELECT'),('public','fixtures','category_id','SELECT'),('public','fixtures','competition_id','SELECT'),('public','fixtures','country_id','SELECT'),('public','fixtures','data_source','SELECT'),('public','fixtures','home_team_id','SELECT'),('public','fixtures','id','SELECT'),('public','fixtures','raw_source_reference','SELECT'),('public','fixtures','season_id','SELECT'),('public','fixtures','sport_type','SELECT'),('public','fixtures','status','SELECT'),('public','fixtures','venue_id','SELECT'),('public','ifab_library_documents','category','SELECT'),('public','ifab_library_documents','governing_body','SELECT'),('public','ifab_library_documents','source_official','SELECT'),('public','ifab_library_documents','sport_type','SELECT'),('public','ifab_library_documents','status','SELECT'),('public','institution_assessment_assignments','assessment_id','SELECT'),('public','institution_assessment_assignments','attempts_override','SELECT'),('public','institution_assessment_assignments','closes_at_override','SELECT'),('public','institution_assessment_assignments','group_id','SELECT'),('public','institution_assessment_assignments','id','SELECT'),('public','institution_assessment_assignments','institution_id','SELECT'),('public','institution_assessment_assignments','opens_at_override','SELECT'),('public','institution_assessment_assignments','user_id','SELECT'),('public','institution_assessment_feedback','action','SELECT'),('public','institution_assessment_feedback','institution_id','SELECT'),('public','institution_assessment_feedback','priority','SELECT'),('public','institution_assessment_feedback','session_id','SELECT'),('public','institution_assessment_history','assessment_id','SELECT'),('public','institution_assessment_history','institution_id','SELECT'),('public','institution_assessment_history','snapshot','SELECT'),('public','institution_assessment_items','assessment_id','SELECT'),('public','institution_assessment_items','institution_id','SELECT'),('public','institution_assessment_items','item_snapshot','SELECT'),('public','institution_assessment_items','item_type','SELECT'),('public','institution_assessment_items','points','SELECT'),('public','institution_assessment_sessions','assessment_id','SELECT'),('public','institution_assessment_sessions','assignment_id','SELECT'),('public','institution_assessment_sessions','attempt_number','SELECT'),('public','institution_assessment_sessions','group_id','SELECT'),('public','institution_assessment_sessions','id','SELECT'),('public','institution_assessment_sessions','institution_id','SELECT'),('public','institution_assessment_sessions','percentage','SELECT'),('public','institution_assessment_sessions','result_payload','SELECT'),('public','institution_assessment_sessions','status','SELECT'),('public','institution_assessment_sessions','time_spent_seconds','SELECT'),('public','institution_assessments','attempts_allowed','SELECT'),('public','institution_assessments','closes_at','SELECT'),('public','institution_assessments','duration_minutes','SELECT'),('public','institution_assessments','id','SELECT'),('public','institution_assessments','institution_id','SELECT'),('public','institution_assessments','minimum_score','SELECT'),('public','institution_assessments','modality','SELECT'),('public','institution_assessments','opens_at','SELECT'),('public','institution_assessments','question_count','SELECT'),('public','institution_assessments','settings','SELECT'),('public','institution_assessments','video_count','SELECT'),('public','institution_audit_logs','actor_membership_id','SELECT'),('public','institution_audit_logs','after_state','SELECT'),('public','institution_audit_logs','before_state','SELECT'),('public','institution_audit_logs','institution_id','SELECT'),('public','institution_audit_logs','metadata','SELECT'),('public','institution_cohorts','ends_on','SELECT'),('public','institution_cohorts','id','SELECT'),('public','institution_cohorts','institution_id','SELECT'),('public','institution_cohorts','sport_type','SELECT'),('public','institution_cohorts','starts_on','SELECT'),('public','institution_content_assignments','available_from','SELECT'),('public','institution_content_assignments','content_id','SELECT'),('public','institution_content_assignments','due_at','SELECT'),('public','institution_content_assignments','group_id','SELECT'),('public','institution_content_assignments','institution_id','SELECT'),('public','institution_content_assignments','user_id','SELECT'),('public','institution_contents','content_type','SELECT'),('public','institution_contents','id','SELECT'),('public','institution_contents','institution_id','SELECT'),('public','institution_contents','metadata','SELECT'),('public','institution_contents','valid_from','SELECT'),('public','institution_contents','valid_until','SELECT'),('public','institution_contents','version','SELECT'),('public','institution_contents','visibility','SELECT'),('public','institution_data_consents','data_category','SELECT'),('public','institution_data_consents','institution_id','SELECT'),('public','institution_data_consents','membership_id','SELECT'),('public','institution_demo_sessions','expires_at','SELECT'),('public','institution_demo_sessions','institution_id','SELECT'),('public','institution_demo_sessions','metadata','SELECT'),('public','institution_demo_sessions','started_at','SELECT'),('public','institution_demo_sessions','status','SELECT'),('public','institution_group_memberships','group_id','SELECT'),('public','institution_group_memberships','group_role','SELECT'),('public','institution_group_memberships','institution_id','SELECT'),('public','institution_group_memberships','membership_id','SELECT'),('public','institution_groups','cohort_id','SELECT'),('public','institution_groups','ends_on','SELECT'),('public','institution_groups','group_type','SELECT'),('public','institution_groups','id','SELECT'),('public','institution_groups','institution_id','SELECT'),('public','institution_groups','metadata','SELECT'),('public','institution_groups','starts_on','SELECT'),('public','institution_members','institution_id','SELECT'),('public','institution_membership_permission_overrides','institution_id','SELECT'),('public','institution_membership_permission_overrides','membership_id','SELECT'),('public','institution_membership_permission_overrides','permission_id','SELECT'),('public','institution_membership_roles','institution_id','SELECT'),('public','institution_membership_roles','membership_id','SELECT'),('public','institution_membership_roles','role_id','SELECT'),('public','institution_memberships','id','SELECT'),('public','institution_memberships','institution_id','SELECT'),('public','institution_memberships','metadata','SELECT'),('public','institution_memberships','primary_sport','SELECT'),('public','institution_memberships','status','SELECT'),('public','institution_notification_campaigns','channels','SELECT'),('public','institution_notification_campaigns','id','SELECT'),('public','institution_notification_campaigns','institution_id','SELECT'),('public','institution_notification_campaigns','priority','SELECT'),('public','institution_notification_recipients','campaign_id','SELECT'),('public','institution_notification_recipients','delivery_status','SELECT'),('public','institution_notification_recipients','institution_id','SELECT'),('public','institution_permissions','id','SELECT'),('public','institution_role_permissions','institution_id','SELECT'),('public','institution_role_permissions','permission_id','SELECT'),('public','institution_role_permissions','role_id','SELECT'),('public','institution_roles','id','SELECT'),('public','institution_roles','institution_id','SELECT'),('public','institution_subscriptions','ends_at','SELECT'),('public','institution_subscriptions','institution_id','SELECT'),('public','institution_subscriptions','plan_key','SELECT'),('public','institution_subscriptions','seat_limit','SELECT'),('public','institution_subscriptions','starts_at','SELECT'),('public','institution_subscriptions','status','SELECT'),('public','institutional_clips','institution_id','SELECT'),('public','institutional_lead_activities','activity_type','SELECT'),('public','institutional_lead_activities','lead_id','SELECT'),('public','institutional_lead_activities','metadata','SELECT'),('public','institutional_leads','converted_at','SELECT'),('public','institutional_leads','converted_institution_id','SELECT'),('public','institutional_leads','id','SELECT'),('public','institutional_leads','instructor_count','SELECT'),('public','institutional_leads','potential_plan','SELECT'),('public','institutional_leads','referee_count','SELECT'),('public','institutional_leads','status','SELECT'),('public','institutions','assessment_settings','SELECT'),('public','institutions','brand_color','SELECT'),('public','institutions','enabled_sports','SELECT'),('public','institutions','id','SELECT'),('public','institutions','institution_type','SELECT'),('public','institutions','license_end','SELECT'),('public','institutions','license_limit','SELECT'),('public','institutions','license_start','SELECT'),('public','institutions','metrics_settings','SELECT'),('public','institutions','plan_key','SELECT'),('public','institutions','privacy_settings','SELECT'),('public','institutions','seats_total','SELECT'),('public','institutions','seats_used','SELECT'),('public','institutions','status','SELECT'),('public','match_context_snapshots','fixture_id','SELECT'),('public','match_context_snapshots','payload','SELECT'),('public','match_context_snapshots','snapshot_type','SELECT'),('public','match_context_snapshots','source_type','SELECT'),('public','match_context_snapshots','sport_type','SELECT'),('public','match_officials','appointment_id','SELECT'),('public','match_officials','fixture_id','SELECT'),('public','match_officials','role_id','SELECT'),('public','match_officials','source_type','SELECT'),('public','match_officials','status','SELECT'),('public','match_preparations','answers','SELECT'),('public','match_preparations','appointment_id','SELECT'),('public','match_preparations','checklist','SELECT'),('public','match_preparations','sport_type','SELECT'),('public','match_preparations','stage','SELECT'),('public','match_preparations','status','SELECT'),('public','notification_events','appointment_id','SELECT'),('public','notification_events','fixture_id','SELECT'),('public','notification_events','sport_type','SELECT'),('public','notification_events','status','SELECT'),('public','performance_checkins','appointment_id','SELECT'),('public','performance_checkins','checkin_type','SELECT'),('public','performance_checkins','duration_minutes','SELECT'),('public','performance_checkins','emotional_score','SELECT'),('public','performance_checkins','fatigue','SELECT'),('public','performance_checkins','fixture_id','SELECT'),('public','performance_checkins','id','SELECT'),('public','performance_checkins','internal_load','SELECT'),('public','performance_checkins','readiness_score','SELECT'),('public','performance_checkins','rpe','SELECT'),('public','performance_checkins','sleep_hours','SELECT'),('public','performance_checkins','sport_type','SELECT'),('public','performance_sessions','appointment_id','SELECT'),('public','performance_sessions','checkin_id','SELECT'),('public','performance_sessions','duration_minutes','SELECT'),('public','performance_sessions','fatigue_post','SELECT'),('public','performance_sessions','fixture_id','SELECT'),('public','performance_sessions','internal_load','SELECT'),('public','performance_sessions','rpe','SELECT'),('public','performance_sessions','sport_type','SELECT'),('public','physical_tests','sport_type','SELECT'),('public','plan_capabilities','capability_key','SELECT'),('public','plan_capabilities','plan_key','SELECT'),('public','platform_audit_logs','after_state','SELECT'),('public','platform_audit_logs','before_state','SELECT'),('public','platform_audit_logs','metadata','SELECT'),('public','platform_roles','role_key','SELECT'),('public','post_match_reviews','appointment_id','SELECT'),('public','post_match_reviews','fatigue_score','SELECT'),('public','post_match_reviews','incidents','SELECT'),('public','post_match_reviews','key_decisions','SELECT'),('public','post_match_reviews','minutes_played','SELECT'),('public','post_match_reviews','perceived_load','SELECT'),('public','post_match_reviews','sport_type','SELECT'),('public','psychology_checkins','activation_score','SELECT'),('public','psychology_checkins','appointment_id','SELECT'),('public','psychology_checkins','checkin_type','SELECT'),('public','psychology_checkins','concentration_score','SELECT'),('public','psychology_checkins','confidence_score','SELECT'),('public','psychology_checkins','emotional_control_score','SELECT'),('public','psychology_checkins','error_impact_score','SELECT'),('public','psychology_checkins','feedback','SELECT'),('public','psychology_checkins','fixture_id','SELECT'),('public','psychology_checkins','incident_minute','SELECT'),('public','psychology_checkins','mental_fatigue_score','SELECT'),('public','psychology_checkins','mental_score','SELECT'),('public','psychology_checkins','module_slug','SELECT'),('public','psychology_checkins','pressure_score','SELECT'),('public','psychology_checkins','process_orientation_score','SELECT'),('public','psychology_checkins','recovery_score','SELECT'),('public','psychology_checkins','responses','SELECT'),('public','psychology_checkins','sport_type','SELECT'),('public','psychology_exercise_sessions','after_score','SELECT'),('public','psychology_exercise_sessions','appointment_id','SELECT'),('public','psychology_exercise_sessions','before_score','SELECT'),('public','psychology_exercise_sessions','clarity_score','SELECT'),('public','psychology_exercise_sessions','exercise_type','SELECT'),('public','psychology_exercise_sessions','feedback','SELECT'),('public','psychology_exercise_sessions','fixture_id','SELECT'),('public','psychology_exercise_sessions','module_slug','SELECT'),('public','psychology_exercise_sessions','pressure_level','SELECT'),('public','psychology_exercise_sessions','sport_type','SELECT'),('public','psychology_modules','slug','SELECT'),('public','psychology_wellbeing_assessments','burnout_risk_score','SELECT'),('public','psychology_wellbeing_assessments','concentration_difficulty_score','SELECT'),('public','psychology_wellbeing_assessments','cynicism_score','SELECT'),('public','psychology_wellbeing_assessments','emotional_exhaustion_score','SELECT'),('public','psychology_wellbeing_assessments','external_pressure_score','SELECT'),('public','psychology_wellbeing_assessments','feedback','SELECT'),('public','psychology_wellbeing_assessments','institutional_support_score','SELECT'),('public','psychology_wellbeing_assessments','module_slug','SELECT'),('public','psychology_wellbeing_assessments','motivation_score','SELECT'),('public','psychology_wellbeing_assessments','recovery_quality_score','SELECT'),('public','psychology_wellbeing_assessments','sleep_disruption_score','SELECT'),('public','psychology_wellbeing_assessments','sport_type','SELECT'),('public','psychology_wellbeing_assessments','violence_exposure_score','SELECT'),('public','psychology_wellbeing_assessments','workload_score','SELECT'),('public','readiness_scores','appointment_id','SELECT'),('public','readiness_scores','checkin_id','SELECT'),('public','readiness_scores','factors','SELECT'),('public','readiness_scores','fixture_id','SELECT'),('public','readiness_scores','score','SELECT'),('public','readiness_scores','sport_type','SELECT'),('public','referee_eligibility','association_id','SELECT'),('public','referee_eligibility','category_id','SELECT'),('public','referee_eligibility','competition_id','SELECT'),('public','referee_eligibility','country_id','SELECT'),('public','referee_eligibility','eligibility_mode','SELECT'),('public','referee_eligibility','institution_id','SELECT'),('public','referee_eligibility','role_id','SELECT'),('public','referee_eligibility','source_type','SELECT'),('public','referee_eligibility','sport_type','SELECT'),('public','referee_roles','id','SELECT'),('public','referee_roles','sport_type','SELECT'),('public','rules_exam_results','correct_count','SELECT'),('public','rules_exam_results','details','SELECT'),('public','rules_exam_results','percentage','SELECT'),('public','rules_exam_results','sport_type','SELECT'),('public','rules_exam_results','topic_performance','SELECT'),('public','rules_exam_results','total_questions','SELECT'),('public','rules_exam_results','unanswered_count','SELECT'),('public','teams','association_id','SELECT'),('public','teams','country_id','SELECT'),('public','teams','id','SELECT'),('public','teams','source_type','SELECT'),('public','teams','sport_type','SELECT'),('public','user_global_roles','role_key','SELECT'),('public','user_profiles','association_id','SELECT'),('public','user_profiles','institution_id','SELECT'),('public','user_profiles','preferred_sport_type','SELECT'),('public','user_profiles','subscription_plan','SELECT'),('public','user_roles','institution_id','SELECT'),('public','user_roles','subscription_plan','SELECT'),('public','user_subscriptions','ends_at','SELECT'),('public','user_subscriptions','plan_key','SELECT'),('public','user_subscriptions','starts_at','SELECT'),('public','user_subscriptions','status','SELECT'),('public','user_subscriptions','user_id','SELECT'),('public','venues','association_id','SELECT'),('public','venues','country_id','SELECT'),('public','venues','id','SELECT'),('public','venues','source_type','SELECT'),('public','wellness_logs','appointment_id','SELECT'),('public','wellness_logs','checkin_id','SELECT'),('public','wellness_logs','emotional_score','SELECT'),('public','wellness_logs','fatigue','SELECT'),('public','wellness_logs','fixture_id','SELECT'),('public','wellness_logs','sleep_hours','SELECT'),('public','wellness_logs','sport_type','SELECT')),
    actual as (
      select n.nspname,c.relname,a.attname,acl.privilege_type from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where acl.grantee=pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence direct column ACL drift' using errcode='55000';
  end if;
  if exists(with expected(schema_name,privilege_type) as (values ('public','USAGE'),('reflab_audit','USAGE')),
    actual as (
      select n.nspname,acl.privilege_type from pg_catalog.pg_namespace n
      cross join lateral pg_catalog.aclexplode(n.nspacl) acl
      where acl.grantee=pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence schema ACL drift' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from (values ('public','access_change_audit'),('public','access_plans'),('public','ai_usage_ledger'),('public','appointment_history'),('public','appointments'),('public','associations'),('public','attempts'),('public','capabilities'),('public','capability_overrides'),('public','clips'),('public','coach_data_consents'),('public','coach_evidence'),('public','coach_rate_limit_buckets'),('public','coach_runs'),('public','competition_categories'),('public','competition_seasons'),('public','competitions'),('public','countries'),('public','exam_results'),('public','fixture_sync_logs'),('public','fixtures'),('public','ifab_library_documents'),('public','institution_assessment_assignments'),('public','institution_assessment_feedback'),('public','institution_assessment_history'),('public','institution_assessment_items'),('public','institution_assessment_sessions'),('public','institution_assessments'),('public','institution_audit_logs'),('public','institution_cohorts'),('public','institution_content_assignments'),('public','institution_contents'),('public','institution_data_consents'),('public','institution_demo_sessions'),('public','institution_group_memberships'),('public','institution_groups'),('public','institution_members'),('public','institution_membership_permission_overrides'),('public','institution_membership_roles'),('public','institution_memberships'),('public','institution_notification_campaigns'),('public','institution_notification_recipients'),('public','institution_permissions'),('public','institution_role_permissions'),('public','institution_roles'),('public','institution_subscriptions'),('public','institutional_clips'),('public','institutional_lead_activities'),('public','institutional_leads'),('public','institutions'),('public','match_context_snapshots'),('public','match_officials'),('public','match_preparations'),('public','notification_events'),('public','performance_checkins'),('public','performance_sessions'),('public','physical_tests'),('public','plan_capabilities'),('public','platform_audit_logs'),('public','platform_roles'),('public','post_match_reviews'),('public','psychology_checkins'),('public','psychology_exercise_sessions'),('public','psychology_modules'),('public','psychology_wellbeing_assessments'),('public','readiness_scores'),('public','referee_eligibility'),('public','referee_roles'),('public','rules_exam_results'),('public','teams'),('public','user_global_roles'),('public','user_profiles'),('public','user_roles'),('public','user_subscriptions'),('public','venues'),('public','wellness_logs')) expected(schema_name,table_name)
      join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name))
      join pg_catalog.pg_policy p on p.polrelid=c.oid
      where p.polname='reflab_pre_cutover_evidence_owner_read' and p.polcmd='r' and p.polpermissive
        and p.polroles=array[pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')::oid]
        and pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) in ('true','(true)') and p.polwithcheck is null)<>76
     or exists(select 1 from pg_catalog.pg_policy p
       where pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')::oid=any(p.polroles)
         and not (p.polname='reflab_pre_cutover_evidence_owner_read'
           and exists(select 1 from (values ('public','access_change_audit'),('public','access_plans'),('public','ai_usage_ledger'),('public','appointment_history'),('public','appointments'),('public','associations'),('public','attempts'),('public','capabilities'),('public','capability_overrides'),('public','clips'),('public','coach_data_consents'),('public','coach_evidence'),('public','coach_rate_limit_buckets'),('public','coach_runs'),('public','competition_categories'),('public','competition_seasons'),('public','competitions'),('public','countries'),('public','exam_results'),('public','fixture_sync_logs'),('public','fixtures'),('public','ifab_library_documents'),('public','institution_assessment_assignments'),('public','institution_assessment_feedback'),('public','institution_assessment_history'),('public','institution_assessment_items'),('public','institution_assessment_sessions'),('public','institution_assessments'),('public','institution_audit_logs'),('public','institution_cohorts'),('public','institution_content_assignments'),('public','institution_contents'),('public','institution_data_consents'),('public','institution_demo_sessions'),('public','institution_group_memberships'),('public','institution_groups'),('public','institution_members'),('public','institution_membership_permission_overrides'),('public','institution_membership_roles'),('public','institution_memberships'),('public','institution_notification_campaigns'),('public','institution_notification_recipients'),('public','institution_permissions'),('public','institution_role_permissions'),('public','institution_roles'),('public','institution_subscriptions'),('public','institutional_clips'),('public','institutional_lead_activities'),('public','institutional_leads'),('public','institutions'),('public','match_context_snapshots'),('public','match_officials'),('public','match_preparations'),('public','notification_events'),('public','performance_checkins'),('public','performance_sessions'),('public','physical_tests'),('public','plan_capabilities'),('public','platform_audit_logs'),('public','platform_roles'),('public','post_match_reviews'),('public','psychology_checkins'),('public','psychology_exercise_sessions'),('public','psychology_modules'),('public','psychology_wellbeing_assessments'),('public','readiness_scores'),('public','referee_eligibility'),('public','referee_roles'),('public','rules_exam_results'),('public','teams'),('public','user_global_roles'),('public','user_profiles'),('public','user_roles'),('public','user_subscriptions'),('public','venues'),('public','wellness_logs')) expected(schema_name,table_name)
             where p.polrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name)))
           and p.polcmd='r' and p.polpermissive
           and p.polroles=array[pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner')::oid]
           and pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) in ('true','(true)') and p.polwithcheck is null)) then
    raise exception 'Pre-cutover evidence RLS policy drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_depend dependency
    where dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
      and dependency.refobjid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()')) then
    raise exception 'Unexpected dependency blocks pre-cutover evidence teardown' using errcode='55000';
  end if;
end $preconditions$;

revoke execute on function reflab_audit.pre_cutover_evidence_snapshot_v1() from reflab_prod_preflight_ro;
drop function reflab_audit.pre_cutover_evidence_snapshot_v1();
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."access_change_audit";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."access_plans";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."ai_usage_ledger";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."appointment_history";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."appointments";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."associations";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."attempts";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."capabilities";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."capability_overrides";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."clips";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_data_consents";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_evidence";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_rate_limit_buckets";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_runs";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."competition_categories";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."competition_seasons";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."competitions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."countries";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."exam_results";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."fixture_sync_logs";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."fixtures";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."ifab_library_documents";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_assignments";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_feedback";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_history";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_items";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_sessions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessments";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_audit_logs";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_cohorts";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_content_assignments";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_contents";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_data_consents";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_demo_sessions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_group_memberships";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_groups";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_members";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_membership_permission_overrides";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_membership_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_memberships";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_notification_campaigns";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_notification_recipients";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_permissions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_role_permissions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_subscriptions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_clips";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_lead_activities";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_leads";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_context_snapshots";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_officials";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_preparations";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."notification_events";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."performance_checkins";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."performance_sessions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."physical_tests";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."plan_capabilities";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."platform_audit_logs";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."platform_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."post_match_reviews";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_checkins";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_exercise_sessions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_modules";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_wellbeing_assessments";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."readiness_scores";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."referee_eligibility";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."referee_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."rules_exam_results";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."teams";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_global_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_profiles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_roles";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_subscriptions";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."venues";
drop policy "reflab_pre_cutover_evidence_owner_read" on "public"."wellness_logs";
revoke select ("new_data", "old_data") on "public"."access_change_audit" from "reflab_pre_cutover_evidence_owner";
revoke select ("audience", "plan_key") on "public"."access_plans" from "reflab_pre_cutover_evidence_owner";
revoke select ("estimated_cost_usd", "input_tokens", "output_tokens", "run_id", "total_tokens") on "public"."ai_usage_ledger" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "change_type", "snapshot") on "public"."appointment_history" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "competition_id", "fixture_id", "id", "institution_id", "metadata", "replaced_by_appointment_id", "role_id", "source_type", "status") on "public"."appointments" from "reflab_pre_cutover_evidence_owner";
revoke select ("country_id", "id", "source_type") on "public"."associations" from "reflab_pre_cutover_evidence_owner";
revoke select ("clarity_score", "communication_score", "completed_rounds", "criterion_result", "english_score", "exam_result_id", "fatigue_level", "grammar_score", "institution_group_id", "institution_id", "justification_score", "mastered_concepts", "pending_concepts", "perceived_effort", "pronunciation_score", "protocol_score", "source_item_id", "source_item_type", "source_occurrence_id", "sport_type", "structure_score", "technical_accuracy_score", "terminology_score", "time_spent", "time_spent_seconds", "total_duration", "total_rounds", "vocabulary_score") on "public"."attempts" from "reflab_pre_cutover_evidence_owner";
revoke select ("capability_key") on "public"."capabilities" from "reflab_pre_cutover_evidence_owner";
revoke select ("capability_key", "effect", "institution_id", "scope_type", "valid_from", "valid_until") on "public"."capability_overrides" from "reflab_pre_cutover_evidence_owner";
revoke select ("analysis_answers", "correct_app_status", "correct_clear_error", "correct_var_decision", "sport_type") on "public"."clips" from "reflab_pre_cutover_evidence_owner";
revoke select ("data_category", "granted", "granted_at", "purpose", "revoked_at") on "public"."coach_data_consents" from "reflab_pre_cutover_evidence_owner";
revoke select ("evidence_snapshot", "evidence_type", "run_id", "sport_type") on "public"."coach_evidence" from "reflab_pre_cutover_evidence_owner";
revoke select ("request_count") on "public"."coach_rate_limit_buckets" from "reflab_pre_cutover_evidence_owner";
revoke select ("confidence_label", "confidence_score", "evidence_count", "feature", "id", "input_tokens", "institution_id", "latency_ms", "output_tokens", "sport_type", "status", "total_tokens") on "public"."coach_runs" from "reflab_pre_cutover_evidence_owner";
revoke select ("competition_id", "id", "season_id", "source_type", "sport_type") on "public"."competition_categories" from "reflab_pre_cutover_evidence_owner";
revoke select ("competition_id", "end_date", "id", "source_type", "start_date", "status") on "public"."competition_seasons" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "competition_type", "id", "source_type", "sport_type") on "public"."competitions" from "reflab_pre_cutover_evidence_owner";
revoke select ("code", "id") on "public"."countries" from "reflab_pre_cutover_evidence_owner";
revoke select ("avg_score", "correct_count", "details", "exam_session_id", "id", "institution_assessment_session_id", "institution_group_id", "institution_id", "payload_hash", "sport_type", "total_questions", "total_score") on "public"."exam_results" from "reflab_pre_cutover_evidence_owner";
revoke select ("competition_id", "competitions_upserted", "date_from", "date_to", "error_payload", "fixtures_upserted", "sport_type", "sync_status", "teams_upserted", "venues_upserted") on "public"."fixture_sync_logs" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "away_team_id", "category_id", "competition_id", "country_id", "data_source", "home_team_id", "id", "raw_source_reference", "season_id", "sport_type", "status", "venue_id") on "public"."fixtures" from "reflab_pre_cutover_evidence_owner";
revoke select ("category", "governing_body", "source_official", "sport_type", "status") on "public"."ifab_library_documents" from "reflab_pre_cutover_evidence_owner";
revoke select ("assessment_id", "attempts_override", "closes_at_override", "group_id", "id", "institution_id", "opens_at_override", "user_id") on "public"."institution_assessment_assignments" from "reflab_pre_cutover_evidence_owner";
revoke select ("action", "institution_id", "priority", "session_id") on "public"."institution_assessment_feedback" from "reflab_pre_cutover_evidence_owner";
revoke select ("assessment_id", "institution_id", "snapshot") on "public"."institution_assessment_history" from "reflab_pre_cutover_evidence_owner";
revoke select ("assessment_id", "institution_id", "item_snapshot", "item_type", "points") on "public"."institution_assessment_items" from "reflab_pre_cutover_evidence_owner";
revoke select ("assessment_id", "assignment_id", "attempt_number", "group_id", "id", "institution_id", "percentage", "result_payload", "status", "time_spent_seconds") on "public"."institution_assessment_sessions" from "reflab_pre_cutover_evidence_owner";
revoke select ("attempts_allowed", "closes_at", "duration_minutes", "id", "institution_id", "minimum_score", "modality", "opens_at", "question_count", "settings", "video_count") on "public"."institution_assessments" from "reflab_pre_cutover_evidence_owner";
revoke select ("actor_membership_id", "after_state", "before_state", "institution_id", "metadata") on "public"."institution_audit_logs" from "reflab_pre_cutover_evidence_owner";
revoke select ("ends_on", "id", "institution_id", "sport_type", "starts_on") on "public"."institution_cohorts" from "reflab_pre_cutover_evidence_owner";
revoke select ("available_from", "content_id", "due_at", "group_id", "institution_id", "user_id") on "public"."institution_content_assignments" from "reflab_pre_cutover_evidence_owner";
revoke select ("content_type", "id", "institution_id", "metadata", "valid_from", "valid_until", "version", "visibility") on "public"."institution_contents" from "reflab_pre_cutover_evidence_owner";
revoke select ("data_category", "institution_id", "membership_id") on "public"."institution_data_consents" from "reflab_pre_cutover_evidence_owner";
revoke select ("expires_at", "institution_id", "metadata", "started_at", "status") on "public"."institution_demo_sessions" from "reflab_pre_cutover_evidence_owner";
revoke select ("group_id", "group_role", "institution_id", "membership_id") on "public"."institution_group_memberships" from "reflab_pre_cutover_evidence_owner";
revoke select ("cohort_id", "ends_on", "group_type", "id", "institution_id", "metadata", "starts_on") on "public"."institution_groups" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id") on "public"."institution_members" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id", "membership_id", "permission_id") on "public"."institution_membership_permission_overrides" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id", "membership_id", "role_id") on "public"."institution_membership_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("id", "institution_id", "metadata", "primary_sport", "status") on "public"."institution_memberships" from "reflab_pre_cutover_evidence_owner";
revoke select ("channels", "id", "institution_id", "priority") on "public"."institution_notification_campaigns" from "reflab_pre_cutover_evidence_owner";
revoke select ("campaign_id", "delivery_status", "institution_id") on "public"."institution_notification_recipients" from "reflab_pre_cutover_evidence_owner";
revoke select ("id") on "public"."institution_permissions" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id", "permission_id", "role_id") on "public"."institution_role_permissions" from "reflab_pre_cutover_evidence_owner";
revoke select ("id", "institution_id") on "public"."institution_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("ends_at", "institution_id", "plan_key", "seat_limit", "starts_at", "status") on "public"."institution_subscriptions" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id") on "public"."institutional_clips" from "reflab_pre_cutover_evidence_owner";
revoke select ("activity_type", "lead_id", "metadata") on "public"."institutional_lead_activities" from "reflab_pre_cutover_evidence_owner";
revoke select ("converted_at", "converted_institution_id", "id", "instructor_count", "potential_plan", "referee_count", "status") on "public"."institutional_leads" from "reflab_pre_cutover_evidence_owner";
revoke select ("assessment_settings", "brand_color", "enabled_sports", "id", "institution_type", "license_end", "license_limit", "license_start", "metrics_settings", "plan_key", "privacy_settings", "seats_total", "seats_used", "status") on "public"."institutions" from "reflab_pre_cutover_evidence_owner";
revoke select ("fixture_id", "payload", "snapshot_type", "source_type", "sport_type") on "public"."match_context_snapshots" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "fixture_id", "role_id", "source_type", "status") on "public"."match_officials" from "reflab_pre_cutover_evidence_owner";
revoke select ("answers", "appointment_id", "checklist", "sport_type", "stage", "status") on "public"."match_preparations" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "fixture_id", "sport_type", "status") on "public"."notification_events" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "checkin_type", "duration_minutes", "emotional_score", "fatigue", "fixture_id", "id", "internal_load", "readiness_score", "rpe", "sleep_hours", "sport_type") on "public"."performance_checkins" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "checkin_id", "duration_minutes", "fatigue_post", "fixture_id", "internal_load", "rpe", "sport_type") on "public"."performance_sessions" from "reflab_pre_cutover_evidence_owner";
revoke select ("sport_type") on "public"."physical_tests" from "reflab_pre_cutover_evidence_owner";
revoke select ("capability_key", "plan_key") on "public"."plan_capabilities" from "reflab_pre_cutover_evidence_owner";
revoke select ("after_state", "before_state", "metadata") on "public"."platform_audit_logs" from "reflab_pre_cutover_evidence_owner";
revoke select ("role_key") on "public"."platform_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "fatigue_score", "incidents", "key_decisions", "minutes_played", "perceived_load", "sport_type") on "public"."post_match_reviews" from "reflab_pre_cutover_evidence_owner";
revoke select ("activation_score", "appointment_id", "checkin_type", "concentration_score", "confidence_score", "emotional_control_score", "error_impact_score", "feedback", "fixture_id", "incident_minute", "mental_fatigue_score", "mental_score", "module_slug", "pressure_score", "process_orientation_score", "recovery_score", "responses", "sport_type") on "public"."psychology_checkins" from "reflab_pre_cutover_evidence_owner";
revoke select ("after_score", "appointment_id", "before_score", "clarity_score", "exercise_type", "feedback", "fixture_id", "module_slug", "pressure_level", "sport_type") on "public"."psychology_exercise_sessions" from "reflab_pre_cutover_evidence_owner";
revoke select ("slug") on "public"."psychology_modules" from "reflab_pre_cutover_evidence_owner";
revoke select ("burnout_risk_score", "concentration_difficulty_score", "cynicism_score", "emotional_exhaustion_score", "external_pressure_score", "feedback", "institutional_support_score", "module_slug", "motivation_score", "recovery_quality_score", "sleep_disruption_score", "sport_type", "violence_exposure_score", "workload_score") on "public"."psychology_wellbeing_assessments" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "checkin_id", "factors", "fixture_id", "score", "sport_type") on "public"."readiness_scores" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "category_id", "competition_id", "country_id", "eligibility_mode", "institution_id", "role_id", "source_type", "sport_type") on "public"."referee_eligibility" from "reflab_pre_cutover_evidence_owner";
revoke select ("id", "sport_type") on "public"."referee_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("correct_count", "details", "percentage", "sport_type", "topic_performance", "total_questions", "unanswered_count") on "public"."rules_exam_results" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "country_id", "id", "source_type", "sport_type") on "public"."teams" from "reflab_pre_cutover_evidence_owner";
revoke select ("role_key") on "public"."user_global_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "institution_id", "preferred_sport_type", "subscription_plan") on "public"."user_profiles" from "reflab_pre_cutover_evidence_owner";
revoke select ("institution_id", "subscription_plan") on "public"."user_roles" from "reflab_pre_cutover_evidence_owner";
revoke select ("ends_at", "plan_key", "starts_at", "status", "user_id") on "public"."user_subscriptions" from "reflab_pre_cutover_evidence_owner";
revoke select ("association_id", "country_id", "id", "source_type") on "public"."venues" from "reflab_pre_cutover_evidence_owner";
revoke select ("appointment_id", "checkin_id", "emotional_score", "fatigue", "fixture_id", "sleep_hours", "sport_type") on "public"."wellness_logs" from "reflab_pre_cutover_evidence_owner";
revoke usage on schema public, reflab_audit from "reflab_pre_cutover_evidence_owner";

do $residual_dependencies$
declare owner_oid oid;
begin
  select oid into owner_oid from pg_catalog.pg_roles where rolname='reflab_pre_cutover_evidence_owner';
  if not found or exists(select 1 from pg_catalog.pg_shdepend dependency
    where dependency.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass and dependency.refobjid=owner_oid) then
    raise exception 'Residual dependency blocks pre-cutover evidence owner teardown' using errcode='55000';
  end if;
end $residual_dependencies$;

drop role "reflab_pre_cutover_evidence_owner";

do $postconditions$
begin
  if pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null
     or exists(select 1 from pg_catalog.pg_roles where rolname='reflab_pre_cutover_evidence_owner')
     or exists(select 1 from pg_catalog.pg_policy where polname='reflab_pre_cutover_evidence_owner_read') then
    raise exception 'Pre-cutover evidence teardown is incomplete' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')='select pg_catalog.jsonb_build_object(
    ''attempt_semantics'', (
      select pg_catalog.jsonb_build_object(
        ''training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null),
        ''official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null),
        ''official_orphans'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and exam_result.id is null),
        ''official_owner_mismatches'', pg_catalog.count(attempt_row.id) filter (where exam_result.id is not null and exam_result.user_id <> attempt_row.user_id),
        ''invalid_communication_feedback'', pg_catalog.count(attempt_row.id) filter (
          where attempt_row.source_item_type = ''communication_feedback''
            and (attempt_row.exam_result_id is not null or attempt_row.score is not null)
        )
      )
      from public.attempts attempt_row
      left join public.exam_results exam_result on exam_result.id = attempt_row.exam_result_id
    ),
    ''scoring_versions'', (
      select pg_catalog.jsonb_build_object(
        ''legacy_unversioned_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is null),
        ''legacy_unversioned_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is null),
        ''field_applicable_v2_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and attempt_row.criterion_result->>''scoring_version'' = ''field_applicable_v2''),
        ''field_applicable_v2_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and attempt_row.criterion_result->>''scoring_version'' = ''field_applicable_v2''),
        ''unknown_training'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is not null and attempt_row.criterion_result->>''scoring_version'' <> ''field_applicable_v2''),
        ''unknown_official'', pg_catalog.count(attempt_row.id) filter (where attempt_row.exam_result_id is not null and nullif(attempt_row.criterion_result->>''scoring_version'', '''') is not null and attempt_row.criterion_result->>''scoring_version'' <> ''field_applicable_v2'')
      ) from public.attempts attempt_row
    ),
    ''exam_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''results_without_session'', pg_catalog.count(exam_result.id) filter (where exam_session.id is null),
        ''session_owner_mismatches'', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.user_id <> exam_result.user_id),
        ''session_submission_mismatches'', pg_catalog.count(exam_result.id) filter (where exam_session.id is not null and exam_session.submission_id <> exam_result.submission_id)
      )
      from public.exam_results exam_result
      left join public.referee_exam_sessions exam_session on exam_session.id = exam_result.exam_session_id
    ),
    ''legacy_access'', pg_catalog.jsonb_build_object(
      ''user_roles'', (select pg_catalog.count(user_id) from public.user_roles),
      ''automatic_default_global_roles'', (select pg_catalog.count(user_id) from public.user_global_roles where source = ''automatic_default''),
      ''automatic_default_subscriptions'', (select pg_catalog.count(user_id) from public.user_subscriptions where source = ''automatic_default''),
      ''unknown_global_roles'', (select pg_catalog.count(user_id) from public.user_global_roles where role_key not in (''super_admin'', ''referee''))
    ),
    ''institution_catalog'', pg_catalog.jsonb_build_object(
      ''permissions'', (select pg_catalog.count(permission_key) from public.institution_permissions),
      ''system_roles'', (select pg_catalog.count(id) from public.institution_roles where institution_id is null),
      ''system_relations'', (select pg_catalog.count(relation.role_id) from public.institution_role_permissions relation join public.institution_roles role on role.id = relation.role_id where role.institution_id is null),
      ''forbidden_roles'', (select pg_catalog.count(id) from public.institution_roles where role_key in (''physical_trainer'', ''institution_psychologist'', ''super_admin'', ''video_admin'', ''institutional_instructor'', ''institutional_student'', ''individual_referee''))
    ),
    ''institution_tenant_integrity'', pg_catalog.jsonb_build_object(
      ''membership_role_mismatches'', (select pg_catalog.count(role_link.membership_id) from public.institution_membership_roles role_link join public.institution_memberships membership on membership.id = role_link.membership_id where role_link.institution_id <> membership.institution_id),
      ''group_membership_mismatches'', (select pg_catalog.count(group_link.membership_id) from public.institution_group_memberships group_link join public.institution_groups group_row on group_row.id = group_link.group_id join public.institution_memberships membership on membership.id = group_link.membership_id where group_link.institution_id <> group_row.institution_id or group_link.institution_id <> membership.institution_id),
      ''permission_override_mismatches'', (select pg_catalog.count(override_row.membership_id) from public.institution_membership_permission_overrides override_row join public.institution_memberships membership on membership.id = override_row.membership_id where override_row.institution_id <> membership.institution_id)
    ),
    ''matches_tenant_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''institutional_appointments_without_active_membership'', pg_catalog.count(appointment.id)
      )
      from public.appointments appointment
      left join public.institution_memberships membership
        on membership.institution_id = appointment.institution_id
       and membership.user_id = appointment.user_id
       and membership.status = ''active''
      where appointment.institution_id is not null and membership.id is null
    ),
    ''fixture_creator_identity'', (
      select pg_catalog.jsonb_build_object(
        ''creator_refs'', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>''created_by'', '''') is not null),
        ''user_subject_refs'', pg_catalog.count(fixture.id) filter (where fixture.raw_source_reference->>''created_by'' like ''user\_%'' escape ''\''),
        ''profile_backed_refs'', pg_catalog.count(fixture.id) filter (where profile.user_id is not null),
        ''unresolved_profile_refs'', pg_catalog.count(fixture.id) filter (where nullif(fixture.raw_source_reference->>''created_by'', '''') is not null and profile.user_id is null)
      )
      from public.fixtures fixture
      left join public.user_profiles profile on profile.user_id = fixture.raw_source_reference->>''created_by''
    ),
    ''notification_integrity'', pg_catalog.jsonb_build_object(
      ''token_owner_conflicts'', coalesce((select pg_catalog.count(token) from (select token from public.notification_tokens group by token having pg_catalog.count(distinct user_id) > 1) conflict), 0),
      ''events_without_profile'', (select pg_catalog.count(event.id) from public.notification_events event left join public.user_profiles profile on profile.user_id = event.user_id where profile.user_id is null),
      ''preferences_without_profile'', (select pg_catalog.count(preference.user_id) from public.notification_preferences preference left join public.user_profiles profile on profile.user_id = preference.user_id where profile.user_id is null)
    ),
    ''identity_reference_integrity'', (
      select pg_catalog.jsonb_build_object(
        ''total_non_null'', coalesce(pg_catalog.sum(identity_count.total_non_null), 0),
        ''user_subject_ids'', coalesce(pg_catalog.sum(identity_count.user_subject_ids), 0),
        ''profile_backed_ids'', coalesce(pg_catalog.sum(identity_count.profile_backed_ids), 0),
        ''unresolved_profile_refs'', coalesce(pg_catalog.sum(identity_count.unresolved_profile_refs), 0)
      )
      from (
      select
        pg_catalog.count(user_id)::bigint as total_non_null,
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(target_user_id) filter (where target_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(invited_by_user_id) filter (where invited_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(assigned_by_user_id) filter (where assigned_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(created_by_user_id) filter (where created_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(changed_by_user_id) filter (where changed_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(uploaded_by) filter (where uploaded_by like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(uploaded_by) filter (where uploaded_by like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(owner_user_id) filter (where owner_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(converted_by_user_id) filter (where converted_by_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(actor_user_id) filter (where actor_user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
        pg_catalog.count(user_id) filter (where user_id like ''user\_%'' escape ''\'')::bigint as user_subject_ids,
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
  );') then
    raise exception 'Phase 2A semantic sidecar changed during pre-cutover teardown' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence teardown changed adoption markers' using errcode='55000';
  end if;
end $postconditions$;
commit;
