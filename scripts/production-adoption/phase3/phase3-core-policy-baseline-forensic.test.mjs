import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID, buildCorePolicyBaselineForensicBatch,
  classifyCorePolicyBaselineObservation } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CORE_BASELINE_FORENSIC_OPERATION, CORE_BASELINE_FORENSIC_VARIABLES,
  runProductionCorePolicyBaselineForensic, runCorePolicyBaselineForensicCli } from "./run-production-core-policy-baseline-forensic.mjs";

const writable = ["user_profiles", "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions"];
const tables = [...writable, "attempts", "exam_results", "rules_exam_results", "notification_events"];
function fixture() {
  return new Map([["read_only_guard", "on"],
    [INSTALLER_IDENTITY_QUERY_ID, { caller: "postgres", session_user: "postgres", database: { name: "postgres" }, server_version_num: 170011,
      installer: { rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true, rolsuper: false,
        rolcreatedb: true, rolbypassrls: true, rolreplication: true } }],
    [IDENTITY_BRIDGE_POST_QUERY_ID, { functions: [{ signature: "reflab_private.request_user_id()", identity_arguments: "", result_type: "text",
      language: "sql", volatility: "s", strict: false, security_definer: false, leakproof: false, kind: "f", owner: "postgres",
      configuration: ["search_path=pg_catalog"], proacl: ["postgres=X/postgres"], source_hash: "a".repeat(64) }],
      acl: [{ signature: "reflab_private.request_user_id()", grantee: "postgres", grantor: "postgres", privilege: "EXECUTE", grantable: false }],
      rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0 }],
    [CORE_BASELINE_ADOPTION_QUERY_ID, { ledgerRows: [{ phase_order: 4, phase_key: "canonical_objects" }], schemaStateRows: [], canonicalMarkerAbsent: true,
      historicalCounts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30 },
      developmentObjects: { identity: false, resolve: false, link: false, admin: false },
      schemaCreatePrivileges: ["public", "reflab_private"].flatMap((schema) => ["postgres", "reflab_rls_owner", "anon", "authenticated"]
        .map((role) => ({ schema, role, create: role === "postgres" }))) }],
    [CORE_POLICY_QUERY_ID, { tables: tables.map((table) => ({ schema: "public", table, owner: "postgres", rls: true, force: false, installer_authority: true })),
      policies: tables.flatMap((table, i) => (writable.includes(table) ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT"]).map((command, j) => ({
        schema: "public", table, oid: 100 + i * 3 + j, name: `${table}_own_${{ SELECT: "read", INSERT: "insert", UPDATE: "update" }[command]}`,
        command, permissive: true, roles: ["authenticated"], using: command === "INSERT" ? null : "user_id = public.platform_request_user_id()" + (command === "SELECT" ? " or public.platform_is_super_admin()" : ""),
        withCheck: command === "SELECT" ? null : "user_id = public.platform_request_user_id()" }))),
      table_acl: [{ table: "attempts", grantee: "anon", grantor: "postgres", privilege: "TRUNCATE", grantable: false },
        { table: "attempts", grantee: "authenticated", grantor: "postgres", privilege: "MAINTAIN", grantable: false }],
      column_acl: [{ table: "user_profiles", column: "user_id", grantee: "reflab_rls_owner", grantor: "postgres", privilege: "SELECT", grantable: false }],
      productFingerprint: "a".repeat(32), protectedObjectsHash: "b".repeat(32), phase4Absent: true, cutoverAbsent: true, runtimeDisabled: true }]]);
}
const observe = (e = fixture()) => classifyCorePolicyBaselineObservation(e, { targetExact: true });
test("complete observation is not PRE approval", () => {
  const r = observe(); assert.equal(r.classification, "OBSERVATION_COMPLETE"); assert.equal(r.approval, "NOT_PERFORMED");
  assert.equal(r.tableSecurityInventory.length, 10); assert.equal(r.targetPolicyInventory.length, 22);
  assert.equal(r.targetedObservedPolicies, 22); assert.deepEqual(r.missingTargetSlots, []);
  assert.doesNotMatch(JSON.stringify(r), /64245_PRE_EXECUTABLE_EXACT|CURRENTLY_ATTESTED_EXECUTABLE_EXACT/);
});
test("missing slots are explicit; they are not collection failure", () => {
  const e = fixture(); e.get(CORE_POLICY_QUERY_ID).policies.splice(0, 2);
  const r = observe(e); assert.equal(r.classification, "OBSERVATION_COMPLETE");
  assert.equal(r.targetedObservedPolicies, 20); assert.equal(r.missingTargetSlots.length, 2); assert.equal(r.targetPolicyInventory.length, 22);
});
test("unfamiliar target expression is observed without security adjudication", () => {
  const e = fixture(); e.get(CORE_POLICY_QUERY_ID).policies[0].using = "true";
  const r = observe(e); assert.equal(r.classification, "OBSERVATION_COMPLETE");
  assert.equal(r.targetPolicyInventory.find((p) => p.name === "user_profiles_own_read").expressionClass, "UNRECOGNIZED_EXPRESSION");
});
test("non-target count is observed independently, not pinned to eighteen", () => {
  const e = fixture(); const p = e.get(CORE_POLICY_QUERY_ID);
  for (let i = 0; i < 19; i++) p.policies.push({ ...p.policies[0], oid: 1000 + i, name: `observed_${i}`, roles: ["PUBLIC"], using: "true" });
  const r = observe(e); assert.equal(r.classification, "OBSERVATION_COMPLETE");
  assert.equal(r.nonTargetPolicyInventory.length, 19);
  assert.ok(r.nonTargetPolicyInventory.every((p) => p.intendedEffect === "PRESERVE" && p.using === "true"));
});
test("complete ACLs retain security-relevant privileges and grantors", () => {
  const r = observe(); assert.equal(r.tableAclInventory.length, 2); assert.equal(r.columnAclInventory.length, 1);
  assert.deepEqual(new Set(r.tableAclInventory.map((a) => a.privilege)), new Set(["TRUNCATE", "MAINTAIN"]));
  assert.equal(r.columnAclInventory[0].column, "user_id"); assert.equal(r.columnAclInventory[0].grantor, "postgres");
});
test("all function metadata and ACLs are reported without bodies", () => {
  const e = fixture(); e.get(IDENTITY_BRIDGE_POST_QUERY_ID).functions[0].source_definition = "DO_NOT_PRINT";
  const r = observe(e); assert.equal(r.predecessor64236State.functions[0].source_hash, "a".repeat(64));
  assert.equal(r.predecessor64236State.executeAcl.length, 1); assert.equal(r.predecessor64236State.schemaCreatePrivileges.length, 8);
  assert.equal(r.predecessor64236State.functionPresence.length, 5); assert.doesNotMatch(JSON.stringify(r), /DO_NOT_PRINT|source_definition/);
});
test("adoption drift is observed, not silently approved or rejected as unsafe", () => {
  const e = fixture(); e.get(CORE_BASELINE_ADOPTION_QUERY_ID).schemaStateRows.push({ baseline_version: "observed" });
  e.get(CORE_POLICY_QUERY_ID).runtimeDisabled = false;
  const r = observe(e); assert.equal(r.classification, "OBSERVATION_COMPLETE");
  assert.equal(r.adoptionState.schemaStateRowCount, 1); assert.equal(r.adoptionState.runtimeDisabled, false);
});
for (const [name, change] of [
  ["table missing", (e) => { e.get(CORE_POLICY_QUERY_ID).tables.pop(); }],
  ["policy evidence absent", (e) => { delete e.get(CORE_POLICY_QUERY_ID).policies; }],
  ["column ACL incomplete", (e) => { e.get(CORE_POLICY_QUERY_ID).column_acl = null; }],
  ["table ACL incomplete", (e) => { delete e.get(CORE_POLICY_QUERY_ID).table_acl; }],
  ["adoption query missing", (e) => { e.delete(CORE_BASELINE_ADOPTION_QUERY_ID); }],
  ["identity query missing", (e) => { e.delete(IDENTITY_BRIDGE_POST_QUERY_ID); }],
  ["not read only", (e) => { e.set("read_only_guard", "off"); }],
  ["wrong installer", (e) => { e.get(INSTALLER_IDENTITY_QUERY_ID).caller = "service_role"; }],
  ["superuser installer", (e) => { e.get(INSTALLER_IDENTITY_QUERY_ID).installer.rolsuper = true; }],
  ["wrong PG major", (e) => { e.get(INSTALLER_IDENTITY_QUERY_ID).server_version_num = 180000; }],
]) test(`${name} is an objective collection blocker`, () => { const e = fixture(); change(e); assert.equal(observe(e).classification, "BLOCKER"); });

