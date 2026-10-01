import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch, hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";
import { normalizeSqlExpression } from "../../production-preflight/canonical-contracts.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "../bootstrap/production-managed-postgres-target.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  classifyCanonicalJsonbTextProvider,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  CANONICAL_TRAINING_CHECK_EXPRESSION,
  CANONICAL_TRAINING_COLUMN_ACL,
  CANONICAL_TRAINING_FUNCTION,
  CANONICAL_TRAINING_FUNCTION_ACL,
  CANONICAL_TRAINING_INDEX_DEFINITION,
  CANONICAL_TRAINING_POLICIES,
  CANONICAL_TRAINING_POST_QUERY_ID,
  CANONICAL_TRAINING_RLS,
  CANONICAL_TRAINING_SCHEMA_ACL,
  CANONICAL_TRAINING_TABLE_ACL,
  classifyCanonicalTrainingState,
} from "./phase2b-canonical-training-attempts-contract.mjs";
import {
  PRE_PHASE2B_POST_QUERY_ID,
  classifyPrePhase2bPreservation,
  prePhase2bPostQuery,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  AdminCanonicalAccessForensicFailure as ReadOnlyForensicFailure,
  classifyAdminCanonicalAccessForensicFailure as classifyReadOnlyForensicFailure,
  executeAdminCanonicalAccessForensicReadOnlyBatch as executeForensicReadOnlyBatch,
} from "./run-production-phase2b-admin-canonical-access-post-ddl-forensic.mjs";
import {
  assertCanonicalTrainingSessionPoolerTarget,
  buildCanonicalTrainingPostBatch,
} from "./run-production-phase2b-canonical-training-attempts.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const CANONICAL_TRAINING_FORENSIC_FORMAT =
  "REFLAB_202608130001_POST_DDL_FORENSIC_V1";
export const CANONICAL_TRAINING_FORENSIC_OPERATION =
  "--production-phase2b-canonical-training-attempts-post-ddl-forensic";
export const CANONICAL_TRAINING_FORENSIC_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_TRAINING_ATTEMPTS_POST_DDL_FORENSIC";
export const CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID =
  "phase2b_canonical_training_attempts_forensic_catalog";
export { ReadOnlyForensicFailure };

const POST_CONTRACT_BATCH_QUERY_ID = "phase2b_canonical_training_attempts_post_batch";
const PREREQUISITE_BATCH_QUERY_ID = "pre_phase2b_adoption_prerequisite_post_batch";
const rejectedDdlVariables = Object.freeze([
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_TRAINING_ATTEMPTS",
  "REFLAB_PRODUCTION_DDL_DB_URL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
]);

const functionFields = Object.freeze([
  "name", "identity_arguments", "result_type", "language_name", "volatility",
  "strict_mode", "security_definer", "leakproof", "function_kind", "owner_name",
  "configuration", "source_sha256",
]);
const functionAclFields = Object.freeze([
  "grantee", "grantor", "privilege_type", "is_grantable",
]);
const policyFields = Object.freeze([
  "schema_name", "table_name", "policy_name", "permissive", "command", "roles",
  "using_expression", "check_expression",
]);
const schemaAclFields = Object.freeze([
  "schema_name", "grantee", "grantor", "privilege_type", "is_grantable",
]);
const tableAclFields = Object.freeze([
  "schema_name", "table_name", "grantee", "grantor", "privilege_type", "is_grantable",
]);
const columnAclFields = Object.freeze([
  "schema_name", "table_name", "column_name", "grantee", "grantor",
  "privilege_type", "is_grantable",
]);
const rlsFields = Object.freeze(["schema_name", "table_name", "enabled", "forced"]);
const touchedRelationsSql = CANONICAL_TRAINING_RLS
  .map(({ schema_name, table_name }) => `('${schema_name}','${table_name}')`).join(",");

function normalizedValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? "<null>");
}

function entryKey(entry, fields) {
  return fields.map((field) => normalizedValue(entry?.[field])).join("\u0000");
}

function setDelta(expected, observed, fields) {
  const safeExpected = Array.isArray(expected) ? expected : [];
  const safeObserved = Array.isArray(observed) ? observed : [];
  const expectedKeys = new Set(safeExpected.map((entry) => entryKey(entry, fields)));
  const observedKeys = new Set(safeObserved.map((entry) => entryKey(entry, fields)));
  return {
    missing: safeExpected.filter((entry) => !observedKeys.has(entryKey(entry, fields))),
    unexpected: safeObserved.filter((entry) => !expectedKeys.has(entryKey(entry, fields))),
  };
}

