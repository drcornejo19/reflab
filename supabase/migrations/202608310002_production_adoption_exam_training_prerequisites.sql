-- Production adoption bridge, Phase 2/3. Adds nullable compatibility only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  required_table text;
  target_column record;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 1
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or not exists (
       select 1 from reflab_meta.production_adoption_state state
       where state.phase_order = 1
         and state.phase_key = 'foundation'
         and state.plan_version = 'production_adoption_bridge_v1'
         and state.plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
         and state.evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
     ) then
    raise exception 'Reviewed Production adoption foundation is required'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Development identity links appeared in Production adoption'
      using errcode = '55000';
  end if;

  foreach required_table in array array[
    'public.attempts',
    'public.exam_results',
    'public.institutions',
    'public.institution_groups',
    'public.institution_assessment_sessions'
  ] loop
    if pg_catalog.to_regclass(required_table) is null then
      raise exception 'Required bridge dependency is missing: %', required_table
        using errcode = '55000';
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass(required_table)
        and pg_catalog.pg_get_userbyid(relation.relowner) = current_user
    ) then
      raise exception 'Production adoption installer does not own dependency: %', required_table
        using errcode = '42501';
    end if;
  end loop;

  if pg_catalog.to_regclass('public.referee_exam_sessions') is not null then
    raise exception 'referee_exam_sessions no longer matches the audited absent state'
      using errcode = '55000';
  end if;

  for target_column in
    select * from (values
      ('attempts', 'source_item_type'),
      ('attempts', 'source_item_id'),
      ('attempts', 'source_occurrence_id'),
      ('attempts', 'institution_assessment_session_id'),
      ('exam_results', 'exam_session_id'),
      ('exam_results', 'payload_hash')
    ) expected(table_name, column_name)
  loop
    if exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = pg_catalog.to_regclass('public.' || target_column.table_name)
        and attribute.attname = target_column.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped
    ) then
      raise exception 'Bridge target column already exists: %.%', target_column.table_name, target_column.column_name
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'exam_result_id'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
      and not attribute.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.exam_results'::pg_catalog.regclass
      and attribute.attname = 'submission_id'
      and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
      and not attribute.attisdropped
  ) then
    raise exception 'Legacy Exam/Training key columns have an unexpected type'
      using errcode = '55000';
  end if;

  perform pg_catalog.set_config(
    'reflab.adoption_attempt_count',
    (select pg_catalog.count(*)::text from public.attempts),
    true
  );
  perform pg_catalog.set_config(
    'reflab.adoption_exam_result_count',
    (select pg_catalog.count(*)::text from public.exam_results),
    true
  );
end
$preflight$;

create table public.referee_exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  submission_id uuid not null,
  context_type text not null check (context_type in ('individual', 'institutional')),
  sport_type text not null check (sport_type in ('football_11', 'futsal')),
  activity_type text not null check (activity_type = 'referee_exam'),
  season text,
  source_version text,
  institution_id uuid,
  institution_group_id uuid,
  institution_assessment_session_id uuid,
  item_manifest jsonb not null check (pg_catalog.jsonb_typeof(item_manifest) = 'array'),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  item_count integer not null
    constraint referee_exam_sessions_item_count_range_check
    check (item_count between 1 and 100),
  status text not null default 'active'
    check (status in ('created', 'active', 'submitted', 'expired', 'cancelled')),
  created_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  constraint referee_exam_sessions_user_submission_unique unique (user_id, submission_id),
  constraint referee_exam_sessions_item_count_check
    check (item_count = pg_catalog.jsonb_array_length(item_manifest)),
  constraint referee_exam_sessions_expiry_check check (expires_at > started_at),
  constraint referee_exam_sessions_context_check check (
    (context_type = 'individual'
      and institution_id is null
      and institution_group_id is null
      and institution_assessment_session_id is null)
    or (context_type = 'institutional'
      and institution_id is not null
      and institution_assessment_session_id is not null)
  )
);

alter table public.referee_exam_sessions enable row level security;
revoke all on table public.referee_exam_sessions
  from public, anon, authenticated, service_role, reflab_rls_owner;

