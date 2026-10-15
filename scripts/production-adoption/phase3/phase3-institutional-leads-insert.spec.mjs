import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { leadFixture } from "./phase3-institutional-leads-insert-fixture.mjs";
import { PRE, POST, MIGRATION, GRANT, QUERY_ID, PRIVILEGES, classifyLead, leadChecks, assertMigration, migrationSource,
  preserved, observationSql, verifyCandidate } from "./phase3-institutional-leads-insert-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { TARGET } from "./phase3-additional-runtime-pre-contract.mjs";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const route = read("app/api/institutional-leads/route.ts");
const blocked = (e) => { const r = classifyLead(e); assert.equal(r.classification, "BLOCKER", JSON.stringify(r)); assert.equal(r.migrationInvocationCount, 0); };
test("PRE is exact and a separate already-installed POST refuses reexecution", () => {
  assert.equal(classifyLead(leadFixture()).classification, PRE);
  const post = classifyLead(leadFixture(true)); assert.equal(post.classification, POST); assert.equal(post.reexecution, "REFUSED");
  assert.equal(post.executablePre, false); assert.equal(post.migrationInvocationCount, 0);
});
test("missing observations are UNKNOWN", () => assert.equal(classifyLead(new Map()).classification, "UNKNOWN"));
test("new provider is isolated from generic migration inventory and chronological push", () => {
  assert.match(MIGRATION, /^scripts\/production-adoption\/phase3\/20261014000000_/);
  assert.doesNotMatch(read("scripts/production-preflight/manifest.mjs"), /20261014000000/);
});
test("exact standalone migration contains one GRANT and no row mutation", () => {
  assert.deepEqual(assertMigration(Buffer.from(read(MIGRATION))), { tableGrantChanges: 1, productInserts: 0, productUpdates: 0, productDeletes: 0, otherChanges: 0 });
  assert.equal(migrationSource().split(GRANT).length - 1, 1);
  assert.doesNotMatch(migrationSource(), /\b(?:insert\s+into|update\s+public|delete\s+from|notify|pg_notify|create\s+(?:function|policy)|revoke)\b/i);
});
for (const drift of ["\ngrant delete on public.institutional_leads to service_role;", "\nselect pg_notify('x','x');", "\ninsert into public.institutional_leads(email) values('fixture');"])
  test(`source rejects appended mutation ${drift.slice(1,24)}`, () => assert.throws(() => assertMigration(Buffer.from(migrationSource() + drift))));
