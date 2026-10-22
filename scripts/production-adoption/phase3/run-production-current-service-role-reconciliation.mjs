import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { CURRENT_SERVICE_MIGRATION_PATH } from "./phase3-current-service-role-contract.mjs";
import { CURRENT_SERVICE_SHA, DDL_RUNNER, TARGET, defaultGit, authorizeCurrentHarness, verifyCurrentHarnessArtifacts,
  resolveCurrentHarnessTarget, buildCurrentHarnessObservation, classifyCurrentHarnessEvidence, failHarness,
  serializeCurrentHarness, safeHarnessFailure } from "./phase3-current-service-role-pre-contract.mjs";
import { DDL_FORMAT, DDL_VARIABLES, DDL_BEGIN, ZERO_ACCOUNTING, extractCurrentServiceDdlBody,
  verifyCurrentServiceAccounting } from "./phase3-current-service-role-ddl-contract.mjs";

const initial = () => ({format: DDL_FORMAT, classification: "BLOCKER", preClassification: null, postClassification: null,
  preFailedChecks: [], preUnknownChecks: [], postFailedChecks: [], postUnknownChecks: [], migrationInvocationCount: 0,
  migrationResult: "NOT_INVOKED", transaction: "NOT_STARTED", commitOutcome: "NOT_COMMITTED", reexecution: "NOT_APPLICABLE",
  automaticRetryAuthorized: false, mutationAccounting: {...ZERO_ACCOUNTING}, productionDdlAuthorized: false});

export async function executeCurrentServiceAtomic(session, bytes, {classify, observe, checkpoint} = {}) {
  const report = initial(); let commitAttempted = false, stage = "BEFORE_PRE";
  const mark = async (name) => {stage = name; if (checkpoint) await checkpoint(name, session);};
  const collect = async () => observe ? observe(session) : parseJsonResults(await session.query(buildCurrentHarnessObservation()));
  try {
    const verified = extractCurrentServiceDdlBody(bytes);
    await session.query(DDL_BEGIN); report.transaction = "OPEN";
    await mark("BEFORE_PRE");
    const before = await collect(), pre = classifyCurrentHarnessEvidence(before, false, classify);
    Object.assign(report, {preClassification: pre.classification, preFailedChecks: pre.failedChecks, preUnknownChecks: pre.unknownChecks});
    if (pre.classification === "ALREADY_INSTALLED_POST" && !pre.executablePre && !pre.failedChecks.length && !pre.unknownChecks.length) {
      await session.rollback(); report.transaction = "ROLLBACK"; report.reexecution = "REFUSED";
      report.classification = "ALREADY_INSTALLED_POST"; return report;
    }
    if (pre.classification !== "PRE_EXECUTABLE_EXACT" || !pre.executablePre || pre.failedChecks.length || pre.unknownChecks.length) failHarness("LIVE_PRE_MISMATCH");
    await mark("AFTER_PRE");
    stage = "MIGRATION"; report.migrationInvocationCount = 1;
    await session.query(verified.body); report.migrationResult = "PASS";
    await mark("BEFORE_POST");
    const after = await collect(), post = classifyCurrentHarnessEvidence(after, false, classify);
    Object.assign(report, {postClassification: post.classification, postFailedChecks: post.failedChecks, postUnknownChecks: post.unknownChecks});
    if (post.classification !== "ALREADY_INSTALLED_POST" || post.executablePre || post.failedChecks.length || post.unknownChecks.length) failHarness("LIVE_POST_MISMATCH");
    const accounting = verifyCurrentServiceAccounting(before, after);
    await mark("BEFORE_COMMIT");
    stage = "COMMIT"; commitAttempted = true;
    await session.query("commit;");
    Object.assign(report, {classification: "COMMITTED_POST_EXACT", transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
      mutationAccounting: accounting, migrationBodySha256: verified.bodySha256});
  } catch (error) {
    Object.assign(report, {stage, reason: safeHarnessFailure(error)});
    if (commitAttempted) {
      Object.assign(report, {classification: "UNKNOWN_COMMIT_OUTCOME", transaction: "UNKNOWN", commitOutcome: "UNKNOWN",
        onlyAllowedNextAction: "SEPARATE_READ_ONLY_POST_FORENSIC", readOnlyForensicRequired: true,
        mutationAccounting: {...ZERO_ACCOUNTING, effectivePrivilegeEntryRevocations: "UNKNOWN", effectivePrivilegeEntryGrants: "UNKNOWN"}});
      // Never claim rollback, retry, or replay after an unacknowledged COMMIT.
    } else {
      try {await session.rollback(); report.transaction = "ROLLBACK";}
      catch {report.transaction = "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED";}
    }
  } finally {try {await session.close();} catch {report.connectionCloseUnconfirmed = true;}}
  return report;
}