function scalarDelta(expected, observed) {
  return expected === observed
    ? { missing: [], unexpected: [] }
    : { missing: [expected], unexpected: [observed] };
}

function aclSemanticsExact(expected, observed, fields) {
  const semanticFields = fields.filter((field) => field !== "grantor");
  const delta = setDelta(expected, observed, semanticFields);
  return delta.missing.length === 0 && delta.unexpected.length === 0;
}

function sourceSha256(sourceBase64) {
  try {
    return hashFunctionSource(Buffer.from(sourceBase64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function sanitizeFunction(payloadFunction, rawAcl) {
  if (!payloadFunction) {
    return {
      exists: false,
      ...Object.fromEntries(functionFields.map((field) => [field, null])),
      proacl: rawAcl ?? null,
    };
  }
  return {
    exists: true,
    name: payloadFunction.name,
    identity_arguments: payloadFunction.identity_arguments,
    result_type: payloadFunction.result_type,
    language_name: payloadFunction.language_name,
    volatility: payloadFunction.volatility,
    strict_mode: payloadFunction.strict_mode,
    security_definer: payloadFunction.security_definer,
    leakproof: payloadFunction.leakproof,
    function_kind: payloadFunction.function_kind,
    owner_name: payloadFunction.owner_name,
    configuration: payloadFunction.configuration,
    source_sha256: sourceSha256(payloadFunction.source_base64),
    proacl: rawAcl ?? null,
  };
}

function expectedFunction() {
  return {
    name: CANONICAL_TRAINING_FUNCTION.name,
    identity_arguments: CANONICAL_TRAINING_FUNCTION.identity_arguments,
    result_type: CANONICAL_TRAINING_FUNCTION.result_type,
    language_name: CANONICAL_TRAINING_FUNCTION.language_name,
    volatility: CANONICAL_TRAINING_FUNCTION.volatility,
    strict_mode: CANONICAL_TRAINING_FUNCTION.strict_mode,
    security_definer: CANONICAL_TRAINING_FUNCTION.security_definer,
    leakproof: CANONICAL_TRAINING_FUNCTION.leakproof,
    function_kind: CANONICAL_TRAINING_FUNCTION.function_kind,
    owner_name: CANONICAL_TRAINING_FUNCTION.owner_name,
    configuration: CANONICAL_TRAINING_FUNCTION.configuration,
    source_sha256: CANONICAL_TRAINING_FUNCTION.source_hash,
  };
}

function policyComparable(entry) {
  return {
    ...entry,
    using_expression: normalizeSqlExpression(entry?.using_expression),
    check_expression: normalizeSqlExpression(entry?.check_expression),
  };
}

function makeDifference(area, expected, observed, delta, likelyCause) {
  if (delta.missing.length === 0 && delta.unexpected.length === 0) return null;
  return {
    area,
    expected,
    observed,
    missing: delta.missing,
    unexpected: delta.unexpected,
    likelyCause,
  };
}

function componentExact(classification, expected) {
  return typeof classification === "string" && classification !== "UNKNOWN"
    ? classification === expected : null;
}

function checksWithNulls(payload, classifier) {
  const names = new Set([
    ...Object.keys(payload?.checks ?? {}),
    ...Object.keys(classifier?.checks ?? {}),
  ]);
  return Object.fromEntries([...names].sort().map((name) => [
    name,
    typeof classifier?.checks?.[name] === "boolean"
      ? classifier.checks[name]
      : typeof payload?.checks?.[name] === "boolean" ? payload.checks[name] : null,
  ]));
}

function adminProviderPreservedExact(state) {
  const checks = state?.checks ?? {};
  const names = [
    "helperSourceExact", "helperAclExact", "functionsExact", "functionAclExact",
    "policiesExact", "schemaAclExact", "tableAclExact", "columnAclExact",
    "trainingStageExact",
  ];
  if (names.some((name) => typeof checks[name] !== "boolean")) return null;
  return names.every((name) => checks[name] === true);
}

export const canonicalTrainingForensicCatalogQuery = jsonQuery(
  CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
  `(with target_function as (
    select procedure.oid,
      (select pg_catalog.array_agg(entry::text order by entry::text)
       from pg_catalog.unnest(coalesce(procedure.proacl,
         pg_catalog.acldefault('f',procedure.proowner))) entry) raw_acl
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname='submit_canonical_training_attempt'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid)=
        'p_user_id text, p_submission_id uuid, p_attempt jsonb, p_weekly_limit integer'
  ), column_state as (
    select pg_catalog.format_type(attribute.atttypid,attribute.atttypmod) data_type,
      attribute.attnotnull not_null,
      pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid,false) default_expression
    from pg_catalog.pg_attribute attribute
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid
      and default_record.adnum=attribute.attnum
    where attribute.attrelid='public.attempts'::pg_catalog.regclass
      and attribute.attname='canonical_payload_hash' and attribute.attnum>0 and not attribute.attisdropped
  ), check_state as (
    select constraint_row.conname name,
      pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false) expression,
      pg_catalog.pg_get_constraintdef(constraint_row.oid,true) definition,
      constraint_row.convalidated validated,
      constraint_row.condeferrable deferrable,
      constraint_row.condeferred initially_deferred
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid='public.attempts'::pg_catalog.regclass
      and constraint_row.conname='attempts_canonical_payload_hash_check'
  ), index_state as (
    select relation.relname name,pg_catalog.pg_get_indexdef(relation.oid) definition,
      pg_catalog.pg_get_expr(index_record.indpred,index_record.indrelid,false) predicate,
      index_record.indisunique unique_index,index_record.indisvalid valid,index_record.indisready ready
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid=relation.oid
    where namespace.nspname='public'
      and relation.relname='attempts_canonical_training_submission_unique'
  ), training_policy_scope as (
    select namespace.nspname schema_name,relation.relname table_name,policy.polname policy_name,
      policy.polpermissive permissive,case policy.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end command,
      (select pg_catalog.array_agg(role.rolname order by role.rolname)
       from pg_catalog.unnest(policy.polroles) role_oid(oid)
       join pg_catalog.pg_roles role on role.oid=role_oid.oid) roles,
      pg_catalog.pg_get_expr(policy.polqual,policy.polrelid,false) using_expression,
      pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid,false) check_expression
    from pg_catalog.pg_policy policy
    join pg_catalog.pg_class relation on relation.oid=policy.polrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where policy.polname like 'training_attempt_%'
  ), browser_function_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from target_function target
    join pg_catalog.pg_proc procedure on procedure.oid=target.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,
      pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (acl.grantee=0 or grantee.rolname in ('anon','authenticated'))
      and acl.privilege_type='EXECUTE'
  ), browser_table_acl as (
    select namespace.nspname schema_name,relation.relname table_name,
      case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(relation.relacl,
      pg_catalog.acldefault('r',relation.relowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (namespace.nspname,relation.relname) in (${touchedRelationsSql})
      and (acl.grantee=0 or grantee.rolname in ('anon','authenticated'))
  ), browser_column_acl as (
    select namespace.nspname schema_name,relation.relname table_name,attribute.attname column_name,
      case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid=attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where (namespace.nspname,relation.relname) in (${touchedRelationsSql})
      and (acl.grantee=0 or grantee.rolname in ('anon','authenticated'))
  ) select pg_catalog.json_build_object(
    'function_raw_acl',(select raw_acl from target_function),
    'column',coalesce((select pg_catalog.row_to_json(column_state) from column_state),'null'::json),
    'check',coalesce((select pg_catalog.row_to_json(check_state) from check_state),'null'::json),
    'index',coalesce((select pg_catalog.row_to_json(index_state) from index_state),'null'::json),
    'training_policy_scope',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name,policy_name),'[]'::json)
      from training_policy_scope entry),
    'browser_function_execute',(select coalesce(pg_catalog.json_agg(entry order by grantee,grantor),'[]'::json)
      from browser_function_acl entry),
    'browser_table_privileges',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name,grantee,privilege_type),'[]'::json)
      from browser_table_acl entry),
    'browser_column_privileges',(select coalesce(pg_catalog.json_agg(entry order by schema_name,table_name,column_name,grantee,privilege_type),'[]'::json)
      from browser_column_acl entry),
    'service_role_execute',exists(
      select 1 from target_function target join pg_catalog.pg_proc procedure on procedure.oid=target.oid
      cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,
        pg_catalog.acldefault('f',procedure.proowner))) acl
      join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
      where grantee.rolname='service_role' and acl.privilege_type='EXECUTE' and not acl.is_grantable),
    'rls_owner_create_absent',not pg_catalog.has_schema_privilege('reflab_rls_owner','public','CREATE')
  ))`,
);

export function buildCanonicalTrainingForensicCatalogBatch() {
  return buildSqlBatch([canonicalTrainingForensicCatalogQuery]);
}

export function buildCanonicalTrainingForensicPrerequisiteBatch() {
  return buildSqlBatch([prePhase2bPostQuery]);
}

export function classifyCanonicalTrainingPostDdlForensic(
  postResults,
  prerequisiteResults,
  catalogPayload,
) {
  const installerPayload = postResults instanceof Map
    ? postResults.get(installerIdentityQuery.id) : undefined;
  const fingerprintPayload = postResults instanceof Map
    ? postResults.get(phase1ProductFingerprintQuery.id) : undefined;
  const sidecarPayload = postResults instanceof Map
    ? postResults.get(phase2aSemanticAuditPostQuery.id) : undefined;
  const helperPayload = postResults instanceof Map
    ? postResults.get(CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID) : undefined;
  const adminPayload = postResults instanceof Map
    ? postResults.get(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID) : undefined;
  const payload = postResults instanceof Map
    ? postResults.get(CANONICAL_TRAINING_POST_QUERY_ID) : undefined;
  const prerequisitePayload = prerequisiteResults instanceof Map
    ? prerequisiteResults.get(PRE_PHASE2B_POST_QUERY_ID) : undefined;

  const installer = classifyInstallerIdentity(installerPayload);
  const adjustedSidecar = {
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  };
  const sidecar = classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const helper = classifyCanonicalJsonbTextProvider(helperPayload);
  const admin = classifyAdminCanonicalAccessState(adminPayload, { post: true });
  const prerequisite = classifyPrePhase2bPreservation(prerequisitePayload);
  const training = classifyCanonicalTrainingState(payload, { post: true });
  const observedFunction = sanitizeFunction(payload?.function, catalogPayload?.function_raw_acl);
  const expectedFunctionState = expectedFunction();
  const normalizedExpectedPolicies = CANONICAL_TRAINING_POLICIES.map(policyComparable);
  const normalizedObservedPolicies = (payload?.policies ?? []).map(policyComparable);
  const expectedColumn = { exists: true, data_type: "text", not_null: false, default_expression: null };
  const observedColumn = catalogPayload?.column
    ? { exists: true, ...catalogPayload.column }
    : { exists: false, data_type: null, not_null: null, default_expression: null };
  const expectedCheck = {
    name: "attempts_canonical_payload_hash_check",
    expression: CANONICAL_TRAINING_CHECK_EXPRESSION,
    validated: true,
    deferrable: false,
    initially_deferred: false,
  };
  const observedCheck = catalogPayload?.check
    ? {
      name: catalogPayload.check.name,
      expression: catalogPayload.check.expression,
      validated: catalogPayload.check.validated,
      deferrable: catalogPayload.check.deferrable,
      initially_deferred: catalogPayload.check.initially_deferred,
      definition: catalogPayload.check.definition,
    }
    : null;
  const expectedIndex = {
    name: "attempts_canonical_training_submission_unique",
    definition: CANONICAL_TRAINING_INDEX_DEFINITION,
    unique_index: true,
    valid: true,
    ready: true,
  };
  const observedIndex = catalogPayload?.index ?? null;

  const differences = [
    makeDifference("RPC", [expectedFunctionState], observedFunction.exists ? [observedFunction] : [],
      setDelta([expectedFunctionState], observedFunction.exists ? [observedFunction] : [], functionFields),
      "RPC_SIGNATURE_METADATA_OWNER_SEARCH_PATH_OR_SOURCE_DRIFT"),
    makeDifference("FUNCTION_ACL", CANONICAL_TRAINING_FUNCTION_ACL, payload?.function_acl ?? [],
      setDelta(CANONICAL_TRAINING_FUNCTION_ACL, payload?.function_acl ?? [], functionAclFields),
      "FUNCTION_GRANTEE_GRANTOR_OR_GRANTABILITY_DRIFT"),
    makeDifference("POLICIES", CANONICAL_TRAINING_POLICIES, payload?.policies ?? [],
      setDelta(normalizedExpectedPolicies, normalizedObservedPolicies, policyFields),
      "POLICY_IDENTITY_ROLE_COMMAND_OR_EXPRESSION_DRIFT"),
    makeDifference("TRAINING_POLICY_SCOPE", CANONICAL_TRAINING_POLICIES,
      catalogPayload?.training_policy_scope ?? [],
      setDelta(normalizedExpectedPolicies,
        (catalogPayload?.training_policy_scope ?? []).map(policyComparable), policyFields),
      "MISSING_OR_UNEXPECTED_TRAINING_POLICY"),
    makeDifference("SCHEMA_ACL", CANONICAL_TRAINING_SCHEMA_ACL, payload?.schema_acl ?? [],
      setDelta(CANONICAL_TRAINING_SCHEMA_ACL, payload?.schema_acl ?? [], schemaAclFields),
      "SCHEMA_GRANTEE_GRANTOR_OR_PRIVILEGE_DRIFT"),
    makeDifference("TABLE_ACL", CANONICAL_TRAINING_TABLE_ACL, payload?.table_acl ?? [],
      setDelta(CANONICAL_TRAINING_TABLE_ACL, payload?.table_acl ?? [], tableAclFields),
      "TABLE_GRANTEE_GRANTOR_OR_PRIVILEGE_DRIFT"),
    makeDifference("COLUMN_ACL", CANONICAL_TRAINING_COLUMN_ACL, payload?.column_acl ?? [],
      setDelta(CANONICAL_TRAINING_COLUMN_ACL, payload?.column_acl ?? [], columnAclFields),
      "COLUMN_GRANTEE_GRANTOR_OR_PRIVILEGE_DRIFT"),
    makeDifference("RLS", CANONICAL_TRAINING_RLS, payload?.rls ?? [],
      setDelta(CANONICAL_TRAINING_RLS, payload?.rls ?? [], rlsFields),
      "RLS_ENABLE_OR_FORCE_STATE_DRIFT"),
    makeDifference("PAYLOAD_HASH_COLUMN", expectedColumn, observedColumn,
      scalarDelta(JSON.stringify(expectedColumn), JSON.stringify(observedColumn)),
      "COLUMN_TYPE_NULLABILITY_OR_DEFAULT_DRIFT"),
    makeDifference("PAYLOAD_HASH_NULL_COUNT", 37, payload?.counts?.payload_hash_nulls ?? null,
      scalarDelta(37, payload?.counts?.payload_hash_nulls ?? null),
      "HISTORICAL_PAYLOAD_HASH_BACKFILL_OR_COUNT_DRIFT"),
    makeDifference("CHECK", expectedCheck, observedCheck,
      scalarDelta(
        JSON.stringify({ ...expectedCheck, expression: normalizeSqlExpression(expectedCheck.expression) }),
        JSON.stringify(observedCheck && { ...observedCheck, definition: undefined,
          expression: normalizeSqlExpression(observedCheck.expression) }),
      ), "CHECK_DEFINITION_OR_VALIDATION_DRIFT"),
    makeDifference("PARTIAL_UNIQUE_INDEX", expectedIndex, observedIndex,
      scalarDelta(JSON.stringify(expectedIndex), JSON.stringify(observedIndex && {
        name: observedIndex.name, definition: observedIndex.definition,
        unique_index: observedIndex.unique_index, valid: observedIndex.valid, ready: observedIndex.ready,
      })), "INDEX_DEFINITION_PREDICATE_VALIDITY_OR_READINESS_DRIFT"),
  ].filter(Boolean);

  const components = {
    installerManagedProfileExact: componentExact(installer.managedProfile, "READY"),
    installerLifecycleExact: componentExact(installer.lifecycleState, "POST_PHASE2A_SEMANTIC_AUDIT"),
    historicalFingerprintExact: typeof phase1HistoricalFingerprintExact(fingerprintPayload) === "boolean"
      ? phase1HistoricalFingerprintExact(fingerprintPayload) : null,
    phase2aSidecarExact: componentExact(sidecar.postState, "EXACT"),
    canonicalJsonbTextExact: componentExact(helper.classification, "EXACT"),
    adminCanonicalAccessExact: adminProviderPreservedExact(admin),
    prerequisitePostStateExact: componentExact(prerequisite.classification, "EXACT"),
    canonicalTrainingPostStateExact: componentExact(training.classification, "EXACT"),
  };
  const unknownComponents = Object.entries(components)
    .filter(([, value]) => value === null).map(([name]) => name);
  const failedComponents = Object.entries(components)
    .filter(([, value]) => value === false).map(([name]) => name);
  const trainingChecks = checksWithNulls(payload, training);
  const contractDifferences = [...differences];
  for (const [name, value] of Object.entries(components)) {
    if (value !== true) differences.push({
      area: `COMPONENT_${name}`,
      expected: true,
      observed: value,
      missing: [true],
      unexpected: [value],
      likelyCause: "PREDECESSOR_OR_TOP_LEVEL_POST_COMPONENT_DRIFT",
    });
  }
  for (const [name, value] of Object.entries(trainingChecks)) {
    if (value !== true) differences.push({
      area: `CHECK_${name}`,
      expected: true,
      observed: value,
      missing: [true],
      unexpected: [value],
      likelyCause: "POST_QUERY_BOOLEAN_PREDICATE_DRIFT",
    });
  }
  const browserPrivilegeSets = [
    catalogPayload?.browser_function_execute,
    catalogPayload?.browser_table_privileges,
    catalogPayload?.browser_column_privileges,
  ];
  const browserEvidenceComplete = browserPrivilegeSets.every(Array.isArray);
  const currentBrowserPrivileges = browserEvidenceComplete
    ? browserPrivilegeSets.flat() : null;
  const currentUnexpectedBrowserPrivilegesPresent = browserEvidenceComplete
    ? currentBrowserPrivileges.length > 0 : null;
  const browserRpcExecutePresent = Array.isArray(catalogPayload?.browser_function_execute)
    ? catalogPayload.browser_function_execute.length > 0 : null;
  const securityRelevantBrowserPrivilegeTypes = new Set([
    "EXECUTE", "MAINTAIN", "REFERENCES", "TRIGGER", "TRUNCATE",
  ]);
  const currentSecurityRelevantBrowserPrivileges = browserEvidenceComplete
    ? currentBrowserPrivileges.filter(({ privilege_type }) =>
      securityRelevantBrowserPrivilegeTypes.has(privilege_type))
    : null;
  const browserPrivilegeDeltaKnown = false;
  const browserPrivilegesIntroducedBy130001 = false;
  const productionExposureIncreased = null;
  const serviceRoleAccessUsable = typeof catalogPayload?.service_role_execute === "boolean"
    ? catalogPayload.service_role_execute : null;
  const exact = unknownComponents.length === 0 && failedComponents.length === 0
    && differences.length === 0
    && browserRpcExecutePresent === false
    && serviceRoleAccessUsable === true
    && catalogPayload?.rls_owner_create_absent === true;
  const anyInstalled = observedColumn.exists || observedFunction.exists
    || Boolean(observedCheck) || Boolean(observedIndex);
  const safeAclGrantorOnlyDrift = contractDifferences.length > 0
    && contractDifferences.every(({ area }) => [
      "FUNCTION_ACL", "SCHEMA_ACL", "TABLE_ACL", "COLUMN_ACL",
    ].includes(area))
    && aclSemanticsExact(CANONICAL_TRAINING_FUNCTION_ACL,
      payload?.function_acl ?? [], functionAclFields)
    && aclSemanticsExact(CANONICAL_TRAINING_SCHEMA_ACL,
      payload?.schema_acl ?? [], schemaAclFields)
    && aclSemanticsExact(CANONICAL_TRAINING_TABLE_ACL,
      payload?.table_acl ?? [], tableAclFields)
    && aclSemanticsExact(CANONICAL_TRAINING_COLUMN_ACL,
      payload?.column_acl ?? [], columnAclFields);
  let classification = "D. UNKNOWN";
  if (exact) {
    classification = "A. POST_STATE_EXACT_DIAGNOSTIC_FALSE_NEGATIVE";
  } else if (unknownComponents.length === 0 && anyInstalled
      && browserRpcExecutePresent === false && serviceRoleAccessUsable === true
      && safeAclGrantorOnlyDrift
      && training.checks?.functionExact === true
      && training.checks?.policiesExact === true
      && training.checks?.rlsExact === true) {
    classification = "B. COMMITTED_SAFE_BUT_CONTRACT_DRIFT";
  } else if (unknownComponents.length === 0 && anyInstalled) {
    classification = "C. COMMITTED_PARTIAL_OR_UNSAFE_STATE";
  }

  return {
    format: CANONICAL_TRAINING_FORENSIC_FORMAT,
    classification,
    migrationCommitted: anyInstalled ? true : null,
    commitSemantics: "POST_DDL_STAGE_IS_REACHED_ONLY_AFTER_PSQL_EXIT_0_FOLLOWING_MIGRATION_COMMIT",
    components,
    failedComponents,
    unknownComponents,
    checks: trainingChecks,
    observed: {
      installerManagedProfile: installer.managedProfile ?? null,
      installerLifecycleState: installer.lifecycleState ?? null,
      historicalCounts: payload?.counts ? {
        attempts: payload.counts.attempts,
        exam_results: payload.counts.exam_results,
        notification_events: payload.counts.notification_events,
        clips: payload.counts.clips,
      } : null,
      payloadHash: observedColumn,
      payloadHashNullCount: payload?.counts?.payload_hash_nulls ?? null,
      check: observedCheck,
      partialUniqueIndex: observedIndex,
      rpc: observedFunction,
      functionAcl: payload?.function_acl ?? null,
      policies: payload?.policies ?? null,
      trainingPolicyScope: catalogPayload?.training_policy_scope ?? null,
      schemaAcl: payload?.schema_acl ?? null,
      tableAcl: payload?.table_acl ?? null,
      columnAcl: payload?.column_acl ?? null,
      rls: payload?.rls ?? null,
    },
    security: {
      productionExposureIncreased,
      currentUnexpectedBrowserPrivilegesPresent,
      browserPrivilegeDeltaKnown,
      browserPrivilegesIntroducedBy130001,
      currentBrowserPrivileges,
      currentSecurityRelevantBrowserPrivileges,
      historicalOrPreexistingBrowserPrivileges: currentBrowserPrivileges,
      unexpectedBrowserPrivileges: currentBrowserPrivileges,
      serviceRoleAccessUsable,
      rlsOwnerCreateAbsent: catalogPayload?.rls_owner_create_absent ?? null,
      residualTemporaryPrivilegesAbsent: catalogPayload?.rls_owner_create_absent ?? null,
    },
    protectedState: {
      canonicalJsonbText: helper.classification ?? "UNKNOWN",
      adminCanonicalAccess: adminProviderPreservedExact(admin) === true
        ? "POST_TRAINING_PRESERVED_EXACT"
        : adminProviderPreservedExact(admin) === null ? "UNKNOWN" : "BLOCKER",
      prerequisite: prerequisite.classification ?? "UNKNOWN",
      prerequisiteRawChecks: prerequisitePayload?.checks ?? null,
      phase2aSidecar: sidecar.postState ?? "UNKNOWN",
      laterProvidersAbsent: payload?.checks?.laterProvidersAbsent ?? null,
      ledgerExact: payload?.checks?.ledgerExact ?? null,
      schemaStateEmpty: payload?.checks?.schemaStateEmpty ?? null,
      canonicalMarkerAbsent: payload?.checks?.canonicalMarkerAbsent ?? null,
    },
    differences,
  };
}

export function authorizeProductionCanonicalTrainingForensicTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[CANONICAL_TRAINING_FORENSIC_OPT_IN] !== "true") {
    throw new Error("202608130001_POST_DDL_FORENSIC_NOT_AUTHORIZED");
  }
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("202608130001_POST_DDL_FORENSIC_REJECTS_DDL_CONFIGURATION");
  }
  return assertCanonicalTrainingSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
      databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
      operationLabel: "202608130001 privileged read-only post-DDL forensic",
    }),
  );
}

