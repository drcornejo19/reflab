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
  PRE_PHASE2B_POST_QUERY_ID,
  classifyPrePhase2bPost,
  prePhase2bPostQuery,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  CANONICAL_TRAINING_FORMAT,
  CANONICAL_TRAINING_MUTATIONS,
  CANONICAL_TRAINING_OPERATION,
  CANONICAL_TRAINING_OPT_IN,
  CANONICAL_TRAINING_POST_QUERY_ID,
  CANONICAL_TRAINING_PRE_QUERY_ID,
  assertCanonicalTrainingArtifact,
  canonicalTrainingPostQuery,
  canonicalTrainingPreQuery,
  classifyCanonicalTrainingState,
} from "./phase2b-canonical-training-attempts-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const privilegeWarningPattern = /WARNING:[^\r\n]*(?:no privileges were granted|no privileges could be revoked|not enough privileges|permission denied)/i;

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
  try { return operation(); }
  catch (error) {
    if (error instanceof RunnerFailure) throw error;
    throw new RunnerFailure(stage, sqlstate(error) ? `SQLSTATE_${sqlstate(error)}` : reason);
  }
}
function formatFailure(error) {
  const failure = error instanceof RunnerFailure
    ? error
    : new RunnerFailure("OTHER", "SAFE_DIAGNOSTIC_UNAVAILABLE");
  return `PHASE2B_CANONICAL_TRAINING_ATTEMPTS_FAIL:\nstage=${failure.stage}\nreason=${failure.reason}\nrollback=${failure.rollback}\n`;
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
    throw Object.assign(new Error("202608130001 migration failed."), { stderr: result.stderr });
  }
  if (privilegeWarningPattern.test(String(result.stderr ?? ""))) {
    throw Object.assign(new Error("202608130001 emitted an unsafe privilege warning."), {
      stderr: "PRIVILEGE_WARNING",
    });
  }
}

export function assertCanonicalTrainingSessionPoolerTarget(target) {
  const expectedUsername = `postgres.${PRODUCTION_PROJECT_REF}`;
  const connection = target?.connectionEnvironment;
  if (target?.projectRef !== PRODUCTION_PROJECT_REF
      || target?.host !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGHOST !== PRODUCTION_SESSION_POOLER_HOST
      || connection?.PGPORT !== "5432"
      || connection?.PGDATABASE !== "postgres"
      || connection?.PGUSER !== expectedUsername
      || connection?.PGSSLMODE !== "require") {
    throw new Error("202608130001_TARGET_REJECTED");
  }
  return target;
}

export function buildCanonicalTrainingPreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    prePhase2bPostQuery,
    canonicalTrainingPreQuery,
  ]);
}
export function buildCanonicalTrainingPostBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    canonicalTrainingPostQuery,
  ]);
}

function adminProviderExact(state, { beforeTraining }) {
  const checks = state?.checks ?? {};
  const exactSecurity = [
    "helperSourceExact", "helperAclExact", "functionsExact", "functionAclExact",
    "policiesExact", "schemaAclExact", "columnAclExact",
  ].every((name) => checks[name] === true);
  return exactSecurity && (!beforeTraining || checks.tableAclExact === true);
}

function classifyDependencies(results, { post }) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprintExact = phase1HistoricalFingerprintExact(results.get(phase1ProductFingerprintQuery.id));
  const sidecarPayload = results.get(phase2aSemanticAuditPostQuery.id);
  const sidecar = classifyPhase2aSemanticAuditPost({
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  });
  const canonicalJsonbText = classifyCanonicalJsonbTextProvider(
    results.get(CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID),
  );
  const admin = classifyAdminCanonicalAccessState(
    results.get(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID), { post: true },
  );
  const lifecycleExact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT";
  const training = classifyCanonicalTrainingState(results.get(
    post ? CANONICAL_TRAINING_POST_QUERY_ID : CANONICAL_TRAINING_PRE_QUERY_ID,
  ), { post });
  const prerequisite = post ? null : classifyPrePhase2bPost(
    results.get(PRE_PHASE2B_POST_QUERY_ID), installer,
  );
  const exact = lifecycleExact && fingerprintExact && sidecar.postState === "EXACT"
    && canonicalJsonbText.classification === "EXACT"
    && adminProviderExact(admin, { beforeTraining: !post })
    && (post || prerequisite.classification === "EXACT")
    && training.classification === (post ? "EXACT" : "PASS");
  if (!exact) {
    throw new RunnerFailure(
      post ? "POST_DDL_ATTESTATION" : "PRE_DDL_ATTESTATION",
      post ? "POST_DDL_CONTRACT_MISMATCH" : "PRE_DDL_CONTRACT_MISMATCH",
    );
  }
  return { installer, fingerprintExact, sidecar, canonicalJsonbText, admin, prerequisite, training };
}

