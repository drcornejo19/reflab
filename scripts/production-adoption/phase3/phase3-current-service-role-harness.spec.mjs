import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRE_FORMAT, PRE_OPERATION, PRE_VARIABLES, PRE_RUNNER, DDL_RUNNER, HARNESS_ROOT, CURRENT_ARTIFACTS, CURRENT_SERVICE_SHA,
  PRE_BEGIN, hashBytes, buildCurrentHarnessObservation, classifyCurrentHarnessEvidence, verifyCurrentHarnessArtifacts,
  resolveCurrentHarnessTarget, serializeCurrentHarness } from "./phase3-current-service-role-pre-contract.mjs";
import { DDL_FORMAT, DDL_OPERATION, DDL_VARIABLES, DDL_BEGIN, extractCurrentServiceDdlBody } from "./phase3-current-service-role-ddl-contract.mjs";
import { attestCurrentServiceReadOnly, runProductionCurrentServicePre, runCurrentServicePreCli } from "./run-production-current-service-role-pre.mjs";
import { executeCurrentServiceAtomic, runProductionCurrentServiceReconciliation, runCurrentServiceDdlCli } from "./run-production-current-service-role-reconciliation.mjs";
import { CURRENT_SERVICE_MIGRATION_PATH, PRESERVATION_QUERY_ID } from "./phase3-current-service-role-contract.mjs";
import { currentServiceFixtureEvidence } from "./phase3-current-service-role-fixture.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { assertReadOnlySql, maskSqlCommentsAndStrings } from "../../production-preflight/sql-safety.mjs";

