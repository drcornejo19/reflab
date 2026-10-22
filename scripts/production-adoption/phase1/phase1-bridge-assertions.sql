begin read only;
set local statement_timeout = '10s';

do $assertion$
begin
  if (select pg_catalog.count(*) from public.attempts) <> 37
     or (select pg_catalog.count(*) from public.exam_results) <> 6
     or (select pg_catalog.count(*) from public.notification_events) <> 60 then
    raise exception 'PHASE1_ASSERT_001_HISTORICAL_COUNTS' using errcode = 'P1001';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_001_HISTORICAL_COUNTS|PASS';

do $assertion$
begin
  if exists (
    select 1 from public.attempts
    where user_id !~ '^user_synthetic_[0-9]{3}$'
       or source_item_type is not null
       or source_item_id is not null
       or source_occurrence_id is not null
       or institution_assessment_session_id is not null
  ) or exists (
    select 1 from public.exam_results
    where user_id !~ '^user_synthetic_[0-9]{3}$'
       or exam_session_id is not null
       or payload_hash is not null
  ) or exists (
    select 1
    from public.notification_events
    where deduplication_key is not null
  ) or exists (
    with expected as (
      select
        'user_synthetic_' || pg_catalog.lpad(identity_number::text, 3, '0') as user_id,
        case when identity_number <= 8 then 5 else 4 end::bigint as event_count
      from pg_catalog.generate_series(1, 13) as identities(identity_number)
    ),
    actual as (
      select event.user_id, pg_catalog.count(*) as event_count
      from public.notification_events event
      group by event.user_id
    )
    select 1
    from expected
    full join actual using (user_id)
    where expected.event_count is distinct from actual.event_count
  ) then
    raise exception 'PHASE1_ASSERT_002_LEGACY_VALUES_PRESERVED' using errcode = 'P1002';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_002_LEGACY_VALUES_PRESERVED|PASS';

do $assertion$
begin
  if pg_catalog.to_regclass('public.referee_exam_sessions') is null
     or pg_catalog.to_regclass('public.psychology_modules') is null
     or pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'PHASE1_ASSERT_003_BRIDGE_OBJECT_CONTRACT' using errcode = 'P1003';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_003_BRIDGE_OBJECT_CONTRACT|PASS';

do $assertion$
begin
  if (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
     or (select pg_catalog.max(phase_order) from reflab_meta.production_adoption_state) <> 3
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from public.psychology_modules) <> 8 then
    raise exception 'PHASE1_ASSERT_004_ADOPTION_LEDGER_AND_MARKER' using errcode = 'P1004';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_004_ADOPTION_LEDGER_AND_MARKER|PASS';

do $assertion$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid in (
      'public.match_preparations'::pg_catalog.regclass,
      'public.post_match_reviews'::pg_catalog.regclass
    )
      and attribute.attname = 'fixture_id'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'PHASE1_ASSERT_005_MATCHES_APPOINTMENT_CONTRACT' using errcode = 'P1005';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_005_MATCHES_APPOINTMENT_CONTRACT|PASS';

do $assertion$
begin
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'canonical_payload_hash'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'PHASE1_ASSERT_006_CANONICAL_PAYLOAD_HASH_ABSENT' using errcode = 'P1006';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_006_CANONICAL_PAYLOAD_HASH_ABSENT|PASS';

do $assertion$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname in (
      'attempts_exam_source_check',
      'psychology_checkins_module_fk',
      'psychology_wellbeing_module_fk',
      'psychology_exercise_module_fk',
      'psychology_exercises_module_fk'
    )
  ) then
    raise exception 'PHASE1_ASSERT_007_CUTOVER_CONSTRAINTS_ABSENT' using errcode = 'P1007';
  end if;
end
$assertion$;
select 'PHASE1_ASSERT_007_CUTOVER_CONSTRAINTS_ABSENT|PASS';

do $assertion$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'reflab_meta.production_adoption_state',
    'reflab_meta.reflab_schema_state',
    'public.referee_exam_sessions',
    'public.psychology_modules'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass(relation_name)
        and relation.relrowsecurity
    ) then
      raise exception 'PHASE1_ASSERT_008_BRIDGE_TABLES_RLS_ENABLED' using errcode = 'P1008';
    end if;
  end loop;
end
$assertion$;
select 'PHASE1_ASSERT_008_BRIDGE_TABLES_RLS_ENABLED|PASS';

do $assertion$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'reflab_meta.production_adoption_state',
    'reflab_meta.reflab_schema_state',
    'public.referee_exam_sessions',
    'public.psychology_modules'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(relation.relacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
      where relation.oid = pg_catalog.to_regclass(relation_name)
        and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'reflab_rls_owner'))
    ) then
      raise exception 'PHASE1_ASSERT_009_BRIDGE_TABLES_APP_ACL_ABSENT' using errcode = 'P1009';
    end if;
  end loop;
end
$assertion$;
select 'PHASE1_ASSERT_009_BRIDGE_TABLES_APP_ACL_ABSENT|PASS';

select 'PHASE1_BRIDGE_LOCAL_PASS';
rollback;
