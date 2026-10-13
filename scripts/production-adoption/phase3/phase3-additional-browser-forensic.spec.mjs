import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { TABLES, PRIVILEGES, COMPLETE, OPERATION, RUNNER, VARIABLES, TARGET, HARNESS_ROOT, inventorySql,
  functionsSql, parseCatalogTree, inspectCatalogTree, buildBrowserReport, prepareBrowserForensic, serializeCurrentHarness } from "./phase3-additional-browser-forensic-contract.mjs";
import { browserFixtureEvidence } from "./phase3-additional-browser-forensic-fixture.mjs";
import { runProductionBrowserForensic, attestBrowserCatalog, runBrowserForensicCli } from "./run-production-additional-browser-forensic.mjs";
import { PINNED_ARTIFACTS } from "./phase3-additional-runtime-pre-contract.mjs";

const head = "a".repeat(40), password = "fixture_only_P@ss!";
const env = () => Object.fromEntries(VARIABLES.map((key, i) => [key, i < 3 ? "true" : i === 3 ? TARGET.project : i === 4 ? head :
  `postgresql://${TARGET.installer}:${encodeURIComponent(password)}@${TARGET.host}:5432/postgres?sslmode=require`]));
const checkout = (path) => readFileSync(resolve(HARNESS_ROOT, path));
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? "" : args[0] === "ls-tree"
  ? readdirSync(resolve(HARNESS_ROOT, "supabase/migrations")).map((n) => "supabase/migrations/" + n).join("\n")
  : checkout(args[1].slice(41)).toString("utf8").replaceAll("\r\n", "\n");
const dependencies = () => ({ argument: OPERATION, git, readCheckout: checkout, readRunnerBytes: () => checkout(RUNNER) });

