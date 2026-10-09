import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { serializeCorePolicyAttestation } from "./run-production-core-policy-pre-attestation.mjs";
import { IdentitySecurityBridgePreAttestationFailure, classifyIdentitySecurityBridgePreAttestationFailure,
  executeIdentitySecurityBridgePreReadOnlyBatch, assertIdentitySecurityBridgeSessionPoolerTarget,
  formatIdentitySecurityBridgePreAttestationFailure } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { BROWSER_FORENSIC_FORMAT, BROWSER_ARTIFACT, buildBrowserPrivilegeForensicBatch,
  classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";

const root = resolve(import.meta.dirname,"../../..");
export const BROWSER_FORENSIC_OPERATION = "--production-browser-privilege-baseline-forensic";
export const BROWSER_FORENSIC_VARIABLES = Object.freeze([
  "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_BASELINE_FORENSIC", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
const fail = (substage,reason) => { throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_BROWSER_FORENSIC",substage,reason); };
function guarded(substage,reason,action) {
  try { return action(); } catch (error) {
    const safe = classifyIdentitySecurityBridgePreAttestationFailure(error,{substage,reason});
    throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_BROWSER_FORENSIC",substage,safe.reason,
      { query: "phase3_browser_privilege_inventory", sqlstate: safe.sqlstate,
        psqlExitStatus: safe.psqlExitStatus, stderrClass: safe.stderrClass });
  }
}
export function assertBrowserForensicArtifact(git) {
  const blob = git(["show",`HEAD:${BROWSER_ARTIFACT.path}`]);
  if (createHash("sha256").update(blob).digest("hex") !== BROWSER_ARTIFACT.sha256)
    fail("ARTIFACT","REPOSITORY_ARTIFACT_MISMATCH");
}
export function executeBrowserForensicReadOnly(sql,connectionEnvironment,{processEnvironment=process.env,spawn=spawnSync}={}) {
  return executeIdentitySecurityBridgePreReadOnlyBatch(sql,connectionEnvironment,{processEnvironment,
    spawn:(program,args,options) => spawn(program,[...args,"--set","VERBOSITY=verbose"],{...options,timeout:120000})});
}
export function serializeBrowserForensic(result,environment) {
  const text=serializeCorePolicyAttestation(result,environment);
  const url=environment[BROWSER_FORENSIC_VARIABLES[5]];
  let encodedPassword="";
  try { encodedPassword=url ? new URL(url).password : ""; } catch { /* Authorization handles invalid URLs. */ }
  if(encodedPassword && text.includes(encodedPassword)) fail("OUTPUT","LOCAL_PROGRAMMING_ERROR");
  return text;
}
export function runProductionBrowserPrivilegeBaselineForensic(environment = process.env,dependencies = {}) {
  if (dependencies.argument !== BROWSER_FORENSIC_OPERATION) fail("OPERATION","OPERATION_NOT_AUTHORIZED");
  if (Object.keys(environment).some((name) => name.startsWith("REFLAB_PRODUCTION_DDL_")
    || name.startsWith("ALLOW_PRODUCTION_") && !BROWSER_FORENSIC_VARIABLES.includes(name)))
    fail("WRITE_CONFIGURATION","DDL_CONFIGURATION_REJECTED");
  if (BROWSER_FORENSIC_VARIABLES.slice(0,3).some((name) => environment[name] !== "true")) fail("OPT_INS","OPT_IN_REQUIRED");
  guarded("INHERITED_PG_STATE","INHERITED_PG_STATE",() => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true}));
  const head = guarded("HEAD_READ","REPOSITORY_HEAD_READ_FAILED",() => git(["rev-parse","HEAD"]).trim());
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment[BROWSER_FORENSIC_VARIABLES[4]]) fail("HEAD","HEAD_MISMATCH");
  if (guarded("WORKTREE_READ","WORKTREE_READ_FAILED",() => git(["status","--porcelain","--untracked-files=all"])).trim())
    fail("WORKTREE","WORKTREE_DIRTY");
  guarded("ARTIFACT","REPOSITORY_ARTIFACT_MISMATCH",() => assertBrowserForensicArtifact(git));
  const target = guarded("TARGET","TARGET_MISMATCH",() => assertIdentitySecurityBridgeSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment,{projectRefVariable:BROWSER_FORENSIC_VARIABLES[3],
      databaseUrlVariable:BROWSER_FORENSIC_VARIABLES[5],operationLabel:"64249 observation-only browser privilege forensic"})));
  const batch = guarded("BATCH_BUILD","LOCAL_PROGRAMMING_ERROR",buildBrowserPrivilegeForensicBatch);
  const evidence = guarded("READ_ONLY_BATCH",undefined,() =>
    (dependencies.executeReadOnly ?? executeBrowserForensicReadOnly)(batch,target.connectionEnvironment,
      {processEnvironment:environment,...(dependencies.spawn ? {spawn:dependencies.spawn} : {})}));
  if (!(evidence instanceof Map)) fail("RESULT_SHAPE","QUERY_RESULT_SHAPE_MISMATCH");
  if (evidence.get("read_only_guard") !== "on") fail("TRANSACTION","READ_ONLY_GUARD_FAILED");
  return { head,...guarded("OBSERVATION","LOCAL_PROGRAMMING_ERROR",() => classifyBrowserPrivilegeObservation(evidence,{targetExact:true})) };
}
export async function runBrowserPrivilegeForensicCli(environment = process.env,dependencies = {}) {
  try {
    const result = (dependencies.run ?? runProductionBrowserPrivilegeBaselineForensic)(environment,{
      ...dependencies,argument:dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined),
    });
    if (!["OBSERVATION_COMPLETE","BLOCKER"].includes(result?.classification) || result.approval !== "NOT_PERFORMED" || result.mutationCount !== 0)
      fail("OUTPUT","LOCAL_PROGRAMMING_ERROR");
    const text = guarded("OUTPUT","LOCAL_PROGRAMMING_ERROR",() => serializeBrowserForensic(result,environment));
    (dependencies.writeStdout ?? ((s) => process.stdout.write(s)))(text);
    return result.classification === "OBSERVATION_COMPLETE" ? 0 : 1;
  } catch (error) {
    const lines = formatIdentitySecurityBridgePreAttestationFailure(error).trim().split("\n").slice(1);
    const result = {format:BROWSER_FORENSIC_FORMAT,classification:"BLOCKER",approval:"NOT_PERFORMED",mutationCount:0,
      ...Object.fromEntries(lines.map((s) => { const i=s.indexOf("="); return [s.slice(0,i),s.slice(i+1)]; }))};
    (dependencies.writeStderr ?? ((s) => process.stderr.write(s)))(`${JSON.stringify(result)}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runBrowserPrivilegeForensicCli();
