-- LOCAL POSTGRESQL ONLY. Every object is rolled back.

begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

create schema phase0_acl_strategy_a authorization postgres;
revoke all on schema phase0_acl_strategy_a from public, anon, authenticated;

create table phase0_acl_strategy_a.identity_links_probe (
  provider text not null,
  external_subject text not null,
  user_id text not null
);
grant all on table phase0_acl_strategy_a.identity_links_probe to anon, authenticated;
alter table phase0_acl_strategy_a.identity_links_probe enable row level security;
alter table phase0_acl_strategy_a.identity_links_probe force row level security;
revoke all on table phase0_acl_strategy_a.identity_links_probe from public, anon, authenticated;

create function phase0_acl_strategy_a.probe_function()
returns boolean
language sql
security invoker
set search_path = pg_catalog
as 'select true';
grant execute on function phase0_acl_strategy_a.probe_function() to public, anon, authenticated;
revoke all on function phase0_acl_strategy_a.probe_function() from public, anon, authenticated;

do $strategy_a_assertions$
declare
  role_name text;
  privilege_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(role_name, 'phase0_acl_strategy_a.identity_links_probe', privilege_name) then
        raise exception 'strategy A retained browser table privilege';
      end if;
    end loop;
    if pg_catalog.has_function_privilege(role_name, 'phase0_acl_strategy_a.probe_function()', 'EXECUTE') then
      raise exception 'strategy A retained browser function execute';
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(c.relacl) acl
    where n.nspname = 'phase0_acl_strategy_a'
      and c.relname = 'identity_links_probe' and acl.grantee = 0
  ) or exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(p.proacl) acl
    where n.nspname = 'phase0_acl_strategy_a'
      and p.proname = 'probe_function' and acl.grantee = 0
  ) or exists (
    select 1 from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(n.nspacl) acl
    where n.nspname = 'phase0_acl_strategy_a' and acl.grantee = 0
  ) then
    raise exception 'strategy A retained PUBLIC privileges';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'phase0_acl_strategy_a'
      and c.relname = 'identity_links_probe'
      and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'strategy A owner or RLS contract drifted';
  end if;
end
$strategy_a_assertions$;

rollback;

begin;
set local statement_timeout = '15s';
set local lock_timeout = '2s';

create schema phase0_acl_strategy_b authorization reflab_rls_owner;
revoke all on schema phase0_acl_strategy_b from public, anon, authenticated;
set local role reflab_rls_owner;

create table phase0_acl_strategy_b.identity_links_probe (
  provider text not null,
  external_subject text not null,
  user_id text not null
);
alter table phase0_acl_strategy_b.identity_links_probe enable row level security;
alter table phase0_acl_strategy_b.identity_links_probe force row level security;

create function phase0_acl_strategy_b.probe_function()
returns boolean
language sql
security invoker
set search_path = pg_catalog
as 'select true';
reset role;

revoke all on table phase0_acl_strategy_b.identity_links_probe from public, anon, authenticated;
revoke all on function phase0_acl_strategy_b.probe_function() from public, anon, authenticated;

do $strategy_b_assertions$
declare
  role_name text;
  privilege_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if pg_catalog.has_table_privilege(role_name, 'phase0_acl_strategy_b.identity_links_probe', privilege_name) then
        raise exception 'strategy B retained browser table privilege';
      end if;
    end loop;
    if pg_catalog.has_function_privilege(role_name, 'phase0_acl_strategy_b.probe_function()', 'EXECUTE') then
      raise exception 'strategy B retained browser function execute';
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(c.relacl) acl
    where n.nspname = 'phase0_acl_strategy_b'
      and c.relname = 'identity_links_probe' and acl.grantee = 0
  ) or exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(p.proacl) acl
    where n.nspname = 'phase0_acl_strategy_b'
      and p.proname = 'probe_function' and acl.grantee = 0
  ) or exists (
    select 1 from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(n.nspacl) acl
    where n.nspname = 'phase0_acl_strategy_b' and acl.grantee = 0
  ) then
    raise exception 'strategy B retained PUBLIC privileges';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'phase0_acl_strategy_b'
      and c.relname = 'identity_links_probe'
      and pg_catalog.pg_get_userbyid(c.relowner) = 'reflab_rls_owner'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'strategy B owner or RLS contract drifted';
  end if;
end
$strategy_b_assertions$;

rollback;