alter table public.referee_exam_sessions
  add constraint referee_exam_sessions_institution_fk
    foreign key (institution_id) references public.institutions(id) on delete cascade not valid,
  add constraint referee_exam_sessions_group_fk
    foreign key (institution_group_id) references public.institution_groups(id) on delete set null not valid,
  add constraint referee_exam_sessions_assessment_session_fk
    foreign key (institution_assessment_session_id)
    references public.institution_assessment_sessions(id) on delete cascade not valid;

alter table public.referee_exam_sessions validate constraint referee_exam_sessions_institution_fk;
alter table public.referee_exam_sessions validate constraint referee_exam_sessions_group_fk;
alter table public.referee_exam_sessions validate constraint referee_exam_sessions_assessment_session_fk;

alter table public.exam_results
  add column exam_session_id uuid,
  add column payload_hash text;

alter table public.exam_results
  add constraint exam_results_payload_hash_check
    check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$') not valid,
  add constraint exam_results_exam_session_unique unique (exam_session_id),
  add constraint exam_results_session_fk
    foreign key (exam_session_id) references public.referee_exam_sessions(id) on delete restrict not valid;

alter table public.exam_results validate constraint exam_results_payload_hash_check;
alter table public.exam_results validate constraint exam_results_session_fk;

alter table public.attempts
  add column source_item_type text,
  add column source_item_id text,
  add column source_occurrence_id uuid,
  add column institution_assessment_session_id uuid;

alter table public.attempts
  add constraint attempts_source_reference_check check (
    (source_item_type is null and source_item_id is null and source_occurrence_id is null)
    or (source_item_type is not null and source_item_id is not null and source_occurrence_id is not null)
  ) not valid,
  add constraint attempts_source_type_check check (
    source_item_type is null
    or source_item_type in ('global_clip', 'institutional_clip', 'rule_question', 'manual')
  ) not valid,
  add constraint attempts_adoption_assessment_session_fk
    foreign key (institution_assessment_session_id)
    references public.institution_assessment_sessions(id) on delete set null not valid;

alter table public.attempts validate constraint attempts_source_reference_check;
alter table public.attempts validate constraint attempts_source_type_check;
alter table public.attempts validate constraint attempts_adoption_assessment_session_fk;

create unique index attempts_exam_occurrence_unique
  on public.attempts (exam_result_id, source_occurrence_id)
  where exam_result_id is not null and source_occurrence_id is not null;
create index referee_exam_sessions_user_status_idx
  on public.referee_exam_sessions (user_id, status, expires_at);
create index referee_exam_sessions_institution_idx
  on public.referee_exam_sessions (institution_id, status, created_at desc);

lock table reflab_meta.production_adoption_state in exclusive mode;
insert into reflab_meta.production_adoption_state (
  phase_order, phase_key, previous_phase_key, plan_version, plan_hash, evidence_hash
)
values (
  2,
  'exam_training_prerequisites',
  'foundation',
  'production_adoption_bridge_v1',
  'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f',
  '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
);

do $assertions$
begin
  if (select pg_catalog.count(*) from public.attempts)
       <> pg_catalog.current_setting('reflab.adoption_attempt_count')::bigint
     or (select pg_catalog.count(*) from public.exam_results)
       <> pg_catalog.current_setting('reflab.adoption_exam_result_count')::bigint then
    raise exception 'Historical Exam/Training row counts changed';
  end if;

  if exists (
    select 1 from public.attempts
    where source_item_type is not null
       or source_item_id is not null
       or source_occurrence_id is not null
       or institution_assessment_session_id is not null
  ) or exists (
    select 1 from public.exam_results
    where exam_session_id is not null or payload_hash is not null
  ) then
    raise exception 'Phase 1 fabricated canonical Exam/Training values';
  end if;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Phase 1 finalized the marker or created identity links';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'canonical_payload_hash'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'Bridge duplicated canonical_payload_hash owned by 202608130001';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(relation.relacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname = 'referee_exam_sessions'
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated', 'service_role', 'reflab_rls_owner'))
  ) then
    raise exception 'referee_exam_sessions retained an application-role ACL';
  end if;
end
$assertions$;

commit;
