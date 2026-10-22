import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { corePolicyQuery, isRetiredCorePolicy } from "./phase3-core-policy-contract.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { identityBridgePostQuery } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { coreBaselineAdoptionQuery, classifyCorePolicyBaselineObservation } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CORE_POLICY_PRODUCTION_BASELINE } from "./phase3-core-policy-production-baseline.mjs";

export const BROWSER_FORENSIC_FORMAT = "REFLAB_64249_PRODUCTION_BROWSER_PRIVILEGE_BASELINE_FORENSIC_V1";
export const BROWSER_FORENSIC_QUERY_ID = "phase3_browser_privilege_inventory";
export const BROWSER_FORENSIC_TABLES = Object.freeze([
  "user_profiles", "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions", "attempts", "exam_results",
  "rules_exam_results", "notification_events", "user_global_roles", "user_subscriptions", "referee_exam_sessions",
]);
export const BROWSER_EXTRA_TABLES = Object.freeze(BROWSER_FORENSIC_TABLES.slice(-3));
export const TABLE_PRIVILEGES = Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]);
export const COLUMN_PRIVILEGES = Object.freeze(["SELECT", "INSERT", "UPDATE", "REFERENCES"]);
export const BROWSER_FORENSIC_MUTATIONS = Object.freeze({productDml:0,policyDdl:0,schemaDdl:0,functionDdl:0,
  ledgerWrites:0,schemaStateWrites:0,markerWrites:0,notificationWrites:0,runtimeWrites:0,cutoverWrites:0});
