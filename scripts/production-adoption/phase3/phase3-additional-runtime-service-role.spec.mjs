import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { ADDITIONAL_CURRENT_MATRIX, ADDITIONAL_SERVICE_TABLES, ADDITIONAL_PRIVILEGES, ADDITIONAL_MIGRATION_PATH,
  ADDITIONAL_OBSERVATION, additionalMatrix, additionalAcls, additionalAccounting, FUTURE_COACH_ONLY } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { PRE_EXACT, POST_EXACT, ADDITIONAL_QUERY_ID, ADDITIONAL_PRESERVATION_ID, classifyAdditionalTransition,
  classifyLocalAdditionalTransition, additionalPreserved, buildAdditionalBatch, buildAdditionalObservation } from "./phase3-additional-runtime-service-role-contract.mjs";
import { additionalFixtureEvidence, buildAdditionalFixture } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { buildAdditionalMigration, additionalMutationStatements, verifyAdditionalMigration } from "./phase3-additional-runtime-service-role-migration-source.mjs";
import { SERVICE_FORENSIC_QUERY_ID, ADDITIONAL_TABLES } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { refreshServiceFixtureCounts } from "./phase3-service-role-privilege-forensic-fixture.mjs";
import { SERVICE_TABLES, serviceMatrix } from "./phase3-current-service-role-matrix.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";
import { IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { serializeBrowserForensic } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { migrationManifest } from "../../production-preflight/manifest.mjs";

const inventory = (e) => e.get(SERVICE_FORENSIC_QUERY_ID);
const classify = classifyAdditionalTransition;
const sql = readFileSync(new URL("../../../" + ADDITIONAL_MIGRATION_PATH, import.meta.url), "utf8").replaceAll("\r\n", "\n");
function blocked(e) {
  refreshServiceFixtureCounts(inventory(e));
  const r = classify(e); assert.equal(r.classification, "BLOCKER", JSON.stringify(r.failedChecks));
  assert.equal(r.executablePre, false); assert.equal(r.migrationInvocationCount, 0);
  assert.equal(r.productionDdlAuthorized, false); assert.equal(r.mutationCount, 0);
}
function changeCell(e, table, privilege, granted) {
  const p = inventory(e), r = p.effectiveTablePrivileges.find((r) => r.table === table && r.privilege === privilege);
  r.granted = granted;
  p.tableAcls = p.tableAcls.filter((a) => !(a.table === table && a.grantee === "service_role" && a.privilege === privilege));
  if (granted) p.tableAcls.push({ schema: "public", table, grantee: "service_role", grantor: "postgres", privilege, grantable: false });
}
test("exact observed-lineage PRE is distinct, observation only", () => {
  const r = classify(additionalFixtureEvidence()); assert.equal(r.classification, PRE_EXACT);
  assert.equal(r.executablePre, true); assert.deepEqual(r.failedChecks, []); assert.deepEqual(r.unknownChecks, []);
  assert.equal(r.approval, "NOT_PERFORMED"); assert.equal(r.productionDdlAuthorized, false);
});
test("exact current POST refuses reexecution with zero invocation", () => {
  const r = classify(additionalFixtureEvidence(true)); assert.equal(r.classification, POST_EXACT);
  assert.equal(r.executablePre, false); assert.equal(r.reexecutionRefused, true); assert.equal(r.migrationInvocationCount, 0);
  assert.deepEqual(r.failedChecks, []); assert.deepEqual(r.unknownChecks, []);
});
test("matrix arithmetic is mechanically 456/124/332/0/124", () => {
  const a = additionalAccounting(); assert.equal(ADDITIONAL_SERVICE_TABLES.length, 57);
  assert.equal(new Set(ADDITIONAL_SERVICE_TABLES).size, 57); assert.deepEqual([...ADDITIONAL_TABLES].sort(), ADDITIONAL_SERVICE_TABLES);
  assert.deepEqual(ADDITIONAL_PRIVILEGES, ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]);
  assert.deepEqual([a.totalCells, a.preGrantedCells, a.preAbsentCells, a.postGrantedCells, a.postAbsentCells,
    a.privilegeEntryRevocations, a.privilegeEntryGrants, a.unchangedCells], [456, 456, 0, 124, 332, 332, 0, 124]);
  assert.equal(a.revoked.length + a.granted.length + a.unchanged.length, 456);
  assert.equal(additionalMatrix(true).length, 456);
  assert.equal(a.preGrantedCells - a.revoked.length + a.granted.length, a.postGrantedCells);
});
test("archived provenance is independently pinned, never synthetic truth", () => {
  assert.equal(ADDITIONAL_OBSERVATION.evidenceSha256, "56af017f8e98fe32d3f829f6e88cd8473bcdeea3e6c2d46c3292bec9f849a15c");
  assert.equal(ADDITIONAL_OBSERVATION.approval, "NOT_PERFORMED"); assert.equal(ADDITIONAL_OBSERVATION.mutationCount, 0);
  assert.equal(additionalAcls().length, 1736); assert.equal(additionalAcls(true).length, 1404);
  assert.equal(additionalAcls().filter((r) => r.grantee === "anon").length, 352);
  assert.equal(additionalAcls().filter((r) => r.grantee === "authenticated").length, 408);
});
for (const table of ADDITIONAL_SERVICE_TABLES) {
  for (const privilege of ADDITIONAL_PRIVILEGES) test(`POST ${table} ${privilege}: opposite target cell is BLOCKER`, () => {
    const e = additionalFixtureEvidence(true); changeCell(e, table, privilege, !ADDITIONAL_CURRENT_MATRIX[table].includes(privilege)); blocked(e);
  });
  test(`PRE ${table}: one expected broad privilege absent is BLOCKER`, () => {
    const e = additionalFixtureEvidence(); changeCell(e, table, "MAINTAIN", false); blocked(e);
  });
  for (const drift of ["wrongGrantor", "grantOption", "PUBLIC", "membership", "owner", "rls", "force"]) test(`PRE ${table}: ${drift} fails closed`, () => {
    const e = additionalFixtureEvidence(), p = inventory(e);
    const acl = p.tableAcls.find((a) => a.table === table && a.grantee === "service_role" && a.privilege === "SELECT");
    if (drift === "wrongGrantor") acl.grantor = "reflab_rls_owner";
    if (drift === "grantOption") acl.grantable = true;
    if (drift === "PUBLIC") acl.grantee = "PUBLIC";
    if (drift === "membership") {
      acl.grantee = "reflab_rls_owner";
      Object.assign(p.roleAttributes.find((r) => r.name === "reflab_rls_owner"), { serviceRoleInherits: true, serviceRoleMember: true });
      p.roleMemberships.push({ member: "service_role", role: "reflab_rls_owner", grantor: "postgres", inheritOption: true, setOption: false, adminOption: false });
    }
    if (drift === "owner") p.tables.find((t) => t.table === table).owner = "service_role";
    if (drift === "rls") p.tables.find((t) => t.table === table).rls = false;
    if (drift === "force") p.tables.find((t) => t.table === table).force = true;
    blocked(e);
  });
}
for (const table of ADDITIONAL_SERVICE_TABLES) test(`DELETE target is exact for ${table}`, () => {
  const allowed = ["institution_assessment_items", "institution_content_assignments", "institution_notification_campaigns", "institution_membership_roles"];
  assert.equal(ADDITIONAL_CURRENT_MATRIX[table].includes("DELETE"), allowed.includes(table));
  const e = additionalFixtureEvidence(true); changeCell(e, table, "DELETE", !allowed.includes(table)); blocked(e);
});
for (const privilege of ADDITIONAL_PRIVILEGES) test(`coach current POST refuses ${privilege}`, () => {
  const e = additionalFixtureEvidence(true); changeCell(e, "coach_rate_limit_buckets", privilege, true); blocked(e);
});
for (const table of SERVICE_TABLES) test(`completed primary table ${table} drift is BLOCKER`, () => {
  const e = additionalFixtureEvidence(); inventory(e).effectiveTablePrivileges.find((r) => r.table === table && r.privilege === "SELECT").granted = false;
  blocked(e);
});
const drifts = {
  bypass: (e) => inventory(e).roleAttributes.find((r) => r.name === "service_role").rolbypassrls = false,
  superuser: (e) => inventory(e).roleAttributes.find((r) => r.name === "service_role").rolsuper = true,
  login: (e) => inventory(e).roleAttributes.find((r) => r.name === "service_role").rolcanlogin = true,
  browserAdditional: (e) => inventory(e).tableAcls.find((a) => a.table === "appointments" && a.grantee === "anon").grantable = true,
  browserEffective: (e) => e.get(ADDITIONAL_QUERY_ID).browser[0].granted = !e.get(ADDITIONAL_QUERY_ID).browser[0].granted,
  browser64249: (e) => e.get(BROWSER_FORENSIC_QUERY_ID).effectiveBrowserPrivileges[0].granted = !e.get(BROWSER_FORENSIC_QUERY_ID).effectiveBrowserPrivileges[0].granted,
  policy: (e) => e.get(BROWSER_FORENSIC_QUERY_ID).policies[0].using = "false",
  literal: (e) => e.get(BROWSER_FORENSIC_QUERY_ID).policies.find((p) => p.name === "training_attempt_profile_read").using = "user_id = current_setting('reflab.training_user_id ', true)",
  column: (e) => e.get(BROWSER_FORENSIC_QUERY_ID).columnAcls[0].grantable = true,
  functionMode: (e) => inventory(e).relevantFunctions.find((f) => f.exists).security_definer = false,
  functionOwner: (e) => inventory(e).relevantFunctions.find((f) => f.exists).owner = "service_role",
  functionHash: (e) => inventory(e).relevantFunctions.find((f) => f.exists).sourceHash = "c".repeat(32),
  functionExecute: (e) => inventory(e).functionExecuteAcls[0].grantee = "PUBLIC",
  futureInvitation: (e) => inventory(e).relevantFunctions.find((f) => !f.exists).exists = true,
  identity64236: (e) => e.get(IDENTITY_BRIDGE_POST_QUERY_ID).acl[0].grantable = true,
  core64245: (e) => e.get(CORE_POLICY_QUERY_ID).policies[0].using = "false",
  historical: (e) => e.get(CORE_POLICY_QUERY_ID).productFingerprint = "c".repeat(32),
  ledger: (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).ledgerRows.pop(),
  schemaState: (e) => e.get(CORE_BASELINE_ADOPTION_QUERY_ID).schemaStateRows.push({ baseline_version: "drift" }),
  runtime: (e) => e.get(CORE_POLICY_QUERY_ID).runtimeDisabled = false,
  cutover: (e) => e.get(CORE_POLICY_QUERY_ID).cutoverAbsent = false,
  phase4: (e) => e.get(CORE_POLICY_QUERY_ID).phase4Absent = false,
  duplicateCell: (e) => inventory(e).effectiveTablePrivileges.push({ ...inventory(e).effectiveTablePrivileges.at(-1) }),
  duplicateTable: (e) => inventory(e).tables.push({ ...inventory(e).tables.at(-1) }),
  columnMissing: (e) => e.get(ADDITIONAL_QUERY_ID).columns = [],
};
for (const [name, mutate] of Object.entries(drifts)) for (const post of [false, true]) test(`${name} on ${post ? "POST" : "PRE"} is BLOCKER`, () => {
  const e = additionalFixtureEvidence(post); mutate(e); blocked(e);
});
test("partial PRE/POST is never executable or installed", () => {
  const e = additionalFixtureEvidence(); changeCell(e, "coach_runs", "TRIGGER", false); blocked(e);
});
test("missing observation is UNKNOWN, malformed evidence is BLOCKER", () => {
  assert.equal(classify(new Map()).classification, "UNKNOWN");
  const e = additionalFixtureEvidence(); inventory(e).tableAcls = null;
  assert.equal(classify(e).classification, "BLOCKER");
});
test("write/read-only transport modes are explicit and cannot be conflated", () => {
  const e = additionalFixtureEvidence(); e.set("read_only_guard", "off"); blocked(e);
  const r = classify(e, { readOnly: false }); assert.equal(r.classification, PRE_EXACT); assert.equal(r.transactionReadOnly, false);
});
test("local proof cannot relax Production fingerprints", () => {
  const e = additionalFixtureEvidence(), proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY",
    state: { productFingerprint: "c".repeat(32), protectedObjectsHash: "d".repeat(32) },
    functionHashes: Object.fromEntries(CURRENT_FUNCTIONS.filter((f) => f.exists).map((f) => [f.signature, "e".repeat(32)])) };
  Object.assign(e.get(CORE_POLICY_QUERY_ID), proof.state);
  for (const f of inventory(e).relevantFunctions) if (f.exists) f.sourceHash = "e".repeat(32);
  assert.equal(classify(e).classification, "BLOCKER");
  assert.equal(classifyLocalAdditionalTransition(e, proof).classification, PRE_EXACT);
  assert.throws(() => classifyLocalAdditionalTransition(e, {}), /EXPLICIT_LOCAL/);
});
test("preservation fingerprint is required across transition", () => {
  const before = additionalFixtureEvidence(), after = additionalFixtureEvidence(true);
  assert.equal(additionalPreserved(before, after), true); after.set(ADDITIONAL_PRESERVATION_ID, "c".repeat(32));
  assert.equal(additionalPreserved(before, after), false); assert.equal(additionalPreserved(new Map(), new Map()), false);
});
test("source artifact parity and narrow SQL accounting", () => {
  assert.equal(sql, buildAdditionalMigration()); assert.equal(verifyAdditionalMigration(sql).sqlRevokeStatements, 57);
  const verified = verifyAdditionalMigration(sql), [first, last] = verified.removed;
  assert.equal(verified.body, sql.slice(0, first.start) + sql.slice(first.end, last.start) + sql.slice(last.end));
  assert.deepEqual(additionalMutationStatements(sql), additionalAccounting().statements);
  assert.equal((sql.match(/^\s*revoke\b/gim) ?? []).length, 57); assert.equal((sql.match(/^\s*grant\b/gim) ?? []).length, 0);
  assert.doesNotMatch(sql, /^\s*(?:create|alter|drop|grant|insert|update|delete|truncate|notify|execute)\b/im);
  for (const statement of additionalMutationStatements(sql)) {
    assert.match(statement, /^revoke (?:[a-z]+(?:, )?)+ on table public\.[a-z_]+ from service_role;$/);
    assert.doesNotMatch(statement, /\b(?:all|cascade|anon|authenticated)\b/i);
  }
  assert.throws(() => verifyAdditionalMigration(sql + "\n"), /SOURCE_DRIFT/);
  assert.throws(() => additionalMutationStatements(sql.replace("END ADDITIONAL", "END OTHER")), /BOUNDARY/);
});
test("no future coach grants, no primary mutation, no generic execution", () => {
  assert.deepEqual(ADDITIONAL_CURRENT_MATRIX.coach_rate_limit_buckets, []); assert.deepEqual(FUTURE_COACH_ONLY, ["SELECT", "INSERT", "UPDATE"]);
  assert.equal(additionalAccounting().granted.length, 0);
  for (const table of SERVICE_TABLES) assert.equal(ADDITIONAL_SERVICE_TABLES.includes(table), false);
  assert.deepEqual(inventory(additionalFixtureEvidence()).effectiveTablePrivileges.filter((r) => SERVICE_TABLES.includes(r.table)), serviceMatrix(true));
  assert.doesNotMatch(sql, /supabase db push|migration up|ALLOW_PRODUCTION/);
});
test("observation is SELECT-only and fixture is explicitly synthetic", () => {
  assert.doesNotMatch(buildAdditionalObservation(), /^\s*(?:create|alter|drop|grant|revoke|insert|update|delete|notify|commit)\b/im);
  assert.match(buildAdditionalBatch(), /^begin read only;/); assert.match(buildAdditionalBatch(), /rollback;\s*$/);
  assert.match(buildAdditionalFixture(), /SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH/);
  assert.match(buildAdditionalFixture(), /alter role service_role inherit;/);
});
test("migration version is unique and manifest entry is manual only", () => {
  const files = readdirSync(new URL("../../../supabase/migrations/", import.meta.url));
  assert.equal(files.filter((f) => f.startsWith("20261013131628_")).length, 1);
  const entry = migrationManifest.find((m) => m.version === "20261013131628");
  assert.equal(entry.productionAction, "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
});
for (const [file, hash] of [
  ["20260901064249_production_adoption_browser_privilege_reconciliation.sql", "4ddd6a1fd30b9508297b3f2819925bca507e1ef8005144f4f02acae6d335f12c"],
  ["20261010041511_production_adoption_current_service_role_privilege_reconciliation.sql", "f4634ee7b18643d3672cf6767ebe8b5085e13b2e66dd5cd813c4d6b92e601fa0"],
]) test(`protected ${file} hash unchanged`, () => {
  const bytes = readFileSync(new URL("../../../supabase/migrations/" + file, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
});
for (const value of ["local-password@secret", "local-password%40secret", "postgresql://postgres:local-password%40secret@localhost/postgres"]) test(`pre-serialization protects ${value.startsWith("postgresql") ? "URL" : value.includes("%") ? "encoded password" : "raw password"}`, () => {
  const environment = { REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL: "postgresql://postgres:local-password%40secret@localhost/postgres" };
  assert.throws(() => serializeBrowserForensic({ ...classify(additionalFixtureEvidence()), reason: value }, environment), /LOCAL_PROGRAMMING_ERROR/);
});
