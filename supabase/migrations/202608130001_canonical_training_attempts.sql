begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  required_table text;
  role_state record;
begin
  foreach required_table in array array[
    'public.attempts',
    'public.user_profiles',
    'public.user_global_roles',
    'public.user_subscriptions',
    'public.institution_memberships',
    'public.institutions',
    'public.institution_subscriptions',
    'public.clips',
    'reflab_meta.reflab_schema_state'
  ] loop
    if pg_catalog.to_regclass(required_table) is null then
      raise exception 'Canonical Training dependency is missing: %', required_table
        using errcode = '55000';
    end if;
  end loop;

  select
    role.rolcanlogin,
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolinherit,
    role.rolbypassrls
  into role_state
  from pg_catalog.pg_roles role
  where role.rolname = 'reflab_rls_owner';

  if not found
     or role_state.rolcanlogin
     or role_state.rolsuper
     or role_state.rolcreatedb
     or role_state.rolcreaterole
     or role_state.rolinherit
     or role_state.rolbypassrls then
    raise exception 'Canonical RLS owner is missing or unsafe'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null
     or pg_catalog.to_regprocedure('extensions.digest(text,text)') is null
     or pg_catalog.to_regprocedure('extensions.gen_random_uuid()') is null then
    raise exception 'Canonical Training helper dependency is missing'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is not null then
    if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
       or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 3
       or not exists (
         select 1
         from reflab_meta.production_adoption_state state
         where state.phase_order = 3
           and state.phase_key = 'psychology_notification_prerequisites'
       ) then
      raise exception 'Canonical Training requires the reviewed disabled Production adoption state'
        using errcode = '55000';
    end if;

    if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
       or pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is not null
       or pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is not null
       or pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is not null then
      raise exception 'Development identity infrastructure is forbidden during Production adoption'
        using errcode = '55000';
    end if;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.attempts'::pg_catalog.regclass
      and attribute.attname = 'canonical_payload_hash'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) or pg_catalog.to_regprocedure(
    'public.submit_canonical_training_attempt(text,uuid,jsonb,integer)'
  ) is not null then
    raise exception 'Canonical Training provider conflict'
      using errcode = '55000';
  end if;
end
$preflight$;

alter table public.attempts
  add column canonical_payload_hash text,
  add constraint attempts_canonical_payload_hash_check
    check (
      canonical_payload_hash is null
      or canonical_payload_hash ~ '^[0-9a-f]{64}$'
    );

create unique index attempts_canonical_training_submission_unique
  on public.attempts (user_id, submission_id)
  where exam_result_id is null
    and submission_id is not null;

create policy training_attempt_marker_read
on reflab_meta.reflab_schema_state
for select
to reflab_rls_owner
using (
  pg_catalog.current_setting('reflab.training_user_id', true) <> ''
);

create policy training_attempt_profile_read
on public.user_profiles
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
);

create policy training_attempt_global_role_read
on public.user_global_roles
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
);

create policy training_attempt_global_role_lock
on public.user_global_roles
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
)
with check (false);

create policy training_attempt_subscription_read
on public.user_subscriptions
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
);

create policy training_attempt_subscription_lock
on public.user_subscriptions
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
)
with check (false);

create policy training_attempt_membership_read
on public.institution_memberships
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
);

create policy training_attempt_membership_lock
on public.institution_memberships
for update
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
)
with check (false);

create policy training_attempt_institution_read
on public.institutions
for select
to reflab_rls_owner
using (
  id::text = pg_catalog.current_setting('reflab.training_institution_id', true)
);

create policy training_attempt_institution_lock
on public.institutions
for update
to reflab_rls_owner
using (
  id::text = pg_catalog.current_setting('reflab.training_institution_id', true)
)
with check (false);

create policy training_attempt_institution_subscription_read
on public.institution_subscriptions
for select
to reflab_rls_owner
using (
  institution_id::text = pg_catalog.current_setting(
    'reflab.training_institution_id',
    true
  )
);

create policy training_attempt_institution_subscription_lock
on public.institution_subscriptions
for update
to reflab_rls_owner
using (
  institution_id::text = pg_catalog.current_setting(
    'reflab.training_institution_id',
    true
  )
)
with check (false);

create policy training_attempt_clip_read
on public.clips
for select
to reflab_rls_owner
using (
  id::text = pg_catalog.current_setting('reflab.training_clip_id', true)
);

create policy training_attempt_existing_read
on public.attempts
for select
to reflab_rls_owner
using (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
);