export const BROWSER_ARTIFACT = Object.freeze({
  path: "supabase/migrations/20260901064249_production_adoption_browser_privilege_reconciliation.sql",
  sha256: "4ddd6a1fd30b9508297b3f2819925bca507e1ef8005144f4f02acae6d335f12c",
  purpose: "LOCAL_ARTIFACT_METADATA_ONLY_NOT_DATABASE_AUTHORITY",
});
const list = (values) => values.map((v) => `'${v}'`).join(",");
export const browserPrivilegeInventoryQuery = jsonQuery(BROWSER_FORENSIC_QUERY_ID, `(
  with expected(table_name) as (select unnest(array[${list(BROWSER_FORENSIC_TABLES)}]::text[])),
  relations as (
    select c.* from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (${list(BROWSER_FORENSIC_TABLES)}) and c.relkind in ('r','p')
  ), columns as (
    select c.relname as table_name,c.oid as table_oid,a.* from relations c
    join pg_catalog.pg_attribute a on a.attrelid=c.oid where a.attnum>0 and not a.attisdropped
  ), table_acl as (
    select c.relname as table_name,a.* from relations c
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
  ), column_acl as (
    select c.table_name,c.attname,a.* from columns c cross join lateral pg_catalog.aclexplode(c.attacl) a
  ), policies as (
    select c.relname as table_name,p.* from relations c join pg_catalog.pg_policy p on p.polrelid=c.oid
  )
  select pg_catalog.jsonb_build_object(
    'tables',(select jsonb_agg(jsonb_build_object('schema','public','table',e.table_name,
      'exists',c.oid is not null,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
      'installer_authority',case when c.oid is null then null else
        c.relowner=(select oid from pg_roles where rolname=current_user) or pg_has_role(current_user,c.relowner,'USAGE') end,
      'raw_acl',c.relacl,'acl_origin',case when c.relacl is null then 'DEFAULT_OWNER_ACL' else 'EXPLICIT_ACL' end)
      order by e.table_name) from expected e left join relations c on c.relname=e.table_name),
    'tableAcls',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,
      'grantee',case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end,
      'grantor',pg_get_userbyid(grantor),'privilege',privilege_type,'grantable',is_grantable)
      order by table_name,grantee,grantor,privilege_type),'[]'::jsonb) from table_acl),
    'columnAcls',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,'column',attname,
      'grantee',case when grantee=0 then 'PUBLIC' else pg_get_userbyid(grantee) end,
      'grantor',pg_get_userbyid(grantor),'privilege',privilege_type,'grantable',is_grantable)
      order by table_name,attname,grantee,grantor,privilege_type),'[]'::jsonb) from column_acl),
    'columns',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,'column',attname,
      'raw_acl',attacl) order by table_name,attnum),'[]'::jsonb) from columns),
    'effectiveBrowserPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',c.relname,
      'role',r.rolname,'privilege',p.privilege,'granted',pg_catalog.has_table_privilege(r.oid,c.oid,p.privilege))
      order by c.relname,r.rolname,p.privilege),'[]'::jsonb) from relations c
      cross join pg_catalog.pg_roles r cross join unnest(array[${list(TABLE_PRIVILEGES)}]) p(privilege)
      where r.rolname in ('anon','authenticated')),
    'effectiveBrowserColumnPrivileges',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',c.table_name,
      'column',c.attname,'role',r.rolname,'privilege',p.privilege,
      'granted',pg_catalog.has_column_privilege(r.oid,c.table_oid,c.attnum,p.privilege))
      order by c.table_name,c.attname,r.rolname,p.privilege),'[]'::jsonb) from columns c
      cross join pg_catalog.pg_roles r cross join unnest(array[${list(COLUMN_PRIVILEGES)}]) p(privilege)
      where r.rolname in ('anon','authenticated')),
    'policies',(select coalesce(jsonb_agg(jsonb_build_object('schema','public','table',table_name,'oid',oid,
      'name',polname,'command',case polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
        when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,'permissive',polpermissive,
      'roles',(select jsonb_agg(case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end order by role_oid)
        from unnest(polroles) role_oid),'using',pg_catalog.pg_get_expr(polqual,polrelid,false),
      'withCheck',pg_catalog.pg_get_expr(polwithcheck,polrelid,false)) order by table_name,polname),'[]'::jsonb) from policies),
    'catalogCounts',jsonb_build_object('tableAcls',(select count(*) from table_acl),
      'columnAcls',(select count(*) from column_acl),'columns',(select count(*) from columns),
      'policies',(select count(*) from policies))
  )
)`);
export function buildBrowserPrivilegeForensicBatch() {
  return buildSqlBatch([installerIdentityQuery, identityBridgePostQuery, corePolicyQuery,
    coreBaselineAdoptionQuery, browserPrivilegeInventoryQuery]);
}
const stable = (rows) => [...rows].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const strings = (r,keys) => r && keys.every((k) => typeof r[k] === "string");
const rows = (r,check) => Array.isArray(r) && r.every(check);
const scoped = (r) => r?.schema === "public" && BROWSER_FORENSIC_TABLES.includes(r.table);
const key = (p) => `${p.table}.${p.name}`;
// Conservative expression grammar for the reviewed policies, not a SQL reformatter.
// Quoted token bytes are preserved; unsupported syntax cannot compare as exact.
export function normalizeBrowserPolicyExpression(source) {
  if(typeof source !== "string" || !source.trim() || source.length>65536) return null;
  try {
    const tokens=[];let i=0;
    const add=(kind,value) => tokens.push({kind,value});
    while(i<source.length) {
      if(/\s/.test(source[i])) {i++;continue;}
      const start=i;
      const escaped=/^[eE]'/.test(source.slice(i));
      if(source[i]==="'" || source[i]==='"' || escaped) {
        if(escaped) i++;
        const quote=source[i++];let closed=false;
        while(i<source.length) {
          if(source[i]==="\\") {
            if(!escaped) throw new Error("AMBIGUOUS_ESCAPE");
            i+=2;continue;
          }
          if(source[i]===quote) {
            if(source[i+1]===quote) {i+=2;continue;}
            i++;closed=true;break;
          }
          i++;
        }
        if(!closed) throw new Error("UNTERMINATED_QUOTE");
        add(quote==='"' ? "identifier" : "literal",source.slice(start,i));continue;
      }
      const dollar=source.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];
      if(dollar) {
        const end=source.indexOf(dollar,i+dollar.length);
        if(end<0) throw new Error("UNTERMINATED_DOLLAR_QUOTE");
        i=end+dollar.length;add("literal",source.slice(start,i));continue;
      }
      const word=source.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_$]*/)?.[0];
      if(word) {i+=word.length;add("identifier",word.toLowerCase());continue;}
      const number=source.slice(i).match(/^\d+(?:\.\d+)?/)?.[0];
      if(number) {i+=number.length;add("literal",number);continue;}
      const operator=source.slice(i).match(/^(?:::|<>|!=|<=|>=|[=<>(),.])/)?.[0];
      if(!operator) throw new Error("UNSUPPORTED_SQL_TOKEN");
      i+=operator.length;add("syntax",operator);
    }
    let position=0;let depth=0;
    const at=(value) => tokens[position]?.value===value;
    const consume=(value) => {if(!at(value)) throw new Error("SQL_TOKEN_EXPECTED");position++;};
    function name() {
      if(tokens[position]?.kind!=="identifier") throw new Error("SQL_IDENTIFIER_EXPECTED");
      const parts=[tokens[position++].value];
      while(at(".")) {position++;if(tokens[position]?.kind!=="identifier") throw new Error("SQL_IDENTIFIER_EXPECTED");parts.push(tokens[position++].value);}
      return parts;
    }
    function atom() {
      let node;
      if(at("(")) {position++;node=expression(0);consume(")");}
      else if(tokens[position]?.kind==="literal") node=["literal",tokens[position++].value];
      else {
        const parts=name();node=["name",parts];
        if(at("(")) {
          position++;const args=[];
          if(!at(")")) {args.push(expression(0));while(at(",")) {position++;args.push(expression(0));}}
          consume(")");node=["call",parts,args];
        }
      }
      while(at("::")) {position++;node=["cast",node,name()];}
      return node;
    }
    function expression(minimum) {
      if(++depth>64) throw new Error("SQL_NESTING_LIMIT");
      let left=atom();
      while(position<tokens.length) {
        const op=tokens[position].value;
        const priority=op==="or" ? 1 : op==="and" ? 2 : ["=","<>","!=","<",">","<=",">=","is"].includes(op) ? 3 : 0;
        if(!priority || priority<minimum) break;
        position++;
        if(op==="is") {
          const negated=at("not");if(negated) position++;
          consume("null");left=[negated ? "is_not_null" : "is_null",left];
        } else left=[op,left,expression(priority+1)];
      }
      depth--;return left;
    }
    const tree=expression(0);
    if(position!==tokens.length) return null;
    return JSON.stringify(tree);
  } catch {return null;}
}
export function browserPolicyExpressionsEqual(left,right) {
  if(left===null || right===null) return left===null && right===null;
  const normalized=normalizeBrowserPolicyExpression(left);
  return normalized!==null && normalized===normalizeBrowserPolicyExpression(right);
}
const samePolicy = (a,b) => a?.schema === b.schema && a.table === b.table && a.name === b.name
  && a.command === b.command && a.permissive === b.permissive
  && JSON.stringify([...a.roles].sort()) === JSON.stringify([...b.roles].sort())
  && ["using","withCheck"].every((k) => browserPolicyExpressionsEqual(a[k],b[k]));

