import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSqlExpression } from "../../production-preflight/canonical-contracts.mjs";
import { hashFunctionSource, jsonQuery } from "../../production-preflight/queries.mjs";

export const CANONICAL_RUNTIME_INSTALLED_FORMAT =
  "REFLAB_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED_V1";
export const CANONICAL_RUNTIME_INSTALLED_ARTIFACT =
  "supabase/migrations/202608310006_production_adoption_canonical_runtime_installed.sql";
export const CANONICAL_RUNTIME_INSTALLED_SHA256 =
  "715ca35e32c91d9c4870362808a0ff12a67af74ef6d8bf539669875617919168";
export const CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID =
  "phase2b_canonical_runtime_installed_pre";
export const CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID =
  "phase2b_canonical_runtime_installed_post";
export const PRODUCTION_ADOPTION_GUARD_SOURCE_SHA256 =
  "f2da79e25c71808e427541ca55444a3379554b26763d361d7d1db50980f0d81c";

export const CANONICAL_RUNTIME_INSTALLED_MUTATIONS = Object.freeze({
  productInserts: 0,
  productUpdates: 0,
  productDeletes: 0,
  productBackfills: 0,
  ledgerInserts: 1,
  ledgerUpdates: 0,
  ledgerDeletes: 0,
  schemaStateWrites: 0,
  canonicalMarkerWrites: 0,
  functionsCreated: 0,
  policiesChanged: 0,
  indexesChanged: 0,
  constraintsChanged: 0,
  grantsChanged: 0,
  ownershipChanges: 0,
  notifications: 0,
});

export const CANONICAL_RUNTIME_LEDGER_COLUMNS = Object.freeze([
  Object.freeze({ name: "phase_order", type: "smallint", not_null: true, default: null }),
  Object.freeze({ name: "phase_key", type: "text", not_null: true, default: null }),
  Object.freeze({ name: "previous_phase_key", type: "text", not_null: false, default: null }),
  Object.freeze({ name: "plan_version", type: "text", not_null: true, default: null }),
  Object.freeze({ name: "plan_hash", type: "text", not_null: true, default: null }),
  Object.freeze({ name: "evidence_hash", type: "text", not_null: true, default: null }),
  Object.freeze({ name: "recorded_at", type: "timestamp with time zone", not_null: true, default: "now()" }),
]);

export const CANONICAL_RUNTIME_LEDGER_CONSTRAINTS = Object.freeze([
  Object.freeze({ name: "production_adoption_state_pkey", type: "p", columns: ["phase_order"], expression: null }),
  Object.freeze({ name: "production_adoption_state_phase_key_key", type: "u", columns: ["phase_key"], expression: null }),
  Object.freeze({ name: "production_adoption_state_phase_order_check", type: "c", columns: ["phase_order"], expression: "((phase_order >= 1) AND (phase_order <= 7))" }),
  Object.freeze({ name: "production_adoption_state_plan_hash_check", type: "c", columns: ["plan_hash"], expression: "(plan_hash ~ '^[0-9a-f]{64}$'::text)" }),
  Object.freeze({ name: "production_adoption_state_evidence_hash_check", type: "c", columns: ["evidence_hash"], expression: "(evidence_hash ~ '^[0-9a-f]{64}$'::text)" }),
  Object.freeze({ name: "production_adoption_previous_phase_check", type: "c", columns: ["phase_order", "previous_phase_key"], expression: "(((phase_order = 1) AND (previous_phase_key IS NULL)) OR ((phase_order > 1) AND (previous_phase_key IS NOT NULL)))" }),
]);

