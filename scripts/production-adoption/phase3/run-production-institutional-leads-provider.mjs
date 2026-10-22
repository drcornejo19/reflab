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

const safetyKey = Symbol("executionSafety");
/** @typedef {"connection"|"begin"|"mutation"|"postExact"|"postFailed"|"commitAttempt"|"commitAck"|"commitAmbiguous"|"rollback"|"rollbackUnconfirmed"|"forensic"|"unknown"} SafetyFact */
// Append-only facts live independently of the rich report and contain no external strings.
export class LeadExecutionSafety {
  /** @type {Set<SafetyFact>} */ #facts = new Set();
  #count = 0;
  /** @param {SafetyFact} fact */
  mark(fact) { this.#facts.add(fact); }
  capture(report) {
    try {
      const own = (key) => Object.getOwnPropertyDescriptor(report, key)?.value;
      const count = own("providerInvocationCount"), transaction = own("transaction"), commit = own("commitOutcome");
      if (Number.isSafeInteger(count) && count >= 0) this.#count = Math.max(this.#count, count);
      else this.mark("unknown");
      if (this.#count > 0) this.mark("mutation");
      if (transaction === "OPEN") this.mark("begin");
      else if (transaction === "ROLLBACK") this.mark("rollback");
      else if (transaction === "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED") this.mark("rollbackUnconfirmed");
      else if (transaction === "COMMIT") this.mark("commitAttempt");
      else if (transaction !== "NOT_STARTED") this.mark("unknown");
      if (commit === "ACKNOWLEDGED") this.mark("commitAck");
      else if (commit === "AMBIGUOUS") this.mark("commitAmbiguous");
      else if (commit !== "NOT_COMMITTED") this.mark("unknown");
      if (own("failureCategory") !== "POST_DDL_ATTESTATION" && own("postClassification") === POST && Array.isArray(own("postFailedChecks")) && own("postFailedChecks").length === 0
        && Array.isArray(own("postUnknownChecks")) && own("postUnknownChecks").length === 0) this.mark("postExact");
      if (own("failureCategory") === "POST_DDL_ATTESTATION") this.mark("postFailed");
      if (own("readOnlyForensicRequired") === true || own("forensicReviewRequired") === true) this.mark("forensic");
    } catch { this.mark("unknown"); }
  }
  snapshot() {
    const has = (fact) => this.#facts.has(fact), ack = has("commitAck"), ambiguous = has("commitAmbiguous");
    const mutation = has("mutation") || has("commitAttempt") || ack || ambiguous;
    const started = this.#facts.size > 0, uncertain = has("unknown");
    const rollback = has("rollback"), rollbackUnconfirmed = has("rollbackUnconfirmed");
    const commit = ack && !ambiguous ? "ACKNOWLEDGED" : ambiguous && !ack ? "AMBIGUOUS"
      : ack || ambiguous || has("commitAttempt") || rollbackUnconfirmed || uncertain ? "UNKNOWN"
      : rollback || !mutation ? "NOT_COMMITTED" : "UNKNOWN";
    const forensic = has("forensic") || uncertain || ambiguous || commit === "UNKNOWN";
    return Object.freeze({ format: "REFLAB_INSTITUTIONAL_LEADS_EXECUTION_SAFETY_V1", classification: "OUTPUT_FAILURE",
      executionStarted: started, mutationAttempted: mutation ? true : uncertain ? null : false,
      providerInvocationCount: Math.max(this.#count, mutation ? 1 : 0) || (uncertain ? null : 0),
      transaction: commit === "ACKNOWLEDGED" ? "COMMIT" : has("commitAttempt") || ambiguous ? "UNKNOWN"
        : rollbackUnconfirmed ? "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED" : rollback ? "ROLLBACK"
          : started ? "STARTED_STATE_OUTPUT_FAILURE" : "NOT_STARTED",
      commitOutcome: commit, commitAcknowledged: ack,
      rollbackOutcome: rollbackUnconfirmed ? "UNCONFIRMED" : rollback ? "CONFIRMED" : "NOT_CONFIRMED",
      postAttestationOutcome: has("postExact") ? "EXACT" : has("postFailed") ? "FAILED" : mutation || uncertain ? "UNKNOWN" : "NOT_STARTED",
      forensicReviewRequired: forensic, readOnlyForensicRequired: forensic, automaticRetryAuthorized: false,
      forensicExecutionAuthorized: false, providerExecutionAuthorized: false, approval: "NOT_PERFORMED" });
  }
}

// Numeric V1 is a documented alternative representation, not encoded rich/secret data.
function numericSafety(s) {
  return [1, Number(s.executionStarted), s.mutationAttempted === null ? null : Number(s.mutationAttempted), s.providerInvocationCount,
    ["NOT_STARTED", "STARTED_STATE_OUTPUT_FAILURE", "ROLLBACK", "COMMIT", "UNKNOWN", "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED"].indexOf(s.transaction),
    ["NOT_COMMITTED", "ACKNOWLEDGED", "AMBIGUOUS", "UNKNOWN"].indexOf(s.commitOutcome),
    ["NOT_CONFIRMED", "CONFIRMED", "UNCONFIRMED"].indexOf(s.rollbackOutcome),
    ["NOT_STARTED", "EXACT", "FAILED", "UNKNOWN"].indexOf(s.postAttestationOutcome),
    Number(s.forensicReviewRequired), 0, 0, 0, Number(s.commitAcknowledged)];
}
function emergencyOutput(safety, environment) {
  const envelope = safety.snapshot();
  try { return serialize(envelope, environment); }
  catch {
    try { return serialize(numericSafety(envelope), environment); }
    catch { return ""; } // No safe output is preferable to leaked secrets or invented transaction evidence.
  }
}
function writeOutput(text) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("OUTPUT_WRITE_FAILED"));
    process.stdout.once("error", fail);
    try {
      process.stdout.write(text, (error) => {
        if (error) fail();
        else { process.stdout.removeListener("error", fail); resolve(); }
      });
    } catch { process.stdout.removeListener("error", fail); fail(); }
  });
}

