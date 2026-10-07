import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPsqlEnvironment, executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { assertRepositoryAttestation, resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertIdentitySecurityBridgeArtifact, IDENTITY_SECURITY_BRIDGE_SHA256 } from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";
import { assertIdentitySecurityBridgeSessionPoolerTarget, buildIdentitySecurityBridgePreBatch,
  classifyIdentitySecurityBridgePreAttestation } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { buildIdentityBridgePostBatch, classifyIdentityBridgePostBatch,
  IDENTITY_BRIDGE_MUTATIONS } from "./phase3-identity-security-bridge-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const IDENTITY_BRIDGE_OPERATION = "--production-phase3-identity-security-bridge";
export const IDENTITY_BRIDGE_OPT_IN = "ALLOW_PRODUCTION_PHASE3_IDENTITY_SECURITY_BRIDGE";
const variables = new Set(["ALLOW_PRODUCTION_DDL", IDENTITY_BRIDGE_OPT_IN,
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL"]);

export class IdentityBridgeRunnerFailure extends Error {
  constructor(stage, reason, migrationState = "NOT_EXECUTED", sqlstate = null, exitStatus = null) {
    super(`${stage}:${reason}`);
    this.stage = stage;
    this.reason = reason;
    this.migrationState = migrationState;
    this.sqlstate = /^[0-9A-Z]{5}$/.test(sqlstate ?? "") ? sqlstate : null;
    this.psqlExitStatus = Number.isInteger(exitStatus) ? exitStatus : null;
  }
}
function atStage(stage, reason, operation, migrationState = "NOT_EXECUTED") {
  try { return operation(); } catch (error) {
    if (error instanceof IdentityBridgeRunnerFailure) throw error;
    const sqlstate = String(error?.stderr ?? error?.message ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
    throw new IdentityBridgeRunnerFailure(stage, sqlstate ? `SQLSTATE_${sqlstate}` : reason,
      migrationState, sqlstate, error?.status);
  }
}
export function assertIdentityBridgeDdlAuthorization(environment, argument) {
  if (argument !== IDENTITY_BRIDGE_OPERATION) throw new IdentityBridgeRunnerFailure("AUTHORIZATION", "OPERATION_NOT_AUTHORIZED");
  if (environment.ALLOW_PRODUCTION_DDL !== "true" || environment[IDENTITY_BRIDGE_OPT_IN] !== "true") {
    throw new IdentityBridgeRunnerFailure("AUTHORIZATION", "OPT_IN_REQUIRED");
  }
  if (Object.keys(environment).some((name) => (name.startsWith("ALLOW_PRODUCTION_")
    || name.startsWith("REFLAB_PRODUCTION_")) && !variables.has(name))) {
    throw new IdentityBridgeRunnerFailure("AUTHORIZATION", "CONFLICTING_PRODUCTION_CONFIGURATION");
  }
  atStage("AUTHORIZATION", "INHERITED_PG_STATE", () => assertNoInheritedPgState(environment));
}
function executeMigration(sql, connection, environment, spawn) {
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1",
    "--set", "VERBOSITY=verbose", "--quiet"], {
    input: sql, env: buildPsqlEnvironment(environment, connection), encoding: "utf8",
    windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 90000,
  });
  if (result?.error || result?.status !== 0) {
    throw Object.assign(new Error("Migration process did not complete successfully."),
      { stderr: result?.stderr, status: result?.status });
  }
  if (/WARNING:/i.test(String(result.stderr ?? ""))) {
    throw new IdentityBridgeRunnerFailure("MIGRATION", "MIGRATION_WARNING", "POTENTIALLY_COMMITTED");
  }
}
export function runProductionIdentitySecurityBridge(environment = process.env, dependencies = {}) {
  assertIdentityBridgeDdlAuthorization(environment, dependencies.argument);
  const target = atStage("TARGET", "TARGET_MISMATCH", () => assertIdentitySecurityBridgeSessionPoolerTarget(
    (dependencies.resolveTarget ?? resolveProductionManagedPostgresTarget)(environment, {
      projectRefVariable: "REFLAB_PRODUCTION_DDL_PROJECT_REF", databaseUrlVariable: "REFLAB_PRODUCTION_DDL_DB_URL",
      operationLabel: "64236 isolated Production DDL",
    })));
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root,
    encoding: "utf8", windowsHide: true }));
  const head = atStage("AUTHORIZATION", "HEAD_READ_FAILED", () => git(["rev-parse", "HEAD"]).trim());
  const status = atStage("AUTHORIZATION", "WORKTREE_READ_FAILED", () => git(["status", "--porcelain=v1", "--untracked-files=all"]));
  atStage("AUTHORIZATION", "HEAD_MISMATCH", () => assertRepositoryAttestation({
    expectedHead: environment.REFLAB_PRODUCTION_DDL_APPROVED_HEAD, actualHead: head, status: "",
  }));
  if (status.trim()) throw new IdentityBridgeRunnerFailure("AUTHORIZATION", "WORKTREE_DIRTY");
  const artifact = atStage("AUTHORIZATION", "ARTIFACT_HASH_MISMATCH", () =>
    (dependencies.assertArtifact ?? assertIdentitySecurityBridgeArtifact)(root));
  const migrationSql = atStage("AUTHORIZATION", "ARTIFACT_HASH_MISMATCH", () => {
    const bytes = readFileSync(artifact.path);
    if (artifact.sha256 !== IDENTITY_SECURITY_BRIDGE_SHA256
      || createHash("sha256").update(bytes).digest("hex") !== IDENTITY_SECURITY_BRIDGE_SHA256) {
      throw new Error("Pinned migration bytes required.");
    }
    return bytes.toString("utf8");
  });
  const read = (batch) => (dependencies.executeReadOnly ?? executeReadOnlyBatch)(batch,
    target.connectionEnvironment, { processEnvironment: environment,
      spawn: (command, args, options) => (dependencies.spawn ?? spawnSync)(command,
        [...args, "--set", "VERBOSITY=verbose"], { ...options, timeout: 90000 }) });
  const pre = atStage("PRE_DDL", "PRE_DDL_ATTESTATION_FAILED", () =>
    (dependencies.classifyPre ?? classifyIdentitySecurityBridgePreAttestation)(read(buildIdentitySecurityBridgePreBatch())));
  if (pre?.classification !== "64236_PRE_EXACT") throw new IdentityBridgeRunnerFailure("PRE_DDL", "PRE_DDL_CONTRACT_MISMATCH");
  atStage("MIGRATION", "MIGRATION_FAILED", () => (dependencies.executeMigration
    ?? ((sql, connection) => executeMigration(sql, connection, environment, dependencies.spawn ?? spawnSync)))
    (migrationSql, target.connectionEnvironment), "POTENTIALLY_COMMITTED");
  const post = atStage("POST_DDL", "POST_DDL_ATTESTATION_FAILED", () =>
    (dependencies.classifyPost ?? classifyIdentityBridgePostBatch)(read(buildIdentityBridgePostBatch())),
  "COMMITTED_REQUIRES_READ_ONLY_FORENSIC");
  if (post?.classification !== "EXACT") throw new IdentityBridgeRunnerFailure("POST_DDL", "POST_DDL_CONTRACT_MISMATCH",
    "COMMITTED_REQUIRES_READ_ONLY_FORENSIC");
  return { format: "REFLAB_64236_ISOLATED_PRODUCTION_EXECUTION_V1", head,
    artifact: { path: artifact.path, sha256: artifact.sha256 }, preDdl: { contract: "EXACT" },
    migration: "PASS", transaction: "COMMIT", postDdl: { contract: "EXACT" },
    mutationAccounting: IDENTITY_BRIDGE_MUTATIONS, runtime: "DISABLED", nextProvider: "NOT_AUTHORIZED",
    cutover: "NOT_AUTHORIZED" };
}
export async function runProductionIdentitySecurityBridgeCli(environment = process.env, dependencies = {}) {
  let result;
  try {
    const argument = dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    result = runProductionIdentitySecurityBridge(environment, { ...dependencies, argument });
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof IdentityBridgeRunnerFailure ? error : new IdentityBridgeRunnerFailure(
      result ? "POST_DDL" : "AUTHORIZATION", "LOCAL_PROGRAMMING_ERROR",
      result ? "COMMITTED_REQUIRES_READ_ONLY_FORENSIC" : "NOT_EXECUTED");
    const output = { format: "REFLAB_64236_ISOLATED_PRODUCTION_EXECUTION_FAIL", stage: failure.stage,
      reason: failure.reason, sqlstate: failure.sqlstate, psqlExitStatus: failure.psqlExitStatus,
      migrationState: failure.migrationState, reexecution: "FORBIDDEN", nextProvider: "NOT_AUTHORIZED" };
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(`${JSON.stringify(output)}\n`);
    return 1;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionIdentitySecurityBridgeCli();
}
