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
  SEMANTIC_AUDIT_CALLER_PROBE_APPROVED_HEAD,
  SEMANTIC_AUDIT_CALLER_PROBE_FORMAT,
  SEMANTIC_AUDIT_CALLER_PROBE_OPERATION,
  SEMANTIC_AUDIT_CALLER_PROBE_OPT_IN,
  assertStrictSessionPoolerTarget,
  atSnapshotStage,
  buildSemanticAuditCallerProbeBatch,
  classifyCallerProbe,
  executeSnapshotReadOnlyBatch,
  formatSnapshotGateFailure,
} from "./phase2a-semantic-snapshot-execution-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const expectedPoolerUsername = `${PRODUCTION_PREFLIGHT_ROLE}.nagjddldrldwavmfaytc`;

export function runProductionSemanticAuditCallerProbe(environment = process.env, dependencies = {}) {
  atSnapshotStage("TARGET_GUARD", "OPERATION_NOT_AUTHORIZED", () => {
    if (dependencies.argument !== SEMANTIC_AUDIT_CALLER_PROBE_OPERATION) {
      throw new Error("Semantic audit caller probe requires its exact operation argument.");
    }
    if (environment[PREFLIGHT_OPT_IN] !== "true"
        || environment[SEMANTIC_AUDIT_CALLER_PROBE_OPT_IN] !== "true") {
      throw new Error("Semantic audit caller probe requires both explicit read-only opt-ins.");
    }
    if (Object.hasOwn(environment, "ALLOW_PRODUCTION_DDL")) {
      throw new Error("Semantic audit caller probe rejects Production DDL configuration.");
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
      expectedHead: environment[SEMANTIC_AUDIT_CALLER_PROBE_APPROVED_HEAD],
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
  const results = executeSnapshotReadOnlyBatch(
    dependencies.executeReadOnly ?? executeReadOnlyBatch,
    buildSemanticAuditCallerProbeBatch(),
    target,
    environment,
    "SESSION_ATTESTATION",
  );
  const decision = classifyCallerProbe(results);
  if (decision.classification !== "CALLER_DEFAULT_READ_ONLY_OBSERVED") {
    throw atSnapshotStage("SESSION_ATTESTATION", "CALLER_CONTRACT_MISMATCH", () => {
      throw new Error("Semantic audit caller contract mismatch.");
    });
  }
  return {
    format: SEMANTIC_AUDIT_CALLER_PROBE_FORMAT,
    head: actualHead,
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    caller: PRODUCTION_PREFLIGHT_ROLE,
    transactionReadOnly: true,
    observed: {
      defaultTransactionReadOnly: decision.observedDefaultTransactionReadOnly,
      postgresMajor: 17,
      currentUser: PRODUCTION_PREFLIGHT_ROLE,
      sessionUser: PRODUCTION_PREFLIGHT_ROLE,
      database: "postgres",
    },
    classification: decision.classification,
    nextAllowedOperation: "REVIEW_AND_PIN_DEFAULT_TRANSACTION_READ_ONLY",
  };
}

export async function runProductionSemanticAuditCallerProbeCli(environment = process.env, dependencies = {}) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionSemanticAuditCallerProbe)(
      environment,
      { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const diagnostic = formatSnapshotGateFailure("SEMANTIC_AUDIT_CALLER_PROBE_FAIL", error);
    try {
      (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(diagnostic);
    } catch {
      (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
        "SEMANTIC_AUDIT_CALLER_PROBE_FAIL:\nstage=OUTPUT_SERIALIZATION\nreason=DIAGNOSTIC_WRITE_FAILED\nrollback=BLOCKER\n",
      );
    }
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionSemanticAuditCallerProbeCli();
}