const head = "a".repeat(40);
function env(extra = {}) {
  return { ...Object.fromEntries(CORE_BASELINE_FORENSIC_VARIABLES.slice(0, 3).map((k) => [k, "true"])),
    [CORE_BASELINE_FORENSIC_VARIABLES[3]]: "nagjddldrldwavmfaytc", [CORE_BASELINE_FORENSIC_VARIABLES[4]]: head,
    [CORE_BASELINE_FORENSIC_VARIABLES[5]]: "postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require", ...extra };
}
function deps(extra = {}) { return { argument: CORE_BASELINE_FORENSIC_OPERATION,
  git: (args) => args[0] === "rev-parse" ? head : "", executeReadOnly: () => fixture(), ...extra }; }
async function fails(environment, dependencies, reason) {
  let output = "";
  assert.equal(await runCorePolicyBaselineForensicCli(environment, { ...dependencies, writeStdout: () => assert.fail(), writeStderr: (s) => { output += s; } }), 1);
  assert.equal(JSON.parse(output).reason, reason); assert.doesNotMatch(output, /fixture-password|postgresql:\/\/|PGPASSWORD/);
}
test("exact authorization executes one read-only batch only", () => {
  let calls = 0;
  const r = runProductionCorePolicyBaselineForensic(env(), deps({ executeReadOnly: (sql) => { calls++; assert.equal(sql, buildCorePolicyBaselineForensicBatch()); return fixture(); } }));
  assert.equal(calls, 1); assert.equal(r.classification, "OBSERVATION_COMPLETE"); assert.equal(r.mutationCount, 0);
});
test("exact operation required", async () => fails(env(), deps({ argument: "wrong" }), "OPERATION_NOT_AUTHORIZED"));
for (const key of CORE_BASELINE_FORENSIC_VARIABLES.slice(0, 3)) test(`required ${key}`, async () => fails(env({ [key]: "false" }), deps(), "OPT_IN_REQUIRED"));
for (const key of ["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_CORE_POLICY_PRE_ATTESTATION", "ALLOW_PRODUCTION_CUTOVER", "REFLAB_PRODUCTION_DDL_DB_URL", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD"])
  test(`reject ${key} by presence`, async () => fails(env({ [key]: "" }), deps(), "DDL_CONFIGURATION_REJECTED"));
for (const key of ["PGHOST", "PGPASSWORD", "PGOPTIONS", "PGSERVICE"])
  test(`reject inherited ${key}`, async () => fails(env({ [key]: "" }), deps(), "INHERITED_PG_STATE"));
test("wrong HEAD", async () => fails(env({ [CORE_BASELINE_FORENSIC_VARIABLES[4]]: "b".repeat(40) }), deps(), "HEAD_MISMATCH"));
for (const status of [" M package.json", "M  package.json", "?? new"])
  test(`dirty tree ${status}`, async () => fails(env(), deps({ git: (a) => a[0] === "rev-parse" ? head : status }), "WORKTREE_DIRTY"));
test("wrong project", async () => fails(env({ [CORE_BASELINE_FORENSIC_VARIABLES[3]]: "wrong" }), deps(), "TARGET_MISMATCH"));
for (const [name, mutate] of [
  ["host", (s) => s.replace("aws-1-sa-east-1.pooler.supabase.com", "example.invalid")],
  ["direct host", (s) => s.replace("aws-1-sa-east-1.pooler.supabase.com", "db.nagjddldrldwavmfaytc.supabase.co")],
  ["port", (s) => s.replace(":5432/", ":6543/")],
  ["database", (s) => s.replace("/postgres?", "/template1?")],
  ["installer", (s) => s.replace("postgres.nagjddldrldwavmfaytc", "service_role")],
  ["SSL", (s) => s.replace("sslmode=require", "sslmode=disable")],
]) test(`wrong ${name}`, async () => fails(env({ [CORE_BASELINE_FORENSIC_VARIABLES[5]]: mutate(env()[CORE_BASELINE_FORENSIC_VARIABLES[5]]) }), deps(), "TARGET_MISMATCH"));
test("read-only guard required even with successful process result", async () => fails(env(), deps({ executeReadOnly: () => new Map() }), "READ_ONLY_GUARD_FAILED"));
test("safe bounded psql errors", async () => {
  const d = deps({ spawn: () => ({ status: 1, stderr: "ERROR: 57014: fixture-password secret query" }) }); delete d.executeReadOnly;
  await fails(env(), d, "TIMEOUT");
});
test("URL/password redaction rejects output before anything is printed", async () => {
  for (const value of ["fixture-password", env()[CORE_BASELINE_FORENSIC_VARIABLES[5]]])
    await fails(env(), deps({ run: () => ({ classification: "OBSERVATION_COMPLETE", value }) }), "LOCAL_PROGRAMMING_ERROR");
});
test("CLI cannot emit executable PRE classification", async () => fails(env(), deps({ run: () => ({ classification: "64245_PRE_EXECUTABLE_EXACT" }) }), "LOCAL_PROGRAMMING_ERROR"));
test("single bounded SELECT-only transaction with no migration path", () => {
  const sql = buildCorePolicyBaselineForensicBatch();
  assert.match(sql, /^begin read only;/); assert.match(sql, /rollback;\s*$/); assert.equal((sql.match(/begin read only;/g) ?? []).length, 1);
  assert.match(sql, /statement_timeout = '15s'/); assert.match(sql, /lock_timeout = '2s'/); assert.match(sql, /transaction_read_only/);
  assert.doesNotMatch(sql, /^\s*(create|alter|drop|insert|update|delete|truncate|grant|revoke|notify|set role)\b/im);
  const source = readFileSync(new URL("./run-production-core-policy-baseline-forensic.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /executeMigration|executeDdl|64249|classifyCorePolicyPreAttestation/);
});
test("PRE approval requires the adjudicated committed artifact; forensic remains observation-only", () => {
  const runner = readFileSync(new URL("./run-production-core-policy-pre-attestation.mjs", import.meta.url), "utf8");
  assert.match(runner, /assertCorePolicyCommittedBaseline/);
  assert.match(runner, /BASELINE_ARTIFACT", "REPOSITORY_ARTIFACT_MISMATCH/);
  const contract = readFileSync(new URL("./phase3-core-policy-pre-attestation-contract.mjs", import.meta.url), "utf8");
  assert.match(contract, /validateCorePolicyProductionApproval/);
  assert.doesNotMatch(contract, /PRODUCTION_BASELINE_REVIEW_REQUIRED/);
  assert.equal(observe(fixture()).approval, "NOT_PERFORMED");
});
test("legacy retirement is an observation label, never approval", () => {
  const e = fixture(); const p = e.get(CORE_POLICY_QUERY_ID);
  p.policies.push({ ...p.policies[0], table: "notification_events", name: "Users can read own notification events", oid: 999 });
  const r = observe(e);
  assert.equal(r.classification, "OBSERVATION_COMPLETE");
  assert.equal(r.nonTargetPolicyInventory[0].intendedEffect, "RETIRE_IF_EXACT_APPROVED_PRE");
  assert.equal(r.approval, "NOT_PERFORMED");
});