test("57 unique tables and eight PG17 privileges", () => { assert.equal(TABLES.length, 57); assert.equal(new Set(TABLES).size, 57); assert.equal(PRIVILEGES.length, 8); });
test("exact synthetic catalog observation and archived table ACL crosscheck", () => {
  const r = buildBrowserReport(browserFixtureEvidence(), []); assert.equal(r.classification, COMPLETE);
  assert.deepEqual(r.archivedTableAclCrossCheck.observed, { anon: 352, authenticated: 408 });
  assert.equal(r.additionalBrowserEffectiveTablePrivileges.length, 1368);
  assert.equal(r.additionalRuntimeTables.length, 57); assert.equal(r.additionalRuntimeTables.filter((t) => !t.policies.length).length, 53);
});
for (const table of TABLES) {
  test(`missing table ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.tables = e.tables.filter((t) => t.table !== table);
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
  test(`missing policy-count observation ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.tables.find((t) => t.table === table).policyCount++;
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
  test(`missing column ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.columns = e.columns.filter((c) => c.table !== table);
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
  test(`missing browser effective cell ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.effectiveTables.splice(e.effectiveTables.findIndex((x) => x.table === table), 1);
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
  test(`incomplete raw table ACL ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.tables.find((t) => t.table === table).rawAclEntryCount++;
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
  test(`incomplete raw column ACL ${table} is UNKNOWN`, () => { const e = browserFixtureEvidence(); e.columns.find((c) => c.table === table).rawAclEntryCount++;
    assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
}
test("table ACL drift is observation, not guessed archived state", () => { const e = browserFixtureEvidence(); e.effectiveTables.find((r) => r.role === "anon" && r.effective).effective = false;
  const r = buildBrowserReport(e, []); assert.equal(r.classification, COMPLETE); assert.equal(r.archivedTableAclCrossCheck.drift, true); });
test("same-count browser redistribution still reports exact cell drift", () => { const e = browserFixtureEvidence();
  e.effectiveTables.find((r) => r.role === "anon" && r.effective).effective = false;
  e.effectiveTables.find((r) => r.role === "anon" && r.table === "ai_usage_ledger" && r.privilege === "SELECT").effective = true;
  const r = buildBrowserReport(e, []); assert.equal(r.archivedTableAclCrossCheck.observed.anon, 352);
  assert.equal(r.archivedTableAclCrossCheck.cellDrift.length, 2); assert.equal(r.archivedTableAclCrossCheck.drift, true); });
test("raw column ACL is never manufactured from table privileges", () => { const r = buildBrowserReport(browserFixtureEvidence(), []);
  assert.equal(r.additionalRuntimeColumnRawAcls.length, 0); assert.ok(r.additionalRuntimeEffectiveAuthenticatedColumnPrivileges.some((e) => e.effective)); });
test("column-only privilege remains distinct from table capability", () => { const e = browserFixtureEvidence();
  e.columnAcls.push({ table: "institutional_leads", column: "id", grantee: "anon", grantor: "postgres", privilege: "INSERT", grantable: false });
  e.columns.find((c) => c.table === "institutional_leads").rawAclEntryCount++;
  const c = e.effectiveColumns.find((e) => e.table === "institutional_leads" && e.role === "anon" && e.privilege === "INSERT"); c.effective = true;
  const r = buildBrowserReport(e, []); assert.equal(r.institutionalLeadsEvidence.tableCapabilities.find((e) => e.role === "anon").effective, false);
  assert.equal(r.institutionalLeadsEvidence.effectiveBrowserColumns.find((e) => e.role === "anon").effective, true); });
test("literal predicates retained without normalization", () => { const e = browserFixtureEvidence(); e.policies[0].usingExpression = "(id::text = 'Do NOT Fold Me'::text)";
  assert.equal(buildBrowserReport(e, []).additionalRuntimePolicies[0].usingExpression, e.policies[0].usingExpression); });
test("PUBLIC applicability explicitly distinguished", () => { const r = buildBrowserReport(browserFixtureEvidence(), []);
  const p = r.additionalRuntimePolicyRoleApplicability.find((p) => p.table === "appointments" && p.role === "anon");
  assert.deepEqual(p.paths, [["anon", "PUBLIC"]]); assert.equal(p.applies, true); });
test("membership applicability uses inheritance, never SET-only", () => { const e = browserFixtureEvidence(); e.policies[0].roles = ["policy_group"];
  e.roleAttributes.push({ name: "policy_group", authenticatedInherits: true });
  e.roleMemberships.push({ member: "authenticated", role: "policy_group", inherit_option: true, set_option: false });
  e.roleCount++; e.membershipCount++;
  assert.equal(buildBrowserReport(e, []).classification, COMPLETE);
  e.roleMemberships[0].inherit_option = false; assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
test("node tree resolves exact function OIDs including overloads and operators", () => {
  assert.deepEqual(inspectCatalogTree("{BOOLEXPR :args ({FUNCEXPR :funcid 12} {OPEXPR :opfuncid 13} {FUNCEXPR :funcid 14})}").functionOids, [12, 13, 14]); });
test("SQL-body table operations use PG17 required permission bits", () => {
  assert.deepEqual(inspectCatalogTree("{RTEPERMISSIONINFO :relid 100 :requiredPerms 7}").tableOperations[0].operations, ["INSERT", "SELECT", "UPDATE"]); });
test("catalog constants, quoted data and null trees", () => {
  assert.equal(parseCatalogTree(null), null); assert.equal(parseCatalogTree('{CONST :constvalue 4 [ 1 2 3 4 ] :data "a\\\"b"}').tag, "CONST"); });
for (const tree of ["{FUNCEXPR :funcid 3", "{FUNCEXPR invalid}", "{A} {B}", "(", "{A :x )}"])
  test(`malformed catalog tree fails closed ${tree}`, () => assert.throws(() => parseCatalogTree(tree)));
test("unresolved expression construct yields UNKNOWN", () => { const e = browserFixtureEvidence(); e.policies[0].usingTree = "{COERCEVIAIO :resulttype 25}";
  assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
test("unobserved function OID yields UNKNOWN", () => { const e = browserFixtureEvidence(); e.policies[0].usingTree = "{FUNCEXPR :funcid 999}";
  assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
test("operator function OID is resolved from authoritative pg_operator mapping", () => {
  assert.deepEqual(inspectCatalogTree("{OPEXPR :opno 90 :opfuncid 0}", [{ oid: 90, functionOid: 91 }]).functionOids, [91]); });
test("unresolved operator never emits false complete", () => { const e = browserFixtureEvidence(); e.policies[0].usingTree = "{OPEXPR :opno 90 :opfuncid 0}";
  assert.equal(buildBrowserReport(e, []).classification, "UNKNOWN"); });
test("row-comparison operator dependencies captured", () => {
  assert.deepEqual(inspectCatalogTree("{ROWCOMPAREEXPR :opnos (o 90 92)}", [{ oid: 90, functionOid: 91 }, { oid: 92, functionOid: 93 }]).functionOids, [91, 93]); });
test("non-read-only session evidence is BLOCKER", () => { const e = browserFixtureEvidence(); e.transactionReadOnly = "off";
  assert.equal(buildBrowserReport(e, []).classification, "BLOCKER"); });
test("nested invoker keeps DEFINER owner's execution identity", () => {
  const e = browserFixtureEvidence(); e.policies[0].usingTree = "{FUNCEXPR :funcid 100}";
  const fn = (oid, securityDefiner, sqlBodyTree) => ({ oid, schema: "public", name: `helper_${oid}`, identityArguments: "", returnType: "boolean",
    language: "sql", owner: "postgres", securityDefiner, sqlBodyTree, sourceHash: "a".repeat(32), volatility: "v", strict: false, leakproof: false,
    executeAcls: [], executeAclEntryCount: 0, catalogDependencies: [], relationIdentities: [], effectiveExecute: ["anon", "authenticated", "PUBLIC", "service_role", "postgres"].map((role) => ({ role, effective: true })) });
  const r = buildBrowserReport(e, [fn(100, true, "{FUNCEXPR :funcid 101}"), fn(101, false, "{CONST :consttype 16}")]);
  assert.equal(r.classification, COMPLETE); assert.equal(r.policyFunctionExecutionPaths.find((p) => p.functionOid === 101).executionRole, "postgres");
});
test("all catalog queries are read-only", () => { assert.ok(inventorySql().includes("pg_policy")); assert.ok(functionsSql([12]).includes("prosecdef")); });
for (const oid of [0, -1, NaN, "1;DROP", 1.5]) test(`reject unsafe function OID ${oid}`, () => assert.throws(() => functionsSql([oid])));
test("exact committed bytes pinned with no embedded self SHA", () => { const p = prepareBrowserForensic(env(), dependencies(), checkout(RUNNER));
  assert.equal(p.metadata.runnerArtifactExact, true); assert.equal(p.metadata.protectedArtifactsExact, true);
  assert.ok(Object.hasOwn(p.metadata.artifactHashes, RUNNER)); assert.ok(Object.keys(PINNED_ARTIFACTS).every((path) => Object.hasOwn(p.metadata.artifactHashes, path))); });

const failures = [
  ["wrong HEAD", (e) => { e[VARIABLES[4]] = "b".repeat(40); }],
  ...VARIABLES.slice(0, 3).map((key) => [`missing opt-in ${key}`, (e) => { delete e[key]; }]),
  ...["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE"].map((key) => [`PG override ${key}`, (e) => { e[key] = "unexpected"; }]),
  ...["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_DDL", "NODE_OPTIONS"].map((key) => [`conflict ${key}`, (e) => { e[key] = "true"; }]),
  ["wrong project", (e) => { e[VARIABLES[3]] = "notapproved"; }],
  ...["wrong.invalid:5432/postgres?sslmode=require", `${TARGET.host}:6543/postgres?sslmode=require`, `${TARGET.host}:5432/other?sslmode=require`, `${TARGET.host}:5432/postgres?sslmode=disable`]
    .map((suffix) => [`wrong target ${suffix}`, (e) => { e[VARIABLES[5]] = `postgresql://${TARGET.installer}:fixture@${suffix}`; }]),
  ["wrong installer", (e) => { e[VARIABLES[5]] = e[VARIABLES[5]].replace(TARGET.installer, "other"); }],
];
for (const [name, mutate] of failures) test(`${name}: zero session creation`, async () => {
  const e = env(); mutate(e); let calls = 0;
  await assert.rejects(runProductionBrowserForensic(e, { ...dependencies(), createSession: () => { calls++; throw new Error("connector unexpectedly initialized"); } }));
  assert.equal(calls, 0);
});
for (const status of [" M tracked", "M  staged", "?? untracked"]) test(`dirty ${status}: zero session creation`, async () => {
  let calls = 0; await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), git: (args) => args[0] === "status" ? status : git(args),
    createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("executing runner drift: zero session creation", async () => { let calls = 0;
  await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), readRunnerBytes: () => Buffer.from("drift"), createSession: () => { calls++; } })); assert.equal(calls, 0); });
