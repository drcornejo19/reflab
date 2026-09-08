-- Production adoption cluster-role bootstrap. This is not a schema migration.
-- It may only run through the separately reviewed role-bootstrap runner.

begin;

set local lock_timeout = '2s';
set local statement_timeout = '15s';
set local createrole_self_grant = '';

do $preflight$
declare
  installer record;
  target record;
  target_exists boolean := false;
  ownership_count bigint;
  direct_acl_count bigint;
  unsafe_membership_count bigint;
  automatic_membership_count bigint;
  explicit_membership_count bigint;
begin
  if current_user <> 'postgres' or session_user <> 'postgres' then
    raise exception 'Production role bootstrap installer identity is not approved'
      using errcode = '42501';
  end if;

  select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit,
    rolreplication, rolbypassrls
  into installer
  from pg_catalog.pg_roles
  where rolname = current_user;

  if not found
     or not installer.rolcanlogin
     or installer.rolsuper
     or installer.rolcreatedb
     or not installer.rolcreaterole
     or not installer.rolinherit
     or installer.rolreplication
     or installer.rolbypassrls
     or not pg_catalog.has_database_privilege(current_user, pg_catalog.current_database(), 'CREATE') then
    raise exception 'Production role bootstrap installer privilege contract is not approved'
      using errcode = '42501';
  end if;

  select role.rolcanlogin, role.rolsuper, role.rolcreatedb,
    role.rolcreaterole, role.rolinherit, role.rolbypassrls
  into target
  from pg_catalog.pg_roles role
  where role.rolname = 'reflab_rls_owner';

  target_exists := found;

  if target_exists then
    if target.rolcanlogin
       or target.rolsuper
       or target.rolcreatedb
       or target.rolcreaterole
       or target.rolinherit
       or target.rolbypassrls then
      raise exception 'Existing reflab_rls_owner role contract is incompatible'
        using errcode = '55000';
    end if;

    if pg_catalog.shobj_description(
      (select oid from pg_catalog.pg_roles where rolname = 'reflab_rls_owner'),
      'pg_authid'
    ) is distinct from 'NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.' then
      raise exception 'Existing reflab_rls_owner comment contract is incompatible'
        using errcode = '55000';
    end if;
  else
    create role reflab_rls_owner
      nologin
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls;

    grant reflab_rls_owner to postgres
      with admin false, inherit false, set true
      granted by postgres;

    comment on role reflab_rls_owner is
      'NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.';
  end if;

  select
    pg_catalog.count(*) filter (
      where granted_role.rolname = 'reflab_rls_owner'
        and member_role.rolname = 'postgres'
        and grantor_role.rolname = 'supabase_admin'
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    ),
    pg_catalog.count(*) filter (
      where granted_role.rolname = 'reflab_rls_owner'
        and member_role.rolname = 'postgres'
        and grantor_role.rolname = 'postgres'
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ),
    pg_catalog.count(*) filter (
      where not (
        granted_role.rolname = 'reflab_rls_owner'
        and member_role.rolname = 'postgres'
        and (
          (grantor_role.rolname = 'supabase_admin'
            and membership.admin_option
            and not membership.inherit_option
            and not membership.set_option)
          or
          (grantor_role.rolname = 'postgres'
            and not membership.admin_option
            and not membership.inherit_option
            and membership.set_option)
        )
      )
    )
  into automatic_membership_count, explicit_membership_count, unsafe_membership_count
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
  join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
  where granted_role.rolname = 'reflab_rls_owner'
    or member_role.rolname = 'reflab_rls_owner';

  if automatic_membership_count <> 1
     or explicit_membership_count <> 1
     or unsafe_membership_count <> 0 then
    raise exception 'reflab_rls_owner membership options or grantor contract is incompatible'
      using errcode = '55000';
  end if;

  select
    (select pg_catalog.count(*)
       from pg_catalog.pg_class object
       where object.relowner = target_role.oid)
    + (select pg_catalog.count(*)
       from pg_catalog.pg_namespace object
       where object.nspowner = target_role.oid)
    + (select pg_catalog.count(*)
       from pg_catalog.pg_proc object
       where object.proowner = target_role.oid)
    + (select pg_catalog.count(*)
       from pg_catalog.pg_database object
       where object.datdba = target_role.oid)
  into ownership_count
  from pg_catalog.pg_roles target_role
  where target_role.rolname = 'reflab_rls_owner';

  select pg_catalog.count(*)
  into direct_acl_count
  from (
    select acl.grantee
    from pg_catalog.pg_class object
    cross join lateral pg_catalog.aclexplode(object.relacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_attribute attribute
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_namespace object
    cross join lateral pg_catalog.aclexplode(object.nspacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_proc object
    cross join lateral pg_catalog.aclexplode(object.proacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_database object
    cross join lateral pg_catalog.aclexplode(object.datacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_default_acl object
    cross join lateral pg_catalog.aclexplode(object.defaclacl) acl
  ) acl_entry
  where acl_entry.grantee = (
    select oid from pg_catalog.pg_roles where rolname = 'reflab_rls_owner'
  );

  if ownership_count <> 0 or direct_acl_count <> 0 then
    raise exception 'reflab_rls_owner has unexpected ownership or direct privileges'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where relation.relkind in ('r', 'p')
      and namespace.nspname not in ('pg_catalog', 'information_schema')
      and (
        pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'INSERT')
        or pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'UPDATE')
        or pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'DELETE')
        or pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'TRUNCATE')
        or pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'REFERENCES')
        or pg_catalog.has_table_privilege('reflab_rls_owner', relation.oid, 'TRIGGER')
      )
  ) or exists (
    select 1
    from pg_catalog.pg_class sequence
    join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
    where sequence.relkind = 'S'
      and namespace.nspname not in ('pg_catalog', 'information_schema')
      and (
        pg_catalog.has_sequence_privilege('reflab_rls_owner', sequence.oid, 'USAGE')
        or pg_catalog.has_sequence_privilege('reflab_rls_owner', sequence.oid, 'UPDATE')
      )
  ) or exists (
    select 1
    from pg_catalog.pg_namespace namespace
    where namespace.nspname not like 'pg_%'
      and namespace.nspname <> 'information_schema'
      and pg_catalog.has_schema_privilege('reflab_rls_owner', namespace.oid, 'CREATE')
  ) then
    raise exception 'reflab_rls_owner has unexpected effective write privileges'
      using errcode = '55000';
  end if;
end
$preflight$;

commit;
