-- ADOPTION_TEMPORARY: remove this boundary before the final canonical marker.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $preconditions$
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Premature canonical marker blocks pre-cutover evidence' using errcode='55000';
  end if;
  if not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence adoption prerequisite is missing' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null then
    raise exception 'Phase 2A semantic sidecar is missing' using errcode='55000';
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
      ''preferences_without_profile'', (select pg_catalog.count(preference.id) from public.notification_preferences preference left join public.user_profiles profile on profile.user_id = preference.user_id where profile.user_id is null)
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
    raise exception 'Phase 2A semantic sidecar source drifted' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null
     or exists(select 1 from pg_catalog.pg_roles where rolname='reflab_pre_cutover_evidence_owner')
     or exists(select 1 from pg_catalog.pg_policy p where p.polname='reflab_pre_cutover_evidence_owner_read') then
    raise exception 'Pre-cutover evidence infrastructure is not in the reviewed absent state' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.unnest(array['public.access_change_audit','public.access_plans','public.ai_usage_ledger','public.appointment_history','public.appointments','public.associations','public.attempts','public.capabilities','public.capability_overrides','public.clips','public.coach_data_consents','public.coach_evidence','public.coach_rate_limit_buckets','public.coach_runs','public.competition_categories','public.competition_seasons','public.competitions','public.countries','public.exam_results','public.fixture_sync_logs','public.fixtures','public.ifab_library_documents','public.institution_assessment_assignments','public.institution_assessment_feedback','public.institution_assessment_history','public.institution_assessment_items','public.institution_assessment_sessions','public.institution_assessments','public.institution_audit_logs','public.institution_cohorts','public.institution_content_assignments','public.institution_contents','public.institution_data_consents','public.institution_demo_sessions','public.institution_group_memberships','public.institution_groups','public.institution_members','public.institution_membership_permission_overrides','public.institution_membership_roles','public.institution_memberships','public.institution_notification_campaigns','public.institution_notification_recipients','public.institution_permissions','public.institution_role_permissions','public.institution_roles','public.institution_subscriptions','public.institutional_clips','public.institutional_lead_activities','public.institutional_leads','public.institutions','public.match_context_snapshots','public.match_officials','public.match_preparations','public.notification_events','public.performance_checkins','public.performance_sessions','public.physical_tests','public.plan_capabilities','public.platform_audit_logs','public.platform_roles','public.post_match_reviews','public.psychology_checkins','public.psychology_exercise_sessions','public.psychology_modules','public.psychology_wellbeing_assessments','public.readiness_scores','public.referee_eligibility','public.referee_roles','public.rules_exam_results','public.teams','public.user_global_roles','public.user_profiles','public.user_roles','public.user_subscriptions','public.venues','public.wellness_logs']::text[]) t(name) join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(t.name) where not c.relrowsecurity) then
    raise exception 'Pre-cutover evidence requires RLS on every aggregate table' using errcode='55000';
  end if;
end $preconditions$;

do $role$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname='reflab_pre_cutover_evidence_owner') then
    create role "reflab_pre_cutover_evidence_owner" nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $role$;
