import assert from "node:assert/strict";
import { withAdditionalHarnessLocalPg } from "./phase3-additional-runtime-harness-local-pg.mjs";
import { executeAdditionalAtomic } from "./run-production-additional-runtime-service-role-reconciliation.mjs";
import { extractAdditionalDdlBody } from "./phase3-additional-runtime-ddl-contract.mjs";
import { PRE_EXACT, POST_EXACT, additionalObservationSql } from "./phase3-additional-runtime-pre-contract.mjs";
import { additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";

const report = await withAdditionalHarnessLocalPg(async ({ collect, createSession, classify, before, bytes }) => {
  const body = extractAdditionalDdlBody(bytes).body, statements = additionalAccounting().statements;
  const rollbacks = {};
  async function rollbackCase(name, options = {}, decorate = (s) => s) {
    const r = await executeAdditionalAtomic(decorate(createSession()), bytes, { classify, ...options });
    assert.equal(r.transaction, "ROLLBACK", `${name}: ${JSON.stringify(r)}`);
    assert.notEqual(r.commitOutcome, "ACKNOWLEDGED"); assert.equal(r.automaticRetryAuthorized, false);
    assert.deepEqual(await collect(), before, `${name}: complete PRE not restored`); rollbacks[name] = "EXACT_PRE_RESTORED";
  }
  for (const stage of ["BEFORE_PRE", "AFTER_PRE", "BEFORE_POST", "BEFORE_COMMIT"])
    await rollbackCase(stage, { checkpoint: (name) => { if (name === stage) throw new CorePolicySessionFailure("TIMEOUT"); } });
  for (const observation of [1, 2]) await rollbackCase(`during${observation === 1 ? "Pre" : "Post"}`, {}, (s) => {
    let calls = 0; return { ...s, query: async (sql) => {
      if (sql === additionalObservationSql() && ++calls === observation) throw new CorePolicySessionFailure("TIMEOUT");
      return s.query(sql);
    } };
  });
  for (let i = 1; i <= statements.length; i++) await rollbackCase(`afterRevoke${i}`, {}, (s) => ({ ...s, query: async (sql) => {
    if (sql === body) { await s.query(statements.slice(0, i).join("\n")); throw new CorePolicySessionFailure("SQLSTATE_P0001"); }
    return s.query(sql);
  } }));
  for (const [name, mutation] of Object.entries({
    primary: "grant maintain on public.attempts to service_role;",
    browser: "revoke maintain on public.appointments from anon;",
    column: "grant select(id) on public.coach_rate_limit_buckets to service_role;",
    policy: "alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",
    function: `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,
    execute: `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`,
    product: "insert into public.coach_runs(id) values('local_synthetic_drift');",
    historical: "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",
    adoption: "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",
    runtime: "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",
    phase4: "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",
    coach: "grant select,insert,update on public.coach_rate_limit_buckets to service_role;",
  })) await rollbackCase(`postDrift_${name}`, { checkpoint: async (stage, s) => { if (stage === "BEFORE_POST") await s.query(mutation); } });
  const acknowledged = await executeAdditionalAtomic(createSession(), bytes, { classify });
  assert.equal(acknowledged.classification, "COMMITTED_POST_EXACT", JSON.stringify(acknowledged));
  assert.equal(acknowledged.preClassification, PRE_EXACT); assert.equal(acknowledged.postClassification, POST_EXACT);
  assert.equal(acknowledged.migrationInvocationCount, 1); assert.equal(acknowledged.commitOutcome, "ACKNOWLEDGED");
  assert.equal(acknowledged.mutationAccounting.effectivePrivilegeEntryRevocations, 332);
  const persisted = await collect(); assert.equal(classify(persisted).classification, POST_EXACT);
  const second = await executeAdditionalAtomic(createSession(), bytes, { classify });
  assert.equal(second.migrationInvocationCount, 0); assert.equal(second.migrationResult, "NOT_INVOKED");
  assert.equal(second.reexecution, "REFUSED"); assert.deepEqual(await collect(), persisted);
  const ambiguity = await withAdditionalHarnessLocalPg(async (fixture) => {
    const session = fixture.createSession(); let commits = 0, rollbackCalls = 0;
    const transport = { ...session, query: async (sql) => {
      const r = await session.query(sql); if (sql === "commit;") { commits++; throw new CorePolicySessionFailure("PSQL_SESSION_FAILED"); } return r;
    }, rollback: async () => { rollbackCalls++; return session.rollback(); } };
    const r = await executeAdditionalAtomic(transport, fixture.bytes, { classify: fixture.classify });
    assert.equal(r.classification, "UNKNOWN_COMMIT_OUTCOME"); assert.equal(r.transaction, "UNKNOWN");
    assert.equal(r.onlyAllowedNextAction, "SEPARATELY_AUTHORIZED_READ_ONLY_POST_FORENSIC");
    assert.equal(r.automaticRetryAuthorized, false); assert.equal(r.readOnlyForensicRequired, true);
    assert.equal(commits, 1); assert.equal(rollbackCalls, 0); assert.equal(r.migrationInvocationCount, 1);
    assert.equal(fixture.classify(await fixture.collect()).classification, POST_EXACT);
    return { result: "PASS" };
  });
  assert.equal(ambiguity.result, "PASS");
  return { format: "LOCAL_ADDITIONAL_RUNTIME_ONE_SHOT_DDL_PG17", result: "PASS", pre: acknowledged.preClassification,
    post: acknowledged.postClassification, persistedPost: POST_EXACT, transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
    migrationInvocationCount: 1, migrationResult: "PASS", secondInvocationCount: 0, reexecution: "REFUSED",
    rollbackCases: Object.keys(rollbacks).length, rollbackOutcomes: rollbacks, commitOutcomeCategories: 3,
    commitOutcomes: { acknowledged: "PASS", deterministicBeforeCommit: "ROLLBACK_EXACT_PRE", ambiguous: "UNKNOWN_NO_RETRY_FORENSIC_REQUIRED" },
    automaticRetryAuthorized: false, mutationAccounting: acknowledged.mutationAccounting };
});
console.log(JSON.stringify(report));