export const CANONICAL_RUNTIME_LEDGER_ACL = Object.freeze([
  "DELETE", "INSERT", "MAINTAIN", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE",
].map((privilege_type) => Object.freeze({
  grantee: "postgres", grantor: "postgres", privilege_type, is_grantable: false,
})));
export const CANONICAL_RUNTIME_LEDGER_SCHEMA_ACL = Object.freeze([
  Object.freeze({ grantee: "postgres", grantor: "postgres", privilege_type: "CREATE", is_grantable: false }),
  Object.freeze({ grantee: "postgres", grantor: "postgres", privilege_type: "USAGE", is_grantable: false }),
  Object.freeze({ grantee: "reflab_rls_owner", grantor: "postgres", privilege_type: "USAGE", is_grantable: false }),
]);
export const CANONICAL_RUNTIME_LEDGER_GUARD_ACL = Object.freeze([
  Object.freeze({ grantee: "postgres", grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false }),
]);

export const CANONICAL_RUNTIME_LEDGER_ROWS_PRE = Object.freeze([
  Object.freeze({ phase_order: 1, phase_key: "foundation", previous_phase_key: null }),
  Object.freeze({ phase_order: 2, phase_key: "exam_training_prerequisites", previous_phase_key: "foundation" }),
  Object.freeze({ phase_order: 3, phase_key: "psychology_notification_prerequisites", previous_phase_key: "exam_training_prerequisites" }),
]);
export const CANONICAL_RUNTIME_LEDGER_ROWS_POST = Object.freeze([
  ...CANONICAL_RUNTIME_LEDGER_ROWS_PRE,
  Object.freeze({ phase_order: 4, phase_key: "canonical_objects", previous_phase_key: "psychology_notification_prerequisites" }),
]);
export const CANONICAL_RUNTIME_PLAN = Object.freeze({
  plan_version: "production_adoption_bridge_v1",
  plan_hash: "ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f",
  evidence_hash: "07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d",
});

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

export function assertCanonicalRuntimeInstalledArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, CANONICAL_RUNTIME_INSTALLED_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const inserts = [...sql.matchAll(/\binsert\s+into\s+([a-z_][a-z0-9_.]*)/gi)]
    .map((match) => match[1].toLowerCase());
  if (digest !== CANONICAL_RUNTIME_INSTALLED_SHA256
      || JSON.stringify(inserts) !== JSON.stringify(["reflab_meta.production_adoption_state"])
      || !/begin\s*;[\s\S]*set local lock_timeout = '5s';[\s\S]*set local statement_timeout = '60s';/i.test(sql)
      || !/lock table reflab_meta[.]production_adoption_state in exclusive mode/i.test(sql)
      || !/4\s*,\s*'canonical_objects'\s*,\s*'psychology_notification_prerequisites'/i.test(sql)
      || /^\s*(?:update|delete\s+from|truncate)\b/gmi.test(sql)
      || /\b(?:grant|revoke|notify|alter\s+owner|create\s+function|create\s+policy|create\s+index|drop\s+index)\b/i.test(sql)
      || /alter\s+table[\s\S]*?(?:enable|disable|force|no\s+force)\s+row\s+level\s+security/i.test(sql)
      || /^\s*insert\s+into\s+(?:public|storage)[.]/gmi.test(sql)
      || !/commit\s*;\s*$/i.test(sql)) {
    throw new Error("Production 310006 artifact hash, scope, or transaction drifted.");
  }
  return { path: CANONICAL_RUNTIME_INSTALLED_ARTIFACT, sha256: digest, sql };
}

