import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { ADDITIONAL_MIGRATION_PATH } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { PRE_EXACT, POST_EXACT, prepareAdditionalHarness, additionalObservationSql, classifyAdditionalHarnessEvidence,
  serializeAdditionalHarness, safeHarnessFailure, failHarness } from "./phase3-additional-runtime-pre-contract.mjs";
import { DDL_FORMAT, DDL_BEGIN, ZERO_ACCOUNTING, extractAdditionalDdlBody, verifyAdditionalAccounting } from "./phase3-additional-runtime-ddl-contract.mjs";

const initial = () => ({ format: DDL_FORMAT, classification: "BLOCKER", preClassification: null, postClassification: null,
  preFailedChecks: [], preUnknownChecks: [], postFailedChecks: [], postUnknownChecks: [], migrationInvocationCount: 0,
  migrationResult: "NOT_INVOKED", transaction: "NOT_STARTED", commitOutcome: "NOT_COMMITTED", reexecution: "NOT_APPLICABLE",
  automaticRetryAuthorized: false, mutationAccounting: { ...ZERO_ACCOUNTING }, productionDdlAuthorized: false });
export async function executeAdditionalAtomic(session, bytes, { classify, observe, checkpoint } = {}) {
  const report = initial(); let commitAttempted = false, stage = "BEFORE_PRE";
  const mark = async (name) => { stage = name; if (checkpoint) await checkpoint(name, session); };
  const collect = async () => observe ? observe(session) : parseJsonResults(await session.query(additionalObservationSql()));
  try {
    const verified = extractAdditionalDdlBody(bytes);
    await session.query(DDL_BEGIN); report.transaction = "OPEN";
    await mark("BEFORE_PRE");
    const before = await collect(), pre = classifyAdditionalHarnessEvidence(before, false, classify);
    Object.assign(report, { preClassification: pre.classification, preFailedChecks: pre.failedChecks, preUnknownChecks: pre.unknownChecks });
    if (pre.classification === POST_EXACT && !pre.executablePre && !pre.failedChecks.length && !pre.unknownChecks.length) {
      await session.rollback(); report.transaction = "ROLLBACK"; report.reexecution = "REFUSED"; report.classification = POST_EXACT; return report;
    }
    if (pre.classification !== PRE_EXACT || !pre.executablePre || pre.failedChecks.length || pre.unknownChecks.length) failHarness("LIVE_PRE_MISMATCH");
    await mark("AFTER_PRE");
    stage = "MIGRATION"; report.migrationInvocationCount = 1;
    await session.query(verified.body); report.migrationResult = "PASS";
    await mark("BEFORE_POST");
    const after = await collect(), post = classifyAdditionalHarnessEvidence(after, false, classify);
    Object.assign(report, { postClassification: post.classification, postFailedChecks: post.failedChecks, postUnknownChecks: post.unknownChecks });
    if (post.classification !== POST_EXACT || post.executablePre || post.failedChecks.length || post.unknownChecks.length) failHarness("LIVE_POST_MISMATCH");
    const accounting = verifyAdditionalAccounting(before, after);
    await mark("BEFORE_COMMIT");
    stage = "COMMIT"; commitAttempted = true;
    await session.query("commit;");
    Object.assign(report, { classification: "COMMITTED_POST_EXACT", transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
      mutationAccounting: accounting, migrationBodySha256: verified.bodySha256 });
  } catch (error) {
    Object.assign(report, { stage, reason: safeHarnessFailure(error) });
    if (commitAttempted) {
      Object.assign(report, { classification: "UNKNOWN_COMMIT_OUTCOME", transaction: "UNKNOWN", commitOutcome: "UNKNOWN",
        onlyAllowedNextAction: "SEPARATELY_AUTHORIZED_READ_ONLY_POST_FORENSIC", readOnlyForensicRequired: true,
        mutationAccounting: { ...ZERO_ACCOUNTING, effectivePrivilegeEntryRevocations: "UNKNOWN", effectivePrivilegeEntryGrants: "UNKNOWN" } });
      // No rollback claim or automatic replay after COMMIT may have reached the server.
    } else {
      try { await session.rollback(); report.transaction = "ROLLBACK"; }
      catch { report.transaction = "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED"; }
    }
  } finally { try { await session.close(); } catch { report.connectionCloseUnconfirmed = true; } }
  return report;
}
export async function runProductionAdditionalReconciliation(environment = process.env, dependencies = {}) {
  const prepared = prepareAdditionalHarness(environment, dependencies, true,
    () => (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  const bytes = prepared.git(["show", `${prepared.metadata.approvedHead}:${ADDITIONAL_MIGRATION_PATH}`]);
  extractAdditionalDdlBody(bytes);
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await executeAdditionalAtomic(session, bytes), ...prepared.metadata };
}
export async function runAdditionalDdlCli(environment = process.env, dependencies = {}) {
  let result, code = 1;
  try {
    result = await (dependencies.run ?? runProductionAdditionalReconciliation)(environment, { ...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    if (result.format !== DDL_FORMAT || !["COMMITTED_POST_EXACT", POST_EXACT, "BLOCKER", "UNKNOWN_COMMIT_OUTCOME"].includes(result.classification)
      || result.automaticRetryAuthorized !== false || result.productionDdlAuthorized !== false
      || result.classification === "COMMITTED_POST_EXACT" && (result.transaction !== "COMMIT" || result.commitOutcome !== "ACKNOWLEDGED"
        || result.migrationInvocationCount !== 1 || result.migrationResult !== "PASS")) failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (result.classification === "COMMITTED_POST_EXACT") {
      if (result.preClassification !== PRE_EXACT || result.postClassification !== POST_EXACT
        || [result.preFailedChecks, result.preUnknownChecks, result.postFailedChecks, result.postUnknownChecks].some((checks) => checks?.length !== 0)
        || result.mutationAccounting?.effectivePrivilegeEntryRevocations !== 332 || result.mutationAccounting?.effectivePrivilegeEntryGrants !== 0
        || result.mutationAccounting?.unchangedCells !== 124 || result.mutationAccounting?.sqlRevokeStatements !== 57
        || result.mutationAccounting?.sqlGrantStatements !== 0
        || Object.keys(ZERO_ACCOUNTING).filter((key) => !["effectivePrivilegeEntryRevocations", "sqlRevokeStatements"].includes(key))
          .some((key) => result.mutationAccounting[key] !== 0)) failHarness("OUTPUT_CONTRACT_MISMATCH");
      code = 0;
    }
  } catch (error) { result = { ...initial(), reason: safeHarnessFailure(error) }; }
  let output;
  try { output = serializeAdditionalHarness(result, environment, true); }
  catch { code = 1; try { output = serializeAdditionalHarness({ format: DDL_FORMAT, classification: "BLOCKER",
    reason: "OUTPUT_REDACTION_FAILED", automaticRetryAuthorized: false }, environment, true); } catch { output = ""; } }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runAdditionalDdlCli();
