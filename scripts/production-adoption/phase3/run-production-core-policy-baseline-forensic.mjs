import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertCorePolicyArtifact, serializeCorePolicyAttestation } from "./run-production-core-policy-pre-attestation.mjs";
import { IdentitySecurityBridgePreAttestationFailure, classifyIdentitySecurityBridgePreAttestationFailure,
  executeIdentitySecurityBridgePreReadOnlyBatch, assertIdentitySecurityBridgeSessionPoolerTarget,
  formatIdentitySecurityBridgePreAttestationFailure } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { buildCorePolicyBaselineForensicBatch, classifyCorePolicyBaselineObservation } from "./phase3-core-policy-baseline-forensic-contract.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const CORE_BASELINE_FORENSIC_OPERATION = "--production-core-policy-baseline-forensic";
export const CORE_BASELINE_FORENSIC_VARIABLES = Object.freeze([
  "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_CORE_POLICY_BASELINE_FORENSIC", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
function fail(substage, reason) {
  throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_BASELINE_FORENSIC", substage, reason);
}
function guarded(substage, reason, action) {
  try { return action(); } catch (error) {
    const safe = classifyIdentitySecurityBridgePreAttestationFailure(error, { substage, reason });
    throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_BASELINE_FORENSIC", substage, safe.reason,
      { query: "phase3_core_policy_baseline", sqlstate: safe.sqlstate, psqlExitStatus: safe.psqlExitStatus, stderrClass: safe.stderrClass });
  }
}
export function runProductionCorePolicyBaselineForensic(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== CORE_BASELINE_FORENSIC_OPERATION) fail("OPERATION", "OPERATION_NOT_AUTHORIZED");
  if (Object.keys(environment).some((name) => name.startsWith("REFLAB_PRODUCTION_DDL_")
    || name.startsWith("ALLOW_PRODUCTION_") && !CORE_BASELINE_FORENSIC_VARIABLES.includes(name)))
    fail("WRITE_CONFIGURATION", "DDL_CONFIGURATION_REJECTED");
  if (CORE_BASELINE_FORENSIC_VARIABLES.slice(0, 3).some((name) => environment[name] !== "true")) fail("OPT_INS", "OPT_IN_REQUIRED");
  guarded("INHERITED_PG_STATE", "INHERITED_PG_STATE", () => assertNoInheritedPgState(environment));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const head = guarded("HEAD_READ", "REPOSITORY_HEAD_READ_FAILED", () => git(["rev-parse", "HEAD"]).trim());
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment[CORE_BASELINE_FORENSIC_VARIABLES[4]]) fail("HEAD", "HEAD_MISMATCH");
  const status = guarded("WORKTREE_READ", "WORKTREE_READ_FAILED", () => git(["status", "--porcelain", "--untracked-files=all"]));
  if (status.trim()) fail("WORKTREE", "WORKTREE_DIRTY");
  guarded("ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH", assertCorePolicyArtifact);
  const target = guarded("TARGET", "TARGET_MISMATCH", () => assertIdentitySecurityBridgeSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, { projectRefVariable: CORE_BASELINE_FORENSIC_VARIABLES[3],
      databaseUrlVariable: CORE_BASELINE_FORENSIC_VARIABLES[5], operationLabel: "64245 observation-only baseline forensic" })));
  const sql = guarded("BATCH_BUILD", "LOCAL_PROGRAMMING_ERROR", buildCorePolicyBaselineForensicBatch);
  const evidence = guarded("READ_ONLY_BATCH", undefined, () =>
    (dependencies.executeReadOnly ?? executeIdentitySecurityBridgePreReadOnlyBatch)(sql, target.connectionEnvironment,
      { processEnvironment: environment, ...(dependencies.spawn ? { spawn: dependencies.spawn } : {}) }));
  if (!(evidence instanceof Map)) fail("RESULT_SHAPE", "QUERY_RESULT_SHAPE_MISMATCH");
  if (evidence.get("read_only_guard") !== "on") fail("TRANSACTION", "READ_ONLY_GUARD_FAILED");
  return guarded("OBSERVATION", "LOCAL_PROGRAMMING_ERROR", () => classifyCorePolicyBaselineObservation(evidence, { targetExact: true }));
}
export async function runCorePolicyBaselineForensicCli(environment = process.env, dependencies = {}) {
  try {
    const result = (dependencies.run ?? runProductionCorePolicyBaselineForensic)(environment, {
      ...dependencies, argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined),
    });
    if (!["OBSERVATION_COMPLETE", "BLOCKER"].includes(result?.classification)) fail("OUTPUT", "LOCAL_PROGRAMMING_ERROR");
    const output = guarded("OUTPUT", "LOCAL_PROGRAMMING_ERROR", () => serializeCorePolicyAttestation(result, environment));
    (dependencies.writeStdout ?? ((text) => process.stdout.write(text)))(output);
    return result.classification === "OBSERVATION_COMPLETE" ? 0 : 1;
  } catch (error) {
    const lines = formatIdentitySecurityBridgePreAttestationFailure(error).trim().split("\n").slice(1);
    const report = { format: "REFLAB_64245_BASELINE_FORENSIC_FAIL", classification: "BLOCKER",
      ...Object.fromEntries(lines.map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; })) };
    (dependencies.writeStderr ?? ((text) => process.stderr.write(text)))(`${JSON.stringify(report)}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runCorePolicyBaselineForensicCli();