export async function runProductionCurrentServiceReconciliation(environment = process.env, dependencies = {}) {
  const git = dependencies.git ?? defaultGit;
  const head = authorizeCurrentHarness(environment, dependencies.argument, DDL_VARIABLES, DDL_VARIABLES.slice(0, 2), DDL_VARIABLES[3], git);
  if (environment[DDL_VARIABLES[5]] !== CURRENT_SERVICE_SHA) failHarness("APPROVED_MIGRATION_SHA_MISMATCH");
  const integrity = verifyCurrentHarnessArtifacts(git, head, DDL_RUNNER,
    (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)), dependencies.readCheckout);
  const bytes = git(["show", `${head}:${CURRENT_SERVICE_MIGRATION_PATH}`]);
  extractCurrentServiceDdlBody(bytes);
  const target = resolveCurrentHarnessTarget(environment, DDL_VARIABLES[2], DDL_VARIABLES[4]);
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(target.connectionEnvironment, environment);
  return {...await executeCurrentServiceAtomic(session, bytes), approvedHead: head, target: TARGET, ...integrity,
    artifact: {path: CURRENT_SERVICE_MIGRATION_PATH, sha256: CURRENT_SERVICE_SHA},
    scopeBoundary: {target: "72_REVOKE_2_GRANT", futureTarget: "70_REVOKE_3_GRANT_NOT_IMPLEMENTED",
      genericMigrationPushAuthorized: false, CURRENT_RUNTIME_USABILITY_NOT_ESTABLISHED: "YES",
      GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE", TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES",
      "64253_INDEPENDENT_REVIEW_REQUIRED": "YES", runtime: "NOT_AUTHORIZED", cutover: "NOT_AUTHORIZED", phase4: "NOT_AUTHORIZED"}};
}

export async function runCurrentServiceDdlCli(environment = process.env, dependencies = {}) {
  let report, code = 1;
  try {
    report = await (dependencies.run ?? runProductionCurrentServiceReconciliation)(environment, {...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined)});
    if (report.format !== DDL_FORMAT || !["COMMITTED_POST_EXACT", "ALREADY_INSTALLED_POST", "BLOCKER", "UNKNOWN_COMMIT_OUTCOME"].includes(report.classification)
      || report.automaticRetryAuthorized !== false || report.productionDdlAuthorized !== false
      || report.classification === "COMMITTED_POST_EXACT" && (report.transaction !== "COMMIT" || report.commitOutcome !== "ACKNOWLEDGED"
        || report.migrationInvocationCount !== 1 || report.migrationResult !== "PASS")) failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (report.classification === "COMMITTED_POST_EXACT" && report.commitOutcome === "ACKNOWLEDGED") code = 0;
  } catch (error) {report = {...initial(), reason: safeHarnessFailure(error)};}
  let output;
  try {output = serializeCurrentHarness(report, environment, true);} catch {
    code = 1;
    try {output = serializeCurrentHarness({format: DDL_FORMAT, classification: "BLOCKER", reason: "OUTPUT_REDACTION_FAILED",
      automaticRetryAuthorized: false, readOnlyForensicRequired: true}, environment, true);} catch {output = "";}
  }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runCurrentServiceDdlCli();
