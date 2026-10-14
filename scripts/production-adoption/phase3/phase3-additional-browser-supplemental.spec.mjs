import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { supplementalTypeSql, supplementalFunctionSql, discoverIoFunctions, classifySupplemental, validateSupplementalForMerge,
  FORMAT, COMPLETE, ARCHIVE_SHA, FUNCTION_OIDS, TYPE_OIDS, VARIABLES, TARGET, RUNNER, serializeCurrentHarness } from "./phase3-additional-browser-supplemental-contract.mjs";
import { attestSupplemental, runProductionSupplemental, runSupplementalCli } from "./run-production-additional-browser-supplemental-forensic.mjs";
import { supplementalTypes, supplementalFunction, supplementalFixtureReport, fixtureEnv, fixtureDependencies,
  captureSupplementalSession, fixturePassword } from "./phase3-additional-browser-supplemental-fixture.mjs";
import { browserFixtureEvidence } from "./phase3-additional-browser-forensic-fixture.mjs";
import { buildBrowserReport } from "./phase3-additional-browser-forensic-contract.mjs";
import { mergeBrowserSupplemental } from "./reprocess-additional-browser-forensic.mjs";

test("query capture proves supplemental-only scope, zero inventory invocation and zero broad table/policy/ACL/column reads", async () => {
  const s = captureSupplementalSession(), r = await attestSupplemental(s);
  assert.equal(r.classification, COMPLETE); assert.equal(s.queries.length, 5);
  assert.deepEqual(s.lifecycle, ["ROLLBACK", "CLOSE"]);
  assert.match(s.queries[0], /begin read only/i); assert.match(s.queries[0], /repeatable read/i);
  assert.match(s.queries[1], /transaction_read_only/);
  assert.match(s.queries[2], /where p.oid in \(2956,3214\)/);
  assert.match(s.queries[3], /where t.oid in \(25,2950\)/);
  assert.match(s.queries[4], /where p.oid in \(8001,8002\)/);
  for (const fragment of ["inventorySql", "additional_browser_inventory", "from pg_class", "pg_policy", "pg_attribute",
    "has_table_privilege", "has_column_privilege", "effectiveTables", "columnAcls", "tableAcls"])
    assert.equal(s.queries.filter((q) => q.includes(fragment)).length, 0, fragment);
  const source = readFileSync(new URL("./run-production-additional-browser-supplemental-forensic.mjs", import.meta.url), "utf8");
  assert.equal(/inventorySql|observeBrowserCatalog|runProductionBrowserForensic/.test(source), false);
});
test("fixed type and initial function OIDs", () => { assert.deepEqual(TYPE_OIDS, [25,2950]); assert.deepEqual(FUNCTION_OIDS, [2956,3214]); });
test("only required I/O fields expand the function set", () => { const t = supplementalTypes();
  assert.deepEqual(discoverIoFunctions(t), [8001,8002]); assert.throws(() => supplementalFunctionSql([8003],t)); });
test("duplicate I/O OIDs deduplicated", async () => { const t = supplementalTypes(); t[1].typoutput=t[0].typinput;
  assert.deepEqual(discoverIoFunctions(t), [8001]); const s=captureSupplementalSession({types:t});
  const r=await attestSupplemental(s); assert.equal(r.classification,COMPLETE); assert.equal(r.ioFunctionEvidence.length,1); });
test("I/O overlap with direct functions avoids duplicate query", async () => { const t=supplementalTypes();t[0].typinput=2956;t[1].typoutput=3214;
  const s=captureSupplementalSession({types:t}); const r=await attestSupplemental(s);
  assert.equal(r.classification,COMPLETE);assert.equal(s.queries.length,4); });
for(const id of [0,-1,null,undefined,1.5,4294967296,"3214",8009])test(`arbitrary function scope rejected ${id}`,()=>assert.throws(()=>supplementalFunctionSql([id])));
for(const key of ["oid","namespaceOid","schema","name","typinput","typoutput"])for(const value of [null,undefined,""])
  test(`type missing ${key} ${value} fails closed`,async()=>{const types=supplementalTypes();types[0][key]=value;
    const s=captureSupplementalSession({types});const r=await attestSupplemental(s);assert.equal(r.classification,"UNKNOWN");assert.equal(s.queries.length,4);});