grant usage on schema public, reflab_audit to "reflab_pre_cutover_evidence_owner";
grant select ("new_data", "old_data") on "public"."access_change_audit" to "reflab_pre_cutover_evidence_owner";
grant select ("audience", "plan_key") on "public"."access_plans" to "reflab_pre_cutover_evidence_owner";
grant select ("estimated_cost_usd", "input_tokens", "output_tokens", "run_id", "total_tokens") on "public"."ai_usage_ledger" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "change_type", "snapshot") on "public"."appointment_history" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "competition_id", "fixture_id", "id", "institution_id", "metadata", "replaced_by_appointment_id", "role_id", "source_type", "status") on "public"."appointments" to "reflab_pre_cutover_evidence_owner";
grant select ("country_id", "id", "source_type") on "public"."associations" to "reflab_pre_cutover_evidence_owner";
grant select ("clarity_score", "communication_score", "completed_rounds", "criterion_result", "english_score", "exam_result_id", "fatigue_level", "grammar_score", "institution_group_id", "institution_id", "justification_score", "mastered_concepts", "pending_concepts", "perceived_effort", "pronunciation_score", "protocol_score", "source_item_id", "source_item_type", "source_occurrence_id", "sport_type", "structure_score", "technical_accuracy_score", "terminology_score", "time_spent", "time_spent_seconds", "total_duration", "total_rounds", "vocabulary_score") on "public"."attempts" to "reflab_pre_cutover_evidence_owner";
grant select ("capability_key") on "public"."capabilities" to "reflab_pre_cutover_evidence_owner";
grant select ("capability_key", "effect", "institution_id", "scope_type", "valid_from", "valid_until") on "public"."capability_overrides" to "reflab_pre_cutover_evidence_owner";
grant select ("analysis_answers", "correct_app_status", "correct_clear_error", "correct_var_decision", "sport_type") on "public"."clips" to "reflab_pre_cutover_evidence_owner";
grant select ("data_category", "granted", "granted_at", "purpose", "revoked_at") on "public"."coach_data_consents" to "reflab_pre_cutover_evidence_owner";
grant select ("evidence_snapshot", "evidence_type", "run_id", "sport_type") on "public"."coach_evidence" to "reflab_pre_cutover_evidence_owner";
grant select ("request_count") on "public"."coach_rate_limit_buckets" to "reflab_pre_cutover_evidence_owner";
grant select ("confidence_label", "confidence_score", "evidence_count", "feature", "id", "input_tokens", "institution_id", "latency_ms", "output_tokens", "sport_type", "status", "total_tokens") on "public"."coach_runs" to "reflab_pre_cutover_evidence_owner";
grant select ("competition_id", "id", "season_id", "source_type", "sport_type") on "public"."competition_categories" to "reflab_pre_cutover_evidence_owner";
grant select ("competition_id", "end_date", "id", "source_type", "start_date", "status") on "public"."competition_seasons" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "competition_type", "id", "source_type", "sport_type") on "public"."competitions" to "reflab_pre_cutover_evidence_owner";
grant select ("code", "id") on "public"."countries" to "reflab_pre_cutover_evidence_owner";
grant select ("avg_score", "correct_count", "details", "exam_session_id", "id", "institution_assessment_session_id", "institution_group_id", "institution_id", "payload_hash", "sport_type", "total_questions", "total_score") on "public"."exam_results" to "reflab_pre_cutover_evidence_owner";
grant select ("competition_id", "competitions_upserted", "date_from", "date_to", "error_payload", "fixtures_upserted", "sport_type", "sync_status", "teams_upserted", "venues_upserted") on "public"."fixture_sync_logs" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "away_team_id", "category_id", "competition_id", "country_id", "data_source", "home_team_id", "id", "raw_source_reference", "season_id", "sport_type", "status", "venue_id") on "public"."fixtures" to "reflab_pre_cutover_evidence_owner";
grant select ("category", "governing_body", "source_official", "sport_type", "status") on "public"."ifab_library_documents" to "reflab_pre_cutover_evidence_owner";
grant select ("assessment_id", "attempts_override", "closes_at_override", "group_id", "id", "institution_id", "opens_at_override", "user_id") on "public"."institution_assessment_assignments" to "reflab_pre_cutover_evidence_owner";
grant select ("action", "institution_id", "priority", "session_id") on "public"."institution_assessment_feedback" to "reflab_pre_cutover_evidence_owner";
grant select ("assessment_id", "institution_id", "snapshot") on "public"."institution_assessment_history" to "reflab_pre_cutover_evidence_owner";
grant select ("assessment_id", "institution_id", "item_snapshot", "item_type", "points") on "public"."institution_assessment_items" to "reflab_pre_cutover_evidence_owner";
grant select ("assessment_id", "assignment_id", "attempt_number", "group_id", "id", "institution_id", "percentage", "result_payload", "status", "time_spent_seconds") on "public"."institution_assessment_sessions" to "reflab_pre_cutover_evidence_owner";
grant select ("attempts_allowed", "closes_at", "duration_minutes", "id", "institution_id", "minimum_score", "modality", "opens_at", "question_count", "settings", "video_count") on "public"."institution_assessments" to "reflab_pre_cutover_evidence_owner";
grant select ("actor_membership_id", "after_state", "before_state", "institution_id", "metadata") on "public"."institution_audit_logs" to "reflab_pre_cutover_evidence_owner";
grant select ("ends_on", "id", "institution_id", "sport_type", "starts_on") on "public"."institution_cohorts" to "reflab_pre_cutover_evidence_owner";
grant select ("available_from", "content_id", "due_at", "group_id", "institution_id", "user_id") on "public"."institution_content_assignments" to "reflab_pre_cutover_evidence_owner";
grant select ("content_type", "id", "institution_id", "metadata", "valid_from", "valid_until", "version", "visibility") on "public"."institution_contents" to "reflab_pre_cutover_evidence_owner";
grant select ("data_category", "institution_id", "membership_id") on "public"."institution_data_consents" to "reflab_pre_cutover_evidence_owner";
grant select ("expires_at", "institution_id", "metadata", "started_at", "status") on "public"."institution_demo_sessions" to "reflab_pre_cutover_evidence_owner";
grant select ("group_id", "group_role", "institution_id", "membership_id") on "public"."institution_group_memberships" to "reflab_pre_cutover_evidence_owner";
grant select ("cohort_id", "ends_on", "group_type", "id", "institution_id", "metadata", "starts_on") on "public"."institution_groups" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id") on "public"."institution_members" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id", "membership_id", "permission_id") on "public"."institution_membership_permission_overrides" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id", "membership_id", "role_id") on "public"."institution_membership_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("id", "institution_id", "metadata", "primary_sport", "status") on "public"."institution_memberships" to "reflab_pre_cutover_evidence_owner";
grant select ("channels", "id", "institution_id", "priority") on "public"."institution_notification_campaigns" to "reflab_pre_cutover_evidence_owner";
grant select ("campaign_id", "delivery_status", "institution_id") on "public"."institution_notification_recipients" to "reflab_pre_cutover_evidence_owner";
grant select ("id") on "public"."institution_permissions" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id", "permission_id", "role_id") on "public"."institution_role_permissions" to "reflab_pre_cutover_evidence_owner";
grant select ("id", "institution_id") on "public"."institution_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("ends_at", "institution_id", "plan_key", "seat_limit", "starts_at", "status") on "public"."institution_subscriptions" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id") on "public"."institutional_clips" to "reflab_pre_cutover_evidence_owner";
grant select ("activity_type", "lead_id", "metadata") on "public"."institutional_lead_activities" to "reflab_pre_cutover_evidence_owner";
grant select ("converted_at", "converted_institution_id", "id", "instructor_count", "potential_plan", "referee_count", "status") on "public"."institutional_leads" to "reflab_pre_cutover_evidence_owner";
grant select ("assessment_settings", "brand_color", "enabled_sports", "id", "institution_type", "license_end", "license_limit", "license_start", "metrics_settings", "plan_key", "privacy_settings", "seats_total", "seats_used", "status") on "public"."institutions" to "reflab_pre_cutover_evidence_owner";
grant select ("fixture_id", "payload", "snapshot_type", "source_type", "sport_type") on "public"."match_context_snapshots" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "fixture_id", "role_id", "source_type", "status") on "public"."match_officials" to "reflab_pre_cutover_evidence_owner";
grant select ("answers", "appointment_id", "checklist", "sport_type", "stage", "status") on "public"."match_preparations" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "fixture_id", "sport_type", "status") on "public"."notification_events" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "checkin_type", "duration_minutes", "emotional_score", "fatigue", "fixture_id", "id", "internal_load", "readiness_score", "rpe", "sleep_hours", "sport_type") on "public"."performance_checkins" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "checkin_id", "duration_minutes", "fatigue_post", "fixture_id", "internal_load", "rpe", "sport_type") on "public"."performance_sessions" to "reflab_pre_cutover_evidence_owner";
grant select ("sport_type") on "public"."physical_tests" to "reflab_pre_cutover_evidence_owner";
grant select ("capability_key", "plan_key") on "public"."plan_capabilities" to "reflab_pre_cutover_evidence_owner";
grant select ("after_state", "before_state", "metadata") on "public"."platform_audit_logs" to "reflab_pre_cutover_evidence_owner";
grant select ("role_key") on "public"."platform_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "fatigue_score", "incidents", "key_decisions", "minutes_played", "perceived_load", "sport_type") on "public"."post_match_reviews" to "reflab_pre_cutover_evidence_owner";
grant select ("activation_score", "appointment_id", "checkin_type", "concentration_score", "confidence_score", "emotional_control_score", "error_impact_score", "feedback", "fixture_id", "incident_minute", "mental_fatigue_score", "mental_score", "module_slug", "pressure_score", "process_orientation_score", "recovery_score", "responses", "sport_type") on "public"."psychology_checkins" to "reflab_pre_cutover_evidence_owner";
grant select ("after_score", "appointment_id", "before_score", "clarity_score", "exercise_type", "feedback", "fixture_id", "module_slug", "pressure_level", "sport_type") on "public"."psychology_exercise_sessions" to "reflab_pre_cutover_evidence_owner";
grant select ("slug") on "public"."psychology_modules" to "reflab_pre_cutover_evidence_owner";
grant select ("burnout_risk_score", "concentration_difficulty_score", "cynicism_score", "emotional_exhaustion_score", "external_pressure_score", "feedback", "institutional_support_score", "module_slug", "motivation_score", "recovery_quality_score", "sleep_disruption_score", "sport_type", "violence_exposure_score", "workload_score") on "public"."psychology_wellbeing_assessments" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "checkin_id", "factors", "fixture_id", "score", "sport_type") on "public"."readiness_scores" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "category_id", "competition_id", "country_id", "eligibility_mode", "institution_id", "role_id", "source_type", "sport_type") on "public"."referee_eligibility" to "reflab_pre_cutover_evidence_owner";
grant select ("id", "sport_type") on "public"."referee_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("correct_count", "details", "percentage", "sport_type", "topic_performance", "total_questions", "unanswered_count") on "public"."rules_exam_results" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "country_id", "id", "source_type", "sport_type") on "public"."teams" to "reflab_pre_cutover_evidence_owner";
grant select ("role_key") on "public"."user_global_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "institution_id", "preferred_sport_type", "subscription_plan") on "public"."user_profiles" to "reflab_pre_cutover_evidence_owner";
grant select ("institution_id", "subscription_plan") on "public"."user_roles" to "reflab_pre_cutover_evidence_owner";
grant select ("ends_at", "plan_key", "starts_at", "status", "user_id") on "public"."user_subscriptions" to "reflab_pre_cutover_evidence_owner";
grant select ("association_id", "country_id", "id", "source_type") on "public"."venues" to "reflab_pre_cutover_evidence_owner";
grant select ("appointment_id", "checkin_id", "emotional_score", "fatigue", "fixture_id", "sleep_hours", "sport_type") on "public"."wellness_logs" to "reflab_pre_cutover_evidence_owner";
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."access_change_audit" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."access_plans" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."ai_usage_ledger" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."appointment_history" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."appointments" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."associations" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."attempts" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."capabilities" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."capability_overrides" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."clips" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_data_consents" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_evidence" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_rate_limit_buckets" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."coach_runs" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."competition_categories" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."competition_seasons" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."competitions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."countries" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."exam_results" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."fixture_sync_logs" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."fixtures" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."ifab_library_documents" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_assignments" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_feedback" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_history" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_items" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessment_sessions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_assessments" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_audit_logs" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_cohorts" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_content_assignments" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_contents" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_data_consents" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_demo_sessions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_group_memberships" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_groups" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_members" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_membership_permission_overrides" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_membership_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_memberships" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_notification_campaigns" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_notification_recipients" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_permissions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_role_permissions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institution_subscriptions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_clips" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_lead_activities" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutional_leads" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."institutions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_context_snapshots" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_officials" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."match_preparations" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."notification_events" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."performance_checkins" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."performance_sessions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."physical_tests" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."plan_capabilities" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."platform_audit_logs" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."platform_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."post_match_reviews" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_checkins" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_exercise_sessions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_modules" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."psychology_wellbeing_assessments" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."readiness_scores" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."referee_eligibility" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."referee_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."rules_exam_results" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."teams" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_global_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_profiles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_roles" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."user_subscriptions" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."venues" for select to "reflab_pre_cutover_evidence_owner" using (true);
create policy "reflab_pre_cutover_evidence_owner_read" on "public"."wellness_logs" for select to "reflab_pre_cutover_evidence_owner" using (true);

