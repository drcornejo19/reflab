import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { RESULT_FRAME_PREFIX } from "../../production-preflight/queries.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID, identityBridgePostExact, identityBridgePostQueries } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { classifyCorePolicyInventory } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { CORE_POLICY_PRODUCTION_BASELINE as data } from "./phase3-core-policy-production-baseline.mjs";
import { APPROVED_CORE_POLICY_PRODUCTION_BASELINE as approval } from "./phase3-core-policy-production-baseline-contract.mjs";
import { extractCorePolicyMigrationBody, validateCorePolicyEnvelope, classifyCorePolicyExecutionEvidence,
  CORE_POLICY_BEGIN_SQL, buildCorePolicyExecutionObservation, CORE_POLICY_DDL_ZERO_MUTATIONS } from "./phase3-core-policy-ddl-contract.mjs";
import { CORE_POLICY_DDL_OPERATION, CORE_POLICY_DDL_VARIABLES, runProductionCorePolicy64245,
  executeCorePolicyAtomicTransition, runCorePolicy64245Cli } from "./run-production-core-policy-64245.mjs";
import { createCorePolicyPsqlSession, CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";

const bytes = readFileSync(new URL("../../../supabase/migrations/20260901064245_production_adoption_core_policy_reconciliation.sql", import.meta.url));
const body = extractCorePolicyMigrationBody(bytes).body;
const observation = buildCorePolicyExecutionObservation();
function evidence(post = false) {
  const inventory = structuredClone(approval.inventory);
  if (post) inventory.policies = [...structuredClone(data.preservedPolicies), ...PHASE3_POLICY_MATRIX.map((p, i) =>
    ({ ...p, schema: "public", oid: String(900000 + i), roles: ["authenticated"], permissive: true }))];
  return new Map([["read_only_guard", "off"], [CORE_POLICY_QUERY_ID, inventory],
    [IDENTITY_BRIDGE_POST_QUERY_ID, { functions: structuredClone(data.identity.functions), acl: structuredClone(data.identity.acl),
      rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0 }],
    [CORE_BASELINE_ADOPTION_QUERY_ID, { ledgerRows: structuredClone(data.adoption.ledgerChain), schemaStateRows: [],
      canonicalMarkerAbsent: true, historicalCounts: structuredClone(data.historical.counts),
      developmentObjects: structuredClone(data.adoption.developmentObjects), schemaCreatePrivileges: structuredClone(data.identity.schemaCreate) }],
    [CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID, { counts: { ...data.historical.counts, ledger_rows: 4, schema_state_rows: 0 },
      checks: { canonicalMarkerAbsent: true, developmentObjectsAbsent: true }, ledger_rows: structuredClone(data.adoption.ledgerChain) }]]);
}
// Unit tests isolate transport/orchestration; PG17 exercises the full predecessor composition.
const composition = { classifyIdentity: (e) => ({ classification: identityBridgePostExact(e.get(IDENTITY_BRIDGE_POST_QUERY_ID)) ? "EXACT" : "BLOCKER" }),
  classifyCore: (e, b) => classifyCorePolicyInventory(e.get(CORE_POLICY_QUERY_ID), b, identityBridgePostExact(e.get(IDENTITY_BRIDGE_POST_QUERY_ID))) };
const classify = (e, a) => classifyCorePolicyExecutionEvidence(e, a, composition);
const frame = (e) => [...e].map(([query, payload]) => `${RESULT_FRAME_PREFIX}\t${query}\t${Buffer.from(JSON.stringify({ query, payload_row_count: 1, payload })).toString("base64")}\n`).join("");
function fakeSession({ pre = evidence(), post = evidence(true), failAt, closeFailure = false } = {}) {
  const log = []; let installed = false;
  return { log, async query(sql) {
    log.push(sql);
    const stage = sql === CORE_POLICY_BEGIN_SQL ? "BEGIN" : sql === body ? "BODY" : sql === "commit;" ? "COMMIT" : installed ? "POST" : "PRE";
    if (stage === failAt) throw new CorePolicySessionFailure("SQLSTATE_55000", { sqlstate: "55000" });
    if (sql === observation) return frame(installed ? post : pre);
    if (sql === body) installed = true;
    return "";
  }, async rollback() { log.push("ROLLBACK"); installed = false; },
  async close() { log.push("CLOSE"); if (closeFailure) throw new Error("fixture-secret"); } };
}
const execute = (session, extra = {}) => executeCorePolicyAtomicTransition(session, body, approval, { classify, ...extra });

test("observation parity changes only the seven explicit transport predicates, not catalog/state semantics", () => {
  let count = 0;
  for (const q of identityBridgePostQueries) {
    const predicate = /pg_catalog\.current_setting\('transaction_read_only'\)\s*=\s*'on'/g;
    count += [...q.payloadSql.matchAll(predicate)].length;
    assert.ok(observation.includes(q.sql.replace(predicate, "pg_catalog.current_setting('transaction_read_only')='off'")), q.id);
  }
  assert.equal(count, 7);
  assert.ok(!observation.includes("set role"));
  assert.ok(!observation.includes("set local transaction_read_only"));
});

test("verified body removes only the two approved envelope statements, byte-for-byte", () => {
  const source = bytes.toString("utf8"), result = extractCorePolicyMigrationBody(bytes);
  let expected = source;
  for (const r of [...result.removed].reverse()) expected = expected.slice(0, r.start) + expected.slice(r.end);
  assert.equal(result.body, expected); assert.equal(source.slice(result.removed[0].start, result.removed[0].end), "begin;");
  assert.equal(source.slice(result.removed[1].start, result.removed[1].end), "commit;");
  assert.ok(result.body.includes("$replace_policies$"));
  assert.throws(() => extractCorePolicyMigrationBody(Buffer.from(source + "\n")));
});
for (const [name, change] of [
  ["missing BEGIN", (s) => s.replace("\nbegin;", "\n")], ["missing COMMIT", (s) => s.replace(/commit;\s*$/, "")],
  ["extra COMMIT", (s) => s.replace("set local lock_timeout", "commit; set local lock_timeout")],
  ["SAVEPOINT", (s) => s.replace("set local lock_timeout", "savepoint bypass; set local lock_timeout")],
  ["trailing SQL", (s) => s + "select 1;"], ["psql escape", (s) => s + "\\i other.sql\n"],
  ["body parity drift", (s) => s.replace("90s", "91s")],
]) test(`envelope/body drift rejected: ${name}`, () => {
  const changed = change(bytes.toString("utf8"));
  assert.throws(() => extractCorePolicyMigrationBody(Buffer.from(changed)));
  if (name !== "body parity drift") assert.throws(() => validateCorePolicyEnvelope(changed));
});
test("one owned transaction: live PRE, body once, live POST, then COMMIT", async () => {
  const session = fakeSession(); const r = await execute(session);
  assert.deepEqual(session.log, [CORE_POLICY_BEGIN_SQL, observation, body, observation, "commit;", "CLOSE"]);
  assert.equal(r.transaction, "COMMIT"); assert.equal(r.migrationInvocationCount, 1);
  assert.equal(r.preDdl.classification, "64245_PRE_EXECUTABLE_EXACT"); assert.equal(r.postDdl.classification, "64245_ALREADY_INSTALLED_POST");
  assert.equal(r.mutationAccounting.policyDrops, 7); assert.equal(r.mutationAccounting.policyCreates, 22);
  for (const [k, v] of Object.entries(r.mutationAccounting)) if (!["policyDrops", "policyCreates"].includes(k)) assert.equal(v, 0, k);
});
test("POST is never executable and a second invocation does not execute the body", async () => {
  const s = fakeSession({ pre: evidence(true) }); const r = await execute(s);
  assert.equal(r.REEXECUTION_REFUSED, true); assert.equal(r.migrationInvocationCount, 0);
  assert.equal(r.transaction, "ROLLBACK"); assert.ok(!s.log.includes(body));
  assert.deepEqual(r.mutationAccounting, CORE_POLICY_DDL_ZERO_MUTATIONS);
});
test("actual writable observation is required, never a falsified readonly guard", async () => {
  for (const guard of ["on", null, "unknown"]) {
    const e = evidence(); e.set("read_only_guard", guard); const r = await execute(fakeSession({ pre: e }));
    assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.migrationInvocationCount, 0);
  }
  assert.equal(classify(evidence(), approval).checks.runnerOwnedWriteTransaction, true);
  assert.equal(classify(evidence(), approval).transactionReadOnly, false);
});
test("incomplete/unknown PRE aborts without body", async () => {
  const r = await execute(fakeSession({ pre: new Map([["read_only_guard", "off"]]) }));
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.transaction, "ROLLBACK");
});
test("unverified body cannot reach BEGIN", async () => {
  const s = fakeSession(); const r = await executeCorePolicyAtomicTransition(s, body + "\n", approval, { classify });
  assert.equal(r.migrationInvocationCount, 0); assert.ok(!s.log.includes(CORE_POLICY_BEGIN_SQL));
});
test("failure before sending COMMIT rolls back, unlike an unknown COMMIT acknowledgement", async () => {
  const s = fakeSession(); const r = await execute(s, { beforeCommit: () => { throw new Error("fixture-secret"); } });
  assert.equal(r.transaction, "ROLLBACK"); assert.equal(r.migrationInvocationCount, 1); assert.ok(!s.log.includes("commit;"));
});
for (const stage of ["BEGIN", "PRE", "BODY", "POST", "COMMIT"]) test(`failure at ${stage} never retries`, async () => {
  const s = fakeSession({ failAt: stage }); const r = await execute(s);
  assert.equal(s.log.filter((sql) => sql === body).length, ["BODY", "POST", "COMMIT"].includes(stage) ? 1 : 0);
  assert.ok(s.log.includes("ROLLBACK"));
  if (stage === "COMMIT") { assert.equal(r.transaction, "UNKNOWN"); assert.equal(r.commitOutcomeUnknown, true);
    assert.equal(r.mutationAccounting.policyDrops, "UNKNOWN"); assert.equal(r.mutationAccounting.policyCreates, "UNKNOWN");
    assert.equal(r.readOnlyForensicRequired, true); assert.equal(r.reexecutionAuthorized, false); }
  else assert.equal(r.transaction, "ROLLBACK");
});
test("confirmed COMMIT is not misreported as zero invocations if close fails", async () => {
  const r = await execute(fakeSession({ closeFailure: true })); assert.equal(r.transaction, "COMMIT");
  assert.equal(r.migrationInvocationCount, 1); assert.equal(r.connectionCloseUnconfirmed, true);
});
const payload = (e) => e.get(CORE_POLICY_QUERY_ID);
const adoption = (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID);
for (const p of data.targetSlots.filter((s) => s.policy)) test(`live PRE required historical target: ${p.name}`, async () => {
  const e = evidence(); payload(e).policies = payload(e).policies.filter((r) => r.name !== p.name);
  assert.equal((await execute(fakeSession({ pre: e }))).migrationInvocationCount, 0);
});
for (const p of data.targetSlots.filter((s) => !s.policy)) test(`live PRE missing slot cannot appear: ${p.name}`, async () => {
  const e = evidence(); const target = PHASE3_POLICY_MATRIX.find((r) => r.name === p.name && r.table === p.table);
  payload(e).policies.push({ ...target, schema: "public", oid: "999998", roles: ["authenticated"], permissive: true });
  assert.equal((await execute(fakeSession({ pre: e }))).migrationInvocationCount, 0);
});
for (const p of data.legacyPolicies) for (const changed of [false, true]) test(`live legacy exactness: ${p.table} changed=${changed}`, async () => {
  const e = evidence(); const i = payload(e).policies.findIndex((r) => r.table === p.table && r.name === p.name);
  if (changed) payload(e).policies[i].using = "true"; else payload(e).policies.splice(i, 1);
  assert.equal((await execute(fakeSession({ pre: e }))).migrationInvocationCount, 0);
});
for (const p of data.preservedPolicies) test(`live preserved policy exactness: ${p.table}.${p.name}`, async () => {
  const e = evidence(); payload(e).policies.find((r) => r.table === p.table && r.name === p.name).permissive = false;
  assert.equal((await execute(fakeSession({ pre: e }))).migrationInvocationCount, 0);
});
const driftCases = [
  ["owner", (e) => { payload(e).tables[0].owner = "other"; }], ["RLS", (e) => { payload(e).tables[0].rls = false; }],
  ["FORCE", (e) => { payload(e).tables[0].force = true; }], ["table ACL", (e) => { payload(e).table_acl.pop(); }],
  ["column ACL", (e) => { payload(e).column_acl.pop(); }],
  ["64236", (e) => { e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].source_hash = "f".repeat(64); }],
  ["ledger", (e) => { adoption(e).ledgerRows.pop(); }], ["schema_state", (e) => { adoption(e).schemaStateRows.push({ state: "drift" }); }],
  ["runtime", (e) => { payload(e).runtimeDisabled = false; }], ["cutover", (e) => { payload(e).cutoverAbsent = false; }],
  ["Phase4", (e) => { payload(e).phase4Absent = false; }], ["fingerprint", (e) => { payload(e).productFingerprint = "f".repeat(32); }],
];
for (const [name, change] of driftCases) test(`live PRE drift blocks: ${name}`, async () => {
  const e = evidence(); change(e); const r = await execute(fakeSession({ pre: e }));
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.transaction, "ROLLBACK");
});
for (const [name, change] of driftCases) test(`live POST drift rolls back before COMMIT: ${name}`, async () => {
  const e = evidence(true); change(e); const s = fakeSession({ post: e }); const r = await execute(s);
  assert.equal(r.migrationInvocationCount, 1); assert.equal(r.transaction, "ROLLBACK"); assert.ok(!s.log.includes("commit;"));
});

