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
import { LeadExecutionSafety, executeLeadAtomic, runProductionLeadProvider, runLeadProviderCli } from "./run-production-institutional-leads-provider.mjs";

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
  assert.equal(JSON.parse(output).classification, "OUTPUT_FAILURE");
  assert.equal(JSON.parse(output).commitOutcome, "ACKNOWLEDGED");
});

// Independently decode the documented emergency wire format; never derive expectations from the encoder.
function decodeSafety(text) {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) return value;
  assert.equal(value.length, 13); assert.equal(value[0], 1);
  assert.equal(value[9], 0); assert.equal(value[10], 0); assert.equal(value[11], 0);
  return { executionStarted: value[1] === 1, mutationAttempted: value[2] === null ? null : value[2] === 1,
    providerInvocationCount: value[3],
    transaction: ["NOT_STARTED", "STARTED_STATE_OUTPUT_FAILURE", "ROLLBACK", "COMMIT", "UNKNOWN", "ROLLBACK_UNCONFIRMED_CONNECTION_CLOSE_REQUIRED"][value[4]],
    commitOutcome: ["NOT_COMMITTED", "ACKNOWLEDGED", "AMBIGUOUS", "UNKNOWN"][value[5]],
    rollbackOutcome: ["NOT_CONFIRMED", "CONFIRMED", "UNCONFIRMED"][value[6]],
    postAttestationOutcome: ["NOT_STARTED", "EXACT", "FAILED", "UNKNOWN"][value[7]],
    forensicReviewRequired: value[8] === 1, automaticRetryAuthorized: false,
    forensicExecutionAuthorized: false, providerExecutionAuthorized: false, commitAcknowledged: value[12] === 1 };
}
async function emitted(report, environment = env(), extra = {}) {
  let output = "";
  const code = await runLeadProviderCli(environment, { run: async () => report, ...extra, write: (text) => { output += text; } });
  return { code, output, result: output ? decodeSafety(output) : null };
}
function assertNoSecret(output, credential = password, environment = env()) {
  for (const secret of [credential, encodeURIComponent(credential), JSON.stringify(credential).slice(1, -1),
    Buffer.from(credential).toString("base64"), environment.REFLAB_PRODUCTION_DDL_DB_URL]) assert(!output.includes(secret));
  // Check the real detector, including escaped/encoded/recoverable variants, on every emergency representation.
  assert.doesNotThrow(() => serialize(JSON.parse(output), environment));
}

for (const [ambiguous, collision] of [[false, "COMMITTED_POST_EXACT"], [true, "UNKNOWN_COMMIT_OUTCOME"],
  [false, "ACKNOWLEDGED"], [true, "AMBIGUOUS"], [false, "COMMIT"], [true, "readOnlyForensicRequired"]]) {
  test(`independent post-execution credential collision ${collision}`, async () => {
    const environment = env(); environment.REFLAB_PRODUCTION_DDL_DB_URL = url.replace(encodeURIComponent(password), collision);
    let connections = 0; const s = session({ commitFailure: ambiguous });
    // Real local gates and real runner state machine; only the transport is nonconnecting synthetic evidence.
    const r = await runProductionLeadProvider(environment, deps(() => { connections++; return s; }));
    assert.equal(connections, 1); assert.equal(r.providerInvocationCount, 1);
    assert.equal(r.commitOutcome, ambiguous ? "AMBIGUOUS" : "ACKNOWLEDGED");
    const { code, result, output } = await emitted(r, environment);
    assert.equal(code, 1); assert.equal(result.executionStarted, true);
    assert.equal(result.providerInvocationCount, 1); assert.notEqual(result.transaction, "NOT_STARTED");
    assert.equal(result.commitOutcome, ambiguous ? "AMBIGUOUS" : "ACKNOWLEDGED");
    assert.equal(result.automaticRetryAuthorized, false);
    assert.equal(result.forensicExecutionAuthorized, false); assert.equal(result.providerExecutionAuthorized, false);
    if (ambiguous) assert.equal(result.forensicReviewRequired, true);
    assertNoSecret(output, collision, environment);
  });
}

