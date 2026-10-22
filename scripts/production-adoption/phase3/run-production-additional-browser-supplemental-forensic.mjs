import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { safeHarnessFailure } from "./phase3-current-service-role-pre-contract.mjs";
import { BEGIN, FORMAT, COMPLETE, FUNCTION_OIDS, TYPE_OIDS, ARCHIVE_SHA, BOUNDARY,
  supplementalTypeSql, supplementalFunctionSql, discoverIoFunctions, classifySupplemental,
  functionSourceSha256, SOURCE_HASH_BASIS, prepareSupplemental, serializeCurrentHarness, failHarness } from "./phase3-additional-browser-supplemental-contract.mjs";

const materialize = (rows) => {
  if (!Array.isArray(rows)) failHarness("FUNCTION_OBSERVATION_INCOMPLETE");
  return rows.map((f) => {
    const result = { ...f, sourceSha256: functionSourceSha256(f), sourceHashBasis: SOURCE_HASH_BASIS };
    delete result.sourceText;
    return result;
  });
};
export async function observeSupplemental(session) {
  const status = parseJsonResults(await session.query(jsonQuery("browser_supplemental_read_only", "jsonb_build_object('readOnly',current_setting('transaction_read_only'))").sql + ";"))
    .get("browser_supplemental_read_only");
  if (status?.readOnly !== "on") failHarness("TRANSACTION_NOT_READ_ONLY");
  const direct = materialize(parseJsonResults(await session.query(supplementalFunctionSql(FUNCTION_OIDS))).get("browser_supplemental_functions"));
  const typeEvidence = parseJsonResults(await session.query(supplementalTypeSql())).get("browser_supplemental_types");
  let discoveredIoFunctionOids = [];
  try { discoveredIoFunctionOids = discoverIoFunctions(typeEvidence); } catch {
    return classifySupplemental({ transactionReadOnly: true, requestedFunctionOids: FUNCTION_OIDS, requestedTypeOids: TYPE_OIDS,
      typeEvidence, directFunctionEvidence: direct, discoveredIoFunctionOids, ioFunctionEvidence: [] });
  }
  // No recursive discovery: only the two observed type I/O fields can expand scope.
  const pending = discoveredIoFunctionOids.filter((oid) => !FUNCTION_OIDS.includes(oid));
  const ioRows = pending.length ? materialize(parseJsonResults(await session.query(supplementalFunctionSql(pending, typeEvidence)))
    .get("browser_supplemental_functions")) : [];
  const ioFunctionEvidence = discoveredIoFunctionOids.map((oid) => [...direct, ...ioRows].find((f) => f.oid === oid)).filter(Boolean);
  if (ioRows.some((f) => !pending.includes(f.oid)) || ioRows.length !== new Set(ioRows.map((f) => f.oid)).size)
    failHarness("IO_FUNCTION_SCOPE_REJECTED");
  return classifySupplemental({ transactionReadOnly: true, requestedFunctionOids: FUNCTION_OIDS, requestedTypeOids: TYPE_OIDS,
    typeEvidence, directFunctionEvidence: direct, discoveredIoFunctionOids, ioFunctionEvidence });
}
export async function attestSupplemental(session, { overallMs = 180000 } = {}) {
  let report, timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    session.close().catch(() => {}); reject(new Error("OVERALL_OBSERVATION_TIMEOUT"));
  }, overallMs); });
  try { report = await Promise.race([(async () => { await session.query(BEGIN); return observeSupplemental(session); })(), timeout]); }
  catch (error) { report = { format: FORMAT, classification: "UNKNOWN", observationComplete: false,
    failedChecks: [], unknownChecks: ["supplementalObservationIncomplete"], reason: safeHarnessFailure(error), transactionReadOnly: null }; }
  let transaction = "ROLLBACK";
  try { await session.rollback(); }
  catch { transaction = "ROLLBACK_UNCONFIRMED"; report.classification = "UNKNOWN";
    report.observationComplete = false; report.unknownChecks.push("rollbackAcknowledgement"); }
  finally { try { await session.close(); } catch { report.classification = "UNKNOWN";
    report.observationComplete = false; report.unknownChecks.push("sessionClose"); } finally { clearTimeout(timer); } }
  return { ...report, transaction, approval: "NOT_PERFORMED", mutationCount: 0, ddlCount: 0, dmlCount: 0,
    migrationInvocationCount: 0, automaticRetryAuthorized: false, remoteDdlAuthorized: false,
    archiveSha256Expected: ARCHIVE_SHA, scopeBoundary: BOUNDARY };
}
export async function runProductionSupplemental(environment = process.env, dependencies = {}) {
  const prepared = prepareSupplemental(environment, dependencies,
    (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await attestSupplemental(session), ...prepared.metadata };
}
export async function runSupplementalCli(environment = process.env, dependencies = {}) {
  let report, code = 1;
  try {
    report = await (dependencies.run ?? runProductionSupplemental)(environment, { ...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    if (report.format !== FORMAT || ![COMPLETE, "BLOCKER", "UNKNOWN"].includes(report.classification)
      || report.approval !== "NOT_PERFORMED" || ["mutationCount", "ddlCount", "dmlCount", "migrationInvocationCount"].some((k) => report[k] !== 0))
      failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (report.classification === COMPLETE) {
      if (classifySupplemental(report).classification !== COMPLETE || report.transaction !== "ROLLBACK"
        || report.failedChecks.length || report.unknownChecks.length || !report.observationComplete) failHarness("OUTPUT_CONTRACT_MISMATCH");
      code = 0;
    }
  } catch (error) { report = { format: FORMAT, classification: "BLOCKER", reason: safeHarnessFailure(error),
    failedChecks: ["preconnectionGate"], unknownChecks: [], approval: "NOT_PERFORMED", mutationCount: 0,
    ddlCount: 0, dmlCount: 0, migrationInvocationCount: 0, remoteDdlAuthorized: false }; }
  let output;
  try { output = serializeCurrentHarness(report, environment); }
  catch { code = 1;
    try { output = serializeCurrentHarness({ format: FORMAT, classification: "BLOCKER", reason: "OUTPUT_REDACTION_FAILED",
      failedChecks: ["safeSerialization"], unknownChecks: [], approval: "NOT_PERFORMED", mutationCount: 0,
      ddlCount: 0, dmlCount: 0, migrationInvocationCount: 0, remoteDdlAuthorized: false }, environment); } catch { output = ""; }
  }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runSupplementalCli();