for (const path of Object.keys(PINNED_ARTIFACTS)) test(`protected hash drift ${path}: zero session creation`, async () => {
  let calls = 0; const bytes = Buffer.from("drift");
  await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), git: (args) => args[0] === "show" && args[1].endsWith(":" + path) ? bytes : git(args),
    readCheckout: (p) => p === path ? bytes : checkout(p), createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("transitive checkout drift: zero session creation", async () => { let calls = 0;
  await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), readCheckout: (p) => p.endsWith("sql-safety.mjs") ? Buffer.from("drift") : checkout(p),
    createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("baseline manifest read-dependency drift: zero session creation", async () => { let calls = 0;
  await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), readCheckout: (p) => p === "supabase/baseline/manifest.json" ? Buffer.from("drift") : checkout(p),
    createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("ignored canonical source cannot escape committed inventory: zero session creation", async () => { let calls = 0;
  await assert.rejects(runProductionBrowserForensic(env(), { ...dependencies(), readMigrationNames: () => [...readdirSync(resolve(HARNESS_ROOT, "supabase/migrations")), "202609990001_untracked.sql"],
    createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("secret-safety metadata rejection: zero session creation", async () => { const e = env();
  e[VARIABLES[5]] = `postgresql://${TARGET.installer}:${TARGET.project}@${TARGET.host}:5432/postgres?sslmode=require`;
  let calls = 0; await assert.rejects(runProductionBrowserForensic(e, { ...dependencies(), createSession: () => { calls++; } })); assert.equal(calls, 0); });
test("single readonly BEGIN, ROLLBACK, close; no COMMIT", async () => { const events = [];
  const r = await attestBrowserCatalog({ query: async (sql) => events.push(sql), rollback: async () => events.push("ROLLBACK"), close: async () => events.push("CLOSE") },
    async () => buildBrowserReport(browserFixtureEvidence(), []));
  assert.equal(r.classification, COMPLETE); assert.match(events[0], /^begin read only;/); assert.match(events[0], /transaction_timeout='180s'/);
  assert.deepEqual(events.slice(1), ["ROLLBACK", "CLOSE"]); assert.equal(r.mutationCount, 0); });
for (const stage of ["begin", "observe", "rollback", "close"]) test(`failure at ${stage} cannot emit complete`, async () => {
  const r = await attestBrowserCatalog({ query: async () => { if (stage === "begin") throw Error(password); },
    rollback: async () => { if (stage === "rollback") throw Error(password); }, close: async () => { if (stage === "close") throw Error(password); } },
    async () => { if (stage === "observe") throw Error(password); return buildBrowserReport(browserFixtureEvidence(), []); });
  assert.equal(r.classification, "UNKNOWN"); assert.equal(JSON.stringify(r).includes(password), false); });
test("overall watchdog closes an unresponsive session", async () => { let closed = 0;
  const r = await attestBrowserCatalog({ query: async () => new Promise(() => {}), rollback: async () => {}, close: async () => { closed++; } }, undefined, { overallMs: 10 });
  assert.equal(r.classification, "UNKNOWN"); assert.ok(closed >= 1); });
test("recoverable JSON credential fragments rejected", () => {
  assert.throws(() => serializeCurrentHarness({ parts: [password.slice(0, 5), password.slice(5)] }, env()));
  assert.throws(() => serializeCurrentHarness({ escaped: [...password].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("") }, env())); });
for (const value of [password, encodeURIComponent(password), env()[VARIABLES[5]], { password }, `postgresql error password=${password}`])
  test(`structured redaction ${typeof value === "object" ? "object" : String(value).length}`, () => {
    assert.throws(() => serializeCurrentHarness({ nested: value }, env())); });
test("CLI gate failure emits safe BLOCKER and never initializes connector", async () => { let calls = 0, output = "";
  const code = await runBrowserForensicCli({}, { ...dependencies(), createSession: () => { calls++; }, write: (v) => { output += v; } });
  assert.equal(code, 1); assert.equal(calls, 0); assert.equal(JSON.parse(output).classification, "BLOCKER"); });
test("unsafe collected evidence yields a safe BLOCKER, never an altered COMPLETE", async () => { let output = "";
  const report = { ...buildBrowserReport(browserFixtureEvidence(), []), transaction: "ROLLBACK", unsafe: password };
  const code = await runBrowserForensicCli(env(), { run: async () => report, write: (v) => { output += v; } });
  assert.equal(code, 1); assert.equal(output.includes(password), false); assert.equal(JSON.parse(output).classification, "BLOCKER");
  assert.equal(JSON.parse(output).reason, "OUTPUT_REDACTION_FAILED"); });
