import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";
import { browserLineageObservation } from "./phase3-browser-privilege-lineage-fixture.mjs";
import { browserForensicFixtureEvidence } from "./phase3-browser-privilege-forensic-fixture.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { buildBrowserTransitionBatch } from "./phase3-browser-privilege-contract.mjs";
import { executeBrowserForensicReadOnly } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { BROWSER_PRE_FORMAT, BROWSER_PRE_ARTIFACTS, BROWSER_PRE_VERIFICATION_CHECKS, classifyBrowserPreAttestation, browserPreFailureReport } from "./phase3-browser-privilege-pre-attestation-contract.mjs";
import { BROWSER_PRE_OPERATION, BROWSER_PRE_VARIABLES, runProductionBrowserPrivilegePreAttestation,
  runBrowserPreAttestationCli, serializeBrowserPreAttestation } from "./run-production-browser-privilege-pre-attestation.mjs";

const head = "fc89dff43a63ea143b4364631331e1b77c2ee721";
const root = new URL("../../../", import.meta.url);
const verification = { ...Object.fromEntries(BROWSER_PRE_VERIFICATION_CHECKS.map((k) => [k, true])), approvedHead: head };
const classify = (o = browserLineageObservation()) => classifyBrowserPreAttestation(o, verification);
function evidence(post = false) {
  const e = browserForensicFixtureEvidence(), o = browserLineageObservation(post);
  const tables = o.tables.map((r) => ({ ...r, raw_acl: [], acl_origin: "EXPLICIT_ACL" }));
  const policies = o.policies.map((p, i) => ({ ...p, oid: 70000 + i }));
  e.set(BROWSER_FORENSIC_QUERY_ID, { ...o, tables, policies, catalogCounts: {
    columns: o.columns.length, tableAcls: o.tableAcls.length, columnAcls: o.columnAcls.length, policies: policies.length,
  } });
  const core = e.get(CORE_POLICY_QUERY_ID);
  core.tables = tables.filter((r) => !["user_global_roles", "user_subscriptions", "referee_exam_sessions"].includes(r.table));
  core.policies = policies.filter((p) => !["user_global_roles", "user_subscriptions", "referee_exam_sessions"].includes(p.table));
  core.table_acl = o.tableAcls.filter((r) => core.tables.some((t) => t.table === r.table));
  core.column_acl = o.columnAcls.filter((r) => core.tables.some((t) => t.table === r.table));
  Object.assign(core, { productFingerprint: baseline.historical.productFingerprint, protectedObjectsHash: baseline.historical.protectedObjectsHash });
  e.set(IDENTITY_BRIDGE_POST_QUERY_ID, { functions: baseline.identity.functions.map((f) => ({ ...structuredClone(f), proacl: [] })),
    acl: structuredClone(baseline.identity.executeAcl), rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0 });
  e.set(CORE_BASELINE_ADOPTION_QUERY_ID, { ledgerRows: structuredClone(baseline.adoption.ledgerRows), schemaStateRows: [],
    canonicalMarkerAbsent: true, historicalCounts: structuredClone(baseline.historical.counts),
    developmentObjects: structuredClone(baseline.adoption.developmentObjects), schemaCreatePrivileges: structuredClone(baseline.identity.schemaCreatePrivileges) });
  return e;
}
const environment = (password = "synthetic_test_only_credential") => ({
  ...Object.fromEntries(BROWSER_PRE_VARIABLES.slice(0, 3).map((k) => [k, "true"])),
  [BROWSER_PRE_VARIABLES[3]]: baseline.project, [BROWSER_PRE_VARIABLES[4]]: head,
  [BROWSER_PRE_VARIABLES[5]]: `postgresql://postgres.${baseline.project}:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`,
});
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? ""
  : readFileSync(new URL(args[1].slice(5), root), "utf8").replaceAll("\r\n", "\n");
