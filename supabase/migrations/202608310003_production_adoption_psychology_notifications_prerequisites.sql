-- Production adoption bridge, Phase 3/3. Adds closed catalog and nullable deduplication.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  allowed_modules constant text[] := array[
    'gestion-error',
    'presion-competitiva',
    'concentracion-foco',
    'confianza-arbitral',
    'resiliencia',
    'preparacion-mental-pre-partido',
    'evaluacion-post-partido',
    'sin-clasificar'
  ]::text[];
  psychology_table text;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 2
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or not exists (
       select 1 from reflab_meta.production_adoption_state state
       where state.phase_order = 2
         and state.phase_key = 'exam_training_prerequisites'
         and state.plan_version = 'production_adoption_bridge_v1'
         and state.plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
         and state.evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
     ) then
    raise exception 'Reviewed Exam/Training adoption phase is required'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('public.psychology_modules') is not null then
    raise exception 'psychology_modules no longer matches the audited absent state'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('public.notification_events') is null then
    raise exception 'notification_events is required'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class relation
    where relation.oid = 'public.notification_events'::pg_catalog.regclass
      and pg_catalog.pg_get_userbyid(relation.relowner) = current_user
  ) then
    raise exception 'Production adoption installer does not own notification_events'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.notification_events'::pg_catalog.regclass
      and attribute.attname = 'deduplication_key'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'notification_events.deduplication_key already exists unexpectedly'
      using errcode = '55000';
  end if;

  foreach psychology_table in array array[
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ] loop
    if pg_catalog.to_regclass('public.' || psychology_table) is null
       or not exists (
         select 1 from pg_catalog.pg_attribute attribute
         where attribute.attrelid = pg_catalog.to_regclass('public.' || psychology_table)
           and attribute.attname = 'module_slug'
           and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'text'
           and attribute.attnum > 0
           and not attribute.attisdropped
       ) then
      raise exception 'Psychology module dependency is missing or incompatible: %', psychology_table
        using errcode = '55000';
    end if;


    if not exists (
      select 1 from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass('public.' || psychology_table)
        and pg_catalog.pg_get_userbyid(relation.relowner) = current_user
    ) then
      raise exception 'Production adoption installer does not own Psychology table: %', psychology_table
        using errcode = '42501';
    end if;
  end loop;

  if exists (
    select 1 from public.psychology_checkins where module_slug is not null and not (module_slug = any (allowed_modules))
  ) or exists (
    select 1 from public.psychology_wellbeing_assessments where module_slug is not null and not (module_slug = any (allowed_modules))
  ) or exists (
    select 1 from public.psychology_exercise_sessions where module_slug is not null and not (module_slug = any (allowed_modules))
  ) then
    raise exception 'Unknown Psychology module slug requires a manual decision'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('reflab.adoption_notification_count', (select pg_catalog.count(*)::text from public.notification_events), true);
  perform pg_catalog.set_config('reflab.adoption_psychology_checkin_count', (select pg_catalog.count(*)::text from public.psychology_checkins), true);
  perform pg_catalog.set_config('reflab.adoption_psychology_wellbeing_count', (select pg_catalog.count(*)::text from public.psychology_wellbeing_assessments), true);
  perform pg_catalog.set_config('reflab.adoption_psychology_exercise_count', (select pg_catalog.count(*)::text from public.psychology_exercise_sessions), true);
end
$preflight$;

create table public.psychology_modules (
  slug text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.psychology_modules enable row level security;
revoke all on table public.psychology_modules
  from public, anon, authenticated, service_role, reflab_rls_owner;

insert into public.psychology_modules (slug, name, description, is_active, sort_order)
values
  ('gestion-error', 'Gestion del error', 'Recovery and learning after an error.', true, 10),
  ('presion-competitiva', 'Presion competitiva', 'Decision-making under competitive pressure.', true, 20),
  ('concentracion-foco', 'Concentracion y foco', 'Attention reset and concentration routines.', true, 30),
  ('confianza-arbitral', 'Confianza arbitral', 'Constructive self-talk and confidence.', true, 40),
  ('resiliencia', 'Resiliencia', 'Wellbeing, recovery and sustained motivation.', true, 50),
  ('preparacion-mental-pre-partido', 'Preparacion mental pre partido', 'Pre-match mental preparation.', true, 60),
  ('evaluacion-post-partido', 'Evaluacion post partido', 'Post-match reflection and emotional closure.', true, 70),
  ('sin-clasificar', 'Sin clasificar', 'Explicit temporary category for reviewed legacy content.', false, 999);

alter table public.notification_events add column deduplication_key text;
create unique index notification_events_deduplication_unique
  on public.notification_events (user_id, deduplication_key)
  where deduplication_key is not null;

lock table reflab_meta.production_adoption_state in exclusive mode;
insert into reflab_meta.production_adoption_state (
  phase_order, phase_key, previous_phase_key, plan_version, plan_hash, evidence_hash
)
values (
  3,
  'psychology_notification_prerequisites',
  'exam_training_prerequisites',
  'production_adoption_bridge_v1',
  'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f',
  '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
);

do $assertions$
begin
  if (select pg_catalog.count(*) from public.notification_events)
       <> pg_catalog.current_setting('reflab.adoption_notification_count')::bigint
     or (select pg_catalog.count(*) from public.psychology_checkins)
       <> pg_catalog.current_setting('reflab.adoption_psychology_checkin_count')::bigint
     or (select pg_catalog.count(*) from public.psychology_wellbeing_assessments)
       <> pg_catalog.current_setting('reflab.adoption_psychology_wellbeing_count')::bigint
     or (select pg_catalog.count(*) from public.psychology_exercise_sessions)
       <> pg_catalog.current_setting('reflab.adoption_psychology_exercise_count')::bigint then
    raise exception 'Historical Psychology or notification row counts changed';
  end if;

  if exists (select 1 from public.notification_events where deduplication_key is not null) then
    raise exception 'Phase 1 fabricated notification deduplication keys';
  end if;

  if (select pg_catalog.count(*) from public.psychology_modules) <> 8 then
    raise exception 'Deterministic Psychology module catalog is incomplete';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Phase 1 finalized the marker or created identity links';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conname in (
      'psychology_checkins_module_fk',
      'psychology_wellbeing_module_fk',
      'psychology_exercise_module_fk',
      'psychology_exercises_module_fk'
    )
  ) then
    raise exception 'Psychology runtime FKs were installed before cutover';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(relation.relacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname = 'psychology_modules'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'reflab_rls_owner'))
  ) then
    raise exception 'psychology_modules retained an application-role ACL';
  end if;
end
$assertions$;

commit;
