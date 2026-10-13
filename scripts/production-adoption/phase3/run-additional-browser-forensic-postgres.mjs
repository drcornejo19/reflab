import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { buildBrowserFixtureSetup, fixturePreservationSql } from "./phase3-additional-browser-forensic-fixture.mjs";
import { attestBrowserCatalog } from "./run-production-additional-browser-forensic.mjs";
import { COMPLETE, serializeCurrentHarness } from "./phase3-additional-browser-forensic-contract.mjs";

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
