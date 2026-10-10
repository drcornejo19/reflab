import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { SERVICE_FORENSIC_FORMAT, SERVICE_FORENSIC_QUERY_ID, PRIMARY_TABLES, ADDITIONAL_TABLES, TABLE_PRIVILEGES,
  RELEVANT_FUNCTIONS, DELETE_CALLER_TABLES, buildServiceRoleForensicBatch, classifyServiceRoleForensic, serviceRolePaths,
  privilegeOrigins, currentDesignDelta, classifyLocalServiceRoleForensic, PREDEFINED_TABLE_AUTHORITIES } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { serviceRoleFixtureEvidence, refreshServiceFixtureCounts, buildServiceRoleMechanicalFixture, SERVICE_FIXTURE_STATUS } from "./phase3-service-role-privilege-forensic-fixture.mjs";
import { SERVICE_FORENSIC_OPERATION, SERVICE_FORENSIC_VARIABLES, SERVICE_FORENSIC_ARTIFACTS, runProductionServiceRolePrivilegeForensic,
  serializeServiceRoleForensic, runServiceRoleForensicCli } from "./run-production-service-role-privilege-forensic.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";

const root = resolve(import.meta.dirname, "../../..");
const head = "8210fd8a1160517d5bc0105f2dea2003b62f4924";
const inventory = (e) => e.get(SERVICE_FORENSIC_QUERY_ID);
const classify = (e = serviceRoleFixtureEvidence()) => classifyServiceRoleForensic(e, {targetExact: true, approvedHead: head});
const environment = (password = "synthetic-only-password") => Object.fromEntries(SERVICE_FORENSIC_VARIABLES.map((k, i) => [k,
  i < 3 ? "true" : i === 3 ? "nagjddldrldwavmfaytc" : i === 4 ? head :
    `postgresql://postgres.nagjddldrldwavmfaytc:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require`]));
const readCheckout = (p) => readFileSync(resolve(root, p), "utf8");
const git = (args) => args[0] === "rev-parse" ? head : args[0] === "status" ? "" : readCheckout(args[1].slice(5)).replaceAll("\r\n", "\n");
const run = (env = environment(), overrides = {}) => runProductionServiceRolePrivilegeForensic(env, {
  argument: SERVICE_FORENSIC_OPERATION, git, readCheckout, executeReadOnly: () => serviceRoleFixtureEvidence(), ...overrides,
});

