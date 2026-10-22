import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment, parseJsonResults } from "../../production-preflight/run.mjs";
import { buildBrowserLineageFixture } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { BROWSER_MIGRATION_PATH, buildBrowserTransitionBatch, observeBrowserTransitionResults } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_PRE_VERIFICATION_CHECKS } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { assertBrowserPreCommittedArtifacts } from "./run-production-browser-privilege-pre-attestation.mjs";
import { extractBrowserDdlBody, classifyLocalBrowserDdlEvidence } from "./phase3-browser-privilege-ddl-contract.mjs";
import { executeBrowserDdlAtomic } from "./run-production-browser-privilege-64249.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";

const root = resolve(import.meta.dirname, "../../..");
const git = (args) => execFileSync("git", ["-c", `safe.directory=${root}`, ...args], { cwd: root, windowsHide: true });
const bytes = git(["show", `HEAD:${BROWSER_MIGRATION_PATH}`]), { body } = extractBrowserDdlBody(bytes);
const verification = { ...assertBrowserPreCommittedArtifacts(git),
  ...Object.fromEntries(BROWSER_PRE_VERIFICATION_CHECKS.map((k) => [k, true])), approvedHead: git(["rev-parse", "HEAD"]).toString().trim() };
const bin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const port = await new Promise((done, reject) => { const s = createServer(); s.on("error", reject);
  s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => done(p)); }); });
