begin;
set local statement_timeout = '10s';

insert into public.notification_events (id, user_id)
values ('73000000-0000-4000-8000-000000000001', 'user_synthetic_001');

-- Phase 1 seeds the canonical catalog but deliberately defers module FKs.
-- Existing runtime writes therefore retain their pre-cutover behavior.
insert into public.psychology_checkins (id, module_slug)
values ('74000000-0000-4000-8000-000000000001', 'legacy-unreviewed-module');

do $assertions$
begin
  if not exists (
    select 1 from public.notification_events
    where id = '73000000-0000-4000-8000-000000000001'
      and deduplication_key is null
  ) or not exists (
    select 1 from public.psychology_checkins
    where id = '74000000-0000-4000-8000-000000000001'
      and module_slug = 'legacy-unreviewed-module'
  ) then
    raise exception 'Post-catalog legacy write compatibility failed';
  end if;
end
$assertions$;

select 'PHASE1_POST_CATALOG_WRITE_COMPATIBILITY_PASS';
rollback;
