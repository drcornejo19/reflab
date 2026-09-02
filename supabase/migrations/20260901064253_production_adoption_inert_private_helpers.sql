-- Production adoption Phase 4B Wave 1: inert private canonical helpers.
-- Generated from the empty-database baseline; no trigger, policy, or runtime activation.
-- Phase 4A contract: production_structural_evidence_v2.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  expected record;
  routine record;
  overload_count integer;
  expected_owner text;
  protected_membership_count integer;
  platform_wrapper record;
  direct_reader_count integer;
  canonical_policy_count integer;
  reviewed_legacy_policy_count integer;
  unexpected_legacy_policy_count integer;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (
       select 1 from reflab_meta.production_adoption_state
       where phase_order = 4 and phase_key = 'canonical_objects'
     )
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Reviewed Phase 1 through Phase 3 adoption state is required for Wave 1'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regnamespace('reflab_audit') is null
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()'))) <> 'reflab_preflight_audit_owner'
     or not (select prosecdef from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()'))
     or (select proconfig from pg_catalog.pg_proc where oid = pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')) is distinct from array['search_path=pg_catalog']::text[] then
    raise exception 'Reviewed Phase 2A semantic audit sidecar is required for Wave 1'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from unnest(array['reflab_private.request_user_id()', 'reflab_private.is_super_admin()', 'reflab_private.canonical_jsonb_text(jsonb)', 'public.admin_set_canonical_user_plan(text, text, text, text)', 'public.admin_set_canonical_global_role(text, text, text, text)', 'public.submit_canonical_training_attempt(text, uuid, jsonb, integer)', 'public.submit_canonical_communication_feedback(text, uuid, text, jsonb)', 'reflab_audit.production_semantic_snapshot()']::text[]) required(signature)
    where pg_catalog.to_regprocedure(required.signature) is null
  ) then
    raise exception 'Reviewed Phase 2B or Phase 3 function prerequisite is missing'
      using errcode = '55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or exists (
       select 1 from unnest(array['public.resolve_development_clerk_identity(text)', 'public.link_development_clerk_identity(text)', 'public.link_development_super_admin_clerk_identity(text)']::text[]) forbidden(signature)
       where pg_catalog.to_regprocedure(forbidden.signature) is not null
     ) then
    raise exception 'Development-only identity infrastructure is forbidden in Wave 1'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)
  into direct_reader_count
  from pg_catalog.pg_proc candidate
  join pg_catalog.pg_namespace namespace on namespace.oid = candidate.pronamespace
  where namespace.nspname in ('public', 'reflab_private')
    and candidate.prokind = 'f'
    and (
      pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claims') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claim.sub') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.jwt()') > 0
      or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.uid()') > 0
    );

  if direct_reader_count <> 1
     or pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
     or not (
       select
         pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claims') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'request.jwt.claim.sub') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.jwt()') > 0
         or pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_functiondef(candidate.oid)), 'auth.uid()') > 0
       from pg_catalog.pg_proc candidate
       where candidate.oid = pg_catalog.to_regprocedure('reflab_private.request_user_id()')
     ) then
    raise exception 'Reviewed Phase 3 identity reconciliation is incomplete'
      using errcode = '55000';
  end if;

  select
    pg_catalog.pg_get_function_identity_arguments(wrapper.oid) as identity_arguments,
    pg_catalog.format_type(wrapper.prorettype, null) as return_type,
    language.lanname as language_name,
    case wrapper.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
    wrapper.proisstrict as strict_mode,
    wrapper.prosecdef as security_definer,
    pg_catalog.pg_get_userbyid(wrapper.proowner) as owner_name,
    wrapper.proconfig,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
      pg_catalog.regexp_replace(wrapper.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'
    ), 'sha256'), 'hex') as source_hash,
    (select pg_catalog.count(*) from pg_catalog.pg_proc overload
     where overload.pronamespace=wrapper.pronamespace and overload.proname=wrapper.proname and overload.prokind='f') as overload_count,
    wrapper.oid
  into platform_wrapper
  from pg_catalog.pg_proc wrapper
  join pg_catalog.pg_language language on language.oid=wrapper.prolang
  where wrapper.oid=pg_catalog.to_regprocedure('public.platform_request_user_id()');

  if not found
     or platform_wrapper.identity_arguments <> ''
     or platform_wrapper.return_type <> 'text'
     or platform_wrapper.language_name <> 'sql'
     or platform_wrapper.volatility_name <> 'stable'
     or platform_wrapper.strict_mode <> false
     or platform_wrapper.security_definer
     or platform_wrapper.owner_name <> 'postgres'
     or platform_wrapper.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or platform_wrapper.source_hash <> '3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c'
     or platform_wrapper.overload_count <> 1
     or exists (
       select 1 from pg_catalog.aclexplode(coalesce(
         (select proacl from pg_catalog.pg_proc where oid=platform_wrapper.oid),
         pg_catalog.acldefault('f',(select proowner from pg_catalog.pg_proc where oid=platform_wrapper.oid))
       )) acl where acl.grantee=0 and acl.privilege_type='EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', platform_wrapper.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('authenticated', platform_wrapper.oid, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', platform_wrapper.oid, 'EXECUTE') then
    raise exception 'Reviewed Phase 3 platform identity wrapper contract is incomplete'
      using errcode = '55000';
  end if;

  with expected_canonical_policies(table_name, policy_name, command_code, expected_using, expected_check) as (
    values
    (
      'user_profiles', 'user_profiles_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'user_profiles', 'user_profiles_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'user_profiles', 'user_profiles_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'match_preparations', 'match_preparations_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'match_preparations', 'match_preparations_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'match_preparations', 'match_preparations_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'post_match_reviews', 'post_match_reviews_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'post_match_reviews', 'post_match_reviews_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'post_match_reviews', 'post_match_reviews_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_checkins', 'psychology_checkins_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'psychology_checkins', 'psychology_checkins_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_checkins', 'psychology_checkins_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_wellbeing_assessments', 'psychology_wellbeing_assessments_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'psychology_wellbeing_assessments', 'psychology_wellbeing_assessments_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_wellbeing_assessments', 'psychology_wellbeing_assessments_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_exercise_sessions', 'psychology_exercise_sessions_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'psychology_exercise_sessions', 'psychology_exercise_sessions_own_insert', 'a',
      '',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'psychology_exercise_sessions', 'psychology_exercise_sessions_own_update', 'w',
      'user_id=reflab_private.request_user_id',
      'user_id=reflab_private.request_user_id'
    ),
    (
      'attempts', 'attempts_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'exam_results', 'exam_results_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'rules_exam_results', 'rules_exam_results_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    ),
    (
      'notification_events', 'notification_events_own_read', 'r',
      'user_id=reflab_private.request_user_idorreflab_private.is_super_admin',
      ''
    )
  ), observed as (
    select expected_policy.*,
      policy.oid,
      policy.polcmd,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_using,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_check,
      pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'') || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')) raw_expression
    from expected_canonical_policies expected_policy
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.' || expected_policy.table_name)
    left join pg_catalog.pg_policy policy on policy.polrelid=relation.oid and policy.polname=expected_policy.policy_name
  )
  select pg_catalog.count(*) into canonical_policy_count
  from observed
  where oid is not null and polcmd=command_code and polpermissive
    and polroles=array[pg_catalog.to_regrole('authenticated')::oid]
    and normalized_using=expected_using and normalized_check=expected_check
    and pg_catalog.strpos(raw_expression,'platform_request_user_id')=0
    and pg_catalog.strpos(raw_expression,'platform_is_super_admin')=0
    and pg_catalog.strpos(raw_expression,'institution_request_user_id')=0
    and pg_catalog.strpos(raw_expression,'reflab_request_user_id')=0;

  if canonical_policy_count <> 22 then
    raise exception 'Reviewed Phase 3 canonical policy contract is incomplete'
      using errcode = '55000';
  end if;

  with expected_legacy_policies(table_name, policy_name) as (
    values
    (
      'attempts', 'attempts_own_insert'
    ),
    (
      'exam_results', 'exam_results_own_insert'
    ),
    (
      'rules_exam_results', 'rules_exam_results_own_insert'
    )
  ), observed as (
    select expected_policy.*,
      policy.oid,
      policy.polcmd,
      policy.polpermissive,
      policy.polroles,
      pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false) using_expression,
      pg_catalog.lower(pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),''),'[[:space:]()]','','g')) normalized_check
    from expected_legacy_policies expected_policy
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.' || expected_policy.table_name)
    left join pg_catalog.pg_policy policy on policy.polrelid=relation.oid and policy.polname=expected_policy.policy_name
  )
  select pg_catalog.count(*) into reviewed_legacy_policy_count
  from observed
  where oid is not null and polcmd='a' and polpermissive
    and polroles=array[pg_catalog.to_regrole('authenticated')::oid]
    and using_expression is null
    and normalized_check = any(array['user_id=platform_request_user_id','user_id=public.platform_request_user_id']::text[]);

  if reviewed_legacy_policy_count <> 3 then
    raise exception 'Reviewed temporary legacy INSERT policy contract is incomplete'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*) into unexpected_legacy_policy_count
  from pg_catalog.pg_policy policy
  join pg_catalog.pg_class relation on relation.oid=policy.polrelid
  join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
  where (
    pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'platform_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'platform_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'platform_is_super_admin') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'platform_is_super_admin') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'institution_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'institution_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'')), 'reflab_request_user_id') > 0
    or pg_catalog.strpos(pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false),'')), 'reflab_request_user_id') > 0
  ) and not (
    namespace.nspname='public'
    and (relation.relname,policy.polname) in (
      ('attempts','attempts_own_insert'),
      ('exam_results','exam_results_own_insert'),
      ('rules_exam_results','rules_exam_results_own_insert')
    )
  );

  if unexpected_legacy_policy_count <> 0 then
    raise exception 'Unexpected legacy policy identity caller blocks Wave 1'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)
  into protected_membership_count
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
  where granted_role.rolname in (
      'anon', 'authenticated', 'service_role', 'legacy_runtime', 'reflab_rls_owner',
      'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner'
    )
     or member_role.rolname in (
      'anon', 'authenticated', 'service_role', 'legacy_runtime', 'reflab_rls_owner',
      'reflab_prod_preflight_ro', 'reflab_preflight_audit_owner'
    );

  if protected_membership_count <> 0 then
    raise exception 'Unsafe protected-role membership blocks Wave 1'
      using errcode = '55000';
  end if;

  for expected in
    select * from (values
    (
      'has_active_institution_membership',
      'reflab_private.has_active_institution_membership(uuid)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'd761b8b6242beddf871f8b0bc6e0f6fa26c39b414462054c85affce037477b55'
    ),
    (
      'protect_referee_exam_session',
      'reflab_private.protect_referee_exam_session()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '1fdf254bef00727661db48024649eaaa731f9f5799d62273a8717cdb0f2d51c9'
    ),
    (
      'set_updated_at',
      'reflab_private.set_updated_at()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '841260c0f06f596b48e6bdef7500aedef161a2b14eed6752f30f2635245f14f0'
    ),
    (
      'validate_assessment_session_assignment',
      'reflab_private.validate_assessment_session_assignment()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '2c0e009cc55b54dd8346d74fa3b82d4d0f527b4365a5409701dcef4173bece0a'
    ),
    (
      'validate_attempt_exam_context',
      'reflab_private.validate_attempt_exam_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '787acfbdff7c42182f1fe1d4c762c9e1fed9b3a175008f9640172f12b656841a'
    ),
    (
      'validate_exam_result_context',
      'reflab_private.validate_exam_result_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'ee601e6f5952b12aeccd2509bb02e338eda1f328d0cbcd273ab1d37fbba2ea4c'
    ),
    (
      'validate_institution_data_consent',
      'reflab_private.validate_institution_data_consent()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'c3a1a18709b493c90fecefd4bb3bf977cb44617dc5ca41c0b82ad04c071bc5b4'
    ),
    (
      'validate_institution_role_scope',
      'reflab_private.validate_institution_role_scope()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '2324cf72967edd04be8b9c8828ce14931c1b37728bb5e01a63148eaf60a0e321'
    ),
    (
      'validate_institution_user_target',
      'reflab_private.validate_institution_user_target()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3fe56554d558ff85970edad7679c1c22c35ff0f41a6885cbd732e486ead985c1'
    ),
    (
      'validate_owned_appointment',
      'reflab_private.validate_owned_appointment()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'f897b0b7aa860edac711b91cabd3e072f90be418f5a8f95eaed14821899d7a8f'
    ),
    (
      'validate_performance_checkin_owner',
      'reflab_private.validate_performance_checkin_owner()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3f6805d4a5ff46b61d3bbfe22f5f54f27fb12b049908d6587695b5afba050781'
    ),
    (
      'validate_referee_exam_manifest',
      'reflab_private.validate_referee_exam_manifest()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3ba01c88fba53b07729a21c1bb4b73e7ee932b72dc62c22bf449a55c1916b1eb'
    ),
    (
      'validate_referee_exam_session_context',
      'reflab_private.validate_referee_exam_session_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'd9a1b496830ab363e40646f973bd1ea32d29b1d6f80740ee9d6c2e0af6482b21'
    ),
    (
      'validate_user_appointment_context',
      'reflab_private.validate_user_appointment_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'b3679326a4e0444a5ba860e63e5fdc300fd447316b59afcdc6bb38dfb2b2ffc0'
    ),
    (
      'has_institution_permission',
      'reflab_private.has_institution_permission(uuid, text)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'ac23f15ab7a4f9b423be59efccb4d7cb071eb23f3e220be6c6b777beca3e024a'
    ),
    (
      'can_access_user_data',
      'reflab_private.can_access_user_data(text, uuid, text)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'b39a28d925e10cffa32e79f787a3fcf2a84a204ee9870055a8c4ed3a960c1b64'
    )
    ) contract(function_name, signature, return_type, language_name, volatility_name,
      strict_mode, security_definer, owner_contract, source_hash)
  loop
    select pg_catalog.count(*)
    into overload_count
    from pg_catalog.pg_proc overload
    join pg_catalog.pg_namespace namespace on namespace.oid = overload.pronamespace
    where namespace.nspname = 'reflab_private'
      and overload.proname = expected.function_name
      and overload.prokind = 'f';

    if (pg_catalog.to_regprocedure(expected.signature) is null and overload_count <> 0)
       or (pg_catalog.to_regprocedure(expected.signature) is not null and overload_count <> 1) then
      raise exception 'Unexpected Wave 1 helper overload blocks installation: %', expected.signature
        using errcode = '55000';
    end if;

    if pg_catalog.to_regprocedure(expected.signature) is not null then
      select
        pg_catalog.format_type(candidate.prorettype, null) as return_type,
        language.lanname as language_name,
        case candidate.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
        candidate.proisstrict as strict_mode,
        candidate.prosecdef as security_definer,
        pg_catalog.pg_get_userbyid(candidate.proowner) as owner_name,
        candidate.proconfig,
        pg_catalog.encode(
          extensions.digest(
            pg_catalog.convert_to(
              pg_catalog.regexp_replace(candidate.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
              'UTF8'
            ),
            'sha256'
          ),
          'hex'
        ) as source_hash,
        pg_catalog.obj_description(candidate.oid, 'pg_proc') as provider_comment,
        candidate.oid
      into routine
      from pg_catalog.pg_proc candidate
      join pg_catalog.pg_language language on language.oid = candidate.prolang
      where candidate.oid = pg_catalog.to_regprocedure(expected.signature);

      expected_owner := case expected.owner_contract
        when 'reflab_rls_owner' then 'reflab_rls_owner'
        else current_user
      end;

      if routine.return_type <> expected.return_type
         or routine.language_name <> expected.language_name
         or routine.volatility_name <> expected.volatility_name
         or routine.strict_mode <> expected.strict_mode
         or routine.security_definer <> expected.security_definer
         or routine.owner_name <> expected_owner
         or routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
         or routine.source_hash <> expected.source_hash then
        raise exception 'Wave 1 helper contract drift blocks installation: %', expected.signature
          using errcode = '55000';
      end if;

      if routine.provider_comment is not null
         and routine.provider_comment <> 'reflab:production_adoption_provider=20260901064253' then
        raise exception 'Duplicate Wave 1 provider declaration blocks installation: %', expected.signature
          using errcode = '55000';
      end if;

      if exists (
        select 1 from pg_catalog.aclexplode(
          coalesce((select proacl from pg_catalog.pg_proc where oid = routine.oid),
            pg_catalog.acldefault('f', (select proowner from pg_catalog.pg_proc where oid = routine.oid)))
        ) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ) or exists (
        select 1 from unnest(array['anon', 'authenticated', 'service_role']::text[]) application_role(role_name)
        where pg_catalog.has_function_privilege(application_role.role_name, routine.oid, 'EXECUTE')
      ) then
        raise exception 'Pre-existing Wave 1 helper ACL is unsafe: %', expected.signature
          using errcode = '55000';
      end if;
    end if;
  end loop;
end
$preflight$;

do $install$
begin
  if pg_catalog.to_regprocedure('reflab_private.has_active_institution_membership(uuid)') is null then
    execute $wave1_helper_01$create function reflab_private.has_active_institution_membership(
  p_institution_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    reflab_private.is_super_admin()
    or exists (
      select 1
      from public.institution_memberships membership
      join public.institutions institution
        on institution.id = membership.institution_id
      join public.institution_subscriptions subscription
        on subscription.institution_id = institution.id
      where membership.institution_id = p_institution_id
        and membership.user_id = reflab_private.request_user_id()
        and membership.status = 'active'
        and institution.deleted_at is null
        and institution.status in ('trial', 'active')
        and subscription.status in ('trialing', 'active')
        and subscription.starts_at <= pg_catalog.now()
        and (
          subscription.ends_at is null
          or subscription.ends_at > pg_catalog.now()
        )
    );
$function$;$wave1_helper_01$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.protect_referee_exam_session()') is null then
    execute $wave1_helper_02$create function reflab_private.protect_referee_exam_session()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if old.user_id is distinct from new.user_id
     or old.submission_id is distinct from new.submission_id
     or old.context_type is distinct from new.context_type
     or old.sport_type is distinct from new.sport_type
     or old.activity_type is distinct from new.activity_type
     or old.season is distinct from new.season
     or old.source_version is distinct from new.source_version
     or old.institution_id is distinct from new.institution_id
     or old.institution_group_id is distinct from new.institution_group_id
     or old.institution_assessment_session_id is distinct from new.institution_assessment_session_id
     or old.item_manifest is distinct from new.item_manifest
     or old.manifest_hash is distinct from new.manifest_hash
     or old.item_count is distinct from new.item_count
     or old.created_at is distinct from new.created_at
     or old.started_at is distinct from new.started_at
     or old.expires_at is distinct from new.expires_at then
    raise exception 'immutable referee exam session fields cannot be changed';
  end if;

  if old.status in ('submitted', 'expired', 'cancelled')
     and new.status is distinct from old.status then
    raise exception 'terminal referee exam sessions cannot change status';
  end if;

  if old.status = 'created' and new.status not in ('created', 'active', 'expired', 'cancelled') then
    raise exception 'invalid referee exam session transition';
  end if;

  if old.status = 'active' and new.status not in ('active', 'submitted', 'expired', 'cancelled') then
    raise exception 'invalid referee exam session transition';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then
    raise exception 'submitted_at is required for a submitted exam session';
  end if;

  if new.status <> 'submitted' and new.submitted_at is not null then
    raise exception 'submitted_at is only valid for a submitted exam session';
  end if;

  return new;
end
$function$;$wave1_helper_02$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null then
    execute $wave1_helper_03$create function reflab_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$function$;$wave1_helper_03$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_assessment_session_assignment()') is null then
    execute $wave1_helper_04$create function reflab_private.validate_assessment_session_assignment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  assignment public.institution_assessment_assignments%rowtype;
begin
  select *
  into assignment
  from public.institution_assessment_assignments assignment_row
  where assignment_row.id = new.assignment_id;

  if not found
     or assignment.institution_id <> new.institution_id
     or assignment.assessment_id <> new.assessment_id then
    raise exception 'assessment session assignment context is invalid';
  end if;

  if assignment.user_id is not null then
    if assignment.user_id <> new.user_id or new.group_id is not null then
      raise exception 'assessment session does not match its direct user assignment';
    end if;
  else
    if assignment.group_id is null
       or assignment.group_id is distinct from new.group_id
       or not exists (
         select 1
         from public.institution_memberships membership
         join public.institution_group_memberships group_membership
           on group_membership.membership_id = membership.id
          and group_membership.institution_id = membership.institution_id
          and group_membership.status = 'active'
         where membership.institution_id = new.institution_id
           and membership.user_id = new.user_id
           and membership.status = 'active'
           and group_membership.group_id = new.group_id
       ) then
      raise exception 'assessment session user is not assigned to the institution group';
    end if;
  end if;

  return new;
end
$function$;$wave1_helper_04$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_attempt_exam_context()') is null then
    execute $wave1_helper_05$create function reflab_private.validate_attempt_exam_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  exam_result public.exam_results%rowtype;
begin
  if new.exam_result_id is null then
    return new;
  end if;

  select *
  into exam_result
  from public.exam_results result_row
  where result_row.id = new.exam_result_id;

  if not found
     or exam_result.user_id <> new.user_id
     or exam_result.submission_id <> new.submission_id
     or exam_result.sport_type <> new.sport_type
     or exam_result.institution_id is distinct from new.institution_id
     or exam_result.institution_group_id is distinct from new.institution_group_id
     or exam_result.institution_assessment_session_id is distinct from
        new.institution_assessment_session_id then
    raise exception 'attempt context does not match its exam result';
  end if;

  return new;
end
$function$;$wave1_helper_05$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_exam_result_context()') is null then
    execute $wave1_helper_06$create function reflab_private.validate_exam_result_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  exam_session public.referee_exam_sessions%rowtype;
begin
  select *
  into exam_session
  from public.referee_exam_sessions session_row
  where session_row.id = new.exam_session_id;

  if not found
     or exam_session.user_id <> new.user_id
     or exam_session.submission_id <> new.submission_id
     or exam_session.sport_type <> new.sport_type
     or exam_session.activity_type <> new.activity_type
     or exam_session.institution_id is distinct from new.institution_id
     or exam_session.institution_group_id is distinct from new.institution_group_id
     or exam_session.institution_assessment_session_id is distinct from
        new.institution_assessment_session_id then
    raise exception 'exam result context does not match its referee exam session';
  end if;

  return new;
end
$function$;$wave1_helper_06$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_institution_data_consent()') is null then
    execute $wave1_helper_07$create function reflab_private.validate_institution_data_consent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.institution_memberships membership
    where membership.id = new.membership_id
      and membership.institution_id = new.institution_id
      and membership.user_id = new.user_id
  ) then
    raise exception 'data consent does not match its institution membership';
  end if;

  return new;
end
$function$;$wave1_helper_07$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_institution_role_scope()') is null then
    execute $wave1_helper_08$create function reflab_private.validate_institution_role_scope()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  role_institution_id uuid;
  membership_institution_id uuid;
begin
  select role.institution_id
  into role_institution_id
  from public.institution_roles role
  where role.id = new.role_id;

  if not found then
    raise exception 'institution role does not exist';
  end if;

  if tg_table_name = 'institution_membership_roles' then
    select membership.institution_id
    into membership_institution_id
    from public.institution_memberships membership
    where membership.id = new.membership_id;

    if not found or membership_institution_id <> new.institution_id then
      raise exception 'membership and role assignment institutions do not match';
    end if;

    if role_institution_id is not null
       and role_institution_id <> new.institution_id then
      raise exception 'institution role belongs to another institution';
    end if;
  elsif tg_table_name = 'institution_role_permissions' then
    if role_institution_id is distinct from new.institution_id then
      raise exception 'role permission institution does not match its role';
    end if;
  else
    raise exception 'unsupported role-scope validation table: %', tg_table_name;
  end if;

  return new;
end
$function$;$wave1_helper_08$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_institution_user_target()') is null then
    execute $wave1_helper_09$create function reflab_private.validate_institution_user_target()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.user_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.institution_memberships membership
    where membership.institution_id = new.institution_id
      and membership.user_id = new.user_id
      and membership.status = 'active'
  ) then
    raise exception 'target user does not have an active institution membership';
  end if;

  return new;
