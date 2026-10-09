import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertIdentitySecurityBridgeSessionPoolerTarget } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { createCorePolicyPsqlSession, CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { BROWSER_PRE_ARTIFACTS } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { assertBrowserPreCommittedArtifacts } from "./run-production-browser-privilege-pre-attestation.mjs";
import { BROWSER_MIGRATION_PATH, BROWSER_MIGRATION_SHA } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_TRANSITION_BASELINE_DIGEST } from "./phase3-browser-privilege-production-baseline.mjs";
import { BROWSER_DDL_FORMAT, BROWSER_DDL_BEGIN, BROWSER_DDL_ZERO, extractBrowserDdlBody, assertBrowserDdlBody,
  buildBrowserDdlObservation, observeBrowserDdlEvidence, classifyBrowserDdlEvidence, assertBrowserDdlAccounting } from "./phase3-browser-privilege-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const BROWSER_DDL_OPERATION = "--execute-production-browser-privilege-64249";
export const BROWSER_DDL_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_64249_DDL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL"]);
export const BROWSER_DDL_EXTERNAL_PRE_EVIDENCE = Object.freeze({ approvedHead: "476047b4f40add18bd3e5fcddcd83b941309cb28",
  format: "REFLAB_20260901064249_CURRENT_PRODUCTION_PRE_ATTESTATION_V1", classification: "64249_PRE_EXECUTABLE_EXACT",
  checkCount: 40, transaction: "ROLLBACK", source: "REPORTED_COMPLETED_EXTERNAL_PRE_NOT_LIVE_AUTHORIZATION",
  CURRENT_PRODUCTION_PRE_EVIDENCE: "CURRENTLY_ATTESTED_EXECUTABLE_EXACT", FRESH_EXTERNAL_PRE_REQUIRED_BEFORE_RUNNER_REVIEW: "NO" });
export const BROWSER_DDL_ARTIFACTS = Object.freeze({ ...BROWSER_PRE_ARTIFACTS,
  "scripts/production-adoption/phase3/phase3-browser-privilege-migration-source.mjs": "49f064339e576dcda4661ca2c745ffe0fc989aca56b1372ffc6608ab04105d74",
  "scripts/production-adoption/phase3/phase3-browser-privilege-pre-attestation-contract.mjs": "5268a9af4ad27f42fbec6aa19692d29e8378a50cf522252c3a3d344f0890cc81",
  "scripts/production-adoption/phase3/phase3-core-policy-psql-session.mjs": "fedca43a26beceb43626988d31e95c8f467f746c7cf4709457b0621e3b5f842b",
  "scripts/production-adoption/phase3/phase3-browser-privilege-ddl-contract.mjs": "66aeb236b3d391222807bde3576a44084dfc224781e5a34964b1908a8a4b070d",
});
const fail = (reason) => { throw new CorePolicySessionFailure(reason); };
export function authorizeBrowserDdl(environment, argument, git) {
  if (argument !== BROWSER_DDL_OPERATION) fail("OPERATION_NOT_AUTHORIZED");
  if (BROWSER_DDL_VARIABLES.slice(0, 2).some((k) => environment[k] !== "true")) fail("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((k) => /^PG/i.test(k))) fail("INHERITED_PG_STATE");
  if (Object.keys(environment).some((k) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/.test(k) && !BROWSER_DDL_VARIABLES.includes(k)))
    fail("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment.REFLAB_PRODUCTION_DDL_APPROVED_HEAD) fail("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) fail("WORKTREE_DIRTY");
  return head;
}
export function assertBrowserDdlArtifacts(git, readCheckout = (p) => readFileSync(resolve(root, p), "utf8")) {
  for (const [path, expected] of Object.entries(BROWSER_DDL_ARTIFACTS)) {
    const blob = git(["show", `HEAD:${path}`]), bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "utf8");
    if (createHash("sha256").update(bytes).digest("hex") !== expected || readCheckout(path).replaceAll("\r\n", "\n") !== bytes.toString("utf8"))
      fail("COMMITTED_ARTIFACT_MISMATCH");
  }
  return assertBrowserPreCommittedArtifacts(git, readCheckout);
}
const summary = (r) => r ? { classification: ["64249_PRE_EXECUTABLE_EXACT", "64249_ALREADY_INSTALLED_POST", "BLOCKER"].includes(r.classification)
  ? r.classification : "BLOCKER", failedChecks: (r.failedChecks ?? []).filter((s) => /^[a-zA-Z0-9_.]{1,100}$/.test(s)).slice(0, 100),
  unknownChecks: (r.unknownChecks ?? []).filter((s) => /^[a-zA-Z0-9_.]{1,100}$/.test(s)).slice(0, 100) } : null;
