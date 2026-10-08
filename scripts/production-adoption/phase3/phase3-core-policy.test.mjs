import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CORE_POLICY_MIGRATION, CORE_POLICY_SHA256, CORE_POLICY_TABLES, CORE_POLICY_MUTATIONS,
  classifyCorePolicyInventory, classifyCorePolicyBatch, buildCorePolicyBatch,
  normalizeCorePolicyExpression, CORE_POLICY_RETIRED, CORE_POLICY_LEGACY_EXPRESSION } from "./phase3-core-policy-contract.mjs";
import { invokeCorePolicyIfExecutable } from "./phase3-core-policy-postgres-rehearsal.mjs";
import { PHASE3_POLICY_MATRIX } from "./phase3-security-contract.mjs";

// Independent expectation layer: do not build the expected policies from the contract's matrix.
const writable = ["user_profiles", "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions"];
const readable = ["attempts", "exam_results", "rules_exam_results", "notification_events"];
const tables = [...writable, ...readable];
const owner = "user_id = reflab_private.request_user_id()";
const read = `${owner} or reflab_private.is_super_admin()`;
const policies = tables.flatMap((table, index) => (writable.includes(table)
  ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT"]).map((command, ordinal) => ({
  oid: 100 + index * 3 + ordinal, schema: "public", table,
  name: `${table}_own_${{ SELECT: "read", INSERT: "insert", UPDATE: "update" }[command]}`,
  command, permissive: true, roles: ["authenticated"],
  using: command === "SELECT" ? read : command === "UPDATE" ? owner : null,
  withCheck: command === "SELECT" ? null : owner,
})));
const extra = { oid: 999, schema: "public", table: "attempts", name: "attempts_own_insert",
  command: "INSERT", permissive: true, roles: ["authenticated"], using: null,
  withCheck: "user_id = public.platform_request_user_id()" };
const historical = "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))";
const legacy = [
  ["notification_events", "Users can read own notification events", "SELECT"],
  ["match_preparations", "match_preparations_authenticated_manage_own", "ALL"],
  ["post_match_reviews", "post_match_reviews_authenticated_manage_own", "ALL"],
].map(([table, name, command], i) => ({ oid: 900 + i, schema: "public", table, name, command,
  permissive: true, roles: ["authenticated"], using: historical, withCheck: command === "ALL" ? historical : null }));
function fixture(canonical = false) {
  return { tables: tables.map((table) => ({ schema: "public", table, owner: "postgres", rls: true,
    force: false, installer_authority: true })),
  policies: [...policies.map((p) => ({ ...structuredClone(p), using: canonical ? p.using : p.using
    ?.replaceAll("reflab_private.request_user_id", "public.platform_request_user_id")
    .replaceAll("reflab_private.is_super_admin", "public.platform_is_super_admin") ?? null,
  withCheck: canonical ? p.withCheck : p.withCheck?.replaceAll("reflab_private.request_user_id", "public.platform_request_user_id") ?? null })),
    ...(canonical ? [] : structuredClone(legacy)), structuredClone(extra)],
  table_acl: [{ table: "attempts", grantee: "service_role", grantor: "postgres", privilege: "SELECT", grantable: false }],
  column_acl: [{ table: "user_profiles", column: "user_id", grantee: "reflab_rls_owner", grantor: "postgres", privilege: "SELECT", grantable: false }],
  productFingerprint: "a".repeat(32), protectedObjectsHash: "b".repeat(32),
  phase4Absent: true, cutoverAbsent: true, runtimeDisabled: true };
}
const baseline = fixture();
const classify = (p, options = {}) => classifyCorePolicyInventory(p, baseline, true, options);
const migration = readFileSync(new URL(`../../../supabase/migrations/${CORE_POLICY_MIGRATION}`, import.meta.url), "utf8");

