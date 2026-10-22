-- LOCAL POSTGRESQL ONLY. This transaction must abort deliberately.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

create schema phase0_acl_expected_failure authorization postgres;
create table phase0_acl_expected_failure.identity_links_probe (user_id text not null);
alter table phase0_acl_expected_failure.identity_links_probe enable row level security;
alter table phase0_acl_expected_failure.identity_links_probe force row level security;
grant insert on table phase0_acl_expected_failure.identity_links_probe to authenticated;

do $expected_failure$
begin
  if pg_catalog.has_table_privilege(
    'authenticated',
    'phase0_acl_expected_failure.identity_links_probe',
    'INSERT'
  ) then
    raise exception 'PHASE0_EXPECTED_SECURITY_ABORT';
  end if;
end
$expected_failure$;

rollback;
