import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { BEGIN, FORMAT, COMPLETE, prepareBrowserForensic, inventorySql, functionsSql, policyFunctionOids,
  inspectCatalogTree, buildBrowserReport, serializeCurrentHarness, safeHarnessFailure, failHarness } from "./phase3-additional-browser-forensic-contract.mjs";

export async function observeBrowserCatalog(session) {
  const inventory = parseJsonResults(await session.query(inventorySql())).get("additional_browser_inventory");
  if (!inventory) failHarness("INVENTORY_INCOMPLETE");
  const functions = new Map();
  let pending = policyFunctionOids(inventory), rounds = 0;
  while (pending.length) {
    if (++rounds > 100 || functions.size + pending.length > 10000) failHarness("DEPENDENCY_BOUND_EXCEEDED");
    const rows = parseJsonResults(await session.query(functionsSql(pending))).get("additional_browser_functions");
    if (!Array.isArray(rows) || pending.some((oid) => !rows.some((f) => f.oid === oid))) failHarness("FUNCTION_OBSERVATION_INCOMPLETE");
    for (const f of rows) functions.set(f.oid, f);
    pending = [...new Set(rows.flatMap((f) => [...f.catalogDependencies.filter((d) => d.catalog === "pg_proc").map((d) => d.oid),
      ...inspectCatalogTree(f.sqlBodyTree, inventory.operatorFunctions).functionOids]))].filter((oid) => !functions.has(oid)).sort((a, b) => a - b);
  }
  return buildBrowserReport(inventory, [...functions.values()].sort((a, b) => a.oid - b.oid));
}

export async function attestBrowserCatalog(session, observe = observeBrowserCatalog, { overallMs = 180000 } = {}) {
  let report;
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
    session.close().catch(() => {}); reject(new Error("OVERALL_OBSERVATION_TIMEOUT"));
  }, overallMs); });
  try { report = await Promise.race([(async () => { await session.query(BEGIN); return observe(session); })(), timeout]); }
  catch (error) { report = { format: FORMAT, classification: "UNKNOWN", observationComplete: false,
    failedChecks: [], unknownChecks: ["catalogObservationIncomplete"], reason: safeHarnessFailure(error), transactionReadOnly: null }; }
  let transaction = "ROLLBACK";
  try { await session.rollback(); }
  catch { transaction = "ROLLBACK_UNCONFIRMED"; report.classification = "UNKNOWN";
    report.observationComplete = false; report.unknownChecks.push("rollbackAcknowledgement"); }
  finally { try { await session.close(); } catch { report.classification = "UNKNOWN";
    report.observationComplete = false; report.unknownChecks.push("sessionClose"); } finally { clearTimeout(timer); } }
  return { ...report, transaction, approval: "NOT_PERFORMED", mutationCount: 0, ddlCount: 0, dmlCount: 0,
    migrationInvocationCount: 0, automaticRetryAuthorized: false, remoteDdlAuthorized: false };
}

export async function runProductionBrowserForensic(environment = process.env, dependencies = {}) {
  const prepared = prepareBrowserForensic(environment, dependencies,
    (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)));
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(prepared.connectionEnvironment, environment);
  return { ...await attestBrowserCatalog(session), ...prepared.metadata };
}

export async function runBrowserForensicCli(environment = process.env, dependencies = {}) {
  let report, code = 1;
  try {
    report = await (dependencies.run ?? runProductionBrowserForensic)(environment, { ...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
    if (report.format !== FORMAT || ![COMPLETE, "BLOCKER", "UNKNOWN"].includes(report.classification)
      || report.approval !== "NOT_PERFORMED" || ["mutationCount", "ddlCount", "dmlCount", "migrationInvocationCount"].some((k) => report[k] !== 0))
      failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (report.classification === COMPLETE) {
      if (report.transaction !== "ROLLBACK" || report.transactionReadOnly !== true || report.failedChecks.length
        || report.unknownChecks.length || report.observationComplete !== true) failHarness("OUTPUT_CONTRACT_MISMATCH");
      code = 0;
    }
  } catch (error) { report = { format: FORMAT, classification: "BLOCKER", reason: safeHarnessFailure(error),
    failedChecks: ["preconnectionGate"], unknownChecks: [], approval: "NOT_PERFORMED", mutationCount: 0,
    ddlCount: 0, dmlCount: 0, migrationInvocationCount: 0, remoteDdlAuthorized: false }; }
  let output;
  try { output = serializeCurrentHarness(report, environment); }
  catch {
    code = 1;
    try { output = serializeCurrentHarness({ format: FORMAT, classification: "BLOCKER", reason: "OUTPUT_REDACTION_FAILED",
      failedChecks: ["safeSerialization"], unknownChecks: [], approval: "NOT_PERFORMED", mutationCount: 0,
      ddlCount: 0, dmlCount: 0, migrationInvocationCount: 0, remoteDdlAuthorized: false }, environment); }
    catch { output = ""; }
  }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runBrowserForensicCli();
