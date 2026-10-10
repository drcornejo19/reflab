import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { buildServiceRoleMechanicalFixture, SERVICE_FIXTURE_STATUS } from "./phase3-service-role-privilege-forensic-fixture.mjs";
import { buildServiceRoleForensicBatch, classifyLocalServiceRoleForensic, PRIMARY_TABLES, ADDITIONAL_TABLES, PREDEFINED_TABLE_AUTHORITIES } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { executeBrowserForensicReadOnly } from "./run-production-browser-privilege-baseline-forensic.mjs";
import { BROWSER_TRANSITION_BASELINE as baseline } from "./phase3-browser-privilege-production-baseline.mjs";

const bin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const exe = (name) => join(bin, name + (process.platform === "win32" ? ".exe" : ""));
const port = await new Promise((done, reject) => {const server = createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {const p = server.address().port; server.close(() => done(p));});});
const base = resolve(mkdtempSync(join(tmpdir(), "reflab-service-forensic-pg17-"))), data = join(base, "data");
let started = false, warnings = 0, observations = 0, pid;
const warningDetails = [];
const connection = (user) => ({PGHOST: "127.0.0.1", PGPORT: String(port), PGDATABASE: "postgres", PGUSER: user, PGSSLMODE: "disable"});
function command(name, args, input, user = "supabase_admin") {
  const r = spawnSync(exe(name), args, {env: buildPsqlEnvironment(process.env, connection(user)), input, encoding: "utf8",
    windowsHide: true, timeout: 120000, maxBuffer: 32 * 1024 * 1024, ...(name === "pg_ctl" ? {stdio: "ignore"} : {})});
  if (r.error || r.status !== 0) throw new Error(`LOCAL_PG17_${name.toUpperCase()}_FAILED: ${String(r.stderr ?? r.error?.code ?? "").slice(0, 1500)}`);
  warnings += (String(r.stderr ?? "").match(/WARNING:/g) ?? []).length;
  if (String(r.stderr ?? "").includes("WARNING:")) warningDetails.push(String(r.stderr));
  return r.stdout;
}
const sql = (s, user = "postgres") => command("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "-At"], s, user);
function collect() {
  const results = executeBrowserForensicReadOnly(buildServiceRoleForensicBatch(), connection("postgres"), {processEnvironment: process.env,
    spawn: (program, args, options) => {
      assert.equal(program, "psql"); assert.equal(options.env.PGHOST, "127.0.0.1");
      assert.match(options.input, /^begin read only;/); assert.match(options.input, /rollback;\s*$/);
      assert.doesNotMatch(options.input, /^\s*(?:commit|create|alter|drop|grant|revoke|insert|update|delete|notify|set role)\b/im);
      const r = spawnSync(exe(program), args, options); warnings += (String(r.stderr ?? "").match(/WARNING:/g) ?? []).length; return r;
    }});
  observations++; return results;
}
const complete = "SERVICE_ROLE_FORENSIC_OBSERVATION_COMPLETE";
let report;
try {
  assert.match(command("postgres", ["--version"]), /PostgreSQL\) 17\./);
  command("initdb", ["-D", data, "-U", "supabase_admin", "-A", "trust", "--no-locale"]);
  command("pg_ctl", ["-D", data, "-l", join(base, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]); started = true;
  pid = Number(readFileSync(join(data, "postmaster.pid"), "utf8").split(/\r?\n/)[0]);
  sql(buildServiceRoleMechanicalFixture(), "supabase_admin");
  const before = collect(), proof = {fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, {targetExact: true}).historicalState};
  const observe = (e = collect()) => classifyLocalServiceRoleForensic(e, {targetExact: true}, proof);
  const first = observe(before), outcomes = {};
  assert.equal(first.classification, complete, JSON.stringify(first.failedChecks));
  assert.equal(first.primaryTables.length, 13); assert.equal(first.policies.length, 55);
  assert.equal(first.primaryEffectiveServiceRolePrivileges.length, 104);
  assert.equal(first.currentVsDesignDelta.effectivePrivilegeEntryRevocations, 70);
  assert.equal(first.currentVsDesignDelta.effectivePrivilegeEntryGrants, 3);
  assert.deepEqual(collect(), before); outcomes.exactCarriedForward = "PASS";
  function scenario(name, mutation, restore, verify, expected = complete) {
    sql(mutation, "supabase_admin");
    const result = observe(); assert.equal(result.classification, expected, `${name}: ${JSON.stringify(result.failedChecks)}`);
    assert.equal(result.mutationCount, 0); assert.equal(result.approval, "NOT_PERFORMED");
    if (verify) verify(result);
    sql(restore, "supabase_admin");
    const restored = observe(); assert.equal(restored.classification, complete, `${name}: restoration failed: ${JSON.stringify(restored.failedChecks)}`);
    outcomes[name] = "PASS";
  }
  scenario("serviceGrantMissing", "revoke delete on public.attempts from service_role;", "grant delete on public.attempts to service_role;", null, "BLOCKER");
  scenario("refereeUnexpectedServiceAcl", "grant select on public.referee_exam_sessions to service_role;", "revoke select on public.referee_exam_sessions from service_role;", null, "BLOCKER");
  scenario("publicPrivilegeOrigin", "grant maintain on public.coach_rate_limit_buckets to public;", "revoke maintain on public.coach_rate_limit_buckets from public;",
    (r) => assert.ok(r.coachRateLimitState.effectivePrivileges.find((p) => p.privilege === "MAINTAIN").origins.some((p) => p.path === "PUBLIC")));
  scenario("inheritedPrivilegeOrigin", "create role local_service_parent; grant delete on public.coach_rate_limit_buckets to local_service_parent; grant local_service_parent to service_role with inherit true, set false;",
    "revoke local_service_parent from service_role; revoke delete on public.coach_rate_limit_buckets from local_service_parent; drop role local_service_parent;",
    (r) => {assert.ok(r.coachRateLimitState.effectivePrivileges.find((p) => p.privilege === "DELETE").origins.some((p) => p.path === "INHERITED_ROLE_GRANT"));
      assert.equal(r.roleCapabilities.local_service_parent.canSetRole, false); assert.equal(r.roleCapabilities.local_service_parent.inheritsPrivileges, true);});
  scenario("setRoleWithoutInheritance", "create role local_service_parent; grant local_service_parent to service_role with inherit false, set true;",
    "revoke local_service_parent from service_role; drop role local_service_parent;",
    (r) => {assert.equal(r.roleCapabilities.local_service_parent.canSetRole, true); assert.equal(r.roleCapabilities.local_service_parent.inheritsPrivileges, false);});
  for (const [role, privileges] of Object.entries(PREDEFINED_TABLE_AUTHORITIES)) scenario(`predefined_${role}`,
    `grant ${role} to service_role with inherit true, set false;`, `revoke ${role} from service_role;`,
    (r) => {for (const privilege of privileges) {
      const value = r.primaryEffectiveServiceRolePrivileges.find((p) => p.table === "referee_exam_sessions" && p.privilege === privilege);
      assert.equal(value.granted, true); assert.ok(value.origins.some((o) => o.path === "PREDEFINED_ROLE_AUTHORITY" && o.role === role));
    }});
  scenario("bypassRlsObserved", "alter role service_role nobypassrls;", "alter role service_role bypassrls;",
    (r) => assert.equal(r.primaryTables.find((t) => t.table === "attempts").serviceRoleRowAccessPath, "POLICY_REQUIRED"));
  scenario("grantOptionObserved", "grant select on public.coach_rate_limit_buckets to service_role with grant option;", "revoke grant option for select on public.coach_rate_limit_buckets from service_role;",
    (r) => assert.ok(r.additionalTableRawAcls.some((p) => p.table === "coach_rate_limit_buckets" && p.grantee === "service_role" && p.grantable)));
  scenario("wrongPrimaryGrantOption", "grant select on public.attempts to service_role with grant option;", "revoke grant option for select on public.attempts from service_role;", null, "BLOCKER");
  scenario("columnAclDrift", "grant select(id) on public.referee_exam_sessions to service_role;", "revoke select(id) on public.referee_exam_sessions from service_role;", null, "BLOCKER");
  scenario("functionInvokerObserved", "alter function public.submit_canonical_training_attempt() security invoker;", "alter function public.submit_canonical_training_attempt() security definer;",
    (r) => assert.equal(r.relevantFunctions.find((f) => f.name === "submit_canonical_training_attempt").underlyingAccessRole, "CALLER_INVOKER_SERVICE_ROLE"), "BLOCKER");
  scenario("functionOwnerObserved", "alter function public.consume_coach_rate_limit() owner to service_role;", "alter function public.consume_coach_rate_limit() owner to postgres; grant execute on function public.consume_coach_rate_limit() to service_role;",
    (r) => assert.equal(r.coachRateLimitState.functions[0].owner, "service_role"), "BLOCKER");
  scenario("functionExecuteObserved", "revoke execute on function public.consume_coach_rate_limit() from service_role;", "grant execute on function public.consume_coach_rate_limit() to service_role;",
    (r) => assert.equal(r.coachRateLimitState.functions[0].serviceRoleExecute, false), "BLOCKER");
  scenario("browserPostDrift", "grant maintain on public.attempts to authenticated;", "revoke maintain on public.attempts from authenticated;", null, "BLOCKER");
  const training = baseline.policies.find((p) => p.name === "training_attempt_profile_read");
  scenario("policyLiteralDrift", `alter policy training_attempt_profile_read on public.user_profiles using (${training.using.replace("training_user_id", "training_user_id ")});`,
    `alter policy training_attempt_profile_read on public.user_profiles using (${training.using});`, null, "BLOCKER");
  scenario("64236AclDrift", "grant execute on function reflab_private.request_user_id() to public;", "revoke execute on function reflab_private.request_user_id() from public;", null, "BLOCKER");
  scenario("ownerDrift", "alter table public.referee_exam_sessions owner to service_role;", "alter table public.referee_exam_sessions owner to postgres;", null, "BLOCKER");
  scenario("rlsDrift", "alter table public.referee_exam_sessions disable row level security;", "alter table public.referee_exam_sessions enable row level security;", null, "BLOCKER");
  scenario("forceDrift", "alter table public.referee_exam_sessions force row level security;", "alter table public.referee_exam_sessions no force row level security;", null, "BLOCKER");
  scenario("historicalCountDrift", "insert into public.clips(id,user_id) values(999,'local_forensic_drift');", "delete from public.clips where id=999;", null, "BLOCKER");
  scenario("adoptionLedgerDrift", "update reflab_meta.production_adoption_state set phase_key='local_forensic_drift' where phase_order=4;",
    "update reflab_meta.production_adoption_state set phase_key='canonical_objects' where phase_order=4;", null, "BLOCKER");
  scenario("runtimeSchemaStateDrift", "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_forensic_drift');",
    "delete from reflab_meta.reflab_schema_state where baseline_version='local_forensic_drift';", null, "BLOCKER");
  scenario("cutoverPresenceDrift", "create role reflab_pre_cutover_evidence_owner nologin;", "drop role reflab_pre_cutover_evidence_owner;", null, "BLOCKER");
  scenario("phase4PresenceDrift", "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_forensic_drift';",
    "comment on table public.user_profiles is null;", null, "BLOCKER");
  scenario("unexpectedRefereePolicy", "create policy local_forensic_browser_read on public.referee_exam_sessions for select to authenticated using(true);",
    "drop policy local_forensic_browser_read on public.referee_exam_sessions;", null, "BLOCKER");
  scenario("publicColumnCapability", "grant select(id) on public.referee_exam_sessions to public;", "revoke select(id) on public.referee_exam_sessions from public;", null, "BLOCKER");
  scenario("additionalGrantorVisibility", "grant select on public.coach_rate_limit_buckets to service_role with grant option; set session authorization service_role; grant select on public.coach_rate_limit_buckets to authenticated; reset session authorization;",
    "set session authorization service_role; revoke select on public.coach_rate_limit_buckets from authenticated; reset session authorization; revoke grant option for select on public.coach_rate_limit_buckets from service_role;",
    (r) => assert.ok(r.additionalTableRawAcls.some((a) => a.table === "coach_rate_limit_buckets" && a.grantee === "authenticated" && a.grantor === "service_role")));
  scenario("additionalRuntimeAbsence", "alter table public.institution_contents rename to local_absent_contents;", "alter table public.local_absent_contents rename to institution_contents;",
    (r) => {assert.equal(r.additionalRuntimeTables.find((t) => t.table === "institution_contents").exists, false);
      assert.ok(r.additionalEffectiveServiceRolePrivileges.filter((p) => p.table === "institution_contents").every((p) => p.granted === null));});
  for (const privilege of ["SELECT", "INSERT", "UPDATE"]) scenario(`coach${privilege}Absent`, `revoke ${privilege} on public.coach_rate_limit_buckets from service_role;`, `grant ${privilege} on public.coach_rate_limit_buckets to service_role;`,
    (r) => assert.equal(r.coachRateLimitState.effectivePrivileges.find((p) => p.privilege === privilege).granted, false));
  const final = observe(); assert.equal(final.classification, complete); assert.equal(warnings, 0, warningDetails.join("\n"));
  assert.deepEqual(collect(), collect());
  report = {format: "LOCAL_SERVICE_ROLE_READ_ONLY_FORENSIC_PG17", result: "PASS", fixtureStatus: SERVICE_FIXTURE_STATUS,
    historicalEvidence: "LOCAL_SYNTHETIC_DATA_ONLY", cases: Object.keys(outcomes).length, outcomes, observations,
    primaryTables: PRIMARY_TABLES.length, additionalTables: ADDITIONAL_TABLES.length, primaryEffectivePrivilegeResults: 104,
    primaryEffectiveColumnResults: final.primaryEffectiveColumnPrivileges.length, policies: final.policies.length,
    effectivePrivilegeEntryRevocations: final.currentVsDesignDelta.effectivePrivilegeEntryRevocations,
    effectivePrivilegeEntryGrants: final.currentVsDesignDelta.effectivePrivilegeEntryGrants,
    transactionReadOnly: true, transaction: "ROLLBACK", migrationsExecuted: 0, mutationCount: 0, collectorMutations: 0,
    fixtureSetupMutations: "LOCAL_ONLY_OUTSIDE_FORENSIC_AUTHORIZED_BY_USER", approval: "NOT_PERFORMED", warnings};
} finally {
  if (started || existsSync(join(data, "postmaster.pid"))) command("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
  if (existsSync(join(data, "postmaster.pid"))) throw new Error("LOCAL_PG17_RESIDUAL_CLUSTER");
  if (pid) {let alive = false; try {process.kill(pid, 0); alive = true;} catch { /* The disposable server must have exited. */ }
    if (alive) throw new Error("LOCAL_PG17_RESIDUAL_PROCESS");}
  if (!base.startsWith(resolve(tmpdir()) + sep) || !base.split(sep).at(-1).startsWith("reflab-service-forensic-pg17-")) throw new Error("LOCAL_PG17_CLEANUP_PATH_REJECTED");
  rmSync(base, {recursive: true, force: true});
}
console.log(JSON.stringify({...report, residualClusters: 0, residualProcesses: 0}));
