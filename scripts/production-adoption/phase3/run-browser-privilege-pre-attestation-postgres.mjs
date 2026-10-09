import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { buildBrowserLineageFixture } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { buildBrowserTransitionBatch, observeBrowserTransitionResults } from "./phase3-browser-privilege-contract.mjs";
import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES, ANON_PRE_TABLES, PROFILE_INSERT_COLUMNS, PROFILE_UPDATE_COLUMNS, browserPostPrivileges } from "./phase3-browser-privilege-matrix.mjs";
import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { classifyLocalBrowserPreAttestation } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { assertBrowserPreCommittedArtifacts } from "./run-production-browser-privilege-pre-attestation.mjs";
import { executeBrowserForensicReadOnly } from "./run-production-browser-privilege-baseline-forensic.mjs";

const root = resolve(import.meta.dirname, "../../..");
const git = (args) => execFileSync("git", ["-c", `safe.directory=${root}`, ...args], { cwd: root, encoding: "utf8", windowsHide: true });
const verification = { ...assertBrowserPreCommittedArtifacts(git), approvedHead: git(["rev-parse", "HEAD"]).trim(), approvedHeadExact: true, targetExact: true };
const bin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const port = await new Promise((done, reject) => { const server = createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const p = server.address().port; server.close(() => done(p)); }); });
const base = resolve(mkdtempSync(join(tmpdir(), "reflab-browser-pre-pg17-"))), data = join(base, "data");
let started = false, warnings = 0, observations = 0;
const connection = (user) => ({ PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: "postgres", PGUSER: user, PGSSLMODE: "disable" });
function command(name, args, input, user = "supabase_admin") {
  const r = spawnSync(exe(name), args, { env: buildPsqlEnvironment(process.env, connection(user)), input, encoding: "utf8",
    windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...(name === "pg_ctl" ? { stdio: "ignore" } : {}) });
  if (r.error || r.status !== 0) throw new Error(`LOCAL_PG17_${name.toUpperCase()}_FAILED: ${String(r.stderr ?? r.error?.code ?? "").slice(0, 1200)}`);
  warnings += (String(r.stderr ?? "").match(/WARNING:/g) ?? []).length; return r.stdout;
}
const sql = (s, user = "postgres") => command("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "-At"], s, user);
function observe() {
  const results = executeBrowserForensicReadOnly(buildBrowserTransitionBatch(), connection("postgres"), { processEnvironment: process.env,
    spawn: (program, args, options) => {
      assert.equal(program, "psql"); assert.equal(options.env.PGHOST, "127.0.0.1");
      assert.match(options.input, /^begin read only;/); assert.match(options.input, /rollback;\s*$/); assert.doesNotMatch(options.input, /^\s*commit\b/im);
      const r = spawnSync(exe(program), args, options); warnings += (String(r.stderr ?? "").match(/WARNING:/g) ?? []).length; return r;
    } });
  observations++; return observeBrowserTransitionResults(results);
}
let report;
try {
  assert.match(command("postgres", ["--version"]), /PostgreSQL\) 17\./);
  command("initdb", ["-D", data, "-U", "supabase_admin", "-A", "trust", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", join(base, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]); started = true;
  sql(buildBrowserLineageFixture(), "supabase_admin");
  const before = observe(), proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: before.historicalState };
  const attest = (o = observe()) => classifyLocalBrowserPreAttestation(o, verification, proof);
  const outcomes = {};
  outcomes.exactPre = attest(before).classification; assert.equal(outcomes.exactPre, "64249_PRE_EXECUTABLE_EXACT");
  // Fixture-only changes exercise the collector. No migration is loaded or executed here.
  sql("revoke insert on public.attempts from authenticated;");
  outcomes.partialTransition = attest().classification; assert.equal(outcomes.partialTransition, "BLOCKER");
  sql("grant insert on public.attempts to authenticated;");
  const training = baseline.policies.find((p) => p.name === "training_attempt_profile_read");
  sql(`alter policy training_attempt_profile_read on public.user_profiles using (${training.using.replace("training_user_id", "training_user_id ")});`);
  outcomes.literalMutation = attest().classification; assert.equal(outcomes.literalMutation, "BLOCKER");
  sql(`alter policy training_attempt_profile_read on public.user_profiles using (${training.using});`);
  sql("revoke maintain on public.match_preparations from authenticated;");
  outcomes.maintainDrift = attest().classification; assert.equal(outcomes.maintainDrift, "BLOCKER");
  sql("grant maintain on public.match_preparations to authenticated;");
  sql("create policy local_unexpected_browser_read on public.referee_exam_sessions for select to authenticated using (true);");
  outcomes.refereePolicyDrift = attest().classification; assert.equal(outcomes.refereePolicyDrift, "BLOCKER");
  sql("drop policy local_unexpected_browser_read on public.referee_exam_sessions;");
  assert.deepEqual(observe(), before);
  const postFixture = [];
  for (const table of ANON_PRE_TABLES) postFixture.push(`revoke ${PG17_TABLE_PRIVILEGES.join(",")} on public.${table} from anon;`);
  for (const table of BROWSER_TABLES.filter((t) => t !== "referee_exam_sessions"))
    postFixture.push(`revoke ${PG17_TABLE_PRIVILEGES.filter((p) => !browserPostPrivileges(table, "authenticated").includes(p)).join(",")} on public.${table} from authenticated;`);
  postFixture.push("grant select on public.referee_exam_sessions to authenticated;",
    `grant insert(${PROFILE_INSERT_COLUMNS.join(",")}),update(${PROFILE_UPDATE_COLUMNS.join(",")}) on public.user_profiles to authenticated;`);
  sql(postFixture.join("\n"));
  const after = observe(), post = attest(after); outcomes.exactPost = post.classification;
  assert.equal(outcomes.exactPost, "64249_ALREADY_INSTALLED_POST"); assert.equal(post.executablePre, false);
  assert.equal(post.reexecutionRefused, true); assert.equal(post.migrationInvocationCount, 0); assert.equal(post.mutationCount, 0);
  assert.deepEqual(observe(), after); assert.equal(warnings, 0);
  report = { format: "LOCAL_64249_READ_ONLY_PRE_PG17_REHEARSAL", result: "PASS", cases: Object.keys(outcomes).length, outcomes,
    fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", observations, transactionReadOnly: true, transaction: "ROLLBACK",
    migrationsExecuted: 0, migrationInvocationCount: 0, mutationCount: 0, collectorMutations: 0,
    fixtureSetupMutations: "LOCAL_ONLY_OUTSIDE_ATTESTATION", tables: after.tables.length, effectiveBrowserResults: after.effectiveBrowserPrivileges.length, warnings };
} finally {
  if (started || existsSync(join(data, "postmaster.pid"))) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  if (existsSync(join(data, "postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if (!base.startsWith(resolve(tmpdir()) + sep) || !base.split(sep).at(-1).startsWith("reflab-browser-pre-pg17-")) throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  rmSync(base, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, residualClusters: 0, residualProcesses: 0 }));
