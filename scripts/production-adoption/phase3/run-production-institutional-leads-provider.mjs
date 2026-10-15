import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { classifyLead, observationSql } from "./phase3-institutional-leads-insert-contract.mjs";
import { FORMAT, PRE, POST, ZERO_ACCOUNTING, EXPECTED_ACCOUNTING, BOUNDARY, prepare, extractProvider, verifyAccounting,
  failHarness, safeHarnessFailure, serialize } from "./phase3-institutional-leads-runner-contract.mjs";

const initial = () => ({ format: FORMAT, classification: "BLOCKER", failureCategory: null, preClassification: null, postClassification: null,
  preFailedChecks: [], preUnknownChecks: [], postFailedChecks: [], postUnknownChecks: [], providerInvocationCount: 0,
  providerResult: "NOT_INVOKED", transaction: "NOT_STARTED", commitOutcome: "NOT_COMMITTED", reexecution: "NOT_APPLICABLE",
  automaticRetryAuthorized: false, approval: "NOT_PERFORMED", mutationAccounting: { ...ZERO_ACCOUNTING }, scopeBoundary: BOUNDARY });

// Local rehearsals may inject a synthetic classifier. The Production entrypoint never forwards those hooks.
export async function executeLeadAtomic(session, bytes, { classify = classifyLead, observe, checkpoint } = {}) {
  const report = initial(); let commitAttempted = false, began = false, stage = "PRE_DDL_ATTESTATION";
  const mark = async (name) => { if (checkpoint) await checkpoint(name, session); };
  const collect = async () => observe ? observe(session) : parseJsonResults(await session.query(observationSql()));
  try {
    const verified = extractProvider(bytes);
    began = true; await session.query(verified.begin); report.transaction = "OPEN";
    await mark("BEFORE_PRE");
    const before = await collect(), pre = classify(before, { readOnly: false });
    Object.assign(report, { preClassification: pre.classification, preFailedChecks: pre.failedChecks, preUnknownChecks: pre.unknownChecks });
    if (pre.classification === POST && !pre.executablePre && pre.failedChecks.length === 0 && pre.unknownChecks.length === 0) {
      report.classification = "ALREADY_INSTALLED_REVIEW_REQUIRED"; report.reexecution = "REFUSED";
      failHarness("REEXECUTION_REFUSED");
    }
    if (pre.classification !== PRE || !pre.executablePre || pre.failedChecks.length || pre.unknownChecks.length) failHarness("LIVE_PRE_MISMATCH");
    await mark("AFTER_PRE");
    stage = "MUTATION"; report.providerInvocationCount = 1;
    await session.query(verified.body); report.providerResult = "PASS";
    stage = "POST_DDL_ATTESTATION"; await mark("AFTER_GRANT");
    const after = await collect(), post = classify(after, { readOnly: false });
    Object.assign(report, { postClassification: post.classification, postFailedChecks: post.failedChecks, postUnknownChecks: post.unknownChecks });
    if (post.classification !== POST || post.executablePre || post.failedChecks.length || post.unknownChecks.length) failHarness("LIVE_POST_MISMATCH");
    const accounting = verifyAccounting(before, after);
    await mark("BEFORE_COMMIT");
    stage = "COMMIT"; commitAttempted = true;
    await session.query("commit;");
    Object.assign(report, { classification: "COMMITTED_POST_EXACT", transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
      mutationAccounting: accounting, providerBodySha256: verified.bodySha256 });
  } catch (error) {
    Object.assign(report, { failureCategory: stage, reason: safeHarnessFailure(error) });
    if (stage === "MUTATION") report.providerResult = "FAIL";
    if (report.providerInvocationCount) Object.assign(report, { readOnlyForensicRequired: true,
      onlyAllowedNextAction: "SEPARATELY_AUTHORIZED_READ_ONLY_POST_FORENSIC" });
    if (commitAttempted) {
      Object.assign(report, { classification: "UNKNOWN_COMMIT_OUTCOME", transaction: "UNKNOWN", commitOutcome: "AMBIGUOUS",
        mutationAccounting: { ...ZERO_ACCOUNTING, tableGrantChanges: "UNKNOWN", sqlGrantStatements: 1 } });
    } else if (began) {
      try { await session.rollback(); report.transaction = "ROLLBACK"; }
      catch {
        report.transaction = "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED";
        if (report.providerInvocationCount) report.mutationAccounting = { ...ZERO_ACCOUNTING, tableGrantChanges: "UNKNOWN", sqlGrantStatements: 1 };
      }
    }
  } finally { try { await session.close(); } catch { report.connectionCloseUnconfirmed = true; } }
  return report;
}
export async function runProductionLeadProvider(environment = process.env, dependencies = {}) {
  const prepared = prepare(environment, dependencies,
    () => (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await executeLeadAtomic(session, prepared.bytes), ...prepared.metadata };
}
export async function runLeadProviderCli(environment = process.env, dependencies = {}) {
  let result, code = 1;
  try {
    result = await (dependencies.run ?? runProductionLeadProvider)(environment, { ...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    if (result.format !== FORMAT || !["COMMITTED_POST_EXACT", "ALREADY_INSTALLED_REVIEW_REQUIRED", "BLOCKER", "UNKNOWN_COMMIT_OUTCOME"].includes(result.classification)
      || result.automaticRetryAuthorized !== false || result.approval !== "NOT_PERFORMED"
      || JSON.stringify(result.scopeBoundary) !== JSON.stringify(BOUNDARY)) failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (result.classification === "COMMITTED_POST_EXACT") {
      if (result.transaction !== "COMMIT" || result.commitOutcome !== "ACKNOWLEDGED" || result.providerInvocationCount !== 1
        || result.providerResult !== "PASS" || result.preClassification !== PRE || result.postClassification !== POST
        || [result.preFailedChecks, result.preUnknownChecks, result.postFailedChecks, result.postUnknownChecks].some((v) => !Array.isArray(v) || v.length)
        || JSON.stringify(result.mutationAccounting) !== JSON.stringify(EXPECTED_ACCOUNTING)) failHarness("OUTPUT_CONTRACT_MISMATCH");
      code = 0;
    }
  } catch (error) { result = { ...initial(), failureCategory: "AUTHORIZATION_TARGET_OR_CONNECTION", reason: safeHarnessFailure(error) }; }
  let output;
  try { output = serialize(result, environment); }
  catch { code = 1; try { output = serialize({ ...initial(), reason: "OUTPUT_REDACTION_FAILED" }, environment); } catch { output = ""; } }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runLeadProviderCli();
