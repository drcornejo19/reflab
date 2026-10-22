import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSqlExpression } from "../../production-preflight/canonical-contracts.mjs";
import { hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";
import {
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  TRAINING_STAGE_SCHEMA_ACL_EXTENSIONS,
  TRAINING_STAGE_TABLE_ACL,
} from "./phase2b-training-stage-preservation-contract.mjs";
import {
  classifyPrePhase2bPreservation,
  prePhase2bPostQuery,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";

export const CANONICAL_TRAINING_FORMAT = "REFLAB_PRODUCTION_PHASE2B_CANONICAL_TRAINING_ATTEMPTS_V1";
export const CANONICAL_TRAINING_OPERATION = "--production-phase2b-canonical-training-attempts";
export const CANONICAL_TRAINING_OPT_IN = "ALLOW_PRODUCTION_PHASE2B_CANONICAL_TRAINING_ATTEMPTS";
export const CANONICAL_TRAINING_ARTIFACT =
  "supabase/migrations/202608130001_canonical_training_attempts.sql";
export const CANONICAL_TRAINING_SHA256 = "c2239f6ae55e220579c4cc3489c9fbe2f2b63114b63f6980cfd001feab30fc59";
export const CANONICAL_TRAINING_SOURCE_SHA256 =
  "66a5f8793ba0222e0a62a58162d92d49101598bca971e71c9baeffeee1106f34";
export const CANONICAL_TRAINING_PRE_QUERY_ID = "phase2b_canonical_training_attempts_pre";
export const CANONICAL_TRAINING_POST_QUERY_ID = "phase2b_canonical_training_attempts_post";

export const CANONICAL_TRAINING_MUTATIONS = Object.freeze({
  historicalProductInserts: 0,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  attemptsRowsReceivingNullPayloadHash: 37,
  ledgerWrites: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
  providerFunctionsCreated: 1,
  policiesCreated: 15,
  indexesCreated: 1,
  checksCreated: 1,
  functionOwnerTransfers: 1,
  postgrestReloadNotifications: 0,
});

export const CANONICAL_TRAINING_FUNCTION = Object.freeze({
  name: "submit_canonical_training_attempt",
  identity_arguments: "p_user_id text, p_submission_id uuid, p_attempt jsonb, p_weekly_limit integer",
  result_type: "jsonb",
  language_name: "plpgsql",
  volatility: "v",
  strict_mode: false,
  security_definer: true,
  leakproof: false,
  function_kind: "f",
  owner_name: "reflab_rls_owner",
  configuration: Object.freeze(["search_path=pg_catalog"]),
  source_hash: CANONICAL_TRAINING_SOURCE_SHA256,
});

export const CANONICAL_TRAINING_FUNCTION_ACL = Object.freeze([
  Object.freeze({ grantee: "reflab_rls_owner", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
  Object.freeze({ grantee: "service_role", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }),
]);

const userRead = (table_name, policy_name) => Object.freeze({
  schema_name: "public", table_name, policy_name, permissive: true,
  command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
  using_expression: "user_id = current_setting('reflab.training_user_id', true)",
  check_expression: null,
});
const userLock = (table_name, policy_name) => Object.freeze({
  schema_name: "public", table_name, policy_name, permissive: true,
  command: "UPDATE", roles: Object.freeze(["reflab_rls_owner"]),
  using_expression: "user_id = current_setting('reflab.training_user_id', true)",
  check_expression: "false",
});
const institutionRead = (table_name, column_name, policy_name) => Object.freeze({
  schema_name: "public", table_name, policy_name, permissive: true,
  command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
  using_expression: `((${column_name})::text = current_setting('reflab.training_institution_id'::text, true))`,
  check_expression: null,
});
const institutionLock = (table_name, column_name, policy_name) => Object.freeze({
  schema_name: "public", table_name, policy_name, permissive: true,
  command: "UPDATE", roles: Object.freeze(["reflab_rls_owner"]),
  using_expression: `((${column_name})::text = current_setting('reflab.training_institution_id'::text, true))`,
  check_expression: "false",
});

export const CANONICAL_TRAINING_POLICIES = Object.freeze([
  Object.freeze({
    schema_name: "reflab_meta", table_name: "reflab_schema_state",
    policy_name: "training_attempt_marker_read", permissive: true,
    command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "current_setting('reflab.training_user_id', true) <> ''",
    check_expression: null,
  }),
  userRead("user_profiles", "training_attempt_profile_read"),
  userRead("user_global_roles", "training_attempt_global_role_read"),
  userLock("user_global_roles", "training_attempt_global_role_lock"),
  userRead("user_subscriptions", "training_attempt_subscription_read"),
  userLock("user_subscriptions", "training_attempt_subscription_lock"),
  userRead("institution_memberships", "training_attempt_membership_read"),
  userLock("institution_memberships", "training_attempt_membership_lock"),
  institutionRead("institutions", "id", "training_attempt_institution_read"),
  institutionLock("institutions", "id", "training_attempt_institution_lock"),
  institutionRead("institution_subscriptions", "institution_id", "training_attempt_institution_subscription_read"),
  institutionLock("institution_subscriptions", "institution_id", "training_attempt_institution_subscription_lock"),
  Object.freeze({
    schema_name: "public", table_name: "clips", policy_name: "training_attempt_clip_read",
    permissive: true, command: "SELECT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: "((id)::text = current_setting('reflab.training_clip_id'::text, true))",
    check_expression: null,
  }),
  userRead("attempts", "training_attempt_existing_read"),
  Object.freeze({
    schema_name: "public", table_name: "attempts", policy_name: "training_attempt_insert",
    permissive: true, command: "INSERT", roles: Object.freeze(["reflab_rls_owner"]),
    using_expression: null,
    check_expression: `((user_id = current_setting('reflab.training_user_id'::text, true))
      and ((submission_id)::text = current_setting('reflab.training_submission_id'::text, true))
      and (canonical_payload_hash = current_setting('reflab.training_payload_hash'::text, true))
      and (exam_result_id is null) and (institution_id is null)
      and (institution_group_id is null) and (institution_assessment_session_id is null))`,
  }),
]);

export const CANONICAL_TRAINING_SCHEMA_ACL = Object.freeze([
  ...ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
  ...TRAINING_STAGE_SCHEMA_ACL_EXTENSIONS,
]);

export const CANONICAL_TRAINING_TABLE_ACL = TRAINING_STAGE_TABLE_ACL;

export const CANONICAL_TRAINING_COLUMN_ACL = ADMIN_CANONICAL_ACCESS_COLUMN_ACL;

export const CANONICAL_TRAINING_RLS = Object.freeze([
  ["reflab_meta", "reflab_schema_state", true],
  ["public", "attempts", true],
  ["public", "clips", true],
  ["public", "institution_memberships", true],
  ["public", "institution_subscriptions", true],
  ["public", "institutions", true],
  ["public", "user_global_roles", true],
  ["public", "user_profiles", true],
  ["public", "user_subscriptions", true],
].map(([schema_name, table_name, enabled]) => Object.freeze({
  schema_name, table_name, enabled, forced: false,
})),
);

export const CANONICAL_TRAINING_CHECK_EXPRESSION =
  "((canonical_payload_hash is null) or (canonical_payload_hash ~ '^[0-9a-f]{64}$'::text))";
export const CANONICAL_TRAINING_INDEX_DEFINITION =
  "CREATE UNIQUE INDEX attempts_canonical_training_submission_unique ON public.attempts USING btree (user_id, submission_id) WHERE ((exam_result_id IS NULL) AND (submission_id IS NOT NULL))";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function assertCanonicalTrainingArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, CANONICAL_TRAINING_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const body = sql.match(/create function public[.]submit_canonical_training_attempt[(][\s\S]*?as [$]function[$]([\s\S]*?)[$]function[$];/i)?.[1] ?? "";
  const strippedBody = sql.replace(/as [$]function[$][\s\S]*?[$]function[$];/i, "as $function$<reviewed body>$function$;");
  const revokePosition = sql.indexOf("revoke all on function public.submit_canonical_training_attempt");
  const ownerPosition = sql.indexOf("alter function public.submit_canonical_training_attempt");
  if (digest !== CANONICAL_TRAINING_SHA256
      || hashFunctionSource(body) !== CANONICAL_TRAINING_SOURCE_SHA256
      || (sql.match(/^create policy training_attempt_/gmi) ?? []).length !== 15
      || revokePosition < 0 || ownerPosition < 0 || revokePosition > ownerPosition
      || !sql.includes(`= '${CANONICAL_TRAINING_SOURCE_SHA256}'`)
      || !/begin\s*;[\s\S]*set local lock_timeout = '5s';[\s\S]*set local statement_timeout = '60s';/i.test(sql)
      || !/revoke create on schema public from reflab_rls_owner;/i.test(sql)
      || !/Canonical training RPC ACL is invalid/i.test(sql)
      || /^\s*(?:insert\s+into|update|delete\s+from|truncate)\s+(?:table\s+)?(?:public|reflab_meta)[.]/gmi.test(strippedBody)
      || !/commit\s*;\s*$/i.test(sql)) {
    throw new Error("Production 202608130001 artifact hash, ACL lifecycle, body, or scope drifted.");
  }
  return { path: CANONICAL_TRAINING_ARTIFACT, sha256: digest, sql };
}

const trainingPolicyNames = CANONICAL_TRAINING_POLICIES.map(({ policy_name }) =>
  `'${policy_name.replaceAll("'", "''")}'`).join(",");
const touchedRelations = CANONICAL_TRAINING_RLS.map(({ schema_name, table_name }) =>
  `('${schema_name}','${table_name}')`).join(",");

function stateQuery(id, post) {
  const functionPredicate = post
    ? "pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null"
    : "pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is null";
  const columnPredicate = post
    ? `exists(select 1 from column_state where observed_type='text' and not observed_not_null and observed_default is null)`
    : "not exists(select 1 from column_state where observed_type is not null)";
  const providerObjectsPredicate = post
    ? `(${functionPredicate}) and pg_catalog.to_regclass('public.attempts_canonical_training_submission_unique') is not null
       and exists(select 1 from pg_catalog.pg_constraint where conrelid='public.attempts'::pg_catalog.regclass and conname='attempts_canonical_payload_hash_check')`
    : `(${functionPredicate}) and pg_catalog.to_regclass('public.attempts_canonical_training_submission_unique') is null
       and not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.attempts'::pg_catalog.regclass and conname='attempts_canonical_payload_hash_check')`;
  return jsonQuery(id, `(with function_state as (
    select procedure.oid,procedure.proname name,pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
      pg_catalog.pg_get_function_result(procedure.oid) result_type,language.lanname language_name,
      procedure.provolatile volatility,procedure.proisstrict strict_mode,procedure.prosecdef security_definer,
      procedure.proleakproof leakproof,procedure.prokind function_kind,owner_role.rolname owner_name,
      procedure.proconfig configuration,pg_catalog.encode(pg_catalog.convert_to(procedure.prosrc,'UTF8'),'base64') source_base64
    from pg_catalog.pg_proc procedure join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    join pg_catalog.pg_language language on language.oid=procedure.prolang
    join pg_catalog.pg_roles owner_role on owner_role.oid=procedure.proowner
    where namespace.nspname='public' and procedure.proname='submit_canonical_training_attempt'
  ), function_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from function_state state join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), training_policies as (
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
    where policy.polname in (${trainingPolicyNames})
  ), schema_acl as (
    select namespace.nspname schema_name,grantee.rolname grantee,grantor.rolname grantor,
      acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_namespace namespace cross join lateral pg_catalog.aclexplode(namespace.nspacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where namespace.nspname in ('public','reflab_private','reflab_meta','extensions')
      and grantee.rolname='reflab_rls_owner'
  ), table_acl as (
    select namespace.nspname schema_name,relation.relname table_name,grantee.rolname grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(relation.relacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (namespace.nspname,relation.relname) in (${touchedRelations}) and grantee.rolname='reflab_rls_owner'
  ), column_acl as (
    select namespace.nspname schema_name,relation.relname table_name,attribute.attname column_name,
      grantee.rolname grantee,grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_attribute attribute join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where grantee.rolname='reflab_rls_owner'
  ), rls_state as (
    select namespace.nspname schema_name,relation.relname table_name,
      relation.relrowsecurity enabled,relation.relforcerowsecurity forced
    from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where (namespace.nspname,relation.relname) in (${touchedRelations})
  ), column_state as (
    select pg_catalog.format_type(attribute.atttypid,attribute.atttypmod) observed_type,
      attribute.attnotnull observed_not_null,
      pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid,false) observed_default
    from pg_catalog.pg_attribute attribute
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid
      and default_record.adnum=attribute.attnum
    where attribute.attrelid='public.attempts'::pg_catalog.regclass
      and attribute.attname='canonical_payload_hash' and attribute.attnum>0 and not attribute.attisdropped
  ), training_duplicates as (
    select user_id,submission_id from public.attempts
    where exam_result_id is null and submission_id is not null
    group by user_id,submission_id having pg_catalog.count(*)>1
  )${post ? `, prerequisite_preservation as (
    select ${prePhase2bPostQuery.payloadSql} as payload
  )` : ""} select pg_catalog.json_build_object(
    'caller',current_user,'session_user',session_user,
    'transaction_read_only',pg_catalog.current_setting('transaction_read_only'),
    'server_version_num',pg_catalog.current_setting('server_version_num')::integer,
    'checks',pg_catalog.json_build_object(
      'sessionExact',current_user='postgres' and session_user='postgres'
        and pg_catalog.current_setting('transaction_read_only')='on'
        and pg_catalog.current_setting('server_version_num')::integer/10000=17,
      'historicalFingerprintsExact',(select pg_catalog.count(*)=37 from public.attempts)
        and (select pg_catalog.count(*)=6 from public.exam_results)
        and (select pg_catalog.count(*)=60 from public.notification_events),
      'ledgerExact',(select pg_catalog.count(*)=3 and pg_catalog.max(phase_order)=3 from reflab_meta.production_adoption_state),
      'schemaStateEmpty',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'providerObjectsExact',${providerObjectsPredicate},
      'columnStateExact',${columnPredicate},
      'historicalPayloadHashNullsExact',${post ? "(select pg_catalog.count(*)=37 from public.attempts where canonical_payload_hash is null)" : "true"},
      'trainingDuplicatesAbsent',(select pg_catalog.count(*)=0 from training_duplicates),
      'laterProvidersAbsent',pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is null
        and not exists(select 1 from reflab_meta.production_adoption_state where phase_order>3),
      'rlsOwnerCreateAbsent',not pg_catalog.has_schema_privilege('reflab_rls_owner','public','CREATE')
    ),
    'counts',pg_catalog.json_build_object(
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'clips',(select pg_catalog.count(*) from public.clips),
      'payload_hash_nulls',${post ? "(select pg_catalog.count(*) from public.attempts where canonical_payload_hash is null)" : "null"},
      'training_duplicate_groups',(select pg_catalog.count(*) from training_duplicates)
    ),
    'function',(select pg_catalog.row_to_json(state) from function_state state),
    'function_acl',(select coalesce(pg_catalog.json_agg(acl order by grantee,grantor,privilege_type),'[]'::json) from function_acl acl),
    'policies',(select coalesce(pg_catalog.json_agg(policy order by schema_name,table_name,policy_name),'[]'::json) from training_policies policy),
    'schema_acl',(select coalesce(pg_catalog.json_agg(entry order by schema_name,grantee,grantor,privilege_type),'[]'::json) from schema_acl entry),
    'table_acl',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name,privilege_type),'[]'::json) from table_acl entry),
    'column_acl',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name,column_name,privilege_type),'[]'::json) from column_acl entry),
    'rls',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name),'[]'::json) from rls_state entry),
    'check_expression',(select pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false)
      from pg_catalog.pg_constraint constraint_row where constraint_row.conrelid='public.attempts'::pg_catalog.regclass
        and constraint_row.conname='attempts_canonical_payload_hash_check'),
    'index_definition',case when pg_catalog.to_regclass('public.attempts_canonical_training_submission_unique') is null
      then null else pg_catalog.pg_get_indexdef(pg_catalog.to_regclass('public.attempts_canonical_training_submission_unique')) end,
    'prerequisite_preservation',${post ? "(select payload from prerequisite_preservation)" : "null"}
  ))`);
}

export const canonicalTrainingPreQuery = stateQuery(CANONICAL_TRAINING_PRE_QUERY_ID, false);
export const canonicalTrainingPostQuery = stateQuery(CANONICAL_TRAINING_POST_QUERY_ID, true);

const key = (value, fields) => fields.map((field) => JSON.stringify(value?.[field] ?? null)).join("|");
function exactSet(observed, expected, fields) {
  if (!Array.isArray(observed) || observed.length !== expected.length) return false;
  const actualKeys = observed.map((entry) => key(entry, fields)).sort();
  const expectedKeys = expected.map((entry) => key(entry, fields)).sort();
  return actualKeys.every((entry, index) => entry === expectedKeys[index]);
}
function policyExact(observed) {
  if (!Array.isArray(observed) || observed.length !== CANONICAL_TRAINING_POLICIES.length) return false;
  const normalized = (entry) => ({ ...entry,
    using_expression: normalizeSqlExpression(entry.using_expression),
    check_expression: normalizeSqlExpression(entry.check_expression),
  });
  return exactSet(observed.map(normalized), CANONICAL_TRAINING_POLICIES.map(normalized), [
    "schema_name", "table_name", "policy_name", "permissive", "command", "roles",
    "using_expression", "check_expression",
  ]);
}
function functionExact(observed) {
  if (!observed || typeof observed.source_base64 !== "string") return false;
  const source = Buffer.from(observed.source_base64, "base64").toString("utf8");
  return ["name", "identity_arguments", "result_type", "language_name", "volatility",
    "strict_mode", "security_definer", "leakproof", "function_kind", "owner_name"].every(
    (field) => observed[field] === CANONICAL_TRAINING_FUNCTION[field],
  ) && JSON.stringify(observed.configuration) === JSON.stringify(CANONICAL_TRAINING_FUNCTION.configuration)
    && hashFunctionSource(source) === CANONICAL_TRAINING_FUNCTION.source_hash;
}

const requiredChecks = Object.freeze([
  "sessionExact", "historicalFingerprintsExact", "ledgerExact", "schemaStateEmpty",
  "canonicalMarkerAbsent", "providerObjectsExact", "columnStateExact",
  "historicalPayloadHashNullsExact", "trainingDuplicatesAbsent", "laterProvidersAbsent",
  "rlsOwnerCreateAbsent",
]);

function classifyCanonicalTrainingPostPayload(payload, { requireLaterProvidersAbsent, transactionReadOnly = "on" }) {
  const requiredPostChecks = requireLaterProvidersAbsent
    ? requiredChecks
    : requiredChecks.filter((name) => name !== "laterProvidersAbsent");
  if (!payload || !payload.checks || !payload.counts
      || requiredChecks.some((name) => typeof payload.checks[name] !== "boolean")) {
    return { classification: "UNKNOWN" };
  }
  const common = requiredPostChecks.every((name) => payload.checks[name] === true)
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.clips === 30
    && payload.counts.training_duplicate_groups === 0;
  const details = {
    functionExact: functionExact(payload.function),
    functionAclExact: exactSet(payload.function_acl, CANONICAL_TRAINING_FUNCTION_ACL,
      ["grantee", "grantor", "privilege_type", "is_grantable"]),
    policiesExact: policyExact(payload.policies),
    schemaAclExact: exactSet(payload.schema_acl, CANONICAL_TRAINING_SCHEMA_ACL,
      ["schema_name", "grantee", "grantor", "privilege_type", "is_grantable"]),
    tableAclExact: exactSet(payload.table_acl, CANONICAL_TRAINING_TABLE_ACL,
      ["schema_name", "table_name", "grantee", "grantor", "privilege_type", "is_grantable"]),
    columnAclExact: exactSet(payload.column_acl, CANONICAL_TRAINING_COLUMN_ACL,
      ["schema_name", "table_name", "column_name", "grantee", "grantor", "privilege_type", "is_grantable"]),
    rlsExact: exactSet(payload.rls, CANONICAL_TRAINING_RLS,
      ["schema_name", "table_name", "enabled", "forced"]),
    checkExact: normalizeSqlExpression(payload.check_expression)
      === normalizeSqlExpression(CANONICAL_TRAINING_CHECK_EXPRESSION),
    indexExact: payload.index_definition === CANONICAL_TRAINING_INDEX_DEFINITION,
    prerequisitePreservationExact:
      classifyPrePhase2bPreservation(payload.prerequisite_preservation, { transactionReadOnly }).classification === "EXACT",
  };
  const exact = common && payload.counts.payload_hash_nulls === 37
    && Object.values(details).every(Boolean);
  return { classification: exact ? "EXACT" : "BLOCKER", checks: { ...payload.checks, ...details } };
}

export function classifyCanonicalTrainingPreservation(payload, { transactionReadOnly = "on" } = {}) {
  return classifyCanonicalTrainingPostPayload(payload, { requireLaterProvidersAbsent: false, transactionReadOnly });
}

export function classifyCanonicalTrainingState(payload, { post = false } = {}) {
  if (!payload || !payload.checks || !payload.counts
      || requiredChecks.some((name) => typeof payload.checks[name] !== "boolean")) {
    return { classification: "UNKNOWN" };
  }
  const common = requiredChecks.every((name) => payload.checks[name] === true)
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.clips === 30
    && payload.counts.training_duplicate_groups === 0;
  if (!post) {
    const absent = payload.function === null && payload.function_acl.length === 0
      && payload.policies.length === 0 && payload.table_acl.length === 0
      && payload.index_definition === null && payload.check_expression === null
      && exactSet(payload.schema_acl, ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
        ["schema_name", "grantee", "grantor", "privilege_type", "is_grantable"])
      && exactSet(payload.column_acl, ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
        ["schema_name", "table_name", "column_name", "grantee", "grantor", "privilege_type", "is_grantable"]);
    return { classification: common && absent ? "PASS" : "BLOCKER", checks: payload.checks };
  }
  return classifyCanonicalTrainingPostPayload(payload, { requireLaterProvidersAbsent: true });
}
