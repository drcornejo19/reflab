import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import {
  buildPsqlEnvironment,
  executeReadOnlyBatch,
  sanitizeProcessOutput,
} from "../../production-preflight/run.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  assertRepositoryAttestation,
  authorizeProductionDdlTarget,
} from "./run-production-role-bootstrap.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  classifyPhase1DdlEntry,
  phase1EntryQuery,
} from "./phase1-entry-attestation-contract.mjs";
import {
  PHASE1_FOUNDATION_DDL_FORMAT,
  PHASE1_FOUNDATION_OPERATION,
  PHASE1_FOUNDATION_OPT_IN,
  PHASE1_POST_ATTESTATION_QUERY_ID,
  PHASE1_PRODUCT_FINGERPRINT_QUERY_ID,
  assertPhase1FoundationArtifact,
  classifyPhase1PostAttestation,
  phase1PostAttestationQuery,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function postgresDiagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return {
    sqlstate: match?.[1] ?? "UNKNOWN",
    message: match?.[2]?.slice(0, 240) ?? "sanitized diagnostic unavailable",
  };
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", [
    "-X",
    "--no-psqlrc",
    "--set", "ON_ERROR_STOP=1",
    "--set", "VERBOSITY=verbose",
    "--quiet",
  ], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    const diagnostic = postgresDiagnostic(result.stderr);
    throw Object.assign(new Error(
      `Production Phase 1 foundation failed; SQLSTATE=${diagnostic.sqlstate}; message=${diagnostic.message}.`,
    ), { sqlstate: diagnostic.sqlstate });
  }
}

function preDdlAttestation(results) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const phase1 = classifyPhase1DdlEntry(results.get(phase1EntryQuery.id), installer);
  const fingerprint = results.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID);
  const fingerprintExact = fingerprint
    && ["attempts", "exam_results", "notifications"].every((field) => Number.isInteger(fingerprint[field]));
  if (installer.managedProfile !== "READY" || installer.lifecycleState !== "POST_BOOTSTRAP"
      || phase1.phase1Entry !== "READY" || !fingerprintExact) {
    throw new Error("Production Phase 1 foundation pre-DDL attestation failed.");
  }
  return { installer, phase1, fingerprint };
}

function runPreDdlReadOnly(execute, target, environment) {
  const sql = buildSqlBatch([
    installerIdentityQuery,
    phase1EntryQuery,
    phase1ProductFingerprintQuery,
  ]);
  return preDdlAttestation(execute(sql, target.connectionEnvironment, { processEnvironment: environment }));
}

export function runProductionPhase1Foundation(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== PHASE1_FOUNDATION_OPERATION) {
    throw new Error("Production Phase 1 foundation requires its exact operation argument.");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead, status,
  });
  const artifact = (dependencies.assertArtifact ?? assertPhase1FoundationArtifact)(root);
  const target = (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, {
    operationOptIn: PHASE1_FOUNDATION_OPT_IN,
  });
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(
      sql,
      connectionEnvironment,
      environment,
      dependencies.spawn ?? spawnSync,
    ));

  const before = runPreDdlReadOnly(executeReadOnly, target, environment);
  try {
    executeApprovedMigration(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "UNKNOWN";
    try {
      runPreDdlReadOnly(executeReadOnly, target, environment);
      rollback = "PASS";
    } catch {
      rollback = "BLOCKER";
    }
    throw new Error(`${sanitizeProcessOutput(error.message)} rollback=${rollback}.`);
  }

  const postSql = buildSqlBatch([
    installerIdentityQuery,
    phase1PostAttestationQuery,
    phase1ProductFingerprintQuery,
  ]);
  const postResults = executeReadOnly(postSql, target.connectionEnvironment, { processEnvironment: environment });
  const postInstaller = classifyInstallerIdentity(postResults.get(installerIdentityQuery.id));
  const post = classifyPhase1PostAttestation(
    postResults.get(PHASE1_POST_ATTESTATION_QUERY_ID),
    postInstaller,
    before.fingerprint,
    postResults.get(PHASE1_PRODUCT_FINGERPRINT_QUERY_ID),
  );
  if (post.phase1PostState !== "EXACT") {
    throw new Error("Production Phase 1 foundation post-DDL attestation failed.");
  }

  return {
    format: PHASE1_FOUNDATION_DDL_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head: actualHead,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, phase1Entry: before.phase1.phase1Entry },
    migration: "PASS",
    postDdl: post,
    nextMigration: "NOT_AUTHORIZED",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPhase1Foundation(process.env, { argument }))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRODUCTION_PHASE1_FOUNDATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}

