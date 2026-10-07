import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { identityBridgePostQueries, classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { PHASE4B_WAVE1_HELPERS } from "../phase4/phase4b-wave1-contract.mjs";

export const CORE_POLICY_MIGRATION = "20260901064245_production_adoption_core_policy_reconciliation.sql";
export const CORE_POLICY_SHA256 = "cfa44bed4c7feb033087a4ea632986e5f37174dc93bbe730ee9168dc84a63a34";
export const CORE_POLICY_TABLES = Object.freeze([...new Set(PHASE3_POLICY_MATRIX.map((p) => p.table))]);
export const CORE_POLICY_QUERY_ID = "phase3_core_policy_inventory";
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const tables = CORE_POLICY_TABLES.map(literal).join(",");
const productDigests = CORE_POLICY_TABLES.map((table) => `(select pg_catalog.md5(coalesce(
  pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by pg_catalog.to_jsonb(r)::text), '[]'::jsonb)::text)
  from public.${table} r)`).join(",");

export const corePolicyQuery = jsonQuery(CORE_POLICY_QUERY_ID, `(
  with relations as (
    select c.* from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (${tables})
  ) select pg_catalog.jsonb_build_object(
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',relname,
      'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'force',relforcerowsecurity,
      'installer_authority',relowner=(select oid from pg_roles where rolname=current_user)
        or pg_has_role(current_user,relowner,'USAGE')) order by relname),'[]') from relations),
    'table_acl', (select coalesce(jsonb_agg(jsonb_build_object('table',r.relname,
      'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
      order by r.relname,a.grantee,a.grantor,a.privilege_type),'[]') from relations r
      cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a),
    'column_acl', (select coalesce(jsonb_agg(jsonb_build_object('table',r.relname,'column',c.attname,
      'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
      'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
      order by r.relname,c.attnum,a.grantee,a.grantor,a.privilege_type),'[]') from relations r
      join pg_attribute c on c.attrelid=r.oid and c.attnum>0 and not c.attisdropped
      cross join lateral aclexplode(c.attacl) a),
    'policies', (select coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'schema','public',
      'table',r.relname,'name',p.polname,'command',case p.polcmd when 'r' then 'SELECT'
        when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
      'permissive',p.polpermissive,'roles',(select jsonb_agg(case when x=0 then 'PUBLIC'
        else pg_get_userbyid(x) end order by x) from unnest(p.polroles) x),
      'using',pg_get_expr(p.polqual,p.polrelid,false),'withCheck',pg_get_expr(p.polwithcheck,p.polrelid,false))
      order by r.relname,p.polname),'[]') from relations r join pg_policy p on p.polrelid=r.oid),
    'productFingerprint',pg_catalog.md5(jsonb_build_array(${productDigests})::text),
    'protectedObjectsHash',pg_catalog.md5(jsonb_build_object(
      'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.prolang,p.provolatile,
        p.proisstrict,p.prosecdef,p.proleakproof,p.prokind,p.proconfig,p.proacl,md5(p.prosrc)) order by p.oid)
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reflab_private','reflab_audit')),
      'schemas',(select jsonb_agg(jsonb_build_array(oid,nspowner,nspacl) order by oid)
        from pg_namespace where nspname in ('public','reflab_private','reflab_meta','reflab_audit')),
      'indexes',(select jsonb_agg(jsonb_build_array(i.indexrelid,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) order by i.indexrelid)
        from pg_index i join relations r on r.oid=i.indrelid),
      'constraints',(select jsonb_agg(jsonb_build_array(c.oid,c.convalidated,pg_get_constraintdef(c.oid)) order by c.oid)
        from pg_constraint c join relations r on r.oid=c.conrelid),
      'triggers',(select jsonb_agg(jsonb_build_array(t.oid,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.oid)
        from pg_trigger t join relations r on r.oid=t.tgrelid)
    )::text),
    'phase4Absent',not exists(select 1 from unnest(array[${PHASE4B_WAVE1_HELPERS.map((h) => literal(h.signature)).join(",")}]::text[]) s
      where to_regprocedure(s) is not null) and not exists(select 1 from pg_description
      where description like 'reflab:production_adoption_provider=%'),
    'cutoverAbsent',to_regprocedure('reflab_private.set_updated_at()') is null
      and to_regrole('reflab_pre_cutover_evidence_owner') is null,
    'runtimeDisabled',(select count(*)=0 from reflab_meta.reflab_schema_state)
  )
)`);

export function buildCorePolicyBatch() {
  return buildSqlBatch([...identityBridgePostQueries, corePolicyQuery]);
}
const key = (p) => `${p.schema}.${p.table}.${p.name}`;
const targetedKeys = new Set(PHASE3_POLICY_MATRIX.map((p) => `public.${p.table}.${p.name}`));
export const nonTargetPolicies = (policies) => policies.filter((p) => !targetedKeys.has(key(p)));
const stable = (value) => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const exactRows = (a, b) => Array.isArray(a) && Array.isArray(b)
  && stable(a.map(stable).sort()) === stable(b.map(stable).sort());

// Same qualified/unqualified platform equivalence and outer rendering normalization as SQL PRE.
export function normalizeCorePolicyExpression(value, historical = false) {
  let text = String(value ?? "").toLowerCase();
  if (historical) for (const [legacy, canonical] of [
    ["platform_request_user_id", "request_user_id"], ["platform_is_super_admin", "is_super_admin"],
  ]) text = text.replace(new RegExp(`(^|[^a-z0-9_.])((public\\.)?${legacy})\\s*\\(\\s*\\)`, "g"),
    `$1reflab_private.${canonical}()`);
  return text.replace(/[\s()]/g, "");
}
function targetExact(observed, expected, historical) {
  return observed?.schema === "public" && observed.table === expected.table && observed.name === expected.name
    && observed.command === expected.command && observed.permissive === true
    && stable(observed.roles) === '["authenticated"]'
    && normalizeCorePolicyExpression(observed.using, historical) === normalizeCorePolicyExpression(expected.using)
    && normalizeCorePolicyExpression(observed.withCheck, historical) === normalizeCorePolicyExpression(expected.withCheck)
    && (historical || !/platform_request_user_id|platform_is_super_admin/.test(`${observed.using} ${observed.withCheck}`));
}
const inventoryComplete = (p) => p && ["tables", "policies", "table_acl", "column_acl"].every((k) => Array.isArray(p[k]))
  && p.tables.every((r) => r && ["schema", "table", "owner"].every((k) => typeof r[k] === "string")
    && ["rls", "force", "installer_authority"].every((k) => typeof r[k] === "boolean"))
  && p.policies.every((r) => r && (Number.isInteger(r.oid) && r.oid > 0
    || typeof r.oid === "string" && /^[1-9][0-9]*$/.test(r.oid))
    && ["schema", "table", "name", "command"].every((k) => typeof r[k] === "string")
    && typeof r.permissive === "boolean" && Array.isArray(r.roles) && r.roles.every((v) => typeof v === "string")
    && ["using", "withCheck"].every((k) => r[k] === null || typeof r[k] === "string"))
  && ["table_acl", "column_acl"].every((k) => p[k].every((r) => r
    && ["table", "grantee", "grantor", "privilege"].every((key) => typeof r[key] === "string")
    && typeof r.grantable === "boolean" && (k !== "column_acl" || typeof r.column === "string")))
  && ["productFingerprint", "protectedObjectsHash"].every((k) => /^[a-f0-9]{32}$/.test(p[k] ?? ""))
  && ["phase4Absent", "cutoverAbsent", "runtimeDisabled"].every((k) => typeof p[k] === "boolean");
const tablesExact = (rows) => rows.length === 10 && new Set(rows.map((r) => r.table)).size === 10
  && CORE_POLICY_TABLES.every((t) => rows.some((r) => r.table === t && r.schema === "public"
    && r.owner === "postgres" && r.rls === true && r.force === false && r.installer_authority === true));

// The baseline is a separately reviewed approval input, never learned from candidate evidence.
// The disposable rehearsal supplies its approved synthetic inventory; Production needs its own review.
export function classifyCorePolicyInventory(payload, baseline, predecessorExact, { post = false } = {}) {
  if (!inventoryComplete(payload) || !inventoryComplete(baseline)) return { classification: "UNKNOWN", executablePre: false };
  const checks = {
    identityAndPredecessorsExact: predecessorExact === true,
    tableSecurityExact: tablesExact(payload.tables) && tablesExact(baseline.tables)
      && exactRows(payload.tables, baseline.tables),
    tableAclPreserved: exactRows(payload.table_acl, baseline.table_acl),
    columnAclPreserved: exactRows(payload.column_acl, baseline.column_acl),
    nonTargetPoliciesPreserved: exactRows(nonTargetPolicies(payload.policies), nonTargetPolicies(baseline.policies)),
    historicalFingerprintsPreserved: payload.productFingerprint === baseline.productFingerprint,
    protectedObjectsPreserved: payload.protectedObjectsHash === baseline.protectedObjectsHash,
    phase4Absent: payload.phase4Absent === true, cutoverAbsent: payload.cutoverAbsent === true,
    runtimeDisabled: payload.runtimeDisabled === true,
    policyIdentitiesUnique: new Set(payload.policies.map(key)).size === payload.policies.length,
  };
  const observed = new Map(payload.policies.filter((p) => targetedKeys.has(key(p))).map((p) => [key(p), p]));
  const canonicalExact = PHASE3_POLICY_MATRIX.every((p) => targetExact(observed.get(`public.${p.table}.${p.name}`), p, false));
  const historicalExact = PHASE3_POLICY_MATRIX.every((p) => {
    const actual = observed.get(`public.${p.table}.${p.name}`);
    return !actual || targetExact(actual, p, true);
  });
  checks.targetPoliciesExact = post ? canonicalExact : historicalExact;
  const failedChecks = Object.keys(checks).filter((k) => !checks[k]);
  const classification = failedChecks.length ? "BLOCKER" : post ? "EXACT"
    : canonicalExact ? "ALREADY_INSTALLED_POST" : "EXECUTABLE_PRE";
  return { classification, executablePre: classification === "EXECUTABLE_PRE", checks, failedChecks,
    missingTargets: PHASE3_POLICY_MATRIX.filter((p) => !observed.has(`public.${p.table}.${p.name}`)).map((p) => p.name),
    targetedCount: observed.size, nonTargetCount: nonTargetPolicies(payload.policies).length };
}
export function classifyCorePolicyBatch(results, baseline, options = {}) {
  if (!(results instanceof Map) || !results.has(CORE_POLICY_QUERY_ID)) return { classification: "UNKNOWN", executablePre: false };
  const identity = classifyIdentityBridgePostBatch(results);
  return classifyCorePolicyInventory(results.get(CORE_POLICY_QUERY_ID), baseline, identity.classification === "EXACT", options);
}

export const CORE_POLICY_MUTATIONS = Object.freeze({ productInserts: 0, productUpdates: 0, productDeletes: 0,
  backfill: 0, ledgerWrites: 0, schemaStateWrites: 0, markerWrites: 0, notifications: 0,
  phase4Writes: 0, runtimeEnablement: 0, cutover: 0, maxPolicyDrops: 22, policyCreates: 22,
  functions: 0, schemas: 0, indexes: 0, constraints: 0, triggers: 0, grants: 0, owners: 0, rlsChanges: 0 });