const head = "a".repeat(40);
const environment = () => ({ ALLOW_PRODUCTION_DDL: "true", ALLOW_PRODUCTION_CORE_POLICY_64245_DDL: "true",
  REFLAB_PRODUCTION_DDL_PROJECT_REF: "nagjddldrldwavmfaytc", REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head,
  REFLAB_PRODUCTION_DDL_DB_URL: "postgresql://postgres.nagjddldrldwavmfaytc:encoded%2Ffixture%2Bsecret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require" });
function deps(extra = {}) { return { argument: CORE_POLICY_DDL_OPERATION, git: (a) => a[0] === "rev-parse" ? head : "",
  assertBaseline: () => ({ ...approval, committedArtifactVerified: true }), createSession: () => assert.fail("must not open database"), ...extra }; }
for (const [name, change, d] of [
  ["operation", () => {}, { argument: "wrong" }], ["generic opt-in", (e) => { delete e.ALLOW_PRODUCTION_DDL; }],
  ["dedicated opt-in", (e) => { delete e.ALLOW_PRODUCTION_CORE_POLICY_64245_DDL; }],
  ["other provider opt-in", (e) => { e.ALLOW_PRODUCTION_OTHER_DDL = "true"; }],
  ["read-only conflict", (e) => { e.ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT = "true"; }],
  ["wrong HEAD", (e) => { e.REFLAB_PRODUCTION_DDL_APPROVED_HEAD = "b".repeat(40); }],
  ["dirty tree", () => {}, { git: (a) => a[0] === "rev-parse" ? head : "?? unexpected" }],
  ["wrong project", (e) => { e.REFLAB_PRODUCTION_DDL_PROJECT_REF = "wrong"; }],
  ["migration bytes", () => {}, { readMigration: () => Buffer.from("select 1;") }],
  ["unsupported migration", () => {}, { readMigration: () => readFileSync(new URL("../../../supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql", import.meta.url)) }],
  ["baseline digest", () => {}, { assertBaseline: () => ({ ...approval, committedArtifactVerified: true, digest: "f".repeat(64) }) }],
  ["uncommitted baseline", () => {}, { assertBaseline: () => approval }],
]) test(`authorization before connection: ${name}`, async () => {
  const e = environment(); change(e); const r = await runProductionCorePolicy64245(e, deps(d));
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.PRODUCTION_64245_EXECUTION_STATE, "NOT_COMMITTED");
});
for (const key of ["PGHOST", "PGPASSWORD", "PGOPTIONS", "PGSERVICE"]) test(`inherited ${key} rejected by presence`, async () => {
  const e = environment(); e[key] = ""; const r = await runProductionCorePolicy64245(e, deps()); assert.equal(r.reason, "INHERITED_PG_STATE");
});
for (const [name, before, after] of [
  ["host", "aws-1-sa-east-1.pooler.supabase.com", "example.invalid"],
  ["direct host", "aws-1-sa-east-1.pooler.supabase.com", "db.nagjddldrldwavmfaytc.supabase.co"],
  ["port", ":5432/", ":6543/"], ["database", "/postgres?", "/template1?"],
  ["installer", "postgres.nagjddldrldwavmfaytc", "service_role"], ["SSL", "sslmode=require", "sslmode=disable"],
]) test(`target rejected before connection: ${name}`, async () => {
  const e = environment(); e.REFLAB_PRODUCTION_DDL_DB_URL = e.REFLAB_PRODUCTION_DDL_DB_URL.replace(before, after);
  assert.equal((await runProductionCorePolicy64245(e, deps())).reason, "TARGET_MISMATCH");
});
test("raw thrown errors cannot print URLs, encoded/decoded passwords or credentials", async () => {
  const e = environment(); let output = "";
  const r = await runCorePolicy64245Cli(e, deps({ git: () => { throw new Error(e.REFLAB_PRODUCTION_DDL_DB_URL); }, write: (s) => { output += s; } }));
  assert.equal(r, 1); assert.doesNotMatch(output, /postgresql:|encoded|fixture|secret|PGPASSWORD/);
});
test("fully authorized wrapper reports one committed transition with safe target metadata", async () => {
  const s = fakeSession(); const r = await runProductionCorePolicy64245(environment(), deps({ createSession: () => s, classify }));
  assert.equal(r.transaction, "COMMIT"); assert.equal(r.head, head); assert.equal(r.migrationInvocationCount, 1);
  assert.equal(r.TABLE_ACL_SECURITY_STATUS, "PENDING_RECONCILIATION");
  assert.doesNotMatch(JSON.stringify(r), /postgresql:|encoded|fixture|secret/);
});
test("registered command is exact; no selectable migration path or later provider", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url)));
  assert.equal(pkg.scripts["execute:production-core-policy-64245"], "node scripts/production-adoption/phase3/run-production-core-policy-64245.mjs --execute-production-core-policy-64245");
  const source = readFileSync(new URL("./run-production-core-policy-64245.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /executeMigration|64249|spawnSync|--file|migrationPath/);
  assert.equal(CORE_POLICY_DDL_VARIABLES.length, 5);
});

