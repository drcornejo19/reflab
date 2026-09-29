import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";
import {
  CANONICAL_JSONB_TEXT_ACL,
  CANONICAL_JSONB_TEXT_SOURCE_SHA256,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";

export const ADMIN_CANONICAL_ACCESS_FORMAT =
  "REFLAB_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS_V1";
export const ADMIN_CANONICAL_ACCESS_OPERATION =
  "--production-phase2b-admin-canonical-access";
export const ADMIN_CANONICAL_ACCESS_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS";
export const ADMIN_CANONICAL_ACCESS_ARTIFACT =
  "supabase/migrations/202608110001_canonical_admin_user_access.sql";
export const ADMIN_CANONICAL_ACCESS_SHA256 =
  "0c8ea0383eb16bcef78b2252bd66682f9fbfa4b5dcea93d03807a1b91e6f8051";
export const ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID =
  "phase2b_admin_canonical_access_pre";
export const ADMIN_CANONICAL_ACCESS_POST_QUERY_ID =
  "phase2b_admin_canonical_access_post";

export const ADMIN_CANONICAL_ACCESS_FUNCTIONS = Object.freeze([
  Object.freeze({
    name: "admin_set_canonical_global_role",
    identity_arguments: "p_actor_user_id text, p_target_user_id text, p_role_key text, p_reason text",
    source_hash: "77090eddc4f7f1df9da11f062e2a628f19d7b10993f8f514525056bfdbb316dc",
  }),
  Object.freeze({
    name: "admin_set_canonical_user_plan",
    identity_arguments: "p_actor_user_id text, p_target_user_id text, p_plan_key text, p_reason text",
    source_hash: "89e6f9db0c0fad3f2b0b54e332882d4e820dcfd7f3f0ce1dedece3805af44bba",
  }),
]);

export const ADMIN_CANONICAL_ACCESS_MUTATIONS = Object.freeze({
  historicalProductInserts: 0,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  ledgerWrites: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
  providerFunctionsCreated: 2,
  policiesCreated: 7,
  columnPrivilegeEntriesCreated: 31,
  schemaUsageEntriesCreated: 2,
  functionOwnerTransfers: 2,
  schemaReloadNotifications: 1,
});

export const ADMIN_CANONICAL_ACCESS_CHECKS = Object.freeze([
  "sessionExact",
  "installerCanGrantPublicExact",
  "rlsOwnerExact",
  "dependenciesExact",
  "historicalFingerprintsExact",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "developmentObjectsAbsent",
  "canonicalJsonbTextCatalogExact",
  "prerequisiteAbsent",
  "trainingProviderAbsent",
  "communicationProviderAbsent",
  "canonicalPayloadHashAbsent",
  "laterAdoptionAbsent",
  "adminFunctionsStateExact",
  "adminPoliciesStateExact",
  "adminSchemaPrivilegesStateExact",
  "adminTablePrivilegesAbsent",
  "adminColumnPrivilegesStateExact",
  "rlsOwnerCreateAbsent",
]);

export const ADMIN_CANONICAL_ACCESS_FUNCTION_ACL = Object.freeze(
  ADMIN_CANONICAL_ACCESS_FUNCTIONS.flatMap(({ name }) => [
    Object.freeze({ routine: name, grantee: "reflab_rls_owner", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
    Object.freeze({ routine: name, grantee: "service_role", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
  ]),
);

export const ADMIN_CANONICAL_ACCESS_SCHEMA_ACL = Object.freeze([
  Object.freeze({ schema_name: "public", grantee: "reflab_rls_owner", grantor: "postgres", privilege_type: "USAGE", is_grantable: false }),
  Object.freeze({ schema_name: "reflab_meta", grantee: "reflab_rls_owner", grantor: "postgres", privilege_type: "USAGE", is_grantable: false }),
]);

const columnPrivileges = Object.freeze({
  "reflab_meta.reflab_schema_state": Object.freeze({
    SELECT: Object.freeze(["installation_status", "environment"]),
  }),
  "public.user_profiles": Object.freeze({ SELECT: Object.freeze(["user_id"]) }),
  "public.user_global_roles": Object.freeze({
    SELECT: Object.freeze(["user_id", "role_key"]),
    UPDATE: Object.freeze(["role_key", "source", "assigned_by_user_id", "updated_at"]),
  }),
  "public.user_subscriptions": Object.freeze({
    SELECT: Object.freeze(["user_id", "plan_key", "status", "starts_at", "ends_at", "source", "assigned_by_user_id"]),
    UPDATE: Object.freeze(["plan_key", "status", "starts_at", "ends_at", "source", "assigned_by_user_id", "updated_at"]),
  }),
  "public.access_change_audit": Object.freeze({
    INSERT: Object.freeze(["actor_user_id", "target_user_id", "action", "entity_type", "entity_id", "old_data", "new_data", "reason"]),
  }),
});

export const ADMIN_CANONICAL_ACCESS_COLUMN_ACL = Object.freeze(
  Object.entries(columnPrivileges).flatMap(([relation, privileges]) => {
    const [schema_name, table_name] = relation.split(".");
    return Object.entries(privileges).flatMap(([privilege_type, columns]) =>
      columns.map((column_name) => Object.freeze({
        schema_name,
        table_name,
        column_name,
        grantee: "reflab_rls_owner",
        grantor: "postgres",
        privilege_type,
        is_grantable: false,
      })));
  }),
);

export const ADMIN_CANONICAL_ACCESS_POLICIES = Object.freeze([
  Object.freeze({
    schema_name: "public", table_name: "access_change_audit",
    policy_name: "access_change_audit_admin_mutation_insert", permissive: true,
    command: "INSERT", roles: Object.freeze(["reflab_rls_owner"]), using_expression: null,
    check_expression: "((actor_user_id = current_setting('reflab.admin_actor_user_id'::text, true)) AND (target_user_id = current_setting('reflab.admin_target_user_id'::text, true)) AND (entity_id = target_user_id) AND (((action = 'access.plan.changed'::text) AND (entity_type = 'user_subscription'::text)) OR ((action = 'access.global_role.changed'::text) AND (entity_type = 'user_global_role'::text))))",
  }),
  Object.freeze({
    schema_name: "public", table_name: "user_global_roles",
    policy_name: "user_global_roles_admin_actor_lock", permissive: true,
    command: "UPDATE", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "(user_id = current_setting('reflab.admin_actor_user_id'::text, true))",
    check_expression: "false",
  }),
  Object.freeze({
    schema_name: "public", table_name: "user_global_roles",
    policy_name: "user_global_roles_admin_mutation_target_update", permissive: true,
    command: "UPDATE", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
    check_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
  }),
  Object.freeze({
    schema_name: "public", table_name: "user_profiles",
    policy_name: "user_profiles_admin_mutation_target_read", permissive: true,
    command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
    check_expression: null,
  }),
  Object.freeze({
    schema_name: "public", table_name: "user_subscriptions",
    policy_name: "user_subscriptions_admin_mutation_target_read", permissive: true,
    command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
    check_expression: null,
  }),
  Object.freeze({
    schema_name: "public", table_name: "user_subscriptions",
    policy_name: "user_subscriptions_admin_mutation_target_update", permissive: true,
    command: "UPDATE", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
    check_expression: "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
  }),
  Object.freeze({
    schema_name: "reflab_meta", table_name: "reflab_schema_state",
    policy_name: "reflab_schema_state_admin_mutation_read", permissive: true,
    command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "((installation_status = 'installed'::text) AND (environment = ANY (ARRAY['development'::text, 'production'::text])))",
    check_expression: null,
  }),
]);

const dependencyColumns = Object.freeze([
  ["reflab_meta", "reflab_schema_state", "installation_status", "text"],
  ["reflab_meta", "reflab_schema_state", "environment", "text"],
  ["public", "user_profiles", "user_id", "text"],
  ["public", "user_global_roles", "user_id", "text"],
  ["public", "user_global_roles", "role_key", "text"],
  ["public", "user_global_roles", "source", "text"],
  ["public", "user_global_roles", "assigned_by_user_id", "text"],
  ["public", "user_global_roles", "updated_at", "timestamp with time zone"],
  ["public", "user_subscriptions", "user_id", "text"],
  ["public", "user_subscriptions", "plan_key", "text"],
  ["public", "user_subscriptions", "status", "text"],
  ["public", "user_subscriptions", "starts_at", "timestamp with time zone"],
  ["public", "user_subscriptions", "ends_at", "timestamp with time zone"],
  ["public", "user_subscriptions", "source", "text"],
  ["public", "user_subscriptions", "assigned_by_user_id", "text"],
  ["public", "user_subscriptions", "updated_at", "timestamp with time zone"],
  ["public", "access_change_audit", "actor_user_id", "text"],
  ["public", "access_change_audit", "target_user_id", "text"],
  ["public", "access_change_audit", "action", "text"],
  ["public", "access_change_audit", "entity_type", "text"],
  ["public", "access_change_audit", "entity_id", "text"],
  ["public", "access_change_audit", "old_data", "jsonb"],
  ["public", "access_change_audit", "new_data", "jsonb"],
  ["public", "access_change_audit", "reason", "text"],
]);

const policyNames = ADMIN_CANONICAL_ACCESS_POLICIES.map(({ policy_name }) => policy_name);
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const policyNameSql = policyNames.map(sqlLiteral).join(",");
const dependencySql = dependencyColumns
  .map((row) => `(${row.map(sqlLiteral).join(",")})`).join(",");

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertAdminCanonicalAccessArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, ADMIN_CANONICAL_ACCESS_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const strippedBodies = sql.replace(/as\s+\$function\$[\s\S]*?\$function\$;/gi, "as $function$<reviewed body>$function$;");
  const revokePosition = sql.indexOf("revoke all on function");
  const ownerPosition = sql.indexOf("alter function public.admin_set_canonical_user_plan");
  const sourceHashes = ADMIN_CANONICAL_ACCESS_FUNCTIONS.map(({ name }) => {
    const pattern = new RegExp(`create function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, "i");
    return hashFunctionSource(sql.match(pattern)?.[1] ?? "");
  });
  if (digest !== ADMIN_CANONICAL_ACCESS_SHA256
      || (sql.match(/^create policy /gmi) ?? []).length !== 7
      || (sql.match(/^create function public\.admin_set_canonical_/gmi) ?? []).length !== 2
      || (sql.match(/^alter function public\.admin_set_canonical_/gmi) ?? []).length !== 2
      || sourceHashes.some((hash, index) => hash !== ADMIN_CANONICAL_ACCESS_FUNCTIONS[index].source_hash)
      || revokePosition < 0 || ownerPosition < 0 || revokePosition > ownerPosition
      || !/begin\s*;[\s\S]*set local lock_timeout = '5s';[\s\S]*set local statement_timeout = '30s';/i.test(sql)
      || !/revoke create on schema public from reflab_rls_owner;/i.test(sql)
      || !/notify pgrst, 'reload schema';[\s\S]*commit\s*;\s*$/i.test(sql)
      || /^\s*(?:insert\s+into|update|delete\s+from|truncate)\s+(?:table\s+)?(?:public|reflab_meta)\./gmi.test(strippedBodies)
      || /^\s*(?:insert\s+into|update|delete\s+from)\s+reflab_meta\.(?:production_adoption_state|reflab_schema_state)/gmi.test(strippedBodies)) {
    throw new Error("Production 202608110001 artifact hash, ordering, body, or scope drifted.");
  }
  return { path: ADMIN_CANONICAL_ACCESS_ARTIFACT, sha256: digest, sql };
}

function stateQuery(id, post) {
  const adminFunctions = post
    ? `(select pg_catalog.count(*)=2 and pg_catalog.bool_and(
        result_type='jsonb' and language_name='plpgsql' and volatility='v'
        and not strict_mode and security_definer and not leakproof and function_kind='f'
        and owner_name='reflab_rls_owner' and configuration=array['search_path=pg_catalog']::text[])
      from admin_function_state)`
    : `not exists(select 1 from admin_function_state)`;
  const expectedCount = (post, count) => post ? `= ${count}` : `= 0`;
  return jsonQuery(id, `(with expected_columns(schema_name,table_name,column_name,expected_type) as (values ${dependencySql}),
  helper_state as (
    select procedure.oid,pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) result_type,language.lanname language_name,
      procedure.provolatile volatility,procedure.proisstrict strict_mode,procedure.prosecdef security_definer,
      procedure.proleakproof leakproof,procedure.prokind function_kind,owner_role.rolname owner_name,
      procedure.proconfig configuration,pg_catalog.encode(pg_catalog.convert_to(procedure.prosrc,'UTF8'),'base64') source_base64
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
    where namespace.nspname='reflab_private' and procedure.proname='canonical_jsonb_text'
  ), helper_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from helper_state state join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), admin_function_state as (
    select procedure.oid,procedure.proname name,pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) result_type,language.lanname language_name,
      procedure.provolatile volatility,procedure.proisstrict strict_mode,procedure.prosecdef security_definer,
      procedure.proleakproof leakproof,procedure.prokind function_kind,owner_role.rolname owner_name,
      procedure.proconfig configuration,pg_catalog.encode(pg_catalog.convert_to(procedure.prosrc,'UTF8'),'base64') source_base64
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
    where namespace.nspname='public' and procedure.proname in ('admin_set_canonical_user_plan','admin_set_canonical_global_role')
  ), admin_function_acl as (
    select state.name routine,case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from admin_function_state state join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), admin_policies as (
    select namespace.nspname schema_name,relation.relname table_name,policy.polname policy_name,
      policy.polpermissive permissive,case policy.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end command,
      (select pg_catalog.array_agg(role.rolname order by role.rolname)
       from pg_catalog.unnest(policy.polroles) role_oid(oid)
       join pg_catalog.pg_roles role on role.oid=role_oid.oid) roles,
      pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false) using_expression,
      pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false) check_expression
    from pg_catalog.pg_policy policy join pg_catalog.pg_class relation on relation.oid=policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where policy.polname in (${policyNameSql})
  ), role_schema_acl as (
    select namespace.nspname schema_name,grantee.rolname grantee,grantor.rolname grantor,
      acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_namespace namespace cross join lateral pg_catalog.aclexplode(namespace.nspacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where namespace.nspname in ('public','reflab_meta') and grantee.rolname='reflab_rls_owner'
  ), role_table_acl as (
    select namespace.nspname schema_name,relation.relname table_name,grantee.rolname grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(relation.relacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (namespace.nspname,relation.relname) in (('reflab_meta','reflab_schema_state'),
      ('public','user_profiles'),('public','user_global_roles'),('public','user_subscriptions'),
      ('public','access_change_audit')) and grantee.rolname='reflab_rls_owner'
  ), role_column_acl as (
    select namespace.nspname schema_name,relation.relname table_name,attribute.attname column_name,
      grantee.rolname grantee,grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_attribute attribute join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (namespace.nspname,relation.relname) in (('reflab_meta','reflab_schema_state'),
      ('public','user_profiles'),('public','user_global_roles'),('public','user_subscriptions'),
      ('public','access_change_audit')) and grantee.rolname='reflab_rls_owner'
  ), column_state as (
    select table_name,column_name,pg_catalog.format_type(attribute.atttypid,attribute.atttypmod) observed_type,
      attribute.attnotnull observed_not_null,pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid,false) observed_default
    from (values ('attempts','created_at'),('attempts','score'),('clips','status')) expected(table_name,column_name)
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.'||table_name)
    left join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid and attribute.attname=column_name
      and attribute.attnum>0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid and default_record.adnum=attribute.attnum
  ), calculated as (select pg_catalog.json_build_object(
    'sessionExact',current_user='postgres' and session_user='postgres' and pg_catalog.current_database()='postgres'
      and pg_catalog.current_setting('transaction_read_only')='on'
      and pg_catalog.current_setting('server_version_num')::integer/10000=17,
    'installerCanGrantPublicExact',exists(select 1 from pg_catalog.pg_namespace namespace
      where namespace.nspname='public' and (namespace.nspowner=(select oid from pg_catalog.pg_roles where rolname=current_user)
        or exists(select 1 from pg_catalog.aclexplode(namespace.nspacl) acl
          where acl.grantee=(select oid from pg_catalog.pg_roles where rolname=current_user)
            and acl.privilege_type='CREATE' and acl.is_grantable))),
    'rlsOwnerExact',exists(select 1 from pg_catalog.pg_roles where rolname='reflab_rls_owner'
      and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls)
      and coalesce(pg_catalog.pg_has_role(
        (select oid from pg_catalog.pg_roles where rolname='postgres'),
        (select oid from pg_catalog.pg_roles where rolname='reflab_rls_owner'),'MEMBER'),false)
      and coalesce(pg_catalog.pg_has_role(
        (select oid from pg_catalog.pg_roles where rolname='postgres'),
        (select oid from pg_catalog.pg_roles where rolname='reflab_rls_owner'),'SET'),false)
      and not coalesce(pg_catalog.pg_has_role(
        (select oid from pg_catalog.pg_roles where rolname='postgres'),
        (select oid from pg_catalog.pg_roles where rolname='reflab_rls_owner'),'USAGE'),true),
    'dependenciesExact',(select pg_catalog.count(*)=5 and pg_catalog.bool_and(relation.relrowsecurity
        and not relation.relforcerowsecurity and pg_catalog.pg_get_userbyid(relation.relowner)='postgres')
      from (select distinct schema_name,table_name from expected_columns) expected
      join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass(expected.schema_name||'.'||expected.table_name))
      and (select pg_catalog.count(*)=${dependencyColumns.length} and pg_catalog.bool_and(exists(select 1
        from pg_catalog.pg_attribute attribute where attribute.attrelid=pg_catalog.to_regclass(expected.schema_name||'.'||expected.table_name)
          and attribute.attname=expected.column_name and pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)=expected.expected_type
          and attribute.attnum>0 and not attribute.attisdropped)) from expected_columns expected),
    'historicalFingerprintsExact',(select pg_catalog.count(*)=37 from public.attempts)
      and (select pg_catalog.count(*)=6 from public.exam_results)
      and (select pg_catalog.count(*)=60 from public.notification_events),
    'ledgerExact',(select pg_catalog.count(*)=3
      and pg_catalog.count(*) filter(where phase_order=1 and phase_key='foundation')=1
      and pg_catalog.count(*) filter(where phase_order=2 and phase_key='exam_training_prerequisites')=1
      and pg_catalog.count(*) filter(where phase_order=3 and phase_key='psychology_notification_prerequisites')=1
      and pg_catalog.count(*) filter(where phase_order>=4)=0 from reflab_meta.production_adoption_state),
    'schemaStateEmpty',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
    'canonicalMarkerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
    'developmentObjectsAbsent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null
      and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
      and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
      and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null,
    'canonicalJsonbTextCatalogExact',(select pg_catalog.count(*)=1 and pg_catalog.bool_and(
      identity_arguments='p_value jsonb' and result_type='text' and language_name='plpgsql'
      and volatility='i' and strict_mode and not security_definer and not leakproof and function_kind='f'
      and owner_name='postgres' and configuration=array['search_path=pg_catalog']::text[]) from helper_state),
    'prerequisiteAbsent',exists(select 1 from column_state where table_name='attempts' and column_name='created_at'
      and observed_type='timestamp without time zone' and not observed_not_null and observed_default='now()')
      and exists(select 1 from column_state where table_name='attempts' and column_name='score'
        and observed_type='integer' and not observed_not_null and observed_default is null)
      and exists(select 1 from column_state where table_name='clips' and column_name='status' and observed_type is null),
    'trainingProviderAbsent',pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is null,
    'communicationProviderAbsent',pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null,
    'canonicalPayloadHashAbsent',not exists(select 1 from pg_catalog.pg_attribute
      where attrelid=pg_catalog.to_regclass('public.attempts') and attname='canonical_payload_hash' and attnum>0 and not attisdropped),
    'laterAdoptionAbsent',pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
      and pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null
      and pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner') is null,
    'adminFunctionsStateExact',${adminFunctions},
    'adminPoliciesStateExact',(select pg_catalog.count(*) from admin_policies) ${expectedCount(post, 7)},
    'adminSchemaPrivilegesStateExact',(select pg_catalog.count(*) from role_schema_acl) ${expectedCount(post, 2)},
    'adminTablePrivilegesAbsent',not exists(select 1 from role_table_acl),
    'adminColumnPrivilegesStateExact',(select pg_catalog.count(*) from role_column_acl) ${expectedCount(post, 31)},
    'rlsOwnerCreateAbsent',not coalesce(pg_catalog.has_schema_privilege(
      (select oid from pg_catalog.pg_roles where rolname='reflab_rls_owner'),
      (select oid from pg_catalog.pg_namespace where nspname='public'),'CREATE'),false)
  ) checks) select pg_catalog.json_build_object(
    'checks',(select checks from calculated),
    'helper_source_base64',(select source_base64 from helper_state where identity_arguments='p_value jsonb'),
    'helper_acl',coalesce((select pg_catalog.json_agg(helper_acl order by grantee,grantor) from helper_acl),'[]'::json),
    'functions',coalesce((select pg_catalog.json_agg(admin_function_state order by name) from admin_function_state),'[]'::json),
    'function_acl',coalesce((select pg_catalog.json_agg(admin_function_acl order by routine,grantee,grantor) from admin_function_acl),'[]'::json),
    'policies',coalesce((select pg_catalog.json_agg(admin_policies order by schema_name,table_name,policy_name) from admin_policies),'[]'::json),
    'schema_acl',coalesce((select pg_catalog.json_agg(role_schema_acl order by schema_name,privilege_type) from role_schema_acl),'[]'::json),
    'table_acl',coalesce((select pg_catalog.json_agg(role_table_acl order by schema_name,table_name,privilege_type) from role_table_acl),'[]'::json),
    'column_acl',coalesce((select pg_catalog.json_agg(role_column_acl order by schema_name,table_name,column_name,privilege_type) from role_column_acl),'[]'::json),
    'counts',pg_catalog.json_build_object('attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'ledger',(select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'schema_state',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state))
  ))`);
}

export const adminCanonicalAccessPreQuery = stateQuery(ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID, false);
export const adminCanonicalAccessPostQuery = stateQuery(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, true);

function key(value, fields) {
  return fields.map((field) => Array.isArray(value?.[field]) ? JSON.stringify(value[field]) : value?.[field]).join("\u0000");
}
function exactSet(observed, expected, fields) {
  if (!Array.isArray(observed) || observed.length !== expected.length) return false;
  const values = new Set(observed.map((entry) => key(entry, fields)));
  return values.size === expected.length && expected.every((entry) => values.has(key(entry, fields)));
}
function sourceHash(value) {
  try { return hashFunctionSource(Buffer.from(value, "base64").toString("utf8")); }
  catch { return null; }
}

export function classifyAdminCanonicalAccessState(payload, { post = false } = {}) {
  const checks = payload?.checks;
  const arrays = ["helper_acl", "functions", "function_acl", "policies", "schema_acl", "table_acl", "column_acl"];
  if (!checks || !ADMIN_CANONICAL_ACCESS_CHECKS.every((name) => typeof checks[name] === "boolean")
      || !payload?.counts || arrays.some((name) => !Array.isArray(payload?.[name]))) {
    return { classification: "UNKNOWN" };
  }
  const helperSourceExact = sourceHash(payload.helper_source_base64) === CANONICAL_JSONB_TEXT_SOURCE_SHA256;
  const helperAclExact = exactSet(payload.helper_acl, CANONICAL_JSONB_TEXT_ACL,
    ["grantee", "grantor", "privilege_type", "is_grantable"]);
  const expectedFunctions = post ? ADMIN_CANONICAL_ACCESS_FUNCTIONS : [];
  const functionsExact = payload.functions.length === expectedFunctions.length
    && expectedFunctions.every((expected) => payload.functions.some((observed) =>
      observed.name === expected.name
      && observed.identity_arguments === expected.identity_arguments
      && observed.result_type === "jsonb" && observed.language_name === "plpgsql"
      && observed.volatility === "v" && observed.strict_mode === false
      && observed.security_definer === true && observed.leakproof === false
      && observed.function_kind === "f" && observed.owner_name === "reflab_rls_owner"
      && JSON.stringify(observed.configuration) === JSON.stringify(["search_path=pg_catalog"])
      && sourceHash(observed.source_base64) === expected.source_hash));
  const functionAclExact = exactSet(payload.function_acl,
    post ? ADMIN_CANONICAL_ACCESS_FUNCTION_ACL : [],
    ["routine", "grantee", "grantor", "privilege_type", "is_grantable"]);
  const policiesExact = exactSet(payload.policies,
    post ? ADMIN_CANONICAL_ACCESS_POLICIES : [],
    ["schema_name", "table_name", "policy_name", "permissive", "command", "roles", "using_expression", "check_expression"]);
  const schemaAclExact = exactSet(payload.schema_acl,
    post ? ADMIN_CANONICAL_ACCESS_SCHEMA_ACL : [],
    ["schema_name", "grantee", "grantor", "privilege_type", "is_grantable"]);
  const tableAclExact = payload.table_acl.length === 0;
  const columnAclExact = exactSet(payload.column_acl,
    post ? ADMIN_CANONICAL_ACCESS_COLUMN_ACL : [],
    ["schema_name", "table_name", "column_name", "grantee", "grantor", "privilege_type", "is_grantable"]);
  const countsExact = payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.ledger === 3
    && payload.counts.schema_state === 0;
  const exact = ADMIN_CANONICAL_ACCESS_CHECKS.every((name) => checks[name] === true)
    && helperSourceExact && helperAclExact && functionsExact && functionAclExact
    && policiesExact && schemaAclExact && tableAclExact && columnAclExact && countsExact;
  return {
    classification: exact ? (post ? "EXACT" : "PASS") : "BLOCKER",
    checks: { ...checks, helperSourceExact, helperAclExact, functionsExact,
      functionAclExact, policiesExact, schemaAclExact, tableAclExact, columnAclExact },
    counts: payload.counts,
  };
}
