import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { assertIdentitySecurityBridgeSessionPoolerTarget } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { assertCorePolicyCommittedBaseline } from "./run-production-core-policy-pre-attestation.mjs";
import { CORE_POLICY_MIGRATION, CORE_POLICY_SHA256 } from "./phase3-core-policy-contract.mjs";
import { CORE_POLICY_BASELINE_DIGEST } from "./phase3-core-policy-production-baseline-contract.mjs";
import { CORE_POLICY_DDL_FORMAT, CORE_POLICY_BEGIN_SQL, CORE_POLICY_DDL_ZERO_MUTATIONS,
  extractCorePolicyMigrationBody, buildCorePolicyExecutionObservation, classifyCorePolicyExecutionEvidence,
  assertCorePolicyTransitionAccounting, assertCorePolicyBodyParity } from "./phase3-core-policy-ddl-contract.mjs";
import { createCorePolicyPsqlSession, CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";

const root = resolve(import.meta.dirname, "../../..");
export const CORE_POLICY_DDL_OPERATION = "--execute-production-core-policy-64245";
export const CORE_POLICY_DDL_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_CORE_POLICY_64245_DDL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL"]);
const fail = (reason) => { throw new CorePolicySessionFailure(reason); };
export function authorizeCorePolicyDdl(environment, argument, git) {
  if (argument !== CORE_POLICY_DDL_OPERATION) fail("OPERATION_NOT_AUTHORIZED");
  if (CORE_POLICY_DDL_VARIABLES.slice(0, 2).some((key) => environment[key] !== "true")) fail("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((key) => (key.startsWith("ALLOW_PRODUCTION_") || key.startsWith("REFLAB_PRODUCTION_"))
    && !CORE_POLICY_DDL_VARIABLES.includes(key))) fail("CONFLICTING_PRODUCTION_CONFIGURATION");
  try { assertNoInheritedPgState(environment); } catch { fail("INHERITED_PG_STATE"); }
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || head !== environment.REFLAB_PRODUCTION_DDL_APPROVED_HEAD) fail("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain=v1", "--untracked-files=all"])).trim()) fail("WORKTREE_DIRTY");
  return head;
}
const safeSummary = (r) => r ? { classification: ["64245_PRE_EXECUTABLE_EXACT", "64245_ALREADY_INSTALLED_POST", "BLOCKER"].includes(r.classification)
  ? r.classification : "BLOCKER", failedChecks: (r.failedChecks ?? []).filter((s) => /^[a-zA-Z0-9_.]{1,100}$/.test(s)).slice(0, 100),
  unknownChecks: (r.unknownChecks ?? []).filter((s) => /^[a-zA-Z0-9_.]{1,100}$/.test(s)).slice(0, 100) } : null;