for(const id of [25,2950])test(`missing type ${id} UNKNOWN`,async()=>{const r=await attestSupplemental(captureSupplementalSession({types:supplementalTypes().filter(t=>t.oid!==id)}));assert.equal(r.classification,"UNKNOWN");});
for(const id of [2956,3214,8001,8002])test(`missing required function ${id} UNKNOWN`,async()=>{
  const functions=[2956,3214,8001,8002].filter(x=>x!==id).map(supplementalFunction);
  assert.equal((await attestSupplemental(captureSupplementalSession({functions}))).classification,"UNKNOWN");});
for(const key of ["owner","language","schema","name","returnType","securityDefiner","sourceSha256","executeAcls","effectiveExecute","catalogDependencies","rawAcl","sqlBodyTree","configuration"])
  test(`incomplete function ${key} rejected`,()=>{const r=supplementalFixtureReport();delete r.directFunctionEvidence[0][key];assert.equal(classifySupplemental(r).classification,"UNKNOWN");});
test("PostgreSQL raw ACL JSON arrays preserved",()=>{const r=supplementalFixtureReport();r.directFunctionEvidence[0].rawAcl=["=X/postgres"];
  assert.equal(classifySupplemental(r).classification,COMPLETE);});
test("malformed raw ACL JSON array fails closed",()=>{const r=supplementalFixtureReport();r.directFunctionEvidence[0].rawAcl=[{}];
  assert.equal(classifySupplemental(r).classification,"UNKNOWN");});
for(const key of ["requestedFunctionOids","requestedTypeOids","discoveredIoFunctionOids","typeEvidence","directFunctionEvidence","ioFunctionEvidence"])
  test(`extra supplemental ${key} rejected`,()=>{const r=supplementalFixtureReport();r[key].push(typeof r[key][0]==="number"?9999:{...r[key][0],oid:9999});
    assert.throws(()=>validateSupplementalForMerge(r,ARCHIVE_SHA,TARGET));});
const archive=()=>({...buildBrowserReport(browserFixtureEvidence(),[]),transaction:"ROLLBACK",mutationCount:0,ddlCount:0,dmlCount:0,migrationInvocationCount:0,target:TARGET});
test("merge is immutable and records separated snapshot provenance",()=>{const a=archive(),s=supplementalFixtureReport(),before=JSON.stringify([a,s]);
  const r=mergeBrowserSupplemental(a,s,ARCHIVE_SHA);assert.equal(r.classification,"ADDITIONAL_RUNTIME_BROWSER_POLICY_COLUMN_OBSERVATION_COMPLETE");
  assert.equal(JSON.stringify([a,s]),before);assert.match(r.supplementalProvenance.boundary,/SEPARATE_READ_ONLY/);});
test("matching archived function retains prior relation evidence and ignores object key order",()=>{const a=archive(),s=supplementalFixtureReport();
  const f=Object.fromEntries(Object.entries(s.directFunctionEvidence[0]).reverse());f.relationIdentities=[];a.additionalRuntimePolicyFunctions.push(f);
  const r=mergeBrowserSupplemental(a,s,ARCHIVE_SHA);assert.deepEqual(r.additionalRuntimePolicyFunctions.find(x=>x.oid===f.oid).relationIdentities,[]);});
test("conflicting archived source identity rejected",()=>{const a=archive(),s=supplementalFixtureReport();a.additionalRuntimePolicyFunctions.push({...s.directFunctionEvidence[0],sourceSha256:"0".repeat(64)});
  assert.throws(()=>mergeBrowserSupplemental(a,s,ARCHIVE_SHA));});
for(const key of ["format","archiveSha256Expected","transaction","classification","approvedHead","runnerArtifactExact","protectedArtifactsExact","approval"])
  test(`merge rejects altered ${key}`,()=>{const s=supplementalFixtureReport();s[key]="wrong";assert.throws(()=>mergeBrowserSupplemental(archive(),s,ARCHIVE_SHA));});
