import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { BROWSER_TRANSITION_BASELINE as baseline, BROWSER_TRANSITION_BASELINE_DIGEST } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserLineageObservation } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { classifyBrowserTransition, classifyLocalBrowserTransition, browserTransitionGate, browserBaselineDigest, validateBrowserBaseline, browserMutationAccounting,
  browserExpectedPostAcls, BROWSER_MIGRATION_PATH, BROWSER_MIGRATION_SHA, BROWSER_TABLES, PG17_TABLE_PRIVILEGES, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS } from "./phase3-browser-privilege-contract.mjs";
import { buildCorrectedBrowserMigration } from "./phase3-browser-privilege-migration-source.mjs";

const root=new URL("../../../",import.meta.url);
const sql=readFileSync(new URL(BROWSER_MIGRATION_PATH,root),"utf8").replaceAll("\r\n","\n");
export const browserNegativeCases = [
  ["anon effective drift",(o) => {o.effectiveBrowserPrivileges.find((r) => r.role==="anon").granted=!o.effectiveBrowserPrivileges.find((r) => r.role==="anon").granted;}],
  ["authenticated effective drift",(o) => {o.effectiveBrowserPrivileges.find((r) => r.role==="authenticated").granted=false;}],
  ["MAINTAIN missing",(o) => {o.effectiveBrowserPrivileges=o.effectiveBrowserPrivileges.filter((r) => r.privilege!=="MAINTAIN");}],
  ["MAINTAIN raw missing/unexpected",(o) => {const i=o.tableAcls.findIndex((a) => a.privilege==="MAINTAIN" && a.grantee==="authenticated");if(i>=0)o.tableAcls.splice(i,1);else o.tableAcls.push({schema:"public",table:"user_profiles",grantee:"authenticated",grantor:"postgres",privilege:"MAINTAIN",grantable:false});}],
  ["referee unexpected SELECT",(o) => {o.tableAcls.push({schema:"public",table:"referee_exam_sessions",grantee:"authenticated",grantor:"postgres",privilege:"SELECT",grantable:false});}],
  ["referee unexpected policy",(o) => {o.policies.push({...o.policies.find((p) => p.table==="referee_exam_sessions"),name:"browser_read",roles:["authenticated"]});}],
  ["profile column added",(o) => {o.columnAcls.push({schema:"public",table:"user_profiles",column:"avatar_url",grantee:"authenticated",grantor:"postgres",privilege:"UPDATE",grantable:false});}],
  ["column ACL missing",(o) => {o.columnAcls.pop();}],
  ["PUBLIC path",(o) => {o.tableAcls[0].grantee="PUBLIC";}],
  ["inherited privilege path",(o) => {o.effectiveBrowserPrivileges.find((r) => r.table==="referee_exam_sessions" && r.role==="anon").granted=true;}],
  ["grant option",(o) => {o.tableAcls[0].grantable=true;}],
  ["grantor",(o) => {o.tableAcls[0].grantor="authenticated";}],
  ["canonical USING drift",(o) => {o.policies.find((p) => p.name==="user_profiles_own_read").using="true";}],
  ["literal mutation",(o) => {const p=o.policies.find((p) => p.name==="training_attempt_profile_read");p.using=p.using.replace("training_user_id","training_user_id ");}],
  ["policy role",(o) => {o.policies[0].roles=["anon"];}],
  ["policy command",(o) => {o.policies[0].command="DELETE";}],
  ["policy mode",(o) => {o.policies[0].permissive=false;}],
  ["policy WITH CHECK",(o) => {o.policies[0].withCheck=o.policies[0].withCheck==="true" ? "false" : "true";}],
  ["preserved policy lost",(o) => {o.policies.pop();}],
  ["identity source",(o) => {o["64236State"].functions[0].source_hash="f".repeat(64);}],
  ["identity ACL",(o) => {o["64236State"].executeAcl.pop();}],
  ["identity owner",(o) => {o["64236State"].functions[0].owner="authenticated";}],
  ["schema CREATE",(o) => {o["64236State"].schemaCreatePrivileges[0].create=!o["64236State"].schemaCreatePrivileges[0].create;}],
  ["owner",(o) => {o.tables[0].owner="authenticated";}],
  ["RLS",(o) => {o.tables[0].rls=false;}],
  ["FORCE",(o) => {o.tables[0].force=true;}],
  ["historical count",(o) => {o.historicalState.counts.attempts++;}],
  ["historical hash",(o) => {o.historicalState.productFingerprint="f".repeat(32);}],
  ["protected hash",(o) => {o.historicalState.protectedObjectsHash="f".repeat(32);}],
  ["ledger",(o) => {o.adoptionState.ledgerRows.pop();}],
  ["schema state",(o) => {o.adoptionState.schemaStateRows.push({unexpected:true});}],
  ["runtime",(o) => {o.adoptionState.runtimeDisabled=false;}],
  ["cutover",(o) => {o.adoptionState.cutoverAbsent=false;}],
  ["Phase4",(o) => {o.adoptionState.phase4Absent=false;}],
  ["development identity",(o) => {o.adoptionState.developmentObjects["reflab_private.user_identity_links"]=true;}],
  ["service-role mutation",(o) => {o.tableAcls=o.tableAcls.filter((a) => a.grantee!=="service_role");}],
  ["column effective inherited path",(o) => {o.effectiveBrowserColumnPrivileges.find((r) => r.table==="user_profiles" && r.role==="anon").granted=true;}],
  ["collection unknown",(o) => {o.unknownChecks=["incomplete"]; }],
  ["read-only evidence off",(o) => {o.transactionReadOnly=false;}],
];
test("observed/adjudicated baseline exact, immutable and independent of temporary evidence",() => {
  assert.equal(validateBrowserBaseline(),true);assert.equal(browserBaselineDigest(baseline),BROWSER_TRANSITION_BASELINE_DIGEST);
  assert.equal(baseline.observation,"OBSERVED_PRODUCTION_PRE_INPUT");assert.equal(baseline.approvalScope,"ADJUDICATED_64249_TRANSITION_INPUT");
  assert.equal(Object.isFrozen(baseline.policies),true);assert.equal(baseline.policies.length,55);
  assert.deepEqual(baseline.catalogCounts,{columns:302,columnAcls:50,policies:55,tableAcls:363});
});
for(const [name,change] of [["missing",() => null],["version",(b) => ({...b,version:2})],["digest",(b) => ({...b,project:"wrong"})]])
  test(`baseline ${name} fails closed`,() => assert.equal(validateBrowserBaseline(change(structuredClone(baseline))),false));