function stateQuery(id) {
  return jsonQuery(id, `(with ledger_relation as (
    select relation.oid,relation.relkind,relation.relpersistence,relation.relrowsecurity,
      relation.relforcerowsecurity,owner_role.rolname owner_name
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid=relation.relowner
    where namespace.nspname='reflab_meta' and relation.relname='production_adoption_state'
  ), ledger_columns as (
    select attribute.attname name,pg_catalog.format_type(attribute.atttypid,attribute.atttypmod) type,
      attribute.attnotnull not_null,pg_catalog.pg_get_expr(default_record.adbin,default_record.adrelid,false) default
    from ledger_relation relation join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid
    left join pg_catalog.pg_attrdef default_record on default_record.adrelid=attribute.attrelid
      and default_record.adnum=attribute.attnum
    where attribute.attnum>0 and not attribute.attisdropped
  ), ledger_constraints as (
    select constraint_row.conname name,constraint_row.contype type,constraint_row.convalidated validated,
      coalesce((select pg_catalog.array_agg(attribute.attname order by key.ordinality)
        from pg_catalog.unnest(constraint_row.conkey) with ordinality key(attnum,ordinality)
        join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid
          and attribute.attnum=key.attnum),array[]::text[]) columns,
      case when constraint_row.contype='c' then pg_catalog.pg_get_expr(
        constraint_row.conbin,constraint_row.conrelid,false) else null end expression
    from ledger_relation relation join pg_catalog.pg_constraint constraint_row
      on constraint_row.conrelid=relation.oid
  ), guard_function as (
    select procedure.oid,pg_catalog.pg_get_function_identity_arguments(procedure.oid) identity_arguments,
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
    where namespace.nspname='reflab_meta' and procedure.proname='guard_production_adoption_state'
  ), ledger_trigger as (
    select trigger.tgname name,trigger.tgenabled enabled,trigger.tgisinternal internal,
      trigger.tgtype type,trigger.tgqual is not null has_when,function_namespace.nspname function_schema,
      function.proname function_name
    from ledger_relation relation join pg_catalog.pg_trigger trigger on trigger.tgrelid=relation.oid
    join pg_catalog.pg_proc function on function.oid=trigger.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=function.pronamespace
    where not trigger.tgisinternal
  ), ledger_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from ledger_relation relation cross join lateral pg_catalog.aclexplode(
      coalesce((select relacl from pg_catalog.pg_class where oid=relation.oid),
        pg_catalog.acldefault('r',(select oid from pg_catalog.pg_roles where rolname=relation.owner_name)))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), schema_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from pg_catalog.pg_namespace namespace cross join lateral pg_catalog.aclexplode(
      coalesce(namespace.nspacl,pg_catalog.acldefault('n',namespace.nspowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
    where namespace.nspname='reflab_meta'
  ), guard_acl as (
    select case when acl.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
      grantor.rolname grantor,acl.privilege_type,acl.is_grantable
    from guard_function state join pg_catalog.pg_proc procedure on procedure.oid=state.oid
    cross join lateral pg_catalog.aclexplode(coalesce(procedure.proacl,
      pg_catalog.acldefault('f',procedure.proowner))) acl
    left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
    left join pg_catalog.pg_roles grantor on grantor.oid=acl.grantor
  ), ledger_rows as (
    select phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash,
      recorded_at is not null recorded_at_present
    from reflab_meta.production_adoption_state order by phase_order
  ) select pg_catalog.json_build_object(
    'checks',pg_catalog.json_build_object(
      'sessionExact',current_user='postgres' and session_user='postgres'
        and pg_catalog.current_database()='postgres'
        and pg_catalog.current_setting('transaction_read_only')='on'
        and pg_catalog.current_setting('server_version_num')::integer/10000=17,
      'historicalFingerprintsExact',(select pg_catalog.count(*)=37 from public.attempts)
        and (select pg_catalog.count(*)=6 from public.exam_results)
        and (select pg_catalog.count(*)=60 from public.notification_events)
        and (select pg_catalog.count(*)=30 from public.clips),
      'historicalProviderDataExact',(select pg_catalog.count(*)=37 from public.attempts where canonical_payload_hash is null)
        and (select pg_catalog.count(*)=0 from public.attempts where source_item_type='communication_feedback'),
      'schemaStateEmpty',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent',(select pg_catalog.count(*)=0 from reflab_meta.reflab_schema_state),
      'developmentObjectsAbsent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null
        and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null,
      'cutoverAbsent',pg_catalog.to_regprocedure('reflab_private.request_user_id()') is null
        and pg_catalog.to_regprocedure('reflab_private.set_updated_at()') is null
        and pg_catalog.to_regrole('reflab_pre_cutover_evidence_owner') is null,
      'ledgerRelationExact',(select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        relkind='r' and relpersistence='p' and relrowsecurity and not relforcerowsecurity
        and owner_name='postgres') from ledger_relation),
      'ledgerTriggerExact',(select pg_catalog.count(*)=1 and pg_catalog.bool_and(
        name='production_adoption_state_guard' and enabled='O' and not internal
        and type=31 and not has_when and function_schema='reflab_meta'
        and function_name='guard_production_adoption_state') from ledger_trigger),
      'noLaterLedgerPhase',not exists(select 1 from ledger_rows where phase_order>4)
    ),
    'counts',pg_catalog.json_build_object(
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'clips',(select pg_catalog.count(*) from public.clips),
      'payload_hash_nulls',(select pg_catalog.count(*) from public.attempts where canonical_payload_hash is null),
      'communication_attempts',(select pg_catalog.count(*) from public.attempts where source_item_type='communication_feedback'),
      'ledger_rows',(select pg_catalog.count(*) from ledger_rows),
      'schema_state_rows',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state)
    ),
    'columns',(select coalesce(pg_catalog.json_agg(state order by name),'[]'::json) from ledger_columns state),
    'constraints',(select coalesce(pg_catalog.json_agg(state order by name),'[]'::json) from ledger_constraints state),
    'guard_function',(select pg_catalog.row_to_json(state) from guard_function state),
    'ledger_acl',(select coalesce(pg_catalog.json_agg(state order by grantee,privilege_type),'[]'::json) from ledger_acl state),
    'schema_acl',(select coalesce(pg_catalog.json_agg(state order by grantee,privilege_type),'[]'::json) from schema_acl state),
    'guard_acl',(select coalesce(pg_catalog.json_agg(state order by grantee,privilege_type),'[]'::json) from guard_acl state),
    'ledger_rows',(select coalesce(pg_catalog.json_agg(state order by phase_order),'[]'::json) from ledger_rows state)
  ))`);
}