function fakeProcess(respond) {
  const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough();
  let closed = false;
  const finish = (code) => { if (!closed) { closed = true; c.emit("close", code); } };
  c.kill = () => { queueMicrotask(() => finish(1)); };
  c.stdin = new Writable({ write(chunk, _encoding, callback) {
    const text = String(chunk), marker = text.match(/\\echo ([^\n]+)/)?.[1];
    queueMicrotask(() => { if (marker) respond(c, marker, text, finish); else finish(0); }); callback();
  }, final(callback) { queueMicrotask(() => finish(0)); callback(); } });
  return c;
}
test("single psql session uses hardened args, isolated environment and dual output barriers", async () => {
  let calls = 0; const c = fakeProcess((child, marker) => {
    child.stdout.write(`safe-output\n${marker}\n`); setTimeout(() => child.stderr.write(`${marker}\n`), 5);
  });
  const s = createCorePolicyPsqlSession({ PGHOST: "fixture" }, { PATH: "fixture-path", PGOPTIONS: "unsafe", SECRET: "secret" }, {
    spawnProcess: (_bin, args, options) => { calls++; assert.ok(args.includes("-X")); assert.ok(args.includes("--no-psqlrc"));
      assert.ok(args.includes("ON_ERROR_STOP=1")); assert.ok(args.includes("VERBOSITY=verbose"));
      assert.equal(options.env.PGOPTIONS, undefined); assert.equal(options.env.SECRET, undefined);
      assert.equal(options.env.PGCONNECT_TIMEOUT, "10"); return c; },
  });
  assert.equal(await s.query("begin;"), "safe-output\n"); assert.equal(await s.query("rollback;"), "safe-output\n");
  await s.close(); assert.equal(calls, 1);
});
for (const [name, respond, reason] of [
  ["warning before stderr barrier", (c, m) => { c.stdout.write(`${m}\n`); c.stderr.write(`WARNING: secret\n${m}\n`); }, "PSQL_WARNING"],
  ["SQLSTATE failure", (c, _m, _s, finish) => { c.stderr.write("ERROR: 55000: secret\n"); finish(3); }, "SQLSTATE_55000"],
  ["lock failure", (c, _m, _s, finish) => { c.stderr.write("ERROR: 55P03: secret\n"); finish(3); }, "SQLSTATE_55P03"],
  ["statement timeout", (c, _m, _s, finish) => { c.stderr.write("ERROR: 57014: secret\n"); finish(3); }, "TIMEOUT"],
]) test(`safe process failure: ${name}`, async () => {
  const s = createCorePolicyPsqlSession({}, {}, { spawnProcess: () => fakeProcess(respond) });
  await assert.rejects(s.query("select 1;"), (e) => e.reason === reason && !e.message.includes("secret"));
  await s.close();
});
