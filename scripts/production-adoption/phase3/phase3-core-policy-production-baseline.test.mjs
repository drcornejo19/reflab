import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORE_POLICY_PRODUCTION_BASELINE as snapshot } from "./phase3-core-policy-production-baseline.mjs";
import { APPROVED_CORE_POLICY_PRODUCTION_BASELINE as approval, CORE_POLICY_BASELINE_DIGEST,
  CORE_POLICY_BASELINE_PATH, CORE_POLICY_BASELINE_SHARED_SHA, corePolicyBaselineDigest,
  buildCorePolicyProductionInventory, corePolicyProductionApproval, validateCorePolicyProductionApproval,
  buildApprovedCorePolicyPreBatch } from "./phase3-core-policy-production-baseline-contract.mjs";
import { CORE_POLICY_QUERY_ID, classifyCorePolicyInventory } from "./phase3-core-policy-contract.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";
import { identityBridgePostExact, IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { classifyCorePolicyPreAttestation } from "./phase3-core-policy-pre-attestation-contract.mjs";
import { CORE_POLICY_ATTESTATION_OPERATION, CORE_POLICY_ATTESTATION_VARIABLES, assertCorePolicyCommittedBaseline,
  runProductionCorePolicyPreAttestation, runCorePolicyPreAttestationCli, serializeCorePolicyAttestation } from "./run-production-core-policy-pre-attestation.mjs";

function evidence(post = false) {
  const inventory = structuredClone(buildCorePolicyProductionInventory());
  if (post) inventory.policies = [...structuredClone(snapshot.preservedPolicies), ...PHASE3_POLICY_MATRIX.map((p, i) =>
    ({ ...p, schema: "public", oid: String(90000 + i), roles: ["authenticated"], permissive: true }))];
  return new Map([["read_only_guard", "on"], [CORE_POLICY_QUERY_ID, inventory],
    [IDENTITY_BRIDGE_POST_QUERY_ID, { functions: structuredClone(snapshot.identity.functions),
      acl: structuredClone(snapshot.identity.acl), rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0 }],
    [CORE_BASELINE_ADOPTION_QUERY_ID, { canonicalMarkerAbsent: snapshot.adoption.canonicalMarkerAbsent,
      developmentObjects: structuredClone(snapshot.adoption.developmentObjects),
      ledgerRows: structuredClone(snapshot.adoption.ledgerChain), schemaStateRows: [], historicalCounts: structuredClone(snapshot.historical.counts),
      schemaCreatePrivileges: structuredClone(snapshot.identity.schemaCreate) }],
    [CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID, { counts: { ...snapshot.historical.counts, ledger_rows: 4, schema_state_rows: 0 },
      checks: { canonicalMarkerAbsent: true, developmentObjectsAbsent: true }, ledger_rows: structuredClone(snapshot.adoption.ledgerChain) }]]);
}
// Unit composition isolates baseline handling. PG17 exercises every predecessor query/classifier.
const composition = {
  classifyIdentity: (e) => ({ classification: identityBridgePostExact(e.get(IDENTITY_BRIDGE_POST_QUERY_ID)) ? "EXACT" : "BLOCKER" }),
  classifyCore: (e, b) => classifyCorePolicyInventory(e.get(CORE_POLICY_QUERY_ID), b,
    identityBridgePostExact(e.get(IDENTITY_BRIDGE_POST_QUERY_ID))),
};
const classify = (e, a = approval) => classifyCorePolicyPreAttestation(e, a, composition);
function migrationCalls(report) { let calls = 0; if (report.executablePre === true
  && report.classification === "64245_PRE_EXECUTABLE_EXACT") calls++; return calls; }
const payload = (e) => e.get(CORE_POLICY_QUERY_ID);
const adoption = (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID);
const identity = (e) => e.get(IDENTITY_BRIDGE_POST_QUERY_ID);

test("approved observed lineage independently has exactly 4/18/3/20 policies and 301/20 ACL entries", () => {
  assert.equal(snapshot.version, 1); assert.equal(snapshot.provenance.forensicApproval, "NOT_PERFORMED");
  assert.equal(snapshot.provenance.source, "completed Production READ-ONLY forensic");
  assert.equal(snapshot.provenance.approvalScope, "64245 PRE transition only");
  assert.deepEqual(snapshot.targetSlots.filter((s) => s.policy).map((s) => s.table).sort(),
    ["attempts", "exam_results", "rules_exam_results", "user_profiles"]);
  assert.equal(snapshot.targetSlots.length, 22); assert.equal(snapshot.targetSlots.filter((s) => !s.policy).length, 18);
  assert.equal(snapshot.legacyPolicies.length, 3); assert.equal(snapshot.preservedPolicies.length, 20);
  assert.equal(snapshot.preservedPolicies.filter((p) => p.name === "reflab_preflight_audit_owner_read").length, 10);
  assert.equal(snapshot.preservedPolicies.filter((p) => p.roles.includes("service_role")).length, 3);
  assert.equal(approval.inventory.policies.length, 27); assert.equal(approval.inventory.table_acl.length, 301);
  assert.equal(approval.inventory.column_acl.length, 20);
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.preservedPolicies[0]));
});
test("exact approved PRE and hardened POST classify distinctly", () => {
  const pre = classify(evidence()); assert.equal(pre.classification, "64245_PRE_EXECUTABLE_EXACT");
  assert.deepEqual(pre.failedChecks, []); assert.deepEqual(pre.unknownChecks, []); assert.equal(migrationCalls(pre), 1);
  const post = classify(evidence(true)); assert.equal(post.classification, "64245_ALREADY_INSTALLED_POST");
  assert.equal(post.executablePre, false); assert.equal(migrationCalls(post), 0);
  assert.equal(post.TABLE_ACL_BASELINE_PURPOSE, "PRESERVATION_ONLY");
  assert.equal(post.TABLE_ACL_SECURITY_STATUS, "PENDING_RECONCILIATION");
  assert.equal(post.TABLE_ACL_RECONCILIATION_STILL_REQUIRED, true);
});
test("set ordering is immaterial; duplicate entries and semantic mutations change the pinned digest", () => {
  const reordered = structuredClone(snapshot);
  const reverse = (v) => { if (Array.isArray(v)) { v.reverse(); for (const x of v) reverse(x); }
    else if (v && typeof v === "object") for (const x of Object.values(v)) reverse(x); };
  reverse(reordered); assert.equal(corePolicyBaselineDigest(reordered), CORE_POLICY_BASELINE_DIGEST);
  for (const change of [
    (b) => { b.targetSlots.find((s) => s.policy).policy.using = "true"; },
    (b) => { b.legacyPolicies[0].using = "true"; }, (b) => { b.preservedPolicies[0].permissive = false; },
    (b) => { b.tables[0].owner = "other"; }, (b) => { b.tableAcl[0].grantable = true; },
    (b) => { b.columnAcl[0].privilege = "UPDATE"; }, (b) => { b.identity.functions[0].security_definer = true; },
    (b) => { b.adoption.runtimeDisabled = false; }, (b) => { b.historical.productFingerprint = "a".repeat(32); },
    (b) => { b.mutations.policyDrops = 8; }, (b) => { b.columnAcl.push(b.columnAcl[0]); },
  ]) { const changed = structuredClone(snapshot); change(changed); assert.notEqual(corePolicyBaselineDigest(changed), CORE_POLICY_BASELINE_DIGEST); }
});
test("recomputing an arbitrary observed baseline digest cannot self-approve it", () => {
  const changed = structuredClone(snapshot);
  changed.tableAcl[0].grantable = true;
  const candidate = corePolicyProductionApproval(changed);
  assert.equal(candidate.digest, corePolicyBaselineDigest(changed));
  assert.equal(validateCorePolicyProductionApproval(candidate).classification, "BLOCKER");
  assert.equal(migrationCalls(classify(evidence(), candidate)), 0);
});
for (const [name, change] of [
  ["artifact missing", () => null], ["version wrong", (a) => { a.baseline.version = 2; }],
  ["digest wrong", (a) => { a.digest = "f".repeat(64); }],
  ["migration wrong", (a) => { a.migrationSha = "f".repeat(64); }],
  ["shared contract wrong", (a) => { a.baseline.sharedContractSha = "f".repeat(64); }],
  ["inventory replaced with self-observation", (a) => { a.inventory.policies.pop(); }],
]) test(`invalid approval fails closed: ${name}`, () => {
  const a = structuredClone(approval); const changed = change(a); const candidate = changed === null ? null : a;
  assert.equal(validateCorePolicyProductionApproval(candidate).classification, "BLOCKER");
  const r = classify(evidence(), candidate); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
for (const slot of snapshot.targetSlots.filter((s) => s.policy)) test(`required historical target absent: ${slot.table}`, () => {
  const e = evidence(); payload(e).policies = payload(e).policies.filter((p) => p.name !== slot.name);
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
for (const slot of snapshot.targetSlots.filter((s) => !s.policy)) test(`approved missing target unexpectedly present: ${slot.name}`, () => {
  const e = evidence(); const p = PHASE3_POLICY_MATRIX.find((p) => p.table === slot.table && p.name === slot.name);
  payload(e).policies.push({ ...p, schema: "public", oid: "99999", roles: ["authenticated"], permissive: true });
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
for (const p of snapshot.legacyPolicies) for (const [field, value] of [
  ["missing", null], ["name", "renamed"], ["using", "true"], ["withCheck", "true"],
  ["roles", ["anon"]], ["command", "DELETE"], ["permissive", false],
]) test(`retirement input exactness: ${p.table} ${field}`, () => {
  const e = evidence(); const i = payload(e).policies.findIndex((r) => r.table === p.table && r.name === p.name);
  if (field === "missing") payload(e).policies.splice(i, 1); else payload(e).policies[i][field] = value;
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
for (const p of snapshot.preservedPolicies) test(`preserved policy cannot disappear: ${p.table}.${p.name}`, () => {
  const e = evidence(); payload(e).policies = payload(e).policies.filter((r) => r.table !== p.table || r.name !== p.name);
  const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
for (const [name, change] of [
  ["preserved policy changed", (e) => { payload(e).policies.find((p) => p.roles.includes("service_role")).using = "false"; }],
  ["extra non-target", (e) => { payload(e).policies.push({ ...payload(e).policies[0], name: "unexpected", oid: "99998" }); }],
  ["owner", (e) => { payload(e).tables[0].owner = "other"; }], ["RLS", (e) => { payload(e).tables[0].rls = false; }],
  ["FORCE", (e) => { payload(e).tables[0].force = true; }],
  ["table ACL removed", (e) => { payload(e).table_acl.pop(); }],
  ["table ACL added", (e) => { payload(e).table_acl.push({ ...payload(e).table_acl[0], grantee: "PUBLIC" }); }],
  ["table ACL grantor", (e) => { payload(e).table_acl[0].grantor = "other"; }],
  ["table ACL grant option", (e) => { payload(e).table_acl[0].grantable = true; }],
  ["column ACL removed", (e) => { payload(e).column_acl.pop(); }],
  ["column ACL added", (e) => { payload(e).column_acl.push({ ...payload(e).column_acl[0], grantee: "anon" }); }],
  ["column ACL changed", (e) => { payload(e).column_acl[0].privilege = "UPDATE"; }],
  ["64236 source", (e) => { identity(e).functions[0].source_hash = "f".repeat(64); }],
  ["64236 owner", (e) => { identity(e).functions[0].owner = "other"; }],
  ["64236 configuration", (e) => { identity(e).functions[0].configuration = ["search_path=public"]; }],
  ["64236 ACL", (e) => { identity(e).acl[0].grantable = true; }],
  ["schema CREATE", (e) => { adoption(e).schemaCreatePrivileges.find((r) => r.role === "anon").create = true; }],
  ["ledger chain", (e) => { adoption(e).ledgerRows[2].phase_key = "unexpected"; }],
  ["schema state", (e) => { adoption(e).schemaStateRows = [{ installation_status: "installed" }]; }],
  ["marker", (e) => { adoption(e).canonicalMarkerAbsent = false; }],
  ["runtime", (e) => { payload(e).runtimeDisabled = false; }],
  ["cutover", (e) => { payload(e).cutoverAbsent = false; }],
  ["Phase4", (e) => { payload(e).phase4Absent = false; }],
  ["development", (e) => { adoption(e).developmentObjects["reflab_private.user_identity_links"] = true; }],
  ["historical digest", (e) => { payload(e).productFingerprint = "f".repeat(32); }],
  ["protected digest", (e) => { payload(e).protectedObjectsHash = "f".repeat(32); }],
  ["historical counts", (e) => { adoption(e).historicalCounts.clips++; }],
  ["adoption evidence missing", (e) => { e.delete(CORE_BASELINE_ADOPTION_QUERY_ID); }],
]) test(`baseline drift blocks with zero migration calls: ${name}`, () => {
  const e = evidence(); change(e); const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0);
});
test("POST with legacy, DELETE or preservation drift is never executable", () => {
  for (const change of [
    (e) => { payload(e).policies.push(structuredClone(snapshot.legacyPolicies[0])); },
    (e) => { payload(e).policies.push({ ...payload(e).policies[0], table: "match_preparations", name: "unexpected_delete", command: "DELETE", roles: ["authenticated"] }); },
    (e) => { payload(e).table_acl.pop(); },
  ]) { const e = evidence(true); change(e); const r = classify(e); assert.equal(r.classification, "BLOCKER"); assert.equal(migrationCalls(r), 0); }
});

const approvedHead = "b".repeat(40);
const blob = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
function git(args) {
  if (args[0] === "rev-parse") return approvedHead;
  if (args[0] === "status") return "";
  if (args[0] === "show") return blob(args[1].slice("HEAD:".length));
  assert.fail("unexpected Git operation");
}
const environment = Object.fromEntries(CORE_POLICY_ATTESTATION_VARIABLES.map((key, i) => [key, i < 3 ? "true"
  : i === 3 ? "nagjddldrldwavmfaytc" : i === 4 ? approvedHead
    : "postgresql://postgres.nagjddldrldwavmfaytc:fixture-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"]));
test("committed baseline and shared-contract blobs must be pinned before the single read-only batch", () => {
  assert.equal(assertCorePolicyCommittedBaseline(git).committedArtifactVerified, true);
  let calls = 0;
  const result = runProductionCorePolicyPreAttestation(environment, { argument: CORE_POLICY_ATTESTATION_OPERATION, git,
    executeReadOnly: (batch) => { calls++; assert.equal(batch, buildApprovedCorePolicyPreBatch()); return evidence(); } });
  assert.equal(calls, 1); assert.equal(result.baselineApproval.committedArtifactVerified, true);
  assert.equal(result.checks.productionBaselineApproved, true);
  assert.doesNotMatch(serializeCorePolicyAttestation(result, environment), /fixture-password|postgresql:|PRODUCTION_BASELINE_REVIEW_REQUIRED/);
});
for (const name of ["baseline absent from HEAD", "wrong baseline blob", "wrong shared blob"]) test(`repository approval boundary: ${name}`, async () => {
  let calls = 0, output = "";
  const badGit = (args) => {
    if (args[0] === "show" && args[1] === `HEAD:${CORE_POLICY_BASELINE_PATH}`) {
      if (name === "baseline absent from HEAD") throw new Error("missing committed artifact");
      if (name === "wrong baseline blob") return "unexpected bytes";
    }
    if (args[0] === "show" && name === "wrong shared blob" && args[1].includes("phase3-core-policy-contract.mjs")) return "unexpected bytes";
    return git(args);
  };
  const code = await runCorePolicyPreAttestationCli(environment, { argument: CORE_POLICY_ATTESTATION_OPERATION, git: badGit,
    executeReadOnly: () => { calls++; assert.fail("database access must not begin"); },
    writeStdout: () => assert.fail(), writeStderr: (text) => { output += text; } });
  assert.equal(code, 1); assert.equal(calls, 0);
  assert.equal(JSON.parse(output).reason, "REPOSITORY_ARTIFACT_MISMATCH");
  assert.equal(JSON.parse(output).substage, "BASELINE_ARTIFACT");
  assert.doesNotMatch(output, /fixture-password|postgresql:/);
});
test("snapshot compatibility and observation artifact remain distinct from final ACL approval", () => {
  assert.equal(snapshot.sharedContractSha, CORE_POLICY_BASELINE_SHARED_SHA);
  assert.equal(validateCorePolicyProductionApproval(corePolicyProductionApproval()).classification, "EXACT");
  assert.equal(snapshot.tableAclSecurityStatus, "PENDING_RECONCILIATION");
  assert.equal(snapshot.mutations.policyDrops, 7); assert.equal(snapshot.mutations.policyCreates, 22);
  const sql = buildApprovedCorePolicyPreBatch();
  assert.match(sql, /^begin read only;/); assert.match(sql, /rollback;\s*$/);
  assert.doesNotMatch(sql, /^\s*(create|alter|drop|insert|update|delete|grant|revoke|notify|set role)\b/im);
  const source = readFileSync(new URL("./phase3-core-policy-production-baseline.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /readFileSync|AppData|\.txt|PGPASSWORD|postgresql:/);
});
