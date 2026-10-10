import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserExpectedPostAcls } from "./phase3-browser-privilege-contract.mjs";
import { browserPrivilegeInventoryQuery } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { serviceRoleInventoryQuery } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CURRENT_FUNCTIONS, CURRENT_EXECUTE_ACLS, functionMetadata, currentTableAcls, servicePreservationQuery } from "./phase3-current-service-role-contract.mjs";
import { serviceMatrix, serviceMutationAccounting, SERVICE_TABLES } from "./phase3-current-service-role-matrix.mjs";

const json = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const sort = (v) => `(select coalesce(jsonb_agg(x order by x::text),'[]'::jsonb) from jsonb_array_elements(${v}) x)`;
const stripped = (v, fields) => `(select jsonb_agg(x ${fields.map((f) => `- '${f}'`).join(" ")}) from jsonb_array_elements(${v}) x)`;
const primary = SERVICE_TABLES.map((t) => `'${t}'`).join(",");
const scope = (v) => `(select jsonb_agg(x) from jsonb_array_elements(${v}) x where x->>'table' in (${primary}))`;
const columns = Object.entries(baseline.columns).flatMap(([table, names]) => names.map((column) => ({schema: "public", table, column})));
const functions = (v) => `(select jsonb_agg(case when (x->>'exists')::boolean then x - 'rawAcl' - 'sourceHash'
  else jsonb_build_object('name',x->'name','exists',false) end) from jsonb_array_elements(${v}) x)`;
const security = (v) => `jsonb_build_object('tables',${stripped(`${v}->'tables'`, ["raw_acl", "acl_origin"])},
  'columns',${stripped(`${v}->'columns'`, ["raw_acl"])},'columnAcls',${v}->'columnAcls','policies',${v}->'policies',
  'browser',${v}->'effectiveBrowserPrivileges','browserColumns',${v}->'effectiveBrowserColumnPrivileges')`;
const boundary = `jsonb_build_object('core',(${corePolicyQuery.payloadSql}) - 'table_acl',
  'identity',${identityBridgePostQuery.payloadSql},'adoption',${coreBaselineAdoptionQuery.payloadSql})`;