for (const post of [false, true]) {
  for (const privilege of PRIVILEGES) test(`${post ? "POST" : "PRE"} rejects effective ${privilege} drift`, () => {
    const e = leadFixture(post); const row = e.get(QUERY_ID).effectiveService.find((x) => x.privilege === privilege); row.granted = !row.granted; blocked(e);
  });
  for (const role of ["PUBLIC", "anon", "authenticated"]) for (const privilege of PRIVILEGES)
    test(`${post ? "POST" : "PRE"} rejects ${role} ${privilege}`, () => {
      const e = leadFixture(post); e.get(QUERY_ID).browser.find((x) => x.role === role && x.privilege === privilege).granted = true; blocked(e);
    });
  for (const [field, value] of Object.entries({ owner: "other", rls: false, force: true, tableCount: 0, serviceBypass: false,
    serviceMemberships: 1, columnWriteSubstitutes: 1, protected: null, policies: [], columns: [], rawService: [] }))
    test(`${post ? "POST" : "PRE"} rejects ${field}`, () => { const e = leadFixture(post); e.get(QUERY_ID)[field] = value; blocked(e); });
  test(`${post ? "POST" : "PRE"} rejects wrong grantor and grant option`, () => {
    for (const drift of [{ grantor: "supabase_admin" }, { grantable: true }]) {
      const e = leadFixture(post); Object.assign(e.get(QUERY_ID).rawService[0], drift); blocked(e);
    }
  });
}
test("POST projection cannot hide an invalid original catalog count", () => {
  const e = leadFixture(true); e.get(SERVICE_FORENSIC_QUERY_ID).catalogCounts.tableAcls--; blocked(e);
});
for (const table of ["clips", "appointments", "attempts", "user_profiles"]) test(`completed ${table} ACL preserved`, () => {
  const e = leadFixture(); e.get(SERVICE_FORENSIC_QUERY_ID).effectiveTablePrivileges.find((x) => x.table === table && x.privilege === "SELECT").granted = false; blocked(e);
});
test("row/policy/function preservation fingerprint drift is rejected", () => {
  const before = leadFixture(), after = leadFixture(true); assert(preserved(before, after)); after.get(QUERY_ID).protected = "d".repeat(32); assert(!preserved(before, after));
});
test("observation is SELECT-only", () => assert.doesNotMatch(observationSql(), /\b(?:grant|revoke|insert\s+into|update\s+public|delete\s+from|notify)\b/i));
test("no Production runner or connection is exposed by this contract", () => {
  const source = read("scripts/production-adoption/phase3/phase3-institutional-leads-insert-contract.mjs");
  assert.doesNotMatch(source, /createSession\(|spawn\(|new Client\(/);
});
for (const [name, target] of Object.entries({ host: { ...TARGET, host: "localhost" }, port: { ...TARGET, port: 6543 },
  database: { ...TARGET, database: "other" }, project: { ...TARGET, project: "other" }, installer: { ...TARGET, installer: "other" }, ssl: { ...TARGET, sslmode: "disable" } }))
  test(`candidate gate rejects target ${name}`, () => assert.throws(() => verifyCandidate({ approvedHead: "a".repeat(40), target }, () => "a".repeat(40)), /TARGET_MISMATCH/));
test("candidate gate rejects wrong HEAD", () => assert.throws(() => verifyCandidate({ approvedHead: "a".repeat(40), target: TARGET }, () => "b".repeat(40)), /HEAD_MISMATCH/));
for (const status of [" M route.ts", "M  route.ts", "?? untracked"]) test(`candidate gate rejects ${status}`, () => {
  assert.throws(() => verifyCandidate({ approvedHead: "a".repeat(40), target: TARGET }, (args) => args[0] === "rev-parse" ? "a".repeat(40) : status), /WORKTREE_DIRTY/);
});
function committedCandidateMock() {
  const checkout = (path) => Buffer.from(read(path).replaceAll("\r\n", "\n"));
  const git = (args) => args[0] === "rev-parse" ? "a".repeat(40) : args[0] === "status" ? "" : checkout(args[1].slice(41));
  return { checkout, git };
}
test("candidate gate accepts exact committed bytes but grants no execution authorization", () => {
  const { checkout, git } = committedCandidateMock();
  assert.equal(verifyCandidate({ approvedHead: "a".repeat(40), target: TARGET }, git, checkout).productionDdlAuthorized, false);
});
for (const path of [MIGRATION, "app/api/institutional-leads/route.ts", "scripts/production-adoption/phase3/phase3-additional-runtime-service-role-matrix.mjs"])
  test(`candidate byte gate rejects ${path} drift`, () => {
    const { checkout, git } = committedCandidateMock();
    assert.throws(() => verifyCandidate({ approvedHead: "a".repeat(40), target: TARGET }, git,
      (p) => p === path ? Buffer.from(checkout(p).toString() + "\n") : checkout(p)), /CHECKOUT_DRIFT/);
  });
test("route uses only the existing server-only helper, no session or returning SELECT", () => {
  assert.match(route, /import \{ createSupabaseAdminClient \} from "@\/lib\/supabaseAdmin"/);
  assert.doesNotMatch(route, /createClient|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|SUPABASE_SECRET_KEY|accessToken|\.select\(/);
  const helper = read("lib/supabaseAdmin.ts"); assert.match(helper, /import "server-only"/); assert.match(helper, /process.env.SUPABASE_SECRET_KEY/);
  const client = read("components/InstitutionalLeadForm.tsx"); assert.doesNotMatch(client, /supabaseAdmin|SUPABASE_SECRET_KEY|createClient/);
  assert.match(read("lib/auth/apiAuthBoundary.ts"), /classified\("\/api\/institutional-leads", "public"\)/);
});
function routeHarness({ insertError = null } = {}) {
  const calls = [], exports = {};
  const mocks = {
    "next/server": { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } },
    "@/lib/supabaseAdmin": { createSupabaseAdminClient: () => {
      calls.push(["admin"]); return { from: (table) => ({ insert: async (payload) => { calls.push(["insert", table, payload]); return { error: insertError }; } }) };
    } },
    "@/lib/institutionalEmails": { sendInstitutionalLeadEmails: async (lead) => { calls.push(["email", lead]); return { internal: { ok: true }, confirmation: { ok: true } }; } },
    "@/lib/institutionalExperience": { activeInstitutionTypes: ["association"] },
  };
  const compiled = ts.transpileModule(route, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, { exports, require: (name) => { assert(Object.hasOwn(mocks, name), name); return mocks[name]; }, console: { error() {} } });
  return { calls, post: (body) => exports.POST({ json: async () => body }) };
}
test("actual route validates before constructing privileged client", async () => {
  const h = routeHarness(); assert.equal((await h.post({ fullName: " " })).status, 400); assert.equal(h.calls.length, 0);
});
test("actual route uses explicit allowlist, new status, server timestamps and email after INSERT", async () => {
  const h = routeHarness(); const result = await h.post({ fullName: " Test ", institutionName: " Local ", email: "local@example.invalid",
    status: "won", owner_user_id: "attacker", created_at: "untrusted", role: " Referee ", refereeCount: -3 });
  assert.equal(result.status, 200); assert.deepEqual(h.calls.map((c) => c[0]), ["admin", "insert", "email"]);
  const [, table, payload] = h.calls[1]; assert.equal(table, "institutional_leads"); assert.equal(payload.status, "new");
  assert.equal(payload.full_name, "Test"); assert.equal(payload.referee_count, null); assert(!Object.hasOwn(payload, "owner_user_id"));
  assert.equal(payload.created_at, payload.updated_at); assert.match(payload.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert(!JSON.stringify(result).includes("SUPABASE_SECRET_KEY"));
});
test("actual route does not email if INSERT fails", async () => {
  const h = routeHarness({ insertError: { message: "synthetic failure" } });
  assert.equal((await h.post({ fullName: "Test", institutionName: "Local", email: "local@example.invalid" })).status, 500);
  assert.equal(h.calls.some((c) => c[0] === "email"), false);
});
test("all expected lead checks are present", () => assert.equal(Object.keys(leadChecks(leadFixture().get(QUERY_ID), false)).length, 9));
