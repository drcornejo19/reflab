import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";

export const CANONICAL_RUNTIME_PREREQUISITES_FORMAT =
  "REFLAB_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES_V1";
export const CANONICAL_RUNTIME_PREREQUISITES_OPERATION =
  "--production-phase2b-canonical-runtime-prerequisites";
export const CANONICAL_RUNTIME_PREREQUISITES_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES";
export const CANONICAL_RUNTIME_PREREQUISITES_ARTIFACT =
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql";
export const CANONICAL_RUNTIME_PREREQUISITES_SHA256 =
  "66ee4c2ce2f849d4d3d1aa20bbf87c90e4ed6c97cd29eb86448be75660a822e9";
export const CANONICAL_JSONB_TEXT_SOURCE_SHA256 =
  "26bb3f3854256988c43bfc898f9f627265b6b3c80898a3caa8dd2e96bc40ae13";
export const CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID =
  "phase2b_canonical_runtime_prerequisites_pre";
export const CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID =
  "phase2b_canonical_runtime_prerequisites_post";

export const CANONICAL_RUNTIME_PREREQUISITES_MUTATIONS = Object.freeze({
  historicalProductInserts: 0,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  ledgerWrites: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
  providerFunctionsCreated: 1,
});

export const CANONICAL_RUNTIME_PREREQUISITES_CHECKS = Object.freeze([
  "sessionExact",
  "historicalFingerprintsExact",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "developmentObjectsAbsent",
  "prerequisiteAbsent",
  "adminProvidersAbsent",
  "trainingProviderAbsent",
  "communicationProviderAbsent",
  "canonicalPayloadHashAbsent",
  "laterAdoptionAbsent",
  "canonicalJsonbTextStateExact",
  "canonicalJsonbTextAclExact",
  "canonicalJsonbTextRelationDependenciesAbsent",
]);

const expectedAcl = Object.freeze([
  Object.freeze({ grantee: "postgres", grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false }),
  Object.freeze({ grantee: "service_role", grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false }),
]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
export function assertCanonicalRuntimePrerequisitesArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, CANONICAL_RUNTIME_PREREQUISITES_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const required = [
    /begin\s*;/i,
    /set\s+local\s+lock_timeout\s*=\s*'5s'/i,
    /set\s+local\s+statement_timeout\s*=\s*'60s'/i,
    /create\s+function\s+reflab_private\.canonical_jsonb_text\(p_value\s+jsonb\)/i,
    /language\s+plpgsql[\s\S]*?immutable[\s\S]*?strict[\s\S]*?security\s+invoker/i,
    /set\s+search_path\s*=\s*pg_catalog/i,
    /grant\s+execute\s+on\s+function\s+reflab_private\.canonical_jsonb_text\(jsonb\)\s+to\s+service_role/i,
    /commit\s*;\s*$/i,
  ];
  if (digest !== CANONICAL_RUNTIME_PREREQUISITES_SHA256
      || required.some((pattern) => !pattern.test(sql))
      || /\b(?:insert|update|delete|truncate)\b[\s\S]*?\b(?:public|reflab_meta)\./i.test(sql)
      || /\b(?:create|alter|drop)\s+(?:table|view|materialized\s+view|trigger|index)\b/i.test(sql)
      || /\bcreate\s+function\b(?![\s\S]*?reflab_private\.canonical_jsonb_text)/i.test(sql)) {
    throw new Error("Production 310005 artifact hash or scope drifted.");
  }
  return { path: CANONICAL_RUNTIME_PREREQUISITES_ARTIFACT, sha256: digest, sql };
}

