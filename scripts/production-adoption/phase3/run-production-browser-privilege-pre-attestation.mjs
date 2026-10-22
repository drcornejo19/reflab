import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { buildBrowserTransitionBatch, observeBrowserTransitionResults, validateBrowserBaseline } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_PRE_FORMAT, BROWSER_PRE_ARTIFACTS, classifyBrowserPreAttestation, browserPreFailureReport } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { executeBrowserForensicReadOnly, serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { IdentitySecurityBridgePreAttestationFailure, classifyIdentitySecurityBridgePreAttestationFailure,
  assertIdentitySecurityBridgeSessionPoolerTarget, formatIdentitySecurityBridgePreAttestationFailure } from "./run-production-identity-security-bridge-pre-attestation.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const BROWSER_PRE_OPERATION = "--production-browser-privilege-pre-attestation";
export const BROWSER_PRE_VARIABLES = Object.freeze([
  "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_PRE_ATTESTATION", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
const fail = (substage, reason) => { throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_PRE_ATTESTATION", substage, reason); };
function guarded(substage, reason, action) {
  try { return action(); } catch (error) {
    const safe = classifyIdentitySecurityBridgePreAttestationFailure(error, { substage, reason });
    throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_PRE_ATTESTATION", substage, safe.reason,
      { query: "phase3_browser_privilege_inventory", sqlstate: safe.sqlstate,
        psqlExitStatus: safe.psqlExitStatus, stderrClass: safe.stderrClass });
  }
}
export function assertBrowserPreAuthorization(environment) {
  if (Object.keys(environment).some((name) => name.startsWith("REFLAB_PRODUCTION_DDL_")
    || name.startsWith("ALLOW_PRODUCTION_") && !BROWSER_PRE_VARIABLES.includes(name)))
    fail("WRITE_CONFIGURATION", "DDL_CONFIGURATION_REJECTED");
  if (BROWSER_PRE_VARIABLES.slice(0, 3).some((name) => environment[name] !== "true")) fail("OPT_INS", "OPT_IN_REQUIRED");
  if (Object.keys(environment).some((name) => /^PG/i.test(name))) fail("INHERITED_PG_STATE", "INHERITED_PG_STATE");
  guarded("INHERITED_PG_STATE", "INHERITED_PG_STATE", () => assertNoInheritedPgState(environment));
}
export function assertBrowserPreCommittedArtifacts(git, readCheckout = (path) => readFileSync(resolve(root, path), "utf8")) {
  for (const [path, expected] of Object.entries(BROWSER_PRE_ARTIFACTS)) {
    const blob = git(["show", `HEAD:${path}`]);
    const bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "utf8");
    if (createHash("sha256").update(bytes).digest("hex") !== expected
      || readCheckout(path).replaceAll("\r\n", "\n") !== bytes.toString("utf8"))
      fail("ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH");
  }
  if (!validateBrowserBaseline()) fail("BASELINE_DIGEST", "REPOSITORY_ARTIFACT_MISMATCH");
  return { migrationArtifactExact: true, baselineArtifactExact: true, baselineDigestExact: true,
    classifierExact: true, sharedSecurityContractExact: true, observationCodeExact: true };
}
export function runProductionBrowserPrivilegePreAttestation(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== BROWSER_PRE_OPERATION) fail("OPERATION", "OPERATION_NOT_AUTHORIZED");
  assertBrowserPreAuthorization(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const head = guarded("HEAD", "REPOSITORY_HEAD_READ_FAILED", () => git(["rev-parse", "HEAD"]).trim());
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment[BROWSER_PRE_VARIABLES[4]]) fail("HEAD", "HEAD_MISMATCH");
  if (guarded("WORKTREE", "WORKTREE_READ_FAILED", () => git(["status", "--porcelain", "--untracked-files=all"])).trim())
    fail("WORKTREE", "WORKTREE_DIRTY");
  const verification = guarded("ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH", () => assertBrowserPreCommittedArtifacts(git, dependencies.readCheckout));
  const target = guarded("TARGET", "TARGET_MISMATCH", () => assertIdentitySecurityBridgeSessionPoolerTarget(
    resolveProductionManagedPostgresTarget(environment, { projectRefVariable: BROWSER_PRE_VARIABLES[3],
      databaseUrlVariable: BROWSER_PRE_VARIABLES[5], operationLabel: "64249 privileged READ ONLY PRE attestation" })));
  const batch = guarded("BATCH", "LOCAL_PROGRAMMING_ERROR", buildBrowserTransitionBatch);
  const evidence = guarded("READ_ONLY_BATCH", undefined, () =>
    (dependencies.executeReadOnly ?? executeBrowserForensicReadOnly)(batch, target.connectionEnvironment,
      { processEnvironment: environment, ...(dependencies.spawn ? { spawn: dependencies.spawn } : {}) }));
  if (!(evidence instanceof Map)) fail("RESULT_SHAPE", "QUERY_RESULT_SHAPE_MISMATCH");
  if (evidence.get("read_only_guard") !== "on") fail("TRANSACTION", "READ_ONLY_GUARD_FAILED");
  const observation = guarded("OBSERVATION", "LOCAL_PROGRAMMING_ERROR", () => observeBrowserTransitionResults(evidence));
  return guarded("CLASSIFICATION", "PRE_CLASSIFICATION_FAILED", () => classifyBrowserPreAttestation(observation,
    { ...verification, approvedHead: head, approvedHeadExact: true, targetExact: true }));
}
export const serializeBrowserPreAttestation = serializeBrowserForensic;
export async function runBrowserPreAttestationCli(environment = process.env, dependencies = {}) {
  try {
    const result = (dependencies.run ?? runProductionBrowserPrivilegePreAttestation)(environment, {
      ...dependencies, argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined),
    });
    if (result?.format !== BROWSER_PRE_FORMAT || !["64249_PRE_EXECUTABLE_EXACT", "64249_ALREADY_INSTALLED_POST", "BLOCKER"].includes(result.classification)
      || result.mutationCount !== 0 || result.migrationInvocationCount !== 0 || result.productionDdlAuthorized !== false)
      fail("OUTPUT", "LOCAL_PROGRAMMING_ERROR");
    const text = guarded("OUTPUT", "LOCAL_PROGRAMMING_ERROR", () => serializeBrowserPreAttestation(result, environment));
    (dependencies.writeStdout ?? ((s) => process.stdout.write(s)))(text);
    return result.classification === "BLOCKER" ? 1 : 0;
  } catch (error) {
    const lines = formatIdentitySecurityBridgePreAttestationFailure(error).trim().split("\n").slice(1);
    const diagnostic = Object.fromEntries(lines.map((s) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));
    const report = browserPreFailureReport(diagnostic);
    let output;
    try { output = serializeBrowserPreAttestation(report, environment); } catch {
      try { output = serializeBrowserPreAttestation(browserPreFailureReport({ reason: "LOCAL_PROGRAMMING_ERROR" }), environment); } catch { output = ""; }
    }
    if (output) (dependencies.writeStderr ?? ((s) => process.stderr.write(s)))(output);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runBrowserPreAttestationCli();
