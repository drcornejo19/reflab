import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { attestCurrentServiceReadOnly } from "./run-production-current-service-role-pre.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";
import { serviceMutationAccounting } from "./phase3-current-service-role-matrix.mjs";

const report = await withCurrentServiceLocalPg(async ({sql, collect, createSession, classify, before}) => {
  const results = {}, accounting = serviceMutationAccounting();
  // Keep the managed installer's required database name. Other names must fail its target gate.
  sql("create database local_harness_pristine template postgres;", "template1", "supabase_admin");
  for (const [name, mutation, expected, restore] of [
    ["exactPre", "", "PRE_EXECUTABLE_EXACT"],
    ["exactPost", accounting.statements.join("\n"), "ALREADY_INSTALLED_POST"],
    ["partial", "revoke maintain on public.attempts from service_role;", "BLOCKER"],
    ["onlyRefereeSelect", "grant select on public.referee_exam_sessions to service_role;", "BLOCKER"],
    ["publicSubstitute", "revoke select on public.attempts from service_role; grant select on public.attempts to public;", "BLOCKER"],
    ["membershipSubstitute", "grant reflab_rls_owner to service_role with inherit true, set false;", "BLOCKER", "revoke reflab_rls_owner from service_role;"],
    ["grantor", "grant select on public.attempts to reflab_rls_owner with grant option; set session authorization reflab_rls_owner; grant select on public.attempts to service_role; reset session authorization;", "BLOCKER"],
    ["grantOption", "grant select on public.attempts to service_role with grant option;", "BLOCKER"],
    ["bypass", "alter role service_role nobypassrls;", "BLOCKER", "alter role service_role bypassrls;"],
    ["browser", "grant maintain on public.attempts to authenticated;", "BLOCKER"],
    ["profileColumn", "grant update(user_id) on public.user_profiles to authenticated;", "BLOCKER"],
    ["policyLiteral", "alter policy training_attempt_profile_read on public.user_profiles using(user_id=current_setting('reflab.training_user_id ',true));", "BLOCKER"],
    ["refereePolicy", "create policy local_unexpected on public.referee_exam_sessions for select to authenticated using(true);", "BLOCKER"],
    ["functionMode", `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`, "BLOCKER"],
    ["functionExecute", `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`, "BLOCKER"],
    ["owner", "alter table public.referee_exam_sessions owner to service_role;", "BLOCKER"],
    ["rls", "alter table public.referee_exam_sessions disable row level security;", "BLOCKER"],
    ["force", "alter table public.referee_exam_sessions force row level security;", "BLOCKER"],
    ["historical", "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');", "BLOCKER"],
    ["adoption", "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;", "BLOCKER"],
    ["runtime", "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');", "BLOCKER"],
    ["cutover", "create role reflab_pre_cutover_evidence_owner nologin;", "BLOCKER", "drop role reflab_pre_cutover_evidence_owner;"],
    ["phase4", "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';", "BLOCKER"],
  ]) {
    const database = "postgres";
    try {
      if (mutation) sql(mutation, database, "supabase_admin");
      const snapshot = collect(database);
      const r = await attestCurrentServiceReadOnly(createSession(database), {classify});
      assert.equal(r.classification, expected, `${name}: ${JSON.stringify(r)}`);
      assert.equal(r.transactionReadOnly, true); assert.equal(r.transaction, "ROLLBACK");
      assert.equal(r.approval, "NOT_PERFORMED"); assert.equal(r.mutationCount, 0); assert.equal(r.migrationInvocationCount, 0);
      assert.deepEqual(collect(database), snapshot); results[name] = expected;
    } finally {
      if (restore) sql(restore, database, "supabase_admin");
      sql("drop database postgres; create database postgres owner postgres template local_harness_pristine;", "template1", "supabase_admin");
    }
  }
  assert.deepEqual(collect(), before);
  sql("drop database local_harness_pristine;", "template1", "supabase_admin");
  return {format: "LOCAL_CURRENT_SERVICE_ROLE_PRE_PG17", result: "PASS", cases: Object.keys(results).length, results,
    mutationCount: 0, migrationInvocationCount: 0, transaction: "ROLLBACK", productionClassifierRejectsSynthetic: true};
});
console.log(JSON.stringify(report));