function stateQuery(id, post) {
  const helperState = post
    ? `(select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        identity_arguments='p_value jsonb' and result_type='text' and language_name='plpgsql'
        and volatility='i' and strict_mode and not security_definer and not leakproof
        and function_kind='f' and owner_name='postgres'
        and configuration=array['search_path=pg_catalog']::text[])
      from helper_state)`
    : `not exists (select 1 from helper_state)`;
  const aclState = post
    ? `(select pg_catalog.count(*)=2
        and pg_catalog.bool_and(privilege_type='EXECUTE' and not is_grantable and grantor='postgres')
        and pg_catalog.count(*) filter(where grantee='postgres')=1
        and pg_catalog.count(*) filter(where grantee='service_role')=1
      from helper_acl)`
    : `not exists (select 1 from helper_acl)`;
  return jsonQuery(id, `(with helper_state as (
    select procedure.oid,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) as result_type,
      language.lanname as language_name, procedure.provolatile as volatility,
      procedure.proisstrict as strict_mode, procedure.prosecdef as security_definer,
      procedure.proleakproof as leakproof, procedure.prokind as function_kind,
      owner_role.rolname as owner_name, procedure.proconfig as configuration,
      pg_catalog.encode(pg_catalog.convert_to(procedure.prosrc,'UTF8'),'base64') as source_base64
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
    where namespace.nspname='reflab_private' and procedure.proname='canonical_jsonb_text'
  ), helper_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee_role.rolname end as grantee,
      grantor_role.rolname as grantor, acl.privilege_type, acl.is_grantable
    from helper_state state
    join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,
      pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee_role on grantee_role.oid=acl.grantee
    left join pg_catalog.pg_roles grantor_role on grantor_role.oid=acl.grantor
  ), helper_relation_dependencies as (
    select dependency.refobjid
    from helper_state state
    join pg_catalog.pg_depend dependency on dependency.classid='pg_catalog.pg_proc'::pg_catalog.regclass
      and dependency.objid=state.oid and dependency.refclassid='pg_catalog.pg_class'::pg_catalog.regclass
  ), column_state as (
    select table_name,column_name,pg_catalog.format_type(attribute.atttypid,attribute.atttypmod) observed_type,
      attribute.attnotnull observed_not_null,
      pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid,false) observed_default
    from (values ('attempts','created_at'),('attempts','score'),('clips','status')) expected(table_name,column_name)
    left join pg_catalog.pg_class relation on relation.oid=pg_catalog.to_regclass('public.'||table_name)
    left join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid
      and attribute.attname=column_name and attribute.attnum>0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid
      and default_record.adnum=attribute.attnum
  ), calculated as (select pg_catalog.json_build_object(
    'sessionExact',current_user='postgres' and session_user='postgres'
      and pg_catalog.current_database()='postgres'
      and pg_catalog.current_setting('transaction_read_only')='on'
      and pg_catalog.current_setting('server_version_num')::integer/10000=17,
    'historicalFingerprintsExact',(select pg_catalog.count(*)=37 from public.attempts)
      and (select pg_catalog.count(*)=6 from public.exam_results)
      and (select pg_catalog.count(*)=60 from public.notification_events),
    'ledgerExact',(select pg_catalog.count(*)=3
      and pg_catalog.count(*) filter(where phase_order=1 and phase_key='foundation')=1
      and pg_catalog.count(*) filter(where phase_order=2 and phase_key='exam_training_prerequisites')=1
      and pg_catalog.count(*) filter(where phase_order=3 and phase_key='psychology_notification_prerequisites')=1
      and pg_catalog.count(*) filter(where phase_order>=4)=0
      from reflab_meta.production_adoption_state),
    'schemaStateEmpty',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
    'canonicalMarkerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
    'developmentObjectsAbsent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null
      and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
      and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
      and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null,
    'prerequisiteAbsent',exists(select 1 from column_state where table_name='attempts' and column_name='created_at'
      and observed_type='timestamp without time zone' and not observed_not_null and observed_default='now()')
      and exists(select 1 from column_state where table_name='attempts' and column_name='score'
        and observed_type='integer' and not observed_not_null and observed_default is null)
      and exists(select 1 from column_state where table_name='clips' and column_name='status' and observed_type is null),
    'adminProvidersAbsent',pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is null
      and pg_catalog.to_regprocedure('public.admin_set_canonical_global_role(text,text,text,text)') is null,
    'trainingProviderAbsent',pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is null,
    'communicationProviderAbsent',pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null,
    'canonicalPayloadHashAbsent',not exists(select 1 from pg_catalog.pg_attribute
      where attrelid=pg_catalog.to_regclass('public.attempts') and attname='canonical_payload_hash'
        and attnum>0 and not attisdropped),
    'laterAdoptionAbsent',pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
      and pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null
      and pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner') is null,
    'canonicalJsonbTextStateExact',${helperState},
    'canonicalJsonbTextAclExact',${aclState},
    'canonicalJsonbTextRelationDependenciesAbsent',not exists(select 1 from helper_relation_dependencies)
  ) checks) select pg_catalog.json_build_object(
    'checks',(select checks from calculated),
    'source_base64',(select source_base64 from helper_state where identity_arguments='p_value jsonb'),
    'acl',coalesce((select pg_catalog.json_agg(helper_acl order by grantee,grantor) from helper_acl),'[]'::json),
    'counts',pg_catalog.json_build_object(
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'ledger',(select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'schema_state',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state)
    )
  ))`);
}

export const canonicalRuntimePrerequisitesPreQuery = stateQuery(
  CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID, false,
);
export const canonicalRuntimePrerequisitesPostQuery = stateQuery(
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID, true,
);

function aclKey(value) {
  return [value?.grantee,value?.grantor,value?.privilege_type,value?.is_grantable].join("\u0000");
}
export function classifyCanonicalRuntimePrerequisitesState(payload, { post = false } = {}) {
  const checks = payload?.checks;
  if (!checks || !CANONICAL_RUNTIME_PREREQUISITES_CHECKS.every((name) => typeof checks[name] === "boolean")
      || !payload?.counts || !Array.isArray(payload?.acl)) return { classification: "UNKNOWN" };
  let sourceHashExact = !post;
  if (post && typeof payload.source_base64 === "string") {
    try {
      sourceHashExact = hashFunctionSource(Buffer.from(payload.source_base64,"base64").toString("utf8"))
        === CANONICAL_JSONB_TEXT_SOURCE_SHA256;
    } catch { sourceHashExact = false; }
  }
  const aclExact = !post || (payload.acl.length === expectedAcl.length
    && new Set(payload.acl.map(aclKey)).size === expectedAcl.length
    && expectedAcl.every((entry) => payload.acl.some((observed) => aclKey(observed) === aclKey(entry))));
  const exact = CANONICAL_RUNTIME_PREREQUISITES_CHECKS.every((name) => checks[name] === true)
    && sourceHashExact && aclExact
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.ledger === 3
    && payload.counts.schema_state === 0;
  return {
    classification: exact ? (post ? "EXACT" : "PASS") : "BLOCKER",
    checks: { ...checks, sourceHashExact, aclExact },
    counts: payload.counts,
  };
}

export const CANONICAL_JSONB_TEXT_ACL = expectedAcl;
