import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserPrivilegeInventoryQuery } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { corePolicyQuery } from "./phase3-core-policy-contract.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { coreBaselineAdoptionQuery } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS, browserPostPrivileges, ANON_PRE_TABLES } from "./phase3-browser-privilege-matrix.mjs";
import { browserExpectedPostAcls, expandBrowserBaselineAcls } from "./phase3-browser-privilege-contract.mjs";

const json = (v) => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const literal = (s) => `'${s.replaceAll("'", "''")}'`;
const array = (v) => `array[${v.map(literal).join(",")}]::text[]`;
const sort = (expression) => `(select coalesce(jsonb_agg(v order by v::text),'[]'::jsonb) from jsonb_array_elements(${expression}) v)`;
const profile = (privilege) => privilege === "INSERT" ? PROFILE_INSERT_COLUMNS : PROFILE_UPDATE_COLUMNS;
const tablePostPredicate = `(r->>'role'='authenticated' and (r->>'privilege'='SELECT' or (r->>'table'=any(${array(BROWSER_TABLES.slice(1,6))}) and r->>'privilege'=any(array['INSERT','UPDATE']))))`;
const columnPostPredicate = `(${tablePostPredicate} or (r->>'role'='authenticated' and r->>'table'='user_profiles' and
  ((r->>'privilege'='INSERT' and r->>'column'=any(${array(PROFILE_INSERT_COLUMNS)})) or
   (r->>'privilege'='UPDATE' and r->>'column'=any(${array(PROFILE_UPDATE_COLUMNS)})))))`;
const boundarySnapshot = `jsonb_build_object('core',(${corePolicyQuery.payloadSql}) - 'table_acl' - 'column_acl',
  'identity',${identityBridgePostQuery.payloadSql},'adoption',${coreBaselineAdoptionQuery.payloadSql})`;
