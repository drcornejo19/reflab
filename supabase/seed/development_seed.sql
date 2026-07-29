-- RefLab synthetic development seed.
-- NEVER execute this file against production.
-- It contains no real identities, credentials, tokens, or media objects.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $guard$
declare
  installed_environment text;
begin
  select schema_state.environment
  into installed_environment
  from reflab_meta.reflab_schema_state schema_state
  where schema_state.installation_status = 'installed';

  if not found then
    raise exception 'RefLab canonical baseline marker was not found';
  end if;

  if installed_environment not in ('development', 'test', 'preview') then
    raise exception
      'Synthetic seed is blocked for environment: %',
      installed_environment;
  end if;
end
$guard$;

insert into public.countries (id, code, name)
values (
  '10000000-0000-4000-8000-000000000001',
  'ZZ',
  'RefLab Test Country'
);

insert into public.associations (
  id,
  country_id,
  code,
  name,
  country_code,
  source_type
)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'RFD',
  'RefLab Development Association',
  'ZZ',
  'manual'
);

insert into public.institutions (
  id,
  slug,
  name,
  institution_type,
  country,
  city,
  status,
  enabled_sports,
  is_demo,
  created_by_user_id,
  plan_key,
  license_status,
  license_start,
  license_end,
  license_limit,
  seats_total,
  seats_used
)
values (
  '30000000-0000-4000-8000-000000000001',
  'reflab-development-academy',
  'RefLab Development Academy',
  'private_academy',
  'RefLab Test Country',
  'Test City',
  'active',
  array['football_11', 'futsal']::text[],
  true,
  'user_dev_super_admin',
  'academy',
  'active',
  now(),
  now() + interval '1 year',
  25,
  25,
  4
);

insert into public.institution_subscriptions (
  id,
  institution_id,
  plan_key,
  status,
  starts_at,
  ends_at,
  seat_limit,
  source
)
values (
  '31000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'academy',
  'active',
  now(),
  now() + interval '1 year',
  25,
  'development_seed'
);

insert into public.user_profiles (
  user_id,
  email,
  reflab_name,
  first_name,
  last_name,
  association,
  association_id,
  main_role,
  category,
  ref_card_id,
  ranking_display_name,
  preferred_sport_type,
  subscription_plan,
  institution_id
)
values
  (
    'user_dev_referee_a',
    'referee-a@reflab.example.invalid',
    'Referee A',
    'Referee',
    'A',
    'RefLab Development Association',
    '20000000-0000-4000-8000-000000000001',
    'referee',
    'development',
    'RF-DEV-A',
    'Referee A',
    'football_11',
    'pro',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    'user_dev_referee_b',
    'referee-b@reflab.example.invalid',
    'Referee B',
    'Referee',
    'B',
    'RefLab Development Association',
    '20000000-0000-4000-8000-000000000001',
    'referee',
    'development',
    'RF-DEV-B',
    'Referee B',
    'futsal',
    'basic',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    'user_dev_instructor',
    'instructor@reflab.example.invalid',
    'Development Instructor',
    'Development',
    'Instructor',
    'RefLab Development Association',
    '20000000-0000-4000-8000-000000000001',
    'instructor',
    'development',
    'RF-DEV-I',
    'Development Instructor',
    'football_11',
    'basic',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    'user_dev_institution_admin',
    'institution-admin@reflab.example.invalid',
    'Development Institution Admin',
    'Development',
    'Admin',
    'RefLab Development Association',
    '20000000-0000-4000-8000-000000000001',
    'institution_admin',
    'development',
    'RF-DEV-IA',
    'Development Admin',
    'football_11',
    'basic',
    '30000000-0000-4000-8000-000000000001'
  ),
  (
    'user_dev_super_admin',
    'super-admin@reflab.example.invalid',
    'Development Super Admin',
    'Development',
    'Super Admin',
    'RefLab Development Association',
    '20000000-0000-4000-8000-000000000001',
    'super_admin',
    'development',
    'RF-DEV-SA',
    'Development Super Admin',
    'football_11',
    'pro',
    null
  );

insert into public.user_global_roles (
  user_id,
  role_key,
  source,
  assigned_by_user_id
)
values
  ('user_dev_referee_a', 'referee', 'development_seed', 'user_dev_super_admin'),
  ('user_dev_referee_b', 'referee', 'development_seed', 'user_dev_super_admin'),
  ('user_dev_instructor', 'instructor', 'development_seed', 'user_dev_super_admin'),
  (
    'user_dev_institution_admin',
    'institution_admin',
    'development_seed',
    'user_dev_super_admin'
  ),
  (
    'user_dev_super_admin',
    'super_admin',
    'development_seed',
    'user_dev_super_admin'
  );

insert into public.user_subscriptions (
  id,
  user_id,
  plan_key,
  status,
  source,
  assigned_by_user_id
)
values
  (
    '32000000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    'pro',
    'active',
    'development_seed',
    'user_dev_super_admin'
  ),
  (
    '32000000-0000-4000-8000-000000000002',
    'user_dev_referee_b',
    'basic',
    'active',
    'development_seed',
    'user_dev_super_admin'
  ),
  (
    '32000000-0000-4000-8000-000000000003',
    'user_dev_instructor',
    'basic',
    'active',
    'development_seed',
    'user_dev_super_admin'
  ),
  (
    '32000000-0000-4000-8000-000000000004',
    'user_dev_institution_admin',
    'basic',
    'active',
    'development_seed',
    'user_dev_super_admin'
  ),
  (
    '32000000-0000-4000-8000-000000000005',
    'user_dev_super_admin',
    'pro',
    'active',
    'development_seed',
    'user_dev_super_admin'
  );