const initialReport = () => ({ preClassification: null, preFailedChecks: [], preUnknownChecks: [],
  postClassification: null, postFailedChecks: [], postUnknownChecks: [], migrationInvocationCount: 0,
  migrationResult: "NOT_EXECUTED", transaction: "ROLLBACK", commitOutcome: "NOT_COMMITTED",
  mutationAccounting: { ...BROWSER_DDL_ZERO }, reexecutionRefused: false, automaticRetryAuthorized: false,
  readOnlyForensicRequired: false, PRODUCTION_64249_EXECUTION_STATE: "NOT_COMMITTED" });
export async function executeBrowserDdlAtomic(session, bytes, verification, { classify = classifyBrowserDdlEvidence, beforeCommit } = {}) {
  const report = initialReport();
  let stage = "TRANSACTION", commitSent = false;
  try {
    const { body } = extractBrowserDdlBody(bytes);
    assertBrowserDdlBody(body, bytes);
    await session.query(BROWSER_DDL_BEGIN);
    stage = "LIVE_PRE";
    const before = observeBrowserDdlEvidence(parseJsonResults(await session.query(buildBrowserDdlObservation())));
    const pre = classify(before, verification), preSummary = summary(pre);
    Object.assign(report, { preClassification: preSummary.classification, preFailedChecks: preSummary.failedChecks, preUnknownChecks: preSummary.unknownChecks });
    if (pre.classification === "64249_ALREADY_INSTALLED_POST" && pre.executablePre === false && !pre.failedChecks.length && !pre.unknownChecks.length) {
      await session.rollback(); report.reexecutionRefused = true;
      report.PRODUCTION_64249_EXECUTION_STATE = "ALREADY_INSTALLED_POST_REEXECUTION_REFUSED";
      return report;
    }
    if (pre.classification !== "64249_PRE_EXECUTABLE_EXACT" || pre.executablePre !== true || pre.failedChecks.length || pre.unknownChecks.length)
      fail("PRE_CONTRACT_MISMATCH");
    stage = "MIGRATION";
    report.migrationInvocationCount = 1;
    await session.query(body); report.migrationResult = "PASS";
    stage = "LIVE_POST";
    const after = observeBrowserDdlEvidence(parseJsonResults(await session.query(buildBrowserDdlObservation())));
    const post = classify(after, verification), postSummary = summary(post);
    Object.assign(report, { postClassification: postSummary.classification, postFailedChecks: postSummary.failedChecks, postUnknownChecks: postSummary.unknownChecks });
    if (post.classification !== "64249_ALREADY_INSTALLED_POST" || post.executablePre !== false || post.failedChecks.length || post.unknownChecks.length)
      fail("POST_CONTRACT_MISMATCH");
    const accounting = assertBrowserDdlAccounting(before, after);
    if (beforeCommit) await beforeCommit();
    stage = "COMMIT"; commitSent = true;
    await session.query("commit;");
    Object.assign(report, { transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED", mutationAccounting: accounting,
      PRODUCTION_64249_EXECUTION_STATE: "COMMITTED_POST_EXACT" });
  } catch (error) {
    try { await session.rollback(); } catch { report.rollbackAcknowledgement = "SESSION_CLOSE_REQUIRED"; }
    const failure = error instanceof CorePolicySessionFailure ? error : new CorePolicySessionFailure("LOCAL_CONTRACT_OR_PROGRAMMING_ERROR");
    Object.assign(report, { stage, reason: failure.reason, sqlstate: failure.sqlstate });
    if (commitSent) Object.assign(report, { transaction: "UNKNOWN", commitOutcome: "UNKNOWN", readOnlyForensicRequired: true,
      onlyAllowedNextAction: "READ_ONLY_POST_FORENSIC", PRODUCTION_64249_EXECUTION_STATE: "COMMIT_OUTCOME_UNKNOWN_REQUIRES_READ_ONLY_FORENSIC",
      mutationAccounting: { ...BROWSER_DDL_ZERO, effectivePrivilegeRevocations: "UNKNOWN", anonRevocations: "UNKNOWN",
        authenticatedRevocations: "UNKNOWN", tableGrants: "UNKNOWN", columnGrants: "UNKNOWN", sqlRevokeStatements: "UNKNOWN", sqlGrantStatements: "UNKNOWN" } });
  } finally {
    try { await session.close(); } catch { report.connectionCloseUnconfirmed = true; }
  }
  return report;
}
export async function runProductionBrowserPrivilege64249(environment = process.env, dependencies = {}) {
  try {
    const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, windowsHide: true }));
    const head = authorizeBrowserDdl(environment, dependencies.argument, git);
    const verification = assertBrowserDdlArtifacts(git, dependencies.readCheckout);
    const blob = git(["show", `HEAD:${BROWSER_MIGRATION_PATH}`]), bytes = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "utf8");
    extractBrowserDdlBody(bytes);
    let target;
    try { target = assertIdentitySecurityBridgeSessionPoolerTarget(resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: "REFLAB_PRODUCTION_DDL_PROJECT_REF", databaseUrlVariable: "REFLAB_PRODUCTION_DDL_DB_URL",
      operationLabel: "64249 isolated Production DDL" })); } catch { fail("TARGET_MISMATCH"); }
    const session = (dependencies.createSession ?? createCorePolicyPsqlSession)(target.connectionEnvironment, environment);
    const result = await executeBrowserDdlAtomic(session, bytes, { ...verification, approvedHead: head, approvedHeadExact: true, targetExact: true });
    const installedPostExact = result.transaction === "COMMIT" || result.reexecutionRefused === true;
    return { format: BROWSER_DDL_FORMAT, approvedHead: head, artifact: { path: BROWSER_MIGRATION_PATH, sha256: BROWSER_MIGRATION_SHA },
      baseline: { version: 1, digest: BROWSER_TRANSITION_BASELINE_DIGEST },
      externalPreEvidence: BROWSER_DDL_EXTERNAL_PRE_EVIDENCE,
      target: { project: target.projectRef, hostCategory: "EXACT_SESSION_POOLER", database: "postgres", installer: "postgres.nagjddldrldwavmfaytc" },
      ...result, scopeBoundary: { "64249_SCOPE": "BROWSER_PRIVILEGE_RECONCILIATION_ONLY",
        BROWSER_PRIVILEGE_RECONCILIATION_COMPLETE: installedPostExact ? "YES" : "NOT_ATTESTED",
        GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE", SEPARATE_SERVICE_ROLE_PRIVILEGE_WAVE_REQUIRED: "YES",
        TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES", RUNTIME_ENABLEMENT_BLOCKED_BY_FINAL_PRIVILEGE_WAVE: "YES",
        "64253_INDEPENDENT_REVIEW_REQUIRED": "YES" },
      REFEREE_EXAM_SESSIONS_AUTH_SELECT_POLICY: installedPostExact ? "ABSENT_EXPECTED_AT_64249" : "NOT_ATTESTED",
      REFEREE_EXAM_SESSIONS_BROWSER_READ_USABLE: installedPostExact ? "NO" : "NOT_ATTESTED",
      REFEREE_EXAM_SESSIONS_AUTH_SELECT_ACL: installedPostExact ? "GRANTED" : "NOT_ATTESTED",
      runtime: installedPostExact ? "DISABLED" : "NOT_ATTESTED", cutover: "NOT_AUTHORIZED", phase4: "NOT_AUTHORIZED" };
  } catch (error) {
    return { format: BROWSER_DDL_FORMAT, approvedHead: null, artifact: { path: BROWSER_MIGRATION_PATH, sha256: BROWSER_MIGRATION_SHA },
      baseline: { version: 1, digest: BROWSER_TRANSITION_BASELINE_DIGEST }, target: null,
      externalPreEvidence: BROWSER_DDL_EXTERNAL_PRE_EVIDENCE,
      ...initialReport(), reason: error instanceof CorePolicySessionFailure ? error.reason : "LOCAL_PROGRAMMING_ERROR" };
  }
}
export function serializeBrowserDdl(result, environment) {
  return serializeBrowserForensic(result, { ...environment,
    REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL: environment.REFLAB_PRODUCTION_DDL_DB_URL });
}
export async function runBrowserDdlCli(environment = process.env, dependencies = {}) {
  let result;
  try { result = await (dependencies.run ?? runProductionBrowserPrivilege64249)(environment, { ...dependencies,
    argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) }); } catch {
    result = { format: BROWSER_DDL_FORMAT, ...initialReport(), reason: "LOCAL_PROGRAMMING_ERROR",
      readOnlyForensicRequired: true };
  }
  let output;
  try { output = serializeBrowserDdl(result, environment); } catch {
    const safe = { format: BROWSER_DDL_FORMAT, reason: "OUTPUT_REDACTION_FAILED", automaticRetryAuthorized: false,
      readOnlyForensicRequired: true, PRODUCTION_64249_EXECUTION_STATE: "NOT_ATTESTED_REQUIRES_READ_ONLY_FORENSIC" };
    try { output = serializeBrowserDdl(safe, environment); } catch { output = ""; }
    if (output) (dependencies.write ?? ((s) => process.stdout.write(s)))(output);
    return 1;
  }
  (dependencies.write ?? ((s) => process.stdout.write(s)))(output);
  return result.PRODUCTION_64249_EXECUTION_STATE === "COMMITTED_POST_EXACT" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runBrowserDdlCli();
