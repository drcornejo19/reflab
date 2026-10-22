-- Production adoption reconciliation executed explicitly between 310002 and 310003.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  target_table text;
begin
  if pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'Psychology module reconciliation requires PostgreSQL 17'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 2
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or not exists (
       select 1 from reflab_meta.production_adoption_state state
       where state.phase_order = 1
         and state.phase_key = 'foundation'
         and state.previous_phase_key is null
         and state.plan_version = 'production_adoption_bridge_v1'
         and state.plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
         and state.evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
     )
     or not exists (
       select 1 from reflab_meta.production_adoption_state state
       where state.phase_order = 2
         and state.phase_key = 'exam_training_prerequisites'
         and state.previous_phase_key = 'foundation'
         and state.plan_version = 'production_adoption_bridge_v1'
         and state.plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
         and state.evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
     ) then
    raise exception 'Reviewed 310002 adoption state is required'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('public.psychology_modules') is not null
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or exists (select 1 from pg_catalog.pg_namespace where nspname = 'reflab_audit')
     or exists (
       select 1 from pg_catalog.pg_attribute attribute
       where attribute.attrelid = pg_catalog.to_regclass('public.notification_events')
         and attribute.attname = 'deduplication_key'
         and attribute.attnum > 0
         and not attribute.attisdropped
     )
     or pg_catalog.to_regclass('public.notification_events_deduplication_unique') is not null then
    raise exception '310003 or later adoption infrastructure is already present'
      using errcode = '55000';
  end if;

  foreach target_table in array array[
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ] loop
    if pg_catalog.to_regclass('public.' || target_table) is null then
      raise exception 'Psychology reconciliation dependency is missing: %', target_table
        using errcode = '55000';
    end if;

    if not exists (
      select 1 from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass('public.' || target_table)
        and relation.relkind in ('r', 'p')
        and pg_catalog.pg_get_userbyid(relation.relowner) = current_user
    ) then
      raise exception 'Installer does not own Psychology dependency: %', target_table
        using errcode = '42501';
    end if;

    if exists (
      select 1 from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass('public.' || target_table)
        and attribute.attname = 'module_slug'
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Psychology module_slug target already exists: %', target_table
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.psychology_checkins'::pg_catalog.regclass
      and attribute.attname = 'checkin_type'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
      and attribute.attnotnull
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.psychology_exercise_sessions'::pg_catalog.regclass
      and attribute.attname = 'exercise_type'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
      and attribute.attnotnull
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'Psychology reconciliation source column contract drifted'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.attempts) <> 37
     or (select pg_catalog.count(*) from public.exam_results) <> 6
     or (select pg_catalog.count(*) from public.notification_events) <> 60 then
    raise exception 'Historical product fingerprint drifted before Psychology reconciliation'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.psychology_checkins) <> 3
     or (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'error_recovery') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'post_match') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'pre_match') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where checkin_type is null) <> 0
     or (select pg_catalog.count(*) from public.psychology_checkins
           where checkin_type not in ('error_recovery', 'post_match', 'pre_match')) <> 0
     or (select pg_catalog.count(*) from public.psychology_wellbeing_assessments) <> 0
     or (select pg_catalog.count(*) from public.psychology_exercise_sessions) <> 0 then
    raise exception 'Reviewed Psychology reconciliation evidence drifted'
      using errcode = '55000';
  end if;
end
$preflight$;

alter table public.psychology_checkins add column module_slug text;
alter table public.psychology_wellbeing_assessments add column module_slug text;
alter table public.psychology_exercise_sessions add column module_slug text;

do $backfill$
declare
  affected integer;
  affected_total integer := 0;
begin
  update public.psychology_checkins
  set module_slug = 'gestion-error'
  where checkin_type = 'error_recovery'
    and module_slug is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one error_recovery Psychology row, updated %', affected
      using errcode = '55000';
  end if;
  affected_total := affected_total + affected;

  update public.psychology_checkins
  set module_slug = 'evaluacion-post-partido'
  where checkin_type = 'post_match'
    and module_slug is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one post_match Psychology row, updated %', affected
      using errcode = '55000';
  end if;
  affected_total := affected_total + affected;

  update public.psychology_checkins
  set module_slug = 'preparacion-mental-pre-partido'
  where checkin_type = 'pre_match'
    and module_slug is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one pre_match Psychology row, updated %', affected
      using errcode = '55000';
  end if;
  affected_total := affected_total + affected;

  if affected_total <> 3 then
    raise exception 'Psychology reconciliation must update exactly three rows, updated %', affected_total
      using errcode = '55000';
  end if;
end
$backfill$;

do $assertions$
declare
  target_table text;
begin
  foreach target_table in array array[
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute attribute
      left join pg_catalog.pg_attrdef default_record
        on default_record.adrelid = attribute.attrelid
       and default_record.adnum = attribute.attnum
      where attribute.attrelid = pg_catalog.to_regclass('public.' || target_table)
        and attribute.attname = 'module_slug'
        and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        and not attribute.attnotnull
        and attribute.attidentity = ''
        and attribute.attgenerated = ''
        and attribute.attnum > 0
        and not attribute.attisdropped
        and default_record.oid is null
    ) then
      raise exception 'Psychology module_slug postcondition failed: %', target_table
        using errcode = '55000';
    end if;
  end loop;

  if (select pg_catalog.count(*) from public.psychology_checkins) <> 3
     or (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'gestion-error') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'evaluacion-post-partido') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'preparacion-mental-pre-partido') <> 1
     or (select pg_catalog.count(*) from public.psychology_checkins where module_slug is null) <> 0
     or (select pg_catalog.count(*) from public.psychology_checkins
           where module_slug not in (
             'gestion-error',
             'evaluacion-post-partido',
             'preparacion-mental-pre-partido'
           )) <> 0
     or (select pg_catalog.count(*) from public.psychology_wellbeing_assessments) <> 0
     or (select pg_catalog.count(*) from public.psychology_exercise_sessions) <> 0 then
    raise exception 'Psychology reconciliation data postcondition failed'
      using errcode = '55000';
  end if;

  if (select pg_catalog.count(*) from public.attempts) <> 37
     or (select pg_catalog.count(*) from public.exam_results) <> 6
     or (select pg_catalog.count(*) from public.notification_events) <> 60
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 2
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or pg_catalog.to_regclass('public.psychology_modules') is not null
     or exists (select 1 from pg_catalog.pg_namespace where nspname = 'reflab_audit') then
    raise exception 'Psychology reconciliation protected state changed'
      using errcode = '55000';
  end if;
end
$assertions$;

commit;