test("canonical digest is set-order invariant but literal-sensitive",() => {
  const b=structuredClone(baseline);b.policies.reverse();b.tableAcl.reverse();for(const a of b.tableAcl) a.privileges.reverse();
  assert.equal(browserBaselineDigest(b),BROWSER_TRANSITION_BASELINE_DIGEST);b.policies[0].using="'abc '";assert.notEqual(browserBaselineDigest(b),BROWSER_TRANSITION_BASELINE_DIGEST);
});
test("exact PRE is executable and exact POST is non-executable",() => {
  assert.equal(classifyBrowserTransition(browserLineageObservation()).classification,"64249_PRE_EXECUTABLE_EXACT");
  const post=browserTransitionGate(browserLineageObservation(true));assert.equal(post.classification,"64249_ALREADY_INSTALLED_POST");
  assert.equal(post.executablePre,false);assert.equal(post.migrationInvocationCount,0);assert.equal(post.reexecutionRefused,true);
});
for(const [name,change] of browserNegativeCases) test(`PRE rejects ${name} with zero invocations`,() => {
  const o=browserLineageObservation();change(o);const r=browserTransitionGate(o);
  assert.equal(r.classification,"BLOCKER");assert.equal(r.executablePre,false);assert.equal(r.migrationInvocationCount,0);
});
for(const [name,change] of browserNegativeCases) test(`POST rejects ${name}`,() => {
  const o=browserLineageObservation(true);change(o);assert.equal(classifyBrowserTransition(o).classification,"BLOCKER");
});
test("13-table eight-privilege browser POST matrix is exact",() => {
  const o=browserLineageObservation(true);assert.equal(o.effectiveBrowserPrivileges.length,208);
  assert.equal(PG17_TABLE_PRIVILEGES.length,8);assert.equal(BROWSER_TABLES.length,13);
  assert.equal(o.effectiveBrowserPrivileges.filter((r) => r.role==="anon" && r.granted).length,0);
  assert.equal(o.effectiveBrowserPrivileges.filter((r) => r.role==="authenticated" && r.granted).length,23);
});
test("profile writes are column-only, exactly 20 INSERT / 19 UPDATE, no user_id update",() => {
  const o=browserLineageObservation(true);assert.equal(PROFILE_INSERT_COLUMNS.length,20);assert.equal(PROFILE_UPDATE_COLUMNS.length,19);
  assert.equal(PROFILE_UPDATE_COLUMNS.includes("user_id"),false);
  for(const p of ["INSERT","UPDATE"]) assert.equal(o.tableAcls.some((a) => a.table==="user_profiles" && a.grantee==="authenticated" && a.privilege===p),false);
  assert.equal(o.columnAcls.filter((a) => a.grantee==="authenticated").length,39);
  assert.equal(o.columnAcls.some((a) => a.grantee==="authenticated" && ["avatar_url","ref_card_id","updated_at"].includes(a.column)),false);
});
test("historical insert definitions survive but table INSERT is revoked",() => {
  const o=browserLineageObservation(true);for(const table of ["attempts","exam_results","rules_exam_results"]) {
    assert.ok(o.policies.some((p) => p.name===`${table}_own_insert`));
    assert.equal(o.effectiveBrowserPrivileges.some((r) => r.table===table && r.role==="authenticated" && r.privilege==="INSERT" && r.granted),false);
  }
});
test("referee SELECT ACL remains deliberately unusable under default-deny RLS",() => {
  const o=browserLineageObservation(true);assert.ok(o.tableAcls.some((a) => a.table==="referee_exam_sessions" && a.grantee==="authenticated" && a.privilege==="SELECT"));
  assert.equal(o.policies.filter((p) => p.table==="referee_exam_sessions").length,1);
  assert.equal(o.policies.some((p) => p.table==="referee_exam_sessions" && p.roles.includes("authenticated")),false);
  assert.equal(classifyBrowserTransition(o).REFEREE_EXAM_SESSIONS_BROWSER_READ_USABLE,"NO");
});
test("ACL deltas are derived: 48 anon + 74 authenticated revokes, 1 table + 39 column grants",() => {
  const a=browserMutationAccounting();assert.equal(a.tableRevokeCount,122);assert.equal(a.tableGrantCount,1);assert.equal(a.columnGrantCount,39);
  assert.equal(a.tableRevokes.filter((r) => r.grantee==="anon").length,48);
  assert.equal(a.tableRevokes.filter((r) => r.grantee==="authenticated").length,74);
  assert.equal(browserExpectedPostAcls().tableAcls.length,242);assert.equal(browserExpectedPostAcls().columnAcls.length,89);
  assert.ok(a.tableRevokes.every((r) => ["anon","authenticated"].includes(r.grantee)));
});
test("migration byte parity, transaction envelope and bounded settings",() => {
  assert.equal(createHash("sha256").update(sql).digest("hex"),BROWSER_MIGRATION_SHA);
  assert.equal(sql,buildCorrectedBrowserMigration());assert.equal((sql.match(/^begin;/gm)??[]).length,1);assert.equal((sql.match(/^commit;/gm)??[]).length,1);
  assert.match(sql,/lock_timeout = '5s'/);assert.match(sql,/statement_timeout = '60s'/);assert.match(sql,/maintain/);
  assert.doesNotMatch(sql,/^\s*(create|drop|alter|insert into|update public|delete from|notify)\b/im);
  assert.doesNotMatch(sql,/\b(?:to|from) service_role\s*;/i);
});
test("Production classifier cannot accept a local historical override",() => {
  const o=browserLineageObservation();o.historicalState.productFingerprint="f".repeat(32);
  const proof={fixtureStatus:"LOCAL_SYNTHETIC_DATA_ONLY",state:o.historicalState};
  assert.equal(classifyBrowserTransition(o,{localSyntheticHistorical:proof}).classification,"BLOCKER");
  assert.equal(classifyLocalBrowserTransition(o,proof).historicalEvidence,"LOCAL_SYNTHETIC_DATA_ONLY");
  o.historicalState.counts.attempts++;
  assert.equal(classifyLocalBrowserTransition(o,proof).classification,"BLOCKER");
  assert.throws(() => classifyLocalBrowserTransition(o,{fixtureStatus:"PRODUCTION",state:o.historicalState}));
});