export const canonicalRuntimeInstalledPreQuery = stateQuery(
  CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
);
export const canonicalRuntimeInstalledPostQuery = stateQuery(
  CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID,
);

const key = (value, fields) => fields.map((field) => JSON.stringify(value?.[field] ?? null)).join("|");
function exactSet(observed, expected, fields) {
  if (!Array.isArray(observed) || observed.length !== expected.length) return false;
  const actual = observed.map((entry) => key(entry, fields)).sort();
  const wanted = expected.map((entry) => key(entry, fields)).sort();
  return actual.every((entry, index) => entry === wanted[index]);
}

function guardFunctionExact(observed) {
  if (!observed || typeof observed.source_base64 !== "string") return false;
  let sourceExact = false;
  try {
    sourceExact = hashFunctionSource(Buffer.from(observed.source_base64, "base64").toString("utf8"))
      === PRODUCTION_ADOPTION_GUARD_SOURCE_SHA256;
  } catch {}
  return sourceExact && observed.identity_arguments === "" && observed.result_type === "trigger"
    && observed.language_name === "plpgsql" && observed.volatility === "v"
    && observed.strict_mode === false && observed.security_definer === false
    && observed.leakproof === false && observed.function_kind === "f"
    && observed.owner_name === "postgres"
    && JSON.stringify(observed.configuration) === JSON.stringify(["search_path=pg_catalog"]);
}

function constraintsExact(observed) {
  if (!Array.isArray(observed) || observed.length !== CANONICAL_RUNTIME_LEDGER_CONSTRAINTS.length) {
    return false;
  }
  return CANONICAL_RUNTIME_LEDGER_CONSTRAINTS.every((expected) => observed.some((candidate) =>
    candidate.name === expected.name && candidate.type === expected.type
      && candidate.validated === true
      && JSON.stringify(candidate.columns) === JSON.stringify(expected.columns)
      && normalizeSqlExpression(candidate.expression) === normalizeSqlExpression(expected.expression)));
}