export async function executeCorePolicyAtomicTransition(session, body, approval,
  { classify = classifyCorePolicyExecutionEvidence, beforeCommit } = {}) {
  const report = { preDdl: null, postDdl: null, migration: "NOT_EXECUTED", migrationInvocationCount: 0,
    transaction: "ROLLBACK", mutationAccounting: { ...CORE_POLICY_DDL_ZERO_MUTATIONS },
    PRODUCTION_64245_EXECUTION_STATE: "NOT_COMMITTED", REEXECUTION_REFUSED: false };
  let stage = "TRANSACTION", commitAttempted = false;
  try {
    assertCorePolicyBodyParity(body);
    await session.query(CORE_POLICY_BEGIN_SQL);
    stage = "PRE_DDL";
    const before = parseJsonResults(await session.query(buildCorePolicyExecutionObservation()));
    const pre = classify(before, approval); report.preDdl = safeSummary(pre);
    if (pre?.classification === "64245_ALREADY_INSTALLED_POST" && !pre.failedChecks.length && !pre.unknownChecks.length) {
      await session.rollback(); report.REEXECUTION_REFUSED = true;
      report.PRODUCTION_64245_EXECUTION_STATE = "ALREADY_INSTALLED_POST_REEXECUTION_REFUSED";
      return report;
    }
    if (pre?.classification !== "64245_PRE_EXECUTABLE_EXACT" || pre.executablePre !== true
      || pre.failedChecks.length || pre.unknownChecks.length) fail("PRE_CONTRACT_MISMATCH");
    stage = "MIGRATION";
    report.migrationInvocationCount = 1;
    await session.query(body); report.migration = "PASS";
    stage = "POST_DDL";
    const after = parseJsonResults(await session.query(buildCorePolicyExecutionObservation()));
    const post = classify(after, approval); report.postDdl = safeSummary(post);
    if (post?.classification !== "64245_ALREADY_INSTALLED_POST" || post.executablePre !== false
      || post.failedChecks.length || post.unknownChecks.length) fail("POST_CONTRACT_MISMATCH");
    const accounting = assertCorePolicyTransitionAccounting(before, after);
    if (beforeCommit) await beforeCommit();
    stage = "COMMIT"; commitAttempted = true;
    await session.query("commit;");
    report.transaction = "COMMIT"; report.mutationAccounting = accounting;
    report.PRODUCTION_64245_EXECUTION_STATE = "COMMITTED_POST_EXACT";
    return report;
  } catch (error) {
    try { await session.rollback(); } catch { /* Connection close rolls back an uncommitted transaction. */ }
    const failure = error instanceof CorePolicySessionFailure ? error : new CorePolicySessionFailure("LOCAL_CONTRACT_OR_PROGRAMMING_ERROR");
    Object.assign(report, { stage, reason: failure.reason, sqlstate: failure.sqlstate, psqlExitStatus: failure.psqlExitStatus });
    if (commitAttempted) Object.assign(report, { transaction: "UNKNOWN", commitOutcomeUnknown: true,
      readOnlyForensicRequired: true, reexecutionAuthorized: false,
      mutationAccounting: { ...CORE_POLICY_DDL_ZERO_MUTATIONS, policyDrops: "UNKNOWN", policyCreates: "UNKNOWN" } });
    return report;
  } finally {
    try { await session.close(); } catch { report.connectionCloseUnconfirmed = true; }
  }
}
export async function runProductionCorePolicy64245(environment = process.env, dependencies = {}) {
  let stage = "AUTHORIZATION", session;
  try {
    const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
    const head = authorizeCorePolicyDdl(environment, dependencies.argument, git);
    const migration = (dependencies.readMigration ?? (() => readFileSync(resolve(root, "supabase/migrations", CORE_POLICY_MIGRATION))))();
    let artifact;
    try { artifact = extractCorePolicyMigrationBody(migration); } catch { fail("MIGRATION_ARTIFACT_REJECTED"); }
    const approval = (dependencies.assertBaseline ?? assertCorePolicyCommittedBaseline)(git);
    if (approval?.digest !== CORE_POLICY_BASELINE_DIGEST || approval.committedArtifactVerified !== true) fail("BASELINE_ARTIFACT_REJECTED");
    stage = "TARGET";
    let target;
    try { target = assertIdentitySecurityBridgeSessionPoolerTarget(resolveProductionManagedPostgresTarget(environment, {
      projectRefVariable: "REFLAB_PRODUCTION_DDL_PROJECT_REF", databaseUrlVariable: "REFLAB_PRODUCTION_DDL_DB_URL",
      operationLabel: "64245 isolated Production DDL",
    })); } catch { fail("TARGET_MISMATCH"); }
    stage = "TRANSACTION";
    session = (dependencies.createSession ?? createCorePolicyPsqlSession)(target.connectionEnvironment, environment);
    const result = await executeCorePolicyAtomicTransition(session, artifact.body, approval,
      { classify: dependencies.classify ?? classifyCorePolicyExecutionEvidence });
    return { format: CORE_POLICY_DDL_FORMAT, head,
      artifact: { path: `supabase/migrations/${CORE_POLICY_MIGRATION}`, sha256: CORE_POLICY_SHA256 },
      baseline: { version: 1, digest: CORE_POLICY_BASELINE_DIGEST },
      target: { project: target.projectRef, hostCategory: "EXACT_SESSION_POOLER", database: "postgres",
        installer: "postgres.nagjddldrldwavmfaytc" }, ...result,
      TABLE_ACL_BASELINE_PURPOSE: "PRESERVATION_ONLY", TABLE_ACL_SECURITY_STATUS: "PENDING_RECONCILIATION",
      TABLE_ACL_RECONCILIATION_STILL_REQUIRED: true, runtime: "DISABLED", cutover: "NOT_AUTHORIZED", phase4: "NOT_AUTHORIZED" };
  } catch (error) {
    if (session) { try { await session.close(); } catch { /* No retry or reconnect. */ } }
    return { format: CORE_POLICY_DDL_FORMAT, stage, reason: error instanceof CorePolicySessionFailure ? error.reason : "LOCAL_PROGRAMMING_ERROR",
      migration: "NOT_EXECUTED", migrationInvocationCount: 0, transaction: "ROLLBACK",
      mutationAccounting: { ...CORE_POLICY_DDL_ZERO_MUTATIONS }, PRODUCTION_64245_EXECUTION_STATE: "NOT_COMMITTED" };
  }
}
export async function runCorePolicy64245Cli(environment = process.env, dependencies = {}) {
  const result = await runProductionCorePolicy64245(environment, { ...dependencies,
    argument: dependencies.argument ?? (process.argv.length === 3 ? process.argv[2] : undefined) });
  const output = JSON.stringify(result);
  const url = environment.REFLAB_PRODUCTION_DDL_DB_URL;
  let password = "", encoded = "";
  try { encoded = url ? new URL(url).password : ""; password = decodeURIComponent(encoded); } catch { /* Authorization rejects malformed targets. */ }
  if (/(?:postgres(?:ql)?|https?):\/\//i.test(output) || [url, password, encoded].some((s) => s && output.includes(s))) {
    (dependencies.write ?? ((text) => process.stdout.write(text)))(`${JSON.stringify({ format: CORE_POLICY_DDL_FORMAT,
      reason: "OUTPUT_REDACTION_FAILED", commitOutcomeUnknown: result.transaction === "COMMIT" || result.commitOutcomeUnknown === true,
      readOnlyForensicRequired: true, reexecutionAuthorized: false })}\n`);
    return 1;
  }
  (dependencies.write ?? ((text) => process.stdout.write(text)))(`${output}\n`);
  return result.PRODUCTION_64245_EXECUTION_STATE === "COMMITTED_POST_EXACT" ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await runCorePolicy64245Cli();