create policy training_attempt_insert
on public.attempts
for insert
to reflab_rls_owner
with check (
  user_id = pg_catalog.current_setting('reflab.training_user_id', true)
  and submission_id::text = pg_catalog.current_setting(
    'reflab.training_submission_id',
    true
  )
  and canonical_payload_hash = pg_catalog.current_setting(
    'reflab.training_payload_hash',
    true
  )
  and exam_result_id is null
  and institution_id is null
  and institution_group_id is null
  and institution_assessment_session_id is null
);

grant usage on schema public, reflab_private, reflab_meta, extensions
  to reflab_rls_owner;
grant select on table
  reflab_meta.reflab_schema_state,
  public.user_profiles,
  public.user_global_roles,
  public.user_subscriptions,
  public.institution_memberships,
  public.institutions,
  public.institution_subscriptions,
  public.clips,
  public.attempts
  to reflab_rls_owner;
grant update on table
  public.user_global_roles,
  public.user_subscriptions,
  public.institution_memberships,
  public.institutions,
  public.institution_subscriptions
  to reflab_rls_owner;
grant insert on table public.attempts to reflab_rls_owner;
grant execute on function reflab_private.canonical_jsonb_text(jsonb)
  to reflab_rls_owner;

create function public.submit_canonical_training_attempt(
  p_user_id text,
  p_submission_id uuid,
  p_attempt jsonb,
  p_weekly_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical_user_id text;
  payload_hash text;
  existing_attempt public.attempts%rowtype;
  profile_record public.user_profiles%rowtype;
  role_record public.user_global_roles%rowtype;
  subscription_record public.user_subscriptions%rowtype;
  membership_record public.institution_memberships%rowtype;
  institution_record public.institutions%rowtype;
  institution_subscription_record public.institution_subscriptions%rowtype;
  clip_record public.clips%rowtype;
  attempt_record public.attempts%rowtype;
  inserted_id uuid;
  weekly_count integer;
  expected_weekly_limit integer;
  has_unlimited_access boolean := false;
  allowed_keys constant text[] := array[
    'sport_type',
    'activity_type',
    'clip_id',
    'clip_title',
    'source_item_type',
    'source_item_id',
    'module',
    'mode',
    'topic',
    'subtopic',
    'rule_reference',
    'season',
    'source_version',
    'difficulty',
    'score',
    'is_correct',
    'selected_decision',
    'correct_decision',
    'selected_restart',
    'correct_restart',
    'selected_discipline',
    'correct_discipline',
    'foul',
    'restart',
    'discipline',
    'technical_correct',
    'restart_correct',
    'discipline_correct',
    'disciplinary_correct',
    'subtype_correct',
    'accumulated_foul_correct',
    'four_second_correct',
    'goalkeeper_correct',
    'var_correct',
    'app_correct',
    'ofr_correct',
    'var_intervention_correct',
    'factual_vs_interpretative_correct',
    'final_decision_correct',
    'criterion_result',
    'feedback',
    'answer_text',
    'time_spent_seconds',
    'protocol_score',
    'communication_mode',
    'vocabulary_score',
    'vocabulary_level',
    'mastered_concepts',
    'pending_concepts',
    'workout_name',
    'total_duration',
    'completed_rounds',
    'total_rounds',
    'completed'
  ]::text[];
  text_keys constant text[] := array[
    'sport_type',
    'activity_type',
    'clip_id',
    'clip_title',
    'source_item_type',
    'source_item_id',
    'module',
    'mode',
    'topic',
    'subtopic',
    'rule_reference',
    'season',
    'source_version',
    'difficulty',
    'selected_decision',
    'correct_decision',
    'selected_restart',
    'correct_restart',
    'selected_discipline',
    'correct_discipline',
    'restart',
    'discipline',
    'feedback',
    'answer_text',
    'communication_mode',
    'vocabulary_level',
    'workout_name'
  ]::text[];
  boolean_keys constant text[] := array[
    'is_correct',
    'foul',
    'technical_correct',
    'restart_correct',
    'discipline_correct',
    'disciplinary_correct',
    'subtype_correct',
    'accumulated_foul_correct',
    'four_second_correct',
    'goalkeeper_correct',
    'var_correct',
    'app_correct',
    'ofr_correct',
    'var_intervention_correct',
    'factual_vs_interpretative_correct',
    'final_decision_correct',
    'completed'
  ]::text[];
  bounded_score_keys constant text[] := array[
    'score',
    'protocol_score',
    'vocabulary_score'
  ]::text[];
  bounded_duration_keys constant text[] := array[
    'time_spent_seconds',
    'total_duration'
  ]::text[];
  bounded_round_keys constant text[] := array[
    'completed_rounds',
    'total_rounds'
  ]::text[];
begin
  canonical_user_id := nullif(pg_catalog.btrim(p_user_id), '');

  if canonical_user_id is null
     or canonical_user_id <> p_user_id
     or pg_catalog.char_length(canonical_user_id) > 255
     or p_submission_id is null then
    raise exception 'Invalid canonical training identity or submission'
      using errcode = '22023';
  end if;

  if p_attempt is null
     or pg_catalog.jsonb_typeof(p_attempt) <> 'object'
     or pg_catalog.octet_length(p_attempt::text) > 65536 then
    raise exception 'Invalid canonical training payload'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_attempt) as payload_key(key)
    where not (payload_key.key = any (allowed_keys))
  ) then
    raise exception 'Canonical training payload contains an unsupported field'
      using errcode = '22023';
  end if;

  if p_attempt->>'activity_type' is null
     or p_attempt->>'sport_type' is null
     or p_attempt->>'activity_type' not in (
    'video_training',
    'var_training',
    'rules_practice',
    'physical_training',
    'ifab_trivia'
  ) or p_attempt->>'sport_type' not in ('football_11', 'futsal') then
    raise exception 'Invalid canonical training activity'
      using errcode = '22023';
  end if;

  if p_attempt->>'source_item_type' is null
     or p_attempt->>'source_item_id' is null
     or pg_catalog.char_length(p_attempt->>'source_item_id') > 255
     or (
       p_attempt ? 'criterion_result'
       and pg_catalog.jsonb_typeof(p_attempt->'criterion_result')
         not in ('object', 'null')
     )
     or (
       p_attempt ? 'mastered_concepts'
       and pg_catalog.jsonb_typeof(p_attempt->'mastered_concepts')
         not in ('array', 'null')
     )
     or (
       p_attempt ? 'pending_concepts'
       and pg_catalog.jsonb_typeof(p_attempt->'pending_concepts')
         not in ('array', 'null')
     ) then
    raise exception 'Canonical training payload has an invalid type or range'
      using errcode = '22023';
  end if;

  if not (
    (
      p_attempt->>'source_item_type' = 'global_clip'
      and p_attempt->>'activity_type' in ('video_training', 'var_training')
    )
    or (
      p_attempt->>'source_item_type' = 'rule_question'
      and p_attempt->>'activity_type' in ('rules_practice', 'ifab_trivia')
      and not (p_attempt ? 'clip_id')
    )
    or (
      p_attempt->>'source_item_type' = 'manual'
      and p_attempt->>'activity_type' = 'physical_training'
      and not (p_attempt ? 'clip_id')
    )
  ) then
    raise exception 'Canonical training source does not match its activity'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_attempt) as payload_entry(key, value)
    where payload_entry.key = any (boolean_keys)
      and pg_catalog.jsonb_typeof(payload_entry.value) not in ('boolean', 'null')
  ) then
    raise exception 'Canonical training payload has an invalid boolean field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_attempt) as payload_entry(key, value)
    where payload_entry.key = any (text_keys)
      and (
        pg_catalog.jsonb_typeof(payload_entry.value) not in ('string', 'null')
        or pg_catalog.char_length(payload_entry.value #>> '{}') > 4000
      )
  ) then
    raise exception 'Canonical training payload has an invalid text field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_attempt) as payload_entry(key, value)
    where payload_entry.key = any (bounded_score_keys)
      and (
        pg_catalog.jsonb_typeof(payload_entry.value) not in ('number', 'null')
        or (
          pg_catalog.jsonb_typeof(payload_entry.value) = 'number'
          and (payload_entry.value #>> '{}')::numeric not between 0 and 100
        )
      )
  ) then
    raise exception 'Canonical training payload has an invalid score field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_attempt) as payload_entry(key, value)
    where payload_entry.key = any (
      bounded_duration_keys || bounded_round_keys
    )
      and (
        pg_catalog.jsonb_typeof(payload_entry.value) not in ('number', 'null')
        or (
          pg_catalog.jsonb_typeof(payload_entry.value) = 'number'
          and (
            (payload_entry.value #>> '{}')::numeric
              <> pg_catalog.trunc((payload_entry.value #>> '{}')::numeric)
            or (
              payload_entry.key = any (bounded_duration_keys)
              and (payload_entry.value #>> '{}')::numeric
                not between 0 and 172800
            )
            or (
              payload_entry.key = any (bounded_round_keys)
              and (payload_entry.value #>> '{}')::numeric not between 0 and 100
            )
          )
        )
      )
  ) then
    raise exception 'Canonical training payload has an invalid integer field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_attempt->'mastered_concepts') = 'array'
          then p_attempt->'mastered_concepts'
        else '[]'::jsonb
      end
      || case
        when pg_catalog.jsonb_typeof(p_attempt->'pending_concepts') = 'array'
          then p_attempt->'pending_concepts'
        else '[]'::jsonb
      end
    ) as concept(value)
    where pg_catalog.jsonb_typeof(concept.value) <> 'string'
      or pg_catalog.char_length(concept.value #>> '{}') > 255
  ) then
    raise exception 'Canonical training concepts are invalid'
      using errcode = '22023';
  end if;

  if p_weekly_limit is null or p_weekly_limit not in (0, 5) then
    raise exception 'Invalid canonical weekly limit'
      using errcode = '22023';
  end if;

  if p_attempt->>'activity_type' <> 'video_training'
     and p_weekly_limit <> 0 then
    raise exception 'Weekly limits only apply to video training'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'reflab.training_user_id',
    canonical_user_id,
    true
  );
  perform pg_catalog.set_config(
    'reflab.training_submission_id',
    p_submission_id::text,
    true
  );
  perform pg_catalog.set_config(
    'reflab.training_clip_id',
    coalesce(p_attempt->>'clip_id', ''),
    true
  );
  perform pg_catalog.set_config(
    'reflab.training_institution_id',
    '',
    true
  );

  if not exists (
    select 1
    from reflab_meta.reflab_schema_state schema_state
    where schema_state.installation_status = 'installed'
      and schema_state.environment in ('development', 'production')
  ) then
    raise exception 'Canonical schema marker is invalid for training'
      using errcode = '55000';
  end if;

  -- Advisory locks cover the empty-row idempotency and weekly-limit races.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('training-user:' || canonical_user_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'training-submission:' || canonical_user_id || ':' || p_submission_id::text,
      0
    )
  );

  select global_role.*
  into role_record
  from public.user_global_roles global_role
  where global_role.user_id = canonical_user_id
  for update;

  select subscription.*
  into subscription_record
  from public.user_subscriptions subscription
  where subscription.user_id = canonical_user_id
  for update;

  select profile.*
  into profile_record
  from public.user_profiles profile
  where profile.user_id = canonical_user_id;

  if profile_record.user_id is null
     or role_record.user_id is null
     or subscription_record.user_id is null then
    raise exception 'Canonical training access records are incomplete'
      using errcode = 'P0002';
  end if;

  if subscription_record.status not in ('active', 'trialing')
     or subscription_record.starts_at > pg_catalog.now()
     or (
       subscription_record.ends_at is not null
       and subscription_record.ends_at <= pg_catalog.now()
     ) then
    raise exception 'Canonical training subscription is inactive'
      using errcode = 'P0002';
  end if;

  has_unlimited_access :=
    role_record.role_key = 'super_admin'
    or (
      subscription_record.plan_key = 'pro'
    );

  for membership_record in
    select membership.*
    from public.institution_memberships membership
    where membership.user_id = canonical_user_id
    order by membership.institution_id
    for update
  loop
    perform pg_catalog.set_config(
      'reflab.training_institution_id',
      membership_record.institution_id::text,
      true
    );

    select institution.*
    into institution_record
    from public.institutions institution
    where institution.id = membership_record.institution_id
    for update;

    select institution_subscription.*
    into institution_subscription_record
    from public.institution_subscriptions institution_subscription
    where institution_subscription.institution_id = membership_record.institution_id
    for update;

    if membership_record.status = 'active'
       and institution_record.status = 'active'
       and institution_record.deleted_at is null
       and institution_subscription_record.plan_key in ('academy', 'enterprise')
       and institution_subscription_record.status in ('active', 'trialing')
       and institution_subscription_record.starts_at <= pg_catalog.now()
       and (
         institution_subscription_record.ends_at is null
         or institution_subscription_record.ends_at > pg_catalog.now()
       ) then
      has_unlimited_access := true;
    end if;
  end loop;

  expected_weekly_limit := case
    when p_attempt->>'activity_type' <> 'video_training' then 0
    when has_unlimited_access then 0
    else 5
  end;

  if p_weekly_limit <> expected_weekly_limit then
    raise exception 'Canonical weekly limit does not match active access records'
      using errcode = '22023';
  end if;

  if p_attempt->>'source_item_type' = 'global_clip' then
    select clip.*
    into clip_record
    from public.clips clip
    where clip.id::text = p_attempt->>'clip_id'
      and clip.id::text = p_attempt->>'source_item_id'
      and clip.is_active = true
      and clip.status = 'published';

    if clip_record.id is null then
      raise exception 'Canonical training clip is unavailable'
        using errcode = 'P0002';
    end if;
  elsif p_attempt->>'source_item_type' not in ('rule_question', 'manual') then
    raise exception 'Invalid canonical training source'
      using errcode = '22023';
  end if;

  payload_hash := pg_catalog.encode(
    extensions.digest(
      reflab_private.canonical_jsonb_text(p_attempt),
      'sha256'
    ),
    'hex'
  );
  perform pg_catalog.set_config(
    'reflab.training_payload_hash',
    payload_hash,
    true
  );

  select attempt.*
  into existing_attempt
  from public.attempts attempt
  where attempt.user_id = canonical_user_id
    and attempt.submission_id = p_submission_id
    and attempt.exam_result_id is null;

  if existing_attempt.id is not null then
    if existing_attempt.canonical_payload_hash = payload_hash then
      return pg_catalog.jsonb_build_object(
        'status', 'already_recorded',
        'attempt_id', existing_attempt.id,
        'score', existing_attempt.score,
        'weekly_used', null
      );
    end if;

    raise exception 'Training submission payload conflicts with an existing attempt'
      using errcode = '23505';
  end if;

  if p_attempt->>'activity_type' = 'video_training'
     and p_weekly_limit > 0 then
    select pg_catalog.count(*)::integer
    into weekly_count
    from public.attempts attempt
    where attempt.user_id = canonical_user_id
      and attempt.sport_type = p_attempt->>'sport_type'
      and attempt.activity_type = 'video_training'
      and attempt.created_at >= pg_catalog.date_trunc(
        'week',
        pg_catalog.now()
      );

    if weekly_count >= p_weekly_limit then
      raise exception 'Canonical weekly training limit reached'
        using errcode = 'P0001';
    end if;
  else
    weekly_count := 0;
  end if;

  attempt_record := pg_catalog.jsonb_populate_record(
    null::public.attempts,
    p_attempt
  );
  attempt_record.id := extensions.gen_random_uuid();
  attempt_record.user_id := canonical_user_id;
  attempt_record.ref_card_id := profile_record.ref_card_id;
  attempt_record.exam_result_id := null;
  attempt_record.submission_id := p_submission_id;
  attempt_record.source_occurrence_id := p_submission_id;
  attempt_record.canonical_payload_hash := payload_hash;
  attempt_record.mastered_concepts := coalesce(
    attempt_record.mastered_concepts,
    '[]'::jsonb
  );
  attempt_record.pending_concepts := coalesce(
    attempt_record.pending_concepts,
    '[]'::jsonb
  );
  attempt_record.institution_id := null;
  attempt_record.institution_group_id := null;
  attempt_record.institution_assessment_session_id := null;
  attempt_record.created_at := pg_catalog.now();

  insert into public.attempts
  select attempt_record.*
  returning id into inserted_id;

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'attempt_id', inserted_id,
    'score', attempt_record.score,
    'weekly_used', case
      when attempt_record.activity_type = 'video_training'
        then weekly_count + 1
      else null
    end
  );
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.submit_canonical_training_attempt(text, uuid, jsonb, integer)
  owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

revoke all on function public.submit_canonical_training_attempt(
  text,
  uuid,
  jsonb,
  integer
) from public, anon, authenticated;
grant execute on function public.submit_canonical_training_attempt(
  text,
  uuid,
  jsonb,
  integer
) to service_role;

do $verification$
begin
  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on public';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace
      on namespace.oid = procedure.pronamespace
    join pg_catalog.pg_roles owner_role
      on owner_role.oid = procedure.proowner
    where namespace.nspname = 'public'
      and procedure.proname = 'submit_canonical_training_attempt'
      and owner_role.rolname = 'reflab_rls_owner'
      and procedure.prosecdef = true
      and procedure.proconfig = array['search_path=pg_catalog']
  ) then
    raise exception 'Canonical training RPC security configuration is invalid';
  end if;
end
$verification$;

commit;
