import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RESULT_FRAME_PREFIX } from "../../production-preflight/queries.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { browserLineageObservation } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { browserForensicFixtureEvidence } from "./phase3-browser-privilege-forensic-fixture.mjs";
import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { BROWSER_MIGRATION_PATH, buildBrowserTransitionBatch } from "./phase3-browser-privilege-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { BROWSER_PRE_VERIFICATION_CHECKS } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";
import { BROWSER_DDL_BEGIN, BROWSER_DDL_ZERO, extractBrowserDdlBody, validateBrowserDdlEnvelope, assertBrowserDdlBody,
  buildBrowserDdlObservation, observeBrowserDdlEvidence, classifyBrowserDdlEvidence } from "./phase3-browser-privilege-ddl-contract.mjs";
import { BROWSER_DDL_VARIABLES, BROWSER_DDL_OPERATION, BROWSER_DDL_ARTIFACTS, authorizeBrowserDdl,
  assertBrowserDdlArtifacts, executeBrowserDdlAtomic, runProductionBrowserPrivilege64249, runBrowserDdlCli, serializeBrowserDdl } from "./run-production-browser-privilege-64249.mjs";

const root = new URL("../../../", import.meta.url);
const bytes = Buffer.from(readFileSync(new URL(BROWSER_MIGRATION_PATH, root), "utf8").replaceAll("\r\n", "\n"));
const body = extractBrowserDdlBody(bytes).body, observationSql = buildBrowserDdlObservation();
const head = "476047b4f40add18bd3e5fcddcd83b941309cb28";
const verification = { ...Object.fromEntries(BROWSER_PRE_VERIFICATION_CHECKS.map((k) => [k, true])), approvedHead: head };
function evidence(post = false) {
  const e = browserForensicFixtureEvidence(), o = browserLineageObservation(post);
  e.set("read_only_guard", "off");
  const tables = o.tables.map((t) => ({ ...t, raw_acl: [], acl_origin: "EXPLICIT_ACL" }));
  const policies = o.policies.map((p, i) => ({ ...p, oid: 70000 + i }));
  e.set(BROWSER_FORENSIC_QUERY_ID, { ...o, tables, policies, catalogCounts: { columns: o.columns.length,
    tableAcls: o.tableAcls.length, columnAcls: o.columnAcls.length, policies: policies.length } });
  const core = e.get(CORE_POLICY_QUERY_ID), ten = (r) => !["user_global_roles", "user_subscriptions", "referee_exam_sessions"].includes(r.table);
  core.tables = tables.filter(ten); core.policies = policies.filter(ten);
  core.table_acl = o.tableAcls.filter(ten); core.column_acl = o.columnAcls.filter(ten);
  Object.assign(core, { productFingerprint: baseline.historical.productFingerprint, protectedObjectsHash: baseline.historical.protectedObjectsHash });
  e.set(IDENTITY_BRIDGE_POST_QUERY_ID, { functions: baseline.identity.functions.map((f) => ({ ...structuredClone(f), proacl: [] })),
    acl: structuredClone(baseline.identity.executeAcl), rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0 });
  e.set(CORE_BASELINE_ADOPTION_QUERY_ID, { ledgerRows: structuredClone(baseline.adoption.ledgerRows), schemaStateRows: [], canonicalMarkerAbsent: true,
    historicalCounts: structuredClone(baseline.historical.counts), developmentObjects: structuredClone(baseline.adoption.developmentObjects),
    schemaCreatePrivileges: structuredClone(baseline.identity.schemaCreatePrivileges) });
  return e;
}
const frame = (e) => [...e].map(([query, payload]) => `${RESULT_FRAME_PREFIX}\t${query}\t${Buffer.from(JSON.stringify({ query, payload_row_count: 1, payload })).toString("base64")}\n`).join("");
function fakeSession({ pre = evidence(), post = evidence(true), failAt } = {}) {
  const log = []; let installed = false;
  return { log, async query(sql) {
    log.push(sql);
    const stage = sql === BROWSER_DDL_BEGIN ? "BEGIN" : sql === body ? "BODY" : sql === "commit;" ? "COMMIT" : installed ? "POST" : "PRE";
    if (stage === failAt) throw new CorePolicySessionFailure("TIMEOUT", { sqlstate: "57014" });
    if (sql === observationSql) return frame(installed ? post : pre);
    if (sql === body) installed = true;
    return "";
  }, async rollback() { log.push("ROLLBACK"); installed = false; }, async close() { log.push("CLOSE"); } };
}
const execute = (s, opts) => executeBrowserDdlAtomic(s, bytes, verification, opts);
const environment = (password = "synthetic_test_only_credential") => ({ ALLOW_PRODUCTION_DDL: "true", ALLOW_PRODUCTION_BROWSER_PRIVILEGE_64249_DDL: "true",
  REFLAB_PRODUCTION_DDL_PROJECT_REF: baseline.project, REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head,
  REFLAB_PRODUCTION_DDL_DB_URL: `postgresql://postgres.${baseline.project}:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require` });
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? ""
  : Buffer.from(readFileSync(new URL(args[1].slice(5), root), "utf8").replaceAll("\r\n", "\n"));

