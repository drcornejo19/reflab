import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import {
  buildPsqlEnvironment,
  executeReadOnlyBatch,
  sanitizeProcessOutput,
} from "../../production-preflight/run.mjs";
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
  PRE_PHASE2B_FORMAT,
  PRE_PHASE2B_OPERATION,
  PRE_PHASE2B_OPT_IN,
  PRE_PHASE2B_POST_QUERY_ID,
  PRE_PHASE2B_PRE_QUERY_ID,
  PRE_PHASE2B_MUTATION_ACCOUNTING,
  assertPrePhase2bArtifact,
  classifyPrePhase2bPost,
  classifyPrePhase2bPre,
  prePhase2bPostQuery,
  prePhase2bPreQuery,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function diagnostic(stderr) {
  const match = String(stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/);
  return match?.[1] ?? "UNKNOWN";
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
    throw Object.assign(new Error(`MIGRATION_SQLSTATE_${diagnostic(result.stderr)}`), {
      stage: "MIGRATION_SQL",
    });
  }
}

export function buildPrePhase2bPreBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase2aSemanticAuditPostQuery,
    canonicalRuntimePrerequisitesPostQuery,
    adminCanonicalAccessPostQuery,
    prePhase2bPreQuery,
  ]);
}

export function buildPrePhase2bPostBatch() {
  return buildSqlBatch([installerIdentityQuery, prePhase2bPostQuery]);
}

function classifyProviderDependencies(results) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprintExact = phase1HistoricalFingerprintExact(
    results.get(phase1ProductFingerprintQuery.id),
  );
  const sidecarPayload = results.get(phase2aSemanticAuditPostQuery.id);
  // Provider state is attested independently below; retain the authoritative sidecar identity checks.
  const adjustedSidecar = {
    ...sidecarPayload,
    checks: { ...sidecarPayload?.checks, phase2bAbsent: true },
  };
  const sidecar = classifyPhase2aSemanticAuditPost(adjustedSidecar);
  const canonicalJsonbText = classifyCanonicalJsonbTextProvider(
    results.get(CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID),
  );
  const providers = classifyAdminCanonicalAccessState(
    results.get(ADMIN_CANONICAL_ACCESS_POST_QUERY_ID),
    { post: true },
  );
  const lifecycleExact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT";
  return {
    installer, fingerprintExact, sidecar, canonicalJsonbText, providers, lifecycleExact,
  };
}

export function inspectPrePhase2bExecutionGate(results) {
  const dependencies = classifyProviderDependencies(results);
  const adoption = classifyPrePhase2bPre(
    results.get(PRE_PHASE2B_PRE_QUERY_ID),
    dependencies.installer,
  );
  return { ...dependencies, adoption };
}

export function classifyPrePhase2bExecutionGate(results) {
  const inspection = inspectPrePhase2bExecutionGate(results);
  if (!inspection.lifecycleExact || !inspection.fingerprintExact
      || inspection.sidecar.postState !== "EXACT"
      || inspection.canonicalJsonbText.classification !== "EXACT"
      || inspection.providers.classification !== "EXACT"
      || inspection.adoption.classification !== "PASS") {
    throw new Error("PRE_DDL_CONTRACT_MISMATCH");
  }
  return inspection;
}

function classifyPre(results) {
  return classifyPrePhase2bExecutionGate(results);
}

function classifyPost(results) {
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const adoption = classifyPrePhase2bPost(results.get(PRE_PHASE2B_POST_QUERY_ID), installer);
  if (adoption.classification !== "EXACT") throw new Error("POST_DDL_CONTRACT_MISMATCH");
  return { installer, adoption };
}

export function assertPrePhase2bSessionPoolerTarget(target) {
  const expectedUsername = `postgres.${PRODUCTION_PROJECT_REF}`;
  if (target?.projectRef !== PRODUCTION_PROJECT_REF
      || target?.host !== PRODUCTION_SESSION_POOLER_HOST
      || target?.connectionEnvironment?.PGHOST !== PRODUCTION_SESSION_POOLER_HOST
      || target?.connectionEnvironment?.PGPORT !== "5432"
      || target?.connectionEnvironment?.PGDATABASE !== "postgres"
      || target?.connectionEnvironment?.PGUSER !== expectedUsername
      || target?.connectionEnvironment?.PGSSLMODE !== "require") {
    throw new Error("PRE_PHASE2B_TARGET_REJECTED");
  }
  return target;
}

export function runProductionPrePhase2bAdoptionPrerequisite(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== PRE_PHASE2B_OPERATION) {
    throw new Error("EXACT_OPERATION_ARGUMENT_REQUIRED");
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
  const artifact = (dependencies.assertArtifact ?? assertPrePhase2bArtifact)(root);
  const target = assertPrePhase2bSessionPoolerTarget(
    (dependencies.authorize ?? authorizeProductionDdlTarget)(environment, {
      operationOptIn: PRE_PHASE2B_OPT_IN,
    }),
  );
  const executeReadOnly = dependencies.executeReadOnly ?? executeReadOnlyBatch;
  const executeApprovedMigration = dependencies.executeMigration
    ?? ((sql, connectionEnvironment) => executeMigration(
      sql, connectionEnvironment, environment, dependencies.spawn ?? spawnSync,
    ));

  const beforeResults = executeReadOnly(
    buildPrePhase2bPreBatch(), target.connectionEnvironment, { processEnvironment: environment },
  );
  const before = classifyPre(beforeResults);
  try {
    executeApprovedMigration(artifact.sql, target.connectionEnvironment);
  } catch (error) {
    let rollback = "UNKNOWN";
    try {
      classifyPre(executeReadOnly(
        buildPrePhase2bPreBatch(), target.connectionEnvironment, { processEnvironment: environment },
      ));
      rollback = "PASS";
    } catch {
      rollback = "BLOCKER";
    }
    throw new Error(`${sanitizeProcessOutput(error.message)} rollback=${rollback}`);
  }

  const after = classifyPost(executeReadOnly(
    buildPrePhase2bPostBatch(), target.connectionEnvironment, { processEnvironment: environment },
  ));
  return {
    format: PRE_PHASE2B_FORMAT,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    installer: "postgres",
    head: actualHead,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    preDdl: { installer: before.installer.managedProfile, contract: before.adoption.classification },
    migration: "PASS",
    transaction: "COMMIT",
    postDdl: { contract: after.adoption.classification, phase2bEntry: "EXACT" },
    mutationAccounting: PRE_PHASE2B_MUTATION_ACCOUNTING,
    nextMigration: "NOT_AUTHORIZED",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionPrePhase2bAdoptionPrerequisite(
    process.env, { argument },
  )).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRE_PHASE2B_ADOPTION_PREREQUISITE_FAIL: ${sanitizeProcessOutput(error.message)}\n`);
      process.exitCode = 1;
    });
}
