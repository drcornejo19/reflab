import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { buildApprovedCorePolicyPreBatch, APPROVED_CORE_POLICY_PRODUCTION_BASELINE,
  validateCorePolicyProductionApproval, corePolicyProductionApproval, corePolicyFixtureStructure,
  canonicalCorePolicyBaseline } from "./phase3-core-policy-production-baseline-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { extractCorePolicyMigrationBody, classifyCorePolicyExecutionEvidence, CORE_POLICY_BEGIN_SQL,
  buildCorePolicyExecutionObservation, classifyCorePolicyExecutionPredecessors } from "./phase3-core-policy-ddl-contract.mjs";
import { executeCorePolicyAtomicTransition } from "./run-production-core-policy-64245.mjs";
import { createCorePolicyPsqlSession, CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";

export async function rehearseCorePolicyDdl({ sql, sessionFactory, checkpoint, restore, lock, migration }) {
  sql(readFileSync(new URL("./phase3-core-policy-production-lineage-fixture.sql", import.meta.url), "utf8"));
  const observe = () => parseJsonResults(sql(buildApprovedCorePolicyPreBatch()));
  const initial = observe();
  assert.equal(classifyIdentityBridgePostBatch(initial).classification, "EXACT");
  const production = APPROVED_CORE_POLICY_PRODUCTION_BASELINE;
  assert.equal(validateCorePolicyProductionApproval(production).classification, "EXACT");
  const inventory = initial.get(CORE_POLICY_QUERY_ID);
  assert.deepEqual(canonicalCorePolicyBaseline(corePolicyFixtureStructure(inventory)),
    canonicalCorePolicyBaseline(corePolicyFixtureStructure(production.inventory)));
  // Only fixture OIDs and synthetic aggregate hashes differ; Production approval stays pinned.
  const fixture = structuredClone(production.baseline);
  for (const p of [...fixture.targetSlots.filter((s) => s.policy).map((s) => s.policy), ...fixture.legacyPolicies, ...fixture.preservedPolicies])
    p.oid = inventory.policies.find((r) => r.table === p.table && r.name === p.name).oid;
  fixture.historical.productFingerprint = inventory.productFingerprint;
  fixture.historical.protectedObjectsHash = inventory.protectedObjectsHash;
  const approval = corePolicyProductionApproval(fixture);
  const composition = { validateApproval: (a) => ({ classification: a === approval
    && validateCorePolicyProductionApproval(production).classification === "EXACT" ? "EXACT" : "BLOCKER",
    checks: { approvedProductionStructureExact: a === approval } }) };
  const classify = (e, a) => classifyCorePolicyExecutionEvidence(e, a, composition);
  const body = extractCorePolicyMigrationBody(Buffer.from(migration)).body;
  const probe = sessionFactory();
  try {
    await probe.query(CORE_POLICY_BEGIN_SQL);
    const writable = parseJsonResults(await probe.query(buildCorePolicyExecutionObservation()));
    assert.equal(writable.get("read_only_guard"), "off");
    assert.notEqual(classifyIdentityBridgePostBatch(writable).classification, "EXACT");
    assert.equal(classify(writable, approval).classification, "64245_PRE_EXECUTABLE_EXACT",
      JSON.stringify(classifyIdentityBridgePostBatch(writable, { classifyPredecessor: classifyCorePolicyExecutionPredecessors })));
    await probe.rollback();
  } finally { await probe.close(); }
  checkpoint();
  const run = async (fault = null) => {
    const session = sessionFactory();
    const baseQuery = session.query.bind(session);
    let seenBody = 0;
    session.query = async (statement) => {
      if (statement === body) {
        seenBody++;
        if (fault?.transform) statement = fault.transform(statement);
      }
      return baseQuery(statement);
    };
    const result = await executeCorePolicyAtomicTransition(session, body, approval, { classify,
      beforeCommit: fault?.beforeCommit ? () => { throw new CorePolicySessionFailure("LOCAL_FORCED_BEFORE_COMMIT"); } : undefined });
    assert.equal(result.migrationInvocationCount, seenBody);
    return result;
  };
  const negatives = [];
  for (const [name, statement] of [
    ["missing_historical_target", "drop policy user_profiles_own_read on public.user_profiles;"],
    ["missing_legacy", 'drop policy "Users can read own notification events" on public.notification_events;'],
    ["table_acl_drift", "grant maintain on public.user_profiles to anon;"],
    ["64236_drift", "alter function reflab_private.request_user_id() set search_path=public;"],
  ]) {
    try {
      sql(statement, "supabase_admin"); const result = await run();
      assert.equal(result.transaction, "ROLLBACK", name); assert.equal(result.migrationInvocationCount, 0, name);
      negatives.push({ name, migrationInvocations: 0, result: "PASS" });
    } finally { restore(); }
  }
  const rollbacks = [];
  const restored = () => {
    assert.deepEqual(observe().get(CORE_POLICY_QUERY_ID), inventory);
    assert.equal(classifyIdentityBridgePostBatch(observe()).classification, "EXACT");
  };
  const release = await lock();
  let locked;
  try { locked = await run(); } finally { await release(); }
  assert.equal(locked.transaction, "ROLLBACK"); assert.equal(locked.sqlstate, "55P03");
  assert.equal(locked.migrationInvocationCount, 0); restored();
  rollbacks.push({ name: "lock_timeout", migrationInvocations: 0, exactPreRestored: true, result: "PASS" });
  const raise = "do $$begin raise exception 'LOCAL_FORCED_ATOMIC_FAILURE' using errcode='55000'; end$$;";
  const failures = [
    ["first_legacy_drop", { transform: (s) => s.replace('drop policy "Users can read own notification events" on public.notification_events;',
      (m) => `${m}\n${raise}`) }],
    ["three_legacy_drops", { transform: (s) => s.replace("drop policy post_match_reviews_authenticated_manage_own on public.post_match_reviews;",
      (m) => `${m}\n${raise}`) }],
    ["during_replacement", { transform: (s) => s.replace(/end loop;\s*end loop;\s*end\s*\$replace_policies\$;/,
      "end loop; raise exception 'LOCAL_FORCED_REPLACEMENT' using errcode='55000'; end loop; end $replace_policies$;") }],
    ["migration_sql_failure", { transform: (s) => `${s}\nselect 1/0;` }],
    ["statement_timeout", { transform: (s) => `${s}\nset local statement_timeout='50ms'; select pg_sleep(1);` }],
    ["post_policy_expression", { transform: (s) => `${s}\nalter policy user_profiles_own_read on public.user_profiles using(true);` }],
    ["post_preserved_policy_missing", { transform: (s) => `${s}\ndrop policy attempts_own_insert on public.attempts;` }],
    ["post_acl_drift", { transform: (s) => `${s}\ngrant maintain on public.user_profiles to anon;` }],
    ["post_fingerprint_drift", { transform: (s) => `${s}\nupdate public.user_profiles set ref_card_id='drift' where user_id='user_synthetic_001';` }],
    ["before_commit", { beforeCommit: true }],
  ];
  for (const [name, fault] of failures) {
    const result = await run(fault);
    assert.equal(result.transaction, "ROLLBACK", name);
    assert.equal(result.migrationInvocationCount, 1, `${name}: ${JSON.stringify(result)}`);
    if (name.startsWith("post_")) { assert.equal(result.stage, "POST_DDL", name); assert.equal(result.postDdl.classification, "BLOCKER", name); }
    restored();
    rollbacks.push({ name, migrationInvocations: 1, exactPreRestored: true, result: "PASS" });
  }
  const success = await run();
  assert.equal(success.transaction, "COMMIT", JSON.stringify(success));
  assert.equal(success.preDdl.classification, "64245_PRE_EXECUTABLE_EXACT");
  assert.equal(success.postDdl.classification, "64245_ALREADY_INSTALLED_POST");
  assert.equal(success.migrationInvocationCount, 1);
  assert.equal(success.mutationAccounting.policyDrops, 7); assert.equal(success.mutationAccounting.policyCreates, 22);
  const second = await run();
  assert.equal(second.REEXECUTION_REFUSED, true); assert.equal(second.migrationInvocationCount, 0);
  assert.equal(second.mutationAccounting.policyDrops, 0); assert.equal(second.mutationAccounting.policyCreates, 0);
  assert.equal(second.transaction, "ROLLBACK");
  assert.equal(classifyIdentityBridgePostBatch(observe()).classification, "EXACT");
  return { localOnly: true, postgresMajor: 17, identityPredecessor: "EXACT", approvedBaselineStructure: "EXACT",
    pre: success.preDdl.classification, migration: "PASS", post: success.postDdl.classification, transaction: success.transaction,
    migrationInvocations: 1, reexecutionInvocations: 0, policyDrops: 7, policyCreates: 22,
    preservedNonTarget: 20, legacyRemaining: 0, authenticatedDelete: 0, privilegeWarnings: 0,
    negatives, rollbacks, laterProvidersExecuted: 0, preservation: "EXACT" };
}

export function createDisposableCorePolicySession(binary, environment) {
  assert.equal(environment.PGHOST, "127.0.0.1"); assert.equal(environment.PGDATABASE, "postgres");
  assert.equal(environment.PGUSER, "postgres"); assert.match(environment.PGPORT, /^\d+$/);
  return createCorePolicyPsqlSession(environment, {}, { binary });
}