const head = "b".repeat(40), password = 'a b"c\\d%:@/?&=single\'quote';
const url = `postgresql://postgres.nagjddldrldwavmfaytc:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const checkout = (path) => readFileSync(resolve(HARNESS_ROOT, path));
const committed = (path) => Buffer.from(checkout(path).toString().replaceAll("\r\n", "\n"));
const bytes = committed(CURRENT_SERVICE_MIGRATION_PATH);
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? "" : committed(args[1].slice(41));
const environment = (ddl) => ddl ? {[DDL_VARIABLES[0]]: "true", [DDL_VARIABLES[1]]: "true", [DDL_VARIABLES[2]]: "nagjddldrldwavmfaytc",
  [DDL_VARIABLES[3]]: head, [DDL_VARIABLES[4]]: url, [DDL_VARIABLES[5]]: CURRENT_SERVICE_SHA} : Object.fromEntries(PRE_VARIABLES.map((key, i) =>
  [key, i < 3 ? "true" : i === 3 ? "nagjddldrldwavmfaytc" : i === 4 ? head : url]));
const dependencies = (ddl, connector = () => {throw new Error("UNEXPECTED_CONNECTOR");}) => ({argument: ddl ? DDL_OPERATION : PRE_OPERATION, git,
  readCheckout: checkout, readRunnerBytes: () => committed(ddl ? DDL_RUNNER : PRE_RUNNER), createSession: connector});
const evidence = (post, readOnly = false) => {const e = currentServiceFixtureEvidence(post); e.set("read_only_guard", readOnly ? "on" : "off"); return e;};
function mockSession({post = false, queryFailure = null, commitFailure = false} = {}) {
  const calls = []; let installed = post, closed = 0, rollbacks = 0;
  return {calls, query: async (sql) => {calls.push(sql); if (queryFailure?.(sql)) throw new CorePolicySessionFailure("TIMEOUT");
    if (sql === "commit;" && commitFailure) throw new CorePolicySessionFailure("PSQL_SESSION_FAILED");
    if (sql === extractCurrentServiceDdlBody(bytes).body) installed = true;
    return "";}, rollback: async () => {rollbacks++;}, close: async () => {closed++;},
    observe: () => evidence(installed), get closed() {return closed;}, get rollbacks() {return rollbacks;}};
}

test("exact approved HEAD runner bytes and full import closure pass", () => {
  const r = verifyCurrentHarnessArtifacts(git, head, PRE_RUNNER, committed(PRE_RUNNER), checkout);
  assert.equal(r.runnerArtifactExact, true); assert.ok(Object.keys(r.artifactHashes).length > 30);
});
for (const ddl of [false, true]) {
  const label = ddl ? "DDL" : "PRE", run = ddl ? runProductionCurrentServiceReconciliation : runProductionCurrentServicePre;
  const variables = ddl ? DDL_VARIABLES : PRE_VARIABLES;
  const gateCases = {
    wrongOperation: (e, d) => {d.argument = "--other";},
    wrongHead: (e) => {e[variables[ddl ? 3 : 4]] = "c".repeat(40);},
    dirty: (e, d) => {d.git = (a) => a[0] === "status" ? " M local" : git(a);},
    staged: (e, d) => {d.git = (a) => a[0] === "status" ? "M  local" : git(a);},
    untracked: (e, d) => {d.git = (a) => a[0] === "status" ? "?? local" : git(a);},
    runnerDrift: (e, d) => {d.readRunnerBytes = () => Buffer.from("drift");},
    runnerCommittedDrift: (e, d) => {d.git = (a) => a[0] === "show" && a[1].endsWith(ddl ? DDL_RUNNER : PRE_RUNNER) ? Buffer.from("drift") : git(a);},
    foreignAuthorization: (e) => {e.ALLOW_PRODUCTION_CORE_POLICY_64245_DDL = "true";},
    oppositeAuthorization: (e) => {e[ddl ? "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT" : "ALLOW_PRODUCTION_DDL"] = "true";},
    wrongProject: (e) => {e[variables[ddl ? 2 : 3]] = "wrong";},
  };
  for (const [name, mutate] of Object.entries(gateCases)) test(`${label}: ${name} blocks before connector creation`, async () => {
    let calls = 0; const e = environment(ddl), d = dependencies(ddl, () => {calls++;}); mutate(e, d);
    await assert.rejects(run(e, d)); assert.equal(calls, 0);
  });
  for (const variable of variables.slice(0, ddl ? 2 : 3)) test(`${label}: missing ${variable} blocks before connection`, async () => {
    let calls = 0; const e = environment(ddl); delete e[variable];
    await assert.rejects(run(e, dependencies(ddl, () => {calls++;}))); assert.equal(calls, 0);
  });
  for (const variable of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE"])
    test(`${label}: inherited ${variable} blocks before connection`, async () => {
      let calls = 0; const e = {...environment(ddl), [variable]: "synthetic"};
      await assert.rejects(run(e, dependencies(ddl, () => {calls++;}))); assert.equal(calls, 0);
    });
  for (const path of Object.keys(CURRENT_ARTIFACTS)) test(`${label}: artifact drift ${path} blocks before connection`, async () => {
    let calls = 0; const d = dependencies(ddl, () => {calls++;}); d.git = (a) => a[0] === "show" && a[1].endsWith(path) ? Buffer.from("drift") : git(a);
    await assert.rejects(run(environment(ddl), d)); assert.equal(calls, 0);
  });
  for (const [name, change] of Object.entries({host: (u) => {u.hostname = "db.nagjddldrldwavmfaytc.supabase.co";},
    port: (u) => {u.port = "6543";}, database: (u) => {u.pathname = "/wrong";},
    installer: (u) => {u.username = "service_role";}, ssl: (u) => {u.searchParams.set("sslmode", "disable");}}))
    test(`${label}: wrong ${name} blocks before connector`, async () => {
      let calls = 0; const e = environment(ddl), u = new URL(url); change(u); e[variables[ddl ? 4 : 5]] = u.toString();
      await assert.rejects(run(e, dependencies(ddl, () => {calls++;}))); assert.equal(calls, 0);
    });
}
test("valid exact target", () => assert.equal(resolveCurrentHarnessTarget(environment(false), PRE_VARIABLES[3], PRE_VARIABLES[5]).projectRef, "nagjddldrldwavmfaytc"));
test("wrong explicit migration SHA blocks before DDL connector", async () => {
  let calls = 0; const e = environment(true); e[DDL_VARIABLES[5]] = "0".repeat(64);
  await assert.rejects(runProductionCurrentServiceReconciliation(e, dependencies(true, () => {calls++;}))); assert.equal(calls, 0);
});
test("observation contains no writes or transaction composition", () => {
  const sql = buildCurrentHarnessObservation(); assertReadOnlySql(sql);
  assert.doesNotMatch(maskSqlCommentsAndStrings(sql), /\b(begin|commit|rollback|grant|revoke|notify|create|insert|update|delete)\b/i);
});
test("PRE has exactly one read-only BEGIN and bounded LOCAL timeouts", () => {
  assert.equal((PRE_BEGIN.match(/begin read only/g) ?? []).length, 1);
  for (const timeout of ["lock_timeout='2s'", "statement_timeout='15s'", "idle_in_transaction_session_timeout='15s'"]) assert.ok(PRE_BEGIN.includes(timeout));
});
test("DDL bounded timeouts and deterministic table locks", () => {
  for (const timeout of ["lock_timeout='5s'", "statement_timeout='60s'", "transaction_timeout='180s'", "idle_in_transaction_session_timeout='15s'"]) assert.ok(DDL_BEGIN.includes(timeout));
});
test("migration body equals original minus ONLY structural outer BEGIN/COMMIT", () => {
  const r = extractCurrentServiceDdlBody(bytes); let source = bytes.toString();
  for (const span of [...r.removed].reverse()) source = source.slice(0, span.start) + source.slice(span.end);
  assert.equal(source, r.body); assert.equal(r.sqlRevokeStatements, 12); assert.equal(r.sqlGrantStatements, 2);
  assert.equal(hashBytes(bytes), CURRENT_SERVICE_SHA);
});
for (const suffix of ["\n", "\ncommit;", "\n\\! injected"]) test(`migration byte drift rejected: ${JSON.stringify(suffix)}`, () => {
  assert.throws(() => extractCurrentServiceDdlBody(Buffer.concat([bytes, Buffer.from(suffix)])));
});
for (const post of [false, true]) test(`PRE exact ${post ? "POST" : "PRE"} observation ends with rollback`, async () => {
  const s = mockSession(); const r = await attestCurrentServiceReadOnly(s, {observe: () => evidence(post, true)});
  assert.equal(r.classification, post ? "ALREADY_INSTALLED_POST" : "PRE_EXECUTABLE_EXACT");
  assert.equal(r.executablePre, !post); assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.approval, "NOT_PERFORMED");
  assert.equal(r.mutationCount, 0); assert.equal(r.migrationInvocationCount, 0); assert.equal(s.rollbacks, 1); assert.equal(s.closed, 1);
  assert.equal(s.calls.length, 1); assert.doesNotMatch(s.calls.join("\n"), /commit;/);
});
test("partial PRE fails closed", () => {
  const e = evidence(false, true); e.get(SERVICE_FORENSIC_QUERY_ID).effectiveTablePrivileges.find((r) => r.table === "attempts" && r.privilege === "MAINTAIN").granted = false;
  assert.equal(classifyCurrentHarnessEvidence(e, true).classification, "BLOCKER");
});
test("incomplete observation is UNKNOWN", () => assert.equal(classifyCurrentHarnessEvidence(new Map(), true).classification, "UNKNOWN"));
for (const readOnly of [false, true]) test(`wrong ${readOnly ? "read" : "write"} transaction guard fails`, () => {
  assert.equal(classifyCurrentHarnessEvidence(evidence(false, !readOnly), readOnly).classification, "BLOCKER");
});
test("PRE connection failure never claims exact state", async () => {
  const s = mockSession({queryFailure: () => true}); const r = await attestCurrentServiceReadOnly(s);
  assert.equal(r.classification, "UNKNOWN"); assert.equal(s.rollbacks, 1); assert.equal(s.closed, 1);
});
test("PRE rollback uncertainty forces UNKNOWN", async () => {
  const s = mockSession(); s.rollback = async () => {throw new Error("synthetic");};
  const r = await attestCurrentServiceReadOnly(s, {observe: () => evidence(false, true)}); assert.equal(r.classification, "UNKNOWN");
});
test("one-shot exact PRE/body/POST/acknowledged COMMIT", async () => {
  const s = mockSession(); const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe});
  assert.equal(r.classification, "COMMITTED_POST_EXACT"); assert.equal(r.preClassification, "PRE_EXECUTABLE_EXACT");
  assert.equal(r.postClassification, "ALREADY_INSTALLED_POST"); assert.equal(r.migrationInvocationCount, 1);
  assert.equal(s.calls.filter((sql) => sql === extractCurrentServiceDdlBody(bytes).body).length, 1);
  assert.equal(r.transaction, "COMMIT"); assert.equal(r.commitOutcome, "ACKNOWLEDGED"); assert.equal(s.rollbacks, 0);
  assert.equal(r.mutationAccounting.effectivePrivilegeEntryRevocations, 72); assert.equal(r.mutationAccounting.effectivePrivilegeEntryGrants, 2);
  assert.equal(r.automaticRetryAuthorized, false); assert.equal(s.closed, 1);
});
test("already-installed POST refuses second execution with zero SQL mutations", async () => {
  const s = mockSession({post: true}); const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe});
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.migrationResult, "NOT_INVOKED"); assert.equal(r.reexecution, "REFUSED");
  assert.equal(s.calls.length, 1); assert.equal(s.rollbacks, 1);
});
for (const kind of ["BLOCKER", "UNKNOWN"]) test(`nonexact live PRE ${kind} invokes migration zero times`, async () => {
  const s = mockSession(); const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe,
    classify: () => ({classification: kind, executablePre: false, failedChecks: kind === "BLOCKER" ? ["drift"] : [], unknownChecks: kind === "UNKNOWN" ? ["missing"] : []})});
  assert.equal(r.migrationInvocationCount, 0); assert.equal(s.rollbacks, 1); assert.equal(s.calls.length, 1);
});
for (const stage of ["BEFORE_PRE", "AFTER_PRE", "BEFORE_POST", "BEFORE_COMMIT"]) test(`failure ${stage} rolls back without commit`, async () => {
  const s = mockSession(); const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe,
    checkpoint: (name) => {if (name === stage) throw new CorePolicySessionFailure("TIMEOUT");}});
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.rollbacks, 1); assert.ok(!s.calls.includes("commit;"));
});
test("migration error rolls back", async () => {
  const s = mockSession({queryFailure: (sql) => sql === extractCurrentServiceDdlBody(bytes).body});
  const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe}); assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.rollbacks, 1);
});
for (const drift of ["policy", "function", "browser", "historical", "adoption", "runtime", "cutover", "additionalCatalog"])
  test(`protected POST ${drift} mismatch rolls back`, async () => {
    const s = mockSession(); let observed = 0;
    const r = await executeCurrentServiceAtomic(s, bytes, {observe: () => {const e = s.observe();
      if (++observed === 2) e.set(PRESERVATION_QUERY_ID, "f".repeat(32)); return e;}});
    assert.equal(r.transaction, "ROLLBACK"); assert.equal(s.rollbacks, 1); assert.ok(!s.calls.includes("commit;"));
  });
test("ambiguous COMMIT is UNKNOWN, no rollback claim, no automatic retry", async () => {
  const s = mockSession({commitFailure: true}); const r = await executeCurrentServiceAtomic(s, bytes, {observe: s.observe});
  assert.equal(r.classification, "UNKNOWN_COMMIT_OUTCOME"); assert.equal(r.transaction, "UNKNOWN"); assert.equal(r.automaticRetryAuthorized, false);
  assert.equal(r.onlyAllowedNextAction, "SEPARATE_READ_ONLY_POST_FORENSIC"); assert.equal(s.calls.filter((q) => q === "commit;").length, 1);
  assert.equal(s.rollbacks, 0); assert.equal(r.migrationInvocationCount, 1);
});
for (const secret of ['abc"def', "abc\\def", "abc%22def", "abc:def@ghi", "abc?x=1&y=2", 'a b"c\\d%', "a'b/@:?&= "]) {
  for (const ddl of [false, true]) test(`${ddl ? "DDL" : "PRE"} rejects credential-bearing structured output ${JSON.stringify(secret)}`, async () => {
    const e = environment(ddl), u = new URL(url); u.password = encodeURIComponent(secret); e[ddl ? DDL_VARIABLES[4] : PRE_VARIABLES[5]] = u.toString();
    let output = ""; const run = ddl ? runCurrentServiceDdlCli : runCurrentServicePreCli;
    const code = await run(e, {run: () => ddl ? ({format: DDL_FORMAT, classification: "BLOCKER", productionDdlAuthorized: false,
      automaticRetryAuthorized: false, detail: `driver ${secret} ${u}`}) : ({format: PRE_FORMAT, classification: "PRE_EXECUTABLE_EXACT",
      approval: "NOT_PERFORMED", mutationCount: 0, migrationInvocationCount: 0, productionDdlAuthorized: false, detail: `driver ${secret} ${u}`}),
      write: (s) => {output += s;}});
    assert.equal(code, 1); assert.ok(!output.includes(secret)); assert.ok(!output.includes(encodeURIComponent(secret)));
    assert.ok(!output.includes(JSON.stringify(secret).slice(1, -1))); assert.ok(!output.includes(u.toString()));
    assert.ok(!JSON.stringify(JSON.parse(output)).includes(secret));
  });
}
test("connection-string contamination is discarded before serialization", () => {
  assert.throws(() => serializeCurrentHarness({detail: "host=somewhere dbname=postgres password=synthetic"}, environment(false)));
});
test("no generic migration execution or enumeration reachable", () => {
  for (const path of [PRE_RUNNER, DDL_RUNNER]) assert.doesNotMatch(checkout(path).toString(), /supabase\s+(db push|migration up)|readdir|migrationManifest/);
});
for (const ddl of [false, true]) test(`${ddl ? "DDL" : "PRE"}: valid full preconnection gate initializes one session only`, async () => {
  let sessions = 0, installed = false, readOnly = false;
  const session = {query: async (sql) => {
    if (sql.startsWith("begin")) {readOnly = sql.startsWith("begin read only"); return "";}
    if (sql === extractCurrentServiceDdlBody(bytes).body) {installed = true; return "";}
    if (sql === "commit;") return "";
    return [...evidence(installed, readOnly)].map(([query, payload]) => `REFLAB_PREFLIGHT_V1\t${query}\t${Buffer.from(JSON.stringify({query, payload_row_count: 1, payload})).toString("base64")}`).join("\n");
  }, rollback: async () => {}, close: async () => {}};
  const r = await (ddl ? runProductionCurrentServiceReconciliation : runProductionCurrentServicePre)(environment(ddl),
    dependencies(ddl, () => {sessions++; return session;}));
  assert.equal(sessions, 1); assert.equal(r.runnerArtifactExact, true);
  assert.equal(r.classification, ddl ? "COMMITTED_POST_EXACT" : "PRE_EXECUTABLE_EXACT");
});
for (const ddl of [false, true]) test(`${ddl ? "DDL" : "PRE"}: safe credential-bearing exception output`, async () => {
  let output = "";
  const code = await (ddl ? runCurrentServiceDdlCli : runCurrentServicePreCli)(environment(ddl), {
    run: () => {throw new Error(`${password} ${url}`);}, write: (s) => {output += s;}});
  assert.equal(code, 1); assert.ok(!output.includes(password)); assert.ok(!output.includes(url));
});
for (const ddl of [false, true]) test(`${ddl ? "DDL" : "PRE"}: invalid success output contract fails closed`, async () => {
  let output = "";
  const code = await (ddl ? runCurrentServiceDdlCli : runCurrentServicePreCli)(environment(ddl), {
    run: () => ({classification: ddl ? "COMMITTED_POST_EXACT" : "PRE_EXECUTABLE_EXACT", commitOutcome: "ACKNOWLEDGED"}),
    write: (s) => {output += s;}});
  assert.equal(code, 1); assert.equal(JSON.parse(output).classification, "BLOCKER");
});
