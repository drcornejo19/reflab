import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { executeBrowserForensicReadOnly } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { buildCurrentServiceFixture } from "./phase3-current-service-role-fixture.mjs";
import { buildCurrentServiceBatch, classifyCurrentServiceTransition, classifyLocalCurrentServiceTransition,
  CURRENT_SERVICE_MIGRATION_PATH, CURRENT_FUNCTIONS, PRESERVATION_QUERY_ID, serviceTransitionPreserved } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { serviceMutationAccounting } from "./phase3-current-service-role-matrix.mjs";
import { buildCurrentServiceMigration } from "./phase3-current-service-role-migration-source.mjs";

const safeEnvironment = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG|^ALLOW_PRODUCTION_|^REFLAB_PRODUCTION_/i.test(k)));
const bin = safeEnvironment.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe = (name) => join(bin,name+(process.platform === "win32" ? ".exe" : ""));
const port = await new Promise((done,reject) => {const server=createServer();server.on("error",reject);server.listen(0,"127.0.0.1",() => {
  const p=server.address().port;server.close(() => done(p));});});
const base=resolve(mkdtempSync(join(tmpdir(),"reflab-current-service-pg17-"))), data=join(base,"data");
const connection = (user="postgres",database="postgres") => ({PGHOST:"127.0.0.1",PGPORT:String(port),PGDATABASE:database,PGUSER:user,PGSSLMODE:"disable"});
let started=false,pid,warnings=0,report;
const psqlArgs=["-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","-At"];
function processCommand(name,args,input,user="supabase_admin",database="postgres",failure=false) {
  const r=spawnSync(exe(name),args,{env:buildPsqlEnvironment(safeEnvironment,connection(user,database)),input,encoding:"utf8",windowsHide:true,
    timeout:120000,maxBuffer:32*1024*1024,...(name==="pg_ctl" ? {stdio:"ignore"} : {})});
  warnings+=(String(r.stderr??"").match(/WARNING:/g)??[]).length;
  if(r.error || !failure && r.status!==0) throw new Error(`LOCAL_PG17_${name}_FAILED: ${String(r.stderr??r.error?.code??"").slice(0,1800)}`);
  return r;
}
const sql=(input,user="postgres",db="postgres") => processCommand("psql",psqlArgs,input,user,db).stdout;
const collect=(db="postgres") => executeBrowserForensicReadOnly(buildCurrentServiceBatch(),connection("postgres",db),{
  processEnvironment:safeEnvironment,spawn:(name,args,options) => {assert.equal(name,"psql");assert.equal(options.env.PGHOST,"127.0.0.1");
    assert.match(options.input,/^begin read only;/);assert.match(options.input,/rollback;\s*$/);
    const r=spawnSync(exe(name),args,options);warnings+=(String(r.stderr??"").match(/WARNING:/g)??[]).length;return r;},
});
const migration=readFileSync(new URL("../../../"+CURRENT_SERVICE_MIGRATION_PATH,import.meta.url),"utf8").replaceAll("\r\n","\n");
assert.equal(migration,buildCurrentServiceMigration());
const accounting=serviceMutationAccounting();
try {
  assert.match(processCommand("postgres",["--version"]).stdout,/PostgreSQL\) 17\./);
  processCommand("initdb",["-D",data,"-U","supabase_admin","-A","trust","--no-locale"]);
  processCommand("pg_ctl",["-D",data,"-l",join(base,"postgres.log"),"-o",`-h 127.0.0.1 -p ${port}`,"-w","start"]);started=true;
  pid=Number(readFileSync(join(data,"postmaster.pid"),"utf8").split(/\r?\n/)[0]);
  sql(buildCurrentServiceFixture(),"supabase_admin");
  const before=collect(), inventory=before.get(SERVICE_FORENSIC_QUERY_ID);
  const proof={fixtureStatus:"LOCAL_SYNTHETIC_DATA_ONLY",state:classifyBrowserPrivilegeObservation(before,{targetExact:true}).historicalState,
    functionHashes:Object.fromEntries(inventory.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature,f.sourceHash]))};
  const classify=(e) => classifyLocalCurrentServiceTransition(e,proof);
  const pre=classify(before);assert.equal(pre.classification,"PRE_EXECUTABLE_EXACT",JSON.stringify(pre));
  assert.equal(classifyCurrentServiceTransition(before).classification,"BLOCKER");
  assert.equal(inventory.effectiveTablePrivileges.filter((p) => p.table in Object.fromEntries(accounting.revoked.concat(accounting.granted).map((p) => [p.table,true]))).length,104);
  const negatives={};
  const cases={
    partialRevoke:["revoke maintain on public.attempts from service_role;",false],
    revokesWithoutGrants:[accounting.statements.filter((s) => s.startsWith("revoke ")).join("\n"),false],
    onlyRefereeSelect:["grant select on public.referee_exam_sessions to service_role;",true],
    onlyRefereeInsert:["grant insert on public.referee_exam_sessions to service_role;",false],
    refereeUpdate:["grant update on public.referee_exam_sessions to service_role;",true],
    attemptsInsertRetained:["grant insert on public.attempts to service_role;",true],
    examInsertRetained:["grant insert on public.exam_results to service_role;",true],
    missingMaintain:["revoke maintain on public.exam_results from service_role;",false],
    maintainPost:["grant maintain on public.exam_results to service_role;",true],
    publicPath:["grant delete on public.attempts to public;",false],
    membershipPath:["grant reflab_rls_owner to service_role with inherit true, set false;",false,"revoke reflab_rls_owner from service_role;"],
    wrongGrantor:["grant delete on public.attempts to reflab_rls_owner with grant option; set session authorization reflab_rls_owner; grant delete on public.attempts to service_role; reset session authorization;",false],
    grantOption:["grant select on public.attempts to service_role with grant option;",false],
    bypassRls:["alter role service_role nobypassrls;",false,"alter role service_role bypassrls;"],
    browserDrift:["grant maintain on public.attempts to authenticated;",false],
    profileColumnDrift:["grant update(user_id) on public.user_profiles to authenticated;",false],
    policyDrift:["alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",false],
    literalPolicy:["alter policy training_attempt_profile_read on public.user_profiles using(user_id=current_setting('reflab.training_user_id ',true));",false],
    refereePolicy:["create policy local_unexpected on public.referee_exam_sessions for select to authenticated using(true);",false],
    functionMode:[`alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,false],
    functionOwner:[`alter function ${CURRENT_FUNCTIONS[0].signature} owner to reflab_rls_owner;`,false],
    functionSource:[`create or replace function ${CURRENT_FUNCTIONS[0].signature} returns jsonb language plpgsql security definer set search_path=public as $$begin return '{"drift":true}'::jsonb; end$$;`,false],
    functionExecute:[`grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`,false],
    identity64236:["grant execute on function reflab_private.request_user_id() to public;",false],
    owner:["alter table public.referee_exam_sessions owner to service_role;",false],
    rls:["alter table public.referee_exam_sessions disable row level security;",false],
    force:["alter table public.referee_exam_sessions force row level security;",false],
    historical:["insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",false],
    ledger:["update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",false],
    runtime:["insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",false],
    cutover:["create role reflab_pre_cutover_evidence_owner nologin;",false,"drop role reflab_pre_cutover_evidence_owner;"],
    phase4:["comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",false],
  };
  let caseNumber=0;
  for(const [name,[mutation,post,restore]] of Object.entries(cases)) {
    const db=`local_current_service_${caseNumber++}`;
    sql(`create database ${db} template postgres;`,"supabase_admin");
    try {
      if(post) sql(accounting.statements.join("\n"),"postgres",db);
      if(name==="onlyRefereeSelect") sql("revoke insert on public.referee_exam_sessions from service_role;","postgres",db);
      else sql(mutation,"supabase_admin",db);
      const r=classify(collect(db));assert.equal(r.classification,"BLOCKER",`${name}: ${JSON.stringify(r)}`);negatives[name]="PASS";
    } finally {
      if(restore) sql(restore,"supabase_admin",db);
      sql(`drop database ${db};`,"supabase_admin");
    }
  }
  assert.deepEqual(collect(),before);
  let rollbackCases=0;
  const rollback=(text,name) => {
    const r=processCommand("psql",psqlArgs,text,"postgres","postgres",true);
    assert.notEqual(r.status,0,`${name}: injected failure did not fail`);assert.match(r.stderr,/P0001|55000/);
    assert.deepEqual(collect(),before,`${name}: rollback did not restore complete PRE`);rollbackCases++;
  };
  for(const [i,statement] of accounting.statements.entries()) rollback(migration.replace(statement,statement+"\n  raise exception 'LOCAL_INJECTED_FAILURE' using errcode='P0001';"),`afterStatement${i+1}`);
  rollback(migration.replace("  -- BEGIN AUTHORIZED SERVICE TABLE ACL STATEMENTS","  raise exception 'LOCAL_INJECTED_FAILURE' using errcode='P0001';\n  -- BEGIN AUTHORIZED SERVICE TABLE ACL STATEMENTS"),"beforeMutation");
  const afterMutations="  -- END AUTHORIZED SERVICE TABLE ACL STATEMENTS";
  for(const [name,injected] of Object.entries({
    additionalAcl:"grant delete on public.clips to service_role;",
    additionalColumn:"grant select(id) on public.coach_rate_limit_buckets to service_role;",
    browserAcl:"grant maintain on public.attempts to authenticated;",
    policy:"alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",
    function:`alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,
    historical:"insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",
    adoption:"update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",
    runtime:"insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",
    phase4:"comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",
    cutover:"create role reflab_pre_cutover_evidence_owner nologin;",
  })) rollback(migration.replace(afterMutations,injected+"\n"+afterMutations),name);
  rollback(migration.replace("commit;",() => "do $$begin raise exception 'LOCAL_INJECTED_FAILURE' using errcode='P0001'; end$$;\ncommit;"),"beforeCommit");
  let invocations=0;
  if(classify(collect()).executablePre) {invocations++;sql(migration);}
  assert.equal(invocations,1);
  const after=collect(),post=classify(after);assert.equal(post.classification,"ALREADY_INSTALLED_POST",JSON.stringify(post));
  assert.equal(serviceTransitionPreserved(before,after),true);
  const second=classify(after);assert.equal(second.migrationInvocationCount,0);assert.equal(second.reexecutionRefused,true);
  const refused=processCommand("psql",psqlArgs,migration,"postgres","postgres",true);
  assert.notEqual(refused.status,0);assert.match(refused.stderr,/55000/);assert.deepEqual(collect(),after);
  assert.equal(before.get(PRESERVATION_QUERY_ID),after.get(PRESERVATION_QUERY_ID));assert.equal(warnings,0);
  report={format:"LOCAL_CURRENT_INSTALLED_SERVICE_ROLE_PG17",result:"PASS",evidence:"SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH",
    pre:pre.classification,migration:"PASS",migrationInvocationCount:invocations,post:post.classification,transaction:"COMMIT",
    secondInvocationCount:0,reexecution:"REFUSED",sqlReexecution:"REFUSED",primaryEffectiveCells:104,
    preGrantedCells:accounting.preGrantedCells,postGrantedCells:accounting.postGrantedCells,postAbsentCells:accounting.postAbsentCells,
    effectivePrivilegeEntryRevocations:accounting.effectivePrivilegeEntryRevocations,effectivePrivilegeEntryGrants:accounting.effectivePrivilegeEntryGrants,
    unchangedCells:accounting.unchangedCells,sqlRevokeStatements:accounting.sqlRevokeStatementCount,sqlGrantStatements:accounting.sqlGrantStatementCount,
    negativeCases:Object.keys(negatives).length,negativeOutcomes:negatives,rollbackCases,protectedCatalogsPreserved:true,
    productionClassifierRejectsSynthetic:true,approval:"NOT_PERFORMED",productionDdlAuthorized:false,warnings};
} finally {
  if(started || existsSync(join(data,"postmaster.pid"))) processCommand("pg_ctl",["-D",data,"-m","immediate","-w","stop"]);
  if(existsSync(join(data,"postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if(pid) {let alive=false;try {process.kill(pid,0);alive=true;}catch { /* Must have exited. */ }if(alive) throw new Error("LOCAL_PG17_RESIDUAL_PROCESS");}
  if(!base.startsWith(resolve(tmpdir())+sep) || !base.split(sep).at(-1).startsWith("reflab-current-service-pg17-")) throw new Error("LOCAL_CLEANUP_PATH_REJECTED");
  rmSync(base,{recursive:true,force:true});
}
console.log(JSON.stringify({...report,residualClusters:0,residualProcesses:0}));