insert into public.institution_memberships (
  id,
  institution_id,
  user_id,
  status,
  primary_sport,
  category,
  joined_at,
  invited_by_user_id
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'user_dev_referee_a',
    'active',
    'football_11',
    'development',
    now(),
    'user_dev_institution_admin'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'user_dev_referee_b',
    'active',
    'futsal',
    'development',
    now(),
    'user_dev_institution_admin'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    'user_dev_instructor',
    'active',
    'football_11',
    'development',
    now(),
    'user_dev_institution_admin'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    'user_dev_institution_admin',
    'active',
    'football_11',
    'development',
    now(),
    'user_dev_super_admin'
  );

insert into public.institution_membership_roles (
  institution_id,
  membership_id,
  role_id,
  assigned_by_user_id
)
select
  '30000000-0000-4000-8000-000000000001',
  assignment.membership_id,
  institution_role.id,
  'user_dev_super_admin'
from (
  values
    ('40000000-0000-4000-8000-000000000001'::uuid, 'referee'::text),
    ('40000000-0000-4000-8000-000000000002'::uuid, 'referee'::text),
    ('40000000-0000-4000-8000-000000000003'::uuid, 'instructor'::text),
    (
      '40000000-0000-4000-8000-000000000004'::uuid,
      'institution_admin'::text
    )
) as assignment(membership_id, role_key)
join public.institution_roles institution_role
  on institution_role.institution_id is null
 and institution_role.role_key = assignment.role_key;

insert into public.institution_groups (
  id,
  institution_id,
  name,
  description,
  group_type,
  sport_type,
  category,
  status,
  created_by_user_id
)
values (
  '50000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Development Football 11 Group',
  'Synthetic group for authorization and isolation tests.',
  'training',
  'football_11',
  'development',
  'active',
  'user_dev_institution_admin'
);

insert into public.institution_group_memberships (
  id,
  institution_id,
  group_id,
  membership_id,
  group_role,
  status
)
values
  (
    '51000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'participant',
    'active'
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'instructor',
    'active'
  );

insert into public.psychology_checkins (
  id,
  user_id,
  sport_type,
  module_slug,
  checkin_type,
  focus_goal,
  confidence_score,
  concentration_score,
  mental_score,
  feedback,
  responses
)
values (
  '52000000-0000-4000-8000-000000000001',
  'user_dev_referee_a',
  'football_11',
  'preparacion-mental-pre-partido',
  'pre_match',
  'Synthetic focus goal.',
  7,
  8,
  75,
  '{"source":"development_seed"}'::jsonb,
  '{"synthetic":true}'::jsonb
);

-- The exam seed uses one manual item, so it needs no clip row or Storage file.
do $seed_exam$
declare
  seed_exam_session_id constant uuid :=
    '60000000-0000-4000-8000-000000000001';
  submission_id constant uuid :=
    '61000000-0000-4000-8000-000000000001';
  occurrence_id constant uuid :=
    '62000000-0000-4000-8000-000000000001';
  item_manifest jsonb;
  evaluated_attempts jsonb;
  manifest_hash text;
  payload_hash text;
  submission_result jsonb;
begin
  item_manifest := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'source_item_type', 'manual',
      'source_item_id', occurrence_id::text,
      'occurrence_id', occurrence_id::text,
      'position', 1,
      'source_version', 'development-seed-v1'
    )
  );

  manifest_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(item_manifest),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.referee_exam_sessions (
    id,
    user_id,
    submission_id,
    context_type,
    sport_type,
    activity_type,
    season,
    source_version,
    item_manifest,
    manifest_hash,
    item_count,
    status,
    expires_at
  )
  values (
    seed_exam_session_id,
    'user_dev_referee_a',
    submission_id,
    'individual',
    'football_11',
    'referee_exam',
    'development',
    'development-seed-v1',
    item_manifest,
    manifest_hash,
    1,
    'active',
    now() + interval '1 day'
  );

  evaluated_attempts := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'occurrence_id', occurrence_id::text,
      'source_item_type', 'manual',
      'source_item_id', occurrence_id::text,
      'topic', 'Disputas',
      'score', 1,
      'max_score', 1,
      'is_correct', true,
      'technical_correct', true,
      'disciplinary_correct', true,
      'time_spent_seconds', 12
    )
  );

  payload_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(evaluated_attempts),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  submission_result := public.submit_referee_exam(
    'user_dev_referee_a',
    seed_exam_session_id,
    submission_id,
    payload_hash,
    evaluated_attempts
  );

  if submission_result->>'idempotent_replay' <> 'false' then
    raise exception 'development exam seed did not create a fresh result';
  end if;

  if (
    select count(*)
    from public.exam_results result
    where result.exam_session_id = seed_exam_session_id
  ) <> 1 then
    raise exception 'development exam seed expected exactly one result';
  end if;

  if (
    select count(*)
    from public.attempts attempt
    where attempt.exam_result_id =
      (submission_result->>'exam_result_id')::uuid
  ) <> 1 then
    raise exception 'development exam seed expected exactly one attempt';
  end if;
end
$seed_exam$;

commit;