test("exact body extraction removes only the two verified outer boundaries", () => {
  const r = extractBrowserDdlBody(bytes); let expected = bytes.toString();
  for (const p of [...r.removed].reverse()) expected = expected.slice(0, p.start) + expected.slice(p.end);
  assert.equal(expected, body); assert.equal(r.removed.length, 2);
  assert.equal(bytes.toString().slice(r.removed[0].start, r.removed[0].end), "begin;");
  assert.equal(bytes.toString().slice(r.removed[1].start, r.removed[1].end), "commit;");
  assertBrowserDdlBody(body, bytes); assert.throws(() => assertBrowserDdlBody(body + "\n", bytes));
  assert.equal((body.match(/^\s*revoke /gm) ?? []).length, 18); assert.equal((body.match(/^\s*grant /gm) ?? []).length, 3);
});
for (const [name, change] of [
  ["missing BEGIN", (s) => s.replace("\nbegin;", "\n")], ["missing COMMIT", (s) => s.replace(/commit;\s*$/, "")],
  ["extra COMMIT", (s) => s.replace("set local lock_timeout", "commit; set local lock_timeout")],
  ["savepoint", (s) => s.replace("set local lock_timeout", "savepoint bypass; set local lock_timeout")],
  ["trailing statement", (s) => s + "select 1;"], ["psql escape", (s) => s + "\\i arbitrary.sql\n"],
  ["unterminated quote", (s) => s + "'"], ["dollar quote", (s) => s.replace("end\n$browser_transition$;", "end\n$wrong$;")],
]) test(`envelope rejects ${name}`, () => { assert.throws(() => validateBrowserDdlEnvelope(change(bytes.toString()))); assert.throws(() => extractBrowserDdlBody(Buffer.from(change(bytes.toString())))); });
test("body content drift cannot be rescued by a valid envelope", () => assert.throws(() => extractBrowserDdlBody(Buffer.from(bytes.toString().replace("60s", "61s")))));
test("observation contains the same exact catalog SELECTs as PRE, without transaction rewriting", () => {
  assertReadOnlySql(observationSql); assert.ok(buildBrowserTransitionBatch().includes(observationSql.slice(observationSql.indexOf(";\n") + 2).trim().replace(/;$/, "")));
  assert.doesNotMatch(observationSql, /\bbegin\b|\bcommit\b|\brollback\b|set role/i);
  assert.match(BROWSER_DDL_BEGIN, /transaction_timeout='180s'/); assert.match(BROWSER_DDL_BEGIN, /lock_timeout='5s'/);
  assert.match(BROWSER_DDL_BEGIN, /statement_timeout='60s'/);
});
test("writable adaptation checks actual off transport without mutating raw evidence", () => {
  const e = evidence(), before = frame(e), o = observeBrowserDdlEvidence(e), r = classifyBrowserDdlEvidence(o, verification);
  assert.equal(r.classification, "64249_PRE_EXECUTABLE_EXACT", JSON.stringify(r)); assert.equal(r.transactionReadOnly, false);
  assert.equal(r.checks.runnerOwnedWriteTransaction, true); assert.equal(o.transactionReadOnly, false); assert.equal(frame(e), before);
  e.set("read_only_guard", "on"); assert.throws(() => observeBrowserDdlEvidence(e));
});
test("one persistent session: BEGIN, live PRE, exact body once, live POST, COMMIT acknowledgement, close", async () => {
  const s = fakeSession(), r = await execute(s);
  assert.deepEqual(s.log, [BROWSER_DDL_BEGIN, observationSql, body, observationSql, "commit;", "CLOSE"]);
  assert.equal(r.PRODUCTION_64249_EXECUTION_STATE, "COMMITTED_POST_EXACT"); assert.equal(r.migrationInvocationCount, 1);
  assert.equal(r.preClassification, "64249_PRE_EXECUTABLE_EXACT"); assert.equal(r.postClassification, "64249_ALREADY_INSTALLED_POST");
  assert.equal(r.commitOutcome, "ACKNOWLEDGED"); assert.equal(r.mutationAccounting.effectivePrivilegeRevocations, 122);
  assert.equal(r.mutationAccounting.tableGrants, 1); assert.equal(r.mutationAccounting.columnGrants, 39);
  for (const [k, v] of Object.entries(r.mutationAccounting)) if (k.endsWith("Mutations") || k.endsWith("Writes") || k === "productDml") assert.equal(v, 0, k);
});
test("installed POST refuses reexecution with zero body calls and mutations", async () => {
  const s = fakeSession({ pre: evidence(true) }), r = await execute(s);
  assert.equal(r.reexecutionRefused, true); assert.equal(r.migrationInvocationCount, 0); assert.deepEqual(r.mutationAccounting, BROWSER_DDL_ZERO);
  assert.ok(!s.log.includes(body)); assert.ok(!s.log.includes("commit;")); assert.equal(r.transaction, "ROLLBACK");
});
const negatives = [
  ["anon effective", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.role === "anon"); r.granted = !r.granted; }],
  ["authenticated effective", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.role === "authenticated"); r.granted = !r.granted; }],
  ["MAINTAIN", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.role === "authenticated" && r.privilege === "MAINTAIN"); r.granted = !r.granted; }],
  ["PUBLIC", (o) => { o.tableAcls[0].grantee = "PUBLIC"; }],
  ["grantor", (o) => { o.tableAcls[0].grantor = "authenticated"; }], ["grant option", (o) => { o.tableAcls[0].grantable = true; }],
  ["profile columns", (o) => { o.columnAcls[0].privilege = "UPDATE"; }],
  ["referee SELECT", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.table === "referee_exam_sessions" && r.role === "authenticated" && r.privilege === "SELECT"); r.granted = !r.granted; }],
  ["referee policy", (o) => { o.policies.push({ ...o.policies.find((p) => p.table === "referee_exam_sessions"), name: "unexpected_browser", roles: ["authenticated"] }); }],
  ["service role", (o) => { o.tableAcls = o.tableAcls.filter((a) => a.grantee !== "service_role"); }],
  ["audit", (o) => { o.columnAcls.pop(); }],
  ["policy", (o) => { o.policies[0].using = "false"; }],
  ["literal", (o) => { const p = o.policies.find((p) => p.name === "training_attempt_profile_read"); p.using = p.using.replace("training_user_id", "training_user_id "); }],
  ["64236", (o) => { o["64236State"].comparison = "NOT_EXACT"; }], ["64245", (o) => { o["64245PostState"].comparison = "NOT_EXACT"; }],
  ["owner", (o) => { o.tables[0].owner = "authenticated"; }], ["RLS", (o) => { o.tables[0].rls = false; }], ["FORCE", (o) => { o.tables[0].force = true; }],
  ["historical", (o) => { o.historicalState.productFingerprint = "f".repeat(32); }],
  ["ledger", (o) => { o.adoptionState.ledgerRows.pop(); }], ["schema state", (o) => { o.adoptionState.schemaStateRowCount = 1; }],
  ["runtime", (o) => { o.adoptionState.runtimeDisabled = false; }], ["cutover", (o) => { o.adoptionState.cutoverAbsent = false; }], ["Phase4", (o) => { o.adoptionState.phase4Absent = false; }],
];
for (const post of [false, true]) for (const [name, change] of negatives) test(`${post ? "POST" : "PRE"} rejects ${name}`, async () => {
  const classify = (o, v) => { if (o.tableAcls.length === (post ? 242 : 363)) change(o); return classifyBrowserDdlEvidence(o, v); };
  const s = fakeSession(), r = await execute(s, { classify });
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.migrationInvocationCount, post ? 1 : 0);
  assert.equal(r.PRODUCTION_64249_EXECUTION_STATE, "NOT_COMMITTED"); assert.ok(!s.log.includes("commit;")); assert.ok(s.log.includes("ROLLBACK"));
});
for (const stage of ["BEGIN", "PRE", "BODY", "POST"]) test(`failure ${stage} rolls back without replay`, async () => {
  const s = fakeSession({ failAt: stage }), r = await execute(s);
  assert.equal(r.commitOutcome, "NOT_COMMITTED"); assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.automaticRetryAuthorized, false);
  assert.equal(s.log.filter((q) => q === body).length, ["BODY", "POST"].includes(stage) ? 1 : 0);
});
test("connection failure before COMMIT is not committed", async () => {
  const s = fakeSession(), r = await execute(s, { beforeCommit: () => { throw new Error("synthetic failure"); } });
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.commitOutcome, "NOT_COMMITTED"); assert.ok(!s.log.includes("commit;"));
});
test("lost COMMIT acknowledgement is UNKNOWN and permits only read-only forensic", async () => {
  const s = fakeSession({ failAt: "COMMIT" }), r = await execute(s);
  assert.equal(r.transaction, "UNKNOWN"); assert.equal(r.commitOutcome, "UNKNOWN"); assert.equal(r.readOnlyForensicRequired, true);
  assert.equal(r.onlyAllowedNextAction, "READ_ONLY_POST_FORENSIC"); assert.equal(r.automaticRetryAuthorized, false);
  assert.equal(r.PRODUCTION_64249_EXECUTION_STATE, "COMMIT_OUTCOME_UNKNOWN_REQUIRES_READ_ONLY_FORENSIC");
  assert.equal(s.log.filter((q) => q === body).length, 1); assert.equal(r.mutationAccounting.tableGrants, "UNKNOWN");
});
for (const key of BROWSER_DDL_VARIABLES.slice(0, 2)) for (const value of [undefined, "false", "TRUE"])
  test(`authorization rejects ${key}=${value}`, () => assert.throws(() => authorizeBrowserDdl({ ...environment(), [key]: value }, BROWSER_DDL_OPERATION, git)));