function assertRequiredResults(results, queryIds, substage) {
  if (!(results instanceof Map)) {
    throw Object.assign(new Error("Expected a Map of framed query results."), {
      safeReason: "QUERY_RESULT_SHAPE_MISMATCH", queryId: substage,
    });
  }
  for (const queryId of queryIds) {
    if (!results.has(queryId)) {
      throw Object.assign(new Error(`Missing required query result ${queryId}.`), {
        safeReason: "QUERY_RESULT_SHAPE_MISMATCH", queryId,
      });
    }
  }
}

function atForensicStage(context, operation) {
  try {
    return operation();
  } catch (error) {
    throw classifyReadOnlyForensicFailure(error, context);
  }
}

export function formatCanonicalTrainingForensicFailure(error) {
  const failure = classifyReadOnlyForensicFailure(error, {
    stage: "OTHER", substage: "UNCLASSIFIED", reason: "PSQL_PROCESS_FAILED",
  });
  const safeToken = (value, fallback) => /^[A-Z][A-Z0-9_]*$/.test(String(value))
    ? String(value) : fallback;
  const queryId = /^[a-z][a-z0-9_]*$/.test(String(failure.queryId))
    ? failure.queryId : "NONE";
  const reason = /^(?:[A-Z][A-Z0-9_]*|SQLSTATE_[0-9A-Z]{5})$/.test(String(failure.reason))
    ? failure.reason : "PSQL_PROCESS_FAILED";
  const sqlstate = /^[0-9A-Z]{5}$/.test(String(failure.sqlstate))
    ? failure.sqlstate : "UNKNOWN";
  return [
    "REFLAB_202608130001_POST_DDL_FORENSIC_FAIL",
    `stage=${safeToken(failure.stage, "OTHER")}`,
    `substage=${safeToken(failure.substage, "UNCLASSIFIED")}`,
    `query=${queryId}`,
    `reason=${reason}`,
    `sqlstate=${sqlstate}`,
    `psqlExitStatus=${failure.psqlExitStatus ?? "UNKNOWN"}`,
    `stderrClass=${safeToken(failure.stderrClass, "NOT_AVAILABLE")}`,
    "",
  ].join("\n");
}

