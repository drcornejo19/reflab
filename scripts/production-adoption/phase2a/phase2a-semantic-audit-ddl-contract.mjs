import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery, hashFunctionSource } from "../../production-preflight/queries.mjs";
import {
  SEMANTIC_AUDIT_CALLER,
  SEMANTIC_AUDIT_FUNCTION,
  SEMANTIC_AUDIT_OWNER,
  SEMANTIC_AUDIT_POLICY,
  SEMANTIC_AUDIT_SCHEMA,
  SEMANTIC_AUDIT_SOURCE_HASH,
  semanticAuditTableColumns,
  semanticAuditTables,
} from "./semantic-audit-contract.mjs";

export const PHASE2A_SEMANTIC_AUDIT_ARTIFACT =
  "supabase/migrations/202608310004_production_adoption_semantic_audit.sql";
export const PHASE2A_SEMANTIC_AUDIT_SHA256 =
  "afed8b78dda7edc86244939a0c8af2e15fb86c17ee4b31a3c65efbcfec67b870";
export const PHASE2A_SEMANTIC_AUDIT_FORMAT =
  "REFLAB_PRODUCTION_PHASE2A_SEMANTIC_AUDIT_V1";
export const PHASE2A_SEMANTIC_AUDIT_OPERATION =
  "--production-phase2a-semantic-audit";
export const PHASE2A_SEMANTIC_AUDIT_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2A_SEMANTIC_AUDIT";
export const PHASE2A_SEMANTIC_AUDIT_PRE_QUERY_ID =
  "phase2a_semantic_audit_pre_attestation";
export const PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID =
  "phase2a_semantic_audit_post_attestation";
export const PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT =
  "scripts/production-adoption/phase2a/semantic-audit-teardown.sql";
export const PHASE2A_SEMANTIC_AUDIT_TEARDOWN_FORMAT =
  "REFLAB_PHASE2A_SEMANTIC_AUDIT_TEARDOWN_V1";

export const PHASE2A_SEMANTIC_AUDIT_MUTATIONS = Object.freeze({
  auditRoleCreates: 1,
  auditSchemaCreates: 1,
  auditFunctionCreates: 1,
  auditPolicies: semanticAuditTables.length,
  auditColumnSelectGrants: Object.values(semanticAuditTableColumns).flat().length,
  historicalProductInserts: 0,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  backfills: 0,
  ledgerWrites: 0,
  schemaStateWrites: 0,
});