function rowsExact(observed, post) {
  const expected = post ? CANONICAL_RUNTIME_LEDGER_ROWS_POST : CANONICAL_RUNTIME_LEDGER_ROWS_PRE;
  if (!Array.isArray(observed) || observed.length !== expected.length) return false;
  return expected.every((entry, index) => {
    const candidate = observed[index];
    return candidate?.phase_order === entry.phase_order && candidate.phase_key === entry.phase_key
      && candidate.previous_phase_key === entry.previous_phase_key
      && candidate.plan_version === CANONICAL_RUNTIME_PLAN.plan_version
      && candidate.plan_hash === CANONICAL_RUNTIME_PLAN.plan_hash
      && candidate.evidence_hash === CANONICAL_RUNTIME_PLAN.evidence_hash
      && candidate.recorded_at_present === true;
  });
}

export function classifyCanonicalRuntimeInstalledState(payload, { post = false } = {}) {
  const requiredChecks = [
    "sessionExact", "historicalFingerprintsExact", "historicalProviderDataExact",
    "schemaStateEmpty", "canonicalMarkerAbsent", "developmentObjectsAbsent",
    "cutoverAbsent", "ledgerRelationExact", "ledgerTriggerExact", "noLaterLedgerPhase",
  ];
  if (!payload?.checks || !payload?.counts
      || requiredChecks.some((name) => typeof payload.checks[name] !== "boolean")
      || !Array.isArray(payload.columns) || !Array.isArray(payload.constraints)
      || !Array.isArray(payload.ledger_acl) || !Array.isArray(payload.schema_acl)
      || !Array.isArray(payload.guard_acl) || !Array.isArray(payload.ledger_rows)) {
    return { classification: "UNKNOWN" };
  }
  const details = {
    columnsExact: exactSet(payload.columns, CANONICAL_RUNTIME_LEDGER_COLUMNS,
      ["name", "type", "not_null", "default"]),
    constraintsExact: constraintsExact(payload.constraints),
    guardFunctionExact: guardFunctionExact(payload.guard_function),
    ledgerAclExact: exactSet(payload.ledger_acl, CANONICAL_RUNTIME_LEDGER_ACL,
      ["grantee", "grantor", "privilege_type", "is_grantable"]),
    schemaAclExact: exactSet(payload.schema_acl, CANONICAL_RUNTIME_LEDGER_SCHEMA_ACL,
      ["grantee", "grantor", "privilege_type", "is_grantable"]),
    guardAclExact: exactSet(payload.guard_acl, CANONICAL_RUNTIME_LEDGER_GUARD_ACL,
      ["grantee", "grantor", "privilege_type", "is_grantable"]),
    ledgerRowsExact: rowsExact(payload.ledger_rows, post),
  };
  const expectedLedgerRows = post ? 4 : 3;
  const exact = requiredChecks.every((name) => payload.checks[name] === true)
    && payload.counts.attempts === 37 && payload.counts.exam_results === 6
    && payload.counts.notification_events === 60 && payload.counts.clips === 30
    && payload.counts.payload_hash_nulls === 37 && payload.counts.communication_attempts === 0
    && payload.counts.ledger_rows === expectedLedgerRows && payload.counts.schema_state_rows === 0
    && Object.values(details).every(Boolean);
  return {
    classification: exact ? (post ? "EXACT" : "PASS") : "BLOCKER",
    checks: { ...payload.checks, ...details },
  };
}

export function classifyCanonicalRuntimeInstalledComposition({
  installer, historicalFingerprintExact, phase2a, helper, admin, communication, runtimeInstalled,
}, { post = false } = {}) {
  const components = {
    installerExact: installer?.managedProfile === "READY"
      && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT",
    historicalFingerprintExact: historicalFingerprintExact === true,
    phase2aPreserved: phase2a?.postState === "EXACT",
    canonicalJsonbTextPreserved: helper?.classification === "EXACT",
    adminCanonicalAccessPreserved: admin?.classification === "EXACT",
    communicationPreserved: communication?.classification === "EXACT",
    runtimeInstalledStateExact: runtimeInstalled?.classification === (post ? "EXACT" : "PASS"),
  };
  return { classification: Object.values(components).every(Boolean) ? "EXACT" : "BLOCKER", components };
}
