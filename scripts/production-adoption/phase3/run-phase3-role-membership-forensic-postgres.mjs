import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment, parseJsonResults } from "../../production-preflight/run.mjs";
import { READ_ONLY_GUARD_QUERY_ID } from "../../production-preflight/queries.mjs";
import { ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS } from "../bootstrap/production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { ROLE_MEMBERSHIP_QUERY_ID, buildRoleMembershipForensicBatch,
  classifyRoleMembershipEvidence } from "./phase3-role-membership-forensic-contract.mjs";
import { managedInstallerExact, processFailure } from "./run-production-phase3-role-membership-forensic.mjs";

const bin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const port = await new Promise((done, reject) => {
  const server = createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const n = server.address().port; server.close(() => done(n)); });
});
const base = resolve(mkdtempSync(join(tmpdir(), "reflab-role-forensic-pg17-")));
const data = join(base, "data");
const log = join(base, "postgres.log");
let started = false;
let cases = 0;
function command(name, args, input, user = "supabase_admin") {
  const env = buildPsqlEnvironment(process.env, { PGHOST: "127.0.0.1", PGPORT: String(port),
    PGDATABASE: "postgres", PGUSER: user, PGSSLMODE: "disable" });
  const result = spawnSync(exe(name), args, { env, input, encoding: "utf8", windowsHide: true,
    ...(name === "pg_ctl" ? { stdio: "ignore" } : {}),
    timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const reason = processFailure(result.error, { code: result.error?.code,
      status: result.status, stderr: result.stderr }).reason;
    throw new Error("LOCAL_PG17_" + name.toUpperCase() + "_FAILED:" + reason);
  }
  return result.stdout;
}
const sql = (input, user) => command("psql",
  ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "-At"], input, user);
function observe() {
  const results = parseJsonResults(sql(buildRoleMembershipForensicBatch(), "postgres"));
  assert.equal(results.get(READ_ONLY_GUARD_QUERY_ID), "on");
  assert.equal(managedInstallerExact(results.get(INSTALLER_IDENTITY_QUERY_ID)), true);
  const payload = results.get(ROLE_MEMBERSHIP_QUERY_ID);
  const report = classifyRoleMembershipEvidence(payload);
  return report;
}
try {
  assert.match(command("postgres", ["--version"]), /PostgreSQL\) 17\./);
  command("initdb", ["-D", data, "-U", "supabase_admin", "-A", "trust", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", log, "-o",
    "-h 127.0.0.1 -p " + port, "-w", "start"]);
  started = true;
  const roles = [...new Set(ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((r) => r.grantedRole))];
  sql("set createrole_self_grant = '';\ncreate role postgres login nosuperuser inherit createrole createdb replication bypassrls;\n"
    + roles.filter((r) => !r.startsWith("pg_")).map((r) =>
      "create role " + r + " nologin nosuperuser noinherit nocreaterole nocreatedb noreplication nobypassrls;").join("\n")
    + "\nalter database postgres owner to postgres;\n"
    + ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.filter((r) => r.grantorRole === "supabase_admin").map((r) =>
      "grant " + r.grantedRole + " to " + r.memberRole + " with admin " + r.adminOption
      + ", inherit " + r.inheritOption + ", set " + r.setOption + ";").join("\n"));
  sql("grant reflab_rls_owner to postgres with admin false, inherit false, set true;", "postgres");
  const exact = observe();
  assert.equal(exact.classification, "EXACT_APPROVED_MEMBERSHIP_STATE", JSON.stringify({
    failedChecks: exact.failedChecks, unknownChecks: exact.unknownChecks,
    membershipPairs: exact.rawMemberships.map((r) => [r.granted_role, r.member_role, r.grantor_role]),
  }));
  assert.equal(exact.rlsOwnerPostgresMemberships.length, 2);
  assert.deepEqual(new Set(exact.rlsOwnerPostgresMemberships.map((r) => r.grantor_role)),
    new Set(["postgres", "supabase_admin"]));
  const owner = exact.effectiveRelationships.find((r) =>
    r.subject_role === "postgres" && r.target_role === "reflab_rls_owner");
  assert.deepEqual([owner.member, owner.usage, owner.set], [true, false, true]);
  cases++;
  for (const role of ["anon", "authenticated", "service_role"]) {
    sql("grant " + role + " to authenticator with admin false, inherit false, set true;");
  }
  const auth = observe();
  assert.equal(auth.classification, "MEMBERSHIP_STATE_UNKNOWN");
  assert.equal(auth.authenticatorMemberships.length, 3);
  assert.equal(auth.securitySummary.browserRolesCanBecomePostgres, false);
  assert.equal(auth.effectiveRelationships.find((r) =>
    r.subject_role === "authenticator" && r.target_role === "anon").member, true);
  assert.equal(auth.effectiveRelationships.find((r) =>
    r.subject_role === "anon" && r.target_role === "authenticator").member, false);
  cases++;
  for (const [label, granted, member, options, check] of [
    ["ADMIN", "reflab_rls_owner", "authenticator", "admin true, inherit false, set false", "unexpectedAdminOptionPresent"],
    ["INHERIT", "reflab_rls_owner", "authenticated", "admin false, inherit true, set false", "unexpectedInheritOptionPresent"],
    ["SET", "reflab_rls_owner", "authenticator", "admin false, inherit false, set true", "authenticatorCanSetRlsOwner"],
  ]) {
    sql("grant " + granted + " to " + member + " with " + options + ";");
    const report = observe();
    assert.equal(report.classification, "UNSAFE_MEMBERSHIP_DRIFT", label);
    assert.equal(report.securitySummary[check], true, label);
    sql("revoke " + granted + " from " + member + ";");
    assert.equal(observe().classification, "MEMBERSHIP_STATE_UNKNOWN");
    cases++;
  }
  const before = sql("select count(*) from pg_catalog.pg_auth_members;");
  sql("begin; grant reflab_rls_owner to authenticator with admin true; rollback;");
  assert.equal(sql("select count(*) from pg_catalog.pg_auth_members;"), before);
  cases++;
} finally {
  // Stop only this harness's verified temporary data directory, even after startup errors.
  if (started || existsSync(join(data, "postmaster.pid"))) {
    command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  }
  if (existsSync(join(data, "postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  const temporaryRoot = resolve(tmpdir()) + sep;
  if (!base.startsWith(temporaryRoot) || !base.split(sep).at(-1).startsWith("reflab-role-forensic-pg17-")) {
    throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  }
  rmSync(base, { recursive: true, force: true });
}
console.log(JSON.stringify({ format: "LOCAL_ROLE_MEMBERSHIP_PG17_REHEARSAL",
  result: "PASS", cases, duplicateGrantors: "PRESERVED", direction: "EXACT",
  safeUnreviewedAuthenticatorState: "UNKNOWN", unsafeCases: 3, rollbackCases: 1,
  migrationsApplied: 0, productTablesCreated: 0, residualClusters: 0 }));
