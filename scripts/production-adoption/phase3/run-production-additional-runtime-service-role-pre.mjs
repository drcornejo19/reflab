import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { PRE_BEGIN, PRE_FORMAT, PRE_EXACT, POST_EXACT, prepareAdditionalHarness, additionalObservationSql,
  classifyAdditionalHarnessEvidence, serializeAdditionalHarness, safeHarnessFailure, failHarness } from "./phase3-additional-runtime-pre-contract.mjs";

export async function attestAdditionalReadOnly(session, { classify, observe } = {}) {
  let report;
  try {
    await session.query(PRE_BEGIN);
    const results = observe ? await observe(session) : parseJsonResults(await session.query(additionalObservationSql()));
    report = classifyAdditionalHarnessEvidence(results, true, classify);
  } catch (error) {
    report = { classification: "UNKNOWN", executablePre: false, failedChecks: [], unknownChecks: ["currentCatalogObservation"],
      reason: safeHarnessFailure(error), transactionReadOnly: null };
  }
  let transaction = "ROLLBACK";
  try { await session.rollback(); }
  catch { transaction = "ROLLBACK_UNCONFIRMED"; report = { ...report, classification: "UNKNOWN", executablePre: false,
    unknownChecks: [...report.unknownChecks, "rollbackAcknowledgement"] }; }
  finally {
    try { await session.close(); }
    catch { report = { ...report, classification: "UNKNOWN", executablePre: false, unknownChecks: [...report.unknownChecks, "connectionClose"] }; }
  }
  return { ...report, format: PRE_FORMAT, transaction, approval: "NOT_PERFORMED", productionDdlAuthorized: false,
    automaticRetryAuthorized: false, mutationCount: 0, migrationInvocationCount: 0 };
}
export async function runProductionAdditionalPre(environment = process.env, dependencies = {}) {
  const prepared = prepareAdditionalHarness(environment, dependencies, false,
    () => (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await attestAdditionalReadOnly(session), ...prepared.metadata };
}
export async function runAdditionalPreCli(environment = process.env, dependencies = {}) {
  let result, code = 1;
  try {
    result = await (dependencies.run ?? runProductionAdditionalPre)(environment, { ...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    if (result.format !== PRE_FORMAT || ![PRE_EXACT, POST_EXACT, "BLOCKER", "UNKNOWN"].includes(result.classification)
      || result.approval !== "NOT_PERFORMED" || result.productionDdlAuthorized !== false || result.mutationCount !== 0
      || result.migrationInvocationCount !== 0 || result.automaticRetryAuthorized !== false) failHarness("OUTPUT_CONTRACT_MISMATCH");
    if ([PRE_EXACT, POST_EXACT].includes(result.classification)) {
      if (result.executablePre !== (result.classification === PRE_EXACT) || result.reexecutionRefused !== (result.classification === POST_EXACT)
        || result.failedChecks?.length !== 0 || result.unknownChecks?.length !== 0 || result.transaction !== "ROLLBACK"
        || result.transactionReadOnly !== true) failHarness("OUTPUT_CONTRACT_MISMATCH");
      code = 0;
    }
  } catch (error) { result = { format: PRE_FORMAT, classification: "BLOCKER", executablePre: false, reason: safeHarnessFailure(error),
    failedChecks: ["preconnectionGate"], unknownChecks: [], approval: "NOT_PERFORMED", productionDdlAuthorized: false,
    automaticRetryAuthorized: false, mutationCount: 0, migrationInvocationCount: 0 }; }
  let output;
  try { output = serializeAdditionalHarness(result, environment); }
  catch { code = 1; try { output = serializeAdditionalHarness({ format: PRE_FORMAT, classification: "BLOCKER",
    reason: "OUTPUT_REDACTION_FAILED", approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0 }, environment); }
  catch { output = ""; } }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runAdditionalPreCli();