test("wrong archive hash rejected",()=>assert.throws(()=>mergeBrowserSupplemental(archive(),supplementalFixtureReport(),"0".repeat(64))));
for(const key of Object.keys(TARGET)) {
  test(`supplement target mismatch ${key}`,()=>{const s=supplementalFixtureReport();s.target={...TARGET,[key]:"wrong"};assert.throws(()=>mergeBrowserSupplemental(archive(),s,ARCHIVE_SHA));});
  test(`archive target mismatch ${key}`,()=>{const a=archive();a.target={...TARGET,[key]:"wrong"};assert.throws(()=>mergeBrowserSupplemental(a,supplementalFixtureReport(),ARCHIVE_SHA));});
}
for(const key of ["mutationCount","ddlCount","dmlCount","migrationInvocationCount"])test(`nonzero ${key} rejected`,()=>{const s=supplementalFixtureReport();s[key]=1;assert.throws(()=>mergeBrowserSupplemental(archive(),s,ARCHIVE_SHA));});
test("missing I/O function cannot merge",()=>{const s=supplementalFixtureReport();s.ioFunctionEvidence.pop();assert.throws(()=>mergeBrowserSupplemental(archive(),s,ARCHIVE_SHA));});
test("conflicting overlap cannot merge",()=>{const s=supplementalFixtureReport();s.typeEvidence[0].typinput=2956;s.discoveredIoFunctionOids=[2956,8002];
  s.ioFunctionEvidence=[{...s.directFunctionEvidence[0],name:"conflict"},s.ioFunctionEvidence[1]];assert.throws(()=>mergeBrowserSupplemental(archive(),s,ARCHIVE_SHA));});
test("no recursive expansion even with function catalog dependencies",async()=>{const f=[2956,3214,8001,8002].map(supplementalFunction);f[0].catalogDependencies=[{catalog:"pg_proc",oid:9000,subobject:0}];
  const s=captureSupplementalSession({functions:f});const r=await attestSupplemental(s);assert.equal(r.classification,COMPLETE);assert.equal(s.queries.some(q=>q.includes("in (9000)")),false);});
test("read-only false stops observation and rolls back",async()=>{const s=captureSupplementalSession({readOnly:"off"});const r=await attestSupplemental(s);
  assert.equal(r.classification,"UNKNOWN");assert.equal(s.queries.length,2);assert.deepEqual(s.lifecycle,["ROLLBACK","CLOSE"]);});
for(const index of [0,1,2,3,4])test(`query failure ${index} rolls back`,async()=>{const s=captureSupplementalSession(),query=s.query;let i=0;
  s.query=async q=>{if(i++===index)throw new Error("test failure");return query(q);};assert.equal((await attestSupplemental(s)).classification,"UNKNOWN");assert.deepEqual(s.lifecycle,["ROLLBACK","CLOSE"]);});
