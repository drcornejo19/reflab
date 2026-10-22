import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { fixtureSetup } from "./phase3-institutional-leads-insert-fixture.mjs";
import { PRE, POST, MIGRATION, GRANT, QUERY_ID, observationSql, classifyLocalLead, classifyLead, assertMigration, preserved } from "./phase3-institutional-leads-insert-contract.mjs";

const report = await withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  sql(fixtureSetup());
  const observe = async (session) => parseJsonResults(await session.query(observationSql()));
  const collect = async () => {
    const session = createSession();
    try { await session.query("begin read only; set local lock_timeout='2s'; set local statement_timeout='15s'; set local transaction_timeout='180s';"); return await observe(session); }
    finally { await session.rollback(); await session.close(); }
  };
  const before = await collect(), inventory = before.get(SERVICE_FORENSIC_QUERY_ID);
  const proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, { targetExact: true }).historicalState,
    functionHashes: Object.fromEntries(inventory.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature, f.sourceHash])) };
  const classify = (e, readOnly = true) => classifyLocalLead(e, proof, { readOnly });
  const check = (e, expected, readOnly = true) => {
    const result = classify(e, readOnly);
    assert.equal(result.classification, expected, JSON.stringify(result)); return result;
  };
  check(before, PRE);
  assert.equal(classifyLead(before).classification, "BLOCKER", "Synthetic evidence must not pass Production classifier");
  const bytes = readFileSync(new URL("../../../" + MIGRATION, import.meta.url)); assertMigration(bytes);
  const source = bytes.toString("utf8").replaceAll("\r\n", "\n");
  const body = source.slice(source.indexOf("do $lead_insert$"), source.lastIndexOf("commit;"));
  const begin = source.slice(0, source.indexOf("do $lead_insert$"));
  const negatives = {
    missingSelect: "revoke select on public.institutional_leads from service_role;",
    missingUpdate: "revoke update on public.institutional_leads from service_role;",
    browserInsert: "grant insert on public.institutional_leads to anon;",
    publicInsert: "grant insert on public.institutional_leads to public;",
    authenticatedInsert: "grant insert on public.institutional_leads to authenticated;",
    columnInsert: "grant insert(email) on public.institutional_leads to anon;",
    serviceColumn: "grant insert(email) on public.institutional_leads to service_role;",
    policy: "create policy local_bad_insert on public.institutional_leads for insert to anon with check(true);",
    rls: "alter table public.institutional_leads disable row level security;",
    force: "alter table public.institutional_leads force row level security;",
    columns: "alter table public.institutional_leads add column unexpected text;",
    primary: "grant delete on public.attempts to service_role;",
    additional: "grant delete on public.appointments to service_role;",
    bypass: "alter role service_role nobypassrls;",
    ...Object.fromEntries(["delete", "truncate", "references", "trigger", "maintain"].map((p) => [p, `grant ${p} on public.institutional_leads to service_role;`])),
  };
  for (const [name, mutation] of Object.entries(negatives)) {
    const session = createSession();
    try {
      await session.query("begin;"); await session.query(mutation);
      check(await observe(session), "BLOCKER", false);
    } finally { await session.rollback(); await session.close(); }
    assert.deepEqual(await collect(), before, name);
  }
  let rollbacks = 0;
  for (const stage of ["beforeGrant", "afterGrant", "afterPost"]) {
    const session = createSession();
    try {
      await session.query(begin); check(await observe(session), PRE, false);
      if (stage !== "beforeGrant") await session.query(body);
      if (stage === "afterPost") check(await observe(session), POST, false);
      await assert.rejects(session.query("select 1/0;"));
    } finally { await session.rollback(); await session.close(); }
    assert.deepEqual(await collect(), before); rollbacks++;
  }
  // The exact standalone artifact must also restore PRE if failure interrupts its transaction.
  assert.throws(() => sql(source.replace(GRANT, GRANT + "\nperform 1/0;")));
  assert.deepEqual(await collect(), before); rollbacks++;
  const session = createSession();
  try {
    await session.query(begin); check(await observe(session), PRE, false);
    await session.query(body); const after = await observe(session); check(after, POST, false);
    assert(preserved(before, after)); await session.query("commit;");
  } finally { await session.close(); }
  const post = await collect(); check(post, POST); assert(preserved(before, post));
  const oldAcls = before.get(SERVICE_FORENSIC_QUERY_ID).tableAcls, newAcls = post.get(SERVICE_FORENSIC_QUERY_ID).tableAcls;
  const key = (a) => JSON.stringify(a);
  const added = newAcls.filter((a) => !oldAcls.some((b) => key(a) === key(b)));
  assert.deepEqual(added, [{ table: "institutional_leads", schema: "public", grantee: "service_role", grantor: "postgres", grantable: false, privilege: "INSERT" }]);
  assert.equal(oldAcls.filter((a) => !newAcls.some((b) => key(a) === key(b))).length, 0);
  assert.deepEqual(before.get(QUERY_ID).browser, post.get(QUERY_ID).browser);
  assert.equal(check(post, POST).reexecution, "REFUSED");
  assert.throws(() => sql(source), /Exact institutional_leads PRE required/);
  assert.deepEqual(await collect(), post);
  return { result: "PASS", pre: PRE, post: POST, migrationInvocationCount: 1, transaction: "COMMIT", commitOutcome: "ACKNOWLEDGED",
    reexecution: "REFUSED", secondInvocationCount: 0, standaloneReplayRejected: true,
    negativeCases: Object.keys(negatives).length, rollbackCases: rollbacks, tableGrantChanges: added.length,
    serviceRoleInsert: true, serviceRoleDelete: false, browserInsertAdded: false, policyChanges: 0, productDataMutations: 0 };
});
console.log(JSON.stringify(report));
