import {
  buildSqlBatch,
  jsonQuery,
  queryDependenciesExist,
} from "../../production-preflight/queries.mjs";

const structuralSchemas = "('public', 'reflab_private', 'reflab_meta', 'storage')";

export const fingerprintCatalogQuery = jsonQuery(
  "fingerprint_catalog",
  `pg_catalog.json_build_object(
    'schemas', (select coalesce(pg_catalog.json_agg(n.nspname order by n.nspname), '[]'::json)
      from pg_catalog.pg_namespace n
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'),
    'tables', (select coalesce(pg_catalog.json_agg(x.name order by x.name), '[]'::json) from (
      select n.nspname || '.' || c.relname as name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    ) x),
    'columns', (select coalesce(pg_catalog.json_agg(x.name order by x.name), '[]'::json) from (
      select n.nspname || '.' || c.relname || '.' || a.attname as name
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
        and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    ) x)
  )`
);

export const fingerprintRoleQuery = jsonQuery(
  "fingerprint_role",
  `coalesce((select pg_catalog.row_to_json(x) from (
    select r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
      r.rolbypassrls, r.rolcanlogin
    from pg_catalog.pg_roles r where r.rolname = current_user
  ) x), 'null'::json)`
);

export const fingerprintBaseQueries = [fingerprintCatalogQuery, fingerprintRoleQuery];