export function runProductionCanonicalTrainingPostDdlForensic(
  environment = process.env,
  dependencies = {},
) {
  atForensicStage({ stage: "OPERATION_GUARD", substage: "ARGUMENT",
    reason: "OPERATION_NOT_AUTHORIZED" }, () => {
    if (dependencies.argument !== CANONICAL_TRAINING_FORENSIC_OPERATION) {
      throw new Error("EXACT_202608130001_POST_DDL_FORENSIC_ARGUMENT_REQUIRED");
    }
  });
  atForensicStage({ stage: "ENVIRONMENT_GUARD", substage: "INHERITED_PG_STATE",
    reason: "INHERITED_PG_STATE" }, () => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = atForensicStage({ stage: "REPOSITORY_GUARD", substage: "HEAD_READ",
    reason: "REPOSITORY_HEAD_READ_FAILED" }, () => git(["rev-parse", "HEAD"]).trim());
  const status = atForensicStage({ stage: "REPOSITORY_GUARD", substage: "WORKTREE_READ",
    reason: "WORKTREE_READ_FAILED" }, () => git(["status", "--short"]));
  atForensicStage({ stage: "REPOSITORY_GUARD", substage: "ATTESTATION",
    reason: "HEAD_MISMATCH" }, () => assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead,
    status,
  }));
  const target = atForensicStage({ stage: "TARGET_GUARD", substage: "PRIVILEGED_READ_ONLY_TARGET",
    reason: "TARGET_MISMATCH" }, () => (dependencies.authorize
    ?? authorizeProductionCanonicalTrainingForensicTarget)(environment));
  const executeReadOnly = dependencies.executeReadOnly ?? executeForensicReadOnlyBatch;
  const execute = (batch, context) => atForensicStage(context, () => executeReadOnly(
    batch,
    target.connectionEnvironment,
    { processEnvironment: environment, spawn: dependencies.spawn ?? spawnSync, context },
  ));

  const postResults = execute(buildCanonicalTrainingPostBatch(), {
    stage: "PSQL_EXECUTION", substage: "POST_CONTRACT_BATCH",
    queryId: POST_CONTRACT_BATCH_QUERY_ID,
  });
  atForensicStage({ stage: "RESULT_PARSE", substage: "POST_CONTRACT_RESULTS",
    queryId: POST_CONTRACT_BATCH_QUERY_ID, reason: "QUERY_RESULT_SHAPE_MISMATCH" }, () =>
    assertRequiredResults(postResults, [
      installerIdentityQuery.id,
      phase1ProductFingerprintQuery.id,
      phase2aSemanticAuditPostQuery.id,
      CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
      ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
      CANONICAL_TRAINING_POST_QUERY_ID,
    ], POST_CONTRACT_BATCH_QUERY_ID));

  const prerequisiteResults = execute(buildCanonicalTrainingForensicPrerequisiteBatch(), {
    stage: "PSQL_EXECUTION", substage: "PREREQUISITE_POST_BATCH",
    queryId: PREREQUISITE_BATCH_QUERY_ID,
  });
  atForensicStage({ stage: "RESULT_PARSE", substage: "PREREQUISITE_POST_RESULTS",
    queryId: PRE_PHASE2B_POST_QUERY_ID, reason: "QUERY_RESULT_SHAPE_MISMATCH" }, () =>
    assertRequiredResults(prerequisiteResults, [PRE_PHASE2B_POST_QUERY_ID],
      PREREQUISITE_BATCH_QUERY_ID));

  const catalogResults = execute(buildCanonicalTrainingForensicCatalogBatch(), {
    stage: "PSQL_EXECUTION", substage: "FORENSIC_CATALOG_BATCH",
    queryId: CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
  });
  atForensicStage({ stage: "RESULT_PARSE", substage: "FORENSIC_CATALOG_RESULTS",
    queryId: CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
    reason: "QUERY_RESULT_SHAPE_MISMATCH" }, () => assertRequiredResults(
    catalogResults, [CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID],
    CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID,
  ));
  return atForensicStage({ stage: "CLASSIFICATION", substage: "POST_DDL_COMPARISON",
    queryId: CANONICAL_TRAINING_POST_QUERY_ID, reason: "POST_CLASSIFICATION_FAILED" }, () =>
    classifyCanonicalTrainingPostDdlForensic(
      postResults,
      prerequisiteResults,
      catalogResults.get(CANONICAL_TRAINING_FORENSIC_CATALOG_QUERY_ID),
    ));
}

export async function runProductionCanonicalTrainingPostDdlForensicCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionCanonicalTrainingPostDdlForensic)(
      environment, { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(
      formatCanonicalTrainingForensicFailure(error),
    );
    return 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const exitCode = await runProductionCanonicalTrainingPostDdlForensicCli();
  if (exitCode !== 0) process.exitCode = exitCode;
}