// Local rehearsals may inject a synthetic classifier. The Production entrypoint never forwards those hooks.
export async function executeLeadAtomic(session, bytes, { classify = classifyLead, observe, checkpoint, safety = new LeadExecutionSafety() } = {}) {
  const report = initial(); let commitAttempted = false, began = false, stage = "PRE_DDL_ATTESTATION";
  const mark = async (name) => { if (checkpoint) await checkpoint(name, session); };
  const collect = async () => observe ? observe(session) : parseJsonResults(await session.query(observationSql()));
  try {
    const verified = extractProvider(bytes);
    safety.mark("begin"); began = true; await session.query(verified.begin); report.transaction = "OPEN";
    await mark("BEFORE_PRE");
    const before = await collect(), pre = classify(before, { readOnly: false });
    Object.assign(report, { preClassification: pre.classification, preFailedChecks: pre.failedChecks, preUnknownChecks: pre.unknownChecks });
    if (pre.classification === POST && !pre.executablePre && pre.failedChecks.length === 0 && pre.unknownChecks.length === 0) {
      report.classification = "ALREADY_INSTALLED_REVIEW_REQUIRED"; report.reexecution = "REFUSED";
      failHarness("REEXECUTION_REFUSED");
    }
    if (pre.classification !== PRE || !pre.executablePre || pre.failedChecks.length || pre.unknownChecks.length) failHarness("LIVE_PRE_MISMATCH");
    await mark("AFTER_PRE");
    safety.mark("mutation"); stage = "MUTATION"; report.providerInvocationCount = 1;
    await session.query(verified.body); report.providerResult = "PASS";
    stage = "POST_DDL_ATTESTATION"; await mark("AFTER_GRANT");
    const after = await collect(), post = classify(after, { readOnly: false });
    Object.assign(report, { postClassification: post.classification, postFailedChecks: post.failedChecks, postUnknownChecks: post.unknownChecks });
    if (post.classification !== POST || post.executablePre || post.failedChecks.length || post.unknownChecks.length) failHarness("LIVE_POST_MISMATCH");
    const accounting = verifyAccounting(before, after);
    safety.mark("postExact");
    await mark("BEFORE_COMMIT");
    safety.mark("commitAttempt"); stage = "COMMIT"; commitAttempted = true;
    await session.query("commit;");
    safety.mark("commitAck");
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
  } finally { try { await session.close(); } catch { report.connectionCloseUnconfirmed = true; } safety.capture(report); }
  return report;
}
export async function runProductionLeadProvider(environment = process.env, dependencies = {}) {
  const safety = dependencies[safetyKey] ?? new LeadExecutionSafety();
  const prepared = prepare(environment, dependencies,
    () => (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  safety.mark("connection");
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await executeLeadAtomic(session, prepared.bytes, { safety }), ...prepared.metadata };
}
export async function runLeadProviderCli(environment = process.env, dependencies = {}) {
  let result, code = 1, outputFailed = false;
  const safety = new LeadExecutionSafety();
  try {
    result = await (dependencies.run ?? runProductionLeadProvider)(environment, { ...dependencies, [safetyKey]: safety,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    safety.capture(result);
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
  } catch {
    if (result === undefined && dependencies.run) safety.mark("unknown");
    outputFailed = true; code = 1;
  }
  let output;
  try { output = outputFailed ? emergencyOutput(safety, environment) : (dependencies.serialize ?? serialize)(result, environment); }
  catch { code = 1; output = emergencyOutput(safety, environment); }
  try { if (output) await (dependencies.write ?? writeOutput)(output); }
  catch { return 1; } // A broken/partially written sink must not trigger a misleading second report or raw error.
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runLeadProviderCli();
