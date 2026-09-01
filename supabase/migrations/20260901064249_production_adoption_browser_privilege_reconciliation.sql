-- Production adoption Phase 3C: explicit browser privilege reconciliation.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  table_name text;
  role_state record;
  reviewed_tables constant text[] := array[
    'user_profiles', 'user_global_roles', 'user_subscriptions',
    'attempts', 'exam_results', 'rules_exam_results', 'referee_exam_sessions',
    'notification_events', 'match_preparations', 'post_match_reviews',
    'psychology_checkins', 'psychology_wellbeing_assessments', 'psychology_exercise_sessions'
  ]::text[];
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order = 4 and phase_key = 'canonical_objects') then
    raise exception 'Reviewed disabled runtime state is required before browser privilege reconciliation'
      using errcode = '55000';
  end if;

  foreach table_name in array reviewed_tables loop
    if pg_catalog.to_regclass('public.' || table_name) is null then
      raise exception 'Reviewed browser privilege table is missing' using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl, pg_catalog.acldefault('r'::"char", relation.relowner))) acl
    where namespace.nspname = 'public'
      and relation.relname = any (reviewed_tables)
      and acl.grantee = 0
  ) or exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname = any (reviewed_tables)
      and (acl.grantee = 0 or grantee.rolname in ('anon', 'authenticated'))
  ) then
    raise exception 'Unexpected PUBLIC or column ACL drift blocks reconciliation'
      using errcode = '55000';
  end if;

  foreach table_name in array array['anon', 'authenticated', 'service_role', 'reflab_rls_owner']::text[] loop
    select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    into role_state from pg_catalog.pg_roles where rolname = table_name;
    if not found or role_state.rolsuper or role_state.rolcreatedb or role_state.rolcreaterole
       or role_state.rolbypassrls
       or (table_name = 'reflab_rls_owner' and (role_state.rolcanlogin or role_state.rolinherit)) then
      raise exception 'Unsafe application or helper role blocks reconciliation'
        using errcode = '55000';
    end if;
  end loop;

  if exists (
    select 1 from unnest(array[
      'public.resolve_development_clerk_identity(text)',
      'public.link_development_clerk_identity(text)',
      'public.link_development_super_admin_clerk_identity(text)'
    ]::text[]) forbidden(signature)
    where pg_catalog.to_regprocedure(forbidden.signature) is not null
  ) then
    raise exception 'Development RPC is forbidden during browser privilege reconciliation'
      using errcode = '55000';
  end if;
end
$preflight$;

revoke select, insert, update, delete, truncate, references, trigger on table
  public.user_profiles,
  public.user_global_roles,
  public.user_subscriptions,
  public.attempts,
  public.exam_results,
  public.rules_exam_results,
  public.referee_exam_sessions,
  public.notification_events,
  public.match_preparations,
  public.post_match_reviews,
  public.psychology_checkins,
  public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions
from anon;

revoke delete, truncate, references, trigger on table
  public.user_profiles,
  public.user_global_roles,
  public.user_subscriptions,
  public.attempts,
  public.exam_results,
  public.rules_exam_results,
  public.referee_exam_sessions,
  public.notification_events,
  public.match_preparations,
  public.post_match_reviews,
  public.psychology_checkins,
  public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions
from authenticated;

revoke insert, update on table
  public.user_global_roles,
  public.user_subscriptions,
  public.referee_exam_sessions,
  public.notification_events
from authenticated;

revoke update on table
  public.attempts,
  public.exam_results,
  public.rules_exam_results
from authenticated;

grant select on table
  public.user_profiles,
  public.user_global_roles,
  public.user_subscriptions,
  public.attempts,
  public.exam_results,
  public.rules_exam_results,
  public.referee_exam_sessions,
  public.notification_events,
  public.match_preparations,
  public.post_match_reviews,
  public.psychology_checkins,
  public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions
to authenticated;

-- These broad browser writes remain only for dual-runtime compatibility.
-- Final cutover replaces them with canonical server RPCs or column grants.
grant insert, update on table public.user_profiles to authenticated;
grant insert on table public.attempts, public.exam_results, public.rules_exam_results to authenticated;
grant insert, update on table
  public.match_preparations,
  public.post_match_reviews,
  public.psychology_checkins,
  public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions
to authenticated;

do $assertions$
declare
  table_name text;
  reviewed_tables constant text[] := array[
    'user_profiles', 'user_global_roles', 'user_subscriptions',
    'attempts', 'exam_results', 'rules_exam_results', 'referee_exam_sessions',
    'notification_events', 'match_preparations', 'post_match_reviews',
    'psychology_checkins', 'psychology_wellbeing_assessments', 'psychology_exercise_sessions'
  ]::text[];
begin
  foreach table_name in array reviewed_tables loop
    if pg_catalog.has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or pg_catalog.has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or pg_catalog.has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or pg_catalog.has_table_privilege('anon', 'public.' || table_name, 'DELETE')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'TRUNCATE')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'REFERENCES')
       or pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'TRIGGER')
       or not pg_catalog.has_table_privilege('authenticated', 'public.' || table_name, 'SELECT') then
      raise exception 'Reviewed browser privilege contract is incomplete'
        using errcode = '55000';
    end if;
  end loop;

  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception 'Phase 3 must not activate runtime or advance the adoption ledger'
      using errcode = '55000';
  end if;
end
$assertions$;

commit;
