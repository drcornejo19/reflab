begin;

alter table public.attempts
  drop constraint attempts_source_type_check,
  add constraint attempts_source_type_check check (
    source_item_type is null
    or source_item_type in (
      'global_clip',
      'institutional_clip',
      'rule_question',
      'manual',
      'communication_feedback'
    )
  );

create function public.submit_canonical_communication_feedback(
  p_user_id text,
  p_submission_id uuid,
  p_payload_hash text,
  p_feedback jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  canonical_user_id text;
  profile_record public.user_profiles%rowtype;
  role_record public.user_global_roles%rowtype;
  subscription_record public.user_subscriptions%rowtype;
  clip_record public.clips%rowtype;
  existing_attempt public.attempts%rowtype;
  criterion_snapshot jsonb;
  inserted_id uuid;
  allowed_keys constant text[] := array[
    'sport_type',
    'activity_type',
    'clip_id',
    'mode',
    'answer_text',
    'feedback_language',
    'has_voice_recording',
    'oral_evaluable',
    'feedback',
    'scores',
    'global_label',
    'model_answer',
    'human_review_reason',
    'confidence',
    'evidence',
    'coach_run_id'
  ]::text[];
  score_keys constant text[] := array[
    'terminology',
    'clarity',
    'precision',
    'structure',
    'vocabulary',
    'grammar',
    'global'
  ]::text[];
begin
  canonical_user_id := nullif(pg_catalog.btrim(p_user_id), '');

  if canonical_user_id is null
     or canonical_user_id <> p_user_id
     or pg_catalog.char_length(canonical_user_id) > 255
     or p_submission_id is null
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid canonical communication identity or submission'
      using errcode = '22023';
  end if;

  if p_feedback is null
     or pg_catalog.jsonb_typeof(p_feedback) <> 'object'
     or pg_catalog.octet_length(p_feedback::text) > 65536
     or exists (
       select 1
       from pg_catalog.jsonb_object_keys(p_feedback) as payload_key(key)
       where not (payload_key.key = any (allowed_keys))
     )
     or (
       select pg_catalog.count(*)
       from pg_catalog.jsonb_object_keys(p_feedback) as payload_key(key)
     ) <> pg_catalog.array_length(allowed_keys, 1) then
    raise exception 'Invalid canonical communication payload'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_typeof(p_feedback->'sport_type') <> 'string'
     or p_feedback->>'sport_type' not in ('football_11', 'futsal')
     or pg_catalog.jsonb_typeof(p_feedback->'activity_type') <> 'string'
     or p_feedback->>'activity_type' not in (
       'english_communication_feedback',
       'spanish_communication_feedback'
     )
     or pg_catalog.jsonb_typeof(p_feedback->'mode') <> 'string'
     or p_feedback->>'mode' not in (
       'ifab_english',
       'decision_explanation_es'
     )
     or (
       p_feedback->>'mode' = 'ifab_english'
       and p_feedback->>'activity_type' <> 'english_communication_feedback'
     )
     or (
       p_feedback->>'mode' = 'decision_explanation_es'
       and p_feedback->>'activity_type' <> 'spanish_communication_feedback'
     )
     or pg_catalog.jsonb_typeof(p_feedback->'feedback_language') <> 'string'
     or p_feedback->>'feedback_language' not in ('es', 'en', 'pt')
     or pg_catalog.jsonb_typeof(p_feedback->'clip_id') <> 'string'
     or p_feedback->>'clip_id' !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or pg_catalog.jsonb_typeof(p_feedback->'coach_run_id') <> 'string'
     or p_feedback->>'coach_run_id' !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or pg_catalog.jsonb_typeof(p_feedback->'has_voice_recording') <> 'boolean'
     or pg_catalog.jsonb_typeof(p_feedback->'oral_evaluable') <> 'boolean'
     or p_feedback->'oral_evaluable' <> 'false'::jsonb
     or pg_catalog.jsonb_typeof(p_feedback->'scores') <> 'object'
     or pg_catalog.jsonb_typeof(p_feedback->'confidence') <> 'object'
     or pg_catalog.jsonb_typeof(p_feedback->'evidence') <> 'array'
     or pg_catalog.jsonb_typeof(p_feedback->'feedback') <> 'string'
     or nullif(pg_catalog.btrim(p_feedback->>'feedback'), '') is null
     or pg_catalog.char_length(p_feedback->>'feedback') > 12000
     or pg_catalog.jsonb_typeof(p_feedback->'global_label') not in (
       'string',
       'null'
     )
     or pg_catalog.jsonb_typeof(p_feedback->'model_answer') not in (
       'string',
       'null'
     )
     or pg_catalog.jsonb_typeof(p_feedback->'human_review_reason') not in (
       'string',
       'null'
     )
     or pg_catalog.jsonb_typeof(p_feedback->'answer_text') not in ('string', 'null')
     or (
       pg_catalog.jsonb_typeof(p_feedback->'answer_text') = 'string'
       and (
         nullif(pg_catalog.btrim(p_feedback->>'answer_text'), '') is null
         or pg_catalog.char_length(p_feedback->>'answer_text') > 4000
       )
     )
     or (
       pg_catalog.jsonb_typeof(p_feedback->'answer_text') = 'null'
       and p_feedback->'has_voice_recording' <> 'true'::jsonb
     ) then
    raise exception 'Canonical communication payload has an invalid field'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_feedback->'scores') as score_key(key)
    where not (score_key.key = any (score_keys))
  ) or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_object_keys(p_feedback->'scores') as score_key(key)
  ) <> pg_catalog.array_length(score_keys, 1) or exists (
    select 1
    from pg_catalog.jsonb_each(p_feedback->'scores') as score_entry(key, value)
    where pg_catalog.jsonb_typeof(score_entry.value) not in ('number', 'null')
      or (
        pg_catalog.jsonb_typeof(score_entry.value) = 'number'
        and (
          (score_entry.value #>> '{}')::numeric not between 0 and 10
          or (score_entry.value #>> '{}')::numeric
            <> pg_catalog.trunc((score_entry.value #>> '{}')::numeric)
        )
      )
  ) then
    raise exception 'Canonical communication scores are invalid'
      using errcode = '22023';
  end if;

  if p_feedback->'has_voice_recording' = 'true'::jsonb
     and pg_catalog.jsonb_typeof(p_feedback->'answer_text') = 'null'
     and exists (
       select 1
       from pg_catalog.jsonb_each(p_feedback->'scores') as score_entry(key, value)
       where pg_catalog.jsonb_typeof(score_entry.value) <> 'null'
     ) then
    raise exception 'Unverified audio cannot receive communication scores'
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
    'reflab.training_payload_hash',
    p_payload_hash,
    true
  );
  perform pg_catalog.set_config(
    'reflab.training_clip_id',
    p_feedback->>'clip_id',
    true
  );

  if not exists (
    select 1
    from reflab_meta.reflab_schema_state marker
    where marker.installation_status = 'installed'
      and marker.environment in ('development', 'production')
  ) then
    raise exception 'Canonical RefLab marker is unavailable'
      using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'communication-feedback:'
      || canonical_user_id
      || ':'
      || p_submission_id::text,
      0
    )
  );

  select profile.*
  into profile_record
  from public.user_profiles profile
  where profile.user_id = canonical_user_id;

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

  if profile_record.user_id is null
     or role_record.user_id is null
     or subscription_record.user_id is null
     or subscription_record.status not in ('active', 'trialing')
     or subscription_record.starts_at > pg_catalog.now()
     or (
       subscription_record.ends_at is not null
       and subscription_record.ends_at <= pg_catalog.now()
     ) then
    raise exception 'Canonical communication user is incomplete or inactive'
      using errcode = 'P0002';
  end if;

  select clip.*
  into clip_record
  from public.clips clip
  where clip.id = (p_feedback->>'clip_id')::uuid
    and clip.sport_type = p_feedback->>'sport_type'
    and clip.is_active = true
    and clip.status = 'published';

  if clip_record.id is null then
    raise exception 'Canonical communication clip is unavailable'
      using errcode = 'P0002';
  end if;

  select attempt.*
  into existing_attempt
  from public.attempts attempt
  where attempt.user_id = canonical_user_id
    and attempt.submission_id = p_submission_id
    and attempt.exam_result_id is null;

  if existing_attempt.id is not null then
    if existing_attempt.canonical_payload_hash = p_payload_hash
       and existing_attempt.source_item_type = 'communication_feedback'
       and existing_attempt.activity_type in (
         'english_communication_feedback',
         'spanish_communication_feedback'
       ) then
      return pg_catalog.jsonb_build_object(
        'status', 'already_recorded',
        'attempt_id', existing_attempt.id,
        'feedback', existing_attempt.feedback,
        'criterion_result', existing_attempt.criterion_result
      );
    end if;

    raise exception 'Communication submission conflicts with an existing attempt'
      using errcode = '23505';
  end if;

  criterion_snapshot := pg_catalog.jsonb_build_object(
    'kind', 'canonical_communication_feedback',
    'schema_version', 'communication-feedback-v1',
    'scores', p_feedback->'scores',
    'global_label', p_feedback->'global_label',
    'model_answer', p_feedback->'model_answer',
    'human_review_reason', p_feedback->'human_review_reason',
    'confidence', p_feedback->'confidence',
    'evidence', p_feedback->'evidence',
    'coach_run_id', p_feedback->'coach_run_id',
    'feedback_language', p_feedback->'feedback_language',
    'has_voice_recording', p_feedback->'has_voice_recording',
    'oral_evaluable', false
  );

  insert into public.attempts (
    id,
    user_id,
    sport_type,
    activity_type,
    ref_card_id,
    exam_result_id,
    submission_id,
    clip_id,
    clip_title,
    source_item_type,
    source_item_id,
    source_occurrence_id,
    module,
    mode,
    topic,
    subtopic,
    rule_reference,
    season,
    source_version,
    difficulty,
    score,
    criterion_result,
    feedback,
    answer_text,
    english_score,
    communication_score,
    vocabulary_score,
    clarity_score,
    terminology_score,
    grammar_score,
    technical_accuracy_score,
    pronunciation_score,
    structure_score,
    communication_mode,
    global_communication_label,
    canonical_payload_hash,
    institution_id,
    institution_group_id,
    institution_assessment_session_id
  ) values (
    extensions.gen_random_uuid(),
    canonical_user_id,
    p_feedback->>'sport_type',
    p_feedback->>'activity_type',
    profile_record.ref_card_id,
    null,
    p_submission_id,
    clip_record.id::text,
    clip_record.title,
    'communication_feedback',
    clip_record.id::text,
    p_submission_id,
    case
      when p_feedback->>'mode' = 'ifab_english' then 'english_referee'
      else 'communication_referee'
    end,
    p_feedback->>'mode',
    clip_record.topic,
    coalesce(clip_record.subtopic, clip_record.sub_type),
    clip_record.rule_reference,
    clip_record.season,
    clip_record.source_version,
    clip_record.difficulty,
    null,
    criterion_snapshot,
    p_feedback->>'feedback',
    p_feedback->>'answer_text',
    null,
    null,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'vocabulary') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'vocabulary')::numeric * 10)::integer end,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'clarity') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'clarity')::numeric * 10)::integer end,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'terminology') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'terminology')::numeric * 10)::integer end,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'grammar') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'grammar')::numeric * 10)::integer end,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'precision') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'precision')::numeric * 10)::integer end,
    null,
    case when pg_catalog.jsonb_typeof(p_feedback->'scores'->'structure') = 'null'
      then null else pg_catalog.round((p_feedback->'scores'->>'structure')::numeric * 10)::integer end,
    p_feedback->>'mode',
    p_feedback->>'global_label',
    p_payload_hash,
    null,
    null,
    null
  )
  returning id into inserted_id;

  return pg_catalog.jsonb_build_object(
    'status', 'created',
    'attempt_id', inserted_id,
    'feedback', p_feedback->>'feedback',
    'criterion_result', criterion_snapshot
  );
