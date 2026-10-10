import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { PRE_FORMAT, PRE_VARIABLES, PRE_RUNNER, PRE_BEGIN, TARGET, defaultGit,
  authorizeCurrentHarness, verifyCurrentHarnessArtifacts, resolveCurrentHarnessTarget, buildCurrentHarnessObservation,
  classifyCurrentHarnessEvidence, serializeCurrentHarness, safeHarnessFailure, failHarness } from "./phase3-current-service-role-pre-contract.mjs";

export async function attestCurrentServiceReadOnly(session, {classify, observe} = {}) {
  let report;
  try {
    await session.query(PRE_BEGIN);
    const results = observe ? await observe(session) : parseJsonResults(await session.query(buildCurrentHarnessObservation()));
    report = classifyCurrentHarnessEvidence(results, true, classify);
  } catch (error) {
    report = {classification: "UNKNOWN", executablePre: false, failedChecks: [], unknownChecks: ["currentCatalogObservation"],
      reason: safeHarnessFailure(error), transactionReadOnly: null};
  }
  try {await session.rollback();} catch {
    report = {...report, classification: "UNKNOWN", executablePre: false, unknownChecks: [...report.unknownChecks, "rollbackAcknowledgement"]};
  } finally {await session.close();}
  return {...report, format: PRE_FORMAT, transaction: report.unknownChecks.includes("rollbackAcknowledgement") ? "ROLLBACK_UNCONFIRMED" : "ROLLBACK",
    approval: "NOT_PERFORMED", productionDdlAuthorized: false, mutationCount: 0, migrationInvocationCount: 0};
}

export async function runProductionCurrentServicePre(environment = process.env, dependencies = {}) {
  const git = dependencies.git ?? defaultGit;
  const head = authorizeCurrentHarness(environment, dependencies.argument, PRE_VARIABLES, PRE_VARIABLES.slice(0, 3), PRE_VARIABLES[4], git);
  const integrity = verifyCurrentHarnessArtifacts(git, head, PRE_RUNNER,
    (dependencies.readRunnerBytes ?? readFileSync)(fileURLToPath(import.meta.url)), dependencies.readCheckout);
  const target = resolveCurrentHarnessTarget(environment, PRE_VARIABLES[3], PRE_VARIABLES[5]);
  const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(target.connectionEnvironment, environment);
  return {...await attestCurrentServiceReadOnly(session), approvedHead: head, target: TARGET, ...integrity};
}

export async function runCurrentServicePreCli(environment = process.env, dependencies = {}) {
  let result, code = 1;
  try {
    result = await (dependencies.run ?? runProductionCurrentServicePre)(environment, {...dependencies,
      argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined)});
    if (result.format !== PRE_FORMAT || !["PRE_EXECUTABLE_EXACT", "ALREADY_INSTALLED_POST", "BLOCKER", "UNKNOWN"].includes(result.classification)
      || result.approval !== "NOT_PERFORMED" || result.mutationCount !== 0 || result.migrationInvocationCount !== 0
      || result.productionDdlAuthorized !== false) failHarness("OUTPUT_CONTRACT_MISMATCH");
    if (["PRE_EXECUTABLE_EXACT", "ALREADY_INSTALLED_POST"].includes(result.classification)) code = 0;
  } catch (error) {result = {format: PRE_FORMAT, classification: "BLOCKER", executablePre: false, reason: safeHarnessFailure(error),
    failedChecks: ["preconnectionGate"], unknownChecks: [], approval: "NOT_PERFORMED", productionDdlAuthorized: false,
    mutationCount: 0, migrationInvocationCount: 0};}
  let output;
  try {output = serializeCurrentHarness(result, environment);} catch {
    code = 1;
    try {output = serializeCurrentHarness({format: PRE_FORMAT, classification: "BLOCKER", reason: "OUTPUT_REDACTION_FAILED",
      approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0}, environment);} catch {output = "";}
  }
  if (output) (dependencies.write ?? ((text) => process.stdout.write(text)))(output);
  return code;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runCurrentServicePreCli();