test("rollback unacknowledged never complete",async()=>{const s=captureSupplementalSession();s.rollback=async()=>{throw new Error("test");};const r=await attestSupplemental(s);assert.equal(r.classification,"UNKNOWN");});
test("overall timeout fails closed",async()=>{const s=captureSupplementalSession();s.query=async()=>new Promise(()=>{});assert.equal((await attestSupplemental(s,{overallMs:5})).classification,"UNKNOWN");});
const gates = [
  ["wrong operation",(e,d)=>{d.argument="--production-additional-runtime-browser-policy-column-forensic";}],
  ["wrong HEAD",e=>{e[VARIABLES[4]]="b".repeat(40);}],
  ...["dirty","staged","untracked"].map((name)=>[name,(e,d)=>{const old=d.git;d.git=args=>args[0]==="status"?({dirty:" M file",staged:"M  file",untracked:"?? file"}[name]):old(args);}]),
  ["runner drift",(e,d)=>{d.readRunnerBytes=()=>Buffer.from("drift");}],
  ["transitive drift",(e,d)=>{const old=d.readCheckout;d.readCheckout=p=>p.endsWith("phase3-additional-browser-subquery.mjs")?Buffer.from("drift"):old(p);}],
  ...VARIABLES.slice(0,3).map(k=>["missing "+k,e=>{delete e[k];}]),
  ["broad authorization alone",e=>{delete e[VARIABLES[2]];e.ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_BROWSER_FORENSIC="true";}],
  ["conflicting DDL",e=>{e.ALLOW_PRODUCTION_DDL="true";}],
  ["secret-safety failure",e=>{const u=new URL(e[VARIABLES[5]]);u.password=TARGET.project;e[VARIABLES[5]]=u.href;}],
  ["wrong project",e=>{e[VARIABLES[3]]="wrong";}],
  ...["host","port","database","installer","sslmode"].map(k=>["wrong "+k,e=>{const u=new URL(e[VARIABLES[5]]);if(k==="host")u.hostname="localhost";if(k==="port")u.port="6543";if(k==="database")u.pathname="/wrong";if(k==="installer")u.username="wrong";if(k==="sslmode")u.searchParams.set("sslmode","disable");e[VARIABLES[5]]=u.href;}]),
  ...["PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGSSLMODE","PGOPTIONS","PGSERVICE","PGSERVICEFILE","PGPASSFILE","NODE_OPTIONS","NODE_PATH","NODE_TEST"].map(k=>[k,e=>{e[k]="unexpected";}]),
];
for(const [name,mutate] of gates)test(`preconnection zero sessions ${name}`,async()=>{const e=fixtureEnv(),d=fixtureDependencies();mutate(e,d);let count=0;
  d.createSession=()=>{count++;return captureSupplementalSession();};await assert.rejects(()=>runProductionSupplemental(e,d));assert.equal(count,0);});
test("all gates pass before a single synthetic session",async()=>{let count=0;const r=await runProductionSupplemental(fixtureEnv(),{...fixtureDependencies(),createSession:()=>{count++;return captureSupplementalSession();}});
  assert.equal(count,1);assert.equal(r.classification,COMPLETE);assert.ok(Object.keys(r.artifactHashes).includes(RUNNER));});
for(const secret of [fixturePassword,encodeURIComponent(fixturePassword),fixtureEnv()[VARIABLES[5]]])test(`serializer rejects synthetic secret ${secret.length}`,()=>{
  assert.throws(()=>serializeCurrentHarness({...supplementalFixtureReport(),reason:secret},fixtureEnv()));});
test("credential-bearing error cannot serialize",async()=>{const s=captureSupplementalSession();s.query=async()=>{throw new Error(fixtureEnv()[VARIABLES[5]]);};
  const r=await attestSupplemental(s);assert.equal(JSON.stringify(r).includes(fixturePassword),false);assert.equal(JSON.stringify(r).includes("postgresql://"),false);});
test("CLI redacts before serialization and fails closed",async()=>{let output="";const code=await runSupplementalCli(fixtureEnv(),{run:async()=>({...supplementalFixtureReport(),reason:fixturePassword}),write:x=>{output=x;}});
  assert.equal(code,1);assert.equal(output.includes(fixturePassword),false);assert.match(output,/OUTPUT_REDACTION_FAILED/);});
test("CLI refuses incomplete success",async()=>{const s=supplementalFixtureReport();s.ioFunctionEvidence=[];let output="";
  assert.equal(await runSupplementalCli({}, {run:async()=>s,write:x=>{output=x;}}),1);assert.match(output,/OUTPUT_CONTRACT_MISMATCH/);});
test("SQL has fixed scopes and no writes or broad catalog scans",()=>{for(const sql of [supplementalTypeSql(),supplementalFunctionSql([2956,3214]),supplementalFunctionSql([8001,8002],supplementalTypes())])
  assert.equal(/\b(create|alter|grant|revoke|insert|update|delete|commit)\b|from pg_class|pg_policy|pg_attribute|inventory/i.test(sql),false);});
test("dedicated output format not broad snapshot",()=>{const s=supplementalFixtureReport();assert.equal(s.format,FORMAT);assert.equal(Object.hasOwn(s,"additionalRuntimeTables"),false);});