-- Pinned normalized source SHA-256: ea29006f9d758ab5abb6a61a0aceb719f2859a2200717a09a3a62c8ac60df14d
create function reflab_audit.pre_cutover_evidence_snapshot_v1() returns jsonb
language sql stable security definer set search_path=pg_catalog
as $pre_cutover$
  select pg_catalog.jsonb_build_object(
    'format', 'REFLAB_PRE_CUTOVER_PRODUCTION_EVIDENCE_V1',
    'contract_hash', 'cc2135a3eb1ba0436d5ea9b0a82de570c35f77e9a4e5bc619e9fc88ccf752c82',
    'evidence_provenance', 'TEMPORARY_SECURITY_BOUNDARY',
    'authorizes_ddl', false,
    'metrics', (select pg_catalog.jsonb_agg(metric order by metric->>'id') from (
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_002', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessment_assignments"
      where "id" is not null and "institution_id" is not null and "assessment_id" is not null group by "id", "institution_id", "assessment_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_003', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessment_sessions"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_004', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_assessments"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_005', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_cohorts"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_006', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_contents"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_007', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_groups"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_008', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_memberships"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_009', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_notification_campaigns"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_010', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_roles"
      where "id" is not null and "institution_id" is not null group by "id", "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_011', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."institution_subscriptions"
      where "institution_id" is not null group by "institution_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_UNIQUE_013', 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from "public"."user_subscriptions"
      where "user_id" is not null group by "user_id" having pg_catalog.count(*)>1) duplicate_groups
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_001', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_change_audit"
      where ((jsonb_typeof(new_data) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_002', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_change_audit"
      where ((jsonb_typeof(old_data) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_003', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."access_plans"
      where ((audience = ANY (ARRAY['individual'::text, 'institution'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_004', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where (((estimated_cost_usd IS NULL) OR (estimated_cost_usd >= (0)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_005', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((input_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_006', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((output_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_007', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ai_usage_ledger"
      where ((total_tokens >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_008', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointment_history"
      where ((change_type = ANY (ARRAY['created'::text, 'status_changed'::text, 'role_changed'::text, 'fixture_changed'::text, 'note_updated'::text, 'system_sync'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_009', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointment_history"
      where ((jsonb_typeof(snapshot) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_010', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_011', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((source_type = ANY (ARRAY['manual'::text, 'institutional'::text, 'api'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_012', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."appointments"
      where ((status = ANY (ARRAY['draft'::text, 'pending_confirmation'::text, 'confirmed'::text, 'modified'::text, 'replaced'::text, 'cancelled'::text, 'suspended'::text, 'postponed'::text, 'completed'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_013', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."associations"
      where ((source_type = ANY (ARRAY['manual'::text, 'institutional'::text, 'api'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_014', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((clarity_score IS NULL) OR ((clarity_score >= 0) AND (clarity_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_015', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((communication_score IS NULL) OR ((communication_score >= 0) AND (communication_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_016', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((completed_rounds IS NULL) OR (completed_rounds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_017', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((criterion_result IS NULL) OR (jsonb_typeof(criterion_result) = 'object'::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_018', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((english_score IS NULL) OR ((english_score >= 0) AND (english_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_019', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((exam_result_id IS NULL) OR ((source_item_type IS NOT NULL) AND (source_item_id IS NOT NULL) AND (source_occurrence_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_020', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((fatigue_level IS NULL) OR ((fatigue_level >= 1) AND (fatigue_level <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_021', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((grammar_score IS NULL) OR ((grammar_score >= 0) AND (grammar_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_022', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((justification_score IS NULL) OR ((justification_score >= 0) AND (justification_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_023', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((jsonb_typeof(mastered_concepts) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_024', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((jsonb_typeof(pending_concepts) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_025', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((perceived_effort IS NULL) OR ((perceived_effort >= 1) AND (perceived_effort <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_026', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((pronunciation_score IS NULL) OR ((pronunciation_score >= 0) AND (pronunciation_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_027', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((protocol_score IS NULL) OR ((protocol_score >= 0) AND (protocol_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_028', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_029', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((structure_score IS NULL) OR ((structure_score >= 0) AND (structure_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_030', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((technical_accuracy_score IS NULL) OR ((technical_accuracy_score >= 0) AND (technical_accuracy_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_031', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((terminology_score IS NULL) OR ((terminology_score >= 0) AND (terminology_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_032', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((time_spent IS NULL) OR (time_spent >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_033', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((time_spent_seconds IS NULL) OR (time_spent_seconds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_034', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((total_duration IS NULL) OR (total_duration >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_035', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((total_rounds IS NULL) OR (total_rounds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_036', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."attempts"
      where (((vocabulary_score IS NULL) OR ((vocabulary_score >= 0) AND (vocabulary_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_037', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((effect = ANY (ARRAY['allow'::text, 'deny'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_038', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((((scope_type = 'global_user'::text) AND (institution_id IS NULL)) OR ((scope_type = 'institution_user'::text) AND (institution_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_039', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where ((scope_type = ANY (ARRAY['global_user'::text, 'institution_user'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_040', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."capability_overrides"
      where (((valid_until IS NULL) OR (valid_until > valid_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_041', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((analysis_answers IS NULL) OR (jsonb_typeof(analysis_answers) = 'object'::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_042', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_app_status IS NULL) OR (correct_app_status = ANY (ARRAY['same_app'::text, 'new_app'::text, 'not_relevant'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_043', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_clear_error IS NULL) OR (correct_clear_error = ANY (ARRAY['yes'::text, 'no'::text, 'unclear'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_044', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where (((correct_var_decision IS NULL) OR (correct_var_decision = ANY (ARRAY['check_complete'::text, 'recommend_ofr'::text, 'factual_review'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_045', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."clips"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_046', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where ((data_category = ANY (ARRAY['technical_history'::text, 'match_operational'::text, 'physical_summary'::text, 'psychology_summary'::text, 'psychology_detail'::text, 'medical_sensitive'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_047', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where (((granted AND (granted_at IS NOT NULL) AND (revoked_at IS NULL)) OR (NOT granted))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_048', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_data_consents"
      where ((purpose = ANY (ARRAY['personal_coaching'::text, 'institutional_sharing'::text, 'model_improvement'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_049', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((jsonb_typeof(evidence_snapshot) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_050', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((evidence_type = ANY (ARRAY['clip'::text, 'attempt'::text, 'exam'::text, 'official_document'::text, 'metric_snapshot'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_051', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_evidence"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_052', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_rate_limit_buckets"
      where ((request_count >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_053', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((confidence_label = ANY (ARRAY['high'::text, 'medium'::text, 'human_review'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_054', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((confidence_score >= 0) AND (confidence_score <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_055', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((evidence_count >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_056', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((feature = ANY (ARRAY['technical_feedback'::text, 'exam_analysis'::text, 'communication_feedback'::text, 'var_feedback'::text, 'coach_conversation'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_057', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((input_tokens IS NULL) OR (input_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_058', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((latency_ms IS NULL) OR (latency_ms >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_059', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((output_tokens IS NULL) OR (output_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_060', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_061', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_062', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."coach_runs"
      where (((total_tokens IS NULL) OR (total_tokens >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_063', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_categories"
      where ((source_type = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_064', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_categories"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_065', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where ((source_type = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_066', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_067', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competition_seasons"
      where (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_068', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((competition_type = ANY (ARRAY['league'::text, 'cup'::text, 'playoff'::text, 'friendly'::text, 'tournament'::text, 'other'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_069', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((source_type = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_070', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."competitions"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_071', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."countries"
      where (((char_length(code) >= 2) AND (char_length(code) <= 3))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_072', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((avg_score >= (0)::numeric) AND (avg_score <= (100)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_073', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((correct_count >= 0) AND (correct_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_074', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((jsonb_typeof(details) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_075', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((payload_hash ~ '^[0-9a-f]{64}$'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_076', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_077', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where (((total_questions >= 1) AND (total_questions <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_078', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."exam_results"
      where ((total_score >= (0)::numeric)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_079', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((competitions_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_080', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((date_to >= date_from)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_081', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((jsonb_typeof(error_payload) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_082', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((fixtures_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_083', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_084', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((sync_status = ANY (ARRAY['success'::text, 'partial'::text, 'error'::text, 'skipped'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_085', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((teams_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_086', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixture_sync_logs"
      where ((venues_upserted >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_087', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((data_source = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_088', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where (((home_team_id IS NULL) OR (away_team_id IS NULL) OR (home_team_id <> away_team_id))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_089', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((jsonb_typeof(raw_source_reference) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_090', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_091', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."fixtures"
      where ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'live'::text, 'completed'::text, 'postponed'::text, 'suspended'::text, 'cancelled'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_092', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((category = ANY (ARRAY['reglas'::text, 'circular'::text, 'resumen'::text, 'protocolo_var'::text, 'cambios_reglamentarios'::text, 'mundial'::text, 'material_consulta'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_093', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where (((status <> 'vigente'::text) OR ((source_official IS NOT NULL) AND (btrim(source_official) <> ''::text)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_094', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((governing_body = ANY (ARRAY['IFAB'::text, 'FIFA'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_095', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((((sport_type = 'football_11'::text) AND (governing_body = 'IFAB'::text)) OR ((sport_type = 'futsal'::text) AND (governing_body = 'FIFA'::text)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_096', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_097', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."ifab_library_documents"
      where ((status = ANY (ARRAY['vigente'::text, 'proxima_actualizacion'::text, 'archivado'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_098', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where (((attempts_override IS NULL) OR (attempts_override > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_099', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where ((((group_id IS NOT NULL) AND (user_id IS NULL)) OR ((group_id IS NULL) AND (user_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_100', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_assignments"
      where (((opens_at_override IS NULL) OR (closes_at_override IS NULL) OR (closes_at_override > opens_at_override))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_101', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_feedback"
      where ((action = ANY (ARRAY['comment'::text, 'approve'::text, 'fail'::text, 'request_retry'::text, 'mark_for_review'::text, 'assign_activity'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_102', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_feedback"
      where ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_103', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_history"
      where ((jsonb_typeof(snapshot) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_104', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((jsonb_typeof(item_snapshot) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_105', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((item_type = ANY (ARRAY['global_clip'::text, 'institutional_clip'::text, 'rule_question'::text, 'institution_content'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_106', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_items"
      where ((points >= (0)::numeric)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_107', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((attempt_number > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_108', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where (((percentage IS NULL) OR ((percentage >= (0)::numeric) AND (percentage <= (100)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_109', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((jsonb_typeof(result_payload) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_110', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'submitted'::text, 'graded'::text, 'expired'::text, 'cancelled'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_111', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessment_sessions"
      where (((time_spent_seconds IS NULL) OR (time_spent_seconds >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_112', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((attempts_allowed > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_113', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_114', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((minimum_score IS NULL) OR ((minimum_score >= (0)::numeric) AND (minimum_score <= (100)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_115', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((modality = ANY (ARRAY['video_analysis'::text, 'rules_exam'::text, 'trivia'::text, 'referee_exam'::text, 'communication'::text, 'var'::text, 'futsal'::text, 'psychology_orientation'::text, 'physical'::text, 'custom'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_116', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((question_count IS NULL) OR (question_count > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_117', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where ((jsonb_typeof(settings) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_118', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((video_count IS NULL) OR (video_count > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_119', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_assessments"
      where (((opens_at IS NULL) OR (closes_at IS NULL) OR (closes_at > opens_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_120', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where (((after_state IS NULL) OR (jsonb_typeof(after_state) = 'object'::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_121', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where (((before_state IS NULL) OR (jsonb_typeof(before_state) = 'object'::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_122', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_audit_logs"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_123', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_cohorts"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_124', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_cohorts"
      where (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_125', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_content_assignments"
      where ((((group_id IS NOT NULL) AND (user_id IS NULL)) OR ((group_id IS NULL) AND (user_id IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_126', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_content_assignments"
      where (((due_at IS NULL) OR (available_from IS NULL) OR (due_at >= available_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_127', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((content_type = ANY (ARRAY['video'::text, 'question'::text, 'trivia'::text, 'document'::text, 'circular'::text, 'class'::text, 'exercise'::text, 'presentation'::text, 'pdf'::text, 'link'::text, 'audio'::text, 'case_study'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_128', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_129', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where (((valid_until IS NULL) OR (valid_from IS NULL) OR (valid_until >= valid_from))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_130', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((version > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_131', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_contents"
      where ((visibility = ANY (ARRAY['private'::text, 'institution'::text, 'assigned_groups'::text, 'public'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_132', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_data_consents"
      where ((data_category = ANY (ARRAY['availability'::text, 'readiness_summary'::text, 'physical_load'::text, 'physical_detail'::text, 'medical_notes'::text, 'psychology_compliance'::text, 'psychology_detail'::text, 'post_match_review'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_133', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((expires_at > started_at)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_134', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_135', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_demo_sessions"
      where ((status = ANY (ARRAY['active'::text, 'ended'::text, 'expired'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_136', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_group_memberships"
      where ((group_role = ANY (ARRAY['participant'::text, 'instructor'::text, 'coordinator'::text, 'observer'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_137', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where ((group_type = ANY (ARRAY['course'::text, 'cohort'::text, 'commission'::text, 'category'::text, 'role'::text, 'training'::text, 'work_team'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_138', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_139', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_groups"
      where (((ends_on IS NULL) OR (starts_on IS NULL) OR (ends_on >= starts_on))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_140', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_141', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where (((primary_sport IS NULL) OR (primary_sport = ANY (ARRAY['football_11'::text, 'futsal'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_142', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_memberships"
      where ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_143', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_campaigns"
      where (((cardinality(channels) > 0) AND (channels <@ ARRAY['web'::text, 'pwa'::text, 'email'::text, 'push'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_144', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_campaigns"
      where ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_145', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_notification_recipients"
      where ((delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'read'::text, 'dismissed'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_146', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where ((plan_key = ANY (ARRAY['academy'::text, 'enterprise'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_147', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where (((seat_limit IS NULL) OR (seat_limit >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_148', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'paused'::text, 'canceled'::text, 'expired'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_149', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institution_subscriptions"
      where (((ends_at IS NULL) OR (ends_at > starts_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_150', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_lead_activities"
      where ((activity_type = ANY (ARRAY['created'::text, 'updated'::text, 'status_changed'::text, 'note_added'::text, 'contact_logged'::text, 'archived'::text, 'restored'::text, 'converted'::text, 'deleted'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_151', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_lead_activities"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_152', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((((converted_institution_id IS NULL) AND (converted_at IS NULL)) OR ((converted_institution_id IS NOT NULL) AND (converted_at IS NOT NULL)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_153', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where (((instructor_count IS NULL) OR (instructor_count >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_154', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((potential_plan = ANY (ARRAY['academy'::text, 'enterprise'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_155', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where (((referee_count IS NULL) OR (referee_count >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_156', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutional_leads"
      where ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'demo_scheduled'::text, 'demo_completed'::text, 'proposal_sent'::text, 'negotiation'::text, 'won'::text, 'lost'::text, 'archived'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_157', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(assessment_settings) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_158', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((brand_color ~ '^#[0-9A-Fa-f]{6}$'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_159', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where (((cardinality(enabled_sports) > 0) AND (enabled_sports <@ ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_160', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((institution_type = ANY (ARRAY['school'::text, 'league'::text, 'association'::text, 'federation'::text, 'private_academy'::text, 'other'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_161', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((license_limit >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_162', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where (((license_end IS NULL) OR (license_start IS NULL) OR (license_end > license_start))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_163', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(metrics_settings) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_164', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((plan_key = ANY (ARRAY['academy'::text, 'enterprise'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_165', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((jsonb_typeof(privacy_settings) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_166', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_used <= seats_total)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_167', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_total >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_168', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((seats_used >= 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_169', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."institutions"
      where ((status = ANY (ARRAY['pending'::text, 'trial'::text, 'active'::text, 'suspended'::text, 'expired'::text, 'archived'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_170', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((jsonb_typeof(payload) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_171', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((snapshot_type = ANY (ARRAY['standings'::text, 'form'::text, 'disciplinary'::text, 'official_note'::text, 'summary'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_172', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((source_type = ANY (ARRAY['manual'::text, 'institutional'::text, 'api'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_173', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_context_snapshots"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_174', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_officials"
      where ((source_type = ANY (ARRAY['manual'::text, 'institutional'::text, 'api'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_175', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_officials"
      where ((status = ANY (ARRAY['assigned'::text, 'confirmed'::text, 'replaced'::text, 'removed'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_176', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((jsonb_typeof(answers) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_177', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((jsonb_typeof(checklist) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_178', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_179', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((stage = ANY (ARRAY['72_48_hours'::text, '24_hours'::text, 'matchday'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_180', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."match_preparations"
      where ((status = ANY (ARRAY['draft'::text, 'completed'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_181', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."notification_events"
      where (((sport_type IS NULL) OR (sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_182', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint, 'status_counts', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('status',status,'count',status_count) order by status),'[]'::jsonb)
        from (select status,pg_catalog.count(*)::bigint status_count from public.notification_events group by status) approved_statuses))
    from (select pg_catalog.count(*)::bigint violation_count from "public"."notification_events"
      where ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'skipped'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_183', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where ((checkin_type = ANY (ARRAY['pre'::text, 'post'::text, 'rest_day'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_184', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_185', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((emotional_score IS NULL) OR ((emotional_score >= 1) AND (emotional_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_186', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((fatigue IS NULL) OR ((fatigue >= 1) AND (fatigue <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_187', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((internal_load IS NULL) OR (internal_load >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_188', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((readiness_score IS NULL) OR ((readiness_score >= 0) AND (readiness_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_189', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((rpe IS NULL) OR ((rpe >= 1) AND (rpe <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_190', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where (((sleep_hours IS NULL) OR ((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_191', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_checkins"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_192', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((duration_minutes IS NULL) OR (duration_minutes > 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_193', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((fatigue_post IS NULL) OR ((fatigue_post >= 1) AND (fatigue_post <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_194', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((internal_load IS NULL) OR (internal_load >= 0))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_195', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where (((rpe IS NULL) OR ((rpe >= 1) AND (rpe <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_196', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."performance_sessions"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_197', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."physical_tests"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_198', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(after_state) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_199', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(before_state) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_200', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."platform_audit_logs"
      where ((jsonb_typeof(metadata) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_201', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((fatigue_score IS NULL) OR ((fatigue_score >= 1) AND (fatigue_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_202', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((jsonb_typeof(incidents) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_203', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((jsonb_typeof(key_decisions) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_204', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((minutes_played IS NULL) OR ((minutes_played >= 0) AND (minutes_played <= 180)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_205', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where (((perceived_load IS NULL) OR ((perceived_load >= 1) AND (perceived_load <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_206', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."post_match_reviews"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_207', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((activation_score IS NULL) OR ((activation_score >= 1) AND (activation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_208', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((checkin_type = ANY (ARRAY['pre_match'::text, 'post_match'::text, 'error_recovery'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_209', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((concentration_score IS NULL) OR ((concentration_score >= 1) AND (concentration_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_210', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((confidence_score IS NULL) OR ((confidence_score >= 1) AND (confidence_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_211', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((emotional_control_score IS NULL) OR ((emotional_control_score >= 1) AND (emotional_control_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_212', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((error_impact_score IS NULL) OR ((error_impact_score >= 1) AND (error_impact_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_213', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((jsonb_typeof(feedback) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_214', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((incident_minute IS NULL) OR ((incident_minute >= 0) AND (incident_minute <= 130)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_215', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((mental_fatigue_score IS NULL) OR ((mental_fatigue_score >= 1) AND (mental_fatigue_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_216', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((mental_score IS NULL) OR ((mental_score >= 0) AND (mental_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_217', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((pressure_score IS NULL) OR ((pressure_score >= 1) AND (pressure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_218', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((process_orientation_score IS NULL) OR ((process_orientation_score >= 1) AND (process_orientation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_219', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where (((recovery_score IS NULL) OR ((recovery_score >= 1) AND (recovery_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_220', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((jsonb_typeof(responses) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_221', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_checkins"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_222', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((after_score IS NULL) OR ((after_score >= 1) AND (after_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_223', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((before_score IS NULL) OR ((before_score >= 1) AND (before_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_224', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((clarity_score IS NULL) OR ((clarity_score >= 1) AND (clarity_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_225', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((exercise_type = ANY (ARRAY['focus_reset'::text, 'pressure_scenario'::text, 'self_talk'::text, 'team_prebrief'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_226', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((jsonb_typeof(feedback) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_227', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where (((pressure_level IS NULL) OR ((pressure_level >= 1) AND (pressure_level <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_228', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_exercise_sessions"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_229', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((concentration_difficulty_score IS NULL) OR ((concentration_difficulty_score >= 1) AND (concentration_difficulty_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_230', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((institutional_support_score IS NULL) OR ((institutional_support_score >= 1) AND (institutional_support_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_231', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((emotional_exhaustion_score IS NULL) OR ((emotional_exhaustion_score >= 1) AND (emotional_exhaustion_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_232', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((burnout_risk_score IS NULL) OR ((burnout_risk_score >= 0) AND (burnout_risk_score <= 100)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_233', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((cynicism_score IS NULL) OR ((cynicism_score >= 1) AND (cynicism_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_234', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((external_pressure_score IS NULL) OR ((external_pressure_score >= 1) AND (external_pressure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_235', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where ((jsonb_typeof(feedback) = 'object'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_236', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((motivation_score IS NULL) OR ((motivation_score >= 1) AND (motivation_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_237', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((recovery_quality_score IS NULL) OR ((recovery_quality_score >= 1) AND (recovery_quality_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_238', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((sleep_disruption_score IS NULL) OR ((sleep_disruption_score >= 1) AND (sleep_disruption_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_239', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_240', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((violence_exposure_score IS NULL) OR ((violence_exposure_score >= 1) AND (violence_exposure_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_241', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."psychology_wellbeing_assessments"
      where (((workload_score IS NULL) OR ((workload_score >= 1) AND (workload_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_242', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where (((factors IS NULL) OR (jsonb_typeof(factors) = 'object'::text))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_243', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where (((score >= 0) AND (score <= 100))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_244', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."readiness_scores"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_245', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((eligibility_mode = ANY (ARRAY['eligible'::text, 'view_only'::text, 'blocked'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_246', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((source_type = ANY (ARRAY['profile'::text, 'institutional'::text, 'admin'::text, 'system'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_247', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_eligibility"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_248', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."referee_roles"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_249', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((correct_count >= 0) AND (correct_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_250', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((unanswered_count >= 0) AND (unanswered_count <= total_questions))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_251', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((jsonb_typeof(details) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_252', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where (((percentage >= (0)::numeric) AND (percentage <= (100)::numeric))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_253', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_254', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((jsonb_typeof(topic_performance) = 'array'::text)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_255', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."rules_exam_results"
      where ((total_questions > 0)) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_256', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."teams"
      where ((source_type = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_257', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."teams"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_258', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_profiles"
      where (((preferred_sport_type IS NULL) OR (preferred_sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text])))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_259', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_profiles"
      where ((subscription_plan = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_260', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_roles"
      where ((subscription_plan = ANY (ARRAY['free'::text, 'basic'::text, 'pro'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_261', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where ((plan_key = ANY (ARRAY['basic'::text, 'pro'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_262', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'paused'::text, 'canceled'::text, 'expired'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_263', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."user_subscriptions"
      where (((ends_at IS NULL) OR (ends_at > starts_at))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_264', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."venues"
      where ((source_type = ANY (ARRAY['institutional'::text, 'api'::text, 'manual'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_265', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((emotional_score IS NULL) OR ((emotional_score >= 1) AND (emotional_score <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_266', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((fatigue IS NULL) OR ((fatigue >= 1) AND (fatigue <= 10)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_267', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where (((sleep_hours IS NULL) OR ((sleep_hours >= (0)::numeric) AND (sleep_hours <= (24)::numeric)))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_CHECK_268', 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint)
    from (select pg_catalog.count(*)::bigint violation_count from "public"."wellness_logs"
      where ((sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))) is false) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_001', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."ai_usage_ledger" source_row
      where (source_row."run_id" is not null) and not exists (select 1 from "public"."coach_runs" target_row where source_row."run_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_002', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointment_history" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_003', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_004', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_005', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_006', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_007', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."replaced_by_appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."replaced_by_appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_008', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."appointments" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_009', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."associations" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_010', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."exam_result_id" is not null) and not exists (select 1 from "public"."exam_results" target_row where source_row."exam_result_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_011', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."institution_group_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."institution_group_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_012', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."attempts" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_013', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."capability_overrides" source_row
      where (source_row."capability_key" is not null) and not exists (select 1 from "public"."capabilities" target_row where source_row."capability_key" = target_row."capability_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_014', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."capability_overrides" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_015', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."coach_evidence" source_row
      where (source_row."run_id" is not null) and not exists (select 1 from "public"."coach_runs" target_row where source_row."run_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_016', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."coach_runs" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_017', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_categories" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_018', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_categories" source_row
      where (source_row."season_id" is not null) and not exists (select 1 from "public"."competition_seasons" target_row where source_row."season_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_019', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competition_seasons" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_020', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."competitions" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_021', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_assessment_session_id" is not null) and not exists (select 1 from "public"."institution_assessment_sessions" target_row where source_row."institution_assessment_session_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_022', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_group_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."institution_group_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_023', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."exam_results" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_024', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixture_sync_logs" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_025', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_026', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."away_team_id" is not null) and not exists (select 1 from "public"."teams" target_row where source_row."away_team_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_027', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."category_id" is not null) and not exists (select 1 from "public"."competition_categories" target_row where source_row."category_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_028', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_029', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_030', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."home_team_id" is not null) and not exists (select 1 from "public"."teams" target_row where source_row."home_team_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_031', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."season_id" is not null) and not exists (select 1 from "public"."competition_seasons" target_row where source_row."season_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_032', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."fixtures" source_row
      where (source_row."venue_id" is not null) and not exists (select 1 from "public"."venues" target_row where source_row."venue_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_033', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_034', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_035', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_assignments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_036', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_feedback" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_037', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_feedback" source_row
      where (source_row."session_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessment_sessions" target_row where source_row."session_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_038', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_history" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_039', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_history" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_040', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_items" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_041', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_items" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_042', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."assessment_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_assessments" target_row where source_row."assessment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_043', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."assignment_id" is not null and source_row."institution_id" is not null and source_row."assessment_id" is not null) and not exists (select 1 from "public"."institution_assessment_assignments" target_row where source_row."assignment_id" = target_row."id" and source_row."institution_id" = target_row."institution_id" and source_row."assessment_id" = target_row."assessment_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_044', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_045', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessment_sessions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_046', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_assessments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_047', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_audit_logs" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_048', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_audit_logs" source_row
      where (source_row."actor_membership_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."actor_membership_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_049', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_cohorts" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_050', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."content_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_contents" target_row where source_row."content_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_051', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_052', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_content_assignments" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_053', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_contents" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_054', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_data_consents" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_055', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_data_consents" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_056', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_demo_sessions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_057', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."group_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_groups" target_row where source_row."group_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_058', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_059', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_group_memberships" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_060', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_groups" source_row
      where (source_row."cohort_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_cohorts" target_row where source_row."cohort_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_061', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_groups" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_062', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_members" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_063', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_064', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_065', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_permission_overrides" source_row
      where (source_row."permission_id" is not null) and not exists (select 1 from "public"."institution_permissions" target_row where source_row."permission_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_066', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_067', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."membership_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_memberships" target_row where source_row."membership_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_068', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_membership_roles" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."institution_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_069', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_memberships" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_070', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_campaigns" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_071', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_recipients" source_row
      where (source_row."campaign_id" is not null and source_row."institution_id" is not null) and not exists (select 1 from "public"."institution_notification_campaigns" target_row where source_row."campaign_id" = target_row."id" and source_row."institution_id" = target_row."institution_id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_072', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_notification_recipients" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_073', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_074', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."permission_id" is not null) and not exists (select 1 from "public"."institution_permissions" target_row where source_row."permission_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_075', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_role_permissions" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."institution_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_076', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_077', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_subscriptions" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_078', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institution_subscriptions" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_079', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_clips" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_080', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_lead_activities" source_row
      where (source_row."lead_id" is not null) and not exists (select 1 from "public"."institutional_leads" target_row where source_row."lead_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_081', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."institutional_leads" source_row
      where (source_row."converted_institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."converted_institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_082', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_context_snapshots" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_083', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_084', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_085', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_officials" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_086', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."match_preparations" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_087', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."notification_events" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_088', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."notification_events" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_089', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_checkins" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_090', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_checkins" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_091', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_092', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_093', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."performance_sessions" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_094', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."plan_capabilities" source_row
      where (source_row."capability_key" is not null) and not exists (select 1 from "public"."capabilities" target_row where source_row."capability_key" = target_row."capability_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_095', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."plan_capabilities" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_096', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."post_match_reviews" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_097', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_098', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_099', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_checkins" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_100', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_101', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_102', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_exercise_sessions" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_103', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."psychology_wellbeing_assessments" source_row
      where (source_row."module_slug" is not null) and not exists (select 1 from "public"."psychology_modules" target_row where source_row."module_slug" = target_row."slug")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_104', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_105', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_106', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."readiness_scores" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_107', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_108', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."category_id" is not null) and not exists (select 1 from "public"."competition_categories" target_row where source_row."category_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_109', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."competition_id" is not null) and not exists (select 1 from "public"."competitions" target_row where source_row."competition_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_110', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_111', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_112', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."referee_eligibility" source_row
      where (source_row."role_id" is not null) and not exists (select 1 from "public"."referee_roles" target_row where source_row."role_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_113', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."teams" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_114', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."teams" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_115', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_global_roles" source_row
      where (source_row."role_key" is not null) and not exists (select 1 from "public"."platform_roles" target_row where source_row."role_key" = target_row."role_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_116', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_profiles" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_117', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_profiles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_118', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_roles" source_row
      where (source_row."institution_id" is not null) and not exists (select 1 from "public"."institutions" target_row where source_row."institution_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_119', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."user_subscriptions" source_row
      where (source_row."plan_key" is not null) and not exists (select 1 from "public"."access_plans" target_row where source_row."plan_key" = target_row."plan_key")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_120', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."venues" source_row
      where (source_row."association_id" is not null) and not exists (select 1 from "public"."associations" target_row where source_row."association_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_121', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."venues" source_row
      where (source_row."country_id" is not null) and not exists (select 1 from "public"."countries" target_row where source_row."country_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_122', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."appointment_id" is not null) and not exists (select 1 from "public"."appointments" target_row where source_row."appointment_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_123', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."checkin_id" is not null) and not exists (select 1 from "public"."performance_checkins" target_row where source_row."checkin_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_FK_124', 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from "public"."wellness_logs" source_row
      where (source_row."fixture_id" is not null) and not exists (select 1 from "public"."fixtures" target_row where source_row."fixture_id" = target_row."id")) aggregate_result
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_NULLABILITY_001', 'result', case when pg_catalog.count(*) filter (where "payload_hash" is null)=0 then 'PASS' else 'BLOCKER' end,
      'total_rows', pg_catalog.count(*)::bigint,
      'null_count', pg_catalog.count(*) filter (where "payload_hash" is null)::bigint)
    from "public"."exam_results"
    union all
    select pg_catalog.jsonb_build_object(
      'id', 'PCE_NULLABILITY_002', 'result', case when pg_catalog.count(*) filter (where "exam_session_id" is null)=0 then 'PASS' else 'BLOCKER' end,
      'total_rows', pg_catalog.count(*)::bigint,
      'null_count', pg_catalog.count(*) filter (where "exam_session_id" is null)::bigint)
    from "public"."exam_results"
    ) evidence_metrics(metric))
  );
$pre_cutover$;
alter function reflab_audit.pre_cutover_evidence_snapshot_v1() owner to "reflab_pre_cutover_evidence_owner";
revoke all on function reflab_audit.pre_cutover_evidence_snapshot_v1() from public, anon, authenticated, service_role, reflab_rls_owner, reflab_preflight_audit_owner;
grant execute on function reflab_audit.pre_cutover_evidence_snapshot_v1() to reflab_prod_preflight_ro;

do $postconditions$
declare role_state record;
begin
  select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole into role_state from pg_catalog.pg_roles where rolname='reflab_pre_cutover_evidence_owner';
  if not found or role_state.rolcanlogin or role_state.rolinherit or role_state.rolbypassrls or role_state.rolsuper or role_state.rolcreatedb or role_state.rolcreaterole then
    raise exception 'Pre-cutover evidence owner is unsafe' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid in (m.roleid,m.member) where r.rolname='reflab_pre_cutover_evidence_owner') then
    raise exception 'Pre-cutover evidence owner membership is unsafe' using errcode='55000';
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
    raise exception 'Pre-cutover evidence boundary source drifted' using errcode='55000';
  end if;
  if not pg_catalog.has_function_privilege('reflab_prod_preflight_ro','reflab_audit.pre_cutover_evidence_snapshot_v1()','EXECUTE')
     or exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl
       where p.oid=pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') and acl.grantee=0 and acl.privilege_type='EXECUTE')
     or pg_catalog.has_function_privilege('anon','reflab_audit.pre_cutover_evidence_snapshot_v1()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','reflab_audit.pre_cutover_evidence_snapshot_v1()','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','reflab_audit.pre_cutover_evidence_snapshot_v1()','EXECUTE') then
    raise exception 'Pre-cutover evidence boundary ACL is unsafe' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence changed adoption markers' using errcode='55000';
  end if;
end $postconditions$;
commit;
