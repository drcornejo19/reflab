import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import {
  PREFLIGHT_OPT_IN,
  PRODUCTION_PREFLIGHT_ROLE,
  authorizeProductionPreflightTarget,
} from "../../production-preflight/target.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { assertRepositoryAttestation } from "../bootstrap/production-managed-postgres-target.mjs";
import {
  SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY,
  SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN,
  assertStrictSessionPoolerTarget,
  atSnapshotStage,
  buildSemanticAuditSnapshotInvocationBatch,
  buildSemanticAuditSnapshotSessionBatch,
  classifySemanticAuditSnapshotOutput,
  classifySemanticAuditSnapshotSession,
  executeSnapshotReadOnlyBatch,
  formatSnapshotGateFailure,
} from "./phase2a-semantic-snapshot-execution-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const expectedPoolerUsername = `${PRODUCTION_PREFLIGHT_ROLE}.nagjddldrldwavmfaytc`;

export const SEMANTIC_AUDIT_SNAPSHOT_OPERATION = "--production-semantic-audit-snapshot";
export const SEMANTIC_AUDIT_SNAPSHOT_OPT_IN = "ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT";
export const SEMANTIC_AUDIT_SNAPSHOT_APPROVED_HEAD = "REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD";

export function buildSemanticAuditSnapshotBatch() {
  return buildSemanticAuditSnapshotInvocationBatch();
}

export function buildSemanticAuditSnapshotSessionAttestationBatch() {
  return buildSemanticAuditSnapshotSessionBatch();
}

function sessionMismatchReason(session) {
  if (session?.defaultTransactionReadOnlyExact !== true) {
    return "DEFAULT_TRANSACTION_READ_ONLY_MISMATCH";
  }
  if (session?.transactionReadOnlyExact !== true) return "TRANSACTION_READ_ONLY_MISMATCH";
  if (session?.currentUserExact !== true) return "CURRENT_USER_MISMATCH";
  if (session?.sessionUserExact !== true) return "SESSION_USER_MISMATCH";
  if (session?.databaseExact !== true) return "DATABASE_MISMATCH";
  if (session?.postgresMajorExact !== true) return "POSTGRESQL_MAJOR_MISMATCH";
  return "SESSION_CONTRACT_MISMATCH";
}

export function runProductionSemanticAuditSnapshot(environment = process.env, dependencies = {}) {
  atSnapshotStage("TARGET_GUARD", "OPERATION_NOT_AUTHORIZED", () => {
    if (dependencies.argument !== SEMANTIC_AUDIT_SNAPSHOT_OPERATION) {
      throw new Error("Production semantic audit snapshot requires its exact operation argument.");
    }
    if (environment[PREFLIGHT_OPT_IN] !== "true"
        || environment[SEMANTIC_AUDIT_SNAPSHOT_OPT_IN] !== "true") {
      throw new Error("Production semantic audit snapshot requires both explicit read-only opt-ins.");
    }
    if (environment[SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN] !== "true") {
      throw new Error("Production semantic audit snapshot requires fresh reviewed Gate A evidence.");
    }
    if (Object.hasOwn(environment, "ALLOW_PRODUCTION_DDL")) {
      throw new Error("Production semantic audit snapshot rejects Production DDL configuration.");
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
      expectedHead: environment[SEMANTIC_AUDIT_SNAPSHOT_APPROVED_HEAD],
      actualHead,
      status,
    });
  });
  const target = atSnapshotStage(
    "TARGET_GUARD",
    "TARGET_ATTESTATION_FAILED",
    () => (dependencies.authorize ?? authorizeProductionPreflightTarget)(environment),
  );
  if (dependencies.allowLocalTarget !== true) {
    atSnapshotStage("TARGET_GUARD", "SESSION_POOLER_REQUIRED", () => {
      assertStrictSessionPoolerTarget(target, expectedPoolerUsername);
    });
  }
  const sessionResults = executeSnapshotReadOnlyBatch(
    dependencies.executeReadOnly ?? executeReadOnlyBatch,
    buildSemanticAuditSnapshotSessionAttestationBatch(),
    target,
    environment,
    "SESSION_ATTESTATION",
  );
  const sessionDecision = classifySemanticAuditSnapshotSession(sessionResults);
  if (sessionDecision.classification !== "EXACT") {
    const reason = sessionMismatchReason(sessionDecision.session);
    throw atSnapshotStage("SESSION_ATTESTATION", reason, () => {
      throw new Error("Semantic audit snapshot session contract mismatch.");
    });
  }
  const snapshotResults = executeSnapshotReadOnlyBatch(
    dependencies.executeReadOnly ?? executeReadOnlyBatch,
    buildSemanticAuditSnapshotBatch(),
    target,
    environment,
    "SNAPSHOT_INVOCATION",
  );
  const invocationSessionDecision = classifySemanticAuditSnapshotSession(snapshotResults);
  if (invocationSessionDecision.classification !== "EXACT") {
    const reason = sessionMismatchReason(invocationSessionDecision.session);
    throw atSnapshotStage("SESSION_ATTESTATION", reason, () => {
      throw new Error("Semantic audit snapshot invocation session contract mismatch.");
    });
  }
  const outputDecision = classifySemanticAuditSnapshotOutput(snapshotResults);
  if (outputDecision.classification !== "PASS") {
    throw atSnapshotStage("OUTPUT_CONTRACT", "SNAPSHOT_CONTRACT_MISMATCH", () => {
      throw new Error("Semantic audit snapshot output contract mismatch.");
    });
  }
  return {
    format: "REFLAB_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT_V2",
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    caller: PRODUCTION_PREFLIGHT_ROLE,
    readOnly: true,
    head: actualHead,
    gateAReview: "PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_EXACT",
    callerDefaultTransactionReadOnly: SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY,
    snapshot: outputDecision.snapshot,
    output: { groups: 10, numericMetrics: 37 },
    nextMigration: "NOT_AUTHORIZED",
  };
}

export async function runProductionSemanticAuditSnapshotCli(environment = process.env, dependencies = {}) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionSemanticAuditSnapshot)(
      environment,
      { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const diagnostic = formatSnapshotGateFailure("SEMANTIC_AUDIT_SNAPSHOT_FAIL", error);
    try {
      (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(diagnostic);
    } catch {
      (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
        "SEMANTIC_AUDIT_SNAPSHOT_FAIL:\nstage=OUTPUT_SERIALIZATION\nreason=DIAGNOSTIC_WRITE_FAILED\nrollback=BLOCKER\n",
      );
    }
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionSemanticAuditSnapshotCli();
}