export const fingerprintInventoryQueries = [
  jsonQuery("schema_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name) from (
    select n.nspname as schema_name, pg_catalog.pg_get_userbyid(n.nspowner) as owner
    from pg_catalog.pg_namespace n
    where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  ) x), '[]'::json)`),
  jsonQuery("table_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name) from (
    select n.nspname as schema_name, c.relname as table_name,
      case c.relkind when 'p' then 'partitioned_table' else 'table' end as table_kind,
      pg_catalog.pg_get_userbyid(c.relowner) as owner,
      c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  ) x), '[]'::json)`),
  jsonQuery("column_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.ordinal_position) from (
    select n.nspname as schema_name, c.relname as table_name, a.attnum as ordinal_position,
      a.attname as column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
      not a.attnotnull as nullable,
      pg_catalog.pg_get_expr(d.adbin, d.adrelid, false) as default_expression,
      a.attidentity as identity_kind, a.attgenerated as generated_kind
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
      and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  ) x), '[]'::json)`),
  jsonQuery("constraint_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.constraint_name) from (
    select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name,
      case con.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
        when 'u' then 'UNIQUE' when 'c' then 'CHECK' else con.contype::text end as constraint_type,
      con.condeferrable as deferrable, con.condeferred as initially_deferred,
      con.convalidated as validated,
      pg_catalog.pg_get_constraintdef(con.oid, false) as definition
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where con.contype in ('p', 'f', 'u', 'c')
      and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  ) x), '[]'::json)`),
  jsonQuery("index_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.index_name) from (
    select n.nspname as schema_name, table_row.relname as table_name,
      index_row.relname as index_name, state.indisunique as unique,
      state.indisprimary as primary, state.indisvalid as valid,
      exists (select 1 from pg_catalog.pg_constraint con where con.conindid = index_row.oid) as constraint_backed,
      pg_catalog.pg_get_indexdef(index_row.oid) as definition,
      pg_catalog.pg_get_expr(state.indpred, state.indrelid, false) as predicate
    from pg_catalog.pg_index state
    join pg_catalog.pg_class index_row on index_row.oid = state.indexrelid
    join pg_catalog.pg_class table_row on table_row.oid = state.indrelid
    join pg_catalog.pg_namespace n on n.oid = table_row.relnamespace
    where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
  ) x), '[]'::json)`),
  jsonQuery("function_inventory", `coalesce((select pg_catalog.json_agg(x order by x.signature) from (
    select n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature,
      pg_catalog.pg_get_userbyid(p.proowner) as owner,
      case when p.prosecdef then 'DEFINER' else 'INVOKER' end as security,
      l.lanname as language, p.provolatile as volatility, p.proparallel as parallel_mode,
      p.proisstrict as strict,
      coalesce((select setting from pg_catalog.unnest(p.proconfig) setting
        where setting like 'search_path=%' limit 1), '') as search_path,
      p.prosrc as source_definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname in ${structuralSchemas} and p.prokind = 'f'
  ) x), '[]'::json)`),
  jsonQuery("trigger_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.trigger_name) from (
    select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
      t.tgenabled as enabled_state,
      fn_ns.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as function_signature,
      pg_catalog.pg_get_triggerdef(t.oid, false) as definition
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_proc p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace fn_ns on fn_ns.oid = p.pronamespace
    where not t.tgisinternal and n.nspname in ${structuralSchemas}
  ) x), '[]'::json)`),
  jsonQuery("policy_inventory", `coalesce((select pg_catalog.json_agg(x order by x.schema_name, x.table_name, x.policy_name) from (
    select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name,
      case when p.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end as mode,
      (select pg_catalog.array_agg(case when role_oid = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(role_oid) end order by role_oid)
        from pg_catalog.unnest(p.polroles) role_oid) as roles,
      case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as command,
      pg_catalog.pg_get_expr(p.polqual, p.polrelid, false) as using_expression,
      pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false) as with_check_expression
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ${structuralSchemas}
  ) x), '[]'::json)`),
  jsonQuery("explicit_acl_inventory", `coalesce((select pg_catalog.json_agg(x order by x.object_type, x.schema_name, x.object_name, x.grantee, x.privilege_type) from (
    select 'SCHEMA' as object_type, n.nspname as schema_name, n.nspname as object_name,
      pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
      case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
      acl.privilege_type, acl.is_grantable
    from pg_catalog.pg_namespace n cross join lateral pg_catalog.aclexplode(n.nspacl) acl
    where n.nspacl is not null and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    union all
    select case c.relkind when 'S' then 'SEQUENCE' else 'TABLE' end,
      n.nspname, c.relname, pg_catalog.pg_get_userbyid(acl.grantor),
      case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
      acl.privilege_type, acl.is_grantable
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(c.relacl) acl
    where c.relacl is not null and c.relkind in ('r', 'p', 'S') and n.nspname in ${structuralSchemas}
    union all
    select 'FUNCTION', n.nspname,
      p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
      pg_catalog.pg_get_userbyid(acl.grantor),
      case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end,
      acl.privilege_type, acl.is_grantable
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    cross join lateral pg_catalog.aclexplode(p.proacl) acl
    where p.proacl is not null and n.nspname in ${structuralSchemas}
  ) x), '[]'::json)`),
  jsonQuery("default_acl_inventory", `coalesce((select pg_catalog.json_agg(x order by x.owner, x.schema_name, x.object_type, x.grantee, x.privilege_type) from (
    select owner_role.rolname as owner, coalesce(n.nspname, '*') as schema_name,
      case d.defaclobjtype when 'r' then 'TABLE' when 'S' then 'SEQUENCE'
        when 'f' then 'FUNCTION' when 'T' then 'TYPE' when 'n' then 'SCHEMA' else d.defaclobjtype::text end as object_type,
      pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
      case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
      acl.privilege_type, acl.is_grantable
    from pg_catalog.pg_default_acl d
    join pg_catalog.pg_roles owner_role on owner_role.oid = d.defaclrole
    left join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral pg_catalog.aclexplode(d.defaclacl) acl
  ) x), '[]'::json)`),
  jsonQuery("role_membership_inventory", `coalesce((select pg_catalog.json_agg(x order by x.role_name, x.member_name) from (
    select granted.rolname as role_name, member.rolname as member_name, membership.admin_option
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid = membership.roleid
    join pg_catalog.pg_roles member on member.oid = membership.member
    where granted.rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'reflab_rls_owner')
       or member.rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'reflab_rls_owner')
  ) x), '[]'::json)`),
  jsonQuery("migration_history_structure", `pg_catalog.json_build_object(
    'supabase_migrations_schema', pg_catalog.to_regnamespace('supabase_migrations') is not null,
    'supabase_schema_migrations_table', pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null,
    'known_internal_tables', coalesce((select pg_catalog.json_agg(x.table_name order by x.table_name) from (
      select n.nspname || '.' || c.relname as table_name
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and (
        (n.nspname = 'auth' and c.relname = 'schema_migrations')
        or (n.nspname = 'realtime' and c.relname = 'schema_migrations')
        or (n.nspname = 'storage' and c.relname = 'migrations')
      )
    ) x), '[]'::json)
  )`),
  jsonQuery("storage_bucket_inventory", `coalesce((select pg_catalog.json_agg(x order by x.id) from (
    select b.id, b.public, b.file_size_limit, b.allowed_mime_types
    from storage.buckets b
  ) x), '[]'::json)`, { tables: ["storage.buckets"] }),
  jsonQuery("storage_object_aggregate", `coalesce((select pg_catalog.json_agg(x order by x.bucket_id) from (
    select o.bucket_id, pg_catalog.count(*) as object_count,
      coalesce(pg_catalog.sum(case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
        else 0 end), 0) as total_bytes
    from storage.objects o group by o.bucket_id
  ) x), '[]'::json)`, {
    tables: ["storage.objects"], columns: ["storage.objects.bucket_id", "storage.objects.metadata"],
  }),
  jsonQuery("institution_catalog_aggregate", `pg_catalog.json_build_object(
    'permission_count', (select pg_catalog.count(*) from public.institution_permissions),
    'system_role_count', (select pg_catalog.count(*) from public.institution_roles where institution_id is null),
    'system_relation_count', (select pg_catalog.count(*) from public.institution_role_permissions rp
      join public.institution_roles r on r.id = rp.role_id where r.institution_id is null),
    'permission_keys', (select coalesce(pg_catalog.json_agg(permission_key order by permission_key), '[]'::json)
      from public.institution_permissions),
    'system_role_keys', (select coalesce(pg_catalog.json_agg(role_key order by role_key), '[]'::json)
      from public.institution_roles where institution_id is null),
    'relations_by_role', (select coalesce(pg_catalog.json_object_agg(role_key, relation_count order by role_key), '{}'::json) from (
      select r.role_key, pg_catalog.count(*) as relation_count
      from public.institution_roles r
      left join public.institution_role_permissions rp on rp.role_id = r.id
      where r.institution_id is null group by r.role_key
    ) relation_counts)
  )`, {
    tables: ["public.institution_permissions", "public.institution_roles", "public.institution_role_permissions"],
  }),
];

export function buildFingerprintInventory(catalog) {
  const runnable = fingerprintInventoryQueries.filter((query) => queryDependenciesExist(query, catalog));
  const skipped = fingerprintInventoryQueries
    .filter((query) => !queryDependenciesExist(query, catalog))
    .map((query) => ({ query: query.id, status: "UNKNOWN_MISSING_DEPENDENCY", requires: query.requires }));
  return { runnable, skipped };
}

export const buildFingerprintSql = (queries) => buildSqlBatch(queries);