test("exact protected POST observation never approves a service-role transition", () => {
  const r = classify();
  assert.equal(r.format, SERVICE_FORENSIC_FORMAT); assert.equal(r.classification, "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE");
  assert.deepEqual(r.failedChecks, []); assert.deepEqual(r.unknownChecks, []);
  assert.equal(r.approval, "NOT_PERFORMED"); assert.equal(r.mutationCount, 0); assert.equal(r.migrationInvocationCount, 0);
  assert.equal(r.productionDdlAuthorized, false); assert.equal(r.predecessorState.browser64249.classification, "64249_ALREADY_INSTALLED_POST");
  assert.equal(Object.hasOwn(r.predecessorState.browser64249, "executablePre"), false);
  assert.equal(r.predecessorState.browser64249.reexecutionAuthorized, false);
  assert.equal(r.policies.length, 55); assert.equal(r.primaryTables.length, 13);
  assert.equal(r.primaryEffectiveServiceRolePrivileges.length, 104);
  assert.equal(r.currentVsDesignDelta.effectivePrivilegeEntryRevocations, 70);
  assert.equal(r.currentVsDesignDelta.effectivePrivilegeEntryGrants, 3);
  assert.equal(r.currentVsDesignDelta.sqlRevokeStatementCount, "NOT_DERIVED");
});
test("all eight PG17 privileges are explicit and additional scope is disjoint", () => {
  assert.deepEqual(TABLE_PRIVILEGES, ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]);
  assert.equal(new Set([...PRIMARY_TABLES, ...ADDITIONAL_TABLES]).size, PRIMARY_TABLES.length + ADDITIONAL_TABLES.length);
  for (const t of DELETE_CALLER_TABLES) assert.ok(ADDITIONAL_TABLES.includes(t));
  assert.ok(ADDITIONAL_TABLES.includes("coach_rate_limit_buckets"));
});
test("one read-only transaction is rollback-only with bounded local settings", () => {
  const batch = buildServiceRoleForensicBatch();
  assert.equal((batch.match(/^begin read only;/gm) ?? []).length, 1);
  assert.equal((batch.match(/^rollback;/gm) ?? []).length, 1);
  assert.match(batch, /transaction_read_only/); assert.match(batch, /statement_timeout\s*=\s*'15s'/);
  assert.match(batch, /lock_timeout\s*=\s*'2s'/);
  assert.doesNotMatch(batch, /^\s*(?:commit|create|alter|drop|insert|update|delete|grant|revoke|notify|truncate|set role)\b/im);
  assert.match(batch, /pg_catalog\.has_table_privilege/); assert.match(batch, /pg_catalog\.has_column_privilege/);
  assert.match(batch, /pg_catalog\.aclexplode/); assert.match(batch, /m\.inherit_option/); assert.match(batch, /m\.set_option/);
  assert.doesNotMatch(batch, /rolpassword/);
});
test("fixture is explicitly mechanical and never executes a migration artifact", () => {
  assert.equal(SERVICE_FIXTURE_STATUS, "LOCAL_MECHANICAL_FIXTURE_ONLY");
  assert.match(buildServiceRoleMechanicalFixture(), /LOCAL_MECHANICAL_FIXTURE_ONLY/);
  assert.throws(() => classifyLocalServiceRoleForensic(serviceRoleFixtureEvidence(), {}, {}), /LOCAL_FIXTURE_PROOF_REQUIRED/);
});
for (const privilege of TABLE_PRIVILEGES) test(`direct service_role ${privilege} has exact grantor/option provenance`, () => {
  const r = classify().primaryEffectiveServiceRolePrivileges.find((r) => r.table === "attempts" && r.privilege === privilege);
  assert.equal(r.granted, true); assert.equal(r.origins[0].path, "DIRECT_SERVICE_ROLE_GRANT");
  assert.equal(r.origins[0].grantor, "postgres"); assert.equal(r.origins[0].grantable, false);
});
for (const privilege of TABLE_PRIVILEGES) test(`PUBLIC ${privilege} is visible independently of direct grants`, () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e), table = "coach_rate_limit_buckets";
  p.tableAcls.push({schema: "public", table, grantee: "PUBLIC", grantor: "postgres", privilege, grantable: false});
  p.effectiveTablePrivileges.find((r) => r.table === table && r.privilege === privilege).granted = true;
  refreshServiceFixtureCounts(p);
  const r = classify(e); assert.deepEqual(r.failedChecks, []);
  assert.ok(r.coachRateLimitState.effectivePrivileges.find((r) => r.privilege === privilege).origins.some((o) => o.path === "PUBLIC"));
});
for (const [inheritOption, setOption] of [[true, true], [true, false], [false, true], [false, false]]) test(`membership separates INHERIT=${inheritOption} and SET=${setOption}`, () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e), target = p.roleAttributes.find((r) => r.name === "reflab_rls_owner");
  Object.assign(target, {serviceRoleMember: true, serviceRoleInherits: inheritOption, serviceRoleCanSet: setOption});
  p.roleMemberships.push({member: "service_role", role: target.name, grantor: "postgres", adminOption: false, inheritOption, setOption});
  assert.equal(serviceRolePaths(p, target.name).length, Number(inheritOption));
  assert.equal(serviceRolePaths(p, target.name, "setOption").length, Number(setOption));
  const row = {table: "user_global_roles", privilege: "UPDATE"};
  assert.equal(privilegeOrigins(row, p).some((o) => o.path === "INHERITED_ROLE_GRANT"), inheritOption);
});
test("ambiguous membership cycles fail closed", () => {
  const p = inventory(serviceRoleFixtureEvidence());
  p.roleMemberships = [{member: "service_role", role: "postgres", inheritOption: true}, {member: "postgres", role: "service_role", inheritOption: true}];
  assert.throws(() => serviceRolePaths(p, "reflab_rls_owner"), /ROLE_PATH_CYCLE/);
});
test("membership booleans inconsistent with the actual graph fail closed", () => {
  const e = serviceRoleFixtureEvidence(); inventory(e).roleAttributes.find((r) => r.name === "postgres").serviceRoleMember = true;
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(r.checks.membershipPathsExact, false);
});
test("indirect inherited grants expose the full member-to-role path", () => {
  const p = inventory(serviceRoleFixtureEvidence());
  for (const name of ["authenticator", "reflab_rls_owner"]) Object.assign(p.roleAttributes.find((r) => r.name === name), {
    serviceRoleMember: true, serviceRoleInherits: true, serviceRoleCanSet: false,
  });
  p.roleMemberships = [{member: "service_role", role: "authenticator", inheritOption: true, setOption: false},
    {member: "authenticator", role: "reflab_rls_owner", inheritOption: true, setOption: false}];
  assert.deepEqual(serviceRolePaths(p, "reflab_rls_owner"), [["service_role", "authenticator", "reflab_rls_owner"]]);
  assert.deepEqual(serviceRolePaths(p, "reflab_rls_owner", "setOption"), []);
});
for (const [role, privileges] of Object.entries(PREDEFINED_TABLE_AUTHORITIES)) test(`implicit ${role} authority is not mislabeled as an ACL grant`, () => {
  const p = inventory(serviceRoleFixtureEvidence());
  p.roleAttributes.push({...p.roleAttributes.find((r) => r.name === "postgres"), name: role, serviceRoleMember: true, serviceRoleInherits: true, serviceRoleCanSet: false});
  p.roleMemberships.push({member: "service_role", role, grantor: "postgres", inheritOption: true, setOption: false, adminOption: false});
  for (const privilege of privileges) assert.ok(privilegeOrigins({table: "referee_exam_sessions", privilege}, p).some((o) => o.path === "PREDEFINED_ROLE_AUTHORITY" && o.role === role));
});
for (const [key, value, expected] of [["rolbypassrls", true, "BYPASSRLS"], ["rolbypassrls", false, "POLICY_REQUIRED"], ["rolsuper", true, "SUPERUSER_BYPASS"]])
  test(`RLS authority is observed from ${key}=${value}, never assumed`, () => {
    const e = serviceRoleFixtureEvidence(); inventory(e).roleAttributes.find((r) => r.name === "service_role")[key] = value;
    assert.equal(classify(e).primaryTables.find((t) => t.table === "attempts").serviceRoleRowAccessPath, expected);
  });