export function classifyCanonicalTrainingPreBatch(results) {
  return classifyDependencies(results, { post: false });
}
export function classifyCanonicalTrainingPostBatch(results) {
  return classifyDependencies(results, { post: true });
}

export function runProductionPhase2bCanonicalTrainingAttempts(
  environment = process.env,
  dependencies = {},
) {
  atStage("TARGET_GUARD", "OPERATION_NOT_AUTHORIZED", () => {
    if (dependencies.argument !== CANONICAL_TRAINING_OPERATION) throw new Error("operation");
    assertNoInheritedPgState(environment);
  });
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const head = atStage("HEAD_GUARD", "HEAD_ATTESTATION_FAILED", () => git(["rev-parse", "HEAD"]).trim());
  const status = atStage("WORKTREE_GUARD", "WORKTREE_ATTESTATION_FAILED", () => git(["status", "--short"]));
  atStage("HEAD_GUARD", "REPOSITORY_ATTESTATION_FAILED", () => assertRepositoryAttestation({
    expectedHead: environment[PRODUCTION_DDL_APPROVED_HEAD], actualHead: head, status,
  }));
  const artifact = atStage("ARTIFACT_HASH", "ARTIFACT_HASH_MISMATCH", () =>
    (dependencies.assertArtifact ?? assertCanonicalTrainingArtifact)(root));
  const target = atStage("TARGET_GUARD", "TARGET_REJECTED", () => assertCanonicalTrainingSessionPoolerTarget(
    (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, {
      operationOptIn: CANONICAL_TRAINING_OPT_IN,
    }),
  ));
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const classifyPre = dependencies.classifyPre ?? classifyCanonicalTrainingPreBatch;
  const classifyPost = dependencies.classifyPost ?? classifyCanonicalTrainingPostBatch;
  const read = (batch) => executeReadOnly(
    batch, target.connectionEnvironment, { processEnvironment: environment },
  );
  const before = atStage("PRE_DDL_ATTESTATION", "PRE_DDL_ATTESTATION_FAILED", () =>
    classifyPre(read(buildCanonicalTrainingPreBatch())));
  try {
    (dependencies.executeMigration ?? ((sql, connection) => executeMigration(
      sql, connection, environment, dependencies.spawn ?? spawnSync,
    )))(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "BLOCKER";
    try { classifyPre(read(buildCanonicalTrainingPreBatch())); rollback = "PASS"; }
    catch {}
    throw new RunnerFailure(
      "MIGRATION_SQL",
      sqlstate(error) ? `SQLSTATE_${sqlstate(error)}`
        : String(error?.stderr) === "PRIVILEGE_WARNING" ? "PRIVILEGE_WARNING" : "MIGRATION_FAILED",
      rollback,
    );
  }
  const after = atStage("POST_DDL_ATTESTATION", "POST_DDL_ATTESTATION_FAILED", () =>
    classifyPost(read(buildCanonicalTrainingPostBatch())));
  return {
    format: CANONICAL_TRAINING_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, contract: "EXACT" },
    migration: "PASS",
    transaction: "COMMIT",
    postDdl: { contract: "EXACT", canonicalTrainingAttempts: "EXACT" },
    mutationAccounting: CANONICAL_TRAINING_MUTATIONS,
    nextProviderReview: "202608150001_EXECUTION_REVIEW",
    nextProvider: "NOT_AUTHORIZED",
    preserved: { sidecar: after.sidecar.postState, historicalFingerprints: true },
  };
}

export async function runProductionPhase2bCanonicalTrainingAttemptsCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionPhase2bCanonicalTrainingAttempts)(
      environment, { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(formatFailure(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionPhase2bCanonicalTrainingAttemptsCli();
}
