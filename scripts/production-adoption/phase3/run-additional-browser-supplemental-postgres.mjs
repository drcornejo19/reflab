import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { attestSupplemental } from "./run-production-additional-browser-supplemental-forensic.mjs";
import { COMPLETE, FUNCTION_OIDS, TYPE_OIDS, discoverIoFunctions } from "./phase3-additional-browser-supplemental-contract.mjs";

const result = await withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  // Fixture-only ACL setup, never part of the forensic observation path.
  const grant = sql("select format('grant execute on function %s to authenticated;',oid::regprocedure) from pg_proc where oid=3214;", "postgres", "supabase_admin");
  sql(grant, "postgres", "supabase_admin");
  const snapshot = `select md5(jsonb_build_object('types',(select jsonb_agg(to_jsonb(t) order by oid) from pg_type t where oid in (25,2950)),
    'functions',(select jsonb_agg(to_jsonb(p) order by oid) from pg_proc p where oid in (3214,2956)
      or oid in (select typinput from pg_type where oid=25) or oid in (select typoutput from pg_type where oid=2950)))::text);`;
  const before = sql(snapshot), session = createSession(), queries = [], query = session.query.bind(session);
  session.query = async (text) => {
    assert.equal(/additional_browser_inventory|pg_policy|pg_attribute|from pg_class|has_table_privilege|has_column_privilege/.test(text), false);
    queries.push(text); return query(text);
  };
  const report = await attestSupplemental(session);
  let passed = 0;
  const check = (action) => { action(); passed++; };
  check(() => assert.equal(report.classification, COMPLETE, JSON.stringify(report)));
  check(() => assert.equal(report.transactionReadOnly, true));
  check(() => assert.equal(report.transaction, "ROLLBACK"));
  check(() => assert.deepEqual(report.requestedFunctionOids, FUNCTION_OIDS));
  check(() => assert.deepEqual(report.requestedTypeOids, TYPE_OIDS));
  check(() => assert.equal(report.typeEvidence.length, 2));
  check(() => assert.equal(report.directFunctionEvidence.length, 2));
  check(() => assert.ok(Array.isArray(report.directFunctionEvidence.find(f => f.oid === 3214).rawAcl)));
  check(() => assert.deepEqual(report.discoveredIoFunctionOids, discoverIoFunctions(report.typeEvidence)));
  for (const type of report.typeEvidence) {
    check(() => assert.ok(type.namespaceOid > 0));
    check(() => assert.ok(type.schema && type.name && type.typinput > 0 && type.typoutput > 0));
  }
  for (const f of [...report.directFunctionEvidence, ...report.ioFunctionEvidence]) {
    check(() => assert.ok(/^[a-f0-9]{64}$/.test(f.sourceSha256)));
    check(() => assert.equal(Object.hasOwn(f, "sourceText"), false));
    check(() => assert.ok(f.effectiveExecute.some(e => e.role === "anon")));
    check(() => assert.ok(f.effectiveExecute.some(e => e.role === "authenticated")));
    check(() => assert.ok(f.executeAcls.length === f.executeAclEntryCount));
  }
  check(() => assert.equal(queries.length, 6));
  check(() => assert.match(queries[5], /^rollback;/i));
  check(() => assert.match(queries[0], /repeatable read/));
  check(() => assert.match(queries[1], /transaction_read_only/));
  check(() => assert.match(queries[2], /where p.oid in \(2956,3214\)/));
  check(() => assert.match(queries[3], /where t.oid in \(25,2950\)/));
  check(() => assert.match(queries[4], new RegExp(`where p.oid in \\(${report.discoveredIoFunctionOids.join(",")}\\)`)));
  check(() => assert.equal(queries.some(q => /additional_browser_inventory|pg_policy|pg_attribute|from pg_class/.test(q)), false));
  check(() => assert.equal(report.mutationCount + report.ddlCount + report.dmlCount + report.migrationInvocationCount, 0));
  check(() => assert.equal(sql(snapshot), before));
  return { classification: "LOCAL_SUPPLEMENTAL_PG17_PASS", passed, transactionReadOnly: true,
    transaction: "ROLLBACK", persistedMutations: 0, inventorySqlInvocationCount: 0,
    broadTableInventoryQueryCount: 0, broadPolicyQueryCount: 0, broadTableAclQueryCount: 0,
    broadColumnQueryCount: 0, broadColumnAclQueryCount: 0 };
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
