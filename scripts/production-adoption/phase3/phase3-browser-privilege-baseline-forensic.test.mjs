import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BROWSER_FORENSIC_QUERY_ID, BROWSER_FORENSIC_TABLES, BROWSER_EXTRA_TABLES, TABLE_PRIVILEGES,
  buildBrowserPrivilegeForensicBatch, classifyBrowserPrivilegeObservation, browserPolicyExpressionsEqual,
  normalizeBrowserPolicyExpression } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { browserForensicFixtureEvidence, buildBrowserForensicMechanicalFixture, BROWSER_FIXTURE_STATUS } from "./phase3-browser-privilege-forensic-fixture.mjs";
import { BROWSER_FORENSIC_OPERATION, BROWSER_FORENSIC_VARIABLES, runProductionBrowserPrivilegeBaselineForensic,
  runBrowserPrivilegeForensicCli, executeBrowserForensicReadOnly, sanitizeBrowserForensicOutput,
  serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { IdentitySecurityBridgePreAttestationFailure } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";

const observe = (e=browserForensicFixtureEvidence()) => classifyBrowserPrivilegeObservation(e,{targetExact:true});
const payload = (e) => e.get(BROWSER_FORENSIC_QUERY_ID);
test("13-table observation never approves or grants execution",() => {
  const r=observe(); assert.equal(r.classification,"OBSERVATION_COMPLETE"); assert.equal(r.approval,"NOT_PERFORMED");
  assert.equal(r.mutationCount,0); assert.equal(r.tables.length,13);
  assert.ok(Object.values(r.mutationAccounting).every((count) => count===0));
  assert.deepEqual(new Set(r.tables.map((t) => t.table)),new Set(BROWSER_FORENSIC_TABLES));
  assert.doesNotMatch(JSON.stringify(r),/EXECUTABLE_PRE|DDL_READY|CURRENTLY_ATTESTED/);
  assert.equal(r.BROWSER_ACL_SECURITY_STATUS,"OBSERVED_NOT_ADJUDICATED");
  assert.equal(r.GLOBAL_TABLE_ACL_RECONCILIATION,"INCOMPLETE");
});
test("all eight privileges include MAINTAIN for both browser roles",() => {
  const r=observe(); assert.equal(r.effectiveBrowserPrivileges.length,208);
  for(const role of ["anon","authenticated"]) for(const table of BROWSER_FORENSIC_TABLES)
    assert.deepEqual(new Set(r.effectiveBrowserPrivileges.filter((p) => p.role===role && p.table===table).map((p) => p.privilege)),new Set(TABLE_PRIVILEGES));
});
test("raw PUBLIC, grantor and grant options remain visible independently from effective results",() => {
  const e=browserForensicFixtureEvidence(); const p=payload(e);
  p.tableAcls.push({schema:"public",table:"user_global_roles",grantee:"PUBLIC",grantor:"postgres",privilege:"SELECT",grantable:true});
  p.catalogCounts.tableAcls++;
  p.effectiveBrowserPrivileges.find((r) => r.table==="user_global_roles" && r.role==="anon" && r.privilege==="SELECT").granted=true;
  const r=observe(e); assert.equal(r.classification,"OBSERVATION_COMPLETE");
  assert.ok(r.tableAcls.some((a) => a.grantee==="PUBLIC" && a.grantable && a.grantor==="postgres"));
  assert.ok(r.extraThreeTables.user_global_roles.effectiveAnonPrivileges.some((a) => a.privilege==="SELECT" && a.granted));
});
test("column ACLs and profile effective capabilities are complete and separate",() => {
  const e=browserForensicFixtureEvidence(); const p=payload(e);
  p.columnAcls.push({schema:"public",table:"user_profiles",column:"user_id",grantee:"authenticated",grantor:"postgres",privilege:"INSERT",grantable:false});
  p.catalogCounts.columnAcls++;
  p.effectiveBrowserColumnPrivileges.find((r) => r.table==="user_profiles" && r.column==="user_id" && r.role==="authenticated" && r.privilege==="INSERT").granted=true;
  const r=observe(e); assert.equal(r.columnAcls.length,21); assert.equal(r.effectiveBrowserColumnPrivileges.length,208);
  assert.equal(r.columnAcls.at(-1)?.grantor,"postgres");
  assert.ok(r.effectiveBrowserColumnPrivileges.some((a) => a.table==="user_profiles" && a.role==="authenticated" && a.privilege==="INSERT" && a.granted));
});
test("extra three sections contain complete policies and ACL/role inventories",() => {
  const r=observe(); for(const t of BROWSER_EXTRA_TABLES) {
    const section=r.extraThreeTables[t]; assert.equal(section.tableSecurity.table,t);
    assert.equal(section.effectiveAnonPrivileges.length,8); assert.equal(section.effectiveAuthenticatedPrivileges.length,8);
    assert.equal(section.policies.length,1); assert.equal(section.policies[0].label,"NON_TARGET");
    assert.ok(Array.isArray(section.columnAcls)); assert.ok(Array.isArray(section.tableAcls));
  }
});
test("unknown policies and case-sensitive expression strings are never discarded or rewritten",() => {
  const e=browserForensicFixtureEvidence(); const p=payload(e);
  p.policies.push({...p.policies[0],oid:99999,table:"referee_exam_sessions",name:"unknown",roles:["PUBLIC"],using:"user_id = 'Case Sensitive'"});
  p.catalogCounts.policies++;
  const r=observe(e); assert.equal(r.classification,"OBSERVATION_COMPLETE"); assert.equal(r.extraThreeTables.referee_exam_sessions.policies.length,2);
  assert.equal(r.policies.find((x) => x.name==="unknown").using,"user_id = 'Case Sensitive'");
});
test("64245 POST independently reports 22 canonical and 20 preserved with no legacy/DELETE",() => {
  const r=observe(); assert.equal(r["64245PostState"].comparison,"EXACT");
  assert.equal(r["64245PostState"].canonicalTargetPolicyCount,22); assert.equal(r["64245PostState"].preservedNonTargetPolicyCount,20);
  assert.equal(r["64245PostState"].legacyRemaining,0); assert.equal(r["64245PostState"].authenticatedDeletePolicyCount,0);
});
for(const [name,change] of [
  ["target drift",(p) => {p.policies.find((r) => r.name==="user_profiles_own_read").using="true";}],
  ["legacy survives",(p) => {p.policies.push({...p.policies[0],oid:99999,table:"notification_events",name:"Users can read own notification events",command:"SELECT",roles:["authenticated"]});p.catalogCounts.policies++;}],
  ["authenticated DELETE",(p) => {p.policies.push({...p.policies[0],oid:99999,name:"browser_delete",command:"DELETE",roles:["authenticated"]});p.catalogCounts.policies++;}],
  ["preserved policy lost",(p) => {p.policies.splice(0,1);p.catalogCounts.policies--;}],
]) test(`${name} is observed, not repaired or approved`,() => {
  const e=browserForensicFixtureEvidence(); change(payload(e)); const r=observe(e);
  assert.equal(r.classification,"OBSERVATION_COMPLETE"); assert.equal(r["64245PostState"].comparison,"NOT_EXACT"); assert.equal(r.mutationCount,0);
});
test("64236 source/security/ACL and schema CREATE observations reuse authoritative check",() => {
  const e=browserForensicFixtureEvidence(); assert.equal(observe(e)["64236State"].comparison,"EXACT");
  e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].source_hash="f".repeat(64);
  const r=observe(e); assert.equal(r.classification,"OBSERVATION_COMPLETE"); assert.equal(r["64236State"].comparison,"NOT_EXACT_OR_INCOMPLETE");
  assert.equal(r["64236State"].functions.length,5); assert.equal(r["64236State"].schemaCreatePrivileges.length,8);
});
test("adoption and historical actual values are reported, not forced to expected",() => {
  const e=browserForensicFixtureEvidence(); const a=e.get(CORE_BASELINE_ADOPTION_QUERY_ID);
  a.historicalCounts.attempts=38; a.schemaStateRows.push({baseline_version:"observed"}); e.get(CORE_POLICY_QUERY_ID).runtimeDisabled=false;
  const r=observe(e); assert.equal(r.classification,"OBSERVATION_COMPLETE"); assert.equal(r.historicalState.counts.attempts,38);
  assert.equal(r.adoptionState.ledgerRows.length,4); assert.equal(r.adoptionState.runtimeDisabled,false); assert.equal(r.adoptionState.schemaStateRowCount,1);
});
for(const [name,change] of [
  ["missing table",(e) => {payload(e).tables.pop();}],
  ["table absent",(e) => {payload(e).tables[0].exists=false;}],
  ["missing MAINTAIN result",(e) => {payload(e).effectiveBrowserPrivileges.pop();}],
  ["duplicated effective result",(e) => {payload(e).effectiveBrowserPrivileges[0]=payload(e).effectiveBrowserPrivileges[1];}],
  ["missing column result",(e) => {payload(e).effectiveBrowserColumnPrivileges.pop();}],
  ["missing raw ACL result",(e) => {payload(e).tableAcls.pop();}],
  ["missing column ACL result",(e) => {payload(e).columnAcls.pop();}],
  ["missing policy result",(e) => {payload(e).policies.pop();}],
  ["missing query",(e) => {e.delete(BROWSER_FORENSIC_QUERY_ID);}],
  ["not read only",(e) => {e.set("read_only_guard","off");}],
]) test(`${name} blocks incomplete collection`,() => {const e=browserForensicFixtureEvidence();change(e);assert.equal(observe(e).classification,"BLOCKER");});
test("stable output is unchanged by set ordering",() => {
  const e=browserForensicFixtureEvidence(); const before=observe(e); const p=payload(e);
  for(const value of Object.values(p)) if(Array.isArray(value)) value.reverse();
  assert.deepEqual(observe(e),before);
});
test("one bounded ROLLBACK-only SELECT batch, no migration or write statements",() => {
  const sql=buildBrowserPrivilegeForensicBatch(); assert.match(sql,/^begin read only;/); assert.match(sql,/rollback;\s*$/);
  assert.equal((sql.match(/begin read only;/g)??[]).length,1); assert.match(sql,/statement_timeout = '15s'/); assert.match(sql,/lock_timeout = '2s'/);
  assert.match(sql,/transaction_read_only/); assert.match(sql,/has_table_privilege/); assert.match(sql,/has_column_privilege/); assert.match(sql,/'MAINTAIN'/);
  assert.doesNotMatch(sql,/^\s*(commit|create|alter|drop|insert|update|delete|truncate|grant|revoke|notify|set role)\b/im);
  assert.doesNotMatch(sql,/pg_advisory|create temp/i);
});
test("fixture is mechanical POST construction, not migration execution or Production approval",() => {
  const sql=buildBrowserForensicMechanicalFixture(); assert.match(sql,/LOCAL_MECHANICAL_FIXTURE_ONLY/);
  assert.equal(BROWSER_FIXTURE_STATUS,"LOCAL_MECHANICAL_FIXTURE_ONLY"); assert.doesNotMatch(sql,/\$preflight\$|\$assertions\$|commit;/i);
  assert.equal((sql.match(/create policy /g)??[]).length,45);
});
const head="a".repeat(40);
const artifact=Buffer.from(readFileSync(new URL("../../../supabase/migrations/20260901064249_production_adoption_browser_privilege_reconciliation.sql",import.meta.url),"utf8").replaceAll("\r\n","\n"));
function env(extra={}) {return {...Object.fromEntries(BROWSER_FORENSIC_VARIABLES.slice(0,3).map((k) => [k,"true"])),
  [BROWSER_FORENSIC_VARIABLES[3]]:"nagjddldrldwavmfaytc",[BROWSER_FORENSIC_VARIABLES[4]]:head,
  [BROWSER_FORENSIC_VARIABLES[5]]:"postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",...extra};}
