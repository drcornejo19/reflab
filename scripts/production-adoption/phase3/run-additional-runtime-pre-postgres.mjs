import assert from "node:assert/strict";
import { withAdditionalHarnessLocalPg } from "./phase3-additional-runtime-harness-local-pg.mjs";
import { attestAdditionalReadOnly } from "./run-production-additional-runtime-service-role-pre.mjs";
import { PRE_EXACT, POST_EXACT } from "./phase3-additional-runtime-pre-contract.mjs";
import { additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { CURRENT_FUNCTIONS } from "./phase3-current-service-role-contract.mjs";

const report = await withAdditionalHarnessLocalPg(async ({ sql, createSession, collect, before, classify }) => {
  const outcomes = {};
  sql("create database local_additional_pre_pristine template postgres;", "template1", "supabase_admin");
  for (const [name, mutation, expected, restore] of [
    ["exactPre", "", PRE_EXACT],
    ["exactPost", additionalAccounting().statements.join("\n"), POST_EXACT],
    ["postMissingRequired", `${additionalAccounting().statements.join("\n")}\nrevoke select on public.appointments from service_role;`, "BLOCKER"],
    ["postExcessPrivilege", `${additionalAccounting().statements.join("\n")}\ngrant maintain on public.appointments to service_role;`, "BLOCKER"],
    ["partial", "revoke maintain on public.coach_runs from service_role;", "BLOCKER"],
    ["missingBroad", "revoke select on public.appointments from service_role;", "BLOCKER"],
    ["wrongGrantor", "grant select on public.coach_runs to reflab_rls_owner with grant option; set role reflab_rls_owner; grant select on public.coach_runs to service_role; reset role;", "BLOCKER"],
    ["grantOption", "grant select on public.coach_runs to service_role with grant option;", "BLOCKER"],
    ["publicSubstitute", "revoke select on public.coach_runs from service_role; grant select on public.coach_runs to public;", "BLOCKER"],
    ["membershipSubstitute", "grant reflab_rls_owner to service_role with inherit true, set false;", "BLOCKER", "revoke reflab_rls_owner from service_role;"],
    ["bypassRls", "alter role service_role nobypassrls;", "BLOCKER", "alter role service_role bypassrls;"],
    ["owner", "grant create on schema public to service_role; alter table public.coach_runs owner to service_role;", "BLOCKER"],
    ["rls", "alter table public.coach_runs disable row level security;", "BLOCKER"],
    ["force", "alter table public.coach_runs force row level security;", "BLOCKER"],
    ["primaryThirteen", "grant maintain on public.attempts to service_role;", "BLOCKER"],
    ["browserAdditional", "revoke maintain on public.appointments from anon;", "BLOCKER"],
    ["browser64249", "grant maintain on public.attempts to authenticated;", "BLOCKER"],
    ["profileColumns", "grant update(user_id) on public.user_profiles to authenticated;", "BLOCKER"],
    ["policyLiteral", "alter policy training_attempt_profile_read on public.user_profiles using(user_id=current_setting('reflab.training_user_id ',true));", "BLOCKER"],
    ["functionMode", `alter function ${CURRENT_FUNCTIONS[0].signature} security invoker;`, "BLOCKER"],
    ["functionExecute", `grant execute on function ${CURRENT_FUNCTIONS[0].signature} to public;`, "BLOCKER"],
    ["historical", "insert into public.clips(id,user_id) values(999,'local_synthetic_drift');", "BLOCKER"],
    ["adoption", "update reflab_meta.production_adoption_state set phase_key='local_drift' where phase_order=4;", "BLOCKER"],
    ["runtime", "insert into reflab_meta.reflab_schema_state(baseline_version) values('local_drift');", "BLOCKER"],
    ["cutover", "create role reflab_pre_cutover_evidence_owner nologin;", "BLOCKER", "drop role reflab_pre_cutover_evidence_owner;"],
    ["phase4", "comment on table public.user_profiles is 'reflab:production_adoption_provider=local_drift';", "BLOCKER"],
  ]) {
    try {
      if (mutation) sql(mutation, "postgres", "supabase_admin");
      const snapshot = await collect();
      const r = await attestAdditionalReadOnly(createSession(), { classify });
      assert.equal(r.classification, expected, `${name}: ${JSON.stringify(r)}`);
      assert.equal(r.transactionReadOnly, true); assert.equal(r.transaction, "ROLLBACK");
      assert.equal(r.approval, "NOT_PERFORMED"); assert.equal(r.mutationCount, 0); assert.equal(r.migrationInvocationCount, 0);
      assert.equal(r.automaticRetryAuthorized, false); assert.deepEqual(await collect(), snapshot); outcomes[name] = "PASS";
    } finally {
      if (restore) sql(restore, "postgres", "supabase_admin");
      sql("drop database postgres; create database postgres owner postgres template local_additional_pre_pristine;", "template1", "supabase_admin");
    }
  }
  assert.deepEqual(await collect(), before);
  sql("drop database local_additional_pre_pristine;", "template1", "supabase_admin");
  return { format: "LOCAL_ADDITIONAL_RUNTIME_PRODUCTION_PRE_PG17", result: "PASS", cases: Object.keys(outcomes).length,
    outcomes, transaction: "ROLLBACK", mutationCount: 0, migrationInvocationCount: 0, productionClassifierRejectsSynthetic: true };
});
console.log(JSON.stringify(report));
