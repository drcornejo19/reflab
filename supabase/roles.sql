-- RefLab canonical database roles.
-- Applied only to new installations before the canonical baseline.
-- This file does not grant BYPASSRLS and must never contain credentials.

do $roles$
declare
  existing_role record;
begin
  select
    rolcanlogin,
    rolsuper,
    rolcreatedb,
    rolcreaterole,
    rolinherit,
    rolbypassrls
  into existing_role
  from pg_catalog.pg_roles
  where rolname = 'reflab_rls_owner';

  if not found then
    create role reflab_rls_owner
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;
  elsif existing_role.rolcanlogin
     or existing_role.rolsuper
     or existing_role.rolcreatedb
     or existing_role.rolcreaterole
     or existing_role.rolinherit
     or existing_role.rolbypassrls then
    raise exception
      'Existing role reflab_rls_owner has unsafe or incompatible attributes';
  end if;
end
$roles$;

comment on role reflab_rls_owner is
  'NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.';
