import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
  assertNoInheritedPgState,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_EXAM_TRAINING_ARTIFACT,
  PHASE1_EXAM_TRAINING_ENTRY_FORMAT,
  PHASE1_EXAM_TRAINING_QUERY_ID,
  assertPhase1ExamTrainingArtifact,
  classifyPhase1ExamTrainingEntry,
  phase1ExamTrainingEntryQuery,
} from "./phase1-exam-training-entry-attestation-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function hostCategory(host) {
  return host.startsWith("db.") ? "DIRECT" : "SESSION_POOLER";
}

export function runProductionPhase1ExamTrainingEntryAttestation(
  environment = process.env,
  dependencies = {},
) {
  assertNoInheritedPgState(environment);
  const artifact = (dependencies.assertArtifact ?? assertPhase1ExamTrainingArtifact)(root);
  const authorize = dependencies.authorize ?? authorizeProductionPreflightTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const sql = buildSqlBatch([installerIdentityQuery, phase1ExamTrainingEntryQuery]);
  const results = execute(sql, target.connectionEnvironment, { processEnvironment: environment });
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const payload = results.get(PHASE1_EXAM_TRAINING_QUERY_ID);
  const decision = classifyPhase1ExamTrainingEntry(payload, installer);

  return {
    format: PHASE1_EXAM_TRAINING_ENTRY_FORMAT,
    artifact: { filename: PHASE1_EXAM_TRAINING_ARTIFACT, sha256: artifact.sha256 },
    target: {
      projectRef: target.projectRef,
      hostCategory: hostCategory(target.host),
      postgresMajor: Number.isInteger(payload?.server_version_num)
        ? Math.trunc(payload.server_version_num / 10000)
        : null,
      caller: payload?.caller ?? null,
      readOnly: payload?.transaction_read_only === "on",
    },
    checks: decision.checks ?? null,
    classification: decision.classification,
    nextAllowedRemoteOperation: decision.nextAllowedRemoteOperation,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve().then(() => runProductionPhase1ExamTrainingEntryAttestation())
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        `PRODUCTION_PHASE1_EXAM_TRAINING_ENTRY_ATTESTATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`,
      );
      process.exitCode = 1;
    });
}