for (const key of ["ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_PRE_ATTESTATION", "ALLOW_PRODUCTION_CORE_POLICY_64245_DDL",
  "ALLOW_PRODUCTION_OTHER_DDL", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL", "PGHOST", "PGOPTIONS", "PGCUSTOM"])
  test(`reject foreign or inherited ${key}`, () => assert.throws(() => authorizeBrowserDdl({ ...environment(), [key]: "true" }, BROWSER_DDL_OPERATION, git)));
for (const status of [" M package.json", "M  package.json", "?? untracked.txt"])
  test(`reject worktree ${status}`, () => assert.throws(() => authorizeBrowserDdl(environment(), BROWSER_DDL_OPERATION, (a) => a[0] === "status" ? status : git(a))));
test("wrong HEAD rejected", () => assert.throws(() => authorizeBrowserDdl({ ...environment(), REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "f".repeat(40) }, BROWSER_DDL_OPERATION, git)));
test("only dedicated operation accepted", () => assert.throws(() => authorizeBrowserDdl(environment(), "--other", git)));
test("all committed pins exact including execution contract", () => assert.equal(assertBrowserDdlArtifacts(git).baselineDigestExact, true));
for (const path of Object.keys(BROWSER_DDL_ARTIFACTS)) test(`artifact drift blocks ${path}`, () => {
  assert.throws(() => assertBrowserDdlArtifacts((a) => a[0] === "show" && a[1] === `HEAD:${path}` ? Buffer.from("drift") : git(a)));
});
for (const [name, change] of [
  ["project", (e) => { e.REFLAB_PRODUCTION_DDL_PROJECT_REF = "wrong"; }],
  ...[["host", "aws-1-sa-east-1.pooler.supabase.com", "wrong.pooler.supabase.com"], ["direct", "aws-1-sa-east-1.pooler.supabase.com", `db.${baseline.project}.supabase.co`],
    ["port", ":5432/", ":6543/"], ["database", "/postgres?", "/wrong?"], ["installer", `postgres.${baseline.project}`, "service_role"], ["SSL", "sslmode=require", "sslmode=disable"]]
    .map(([name, from, to]) => [name, (e) => { e.REFLAB_PRODUCTION_DDL_DB_URL = e.REFLAB_PRODUCTION_DDL_DB_URL.replace(from, to); }]),
]) test(`wrong target ${name} rejected before connection`, async () => {
  const env = environment(); change(env); let connections = 0;
  const r = await runProductionBrowserPrivilege64249(env, { argument: BROWSER_DDL_OPERATION, git, createSession: () => { connections++; } });
  assert.equal(connections, 0); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.reason, "TARGET_MISMATCH");
});
for (const password of ['abc"def', "abc'def", "abc\\def", "abc%22def", "abc:def@ghi", "abc/def", "abc?x=1&y=2", 'a b"c\\d%']) {
  test(`clean successful output excludes adversarial credential ${JSON.stringify(password)}`, async () => {
    const env = environment(password), result = await execute(fakeSession());
    const output = serializeBrowserDdl(result, env), parsed = JSON.parse(output);
    assert.equal(parsed.transaction, "COMMIT");
    for (const secret of [password, encodeURIComponent(password), env.REFLAB_PRODUCTION_DDL_DB_URL, JSON.stringify(password).slice(1, -1)]) assert.ok(!output.includes(secret));
  });
  for (const errorPath of [false, true]) test(`${errorPath ? "error" : "success"} payload contamination discarded ${JSON.stringify(password)}`, async () => {
    const env = environment(password); let output = "";
    const code = await runBrowserDdlCli(env, { run: async () => ({ transaction: errorPath ? "ROLLBACK" : "COMMIT",
      PRODUCTION_64249_EXECUTION_STATE: "COMMITTED_POST_EXACT", diagnostic: { error: errorPath ? `driver password=${password}` : password } }), write: (s) => { output += s; } });
    assert.equal(code, 1); assert.ok(!output.includes(password)); assert.ok(!output.includes(encodeURIComponent(password)));
    assert.ok(!output.includes(env.REFLAB_PRODUCTION_DDL_DB_URL)); assert.ok(!output.includes(JSON.stringify(password).slice(1, -1)));
    assert.equal(JSON.parse(output).reason, "OUTPUT_REDACTION_FAILED");
  });
}
test("driver errors never escape as credential-bearing diagnostics", async () => {
  const env = environment('driver"secret\\value');
  const r = await runProductionBrowserPrivilege64249(env, { argument: BROWSER_DDL_OPERATION, git, createSession: () => { throw new Error(env.REFLAB_PRODUCTION_DDL_DB_URL); } });
  const text = serializeBrowserDdl(r, env); assert.equal(r.reason, "LOCAL_PROGRAMMING_ERROR"); assert.ok(!text.includes("driver"));
});
test("unknown live PRE cannot invoke migration", async () => {
  const s = fakeSession(), r = await execute(s, { classify: () => ({ classification: "UNKNOWN", executablePre: false, failedChecks: [], unknownChecks: ["session" ] }) });
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.transaction, "ROLLBACK"); assert.ok(!s.log.includes(body));
});
test("collection failures cannot be masked by transport adaptation", async () => {
  const pre = evidence(); pre.delete(BROWSER_FORENSIC_QUERY_ID);
  const r = await execute(fakeSession({ pre })); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.transaction, "ROLLBACK");
});
test("read-only evidence cannot substitute for writable execution transport", async () => {
  const pre = evidence(); pre.set("read_only_guard", "on");
  const r = await execute(fakeSession({ pre })); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.transaction, "ROLLBACK");
});
test("an unexpected thrown CLI driver error is replaced without serializing its message", async () => {
  const env = environment('driver"secret\\value'); let output = "";
  const code = await runBrowserDdlCli(env, { run: () => { throw new Error(env.REFLAB_PRODUCTION_DDL_DB_URL); }, write: (s) => { output += s; } });
  assert.equal(code, 1); assert.ok(!output.includes(env.REFLAB_PRODUCTION_DDL_DB_URL)); assert.equal(JSON.parse(output).reason, "LOCAL_PROGRAMMING_ERROR");
});
for (const value of ["encoded", "escaped", "url", "base64", "fragments"]) test(`derived secret ${value} discarded before serialization`, async () => {
  const password = 'a b"c\\d%', env = environment(password);
  const secret = { encoded: encodeURIComponent(password), escaped: JSON.stringify(password).slice(1, -1), url: env.REFLAB_PRODUCTION_DDL_DB_URL,
    base64: Buffer.from(password).toString("base64"), fragments: [password.slice(0, 3), password.slice(3)] }[value];
  let output = ""; const code = await runBrowserDdlCli(env, { run: async () => ({ diagnostic: secret }), write: (s) => { output += s; } });
  assert.equal(code, 1); assert.equal(JSON.parse(output).reason, "OUTPUT_REDACTION_FAILED");
});
