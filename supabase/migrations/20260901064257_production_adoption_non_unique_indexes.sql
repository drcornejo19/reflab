-- Production adoption Phase 4B Wave 2: confirmed non-unique indexes only.
-- Lock model: transactional CREATE INDEX with bounded waits and atomic rollback.
-- No UNIQUE, constraint, trigger, function replacement, DROP, or runtime cutover.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

do $preflight$
declare
  expected_index record;
  named_oid oid;
  exact_match boolean;
  equivalent_count integer;
  provider_comment text;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order=4 and phase_key='canonical_objects')
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Reviewed adoption state is required for Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or (select pg_catalog.count(*) from pg_catalog.pg_proc routine
         where pg_catalog.obj_description(routine.oid,'pg_proc')='reflab:production_adoption_provider=20260901064253') <> 16 then
    raise exception 'Phase 2A sidecar and Wave 1 helpers are required for Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or exists (select 1 from pg_catalog.unnest(array[
       'public.resolve_development_clerk_identity(text)',
       'public.link_development_clerk_identity(text)',
       'public.link_development_super_admin_clerk_identity(text)']::text[]) forbidden(signature)
       where pg_catalog.to_regprocedure(forbidden.signature) is not null) then
    raise exception 'Development-only identity infrastructure is forbidden in Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regclass('public.clips_sport_topic_idx') is not null
     or pg_catalog.to_regclass('public.clips_sport_topic_active_idx') is null
     or not exists (
       select 1 from pg_catalog.pg_index renamed_index
       join pg_catalog.pg_class index_relation on index_relation.oid=renamed_index.indexrelid
       join pg_catalog.pg_class table_relation on table_relation.oid=renamed_index.indrelid
       join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
       where index_relation.oid=pg_catalog.to_regclass('public.clips_sport_topic_active_idx')
         and renamed_index.indrelid=pg_catalog.to_regclass('public.clips')
         and not renamed_index.indisunique and renamed_index.indisvalid and renamed_index.indisready and renamed_index.indislive
         and renamed_index.indpred is null and renamed_index.indexprs is null
         and renamed_index.indnkeyatts=3 and renamed_index.indnatts=3 and access_method.amname='btree'
         and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
              from pg_catalog.unnest(renamed_index.indkey::smallint[]) with ordinality key_position(attnum,ordinality)
              join pg_catalog.pg_attribute attribute on attribute.attrelid=renamed_index.indrelid and attribute.attnum=key_position.attnum)
             = array['sport_type','topic','is_active']::text[]
         and not exists (select 1 from pg_catalog.unnest(renamed_index.indclass::oid[]) class_oid
                         join pg_catalog.pg_opclass opclass on opclass.oid=class_oid where not opclass.opcdefault)
     ) then
    raise exception 'Reviewed renamed clips index is not equivalent' using errcode='55000';
  end if;

  for expected_index in
    select * from (values
    ('public.attempts', 'attempts_exam_result_idx', array['exam_result_id','created_at']::text[], array[false,false]::boolean[], 'create index attempts_exam_result_idx on public.attempts using btree (exam_result_id, created_at)'),
    ('public.attempts', 'attempts_sport_topic_created_idx', array['sport_type','topic','created_at']::text[], array[false,false,true]::boolean[], 'create index attempts_sport_topic_created_idx on public.attempts using btree (sport_type, topic, created_at desc)'),
    ('public.capability_overrides', 'capability_overrides_user_validity_idx', array['user_id','valid_from','valid_until']::text[], array[false,false,false]::boolean[], 'create index capability_overrides_user_validity_idx on public.capability_overrides using btree (user_id, valid_from, valid_until)'),
    ('public.clips', 'clips_mode_created_idx', array['mode','created_at']::text[], array[false,true]::boolean[], 'create index clips_mode_created_idx on public.clips using btree (mode, created_at desc)'),
    ('public.fixture_sync_logs', 'fixture_sync_logs_provider_created_idx', array['provider','created_at']::text[], array[false,true]::boolean[], 'create index fixture_sync_logs_provider_created_idx on public.fixture_sync_logs using btree (provider, created_at desc)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_group_idx', array['group_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_group_idx on public.institution_assessment_assignments using btree (group_id, status)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_user_idx', array['user_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_user_idx on public.institution_assessment_assignments using btree (user_id, status)'),
    ('public.institution_assessment_feedback', 'institution_assessment_feedback_session_idx', array['session_id','created_at']::text[], array[false,false]::boolean[], 'create index institution_assessment_feedback_session_idx on public.institution_assessment_feedback using btree (session_id, created_at)'),
    ('public.institution_assessment_history', 'institution_assessment_history_assessment_idx', array['assessment_id','created_at']::text[], array[false,true]::boolean[], 'create index institution_assessment_history_assessment_idx on public.institution_assessment_history using btree (assessment_id, created_at desc)'),
    ('public.institution_assessment_items', 'institution_assessment_items_assessment_idx', array['assessment_id','sort_order']::text[], array[false,false]::boolean[], 'create index institution_assessment_items_assessment_idx on public.institution_assessment_items using btree (assessment_id, sort_order)'),
    ('public.institution_assessments', 'institution_assessments_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_assessments_tenant_status_idx on public.institution_assessments using btree (institution_id, status, sport_type)'),
    ('public.institution_cohorts', 'institution_cohorts_tenant_status_idx', array['institution_id','status']::text[], array[false,false]::boolean[], 'create index institution_cohorts_tenant_status_idx on public.institution_cohorts using btree (institution_id, status)'),
    ('public.institution_content_assignments', 'institution_content_assignments_group_idx', array['group_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_group_idx on public.institution_content_assignments using btree (group_id, due_at)'),
    ('public.institution_content_assignments', 'institution_content_assignments_user_idx', array['user_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_user_idx on public.institution_content_assignments using btree (user_id, due_at)'),
    ('public.institution_contents', 'institution_contents_tenant_status_idx', array['institution_id','status','sport_type','created_at']::text[], array[false,false,false,true]::boolean[], 'create index institution_contents_tenant_status_idx on public.institution_contents using btree (institution_id, status, sport_type, created_at desc)'),
    ('public.institution_data_consents', 'institution_data_consents_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_data_consents_user_idx on public.institution_data_consents using btree (user_id, institution_id)'),
    ('public.institution_groups', 'institution_groups_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_groups_tenant_status_idx on public.institution_groups using btree (institution_id, status, sport_type)'),
    ('public.institution_members', 'institution_members_legacy_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_members_legacy_user_idx on public.institution_members using btree (user_id, institution_id)'),
    ('public.institution_membership_permission_overrides', 'institution_permission_overrides_tenant_idx', array['institution_id','membership_id']::text[], array[false,false]::boolean[], 'create index institution_permission_overrides_tenant_idx on public.institution_membership_permission_overrides using btree (institution_id, membership_id)'),
    ('public.institution_memberships', 'institution_memberships_tenant_status_idx', array['institution_id','status','user_id']::text[], array[false,false,false]::boolean[], 'create index institution_memberships_tenant_status_idx on public.institution_memberships using btree (institution_id, status, user_id)'),
    ('public.institution_notification_campaigns', 'institution_notification_campaigns_status_idx', array['institution_id','status','scheduled_for']::text[], array[false,false,false]::boolean[], 'create index institution_notification_campaigns_status_idx on public.institution_notification_campaigns using btree (institution_id, status, scheduled_for)'),
    ('public.institution_subscriptions', 'institution_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index institution_subscriptions_plan_status_idx on public.institution_subscriptions using btree (plan_key, status, ends_at)'),
    ('public.institutional_clips', 'institutional_clips_institution_status_idx', array['institution_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index institutional_clips_institution_status_idx on public.institutional_clips using btree (institution_id, status, created_at desc)'),
    ('public.institutional_clips', 'institutional_clips_sport_topic_idx', array['sport_type','topic']::text[], array[false,false]::boolean[], 'create index institutional_clips_sport_topic_idx on public.institutional_clips using btree (sport_type, topic)'),
    ('public.notification_events', 'notification_events_user_status_idx', array['user_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index notification_events_user_status_idx on public.notification_events using btree (user_id, status, created_at desc)'),
    ('public.notification_tokens', 'notification_tokens_user_enabled_idx', array['user_id','enabled']::text[], array[false,false]::boolean[], 'create index notification_tokens_user_enabled_idx on public.notification_tokens using btree (user_id, enabled)'),
    ('public.psychology_checkins', 'psychology_checkins_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_checkins_user_module_created_idx on public.psychology_checkins using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_exercise_sessions', 'psychology_exercises_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_exercises_user_module_created_idx on public.psychology_exercise_sessions using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_wellbeing_assessments', 'psychology_wellbeing_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_wellbeing_user_module_created_idx on public.psychology_wellbeing_assessments using btree (user_id, module_slug, created_at desc)'),
    ('public.user_global_roles', 'user_global_roles_role_idx', array['role_key']::text[], array[false]::boolean[], 'create index user_global_roles_role_idx on public.user_global_roles using btree (role_key)'),
    ('public.user_roles', 'user_roles_institution_idx', array['institution_id','role']::text[], array[false,false]::boolean[], 'create index user_roles_institution_idx on public.user_roles using btree (institution_id, role)'),
    ('public.user_subscriptions', 'user_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index user_subscriptions_plan_status_idx on public.user_subscriptions using btree (plan_key, status, ends_at)')
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    if pg_catalog.to_regclass(expected_index.table_name) is null then
      raise exception 'Wave 2 prerequisite table is missing: %', expected_index.table_name using errcode='55000';
    end if;
    if exists (select 1 from pg_catalog.unnest(expected_index.key_columns) required(column_name)
               where not exists (select 1 from pg_catalog.pg_attribute attribute
                 where attribute.attrelid=pg_catalog.to_regclass(expected_index.table_name)
                   and attribute.attname=required.column_name and attribute.attnum>0 and not attribute.attisdropped)) then
      raise exception 'Wave 2 prerequisite column is missing: %', expected_index.index_name using errcode='55000';
    end if;

    named_oid := pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name);
    exact_match := false;
    provider_comment := null;
    if named_oid is not null then
      select exists (
        select 1 from pg_catalog.pg_index catalog_index
        join pg_catalog.pg_class index_relation on index_relation.oid=catalog_index.indexrelid
        join pg_catalog.pg_class table_relation on table_relation.oid=catalog_index.indrelid
        join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
        where catalog_index.indexrelid=named_oid and catalog_index.indrelid = pg_catalog.to_regclass(expected_index.table_name)
      and not catalog_index.indisunique
      and catalog_index.indisvalid and catalog_index.indisready and catalog_index.indislive
      and not catalog_index.indisclustered and not catalog_index.indisreplident
      and catalog_index.indpred is null and catalog_index.indexprs is null
      and catalog_index.indnkeyatts = pg_catalog.array_length(expected_index.key_columns, 1)
      and catalog_index.indnatts = catalog_index.indnkeyatts
      and not catalog_index.indnullsnotdistinct
      and access_method.amname = 'btree'
      and index_relation.relowner = table_relation.relowner
      and not exists (select 1 from pg_catalog.pg_constraint constraint_row where constraint_row.conindid = catalog_index.indexrelid)
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
           from pg_catalog.unnest(catalog_index.indkey::smallint[]) with ordinality key_position(attnum, ordinality)
           join pg_catalog.pg_attribute attribute on attribute.attrelid=catalog_index.indrelid and attribute.attnum=key_position.attnum
           where key_position.ordinality <= catalog_index.indnkeyatts) = expected_index.key_columns
      and (select pg_catalog.array_agg((option_position.option_value & 1)=1 order by option_position.ordinality)
           from pg_catalog.unnest(catalog_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= catalog_index.indnkeyatts) = expected_index.descending
      and (select pg_catalog.array_agg((option_position.option_value & 2)=2 order by option_position.ordinality)
           from pg_catalog.unnest(catalog_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= catalog_index.indnkeyatts) = expected_index.descending
      and not exists (
        select 1 from pg_catalog.unnest(catalog_index.indclass::oid[]) with ordinality class_position(opclass_oid, ordinality)
        join pg_catalog.pg_opclass opclass on opclass.oid=class_position.opclass_oid
        where class_position.ordinality <= catalog_index.indnkeyatts and not opclass.opcdefault
      )
      and not exists (
        select 1
        from pg_catalog.unnest(catalog_index.indkey::smallint[]) with ordinality key_collation_position(attnum, ordinality)
        join pg_catalog.unnest(catalog_index.indcollation::oid[]) with ordinality index_collation_position(collation_oid, ordinality)
          on index_collation_position.ordinality=key_collation_position.ordinality
        join pg_catalog.pg_attribute attribute on attribute.attrelid=catalog_index.indrelid and attribute.attnum=key_collation_position.attnum
        where key_collation_position.ordinality <= catalog_index.indnkeyatts
          and (index_collation_position.collation_oid is distinct from attribute.attcollation
            or (index_collation_position.collation_oid <> 0 and not exists (
              select 1 from pg_catalog.pg_collation collation_row
              where collation_row.oid=index_collation_position.collation_oid
            )))
      )
      ), pg_catalog.obj_description(named_oid,'pg_class') into exact_match, provider_comment;
      if not exact_match then
        raise exception 'Wave 2 named index contract drift: %', expected_index.index_name using errcode='55000';
      end if;
      if provider_comment is distinct from 'reflab:production_adoption_provider=20260901064257' then
        raise exception 'Wave 2 provider conflict: %', expected_index.index_name using errcode='55000';
      end if;
    else
      select pg_catalog.count(*) into equivalent_count
      from pg_catalog.pg_index candidate_index
      join pg_catalog.pg_class index_relation on index_relation.oid=candidate_index.indexrelid
      join pg_catalog.pg_class table_relation on table_relation.oid=candidate_index.indrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
      where candidate_index.indrelid = pg_catalog.to_regclass(expected_index.table_name)
      and not candidate_index.indisunique
      and candidate_index.indisvalid and candidate_index.indisready and candidate_index.indislive
      and not candidate_index.indisclustered and not candidate_index.indisreplident
      and candidate_index.indpred is null and candidate_index.indexprs is null
      and candidate_index.indnkeyatts = pg_catalog.array_length(expected_index.key_columns, 1)
      and candidate_index.indnatts = candidate_index.indnkeyatts
      and not candidate_index.indnullsnotdistinct
      and access_method.amname = 'btree'
      and index_relation.relowner = table_relation.relowner
      and not exists (select 1 from pg_catalog.pg_constraint constraint_row where constraint_row.conindid = candidate_index.indexrelid)
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
           from pg_catalog.unnest(candidate_index.indkey::smallint[]) with ordinality key_position(attnum, ordinality)
           join pg_catalog.pg_attribute attribute on attribute.attrelid=candidate_index.indrelid and attribute.attnum=key_position.attnum
           where key_position.ordinality <= candidate_index.indnkeyatts) = expected_index.key_columns
      and (select pg_catalog.array_agg((option_position.option_value & 1)=1 order by option_position.ordinality)
           from pg_catalog.unnest(candidate_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= candidate_index.indnkeyatts) = expected_index.descending
      and (select pg_catalog.array_agg((option_position.option_value & 2)=2 order by option_position.ordinality)
           from pg_catalog.unnest(candidate_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= candidate_index.indnkeyatts) = expected_index.descending
      and not exists (
        select 1 from pg_catalog.unnest(candidate_index.indclass::oid[]) with ordinality class_position(opclass_oid, ordinality)
        join pg_catalog.pg_opclass opclass on opclass.oid=class_position.opclass_oid
        where class_position.ordinality <= candidate_index.indnkeyatts and not opclass.opcdefault
      )
      and not exists (
        select 1
        from pg_catalog.unnest(candidate_index.indkey::smallint[]) with ordinality key_collation_position(attnum, ordinality)
        join pg_catalog.unnest(candidate_index.indcollation::oid[]) with ordinality index_collation_position(collation_oid, ordinality)
          on index_collation_position.ordinality=key_collation_position.ordinality
        join pg_catalog.pg_attribute attribute on attribute.attrelid=candidate_index.indrelid and attribute.attnum=key_collation_position.attnum
        where key_collation_position.ordinality <= candidate_index.indnkeyatts
          and (index_collation_position.collation_oid is distinct from attribute.attcollation
            or (index_collation_position.collation_oid <> 0 and not exists (
              select 1 from pg_catalog.pg_collation collation_row
              where collation_row.oid=index_collation_position.collation_oid
            )))
      );
      if equivalent_count <> 0 then
        raise exception 'Wave 2 equivalent index already exists under another name: %', expected_index.index_name using errcode='55000';
      end if;
    end if;
  end loop;
end
$preflight$;

do $install$
declare expected_index record;
begin
  for expected_index in
    select * from (values
    ('public.attempts', 'attempts_exam_result_idx', array['exam_result_id','created_at']::text[], array[false,false]::boolean[], 'create index attempts_exam_result_idx on public.attempts using btree (exam_result_id, created_at)'),
    ('public.attempts', 'attempts_sport_topic_created_idx', array['sport_type','topic','created_at']::text[], array[false,false,true]::boolean[], 'create index attempts_sport_topic_created_idx on public.attempts using btree (sport_type, topic, created_at desc)'),
    ('public.capability_overrides', 'capability_overrides_user_validity_idx', array['user_id','valid_from','valid_until']::text[], array[false,false,false]::boolean[], 'create index capability_overrides_user_validity_idx on public.capability_overrides using btree (user_id, valid_from, valid_until)'),
    ('public.clips', 'clips_mode_created_idx', array['mode','created_at']::text[], array[false,true]::boolean[], 'create index clips_mode_created_idx on public.clips using btree (mode, created_at desc)'),
    ('public.fixture_sync_logs', 'fixture_sync_logs_provider_created_idx', array['provider','created_at']::text[], array[false,true]::boolean[], 'create index fixture_sync_logs_provider_created_idx on public.fixture_sync_logs using btree (provider, created_at desc)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_group_idx', array['group_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_group_idx on public.institution_assessment_assignments using btree (group_id, status)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_user_idx', array['user_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_user_idx on public.institution_assessment_assignments using btree (user_id, status)'),
    ('public.institution_assessment_feedback', 'institution_assessment_feedback_session_idx', array['session_id','created_at']::text[], array[false,false]::boolean[], 'create index institution_assessment_feedback_session_idx on public.institution_assessment_feedback using btree (session_id, created_at)'),
    ('public.institution_assessment_history', 'institution_assessment_history_assessment_idx', array['assessment_id','created_at']::text[], array[false,true]::boolean[], 'create index institution_assessment_history_assessment_idx on public.institution_assessment_history using btree (assessment_id, created_at desc)'),
    ('public.institution_assessment_items', 'institution_assessment_items_assessment_idx', array['assessment_id','sort_order']::text[], array[false,false]::boolean[], 'create index institution_assessment_items_assessment_idx on public.institution_assessment_items using btree (assessment_id, sort_order)'),
    ('public.institution_assessments', 'institution_assessments_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_assessments_tenant_status_idx on public.institution_assessments using btree (institution_id, status, sport_type)'),
    ('public.institution_cohorts', 'institution_cohorts_tenant_status_idx', array['institution_id','status']::text[], array[false,false]::boolean[], 'create index institution_cohorts_tenant_status_idx on public.institution_cohorts using btree (institution_id, status)'),
    ('public.institution_content_assignments', 'institution_content_assignments_group_idx', array['group_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_group_idx on public.institution_content_assignments using btree (group_id, due_at)'),
    ('public.institution_content_assignments', 'institution_content_assignments_user_idx', array['user_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_user_idx on public.institution_content_assignments using btree (user_id, due_at)'),
    ('public.institution_contents', 'institution_contents_tenant_status_idx', array['institution_id','status','sport_type','created_at']::text[], array[false,false,false,true]::boolean[], 'create index institution_contents_tenant_status_idx on public.institution_contents using btree (institution_id, status, sport_type, created_at desc)'),
    ('public.institution_data_consents', 'institution_data_consents_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_data_consents_user_idx on public.institution_data_consents using btree (user_id, institution_id)'),
    ('public.institution_groups', 'institution_groups_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_groups_tenant_status_idx on public.institution_groups using btree (institution_id, status, sport_type)'),
    ('public.institution_members', 'institution_members_legacy_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_members_legacy_user_idx on public.institution_members using btree (user_id, institution_id)'),
    ('public.institution_membership_permission_overrides', 'institution_permission_overrides_tenant_idx', array['institution_id','membership_id']::text[], array[false,false]::boolean[], 'create index institution_permission_overrides_tenant_idx on public.institution_membership_permission_overrides using btree (institution_id, membership_id)'),
    ('public.institution_memberships', 'institution_memberships_tenant_status_idx', array['institution_id','status','user_id']::text[], array[false,false,false]::boolean[], 'create index institution_memberships_tenant_status_idx on public.institution_memberships using btree (institution_id, status, user_id)'),
    ('public.institution_notification_campaigns', 'institution_notification_campaigns_status_idx', array['institution_id','status','scheduled_for']::text[], array[false,false,false]::boolean[], 'create index institution_notification_campaigns_status_idx on public.institution_notification_campaigns using btree (institution_id, status, scheduled_for)'),
    ('public.institution_subscriptions', 'institution_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index institution_subscriptions_plan_status_idx on public.institution_subscriptions using btree (plan_key, status, ends_at)'),
    ('public.institutional_clips', 'institutional_clips_institution_status_idx', array['institution_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index institutional_clips_institution_status_idx on public.institutional_clips using btree (institution_id, status, created_at desc)'),
    ('public.institutional_clips', 'institutional_clips_sport_topic_idx', array['sport_type','topic']::text[], array[false,false]::boolean[], 'create index institutional_clips_sport_topic_idx on public.institutional_clips using btree (sport_type, topic)'),
    ('public.notification_events', 'notification_events_user_status_idx', array['user_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index notification_events_user_status_idx on public.notification_events using btree (user_id, status, created_at desc)'),
    ('public.notification_tokens', 'notification_tokens_user_enabled_idx', array['user_id','enabled']::text[], array[false,false]::boolean[], 'create index notification_tokens_user_enabled_idx on public.notification_tokens using btree (user_id, enabled)'),
    ('public.psychology_checkins', 'psychology_checkins_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_checkins_user_module_created_idx on public.psychology_checkins using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_exercise_sessions', 'psychology_exercises_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_exercises_user_module_created_idx on public.psychology_exercise_sessions using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_wellbeing_assessments', 'psychology_wellbeing_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_wellbeing_user_module_created_idx on public.psychology_wellbeing_assessments using btree (user_id, module_slug, created_at desc)'),
    ('public.user_global_roles', 'user_global_roles_role_idx', array['role_key']::text[], array[false]::boolean[], 'create index user_global_roles_role_idx on public.user_global_roles using btree (role_key)'),
    ('public.user_roles', 'user_roles_institution_idx', array['institution_id','role']::text[], array[false,false]::boolean[], 'create index user_roles_institution_idx on public.user_roles using btree (institution_id, role)'),
    ('public.user_subscriptions', 'user_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index user_subscriptions_plan_status_idx on public.user_subscriptions using btree (plan_key, status, ends_at)')
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    if pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name) is null then
      execute expected_index.ddl;
      execute pg_catalog.format('comment on index %I.%I is %L', pg_catalog.split_part(expected_index.table_name,'.',1), expected_index.index_name, 'reflab:production_adoption_provider=20260901064257');
    end if;
  end loop;
end
$install$;

do $postconditions$
declare expected_index record; exact_match boolean; exact_count integer := 0;
begin
  for expected_index in
    select * from (values
    ('public.attempts', 'attempts_exam_result_idx', array['exam_result_id','created_at']::text[], array[false,false]::boolean[], 'create index attempts_exam_result_idx on public.attempts using btree (exam_result_id, created_at)'),
    ('public.attempts', 'attempts_sport_topic_created_idx', array['sport_type','topic','created_at']::text[], array[false,false,true]::boolean[], 'create index attempts_sport_topic_created_idx on public.attempts using btree (sport_type, topic, created_at desc)'),
    ('public.capability_overrides', 'capability_overrides_user_validity_idx', array['user_id','valid_from','valid_until']::text[], array[false,false,false]::boolean[], 'create index capability_overrides_user_validity_idx on public.capability_overrides using btree (user_id, valid_from, valid_until)'),
    ('public.clips', 'clips_mode_created_idx', array['mode','created_at']::text[], array[false,true]::boolean[], 'create index clips_mode_created_idx on public.clips using btree (mode, created_at desc)'),
    ('public.fixture_sync_logs', 'fixture_sync_logs_provider_created_idx', array['provider','created_at']::text[], array[false,true]::boolean[], 'create index fixture_sync_logs_provider_created_idx on public.fixture_sync_logs using btree (provider, created_at desc)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_group_idx', array['group_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_group_idx on public.institution_assessment_assignments using btree (group_id, status)'),
    ('public.institution_assessment_assignments', 'institution_assessment_assignments_user_idx', array['user_id','status']::text[], array[false,false]::boolean[], 'create index institution_assessment_assignments_user_idx on public.institution_assessment_assignments using btree (user_id, status)'),
    ('public.institution_assessment_feedback', 'institution_assessment_feedback_session_idx', array['session_id','created_at']::text[], array[false,false]::boolean[], 'create index institution_assessment_feedback_session_idx on public.institution_assessment_feedback using btree (session_id, created_at)'),
    ('public.institution_assessment_history', 'institution_assessment_history_assessment_idx', array['assessment_id','created_at']::text[], array[false,true]::boolean[], 'create index institution_assessment_history_assessment_idx on public.institution_assessment_history using btree (assessment_id, created_at desc)'),
    ('public.institution_assessment_items', 'institution_assessment_items_assessment_idx', array['assessment_id','sort_order']::text[], array[false,false]::boolean[], 'create index institution_assessment_items_assessment_idx on public.institution_assessment_items using btree (assessment_id, sort_order)'),
    ('public.institution_assessments', 'institution_assessments_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_assessments_tenant_status_idx on public.institution_assessments using btree (institution_id, status, sport_type)'),
    ('public.institution_cohorts', 'institution_cohorts_tenant_status_idx', array['institution_id','status']::text[], array[false,false]::boolean[], 'create index institution_cohorts_tenant_status_idx on public.institution_cohorts using btree (institution_id, status)'),
    ('public.institution_content_assignments', 'institution_content_assignments_group_idx', array['group_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_group_idx on public.institution_content_assignments using btree (group_id, due_at)'),
    ('public.institution_content_assignments', 'institution_content_assignments_user_idx', array['user_id','due_at']::text[], array[false,false]::boolean[], 'create index institution_content_assignments_user_idx on public.institution_content_assignments using btree (user_id, due_at)'),
    ('public.institution_contents', 'institution_contents_tenant_status_idx', array['institution_id','status','sport_type','created_at']::text[], array[false,false,false,true]::boolean[], 'create index institution_contents_tenant_status_idx on public.institution_contents using btree (institution_id, status, sport_type, created_at desc)'),
    ('public.institution_data_consents', 'institution_data_consents_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_data_consents_user_idx on public.institution_data_consents using btree (user_id, institution_id)'),
    ('public.institution_groups', 'institution_groups_tenant_status_idx', array['institution_id','status','sport_type']::text[], array[false,false,false]::boolean[], 'create index institution_groups_tenant_status_idx on public.institution_groups using btree (institution_id, status, sport_type)'),
    ('public.institution_members', 'institution_members_legacy_user_idx', array['user_id','institution_id']::text[], array[false,false]::boolean[], 'create index institution_members_legacy_user_idx on public.institution_members using btree (user_id, institution_id)'),
    ('public.institution_membership_permission_overrides', 'institution_permission_overrides_tenant_idx', array['institution_id','membership_id']::text[], array[false,false]::boolean[], 'create index institution_permission_overrides_tenant_idx on public.institution_membership_permission_overrides using btree (institution_id, membership_id)'),
    ('public.institution_memberships', 'institution_memberships_tenant_status_idx', array['institution_id','status','user_id']::text[], array[false,false,false]::boolean[], 'create index institution_memberships_tenant_status_idx on public.institution_memberships using btree (institution_id, status, user_id)'),
    ('public.institution_notification_campaigns', 'institution_notification_campaigns_status_idx', array['institution_id','status','scheduled_for']::text[], array[false,false,false]::boolean[], 'create index institution_notification_campaigns_status_idx on public.institution_notification_campaigns using btree (institution_id, status, scheduled_for)'),
    ('public.institution_subscriptions', 'institution_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index institution_subscriptions_plan_status_idx on public.institution_subscriptions using btree (plan_key, status, ends_at)'),
    ('public.institutional_clips', 'institutional_clips_institution_status_idx', array['institution_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index institutional_clips_institution_status_idx on public.institutional_clips using btree (institution_id, status, created_at desc)'),
    ('public.institutional_clips', 'institutional_clips_sport_topic_idx', array['sport_type','topic']::text[], array[false,false]::boolean[], 'create index institutional_clips_sport_topic_idx on public.institutional_clips using btree (sport_type, topic)'),
    ('public.notification_events', 'notification_events_user_status_idx', array['user_id','status','created_at']::text[], array[false,false,true]::boolean[], 'create index notification_events_user_status_idx on public.notification_events using btree (user_id, status, created_at desc)'),
    ('public.notification_tokens', 'notification_tokens_user_enabled_idx', array['user_id','enabled']::text[], array[false,false]::boolean[], 'create index notification_tokens_user_enabled_idx on public.notification_tokens using btree (user_id, enabled)'),
    ('public.psychology_checkins', 'psychology_checkins_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_checkins_user_module_created_idx on public.psychology_checkins using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_exercise_sessions', 'psychology_exercises_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_exercises_user_module_created_idx on public.psychology_exercise_sessions using btree (user_id, module_slug, created_at desc)'),
    ('public.psychology_wellbeing_assessments', 'psychology_wellbeing_user_module_created_idx', array['user_id','module_slug','created_at']::text[], array[false,false,true]::boolean[], 'create index psychology_wellbeing_user_module_created_idx on public.psychology_wellbeing_assessments using btree (user_id, module_slug, created_at desc)'),
    ('public.user_global_roles', 'user_global_roles_role_idx', array['role_key']::text[], array[false]::boolean[], 'create index user_global_roles_role_idx on public.user_global_roles using btree (role_key)'),
    ('public.user_roles', 'user_roles_institution_idx', array['institution_id','role']::text[], array[false,false]::boolean[], 'create index user_roles_institution_idx on public.user_roles using btree (institution_id, role)'),
    ('public.user_subscriptions', 'user_subscriptions_plan_status_idx', array['plan_key','status','ends_at']::text[], array[false,false,false]::boolean[], 'create index user_subscriptions_plan_status_idx on public.user_subscriptions using btree (plan_key, status, ends_at)')
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    select exists (
      select 1 from pg_catalog.pg_index catalog_index
      join pg_catalog.pg_class index_relation on index_relation.oid=catalog_index.indexrelid
      join pg_catalog.pg_class table_relation on table_relation.oid=catalog_index.indrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
      where catalog_index.indexrelid=pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name)
        and catalog_index.indrelid = pg_catalog.to_regclass(expected_index.table_name)
      and not catalog_index.indisunique
      and catalog_index.indisvalid and catalog_index.indisready and catalog_index.indislive
      and not catalog_index.indisclustered and not catalog_index.indisreplident
      and catalog_index.indpred is null and catalog_index.indexprs is null
      and catalog_index.indnkeyatts = pg_catalog.array_length(expected_index.key_columns, 1)
      and catalog_index.indnatts = catalog_index.indnkeyatts
      and not catalog_index.indnullsnotdistinct
      and access_method.amname = 'btree'
      and index_relation.relowner = table_relation.relowner
      and not exists (select 1 from pg_catalog.pg_constraint constraint_row where constraint_row.conindid = catalog_index.indexrelid)
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
           from pg_catalog.unnest(catalog_index.indkey::smallint[]) with ordinality key_position(attnum, ordinality)
           join pg_catalog.pg_attribute attribute on attribute.attrelid=catalog_index.indrelid and attribute.attnum=key_position.attnum
           where key_position.ordinality <= catalog_index.indnkeyatts) = expected_index.key_columns
      and (select pg_catalog.array_agg((option_position.option_value & 1)=1 order by option_position.ordinality)
           from pg_catalog.unnest(catalog_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= catalog_index.indnkeyatts) = expected_index.descending
      and (select pg_catalog.array_agg((option_position.option_value & 2)=2 order by option_position.ordinality)
           from pg_catalog.unnest(catalog_index.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= catalog_index.indnkeyatts) = expected_index.descending
      and not exists (
        select 1 from pg_catalog.unnest(catalog_index.indclass::oid[]) with ordinality class_position(opclass_oid, ordinality)
        join pg_catalog.pg_opclass opclass on opclass.oid=class_position.opclass_oid
        where class_position.ordinality <= catalog_index.indnkeyatts and not opclass.opcdefault
      )
      and not exists (
        select 1
        from pg_catalog.unnest(catalog_index.indkey::smallint[]) with ordinality key_collation_position(attnum, ordinality)
        join pg_catalog.unnest(catalog_index.indcollation::oid[]) with ordinality index_collation_position(collation_oid, ordinality)
          on index_collation_position.ordinality=key_collation_position.ordinality
        join pg_catalog.pg_attribute attribute on attribute.attrelid=catalog_index.indrelid and attribute.attnum=key_collation_position.attnum
        where key_collation_position.ordinality <= catalog_index.indnkeyatts
          and (index_collation_position.collation_oid is distinct from attribute.attcollation
            or (index_collation_position.collation_oid <> 0 and not exists (
              select 1 from pg_catalog.pg_collation collation_row
              where collation_row.oid=index_collation_position.collation_oid
            )))
      )
        and pg_catalog.obj_description(catalog_index.indexrelid,'pg_class')='reflab:production_adoption_provider=20260901064257'
    ) into exact_match;
    if not exact_match then
      raise exception 'Wave 2 index postcondition failed: %', expected_index.index_name using errcode='55000';
    end if;
    exact_count := exact_count + 1;
  end loop;
  if exact_count <> 32
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception 'Wave 2 disabled-runtime or ledger invariant failed' using errcode='55000';
  end if;
end
$postconditions$;

commit;