const expectedPostChecks = Object.freeze([
  "ownerRoleExact",
  "ownerMembershipsExact",
  "ownerOwnershipExact",
  "auditSchemaExact",
  "auditFunctionExact",
  "functionExecuteAclExact",
  "columnGrantsExact",
  "effectiveSelectColumnsExact",
  "tableGrantsAbsent",
  "auditPoliciesExact",
  "effectiveWritesAbsent",
  "productTablesIndependentlyOwned",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "phase2bAbsent",
  "laterAdoptionAbsent",
  "developmentObjectsAbsent",
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const expectedTableValues = semanticAuditTables.map((table) => `(${sqlLiteral(table)})`).join(",");
const expectedColumnValues = Object.entries(semanticAuditTableColumns)
  .flatMap(([table, columns]) => columns.map((column) => `(${sqlLiteral(table)},${sqlLiteral(column)})`))
  .join(",");

export function assertPhase2aSemanticAuditArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PHASE2A_SEMANTIC_AUDIT_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const policyCount = [...sql.matchAll(/^create policy reflab_preflight_audit_owner_read$/gmi)].length;
  const grantCount = [...sql.matchAll(/^grant select \(/gmi)].length;
  if (digest !== PHASE2A_SEMANTIC_AUDIT_SHA256
      || policyCount !== semanticAuditTables.length
      || grantCount !== semanticAuditTables.length
      || !/^\s*--[\s\S]*?\bbegin\s*;/i.test(sql)
      || !/\bcommit\s*;\s*$/i.test(sql)
      || !/set\s+local\s+lock_timeout\s*=\s*'5s'/i.test(sql)
      || !/set\s+local\s+statement_timeout\s*=\s*'60s'/i.test(sql)
      || !/create\s+role\s+reflab_preflight_audit_owner\s+nologin\s+nosuperuser\s+nocreatedb\s+nocreaterole\s+noinherit\s+nobypassrls/i.test(sql)
      || /\b(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public|auth|storage)\./i.test(sql)
      || /\b(?:insert|update|delete)\b[^;]*reflab_meta\.(?:production_adoption_state|reflab_schema_state)/i.test(sql)) {
    throw new Error("Production 310004 artifact or mutation scope drifted.");
  }
  return { path: PHASE2A_SEMANTIC_AUDIT_ARTIFACT, sha256: digest, sql };
}

export const phase2aSemanticAuditPreQuery = jsonQuery(
  PHASE2A_SEMANTIC_AUDIT_PRE_QUERY_ID,
  `(with expected_tables(table_name) as (values ${expectedTableValues}),
  expected_columns(table_name,column_name) as (values ${expectedColumnValues})
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'default_transaction_read_only', pg_catalog.current_setting('default_transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', pg_catalog.json_build_object(
      'dependenciesExact',
        (select pg_catalog.count(*) = ${semanticAuditTables.length} and pg_catalog.bool_and(
          pg_catalog.to_regclass(table_name) is not null
          and (select relation.relrowsecurity and not relation.relforcerowsecurity
            and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
            from pg_catalog.pg_class relation where relation.oid=pg_catalog.to_regclass(table_name))
        ) from expected_tables)
        and (select pg_catalog.count(*) = ${Object.values(semanticAuditTableColumns).flat().length}
          and pg_catalog.bool_and(exists (
            select 1 from pg_catalog.pg_attribute attribute
            where attribute.attrelid=pg_catalog.to_regclass(expected_columns.table_name)
              and attribute.attname=expected_columns.column_name
              and attribute.attnum>0 and not attribute.attisdropped
          )) from expected_columns),
      'installerOwnsDependencies', (select pg_catalog.bool_and(
        (select pg_catalog.pg_get_userbyid(relation.relowner)='postgres'
          from pg_catalog.pg_class relation where relation.oid=pg_catalog.to_regclass(table_name))
      ) from expected_tables),
      'postgresCanCreatePublic', pg_catalog.has_schema_privilege('postgres','public','CREATE'),
      'sidecarAbsent', pg_catalog.to_regrole('${SEMANTIC_AUDIT_OWNER}') is null
        and pg_catalog.to_regnamespace('${SEMANTIC_AUDIT_SCHEMA}') is null
        and pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}') is null
        and not exists (select 1 from pg_catalog.pg_policy where polname='${SEMANTIC_AUDIT_POLICY}'),
      'phase2bAbsent', pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null
        and not exists (select 1 from reflab_meta.production_adoption_state where phase_order>=4),
      'laterAdoptionAbsent', pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
        and pg_catalog.to_regprocedure('reflab_private.is_super_admin()') is null
        and pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null
        and pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner') is null
        and pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is null,
      'developmentObjectsAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null
        and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null
    ),
    'counts', pg_catalog.json_build_object(
      'dependency_tables', (select pg_catalog.count(*) from expected_tables where pg_catalog.to_regclass(table_name) is not null),
      'dependency_columns', (select pg_catalog.count(*) from expected_columns where exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid=pg_catalog.to_regclass(expected_columns.table_name)
          and attribute.attname=expected_columns.column_name
          and attribute.attnum>0 and not attribute.attisdropped))
    )
  ))`,
);

export const phase2aSemanticAuditPostQuery = jsonQuery(
  PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID,
  `(with expected_tables(table_name) as (values ${expectedTableValues}),
  expected_columns(table_name,column_name) as (values ${expectedColumnValues}),
  owner_role as (select * from pg_catalog.pg_roles where rolname='${SEMANTIC_AUDIT_OWNER}'),
  audit_schema as (select * from pg_catalog.pg_namespace where nspname='${SEMANTIC_AUDIT_SCHEMA}'),
  audit_function as (select routine.*, language.lanname, pg_catalog.pg_get_userbyid(routine.proowner) owner_name
    from pg_catalog.pg_proc routine join pg_catalog.pg_language language on language.oid=routine.prolang
    where routine.oid=pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}')),
  schema_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end grantee,
      case when acl.grantor=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end grantor,
      acl.privilege_type,acl.is_grantable
    from audit_schema cross join lateral pg_catalog.aclexplode(
      coalesce(audit_schema.nspacl,pg_catalog.acldefault('n'::\"char\",audit_schema.nspowner))) acl
  ), function_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end grantee,
      case when acl.grantor=0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantor) end grantor,
      acl.privilege_type,acl.is_grantable
    from audit_function cross join lateral pg_catalog.aclexplode(
      coalesce(audit_function.proacl,pg_catalog.acldefault('f'::\"char\",audit_function.proowner))) acl
  ), direct_column_grants as (
    select namespace.nspname||'.'||relation.relname table_name,attribute.attname column_name,
      pg_catalog.pg_get_userbyid(acl.grantee) grantee,pg_catalog.pg_get_userbyid(acl.grantor) grantor,
      acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    where attribute.attnum>0 and not attribute.attisdropped
      and acl.grantee=(select oid from owner_role)
  ), effective_select_columns as (
    select namespace.nspname||'.'||relation.relname table_name,attribute.attname column_name
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join expected_tables expected on expected.table_name=namespace.nspname||'.'||relation.relname
    where attribute.attnum>0 and not attribute.attisdropped
      and pg_catalog.has_column_privilege((select oid from owner_role),relation.oid,attribute.attnum,'SELECT')
  ), owner_policies as (
    select namespace.nspname||'.'||relation.relname table_name,policy.*
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid=policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where (select oid from owner_role)=any(policy.polroles)
  ), calculated as (
    select pg_catalog.json_build_object(
      'ownerRoleExact', (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        not rolcanlogin and not rolinherit and not rolbypassrls and not rolsuper
        and not rolcreatedb and not rolcreaterole and not rolreplication
      ) from owner_role),
      'ownerMembershipsExact', (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
          granted_role.rolname='${SEMANTIC_AUDIT_OWNER}'
          and member_role.rolname='postgres'
          and grantor_role.rolname='supabase_admin'
          and membership.admin_option
          and not membership.inherit_option
          and not membership.set_option
        )
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles granted_role on granted_role.oid=membership.roleid
        join pg_catalog.pg_roles member_role on member_role.oid=membership.member
        join pg_catalog.pg_roles grantor_role on grantor_role.oid=membership.grantor
        where granted_role.rolname='${SEMANTIC_AUDIT_OWNER}'
           or member_role.rolname='${SEMANTIC_AUDIT_OWNER}'),
      'ownerOwnershipExact',
        (select pg_catalog.count(*)=1 from pg_catalog.pg_proc where proowner=(select oid from owner_role)
          and oid=pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}'))
        and not exists (select 1 from pg_catalog.pg_class where relowner=(select oid from owner_role))
        and not exists (select 1 from pg_catalog.pg_namespace where nspowner=(select oid from owner_role))
        and not exists (select 1 from pg_catalog.pg_type where typowner=(select oid from owner_role))
        and not exists (select 1 from pg_catalog.pg_database where datdba=(select oid from owner_role)),
      'auditSchemaExact', (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        pg_catalog.pg_get_userbyid(nspowner)='postgres') from audit_schema)
        and (select pg_catalog.count(*)=4 and pg_catalog.bool_and(not is_grantable and grantor='postgres')
          and pg_catalog.count(*) filter (where grantee='postgres' and privilege_type='CREATE')=1
          and pg_catalog.count(*) filter (where grantee='postgres' and privilege_type='USAGE')=1
          and pg_catalog.count(*) filter (where grantee='${SEMANTIC_AUDIT_OWNER}' and privilege_type='USAGE')=1
          and pg_catalog.count(*) filter (where grantee='${SEMANTIC_AUDIT_CALLER}' and privilege_type='USAGE')=1
          from schema_acl),
      'auditFunctionExact', (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        pg_catalog.pg_get_function_identity_arguments(oid)='' and pg_catalog.format_type(prorettype,null)='jsonb'
        and lanname='sql' and provolatile='s' and prosecdef and not proleakproof and not proisstrict
        and prokind='f' and owner_name='${SEMANTIC_AUDIT_OWNER}'
        and proconfig=array['search_path=pg_catalog']::text[]
      ) from audit_function),
      'functionExecuteAclExact', (select pg_catalog.count(*)=2
        and pg_catalog.bool_and(privilege_type='EXECUTE' and not is_grantable
          and grantor='${SEMANTIC_AUDIT_OWNER}')
        and pg_catalog.count(*) filter (where grantee='${SEMANTIC_AUDIT_OWNER}')=1
        and pg_catalog.count(*) filter (where grantee='${SEMANTIC_AUDIT_CALLER}')=1
        from function_acl),
      'columnGrantsExact', (select pg_catalog.count(*)=${Object.values(semanticAuditTableColumns).flat().length}
        and pg_catalog.bool_and(grantee='${SEMANTIC_AUDIT_OWNER}' and grantor='postgres'
          and privilege_type='SELECT' and not is_grantable) from direct_column_grants)
        and not exists (select table_name,column_name from expected_columns
          except select table_name,column_name from direct_column_grants)
        and not exists (select table_name,column_name from direct_column_grants
          except select table_name,column_name from expected_columns),
      'effectiveSelectColumnsExact', not exists (select * from expected_columns except select * from effective_select_columns)
        and not exists (select * from effective_select_columns except select * from expected_columns),
      'tableGrantsAbsent', not exists (
        select 1 from pg_catalog.pg_class relation
        cross join lateral pg_catalog.aclexplode(relation.relacl) acl
        where acl.grantee=(select oid from owner_role)),
      'auditPoliciesExact', (select pg_catalog.count(*)=${semanticAuditTables.length} and pg_catalog.bool_and(
        polname='${SEMANTIC_AUDIT_POLICY}' and polcmd='r' and polpermissive
        and polroles=array[(select oid from owner_role)]
        and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid,false),'[()[:space:]]','','g')='true'
        and polwithcheck is null and table_name=any(array(select table_name from expected_tables))
      ) from owner_policies),
      'effectiveWritesAbsent', not exists (select 1 from expected_tables where
        pg_catalog.has_table_privilege((select oid from owner_role),table_name,'INSERT')
        or pg_catalog.has_table_privilege((select oid from owner_role),table_name,'UPDATE')
        or pg_catalog.has_table_privilege((select oid from owner_role),table_name,'DELETE')
        or pg_catalog.has_table_privilege((select oid from owner_role),table_name,'TRUNCATE')
        or pg_catalog.has_table_privilege((select oid from owner_role),table_name,'REFERENCES')
        or pg_catalog.has_table_privilege((select oid from owner_role),table_name,'TRIGGER')),
      'productTablesIndependentlyOwned', (select pg_catalog.bool_and(
        (select pg_catalog.pg_get_userbyid(relowner)='postgres' from pg_catalog.pg_class
          where oid=pg_catalog.to_regclass(table_name))) from expected_tables),
      'ledgerExact', (select pg_catalog.count(*)=3
        and pg_catalog.count(*) filter (where phase_order=1 and phase_key='foundation' and previous_phase_key is null)=1
        and pg_catalog.count(*) filter (where phase_order=2 and phase_key='exam_training_prerequisites' and previous_phase_key='foundation')=1
        and pg_catalog.count(*) filter (where phase_order=3 and phase_key='psychology_notification_prerequisites' and previous_phase_key='exam_training_prerequisites')=1
        from reflab_meta.production_adoption_state),
      'schemaStateEmpty', (select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent', (select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'phase2bAbsent', pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null
        and not exists (select 1 from reflab_meta.production_adoption_state where phase_order>=4),
      'laterAdoptionAbsent', pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
        and pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null
        and pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner') is null,
      'developmentObjectsAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null
        and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null
    ) checks
  ) select pg_catalog.json_build_object(
    'caller',current_user,'session_user',session_user,
    'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
    'server_version_num',pg_catalog.current_setting('server_version_num')::integer,
    'checks',(select checks from calculated),
    'counts',pg_catalog.json_build_object(
      'policies',(select pg_catalog.count(*) from owner_policies),
      'column_grants',(select pg_catalog.count(*) from direct_column_grants),
      'effective_select_columns',(select pg_catalog.count(*) from effective_select_columns),
      'ledger_rows',(select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'schema_state_rows',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state)
    ),
    'function_source_base64',(select pg_catalog.encode(pg_catalog.convert_to(prosrc,'UTF8'),'base64') from audit_function)
  ))`,
);

export function classifyPhase2aSemanticAuditPre(payload) {
  const checks = payload?.checks;
  const fields = ["dependenciesExact", "installerOwnsDependencies", "postgresCanCreatePublic",
    "sidecarAbsent", "phase2bAbsent", "laterAdoptionAbsent", "developmentObjectsAbsent"];
  const complete = checks && fields.every((field) => typeof checks[field] === "boolean")
    && typeof payload.caller === "string" && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && typeof payload.default_transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num) && payload.counts;
  if (!complete) return "UNKNOWN";
  return payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on" && payload.default_transaction_read_only === "off"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && fields.every((field) => checks[field] === true)
    && payload.counts.dependency_tables === semanticAuditTables.length
    && payload.counts.dependency_columns === Object.values(semanticAuditTableColumns).flat().length
    ? "EXACT" : "BLOCKER";
}

export function classifyPhase2aSemanticAuditPost(payload) {
  const complete = payload?.checks && payload?.counts
    && expectedPostChecks.every((field) => typeof payload.checks[field] === "boolean")
    && typeof payload.function_source_base64 === "string"
    && typeof payload.caller === "string" && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string" && Number.isInteger(payload.server_version_num);
  if (!complete) return { classification: "UNKNOWN", postState: "UNKNOWN" };
  let sourceHashExact = false;
  try {
    sourceHashExact = hashFunctionSource(Buffer.from(payload.function_source_base64, "base64").toString("utf8"))
      === SEMANTIC_AUDIT_SOURCE_HASH;
  } catch {}
  const exact = payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && sourceHashExact
    && expectedPostChecks.every((field) => payload.checks[field] === true)
    && payload.counts.policies === semanticAuditTables.length
    && payload.counts.column_grants === Object.values(semanticAuditTableColumns).flat().length
    && payload.counts.effective_select_columns === Object.values(semanticAuditTableColumns).flat().length
    && payload.counts.ledger_rows === 3 && payload.counts.schema_state_rows === 0;
  return { classification: exact ? "EXACT" : "BLOCKER", postState: exact ? "EXACT" : "BLOCKER", sourceHashExact };
}

function teardownArray(values) {
  return `array[${values.map(sqlLiteral).join(",")}]::text[]`;
}

export function generateSemanticAuditTeardown() {
  const tableArray = teardownArray(semanticAuditTables);
  const columnArray = teardownArray(Object.entries(semanticAuditTableColumns)
    .flatMap(([table, columns]) => columns.map((column) => `${table}.${column}`)));
  const policyDrops = semanticAuditTables.map((table) =>
    `drop policy ${SEMANTIC_AUDIT_POLICY} on ${table};`).join("\n");
  const grantRevokes = Object.entries(semanticAuditTableColumns).map(([table, columns]) =>
    `revoke select (${columns.join(", ")}) on table ${table} from ${SEMANTIC_AUDIT_OWNER};`).join("\n");
  const sourceMd5 = createHash("md5").update(semanticAuditFunctionSourceForHash(), "utf8").digest("hex");
  return `-- ${PHASE2A_SEMANTIC_AUDIT_TEARDOWN_FORMAT}
-- Local/review-only teardown for the temporary Phase 2A semantic audit sidecar.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  owner_state record;
begin
  select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole
  into owner_state from pg_catalog.pg_roles where rolname='${SEMANTIC_AUDIT_OWNER}';
  if not found or owner_state.rolcanlogin or owner_state.rolinherit or owner_state.rolbypassrls
     or owner_state.rolsuper or owner_state.rolcreatedb or owner_state.rolcreaterole then
    raise exception 'Phase 2A teardown requires the exact audit owner' using errcode='55000';
  end if;
  if pg_catalog.to_regnamespace('${SEMANTIC_AUDIT_SCHEMA}') is null
     or pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}') is null
     or (select pg_catalog.md5(pg_catalog.btrim(prosrc, E' \\n\\r\\t')) from pg_catalog.pg_proc
         where oid=pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}')) <> '${sourceMd5}' then
    raise exception 'Phase 2A teardown requires the exact audit function' using errcode='55000';
  end if;
  if (select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        granted_role.rolname='${SEMANTIC_AUDIT_OWNER}'
        and member_role.rolname='postgres'
        and grantor_role.rolname='supabase_admin'
        and membership.admin_option
        and not membership.inherit_option
        and not membership.set_option
      )
      from pg_catalog.pg_auth_members membership
      join pg_catalog.pg_roles granted_role on granted_role.oid=membership.roleid
      join pg_catalog.pg_roles member_role on member_role.oid=membership.member
      join pg_catalog.pg_roles grantor_role on grantor_role.oid=membership.grantor
      where granted_role.rolname='${SEMANTIC_AUDIT_OWNER}'
         or member_role.rolname='${SEMANTIC_AUDIT_OWNER}') is not true then
    raise exception 'Phase 2A teardown audit-owner membership contract drifted' using errcode='55000';
  end if;
  if exists (select 1 from pg_catalog.pg_class where relowner='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_namespace where nspowner='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_type where typowner='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole)
     or exists (select 1 from pg_catalog.pg_proc
       where proowner='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole
         and oid<>pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}')) then
    raise exception 'Phase 2A teardown found unexpected audit-owner ownership' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policy policy
      join pg_catalog.pg_class relation on relation.oid=policy.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      where policy.polname='${SEMANTIC_AUDIT_POLICY}'
        and namespace.nspname||'.'||relation.relname=any(${tableArray})
        and policy.polcmd='r' and policy.polpermissive
        and policy.polroles=array[('${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole)::oid]
        and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false),'[()[:space:]]','','g')='true'
        and policy.polwithcheck is null) <> ${semanticAuditTables.length}
     or exists (select 1 from pg_catalog.pg_policy policy
       join pg_catalog.pg_class relation on relation.oid=policy.polrelid
       join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
       where ('${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole)::oid=any(policy.polroles)
         and not (policy.polname='${SEMANTIC_AUDIT_POLICY}'
           and namespace.nspname||'.'||relation.relname=any(${tableArray}))) then
    raise exception 'Phase 2A teardown policy contract drifted' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
      join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
      where acl.grantee='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole
        and namespace.nspname||'.'||relation.relname||'.'||attribute.attname=any(${columnArray})
        and acl.privilege_type='SELECT' and not acl.is_grantable) <> ${Object.values(semanticAuditTableColumns).flat().length}
     or exists (
       select 1 from pg_catalog.pg_attribute attribute
       join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
       join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
       cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
       where acl.grantee='${SEMANTIC_AUDIT_OWNER}'::pg_catalog.regrole
         and not (
           namespace.nspname||'.'||relation.relname||'.'||attribute.attname=any(${columnArray})
           and acl.privilege_type='SELECT' and not acl.is_grantable
         )
     ) then
    raise exception 'Phase 2A teardown column grant contract drifted' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) not in (3,4) then
    raise exception 'Phase state is inconsistent with semantic audit teardown' using errcode='55000';
  end if;
end
$preflight$;

do $membership$
begin
  execute pg_catalog.format('grant ${SEMANTIC_AUDIT_OWNER} to %I',current_user);
end
$membership$;

revoke execute on function ${SEMANTIC_AUDIT_FUNCTION} from ${SEMANTIC_AUDIT_CALLER};
drop function ${SEMANTIC_AUDIT_FUNCTION};
${policyDrops}
${grantRevokes}
revoke usage on schema public from ${SEMANTIC_AUDIT_OWNER};
revoke usage on schema ${SEMANTIC_AUDIT_SCHEMA} from ${SEMANTIC_AUDIT_OWNER},${SEMANTIC_AUDIT_CALLER};
drop schema ${SEMANTIC_AUDIT_SCHEMA};

do $membership_cleanup$
begin
  execute pg_catalog.format('revoke ${SEMANTIC_AUDIT_OWNER} from %I',current_user);
end
$membership_cleanup$;

drop role ${SEMANTIC_AUDIT_OWNER};

do $postcondition$
begin
  if pg_catalog.to_regrole('${SEMANTIC_AUDIT_OWNER}') is not null
     or pg_catalog.to_regnamespace('${SEMANTIC_AUDIT_SCHEMA}') is not null
     or pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}') is not null
     or exists (select 1 from pg_catalog.pg_policy where polname='${SEMANTIC_AUDIT_POLICY}') then
    raise exception 'Phase 2A teardown left residual infrastructure' using errcode='55000';
  end if;
end
$postcondition$;
commit;
`;
}

function semanticAuditFunctionSourceForHash() {
  const migrationSource = readFileSync(resolve(import.meta.dirname, "../../../supabase/migrations/202608310004_production_adoption_semantic_audit.sql"), "utf8");
  const match = migrationSource.match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i);
  if (!match) throw new Error("Unable to extract the Phase 2A function source.");
  return match[1].replace(/\r\n/g, "\n").trim();
}

export function assertSemanticAuditTeardownArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const expected = generateSemanticAuditTeardown();
  if (sql !== expected || /\bcascade\b/i.test(sql)
      || /\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?(?:public|auth|storage)\./i.test(sql)
      || /\b(?:insert|update|delete)\b[^;]*reflab_meta\./i.test(sql)) {
    throw new Error("Phase 2A semantic audit teardown artifact drifted.");
  }
  return { path: PHASE2A_SEMANTIC_AUDIT_TEARDOWN_ARTIFACT, sha256: sha256(sql), sql };
}

export const PHASE2A_SEMANTIC_AUDIT_POST_CHECKS = expectedPostChecks;
export const PHASE2A_SEMANTIC_AUDIT_FIXED_QUERY_COUNT = 7;