function deps(extra={}) {return {argument:BROWSER_FORENSIC_OPERATION,git:(a) => a[0]==="rev-parse" ? head : a[0]==="show" ? artifact : "",
  executeReadOnly:() => browserForensicFixtureEvidence(),...extra};}
async function fails(environment,dependencies,reason) {
  let output=""; let calls=0;
  const d={...dependencies,writeStdout:() => assert.fail(),writeStderr:(s) => {output+=s;}};
  if(d.executeReadOnly) {const execute=d.executeReadOnly;d.executeReadOnly=(...a) => {calls++;return execute(...a);};}
  assert.equal(await runBrowserPrivilegeForensicCli(environment,d),1);assert.equal(JSON.parse(output).reason,reason);
  assert.doesNotMatch(output,/fixture-password|postgresql:\/\/|PGPASSWORD/);return calls;
}
test("exact authorization makes only one bounded read-only invocation",() => {
  let calls=0; const r=runProductionBrowserPrivilegeBaselineForensic(env(),deps({executeReadOnly:(sql) => {
    calls++;assert.equal(sql,buildBrowserPrivilegeForensicBatch());return browserForensicFixtureEvidence();}}));
  assert.equal(calls,1);assert.equal(r.classification,"OBSERVATION_COMPLETE");assert.equal(r.mutationCount,0);
});
test("exact operation required",async() => fails(env(),deps({argument:"other"}),"OPERATION_NOT_AUTHORIZED"));
for(const k of BROWSER_FORENSIC_VARIABLES.slice(0,3)) test(`required ${k}`,async() => assert.equal(await fails(env({[k]:"false"}),deps(),"OPT_IN_REQUIRED"),0));
for(const k of ["ALLOW_PRODUCTION_DDL","ALLOW_PRODUCTION_CORE_POLICY_64245_DDL","ALLOW_PRODUCTION_CORE_POLICY_PRE_ATTESTATION","ALLOW_PRODUCTION_CUTOVER","REFLAB_PRODUCTION_DDL_DB_URL"])
  test(`reject contamination ${k}`,async() => assert.equal(await fails(env({[k]:""}),deps(),"DDL_CONFIGURATION_REJECTED"),0));