export function buildCorrectedBrowserMigration() {
  const preAcl=expandBrowserBaselineAcls(),postAcl=browserExpectedPostAcls();
  const tableSecurity=baseline.tables;
  const approvedColumns=Object.entries(baseline.columns).flatMap(([table,names]) => names.map((column) => ({schema:"public",table,column})));
  const mutations=[];
  for(const table of ANON_PRE_TABLES) mutations.push(`revoke ${PG17_TABLE_PRIVILEGES.join(", ").toLowerCase()} on table public.${table} from anon;`);
  for(const table of BROWSER_TABLES.filter((t) => t !== "referee_exam_sessions")) {
    const remove=PG17_TABLE_PRIVILEGES.filter((p) => !browserPostPrivileges(table,"authenticated").includes(p));
    mutations.push(`revoke ${remove.join(", ").toLowerCase()} on table public.${table} from authenticated;`);
  }
  mutations.push("grant select on table public.referee_exam_sessions to authenticated;");
  for(const privilege of ["INSERT","UPDATE"]) mutations.push(`grant ${privilege.toLowerCase()} (${profile(privilege).join(", ")}) on table public.user_profiles to authenticated;`);
  return `-- 64249: browser-only current-lineage transition. Service-role reconciliation remains mandatory.
-- Generated catalog pins from the completed READ ONLY forensic; no row data is embedded.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
do $browser_transition$
declare
  inventory jsonb;
  preservation jsonb;
  security_catalog jsonb;
  identity_state jsonb;
  adoption_state jsonb;
begin
  if current_user <> 'postgres' then raise exception 'Managed postgres installer required' using errcode='55000'; end if;
  select ${browserPrivilegeInventoryQuery.payloadSql} into inventory;
  if ${sort("(select jsonb_agg(v - 'raw_acl' - 'acl_origin') from jsonb_array_elements(inventory->'tables') v)")}
       <> ${sort(json(tableSecurity))}
     or ${sort("(select jsonb_agg(v - 'raw_acl') from jsonb_array_elements(inventory->'columns') v)")}
       <> ${sort(json(approvedColumns))}
     or ${sort("inventory->'tableAcls'")} <> ${sort(json(preAcl))}
     or ${sort("inventory->'columnAcls'")} <> ${sort(json(baseline.columnAcls))}
     or ${sort("(select jsonb_agg(v - 'oid') from jsonb_array_elements(inventory->'policies') v)")}
       <> ${sort(json(baseline.policies))} then
    raise exception '64249 exact observed catalog PRE required; installed POST is not executable' using errcode='55000';
  end if;
  if exists(select 1 from jsonb_array_elements(inventory->'effectiveBrowserPrivileges') r where
    (r->>'granted')::boolean <> case when r->>'role'='anon' then r->>'table'=any(${array(ANON_PRE_TABLES)})
      else r->>'table'<>'referee_exam_sessions' end) then
    raise exception '64249 effective PRE privilege drift' using errcode='55000';
  end if;
  if exists(select 1 from jsonb_array_elements(inventory->'effectiveBrowserColumnPrivileges') r where (r->>'granted')::boolean <>
    exists(select 1 from jsonb_array_elements(${json(baseline.effectiveColumnGranted)}) g where g->>'table'=r->>'table'
      and g->>'role'=r->>'role' and g->>'privilege'=r->>'privilege' and (g->'columns') ? (r->>'column'))) then
    raise exception '64249 effective PRE column privilege drift' using errcode='55000';
  end if;
  security_catalog := jsonb_build_object('tables',(select jsonb_agg(v - 'raw_acl' - 'acl_origin') from jsonb_array_elements(inventory->'tables') v),
    'columns',(select jsonb_agg(v - 'raw_acl') from jsonb_array_elements(inventory->'columns') v),'policies',inventory->'policies');
  select ${identityBridgePostQuery.payloadSql} into identity_state;
  select ${coreBaselineAdoptionQuery.payloadSql} into adoption_state;
  if ${sort("(select jsonb_agg(v - 'proacl') from jsonb_array_elements(identity_state->'functions') v)")}
      <> ${sort(json(baseline.identity.functions))}
    or ${sort("identity_state->'acl'")} <> ${sort(json(baseline.identity.executeAcl))}
    or ${sort("adoption_state->'schemaCreatePrivileges'")} <> ${sort(json(baseline.identity.schemaCreatePrivileges))}
    or identity_state->'rls_owner_create' <> 'false'::jsonb
    or adoption_state->'historicalCounts' <> ${json(baseline.historical.counts)}
    or ${sort("adoption_state->'ledgerRows'")} <> ${sort(json(baseline.adoption.ledgerRows))}
    or adoption_state->'schemaStateRows' <> '[]'::jsonb
    or adoption_state->'canonicalMarkerAbsent' <> 'true'::jsonb
    or adoption_state->'developmentObjects' <> ${json(baseline.adoption.developmentObjects)} then
    raise exception '64236, adoption or historical predecessor drift' using errcode='55000';
  end if;
  select ${boundarySnapshot} into preservation;
  if preservation->'core'->'runtimeDisabled' <> 'true'::jsonb or preservation->'core'->'phase4Absent' <> 'true'::jsonb
    or preservation->'core'->'cutoverAbsent' <> 'true'::jsonb then
    raise exception '64249 disabled boundary required' using errcode='55000';
  end if;

  -- Only these explicit browser ACL mutations are authorized.
  ${mutations.join("\n  ")}

  select ${browserPrivilegeInventoryQuery.payloadSql} into inventory;
  if security_catalog is distinct from jsonb_build_object('tables',(select jsonb_agg(v - 'raw_acl' - 'acl_origin') from jsonb_array_elements(inventory->'tables') v),
    'columns',(select jsonb_agg(v - 'raw_acl') from jsonb_array_elements(inventory->'columns') v),'policies',inventory->'policies') then
    raise exception '64249 thirteen-table catalog preservation failure' using errcode='55000';
  end if;
  if ${sort("inventory->'tableAcls'")} <> ${sort(json(postAcl.tableAcls))}
    or ${sort("inventory->'columnAcls'")} <> ${sort(json(postAcl.columnAcls))}
    or exists(select 1 from jsonb_array_elements(inventory->'effectiveBrowserPrivileges') r where (r->>'granted')::boolean <> ${tablePostPredicate})
    or exists(select 1 from jsonb_array_elements(inventory->'effectiveBrowserColumnPrivileges') r where (r->>'granted')::boolean <> ${columnPostPredicate}) then
    raise exception '64249 exact browser POST ACL required' using errcode='55000';
  end if;
  if preservation is distinct from ${boundarySnapshot} then
    raise exception '64249 preservation failure' using errcode='55000';
  end if;
  -- referee_exam_sessions SELECT ACL is intentionally inert: its authenticated policy is absent.
  -- Historical INSERT policies stay defined, but browser INSERT authority is now absent.
end
$browser_transition$;
commit;
`;
}
