import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_SHA256,
  classifyCorePolicyInventory } from "./phase3-core-policy-contract.mjs";
import { APPROVED_CORE_POLICY_PRODUCTION_BASELINE, buildApprovedCorePolicyPreBatch } from "./phase3-core-policy-production-baseline-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { classifyCorePolicyPreAttestation } from "./phase3-core-policy-pre-attestation-contract.mjs";
import { CORE_POLICY_ATTESTATION_OPERATION, CORE_POLICY_ATTESTATION_VARIABLES,
  runProductionCorePolicyPreAttestation, runCorePolicyPreAttestationCli,
  serializeCorePolicyAttestation, assertCorePolicyArtifact } from "./run-production-core-policy-pre-attestation.mjs";

const writable = ["user_profiles", "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions"];
const tables = [...writable, "attempts", "exam_results", "rules_exam_results", "notification_events"];
function inventory(canonical = false) {
  const own = canonical ? "user_id = reflab_private.request_user_id()" : "user_id = public.platform_request_user_id()";
  const admin = canonical ? "reflab_private.is_super_admin()" : "public.platform_is_super_admin()";
  return { tables: tables.map((table) => ({ table, schema: "public", owner: "postgres", rls: true, force: false, installer_authority: true })),
    table_acl: [{ table: "attempts", grantee: "service_role", grantor: "postgres", privilege: "SELECT", grantable: false }],
    column_acl: [{ table: "user_profiles", column: "user_id", grantee: "reflab_rls_owner", grantor: "postgres", privilege: "SELECT", grantable: false }],
    policies: tables.flatMap((table, index) => (writable.includes(table) ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT"])
      .map((command, n) => ({ oid: 100 + index * 3 + n, schema: "public", table,
        name: `${table}_own_${{ SELECT: "read", INSERT: "insert", UPDATE: "update" }[command]}`,
        command, permissive: true, roles: ["authenticated"], using: command === "SELECT" ? `${own} or ${admin}` : command === "UPDATE" ? own : null,
        withCheck: command === "SELECT" ? null : own }))).concat(canonical ? [] : [
          ["notification_events", "Users can read own notification events", "SELECT"],
          ["match_preparations", "match_preparations_authenticated_manage_own", "ALL"],
          ["post_match_reviews", "post_match_reviews_authenticated_manage_own", "ALL"],
        ].map(([table, name, command], i) => ({ oid: 900 + i, schema: "public", table, name, command,
          roles: ["authenticated"], permissive: true,
          using: "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))",
          withCheck: command === "ALL" ? "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))" : null }))),
    productFingerprint: "a".repeat(32), protectedObjectsHash: "b".repeat(32), phase4Absent: true, cutoverAbsent: true, runtimeDisabled: true };
}
const approval = { reviewed: true, projectRef: "nagjddldrldwavmfaytc", migrationSha: CORE_POLICY_SHA256, inventory: inventory() };
function evidence(payload = inventory()) {
  return new Map([["read_only_guard", "on"], [CORE_POLICY_QUERY_ID, payload],
    [CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID, { counts: { attempts: 37, exam_results: 6, notification_events: 60, clips: 30, ledger_rows: 4, schema_state_rows: 0 },
      checks: { canonicalMarkerAbsent: true, developmentObjectsAbsent: true }, ledger_rows: [{ phase_order: 4, phase_key: "canonical_objects" }] }]]);
}
// Only unit-level composition is stubbed. The disposable PG17 rehearsal exercises
// the full authoritative predecessor classifier with actual catalog evidence.
const composition = { classifyIdentity: () => ({ classification: "EXACT", checks: { exact: true }, failedChecks: [] }),
  classifyCore: (e, b) => classifyCorePolicyInventory(e.get(CORE_POLICY_QUERY_ID), b, true),
  classifyBaseline: () => ({}),
  validateApproval: (a) => {
    const valid = a?.reviewed === true && a?.projectRef === "nagjddldrldwavmfaytc"
      && a?.migrationSha === CORE_POLICY_SHA256 && a?.inventory != null;
    return { classification: valid ? "EXACT" : "BLOCKER", checks: { fixtureApprovalExact: valid } };
  } };
const classify = (e, a = approval, d = composition) => classifyCorePolicyPreAttestation(e, a, d);

test("independently approved historical PRE and canonical POST remain distinct", () => {
  assert.equal(classify(evidence()).classification, "64245_PRE_EXECUTABLE_EXACT");
  assert.equal(classify(evidence(inventory(true))).classification, "64245_ALREADY_INSTALLED_POST");
});
test("Production lineage pins four historical targets and eighteen missing slots", () => {
  const p = inventory();
  p.policies = p.policies.filter((r) => r.oid >= 900 || r.command === "SELECT"
    && ["user_profiles", "attempts", "exam_results", "rules_exam_results"].includes(r.table));
  const a = { ...approval, inventory: structuredClone(p) };
  assert.equal(classify(evidence(p), a).classification, "64245_PRE_EXECUTABLE_EXACT");
  const changed = structuredClone(p); changed.policies.splice(0, 1);
  assert.equal(classify(evidence(changed), a).classification, "BLOCKER");
  for (const name of ["Users can read own notification events", "match_preparations_authenticated_manage_own", "post_match_reviews_authenticated_manage_own"]) {
    const drift = structuredClone(p); drift.policies = drift.policies.filter((r) => r.name !== name);
    assert.equal(classify(evidence(drift), a).classification, "BLOCKER");
  }
});
test("no baseline or unreviewed/wrong-project approval cannot authorize itself", () => {
  for (const a of [null, {}, { ...approval, reviewed: false }, { ...approval, projectRef: "other" }, { ...approval, migrationSha: "wrong" }]) {
    const r = classify(evidence(), a);
    assert.equal(r.classification, "BLOCKER");
    assert.ok(r.failedChecks.includes("productionBaselineApproved"));
    assert.equal(r.tableSecurityState.tables.length, 10);
    assert.equal(r.targetPolicyState.policies.length, 22);
  }
});
for (const [name, change] of [
  ["expression", (p) => { p.policies[0].using = "true"; }],
  ["role", (p) => { p.policies[0].roles = ["anon"]; }],
  ["PUBLIC exposure", (p) => { p.policies[0].roles = ["PUBLIC"]; }],
  ["restrictive", (p) => { p.policies[0].permissive = false; }],
  ["command", (p) => { p.policies[0].command = "DELETE"; }],
  ["WITH CHECK", (p) => { p.policies[1].withCheck = "true"; }],
  ["owner", (p) => { p.tables[0].owner = "anon"; }],
  ["RLS", (p) => { p.tables[0].rls = false; }],
  ["FORCE", (p) => { p.tables[0].force = true; }],
  ["table ACL", (p) => { p.table_acl = []; }],
  ["column ACL", (p) => { p.column_acl = []; }],
  ["non-target ambiguity", (p) => { p.policies.push({ ...p.policies[0], name: "unapproved", oid: 999 }); }],
  ["duplicate policy", (p) => { p.policies.push({ ...p.policies[0] }); }],
  ["runtime", (p) => { p.runtimeDisabled = false; }],
  ["cutover", (p) => { p.cutoverAbsent = false; }],
  ["Phase4", (p) => { p.phase4Absent = false; }],
  ["historical semantic fingerprint", (p) => { p.productFingerprint = "c".repeat(32); }],
  ["protected security fingerprint", (p) => { p.protectedObjectsHash = "c".repeat(32); }],
]) test(`unsupported ${name} blocks`, () => {
  const p = inventory(); change(p); assert.equal(classify(evidence(p)).classification, "BLOCKER");
});
for (const field of ["attempts", "exam_results", "notification_events", "clips", "ledger_rows", "schema_state_rows"])
  test(`${field} drift blocks`, () => {
    const e = evidence(); e.get(CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID).counts[field]++;
    assert.equal(classify(e).classification, "BLOCKER");
  });
for (const field of ["canonicalMarkerAbsent", "developmentObjectsAbsent"])
  test(`${field} drift blocks`, () => {
    const e = evidence(); e.get(CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID).checks[field] = false;
    assert.equal(classify(e).classification, "BLOCKER");
  });
test("64236 drift blocks independently of policy exactness", () => {
  assert.equal(classify(evidence(), approval, { ...composition, classifyIdentity: () => ({ classification: "BLOCKER" }) }).classification, "BLOCKER");
});
test("malformed inventory is BLOCKER, never executable", () => {
  const e = evidence(); e.set(CORE_POLICY_QUERY_ID, {});
  assert.equal(classify(e).classification, "BLOCKER");
});
test("observations are projected; product rows and function bodies cannot pass through", () => {
  const p = inventory(); p.productRows = [{ secret: "DO_NOT_PRINT" }]; p.prosrc = "DO_NOT_PRINT";
  p.tables[0].password = "DO_NOT_PRINT";
  assert.doesNotMatch(JSON.stringify(classify(evidence(p))), /DO_NOT_PRINT|productRows|prosrc|password/);
});

const head = "a".repeat(40);
function environment(extra = {}) {
  return { ...Object.fromEntries(CORE_POLICY_ATTESTATION_VARIABLES.slice(0, 3).map((k) => [k, "true"])),
    [CORE_POLICY_ATTESTATION_VARIABLES[3]]: "nagjddldrldwavmfaytc", [CORE_POLICY_ATTESTATION_VARIABLES[4]]: head,
    [CORE_POLICY_ATTESTATION_VARIABLES[5]]: "postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require", ...extra };
}
function dependencies(extra = {}) {
  return { argument: CORE_POLICY_ATTESTATION_OPERATION, git: (a) => a[0] === "rev-parse" ? head : "",
    assertBaseline: () => APPROVED_CORE_POLICY_PRODUCTION_BASELINE,
    executeReadOnly: () => new Map([["read_only_guard", "on"]]), ...extra };
}
async function failure(e, d, reason) {
  let output = "";
  const code = await runCorePolicyPreAttestationCli(e, { ...d, writeStdout: () => assert.fail("unexpected success output"), writeStderr: (s) => { output += s; } });
  assert.equal(code, 1); assert.equal(JSON.parse(output).reason, reason);
  assert.doesNotMatch(output, /fixture-password|postgresql:\/\/|PGPASSWORD/);
}
test("exact operation required before any IO", async () => failure(environment(), dependencies({ argument: "wrong", git: () => assert.fail() }), "OPERATION_NOT_AUTHORIZED"));
for (const name of CORE_POLICY_ATTESTATION_VARIABLES.slice(0, 3))
  test(`missing ${name} rejected`, async () => failure(environment({ [name]: undefined }), dependencies(), "OPT_IN_REQUIRED"));
for (const name of ["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_CUTOVER", "ALLOW_PRODUCTION_OTHER", "REFLAB_PRODUCTION_DDL_DB_URL", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD"])
  test(`${name} rejected by presence`, async () => failure(environment({ [name]: "" }), dependencies(), "DDL_CONFIGURATION_REJECTED"));
for (const name of ["PGHOST", "PGPASSWORD", "PGOPTIONS", "PGSERVICE"])
  test(`${name} contamination rejected`, async () => failure(environment({ [name]: "" }), dependencies(), "INHERITED_PG_STATE"));
test("wrong HEAD", async () => failure(environment({ [CORE_POLICY_ATTESTATION_VARIABLES[4]]: "b".repeat(40) }), dependencies(), "HEAD_MISMATCH"));
for (const status of [" M package.json", "M  package.json", "?? unknown"])
  test(`dirty tree ${status}`, async () => failure(environment(), dependencies({ git: (a) => a[0] === "rev-parse" ? head : status }), "WORKTREE_DIRTY"));
test("wrong migration hash", async () => failure(environment(), dependencies({ assertArtifact: () => { throw new Error("bad bytes"); } }), "REPOSITORY_ARTIFACT_MISMATCH"));
test("wrong project", async () => failure(environment({ [CORE_POLICY_ATTESTATION_VARIABLES[3]]: "wrong" }), dependencies(), "TARGET_MISMATCH"));
for (const [name, transform] of [
  ["host", (s) => s.replace("aws-1-sa-east-1.pooler.supabase.com", "example.invalid")],
  ["direct host", (s) => s.replace("aws-1-sa-east-1.pooler.supabase.com", "db.nagjddldrldwavmfaytc.supabase.co")],
  ["port", (s) => s.replace(":5432/", ":6543/")],
  ["database", (s) => s.replace("/postgres?", "/template1?")],
  ["installer", (s) => s.replace("postgres.nagjddldrldwavmfaytc", "service_role")],
  ["SSL", (s) => s.replace("sslmode=require", "sslmode=disable")],
]) test(`wrong ${name}`, async () => failure(environment({ [CORE_POLICY_ATTESTATION_VARIABLES[5]]: transform(environment()[CORE_POLICY_ATTESTATION_VARIABLES[5]]) }), dependencies(), "TARGET_MISMATCH"));
test("result shape and READ ONLY are required", async () => {
  await failure(environment(), dependencies({ executeReadOnly: () => ({}) }), "QUERY_RESULT_SHAPE_MISMATCH");
  await failure(environment(), dependencies({ executeReadOnly: () => new Map() }), "READ_ONLY_GUARD_FAILED");
});
test("one bounded read-only batch; incomplete evidence remains BLOCKER with integrated baseline", () => {
  let calls = 0;
  const report = runProductionCorePolicyPreAttestation(environment(), dependencies({ executeReadOnly: (sql) => {
    calls++; assert.equal(sql, buildApprovedCorePolicyPreBatch()); return evidence();
  } }));
  assert.equal(calls, 1); assert.equal(report.classification, "BLOCKER");
  assert.equal(report.checks.productionBaselineApproved, true);
  assert.equal(report.baselineApproval.status, "INTEGRATED_APPROVED_TRANSITION");
});
test("credentials and URLs are rejected before output", () => {
  for (const value of ["fixture-password", environment()[CORE_POLICY_ATTESTATION_VARIABLES[5]], "https://example.invalid/private"])
    assert.throws(() => serializeCorePolicyAttestation({ value }, environment()));
});
test("batch contains no mutation and is bounded by BEGIN READ ONLY / ROLLBACK", () => {
  const sql = buildApprovedCorePolicyPreBatch();
  assert.match(sql, /^begin read only;/); assert.match(sql, /rollback;\s*$/);
  assert.equal((sql.match(/begin read only;/g) ?? []).length, 1);
  assert.match(sql, /statement_timeout = '15s'/); assert.match(sql, /lock_timeout = '2s'/);
  assert.match(sql, /transaction_read_only/);
  assert.doesNotMatch(sql, /^\s*(insert|update|delete|create|alter|grant|revoke|notify|set role|truncate)\b/im);
});
test("artifact pin and command are exact; runner has no migration execution path", () => {
  assert.doesNotThrow(assertCorePolicyArtifact);
  const source = readFileSync(new URL("./run-production-core-policy-pre-attestation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /executeMigration|executeDdl|\.sql.*--file|64249/);
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url)));
  assert.equal(pkg.scripts["attest:production-core-policy-pre"], "node scripts/production-adoption/phase3/run-production-core-policy-pre-attestation.mjs --production-core-policy-pre-attestation");
});
for (const [name, processResult, reason] of [
  ["missing psql", { error: { code: "ENOENT" }, status: null, stderr: "fixture-password" }, "PSQL_NOT_FOUND"],
  ["authentication", { status: 2, stderr: "FATAL: 28P01: password authentication failed fixture-password" }, "AUTHENTICATION_FAILED"],
  ["timeout", { status: 1, stderr: "ERROR: 57014: canceling statement due to statement timeout" }, "TIMEOUT"],
  ["SQLSTATE", { status: 1, stderr: "ERROR: 42501: fixture-password private details" }, "SQLSTATE_42501"],
  ["host resolution", { status: 2, stderr: "could not translate host name fixture-password" }, "HOST_RESOLUTION_FAILED"],
  ["TLS", { status: 2, stderr: "SSL certificate failed fixture-password" }, "TLS_FAILED"],
  ["connection", { status: 2, stderr: "connection refused fixture-password" }, "CONNECTION_FAILED"],
]) test(`safe process observability: ${name}`, async () => {
  const d = dependencies({ spawn: () => processResult }); delete d.executeReadOnly;
  await failure(environment(), d, reason);
});
test("output failures do not print exception details", async () => {
  await failure(environment(), dependencies({ run: () => { throw new Error("postgresql://private:fixture-password@example.invalid/db"); } }), "LOCAL_PROGRAMMING_ERROR");
});
test("CLI emits structured BLOCKER with complete safe inventory rather than a generic abort", async () => {
  let output = "";
  const code = await runCorePolicyPreAttestationCli(environment(), dependencies({ run: () => classify(evidence(), null),
    writeStdout: (s) => { output += s; }, writeStderr: () => assert.fail() }));
  assert.equal(code, 1); assert.equal(JSON.parse(output).tableSecurityState.tables.length, 10);
});