test("approved historical PRE is executable; complete canonical POST is not", () => {
  assert.equal(classify(fixture()).classification, "EXECUTABLE_PRE");
  assert.equal(classify(fixture(true)).classification, "ALREADY_INSTALLED_POST");
  assert.equal(classify(fixture(true), { post: true }).classification, "EXACT");
  assert.equal(classify(fixture(), { post: true }).classification, "BLOCKER");
});
test("missing target is an explicit approved input, not an arbitrary expression exception", () => {
  const p = fixture(); p.policies.splice(0, 1);
  assert.equal(classify(p).classification, "EXECUTABLE_PRE");
  assert.deepEqual(classify(p).missingTargets, ["user_profiles_own_read"]);
  assert.equal(classify(p, { post: true }).classification, "BLOCKER");
});
test("all targets missing remains explicit executable PRE", () => {
  const p = fixture(); p.policies = [...structuredClone(legacy), structuredClone(extra)];
  assert.equal(classify(p).missingTargets.length, 22);
  assert.equal(classify(p).classification, "EXECUTABLE_PRE");
});
test("mixed canonical and approved historical policies are input, not complete POST", () => {
  const p = fixture(); p.policies[0] = fixture(true).policies[0];
  assert.equal(classify(p).classification, "EXECUTABLE_PRE");
});
const drifts = [
  ["policy role", (p) => { p.policies[0].roles = ["anon"]; }],
  ["PUBLIC role", (p) => { p.policies[0].roles = ["PUBLIC"]; }],
  ["extra role", (p) => { p.policies[0].roles.push("service_role"); }],
  ["command", (p) => { p.policies[0].command = "DELETE"; }],
  ["restrictive", (p) => { p.policies[0].permissive = false; }],
  ["USING", (p) => { p.policies[0].using = "true"; }],
  ["WITH CHECK", (p) => { p.policies[1].withCheck = "true"; }],
  ["unexpected SELECT check", (p) => { p.policies[0].withCheck = owner; }],
  ["unsupported institution helper", (p) => { p.policies[0].using = "user_id=public.institution_request_user_id() or public.platform_is_super_admin()"; }],
  ["other schema helper", (p) => { p.policies[0].using = "user_id=other.platform_request_user_id() or public.platform_is_super_admin()"; }],
  ["table owner", (p) => { p.tables[0].owner = "service_role"; }],
  ["RLS disabled", (p) => { p.tables[0].rls = false; }],
  ["FORCE changed", (p) => { p.tables[0].force = true; }],
  ["installer authority", (p) => { p.tables[0].installer_authority = false; }],
  ["missing table", (p) => { p.tables.pop(); }],
  ["table ACL", (p) => { p.table_acl[0].privilege = "MAINTAIN"; }],
  ["extra browser grant", (p) => { p.table_acl.push({ ...p.table_acl[0], grantee: "anon" }); }],
  ["column ACL", (p) => { p.column_acl = []; }],
  ["non-target lost", (p) => { p.policies.pop(); }],
  ["non-target modified", (p) => { p.policies.at(-1).withCheck = "true"; }],
  ["non-target recreated", (p) => { p.policies.at(-1).oid++; }],
  ["extra non-target", (p) => { p.policies.push({ ...extra, name: "unexpected" }); }],
  ["duplicate policy", (p) => { p.policies.push({ ...p.policies[0] }); }],
  ["64236 source/owner/security/ACL objects", (p) => { p.protectedObjectsHash = "c".repeat(32); }],
  ["runtime enabled", (p) => { p.runtimeDisabled = false; }],
  ["cutover present", (p) => { p.cutoverAbsent = false; }],
  ["Phase4 present", (p) => { p.phase4Absent = false; }],
  ["historical semantics", (p) => { p.productFingerprint = "d".repeat(32); }],
];
for (const [name, mutate] of drifts) test(`fail closed before invocation: ${name}`, () => {
  const p = fixture(); mutate(p);
  const result = classify(p);
  assert.equal(result.classification, "BLOCKER");
  let calls = 0; invokeCorePolicyIfExecutable(result, migration, () => { calls++; });
  assert.equal(calls, 0);
});
for (const [name, mutate] of drifts)
  test(`canonical POST rejects security/preservation drift: ${name}`, () => {
    const p = fixture(true); mutate(p);
    assert.equal(classify(p, { post: true }).classification, "BLOCKER");
  });