end
$function$;$wave1_helper_09$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_owned_appointment()') is null then
    execute $wave1_helper_10$create function reflab_private.validate_owned_appointment()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.appointments appointment
    where appointment.id = new.appointment_id
      and appointment.user_id = new.user_id
      and appointment.sport_type = new.sport_type
  ) then
    raise exception 'appointment does not match the row owner and discipline';
  end if;

  return new;
end
$function$;$wave1_helper_10$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_performance_checkin_owner()') is null then
    execute $wave1_helper_11$create function reflab_private.validate_performance_checkin_owner()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.checkin_id is not null
     and not exists (
       select 1
       from public.performance_checkins checkin
       where checkin.id = new.checkin_id
         and checkin.user_id = new.user_id
     ) then
    raise exception 'performance check-in does not belong to the row user';
  end if;

  return new;
end
$function$;$wave1_helper_11$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_referee_exam_manifest()') is null then
    execute $wave1_helper_12$create function reflab_private.validate_referee_exam_manifest()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  manifest_item jsonb;
  occurrence_count integer;
  position_count integer;
  computed_manifest_hash text;
  allowed_manifest_keys constant text[] := array[
    'source_item_type',
    'source_item_id',
    'occurrence_id',
    'position',
    'source_version'
  ]::text[];
begin
  if pg_catalog.jsonb_typeof(new.item_manifest) <> 'array' then
    raise exception 'item_manifest must be a JSON array';
  end if;

  if pg_catalog.jsonb_array_length(new.item_manifest) <> new.item_count then
    raise exception 'item_count does not match item_manifest';
  end if;

  for manifest_item in
    select value
    from pg_catalog.jsonb_array_elements(new.item_manifest)
  loop
    if pg_catalog.jsonb_typeof(manifest_item) <> 'object' then
      raise exception 'each manifest item must be a JSON object';
    end if;

    if not (
      manifest_item ? 'source_item_type'
      and manifest_item ? 'source_item_id'
      and manifest_item ? 'occurrence_id'
      and manifest_item ? 'position'
    ) then
      raise exception 'manifest item is missing a required key';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(manifest_item)
        as supplied(supplied_key)
      where not (supplied_key = any (allowed_manifest_keys))
    ) then
      raise exception 'manifest item contains an unsupported key';
    end if;

    if pg_catalog.jsonb_typeof(manifest_item->'source_item_type') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'source_item_id') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'occurrence_id') <> 'string'
       or pg_catalog.jsonb_typeof(manifest_item->'position') <> 'number' then
      raise exception 'manifest item has an invalid required value type';
    end if;

    if manifest_item->>'source_item_type' not in (
      'global_clip',
      'institutional_clip',
      'rule_question',
      'manual'
    ) then
      raise exception 'manifest item has an invalid source_item_type';
    end if;

    if pg_catalog.btrim(manifest_item->>'source_item_id') = '' then
      raise exception 'manifest source_item_id cannot be empty';
    end if;

    perform (manifest_item->>'occurrence_id')::uuid;

    if (manifest_item->>'position')::numeric
       <> pg_catalog.trunc((manifest_item->>'position')::numeric) then
      raise exception 'manifest position must be an integer';
    end if;

    if (manifest_item->>'position')::integer < 1
       or (manifest_item->>'position')::integer > new.item_count then
      raise exception 'manifest position is outside the expected range';
    end if;

    if manifest_item ? 'source_version'
       and pg_catalog.jsonb_typeof(manifest_item->'source_version') not in ('string', 'null') then
      raise exception 'manifest source_version must be a string or null';
    end if;

    if manifest_item->>'source_item_type' = 'global_clip' then
      perform (manifest_item->>'source_item_id')::uuid;

      if not exists (
        select 1
        from public.clips clip
        where clip.id = (manifest_item->>'source_item_id')::uuid
          and clip.sport_type = new.sport_type
          and clip.is_active
          and clip.status = 'published'
      ) then
        raise exception 'manifest references an unavailable global clip';
      end if;
    elsif manifest_item->>'source_item_type' = 'institutional_clip' then
      perform (manifest_item->>'source_item_id')::uuid;

      if not exists (
        select 1
        from public.institutional_clips clip
        where clip.id = (manifest_item->>'source_item_id')::uuid
          and clip.sport_type = new.sport_type
          and clip.status = 'published'
          and (
            clip.is_public
            or (
              new.context_type = 'institutional'
              and clip.institution_id = new.institution_id
            )
          )
      ) then
        raise exception 'manifest references an unavailable institutional clip';
      end if;
    elsif manifest_item->>'source_item_type' = 'manual' then
      perform (manifest_item->>'source_item_id')::uuid;

      if manifest_item->>'source_item_id'
         <> manifest_item->>'occurrence_id' then
        raise exception 'manual source_item_id must equal occurrence_id';
      end if;
    end if;
  end loop;

  select count(distinct value->>'occurrence_id')
  into occurrence_count
  from pg_catalog.jsonb_array_elements(new.item_manifest);

  select count(distinct (value->>'position')::integer)
  into position_count
  from pg_catalog.jsonb_array_elements(new.item_manifest);

  if occurrence_count <> new.item_count or position_count <> new.item_count then
    raise exception 'manifest occurrences and positions must be unique';
  end if;

  computed_manifest_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        reflab_private.canonical_jsonb_text(new.item_manifest),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if computed_manifest_hash <> new.manifest_hash then
    raise exception 'manifest_hash does not match the normalized item_manifest';
  end if;

  return new;
