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
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  phase1HistoricalFingerprintExact,
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  adminCanonicalAccessPostQuery,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
  canonicalRuntimePrerequisitesPostQuery,
  classifyCanonicalJsonbTextProvider,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  CANONICAL_COMMUNICATION_POST_QUERY_ID,
  canonicalCommunicationPostQuery,
  classifyCanonicalCommunicationCompletionPreservation,
  classifyCanonicalCommunicationState,
} from "./phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_FORMAT,
  CANONICAL_RUNTIME_INSTALLED_MUTATIONS,
  CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID,
  CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
  assertCanonicalRuntimeInstalledArtifact,
  canonicalRuntimeInstalledPostQuery,
  canonicalRuntimeInstalledPreQuery,
  classifyCanonicalRuntimeInstalledComposition,
  classifyCanonicalRuntimeInstalledState,
} from "./phase2b-canonical-runtime-installed-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const CANONICAL_RUNTIME_INSTALLED_OPERATION =
  "--production-phase2b-canonical-runtime-installed";
export const CANONICAL_RUNTIME_INSTALLED_OPT_IN =
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED";

function sqlstate(value) {
  return String(value?.stderr ?? value?.message ?? value ?? "")
    .match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):|SQLSTATE[_=:-]?([0-9A-Z]{5})/i)
    ?.slice(1).find(Boolean)?.toUpperCase();
}

class RunnerFailure extends Error {
  constructor(stage, reason, rollback = "NOT_REQUIRED") {
    super(`${stage}:${reason}`);
    this.stage = stage;
    this.reason = reason;
    this.rollback = rollback;
  }
}

function atStage(stage, reason, operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RunnerFailure) throw error;
    throw new RunnerFailure(stage, sqlstate(error) ? `SQLSTATE_${sqlstate(error)}` : reason);
  }
}

function formatFailure(error) {
  const failure = error instanceof RunnerFailure
    ? error
    : new RunnerFailure("OTHER", "SAFE_DIAGNOSTIC_UNAVAILABLE");
  return `PHASE2B_CANONICAL_RUNTIME_INSTALLED_FAIL:\nstage=${failure.stage}\nreason=${failure.reason}\nrollback=${failure.rollback}\n`;
}

function executeMigration(sql, connectionEnvironment, environment, spawn = spawnSync) {
  const result = spawn("psql", [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--quiet",
  ], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
    env: buildPsqlEnvironment(environment, connectionEnvironment),
  });
  if (result.error || result.status !== 0) {
    throw Object.assign(new Error("202608310006 migration failed."), { stderr: result.stderr });
  }
}

export function assertCanonicalRuntimeInstalledSessionPoolerTarget(target) {
  const expectedUsername = `postgres.${PRODUCTION_PROJECT_REF}`;
  const connection = target?.connectionEnvironment;
  if (target?.projectRef !== PRODUCTION_PROJECT_REF
      || target?.host !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGHOST !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGPORT !== "5432"
      || connection?.PGDATABASE !== "postgres"
      || connection?.PGUSER !== expectedUsername
      || connection?.PGSSLMODE !== "require") {
    throw new Error("202608310006_TARGET_REJECTED");
  }
  return target;
}

export function buildCanonicalRuntimeInstalledPreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    canonicalCommunicationPostQuery,
    canonicalRuntimeInstalledPreQuery,
  ]);
}

export function buildCanonicalRuntimeInstalledPostBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    canonicalCommunicationPostQuery,
    canonicalRuntimeInstalledPostQuery,
  ]);
}

function phase2aAtCompletion(payload, post) {
  return classifyPhase2aSemanticAuditPost({
    ...payload,
    checks: {
      ...payload?.checks,
      phase2bAbsent: true,
      ...(post ? { ledgerExact: true } : {}),
    },
    counts: {
      ...payload?.counts,
      ...(post ? { ledger_rows: 3 } : {}),
    },
  });
}

function adminAtCompletion(payload, post) {
  const adjusted = post ? {
    ...payload,
    checks: { ...payload?.checks, ledgerExact: true },
    counts: { ...payload?.counts, ledger: 3 },
  } : payload;
  return classifyAdminCanonicalAccessState(adjusted, {
    post: true,
    communicationProviderPresent: true,
  });
}

export function classifyCanonicalRuntimeInstalledEvidence(results, { post = false } = {}) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const historicalFingerprintExact = phase1HistoricalFingerprintExact(
    results.get(phase1ProductFingerprintQuery.id),
  );
  const phase2a = phase2aAtCompletion(results.get(phase2aSemanticAuditPostQuery.id), post);
  const helper = classifyCanonicalJsonbTextProvider(
    results.get(CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID),
  );
  const admin = adminAtCompletion(results.get(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID), post);
  const communicationPayload = results.get(CANONICAL_COMMUNICATION_POST_QUERY_ID);
  const communication = post
    ? classifyCanonicalCommunicationCompletionPreservation(communicationPayload)
    : classifyCanonicalCommunicationState(communicationPayload, { post: true });
  const runtimeInstalled = classifyCanonicalRuntimeInstalledState(results.get(
    post ? CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID : CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
  ), { post });
  const composition = classifyCanonicalRuntimeInstalledComposition({
    installer, historicalFingerprintExact, phase2a, helper, admin, communication, runtimeInstalled,
  }, { post });
  return {
    installer, historicalFingerprintExact, phase2a, helper, admin,
    communication, runtimeInstalled, composition,
  };
}

