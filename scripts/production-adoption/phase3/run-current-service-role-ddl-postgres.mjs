import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { executeCurrentServiceAtomic } from "./run-production-current-service-role-reconciliation.mjs";
import { extractCurrentServiceDdlBody } from "./phase3-current-service-role-ddl-contract.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";
import { serviceMutationAccounting } from "./phase3-current-service-role-matrix.mjs";
import { CorePolicySessionFailure } from "./phase3-core-policy-psql-session.mjs";

const report = await withCurrentServiceLocalPg(async ({collect, createSession, classify, before, bytes}) => {
  const body = extractCurrentServiceDdlBody(bytes).body, statements = serviceMutationAccounting().statements;
  const rollbackOutcomes = {};
  async function rollbackCase(name, options, decorate = (s) => s) {
    const r = await executeCurrentServiceAtomic(decorate(createSession()), bytes, {classify, ...options});
    assert.equal(r.transaction, "ROLLBACK", `${name}: ${JSON.stringify(r)}`);
    assert.notEqual(r.commitOutcome, "ACKNOWLEDGED"); assert.deepEqual(collect(), before, `${name}: complete PRE not restored`);
    rollbackOutcomes[name] = "EXACT_PRE_RESTORED";
  }
  for (const stage of ["BEFORE_PRE", "AFTER_PRE", "BEFORE_POST", "BEFORE_COMMIT"])
    await rollbackCase(stage, {checkpoint: (name) => {if (name === stage) throw new CorePolicySessionFailure("TIMEOUT");}});
  await rollbackCase("duringPre", {}, (s) => ({...s, query: async (sql) => {
    if (sql !== body && !sql.startsWith("begin;") && sql !== "rollback;") throw new CorePolicySessionFailure("TIMEOUT"); return s.query(sql);
  }}));
  for (let i = 1; i <= statements.length; i++) await rollbackCase(`duringMigrationAfterAclStatement${i}`, {}, (s) => ({...s, query: async (sql) => {
    if (sql === body) {await s.query(statements.slice(0, i).join("\n")); throw new CorePolicySessionFailure("SQLSTATE_P0001");}
    return s.query(sql);
  }}));
  for (const [name, mutation] of Object.entries({
    browser: "grant maintain on public.attempts to authenticated;",
    columns: "grant update(user_id) on public.user_profiles to authenticated;",
    policy: "alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",
    function: `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,
    execute: `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`,
    historical: "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",
    adoption: "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",
    runtime: "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",
    phase4: "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",
    additional: "grant delete on public.clips to service_role;",
  })) await rollbackCase(`postDrift_${name}`, {checkpoint: async (stage, s) => {if (stage === "BEFORE_POST") await s.query(mutation);}});
  await rollbackCase("duringPost", {}, (s) => {let observations = 0; return {...s, query: async (sql) => {
    if (sql !== body && !sql.startsWith("begin;") && sql !== "rollback;" && ++observations === 2) throw new CorePolicySessionFailure("TIMEOUT");
    return s.query(sql);
  }};});
  const acknowledged = await executeCurrentServiceAtomic(createSession(), bytes, {classify});
  assert.equal(acknowledged.classification, "COMMITTED_POST_EXACT", JSON.stringify(acknowledged));
  assert.equal(acknowledged.preClassification, "PRE_EXECUTABLE_EXACT"); assert.equal(acknowledged.postClassification, "ALREADY_INSTALLED_POST");
  assert.equal(acknowledged.migrationInvocationCount, 1); assert.equal(acknowledged.migrationResult, "PASS");
  assert.equal(acknowledged.commitOutcome, "ACKNOWLEDGED");
  const persisted = collect(); assert.equal(classify(persisted).classification, "ALREADY_INSTALLED_POST");
  const second = await executeCurrentServiceAtomic(createSession(), bytes, {classify});
  assert.equal(second.migrationInvocationCount, 0); assert.equal(second.reexecution, "REFUSED"); assert.deepEqual(collect(), persisted);
  // Use a fresh disposable database for ambiguous COMMIT: actual commit occurs, acknowledgement is lost.
  // This proves the harness must not claim rollback or replay even if transport errors hide durable POST.
  const ambiguous = await withCurrentServiceLocalPg(async (fixture) => {
    const session = fixture.createSession(); let commits = 0, rollbacks = 0;
    const transport = {...session, query: async (sql) => {const result = await session.query(sql);
      if (sql === "commit;") {commits++; throw new CorePolicySessionFailure("PSQL_SESSION_FAILED");} return result;},
      rollback: async () => {rollbacks++; return session.rollback();}};
    const r = await executeCurrentServiceAtomic(transport, fixture.bytes, {classify: fixture.classify});
    assert.equal(r.classification, "UNKNOWN_COMMIT_OUTCOME"); assert.equal(r.transaction, "UNKNOWN"); assert.equal(r.automaticRetryAuthorized, false);
    assert.equal(r.onlyAllowedNextAction, "SEPARATE_READ_ONLY_POST_FORENSIC"); assert.equal(commits, 1); assert.equal(rollbacks, 0);
    assert.equal(fixture.classify(fixture.collect()).classification, "ALREADY_INSTALLED_POST");
    return {result: "PASS"};
  });
  assert.equal(ambiguous.result, "PASS");
  return {format: "LOCAL_CURRENT_SERVICE_ROLE_DDL_PG17", result: "PASS", pre: acknowledged.preClassification,
    post: acknowledged.postClassification, persistedPost: "ALREADY_INSTALLED_POST", migrationInvocationCount: 1,
    migrationResult: "PASS", transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED", secondInvocationCount: 0, reexecution: "REFUSED",
    rollbackCases: Object.keys(rollbackOutcomes).length, rollbackOutcomes, commitOutcomeCategories: 3,
    commitOutcomes: {acknowledged: "PASS", beforeCommitFailure: "ROLLBACK_EXACT_PRE", ambiguous: "UNKNOWN_NO_RETRY_READ_ONLY_FORENSIC_REQUIRED"},
    mutationAccounting: acknowledged.mutationAccounting};
});
console.log(JSON.stringify(report));