end
$function$;$wave1_helper_12$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_referee_exam_session_context()') is null then
    execute $wave1_helper_13$create function reflab_private.validate_referee_exam_session_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if new.context_type = 'individual' then
    return new;
  end if;

  if not exists (
    select 1
    from public.institution_assessment_sessions assessment_session
    join public.institution_assessments assessment
      on assessment.id = assessment_session.assessment_id
     and assessment.institution_id = assessment_session.institution_id
    where assessment_session.id = new.institution_assessment_session_id
      and assessment_session.institution_id = new.institution_id
      and assessment_session.user_id = new.user_id
      and assessment_session.group_id is not distinct from new.institution_group_id
      and assessment.sport_type = new.sport_type
  ) then
    raise exception 'referee exam session institutional context is invalid';
  end if;

  return new;
end
$function$;$wave1_helper_13$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.validate_user_appointment_context()') is null then
    execute $wave1_helper_14$create function reflab_private.validate_user_appointment_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  appointment_user_id text;
  appointment_fixture_id uuid;
  appointment_sport_type text;
begin
  if new.appointment_id is null then
    return new;
  end if;

  select
    appointment.user_id,
    appointment.fixture_id,
    appointment.sport_type
  into
    appointment_user_id,
    appointment_fixture_id,
    appointment_sport_type
  from public.appointments appointment
  where appointment.id = new.appointment_id;

  if not found then
    raise exception 'appointment context is unavailable';
  end if;

  if appointment_user_id <> new.user_id then
    raise exception 'appointment does not belong to the row user';
  end if;

  if new.fixture_id is not null
     and new.fixture_id <> appointment_fixture_id then
    raise exception 'fixture does not match the appointment';
  end if;

  if new.sport_type is not null
     and new.sport_type <> appointment_sport_type then
    raise exception 'sport_type does not match the appointment';
  end if;

  return new;
