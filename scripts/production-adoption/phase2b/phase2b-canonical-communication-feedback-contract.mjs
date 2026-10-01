import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSqlExpression } from "../../production-preflight/canonical-contracts.mjs";
import { hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";
import {
  canonicalTrainingPostQuery,
  classifyCanonicalTrainingPreservation,
} from "./phase2b-canonical-training-attempts-contract.mjs";

export const CANONICAL_COMMUNICATION_FORMAT =
  "REFLAB_PRODUCTION_PHASE2B_CANONICAL_COMMUNICATION_FEEDBACK_V1";
export const CANONICAL_COMMUNICATION_ARTIFACT =
  "supabase/migrations/202608150001_canonical_communication_feedback.sql";
export const CANONICAL_COMMUNICATION_SHA256 =
  "f2ecd8eeb085cecd5c04b55180d20bb8513ecd64fb5ed81734e0970a1ee9dbe9";
export const CANONICAL_COMMUNICATION_SOURCE_SHA256 =
  "1065a615e5b7bbd6f2426d38a835e159c18a4a28becf14d4f33cf43560872609";
export const CANONICAL_COMMUNICATION_PRE_QUERY_ID =
  "phase2b_canonical_communication_feedback_pre";
export const CANONICAL_COMMUNICATION_POST_QUERY_ID =
  "phase2b_canonical_communication_feedback_post";

export const CANONICAL_COMMUNICATION_MUTATIONS = Object.freeze({
  historicalProductInserts: 0,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  historicalCommunicationAttempts: 0,
  ledgerWrites: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
  providerFunctionsCreated: 1,
  constraintsReplaced: 1,
  functionOwnerTransfers: 1,
  postgrestReloadNotifications: 0,
});

export const CANONICAL_COMMUNICATION_FUNCTION = Object.freeze({
  name: "submit_canonical_communication_feedback",
  identity_arguments: "p_user_id text, p_submission_id uuid, p_payload_hash text, p_feedback jsonb",
  result_type: "jsonb",
  language_name: "plpgsql",
  volatility: "v",
  strict_mode: false,
  security_definer: true,
  leakproof: false,
  function_kind: "f",
  owner_name: "reflab_rls_owner",
  configuration: Object.freeze(["search_path=pg_catalog"]),
  source_hash: CANONICAL_COMMUNICATION_SOURCE_SHA256,
});

export const CANONICAL_COMMUNICATION_FUNCTION_ACL = Object.freeze([
  Object.freeze({ grantee: "reflab_rls_owner", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
  Object.freeze({ grantee: "service_role", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
]);

export const CANONICAL_COMMUNICATION_PRE_SOURCE_TYPE_EXPRESSION =
  "((source_item_type is null) or (source_item_type = any (array['global_clip'::text, 'institutional_clip'::text, 'rule_question'::text, 'manual'::text])))";
export const CANONICAL_COMMUNICATION_POST_SOURCE_TYPE_EXPRESSION =
  "((source_item_type is null) or (source_item_type = any (array['global_clip'::text, 'institutional_clip'::text, 'rule_question'::text, 'manual'::text, 'communication_feedback'::text])))";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

export function assertCanonicalCommunicationArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, CANONICAL_COMMUNICATION_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const body = sql.match(/create function public[.]submit_canonical_communication_feedback[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";
  const strippedBody = sql.replace(/as [$]function[$][\s\S]*?[$]function[$];/i,
    "as $function$<reviewed body>$function$;");
  const revokePosition = sql.indexOf("revoke all on function public.submit_canonical_communication_feedback");
  const ownerPosition = sql.indexOf("alter function public.submit_canonical_communication_feedback");
  if (digest !== CANONICAL_COMMUNICATION_SHA256
      || hashFunctionSource(body) !== CANONICAL_COMMUNICATION_SOURCE_SHA256
      || revokePosition < 0 || ownerPosition < 0 || revokePosition > ownerPosition
      || !sql.includes(`= '${CANONICAL_COMMUNICATION_SOURCE_SHA256}'`)
      || !/begin\s*;[\s\S]*set local lock_timeout = '5s';[\s\S]*set local statement_timeout = '60s';/i.test(sql)
      || !/revoke create on schema public from reflab_rls_owner;/i.test(sql)
      || !/Canonical communication RPC ACL is invalid/i.test(sql)
      || /^\s*(?:insert\s+into|update|delete\s+from|truncate)\s+(?:table\s+)?(?:public|reflab_meta)[.]/gmi.test(strippedBody)
      || !/commit\s*;\s*$/i.test(sql)) {
    throw new Error("Production 202608150001 artifact hash, ACL lifecycle, body, or scope drifted.");
  }
  return { path: CANONICAL_COMMUNICATION_ARTIFACT, sha256: digest, sql };
}

function stateQuery(id, post) {
  const functionPredicate = post
    ? "pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is not null"
    : "pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null";
  return jsonQuery(id, `(with function_state as (
    select procedure.oid,procedure.proname name,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) result_type,language.lanname language_name,
      procedure.provolatile volatility,procedure.proisstrict strict_mode,
      procedure.prosecdef security_definer,procedure.proleakproof leakproof,
      procedure.prokind function_kind,owner_role.rolname owner_name,
      procedure.proconfig configuration,
      pg_catalog.encode(pg_catalog.convert_to(procedure.prosrc,'UTF8'),'base64') source_base64
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
    where namespace.nspname='public' and procedure.proname='submit_canonical_communication_feedback'
  ), function_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from function_state state join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), source_constraint as (
    select pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false) expression,
      constraint_row.convalidated validated,constraint_row.connoinherit no_inherit
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid='public.attempts'::pg_catalog.regclass
      and constraint_row.conname='attempts_source_type_check' and constraint_row.contype='c'
  ), training_preservation as (
    select ${canonicalTrainingPostQuery.payloadSql} as payload
  ) select pg_catalog.json_build_object(
    'checks',pg_catalog.json_build_object(
      'sessionExact',current_user='postgres' and session_user='postgres'
        and pg_catalog.current_setting('transaction_read_only')='on'
        and pg_catalog.current_setting('server_version_num')::integer/10000=17,
      'historicalFingerprintsExact',(select pg_catalog.count(*)=37 from public.attempts)
        and (select pg_catalog.count(*)=6 from public.exam_results)
        and (select pg_catalog.count(*)=60 from public.notification_events)
        and (select pg_catalog.count(*)=30 from public.clips),
      'ledgerExact',(select pg_catalog.count(*)=3 and pg_catalog.max(phase_order)=3 from reflab_meta.production_adoption_state),
      'schemaStateEmpty',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'communicationProviderStateExact',${functionPredicate},
      'communicationRowsAbsent',(select pg_catalog.count(*)=0 from public.attempts where source_item_type='communication_feedback'),
      'sourceConstraintPresent',(select pg_catalog.count(*)=1 from source_constraint),
      'laterAdoptionAbsent',not exists(select 1 from reflab_meta.production_adoption_state where phase_order>3),
      'rlsOwnerCreateAbsent',not pg_catalog.has_schema_privilege('reflab_rls_owner','public','CREATE')
    ),
    'counts',pg_catalog.json_build_object(
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'clips',(select pg_catalog.count(*) from public.clips),
      'communication_attempts',(select pg_catalog.count(*) from public.attempts where source_item_type='communication_feedback'),
      'payload_hash_nulls',(select pg_catalog.count(*) from public.attempts where canonical_payload_hash is null)
    ),
    'function',(select pg_catalog.row_to_json(state) from function_state state),
    'function_acl',(select coalesce(pg_catalog.json_agg(acl order by grantee,grantor,privilege_type),'[]'::json) from function_acl acl),
    'source_constraint',(select pg_catalog.row_to_json(state) from source_constraint state),
    'training_preservation',(select payload from training_preservation)
  ))`);
}

export const canonicalCommunicationPreQuery =
  stateQuery(CANONICAL_COMMUNICATION_PRE_QUERY_ID, false);
export const canonicalCommunicationPostQuery =
  stateQuery(CANONICAL_COMMUNICATION_POST_QUERY_ID, true);

const aclKey = (value) => [value?.grantee,value?.grantor,value?.privilege_type,value?.is_grantable].join("\u0000");
function aclExact(observed) {
  return Array.isArray(observed)
    && observed.length === CANONICAL_COMMUNICATION_FUNCTION_ACL.length
    && new Set(observed.map(aclKey)).size === CANONICAL_COMMUNICATION_FUNCTION_ACL.length
    && CANONICAL_COMMUNICATION_FUNCTION_ACL.every((entry) =>
      observed.some((candidate) => aclKey(candidate) === aclKey(entry)));
}
function functionExact(observed) {
  if (!observed || typeof observed.source_base64 !== "string") return false;
  const source = Buffer.from(observed.source_base64, "base64").toString("utf8");
  return ["name", "identity_arguments", "result_type", "language_name", "volatility",
    "strict_mode", "security_definer", "leakproof", "function_kind", "owner_name"].every(
    (field) => observed[field] === CANONICAL_COMMUNICATION_FUNCTION[field],
  ) && JSON.stringify(observed.configuration) === JSON.stringify(CANONICAL_COMMUNICATION_FUNCTION.configuration)
    && hashFunctionSource(source) === CANONICAL_COMMUNICATION_SOURCE_SHA256;
}

const requiredChecks = Object.freeze([
  "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
  "canonicalMarkerAbsent", "communicationProviderStateExact", "communicationRowsAbsent",
  "sourceConstraintPresent", "laterAdoptionAbsent", "rlsOwnerCreateAbsent",
]);

export function classifyCanonicalCommunicationState(payload, { post = false } = {}) {
  if (!payload?.checks || !payload?.counts
      || requiredChecks.some((name) => typeof payload.checks[name] !== "boolean")
      || !Array.isArray(payload.function_acl)) return { classification: "UNKNOWN" };
  const common = requiredChecks.every((name) => payload.checks[name] === true)
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.clips === 30
    && payload.counts.communication_attempts === 0 && payload.counts.payload_hash_nulls === 37
    && classifyCanonicalTrainingPreservation(payload.training_preservation).classification === "EXACT";
  const expectedExpression = post
    ? CANONICAL_COMMUNICATION_POST_SOURCE_TYPE_EXPRESSION
    : CANONICAL_COMMUNICATION_PRE_SOURCE_TYPE_EXPRESSION;
  const constraintExact = payload.source_constraint?.validated === true
    && payload.source_constraint?.no_inherit === false
    && normalizeSqlExpression(payload.source_constraint?.expression)
      === normalizeSqlExpression(expectedExpression);
  if (!post) {
    const exact = common && payload.function === null && payload.function_acl.length === 0
      && constraintExact;
    return { classification: exact ? "PASS" : "BLOCKER",
      checks: { ...payload.checks, trainingPreservationExact: common, sourceConstraintExact: constraintExact } };
  }
  const details = {
    trainingPreservationExact:
      classifyCanonicalTrainingPreservation(payload.training_preservation).classification === "EXACT",
    sourceConstraintExact: constraintExact,
    functionExact: functionExact(payload.function),
    functionAclExact: aclExact(payload.function_acl),
  };
  return { classification: common && Object.values(details).every(Boolean) ? "EXACT" : "BLOCKER",
    checks: { ...payload.checks, ...details } };
}

export function classifyCanonicalCommunicationEntry({ phase2a, helper, admin, communication }) {
  const components = {
    phase2aExact: phase2a?.postState === "EXACT",
    canonicalJsonbTextExact: helper?.classification === "EXACT",
    adminCanonicalAccessExact: admin?.classification === "EXACT",
    canonicalCommunicationPreExact: communication?.classification === "PASS",
  };
  return {
    classification: Object.values(components).every(Boolean) ? "EXACT" : "BLOCKER",
    components,
  };
}

export function classifyCanonicalCommunicationPostComposition({ phase2a, helper, admin, communication }) {
  const components = {
    phase2aPreserved: phase2a?.postState === "EXACT",
    canonicalJsonbTextPreserved: helper?.classification === "EXACT",
    adminCanonicalAccessPreserved: admin?.classification === "EXACT",
    canonicalCommunicationPostExact: communication?.classification === "EXACT",
  };
  return {
    classification: Object.values(components).every(Boolean) ? "EXACT" : "BLOCKER",
    components,
  };
}
