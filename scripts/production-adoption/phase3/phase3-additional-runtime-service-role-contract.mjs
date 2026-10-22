import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { browserPrivilegeInventoryQuery } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { serviceRoleInventoryQuery, SERVICE_FORENSIC_QUERY_ID, privilegeOrigins } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { classifyCurrentServiceTransition, classifyLocalCurrentServiceTransition, servicePreservationQuery, exactServiceRows } from "./phase3-current-service-role-contract.mjs";
import { ADDITIONAL_SERVICE_TABLES, additionalAcls, additionalMatrix, additionalBrowserMatrix, additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";

export const ADDITIONAL_FORMAT = "REFLAB_CURRENT_ADDITIONAL_RUNTIME_SERVICE_ROLE_TRANSITION_V1";
export const ADDITIONAL_QUERY_ID = "additional_runtime_columns_browser";
export const ADDITIONAL_PRESERVATION_ID = "additional_runtime_catalog_data_preservation";
export const PRE_EXACT = "ADDITIONAL_RUNTIME_SERVICE_ROLE_PRE_EXECUTABLE_EXACT";
export const POST_EXACT = "ADDITIONAL_RUNTIME_SERVICE_ROLE_ALREADY_INSTALLED_POST";
const names = ADDITIONAL_SERVICE_TABLES.map((t) => `'${t}'`).join(",");
export const additionalInventoryQuery = jsonQuery(ADDITIONAL_QUERY_ID, `(with relations as (
  select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (${names}) and c.relkind in ('r','p'))
  select jsonb_build_object(
    'columns',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',c.relname,'column',a.attname,'rawAcl',a.attacl)
      order by c.relname,a.attnum),'[]'::jsonb) from relations c join pg_attribute a on a.attrelid=c.oid where a.attnum>0 and not a.attisdropped),
    'columnAcls',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',c.relname,'column',a.attname,
      'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'grantor',pg_get_userbyid(x.grantor),
      'privilege',x.privilege_type,'grantable',x.is_grantable) order by c.relname,a.attname,x.grantee,x.grantor,x.privilege_type),'[]'::jsonb)
      from relations c join pg_attribute a on a.attrelid=c.oid cross join lateral aclexplode(a.attacl) x where a.attnum>0 and not a.attisdropped),
    'browser',(select jsonb_agg(jsonb_build_object('schema','public','table',c.relname,'role',r.role,'privilege',p.privilege,
      'granted',has_table_privilege(r.role,c.oid,p.privilege)) order by c.relname,r.role,p.privilege)
      from relations c cross join unnest(array['anon','authenticated']) r(role)
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(privilege))
  ))`);

// Scope is constant repository data. Only aggregate fingerprints leave the database.
const products = ADDITIONAL_SERVICE_TABLES.map((t) => `select '${t}' as table_name,count(*) as row_count,
  md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb)::text) as fingerprint from public.${t} r`).join("\nunion all\n");
export const additionalPreservationQuery = jsonQuery(ADDITIONAL_PRESERVATION_ID, `(select md5(jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) order by c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'acl',(select jsonb_agg(jsonb_build_array(c.oid,a.grantee,a.grantor,a.privilege_type,a.is_grantable) order by c.oid,a.grantee,a.grantor,a.privilege_type)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where n.nspname='public' and c.relkind in ('r','p') and not(c.relname in (${names}) and a.grantee=to_regrole('service_role'))),
  'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull,a.attacl,a.attidentity,a.attgenerated) order by a.attrelid,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and a.attnum>0 and not a.attisdropped),
  'defaults',(select jsonb_agg(jsonb_build_array(d.adrelid,d.adnum,pg_get_expr(d.adbin,d.adrelid)) order by d.adrelid,d.adnum)
    from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proowner,p.proacl) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reflab_private','reflab_audit') and p.prokind in ('f','p')),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'schemas',(select jsonb_agg(jsonb_build_array(oid,nspowner,nspacl) order by oid) from pg_namespace where nspname in ('public','reflab_private','reflab_meta','reflab_audit')),
  'indexes',(select jsonb_agg(jsonb_build_array(i.indexrelid,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) order by i.indexrelid)
    from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'constraints',(select jsonb_agg(to_jsonb(x) order by x.oid) from pg_constraint x join pg_namespace n on n.oid=x.connamespace where n.nspname='public'),
  'triggers',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'roles',(select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r),
  'memberships',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor) from pg_auth_members m),
  'products',(select jsonb_agg(to_jsonb(x) order by table_name) from (${products}) x)
)::text))`);
export const additionalQueries = Object.freeze([installerIdentityQuery, identityBridgePostQuery, corePolicyQuery,
  coreBaselineAdoptionQuery, browserPrivilegeInventoryQuery, serviceRoleInventoryQuery, servicePreservationQuery,
  additionalInventoryQuery, additionalPreservationQuery]);
export const buildAdditionalBatch = () => buildSqlBatch(additionalQueries);
export const buildAdditionalObservation = () => [jsonQuery("read_only_guard", "current_setting('transaction_read_only')"),
  ...additionalQueries].map((q) => q.sql + ";").join("\n");
export const additionalSecurity = () => ADDITIONAL_SERVICE_TABLES.map((table) =>
  ({ schema: "public", table, exists: true, owner: "postgres", rls: true, force: false }));
const securityFields = ["schema", "table", "exists", "owner", "rls", "force"];
const scope = (rows) => rows.filter((r) => ADDITIONAL_SERVICE_TABLES.includes(r.table));
const key = (r) => `${r.table}:${r.privilege}`;

function classify(results, proof, readOnly) {
  const base = { format: ADDITIONAL_FORMAT, executablePre: false, migrationInvocationCount: 0,
    productionDdlAuthorized: false, approval: "NOT_PERFORMED", mutationCount: 0,
    GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE", TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES",
    CURRENT_RUNTIME_USABILITY_NOT_ESTABLISHED: "YES", BROWSER_ADDITIONAL_RUNTIME_ACL_RECONCILIATION: "SEPARATE_NOT_IMPLEMENTED",
    POST_CUTOVER_COACH_BUCKET_TARGET: "SELECT_INSERT_UPDATE_NOT_IMPLEMENTED" };
  if (!(results instanceof Map) || ![SERVICE_FORENSIC_QUERY_ID, ADDITIONAL_QUERY_ID, ADDITIONAL_PRESERVATION_ID, "read_only_guard"].every((id) => results.has(id)))
    return { ...base, classification: "UNKNOWN", failedChecks: [], unknownChecks: ["catalogObservationIncomplete"] };
  try {
    // Verify the actual mode first. Only the old observation-only transport guard is projected.
    const projected = new Map(results); projected.set("read_only_guard", "on");
    const primary = proof ? classifyLocalCurrentServiceTransition(projected, proof) : classifyCurrentServiceTransition(projected);
    const p = results.get(SERVICE_FORENSIC_QUERY_ID), extra = results.get(ADDITIONAL_QUERY_ID);
    const svc = p.roleAttributes.find((r) => r.name === "service_role");
    const expectedRole = { rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
      rolcanlogin: false, rolreplication: false, rolbypassrls: true, rolconnlimit: -1 };
    const checks = { transactionModeExact: results.get("read_only_guard") === (readOnly ? "on" : "off"),
      primaryThirteenPostExact: primary.classification === "ALREADY_INSTALLED_POST" && !primary.failedChecks.length && !primary.unknownChecks.length,
      tableSecurityExact: exactServiceRows(scope(p.tables).map((t) => Object.fromEntries(securityFields.map((f) => [f, t[f]]))), additionalSecurity()),
      serviceRoleAttributesExact: Object.entries(expectedRole).every(([k, v]) => svc?.[k] === v),
      noServiceRoleMembershipSubstitute: p.roleAttributes.every((r) => r.name === "service_role" ||
        !r.serviceRoleInherits && !r.serviceRoleCanSet && !r.serviceRoleMember),
      nonServiceTableAclsExact: exactServiceRows(scope(p.tableAcls).filter((r) => r.grantee !== "service_role"), additionalAcls().filter((r) => r.grantee !== "service_role")),
      browserEffectiveExact: exactServiceRows(extra.browser, additionalBrowserMatrix()),
      columnsCollected: Array.isArray(extra.columns) && Array.isArray(extra.columnAcls) && ADDITIONAL_SERVICE_TABLES.every((t) => extra.columns.some((c) => c.table === t))
        && new Set(extra.columns.map((c) => `${c.table}:${c.column}`)).size === extra.columns.length
        && extra.columns.every((c) => c.schema === "public" && ADDITIONAL_SERVICE_TABLES.includes(c.table) && typeof c.column === "string"),
      preservationCollected: /^[a-f0-9]{32}$/.test(results.get(ADDITIONAL_PRESERVATION_ID)),
    };
    const actual = scope(p.effectiveTablePrivileges), raw = scope(p.tableAcls).filter((r) => r.grantee === "service_role");
    const state = (post) => ({ rawAclExact: exactServiceRows(raw, additionalAcls(post).filter((r) => r.grantee === "service_role")),
      effectiveAclExact: exactServiceRows(actual, additionalMatrix(post)),
      directOriginExact: actual.length === 456 && new Set(actual.map(key)).size === 456 && actual.every((r) => {
        const origins = privilegeOrigins(r, p);
        return r.granted ? origins.length === 1 && origins[0].path === "DIRECT_SERVICE_ROLE_GRANT" && origins[0].grantor === "postgres"
          && origins[0].grantee === "service_role" && !origins[0].grantable && origins[0].scope === "TABLE" : origins.length === 0;
      }) });
    const preChecks = state(false), postChecks = state(true), common = Object.values(checks).every((v) => v === true);
    const pre = common && Object.values(preChecks).every(Boolean), post = common && Object.values(postChecks).every(Boolean);
    return { ...base, classification: pre && !post ? PRE_EXACT : post && !pre ? POST_EXACT : "BLOCKER", executablePre: pre && !post,
      reexecutionRefused: post && !pre, transactionReadOnly: readOnly, checks, preChecks, postChecks, predecessorState: primary,
      failedChecks: [...Object.keys(checks).filter((k) => !checks[k]), ...(!pre && !post ? ["neitherExactPreNorExactPost"] : [])], unknownChecks: [],
      accounting: additionalAccounting(), preservationDigest: results.get(ADDITIONAL_PRESERVATION_ID),
      evidence: proof ? "SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH" : "OBSERVED_PRODUCTION_ADJUDICATED_INPUT" };
  } catch {
    return { ...base, classification: "BLOCKER", failedChecks: ["malformedCatalogEvidence"], unknownChecks: [] };
  }
}
export const classifyAdditionalTransition = (results, { readOnly = true } = {}) => classify(results, null, readOnly);
export function classifyLocalAdditionalTransition(results, proof, { readOnly = true } = {}) {
  if (proof?.fixtureStatus !== "LOCAL_SYNTHETIC_DATA_ONLY") throw new Error("EXPLICIT_LOCAL_PROOF_REQUIRED");
  return classify(results, proof, readOnly);
}
export const additionalPreserved = (before, after) => before instanceof Map && after instanceof Map
  && /^[a-f0-9]{32}$/.test(before.get(ADDITIONAL_PRESERVATION_ID))
  && before.get(ADDITIONAL_PRESERVATION_ID) === after.get(ADDITIONAL_PRESERVATION_ID);
