import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment, parseJsonResults } from "../../production-preflight/run.mjs";
import { buildBrowserTransitionBatch, observeBrowserTransitionResults, classifyLocalBrowserTransition,
  browserMutationAccounting, BROWSER_MIGRATION_PATH, BROWSER_MIGRATION_SHA } from "./phase3-browser-privilege-contract.mjs";
import { buildBrowserLineageFixture } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserPolicyExpressionsEqual } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";

const bin=process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe=(name) => join(bin,name+(process.platform==="win32" ? ".exe" : ""));
const port=await new Promise((done,reject) => {const s=createServer();s.on("error",reject);
  s.listen(0,"127.0.0.1",() => {const p=s.address().port;s.close(() => done(p));});});
const base=resolve(mkdtempSync(join(tmpdir(),"reflab-browser-transition-pg17-"))),data=join(base,"data");
let started=false,warnings=0,rollbacks=0,calls=0;
const env=(user="postgres") => buildPsqlEnvironment(process.env,{PGHOST:"127.0.0.1",PGPORT:String(port),PGDATABASE:"postgres",PGUSER:user,PGSSLMODE:"disable"});
function command(name,args,input,user="supabase_admin") {
  const r=spawnSync(exe(name),args,{env:env(user),input,encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:32*1024*1024,
    ...(name==="pg_ctl" ? {stdio:"ignore"} : {})});
  if(r.error || r.status!==0) throw new Error(`LOCAL_PG17_${name.toUpperCase()}_FAILED: ${String(r.stderr??r.error?.code??"").slice(0,2000)}`);
  warnings+=(String(r.stderr??"").match(/WARNING:/g)??[]).length;return r.stdout;
}
const args=["-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","-At"];
const sql=(s,user="postgres") => command("psql",args,s,user);
const observe=() => observeBrowserTransitionResults(parseJsonResults(sql(buildBrowserTransitionBatch())));
const migration=readFileSync(new URL("../../../"+BROWSER_MIGRATION_PATH,import.meta.url),"utf8").replaceAll("\r\n","\n");
assert.equal(createHash("sha256").update(migration).digest("hex"),BROWSER_MIGRATION_SHA);
let report;
try {
  assert.match(command("postgres",["--version"]),/PostgreSQL\) 17\./);
  command("initdb",["-D",data,"-U","supabase_admin","-A","trust","--no-locale"]);
  command("pg_ctl",["-D",data,"-l",join(base,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
  sql(buildBrowserLineageFixture(),"supabase_admin");
  const before=observe();
  assert.equal(before.classification,"OBSERVATION_COMPLETE",JSON.stringify(before.failedChecks));
  const localSyntheticHistorical={fixtureStatus:"LOCAL_SYNTHETIC_DATA_ONLY",state:before.historicalState};
  const classify=(observation) => classifyLocalBrowserTransition(observation,localSyntheticHistorical);
  const gate=(observation) => {const r=classify(observation);return {...r,migrationInvocationCount:0,reexecutionRefused:r.classification==="64249_ALREADY_INSTALLED_POST"};};
  const pre=classify(before);
  assert.equal(pre.classification,"64249_PRE_EXECUTABLE_EXACT",JSON.stringify({pre,policyDifferences:before.policies.filter((p) => {
    const expected=baseline.policies.find((q) => q.table===p.table && q.name===p.name);
    return !expected || !browserPolicyExpressionsEqual(p.using,expected.using) || !browserPolicyExpressionsEqual(p.withCheck,expected.withCheck);
  })}));
  assert.equal(before["64236State"].comparison,"EXACT");assert.equal(before["64245PostState"].comparison,"EXACT");
  // Deliberately force SQL failures at partial-ACL and pre-COMMIT boundaries. Disconnect guarantees rollback.
  const positions=[
    migration.indexOf("from anon;")+"from anon;".length,
    migration.indexOf("from authenticated;")+"from authenticated;".length,
    migration.indexOf("grant select on table public.referee_exam_sessions to authenticated;")+"grant select on table public.referee_exam_sessions to authenticated;".length,
    migration.indexOf("grant update (") ,
    migration.lastIndexOf("select (\n  with expected"),
    migration.lastIndexOf("end\n$browser_transition$;"),
  ];
  assert.ok(positions.every((i) => i>0));
  for(const i of positions) {
    const forced=migration.slice(0,i)+"\n raise exception 'LOCAL_FORCED_ROLLBACK' using errcode='P0001';\n"+migration.slice(i);
    const r=spawnSync(exe("psql"),args,{env:env(),input:forced,encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:32*1024*1024});
    assert.notEqual(r.status,0);assert.match(r.stderr,/P0001/);
    assert.deepEqual(observe(),before);rollbacks++;
  }
  if(gate(observe()).executablePre) {calls++;sql(migration);}
  assert.equal(calls,1);const after=observe(),post=classify(after);
  assert.equal(post.classification,"64249_ALREADY_INSTALLED_POST",JSON.stringify(post));
  const second=gate(after);assert.equal(second.migrationInvocationCount,0);assert.equal(second.reexecutionRefused,true);
  // SQL's own exact PRE must also refuse installed POST, independently of the JS gate.
  const rejected=spawnSync(exe("psql"),args,{env:env(),input:migration,encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:32*1024*1024});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/55000/);assert.deepEqual(observe(),after);
  assert.match(sql("begin; set local role authenticated; select count(*) from public.referee_exam_sessions; rollback;"),/\n0\r?\n/);
  assert.equal(warnings,0);const accounting=browserMutationAccounting();
  report={format:"LOCAL_64249_CURRENT_LINEAGE_PG17_REHEARSAL",catalogEvidence:"OBSERVED_PRODUCTION_PRE_INPUT",
    rowData:"LOCAL_SYNTHETIC_DATA_ONLY",predecessor64236:"EXACT",predecessor64245:"EXACT",pre:pre.classification,
    migration:"PASS",migrationInvocationCount:calls,transaction:"COMMIT",post:post.classification,secondInvocation:second,
    tableRevokes:accounting.tableRevokeCount,tableGrants:accounting.tableGrantCount,columnGrants:accounting.columnGrantCount,
    tables:13,policies:after.policies.length,tableAcls:after.tableAcls.length,columnAcls:after.columnAcls.length,
    effectiveBrowserResults:after.effectiveBrowserPrivileges.length,rollbackCases:rollbacks,sqlReexecution:"REFUSED",warnings};
} finally {
  if(started || existsSync(join(data,"postmaster.pid"))) command("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  if(existsSync(join(data,"postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if(!base.startsWith(resolve(tmpdir())+sep) || !base.split(sep).at(-1).startsWith("reflab-browser-transition-pg17-")) throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({...report,residualClusters:0,residualProcesses:0}));