end
$function$;

grant create on schema public to reflab_rls_owner;
alter function public.submit_canonical_communication_feedback(
  text,
  uuid,
  text,
  jsonb
) owner to reflab_rls_owner;
revoke create on schema public from reflab_rls_owner;

revoke all on function public.submit_canonical_communication_feedback(
  text,
  uuid,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.submit_canonical_communication_feedback(
  text,
  uuid,
  text,
  jsonb
) to service_role;

do $verification$
declare
  function_oid oid;
begin
  if pg_catalog.has_schema_privilege(
    'reflab_rls_owner',
    'public',
    'CREATE'
  ) then
    raise exception 'reflab_rls_owner retained CREATE on public';
  end if;

  select procedure.oid
  into function_oid
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'submit_canonical_communication_feedback'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      = 'p_user_id text, p_submission_id uuid, p_payload_hash text, p_feedback jsonb'
    and owner_role.rolname = 'reflab_rls_owner'
    and procedure.prosecdef = true
    and procedure.proconfig = array['search_path=pg_catalog'];

  if function_oid is null then
    raise exception 'Canonical communication RPC security configuration is invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    function_oid,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    function_oid,
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    function_oid,
    'EXECUTE'
  ) then
    raise exception 'Canonical communication RPC execution grants are invalid';
  end if;
end
$verification$;

commit;