const base = resolve(mkdtempSync(join(tmpdir(), "reflab-browser-ddl-pg17-"))), data = join(base, "data");
let started = false, warnings = 0, rollbacks = 0, connectionCount = 0;
const connection = (user = "postgres") => ({ PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: "postgres", PGUSER: user, PGSSLMODE: "disable" });
function command(name, args, input, user = "supabase_admin") {
  const r = spawnSync(exe(name), args, { env: buildPsqlEnvironment(process.env, connection(user)), input, encoding: "utf8",
    windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...(name === "pg_ctl" ? { stdio: "ignore" } : {}) });
  if (r.error || r.status !== 0) throw new Error(`LOCAL_PG17_${name.toUpperCase()}_FAILED: ${String(r.stderr ?? r.error?.code ?? "").slice(0, 1200)}`);
  warnings += (String(r.stderr ?? "").match(/WARNING:/g) ?? []).length; return r.stdout;
}
const sql = (s, user = "postgres") => command("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "-At"], s, user);
const observe = () => observeBrowserTransitionResults(parseJsonResults(sql(buildBrowserTransitionBatch())));
function newSession() { connectionCount++; return createCorePolicyPsqlSession(connection(), process.env, { binary: exe("psql") }); }
let report;
try {
  assert.match(command("postgres", ["--version"]), /PostgreSQL\) 17\./);
  command("initdb", ["-D", data, "-U", "supabase_admin", "-A", "trust", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", join(base, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]); started = true;
  sql(buildBrowserLineageFixture(), "supabase_admin");
  const before = observe(), proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: before.historicalState };
  assert.equal(before["64236State"].comparison, "EXACT"); assert.equal(before["64245PostState"].comparison, "EXACT");
  const classify = (o, v) => classifyLocalBrowserDdlEvidence(o, v, proof);
  const mutationStatements = [...body.matchAll(/^\s*(?:revoke|grant) [^\n]*;/gm)];
  assert.equal(mutationStatements.length, 21);
  const failures = [
    ["beforeMutation", -1], ["afterFirstRevoke", 0], ["midAnon", 2], ["midAuthenticated", 12],
    ["afterProfileTableRevoke", 6], ["duringProfileColumnGrants", 19], ["afterRefereeSelectGrant", 18],
    ["afterMigrationBeforePost", "afterBody"], ["postClassifierFailure", "classifier"],
    ["serviceRoleMutation", "revoke select on public.match_preparations from service_role;"],
    ["policyMutation", "alter policy match_preparations_own_read on public.match_preparations using (false);"],
    ["historicalMutation", "update public.attempts set id=id||'_local_failure';"],
    ["64245Drift", "alter policy attempts_own_read on public.attempts using (false);"],
    ["runtimeDrift", "runtimeDisabled"], ["cutoverDrift", "cutoverAbsent"], ["phase4Drift", "phase4Absent"],
    ["statementTimeout", "statementTimeout"], ["beforeCommit", "beforeCommit"], ["connectionLossBeforeCommit", "connectionLossBeforeCommit"],
  ];
  for (const [name, fault] of failures) {
    const session = newSession(); let bodyPassed = false;
    const wrapped = { async query(s) {
      if (s === body) {
        if (typeof fault === "number") {
          const position = fault < 0 ? mutationStatements[0].index : mutationStatements[fault].index + mutationStatements[fault][0].length;
          return session.query(body.slice(0, position) + "\nraise exception 'LOCAL_FORCED_ROLLBACK' using errcode='P0001';\n" + body.slice(position));
        }
        if (fault === "statementTimeout") return session.query("set local statement_timeout='20ms'; select pg_sleep(1);");
        const result = await session.query(s); bodyPassed = true;
        if (fault === "afterBody") await session.query("select 1/0;");
        else if (typeof fault === "string" && /;$/.test(fault)) await session.query(fault);
        return result;
      }
      return session.query(s);
    }, rollback: () => session.rollback(), close: () => session.close() };
    const result = await executeBrowserDdlAtomic(wrapped, bytes, verification, { classify: (o, v) => {
      if (bodyPassed && fault === "classifier") return { classification: "BLOCKER", executablePre: false, failedChecks: ["localPostAssertion"], unknownChecks: [] };
      if (bodyPassed && ["runtimeDisabled", "cutoverAbsent", "phase4Absent"].includes(fault)) o.adoptionState[fault] = false;
      return classify(o, v);
    }, ...(fault === "beforeCommit" ? { beforeCommit: () => { throw new Error("LOCAL_BEFORE_COMMIT_FAILURE"); } }
      : fault === "connectionLossBeforeCommit" ? { beforeCommit: async () => { await session.close(); throw new Error("LOCAL_CONNECTION_LOSS_BEFORE_COMMIT"); } } : {}) });
    assert.equal(result.transaction, "ROLLBACK", name); assert.equal(result.commitOutcome, "NOT_COMMITTED", name);
    assert.equal(result.automaticRetryAuthorized, false); assert.deepEqual(observe(), before, name); rollbacks++;
  }
  // An incompatible lock held by a different persistent connection must time out, with no retry.
  const blocker = newSession();
  try {
    await blocker.query("begin; lock table public.user_profiles in access exclusive mode;");
    const result = await executeBrowserDdlAtomic(newSession(), bytes, verification, { classify });
    assert.equal(result.transaction, "ROLLBACK"); assert.equal(result.sqlstate, "55P03"); assert.equal(result.migrationInvocationCount, 0);
  } finally { await blocker.rollback(); await blocker.close(); }
  assert.deepEqual(observe(), before); rollbacks++;

  // A lost acknowledgement is ambiguous even when the local server actually committed.
  const ambiguousSession = newSession();
  const ambiguous = await executeBrowserDdlAtomic({ async query(s) {
    const value = await ambiguousSession.query(s);
    if (s === "commit;") { await ambiguousSession.close(); throw new Error("LOCAL_LOST_COMMIT_ACK"); }
    return value;
  }, rollback: () => ambiguousSession.rollback(), close: () => ambiguousSession.close() }, bytes, verification, { classify });
  assert.equal(ambiguous.commitOutcome, "UNKNOWN"); assert.equal(ambiguous.readOnlyForensicRequired, true);
  assert.equal(ambiguous.automaticRetryAuthorized, false); assert.equal(ambiguous.onlyAllowedNextAction, "READ_ONLY_POST_FORENSIC");
  const ambiguousPost = observe();
  assert.equal(ambiguousPost.tableAcls.length, 242);
  // Restore only the disposable fixture via its observed PRE ACLs, outside runner execution.
  const browserColumns = ambiguousPost.columnAcls.filter((a) => a.grantee === "authenticated");
  for (const p of ["INSERT", "UPDATE"]) sql(`revoke ${p} (${browserColumns.filter((a) => a.privilege === p).map((a) => a.column).join(",")}) on public.user_profiles from authenticated;`);
  sql("revoke select on public.referee_exam_sessions from authenticated;");
  sql(before.tableAcls.filter((a) => ["anon", "authenticated"].includes(a.grantee))
    .map((a) => `grant ${a.privilege} on public.${a.table} to ${a.grantee};`).join("\n"));
  const restored = observe();
  const normalized = (o) => ({ ...o, columns: o.columns.map(({ raw_acl: _acl, ...c }) => { void _acl; return c; }),
    tables: o.tables.map(({ raw_acl: _acl, ...t }) => { void _acl; return t; }) });
  assert.deepEqual(normalized(restored), normalized(before));
  const count = connectionCount, result = await executeBrowserDdlAtomic(newSession(), bytes, verification, { classify });
  assert.equal(connectionCount - count, 1); assert.equal(result.transaction, "COMMIT"); assert.equal(result.commitOutcome, "ACKNOWLEDGED");
  assert.equal(result.preClassification, "64249_PRE_EXECUTABLE_EXACT"); assert.equal(result.postClassification, "64249_ALREADY_INSTALLED_POST");
  assert.equal(result.migrationInvocationCount, 1); assert.equal(result.migrationResult, "PASS");
  const post = observe(), second = await executeBrowserDdlAtomic(newSession(), bytes, verification, { classify });
  assert.equal(second.migrationInvocationCount, 0); assert.equal(second.reexecutionRefused, true);
  assert.equal(second.preClassification, "64249_ALREADY_INSTALLED_POST"); assert.deepEqual(observe(), post);
  assert.equal(post.policies.length, 55); assert.equal(post.columnAcls.length, 89); assert.equal(post.tableAcls.length, 242);
  assert.equal(post.effectiveBrowserPrivileges.filter((r) => r.role === "anon" && r.granted).length, 0);
  assert.equal(post.columnAcls.filter((a) => a.grantee === "authenticated" && a.privilege === "INSERT").length, 20);
  assert.equal(post.columnAcls.filter((a) => a.grantee === "authenticated" && a.privilege === "UPDATE").length, 19);
  assert.match(sql("begin; set local role authenticated; select count(*) from public.referee_exam_sessions; rollback;"), /\n0\r?\n/);
  assert.equal(warnings, 0);
  report = { format: "LOCAL_64249_ONE_SHOT_DDL_PG17_REHEARSAL", result: "PASS", fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY",
    pre: result.preClassification, post: result.postClassification, migration: result.migrationResult, transaction: result.transaction,
    migrationInvocationCount: result.migrationInvocationCount, secondInvocationCount: second.migrationInvocationCount, reexecution: "REFUSED",
    mutationAccounting: result.mutationAccounting, rollbackCases: rollbacks, failureCases: failures.map(([name]) => name).concat("lockTimeout"),
    commitOutcomeCases: 3, ambiguousCommit: "UNKNOWN_READ_ONLY_FORENSIC_REQUIRED_NO_RETRY",
    tables: 13, policies: 55, tableAcls: 242, columnAcls: 89, effectiveBrowserResults: 208, warnings };
} finally {
  if (started || existsSync(join(data, "postmaster.pid"))) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  if (existsSync(join(data, "postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if (!base.startsWith(resolve(tmpdir()) + sep) || !base.split(sep).at(-1).startsWith("reflab-browser-ddl-pg17-")) throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  rmSync(base, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, residualClusters: 0, residualProcesses: 0 }));