for(const k of ["PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGOPTIONS","PGSERVICE","PGSSLMODE"])
  test(`reject inherited ${k}`,async() => assert.equal(await fails(env({[k]:""}),deps(),"INHERITED_PG_STATE"),0));
test("wrong HEAD blocks before query",async() => assert.equal(await fails(env({[BROWSER_FORENSIC_VARIABLES[4]]:"b".repeat(40)}),deps(),"HEAD_MISMATCH"),0));
for(const status of [" M package.json","M  package.json","?? new-file"])
  test(`dirty worktree ${status}`,async() => assert.equal(await fails(env(),deps({git:(a) => a[0]==="rev-parse"?head:status}),"WORKTREE_DIRTY"),0));
test("artifact mismatch blocks before query",async() => assert.equal(await fails(env(),deps({git:(a) => a[0]==="show"?"wrong":a[0]==="rev-parse"?head:""}),"REPOSITORY_ARTIFACT_MISMATCH"),0));
test("wrong project blocks before query",async() => assert.equal(await fails(env({[BROWSER_FORENSIC_VARIABLES[3]]:"wrong"}),deps(),"TARGET_MISMATCH"),0));
for(const [name,old,next] of [["host","aws-1-sa-east-1.pooler.supabase.com","example.invalid"],
  ["direct host","aws-1-sa-east-1.pooler.supabase.com","db.nagjddldrldwavmfaytc.supabase.co"],
  ["port",":5432/",":6543/"],["database","/postgres?","/template1?"],
  ["installer","postgres.nagjddldrldwavmfaytc","service_role"],["sslmode","sslmode=require","sslmode=disable"]])
  test(`wrong ${name}`,async() => assert.equal(await fails(env({[BROWSER_FORENSIC_VARIABLES[5]]:env()[BROWSER_FORENSIC_VARIABLES[5]].replace(old,next)}),deps(),"TARGET_MISMATCH"),0));