test("authorization failure positively precedes any connection", async () => {
  let connections = 0, output;
  const environment = env(); delete environment.ALLOW_PRODUCTION_DDL;
  const code = await runLeadProviderCli(environment, { ...deps(() => { connections++; }), write: (v) => { output = v; } });
  const r = decodeSafety(output); assert.equal(code, 1); assert.equal(connections, 0);
  assert.equal(r.executionStarted, false); assert.equal(r.transaction, "NOT_STARTED"); assert.equal(r.providerInvocationCount, 0);
  assert.equal(r.automaticRetryAuthorized, false);
});
test("connection failure cannot be reset to a never-started operation", async () => {
  let output, connections = 0;
  const code = await runLeadProviderCli(env(), { ...deps(() => { connections++; throw Error(url); }), write: (v) => { output = v; } });
  const r = decodeSafety(output); assert.equal(code, 1); assert.equal(connections, 1);
  assert.equal(r.executionStarted, true); assert.notEqual(r.transaction, "NOT_STARTED");
  assert.equal(r.providerInvocationCount, 0); assert.equal(r.mutationAttempted, false); assertNoSecret(output);
});
test("unknown thrown execution cannot manufacture zero invocations or non-commit", async () => {
  const { result, code, output } = await emitted(undefined, env(), { run: async () => { throw Error(url); } });
  assert.equal(code, 1); assert.equal(result.executionStarted, true); assert.equal(result.providerInvocationCount, null);
  assert.equal(result.mutationAttempted, null); assert.equal(result.commitOutcome, "UNKNOWN");
  assert.equal(result.forensicReviewRequired, true); assert.equal(result.automaticRetryAuthorized, false); assertNoSecret(output);
});

