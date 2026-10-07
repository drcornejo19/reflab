import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { IDENTITY_SECURITY_BRIDGE_ARTIFACT, IDENTITY_SECURITY_BRIDGE_SHA256,
  assertIdentitySecurityBridgeArtifact } from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";
import { buildIdentitySecurityBridgePreBatch } from "./run-production-identity-security-bridge-pre-attestation.mjs";
import { buildIdentityBridgePostBatch, identityBridgePostQueries } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { IDENTITY_BRIDGE_OPERATION, IDENTITY_BRIDGE_OPT_IN, runProductionIdentitySecurityBridge,
  runProductionIdentitySecurityBridgeCli } from "./run-production-phase3-identity-security-bridge.mjs";

const root = resolve(import.meta.dirname, "../../..");
const source = readFileSync(resolve(import.meta.dirname, "run-production-phase3-identity-security-bridge.mjs"), "utf8");
const head = "a".repeat(40);
function environment(overrides = {}) {
  return { ALLOW_PRODUCTION_DDL: "true", [IDENTITY_BRIDGE_OPT_IN]: "true",
    REFLAB_PRODUCTION_DDL_PROJECT_REF: "nagjddldrldwavmfaytc", REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head,
    REFLAB_PRODUCTION_DDL_DB_URL: "postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    ...overrides };
}
function fixture(overrides = {}) {
  const events = [];
  const state = { migrationCalls: 0, events };
  const dependencies = { argument: IDENTITY_BRIDGE_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    executeReadOnly: (batch) => { events.push(batch.includes("phase3_identity_security_bridge_post") ? "POST" : "PRE"); return new Map(); },
    classifyPre: () => ({ classification: "64236_PRE_EXACT" }),
    classifyPost: () => ({ classification: "EXACT" }),
    executeMigration: (sql) => { state.migrationCalls++; events.push("MIGRATION"); assert.match(sql, /commit;/); },
    ...overrides };
  return { state, dependencies };
}
async function fails(env, deps, expectedStage, expectedReason) {
  let output = "";
  const exit = await runProductionIdentitySecurityBridgeCli(env, { ...deps,
    writeStdout: () => assert.fail("success output reached"), writeStderr: (s) => { output += s; } });
  assert.equal(exit, 1);
  const report = JSON.parse(output);
  assert.equal(report.stage, expectedStage);
  if (expectedReason) assert.equal(report.reason, expectedReason);
  assert.doesNotMatch(output, /fixture-password|postgresql:\/\/|PGPASSWORD/);
  return report;
}
test("exact operation, command registration and pinned artifact", () => {
  assert.equal(IDENTITY_BRIDGE_OPERATION, "--production-phase3-identity-security-bridge");
  assert.equal(IDENTITY_BRIDGE_OPT_IN, "ALLOW_PRODUCTION_PHASE3_IDENTITY_SECURITY_BRIDGE");
  assert.equal(assertIdentitySecurityBridgeArtifact(root).sha256, IDENTITY_SECURITY_BRIDGE_SHA256);
  assert.match(JSON.parse(readFileSync(resolve(root, "package.json"))).scripts["run:production-phase3-identity-security-bridge"], /run-production-phase3-identity-security-bridge\.mjs --production-phase3-identity-security-bridge$/);
});
test("PRE and POST are bounded read-only batches", () => {
  for (const sql of [buildIdentitySecurityBridgePreBatch(), buildIdentityBridgePostBatch()]) {
    assert.match(sql, /^begin read only;/);
    assert.match(sql, /statement_timeout = '15s'/);
    assert.match(sql, /lock_timeout = '2s'/);
    assert.match(sql, /transaction_read_only/);
    assert.match(sql, /rollback;\s*$/);
    assert.doesNotMatch(sql, /^\s*(insert|update|delete|create|alter|grant|revoke|notify|set role)\b/im);
  }
});
test("POST stage transition changes only reviewed request_user_id absence", () => {
  for (const q of identityBridgePostQueries.filter((q) => /canonical_runtime_prerequisites_post|admin_canonical_access_post|canonical_runtime_installed_post/.test(q.id))) {
    assert.match(q.payloadSql, /to_regprocedure\('reflab_private.request_user_id\(\)'\) is not null/);
    assert.match(q.payloadSql, /to_regprocedure\('reflab_private.set_updated_at\(\)'\) is null/);
    assert.match(q.payloadSql, /to_regrole\('reflab_pre_cutover_evidence_owner'\) is null/);
  }
  assert.match(buildIdentitySecurityBridgePreBatch(), /to_regprocedure\('reflab_private.request_user_id\(\)'\) is null/);
});
test("Phase2A POST adapts only the installed identity boundary, not sidecar or cutover", () => {
  const query = identityBridgePostQueries.find((q) => q.id === "phase2a_semantic_audit_post_attestation");
  assert.ok(query);
  assert.match(query.payloadSql, /to_regprocedure\('reflab_private.request_user_id\(\)'\) is not null/);
  assert.match(query.payloadSql, /to_regprocedure\('reflab_private.set_updated_at\(\)'\) is null/);
  assert.match(query.payloadSql, /to_regrole\('reflab_pre_cutover_evidence_owner'\) is null/);
  assert.match(query.payloadSql, /'auditFunctionExact'/);
  assert.match(query.payloadSql, /'functionExecuteAclExact'/);
});
test("happy path invokes only PRE -> migration once -> POST -> stop", () => {
  const f = fixture(); const report = runProductionIdentitySecurityBridge(environment(), f.dependencies);
  assert.deepEqual(f.state.events, ["PRE", "MIGRATION", "POST"]);
  assert.equal(f.state.migrationCalls, 1);
  assert.equal(report.postDdl.contract, "EXACT");
  assert.equal(report.nextProvider, "NOT_AUTHORIZED");
  assert.equal(report.cutover, "NOT_AUTHORIZED");
});
test("wrong/missing operation stops before any IO", async () => {
  const f = fixture({ argument: "--wrong", git: () => assert.fail("git reached") });
  await fails(environment(), f.dependencies, "AUTHORIZATION", "OPERATION_NOT_AUTHORIZED");
  assert.equal(f.state.migrationCalls, 0);
});
for (const name of ["ALLOW_PRODUCTION_DDL", IDENTITY_BRIDGE_OPT_IN]) {
  for (const value of [undefined, "false"]) test(`${name}=${value} blocked`, async () => {
    const f = fixture(); const e = environment({ [name]: value });
    await fails(e, f.dependencies, "AUTHORIZATION", "OPT_IN_REQUIRED");
    assert.equal(f.state.migrationCalls, 0);
  });
}
for (const name of ["ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED", "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT",
  "ALLOW_PRODUCTION_CUTOVER", "REFLAB_PRODUCTION_DDL_SQL", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL"]) {
  test(`configuration contamination ${name} rejected by presence`, async () => {
    const f = fixture(); await fails(environment({ [name]: "" }), f.dependencies, "AUTHORIZATION", "CONFLICTING_PRODUCTION_CONFIGURATION");
    assert.equal(f.state.migrationCalls, 0);
  });
}
for (const name of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGOPTIONS", "PGSERVICE"]) {
  test(`inherited ${name} rejected`, async () => {
    const f = fixture(); await fails(environment({ [name]: "contamination" }), f.dependencies, "AUTHORIZATION", "INHERITED_PG_STATE");
    assert.equal(f.state.migrationCalls, 0);
  });
}
for (const [name, url] of [
  ["direct host", "postgresql://postgres:fixture-password@db.nagjddldrldwavmfaytc.supabase.co:5432/postgres?sslmode=require"],
  ["arbitrary host", "postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@example.invalid:5432/postgres?sslmode=require"],
  ["wrong port", environment().REFLAB_PRODUCTION_DDL_DB_URL.replace(":5432/", ":6543/")],
  ["wrong database", environment().REFLAB_PRODUCTION_DDL_DB_URL.replace("/postgres?", "/template1?")],
  ["wrong installer", environment().REFLAB_PRODUCTION_DDL_DB_URL.replace("postgres.nagjddldrldwavmfaytc:", "service_role:")],
  ["SSL missing", environment().REFLAB_PRODUCTION_DDL_DB_URL.replace("?sslmode=require", "")],
]) test(name + " rejected", async () => {
  const f = fixture(); await fails(environment({ REFLAB_PRODUCTION_DDL_DB_URL: url }), f.dependencies, "TARGET", "TARGET_MISMATCH");
  assert.equal(f.state.migrationCalls, 0);
});
test("wrong project rejected", async () => {
  const f = fixture(); await fails(environment({ REFLAB_PRODUCTION_DDL_PROJECT_REF: "wrong" }), f.dependencies, "TARGET", "TARGET_MISMATCH");
});
for (const [name, value] of [["wrong HEAD", "b".repeat(40)], ["missing HEAD", undefined]]) {
  test(name + " rejected", async () => {
    const f = fixture(); await fails(environment({ REFLAB_PRODUCTION_DDL_APPROVED_HEAD: value }), f.dependencies, "AUTHORIZATION", "HEAD_MISMATCH");
    assert.equal(f.state.migrationCalls, 0);
  });
}
for (const status of [" M package.json", "M  package.json", "?? local.tmp"]) test("dirty/staged/untracked tree " + status, async () => {
  const f = fixture({ git: (a) => a[0] === "rev-parse" ? head : status });
  await fails(environment(), f.dependencies, "AUTHORIZATION", "WORKTREE_DIRTY"); assert.equal(f.state.migrationCalls, 0);
});
test("migration SHA mismatch blocks before database work", async () => {
  const f = fixture({ assertArtifact: () => ({ path: resolve(root, IDENTITY_SECURITY_BRIDGE_ARTIFACT), sha256: "0".repeat(64) }) });
  await fails(environment(), f.dependencies, "AUTHORIZATION", "ARTIFACT_HASH_MISMATCH"); assert.equal(f.state.migrationCalls, 0);
});
for (const classification of ["BLOCKER", "UNKNOWN", "EXACT_EXPECTED_POST_STATE", undefined]) test("PRE " + classification + " cannot migrate", async () => {
  const f = fixture({ classifyPre: () => ({ classification }) });
  await fails(environment(), f.dependencies, "PRE_DDL", "PRE_DDL_CONTRACT_MISMATCH"); assert.equal(f.state.migrationCalls, 0);
});
test("PRE exception remains failure and invokes migration zero times", async () => {
  const f = fixture({ classifyPre: () => { throw new Error("private details"); } });
  await fails(environment(), f.dependencies, "PRE_DDL", "PRE_DDL_ATTESTATION_FAILED"); assert.equal(f.state.migrationCalls, 0);
});
test("migration failure stops immediately, without POST or retry", async () => {
  const f = fixture(); f.dependencies.executeMigration = () => { f.state.migrationCalls++; throw Object.assign(new Error("secret"), { stderr: "ERROR: 55P03: sensitive SQL" }); };
  const r = await fails(environment(), f.dependencies, "MIGRATION", "SQLSTATE_55P03");
  assert.equal(r.migrationState, "POTENTIALLY_COMMITTED"); assert.equal(f.state.migrationCalls, 1); assert.deepEqual(f.state.events, ["PRE"]);
});
for (const classification of ["BLOCKER", "UNKNOWN", undefined]) test("POST " + classification + " requires read-only forensic, never retry", async () => {
  const f = fixture({ classifyPost: () => ({ classification }) });
  const r = await fails(environment(), f.dependencies, "POST_DDL", "POST_DDL_CONTRACT_MISMATCH");
  assert.equal(r.migrationState, "COMMITTED_REQUIRES_READ_ONLY_FORENSIC"); assert.equal(r.reexecution, "FORBIDDEN"); assert.equal(f.state.migrationCalls, 1);
});
test("POST process failure preserves committed warning and redacts credentials", async () => {
  const f = fixture({ classifyPost: () => { throw new Error(environment().REFLAB_PRODUCTION_DDL_DB_URL + " fixture-password"); } });
  const r = await fails(environment(), f.dependencies, "POST_DDL", "POST_DDL_ATTESTATION_FAILED");
  assert.equal(r.migrationState, "COMMITTED_REQUIRES_READ_ONLY_FORENSIC"); assert.equal(f.state.migrationCalls, 1);
});
test("default migration process has safe psql options and one pinned SQL input", async () => {
  let calls = 0; const f = fixture({ executeMigration: undefined, spawn: (command, args, options) => {
    calls++; assert.equal(command, "psql"); for (const flag of ["-X", "--no-psqlrc", "ON_ERROR_STOP=1", "VERBOSITY=verbose"]) assert.ok(args.includes(flag));
    assert.equal(options.env.PGHOST, "aws-1-sa-east-1.pooler.supabase.com"); assert.equal(options.timeout, 90000);
    assert.match(options.input, /create function reflab_private.request_user_id/); return { status: 0, stderr: "" };
  } });
  runProductionIdentitySecurityBridge(environment(), f.dependencies); assert.equal(calls, 1);
});
test("privilege warning is potentially committed and never proceeds", async () => {
  let calls = 0; const f = fixture({ executeMigration: undefined, spawn: () => { calls++; return { status: 0, stderr: "WARNING: no privileges were granted" }; } });
  const r = await fails(environment(), f.dependencies, "MIGRATION", "MIGRATION_WARNING");
  assert.equal(calls, 1); assert.equal(r.migrationState, "POTENTIALLY_COMMITTED");
});
test("runner has no discovery, arbitrary SQL, retry, continuation or cutover path", () => {
  assert.doesNotMatch(source, /readdir|glob\(|db\s+push|64245.*\.sql|64249.*\.sql|execute.*cutover/i);
  assert.match(source, /assertIdentitySecurityBridgeArtifact/); assert.match(source, /nextProvider: "NOT_AUTHORIZED"/);
});
