import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { BROWSER_PRE_ARTIFACTS } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { validateBrowserBaseline } from "./phase3-browser-privilege-contract.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { executeBrowserForensicReadOnly, serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { IdentitySecurityBridgePreAttestationFailure, classifyIdentitySecurityBridgePreAttestationFailure,
  assertIdentitySecurityBridgeSessionPoolerTarget } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { SERVICE_FORENSIC_FORMAT, buildServiceRoleForensicBatch, classifyServiceRoleForensic } from "./phase3-service-role-privilege-forensic-contract.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const SERVICE_FORENSIC_OPERATION = "--production-service-role-privilege-forensic";
export const SERVICE_FORENSIC_RUNNER_PATH = "scripts/production-adoption/phase3/run-production-service-role-privilege-forensic.mjs";
export const SERVICE_FORENSIC_VARIABLES = Object.freeze([
  "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_SERVICE_ROLE_PRIVILEGE_FORENSIC", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
export const SERVICE_FORENSIC_ARTIFACTS = Object.freeze({
  ...BROWSER_PRE_ARTIFACTS,
  "scripts/production-adoption/phase3/phase3-service-role-privilege-forensic-contract.mjs": "7f3cba094d629b900f86941bc600f73f4844d4a8b7444945b55196fc0f893150",
  "scripts/production-adoption/phase3/phase3-core-policy-contract.mjs": "b02ab74d043fd5cc91bf99f7c28b11bfafdae6f90d522df97ada6d6037bb13bd",
  "scripts/production-adoption/phase3/phase3-core-policy-baseline-forensic-contract.mjs": "10c0678acf2da70f3257f033b7eee2ba8ceb688c8f6e2a3717f3ee60887dafaf",
  "scripts/production-adoption/phase3/phase3-core-policy-production-baseline.mjs": "c67495fe8355fe716979aa3d9af634ce7c13c89f174dd313225015fcebe0a447",
  "scripts/production-adoption/phase3/phase3-browser-privilege-pre-attestation-contract.mjs": "5268a9af4ad27f42fbec6aa19692d29e8378a50cf522252c3a3d344f0890cc81",
  "scripts/production-adoption/phase3/phase3-identity-security-bridge-ddl-contract.mjs": "c4927efd0bdca5756a0b90b0ad0cfbca4abd5de904f56d2bb0dc808efadb7417",
  "scripts/production-adoption/phase3/run-production-identity-security-bridge-pre-attestation.mjs": "2a3737836f8deea768385f283956a1315746ae5c7e873e16a16379d472fb8f6e",
  "scripts/production-adoption/bootstrap/run-production-installer-identity-attestation.mjs": "c2f242b43de98cb4d2b17f3d507268677ae2889b52d2e112fc01a0960fb31472",
  "scripts/production-adoption/bootstrap/production-managed-postgres-target.mjs": "78bca74066e005fa51eab8522e52daaaa879bd7990c556413995e876ae98ef5f",
  "scripts/production-preflight/queries.mjs": "1838806b02390810467585dff394f9aef58792dc64968122e63f0070bf21ad16",
  "scripts/production-preflight/run.mjs": "96660d0c3785a017df0d94c42e2544ff5e0e0d20c665e3b5d210a8077047a7cb",
});
const fail = (stage, reason) => { throw new IdentitySecurityBridgePreAttestationFailure("SERVICE_ROLE_FORENSIC", stage, reason); };
export function assertServiceForensicAuthorization(environment) {
  if (Object.keys(environment).some((k) => /^REFLAB_PRODUCTION_DDL_/i.test(k)
    || /^ALLOW_PRODUCTION_/i.test(k) && !SERVICE_FORENSIC_VARIABLES.includes(k))) fail("AUTHORIZATION", "DDL_CONFIGURATION_REJECTED");
  if (SERVICE_FORENSIC_VARIABLES.slice(0, 3).some((k) => environment[k] !== "true")) fail("AUTHORIZATION", "OPT_IN_REQUIRED");
  if (Object.keys(environment).some((k) => /^PG/i.test(k))) fail("ENVIRONMENT", "INHERITED_PG_STATE");
  assertNoInheritedPgState(environment);
}
export function assertServiceForensicArtifacts(git, readCheckout = (p) => readFileSync(resolve(root, p), "utf8")) {
  for (const [path, hash] of Object.entries(SERVICE_FORENSIC_ARTIFACTS)) {
    const blob = git(["show", `HEAD:${path}`]);
    const bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "utf8");
    if (createHash("sha256").update(bytes).digest("hex") !== hash || readCheckout(path).replaceAll("\r\n", "\n") !== bytes.toString("utf8"))
      fail("ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH");
  }
  if (!validateBrowserBaseline()) fail("BASELINE", "REPOSITORY_ARTIFACT_MISMATCH");
}
export function assertServiceForensicRunnerArtifact(git, approvedHead, readRunnerBytes = readFileSync) {
  // The approved commit pins the runner without a self-referential embedded hash.
  const committed = git(["show", `${approvedHead}:${SERVICE_FORENSIC_RUNNER_PATH}`]);
  const committedBytes = Buffer.isBuffer(committed) ? committed : Buffer.from(committed, "utf8");
  const executingBytes = readRunnerBytes(fileURLToPath(import.meta.url));
  if (!Buffer.isBuffer(executingBytes)
    || createHash("sha256").update(committedBytes).digest("hex") !== createHash("sha256").update(executingBytes).digest("hex"))
    fail("ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH");
  return true;
}
export function runProductionServiceRolePrivilegeForensic(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== SERVICE_FORENSIC_OPERATION) fail("OPERATION", "OPERATION_NOT_AUTHORIZED");
  assertServiceForensicAuthorization(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {cwd: root, encoding: args[0] === "show" ? undefined : "utf8", windowsHide: true}));
  const head = git(["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment[SERVICE_FORENSIC_VARIABLES[4]]) fail("HEAD", "HEAD_MISMATCH");
  if (git(["status", "--porcelain", "--untracked-files=all"]).trim()) fail("WORKTREE", "WORKTREE_DIRTY");
  const runnerArtifactExact = assertServiceForensicRunnerArtifact(git, head, dependencies.readRunnerBytes);
  assertServiceForensicArtifacts(git, dependencies.readCheckout);
  const target = assertIdentitySecurityBridgeSessionPoolerTarget(resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: SERVICE_FORENSIC_VARIABLES[3], databaseUrlVariable: SERVICE_FORENSIC_VARIABLES[5],
    operationLabel: "service_role observation-only privileged READ ONLY forensic",
  }));
  const evidence = (dependencies.executeReadOnly ?? executeBrowserForensicReadOnly)(buildServiceRoleForensicBatch(), target.connectionEnvironment,
    {processEnvironment: environment, ...(dependencies.spawn ? {spawn: dependencies.spawn} : {})});
  if (!(evidence instanceof Map)) fail("RESULT", "QUERY_RESULT_SHAPE_MISMATCH");
  if (evidence.get("read_only_guard") !== "on") fail("TRANSACTION", "READ_ONLY_GUARD_FAILED");
  const report = classifyServiceRoleForensic(evidence, {approvedHead: head, targetExact: true,
    target: {project: "nagjddldrldwavmfaytc", host: "aws-1-sa-east-1.pooler.supabase.com", port: 5432, database: "postgres",
      sslmode: "require", installer: "postgres.nagjddldrldwavmfaytc"}});
  return {...report, runnerArtifactExact, checks: {...report.checks, runnerArtifactExact}};
}
export const serializeServiceRoleForensic = serializeBrowserForensic;
export async function runServiceRoleForensicCli(environment = process.env, dependencies = {}) {
  try {
    const result = (dependencies.run ?? runProductionServiceRolePrivilegeForensic)(environment, {...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined)});
    if (result?.format !== SERVICE_FORENSIC_FORMAT || !["SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE", "BLOCKER"].includes(result.classification)
      || result.approval !== "NOT_PERFORMED" || result.mutationCount !== 0 || result.migrationInvocationCount !== 0 || result.productionDdlAuthorized !== false)
      fail("OUTPUT", "LOCAL_PROGRAMMING_ERROR");
    const text = serializeServiceRoleForensic(result, environment);
    (dependencies.writeStdout ?? ((s) => process.stdout.write(s)))(text);
    return result.classification === "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE" ? 0 : 1;
  } catch (error) {
    const safe = classifyIdentitySecurityBridgePreAttestationFailure(error);
    const unknown = ["CONNECTION_FAILED", "DATABASE_UNAVAILABLE", "TIMEOUT", "PSQL_PROCESS_FAILED"].includes(safe.reason);
    const report = {format: SERVICE_FORENSIC_FORMAT, classification: unknown ? "UNKNOWN" : "BLOCKER", reason: safe.reason,
      approvedHead: null, target: null, transactionReadOnly: null, checks: {observationComplete: false},
      roleAttributes: [], roleMemberships: [], primaryTables: [], primaryTableRawAcls: [], primaryEffectiveServiceRolePrivileges: [],
      primaryColumnAcls: [], primaryEffectiveColumnPrivileges: [], policies: [], relevantFunctions: [], functionExecuteAcls: [],
      additionalRuntimeTables: [], additionalEffectiveServiceRolePrivileges: [], deleteCallerTables: null, coachRateLimitState: null,
      predecessorState: null, adoptionState: null, historicalState: null, currentServiceRoleMatrix: null,
      proposedDesignMatrix: null, currentVsDesignDelta: null,
      failedChecks: unknown ? [] : ["execution"], unknownChecks: unknown ? ["currentProductionState"] : [],
      transaction: "ROLLBACK_REQUESTED_OR_CONNECTION_CLOSED", approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0, productionDdlAuthorized: false};
    let text;
    try {text = serializeServiceRoleForensic(report, environment);} catch {
      try {text = serializeServiceRoleForensic({format: SERVICE_FORENSIC_FORMAT, classification: "BLOCKER", reason: "LOCAL_PROGRAMMING_ERROR",
        approval: "NOT_PERFORMED", mutationCount: 0}, environment);} catch {text = "";}
    }
    if (text) (dependencies.writeStderr ?? ((s) => process.stderr.write(s)))(text);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runServiceRoleForensicCli();
