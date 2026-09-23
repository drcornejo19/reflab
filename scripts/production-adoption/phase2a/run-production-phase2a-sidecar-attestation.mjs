import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "../bootstrap/production-managed-postgres-target.mjs";
import { assertPhase2aSemanticAuditArtifact } from "./phase2a-semantic-audit-ddl-contract.mjs";
import {
  PHASE2A_SIDECAR_ATTESTATION_APPROVED_HEAD,
  PHASE2A_SIDECAR_ATTESTATION_CHECK_COUNT,
  PHASE2A_SIDECAR_ATTESTATION_FORMAT,
  PHASE2A_SIDECAR_ATTESTATION_OPERATION,
  PHASE2A_SIDECAR_ATTESTATION_OPT_IN,
  assertStrictSessionPoolerTarget,
  atSnapshotStage,
  buildPhase2aSidecarAttestationBatch,
  classifyPhase2aSidecarAttestation,
  executeSnapshotReadOnlyBatch,
  formatSnapshotGateFailure,
} from "./phase2a-semantic-snapshot-execution-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const expectedPoolerUsername = "postgres.nagjddldrldwavmfaytc";

export function authorizePhase2aSidecarTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[PHASE2A_SIDECAR_ATTESTATION_OPT_IN] !== "true") {
    throw new Error("Phase 2A sidecar attestation requires all explicit read-only opt-ins.");
  }
  if (Object.hasOwn(environment, "ALLOW_PRODUCTION_DDL")) {
    throw new Error("Phase 2A sidecar attestation rejects Production DDL configuration.");
  }
  const target = resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "Phase 2A privileged sidecar attestation",
  });
  return assertStrictSessionPoolerTarget(target, expectedPoolerUsername);
}

export function runProductionPhase2aSidecarAttestation(environment = process.env, dependencies = {}) {
  atSnapshotStage("TARGET_GUARD", "OPERATION_NOT_AUTHORIZED", () => {
    if (dependencies.argument !== PHASE2A_SIDECAR_ATTESTATION_OPERATION) {
      throw new Error("Phase 2A sidecar attestation requires its exact operation argument.");
    }
    if (environment[PREFLIGHT_OPT_IN] !== "true"
        || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
        || environment[PHASE2A_SIDECAR_ATTESTATION_OPT_IN] !== "true") {
      throw new Error("Phase 2A sidecar attestation requires all explicit read-only opt-ins.");
    }
    if (Object.hasOwn(environment, "ALLOW_PRODUCTION_DDL")) {
      throw new Error("Phase 2A sidecar attestation rejects Production DDL configuration.");
    }
    assertNoInheritedPgState(environment);
  });
  const git = dependencies.git ?? ((args) => execFileSync(
    "git", args, { cwd: root, encoding: "utf8", windowsHide: true },
  ));
  const actualHead = atSnapshotStage(
    "REPOSITORY_GUARD",
    "HEAD_ATTESTATION_FAILED",
    () => git(["rev-parse", "HEAD"]).trim(),
  );
  const status = atSnapshotStage(
    "REPOSITORY_GUARD",
    "WORKTREE_ATTESTATION_FAILED",
    () => git(["status", "--short"]),
  );
  atSnapshotStage("REPOSITORY_GUARD", "REPOSITORY_ATTESTATION_FAILED", () => {
    assertRepositoryAttestation({
      expectedHead: environment[PHASE2A_SIDECAR_ATTESTATION_APPROVED_HEAD],
      actualHead,
      status,
    });
  });
  const artifact = atSnapshotStage(
    "SIDECAR_ATTESTATION",
    "ARTIFACT_HASH_MISMATCH",
    () => (dependencies.assertArtifact ?? assertPhase2aSemanticAuditArtifact)(root),
  );
  const target = atSnapshotStage(
    "TARGET_GUARD",
    "TARGET_ATTESTATION_FAILED",
    () => (dependencies.authorize ?? authorizePhase2aSidecarTarget)(environment),
  );
  if (dependencies.allowLocalTarget !== true) {
    atSnapshotStage("TARGET_GUARD", "SESSION_POOLER_REQUIRED", () => {
      assertStrictSessionPoolerTarget(target, expectedPoolerUsername);
    });
  }
  const results = executeSnapshotReadOnlyBatch(
    dependencies.executeReadOnly ?? executeReadOnlyBatch,
    buildPhase2aSidecarAttestationBatch(),
    target,
    environment,
    "SIDECAR_ATTESTATION",
  );
  const decision = classifyPhase2aSidecarAttestation(results);
  if (decision.classification !== "PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_EXACT") {
    throw atSnapshotStage("SIDECAR_ATTESTATION", "SIDECAR_CONTRACT_MISMATCH", () => {
      throw new Error("Phase 2A sidecar contract mismatch.");
    });
  }
  return {
    format: PHASE2A_SIDECAR_ATTESTATION_FORMAT,
    head: actualHead,
    artifact: { path: artifact.path, sha256: artifact.sha256 },
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    caller: "postgres",
    readOnly: true,
    checkCount: PHASE2A_SIDECAR_ATTESTATION_CHECK_COUNT,
    checks: decision.checks,
    counts: decision.counts,
    classification: decision.classification,
    nextAllowedOperation: "CALLER_CONTRACT_PROBE_REVIEW",
  };
}

export async function runProductionPhase2aSidecarAttestationCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionPhase2aSidecarAttestation)(
      environment,
      { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const diagnostic = formatSnapshotGateFailure("PHASE2A_SIDECAR_ATTESTATION_FAIL", error);
    try {
      (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(diagnostic);
    } catch {
      (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
        "PHASE2A_SIDECAR_ATTESTATION_FAIL:\nstage=OUTPUT_SERIALIZATION\nreason=DIAGNOSTIC_WRITE_FAILED\nrollback=BLOCKER\n",
      );
    }
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionPhase2aSidecarAttestationCli();
}
