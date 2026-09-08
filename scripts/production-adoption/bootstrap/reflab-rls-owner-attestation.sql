begin read only;

set local lock_timeout = '2s';
set local statement_timeout = '15s';

show transaction_read_only;

with target_role as (
  select oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
  from pg_catalog.pg_roles
  where rolname = 'reflab_rls_owner'
), ownership as (
  select
    (select pg_catalog.count(*) from pg_catalog.pg_class object, target_role where object.relowner = target_role.oid)
    + (select pg_catalog.count(*) from pg_catalog.pg_namespace object, target_role where object.nspowner = target_role.oid)
    + (select pg_catalog.count(*) from pg_catalog.pg_proc object, target_role where object.proowner = target_role.oid)
    + (select pg_catalog.count(*) from pg_catalog.pg_database object, target_role where object.datdba = target_role.oid)
    as object_count
), direct_acl as (
  select pg_catalog.count(*) as entry_count
  from (
    select acl.grantee from pg_catalog.pg_class object cross join lateral pg_catalog.aclexplode(object.relacl) acl
    union all
    select acl.grantee from pg_catalog.pg_attribute object cross join lateral pg_catalog.aclexplode(object.attacl) acl
    union all
    select acl.grantee from pg_catalog.pg_namespace object cross join lateral pg_catalog.aclexplode(object.nspacl) acl
    union all
    select acl.grantee from pg_catalog.pg_proc object cross join lateral pg_catalog.aclexplode(object.proacl) acl
    union all
    select acl.grantee from pg_catalog.pg_database object cross join lateral pg_catalog.aclexplode(object.datacl) acl
    union all
    select acl.grantee
    from pg_catalog.pg_default_acl object
    cross join lateral pg_catalog.aclexplode(object.defaclacl) acl
  ) entry, target_role
  where entry.grantee = target_role.oid
), memberships as (
  select
    pg_catalog.count(*) filter (
      where granted_role.rolname = 'reflab_rls_owner'
        and member_role.rolname = 'postgres'
        and grantor_role.rolname = 'supabase_admin'
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
    ) as automatic_count,
    pg_catalog.count(*) filter (
      where granted_role.rolname = 'reflab_rls_owner'
        and member_role.rolname = 'postgres'
        and grantor_role.rolname = 'postgres'
        and not membership.admin_option
        and not membership.inherit_option
        and membership.set_option
    ) as explicit_count,
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
    ) as unexpected_count
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
  join pg_catalog.pg_roles grantor_role on grantor_role.oid = membership.grantor
  where granted_role.rolname = 'reflab_rls_owner'
    or member_role.rolname = 'reflab_rls_owner'
), effective_writes as (
  select
    (select pg_catalog.count(*)
     from pg_catalog.pg_class relation
     join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
     cross join target_role
     where relation.relkind in ('r', 'p')
       and namespace.nspname not in ('pg_catalog', 'information_schema')
       and (
         pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'INSERT')
         or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'UPDATE')
         or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'DELETE')
         or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRUNCATE')
         or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'REFERENCES')
         or pg_catalog.has_table_privilege(target_role.oid, relation.oid, 'TRIGGER')
       )) as table_count,
    (select pg_catalog.count(*)
     from pg_catalog.pg_class sequence
     join pg_catalog.pg_namespace namespace on namespace.oid = sequence.relnamespace
     cross join target_role
     where sequence.relkind = 'S'
       and namespace.nspname not in ('pg_catalog', 'information_schema')
       and (
         pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'USAGE')
         or pg_catalog.has_sequence_privilege(target_role.oid, sequence.oid, 'UPDATE')
       )) as sequence_count,
    (select pg_catalog.count(*)
     from pg_catalog.pg_namespace namespace
     cross join target_role
     where namespace.nspname not like 'pg_%'
       and namespace.nspname <> 'information_schema'
       and pg_catalog.has_schema_privilege(target_role.oid, namespace.oid, 'CREATE')) as schema_create_count
)
select pg_catalog.json_build_object(
  'role_present', (select pg_catalog.count(*) = 1 from target_role),
  'attributes_exact', coalesce((select not rolcanlogin and not rolsuper and not rolcreatedb
    and not rolcreaterole and not rolinherit and not rolbypassrls from target_role), false),
  'automatic_memberships', (select automatic_count from memberships),
  'explicit_memberships', (select explicit_count from memberships),
  'unexpected_memberships', (select unexpected_count from memberships),
  'owned_objects', (select object_count from ownership),
  'direct_acl_entries', (select entry_count from direct_acl),
  'effective_table_writes', (select table_count from effective_writes),
  'effective_sequence_writes', (select sequence_count from effective_writes),
  'effective_schema_create', (select schema_create_count from effective_writes),
  'comment_exact', coalesce((select pg_catalog.shobj_description(oid, 'pg_authid') =
    'NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.' from target_role), false)
)::text;

rollback;
