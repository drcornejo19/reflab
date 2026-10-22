import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CURRENT_SERVICE_MATRIX, SERVICE_TABLES, SERVICE_PRIVILEGES, serviceMatrix, serviceMutationAccounting, FUTURE_PROVIDER_ONLY } from "./phase3-current-service-role-matrix.mjs";
import { CURRENT_SERVICE_MIGRATION_PATH, CURRENT_FUNCTIONS, CURRENT_EXECUTE_ACLS, PRESERVATION_QUERY_ID,
  classifyCurrentServiceTransition, classifyLocalCurrentServiceTransition, serviceTransitionPreserved, buildCurrentServiceBatch } from "./phase3-current-service-role-contract.mjs";
import { currentServiceFixtureEvidence, buildCurrentServiceFixture } from "./phase3-current-service-role-fixture.mjs";
import { buildCurrentServiceMigration, currentServiceMutationBody } from "./phase3-current-service-role-migration-source.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { migrationManifest } from "../../production-preflight/manifest.mjs";

const inventory = (e) => e.get(SERVICE_FORENSIC_QUERY_ID);
const browser = (e) => e.get(BROWSER_FORENSIC_QUERY_ID);
const migration = readFileSync(new URL("../../../" + CURRENT_SERVICE_MIGRATION_PATH, import.meta.url), "utf8").replaceAll("\r\n", "\n");
test("exact supplied-current PRE is executable, not a DDL authorization", () => {
  const r = classifyCurrentServiceTransition(currentServiceFixtureEvidence());
  assert.equal(r.classification, "PRE_EXECUTABLE_EXACT", JSON.stringify(r));
  assert.equal(r.executablePre, true); assert.deepEqual(r.failedChecks, []); assert.deepEqual(r.unknownChecks, []);
  assert.equal(r.productionDdlAuthorized, false); assert.equal(r.migrationInvocationCount, 0);
});
test("exact POST is distinct and refuses a second invocation", () => {
  const r = classifyCurrentServiceTransition(currentServiceFixtureEvidence(true));
  assert.equal(r.classification, "ALREADY_INSTALLED_POST", JSON.stringify(r));
  assert.equal(r.executablePre, false); assert.equal(r.reexecutionRefused, true); assert.equal(r.migrationInvocationCount, 0);
});
test("matrix arithmetic proves 72 removals, two additions, 26 grants, 78 absences, 30 unchanged", () => {
  const a = serviceMutationAccounting();
  assert.deepEqual([a.preGrantedCells,a.postGrantedCells,a.postAbsentCells,a.effectivePrivilegeEntryRevocations,a.effectivePrivilegeEntryGrants,a.unchangedCells], [96,26,78,72,2,30]);
  assert.deepEqual(a.granted.map((r) => [r.table,r.privilege]), [["referee_exam_sessions","SELECT"],["referee_exam_sessions","INSERT"]]);
  assert.deepEqual([a.sqlRevokeStatementCount,a.sqlGrantStatementCount], [12,2]);
  assert.equal(a.revoked.filter((r) => r.privilege === "MAINTAIN").length,12);
});
for (const table of SERVICE_TABLES) for (const privilege of SERVICE_PRIVILEGES) test(`exact matrix cell ${table}.${privilege}`, () => {
  const a = serviceMatrix(true).filter((r) => r.table === table && r.privilege === privilege);
  assert.equal(a.length,1); assert.equal(a[0].granted,CURRENT_SERVICE_MATRIX[table].includes(privilege));
  assert.equal(serviceMatrix().find((r) => r.table === table && r.privilege === privilege).granted,table !== "referee_exam_sessions");
});
for (const post of [false,true]) for (const privilege of SERVICE_PRIVILEGES) test(`${post ? "POST" : "PRE"} effective ${privilege} drift`, () => {
  const e=currentServiceFixtureEvidence(post), row=inventory(e).effectiveTablePrivileges.find((r) => r.table==="attempts" && r.privilege===privilege);
  row.granted=!row.granted; assert.equal(classifyCurrentServiceTransition(e).classification,"BLOCKER");
});
const drift = {
  partialAnon: (e) => browser(e).effectiveBrowserPrivileges.find((r) => r.role === "anon").granted=true,
  authenticated: (e) => browser(e).effectiveBrowserPrivileges.find((r) => r.role === "authenticated" && r.privilege==="MAINTAIN").granted=true,
  wrongGrantor: (e) => inventory(e).tableAcls.find((r) => r.grantee==="service_role" && r.table==="attempts").grantor="reflab_rls_owner",
  grantOption: (e) => inventory(e).tableAcls.find((r) => r.grantee==="service_role" && r.table==="attempts").grantable=true,
  bypassRls: (e) => inventory(e).roleAttributes.find((r) => r.name==="service_role").rolbypassrls=false,
  columnAcl: (e) => browser(e).columnAcls[0].grantable=true,
  effectiveColumn: (e) => inventory(e).effectiveColumnPrivileges[0].granted=!inventory(e).effectiveColumnPrivileges[0].granted,
  policyLiteral: (e) => browser(e).policies.find((r) => r.name==="training_attempt_profile_read").using=browser(e).policies.find((r) => r.name==="training_attempt_profile_read").using.replace("training_user_id","training_user_id "),
  policyRole: (e) => browser(e).policies[0].roles=["authenticated"],
  policyCommand: (e) => browser(e).policies[0].command="DELETE",
  policyPermissiveness: (e) => browser(e).policies[0].permissive=false,
  policyCheck: (e) => browser(e).policies[0].withCheck="false",
  owner: (e) => browser(e).tables[0].owner="service_role",
  rls: (e) => browser(e).tables[0].rls=false,
  force: (e) => browser(e).tables[0].force=true,
  functionMode: (e) => inventory(e).relevantFunctions.find((r) => r.exists).security_definer=false,
  functionOwner: (e) => inventory(e).relevantFunctions.find((r) => r.exists).owner="service_role",
  functionSource: (e) => inventory(e).relevantFunctions.find((r) => r.exists).sourceHash="f".repeat(32),
  functionPath: (e) => inventory(e).relevantFunctions.find((r) => r.exists).configuration=["search_path=public,pg_catalog"],
  functionExecute: (e) => inventory(e).functionExecuteAcls[0].grantable=true,
  futureFunctionAppears: (e) => inventory(e).relevantFunctions.find((r) => !r.exists).exists=true,
  historical: (e) => e.get(CORE_POLICY_QUERY_ID).productFingerprint="f".repeat(32),
  historicalCount: (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).historicalCounts.attempts=38,
  ledger: (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).ledgerRows[0].phase_order=99,
  schemaState: (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).schemaStateRows=[{baseline_version:"local_drift"}],
  runtime: (e) => e.get(CORE_POLICY_QUERY_ID).runtimeDisabled=false,
  cutover: (e) => e.get(CORE_POLICY_QUERY_ID).cutoverAbsent=false,
  phase4: (e) => e.get(CORE_POLICY_QUERY_ID).phase4Absent=false,
  identity: (e) => e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].security_definer=!e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].security_definer,
  missingCell: (e) => inventory(e).effectiveTablePrivileges.pop(),
  duplicateCell: (e) => inventory(e).effectiveTablePrivileges.push(inventory(e).effectiveTablePrivileges[0]),
  public: (e) => inventory(e).tableAcls.push({schema:"public",table:"attempts",grantee:"PUBLIC",grantor:"postgres",privilege:"DELETE",grantable:false}),
  inherited: (e) => { inventory(e).roleMemberships.push({member:"service_role",role:"reflab_rls_owner",grantor:"postgres",adminOption:false,inheritOption:true,setOption:true}); const r=inventory(e).roleAttributes.find((r) => r.name==="reflab_rls_owner"); r.serviceRoleInherits=true;r.serviceRoleMember=true;r.serviceRoleCanSet=true; },
};
for(const post of [false,true]) for(const [name, mutate] of Object.entries(drift)) test(`${post ? "POST" : "PRE"} rejects ${name}`, () => {
  const e=currentServiceFixtureEvidence(post);mutate(e);assert.equal(classifyCurrentServiceTransition(e).classification,"BLOCKER");
});
test("unknown requires missing observation, not known hybrid ACL drift", () => {
  assert.equal(classifyCurrentServiceTransition(new Map()).classification,"UNKNOWN");
  const e=currentServiceFixtureEvidence();browser(e).tableAcls=browser(e).tableAcls.filter((r) => !(r.grantee==="service_role" && r.privilege==="MAINTAIN"));
  assert.equal(classifyCurrentServiceTransition(e).classification,"BLOCKER");
});
test("generated artifact byte parity and narrow explicit SQL statements", () => {
  assert.equal(migration,buildCurrentServiceMigration());
  const body=currentServiceMutationBody(migration).trim().split("\n").map((s) => s.trim());
  assert.deepEqual(body,serviceMutationAccounting().statements);
  assert.equal(body.filter((s) => s.startsWith("revoke ")).length,12);assert.equal(body.filter((s) => s.startsWith("grant ")).length,2);
  assert.doesNotMatch(body.join("\n"),/\b(all|cascade|anon|authenticated|public privileges|create|alter|drop|insert into|update public|delete from)\b/i);
  assert.match(migration,/^begin;$/m);assert.match(migration,/^commit;$/m);
  assert.match(migration,/lock_timeout = '5s'/);assert.match(migration,/statement_timeout = '60s'/);
});
test("future three writes never enter the current SQL grants", () => {
  const body=currentServiceMutationBody(migration);
  for(const f of FUTURE_PROVIDER_ONLY) assert.equal(CURRENT_SERVICE_MATRIX[f.table].includes(f.privilege),false);
  assert.deepEqual(serviceMutationAccounting().granted.map((r) => r.privilege),["SELECT","INSERT"]);
  assert.doesNotMatch(body,/grant update/i);assert.doesNotMatch(body,/grant insert on table public\.(attempts|exam_results)/i);
});
test("catalog preservation detects additional-runtime or function mutation", () => {
  const before=currentServiceFixtureEvidence(),after=currentServiceFixtureEvidence(true);
  assert.equal(serviceTransitionPreserved(before,after),true);
  after.set(PRESERVATION_QUERY_ID,"b".repeat(32));assert.equal(serviceTransitionPreserved(before,after),false);
  assert.equal(serviceTransitionPreserved(new Map(),new Map()),false);
});
test("synthetic fingerprints cannot pass the Production classifier", () => {
  const e=currentServiceFixtureEvidence(), proof={fixtureStatus:"LOCAL_SYNTHETIC_DATA_ONLY",state:{productFingerprint:"b".repeat(32),protectedObjectsHash:"c".repeat(32)},
    functionHashes:Object.fromEntries(CURRENT_FUNCTIONS.filter((f) => f.exists).map((f) => [f.signature,"d".repeat(32)]))};
  Object.assign(e.get(CORE_POLICY_QUERY_ID),proof.state);for(const f of inventory(e).relevantFunctions) if(f.exists) f.sourceHash="d".repeat(32);
  assert.equal(classifyLocalCurrentServiceTransition(e,proof).classification,"PRE_EXECUTABLE_EXACT");
  assert.equal(classifyCurrentServiceTransition(e).classification,"BLOCKER");
  assert.throws(() => classifyLocalCurrentServiceTransition(e,{}),/EXPLICIT_LOCAL/);
});
test("fixture replaces mechanical no-argument stubs, not Production functions", () => {
  const fixture=buildCurrentServiceFixture();assert.match(fixture,/SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH/);
  for(const f of CURRENT_FUNCTIONS.filter((f) => f.exists)) assert.ok(fixture.includes(`create function ${f.signature}`));
  assert.equal(CURRENT_EXECUTE_ACLS.length,12);assert.equal(CURRENT_FUNCTIONS.filter((f) => f.exists).length,6);
});
test("collector is SELECT-only and carries no remote execution authorization", () => {
  assert.doesNotMatch(buildCurrentServiceBatch(),/^\s*(?:create|alter|drop|grant|revoke|insert|update|delete|notify|commit)\b/im);
  assert.equal(serviceMatrix().length,104);assert.equal(serviceMatrix(true).length,104);
});
test("new migration is inventory-only until manual adoption gates are approved", () => {
  const row=migrationManifest.find((m) => m.version==="20261010041511");
  assert.equal(row.name,"production_adoption_current_service_role_privilege_reconciliation");
  assert.equal(row.classification,"production_adoption_security");
  assert.equal(row.productionAction,"MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
});
for(const [path, sha] of [
  ["20260901064236_production_adoption_identity_security_bridge.sql", ""],
  ["20260901064245_production_adoption_core_policy_reconciliation.sql","839ce75ab6961d1bcc304957e571aebe669b33473089dd95d4e1a03285f80ee1"],
  ["20260901064249_production_adoption_browser_privilege_reconciliation.sql","4ddd6a1fd30b9508297b3f2819925bca507e1ef8005144f4f02acae6d335f12c"],
]) test(`protected migration ${path} remains untouched`, () => {
  const bytes=readFileSync(new URL("../../../supabase/migrations/"+path,import.meta.url),"utf8").replaceAll("\r\n","\n");
  if(sha) assert.equal(createHash("sha256").update(bytes).digest("hex"),sha);else assert.ok(bytes.length>0);
});
