-- Production adoption Phase 3B: reviewed policy reconciliation only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '90s';

do $preflight$
declare
  table_name text;
  policy_kind text;
  policy_name text;
  policy_state record;
  normalized_using text;
  normalized_check text;
  expected_using text;
  expected_check text;
  authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
  read_write_tables constant text[] := array[
    'user_profiles',
    'match_preparations',
    'post_match_reviews',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ]::text[];
  read_only_tables constant text[] := array[
    'attempts',
    'exam_results',
    'rules_exam_results',
    'notification_events'
  ]::text[];
begin
  if authenticated_oid is null
     or pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
     or pg_catalog.to_regprocedure('reflab_private.is_super_admin()') is null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order = 4 and phase_key = 'canonical_objects') then
    raise exception 'Reviewed identity and Phase 2B state is required before policy reconciliation'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from unnest(array[
      'public.resolve_development_clerk_identity(text)',
      'public.link_development_clerk_identity(text)',
      'public.link_development_super_admin_clerk_identity(text)'
    ]::text[]) forbidden(signature)
    where pg_catalog.to_regprocedure(forbidden.signature) is not null
  ) then
    raise exception 'Development RPC is forbidden during policy reconciliation'
      using errcode = '55000';
  end if;

  foreach table_name in array read_write_tables || read_only_tables loop
    if pg_catalog.to_regclass('public.' || table_name) is null then
      raise exception 'Reviewed policy table dependency is missing' using errcode = '55000';
    end if;
    if not exists (
      select 1 from pg_catalog.pg_class relation
      where relation.oid = pg_catalog.to_regclass('public.' || table_name)
        and relation.relrowsecurity
    ) then
      raise exception 'RLS must remain enabled during policy reconciliation'
        using errcode = '55000';
    end if;

    foreach policy_kind in array case when table_name = any (read_write_tables)
      then array['read', 'insert', 'update']::text[]
      else array['read']::text[] end
    loop
      policy_name := table_name || '_own_' || policy_kind;
      select policy.polcmd, policy.polpermissive, policy.polroles,
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) as using_expression,
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) as check_expression
      into policy_state
      from pg_catalog.pg_policy policy
      where policy.polrelid = pg_catalog.to_regclass('public.' || table_name)
        and policy.polname = policy_name;

      if found then
        if policy_state.polcmd <> (case policy_kind when 'read' then 'r' when 'insert' then 'a' else 'w' end)
           or not policy_state.polpermissive
           or policy_state.polroles <> array[authenticated_oid] then
          raise exception 'Reviewed policy metadata drift blocks reconciliation'
            using errcode = '55000';
        end if;

        normalized_using := pg_catalog.lower(coalesce(policy_state.using_expression, ''));
        normalized_check := pg_catalog.lower(coalesce(policy_state.check_expression, ''));
        normalized_using := pg_catalog.regexp_replace(
          normalized_using,
          '(^|[^a-z0-9_.])((public[.])?platform_request_user_id)[[:space:]]*[(][[:space:]]*[)]',
          E'\\1reflab_private.request_user_id()',
          'g'
        );
        normalized_using := pg_catalog.regexp_replace(
          normalized_using,
          '(^|[^a-z0-9_.])((public[.])?platform_is_super_admin)[[:space:]]*[(][[:space:]]*[)]',
          E'\\1reflab_private.is_super_admin()',
          'g'
        );
        normalized_check := pg_catalog.regexp_replace(
          normalized_check,
          '(^|[^a-z0-9_.])((public[.])?platform_request_user_id)[[:space:]]*[(][[:space:]]*[)]',
          E'\\1reflab_private.request_user_id()',
          'g'
        );
        normalized_using := pg_catalog.regexp_replace(normalized_using, '[[:space:]()]', '', 'g');
        normalized_check := pg_catalog.regexp_replace(normalized_check, '[[:space:]()]', '', 'g');

        expected_using := case policy_kind
          when 'read' then 'user_id=reflab_private.request_user_idorreflab_private.is_super_admin'
          when 'update' then 'user_id=reflab_private.request_user_id'
          else ''
        end;
        expected_check := case policy_kind
          when 'insert' then 'user_id=reflab_private.request_user_id'
          when 'update' then 'user_id=reflab_private.request_user_id'
          else ''
        end;
        if normalized_using <> expected_using or normalized_check <> expected_check then
          raise exception 'Reviewed policy expression drift blocks reconciliation'
            using errcode = '55000';
        end if;
      end if;
    end loop;
  end loop;
end
$preflight$;

