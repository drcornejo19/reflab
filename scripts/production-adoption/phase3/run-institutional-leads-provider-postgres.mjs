import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { fixtureSetup } from "./phase3-institutional-leads-insert-fixture.mjs";
import { PRE, POST, MIGRATION, QUERY_ID, observationSql, classifyLocalLead, classifyLead } from "./phase3-institutional-leads-insert-contract.mjs";
import { executeLeadAtomic } from "./run-production-institutional-leads-provider.mjs";
import { EXPECTED_ACCOUNTING } from "./phase3-institutional-leads-runner-contract.mjs";

const report = await withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  sql(fixtureSetup());
  // This grantor exists only in the disposable fixture, to exercise direct-origin rejection.
  sql("create role local_lead_grantor nologin; grant local_lead_grantor to postgres;", "postgres", "supabase_admin");
  const observe = async (session) => parseJsonResults(await session.query(observationSql()));
  const collect = async () => {
    const s = createSession();
    try { await s.query("begin read only; set local search_path=pg_catalog,public; set local statement_timeout='60s';"); return await observe(s); }
    finally { await s.rollback(); await s.close(); }
  };
  const before = await collect(), inventory = before.get(SERVICE_FORENSIC_QUERY_ID);
  const proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, { targetExact: true }).historicalState,
    functionHashes: Object.fromEntries(inventory.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature, f.sourceHash])) };
  const classify = (e, options) => classifyLocalLead(e, proof, options);
  assert.equal(classify(before).classification, PRE);
  assert.equal(classifyLead(before).classification, "BLOCKER");
  const bytes = readFileSync(new URL("../../../" + MIGRATION, import.meta.url));
  const negatives = {
    installed: "grant insert on public.institutional_leads to service_role;",
    missingSelect: "revoke select on public.institutional_leads from service_role;",
    missingUpdate: "revoke update on public.institutional_leads from service_role;",
    grantable: "grant select on public.institutional_leads to service_role with grant option;",
    grantor: "revoke select on public.institutional_leads from service_role; grant select on public.institutional_leads to local_lead_grantor with grant option; set role local_lead_grantor; grant select on public.institutional_leads to service_role; reset role;",
    browserAnon: "grant insert on public.institutional_leads to anon;",
    browserAuthenticated: "grant insert on public.institutional_leads to authenticated;",
    browserPublic: "grant insert on public.institutional_leads to public;",
    column: "grant insert(email) on public.institutional_leads to anon;",
    owner: "grant create on schema public to local_lead_grantor; alter table public.institutional_leads owner to local_lead_grantor;",
    rls: "alter table public.institutional_leads disable row level security;",
    force: "alter table public.institutional_leads force row level security;",
    policy: "create policy local_insert on public.institutional_leads for insert to anon with check(true);",
    primary: "grant delete on public.attempts to service_role;",
    predecessor: "grant delete on public.appointments to service_role;",
    ...Object.fromEntries(["delete", "truncate", "references", "trigger", "maintain"].map((p) => [p, `grant ${p} on public.institutional_leads to service_role;`])),
  };
  for (const [name, mutation] of Object.entries(negatives)) {
    let injected = false;
    const r = await executeLeadAtomic(createSession(), bytes, { classify, checkpoint: async (stage, s) => {
      if (stage === "BEFORE_PRE") { await s.query(mutation); injected = true; }
    } });
    assert.equal(injected, true, `Negative fixture must actually install: ${name}`);
    assert.equal(r.preClassification, name === "installed" ? POST : "BLOCKER", JSON.stringify(r));
    assert.equal(r.providerInvocationCount, 0, name); assert.equal(r.transaction, "ROLLBACK", name);
    assert.equal(r.classification, name === "installed" ? "ALREADY_INSTALLED_REVIEW_REQUIRED" : "BLOCKER", JSON.stringify(r));
    assert.deepEqual(await collect(), before, `PRE restored: ${name}`);
  }
  let rollbacks = 0;
  for (const point of ["BEFORE_PRE", "AFTER_PRE", "AFTER_GRANT", "BEFORE_COMMIT"]) {
    const r = await executeLeadAtomic(createSession(), bytes, { classify, checkpoint: async (stage, s) => {
      if (stage === point) await s.query("select 1/0;");
    } });
    assert.equal(r.classification, "BLOCKER"); assert.equal(r.transaction, "ROLLBACK");
    assert.deepEqual(await collect(), before, point); rollbacks++;
  }
  const postDrift = await executeLeadAtomic(createSession(), bytes, { classify, checkpoint: async (stage, s) => {
    if (stage === "AFTER_GRANT") await s.query("grant insert on public.institutional_leads to anon;");
  } });
  assert.equal(postDrift.failureCategory, "POST_DDL_ATTESTATION"); assert.equal(postDrift.transaction, "ROLLBACK");
  assert.equal(postDrift.postClassification, "BLOCKER");
  assert.deepEqual(await collect(), before); rollbacks++;
  let queries = 0;
  const s = createSession(), invalid = await executeLeadAtomic({ query: (...a) => { queries++; return s.query(...a); }, rollback: () => s.rollback(), close: () => s.close() }, Buffer.from(bytes.toString() + "\n"), { classify });
  assert.equal(invalid.reason, "PROVIDER_SHA_MISMATCH"); assert.equal(queries, 0); assert.deepEqual(await collect(), before);
  const result = await executeLeadAtomic(createSession(), bytes, { classify });
  assert.equal(result.classification, "COMMITTED_POST_EXACT", JSON.stringify(result));
  assert.equal(result.commitOutcome, "ACKNOWLEDGED"); assert.equal(result.providerInvocationCount, 1);
  assert.deepEqual(result.mutationAccounting, EXPECTED_ACCOUNTING);
  const after = await collect(); assert.equal(classify(after).classification, POST);
  assert.deepEqual(before.get(QUERY_ID).browser, after.get(QUERY_ID).browser);
  assert.deepEqual(after.get(QUERY_ID).rawService.map((x) => x.privilege).sort(), ["INSERT", "SELECT", "UPDATE"]);
  const second = await executeLeadAtomic(createSession(), bytes, { classify });
  assert.equal(second.reexecution, "REFUSED"); assert.equal(second.providerInvocationCount, 0);
  assert.equal(second.providerResult, "NOT_INVOKED"); assert.deepEqual(await collect(), after);
  return { result: "PASS", evidence: "LOCAL_SYNTHETIC_ONLY", pre: PRE, post: POST, providerInvocationCount: 1,
    transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED", negativeCases: Object.keys(negatives).length,
    rollbackCases: rollbacks, wrongShaQueries: queries, reexecution: "REFUSED", secondInvocationCount: 0,
    mutationAccounting: EXPECTED_ACCOUNTING, browserInsertAdded: false, callerDeploymentAuthorized: false };
});
console.log(JSON.stringify(report));
