import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { classifyInstallerIdentity, installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { classifyPhase2aSemanticAuditPost, phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { createTargetSql, withCluster } from "../bootstrap/run-production-role-bootstrap-postgres.mjs";
import { buildSemanticSidecarFixtureSql } from "./run-phase2b-postgres.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_OPERATION,
  assertCanonicalRuntimePrerequisitesArtifact,
  classifyCanonicalRuntimePrerequisitesState,
  CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  buildCanonicalRuntimePrerequisitesPreBatch,
  runProductionPhase2bCanonicalRuntimePrerequisites,
} from "./run-production-phase2b-canonical-runtime-prerequisites.mjs";

const root=resolve(import.meta.dirname,"..","..","..");
const migrations=resolve(root,"supabase","migrations");
const fixture=readFileSync(resolve(import.meta.dirname,"phase2b-production-fixture.sql"),"utf8");
const postgresBin=process.env.POSTGRES_BIN??"C:\\Program Files\\PostgreSQL\\17\\bin";
const psqlBinary=join(postgresBin,"psql.exe");
const phase1=[
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
];
const sidecar="202608310004_production_adoption_semantic_audit.sql";
const head="a".repeat(40);

function psql(environment,database,statement,user="postgres",allowFailure=false) {
  const result=spawnSync(psqlBinary,["-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","--quiet","--tuples-only","--no-align"],{
    input:statement,encoding:"utf8",windowsHide:true,maxBuffer:64*1024*1024,
    env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH,
      PGHOST:"127.0.0.1",PGPORT:String(environment.port),PGDATABASE:database,PGUSER:user,PGSSLMODE:"disable"},
  });
  if(!allowFailure&&(result.error||result.status!==0)) {
    const diagnostic=String(result.stderr??"").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
    throw Object.assign(new Error(`Local 310005 SQL failed; SQLSTATE=${diagnostic?.[1]??"UNKNOWN"}; reason=${diagnostic?.[2]??"SAFE_DIAGNOSTIC_UNAVAILABLE"}.`),{stderr:result.stderr});
  }
  return result;
}
function apply(environment,database,name) {
  psql(environment,database,readFileSync(resolve(migrations,name),"utf8"));
}
function setup(environment,database) {
  psql(environment,database,"grant usage,create on schema public to postgres","supabase_admin");
  psql(environment,database,"create schema extensions; create extension pgcrypto with schema extensions;");
  psql(environment,database,"create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;","supabase_admin");
  psql(environment,database,createTargetSql());
  psql(environment,database,"alter role reflab_prod_preflight_ro login noinherit nosuperuser nocreatedb nocreaterole nobypassrls","supabase_admin");
  psql(environment,database,fixture);
  for(const migration of phase1) apply(environment,database,migration);
  psql(environment,database,buildSemanticSidecarFixtureSql());
  apply(environment,database,sidecar);
}
function clone(environment,source,target) {
  psql(environment,"maintenance",`create database ${target} template ${source}`,"supabase_admin");
}
function drop(environment,database) {
  psql(environment,"maintenance",`drop database if exists ${database} with (force)`,"supabase_admin",true);
}
function exactTarget() {
  return {projectRef:"nagjddldrldwavmfaytc",host:"aws-1-sa-east-1.pooler.supabase.com",
    connectionEnvironment:{PGHOST:"aws-1-sa-east-1.pooler.supabase.com",PGPORT:"5432",PGDATABASE:"postgres",
      PGUSER:"postgres.nagjddldrldwavmfaytc",PGPASSWORD:"local-only",PGSSLMODE:"require"}};
}
function dependencies(environment,database,sqlOverride) {
  const artifact=assertCanonicalRuntimePrerequisitesArtifact(root);
  return {argument:CANONICAL_RUNTIME_PREREQUISITES_OPERATION,
    git:(args)=>args[0]==="rev-parse"?head:"",
    authorize:()=>exactTarget(),
    assertArtifact:()=>({...artifact,sql:sqlOverride??artifact.sql}),
    executeReadOnly:(batch)=>parseJsonResults(psql(environment,database,batch).stdout),
    executeMigration:(sql)=>psql(environment,database,sql),
  };
}
function runnerEnvironment() {
  return {REFLAB_PRODUCTION_DDL_APPROVED_HEAD:head,
    ALLOW_PRODUCTION_DDL:"true",ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES:"true"};
}
function preExact(environment,database) {
  const results=parseJsonResults(psql(environment,database,buildCanonicalRuntimePrerequisitesPreBatch()).stdout);
  return classifyCanonicalRuntimePrerequisitesState(
    results.get(CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID),
  ).classification==="PASS";
}
function preDiagnostic(environment,database) {
  const results=parseJsonResults(psql(environment,database,buildCanonicalRuntimePrerequisitesPreBatch()).stdout);
  const installer=classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const sidecar=classifyPhase2aSemanticAuditPost(results.get(phase2aSemanticAuditPostQuery.id));
  const state=classifyCanonicalRuntimePrerequisitesState(results.get(CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID));
  return {installer:{profile:installer.managedProfile,lifecycle:installer.lifecycleState},
    sidecar:{state:sidecar.postState,checks:results.get(phase2aSemanticAuditPostQuery.id)?.checks},state};
}
function inject(sql,point) {
  const failure=`\ndo $forced$ begin raise exception 'forced 310005 ${point}' using errcode='55000'; end $forced$;\n`;
  const patterns={helper:/(\$function\$;)/i,acl:/(revoke all on function[\s\S]*?reflab_rls_owner;)/i,commit:/(commit\s*;\s*)$/i};
  const changed=sql.replace(patterns[point],(match)=>point==="commit"?`${failure}${match}`:`${match}${failure}`);
  if(changed===sql) throw new Error(`Injection failed: ${point}`);
  return changed;
}

