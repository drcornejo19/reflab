begin;

-- Emergency rollback only. It restores the previous broad authenticated reads
-- without granting anon access. Review before executing in production.

drop policy if exists user_profiles_own_read on public.user_profiles;
create policy user_profiles_authenticated_read
on public.user_profiles for select to authenticated
using (true);

drop policy if exists user_roles_own_read on public.user_roles;
create policy user_roles_read_own
on public.user_roles for select to authenticated
using (
  user_id = public.institution_request_user_id()
  or public.institution_is_super_admin()
);

drop policy if exists attempts_own_read on public.attempts;
drop policy if exists attempts_own_insert on public.attempts;
create policy attempts_authenticated_read
on public.attempts for select to authenticated
using (true);
create policy attempts_authenticated_insert
on public.attempts for insert to authenticated
with check (true);

drop policy if exists exam_results_own_read on public.exam_results;
drop policy if exists exam_results_own_insert on public.exam_results;
create policy exam_results_authenticated_read
on public.exam_results for select to authenticated
using (true);
create policy exam_results_authenticated_insert
on public.exam_results for insert to authenticated
with check (true);

drop policy if exists rules_exam_results_own_read on public.rules_exam_results;
drop policy if exists rules_exam_results_own_insert on public.rules_exam_results;
create policy rules_exam_results_authenticated_read
on public.rules_exam_results for select to authenticated
using (true);
create policy rules_exam_results_authenticated_insert
on public.rules_exam_results for insert to authenticated
with check (true);

commit;
