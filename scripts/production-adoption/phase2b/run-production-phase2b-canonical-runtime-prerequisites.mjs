import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { buildPsqlEnvironment, executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  assertRepositoryAttestation,
  authorizeProductionDdlTarget,
} from "../bootstrap/run-production-role-bootstrap.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { installerIdentityQuery, classifyInstallerIdentity } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_FORMAT,
  CANONICAL_RUNTIME_PREREQUISITES_MUTATIONS,
  CANONICAL_RUNTIME_PREREQUISITES_OPERATION,
  CANONICAL_RUNTIME_PREREQUISITES_OPT_IN,
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID,
  assertCanonicalRuntimePrerequisitesArtifact,
  canonicalRuntimePrerequisitesPostQuery,
  canonicalRuntimePrerequisitesPreQuery,
  classifyCanonicalRuntimePrerequisitesState,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";

const root = resolve(import.meta.dirname,"..","..","..");

function sqlstate(value) {
  return String(value?.stderr ?? value?.message ?? value ?? "")
    .match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):|SQLSTATE[_=:-]?([0-9A-Z]{5})/i)?.slice(1).find(Boolean)?.toUpperCase();
}
class RunnerFailure extends Error {
  constructor(stage, reason, rollback = "NOT_REQUIRED") {
    super(`${stage}:${reason}`); this.stage=stage; this.reason=reason; this.rollback=rollback;
  }
}
function atStage(stage, reason, operation) {
  try { return operation(); } catch (error) {
    if (error instanceof RunnerFailure) throw error;
    throw new RunnerFailure(stage, sqlstate(error) ? `SQLSTATE_${sqlstate(error)}` : reason);
  }
}
function formatFailure(error) {
  const failure = error instanceof RunnerFailure ? error : new RunnerFailure("OTHER","SAFE_DIAGNOSTIC_UNAVAILABLE");
  return `PHASE2B_CANONICAL_RUNTIME_PREREQUISITES_FAIL:\nstage=${failure.stage}\nreason=${failure.reason}\nrollback=${failure.rollback}\n`;
}
function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql",[
    "-X","--no-psqlrc","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose","--quiet",
  ],{ input:sql,encoding:"utf8",windowsHide:true,maxBuffer:8*1024*1024,
    env:buildPsqlEnvironment(environment,connectionEnvironment) });
  if (result.error || result.status !== 0) {
    throw Object.assign(new Error("310005 migration failed."),{ stderr:result.stderr });
  }
}
export function assertCanonicalRuntimePrerequisitesSessionPoolerTarget(target) {
  const expectedUsername=`postgres.${PRODUCTION_PROJECT_REF}`;
  const connection=target?.connectionEnvironment;
  if (target?.projectRef!==PRODUCTION_PROJECT_REF || target?.host!==PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGHOST!==PRODUCTION_SESSION_POOLER_HOST || connection?.PGPORT!=="5432"
      || connection?.PGDATABASE!=="postgres" || connection?.PGUSER!==expectedUsername
      || connection?.PGSSLMODE!=="require") throw new Error("310005_TARGET_REJECTED");
  return target;
}
export function buildCanonicalRuntimePrerequisitesPreBatch() {
  return buildSqlBatch([installerIdentityQuery,phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,canonicalRuntimePrerequisitesPreQuery]);
}
export function buildCanonicalRuntimePrerequisitesPostBatch() {
  return buildSqlBatch([installerIdentityQuery,phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,canonicalRuntimePrerequisitesPostQuery]);
}
function classify(results, post) {
  const installer=classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprintExact=phase1HistoricalFingerprintExact(results.get(phase1ProductFingerprintQuery.id));
  const sidecarPayload=results.get(phase2aSemanticAuditPostQuery.id);
  const adjustedSidecar={...sidecarPayload,checks:{...sidecarPayload?.checks,phase2bAbsent:true}};
  const sidecar=classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const state=classifyCanonicalRuntimePrerequisitesState(results.get(
    post ? CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID : CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID,
  ),{post});
  const lifecycleExact=installer.managedProfile==="READY"
    && installer.lifecycleState==="POST_PHASE2A_SEMANTIC_AUDIT";
  if (!lifecycleExact || !fingerprintExact || sidecar.postState!=="EXACT"
      || state.classification!==(post?"EXACT":"PASS")) {
    throw new RunnerFailure(post?"POST_DDL_ATTESTATION":"PRE_DDL_ATTESTATION",
      post?"POST_DDL_CONTRACT_MISMATCH":"PRE_DDL_CONTRACT_MISMATCH");
  }
  return {installer,sidecar,state,fingerprintExact};
}
export function runProductionPhase2bCanonicalRuntimePrerequisites(environment=process.env,dependencies={}) {
  atStage("TARGET_GUARD","OPERATION_NOT_AUTHORIZED",()=>{
    if(dependencies.argument!==CANONICAL_RUNTIME_PREREQUISITES_OPERATION) throw new Error("operation");
    assertNoInheritedPgState(environment);
  });
  const git=dependencies.git??((args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true}));
  const head=atStage("HEAD_GUARD","HEAD_ATTESTATION_FAILED",()=>git(["rev-parse","HEAD"]).trim());
  const status=atStage("WORKTREE_GUARD","WORKTREE_ATTESTATION_FAILED",()=>git(["status","--short"]));
  atStage("HEAD_GUARD","REPOSITORY_ATTESTATION_FAILED",()=>assertRepositoryAttestation({
    expectedHead:environment[PRODUCTION_DDL_APPROVED_HEAD],actualHead:head,status,
  }));
  const artifact=atStage("ARTIFACT_HASH","ARTIFACT_HASH_MISMATCH",()=>
    (dependencies.assertArtifact??assertCanonicalRuntimePrerequisitesArtifact)(root));
  const target=atStage("TARGET_GUARD","TARGET_REJECTED",()=>assertCanonicalRuntimePrerequisitesSessionPoolerTarget(
    (dependencies.authorize??authorizeProductionDdlTarget)(environment,{
      operationOptIn:CANONICAL_RUNTIME_PREREQUISITES_OPT_IN,
    }),
  ));
  const executeReadOnly=dependencies.executeReadOnly??executeReadOnlyBatch;
  const read=(batch)=>executeReadOnly(batch,target.connectionEnvironment,{processEnvironment:environment});
  const before=atStage("PRE_DDL_ATTESTATION","PRE_DDL_ATTESTATION_FAILED",()=>
    classify(read(buildCanonicalRuntimePrerequisitesPreBatch()),false));
  try {
    (dependencies.executeMigration??((sql,connection)=>executeMigration(
      sql,connection,environment,dependencies.spawn??spawnSync,
    )))(artifact.sql,target.connectionEnvironment);
  } catch(error) {
    let rollback="BLOCKER";
    try { classify(read(buildCanonicalRuntimePrerequisitesPreBatch()),false); rollback="PASS"; } catch {}
    throw new RunnerFailure("MIGRATION_SQL",sqlstate(error)?`SQLSTATE_${sqlstate(error)}`:"MIGRATION_FAILED",rollback);
  }
  const after=atStage("POST_DDL_ATTESTATION","POST_DDL_ATTESTATION_FAILED",()=>
    classify(read(buildCanonicalRuntimePrerequisitesPostBatch()),true));
  return {
    format:CANONICAL_RUNTIME_PREREQUISITES_FORMAT,
    target:{projectRef:target.projectRef,host:target.host,database:"postgres"},
    installer:"postgres",head,artifact:{path:artifact.path,sha256:artifact.sha256},
    preDdl:{installer:before.installer.managedProfile,contract:"EXACT"},
    migration:"PASS",transaction:"COMMIT",postDdl:"EXACT",canonicalJsonbText:"EXACT",
    mutationAccounting:CANONICAL_RUNTIME_PREREQUISITES_MUTATIONS,
    nextProviderReview:"202608110001_EXECUTION_REVIEW",nextProvider:"NOT_AUTHORIZED",
    preserved:{sidecar:after.sidecar.postState,historicalFingerprints:true},
  };
}
export async function runProductionPhase2bCanonicalRuntimePrerequisitesCli(environment=process.env,dependencies={}) {
  try {
    const argument=dependencies.argument??(process.argv.length===3?process.argv[2]:undefined);
    const result=await (dependencies.run??runProductionPhase2bCanonicalRuntimePrerequisites)(environment,{...dependencies,argument});
    (dependencies.writeStdout??process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch(error) {
    (dependencies.writeStderr??process.stderr.write.bind(process.stderr))(formatFailure(error));
    return 1;
  }
}
if(import.meta.url===pathToFileURL(process.argv[1]??"").href) process.exitCode=await runProductionPhase2bCanonicalRuntimePrerequisitesCli();
