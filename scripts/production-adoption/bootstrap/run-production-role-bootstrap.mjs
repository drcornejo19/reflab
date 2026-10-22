import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPsqlEnvironment, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import {
  ROLE_BOOTSTRAP_ARTIFACT,
  ROLE_BOOTSTRAP_ARTIFACT_SHA256,
  ROLE_BOOTSTRAP_ATTESTATION,
  ROLE_BOOTSTRAP_FORMAT,
  ROLE_BOOTSTRAP_INSTALLER,
  assertAbsentRoleAttestation,
  assertPinnedArtifacts,
  assertRoleAttestation,
} from "./production-role-bootstrap-contract.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "./production-managed-postgres-target.mjs";

export { assertRepositoryAttestation, resolveProductionManagedPostgresTarget };

const root = resolve(import.meta.dirname, "..", "..", "..");
const bootstrapSql = readFileSync(resolve(root, ROLE_BOOTSTRAP_ARTIFACT), "utf8");
const attestationSql = readFileSync(resolve(root, ROLE_BOOTSTRAP_ATTESTATION), "utf8");

export const ROLE_BOOTSTRAP_OPT_IN = "ALLOW_PRODUCTION_ROLE_BOOTSTRAP";
export const PRODUCTION_DDL_OPT_IN = "ALLOW_PRODUCTION_DDL";
export const PRODUCTION_DDL_PROJECT_REF = "REFLAB_PRODUCTION_DDL_PROJECT_REF";
export const PRODUCTION_DDL_DATABASE_URL = "REFLAB_PRODUCTION_DDL_DB_URL";
export const PRODUCTION_DDL_APPROVED_HEAD = "REFLAB_PRODUCTION_DDL_APPROVED_HEAD";

export function authorizeProductionDdlTarget(environment = process.env, options = {}) {
  const operationOptIn = options.operationOptIn ?? ROLE_BOOTSTRAP_OPT_IN;
  if (environment[operationOptIn] !== "true" || environment[PRODUCTION_DDL_OPT_IN] !== "true") {
    throw new Error("Production DDL requires both explicit opt-ins.");
  }
  return resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: PRODUCTION_DDL_PROJECT_REF,
    databaseUrlVariable: PRODUCTION_DDL_DATABASE_URL,
    operationLabel: "Production DDL",
  });
}

export function parseAttestationOutput(output) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== "on" || lines.length !== 2) {
    throw new Error("Production role bootstrap read-only attestation was malformed.");
  }
  try {
    return JSON.parse(lines[1]);
  } catch {
    throw new Error("Production role bootstrap read-only attestation returned invalid JSON.");
  }
}

function executePsql(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet", "--tuples-only", "--no-align"], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    const detail = sanitizeProcessOutput(result.stderr) || "psql failed without a safe diagnostic.";
    throw new Error(`Production role bootstrap failed: ${detail}`);
  }
  return result.stdout;
}

export function runProductionRoleBootstrap(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== "--production-role-bootstrap") {
    throw new Error("Production role bootstrap requires its exact operation argument.");
  }
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status,
  });
  const hashes = (dependencies.assertHashes ?? assertPinnedArtifacts)(root);
  const target = authorizeProductionDdlTarget(environment);
  const spawn = dependencies.spawn ?? spawnSync;

  const before = parseAttestationOutput(executePsql(attestationSql, target.connectionEnvironment, environment, spawn));
  if (before.role_present) {
    assertRoleAttestation(before);
  } else {
    assertAbsentRoleAttestation(before);
  }
  executePsql(bootstrapSql, target.connectionEnvironment, environment, spawn);
  const after = parseAttestationOutput(executePsql(attestationSql, target.connectionEnvironment, environment, spawn));
  assertRoleAttestation(after);

  return {
    format: ROLE_BOOTSTRAP_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: ROLE_BOOTSTRAP_INSTALLER,
    head: actualHead,
    artifact: { path: ROLE_BOOTSTRAP_ARTIFACT, sha256: hashes.bootstrap ?? ROLE_BOOTSTRAP_ARTIFACT_SHA256 },
    priorState: before.role_present ? "EXACT_ALREADY_PRESENT" : "ABSENT",
    result: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionRoleBootstrap(process.env, { argument }))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_ROLE_BOOTSTRAP_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