const dependencies = (e = evidence()) => ({ argument: BROWSER_PRE_OPERATION, git, executeReadOnly: () => e });
test("exact PRE exposes individual checks, never authorizes DDL or invokes a migration", () => {
  const r = classify(); assert.equal(r.classification, "64249_PRE_EXECUTABLE_EXACT");
  assert.equal(r.executablePre, true); assert.deepEqual(r.failedChecks, []); assert.deepEqual(r.unknownChecks, []);
  assert.equal(r.checkCount, Object.keys(r.checks).length); assert.equal(r.mutationCount, 0);
  assert.equal(r.migrationInvocationCount, 0); assert.equal(r.productionDdlAuthorized, false);
  for (const k of r.checkApplicability.common.concat(r.checkApplicability.pre)) assert.equal(r.checks[k], true, k);
  assert.equal(r.policyState.count, 55); assert.equal(r.browserPrivilegeState.effectivePrivileges.length, 208);
});
test("exact POST is installed and non-executable; PRE-only failures are not POST failures", () => {
  const r = classify(browserLineageObservation(true)); assert.equal(r.classification, "64249_ALREADY_INSTALLED_POST");
  assert.equal(r.executablePre, false); assert.equal(r.reexecutionRefused, true); assert.equal(r.migrationInvocationCount, 0);
  assert.equal(r.checks.anonPreExact, false); assert.equal(r.checkApplicability.evaluatedState, "POST"); assert.deepEqual(r.failedChecks, []);
});
const negatives = [
  ["partial anon revoke", (o) => { o.tableAcls.splice(o.tableAcls.findIndex((a) => a.grantee === "anon"), 1); }],
  ["anon effective drift", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.role === "anon"); r.granted = !r.granted; }],
  ["authenticated drift", (o) => { o.effectiveBrowserPrivileges.find((r) => r.role === "authenticated").granted = false; }],
  ["MAINTAIN drift", (o) => { const r = o.effectiveBrowserPrivileges.find((r) => r.role === "authenticated" && r.privilege === "MAINTAIN"); r.granted = !r.granted; }],
  ["PUBLIC inherited path", (o) => { o.effectiveBrowserPrivileges.find((r) => r.table === "referee_exam_sessions" && r.role === "anon").granted = true; }],
  ["PUBLIC raw grant", (o) => { o.tableAcls[0].grantee = "PUBLIC"; }],
  ["wrong grantor", (o) => { o.tableAcls[0].grantor = "authenticated"; }],
  ["grant option", (o) => { o.tableAcls[0].grantable = true; }],
  ["profile column PRE drift", (o) => { o.columnAcls.push({ schema: "public", table: "user_profiles", column: "user_id", grantee: "authenticated", grantor: "postgres", privilege: "INSERT", grantable: false }); }],
  ["column PUBLIC", (o) => { o.columnAcls[0].grantee = "PUBLIC"; }],
  ["column inherited path", (o) => { o.effectiveBrowserColumnPrivileges.find((r) => r.role === "anon" && r.table === "user_profiles").granted = true; }],
  ["policy mutation", (o) => { o.policies[0].using = "false"; }],
  ["literal mutation", (o) => { const p = o.policies.find((r) => r.name === "training_attempt_profile_read"); p.using = p.using.replace("training_user_id", "training_user_id "); }],
  ["referee premature SELECT", (o) => { o.tableAcls.push({ schema: "public", table: "referee_exam_sessions", grantee: "authenticated", grantor: "postgres", privilege: "SELECT", grantable: false }); }],
  ["referee premature policy", (o) => { o.policies.push({ ...o.policies.find((p) => p.table === "referee_exam_sessions"), name: "browser_read", roles: ["authenticated"] }); }],
  ["service role drift", (o) => { o.tableAcls = o.tableAcls.filter((r) => r.grantee !== "service_role"); }],
  ["audit owner drift", (o) => { o.columnAcls = o.columnAcls.filter((r) => r.grantee !== "reflab_preflight_audit_owner"); }],
  ["RLS owner drift", (o) => { o.tableAcls = o.tableAcls.filter((r) => r.grantee !== "reflab_rls_owner"); }],
  ["64236 drift", (o) => { o["64236State"].functions[0].source_hash = "f".repeat(64); }],
  ["64245 drift", (o) => { o["64245PostState"].comparison = "NOT_EXACT"; }],
  ["owner drift", (o) => { o.tables[0].owner = "authenticated"; }],
  ["RLS drift", (o) => { o.tables[0].rls = false; }],
  ["FORCE drift", (o) => { o.tables[0].force = true; }],
  ["historical fingerprint drift", (o) => { o.historicalState.productFingerprint = "f".repeat(32); }],
  ["ledger drift", (o) => { o.adoptionState.ledgerRows.pop(); }],
  ["schema state drift", (o) => { o.adoptionState.schemaStateRows.push({ drift: true }); }],
  ["runtime enabled", (o) => { o.adoptionState.runtimeDisabled = false; }],
  ["cutover present", (o) => { o.adoptionState.cutoverAbsent = false; }],
  ["Phase4 present", (o) => { o.adoptionState.phase4Absent = false; }],
  ["read only off", (o) => { o.transactionReadOnly = false; }],
];
for (const [name, change] of negatives) test(`${name} blocks without migration invocation`, () => {
  const o = browserLineageObservation(); change(o); const r = classify(o);
  assert.equal(r.classification, "BLOCKER"); assert.equal(r.executablePre, false); assert.equal(r.migrationInvocationCount, 0); assert.ok(r.failedChecks.length);
});
for (const [name, change] of negatives) test(`installed POST rejects ${name}`, () => {
  const o = browserLineageObservation(true); change(o); const r = classify(o);
  assert.equal(r.classification, "BLOCKER"); assert.equal(r.migrationInvocationCount, 0); assert.equal(r.mutationCount, 0);
});
for (const k of BROWSER_PRE_VERIFICATION_CHECKS) test(`verification ${k} cannot default to approved`, () => {
  assert.equal(classifyBrowserPreAttestation(browserLineageObservation(), { ...verification, [k]: false }).classification, "BLOCKER");
});
test("runner queries current evidence, rather than trusting old forensic JSON", () => {
  for (const post of [false, true]) {
    let calls = 0; const r = runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(evidence(post)),
      executeReadOnly: (sql) => { calls++; assert.equal(sql, buildBrowserTransitionBatch()); return evidence(post); } });
    assert.equal(calls, 1); assert.equal(r.classification, post ? "64249_ALREADY_INSTALLED_POST" : "64249_PRE_EXECUTABLE_EXACT", JSON.stringify(r.failedChecks));
  }
});
for (const k of BROWSER_PRE_VARIABLES.slice(0, 3)) test(`dedicated authorization requires ${k}`, () => {
  const env = environment(); delete env[k]; let calls = 0;
  assert.throws(() => runProductionBrowserPrivilegePreAttestation(env, { ...dependencies(), executeReadOnly: () => { calls++; } })); assert.equal(calls, 0);
});
for (const k of ["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_CORE_POLICY_64245_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_64249_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_BASELINE_FORENSIC", "REFLAB_PRODUCTION_DDL_DB_URL", "PGHOST", "PGOPTIONS", "PGPASSWORD", "PGCUSTOM"]) test(`reject contaminated ${k} before connection`, () => {
  let calls = 0; assert.throws(() => runProductionBrowserPrivilegePreAttestation({ ...environment(), [k]: "true" }, { ...dependencies(), executeReadOnly: () => { calls++; } })); assert.equal(calls, 0);
});
for (const [name, change] of [
  ["HEAD", (env) => { env[BROWSER_PRE_VARIABLES[4]] = "f".repeat(40); }],
  ["project", (env) => { env[BROWSER_PRE_VARIABLES[3]] = "wrong"; }],
  ["host", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace("aws-1-sa-east-1", "aws-0-us-east-1"); }],
  ["direct host", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace("aws-1-sa-east-1.pooler.supabase.com", `db.${baseline.project}.supabase.co`); }],
  ["port", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace(":5432/", ":6543/"); }],
  ["database", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace("/postgres?", "/other?"); }],
  ["installer", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace("postgres.", "service_role."); }],
  ["SSL", (env) => { env[BROWSER_PRE_VARIABLES[5]] = env[BROWSER_PRE_VARIABLES[5]].replace("sslmode=require", "sslmode=disable"); }],
]) test(`reject wrong ${name} without connection`, () => {
  const env = environment(); change(env); let calls = 0;
  assert.throws(() => runProductionBrowserPrivilegePreAttestation(env, { ...dependencies(), executeReadOnly: () => { calls++; } })); assert.equal(calls, 0);
});
for (const status of [" M package.json", "M  package.json", "?? untracked.txt"]) test(`reject dirty/staged/untracked ${status.slice(0, 2)}`, () => {
  assert.throws(() => runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(), git: (args) => args[0] === "status" ? status : git(args) }));
});
for (const path of Object.keys(BROWSER_PRE_ARTIFACTS)) test(`reject committed artifact mismatch ${path}`, () => {
  let calls = 0; assert.throws(() => runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(),
    git: (args) => args[0] === "show" && args[1] === `HEAD:${path}` ? `${git(args)}\n` : git(args), executeReadOnly: () => { calls++; } })); assert.equal(calls, 0);
});
test("checkout semantic mismatch is rejected; EOL-only difference is accepted", () => {
  assert.throws(() => runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(), readCheckout: () => "wrong" }));
  assert.equal(runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(), readCheckout: (p) => git(["show", `HEAD:${p}`]).replaceAll("\n", "\r\n") }).executablePre, true);
});
for (const [name, change] of [["read-only guard", (e) => e.set("read_only_guard", "off")], ["managed installer", (e) => { e.get("production_installer_identity").caller = "authenticated"; }], ["missing query", (e) => e.delete(BROWSER_FORENSIC_QUERY_ID)]]) test(`${name} fails closed in runner`, () => {
  const e = evidence(); change(e);
  if (name === "read-only guard") assert.throws(() => runProductionBrowserPrivilegePreAttestation(environment(), dependencies(e)));
  else assert.equal(runProductionBrowserPrivilegePreAttestation(environment(), dependencies(e)).classification, "BLOCKER");
});
test("exact SQL is one bounded READ ONLY transaction, SELECT-only, ROLLBACK not COMMIT", () => {
  const sql = buildBrowserTransitionBatch(); assert.match(sql, /^begin read only;/); assert.match(sql, /rollback;\s*$/);
  assert.equal((sql.match(/begin read only;/g) ?? []).length, 1); assert.match(sql, /lock_timeout = '2s'/); assert.match(sql, /statement_timeout = '15s'/);
  assert.doesNotMatch(sql, /^\s*(?:commit|create|alter|drop|grant|revoke|insert|update|delete|notify|set role)\b/im);
});
for (const [name, response] of [["connection failure", { status: 2, stderr: "connection refused" }], ["timeout", { status: 1, stderr: "ERROR: 57014: canceling statement due to statement timeout" }]]) test(`${name} is safe, bounded, closes the read-only session`, async () => {
  let sql; const executeReadOnly = (batch, target, options) => executeBrowserForensicReadOnly(batch, target, { ...options, spawn: (_program, _args, opts) => { sql = opts.input; assert.equal(opts.timeout, 120000); return response; } });
  let err = "", out = ""; const code = await runBrowserPreAttestationCli(environment(), { ...dependencies(), executeReadOnly,
    writeStdout: (s) => { out += s; }, writeStderr: (s) => { err += s; } });
  assert.equal(code, 1); assert.equal(out, ""); assert.equal(JSON.parse(err).classification, "BLOCKER"); assert.match(sql, /rollback;\s*$/);
});
const passwords = ['abc"def', "abc'def", "abc\\def", "abc%22def", "abc:def@ghi", "abc/def", "abc?x=1&y=2", 'a b"c\\d%'];
for (const password of passwords) {
  test(`synthetic secret never reaches successful serialization ${JSON.stringify(password)}`, () => {
    const env = environment(password), r = classify(); const text = serializeBrowserPreAttestation(r, env);
    const decoded = JSON.stringify(JSON.parse(text));
    for (const secret of [password, encodeURIComponent(password), env[BROWSER_PRE_VARIABLES[5]], JSON.stringify(password).slice(1, -1)]) assert.equal(text.includes(secret) || decoded.includes(secret), false);
  });
  for (const kind of ["raw", "encoded", "escaped", "URL", "driver error"]) test(`discard unsafe ${kind} payload ${JSON.stringify(password)}`, async () => {
    const env = environment(password); const secret = kind === "encoded" ? encodeURIComponent(password) : kind === "escaped" ? JSON.stringify(password).slice(1, -1) : kind === "URL" ? env[BROWSER_PRE_VARIABLES[5]] : password;
    let out = "", err = "";
    const code = await runBrowserPreAttestationCli(env, { run: () => { if (kind === "driver error") throw new Error(`connection password=${secret}`); return { ...classify(), unexpected: secret }; },
      writeStdout: (s) => { out += s; }, writeStderr: (s) => { err += s; } });
    assert.equal(code, 1); assert.equal(out, "");
    for (const s of [password, encodeURIComponent(password), JSON.stringify(password).slice(1, -1), env[BROWSER_PRE_VARIABLES[5]]]) assert.equal(err.includes(s), false);
  });
}
test("operation cannot use a forensic or generic executor argument", () => {
  assert.throws(() => runProductionBrowserPrivilegePreAttestation(environment(), { ...dependencies(), argument: "--production-browser-privilege-baseline-forensic" }));
});
test("structured output format is deterministic and contains all required sections", () => {
  const r = classify(); assert.equal(r.format, BROWSER_PRE_FORMAT);
  for (const key of ["artifact", "baseline", "target", "predecessorState", "browserPrivilegeState", "columnPrivilegeState", "policyState", "adoptionState", "historicalState", "boundaryState"]) assert.ok(r[key]);
  assert.equal(serializeBrowserPreAttestation(r), serializeBrowserPreAttestation(classify()));
});
test("incomplete collection exposes unknown checks instead of silently discarding them", () => {
  const o = browserLineageObservation(); o.unknownChecks = ["allPoliciesCollected"];
  const r = classify(o); assert.equal(r.classification, "BLOCKER"); assert.deepEqual(r.unknownChecks, ["collection.allPoliciesCollected"]);
});
for (const [name, change] of [
  ["column grantor", (o) => { o.columnAcls[0].grantor = "authenticated"; }],
  ["column grantability", (o) => { o.columnAcls[0].grantable = true; }],
  ["profile broad INSERT revoked alone", (o) => { o.tableAcls = o.tableAcls.filter((a) => !(a.table === "user_profiles" && a.grantee === "authenticated" && a.privilege === "INSERT")); }],
  ["partial MAINTAIN reconciliation", (o) => { o.tableAcls = o.tableAcls.filter((a) => !(a.grantee === "authenticated" && a.privilege === "MAINTAIN")); }],
  ["attempts INSERT revoked alone", (o) => { o.tableAcls = o.tableAcls.filter((a) => !(a.table === "attempts" && a.grantee === "authenticated" && a.privilege === "INSERT")); }],
]) test(`${name} cannot become executable PRE`, () => {
  const o = browserLineageObservation(); change(o); assert.equal(classify(o).classification, "BLOCKER");
});
test("safe CLI success emits structured evidence without granting DDL", async () => {
  let out = "", err = ""; const code = await runBrowserPreAttestationCli(environment(), { ...dependencies(),
    writeStdout: (s) => { out += s; }, writeStderr: (s) => { err += s; } });
  assert.equal(code, 0); assert.equal(err, ""); const r = JSON.parse(out);
  assert.equal(r.classification, "64249_PRE_EXECUTABLE_EXACT"); assert.equal(r.productionDdlAuthorized, false);
});
test("untrusted diagnostics cannot overwrite fail-closed execution fields", () => {
  const r = browserPreFailureReport({ classification: "64249_PRE_EXECUTABLE_EXACT", executablePre: true, mutationCount: 1, productionDdlAuthorized: true });
  assert.equal(r.classification, "BLOCKER"); assert.equal(r.executablePre, false); assert.equal(r.mutationCount, 0); assert.equal(r.productionDdlAuthorized, false);
});
