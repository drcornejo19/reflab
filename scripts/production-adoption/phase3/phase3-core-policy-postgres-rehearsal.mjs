import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_SHA256, CORE_POLICY_MUTATIONS,
  buildCorePolicyBatch, classifyCorePolicyBatch } from "./phase3-core-policy-contract.mjs";

// This entry point only receives the disposable harness's loopback connection.
export function holdCorePolicyLock(psql, environment) {
  assert.equal(environment.PGHOST, "127.0.0.1");
  assert.equal(environment.PGDATABASE, "postgres");
  assert.match(String(environment.PGPORT), /^\d+$/);
  return new Promise((resolve, reject) => {
    const child = spawn(psql, ["-X", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
      { env: environment, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill(); reject(new Error("LOCAL_LOCK_HANDSHAKE_TIMEOUT")); }, 5000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("LOCAL_LOCK_PROCESS_FAILED")); });
    child.stderr.resume();
    child.stdout.on("data", (data) => {
      if (!String(data).includes("CORE_LOCK_READY")) return;
      clearTimeout(timer);
      resolve(() => new Promise((released) => {
        child.once("exit", released);
        child.stdin.end("rollback;\n\\q\n");
      }));
    });
    child.stdin.write("begin; set local idle_in_transaction_session_timeout='15s'; lock table public.user_profiles in access exclusive mode; select 'CORE_LOCK_READY';\n");
  });
}

export function invokeCorePolicyIfExecutable(result, migration, execute) {
  if (result.classification !== "EXECUTABLE_PRE" || result.executablePre !== true) return { invoked: 0 };
  return { invoked: 1, result: execute(migration) };
}