export function buildCurrentServiceMigration() {
  return `-- Current-installed service_role ACL hardening only. Production execution is NOT authorized.
-- External exact classifier also pins real Production function/data fingerprints.
-- Future canonical exam INSERT/INSERT/UPDATE privileges are deliberately excluded.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $current_service_transition$
declare
  browser jsonb;
  service jsonb;
  identity_state jsonb;
  adoption_state jsonb;
  catalog_before text;
  browser_before jsonb;
  boundary_before jsonb;
begin
  if current_user <> 'postgres' or current_setting('server_version_num')::integer not between 170000 and 179999 then
    raise exception 'Managed postgres on PG17 required' using errcode='55000';
  end if;
  select ${browserPrivilegeInventoryQuery.payloadSql} into browser;
  select ${serviceRoleInventoryQuery.payloadSql} into service;
  if ${sort("browser->'tableAcls'")} is distinct from ${sort(json(currentTableAcls()))}
    or ${sort("browser->'columnAcls'")} is distinct from ${sort(json(browserExpectedPostAcls().columnAcls))}
    or ${sort(stripped("browser->'tables'", ["raw_acl", "acl_origin"]))} is distinct from ${sort(json(baseline.tables))}
    or ${sort(stripped("browser->'columns'", ["raw_acl"]))} is distinct from ${sort(json(columns))}
    or ${sort(stripped("browser->'policies'", ["oid"]))} is distinct from ${sort(json(baseline.policies))}
    or ${sort(scope("service->'effectiveTablePrivileges'"))} is distinct from ${sort(json(serviceMatrix()))}
    or ${sort(scope("service->'tableAcls'"))} is distinct from ${sort(json(currentTableAcls()))}
    or (select count(*)<>1 or bool_and((x->>'rolbypassrls')::boolean) is distinct from true
      from jsonb_array_elements(service->'roleAttributes') x where x->>'name'='service_role') then
    raise exception 'Exact service_role observed PRE required; installed POST and hybrids refused' using errcode='55000';
  end if;
  if exists(select 1 from jsonb_array_elements(service->'tableAcls') a where a->>'table' in (${primary})
    and a->>'grantee'<>'service_role' and case when a->>'grantee'='PUBLIC' then true
      else pg_has_role('service_role',a->>'grantee','USAGE') end)
    or ${sort(functions("service->'relevantFunctions'"))} is distinct from ${sort(json(functionMetadata(CURRENT_FUNCTIONS, false)))}
    or ${sort("service->'functionExecuteAcls'")} is distinct from ${sort(json(CURRENT_EXECUTE_ACLS))} then
    raise exception 'Unexpected privilege origin or current installed RPC identity/EXECUTE drift' using errcode='55000';
  end if;
  select ${identityBridgePostQuery.payloadSql} into identity_state;
  select ${coreBaselineAdoptionQuery.payloadSql} into adoption_state;
  if ${sort(stripped("identity_state->'functions'", ["proacl"]))} is distinct from ${sort(json(baseline.identity.functions))}
    or ${sort("identity_state->'acl'")} is distinct from ${sort(json(baseline.identity.executeAcl))}
    or identity_state->'rls_owner_create' is distinct from 'false'::jsonb
    or ${sort("adoption_state->'schemaCreatePrivileges'")} is distinct from ${sort(json(baseline.identity.schemaCreatePrivileges))}
    or ${sort("adoption_state->'ledgerRows'")} is distinct from ${sort(json(baseline.adoption.ledgerRows))}
    or adoption_state->'schemaStateRows' is distinct from '[]'::jsonb
    or adoption_state->'canonicalMarkerAbsent' is distinct from 'true'::jsonb
    or adoption_state->'developmentObjects' is distinct from ${json(baseline.adoption.developmentObjects)}
    or adoption_state->'historicalCounts' is distinct from ${json(baseline.historical.counts)} then
    raise exception 'Identity, adoption or historical PRE drift' using errcode='55000';
  end if;
  select ${boundary} into boundary_before;
  if boundary_before->'core'->'runtimeDisabled' is distinct from 'true'::jsonb
    or boundary_before->'core'->'cutoverAbsent' is distinct from 'true'::jsonb
    or boundary_before->'core'->'phase4Absent' is distinct from 'true'::jsonb then
    raise exception 'Disabled runtime/cutover/Phase4 boundary required' using errcode='55000';
  end if;
  browser_before := ${security("browser")};
  select ${servicePreservationQuery.payloadSql} into catalog_before;

  -- BEGIN AUTHORIZED SERVICE TABLE ACL STATEMENTS
  ${serviceMutationAccounting().statements.join("\n  ")}
  -- END AUTHORIZED SERVICE TABLE ACL STATEMENTS

  select ${browserPrivilegeInventoryQuery.payloadSql} into browser;
  select ${serviceRoleInventoryQuery.payloadSql} into service;
  if ${sort("browser->'tableAcls'")} is distinct from ${sort(json(currentTableAcls(true)))}
    or ${sort(scope("service->'tableAcls'"))} is distinct from ${sort(json(currentTableAcls(true)))}
    or ${sort(scope("service->'effectiveTablePrivileges'"))} is distinct from ${sort(json(serviceMatrix(true)))} then
    raise exception 'Exact current-installed service_role POST required' using errcode='55000';
  end if;
  if browser_before is distinct from ${security("browser")}
    or catalog_before is distinct from ${servicePreservationQuery.payloadSql}
    or boundary_before is distinct from ${boundary} then
    raise exception 'Protected browser/function/additional catalog/data/boundary preservation failed' using errcode='55000';
  end if;
end
$current_service_transition$;
commit;
`;
}
// Artifact is generated once locally. Future execution must consume pinned artifact bytes,
// not call this source builder or reconstruct SQL from live catalog contents.
export function currentServiceMutationBody(sql) {
  const start = "  -- BEGIN AUTHORIZED SERVICE TABLE ACL STATEMENTS\n", end = "  -- END AUTHORIZED SERVICE TABLE ACL STATEMENTS";
  if (sql.split(start).length !== 2 || sql.split(end).length !== 2) throw new Error("MUTATION_BOUNDARY_AMBIGUOUS");
  return sql.slice(sql.indexOf(start) + start.length, sql.indexOf(end));
}