end
$function$;$wave1_helper_14$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.has_institution_permission(uuid, text)') is null then
    execute $wave1_helper_15$create function reflab_private.has_institution_permission(
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  with caller_membership as (
    select membership.id
    from public.institution_memberships membership
    where membership.institution_id = p_institution_id
      and membership.user_id = reflab_private.request_user_id()
      and membership.status = 'active'
  ),
  requested_permission as (
    select permission.id
    from public.institution_permissions permission
    where permission.permission_key = p_permission_key
  ),
  explicit_override as (
    select override.allowed
    from public.institution_membership_permission_overrides override
    join caller_membership
      on caller_membership.id = override.membership_id
    join requested_permission
      on requested_permission.id = override.permission_id
    where override.institution_id = p_institution_id
    limit 1
  ),
  role_permission as (
    select true as allowed
    from caller_membership
    join public.institution_membership_roles membership_role
      on membership_role.membership_id = caller_membership.id
     and membership_role.institution_id = p_institution_id
    join public.institution_roles institution_role
      on institution_role.id = membership_role.role_id
     and (
       institution_role.institution_id = p_institution_id
       or institution_role.institution_id is null
     )
    join public.institution_role_permissions role_permission
      on role_permission.role_id = institution_role.id
    join requested_permission
      on requested_permission.id = role_permission.permission_id
    limit 1
  )
  select
    reflab_private.is_super_admin()
    or (
      reflab_private.has_active_institution_membership(p_institution_id)
      and case
        when exists (select 1 from explicit_override where allowed = false) then false
        when exists (select 1 from explicit_override where allowed = true) then true
        else exists (select 1 from role_permission)
      end
    );
$function$;$wave1_helper_15$;
  end if;

  if pg_catalog.to_regprocedure('reflab_private.can_access_user_data(text, uuid, text)') is null then
    execute $wave1_helper_16$create function reflab_private.can_access_user_data(
  p_target_user_id text,
  p_institution_id uuid,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    p_target_user_id = reflab_private.request_user_id()
    or reflab_private.is_super_admin()
    or (
      p_institution_id is not null
      and reflab_private.has_institution_permission(
        p_institution_id,
        p_permission_key
      )
      and exists (
        select 1
        from public.institution_memberships target_membership
        where target_membership.institution_id = p_institution_id
          and target_membership.user_id = p_target_user_id
          and target_membership.status = 'active'
      )
    );
$function$;$wave1_helper_16$;
  end if;
end
$install$;

comment on function reflab_private.has_active_institution_membership(uuid) is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.protect_referee_exam_session() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.set_updated_at() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_assessment_session_assignment() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_attempt_exam_context() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_exam_result_context() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_institution_data_consent() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_institution_role_scope() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_institution_user_target() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_owned_appointment() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_performance_checkin_owner() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_referee_exam_manifest() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_referee_exam_session_context() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.validate_user_appointment_context() is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.has_institution_permission(uuid, text) is 'reflab:production_adoption_provider=20260901064253';
comment on function reflab_private.can_access_user_data(text, uuid, text) is 'reflab:production_adoption_provider=20260901064253';

alter function reflab_private.has_active_institution_membership(uuid) owner to reflab_rls_owner;
alter function reflab_private.has_institution_permission(uuid, text) owner to reflab_rls_owner;
alter function reflab_private.can_access_user_data(text, uuid, text) owner to reflab_rls_owner;

revoke all on function
  reflab_private.has_active_institution_membership(uuid),
  reflab_private.protect_referee_exam_session(),
  reflab_private.set_updated_at(),
  reflab_private.validate_assessment_session_assignment(),
  reflab_private.validate_attempt_exam_context(),
  reflab_private.validate_exam_result_context(),
  reflab_private.validate_institution_data_consent(),
  reflab_private.validate_institution_role_scope(),
  reflab_private.validate_institution_user_target(),
  reflab_private.validate_owned_appointment(),
  reflab_private.validate_performance_checkin_owner(),
  reflab_private.validate_referee_exam_manifest(),
  reflab_private.validate_referee_exam_session_context(),
  reflab_private.validate_user_appointment_context(),
  reflab_private.has_institution_permission(uuid, text),
  reflab_private.can_access_user_data(text, uuid, text)
from public, anon, authenticated, service_role;

do $postconditions$
declare
  expected record;
  routine record;
  expected_owner text;
  exact_count integer := 0;
begin
  for expected in
    select * from (values
    (
      'has_active_institution_membership',
      'reflab_private.has_active_institution_membership(uuid)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'd761b8b6242beddf871f8b0bc6e0f6fa26c39b414462054c85affce037477b55'
    ),
    (
      'protect_referee_exam_session',
      'reflab_private.protect_referee_exam_session()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '1fdf254bef00727661db48024649eaaa731f9f5799d62273a8717cdb0f2d51c9'
    ),
    (
      'set_updated_at',
      'reflab_private.set_updated_at()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '841260c0f06f596b48e6bdef7500aedef161a2b14eed6752f30f2635245f14f0'
    ),
    (
      'validate_assessment_session_assignment',
      'reflab_private.validate_assessment_session_assignment()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '2c0e009cc55b54dd8346d74fa3b82d4d0f527b4365a5409701dcef4173bece0a'
    ),
    (
      'validate_attempt_exam_context',
      'reflab_private.validate_attempt_exam_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '787acfbdff7c42182f1fe1d4c762c9e1fed9b3a175008f9640172f12b656841a'
    ),
    (
      'validate_exam_result_context',
      'reflab_private.validate_exam_result_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'ee601e6f5952b12aeccd2509bb02e338eda1f328d0cbcd273ab1d37fbba2ea4c'
    ),
    (
      'validate_institution_data_consent',
      'reflab_private.validate_institution_data_consent()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'c3a1a18709b493c90fecefd4bb3bf977cb44617dc5ca41c0b82ad04c071bc5b4'
    ),
    (
      'validate_institution_role_scope',
      'reflab_private.validate_institution_role_scope()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '2324cf72967edd04be8b9c8828ce14931c1b37728bb5e01a63148eaf60a0e321'
    ),
    (
      'validate_institution_user_target',
      'reflab_private.validate_institution_user_target()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3fe56554d558ff85970edad7679c1c22c35ff0f41a6885cbd732e486ead985c1'
    ),
    (
      'validate_owned_appointment',
      'reflab_private.validate_owned_appointment()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'f897b0b7aa860edac711b91cabd3e072f90be418f5a8f95eaed14821899d7a8f'
    ),
    (
      'validate_performance_checkin_owner',
      'reflab_private.validate_performance_checkin_owner()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3f6805d4a5ff46b61d3bbfe22f5f54f27fb12b049908d6587695b5afba050781'
    ),
    (
      'validate_referee_exam_manifest',
      'reflab_private.validate_referee_exam_manifest()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      '3ba01c88fba53b07729a21c1bb4b73e7ee932b72dc62c22bf449a55c1916b1eb'
    ),
    (
      'validate_referee_exam_session_context',
      'reflab_private.validate_referee_exam_session_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'd9a1b496830ab363e40646f973bd1ea32d29b1d6f80740ee9d6c2e0af6482b21'
    ),
    (
      'validate_user_appointment_context',
      'reflab_private.validate_user_appointment_context()',
      'trigger',
      'plpgsql',
      'volatile',
      false,
      false,
      'installer',
      'b3679326a4e0444a5ba860e63e5fdc300fd447316b59afcdc6bb38dfb2b2ffc0'
    ),
    (
      'has_institution_permission',
      'reflab_private.has_institution_permission(uuid, text)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'ac23f15ab7a4f9b423be59efccb4d7cb071eb23f3e220be6c6b777beca3e024a'
    ),
    (
      'can_access_user_data',
      'reflab_private.can_access_user_data(text, uuid, text)',
      'boolean',
      'sql',
      'stable',
      false,
      true,
      'reflab_rls_owner',
      'b39a28d925e10cffa32e79f787a3fcf2a84a204ee9870055a8c4ed3a960c1b64'
    )
    ) contract(function_name, signature, return_type, language_name, volatility_name,
      strict_mode, security_definer, owner_contract, source_hash)
  loop
    select
      pg_catalog.format_type(candidate.prorettype, null) as return_type,
      language.lanname as language_name,
      case candidate.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility_name,
      candidate.proisstrict as strict_mode,
      candidate.prosecdef as security_definer,
      pg_catalog.pg_get_userbyid(candidate.proowner) as owner_name,
      candidate.proconfig,
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(
            pg_catalog.regexp_replace(candidate.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      ) as source_hash,
      pg_catalog.obj_description(candidate.oid, 'pg_proc') as provider_comment,
      candidate.oid,
      (select pg_catalog.count(*) from pg_catalog.pg_proc overload
       where overload.pronamespace = candidate.pronamespace
         and overload.proname = candidate.proname and overload.prokind = 'f') as overload_count
    into routine
    from pg_catalog.pg_proc candidate
    join pg_catalog.pg_language language on language.oid = candidate.prolang
    where candidate.oid = pg_catalog.to_regprocedure(expected.signature);

    expected_owner := case expected.owner_contract
      when 'reflab_rls_owner' then 'reflab_rls_owner'
      else current_user
    end;

    if not found
       or routine.return_type <> expected.return_type
       or routine.language_name <> expected.language_name
       or routine.volatility_name <> expected.volatility_name
       or routine.strict_mode <> expected.strict_mode
       or routine.security_definer <> expected.security_definer
       or routine.owner_name <> expected_owner
       or routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or routine.source_hash <> expected.source_hash
       or routine.provider_comment <> 'reflab:production_adoption_provider=20260901064253'
       or routine.overload_count <> 1
       or exists (
         select 1 from pg_catalog.aclexplode(
           coalesce((select proacl from pg_catalog.pg_proc where oid = routine.oid),
             pg_catalog.acldefault('f', (select proowner from pg_catalog.pg_proc where oid = routine.oid)))
         ) acl where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
       )
       or exists (
         select 1 from unnest(array['anon', 'authenticated', 'service_role']::text[]) application_role(role_name)
         where pg_catalog.has_function_privilege(application_role.role_name, routine.oid, 'EXECUTE')
       ) then
      raise exception 'Wave 1 helper postcondition is incomplete: %', expected.signature
        using errcode = '55000';
    end if;
    exact_count := exact_count + 1;
  end loop;

  if exact_count <> 16
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order = 4 and phase_key = 'canonical_objects')
     or pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or pg_catalog.to_regclass('reflab_private.user_identity_links') is not null then
    raise exception 'Wave 1 structural or disabled-runtime invariant failed'
      using errcode = '55000';
  end if;
end
$postconditions$;

commit;
