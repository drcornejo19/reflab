import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  assertRepositoryAttestation,
  resolveProductionManagedPostgresTarget,
} from "../bootstrap/production-managed-postgres-target.mjs";
import {
  INSTALLER_IDENTITY_QUERY_ID,
  assertNoInheritedPgState,
  classifyInstallerIdentity,
} from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  PRE_PHASE2B_PRE_QUERY_ID,
  PRE_PHASE2B_REQUIRED_CHECKS,
  assertPrePhase2bArtifact,
  classifyPrePhase2bPre,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  assertPrePhase2bSessionPoolerTarget,
  buildPrePhase2bPreBatch,
} from "./run-production-pre-phase2b-adoption-prerequisite.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");

export const PRE_PHASE2B_DIAGNOSTIC_FORMAT = "REFLAB_PRE_PHASE2B_READ_ONLY_DIAGNOSTIC_V1";
export const PRE_PHASE2B_DIAGNOSTIC_OPERATION = "--production-pre-phase2b-read-only-diagnostic";
export const PRE_PHASE2B_DIAGNOSTIC_OPT_IN = "ALLOW_PRODUCTION_PRE_PHASE2B_DIAGNOSTIC";

const rejectedDdlVariables = Object.freeze([
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PRE_PHASE2B_ADOPTION_PREREQUISITE",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  "REFLAB_PRODUCTION_DDL_DB_URL",
]);

export const PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY = Object.freeze([
  "installerManagedProfileExact",
  "installerLifecycleExact",
  "callerExact",
  "sessionUserExact",
  "transactionReadOnlyExact",
  "postgresMajorExact",
  ...PRE_PHASE2B_REQUIRED_CHECKS,
  "attemptsCountExact",
  "examResultsCountExact",
  "notificationEventsCountExact",
  "clipsCountExact",
  "scoreNonNullCountExact",
  "scoreNullCountExact",
  "trainingDuplicateGroupsExact",
]);

const expectedCounts = Object.freeze({
  attempts: 37,
  exam_results: 6,
  notification_events: 60,
  clips: 30,
  score_non_null: 36,
  score_null: 1,
  training_duplicate_groups: 0,
});

function observedBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function exactInteger(value, expected) {
  return Number.isInteger(value) ? value === expected : null;
}

export function authorizeProductionPrePhase2bDiagnosticTarget(environment = process.env) {
  if (environment[PREFLIGHT_OPT_IN] !== "true"
      || environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN] !== "true"
      || environment[PRE_PHASE2B_DIAGNOSTIC_OPT_IN] !== "true") {
    throw new Error("PRE_PHASE2B_DIAGNOSTIC_NOT_AUTHORIZED");
  }
  if (rejectedDdlVariables.some((name) => Object.hasOwn(environment, name))) {
    throw new Error("PRE_PHASE2B_DIAGNOSTIC_REJECTS_DDL_CONFIGURATION");
  }
  return assertPrePhase2bSessionPoolerTarget(resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
    databaseUrlVariable: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
    operationLabel: "Pre-Phase2B privileged read-only diagnostic",
  }));
}