test("read-only verification enforced by runner",async() => fails(env(),deps({executeReadOnly:() => new Map()}),"READ_ONLY_GUARD_FAILED"));
test("driver failures never emit credentials or SQL",async() => {
  const d=deps({spawn:() => ({status:1,stderr:"ERROR: 57014: fixture-password connection secret"})});delete d.executeReadOnly;
  await fails(env(),d,"TIMEOUT");
});
test("psql is bounded, isolated from arbitrary environment, and does not use startup files",() => {
  let calls=0;
  assert.throws(() => executeBrowserForensicReadOnly(buildBrowserPrivilegeForensicBatch(),{PGHOST:"allowlisted",PGPASSWORD:"fixture-password"},
    {processEnvironment:{PGOPTIONS:"inherited",UNRELATED_SECRET:"not-inherited"},spawn:(program,args,options) => {
      calls++;assert.equal(program,"psql");assert.ok(args.includes("-X"));assert.ok(args.includes("--no-psqlrc"));
      assert.ok(args.includes("ON_ERROR_STOP=1"));assert.ok(args.includes("VERBOSITY=verbose"));assert.equal(options.timeout,120000);
      assert.equal(options.env.PGOPTIONS,undefined);assert.equal(options.env.UNRELATED_SECRET,undefined);
      return {status:1,stderr:"ERROR: 57014: synthetic timeout"};
    }}));
  assert.equal(calls,1);
});
test("encoded and decoded credentials are both blocked before output",async() => {
  const password="fixture%2Dpassword";
  const environment=env({[BROWSER_FORENSIC_VARIABLES[5]]:env()[BROWSER_FORENSIC_VARIABLES[5]].replace("fixture-password",password)});
  for(const value of [password,decodeURIComponent(password)]) await fails(environment, deps({run:() => ({
    classification:"OBSERVATION_COMPLETE",approval:"NOT_PERFORMED",mutationCount:0,value})}),"LOCAL_PROGRAMMING_ERROR");
});
for(const value of ["fixture-password",env()[BROWSER_FORENSIC_VARIABLES[5]],"postgresql://other:secret@example.invalid/db"])
  test("secret/URL-bearing output is rejected atomically",async() => fails(env(),deps({run:() => ({classification:"OBSERVATION_COMPLETE",approval:"NOT_PERFORMED",mutationCount:0,value})}),"LOCAL_PROGRAMMING_ERROR"));