test("effective privilege without a provable origin is a BLOCKER", () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e);
  p.effectiveTablePrivileges.find((r) => r.table === "referee_exam_sessions" && r.privilege === "SELECT").granted = true;
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.ok(r.unknownChecks.includes("effectivePrivilegeOrigins"));
});
test("columns remain complete, including profile table-versus-column authority", () => {
  const r = classify(); assert.equal(r.primaryEffectiveColumnPrivileges.length, 302 * 4); assert.equal(r.primaryColumnAcls.length, 89);
  const profile = r.primaryColumnAcls.filter((r) => r.table === "user_profiles" && r.grantee === "authenticated");
  assert.equal(profile.filter((r) => r.privilege === "INSERT").length, 20);
  assert.equal(profile.filter((r) => r.privilege === "UPDATE").length, 19);
  assert.ok(r.primaryEffectiveColumnPrivileges.find((r) => r.table === "user_profiles" && r.privilege === "INSERT").origins.some((o) => o.scope === "TABLE"));
});
for (const mode of [true, false]) test(`function security_definer=${mode} determines actual execution identity`, () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e), f = p.relevantFunctions.find((f) => f.name === "consume_coach_rate_limit");
  f.security_definer = mode; f.owner = "reflab_rls_owner";
  const r = classify(e); assert.deepEqual(r.failedChecks, []);
  assert.equal(r.coachRateLimitState.functions[0].underlyingAccessRole, mode ? "reflab_rls_owner" : "CALLER_INVOKER_SERVICE_ROLE");
});
test("absent RPC is reported as absent rather than substituted with a fixture expectation", () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e), name = RELEVANT_FUNCTIONS[0];
  p.relevantFunctions = p.relevantFunctions.map((f) => f.name === name ? {name, exists: false} : f);
  p.functionExecuteAcls = p.functionExecuteAcls.filter((f) => !f.signature.includes(name)); refreshServiceFixtureCounts(p);
  const r = classify(e); assert.deepEqual(r.failedChecks, []); assert.equal(r.relevantFunctions.find((f) => f.name === name).underlyingAccessRole, "ABSENT");
});
test("additional absent runtime object is explicit, not mutation-authorized or guessed present", () => {
  const e = serviceRoleFixtureEvidence(), p = inventory(e), table = "institution_contents";
  p.tables.find((r) => r.table === table).exists = false; p.tableAcls = p.tableAcls.filter((r) => r.table !== table);
  for (const r of p.effectiveTablePrivileges.filter((r) => r.table === table)) r.granted = null;
  refreshServiceFixtureCounts(p); const r = classify(e); assert.deepEqual(r.failedChecks, []);
  assert.equal(r.additionalRuntimeTables.find((r) => r.table === table).serviceRoleRowAccessPath, "ABSENT");
  assert.match(r.ADDITIONAL_RUNTIME_SCOPE, /NOT_MUTATION_AUTHORIZED/);
});
test("delta is derived from the observed matrix, not hardcoded as 70/3", () => {
  const p = inventory(serviceRoleFixtureEvidence());
  p.effectiveTablePrivileges.find((r) => r.table === "attempts" && r.privilege === "DELETE").granted = false;
  p.effectiveTablePrivileges.find((r) => r.table === "referee_exam_sessions" && r.privilege === "SELECT").granted = true;
  const delta = currentDesignDelta(p.effectiveTablePrivileges); assert.equal(delta.effectivePrivilegeEntryRevocations, 69); assert.equal(delta.effectivePrivilegeEntryGrants, 2);
});