function classifyDependencies(results, { post }) {
  const evidence = classifyCanonicalRuntimeInstalledEvidence(results, { post });
  if (evidence.composition.classification !== "EXACT") {
    throw new RunnerFailure(
      post ? "POST_DDL_ATTESTATION" : "PRE_DDL_CONTRACT",
      post ? "POST_DDL_CONTRACT_MISMATCH" : "PRE_DDL_CONTRACT_MISMATCH",
    );
  }
  return evidence;
}

export function classifyCanonicalRuntimeInstalledPreBatch(results) {
  return classifyDependencies(results, { post: false });
}

export function classifyCanonicalRuntimeInstalledPostBatch(results) {
  return classifyDependencies(results, { post: true });
}

export function runProductionPhase2bCanonicalRuntimeInstalled(
  environment = process.env,
  dependencies = {},
) {
  atStage("TARGET_GUARD", "OPERATION_NOT_AUTHORIZED", () => {
    if (dependencies.argument !== CANONICAL_RUNTIME_INSTALLED_OPERATION) throw new Error("operation");
    assertNoInheritedPgState(environment);
  });
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const head = atStage("HEAD_GUARD", "HEAD_ATTESTATION_FAILED", () =>
    git(["rev-parse", "HEAD"]).trim());
  const status = atStage("WORKTREE_GUARD", "WORKTREE_ATTESTATION_FAILED", () =>
    git(["status", "--short"]));
  atStage("HEAD_GUARD", "REPOSITORY_ATTESTATION_FAILED", () => assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead: head, status,
  }));
  const artifact = atStage("ARTIFACT_HASH", "ARTIFACT_HASH_MISMATCH", () =>
    (dependencies.assertArtifact ?? assertCanonicalRuntimeInstalledArtifact)(root));
  const target = atStage("TARGET_GUARD", "TARGET_REJECTED", () =>
    assertCanonicalRuntimeInstalledSessionPoolerTarget(
      (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, {
        operationOptIn: CANONICAL_RUNTIME_INSTALLED_OPT_IN,
      }),
    ));
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const classifyPre = dependencies.classifyPre ?? classifyCanonicalRuntimeInstalledPreBatch;
  const classifyPost = dependencies.classifyPost ?? classifyCanonicalRuntimeInstalledPostBatch;
  const read = (batch) => executeReadOnly(
    batch, target.connectionEnvironment, { processEnvironment: environment },
  );
  const before = atStage("PRE_DDL_CONTRACT", "PRE_DDL_CONTRACT_FAILED", () =>
    classifyPre(read(buildCanonicalRuntimeInstalledPreBatch())));
  try {
    (dependencies.executeMigration ?? ((sql, connection) => executeMigration(
      sql, connection, environment, dependencies.spawn ?? spawnSync,
    )))(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "BLOCKER";
    try {
      classifyPre(read(buildCanonicalRuntimeInstalledPreBatch()));
      rollback = "PASS";
    } catch {}
    throw new RunnerFailure(
      "MIGRATION_SQL",
      sqlstate(error) ? `SQLSTATE_${sqlstate(error)}` : "MIGRATION_FAILED",
      rollback,
    );
  }
  const after = atStage("POST_DDL_ATTESTATION", "POST_DDL_ATTESTATION_FAILED", () =>
    classifyPost(read(buildCanonicalRuntimeInstalledPostBatch())));
  return {
    format: CANONICAL_RUNTIME_INSTALLED_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, contract: "EXACT" },
    migration: "PASS",
    transaction: "COMMIT",
    postDdl: { contract: "EXACT", canonicalRuntimeInstalled: "EXACT" },
    mutationAccounting: CANONICAL_RUNTIME_INSTALLED_MUTATIONS,
    runtime: "DISABLED",
    nextProviderReview: "PHASE4_EXECUTION_REVIEW",
    nextProvider: "NOT_AUTHORIZED",
    cutover: "NOT_AUTHORIZED",
    preserved: { sidecar: after.phase2a.postState, historicalFingerprints: true },
  };
}

export async function runProductionPhase2bCanonicalRuntimeInstalledCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionPhase2bCanonicalRuntimeInstalled)(
      environment, { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
      `${JSON.stringify(result)}\n`,
    );
    return 0;
  } catch (error) {
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(formatFailure(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionPhase2bCanonicalRuntimeInstalledCli();
}
