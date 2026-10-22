import { createHash } from "node:crypto";
import { BROWSER_TRANSITION_BASELINE as baseline, BROWSER_TRANSITION_BASELINE_DIGEST } from "./phase3-browser-privilege-production-baseline.mjs";
import { buildBrowserPrivilegeForensicBatch, classifyBrowserPrivilegeObservation, normalizeBrowserPolicyExpression } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS, browserPostPrivileges, browserPrePrivileges } from "./phase3-browser-privilege-matrix.mjs";

export { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS };
export const BROWSER_MIGRATION_PATH = "supabase/migrations/20260901064249_production_adoption_browser_privilege_reconciliation.sql";
export const BROWSER_MIGRATION_SHA = "4ddd6a1fd30b9508297b3f2819925bca507e1ef8005144f4f02acae6d335f12c";
export const BROWSER_TRANSITION_FORMAT = "REFLAB_64249_CURRENT_LINEAGE_TRANSITION_V1";
export const buildBrowserTransitionBatch = buildBrowserPrivilegeForensicBatch;
export const canonicalBrowserBaseline = (v) => Array.isArray(v) ? v.map(canonicalBrowserBaseline).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en"))
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonicalBrowserBaseline(v[k])])) : v;
export const browserBaselineDigest = (v) => createHash("sha256").update(JSON.stringify(canonicalBrowserBaseline(v))).digest("hex");
const equal = (a,b) => a !== undefined && b !== undefined && JSON.stringify(canonicalBrowserBaseline(a)) === JSON.stringify(canonicalBrowserBaseline(b));
const pick = (v,fields) => Object.fromEntries(fields.map((k) => [k,v?.[k]]));
export const expandBrowserBaselineAcls = (b = baseline) => b.tableAcl.flatMap(({privileges,...row}) => privileges.map((privilege) => ({...row,privilege})));
export function browserExpectedPostAcls(b = baseline) {
  const tableAcls = expandBrowserBaselineAcls(b).filter((a) => !["anon","authenticated"].includes(a.grantee));
  for(const table of BROWSER_TABLES) for(const privilege of browserPostPrivileges(table,"authenticated"))
    tableAcls.push({schema:"public",table,grantee:"authenticated",grantor:"postgres",privilege,grantable:false});
  const columnAcls = structuredClone(b.columnAcls);
  for(const [privilege,columns] of [["INSERT",PROFILE_INSERT_COLUMNS],["UPDATE",PROFILE_UPDATE_COLUMNS]])
    for(const column of columns) columnAcls.push({schema:"public",table:"user_profiles",column,grantee:"authenticated",grantor:"postgres",privilege,grantable:false});
  return {tableAcls,columnAcls};
}
export function browserMutationAccounting(b = baseline) {
  const before=expandBrowserBaselineAcls(b),after=browserExpectedPostAcls(b);
  const removed=before.filter((a) => !after.tableAcls.some((v) => equal(a,v)));
  const added=after.tableAcls.filter((a) => !before.some((v) => equal(a,v)));
  const columnsAdded=after.columnAcls.filter((a) => !b.columnAcls.some((v) => equal(a,v)));
  return {tableRevokes:removed,tableGrants:added,columnGrants:columnsAdded,tableRevokeCount:removed.length,
    tableGrantCount:added.length,columnGrantCount:columnsAdded.length,serviceRoleMutations:0,policyMutations:0,
    functionMutations:0,productDml:0,adoptionWrites:0,runtimeWrites:0};
}
export function validateBrowserBaseline(b = baseline) {
  try {return b?.format === "REFLAB_64249_ADJUDICATED_TRANSITION_BASELINE_V1" && b.version === 1
    && b.project === "nagjddldrldwavmfaytc" && browserBaselineDigest(b) === BROWSER_TRANSITION_BASELINE_DIGEST;} catch {return false;}
}
function policiesEqual(actual,expected) {
  const clean = (policies) => policies.map((p) => ({...pick(p,["schema","table","name","command","permissive","roles"]),
    using:p.using === null ? null : normalizeBrowserPolicyExpression(p.using),
    withCheck:p.withCheck === null ? null : normalizeBrowserPolicyExpression(p.withCheck)}));
  return Array.isArray(actual) && actual.every((p) => ["using","withCheck"].every((k) => p[k] === null || normalizeBrowserPolicyExpression(p[k]) !== null))
    && equal(clean(actual),clean(expected));
}
const columns = (b) => Object.entries(b.columns).flatMap(([table,names]) => names.map((column) => ({schema:"public",table,column})));
function effectiveTablesExact(rows,post) {
  return Array.isArray(rows) && rows.length === 208 && BROWSER_TABLES.every((table) => ["anon","authenticated"].every((role) => PG17_TABLE_PRIVILEGES.every((privilege) => {
    const matches=rows.filter((r) => r.schema === "public" && r.table === table && r.role === role && r.privilege === privilege);
    return matches.length === 1 && matches[0].granted === (post ? browserPostPrivileges : browserPrePrivileges)(table,role).includes(privilege);
  })));
}
function effectiveColumnsExact(rows,post,b) {
  const all=columns(b),universe=["SELECT","INSERT","UPDATE","REFERENCES"];
  return Array.isArray(rows) && rows.length === all.length*8 && all.every(({table,column}) => ["anon","authenticated"].every((role) => universe.every((privilege) => {
    const matches=rows.filter((r) => r.schema === "public" && r.table === table && r.column === column && r.role === role && r.privilege === privilege);
    const granted=post ? browserPostPrivileges(table,role).includes(privilege) || role === "authenticated" && table === "user_profiles"
      && (privilege === "INSERT" ? PROFILE_INSERT_COLUMNS : privilege === "UPDATE" ? PROFILE_UPDATE_COLUMNS : []).includes(column)
      : b.effectiveColumnGranted.some((g) => g.table === table && g.role === role && g.privilege === privilege && g.columns.includes(column));
    return matches.length === 1 && matches[0].granted === granted;
  })));
}
function cleanIdentity(v) {
  return {...v,functions:v?.functions?.map(({proacl: _acl,...f}) => {void _acl;return f;})};
}
function classifyTransition(observation, localSyntheticHistorical = null) {
  const b=baseline,postAcls=browserExpectedPostAcls();
  const historical=localSyntheticHistorical?.fixtureStatus === "LOCAL_SYNTHETIC_DATA_ONLY" ? {...b.historical,
    productFingerprint:localSyntheticHistorical.state.productFingerprint,protectedObjectsHash:localSyntheticHistorical.state.protectedObjectsHash} : b.historical;
  const checks={baselineExact:validateBrowserBaseline(),collectionExact:observation?.classification === "OBSERVATION_COMPLETE"
      && observation.targetExact === true && observation.transactionReadOnly === true && observation.failedChecks?.length === 0 && observation.unknownChecks?.length === 0,
    tableSecurityExact:equal(observation?.tables?.map((t) => pick(t,["schema","table","exists","owner","rls","force","installer_authority"])),b.tables),
    columnsExact:equal(observation?.columns?.map((c) => pick(c,["schema","table","column"])),columns(b)),
    policyCatalogExact:policiesEqual(observation?.policies,b.policies),
    identity64236Exact:observation?.["64236State"]?.comparison === "EXACT" && equal(cleanIdentity(observation?.["64236State"]),b.identity),
    core64245Exact:observation?.["64245PostState"]?.comparison === "EXACT",
    adoptionExact:equal(observation?.adoptionState,b.adoption),historicalExact:equal(observation?.historicalState,historical)};
  const pre={rawTableAclExact:equal(observation?.tableAcls,expandBrowserBaselineAcls()),rawColumnAclExact:equal(observation?.columnAcls,b.columnAcls),
    effectiveTableAclExact:effectiveTablesExact(observation?.effectiveBrowserPrivileges,false),effectiveColumnAclExact:effectiveColumnsExact(observation?.effectiveBrowserColumnPrivileges,false,b)};
  const post={rawTableAclExact:equal(observation?.tableAcls,postAcls.tableAcls),rawColumnAclExact:equal(observation?.columnAcls,postAcls.columnAcls),
    effectiveTableAclExact:effectiveTablesExact(observation?.effectiveBrowserPrivileges,true),effectiveColumnAclExact:effectiveColumnsExact(observation?.effectiveBrowserColumnPrivileges,true,b)};
  const common=Object.values(checks).every(Boolean),preExact=common&&Object.values(pre).every(Boolean),postExact=common&&Object.values(post).every(Boolean);
  return {format:BROWSER_TRANSITION_FORMAT,classification:preExact ? "64249_PRE_EXECUTABLE_EXACT" : postExact ? "64249_ALREADY_INSTALLED_POST" : "BLOCKER",
    executablePre:preExact,checks,preChecks:pre,postChecks:post,failedChecks:[...Object.keys(checks).filter((k) => !checks[k]),
      ...(!preExact && !postExact ? Object.keys(pre).filter((k) => !pre[k]).map((k) => `pre.${k}`) : [])],
    unknownChecks:[],baselineDigest:BROWSER_TRANSITION_BASELINE_DIGEST,historicalEvidence:localSyntheticHistorical ? "LOCAL_SYNTHETIC_DATA_ONLY" : "PINNED_PRODUCTION_EVIDENCE",
    REFEREE_EXAM_SESSIONS_AUTH_SELECT_POLICY:"ABSENT_EXPECTED_AT_64249",REFEREE_EXAM_SESSIONS_BROWSER_READ_USABLE:"NO",
    BROWSER_PRIVILEGE_RECONCILIATION_COMPLETE:postExact ? "YES" : "NO",
    GLOBAL_TABLE_ACL_RECONCILIATION:"INCOMPLETE",SEPARATE_SERVICE_ROLE_PRIVILEGE_WAVE_REQUIRED:"YES",
    TABLE_ACL_RECONCILIATION_STILL_REQUIRED:"YES",RUNTIME_ENABLEMENT_BLOCKED_BY_FINAL_PRIVILEGE_WAVE:"YES",
    "64253_INDEPENDENT_REVIEW_REQUIRED":"YES",scope:"BROWSER_PRIVILEGE_RECONCILIATION_ONLY"};
}
// Production classifier has no baseline override and never consumes local fixture hashes.
export const classifyBrowserTransition = (observation) => classifyTransition(observation);
export function classifyLocalBrowserTransition(observation, proof) {
  if(proof?.fixtureStatus !== "LOCAL_SYNTHETIC_DATA_ONLY" || ![proof.state?.productFingerprint,proof.state?.protectedObjectsHash].every((s) => /^[a-f0-9]{32}$/.test(s ?? "")))
    throw new Error("LOCAL_SYNTHETIC_HISTORICAL_PROOF_REQUIRED");
  return classifyTransition(observation,proof);
}
export function browserTransitionGate(observation) {
  const result=classifyBrowserTransition(observation);
  return {...result,migrationInvocationCount:0,reexecutionRefused:result.classification === "64249_ALREADY_INSTALLED_POST"};
}
export const observeBrowserTransitionResults = (results) => classifyBrowserPrivilegeObservation(results,{targetExact:true});
