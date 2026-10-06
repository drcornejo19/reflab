import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  buildRoleMembershipForensicBatch, classifyRoleMembershipEvidence, ROLE_MEMBERSHIP_QUERY_ID,
} from "./phase3-role-membership-forensic-contract.mjs";
import {
  FORENSIC_OPERATION, FORENSIC_VARIABLES, runRoleMembershipForensic,
  safeForensicFailure, processFailure, executeMembershipReadOnlyBatch,
} from "./run-production-phase3-role-membership-forensic.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { RESULT_FRAME_PREFIX } from "../../production-preflight/queries.mjs";
import { assertReadOnlyBatch, maskSqlCommentsAndStrings } from "../../production-preflight/sql-safety.mjs";

// Independent expected bootstrap tuples: do not derive fixture options from the classifier.
const approved = [
  ["anon", true, true, true], ["authenticated", true, true, true],
  ["authenticator", true, true, true], ["pg_create_subscription", true, true, true],
  ["pg_monitor", true, true, true], ["pg_read_all_data", true, true, true],
  ["pg_signal_backend", true, true, true], ["reflab_prod_preflight_ro", true, false, false],
  ["service_role", true, true, true], ["supabase_privileged_role", false, true, true],
  ["reflab_rls_owner", true, false, false], ["reflab_preflight_audit_owner", true, false, false],
];
const names = [...approved.map((r) => r[0]), "postgres", "supabase_admin"];
const ids = new Map(names.map((name, i) => [name, i + 100]));
const attributes = (name) => ({ oid: ids.get(name), rolname: name, rolsuper: false,
  rolinherit: name === "postgres", rolcreaterole: name === "postgres",
  rolcreatedb: name === "postgres", rolcanlogin: name === "postgres",
  rolreplication: name === "postgres", rolbypassrls: name === "postgres" });
const tuple = (granted, member, grantor, admin, inherit, set) => ({
  granted_role_oid: ids.get(granted), granted_role: granted,
  member_role_oid: ids.get(member), member_role: member,
  grantor_role_oid: ids.get(grantor), grantor_role: grantor,
  admin_option: admin, inherit_option: inherit, set_option: set,
});
export function exactFixture() {
  const subjects = ["postgres", "authenticator", "service_role", "reflab_rls_owner", "anon", "authenticated"];
  const targets = ["postgres", "authenticator", "service_role", "reflab_rls_owner",
    "reflab_preflight_audit_owner", "reflab_prod_preflight_ro", "anon", "authenticated",
    "supabase_admin", "supabase_privileged_role", "pg_create_subscription", "pg_monitor",
    "pg_read_all_data", "pg_signal_backend"];
  const raw = approved.map(([g, a, i, s]) => tuple(g, "postgres", "supabase_admin", a, i, s));
  raw.push(tuple("reflab_rls_owner", "postgres", "postgres", false, false, true));
  return {
    session: { current_user: "postgres", session_user: "postgres", database: "postgres",
      server_version_num: 170011, transaction_read_only: "on" },
    membership_count: raw.length, raw_memberships: raw, role_attributes: names.map(attributes),
    effective_relationships: subjects.flatMap((subject) => targets.map((target) => {
      const own = subject === target;
      const installer = subject === "postgres";
      return { subject_role: subject, target_role: target, member: own || installer,
        usage: own || (installer && ["postgres", "authenticator", "service_role"].includes(target)),
        set: own || (installer && ["postgres", "authenticator", "service_role", "reflab_rls_owner"].includes(target)) };
    })),
  };
}
const installer = () => ({ caller: "postgres", session_user: "postgres", server_version_num: 170011,
  database: { name: "postgres", postgres_has_create: true },
  installer: { ...attributes("postgres"), rolname: "postgres" } });
const env = () => Object.fromEntries(FORENSIC_VARIABLES.map((key, i) => [key,
  i < 3 ? "true" : i === 3 ? "nagjddldrldwavmfaytc" : i === 4 ? "a".repeat(40)
    : "postgresql://postgres.nagjddldrldwavmfaytc:synthetic-password@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require"]));
