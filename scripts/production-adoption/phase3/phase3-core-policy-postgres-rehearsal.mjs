import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_SHA256, CORE_POLICY_MUTATIONS,
  buildCorePolicyBatch, classifyCorePolicyBatch, preservedCorePolicies, isRetiredCorePolicy,
  corePolicyQuery, classifyCorePolicyInventory } from "./phase3-core-policy-contract.mjs";
import { classifyCorePolicyPreAttestation } from "./phase3-core-policy-pre-attestation-contract.mjs";
import { buildCorePolicyBaselineForensicBatch, classifyCorePolicyBaselineObservation } from "./phase3-core-policy-baseline-forensic-contract.mjs";

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
  sql(readFileSync(new URL("./phase3-core-policy-production-lineage-fixture.sql", import.meta.url), "utf8"));
  const observe = () => executeReadOnlyBatch(buildCorePolicyBatch(), {}, { processEnvironment: {},
    spawn: () => ({ status: 0, stdout: sql(buildCorePolicyBatch()), stderr: "" }) });
  const initial = observe();
  const observeBaseline = () => classifyCorePolicyBaselineObservation(executeReadOnlyBatch(
    buildCorePolicyBaselineForensicBatch(), {}, { processEnvironment: {},
      spawn: () => ({ status: 0, stdout: sql(buildCorePolicyBaselineForensicBatch()), stderr: "" }) }), { targetExact: true });
  const forensicPre = observeBaseline();
  assert.equal(forensicPre.classification, "OBSERVATION_COMPLETE", JSON.stringify(forensicPre.failedChecks));
  assert.equal(forensicPre.predecessor64236State.comparison, "EXACT");
  assert.equal(forensicPre.targetedObservedPolicies, 4);
  assert.equal(forensicPre.missingTargetSlots.length, 18);
  assert.equal(forensicPre.nonTargetPolicies, 23);
  assert.equal(forensicPre.tableAclInventory.length, 301, JSON.stringify(forensicPre.tableAclInventory.filter(
    (a) => !["postgres", "anon", "authenticated", "service_role", "reflab_prod_preflight_ro"].includes(a.grantee))));
  assert.equal(forensicPre.columnAclInventory.length, 20);
  assert.equal(forensicPre.tableSecurityInventory.length, 10);
  assert.equal(classifyIdentityBridgePostBatch(initial).classification, "EXACT");
  const baseline = structuredClone(initial.get(CORE_POLICY_QUERY_ID));
  // Approval belongs only to this disposable fixture, never to the Production CLI.
  const localApproval = { projectRef: "nagjddldrldwavmfaytc", migrationSha: CORE_POLICY_SHA256,
    reviewed: true, exactTargetInput: true, inventory: baseline };
  assert.equal(classifyCorePolicyPreAttestation(initial).classification, "BLOCKER");
  assert.equal(classifyCorePolicyPreAttestation(initial, localApproval).classification, "64245_PRE_EXECUTABLE_EXACT");
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
    ["with_check", "create policy user_profiles_own_insert on public.user_profiles for insert to authenticated with check(true);"],
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
  for (const [table, name, command] of [
    ["notification_events", "Users can read own notification events", "select"],
    ["match_preparations", "match_preparations_authenticated_manage_own", "all"],
    ["post_match_reviews", "post_match_reviews_authenticated_manage_own", "all"],
  ]) {
    const identity = `"${name}" on public.${table}`;
    cases.push([`${table}_legacy_missing`, `drop policy ${identity};`],
      [`${table}_legacy_using`, `alter policy ${identity} using(true);`],
      [`${table}_legacy_role`, `alter policy ${identity} to anon;`],
      [`${table}_legacy_command`, `drop policy ${identity}; create policy ${identity} for delete to authenticated using(true);`],
      [`${table}_legacy_restrictive`, `drop policy ${identity}; create policy ${identity} as restrictive for ${command} to authenticated using(true);`]);
    if (command === "all") cases.push([`${table}_legacy_check`, `alter policy ${identity} with check(true);`]);
  }
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
  assert.equal(missing.missingTargets.length, 19);
  assert.equal(classifyCorePolicyPreAttestation(missingEvidence, localApproval).classification, "BLOCKER");

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
  const forced = "do $$begin raise exception 'LOCAL_FORCED_RETIREMENT_FAILURE' using errcode='55000'; end$$;";
  for (const [name, boundary] of [
    ["after_first_retirement", 'drop policy "Users can read own notification events" on public.notification_events;'],
    ["after_all_retirements", 'drop policy post_match_reviews_authenticated_manage_own on public.post_match_reviews;'],
  ]) {
    assert.ok(migration.includes(boundary));
    requireFailure(name, migration.replace(boundary, () => `${boundary}\n${forced}`), "55000");
  }
  const replacementBoundary = /end loop;\s*end loop;\s*end\s*\$replace_policies\$;/;
  assert.match(migration, replacementBoundary);
  requireFailure("during_replacement", migration.replace(replacementBoundary,
    "end loop; raise exception 'LOCAL_FORCED_REPLACEMENT_FAILURE' using errcode='55000'; end loop; end $replace_policies$;"), "55000");
  requireFailure("before_commit", beforeCommit("do $$begin raise exception 'LOCAL_FORCED_COMMIT_FAILURE' using errcode='55000'; end$$;"), "55000");

  sql("alter table public.user_profiles owner to supabase_admin;", "supabase_admin");
  const authorityPre = pre(observe());
  assert.equal(authorityPre.classification, "BLOCKER");
  let authorityCalls = 0;
  invokeCorePolicyIfExecutable(authorityPre, migration, () => { authorityCalls++; });
  assert.equal(authorityCalls, 0);
  // Deliberate local bypass probes PostgreSQL permissions, not the executable gate.
  const insufficient = execute(migration);
  assert.notEqual(insufficient.status, 0);
  assert.match(String(insufficient.stderr), /ERROR:\s+42501:/);
  restore();
  assert.equal(pre(observe()).classification, "EXECUTABLE_PRE");
  negatives.push({ name: "insufficient_installer_authority", migrationInvocations: authorityCalls,
    forcedLocalBypassInvocations: 1, forcedSqlstate: "42501", result: "PASS" });

  const invocation = invokeCorePolicyIfExecutable(pre(observe()), migration, execute);
  assert.equal(invocation.invoked, 1);
  assert.equal(invocation.result.status, 0, "LOCAL_64245_MIGRATION_FAILED");
  assert.equal(/WARNING:|ADVERTENCIA:/.test(String(invocation.result.stderr)), false);
  const final = observe();
  assert.equal(post(final).classification, "EXACT", JSON.stringify(post(final).failedChecks));
  assert.equal(pre(final).classification, "ALREADY_INSTALLED_POST");
  assert.equal(classifyCorePolicyPreAttestation(final, localApproval).classification, "64245_ALREADY_INSTALLED_POST");
  const forensicPost = observeBaseline();
  assert.equal(forensicPost.classification, "OBSERVATION_COMPLETE");
  assert.equal(forensicPost.approval, "NOT_PERFORMED");
  assert.equal(forensicPost.nonTargetPolicies, 20);
  assert.deepEqual(preservedCorePolicies(final.get(CORE_POLICY_QUERY_ID).policies),
    preservedCorePolicies(baseline.policies));
  assert.equal(final.get(CORE_POLICY_QUERY_ID).policies.filter(isRetiredCorePolicy).length, 0);
  assert.equal(post(final).checks.noAuthenticatedDelete, true);
  assert.equal(post(final).checks.noLegacyBrowserPath, true);
  const postNegatives = [];
  for (const [name, statement] of [
    ["browser_delete", "create policy unexpected_delete on public.match_preparations for delete to authenticated using(true);"],
    ["legacy_survives", "create policy legacy_survives on public.notification_events for select to authenticated using(user_id=coalesce(auth.jwt()->>'sub',auth.uid()::text));"],
    ["preserved_removed", "drop policy attempts_own_insert on public.attempts;"],
    ["preserved_changed", "alter policy attempts_own_insert on public.attempts with check(true);"],
  ]) {
    // Deliberately mutate only inside a disposable transaction, then roll back.
    // Do not misrepresent this negative-fixture transaction as READ ONLY evidence.
    const output = sql(`begin; ${statement} select ${corePolicyQuery.payloadSql}; rollback;`);
    const changed = JSON.parse(String(output).split(/\r?\n/).find((line) => line.startsWith("{")));
    assert.equal(classifyCorePolicyInventory(changed, baseline, true, { post: true }).classification, "BLOCKER", name);
    assert.deepEqual(observe().get(CORE_POLICY_QUERY_ID), final.get(CORE_POLICY_QUERY_ID));
    postNegatives.push({ name, result: "PASS", rolledBack: true });
  }
  let replayCalls = 0;
  invokeCorePolicyIfExecutable(pre(final), migration, () => { replayCalls++; });
  assert.equal(replayCalls, 0);
  return { localOnly: true, postgresMajor: 17, pre: "EXECUTABLE_PRE", migration: "PASS", post: "EXACT",
    installedPostPre: "NOT_EXECUTABLE_ALREADY_INSTALLED", migrationInvocations: 1, reexecutionInvocations: 0,
    targetTables: 10, targetPolicies: post(final).targetedCount, nonTargetPolicies: post(final).nonTargetCount,
    preservation: "EXACT", missingTargetInput: "EXPLICITLY_ALLOWED", negatives, postNegatives, rollbacks,
    legacyPoliciesRetired: 3, observedPolicyDrops: 7, observedPolicyCreates: 22,
    privilegeWarnings: 0, mutations: CORE_POLICY_MUTATIONS, laterProvidersExecuted: 0,
    baselineForensic: { pre: forensicPre.classification, post: forensicPost.classification, approval: "NOT_PERFORMED" } };
}
