begin;

-- This migration deliberately keeps public lead creation outside the lockdown.
-- It protects identity, access, attempts and private result tables.

do $$
begin
  if to_regclass('public.user_global_roles') is null then
    raise exception
      'Missing public.user_global_roles. Run 202607240001_access_control_foundation.sql first.';
  end if;
end
$$;

-- Recreate the canonical helpers so this lockdown remains safe to rerun after
-- an interrupted foundation migration or a manual schema reconciliation.
create or replace function public.platform_request_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '');
$$;

create or replace function public.platform_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_global_roles role_row
    where role_row.user_id = public.platform_request_user_id()
      and role_row.role_key = 'super_admin'
  );
$$;

revoke all on function public.platform_request_user_id() from public, anon;
revoke all on function public.platform_is_super_admin() from public, anon;
grant execute on function public.platform_request_user_id()
  to authenticated, service_role;
grant execute on function public.platform_is_super_admin()
  to authenticated, service_role;

create or replace function public.institution_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.platform_is_super_admin();
$$;

revoke all on function public.institution_is_super_admin() from public, anon;
grant execute on function public.institution_is_super_admin()
  to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles',
    'user_roles',
    'attempts',
    'exam_results',
    'rules_exam_results',
    'clips'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on public.%I from anon', table_name);
    end if;
  end loop;
end
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'user_profiles',
        'user_roles',
        'attempts',
        'exam_results',
        'rules_exam_results',
        'clips'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

grant select on public.user_profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert on public.attempts to authenticated;
grant select, insert on public.exam_results to authenticated;
grant select, insert on public.rules_exam_results to authenticated;
grant select, insert, update, delete on public.clips to authenticated;

drop policy if exists user_profiles_own_read on public.user_profiles;
drop policy if exists user_profiles_super_admin_read on public.user_profiles;
drop policy if exists user_profiles_authenticated_read on public.user_profiles;
create policy user_profiles_own_read
on public.user_profiles for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);

drop policy if exists user_roles_read_own on public.user_roles;
drop policy if exists user_roles_own_read on public.user_roles;
create policy user_roles_own_read
on public.user_roles for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);

drop policy if exists attempts_authenticated_read on public.attempts;
drop policy if exists attempts_own_read on public.attempts;
drop policy if exists attempts_authenticated_insert on public.attempts;
drop policy if exists attempts_own_insert on public.attempts;
create policy attempts_own_read
on public.attempts for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);
create policy attempts_own_insert
on public.attempts for insert to authenticated
with check (user_id = public.platform_request_user_id());

drop policy if exists exam_results_authenticated_read on public.exam_results;
drop policy if exists exam_results_own_read on public.exam_results;
drop policy if exists exam_results_authenticated_insert on public.exam_results;
drop policy if exists exam_results_own_insert on public.exam_results;
create policy exam_results_own_read
on public.exam_results for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);
create policy exam_results_own_insert
on public.exam_results for insert to authenticated
with check (user_id = public.platform_request_user_id());

drop policy if exists rules_exam_results_authenticated_read on public.rules_exam_results;
drop policy if exists rules_exam_results_own_read on public.rules_exam_results;
drop policy if exists rules_exam_results_authenticated_insert on public.rules_exam_results;
drop policy if exists rules_exam_results_own_insert on public.rules_exam_results;
create policy rules_exam_results_own_read
on public.rules_exam_results for select to authenticated
using (
  user_id = public.platform_request_user_id()
  or public.platform_is_super_admin()
);
create policy rules_exam_results_own_insert
on public.rules_exam_results for insert to authenticated
with check (user_id = public.platform_request_user_id());

drop policy if exists clips_public_read on public.clips;
drop policy if exists clips_authenticated_read on public.clips;
drop policy if exists clips_super_admin_insert on public.clips;
drop policy if exists clips_super_admin_update on public.clips;
drop policy if exists clips_super_admin_delete on public.clips;
create policy clips_authenticated_read
on public.clips for select to authenticated
using (true);
create policy clips_super_admin_insert
on public.clips for insert to authenticated
with check (public.platform_is_super_admin());
create policy clips_super_admin_update
on public.clips for update to authenticated
using (public.platform_is_super_admin())
with check (public.platform_is_super_admin());
create policy clips_super_admin_delete
on public.clips for delete to authenticated
using (public.platform_is_super_admin());

grant select, insert, update, delete on public.user_profiles to service_role;
grant select, insert, update, delete on public.user_roles to service_role;
grant select, insert, update, delete on public.attempts to service_role;
grant select, insert, update, delete on public.exam_results to service_role;
grant select, insert, update, delete on public.rules_exam_results to service_role;
grant select, insert, update, delete on public.clips to service_role;

comment on function public.institution_is_super_admin() is
  'Compatibility helper backed by canonical user_global_roles, never by email.';

notify pgrst, 'reload schema';

commit;
