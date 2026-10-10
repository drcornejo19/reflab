import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { SERVICE_FORENSIC_ARTIFACTS } from "./run-production-service-role-privilege-forensic.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertIdentitySecurityBridgeSessionPoolerTarget } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { buildCurrentServiceBatch, classifyCurrentServiceTransition, CURRENT_SERVICE_MIGRATION_PATH } from "./phase3-current-service-role-contract.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";

export const HARNESS_ROOT = resolve(import.meta.dirname, "../../..");
export const CURRENT_SERVICE_SHA = "f4634ee7b18643d3672cf6767ebe8b5085e13b2e66dd5cd813c4d6b92e601fa0";
export const PRE_FORMAT = "REFLAB_CURRENT_SERVICE_ROLE_PRODUCTION_PRE_ATTESTATION_V1";
export const PRE_OPERATION = "--production-current-service-role-pre-attestation";
export const PRE_RUNNER = "scripts/production-adoption/phase3/run-production-current-service-role-pre.mjs";
export const DDL_RUNNER = "scripts/production-adoption/phase3/run-production-current-service-role-reconciliation.mjs";
export const PRE_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_CURRENT_SERVICE_ROLE_PRE", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL"]);
export const CURRENT_ARTIFACTS = Object.freeze({...SERVICE_FORENSIC_ARTIFACTS,
  [CURRENT_SERVICE_MIGRATION_PATH]: CURRENT_SERVICE_SHA,
  "scripts/production-adoption/phase3/phase3-current-service-role-contract.mjs": "3ad30e737faeb5c2e3a6405bd59ad01a14f6fc46ee35e18149287c462c82d2f3",
  "scripts/production-adoption/phase3/phase3-current-service-role-matrix.mjs": "da514a08502d5cb1f774de35bfcecc97f37d33ea337b5f407cd6f3f6ec4f440f",
  "scripts/production-adoption/phase3/phase3-current-service-role-migration-source.mjs": "66675035f97d7c335c04a498a750368c8d834aa869d402c64de2c8c3d489796d",
});
export const HARNESS_ARTIFACTS = Object.freeze([PRE_RUNNER, DDL_RUNNER,
  "scripts/production-adoption/phase3/phase3-current-service-role-pre-contract.mjs",
  "scripts/production-adoption/phase3/phase3-current-service-role-ddl-contract.mjs"]);
export const TARGET = Object.freeze({project: "nagjddldrldwavmfaytc", host: "aws-1-sa-east-1.pooler.supabase.com",
  port: 5432, database: "postgres", sslmode: "require", installer: "postgres.nagjddldrldwavmfaytc"});
export const PRE_BEGIN = "begin read only;\nset local lock_timeout='2s';\nset local statement_timeout='15s';\nset local idle_in_transaction_session_timeout='15s';\nset local transaction_timeout='180s';";
export const failHarness = (reason) => {throw new CorePolicySessionFailure(reason);};
export const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const defaultGit = (args) => execFileSync("git", args, {cwd: HARNESS_ROOT, windowsHide: true});

export function authorizeCurrentHarness(environment, operation, variables, optIns, headVariable, git) {
  if (operation !== (variables === PRE_VARIABLES ? PRE_OPERATION : "--execute-production-current-service-role-reconciliation")) failHarness("OPERATION_NOT_AUTHORIZED");
  if (optIns.some((key) => environment[key] !== "true")) failHarness("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((key) => /^PG/i.test(key))) failHarness("INHERITED_PG_STATE");
  if (Object.keys(environment).some((key) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(key) && !variables.includes(key)))
    failHarness("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || environment[headVariable] !== head) failHarness("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) failHarness("WORKTREE_DIRTY");
  return head;
}

export function verifyCurrentHarnessArtifacts(git, head, runnerPath, executingBytes,
  readCheckout = (path) => readFileSync(resolve(HARNESS_ROOT, path))) {
  const pending = [...Object.keys(CURRENT_ARTIFACTS), ...HARNESS_ARTIFACTS], seen = new Set(), hashes = {};
  while (pending.length) {
    const path = pending.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    if (path.startsWith("../") || !/^[a-zA-Z0-9_./-]+$/.test(path)) failHarness("ARTIFACT_PATH_REJECTED");
    const blob = git(["show", `${head}:${path}`]);
    const bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
    const checkout = readCheckout(path);
    if (!Buffer.isBuffer(checkout) || checkout.toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8"))
      failHarness("CHECKOUT_ARTIFACT_MISMATCH");
    hashes[path] = hashBytes(bytes);
    if (CURRENT_ARTIFACTS[path] && hashes[path] !== CURRENT_ARTIFACTS[path]) failHarness("COMMITTED_ARTIFACT_MISMATCH");
    if (path.endsWith(".mjs")) {
      // Pin the entire static import closure to approved Git bytes, including shared helpers.
      for (const match of bytes.toString("utf8").matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g))
        pending.push(posix.normalize(posix.join(posix.dirname(path), match[1])));
      if (/\bimport\s*\(/.test(bytes.toString("utf8"))) failHarness("DYNAMIC_EXECUTION_DEPENDENCY_REJECTED");
    }
  }
  if (!Buffer.isBuffer(executingBytes) || hashBytes(executingBytes) !== hashes[runnerPath]) failHarness("RUNNER_ARTIFACT_MISMATCH");
  return {runnerArtifactExact: true, protectedArtifactsExact: true, artifactHashes: hashes};
}

export function resolveCurrentHarnessTarget(environment, projectRefVariable, databaseUrlVariable) {
  try {return assertIdentitySecurityBridgeSessionPoolerTarget(resolveProductionManagedPostgresTarget(environment,
    {projectRefVariable, databaseUrlVariable, operationLabel: "isolated current service_role transition"}));}
  catch {failHarness("TARGET_MISMATCH");}
}

export function buildCurrentHarnessObservation() {
  const batch = buildCurrentServiceBatch();
  const prefix = "begin read only;\nset local statement_timeout = '15s';\nset local lock_timeout = '2s';\n";
  const suffix = "rollback;\n";
  if (!batch.startsWith(prefix) || !batch.endsWith(suffix)) failHarness("OBSERVATION_WRAPPER_MISMATCH");
  const body = batch.slice(prefix.length, -suffix.length);
  assertReadOnlySql(body);
  return body;
}

export function classifyCurrentHarnessEvidence(results, readOnly, classify = classifyCurrentServiceTransition) {
  if (!(results instanceof Map) || !results.has("read_only_guard")) return {classification: "UNKNOWN", executablePre: false,
    failedChecks: [], unknownChecks: ["transactionObservationIncomplete"], transactionReadOnly: null};
  if (results.get("read_only_guard") !== (readOnly ? "on" : "off")) return {classification: "BLOCKER", executablePre: false,
    failedChecks: ["transactionModeExact"], unknownChecks: [], transactionReadOnly: null};
  // Only the transport guard is projected for the observation-only predecessor classifiers.
  // Catalog evidence is unchanged. The actual transaction mode remains explicit in output.
  const projection = new Map(results); projection.set("read_only_guard", "on");
  return {...classify(projection), transactionReadOnly: readOnly};
}

export function serializeCurrentHarness(report, environment, ddl = false) {
  return serializeBrowserForensic(report, {...environment, REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL:
    ddl ? environment.REFLAB_PRODUCTION_DDL_DB_URL : environment.REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL});
}
export function safeHarnessFailure(error) {
  return error instanceof CorePolicySessionFailure && /^[A-Z0-9_]{1,100}$/.test(error.reason) ? error.reason : "LOCAL_CONTRACT_OR_TRANSPORT_FAILURE";
}
