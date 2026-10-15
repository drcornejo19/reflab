import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { leadFixture } from "./phase3-institutional-leads-insert-fixture.mjs";
import { QUERY_ID, PRIVILEGES, observationSql } from "./phase3-institutional-leads-insert-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { RESULT_FRAME_PREFIX } from "../../production-preflight/queries.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { FORMAT, OPERATION, RUNNER, VARIABLES, PROTECTED, MIGRATION, PRE, POST, TARGET, HARNESS_ROOT,
  EXPECTED_ACCOUNTING, verifyArtifacts, extractProvider, verifyAccounting, serialize } from "./phase3-institutional-leads-runner-contract.mjs";
import { executeLeadAtomic, runProductionLeadProvider, runLeadProviderCli } from "./run-production-institutional-leads-provider.mjs";

const head = "a".repeat(40), password = 'local test"\\credential%:@/?';
const url = `postgresql://postgres.nagjddldrldwavmfaytc:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const checkout = (p) => readFileSync(resolve(HARNESS_ROOT, p));
const committed = (p) => Buffer.from(checkout(p).toString().replaceAll("\r\n", "\n"));
const git = (a) => a[0] === "rev-parse" ? head : a[0] === "status" ? "" : committed(a[1].slice(41));
const env = () => Object.fromEntries(VARIABLES.map((key, i) => [key, i < 2 ? "true" : i === 2 ? TARGET.project : i === 3 ? head : url]));
const deps = (createSession = () => { throw Error("UNEXPECTED_CONNECTOR"); }) => ({ argument: OPERATION, git,
  readCheckout: checkout, readRunnerBytes: () => committed(RUNNER), createSession });
const bytes = committed(MIGRATION), extracted = extractProvider(bytes);
const evidence = (post = false) => { const e = leadFixture(post); e.set("read_only_guard", "off"); return e; };
const frame = (e) => [...e].map(([query, payload]) => `${RESULT_FRAME_PREFIX}\t${query}\t${Buffer.from(JSON.stringify({ query, payload_row_count: 1, payload })).toString("base64")}`).join("\n");
function session({ post = false, drift, fail, commitFailure = false } = {}) {
  let installed = post, rollbacks = 0, closed = 0; const calls = [];
  return { calls, query: async (sql) => {
    calls.push(sql); if (fail?.(sql)) throw new CorePolicySessionFailure("TIMEOUT");
    if (sql === extracted.body) installed = true;
    if (sql === "commit;" && commitFailure) throw new CorePolicySessionFailure("PSQL_SESSION_FAILED");
    if (sql !== observationSql()) return "";
    const e = evidence(installed); drift?.(e, installed); return frame(e);
  }, rollback: async () => { rollbacks++; installed = post; }, close: async () => { closed++; },
  get installed() { return installed; }, get rollbacks() { return rollbacks; }, get closed() { return closed; } };
}
const closure = Object.keys(verifyArtifacts(git, head, committed(RUNNER), checkout).artifactHashes);
test("dedicated command, operation and isolated provider only", () => {
  assert.equal(JSON.parse(checkout("package.json")).scripts["run:production-institutional-leads-provider"], `node ${RUNNER} ${OPERATION}`);
  assert(!MIGRATION.startsWith("supabase/migrations/"));
  const source = checkout(RUNNER).toString();
  assert.doesNotMatch(source, /supabase db push|readdir|vercel|sendInstitutionalLead|fetch\(|deploy/i);
  assert(closure.includes(MIGRATION)); assert(closure.includes("package.json")); assert(closure.length > 80);
});
test("package semantic delta is exactly one additive dedicated command", () => {
  const previous = JSON.parse(execFileSync("git", ["show", "28895b6c0d05a0ffc7c1bf905e8571a16a5c0ef4:package.json"], { cwd: HARNESS_ROOT, windowsHide: true }));
  const current = JSON.parse(checkout("package.json")); delete current.scripts["run:production-institutional-leads-provider"];
  assert.deepEqual(current, previous);
});
const gates = {
  operation: (e, d) => { d.argument = "--production-additional-runtime-browser-supplemental-forensic"; },
  head: (e) => { e.REFLAB_PRODUCTION_DDL_APPROVED_HEAD = "b".repeat(40); },
  dirty: (e, d) => { d.git = (a) => a[0] === "status" ? " M file" : git(a); },
  staged: (e, d) => { d.git = (a) => a[0] === "status" ? "M  file" : git(a); },
  untracked: (e, d) => { d.git = (a) => a[0] === "status" ? "?? file" : git(a); },
  runner: (e, d) => { d.readRunnerBytes = () => Buffer.from("drift"); },
  project: (e) => { e.REFLAB_PRODUCTION_DDL_PROJECT_REF = "wrong"; },
  conflictingDdl: (e) => { e.ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_DDL = "true"; },
  conflictingReadOnly: (e) => { e.ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT = "true"; },
  unrelatedSecret: (e) => { e.REFLAB_PRODUCTION_OTHER_DB_URL = url; },
  redaction: (e) => { e.REFLAB_PRODUCTION_DDL_DB_URL = url.replace(encodeURIComponent(password), "postgres"); },
};
for (const [name, change] of Object.entries(gates)) test(`preconnection ${name}: zero sessions`, async () => {
  let count = 0; const e = env(), d = deps(() => { count++; }); change(e, d);
  await assert.rejects(runProductionLeadProvider(e, d)); assert.equal(count, 0);
});
for (const variable of VARIABLES.slice(0, 2)) for (const value of [undefined, "false", "TRUE", "1"])
  test(`exact opt-in ${variable}/${value}: zero sessions`, async () => {
    let count = 0; const e = env(); if (value === undefined) delete e[variable]; else e[variable] = value;
    await assert.rejects(runProductionLeadProvider(e, deps(() => { count++; }))); assert.equal(count, 0);
  });
for (const key of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE", "PGHOSTADDR", "pgpassword", "NODE_OPTIONS", "NODE_PATH", "NODE_TEST_NAME_PATTERN"])
  test(`inherited ${key}: zero sessions`, async () => {
    let count = 0; await assert.rejects(runProductionLeadProvider({ ...env(), [key]: "test" }, deps(() => { count++; }))); assert.equal(count, 0);
  });
for (const [name, change] of Object.entries({ direct: (u) => { u.hostname = "db.nagjddldrldwavmfaytc.supabase.co"; },
  pooler: (u) => { u.hostname = "aws-0-sa-east-1.pooler.supabase.com"; }, port: (u) => { u.port = "6543"; },
  database: (u) => { u.pathname = "/other"; }, installer: (u) => { u.username = "postgres"; },
  project: (u) => { u.username = "postgres.other"; }, ssl: (u) => { u.searchParams.set("sslmode", "disable"); },
  missingSsl: (u) => { u.search = ""; }, duplicateSsl: (u) => { u.searchParams.append("sslmode", "require"); },
  hostOverride: (u) => { u.searchParams.set("host", "evil.invalid"); } })) test(`target ${name}: zero sessions`, async () => {
  let count = 0; const e = env(), u = new URL(url); change(u); e.REFLAB_PRODUCTION_DDL_DB_URL = u.toString();
  await assert.rejects(runProductionLeadProvider(e, deps(() => { count++; }))); assert.equal(count, 0);
});
for (const path of closure) test(`checkout integrity ${path}: zero sessions`, async () => {
  let count = 0; const d = deps(() => { count++; }); d.readCheckout = (p) => p === path ? Buffer.from("drift") : checkout(p);
  await assert.rejects(runProductionLeadProvider(env(), d)); assert.equal(count, 0);
});
for (const path of Object.keys(PROTECTED)) test(`committed fixed SHA ${path}: zero sessions`, async () => {
  let count = 0; const d = deps(() => { count++; });
  d.git = (a) => a[0] === "show" && a[1].slice(41) === path ? Buffer.from("drift") : git(a);
  d.readCheckout = (p) => p === path ? Buffer.from("drift") : checkout(p);
  await assert.rejects(runProductionLeadProvider(env(), d)); assert.equal(count, 0);
});
test("one session exact PRE/provider/POST/COMMIT with no forwarded classifier bypass", async () => {
  const s = session(); let count = 0;
  const result = await runProductionLeadProvider(env(), { ...deps(() => { count++; return s; }), classify: () => { throw Error("UNEXPECTED_HOOK"); } });
  assert.equal(count, 1); assert.equal(result.classification, "COMMITTED_POST_EXACT");
  assert.equal(result.preClassification, PRE); assert.equal(result.postClassification, POST);
  assert.equal(result.commitOutcome, "ACKNOWLEDGED"); assert.equal(result.providerInvocationCount, 1);
  assert.deepEqual(result.mutationAccounting, EXPECTED_ACCOUNTING); assert.equal(s.closed, 1);
  assert.deepEqual(s.calls, [extracted.begin, observationSql(), extracted.body, observationSql(), "commit;"]);
});
test("installed POST rejected without another provider invocation", async () => {
  const s = session({ post: true }), r = await executeLeadAtomic(s, bytes);
  assert.equal(r.classification, "ALREADY_INSTALLED_REVIEW_REQUIRED"); assert.equal(r.reexecution, "REFUSED");
  assert.equal(r.providerInvocationCount, 0); assert.equal(r.providerResult, "NOT_INVOKED"); assert.equal(s.rollbacks, 1);
});
for (const post of [false, true]) {
  for (const privilege of PRIVILEGES) test(`${post ? "POST" : "PRE"} ${privilege} drift rolls back`, async () => {
    const s = session({ drift: (e, installed) => { if (installed !== post) return;
      const r = e.get(QUERY_ID).effectiveService.find((v) => v.privilege === privilege); r.granted = !r.granted; } });
    const r = await executeLeadAtomic(s, bytes); assert.equal(r.classification, "BLOCKER"); assert.equal(r.transaction, "ROLLBACK");
    assert.equal(r.providerInvocationCount, post ? 1 : 0); assert.equal(s.installed, false);
  });
  for (const role of ["PUBLIC", "anon", "authenticated"]) test(`${post ? "POST" : "PRE"} ${role} INSERT fails closed`, async () => {
    const s = session({ drift: (e, installed) => { if (installed === post) e.get(QUERY_ID).browser.find((v) => v.role === role && v.privilege === "INSERT").granted = true; } });
    assert.equal((await executeLeadAtomic(s, bytes)).transaction, "ROLLBACK"); assert.equal(s.installed, false);
  });
  for (const [key, value] of Object.entries({ owner: "other", force: true, rls: false, policies: [], columns: [], columnWriteSubstitutes: 1, serviceMemberships: 1, serviceBypass: false }))
    test(`${post ? "POST" : "PRE"} metadata ${key}`, async () => {
      const s = session({ drift: (e, installed) => { if (installed === post) e.get(QUERY_ID)[key] = value; } });
      assert.equal((await executeLeadAtomic(s, bytes)).classification, "BLOCKER"); assert.equal(s.installed, false);
    });
  for (const value of [{ grantor: "other" }, { grantable: true }]) test(`${post ? "POST" : "PRE"} raw origin ${JSON.stringify(value)}`, async () => {
    const s = session({ drift: (e, installed) => { if (installed === post) Object.assign(e.get(QUERY_ID).rawService[0], value); } });
    assert.equal((await executeLeadAtomic(s, bytes)).classification, "BLOCKER"); assert.equal(s.installed, false);
  });
}
for (const name of ["BEFORE_PRE", "AFTER_PRE", "AFTER_GRANT", "BEFORE_COMMIT"]) test(`forced ${name} rollback`, async () => {
  const s = session(), r = await executeLeadAtomic(s, bytes, { checkpoint: (stage) => { if (stage === name) throw new CorePolicySessionFailure("INJECTED_FAILURE"); } });
  assert.equal(r.classification, "BLOCKER"); assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.installed, false); assert.equal(s.closed, 1);
});
test("provider failure distinguished from POST failure", async () => {
  const r = await executeLeadAtomic(session({ fail: (sql) => sql === extracted.body }), bytes);
  assert.equal(r.failureCategory, "MUTATION"); assert.equal(r.providerResult, "FAIL"); assert.equal(r.transaction, "ROLLBACK");
});
for (const version of [160000, 180000, null, "170011"]) test(`observed PostgreSQL version ${version} rejected before provider`, async () => {
  const s = session({ drift: (e) => { e.get(SERVICE_FORENSIC_QUERY_ID).serverVersion = version; } });
  const r = await executeLeadAtomic(s, bytes); assert.equal(r.classification, "BLOCKER"); assert.equal(r.providerInvocationCount, 0);
});
for (const [field, value] of Object.entries({ caller: "service_role", session_user: "other", database: { name: "other" }, server_version_num: 180000 }))
  test(`observed installer ${field} rejected before provider`, async () => {
    const s = session({ drift: (e) => { e.get("production_installer_identity")[field] = value; } });
    const r = await executeLeadAtomic(s, bytes); assert.equal(r.classification, "BLOCKER"); assert.equal(r.providerInvocationCount, 0);
  });
test("superuser installer rejected before provider", async () => {
  const s = session({ drift: (e) => { e.get("production_installer_identity").installer.rolsuper = true; } });
  const r = await executeLeadAtomic(s, bytes); assert.equal(r.classification, "BLOCKER"); assert.equal(r.providerInvocationCount, 0);
});
test("missing observation prevents provider invocation", async () => {
  const s = session({ drift: (e) => { e.delete(QUERY_ID); } }), r = await executeLeadAtomic(s, bytes);
  assert.equal(r.classification, "BLOCKER"); assert.equal(r.preClassification, "UNKNOWN"); assert.equal(r.providerInvocationCount, 0);
});
test("unconfirmed rollback never claims a known zero persistent grant", async () => {
  const s = session(); s.rollback = async () => { throw Error("transport failure"); };
  const r = await executeLeadAtomic(s, bytes, { checkpoint: (stage) => { if (stage === "AFTER_GRANT") throw Error("forced"); } });
  assert.equal(r.transaction, "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED"); assert.equal(r.mutationAccounting.tableGrantChanges, "UNKNOWN");
  assert.equal(r.automaticRetryAuthorized, false); assert.equal(r.readOnlyForensicRequired, true); assert.equal(s.closed, 1);
});
test("ambiguous COMMIT never retries or claims rollback", async () => {
  const s = session({ commitFailure: true }), r = await executeLeadAtomic(s, bytes);
  assert.equal(r.classification, "UNKNOWN_COMMIT_OUTCOME"); assert.equal(r.commitOutcome, "AMBIGUOUS");
  assert.equal(r.automaticRetryAuthorized, false); assert.equal(r.readOnlyForensicRequired, true); assert.equal(s.rollbacks, 0);
  assert.equal(r.mutationAccounting.tableGrantChanges, "UNKNOWN"); assert.equal(s.calls.filter((v) => v === "commit;").length, 1);
});
test("malformed provider bytes cause zero SQL", async () => {
  const s = session(), r = await executeLeadAtomic(s, Buffer.from(bytes.toString() + "\n"));
  assert.equal(r.reason, "PROVIDER_SHA_MISMATCH"); assert.equal(s.calls.length, 0); assert.equal(s.closed, 1);
});
test("raw preservation and exactly one effective delta independently enforced", () => {
  assert.deepEqual(verifyAccounting(evidence(), evidence(true)), EXPECTED_ACCOUNTING);
  for (const change of [(e) => { e.get(QUERY_ID).protected = "f".repeat(32); },
    (e) => { e.get(SERVICE_FORENSIC_QUERY_ID).tableAcls.push({ privilege: "DELETE" }); },
    (e) => { e.get(SERVICE_FORENSIC_QUERY_ID).effectiveTablePrivileges[0].granted = !e.get(SERVICE_FORENSIC_QUERY_ID).effectiveTablePrivileges[0].granted; }]) {
    const after = evidence(true); change(after); assert.throws(() => verifyAccounting(evidence(), after));
  }
});
test("provider wrapper retains managed PG17 and bounded transaction settings", () => {
  for (const fragment of ["lock_timeout='5s'", "statement_timeout='60s'", "idle_in_transaction_session_timeout='15s'", "transaction_timeout='180s'", "access exclusive mode"])
    assert(extracted.begin.includes(fragment));
  assert(extracted.body.includes("server_version_num")); assert(extracted.body.includes("<> 17"));
  assert(extracted.body.includes("session_user <> 'postgres'")); assert(extracted.body.includes("rolsuper"));
  assert(!extracted.body.includes("commit;"));
});
for (const secret of [password, encodeURIComponent(password), url, JSON.stringify(password).slice(1, -1)])
  test(`credential redaction variant ${Buffer.from(secret).length}`, async () => {
    assert.throws(() => serialize({ detail: secret }, env()));
    let output = "";
    const code = await runLeadProviderCli(env(), { run: async () => { throw Error(secret); }, write: (v) => { output += v; } });
    assert.equal(code, 1); assert(!output.includes(secret)); assert(!output.includes(url));
  });
test("CLI permits success only for exact output contract and remains undeployed", async () => {
  const r = await executeLeadAtomic(session(), bytes); let output = "";
  assert.equal(await runLeadProviderCli(env(), { run: async () => r, write: (v) => { output = v; } }), 0);
  assert.equal(JSON.parse(output).scopeBoundary.callerDeploymentAuthorized, false);
  assert.equal(r.format, FORMAT);
  assert.equal(await runLeadProviderCli(env(), { run: async () => ({ ...r, mutationAccounting: {} }), write: () => {} }), 1);
});
test("credential-bearing structured success is rejected before serialization", async () => {
  const r = await executeLeadAtomic(session(), bytes); let output = "";
  assert.equal(await runLeadProviderCli(env(), { run: async () => ({ ...r, detail: url }), write: (v) => { output = v; } }), 1);
  assert(!output.includes(password)); assert(!output.includes(url));
  assert.equal(JSON.parse(output).classification, "BLOCKER");
});