for(const classification of ["64245_PRE_EXECUTABLE_EXACT","EXECUTABLE_PRE","APPROVED","DDL_READY"])
  test(`never emit ${classification}`,async() => fails(env(),deps({run:() => ({classification,approval:"NOT_PERFORMED",mutationCount:0})}),"LOCAL_PROGRAMMING_ERROR"));
test("production runner has no migration execution path",() => {
  const source=readFileSync(new URL("./run-production-browser-privilege-baseline-forensic.mjs",import.meta.url),"utf8");
  assert.doesNotMatch(source,/executeMigration|executeDdl|executeCorePolicy|buildBrowserForensicMechanicalFixture/);
});

const difficultPasswords=[`abc"def`,"abc'def","abc\\def","abc%22def","abc:def@ghi","abc/def",
  "abc?x=1&y=2","abc&def","abc=def","abc def",`a b"c\\d%`,"abc%def","abc:def","abc@def"];
function secretEnvironment(password) {
  return env({[BROWSER_FORENSIC_VARIABLES[5]]:env()[BROWSER_FORENSIC_VARIABLES[5]].replace("fixture-password",encodeURIComponent(password))});
}
function assertNoRecoverableSecret(text,password,environment) {
  const variants=[password,encodeURIComponent(password),JSON.stringify(password).slice(1,-1),environment[BROWSER_FORENSIC_VARIABLES[5]]];
  for(const candidate of [text,JSON.stringify(JSON.parse(text))]) for(const secret of variants) assert.ok(!candidate.includes(secret));
  const walk=(v) => {
    if(typeof v==="string") {
      const candidates=[v];
      for(let i=0;i<2;i++) try {candidates.push(decodeURIComponent(candidates.at(-1)));} catch {break;}
      for(const value of candidates) assert.ok(!value.includes(password));
    } else if(v && typeof v==="object") Object.entries(v).forEach(([k,value]) => {walk(k);walk(value);});
  };
  walk(JSON.parse(text));
}
async function capture(environment,dependencies) {
  let stdout="",stderr="";
  const code=await runBrowserPrivilegeForensicCli(environment,{...dependencies,writeStdout:(s) => {stdout+=s;},writeStderr:(s) => {stderr+=s;}});
  return {code,stdout,stderr};
}
for(const [index,password] of difficultPasswords.entries()) {
  test(`difficult credential ${index}: clean successful observation is secret-free`,async() => {
    const environment=secretEnvironment(password);
    const result=await capture(environment,deps());assert.equal(result.code,0);assert.equal(result.stderr,"");
    assertNoRecoverableSecret(result.stdout,password,environment);
    assert.equal(JSON.parse(result.stdout).approval,"NOT_PERFORMED");
  });
  test(`difficult credential ${index}: tainted structured payload fails before output`,async() => {
    const environment=secretEnvironment(password);
    const unicode=[...password].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`).join("");
    const variants=[password,encodeURIComponent(password),encodeURIComponent(encodeURIComponent(password)),
      JSON.stringify(password).slice(1,-1),unicode,Buffer.from(password).toString("base64"),environment[BROWSER_FORENSIC_VARIABLES[5]]];
    try {variants.push(decodeURIComponent(password));} catch { /* Literal malformed percent sequences are tested unchanged. */ }
    variants.push("diagnostic\n"+JSON.stringify(password).slice(1,-1).replace(/^./,(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`));
    for(const value of variants) {
      const result=await capture(environment,deps({run:() => ({classification:"OBSERVATION_COMPLETE",approval:"NOT_PERFORMED",mutationCount:0,
        nested:[{value}]})}));
      assert.equal(result.code,1);assert.equal(result.stdout,"");assert.equal(JSON.parse(result.stderr).classification,"BLOCKER");
      assertNoRecoverableSecret(result.stderr,password,environment);
    }
  });
  test(`difficult credential ${index}: driver and structured exceptions are secret-free`,async() => {
    const environment=secretEnvironment(password);
    for(const value of [password,encodeURIComponent(password),JSON.stringify(password).slice(1,-1),environment[BROWSER_FORENSIC_VARIABLES[5]]]) {
      const d=deps({spawn:() => ({status:1,stderr:`ERROR: 57014: password=${value}`})});delete d.executeReadOnly;
      const processResult=await capture(environment,d);assert.equal(processResult.code,1);assert.equal(processResult.stdout,"");
      assertNoRecoverableSecret(processResult.stderr,password,environment);
      const exception=await capture(environment,deps({run:() => {throw new IdentitySecurityBridgePreAttestationFailure("FAIL","FAIL",value,{query:value});}}));
      assert.equal(exception.code,1);assert.equal(exception.stdout,"");assertNoRecoverableSecret(exception.stderr,password,environment);
    }
  });
}
test("quoted-password committed-review reproducer is now rejected",async() => {
  const password=`synthetic"credential`;const environment=secretEnvironment(password);const e=browserForensicFixtureEvidence();
  payload(e).policies[0].using=`'${password}' = '${password}'`;
  const result=await capture(environment,deps({executeReadOnly:() => e}));
  assert.equal(result.code,1);assert.equal(result.stdout,"");assertNoRecoverableSecret(result.stderr,password,environment);
});
test("password fragments split across structured values cannot reconstruct the secret",() => {
  assert.throws(() => sanitizeBrowserForensicOutput({values:["fixture-","password"]},env()));
  assert.throws(() => serializeBrowserForensic({value:"password=partial-credential"},env()));
  assert.throws(() => serializeBrowserForensic({value:"host=example.invalid dbname=postgres user=installer"},env()));
});
test("sanitizer rejects serialization hooks, getters, cycles, and secret-bearing keys",() => {
  let invoked=false;
  for(const value of [{toJSON:() => {invoked=true;return "fixture-password";}},
    {get value() {invoked=true;return "fixture-password";}}, {["fixture-password"]:"value"}])
    assert.throws(() => sanitizeBrowserForensicOutput(value,env()));
  const cycle={};cycle.self=cycle;assert.throws(() => sanitizeBrowserForensicOutput(cycle,env()));assert.equal(invoked,false);
});
for(const [index,left,right] of [
  [0,"current_setting('reflab.training_user_id'::text, true)","current_setting('reflab.training_user_id '::text, true)"],
  [1,"'abc'","' abc'"],[2,"'abc'","'abc '"],[3,"'a b'","'ab'"],
  [4,"'a''b'","'a'' b'"],[5,'"user_id"','"user_id "'],[6,'"a""b"','"a"" b"'],
  [7,"$$a b$$","$$ab$$"],[8,"$tag$abc$tag$","$tag$abc $tag$"],
  [9,"E'a\\'b'","E'a\\' b'"],
]) test(`SQL literal/quoted identifier difference ${index} never compares exact`,() => {
  assert.notEqual(normalizeBrowserPolicyExpression(left),null);assert.notEqual(normalizeBrowserPolicyExpression(right),null);
  assert.equal(browserPolicyExpressionsEqual(left,right),false);
});
test("syntactic whitespace and redundant parentheses normalize without changing precedence",() => {
  assert.equal(browserPolicyExpressionsEqual("(user_id = platform_request_user_id())"," ( user_id\n =\tplatform_request_user_id ( ) ) "),true);
  assert.equal(browserPolicyExpressionsEqual("(user_id = current_setting('a b'::text,true))","user_id = current_setting( 'a b' :: text , true )"),true);
  assert.equal(browserPolicyExpressionsEqual("a = b or c = d and e = f","(a=b OR (c=d AND e=f))"),true);
  assert.equal(browserPolicyExpressionsEqual("a = b or c = d and e = f","((a=b OR c=d) AND e=f)"),false);
  assert.equal(browserPolicyExpressionsEqual("'a''b'","'a''b'"),true);
  assert.equal(browserPolicyExpressionsEqual("$tag$a b$tag$","$tag$a b$tag$"),true);
});
for(const value of ["'unterminated",'"unterminated',"$tag$unterminated","(a = b", "a = b)","a /* comment */ = b","'a\\b'",""])
  test("ambiguous/unsupported SQL fails closed, even when both inputs are identical",() => {
    assert.equal(normalizeBrowserPolicyExpression(value),null);assert.equal(browserPolicyExpressionsEqual(value,value),false);
  });