export function classifyPrePhase2bDiagnostic(results) {
  const installerPayload = results instanceof Map
    ? results.get(INSTALLER_IDENTITY_QUERY_ID)
    : undefined;
  const payload = results instanceof Map ? results.get(PRE_PHASE2B_PRE_QUERY_ID) : undefined;
  const installer = classifyInstallerIdentity(installerPayload);
  const contract = classifyPrePhase2bPre(payload, installer);
  const checks = {
    installerManagedProfileExact: installer.managedProfile === "READY",
    installerLifecycleExact: installer.lifecycleState === "POST_PHASE2A_SEMANTIC_AUDIT",
    callerExact: typeof payload?.caller === "string" ? payload.caller === "postgres" : null,
    sessionUserExact: typeof payload?.session_user === "string"
      ? payload.session_user === "postgres" : null,
    transactionReadOnlyExact: typeof payload?.transaction_read_only === "string"
      ? payload.transaction_read_only === "on" : null,
    postgresMajorExact: Number.isInteger(payload?.server_version_num)
      ? Math.trunc(payload.server_version_num / 10000) === 17 : null,
    ...Object.fromEntries(PRE_PHASE2B_REQUIRED_CHECKS.map((name) => [
      name, observedBoolean(payload?.checks?.[name]),
    ])),
    attemptsCountExact: exactInteger(payload?.counts?.attempts, expectedCounts.attempts),
    examResultsCountExact: exactInteger(payload?.counts?.exam_results, expectedCounts.exam_results),
    notificationEventsCountExact: exactInteger(
      payload?.counts?.notification_events, expectedCounts.notification_events,
    ),
    clipsCountExact: exactInteger(payload?.counts?.clips, expectedCounts.clips),
    scoreNonNullCountExact: exactInteger(
      payload?.counts?.score_non_null, expectedCounts.score_non_null,
    ),
    scoreNullCountExact: exactInteger(payload?.counts?.score_null, expectedCounts.score_null),
    trainingDuplicateGroupsExact: exactInteger(
      payload?.counts?.training_duplicate_groups, expectedCounts.training_duplicate_groups,
    ),
  };
  const failedChecks = PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY.filter(
    (name) => checks[name] === false,
  );
  const unknownChecks = PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY.filter(
    (name) => checks[name] === null,
  );
  const classification = contract.classification === "PASS" && failedChecks.length === 0
      && unknownChecks.length === 0
    ? "EXACT"
    : contract.classification === "BLOCKER" ? "BLOCKER" : "UNKNOWN";

  return {
    classification,
    checkCount: PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY.length,
    checks,
    failedChecks,
    unknownChecks,
    expected: {
      installerManagedProfile: "READY",
      installerLifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT",
      caller: "postgres",
      sessionUser: "postgres",
      transactionReadOnly: "on",
      postgresMajor: 17,
      counts: expectedCounts,
    },
    observed: {
      installerManagedProfile: installer.managedProfile ?? null,
      installerLifecycleState: installer.lifecycleState ?? null,
      caller: payload?.caller ?? null,
      sessionUser: payload?.session_user ?? null,
      transactionReadOnly: payload?.transaction_read_only ?? null,
      postgresMajor: Number.isInteger(payload?.server_version_num)
        ? Math.trunc(payload.server_version_num / 10000) : null,
      counts: Object.fromEntries(Object.keys(expectedCounts).map((name) => [
        name, Number.isInteger(payload?.counts?.[name]) ? payload.counts[name] : null,
      ])),
    },
  };
}

export function runProductionPrePhase2bReadOnlyDiagnostic(
  environment = process.env,
  dependencies = {},
) {
  if (dependencies.argument !== PRE_PHASE2B_DIAGNOSTIC_OPERATION) {
    throw new Error("EXACT_DIAGNOSTIC_ARGUMENT_REQUIRED");
  }
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", windowsHide: true,
  }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({
    expectedHead: environment[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD],
    actualHead,
    status,
  });
  (dependencies.assertArtifact ?? assertPrePhase2bArtifact)(root);
  const target = (dependencies.authorize
    ?? authorizeProductionPrePhase2bDiagnosticTarget)(environment);
  assertPrePhase2bSessionPoolerTarget(target);
  const results = (dependencies.executeReadOnly ?? executeReadOnlyBatch)(
    buildPrePhase2bPreBatch(),
    target.connectionEnvironment,
    { processEnvironment: environment },
  );
  const decision = classifyPrePhase2bDiagnostic(results);

  return { format: PRE_PHASE2B_DIAGNOSTIC_FORMAT, ...decision };
}

export async function runProductionPrePhase2bReadOnlyDiagnosticCli(
  environment = process.env,
  dependencies = {},
) {
  try {
    const argument = dependencies.argument
      ?? (process.argv.length === 3 ? process.argv[2] : undefined);
    const result = await (dependencies.run ?? runProductionPrePhase2bReadOnlyDiagnostic)(
      environment,
      { ...dependencies, argument },
    );
    (dependencies.writeStdout ?? process.stdout.write.bind(process.stdout))(
      `${JSON.stringify(result, null, 2)}\n`,
    );
    return 0;
  } catch {
    (dependencies.writeStderr ?? process.stderr.write.bind(process.stderr))(
      "PRE_PHASE2B_READ_ONLY_DIAGNOSTIC_FAIL\nreason=READ_ONLY_DIAGNOSTIC_ABORTED\n",
    );
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runProductionPrePhase2bReadOnlyDiagnosticCli();
}
