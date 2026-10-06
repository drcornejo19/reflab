import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  IDENTITY_MEMBERSHIP_PRE_SQL, IDENTITY_HELPER_ACL_PRE_SQL, IDENTITY_PRE_MEMBERSHIPS,
  IDENTITY_PRE_HELPER_ACL, identityMembershipsExact, legacyServiceRoleAccessExact,
} from "./phase3-identity-pre-input.mjs";
import { identityBridgePostExact } from "./phase3-identity-pre-postgres-rehearsal.mjs";

const root = resolve(import.meta.dirname, "../../..");
const migration = "supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql";
const sql = readFileSync(resolve(root, migration), "utf8");
// Independent approved tuple options, not obtained from the implementation's constants.
const rows = [
  ["anon", true, true, true], ["authenticated", true, true, true],
  ["authenticator", true, true, true], ["pg_create_subscription", true, true, true],
  ["pg_monitor", true, true, true], ["pg_read_all_data", true, true, true],
  ["pg_signal_backend", true, true, true], ["reflab_prod_preflight_ro", true, false, false],
  ["service_role", true, true, true], ["supabase_privileged_role", false, true, true],
  ["reflab_rls_owner", true, false, false], ["reflab_preflight_audit_owner", true, false, false],
].map(([granted_role, admin_option, inherit_option, set_option]) => ({ granted_role,
  member_role: "postgres", grantor_role: "supabase_admin", admin_option, inherit_option, set_option }))
  .concat({ granted_role: "reflab_rls_owner", member_role: "postgres", grantor_role: "postgres",
    admin_option: false, inherit_option: false, set_option: true })
  .concat(["anon", "authenticated", "service_role"].map((granted_role) => ({ granted_role,
    member_role: "authenticator", grantor_role: "supabase_admin",
    admin_option: false, inherit_option: false, set_option: true })));
const relationships = ["anon", "authenticated", "authenticator", "service_role"]
  .flatMap((subject_role) => ["postgres", "reflab_rls_owner", "reflab_prod_preflight_ro",
    "reflab_preflight_audit_owner", "supabase_admin", "supabase_privileged_role"]
    .map((target_role) => ({ subject_role, target_role, member: false, usage: false, set: false })))
  .concat({ subject_role: "postgres", target_role: "reflab_rls_owner", member: true, usage: false, set: true });
const acl = ["institution", "platform", "reflab"].flatMap((name) =>
  (name === "platform" ? ["authenticated", "postgres", "service_role"]
    : ["PUBLIC", "anon", "authenticated", "postgres", "service_role"])
    .map((grantee) => ({ signature: `public.${name}_request_user_id()`, grantee,
      grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false })));
const key = (r) => [r.granted_role, r.member_role, r.grantor_role,
  r.admin_option, r.inherit_option, r.set_option].join("|");

