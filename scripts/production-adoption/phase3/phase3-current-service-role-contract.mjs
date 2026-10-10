import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { browserPrivilegeInventoryQuery, classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { browserExpectedPostAcls, classifyBrowserTransition, classifyLocalBrowserTransition, browserBaselineDigest } from "./phase3-browser-privilege-contract.mjs";
import { serviceRoleInventoryQuery, SERVICE_FORENSIC_QUERY_ID, classifyServiceRoleForensic, classifyLocalServiceRoleForensic } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { SERVICE_TABLES, serviceMatrix, serviceAcl, serviceMutationAccounting } from "./phase3-current-service-role-matrix.mjs";

export const CURRENT_SERVICE_MIGRATION_PATH = "supabase/migrations/20261010041511_production_adoption_current_service_role_privilege_reconciliation.sql";
export const CURRENT_SERVICE_FORMAT = "REFLAB_CURRENT_INSTALLED_SERVICE_ROLE_TRANSITION_V1";
export const PRESERVATION_QUERY_ID = "current_service_catalog_preservation";
const definitions = [
  ["submit_referee_exam", "text, uuid, text, text, text, text, text, integer, integer, integer, integer, jsonb, jsonb", "postgres", "public", "d07e23dfc1a9b1db949c4c3ae9bd26d1"],
  ["consume_coach_rate_limit", "text, text, integer, integer", "postgres", "public", "08ce491d1b3781c6e2eacae6a4279e3c"],
  ["submit_canonical_training_attempt", "text, uuid, jsonb, integer", "reflab_rls_owner", "pg_catalog", "d2fad86f649e013952921a4a7309f4f4"],
  ["submit_canonical_communication_feedback", "text, uuid, text, jsonb", "reflab_rls_owner", "pg_catalog", "0ec8638fac256957f5b6c06dfda714de"],
  ["admin_set_canonical_global_role", "text, text, text, text", "reflab_rls_owner", "pg_catalog", "a8f7835948f90889007a63ed4377ba33"],
  ["admin_set_canonical_user_plan", "text, text, text, text", "reflab_rls_owner", "pg_catalog", "726d2f81d8a74642c5cf98490e4cf19f"],
];
export const CURRENT_FUNCTIONS = Object.freeze([
  ...definitions.map(([name, args, owner, path, sourceHash]) => Object.freeze({name, exists: true,
    signature: `public.${name}(${args})`, owner, language: "plpgsql", security_definer: true,
    volatility: "v", strict: false, leakproof: false, configuration: Object.freeze([`search_path=${path}`]), sourceHash, serviceRoleExecute: true})),
  Object.freeze({name: "accept_canonical_institution_invitation", exists: false}),
]);
export const CURRENT_EXECUTE_ACLS = Object.freeze(CURRENT_FUNCTIONS.filter((f) => f.exists).flatMap((f) =>
  [f.owner, "service_role"].map((grantee) => Object.freeze({signature: f.signature, grantee, grantor: f.owner, privilege: "EXECUTE", grantable: false}))));
const list = SERVICE_TABLES.map((s) => `'${s}'`).join(",");
// Transaction-local catalog fingerprint: no rows, credentials, temp objects, or dynamic SQL.
export const servicePreservationQuery = jsonQuery(PRESERVATION_QUERY_ID, `(select md5(jsonb_build_object(
  'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relkind,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.reloptions) order by c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'acl',(select jsonb_agg(jsonb_build_array(c.oid,a.grantee,a.grantor,a.privilege_type,a.is_grantable) order by c.oid,a.grantee,a.grantor,a.privilege_type)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where n.nspname='public' and c.relkind in ('r','p') and not(c.relname in (${list}) and a.grantee=to_regrole('service_role'))),
  'columns',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attname,a.atttypid,a.attnotnull,a.attacl,a.attidentity,a.attgenerated) order by a.attrelid,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and a.attnum>0 and not a.attisdropped),
  'defaults',(select jsonb_agg(jsonb_build_array(d.adrelid,d.adnum,pg_get_expr(d.adbin,d.adrelid)) order by d.adrelid,d.adnum)
    from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid)) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','reflab_private','reflab_audit') and p.prokind in ('f','p')),
  'functionAcls',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl) order by p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','reflab_private','reflab_audit')),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'schemas',(select jsonb_agg(jsonb_build_array(oid,nspowner,nspacl) order by oid) from pg_namespace where nspname in ('public','reflab_private','reflab_meta','reflab_audit')),
  'indexes',(select jsonb_agg(jsonb_build_array(i.indexrelid,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid)) order by i.indexrelid)
    from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'constraints',(select jsonb_agg(to_jsonb(x) order by x.oid) from pg_constraint x join pg_namespace n on n.oid=x.connamespace where n.nspname='public'),
  'triggers',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'roles',(select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r),
  'memberships',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor) from pg_auth_members m)
)::text))`);
export const buildCurrentServiceBatch = () => buildSqlBatch([installerIdentityQuery, identityBridgePostQuery, corePolicyQuery,
  coreBaselineAdoptionQuery, browserPrivilegeInventoryQuery, serviceRoleInventoryQuery, servicePreservationQuery]);
export const exactServiceRows = (a, b) => Array.isArray(a) && Array.isArray(b) && browserBaselineDigest(a) === browserBaselineDigest(b);
export const currentTableAcls = (post = false) => [...browserExpectedPostAcls().tableAcls.filter((a) => a.grantee !== "service_role"), ...serviceAcl(post)];
export const functionMetadata = (functions, includeHash = true) => functions.map((f) => !f.exists ? {name: f.name, exists: false}
  : Object.fromEntries(Object.keys(CURRENT_FUNCTIONS.find((e) => e.exists)).filter((k) => includeHash || k !== "sourceHash").map((k) => [k, f[k]])));

function classify(results, localProof = null) {
  const boundary = {CURRENT_RUNTIME_USABILITY_NOT_ESTABLISHED: "YES", GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE",
    TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES", ADDITIONAL_RUNTIME_SCOPE: "OBSERVED_NOT_MUTATION_AUTHORIZED",
    "64253_INDEPENDENT_REVIEW_REQUIRED": "YES", productionDdlAuthorized: false};
  if (!(results instanceof Map) || !results.has(SERVICE_FORENSIC_QUERY_ID) || !results.has(PRESERVATION_QUERY_ID))
    return {format: CURRENT_SERVICE_FORMAT, classification: "UNKNOWN", executablePre: false, failedChecks: [],
      unknownChecks: ["catalogObservationIncomplete"], migrationInvocationCount: 0, ...boundary};
  try {
    const service = results.get(SERVICE_FORENSIC_QUERY_ID);
    const browser = classifyBrowserPrivilegeObservation(results, {targetExact: true});
    const forensic = localProof ? classifyLocalServiceRoleForensic(results, {targetExact: true}, localProof) : classifyServiceRoleForensic(results, {targetExact: true});
    // The completed browser contract predates this service-only wave. Verify its exact
    // non-service state while restoring ONLY its old service ACL expectation in a copy.
    const projection = {...browser, tableAcls: [...browser.tableAcls.filter((a) => a.grantee !== "service_role"), ...serviceAcl()]};
    const prior = localProof ? classifyLocalBrowserTransition(projection, localProof) : classifyBrowserTransition(projection);
    const expectedFunctions = CURRENT_FUNCTIONS.map((f) => f.exists && localProof ? {...f, sourceHash: localProof.functionHashes?.[f.signature]} : f);
    const checks = {
      observationComplete: Object.entries(forensic.checks).every(([k, v]) => k === "protected64249PostExact" || v === true),
      browser64249PreservedExact: prior.classification === "64249_ALREADY_INSTALLED_POST",
      identity64236Exact: prior.checks.identity64236Exact === true, core64245Exact: prior.checks.core64245Exact === true,
      historicalExact: prior.checks.historicalExact === true, adoptionExact: prior.checks.adoptionExact === true,
      tableSecurityExact: prior.checks.tableSecurityExact === true, policiesExact: prior.checks.policyCatalogExact === true,
      columnsExact: prior.checks.columnsExact === true, browserColumnExact: prior.postChecks.rawColumnAclExact && prior.postChecks.effectiveColumnAclExact,
      bypassRlsExact: service.roleAttributes.find((r) => r.name === "service_role")?.rolbypassrls === true,
      functionsExact: exactServiceRows(functionMetadata(service.relevantFunctions), expectedFunctions),
      functionExecuteExact: exactServiceRows(service.functionExecuteAcls, CURRENT_EXECUTE_ACLS),
      preservationCollected: /^[a-f0-9]{32}$/.test(results.get(PRESERVATION_QUERY_ID)),
    };
    const stateChecks = (post) => ({rawAclExact: exactServiceRows(browser.tableAcls, currentTableAcls(post)),
      effectiveAclExact: exactServiceRows(service.effectiveTablePrivileges.filter((r) => SERVICE_TABLES.includes(r.table)), serviceMatrix(post)),
      directOriginExact: forensic.primaryEffectiveServiceRolePrivileges.length === 104 && forensic.primaryEffectiveServiceRolePrivileges.every((r) =>
        r.granted ? r.origins.length === 1 && r.origins[0].path === "DIRECT_SERVICE_ROLE_GRANT" && r.origins[0].grantor === "postgres"
          && !r.origins[0].grantable && r.origins[0].scope === "TABLE" : r.origins.length === 0),
      effectiveColumnsExact: exactServiceRows(service.effectiveColumnPrivileges, service.columns.flatMap(({table, column}) =>
        ["SELECT", "INSERT", "UPDATE", "REFERENCES"].map((privilege) => ({schema: "public", table, column, role: "service_role", privilege,
          granted: serviceMatrix(post).some((r) => r.table === table && r.privilege === privilege && r.granted)})))),
    });
    const preChecks = stateChecks(false), postChecks = stateChecks(true);
    const common = Object.values(checks).every(Boolean), pre = common && Object.values(preChecks).every(Boolean), post = common && Object.values(postChecks).every(Boolean);
    return {format: CURRENT_SERVICE_FORMAT, classification: pre ? "PRE_EXECUTABLE_EXACT" : post ? "ALREADY_INSTALLED_POST" : "BLOCKER",
      executablePre: pre, reexecutionRefused: post, migrationInvocationCount: 0, checks, preChecks, postChecks,
      failedChecks: [...Object.keys(checks).filter((k) => !checks[k]), ...(!pre && !post ? ["neitherExactPreNorExactPost"] : [])], unknownChecks: [],
      accounting: serviceMutationAccounting(), evidence: localProof ? "LOCAL_SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH" : "OBSERVED_PRODUCTION_ADJUDICATED_INPUT",
      preservationDigest: results.get(PRESERVATION_QUERY_ID), ...boundary};
  } catch {
    return {format: CURRENT_SERVICE_FORMAT, classification: "BLOCKER", executablePre: false, migrationInvocationCount: 0,
      failedChecks: ["malformedCatalogEvidence"], unknownChecks: [], ...boundary};
  }
}
export const classifyCurrentServiceTransition = (results) => classify(results);
export function classifyLocalCurrentServiceTransition(results, proof) {
  if (proof?.fixtureStatus !== "LOCAL_SYNTHETIC_DATA_ONLY" || !CURRENT_FUNCTIONS.filter((f) => f.exists)
    .every((f) => /^[a-f0-9]{32}$/.test(proof.functionHashes?.[f.signature] ?? ""))) throw new Error("EXPLICIT_LOCAL_SYNTHETIC_PROOF_REQUIRED");
  return classify(results, proof);
}
export const serviceTransitionPreserved = (before, after) => before instanceof Map && after instanceof Map
  && before.get(PRESERVATION_QUERY_ID) === after.get(PRESERVATION_QUERY_ID)
  && before.get(PRESERVATION_QUERY_ID) !== undefined;
