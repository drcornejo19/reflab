import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { CORE_POLICY_MIGRATION, CORE_POLICY_SHA256 } from "./phase3-core-policy-contract.mjs";
import { classifyCorePolicyPreAttestation } from "./phase3-core-policy-pre-attestation-contract.mjs";
import { CORE_POLICY_BASELINE_PATH, CORE_POLICY_BASELINE_ARTIFACT_SHA, CORE_POLICY_BASELINE_SHARED_SHA,
  APPROVED_CORE_POLICY_PRODUCTION_BASELINE, validateCorePolicyProductionApproval,
  buildApprovedCorePolicyPreBatch } from "./phase3-core-policy-production-baseline-contract.mjs";
import { IdentitySecurityBridgePreAttestationFailure, classifyIdentitySecurityBridgePreAttestationFailure,
  executeIdentitySecurityBridgePreReadOnlyBatch, assertIdentitySecurityBridgeSessionPoolerTarget,
  formatIdentitySecurityBridgePreAttestationFailure } from "./run-production-identity-security-bridge-pre-attestation.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const CORE_POLICY_ATTESTATION_OPERATION = "--production-core-policy-pre-attestation";
export const CORE_POLICY_ATTESTATION_VARIABLES = Object.freeze([
  "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_CORE_POLICY_PRE_ATTESTATION", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
function fail(substage, reason) {
  throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_PRE_ATTESTATION", substage, reason);
}
function guarded(substage, reason, action) {
  try { return action(); } catch (error) {
    const failure = classifyIdentitySecurityBridgePreAttestationFailure(error, {
      stage: "READ_ONLY_PRE_ATTESTATION", substage, reason, query: "phase3_core_policy_inventory",
    });
    throw new IdentitySecurityBridgePreAttestationFailure("READ_ONLY_PRE_ATTESTATION", substage,
      failure.reason, { query: "phase3_core_policy_inventory", sqlstate: failure.sqlstate,
        psqlExitStatus: failure.psqlExitStatus, stderrClass: failure.stderrClass });
  }
}
export function assertCorePolicyReadOnlyAuthorization(environment) {
  if (Object.keys(environment).some((name) => name.startsWith("REFLAB_PRODUCTION_DDL_")
    || name.startsWith("ALLOW_PRODUCTION_") && !CORE_POLICY_ATTESTATION_VARIABLES.includes(name)))
    fail("WRITE_CONFIGURATION", "DDL_CONFIGURATION_REJECTED");
  if (CORE_POLICY_ATTESTATION_VARIABLES.slice(0, 3).some((name) => environment[name] !== "true"))
    fail("OPT_INS", "OPT_IN_REQUIRED");
  guarded("INHERITED_PG_STATE", "INHERITED_PG_STATE", () => assertNoInheritedPgState(environment));
}
export function assertCorePolicyArtifact() {
  const bytes = readFileSync(resolve(root, "supabase/migrations", CORE_POLICY_MIGRATION));
  if (createHash("sha256").update(bytes).digest("hex") !== CORE_POLICY_SHA256)
    fail("MIGRATION_HASH", "REPOSITORY_ARTIFACT_MISMATCH");
}
export function assertCorePolicyCommittedBaseline(git) {
  for (const [path, expected] of [[CORE_POLICY_BASELINE_PATH, CORE_POLICY_BASELINE_ARTIFACT_SHA],
    ["scripts/production-adoption/phase3/phase3-core-policy-contract.mjs", CORE_POLICY_BASELINE_SHARED_SHA]]) {
    const blob = git(["show", `HEAD:${path}`]);
    const bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "utf8");
    const checkout = readFileSync(resolve(root, path), "utf8").replaceAll("\r\n", "\n");
    if (createHash("sha256").update(bytes).digest("hex") !== expected || checkout !== bytes.toString("utf8"))
      fail("BASELINE_ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH");
  }
  if (validateCorePolicyProductionApproval(APPROVED_CORE_POLICY_PRODUCTION_BASELINE).classification !== "EXACT")
    fail("BASELINE_APPROVAL", "REPOSITORY_ARTIFACT_MISMATCH");
  return { ...APPROVED_CORE_POLICY_PRODUCTION_BASELINE, committedArtifactVerified: true };
}
export function runProductionCorePolicyPreAttestation(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== CORE_POLICY_ATTESTATION_OPERATION) fail("OPERATION", "OPERATION_NOT_AUTHORIZED");
  assertCorePolicyReadOnlyAuthorization(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const head = guarded("HEAD_READ", "REPOSITORY_HEAD_READ_FAILED", () => git(["rev-parse", "HEAD"]).trim());
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment[CORE_POLICY_ATTESTATION_VARIABLES[4]])
    fail("APPROVED_HEAD", "HEAD_MISMATCH");
  const status = guarded("WORKTREE_READ", "WORKTREE_READ_FAILED", () => git(["status", "--porcelain", "--untracked-files=all"]));
  if (status.trim()) fail("WORKTREE", "WORKTREE_DIRTY");
  guarded("MIGRATION_HASH", "REPOSITORY_ARTIFACT_MISMATCH", dependencies.assertArtifact ?? assertCorePolicyArtifact);
  const approval = guarded("BASELINE_ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH", () =>
    (dependencies.assertBaseline ?? assertCorePolicyCommittedBaseline)(git));
  const target = guarded("TARGET", "TARGET_MISMATCH", () => {
    const resolved = resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: CORE_POLICY_ATTESTATION_VARIABLES[3], databaseUrlVariable: CORE_POLICY_ATTESTATION_VARIABLES[5],
      operationLabel: "64245 privileged read-only PRE attestation",
    });
    return assertIdentitySecurityBridgeSessionPoolerTarget(resolved);
  });
  const batch = guarded("SQL_BUILD", "LOCAL_PROGRAMMING_ERROR", buildApprovedCorePolicyPreBatch);
  const evidence = guarded("READ_ONLY_BATCH", undefined, () =>
    (dependencies.executeReadOnly ?? executeIdentitySecurityBridgePreReadOnlyBatch)(batch, target.connectionEnvironment,
      { processEnvironment: environment, ...(dependencies.spawn ? { spawn: dependencies.spawn } : {}) }));
  if (!(evidence instanceof Map)) fail("RESULT_SHAPE", "QUERY_RESULT_SHAPE_MISMATCH");
  if (evidence.get("read_only_guard") !== "on") fail("TRANSACTION", "READ_ONLY_GUARD_FAILED");
  return guarded("CLASSIFICATION", "PRE_CLASSIFICATION_FAILED", () => classifyCorePolicyPreAttestation(evidence, approval));
}

