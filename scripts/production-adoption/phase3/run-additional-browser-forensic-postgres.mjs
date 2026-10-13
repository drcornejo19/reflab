import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { buildBrowserFixtureSetup, fixturePreservationSql } from "./phase3-additional-browser-forensic-fixture.mjs";
import { attestBrowserCatalog } from "./run-production-additional-browser-forensic.mjs";
import { COMPLETE, serializeCurrentHarness, buildBrowserReport, functionSourceSha256, inventorySql, SOURCE_HASH_BASIS } from "./phase3-additional-browser-forensic-contract.mjs";
import { parseJsonResults } from "../../production-preflight/run.mjs";

const result = await withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  sql(buildAdditionalFixtureSetup()); sql(buildBrowserFixtureSetup());
  const before = sql(fixturePreservationSql);
  const report = await attestBrowserCatalog(createSession());
  assert.equal(report.classification, COMPLETE, JSON.stringify({ failed: report.failedChecks, unknown: report.unknownChecks, reason: report.reason }));
  let passed = 0;
  function check(action) { action(); passed++; }
  check(() => assert.equal(report.transactionReadOnly, true));
  check(() => assert.equal(report.transaction, "ROLLBACK"));
  check(() => assert.equal(report.additionalRuntimeTables.length, 57));
  check(() => assert.equal(report.additionalBrowserEffectiveTablePrivileges.length, 1368));
  check(() => assert.ok(report.additionalRuntimeTables.some((t) => t.policies.length === 0)));
  check(() => assert.ok(report.additionalRuntimePolicyRoleApplicability.some((p) => p.table === "appointments" && p.role === "anon" && p.applies && p.paths.some((v) => v.includes("PUBLIC")))));
  check(() => assert.ok(report.additionalRuntimePolicyRoleApplicability.some((p) => p.table === "teams" && p.role === "authenticated" && p.paths.some((v) => v.includes("browser_policy_group")))));
  check(() => assert.ok(report.additionalRuntimePolicyRoleApplicability.some((p) => p.table === "institutions" && p.role === "anon" && p.applies)));
  check(() => assert.ok(report.additionalRuntimePolicyFunctions.some((f) => f.name === "browser_definer" && f.securityDefiner && f.owner === "postgres")));
  check(() => assert.ok(report.additionalRuntimePolicyFunctions.some((f) => f.name === "browser_invoker" && !f.securityDefiner)));
  check(() => assert.ok(report.additionalRuntimePolicyFunctions.some((f) => f.name === "browser_leaf")));
  check(() => assert.ok(report.additionalRuntimePolicyFunctionDependencies.some((d) => d.nestedFunctionOids.length > 0)));
  check(() => assert.ok(report.additionalRuntimePolicyFunctionDependencies.some((d) => d.tableOperations.some((t) => t.operations.includes("SELECT")))));
  check(() => assert.ok(report.policyFunctionExecutionPaths.some((p) => p.functionOid === report.additionalRuntimePolicyFunctions.find((f) => f.name === "browser_leaf").oid
    && p.callerRole === "postgres" && p.executionRole === "postgres" && p.tableOperations.some((t) => t.relation.table === "capabilities" && t.permissionCheckRole === "postgres"))));
  check(() => assert.ok(report.policyFunctionExecutionPaths.some((p) => p.functionOid === report.additionalRuntimePolicyFunctions.find((f) => f.name === "browser_invoker").oid
    && p.callerRole === "anon" && p.executionRole === "anon")));
  check(() => assert.equal(report.additionalRuntimePolicyFunctions.find((f) => f.name === "browser_definer").effectiveExecute.find((e) => e.role === "anon").effective, false));
  check(() => assert.equal(report.additionalRuntimePolicyFunctions.find((f) => f.name === "browser_definer").effectiveExecute.find((e) => e.role === "authenticated").effective, true));
  check(() => assert.ok(report.additionalRuntimePolicyFunctionExecuteAcls.some((a) => a.signature.includes("browser_definer") && a.grantee === "authenticated" && a.grantor === "postgres")));
  check(() => assert.ok(report.institutionalLeadsEvidence.policies.some((p) => p.withCheckExpression?.includes("IS NOT NULL"))));
  check(() => assert.equal(report.institutionalLeadsEvidence.tableCapabilities.find((e) => e.role === "anon").effective, false));
  check(() => assert.ok(report.institutionalLeadsEvidence.columnRawAcls.some((a) => a.grantee === "anon" && a.privilege === "INSERT")));
  check(() => assert.ok(report.institutionalLeadsEvidence.effectiveBrowserColumns.some((e) => e.role === "anon" && e.effective && !e.tableLevelEffective)));
  check(() => assert.ok(report.clipsEvidence.columnRawAcls.some((a) => a.grantee === "anon" && a.privilege === "SELECT")));
  check(() => assert.equal(report.clipsEvidence.tableCapabilities.find((e) => e.role === "authenticated").effective, true));
  check(() => assert.ok(report.additionalRuntimeEffectiveAuthenticatedColumnPrivileges.some((e) => e.table === "institutions" && e.effective && e.tableLevelEffective)));
  check(() => assert.equal(report.additionalRuntimeColumnRawAcls.some((a) => a.table === "institutions"), false));
  check(() => assert.equal(report.mutationCount + report.ddlCount + report.dmlCount + report.migrationInvocationCount, 0));
  check(() => assert.doesNotThrow(() => serializeCurrentHarness(report, {})));
  check(() => assert.equal(sql(fixturePreservationSql), before));
  check(() => assert.ok(report.additionalRuntimeTables.every((t) => Array.isArray(t.columnAcls) && t.columnAclObservationComplete)));
  check(() => assert.deepEqual(report.additionalRuntimeTables.find((t) => t.table === "coach_rate_limit_buckets").columnAcls, []));
  check(() => assert.equal(report.additionalRuntimeTables.find((t) => t.table === "institutional_leads").columnAcls.length, 1));
  check(() => assert.ok(report.additionalRuntimePolicyFunctions.every((f) => /^[a-f0-9]{64}$/.test(f.sourceSha256) && f.sourceHashBasis === SOURCE_HASH_BASIS && !Object.hasOwn(f, "sourceText"))));
  const material = JSON.parse(sql("select json_build_object('sourceText',prosrc,'sqlBodyTree',prosqlbody::text)::text from pg_proc where oid='public.browser_definer()'::regprocedure;"));
  check(() => assert.equal(report.additionalRuntimePolicyFunctions.find((f) => f.name === "browser_definer").sourceSha256, functionSourceSha256(material)));
  const session = createSession();
  let inventory;
  try {
    await session.query("begin read only;");
    inventory = parseJsonResults(await session.query(inventorySql())).get("additional_browser_inventory");
  } finally { await session.rollback(); await session.close(); }
  const project = (e) => buildBrowserReport(e, report.additionalRuntimePolicyFunctions);
  check(() => assert.equal(project(inventory).classification, COMPLETE));
  const probe = inventory.policies.find((p) => p.name === "browser_hash_probe");
  check(() => assert.ok(probe.usingExpression.includes("int4eq") && probe.usingTree));
  for (const kind of ["using", "withCheck"]) {
    for (const state of ["missing", "undefined", "malformed", "incomplete"]) {
      const e = structuredClone(inventory), p = e.policies.find((p) => p.oid === probe.oid);
      p[`${kind}Expression`] = "pg_catalog.int4eq(1, 1)";
      if (state === "missing") delete p[`${kind}Tree`];
      else p[`${kind}Tree`] = state === "undefined" ? undefined : state === "malformed" ? "{FUNCEXPR :funcid" : "{FUNCEXPR}";
      check(() => { const r = project(e); assert.equal(r.classification, "UNKNOWN");
        assert.ok(r.unknownChecks.some((reason) => reason.startsWith(kind))); });
    }
    const e = structuredClone(inventory), p = e.policies.find((p) => p.oid === probe.oid);
    p[`${kind}Expression`] = null; delete p[`${kind}Tree`];
    check(() => assert.equal(project(e).classification, COMPLETE));
  }
  for (const invalid of ["missing", "null", "row"]) {
    const e = structuredClone(inventory), t = e.tables.find((t) => t.table === "coach_rate_limit_buckets");
    if (invalid === "missing") delete t.columnAcls; else t.columnAcls = invalid === "null" ? null : [{ privilege: "SELECT" }];
    check(() => assert.equal(project(e).classification, "UNKNOWN"));
  }
  const badHash = structuredClone(report.additionalRuntimePolicyFunctions); badHash[0].sourceSha256 = "a".repeat(32);
  check(() => assert.equal(buildBrowserReport(inventory, badHash).classification, "UNKNOWN"));
  sql("create policy browser_unknown on public.coach_runs for select to authenticated using(public.browser_dynamic());");
  const dynamic = await attestBrowserCatalog(createSession());
  check(() => assert.ok(dynamic.dependencyUnknowns.some((d) => d.signature.includes("browser_dynamic") && d.status.startsWith("UNKNOWN"))));
  check(() => assert.equal(dynamic.additionalRuntimePolicyFunctionDependencies.find((d) => d.signature.includes("browser_dynamic")).tableOperations.length, 0));
  const failed = await attestBrowserCatalog(createSession(), async () => { throw new Error("DELIBERATELY_UNRESOLVED_REFERENCE"); });
  check(() => assert.equal(failed.classification, "UNKNOWN"));
  check(() => assert.equal(failed.transaction, "ROLLBACK"));
  return { format: "REFLAB_ADDITIONAL_BROWSER_FORENSIC_LOCAL_PG17_V1", tests: { passed, failed: 0 }, transaction: "ROLLBACK",
    mutationCount: 0, remoteConnection: "NOT_EXECUTED", tableCount: 57, browserCells: 912,
    rawColumnAclCount: report.additionalRuntimeColumnRawAcls.length, policyCount: report.additionalRuntimePolicies.length };
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
