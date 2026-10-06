-- Synthetic reviewed pre-cutover security state for disposable PostgreSQL only.

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $jwt$
  select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$jwt$;
grant usage on schema auth to authenticated, service_role;

create or replace function public.institution_request_user_id()
returns text language sql stable security invoker
as $function$
  select nullif(auth.jwt() ->> 'sub', '');
$function$;

create or replace function public.platform_request_user_id()
returns text language sql stable security invoker
as $function$
  select nullif(auth.jwt() ->> 'sub', '');
$function$;

create or replace function public.reflab_request_user_id()
returns text language sql stable security invoker
as $function$
  select nullif(auth.jwt() ->> 'sub', '');
$function$;

create or replace function public.platform_is_super_admin()
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select exists (
    select 1 from public.user_global_roles role_row
    where role_row.user_id = public.platform_request_user_id()
      and role_row.role_key = 'super_admin'
  );
$function$;

create or replace function public.institution_is_super_admin()
returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select public.platform_is_super_admin();
$function$;

grant execute on function public.institution_request_user_id() to public, anon;
revoke all on function public.platform_request_user_id() from public, anon;
grant execute on function public.reflab_request_user_id() to public, anon;
grant execute on function public.institution_request_user_id() to authenticated, service_role;
grant execute on function public.platform_request_user_id() to authenticated, service_role;
grant execute on function public.reflab_request_user_id() to authenticated, service_role;

create policy user_profiles_own_read on public.user_profiles for select to authenticated
using (user_id = public.platform_request_user_id() or public.platform_is_super_admin());
create policy user_profiles_own_insert on public.user_profiles for insert to authenticated
with check (user_id = public.platform_request_user_id());
create policy user_profiles_own_update on public.user_profiles for update to authenticated
using (user_id = public.platform_request_user_id()) with check (user_id = public.platform_request_user_id());

do $legacy_owned_policies$
declare
  table_name text;
begin
  foreach table_name in array array[
    'match_preparations',
    'post_match_reviews',
    'psychology_checkins',
    'psychology_wellbeing_assessments',
    'psychology_exercise_sessions'
  ]::text[] loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (user_id = public.platform_request_user_id() or public.platform_is_super_admin())',
      table_name || '_own_read', table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = public.platform_request_user_id())',
      table_name || '_own_insert', table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using (user_id = public.platform_request_user_id()) with check (user_id = public.platform_request_user_id())',
      table_name || '_own_update', table_name
    );
  end loop;

  foreach table_name in array array[
    'attempts', 'exam_results', 'rules_exam_results', 'notification_events'
  ]::text[] loop
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using (user_id = public.platform_request_user_id() or public.platform_is_super_admin())',
      table_name || '_own_read', table_name
    );
  end loop;
end
$legacy_owned_policies$;

create policy exam_results_own_insert on public.exam_results for insert to authenticated
with check (user_id = public.platform_request_user_id());
create policy rules_exam_results_own_insert on public.rules_exam_results for insert to authenticated
with check (user_id = public.platform_request_user_id());
create policy attempts_own_insert on public.attempts for insert to authenticated
with check (user_id = public.platform_request_user_id());

grant select, insert, update, delete, truncate, references, trigger on table
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
to anon, authenticated, service_role;