const driftCases = {
  "read-only guard": (e) => e.set("read_only_guard", "off"),
  "PG17 universe": (e) => inventory(e).serverVersion = 160011,
  "role absent": (e) => inventory(e).roleAttributes.pop(),
  "membership incomplete": (e) => inventory(e).roleMemberships.push({member: "missing"}),
  "grant option": (e) => inventory(e).tableAcls.find((a) => a.table === "attempts" && a.grantee === "service_role").grantable = true,
  "wrong grantor": (e) => inventory(e).tableAcls.find((a) => a.table === "attempts" && a.grantee === "service_role").grantor = "authenticated",
  "service role grant missing": (e) => inventory(e).tableAcls.splice(inventory(e).tableAcls.findIndex((a) => a.table === "attempts" && a.grantee === "service_role"), 1),
  "referee service grant unexpected": (e) => inventory(e).tableAcls.push({schema: "public", table: "referee_exam_sessions", grantee: "service_role", grantor: "postgres", privilege: "SELECT", grantable: false}),
  "column ACL drift": (e) => inventory(e).columnAcls.pop(),
  "effective column drift": (e) => inventory(e).effectiveColumnPrivileges[0].granted = !inventory(e).effectiveColumnPrivileges[0].granted,
  "function execute drift": (e) => inventory(e).relevantFunctions[0].serviceRoleExecute = false,
  "function ACL hidden": (e) => inventory(e).functionExecuteAcls.pop(),
  "owner": (e) => inventory(e).tables[0].owner = "authenticated",
  "RLS": (e) => inventory(e).tables[0].rls = false,
  "FORCE": (e) => inventory(e).tables[0].force = true,
  "64236 source": (e) => e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].source_hash = "0".repeat(64),
  "64245 policy": (e) => e.get(BROWSER_FORENSIC_QUERY_ID).policies[0].using = "false",
  "literal policy": (e) => {const p = e.get(BROWSER_FORENSIC_QUERY_ID).policies.find((p) => p.name === "training_attempt_profile_read"); p.using = p.using.replace("training_user_id", "training_user_id ");},
  "browser POST drift": (e) => e.get(BROWSER_FORENSIC_QUERY_ID).effectiveBrowserPrivileges.find((r) => r.role === "anon").granted = true,
  "historical counts": (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).historicalCounts.attempts++,
  "historical digest": (e) => e.get(CORE_POLICY_QUERY_ID).productFingerprint = "0".repeat(32),
  "ledger": (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).ledgerRows.pop(),
  "schema state": (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).schemaStateRows.push({}),
  "marker": (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).canonicalMarkerAbsent = false,
  "runtime": (e) => e.get(CORE_POLICY_QUERY_ID).runtimeDisabled = false,
  "cutover": (e) => e.get(CORE_POLICY_QUERY_ID).cutoverAbsent = false,
  "Phase4": (e) => e.get(CORE_POLICY_QUERY_ID).phase4Absent = false,
};
for (const [name, mutate] of Object.entries(driftCases)) test(`fail closed on ${name} without mutation`, () => {
  const e = serviceRoleFixtureEvidence(); mutate(e); const r = classify(e);
  assert.equal(r.classification, "BLOCKER"); assert.ok(r.failedChecks.length); assert.equal(r.mutationCount, 0); assert.equal(r.approval, "NOT_PERFORMED");
});