test("64236/predecessor, ledger, marker, schema-state preservation failure cannot be bypassed", () => {
  assert.equal(classifyCorePolicyInventory(fixture(), baseline, false).classification, "BLOCKER");
});
test("already installed POST causes zero migration calls", () => {
  let calls = 0;
  assert.equal(invokeCorePolicyIfExecutable(classify(fixture(true)), migration, () => { calls++; }).invoked, 0);
  assert.equal(calls, 0);
});
test("one exact PRE causes exactly one local migration call", () => {
  let calls = 0;
  const result = invokeCorePolicyIfExecutable(classify(fixture()), migration, () => { calls++; return { status: 0 }; });
  assert.equal(result.invoked, 1); assert.equal(calls, 1);
});
test("malformed evidence and missing separately approved baseline remain UNKNOWN", () => {
  assert.equal(classifyCorePolicyInventory(fixture(), undefined, true).classification, "UNKNOWN");
  assert.equal(classifyCorePolicyInventory({}, baseline, true).classification, "UNKNOWN");
  assert.equal(classifyCorePolicyBatch(new Map(), baseline).classification, "UNKNOWN");
  const p = fixture(); p.policies.push(null);
  assert.equal(classify(p).classification, "UNKNOWN");
});
test("PostgreSQL numeric-string OIDs retain policy identity without weakening metadata", () => {
  const p = fixture(), approved = fixture();
  for (const evidence of [p, approved]) for (const policy of evidence.policies) policy.oid = String(policy.oid);
  assert.equal(classifyCorePolicyInventory(p, approved, true).classification, "EXECUTABLE_PRE");
  p.policies[0].oid = "not-an-oid";
  assert.equal(classifyCorePolicyInventory(p, approved, true).classification, "UNKNOWN");
});
test("metadata reporting does not emit credential fields or product rows", () => {
  const p = fixture(); p.password = "sensitive-sentinel"; p.dbUrl = "postgresql://hidden";
  const rendered = JSON.stringify(classify(p));
  assert.doesNotMatch(rendered, /sensitive-sentinel|postgresql:|productFingerprint|protectedObjectsHash/);
});
test("canonical policy matrix independently matches all 22 exact policy expectations", () => {
  assert.deepEqual([...CORE_POLICY_TABLES].sort(), [...tables].sort());
  assert.equal(PHASE3_POLICY_MATRIX.length, 22);
  for (const p of policies) {
    const expected = PHASE3_POLICY_MATRIX.find((r) => r.table === p.table && r.name === p.name);
    assert.equal(expected.command, p.command);
    assert.equal(expected.using, p.using); assert.equal(expected.withCheck, p.withCheck);
  }
});
test("SQL parity: every PRE/replacement/POST loop uses the independent ten-table matrix", () => {
  for (const [name, expected] of [["read_write_tables", writable], ["read_only_tables", readable]]) {
    const lists = [...migration.matchAll(new RegExp(`${name} constant text\\[\\] := array\\[([\\s\\S]*?)\\]::text\\[\\]`, "g"))];
    assert.equal(lists.length, 3);
    for (const match of lists) assert.deepEqual([...match[1].matchAll(/'([^']+)'/g)].map((r) => r[1]), expected);
  }
  assert.match(migration, /policy_state\.polroles <> array\[authenticated_oid\]/);
  assert.match(migration, /not policy_state\.polpermissive/);
  assert.match(migration, /when 'read' then 'r' when 'insert' then 'a' else 'w'/);
  for (const expression of ["user_id=reflab_private.request_user_idorreflab_private.is_super_admin", "user_id=reflab_private.request_user_id"])
    assert.ok(migration.includes(expression));
  assert.match(migration, /for select to authenticated using \(user_id = reflab_private\.request_user_id\(\) or reflab_private\.is_super_admin\(\)\)/);
  assert.match(migration, /for insert to authenticated with check \(user_id = reflab_private\.request_user_id\(\)\)/);
  assert.match(migration, /for update to authenticated using \(user_id = reflab_private\.request_user_id\(\)\) with check \(user_id = reflab_private\.request_user_id\(\)\)/);
});
test("expression normalization matches SQL; unknown helper names are not accepted", () => {
  assert.equal(normalizeCorePolicyExpression("(user_id = platform_request_user_id()) OR public.platform_is_super_admin()", true), normalizeCorePolicyExpression(read));
  assert.notEqual(normalizeCorePolicyExpression("user_id=public.institution_request_user_id()", true), normalizeCorePolicyExpression(owner));
});
test("migration byte pin and metadata-only mutation accounting remain exact", () => {
  assert.equal(createHash("sha256").update(migration).digest("hex"), CORE_POLICY_SHA256);
  assert.match(migration, /lock_timeout = '5s'/); assert.match(migration, /statement_timeout = '90s'/);
  assert.doesNotMatch(migration, /\b(?:grant|revoke|notify|truncate|insert into|update public|delete from|alter table|create function|create index|create trigger)\b/i);
  assert.equal(CORE_POLICY_MUTATIONS.policyCreates, 22);
  assert.equal(CORE_POLICY_MUTATIONS.maxPolicyDrops, 25);
  for (const [key, value] of Object.entries(CORE_POLICY_MUTATIONS)) if (!/PolicyDrops|policyCreates/.test(key)) assert.equal(value, 0, key);
});

for (const legacyPolicy of legacy) for (const [field, value] of [
  ["missing", null], ["name", "renamed"], ["command", "DELETE"], ["roles", ["anon"]],
  ["permissive", false], ["using", "true"], ["withCheck", "true"],
  ["using", historical.replace("'sub'", "'SUB'")],
]) test(`legacy retirement rejects ${legacyPolicy.table} ${field} ${JSON.stringify(value)}`, () => {
  const p = fixture(); const row = p.policies.find((r) => r.name === legacyPolicy.name);
  if (field === "missing") p.policies = p.policies.filter((r) => r !== row); else row[field] = value;
  const result = classify(p);
  assert.equal(result.classification, "BLOCKER");
  assert.equal(invokeCorePolicyIfExecutable(result, migration, () => assert.fail("must not execute")).invoked, 0);
});
test("POST requires retirement and rejects extra browser DELETE or direct-auth authorization", () => {
  for (const row of [...legacy, { ...legacy[1], name: "unexpected_delete", command: "DELETE", using: "true", withCheck: null },
    { ...legacy[0], name: "unexpected_direct_auth" }]) {
    const p = fixture(true); p.policies.push(structuredClone(row));
    assert.equal(classify(p, { post: true }).classification, "BLOCKER");
    assert.equal(classify(p).executablePre, false);
  }
});
test("SQL retirement PRE and JS share exact catalog metadata and literal semantics", () => {
  assert.equal(CORE_POLICY_LEGACY_EXPRESSION, historical);
  assert.deepEqual(CORE_POLICY_RETIRED, legacy.map(({ table, name, command }) => ({ table, name, command })));
  const block = migration.slice(migration.indexOf("do $legacy_preflight$"), migration.indexOf("do $replace_policies$"));
  assert.ok(block.includes(historical.replaceAll("'", "''")));
  for (const { table, name, command } of legacy) {
    assert.ok(block.includes(`('${table}', '${name}', '${command === 'ALL' ? '*' : 'r'}', ${command === 'ALL'})`));
  }
  assert.match(block, /actual.polroles is distinct from array\[authenticated_oid\]/);
  assert.match(block, /actual.polpermissive is distinct from true/);
  assert.match(block, /if not found then/);
  assert.equal((block.match(/^drop policy /gm) ?? []).length, 3);
  assert.ok(migration.indexOf("$legacy_preflight$;") < migration.indexOf('drop policy "Users'));
  assert.match(migration, /p.polroles && array\[0::oid, authenticated_oid\]/);
  assert.doesNotMatch(migration, /create policy[^;]*for delete/i);
});
test("bounded evidence batch preserves authoritative 64236 checks and inventories every policy", () => {
  const batch = buildCorePolicyBatch();
  assert.match(batch, /BEGIN READ ONLY/i); assert.match(batch, /ROLLBACK/i);
  assert.match(batch, /transaction_read_only/); assert.match(batch, /phase3_identity_security_bridge_post/);
  assert.match(batch, /pg_get_expr/); assert.match(batch, /aclexplode/);
  assert.doesNotMatch(batch, /\b(?:create policy|drop policy|set role|notify|insert into|update public|delete from)\b/i);
});
test("isolated rehearsal stops before browser privilege reconciliation", () => {
  const harness = readFileSync(new URL("./run-phase3-postgres.mjs", import.meta.url), "utf8");
  const rehearsalSource = readFileSync(new URL("./phase3-core-policy-postgres-rehearsal.mjs", import.meta.url), "utf8");
  assert.match(harness, /--rehearse-core-policy-reconciliation/);
  assert.match(harness, /return \{ identityPredecessor: result.fullPost, \.\.\.policy, cleanup: cleanupCluster\(\) \}/);
  assert.doesNotMatch(rehearsalSource, /64249|runProduction|REFLAB_PRODUCTION_DDL|process\.env/);
});