export async function rehearseCorePolicy({ sql, execute, lock, checkpoint, restore, migration }) {
  assert.equal(createHash("sha256").update(migration).digest("hex"), CORE_POLICY_SHA256);
  const observe = () => executeReadOnlyBatch(buildCorePolicyBatch(), {}, { processEnvironment: {},
    spawn: () => ({ status: 0, stdout: sql(buildCorePolicyBatch()), stderr: "" }) });
  const initial = observe();
  assert.equal(classifyIdentityBridgePostBatch(initial).classification, "EXACT");
  const baseline = structuredClone(initial.get(CORE_POLICY_QUERY_ID));
  const pre = (evidence) => classifyCorePolicyBatch(evidence, baseline);
  const post = (evidence) => classifyCorePolicyBatch(evidence, baseline, { post: true });
  assert.equal(pre(initial).classification, "EXECUTABLE_PRE", JSON.stringify(pre(initial).failedChecks));
  checkpoint();
  // Restore the disposable database, including policy OIDs, before the next case.
  // Evidence is always collected in a real bounded READ ONLY transaction.
  const changedEvidence = (change) => {
    try { sql(change, "supabase_admin"); return observe(); } finally { restore(); }
  };
  const negatives = [];
  const cases = [
    ["policy_role", "alter policy user_profiles_own_read on public.user_profiles to anon;"],
    ["policy_command", "drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles for delete to authenticated using(true);"],
    ["restrictive", "drop policy user_profiles_own_read on public.user_profiles; create policy user_profiles_own_read on public.user_profiles as restrictive for select to authenticated using(true);"],
    ["using", "alter policy user_profiles_own_read on public.user_profiles using(true);"],
    ["with_check", "alter policy user_profiles_own_insert on public.user_profiles with check(true);"],
    ["unsupported_historical", "alter policy user_profiles_own_read on public.user_profiles using(user_id=public.institution_request_user_id() or public.platform_is_super_admin());"],
    ["owner", "alter table public.user_profiles owner to supabase_admin;"],
    ["rls_disabled", "alter table public.user_profiles disable row level security;"],
    ["force", "alter table public.user_profiles force row level security;"],
    ["table_acl", "grant maintain on public.user_profiles to anon;"],
    ["non_target_lost", "drop policy attempts_own_insert on public.attempts;"],
    ["non_target_modified", "alter policy attempts_own_insert on public.attempts with check(true);"],
    ["identity_hash", "create or replace function reflab_private.request_user_id() returns text language sql stable security invoker set search_path=pg_catalog as $$select 'drift'::text$$;"],
    ["identity_owner", "alter function reflab_private.request_user_id() owner to supabase_admin;"],
    ["identity_acl", "grant execute on function reflab_private.request_user_id() to anon;"],
    ["identity_config", "alter function reflab_private.request_user_id() set search_path=public;"],
    ["identity_security", "alter function reflab_private.request_user_id() security definer;"],
    ["runtime_schema_state", "insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values('premature',repeat('a',64),repeat('b',64),'production','local',1,'installed');"],
    ["cutover", "create role reflab_pre_cutover_evidence_owner nologin;"],
    ["phase4", "comment on table public.user_profiles is 'reflab:production_adoption_provider=unexpected';"],
    ["ledger", "alter table reflab_meta.production_adoption_state disable trigger user; delete from reflab_meta.production_adoption_state where phase_order=4;"],
    ["historical_fingerprint", "update public.user_profiles set ref_card_id='drift' where user_id='user_synthetic_001';"],
    ["column_acl", "grant update(user_id) on public.user_profiles to anon;"],
  ];
  for (const [name, change] of cases) {
    const result = pre(changedEvidence(change));
    assert.equal(result.classification, "BLOCKER", name);
    let calls = 0;
    invokeCorePolicyIfExecutable(result, migration, () => { calls++; });
    assert.equal(calls, 0, name);
    assert.equal(pre(observe()).classification, "EXECUTABLE_PRE", name);
    negatives.push({ name, migrationInvocations: calls, result: "PASS" });
  }
  const missingEvidence = changedEvidence("drop policy user_profiles_own_read on public.user_profiles;");
  const missing = pre(missingEvidence);
  assert.equal(missing.classification, "EXECUTABLE_PRE", JSON.stringify({ failedChecks: missing.failedChecks,
    identity: classifyIdentityBridgePostBatch(missingEvidence) }));
  assert.deepEqual(missing.missingTargets, ["user_profiles_own_read"]);

  const rollbacks = [];
  const requireFailure = (name, statement, state) => {
    const result = execute(statement);
    assert.notEqual(result.status, 0, name);
    assert.match(String(result.stderr), new RegExp(`(?:ERROR|FATAL):\\s+${state}:`), name);
    assert.equal(pre(observe()).classification, "EXECUTABLE_PRE", name);
    assert.deepEqual(observe().get(CORE_POLICY_QUERY_ID), baseline, name);
    rollbacks.push({ name, sqlstate: state, exactPreRestored: true, result: "PASS" });
  };
  const release = await lock();
  let locked;
  try { locked = execute(migration); } finally { await release(); }
  assert.notEqual(locked.status, 0);
  assert.match(String(locked.stderr), /ERROR:\s+55P03:/);
  assert.deepEqual(observe().get(CORE_POLICY_QUERY_ID), baseline);
  rollbacks.push({ name: "lock_timeout", sqlstate: "55P03", exactPreRestored: true, result: "PASS" });
  const beforeCommit = (injection) => {
    assert.match(migration, /commit;\s*$/i);
    return migration.replace(/commit;\s*$/i, () => `${injection}\ncommit;`);
  };
  requireFailure("statement_timeout", beforeCommit("set local statement_timeout='50ms'; select pg_sleep(1);"), "57014");
  const replacementBoundary = /end loop;\s*end loop;\s*end\s*\$replace_policies\$;/;
  assert.match(migration, replacementBoundary);
  requireFailure("during_replacement", migration.replace(replacementBoundary,
    "end loop; raise exception 'LOCAL_FORCED_REPLACEMENT_FAILURE' using errcode='55000'; end loop; end $replace_policies$;"), "55000");
  requireFailure("before_commit", beforeCommit("do $$begin raise exception 'LOCAL_FORCED_COMMIT_FAILURE' using errcode='55000'; end$$;"), "55000");

  sql("alter table public.user_profiles owner to supabase_admin;", "supabase_admin");
  assert.equal(pre(observe()).classification, "BLOCKER");
  const insufficient = execute(migration);
  assert.notEqual(insufficient.status, 0);
  assert.match(String(insufficient.stderr), /ERROR:\s+42501:/);
  restore();
  assert.equal(pre(observe()).classification, "EXECUTABLE_PRE");
  negatives.push({ name: "insufficient_installer_authority", migrationInvocations: 0, forcedSqlstate: "42501", result: "PASS" });

  const invocation = invokeCorePolicyIfExecutable(pre(observe()), migration, execute);
  assert.equal(invocation.invoked, 1);
  assert.equal(invocation.result.status, 0, "LOCAL_64245_MIGRATION_FAILED");
  assert.equal(/WARNING:/.test(String(invocation.result.stderr)), false);
  const final = observe();
  assert.equal(post(final).classification, "EXACT", JSON.stringify(post(final).failedChecks));
  assert.equal(pre(final).classification, "ALREADY_INSTALLED_POST");
  let replayCalls = 0;
  invokeCorePolicyIfExecutable(pre(final), migration, () => { replayCalls++; });
  assert.equal(replayCalls, 0);
  return { localOnly: true, postgresMajor: 17, pre: "EXECUTABLE_PRE", migration: "PASS", post: "EXACT",
    installedPostPre: "NOT_EXECUTABLE_ALREADY_INSTALLED", migrationInvocations: 1, reexecutionInvocations: 0,
    targetTables: 10, targetPolicies: post(final).targetedCount, nonTargetPolicies: post(final).nonTargetCount,
    preservation: "EXACT", missingTargetInput: "EXPLICITLY_ALLOWED", negatives, rollbacks,
    privilegeWarnings: 0, mutations: CORE_POLICY_MUTATIONS, laterProvidersExecuted: 0 };
}
