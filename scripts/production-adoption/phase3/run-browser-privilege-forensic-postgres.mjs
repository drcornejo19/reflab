import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment, parseJsonResults } from "../../production-preflight/run.mjs";
import { buildBrowserPrivilegeForensicBatch, classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { buildBrowserForensicMechanicalFixture, BROWSER_FIXTURE_STATUS } from "./phase3-browser-privilege-forensic-fixture.mjs";

const bin=process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe=(name) => join(bin,name+(process.platform==="win32" ? ".exe" : ""));
const port=await new Promise((done,reject) => {const s=createServer();s.on("error",reject);
  s.listen(0,"127.0.0.1",() => {const p=s.address().port;s.close(() => done(p));});});
const base=resolve(mkdtempSync(join(tmpdir(),"reflab-browser-forensic-pg17-")));
const data=join(base,"data");let started=false;let warnings=0;let cases=0;
function command(name,args,input,user="supabase_admin") {
  const env=buildPsqlEnvironment(process.env,{PGHOST:"127.0.0.1",PGPORT:String(port),PGDATABASE:"postgres",PGUSER:user,PGSSLMODE:"disable"});
  const r=spawnSync(exe(name),args,{env,input,encoding:"utf8",windowsHide:true,timeout:60000,maxBuffer:16*1024*1024,
    ...(name==="pg_ctl" ? {stdio:"ignore"} : {})});
  if(r.error || r.status!==0) throw new Error(`LOCAL_PG17_${name.toUpperCase()}_FAILED: ${String(r.stderr??r.error?.code??"").slice(0,1200)}`);
  warnings+=(String(r.stderr??"").match(/WARNING:/g)??[]).length;return r.stdout;
}
const sql=(s,user) => command("psql",["-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","-At"],s,user);
const observe=() => classifyBrowserPrivilegeObservation(parseJsonResults(sql(buildBrowserPrivilegeForensicBatch(),"postgres")),{targetExact:true});
let report;
try {
  assert.match(command("postgres",["--version"]),/PostgreSQL\) 17\./);
  command("initdb",["-D",data,"-U","supabase_admin","-A","trust","--no-locale"]);
  command("pg_ctl",["-D",data,"-l",join(base,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
  sql(buildBrowserForensicMechanicalFixture());
  const before=observe();assert.equal(before.classification,"OBSERVATION_COMPLETE",JSON.stringify(before.failedChecks));
  assert.equal(before["64236State"].comparison,"EXACT");assert.equal(before["64245PostState"].comparison,"EXACT",JSON.stringify(before["64245PostState"]));
  assert.equal(before.tables.length,13);assert.equal(before.effectiveBrowserPrivileges.length,208);cases++;
  assert.ok(before.tableAcls.some((a) => a.grantee==="PUBLIC" && a.table==="user_global_roles" && a.privilege==="SELECT"));
  assert.ok(before.tableAcls.some((a) => a.table==="referee_exam_sessions" && a.grantee==="authenticated" && a.grantable));cases++;
  assert.ok(before.extraThreeTables.user_global_roles.effectiveAnonPrivileges.some((p) => p.privilege==="SELECT" && p.granted));
  assert.ok(before.extraThreeTables.user_subscriptions.effectiveAuthenticatedPrivileges.some((p) => p.privilege==="MAINTAIN" && p.granted));
  assert.ok(!before.tableAcls.some((a) => a.table==="user_subscriptions" && a.grantee==="authenticated" && a.privilege==="MAINTAIN"));cases++;
  assert.ok(before.columnAcls.some((a) => a.table==="user_profiles" && a.column==="display_name" && a.privilege==="UPDATE"));
  assert.ok(before.effectiveBrowserColumnPrivileges.some((a) => a.table==="user_profiles" && a.column==="display_name" && a.role==="authenticated" && a.privilege==="UPDATE" && a.granted));cases++;
  assert.equal(Object.keys(before.extraThreeTables).length,3);assert.equal(before.policies.length,45);cases++;
  assert.deepEqual(observe(),before);assert.equal(before.mutationCount,0);assert.equal(before.approval,"NOT_PERFORMED");cases++;
  const e=parseJsonResults(sql(buildBrowserPrivilegeForensicBatch(),"postgres"));e.set("read_only_guard","off");
  assert.equal(classifyBrowserPrivilegeObservation(e,{targetExact:true}).classification,"BLOCKER");cases++;
  // The read-only transaction itself must reject a write, independent of the JS guard.
  const rejected=spawnSync(exe("psql"),["-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","-At"],{
    env:buildPsqlEnvironment(process.env,{PGHOST:"127.0.0.1",PGPORT:String(port),PGDATABASE:"postgres",PGUSER:"postgres",PGSSLMODE:"disable"}),
    input:"begin read only; insert into public.clips(id) values(-1); rollback;",encoding:"utf8",windowsHide:true,timeout:15000});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/25006/);assert.deepEqual(observe(),before);cases++;
  assert.equal(warnings,0);
  report={format:"LOCAL_64249_BROWSER_FORENSIC_PG17_REHEARSAL",fixtureStatus:BROWSER_FIXTURE_STATUS,result:"PASS",cases,
    predecessor64236:"EXACT",predecessor64245:"EXACT",tables:13,effectiveTableResults:208,
    policies:before.policies.length,columnAclEntries:before.columnAcls.length,observation:"OBSERVATION_COMPLETE",
    mutationsByCollector:0,migrationsExecuted:0,privilegeWarnings:warnings};
} finally {
  if(started || existsSync(join(data,"postmaster.pid"))) command("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  if(existsSync(join(data,"postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if(!base.startsWith(resolve(tmpdir())+sep) || !base.split(sep).at(-1).startsWith("reflab-browser-forensic-pg17-"))
    throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({...report,residualClusters:0,residualProcesses:0}));
