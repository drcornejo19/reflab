-- Disposable PG17 only, applied after the exact 64236 POST fixture.
-- Policies match the reviewed Production inventory; product data stays synthetic.
create or replace function auth.uid() returns uuid language sql stable as $uid$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    auth.jwt()->>'sub'), '')::uuid;
$uid$;

drop policy phase2b_legacy_attempt_insert on public.attempts;
revoke insert on public.attempts from legacy_runtime;
do $historical_slots$
declare
  table_name text;
  suffix text;
begin
  foreach table_name in array array['user_profiles','match_preparations','post_match_reviews',
    'psychology_checkins','psychology_wellbeing_assessments','psychology_exercise_sessions'] loop
    foreach suffix in array array['insert','update'] loop
      execute format('drop policy %I on public.%I', table_name || '_own_' || suffix, table_name);
    end loop;
    if table_name <> 'user_profiles' then
      execute format('drop policy %I on public.%I', table_name || '_own_read', table_name);
    end if;
  end loop;
end
$historical_slots$;
drop policy notification_events_own_read on public.notification_events;

create policy "Users can read own notification events" on public.notification_events
  as permissive for select to authenticated
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text));
create policy match_preparations_authenticated_manage_own on public.match_preparations
  as permissive for all to authenticated
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text))
  with check (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text));
create policy post_match_reviews_authenticated_manage_own on public.post_match_reviews
  as permissive for all to authenticated
  using (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text))
  with check (user_id = coalesce(auth.jwt()->>'sub', auth.uid()::text));
create policy "Service role manages notification events" on public.notification_events
  for all to service_role using (true) with check (true);
create policy match_preparations_service_role_all on public.match_preparations
  for all to service_role using (true) with check (true);
create policy post_match_reviews_service_role_all on public.post_match_reviews
  for all to service_role using (true) with check (true);

-- Preserve the broad observed ACLs as evidence, never as a recommendation.
grant select, insert, update, delete, truncate, references, trigger, maintain on table
  public.user_profiles, public.match_preparations, public.post_match_reviews,
  public.psychology_checkins, public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions, public.attempts, public.exam_results,
  public.rules_exam_results, public.notification_events to authenticated, service_role;
revoke all on public.user_profiles, public.attempts, public.exam_results, public.rules_exam_results from anon;
grant select, insert, update, delete, truncate, references, trigger, maintain on table
  public.match_preparations, public.post_match_reviews, public.psychology_checkins,
  public.psychology_wellbeing_assessments, public.psychology_exercise_sessions,
  public.notification_events to anon;
grant select on table public.user_profiles, public.match_preparations, public.post_match_reviews,
  public.psychology_checkins, public.psychology_wellbeing_assessments,
  public.psychology_exercise_sessions, public.attempts, public.exam_results,
  public.rules_exam_results, public.notification_events to reflab_prod_preflight_ro;
