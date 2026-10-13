import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { ADDITIONAL_CURRENT_MATRIX, ADDITIONAL_SERVICE_TABLES, ADDITIONAL_PRIVILEGES, ADDITIONAL_MIGRATION_PATH, additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { PRE_EXACT, POST_EXACT, buildAdditionalObservation, classifyAdditionalTransition, classifyLocalAdditionalTransition, additionalPreserved } from "./phase3-additional-runtime-service-role-contract.mjs";
import { verifyAdditionalMigration } from "./phase3-additional-runtime-service-role-migration-source.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";

// The shared helper rejects inherited PG/Production/Node targets and only creates loopback PG17.
const report = await withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  sql(buildAdditionalFixtureSetup());
  const source = readFileSync(new URL("../../../" + ADDITIONAL_MIGRATION_PATH, import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const { body } = verifyAdditionalMigration(source), accounting = additionalAccounting();
  const observe = async (session) => parseJsonResults(await session.query(buildAdditionalObservation()));
  const collect = async () => {
    const session = createSession();
    try { await session.query("begin read only; set local lock_timeout='2s'; set local statement_timeout='15s';");
      return await observe(session);
    } finally { await session.rollback(); await session.close(); }
  };
  const before = await collect(), p = before.get(SERVICE_FORENSIC_QUERY_ID);
  const proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, { targetExact: true }).historicalState,
    functionHashes: Object.fromEntries(p.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature, f.sourceHash])) };
  const classify = (e, readOnly = true) => classifyLocalAdditionalTransition(e, proof, { readOnly });
  const pre = classify(before); assert.equal(pre.classification, PRE_EXACT, JSON.stringify(pre.failedChecks));
  assert.equal(classifyAdditionalTransition(before).classification, "BLOCKER");
  const negatives = {}, rollbacks = {};
  async function negative(name, mutation, post = false) {
    const session = createSession();
    try {
      await session.query("begin; set local statement_timeout='60s'; set local lock_timeout='5s';");
      if (post) await session.query(accounting.statements.join("\n"));
      await session.query(mutation);
      const r = classify(await observe(session), false); assert.equal(r.classification, "BLOCKER", `${name}: ${JSON.stringify(r.failedChecks)}`);
      assert.equal(r.migrationInvocationCount, 0); negatives[name] = "PASS";
    } finally { await session.rollback(); await session.close(); }
    assert.deepEqual(await collect(), before, `${name}: negative rollback did not restore complete PRE`);
  }
  for (const table of ADDITIONAL_SERVICE_TABLES) {
    await negative(`preMissing_${table}`, `revoke maintain on public.${table} from service_role;`);
    const required = ADDITIONAL_CURRENT_MATRIX[table][0];
    if (required) await negative(`postMissing_${table}`, `revoke ${required} on public.${table} from service_role;`, true);
    await negative(`postExcess_${table}`, `grant maintain on public.${table} to service_role;`, true);
  }
  for (const table of ADDITIONAL_SERVICE_TABLES.filter((t) => ADDITIONAL_CURRENT_MATRIX[t].includes("DELETE")))
    await negative(`deleteMissing_${table}`, `revoke delete on public.${table} from service_role;`, true);
  for (const privilege of ADDITIONAL_PRIVILEGES) await negative(`coachFuture_${privilege}`, `grant ${privilege} on public.coach_rate_limit_buckets to service_role;`, true);
  for (const [name, mutation] of Object.entries({
    publicSubstitute: "revoke select on public.coach_runs from service_role; grant select on public.coach_runs to public;",
    membershipSubstitute: "grant reflab_rls_owner to service_role with inherit true, set false;",
    wrongGrantor: "grant delete on public.coach_runs to reflab_rls_owner with grant option; set role reflab_rls_owner; grant delete on public.coach_runs to service_role; reset role;",
    grantOption: "grant select on public.coach_runs to service_role with grant option;",
    owner: "grant create on schema public to service_role; alter table public.coach_runs owner to service_role;",
    rls: "alter table public.coach_runs disable row level security;",
    force: "alter table public.coach_runs force row level security;",
    primaryThirteen: "grant maintain on public.attempts to service_role;",
    browserAdditional: "revoke maintain on public.appointments from anon;",
    browser64249: "grant maintain on public.attempts to authenticated;",
    browserColumns: "grant update(user_id) on public.user_profiles to authenticated;",
    policy: "alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",
    literal: "alter policy training_attempt_profile_read on public.user_profiles using(user_id=current_setting('reflab.training_user_id ',true));",
    functionMode: `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,
    functionExecute: `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`,
    identity64236: "grant execute on function reflab_private.request_user_id() to public;",
    historical: "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",
    ledger: "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",
    runtime: "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",
    phase4: "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",
    cutover: "create role reflab_pre_cutover_evidence_owner nologin;",
  })) await negative(name, mutation);
  sql("alter role service_role nobypassrls;", "postgres", "supabase_admin");
  try { assert.equal(classify(await collect()).classification, "BLOCKER"); negatives.bypassRls = "PASS"; }
  finally { sql("alter role service_role bypassrls;", "postgres", "supabase_admin"); }
  assert.deepEqual(await collect(), before);
  async function injected(name, mutationBody, checkAfter = false) {
    const session = createSession(); let rejected = false;
    try {
      await session.query("begin; set local lock_timeout='5s'; set local statement_timeout='60s';");
      await session.query(mutationBody);
      if (checkAfter) assert.equal(classify(await observe(session), false).classification, POST_EXACT);
    } catch (error) {
      assert.match(error.reason ?? error.message, /SQLSTATE_(?:P0001|55000)/, `${name}: must fail at the injected assertion, not fixture setup`);
      rejected = true;
    }
    finally { try { await session.rollback(); } finally { await session.close(); } }
    assert.equal(rejected, true); assert.deepEqual(await collect(), before, `${name}: exact PRE rollback failed`); rollbacks[name] = "EXACT_PRE_RESTORED";
  }
  const failure = "raise exception 'LOCAL_INJECTED_FAILURE' using errcode='P0001';";
  await injected("beforeMutation", body.replace("  -- BEGIN ADDITIONAL SERVICE TABLE ACL STATEMENTS", `${failure}\n  -- BEGIN ADDITIONAL SERVICE TABLE ACL STATEMENTS`));
  for (const [i, statement] of accounting.statements.entries()) await injected(`afterRevoke${i + 1}`, body.replace(statement, `${statement}\n  ${failure}`));
  for (const [name, mutation] of Object.entries({
    primary: "grant maintain on public.attempts to service_role;",
    browser: "revoke maintain on public.appointments from anon;",
    infrastructure: "grant insert on public.appointments to reflab_prod_preflight_ro;",
    column: "grant select(id) on public.coach_rate_limit_buckets to service_role;",
    policy: "alter policy global_roles_own_or_superadmin_read on public.user_global_roles using(false);",
    function: `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`,
    execute: `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`,
    owner: "grant create on schema public to service_role; alter table public.coach_runs owner to service_role;",
    rls: "alter table public.coach_runs disable row level security;",
    force: "alter table public.coach_runs force row level security;",
    product: "insert into public.coach_runs(id) values('local_synthetic_drift');",
    historical: "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');",
    adoption: "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;",
    runtime: "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');",
    phase4: "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';",
    cutover: "create role reflab_pre_cutover_evidence_owner nologin;",
    coach: "grant select,insert,update on public.coach_rate_limit_buckets to service_role;",
  })) await injected(`postPreservation_${name}`, body.replace("  -- END ADDITIONAL SERVICE TABLE ACL STATEMENTS", `${mutation}\n  -- END ADDITIONAL SERVICE TABLE ACL STATEMENTS`));
  await injected("beforeCommit", `${body}\ndo $$begin ${failure} end$$;`, true);
  const session = createSession(); let invocations = 0, after;
  try {
    await session.query("begin; set local lock_timeout='5s'; set local statement_timeout='60s'; set local transaction_timeout='180s'; set local idle_in_transaction_session_timeout='15s';");
    assert.equal(classify(await observe(session), false).classification, PRE_EXACT);
    invocations++; await session.query(body);
    after = await observe(session); assert.equal(classify(after, false).classification, POST_EXACT);
    assert.equal(additionalPreserved(before, after), true); await session.query("commit;");
  } catch (error) { await session.rollback(); throw error; }
  finally { await session.close(); }
  const persisted = await collect(), post = classify(persisted); assert.equal(post.classification, POST_EXACT);
  assert.equal(post.reexecutionRefused, true); assert.equal(post.migrationInvocationCount, 0);
  const second = createSession(); let sqlRefused = false;
  try { await second.query("begin;"); await second.query(body); }
  catch (error) { assert.match(error.reason ?? error.message, /SQLSTATE_55000/); sqlRefused = true; }
  finally { await second.rollback(); await second.close(); }
  assert.equal(sqlRefused, true); assert.deepEqual(await collect(), persisted);
  assert.equal(additionalPreserved(before, persisted), true); assert.equal(invocations, 1);
  return { format: "LOCAL_ADDITIONAL_RUNTIME_SERVICE_ROLE_PG17", result: "PASS", pre: pre.classification,
    migrationInvocationCount: invocations, migrationResult: "PASS", post: post.classification, transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
    secondInvocationCount: 0, reexecution: "REFUSED", sqlReexecution: "REFUSED", tables: 57, cells: 456,
    preGrantedCells: accounting.preGrantedCells, postGrantedCells: accounting.postGrantedCells, postAbsentCells: accounting.postAbsentCells,
    revocations: accounting.revoked.length, grants: accounting.granted.length, unchanged: accounting.unchangedCells,
    sqlRevokeStatements: accounting.sqlRevokeStatements, sqlGrantStatements: 0,
    negativeCases: Object.keys(negatives).length, negativeOutcomes: negatives, rollbackCases: Object.keys(rollbacks).length,
    rollbackOutcomes: rollbacks, browserMutations: 0, primaryThirteenMutations: 0, forbiddenMutations: 0,
    deltaEvidence: "SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH", approval: "NOT_PERFORMED", productionClassifierRejectsSynthetic: true };
});
console.log(JSON.stringify(report));