function invocation(overrides = {}) {
  let calls = 0;
  const options = { argv: [FORENSIC_OPERATION], environment: env(), head: () => "a".repeat(40),
    status: () => "", execute: () => { calls++; return new Map([
      [INSTALLER_IDENTITY_QUERY_ID, installer()], [ROLE_MEMBERSHIP_QUERY_ID, exactFixture()],
    ]); }, ...overrides };
  return { run: () => runRoleMembershipForensic(options), calls: () => calls };
}
function rejectsBeforeQuery(options, reason) {
  const call = invocation(options);
  assert.throws(call.run, (error) => safeForensicFailure(error).reason === reason);
  assert.equal(call.calls(), 0);
}
test("independent approved fixture -> EXACT, both grantors retained", () => {
  const report = classifyRoleMembershipEvidence(exactFixture());
  assert.equal(report.classification, "EXACT_APPROVED_MEMBERSHIP_STATE");
  assert.equal(report.rlsOwnerPostgresMemberships.length, 2);
  assert.deepEqual(report.rlsOwnerPostgresMemberships.map((r) => r.grantor_role), ["supabase_admin", "postgres"]);
  assert.equal(report.securitySummary.postgresCanSetRlsOwner, true);
  assert.equal(report.securitySummary.browserRolesCanBecomePostgres, false);
});
test("safe authenticator observations remain UNKNOWN without invented authority", () => {
  const p = exactFixture();
  for (const role of ["anon", "authenticated", "service_role"]) {
    p.raw_memberships.push(tuple(role, "authenticator", "supabase_admin", false, false, true));
  }
  p.membership_count = p.raw_memberships.length;
  const r = classifyRoleMembershipEvidence(p);
  assert.equal(r.classification, "MEMBERSHIP_STATE_UNKNOWN");
  assert.equal(r.authenticatorMemberships.length, 3);
  assert.equal(r.securitySummary.unexpectedAdminOptionPresent, "UNKNOWN");
});
for (const option of ["admin_option", "inherit_option", "set_option"]) {
  test("approved tuple " + option + " drift -> UNSAFE", () => {
    const p = exactFixture(); p.raw_memberships[12][option] = !p.raw_memberships[12][option];
    assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
  });
}
test("reversed membership direction is not approved", () => {
  const p = exactFixture();
  p.raw_memberships[12] = tuple("postgres", "reflab_rls_owner", "postgres", false, false, true);
  assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
});
for (const capability of ["usage", "set"]) {
  test("effective browser protected access " + capability + " -> UNSAFE", () => {
    const p = exactFixture(); p.effective_relationships.find((r) =>
      r.subject_role === "authenticated" && r.target_role === "postgres")[capability] = true;
    assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
  });
}
test("unauthorized authenticator ADMIN membership -> UNSAFE", () => {
  const p = exactFixture(); p.raw_memberships.push(tuple("reflab_rls_owner", "authenticator",
    "supabase_admin", true, false, false)); p.membership_count++;
  const r = classifyRoleMembershipEvidence(p);
  assert.equal(r.classification, "UNSAFE_MEMBERSHIP_DRIFT");
  assert.equal(r.securitySummary.unexpectedAdminOptionPresent, true);
});
test("missing and malformed evidence fail closed UNKNOWN", () => {
  for (const p of [null, {}, { ...exactFixture(), membership_count: 0 }]) {
    assert.equal(classifyRoleMembershipEvidence(p).classification, "MEMBERSHIP_STATE_UNKNOWN");
  }
});
test("duplicate triple rejected but different grantors preserved", () => {
  const p = exactFixture(); p.raw_memberships.push(p.raw_memberships[12]); p.membership_count++;
  assert.equal(classifyRoleMembershipEvidence(p).classification, "MEMBERSHIP_STATE_UNKNOWN");
});
test("PostgreSQL JSON string OIDs retained exactly", () => {
  const p = exactFixture();
  for (const r of p.role_attributes) r.oid = String(r.oid);
  for (const r of p.raw_memberships) {
    for (const f of ["granted_role_oid", "member_role_oid", "grantor_role_oid"]) r[f] = String(r[f]);
  }
  const report = classifyRoleMembershipEvidence(p);
  assert.equal(report.classification, "EXACT_APPROVED_MEMBERSHIP_STATE");
  assert.equal(typeof report.rawMemberships[0].granted_role_oid, "string");
});
test("read-only false cannot be exact", () => {
  const p = exactFixture(); p.session.transaction_read_only = "off";
  assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
});
test("happy runner preserves exact report and performs one batch", () => {
  const call = invocation(); assert.equal(call.run().classification, "EXACT_APPROVED_MEMBERSHIP_STATE");
  assert.equal(call.calls(), 1);
});
test("operation exact", () => rejectsBeforeQuery({ argv: [] }, "OPERATION_NOT_AUTHORIZED"));
for (const key of FORENSIC_VARIABLES.slice(0, 3)) {
  test("opt-in required: " + key, () => {
    const e = env(); delete e[key]; rejectsBeforeQuery({ environment: e }, "OPT_IN_REQUIRED");
  });
}
for (const key of ["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_IDENTITY_SECURITY_BRIDGE",
  "ALLOW_PRODUCTION_CUTOVER", "REFLAB_PRODUCTION_DDL_DB_URL", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD"]) {
  test("write contamination rejected by presence: " + key, () =>
    rejectsBeforeQuery({ environment: { ...env(), [key]: "" } }, "DDL_CONFIGURATION_REJECTED"));
}
test("all inherited PG state rejected by presence", () =>
  rejectsBeforeQuery({ environment: { ...env(), PGCONNECT_TIMEOUT: "" } }, "INHERITED_PG_STATE"));
test("Windows case-insensitive write contamination also rejected", () =>
  rejectsBeforeQuery({ environment: { ...env(), allow_production_ddl: "" } }, "DDL_CONFIGURATION_REJECTED"));
test("HEAD mismatch", () => rejectsBeforeQuery({ head: () => "b".repeat(40) }, "HEAD_MISMATCH"));
test("dirty tree", () => rejectsBeforeQuery({ status: () => "?? unexpected" }, "WORKTREE_DIRTY"));
for (const [name, replacement] of [
  ["direct", ["aws-1-sa-east-1.pooler.supabase.com:5432", "db.nagjddldrldwavmfaytc.supabase.co:5432"]],
  ["pooler", ["aws-1-sa-east-1", "aws-0-sa-east-1"]],
  ["database", ["/postgres?", "/other?"]],
  ["installer", ["postgres.nagjddldrldwavmfaytc:", "anon:"]],
  ["SSL", ["sslmode=require", "sslmode=disable"]],
]) {
  test("wrong target " + name, () => {
    const e = env(); e[FORENSIC_VARIABLES[5]] = e[FORENSIC_VARIABLES[5]].replace(...replacement);
    rejectsBeforeQuery({ environment: e }, "TARGET_MISMATCH");
  });
}
test("wrong project", () => {
  const e = env(); e[FORENSIC_VARIABLES[3]] = "other";
  rejectsBeforeQuery({ environment: e }, "TARGET_MISMATCH");
});
test("installer metadata exact, not weak login only", () => {
  const call = invocation({ execute: () => new Map([[INSTALLER_IDENTITY_QUERY_ID,
    { ...installer(), caller: "other" }], [ROLE_MEMBERSHIP_QUERY_ID, exactFixture()]]) });
  assert.throws(call.run, (e) => e.reason === "INSTALLER_MISMATCH");
});
test("missing query envelope is operational failure", () => {
  assert.throws(invocation({ execute: () => new Map() }).run, (e) => e.reason === "QUERY_RESULT_SHAPE_MISMATCH");
});
test("classifier exceptions are safe explicit failures", () => {
  assert.throws(invocation({ classify: () => { throw new Error("private secret"); } }).run,
    (e) => e.reason === "PRE_CLASSIFICATION_FAILED");
});
for (const [code, stderr, reason] of [
  ["ENOENT", "", "PSQL_NOT_FOUND"], ["ETIMEDOUT", "", "TIMEOUT"],
  [null, "FATAL: 28P01: password authentication failed", "AUTHENTICATION_FAILED"],
  [null, "ERROR: 42501: permission denied", "SQLSTATE_42501"],
  [null, "could not translate host name", "HOST_RESOLUTION_FAILED"],
  [null, "SSL certificate invalid", "TLS_FAILED"], [null, "connection refused", "CONNECTION_FAILED"],
  [null, "FATAL: 3D000: missing database", "DATABASE_UNAVAILABLE"],
]) {
  test("bounded process failure " + reason, () => {
    const r = safeForensicFailure(processFailure(new Error("postgresql://secret:password@private"), {
      code, stderr, status: 2 }));
    assert.equal(r.reason, reason);
    assert.equal(r.psqlExitStatus, 2);
    assert.doesNotMatch(JSON.stringify(r), /password@|postgresql:|private/);
  });
}
test("parser errors classified safely", () =>
  assert.equal(processFailure(new SyntaxError("secret JSON")).reason, "JSON_PARSE_FAILED"));
test("read-only guard process failure classified", () =>
  assert.equal(processFailure(new Error("transaction_read_only was not confirmed as on")).reason, "READ_ONLY_GUARD_FAILED"));
const frame = (query, payload, count = 1) => RESULT_FRAME_PREFIX + "\t" + query + "\t"
  + Buffer.from(JSON.stringify({ query, payload_row_count: count, payload })).toString("base64");
test("actual adapter requires read-only guard ON", () => {
  assert.throws(() => executeMembershipReadOnlyBatch(buildRoleMembershipForensicBatch(), {}, {
    processEnvironment: {}, spawn: () => ({ status: 0, stdout: frame("read_only_guard", "off"), stderr: "" }),
  }), (e) => e.reason === "READ_ONLY_GUARD_FAILED");
});
test("actual adapter rejects unexpected result row cardinality", () => {
  assert.throws(() => executeMembershipReadOnlyBatch(buildRoleMembershipForensicBatch(), {}, {
    processEnvironment: {}, spawn: () => ({ status: 0,
      stdout: frame(ROLE_MEMBERSHIP_QUERY_ID, exactFixture(), 2), stderr: "" }),
  }), (e) => e.reason === "QUERY_RESULT_SHAPE_MISMATCH");
});
test("shared parser rejects malformed JSON frame without leaking payload", () => {
  const output = RESULT_FRAME_PREFIX + "\t" + ROLE_MEMBERSHIP_QUERY_ID + "\t"
    + Buffer.from("private-password invalid-json").toString("base64");
  assert.throws(() => executeMembershipReadOnlyBatch(buildRoleMembershipForensicBatch(), {}, {
    processEnvironment: {}, spawn: () => ({ status: 0, stdout: output, stderr: "" }),
  }), (e) => {
    const safe = safeForensicFailure(e);
    assert.equal(safe.reason, "QUERY_RESULT_SHAPE_MISMATCH");
    assert.equal(safe.query, ROLE_MEMBERSHIP_QUERY_ID);
    assert.doesNotMatch(JSON.stringify(safe), /private-password|invalid-json/);
    return true;
  });
});
test("effective managed superuser reachability is unsafe", () => {
  const p = exactFixture(); p.effective_relationships.find((r) =>
    r.subject_role === "authenticator" && r.target_role === "supabase_admin").set = true;
  assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
});
test("managed installer raw attributes cannot silently diverge", () => {
  const p = exactFixture(); p.role_attributes.find((r) => r.rolname === "postgres").rolsuper = true;
  assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
});
test("browser access to managed read-all-data role is unsafe", () => {
  const p = exactFixture(); p.effective_relationships.find((r) =>
    r.subject_role === "anon" && r.target_role === "pg_read_all_data").usage = true;
  assert.equal(classifyRoleMembershipEvidence(p).classification, "UNSAFE_MEMBERSHIP_DRIFT");
});
test("process adapter uses bounded verbose psql and rejects spawn failure", () => {
  assert.throws(() => executeMembershipReadOnlyBatch(buildRoleMembershipForensicBatch(), {}, {
    processEnvironment: {}, spawn: (command, args, options) => {
      assert.equal(command, "psql"); assert.ok(args.includes("-X")); assert.ok(args.includes("--no-psqlrc"));
      assert.ok(args.includes("ON_ERROR_STOP=1")); assert.ok(args.includes("VERBOSITY=verbose"));
      assert.equal(options.timeout, 30000);
      return { status: null, error: { code: "ENOENT" }, stderr: "private-password" };
    },
  }), (e) => e.reason === "PSQL_NOT_FOUND");
});
test("SQL bounded read-only, no writes or product data", () => {
  const sql = buildRoleMembershipForensicBatch();
  assertReadOnlyBatch(sql);
  assert.match(sql, /begin read only;/i); assert.match(sql, /rollback;\s*$/i);
  assert.match(sql, /transaction_read_only/); assert.match(sql, /lock_timeout/);
  assert.match(sql, /statement_timeout/);
  assert.doesNotMatch(maskSqlCommentsAndStrings(sql), /\b(?:insert|update|delete|create|alter|grant|revoke|notify|set role|distinct)\b/i);
  assert.doesNotMatch(sql, /rolpassword|rolconfig|jwt|public\./i);
});
test("output drops arbitrary payload fields and secrets", () => {
  const p = exactFixture(); p.password = "private-password"; p.raw_memberships[0].url = "postgresql://secret";
  assert.doesNotMatch(JSON.stringify(classifyRoleMembershipEvidence(p)), /private-password|postgresql:/);
  assert.doesNotMatch(JSON.stringify(safeForensicFailure(new Error("postgresql://secret"))), /postgresql:/);
});
test("no provider execution imports or discovery path", () => {
  for (const file of ["run-production-phase3-role-membership-forensic.mjs", "phase3-role-membership-forensic-contract.mjs"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /executeMigration|readFileSync|migrations\/|db push|run-production-phase2b|run-production-identity-security/);
  }
});
test("protected migration and existing attestation byte-identical", () => {
  for (const [path, hash] of [
    ["../../../supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql",
      "057ab50a4cbe40f153ca2c3d32563b1f188f366e358912ceabbc1fefc2f78330"],
    ["run-production-identity-security-bridge-pre-attestation.mjs",
      "7863d99a6a7036552e2ec1fd260610782cc2fe0e1a17b4ec2cb7e86fcd48ee2f"],
  ]) assert.equal(createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex"), hash);
});
