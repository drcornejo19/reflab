import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import {
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  assertNoInheritedPgState,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_FORMAT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID,
  assertPhase1PsychologyNotificationsArtifact,
  classifyExamTrainingPreState,
  classifyPhase1PsychologyNotificationsEntry,
  phase1PsychologyNotificationsEntryQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

function hostCategory(host) {
  return host.startsWith("db.") ? "DIRECT" : "SESSION_POOLER";
}

export function runProductionPhase1PsychologyNotificationsEntryAttestation(
  environment = process.env,
  dependencies = {},
) {
  assertNoInheritedPgState(environment);
  const artifact = (dependencies.assertArtifact ?? assertPhase1PsychologyNotificationsArtifact)(root);
  const authorize = dependencies.authorize ?? authorizeProductionPreflightTarget;
  const execute = dependencies.execute ?? executeReadOnlyBatch;
  const target = authorize(environment);
  const queries = [
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsEntryQuery,
  ];
  const results = execute(
    buildSqlBatch(queries),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const installer = classifyInstallerIdentity(results.get(installerIdentityQuery.id));
  const fingerprint = results.get(phase1ProductFingerprintQuery.id);
  const payload = results.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID);
  const examTrainingState = classifyExamTrainingPreState(
    results.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID),
    fingerprint,
    payload?.checks?.priorStateVisibilityExact,
  );
  const decision = classifyPhase1PsychologyNotificationsEntry(payload, installer, examTrainingState);

  return {
    format: PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_FORMAT,
    artifact: { filename: PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT, sha256: artifact.sha256 },
    target: {
      projectRef: target.projectRef,
      hostCategory: hostCategory(target.host),
      postgresMajor: Number.isInteger(payload?.server_version_num)
        ? Math.trunc(payload.server_version_num / 10000)
        : null,
      caller: payload?.caller ?? null,
      readOnly: payload?.transaction_read_only === "on",
    },
    preState: { examTrainingPrerequisites: examTrainingState },
    checks: decision.checks ?? null,
    evidence: payload?.evidence ?? null,
    classification: decision.classification,
    nextAllowedRemoteOperation: decision.nextAllowedRemoteOperation,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  Promise.resolve().then(() => runProductionPhase1PsychologyNotificationsEntryAttestation())
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(
        `PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_ATTESTATION_FAIL: ${sanitizeProcessOutput(error.message)}\n`,
      );
      process.exitCode = 1;
    });
}