test("independent exact 16-tuple input and dual grantors", () => {
  assert.equal(identityMembershipsExact(rows, relationships), true);
  assert.equal(IDENTITY_PRE_MEMBERSHIPS.length, 16);
  assert.deepEqual(IDENTITY_PRE_MEMBERSHIPS.map((r) => [r.grantedRole, r.memberRole,
    r.grantorRole, r.adminOption, r.inheritOption, r.setOption].join("|")).sort(), rows.map(key).sort());
});
test("storage/ETL managed topology is not frozen as a dependency", () => {
  const noise = [
    { granted_role: "authenticator", member_role: "supabase_storage_admin", grantor_role: "supabase_admin",
      admin_option: false, inherit_option: false, set_option: true },
    { granted_role: "supabase_privileged_role", member_role: "supabase_etl_admin", grantor_role: "supabase_admin",
      admin_option: false, inherit_option: true, set_option: true },
  ];
  assert.equal(identityMembershipsExact([...rows, ...noise], relationships), true);
  assert.equal(identityMembershipsExact(rows, relationships), true);
});
for (const field of ["grantor_role", "admin_option", "inherit_option", "set_option"]) {
  test("approved Reflab tuple rejects " + field + " drift", () => {
    const actual = structuredClone(rows);
    actual[12][field] = field === "grantor_role" ? "authenticator" : !actual[12][field];
    assert.equal(identityMembershipsExact(actual, relationships), false);
  });
}
test("missing approved membership fails closed", () => {
  assert.equal(identityMembershipsExact(rows.slice(1), relationships), false);
});
test("reversed owner/installer membership fails closed", () => {
  const actual = structuredClone(rows);
  [actual[12].granted_role, actual[12].member_role] = [actual[12].member_role, actual[12].granted_role];
  assert.equal(identityMembershipsExact(actual, relationships), false);
});
test("additional Reflab protected membership fails closed", () => {
  assert.equal(identityMembershipsExact([...rows, { ...rows[12], member_role: "supabase_storage_admin" }], relationships), false);
});
for (const subject of ["anon", "authenticated", "authenticator", "service_role"]) {
  for (const target of ["postgres", "reflab_rls_owner"]) {
    for (const option of ["member", "usage", "set"]) {
      test(`${subject} -> ${target} ${option} escalation rejected`, () => {
        const actual = structuredClone(relationships);
        actual.find((r) => r.subject_role === subject && r.target_role === target)[option] = true;
        assert.equal(identityMembershipsExact(rows, actual), false);
      });
    }
  }
}
test("membership and historical ACL SQL are byte-parity pinned in migration PRE", () => {
  assert.ok(sql.includes("if not " + IDENTITY_MEMBERSHIP_PRE_SQL + " then"));
  assert.ok(sql.includes("if not " + IDENTITY_HELPER_ACL_PRE_SQL + " then"));
  assert.deepEqual([...IDENTITY_PRE_HELPER_ACL].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    [...acl].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
});
test("historical helper PRE is independently grounded in historical migration bodies", () => {
  for (const [file, name] of [["202607160001_institutional_multitenant_foundation.sql", "institution"],
    ["202607240002_core_rls_lockdown.sql", "platform"]]) {
    const historical = readFileSync(resolve(root, "supabase/migrations", file), "utf8");
    const body = historical.match(new RegExp(`function public\\.${name}_request_user_id\\(\\)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`, "i"))[1].trim();
    assert.equal(createHash("sha256").update(body).digest("hex"), "d035c5365d2bef99fa241696564a74587dd47635005771c54731b8c76132edc1");
  }
  assert.match(sql, /helper_state\.proconfig is not null/);
  assert.doesNotMatch(sql, /9893e8f1/);
});
test("hardened POST changes only the reviewed ownership lifecycle order", () => {
  const old = execFileSync("git", ["-c", "safe.directory=" + root.replaceAll("\\", "/"),
    "show", "487cad9b396632e7c41e1abf9fb5ca7781637ea8:" + migration], { cwd: root, encoding: "utf8", windowsHide: true });
  const tail = (s) => s.replaceAll("\r\n", "\n").slice(s.indexOf("create function reflab_private.request_user_id()"));
  const ownership = "alter function reflab_private.is_super_admin() owner to reflab_rls_owner;\nrevoke create on schema reflab_private from reflab_rls_owner;";
  const corrected = tail(old).replace(ownership + "\n\n", "")
    .replace("grant execute on function reflab_private.is_super_admin() to authenticated;",
      "grant execute on function reflab_private.is_super_admin() to authenticated;\n\n"
      + "-- Harden ACLs while the installer is still the direct function owner.\n" + ownership);
  assert.equal(tail(sql), corrected);
  const wrappers = [...tail(sql).matchAll(/create or replace function public\.\w+_request_user_id\(\)[\s\S]*?as \$function\$([\s\S]*?)\$function\$;/g)];
  assert.equal(wrappers.length, 3);
  for (const wrapper of wrappers) assert.equal(createHash("sha256").update(wrapper[1].trim()).digest("hex"),
    "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c");
});
test("required service-role access is independent from historical PUBLIC/anon grants", () => {
  assert.equal(legacyServiceRoleAccessExact(acl), true);
});
for (const field of ["missing", "grantor", "is_grantable"]) {
  test("service-role " + field + " drift rejected", () => {
    const actual = structuredClone(acl);
    const index = actual.findIndex((r) => r.grantee === "service_role");
    if (field === "missing") actual.splice(index, 1);
    else actual[index][field] = field === "grantor" ? "reflab_rls_owner" : true;
    assert.equal(legacyServiceRoleAccessExact(actual), false);
  });
}

test("only is_super_admin transfers ownership, after its ACL is hardened", () => {
  const revoke = sql.indexOf("revoke all on function reflab_private.is_super_admin()");
  const grant = sql.indexOf("grant execute on function reflab_private.is_super_admin() to authenticated;");
  const owner = sql.indexOf("alter function reflab_private.is_super_admin() owner to reflab_rls_owner;");
  assert.ok(revoke < grant && grant < owner && owner < sql.indexOf("do $assertions$"));
  assert.equal([...sql.matchAll(/alter function .* owner to /g)].length, 1);
});

test("ACL lifecycle correction stays in one transaction without product or adoption mutations", () => {
  assert.equal([...sql.matchAll(/^begin;/gm)].length, 1);
  assert.equal([...sql.matchAll(/^commit;/gm)].length, 1);
  assert.doesNotMatch(sql, /^\s*(insert\s+into|update\s+|delete\s+from|notify\s+|create\s+(table|policy|index)|alter\s+table)\b/im);
  assert.equal([...sql.matchAll(/^create function /gm)].length, 2);
  assert.equal([...sql.matchAll(/^create or replace function /gm)].length, 3);
  assert.match(sql, /set local lock_timeout = '5s'/);
  assert.match(sql, /set local statement_timeout = '60s'/);
});

// Independently written intended 64236 POST, including owner ACL rows.
const postRows = [
  ["reflab_private.request_user_id()", "text", false, "postgres", "e8f03466a3552a13b61c5555e9bed5a8fb392d4236d9fd69fea720fc529cbcd5", ["postgres", "authenticated", "reflab_rls_owner"]],
  ["reflab_private.is_super_admin()", "boolean", true, "reflab_rls_owner", "5daabe23a490557055a2129814bf408ebf2af42604ad21d25226cce01e4b9986", ["reflab_rls_owner", "authenticated"]],
  ...["institution", "platform", "reflab"].map((n) => [`public.${n}_request_user_id()`, "text", false, "postgres", "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c", ["postgres", "authenticated", "service_role"]]),
];
const postFixture = {
  functions: postRows.map(([signature, result_type, security_definer, owner, source_hash]) => ({ signature,
    identity_arguments: "", result_type, language: "sql", volatility: "s", strict: false,
    security_definer, leakproof: false, kind: "f", owner, configuration: ["search_path=pg_catalog"], source_hash })),
  acl: postRows.flatMap(([signature, , , owner, , grantees]) => grantees.map((grantee) => ({ signature,
    grantee, grantor: owner, privilege: "EXECUTE", grantable: false }))),
  rls_owner_create: false, ledger_rows: 4, schema_state_rows: 0,
};
test("independent five-function hardened POST has exact 14-row ACL", () => {
  assert.equal(postFixture.acl.length, 14);
  assert.equal(identityBridgePostExact(postFixture), true);
});
for (const [name, mutate] of [
  ["wrong_owner", (p) => { p.functions[1].owner = "postgres"; }],
  ["PUBLIC_execute", (p) => { p.acl.push({ ...p.acl[3], grantee: "PUBLIC" }); }],
  ["anon_execute", (p) => { p.acl.push({ ...p.acl[3], grantee: "anon" }); }],
  ["service_missing", (p) => { p.acl = p.acl.filter((a) => a.grantee !== "service_role"); }],
  ["wrong_grantor", (p) => { p.acl[3].grantor = "postgres"; }],
  ["grant_option", (p) => { p.acl[3].grantable = true; }],
  ["configuration", (p) => { p.functions[1].configuration = ["search_path=public"]; }],
  ["security_mode", (p) => { p.functions[1].security_definer = false; }],
  ["source", (p) => { p.functions[1].source_hash = "0".repeat(64); }],
  ["residual_CREATE", (p) => { p.rls_owner_create = true; }],
  ["missing_function", (p) => { p.functions.pop(); }],
]) {
  test("hardened POST rejects " + name, () => {
    const actual = structuredClone(postFixture);
    mutate(actual);
    assert.equal(identityBridgePostExact(actual), false);
  });
}