const outputStates = {
  notStarted: () => executeLeadAtomic(session(), Buffer.from("wrong bytes")),
  preFailure: () => executeLeadAtomic(session(), bytes, { checkpoint: (stage) => { if (stage === "BEFORE_PRE") throw Error("forced"); } }),
  mutationFailure: () => executeLeadAtomic(session({ fail: (sql) => sql === extracted.body }), bytes),
  postFailure: () => executeLeadAtomic(session(), bytes, { checkpoint: (stage) => { if (stage === "AFTER_GRANT") throw Error("forced"); } }),
  rollbackUnconfirmed: () => {
    const s = session(); s.rollback = async () => { throw Error(url); };
    return executeLeadAtomic(s, bytes, { checkpoint: (stage) => { if (stage === "AFTER_GRANT") throw Error("forced"); } });
  },
  acknowledged: () => executeLeadAtomic(session(), bytes),
  ambiguous: () => executeLeadAtomic(session({ commitFailure: true }), bytes),
};
const outputFailures = {
  validation: (r) => { r.format = "INVALID"; },
  accounting: (r) => { r.scopeBoundary = {}; },
  rawCredential: (r) => { r.detail = password; },
  encodedCredential: (r) => { r.detail = encodeURIComponent(password); },
  escapedCredential: (r) => { r.detail = JSON.stringify(password).slice(1, -1); },
  credentialUrl: (r) => { r.detail = url; },
  circular: (r) => { r.detail = r; },
  bigint: (r) => { r.detail = 1n; },
  serializationException: (r) => { Object.defineProperty(r, "detail", { enumerable: true, get() { throw Error(url); } }); },
  formattingException: (r) => { r.toJSON = () => { throw Error(url); }; },
};
for (const [state, build] of Object.entries(outputStates)) for (const [failure, corrupt] of Object.entries(outputFailures)) {
  test(`monotonic output state ${state}/${failure}`, async () => {
    const report = await build(); const count = report.providerInvocationCount, commit = report.commitOutcome, transaction = report.transaction;
    const forensic = report.readOnlyForensicRequired === true;
    corrupt(report); const { result, code, output } = await emitted(report);
    assert.equal(code, 1); assert.equal(result.automaticRetryAuthorized, false); assertNoSecret(output);
    assert(result.providerInvocationCount >= count);
    if (transaction !== "NOT_STARTED") assert.notEqual(result.transaction, "NOT_STARTED");
    if (count) { assert.equal(result.mutationAttempted, true); assert(result.providerInvocationCount >= 1); }
    if (commit === "ACKNOWLEDGED") { assert.equal(result.commitOutcome, commit); assert.equal(result.commitAcknowledged, true); }
    if (commit === "AMBIGUOUS") assert.equal(result.commitOutcome, commit);
    if (forensic) assert.equal(result.forensicReviewRequired, true);
    if (transaction === "ROLLBACK") { assert.equal(result.transaction, transaction); assert.equal(result.rollbackOutcome, "CONFIRMED"); }
    if (transaction.includes("UNCONFIRMED")) { assert.equal(result.rollbackOutcome, "UNCONFIRMED"); assert.equal(result.commitOutcome, "UNKNOWN"); }
    if (state === "notStarted") assert.equal(result.transaction, "NOT_STARTED");
    if (["acknowledged", "ambiguous"].includes(state)) assert.equal(result.postAttestationOutcome, "EXACT");
    if (state === "postFailure") assert.equal(result.postAttestationOutcome, "FAILED");
  });
}
for (const state of ["acknowledged", "ambiguous", "postFailure"]) {
  test(`serializer itself throws after ${state}`, async () => {
    const report = await outputStates[state]();
    const { code, result, output } = await emitted(report, env(), { serialize: () => { throw Error(url); } });
    assert.equal(code, 1); assert.equal(result.providerInvocationCount, 1); assert.equal(result.automaticRetryAuthorized, false);
    assert.notEqual(result.transaction, "NOT_STARTED");
    if (state !== "postFailure") assert.equal(result.commitOutcome, report.commitOutcome);
    if (report.readOnlyForensicRequired) assert.equal(result.forensicReviewRequired, true);
    assertNoSecret(output);
  });
  for (const asynchronous of [false, true]) test(`output sink failure after ${state}/${asynchronous}`, async () => {
    const report = await outputStates[state](); let writes = 0;
    const code = await runLeadProviderCli(env(), { run: async () => ({ ...report, detail: url }), write: (text) => {
      writes++; const r = decodeSafety(text); assert.equal(r.providerInvocationCount, 1);
      assert.notEqual(r.transaction, "NOT_STARTED"); assert.equal(r.automaticRetryAuthorized, false);
      if (state !== "postFailure") assert.equal(r.commitOutcome, report.commitOutcome);
      if (report.readOnlyForensicRequired) assert.equal(r.forensicReviewRequired, true);
      assertNoSecret(text);
      if (asynchronous) return Promise.reject(Error(url));
      throw Error(url);
    } });
    assert.equal(code, 1); assert.equal(writes, 1);
  });
}
test("independent internal safety facts survive final serializer failure", async () => {
  let output; const s = session();
  // Exercise the real entrypoint with a nonconnecting transport, not an injected completed result.
  const d = deps(() => s);
  const code = await runLeadProviderCli(env(), { ...d, serialize: () => { throw Error(url); }, write: (text) => { output = text; } });
  const r = decodeSafety(output); assert.equal(code, 1); assert.equal(r.commitOutcome, "ACKNOWLEDGED");
  assert.equal(r.providerInvocationCount, 1); assert.equal(r.postAttestationOutcome, "EXACT"); assertNoSecret(output);
});
for (const ambiguous of [false, true]) test(`exception after execution returns no rich report/${ambiguous}`, async () => {
  let output;
  const code = await runLeadProviderCli(env(), { ...deps(() => session({ commitFailure: ambiguous })),
    run: async (environment, dependencies) => { await runProductionLeadProvider(environment, dependencies); throw Error(url); },
    write: (text) => { output = text; } });
  const r = decodeSafety(output); assert.equal(code, 1); assert.equal(r.executionStarted, true);
  assert.equal(r.providerInvocationCount, 1); assert.equal(r.commitOutcome, ambiguous ? "AMBIGUOUS" : "ACKNOWLEDGED");
  assert.equal(r.automaticRetryAuthorized, false);
  if (ambiguous) assert.equal(r.forensicReviewRequired, true);
  assertNoSecret(output);
});
test("append-only facts cannot be cleared by a later initial-looking report", () => {
  for (const commit of ["ACKNOWLEDGED", "AMBIGUOUS"]) {
    const safety = new LeadExecutionSafety();
    safety.capture({ providerInvocationCount: 1, transaction: "COMMIT", commitOutcome: commit, readOnlyForensicRequired: true });
    const before = safety.snapshot();
    safety.capture({ providerInvocationCount: 0, transaction: "NOT_STARTED", commitOutcome: "NOT_COMMITTED", readOnlyForensicRequired: false });
    assert.deepEqual(safety.snapshot(), before); assert.equal(Object.isFrozen(before), true);
  }
});
test("lost or conflicting commit data escalates uncertainty without erasing evidence", () => {
  const safety = new LeadExecutionSafety(); safety.mark("mutation");
  assert.equal(safety.snapshot().commitOutcome, "UNKNOWN"); assert.equal(safety.snapshot().providerInvocationCount, 1);
  safety.mark("commitAck"); safety.mark("commitAmbiguous");
  assert.equal(safety.snapshot().commitOutcome, "UNKNOWN"); assert.equal(safety.snapshot().commitAcknowledged, true);
  assert.equal(safety.snapshot().forensicReviewRequired, true); assert.equal(safety.snapshot().automaticRetryAuthorized, false);
});
test("unreadable safety getters are never invoked and fail conservatively", async () => {
  let accessed = 0;
  const report = { format: "INVALID", get transaction() { accessed++; throw Error(url); } };
  const { result } = await emitted(report); assert.equal(accessed, 0);
  assert.equal(result.executionStarted, true); assert.equal(result.providerInvocationCount, null);
  assert.equal(result.commitOutcome, "UNKNOWN"); assert.equal(result.forensicReviewRequired, true);
  const acknowledged = await outputStates.acknowledged(); acknowledged.readOnlyForensicRequired = true;
  acknowledged.postFailedChecks = new Proxy([], { get() { throw Error(url); } });
  const failedCapture = await emitted(acknowledged);
  assert.equal(failedCapture.result.commitOutcome, "ACKNOWLEDGED");
  assert.equal(failedCapture.result.providerInvocationCount, 1);
  assert.equal(failedCapture.result.forensicReviewRequired, true); assertNoSecret(failedCapture.output);
});
test("even numeric emergency output must pass unchanged secret detection", async () => {
  const environment = env(); environment.REFLAB_PRODUCTION_DDL_DB_URL = url.replace(encodeURIComponent(password), "1");
  const report = await outputStates.acknowledged(); report.detail = "1";
  const { output, code } = await emitted(report, environment);
  assert.equal(code, 1); assert.equal(output, "");
  assert.equal(report.commitOutcome, "ACKNOWLEDGED"); assert.equal(report.providerInvocationCount, 1);
});
test("initial constructor exists only before atomic execution", () => {
  const source = checkout(RUNNER).toString();
  assert.equal((source.match(/initial\(\)/g) ?? []).length, 1);
  assert(source.indexOf("const report = initial()") < source.indexOf('safety.mark("begin")'));
  assert.doesNotMatch(source.slice(source.indexOf("export async function runLeadProviderCli")), /initial\(/);
});
