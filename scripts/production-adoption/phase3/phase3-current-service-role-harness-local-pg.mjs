import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { createCorePolicyPsqlSession } from "./phase3-core-policy-psql-session.mjs";
import { executeBrowserForensicReadOnly } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { buildCurrentServiceFixture } from "./phase3-current-service-role-fixture.mjs";
import { buildCurrentServiceBatch, classifyCurrentServiceTransition, classifyLocalCurrentServiceTransition,
  CURRENT_SERVICE_MIGRATION_PATH } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";

export async function withCurrentServiceLocalPg(action) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(PG|ALLOW_PRODUCTION_|REFLAB_PRODUCTION_|NODE_OPTIONS$|NODE_TEST|POSTGRES_BIN$)/i.test(key)));
  assert.equal(Object.keys(environment).some((key) => /^(PG|ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(key)), false);
  const bin = "C:/Program Files/PostgreSQL/17/bin";
  const exe = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
  const port = await new Promise((done, reject) => {const server = createServer(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {const value = server.address().port; server.close(() => done(value));});});
  const base = resolve(mkdtempSync(join(tmpdir(), "reflab-current-harness-pg17-"))), data = join(base, "data");
  const connection = (database = "postgres", user = "postgres") => ({PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: database,
    PGUSER: user, PGSSLMODE: "disable"});
  let started = false, pid, warnings = 0, report;
  const sessions = new Set();
  function command(name, args, input, database = "postgres", user = "supabase_admin") {
    const result = spawnSync(exe(name), args, {env: buildPsqlEnvironment(environment, connection(database, user)), input,
      encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024,
      ...(name === "pg_ctl" ? {stdio: "ignore"} : {})});
    warnings += (String(result.stderr ?? "").match(/WARNING:/g) ?? []).length;
    if (result.error || result.status !== 0) throw new Error(`LOCAL_DISPOSABLE_${name}_FAILED: ${String(result.stderr ?? "").slice(0, 1500)}`);
    return result.stdout;
  }
  const sql = (input, database = "postgres", user = "postgres") => command("psql", ["-X", "--no-psqlrc", "-At", "--set", "ON_ERROR_STOP=1"], input, database, user);
  const collect = (database = "postgres") => executeBrowserForensicReadOnly(buildCurrentServiceBatch(), connection(database),
    {processEnvironment: environment, spawn: (name, args, options) => {
      assert.equal(options.env.PGHOST, "127.0.0.1"); assert.equal(options.env.PGSSLMODE, "disable");
      const result = spawnSync(exe(name), args, options); warnings += (String(result.stderr ?? "").match(/WARNING:/g) ?? []).length; return result;
    }});
  const createSession = (database = "postgres") => {
    const session = createCorePolicyPsqlSession(connection(database), environment, {binary: exe("psql")});
    sessions.add(session); return session;
  };
  try {
    assert.match(command("postgres", ["--version"]), /PostgreSQL\) 17\./);
    command("initdb", ["-D", data, "-U", "supabase_admin", "-A", "trust", "--no-locale"]);
    command("pg_ctl", ["-D", data, "-l", join(base, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]); started = true;
    pid = Number(readFileSync(join(data, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
    sql(buildCurrentServiceFixture(), "postgres", "supabase_admin");
    const before = collect(), inventory = before.get(SERVICE_FORENSIC_QUERY_ID);
    const proof = {fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, {targetExact: true}).historicalState,
      functionHashes: Object.fromEntries(inventory.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature, f.sourceHash]))};
    const classify = (e) => classifyLocalCurrentServiceTransition(e, proof);
    assert.equal(classify(before).classification, "PRE_EXECUTABLE_EXACT");
    assert.equal(classifyCurrentServiceTransition(before).classification, "BLOCKER");
    const bytes = readFileSync(new URL("../../../" + CURRENT_SERVICE_MIGRATION_PATH, import.meta.url));
    report = await action({sql, collect, createSession, classify, before, bytes});
    assert.equal(warnings, 0);
  } finally {
    for (const session of sessions) await session.close();
    if (started || existsSync(join(data, "postmaster.pid"))) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    if (existsSync(join(data, "postmaster.pid"))) throw new Error("LOCAL_RESIDUAL_CLUSTER");
    if (pid) {let alive = false; try {process.kill(pid, 0); alive = true;} catch { /* Confirm stopped. */ }
      if (alive) throw new Error("LOCAL_RESIDUAL_PROCESS");}
    if (!base.startsWith(resolve(tmpdir()) + sep) || !base.split(sep).at(-1).startsWith("reflab-current-harness-pg17-")) throw new Error("CLEANUP_PATH_REJECTED");
    rmSync(base, {recursive: true, force: true});
  }
  return {...report, evidence: "SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH", environmentIsolated: true,
    productionDdlAuthorized: false, warnings, residualClusters: 0, residualProcesses: 0};
}