export function observeCorePolicyPost(policies) {
  const core = policies.filter((p) => BROWSER_FORENSIC_TABLES.slice(0,10).includes(p.table));
  const canonicalExact = PHASE3_POLICY_MATRIX.every((p) => core.filter((r) => key(r) === key(p)).length === 1
    && samePolicy(core.find((r) => key(r) === key(p)), { ...p, schema: "public", roles: ["authenticated"], permissive: true }));
  const preserved = CORE_POLICY_PRODUCTION_BASELINE.preservedPolicies;
  const preservedExact = preserved.every((p) => core.filter((r) => key(r) === key(p)).length === 1
    && samePolicy(core.find((r) => key(r) === key(p)),p));
  const legacyRemaining = core.filter(isRetiredCorePolicy).length;
  const authenticatedDeletePolicyCount = core.filter((p) => ["ALL","DELETE"].includes(p.command)
    && p.roles.some((r) => ["PUBLIC","authenticated"].includes(r))).length;
  const exact = core.length === 42 && canonicalExact && preservedExact && legacyRemaining === 0 && authenticatedDeletePolicyCount === 0;
  return { comparison: exact ? "EXACT" : "NOT_EXACT", canonicalTargetPolicyCount: core.filter((r) => PHASE3_POLICY_MATRIX.some((p) => key(p) === key(r))).length,
    canonicalPoliciesExact: canonicalExact, preservedNonTargetPoliciesExact: preservedExact,
    preservedNonTargetPolicyCount: core.filter((r) => preserved.some((p) => key(p) === key(r))).length,
    legacyRemaining, authenticatedDeletePolicyCount };
}
// Only collection/target failures block completion. Observed security drift never self-approves.
export function classifyBrowserPrivilegeObservation(results, { targetExact = false } = {}) {
  const core = classifyCorePolicyBaselineObservation(results,{targetExact});
  const p = results instanceof Map ? results.get(BROWSER_FORENSIC_QUERY_ID) : null;
  const acl = (r) => scoped(r) && strings(r,["table","grantee","grantor","privilege"])
    && TABLE_PRIVILEGES.includes(r.privilege) && typeof r.grantable === "boolean";
  const policy = (r) => scoped(r) && strings(r,["table","name","command"]) && Number(r.oid)>0
    && ["SELECT","INSERT","UPDATE","DELETE","ALL"].includes(r.command) && typeof r.permissive === "boolean"
    && rows(r.roles,(v) => typeof v === "string") && r.roles.length>0
    && ["using","withCheck"].every((k) => r[k] === null || typeof r[k] === "string");
  const columnsExact = rows(p?.columns,(r) => scoped(r) && typeof r.column === "string")
    && new Set(p.columns.map((r) => `${r.table}.${r.column}`)).size === p.columns.length;
  const effective = (items,universe,column) => rows(items,(r) => scoped(r) && ["anon","authenticated"].includes(r.role)
    && universe.includes(r.privilege) && typeof r.granted === "boolean" && (!column || typeof r.column === "string"))
    && (column ? columnsExact && p.columns.every((c) => ["anon","authenticated"].every((role) => universe.every((privilege) =>
      items.filter((r) => r.table === c.table && r.column === c.column && r.role === role && r.privilege === privilege).length === 1)))
      && items.length === p.columns.length*2*universe.length
      : BROWSER_FORENSIC_TABLES.every((table) => ["anon","authenticated"].every((role) => universe.every((privilege) =>
        items.filter((r) => r.table === table && r.role === role && r.privilege === privilege).length === 1)))
        && items.length === 13*2*8);
  const checks = { ...core.checks,
    thirteenTablesPresent: rows(p?.tables,(r) => scoped(r) && r.exists === true && typeof r.owner === "string"
      && ["rls","force","installer_authority"].every((k) => typeof r[k] === "boolean")) && p.tables.length === 13
      && BROWSER_FORENSIC_TABLES.every((t) => p.tables.filter((r) => r.table === t).length === 1),
    allTableAclsCollected: rows(p?.tableAcls,acl) && p.tableAcls.length === p.catalogCounts?.tableAcls,
    allColumnAclsCollected: rows(p?.columnAcls,(r) => acl(r) && COLUMN_PRIVILEGES.includes(r.privilege) && typeof r.column === "string")
      && p.columnAcls.length === p.catalogCounts?.columnAcls,
    allPoliciesCollected: rows(p?.policies,policy) && p.policies.length === p.catalogCounts?.policies
      && new Set(p.policies.map(key)).size === p.policies.length,
    allColumnsCollected: columnsExact && p.columns.length === p.catalogCounts?.columns,
    effectiveBrowserMatrixComplete: effective(p?.effectiveBrowserPrivileges,TABLE_PRIVILEGES,false),
    effectiveColumnMatrixComplete: effective(p?.effectiveBrowserColumnPrivileges,COLUMN_PRIVILEGES,true),
  };
  const failedChecks = Object.keys(checks).filter((k) => !checks[k]);
  const tables = Array.isArray(p?.tables) ? stable(p.tables) : [];
  const tableAcls = checks.allTableAclsCollected ? stable(p.tableAcls) : [];
  const columnAcls = checks.allColumnAclsCollected ? stable(p.columnAcls) : [];
  const policies = checks.allPoliciesCollected ? stable(p.policies.map((r) => ({ ...r, roles: [...r.roles].sort(),
    label: PHASE3_POLICY_MATRIX.some((t) => key(t) === key(r)) ? "64245_TARGET_POLICY" :
      isRetiredCorePolicy(r) ? "64245_RETIRED_LEGACY_NAME" : "NON_TARGET" }))) : [];
  const browser = checks.effectiveBrowserMatrixComplete ? stable(p.effectiveBrowserPrivileges) : [];
  const columnBrowser = checks.effectiveColumnMatrixComplete ? stable(p.effectiveBrowserColumnPrivileges) : [];
  return { format: BROWSER_FORENSIC_FORMAT, classification: failedChecks.length ? "BLOCKER" : "OBSERVATION_COMPLETE",
    targetExact: checks.targetExact, transactionReadOnly: checks.transactionReadOnly, checks, failedChecks,
    unknownChecks: failedChecks.filter((k) => /Complete|Collected/.test(k)),
    tables, tableAcls, effectiveBrowserPrivileges: browser, columnAcls, effectiveBrowserColumnPrivileges: columnBrowser,
    columns: columnsExact ? stable(p.columns) : [], policies, catalogCounts: p?.catalogCounts ?? null,
    policyCounts: Object.fromEntries(BROWSER_FORENSIC_TABLES.map((t) => [t,policies.filter((r) => r.table === t).length])),
    extraThreeTables: Object.fromEntries(BROWSER_EXTRA_TABLES.map((t) => [t, {
      tableSecurity: tables.find((r) => r.table === t) ?? null, tableAcls: tableAcls.filter((r) => r.table === t),
      effectiveAnonPrivileges: browser.filter((r) => r.table === t && r.role === "anon"),
      effectiveAuthenticatedPrivileges: browser.filter((r) => r.table === t && r.role === "authenticated"),
      columnAcls: columnAcls.filter((r) => r.table === t), effectiveBrowserColumnPrivileges: columnBrowser.filter((r) => r.table === t),
      policies: policies.filter((r) => r.table === t),
    }])),
    "64236State": core.predecessor64236State,
    "64245PostState": checks.allPoliciesCollected ? observeCorePolicyPost(policies) : { comparison: "INCOMPLETE" },
    adoptionState: core.adoptionState, historicalState: core.historicalState, "64249Artifact": BROWSER_ARTIFACT,
    approval: "NOT_PERFORMED", mutationCount: 0, mutationAccounting: BROWSER_FORENSIC_MUTATIONS,
    BROWSER_ACL_SECURITY_STATUS: "OBSERVED_NOT_ADJUDICATED", GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE",
    SEPARATE_SERVICE_ROLE_PRIVILEGE_WAVE_REQUIRED: "YES", TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES",
    "64253_INDEPENDENT_REVIEW_REQUIRED": "YES",
  };
}