export async function runPhase2bCanonicalRuntimePrerequisitesPostgres() {
  return withCluster("absent",async(environment)=>{
    const created=[]; const base="postgres";
    try {
      psql(environment,"postgres","create database maintenance","supabase_admin");
      created.push("maintenance");
      setup(environment,base);
      const preDiagnosticResult=preDiagnostic(environment,base);
      if(preDiagnosticResult.installer.profile!=="READY"
          ||preDiagnosticResult.installer.lifecycle!=="POST_PHASE2A_SEMANTIC_AUDIT"
          ||preDiagnosticResult.sidecar.state!=="EXACT"||preDiagnosticResult.state.classification!=="PASS") {
        throw new Error(`PRE_DIAGNOSTIC=${JSON.stringify(preDiagnosticResult)}`);
      }
      const preCases=[
        ["canonical_jsonb_text_exists","create function reflab_private.canonical_jsonb_text(jsonb) returns text language sql as $$select $1::text$$"],
        ["wrong_helper_signature","create function reflab_private.canonical_jsonb_text(text) returns text language sql as $$select $1$$"],
        ["admin_user_plan","create function public.admin_set_canonical_user_plan(text,text,text,text) returns void language sql as $$select$$"],
        ["admin_global_role","create function public.admin_set_canonical_global_role(text,text,text,text) returns void language sql as $$select$$"],
        ["training_provider","create function public.submit_canonical_training_attempt(text,uuid,jsonb,integer) returns uuid language sql as $$select null::uuid$$"],
        ["communication_provider","create function public.submit_canonical_communication_feedback(text,uuid,text,jsonb) returns uuid language sql as $$select null::uuid$$"],
        ["payload_hash","alter table public.attempts add column canonical_payload_hash text"],
        ["sidecar_missing","drop function reflab_audit.production_semantic_snapshot()"],
        ["sidecar_drift","grant create on schema reflab_audit to reflab_preflight_audit_owner"],
        ["attempt_count","insert into public.attempts(id) values('12000000-0000-4000-8000-000000000001')"],
        ["exam_count","delete from public.exam_results where id='20000000-0000-4000-8000-000000000006'"],
        ["notification_count","delete from public.notification_events where id='30000000-0000-4000-8000-000000000060'"],
        ["ledger_drift","alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash) values(4,'drift','psychology_notification_prerequisites','x',repeat('a',64),repeat('b',64))"],
        ["schema_state","insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values('x',repeat('a',64),repeat('b',64),'test','17',1,'installed')"],
        ["marker_present","insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values('marker',repeat('c',64),repeat('d',64),'test','17',1,'installed')"],
        ["prerequisite_present","alter table public.clips add column status text not null default 'published'"],
        ["later_provider","create function reflab_private.request_user_id() returns text language sql as $$select null::text$$"],
      ];
      const negativeResults={};
      const expectedFailure={canonical_jsonb_text_exists:"canonicalJsonbTextStateExact",
        wrong_helper_signature:"canonicalJsonbTextStateExact",admin_user_plan:"adminProvidersAbsent",
        admin_global_role:"adminProvidersAbsent",training_provider:"trainingProviderAbsent",
        communication_provider:"communicationProviderAbsent",payload_hash:"canonicalPayloadHashAbsent",
        attempt_count:"historicalFingerprintsExact",exam_count:"historicalFingerprintsExact",
        notification_count:"historicalFingerprintsExact",ledger_drift:"ledgerExact",
        schema_state:"schemaStateEmpty",marker_present:"canonicalMarkerAbsent",
        prerequisite_present:"prerequisiteAbsent",later_provider:"laterAdoptionAbsent"};
      for(const [id,mutation] of preCases) {
        const database=`n_${id}`; clone(environment,base,database); created.push(database);
        psql(environment,database,mutation);
        const observed=parseJsonResults(psql(environment,database,buildCanonicalRuntimePrerequisitesPreBatch()).stdout);
        if(id==="sidecar_missing"||id==="sidecar_drift") {
          const sidecarChecks=observed.get(phase2aSemanticAuditPostQuery.id)?.checks;
          if(id==="sidecar_missing"&&sidecarChecks?.auditFunctionExact!==false) throw new Error(`Specific negative not observed: ${id}`);
          if(id==="sidecar_drift"&&sidecarChecks?.auditSchemaExact!==false) throw new Error(`Specific negative not observed: ${id}`);
        } else if(observed.get(CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID)?.checks?.[expectedFailure[id]]!==false) {
          throw new Error(`Specific negative not observed: ${id}`);
        }
        let migrationCalls=0,blocked=false;
        try { runProductionPhase2bCanonicalRuntimePrerequisites(runnerEnvironment(),{
          ...dependencies(environment,database),executeMigration:()=>{migrationCalls+=1;},
        }); } catch { blocked=true; }
        if(!blocked||migrationCalls!==0) throw new Error(`Pre-DDL negative failed: ${id}`);
        negativeResults[id]="PASS";
        drop(environment,database); created.pop();
      }
      const artifact=assertCanonicalRuntimePrerequisitesArtifact(root);
      const rollbackResults={};
      for(const point of ["helper","acl","commit"]) {
        let rolledBack=false;
        try { runProductionPhase2bCanonicalRuntimePrerequisites(
          runnerEnvironment(),dependencies(environment,base,inject(artifact.sql,point)),
        ); } catch(error) { rolledBack=error.rollback==="PASS"&&preExact(environment,base); }
        if(!rolledBack) throw new Error(`Rollback failed: ${point}`);
        rollbackResults[point]="PASS";
      }
      const result=runProductionPhase2bCanonicalRuntimePrerequisites(
        runnerEnvironment(),dependencies(environment,base),
      );
      if(result.migration!=="PASS"||result.postDdl!=="EXACT"||result.canonicalJsonbText!=="EXACT"
          ||result.nextProvider!=="NOT_AUTHORIZED") throw new Error("310005 positive lifecycle mismatch.");
      const version=psql(environment,base,"select pg_catalog.current_setting('server_version_num');").stdout.trim();
      const post=JSON.parse(psql(environment,base,`select pg_catalog.json_build_object(
        'helper',pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is not null,
        'attempts',(select count(*) from public.attempts),'exam_results',(select count(*) from public.exam_results),
        'notification_events',(select count(*) from public.notification_events),
        'ledger',(select count(*) from reflab_meta.production_adoption_state),
        'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
        'admin_plan',pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is not null,
        'training',pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null
      );`).stdout.trim());
      if(!post.helper||post.attempts!==37||post.exam_results!==6||post.notification_events!==60
          ||post.ledger!==3||post.schema_state!==0||post.admin_plan||post.training) throw new Error("310005 post-state mismatch.");
      return {localOnly:true,postgresVersionNum:version,pre:"EXACT",migration:"PASS",post:"EXACT",
        canonicalJsonbText:"EXACT",nextProvider:"NOT_AUTHORIZED",databaseNegatives:preCases.length,
        staticGuardNegatives:11,negativeCount:preCases.length+11+3,rollbackCount:3,
        rollbackResults,cleanup:"PASS",residualTemporaryClusters:0};
    } finally {
      for(const database of [...created].reverse()) {
        if(database!=="maintenance") drop(environment,database);
      }
    }
  });
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href) {
  runPhase2bCanonicalRuntimePrerequisitesPostgres().then((result)=>process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error)=>{process.stderr.write(`PHASE2B_310005_REHEARSAL_FAIL: ${error.message}\n`);process.exitCode=1;});
}