for(const [name,change] of [
  ["literal mutation",(p) => {p.using=p.using.replace("reflab.training_user_id","reflab.training_user_id ");}],
  ["role mutation",(p) => {p.roles=["authenticated"];}],
  ["command mutation",(p) => {p.command="ALL";}],
  ["permissiveness mutation",(p) => {p.permissive=false;}],
  ["USING mutation",(p) => {p.using="true";}],
  ["WITH CHECK mutation",(p) => {p.withCheck="true";}],
]) test(`preserved policy ${name} is NOT_EXACT while remaining observation-only`,() => {
  const e=browserForensicFixtureEvidence();const p=payload(e).policies.find((p) => p.name==="training_attempt_profile_read");change(p);
  const r=observe(e);assert.equal(r.classification,"OBSERVATION_COMPLETE");assert.equal(r["64245PostState"].comparison,"NOT_EXACT");
  assert.equal(r["64245PostState"].preservedNonTargetPoliciesExact,false);assert.equal(r.approval,"NOT_PERFORMED");assert.equal(r.mutationCount,0);
});
test("all twenty exact preserved policies still compare exact",() => {
  assert.equal(observe()["64245PostState"].preservedNonTargetPoliciesExact,true);
  assert.equal(observe()["64245PostState"].comparison,"EXACT");
});