test("all committed/checkout artifact pins match normalized local bytes", () => {
  for (const [p, hash] of Object.entries(SERVICE_FORENSIC_ARTIFACTS)) assert.equal(createHash("sha256").update(readCheckout(p).replaceAll("\r\n", "\n")).digest("hex"), hash, p);
});
test("exact gate invokes only the injected read-only collector", () => {assert.equal(run().classification, "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE");});
for (const key of SERVICE_FORENSIC_VARIABLES.slice(0, 3)) test(`missing dedicated authorization ${key} refuses before connection`, () => {
  const env = environment(); delete env[key]; let calls = 0;
  assert.throws(() => run(env, {executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);
});
for (const key of ["PGHOST", "PGOPTIONS", "pgpassword", "ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_64249_DDL",
  "ALLOW_PRODUCTION_CORE_POLICY_64245_DDL", "ALLOW_PRODUCTION_BROWSER_PRIVILEGE_PRE_ATTESTATION", "REFLAB_PRODUCTION_DDL_DB_URL"])
  test(`foreign environment ${key} refuses even when false`, () => {
    const env = {...environment(), [key]: "false"}; let calls = 0;
    assert.throws(() => run(env, {executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);
  });
for (const state of [" M local", "M  local", "?? local"]) test(`dirty/staged/untracked ${state} refuses before connection`, () => {
  let calls = 0; assert.throws(() => run(environment(), {git: (args) => args[0] === "status" ? state : git(args), executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);
});
test("wrong approved HEAD refuses before connection", () => {let calls = 0; const env = environment(); env[SERVICE_FORENSIC_VARIABLES[4]] = "0".repeat(40);
  assert.throws(() => run(env, {executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);});
for (const path of Object.keys(SERVICE_FORENSIC_ARTIFACTS)) test(`artifact drift ${path} refuses before connection`, () => {
  let calls = 0; assert.throws(() => run(environment(), {git: (args) => args[0] === "show" && args[1] === `HEAD:${path}` ? "wrong" : git(args), executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);
});
for (const [name, change] of Object.entries({project: (u) => u.username = "postgres.wrong", host: (u) => u.hostname = "example.invalid",
  direct: (u) => u.hostname = "db.nagjddldrldwavmfaytc.supabase.co", port: (u) => u.port = "6543", database: (u) => u.pathname = "/wrong",
  installer: (u) => u.username = "service_role", SSL: (u) => u.searchParams.set("sslmode", "disable")}))
  test(`target mismatch ${name} refuses before connection`, () => {
    const env = environment(), u = new URL(env[SERVICE_FORENSIC_VARIABLES[5]]); change(u); env[SERVICE_FORENSIC_VARIABLES[5]] = u.href;
    let calls = 0; assert.throws(() => run(env, {executeReadOnly: () => {calls++;}})); assert.equal(calls, 0);
  });
test("wrong project reference refuses before connection", () => {const env = environment(); env[SERVICE_FORENSIC_VARIABLES[3]] = "wrong"; assert.throws(() => run(env));});
test("transaction read-only enforcement refuses writable evidence", () => {assert.throws(() => run(environment(), {executeReadOnly: () => new Map([["read_only_guard", "off"]])}));});

const passwords = ['abc"def', "abc'def", "abc\\def", "abc%22def", "abc:def@ghi", "abc?x=1&y=2", 'a b"c\\d%', "abc/def", "abc=def", "abc&def"];
for (const password of passwords) {
  test(`clean synthetic credential case ${JSON.stringify(password)} never reaches output`, () => {
    const env = environment(password), output = serializeServiceRoleForensic(classify(), env);
    assert.ok(!output.includes(password)); assert.ok(!output.includes(encodeURIComponent(password)));
    assert.ok(!output.includes(JSON.stringify(password).slice(1, -1))); assert.ok(!output.includes(env[SERVICE_FORENSIC_VARIABLES[5]]));
  });
  for (const form of ["raw", "encoded", "json", "url", "driver"]) test(`unsafe ${form} synthetic credential is discarded before output`, async () => {
    const env = environment(password), value = form === "raw" ? password : form === "encoded" ? encodeURIComponent(password) : form === "json" ? JSON.stringify(password)
      : form === "url" ? env[SERVICE_FORENSIC_VARIABLES[5]] : `password=${password}`;
    const unsafe = {...classify(), driverError: value}; let stdout = "", stderr = "";
    assert.throws(() => serializeServiceRoleForensic(unsafe, env));
    const status = await runServiceRoleForensicCli(env, {run: () => unsafe, writeStdout: (s) => stdout += s, writeStderr: (s) => stderr += s});
    assert.equal(status, 1); assert.equal(stdout, ""); assert.equal(JSON.parse(stderr).classification, "BLOCKER");
    assert.ok(!stderr.includes(password)); assert.ok(!stderr.includes(encodeURIComponent(password))); assert.ok(!stderr.includes(JSON.stringify(password).slice(1, -1)));
    let errorText = "";
    assert.equal(await runServiceRoleForensicCli(env, {run: () => {throw new Error(value);}, writeStdout: () => assert.fail("unsafe success"), writeStderr: (s) => errorText += s}), 1);
    assert.ok(!errorText.includes(password)); assert.ok(!errorText.includes(encodeURIComponent(password)));
  });
}
for (const code of ["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET"]) test(`connection error ${code} never retries or leaks driver text`, async () => {
  const env = environment(), error = Object.assign(new Error(env[SERVICE_FORENSIC_VARIABLES[5]]), {code}); let calls = 0, output = "";
  const status = await runServiceRoleForensicCli(env, {run: () => {calls++; throw error;}, writeStdout: () => assert.fail("unsafe success"), writeStderr: (s) => output += s});
  assert.equal(status, 1); assert.equal(calls, 1); assert.ok(!output.includes(env[SERVICE_FORENSIC_VARIABLES[5]]));
  assert.equal(JSON.parse(output).mutationCount, 0);
});
for (const timeout of [false, true]) test(`actual process wrapper ${timeout ? "timeout" : "connection refusal"} reports UNKNOWN safely`, async () => {
  const env = environment('a b"c\\d%'); let calls = 0, text = "";
  const status = await runServiceRoleForensicCli(env, {argument: SERVICE_FORENSIC_OPERATION, git, readCheckout,
    spawn: (_program, _args, options) => {calls++; assert.match(options.input, /^begin read only;/);
      assert.equal(options.timeout, 120000); return {status: timeout ? null : 1, stdout: "", stderr: `connection refused password=${decodeURIComponent(new URL(env[SERVICE_FORENSIC_VARIABLES[5]]).password)}`,
        error: timeout ? Object.assign(new Error(env[SERVICE_FORENSIC_VARIABLES[5]]), {code: "ETIMEDOUT"}) : null};},
    writeStdout: () => assert.fail("failed process cannot succeed"), writeStderr: (s) => text += s});
  assert.equal(status, 1); assert.equal(calls, 1); const result = JSON.parse(text);
  assert.equal(result.classification, "UNKNOWN"); assert.equal(result.approval, "NOT_PERFORMED"); assert.equal(result.mutationCount, 0);
  assert.deepEqual(result.unknownChecks, ["currentProductionState"]); assert.ok(!text.includes(env[SERVICE_FORENSIC_VARIABLES[5]]));
  assert.ok(!text.includes(decodeURIComponent(new URL(env[SERVICE_FORENSIC_VARIABLES[5]]).password)));
});
