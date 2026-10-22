-- Phase 4B Wave 3 is a read-only reconciliation gate. The reviewed historical
-- triggers are reused in place; this file intentionally performs no schema DDL.
begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $phase4b_wave3_gate$
declare
  expected_function record;
  expected_trigger record;
  actual_trigger record;
  matching_count integer;
  effective_count integer;
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception using errcode='55000', message='Wave 3 requires an absent canonical marker';
  end if;
  if not exists (
    select 1 from reflab_meta.production_adoption_state
    where phase_key='canonical_objects' and phase_order=4
  ) or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception using errcode='55000', message='Wave 3 adoption prerequisite is missing';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
      or (select pg_catalog.count(*) from pg_catalog.pg_proc
          where pg_catalog.obj_description(oid,'pg_proc')='reflab:production_adoption_provider=20260901064253') <> 16
      or (select pg_catalog.count(*) from pg_catalog.pg_class
          where relkind='i' and pg_catalog.obj_description(oid,'pg_class')='reflab:production_adoption_provider=20260901064257') <> 32 then
    raise exception using errcode='55000', message='Wave 3 adoption prerequisite is missing';
  end if;
  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
      or exists (
        select 1 from pg_catalog.unnest(array['public.resolve_development_clerk_identity(text)','public.link_development_clerk_identity(text)','public.link_development_super_admin_clerk_identity(text)']::text[]) signature
        where pg_catalog.to_regprocedure(signature) is not null
      ) then
    raise exception using errcode='55000', message='Wave 3 forbids Development-only objects';
  end if;

  for expected_function in
    select * from (values
(
    'public.set_updated_at()', 'trigger', 'plpgsql',
    'v', false, false, 'postgres',
    array[]::text[], '5eec1929897ca2ec25d6a2c88b2fd8c37e847f7229681f2314151d11ceca9d12'
  ),
(
    'public.set_coach_updated_at()', 'trigger', 'plpgsql',
    'v', false, false, 'postgres',
    array['search_path=public']::text[], '5eec1929897ca2ec25d6a2c88b2fd8c37e847f7229681f2314151d11ceca9d12'
  )
    ) contract(signature, return_type, language_name, volatility, strict_mode, security_definer, owner_name, configuration, source_hash)
  loop
    select pg_catalog.count(*) into matching_count
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid=routine.pronamespace
    where namespace.nspname=pg_catalog.split_part(expected_function.signature,'.',1)
      and routine.proname=pg_catalog.split_part(pg_catalog.split_part(expected_function.signature,'.',2),'(',1);
    if matching_count <> 1 then
      raise exception using errcode='55000', message='Reviewed updated_at helper overload contract drift';
    end if;
    if not exists (
      select 1
      from pg_catalog.pg_proc routine
      join pg_catalog.pg_language language_row on language_row.oid=routine.prolang
      where routine.oid=pg_catalog.to_regprocedure(expected_function.signature)
        and pg_catalog.format_type(routine.prorettype,null)=expected_function.return_type
        and language_row.lanname=expected_function.language_name
        and routine.provolatile=expected_function.volatility
        and routine.proisstrict=expected_function.strict_mode
        and routine.prosecdef=expected_function.security_definer
        and pg_catalog.pg_get_userbyid(routine.proowner)=expected_function.owner_name
        and coalesce(routine.proconfig,array[]::text[])=expected_function.configuration
        and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
          pg_catalog.regexp_replace(routine.prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'
        ),'sha256'),'hex')=expected_function.source_hash
    ) then
      raise exception using errcode='55000', message='Reviewed updated_at helper contract drift';
    end if;
  end loop;

  for expected_trigger in
    select * from (values
(
    'public', 'appointments', 'appointments_set_updated_at',
    'set_appointments_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'associations', 'associations_set_updated_at',
    'set_associations_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'coach_data_consents', 'coach_data_consents_set_updated_at',
    'coach_data_consents_set_updated_at', 'public.set_coach_updated_at()'
  ),
(
    'public', 'competition_categories', 'competition_categories_set_updated_at',
    'set_competition_categories_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'competition_seasons', 'competition_seasons_set_updated_at',
    'set_competition_seasons_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'competitions', 'competitions_set_updated_at',
    'set_competitions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'countries', 'countries_set_updated_at',
    'set_countries_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'fixture_sync_logs', 'fixture_sync_logs_set_updated_at',
    'set_fixture_sync_logs_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'fixtures', 'fixtures_set_updated_at',
    'set_fixtures_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'ifab_library_documents', 'ifab_library_documents_set_updated_at',
    'set_ifab_library_documents_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_assessment_sessions', 'institution_assessment_sessions_set_updated_at',
    'set_institution_assessment_sessions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_assessments', 'institution_assessments_set_updated_at',
    'set_institution_assessments_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_cohorts', 'institution_cohorts_set_updated_at',
    'set_institution_cohorts_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_contents', 'institution_contents_set_updated_at',
    'set_institution_contents_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_data_consents', 'institution_data_consents_set_updated_at',
    'set_institution_data_consents_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_group_memberships', 'institution_group_memberships_set_updated_at',
    'set_institution_group_memberships_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_groups', 'institution_groups_set_updated_at',
    'set_institution_groups_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_members', 'institution_members_set_updated_at',
    'set_institution_members_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_membership_permission_overrides', 'institution_membership_permission_overrides_set_updated_at',
    'set_institution_membership_permission_overrides_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_memberships', 'institution_memberships_set_updated_at',
    'set_institution_memberships_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_notification_campaigns', 'institution_notification_campaigns_set_updated_at',
    'set_institution_notification_campaigns_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_notification_recipients', 'institution_notification_recipients_set_updated_at',
    'set_institution_notification_recipients_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_permissions', 'institution_permissions_set_updated_at',
    'set_institution_permissions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institution_roles', 'institution_roles_set_updated_at',
    'set_institution_roles_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institutional_clips', 'institutional_clips_set_updated_at',
    'set_institutional_clips_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institutional_leads', 'institutional_leads_set_updated_at',
    'set_institutional_leads_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'institutions', 'institutions_set_updated_at',
    'set_institutions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'match_context_snapshots', 'match_context_snapshots_set_updated_at',
    'set_match_context_snapshots_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'match_officials', 'match_officials_set_updated_at',
    'set_match_officials_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'match_preparations', 'match_preparations_set_updated_at',
    'set_match_preparations_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'performance_checkins', 'performance_checkins_set_updated_at',
    'set_performance_checkins_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'performance_sessions', 'performance_sessions_set_updated_at',
    'set_performance_sessions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'physical_tests', 'physical_tests_set_updated_at',
    'set_physical_tests_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'post_match_reviews', 'post_match_reviews_set_updated_at',
    'set_post_match_reviews_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'psychology_checkins', 'psychology_checkins_set_updated_at',
    'set_psychology_checkins_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'psychology_exercise_sessions', 'psychology_exercise_sessions_set_updated_at',
    'set_psychology_exercise_sessions_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'psychology_wellbeing_assessments', 'psychology_wellbeing_assessments_set_updated_at',
    'set_psychology_wellbeing_assessments_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'referee_eligibility', 'referee_eligibility_set_updated_at',
    'set_referee_eligibility_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'referee_roles', 'referee_roles_set_updated_at',
    'set_referee_roles_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'teams', 'teams_set_updated_at',
    'set_teams_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'user_profiles', 'user_profiles_set_updated_at',
    'set_user_profiles_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'user_roles', 'user_roles_set_updated_at',
    'set_user_roles_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'venues', 'venues_set_updated_at',
    'set_venues_updated_at', 'public.set_updated_at()'
  ),
(
    'public', 'wellness_logs', 'wellness_logs_set_updated_at',
    'set_wellness_logs_updated_at', 'public.set_updated_at()'
  )
    ) contract(schema_name, table_name, canonical_name, historical_name, function_signature)
  loop
    if pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name) is null then
      raise exception using errcode='55000', message='Wave 3 trigger prerequisite is missing';
    end if;
    select trigger_row.tgtype, trigger_row.tgenabled, trigger_row.tgqual,
      trigger_row.tgconstraint, function_namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' function_signature
    into actual_trigger
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=routine.pronamespace
    where namespace.nspname=expected_trigger.schema_name
      and relation.relname=expected_trigger.table_name
      and trigger_row.tgname=expected_trigger.historical_name
      and not trigger_row.tgisinternal;
    if not found or actual_trigger.tgtype <> 19 or actual_trigger.tgenabled <> 'O'
        or actual_trigger.tgqual is not null or actual_trigger.tgconstraint <> 0
        or actual_trigger.function_signature <> expected_trigger.function_signature then
      raise exception using errcode='55000', message='Reviewed updated_at trigger contract drift';
    end if;
    if expected_trigger.canonical_name <> expected_trigger.historical_name and exists (
      select 1 from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgrelid=pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name)
        and trigger_row.tgname=expected_trigger.canonical_name and not trigger_row.tgisinternal
    ) then
      raise exception using errcode='55000', message='Canonical trigger duplicate would cause double execution';
    end if;
    select pg_catalog.count(*) into effective_count
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    where trigger_row.tgrelid=pg_catalog.to_regclass(expected_trigger.schema_name || '.' || expected_trigger.table_name)
      and not trigger_row.tgisinternal and trigger_row.tgenabled <> 'D'
      and trigger_row.tgtype=19 and trigger_row.tgqual is null
      and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        pg_catalog.regexp_replace(routine.prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'
      ),'sha256'),'hex')=any(array['841260c0f06f596b48e6bdef7500aedef161a2b14eed6752f30f2635245f14f0','5eec1929897ca2ec25d6a2c88b2fd8c37e847f7229681f2314151d11ceca9d12']::text[]);
    if effective_count <> 1 then
      raise exception using errcode='55000', message='Updated_at trigger double execution contract drift';
    end if;
  end loop;

  for expected_trigger in
    select * from (values
(
    'public', 'institution_assessment_assignments', 'institution_assessment_assignments_validate_user',
    'validate_institution_assessment_assignments_tenant_links', 'public.validate_institution_tenant_links()'
  ),
(
    'public', 'institution_content_assignments', 'institution_content_assignments_validate_user',
    'validate_institution_content_assignments_tenant_links', 'public.validate_institution_tenant_links()'
  ),
(
    'public', 'institution_data_consents', 'institution_data_consents_validate_membership',
    'validate_institution_data_consents_tenant_links', 'public.validate_institution_tenant_links()'
  ),
(
    'public', 'institution_membership_roles', 'institution_membership_roles_validate_scope',
    'validate_institution_membership_roles_tenant_links', 'public.validate_institution_tenant_links()'
  ),
(
    'public', 'institution_notification_recipients', 'institution_notification_recipients_validate_user',
    'validate_institution_notification_recipients_tenant_links', 'public.validate_institution_tenant_links()'
  ),
(
    'public', 'institution_role_permissions', 'institution_role_permissions_validate_scope',
    'validate_institution_role_permissions_tenant_links', 'public.validate_institution_tenant_links()'
  )
    ) contract(schema_name, table_name, canonical_name, historical_name, function_signature)
  loop
    select trigger_row.tgtype, trigger_row.tgenabled, trigger_row.tgqual,
      trigger_row.tgconstraint, function_namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' function_signature
    into actual_trigger
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=routine.pronamespace
    where namespace.nspname=expected_trigger.schema_name
      and relation.relname=expected_trigger.table_name
      and trigger_row.tgname=expected_trigger.historical_name
      and not trigger_row.tgisinternal;
    if not found or actual_trigger.tgtype <> 23 or actual_trigger.tgenabled <> 'O'
        or actual_trigger.tgqual is not null or actual_trigger.tgconstraint <> 0
        or actual_trigger.function_signature <> expected_trigger.function_signature then
      raise exception using errcode='55000', message='Reviewed legacy validator trigger contract drift';
    end if;
  end loop;
end
$phase4b_wave3_gate$;

rollback;
