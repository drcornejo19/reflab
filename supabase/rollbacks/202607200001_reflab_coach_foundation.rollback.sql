begin;

drop function if exists public.consume_coach_rate_limit(
  text,
  text,
  integer,
  integer
);

drop table if exists public.ai_usage_ledger;
drop table if exists public.coach_evidence;
drop table if exists public.coach_runs;
drop table if exists public.coach_data_consents;
drop table if exists public.coach_rate_limit_buckets;

drop function if exists public.set_coach_updated_at();

notify pgrst, 'reload schema';

commit;