// Reject, rather than partially print, an unexpected secret-bearing observation.
export function serializeCorePolicyAttestation(result, environment = {}) {
  const serialized = JSON.stringify(result, null, 2);
  if (serialized.length > 4 * 1024 * 1024) fail("OUTPUT", "OUTPUT_LIMIT_EXCEEDED");
  const url = environment[CORE_POLICY_ATTESTATION_VARIABLES[5]];
  let password = "";
  try { password = url ? decodeURIComponent(new URL(url).password) : ""; } catch { /* Target guard reports invalid URLs. */ }
  if (/(?:postgres(?:ql)?|https?):\/\/|\beyJ[A-Za-z0-9_-]{10,}\./i.test(serialized)
    || url && serialized.includes(url) || password && serialized.includes(password))
    fail("OUTPUT", "LOCAL_PROGRAMMING_ERROR");
  return `${serialized}\n`;
}
export async function runCorePolicyPreAttestationCli(environment = process.env, dependencies = {}) {
  try {
    const result = (dependencies.run ?? runProductionCorePolicyPreAttestation)(environment, {
      ...dependencies, argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined),
    });
    const output = guarded("SERIALIZATION", "LOCAL_PROGRAMMING_ERROR", () => serializeCorePolicyAttestation(result, environment));
    (dependencies.writeStdout ?? ((text) => process.stdout.write(text)))(output);
    return result.classification === "BLOCKER" ? 1 : 0;
  } catch (error) {
    const lines = formatIdentitySecurityBridgePreAttestationFailure(error).trim().split("\n").slice(1);
    const output = { format: "REFLAB_64245_PRE_ATTESTATION_FAIL",
      ...Object.fromEntries(lines.map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; })) };
    (dependencies.writeStderr ?? ((text) => process.stderr.write(text)))(`${JSON.stringify(output)}\n`);
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runCorePolicyPreAttestationCli();