do $replace_policies$
declare
  table_name text;
  policy_kind text;
  policy_name text;
  read_write_tables constant text[] := array[
    'user_profiles',
    'match_preparations',
    'post_match_reviews',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ]::text[];
  read_only_tables constant text[] := array[
    'attempts',
    'exam_results',
    'rules_exam_results',
    'notification_events'
  ]::text[];
begin
  foreach table_name in array read_write_tables || read_only_tables loop
    foreach policy_kind in array case when table_name = any (read_write_tables)
      then array['read', 'insert', 'update']::text[]
      else array['read']::text[] end
    loop
      policy_name := table_name || '_own_' || policy_kind;
      execute pg_catalog.format('drop policy if exists %I on public.%I', policy_name, table_name);
      if policy_kind = 'read' then
        execute pg_catalog.format(
          'create policy %I on public.%I as permissive for select to authenticated using (user_id = reflab_private.request_user_id() or reflab_private.is_super_admin())',
          policy_name, table_name
        );
      elsif policy_kind = 'insert' then
        execute pg_catalog.format(
          'create policy %I on public.%I as permissive for insert to authenticated with check (user_id = reflab_private.request_user_id())',
          policy_name, table_name
        );
      else
        execute pg_catalog.format(
          'create policy %I on public.%I as permissive for update to authenticated using (user_id = reflab_private.request_user_id()) with check (user_id = reflab_private.request_user_id())',
          policy_name, table_name
        );
      end if;
    end loop;
  end loop;
end
$replace_policies$;

do $assertions$
declare
  table_name text;
  policy_kind text;
  policy_name text;
  policy_state record;
  normalized_using text;
  normalized_check text;
  expected_using text;
  expected_check text;
  authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
  reviewed_policy_count integer;
  read_write_tables constant text[] := array[
    'user_profiles',
    'match_preparations',
    'post_match_reviews',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ]::text[];
  read_only_tables constant text[] := array[
    'attempts',
    'exam_results',
    'rules_exam_results',
    'notification_events'
  ]::text[];
begin
  reviewed_policy_count := 0;
  foreach table_name in array read_write_tables || read_only_tables loop
    foreach policy_kind in array case when table_name = any (read_write_tables)
      then array['read', 'insert', 'update']::text[]
      else array['read']::text[] end
    loop
      policy_name := table_name || '_own_' || policy_kind;
      select policy.polcmd, policy.polpermissive, policy.polroles,
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false) as using_expression,
        pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false) as check_expression
      into policy_state
      from pg_catalog.pg_policy policy
      where policy.polrelid = pg_catalog.to_regclass('public.' || table_name)
        and policy.polname = policy_name;

      if not found
         or policy_state.polcmd <> (case policy_kind when 'read' then 'r' when 'insert' then 'a' else 'w' end)
         or not policy_state.polpermissive
         or policy_state.polroles <> array[authenticated_oid] then
        raise exception 'Reviewed canonical policy metadata is incomplete' using errcode = '55000';
      end if;

      normalized_using := pg_catalog.lower(pg_catalog.regexp_replace(coalesce(policy_state.using_expression, ''), '[[:space:]()]', '', 'g'));
      normalized_check := pg_catalog.lower(pg_catalog.regexp_replace(coalesce(policy_state.check_expression, ''), '[[:space:]()]', '', 'g'));
      expected_using := case policy_kind
        when 'read' then 'user_id=reflab_private.request_user_idorreflab_private.is_super_admin'
        when 'update' then 'user_id=reflab_private.request_user_id'
        else ''
      end;
      expected_check := case policy_kind
        when 'insert' then 'user_id=reflab_private.request_user_id'
        when 'update' then 'user_id=reflab_private.request_user_id'
        else ''
      end;

      if normalized_using <> expected_using
         or normalized_check <> expected_check
         or pg_catalog.strpos(pg_catalog.lower(coalesce(policy_state.using_expression, '')), 'platform_request_user_id') > 0
         or pg_catalog.strpos(pg_catalog.lower(coalesce(policy_state.using_expression, '')), 'platform_is_super_admin') > 0
         or pg_catalog.strpos(pg_catalog.lower(coalesce(policy_state.check_expression, '')), 'platform_request_user_id') > 0
         or pg_catalog.strpos(pg_catalog.lower(coalesce(policy_state.check_expression, '')), 'platform_is_super_admin') > 0 then
        raise exception 'Reviewed canonical policy expression is incomplete' using errcode = '55000';
      end if;
      reviewed_policy_count := reviewed_policy_count + 1;
    end loop;
  end loop;

  if reviewed_policy_count <> 22
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception 'Reviewed canonical policy batch is incomplete' using errcode = '55000';
  end if;
end
$assertions$;

commit;
