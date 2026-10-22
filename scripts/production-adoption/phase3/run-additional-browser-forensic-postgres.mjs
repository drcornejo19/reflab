import assert from "node:assert/strict";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { buildBrowserFixtureSetup, fixturePreservationSql } from "./phase3-additional-browser-forensic-fixture.mjs";
import { attestBrowserCatalog } from "./run-production-additional-browser-forensic.mjs";
import { COMPLETE, serializeCurrentHarness, buildBrowserReport, functionSourceSha256, inventorySql, SOURCE_HASH_BASIS,
  inspectPredicateTree, parseCatalogTree } from "./phase3-additional-browser-forensic-contract.mjs";
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
  inventory.policyTypeIoCatalog = report.additionalRuntimePolicyTypeIoCatalog;
  const project = (e) => buildBrowserReport(e, report.additionalRuntimePolicyFunctions);
  check(() => assert.equal(project(inventory).classification, COMPLETE));
  const probe = inventory.policies.find((p) => p.name === "browser_hash_probe");
  check(() => assert.ok(probe.usingExpression.includes("int4eq") && probe.usingTree));
  const operatorProbe = inventory.policies.find((p) => p.name === "browser_operator");
  const scalarProbe = inventory.policies.find((p) => p.name === "browser_scalar_array");
  const realCoalesce = inventory.policies.find((p) => p.name === "browser_real_coalesce");
  const realSublink = inventory.policies.find((p) => p.name === "browser_real_sublink");
  for (const kind of ["using", "withCheck"]) {
    const coalesced = inspectPredicateTree(realCoalesce[`${kind}Tree`],inventory.operatorFunctions,inventory);
    check(() => assert.ok(realCoalesce[`${kind}Tree`].includes("{COALESCEEXPR")));
    check(() => assert.ok(realCoalesce[`${kind}Tree`].includes("{COERCEVIAIO")));
    check(() => assert.deepEqual(coalesced.unresolved,[]));
    check(() => assert.ok(coalesced.functionOids.length>=5));
    check(() => assert.ok(coalesced.typeIoDependencies.every(d=>d.sourceType && d.targetType
      && d.sourceOutputFunctionOid===d.sourceType.typoutput && d.targetInputFunctionOid===d.targetType.typinput)));
    check(() => assert.ok(coalesced.typeIoDependencies.every(d=>report.additionalRuntimePolicyFunctions.some(f=>f.oid===d.sourceOutputFunctionOid)
      && report.additionalRuntimePolicyFunctions.some(f=>f.oid===d.targetInputFunctionOid))));
    const subquery = inspectPredicateTree(realSublink[`${kind}Tree`],inventory.operatorFunctions,inventory);
    check(() => assert.ok(realSublink[`${kind}Tree`].includes("{SUBLINK")));
    check(() => assert.deepEqual(subquery.unresolved,[]));
    check(() => assert.ok(subquery.relationDependencies.some(d=>d.table==="institutions" && d.resolvedPrivileges.includes("SELECT")
      && d.selectedColumns.some(c=>c.column==="id") && d.checkAsUser===0 && d.executionRole==="POLICY_CALLER")));
    if(kind==="using") {
      check(() => assert.equal(subquery.subqueries.length,2));
      check(() => assert.ok(subquery.relationDependencies.some(d=>d.table==="institution_memberships")));
      check(() => assert.ok(subquery.functionOids.length>=2));
    }
    for(const state of ["source output missing","target input missing","missing function","unknown child"]) check(()=>{
      const e=structuredClone(inventory),p=e.policies.find(p=>p.oid===realCoalesce.oid);
      const io=coalesced.typeIoDependencies[0];
      if(state==="source output missing")delete e.policyTypeIoCatalog.find(t=>t.oid===io.sourceTypeOid).typoutput;
      if(state==="target input missing")delete e.policyTypeIoCatalog.find(t=>t.oid===io.targetTypeOid).typinput;
      if(state==="unknown child")p[`${kind}Tree`]=p[`${kind}Tree`].replace(/\{COERCEVIAIO/,"{UNOBSERVED");
      const functions=state==="missing function"?report.additionalRuntimePolicyFunctions.filter(f=>f.oid!==io.sourceOutputFunctionOid):report.additionalRuntimePolicyFunctions;
      const r=buildBrowserReport(e,functions);assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicies.find(p=>p.oid===realCoalesce.oid).resolvedFunctionOids,null);
    });
    for(const state of ["missing relation","bad bitmap","unsupported qual","missing permission","explicit checkAsUser"]) check(()=>{
      const e=structuredClone(inventory),p=e.policies.find(p=>p.oid===realSublink.oid),root=parseCatalogTree(p[`${kind}Tree`]);
      function visit(n){if(!n||typeof n!=="object")return;if(n.tag==="RTEPERMISSIONINFO"){
        if(state==="bad bitmap")n.selectedCols=["b",999999];if(state==="explicit checkAsUser")n.checkAsUser=e.roleAttributes.find(r=>r.name==="postgres").oid;
      }if(n.tag==="QUERY"){if(state==="missing permission")n.rteperminfos="<>";if(state==="unsupported qual")n.jointree.quals={tag:"UNOBSERVED"};}
      for(const v of Object.values(n))visit(v);}
      visit(root);
      if(state==="missing relation")e.tables=e.tables.filter(t=>t.table!=="institutions");
      const serialize=n=>Array.isArray(n)?`(${n.map(serialize).join(" ")})`:n&&typeof n==="object"?`{${n.tag} ${Object.entries(n).filter(([k])=>k!=="tag").map(([k,v])=>`:${k} ${serialize(v)}`).join(" ")}}`:String(n);
      p[`${kind}Tree`]=serialize(root);
      const r=project(e);
      if(state==="explicit checkAsUser"){assert.equal(r.classification,COMPLETE);assert.ok(r.additionalRuntimePolicies.find(p=>p.oid===realSublink.oid)[`${kind}DependencyEvidence`].relationDependencies.every(d=>d.executionRole==="postgres"));}
      else assert.equal(r.classification,"UNKNOWN");
    });
  }
  check(()=>{const e=structuredClone(inventory);e.policies.find(p=>p.name==="browser_owner_cast").usingTree="{UNOBSERVED}";
    const r=project(e);assert.equal(r.classification,"UNKNOWN");assert.equal(r.clipsEvidence.roleActionEvidence.find(r=>r.role==="authenticated").status,"DEPENDENCY_EVIDENCE_COMPLETE");});
  for (const kind of ["using", "withCheck"]) {
    for (const [name, tree] of [["OPEXPR", operatorProbe.usingTree], ["SCALARARRAYOPEXPR", scalarProbe[`${kind}Tree`]]]) {
      check(() => {
        assert.ok(tree.includes(`{${name}`));
        const inspected = inspectPredicateTree(tree, inventory.operatorFunctions);
        assert.deepEqual(inspected.unresolved, []); assert.ok(inspected.functionOids.length > 0);
        assert.ok(inspected.operatorDependencies.every((d) => d.operatorOid > 0 && d.functionOid > 0));
        assert.ok(inspected.functionOids.every((oid) => report.additionalRuntimePolicyFunctions.some((f) => f.oid === oid)));
        const e = structuredClone(inventory), p = e.policies.find((p) => p.oid === probe.oid);
        p[`${kind}Expression`] = name === "OPEXPR" ? "id = id" : "id = ANY(ARRAY[id])"; p[`${kind}Tree`] = tree;
        assert.equal(project(e).classification, COMPLETE);
      });
      check(() => {
        const mappedTree = tree.replace(/:opfuncid \d+/, ":opfuncid 0");
        const inspected = inspectPredicateTree(mappedTree, inventory.operatorFunctions);
        assert.deepEqual(inspected.unresolved, []);
        assert.ok(inspected.operatorDependencies.some((d) => d.basis === "PG_OPERATOR_OPRCODE"));
        assert.deepEqual(inspected.functionOids, inspectPredicateTree(tree, inventory.operatorFunctions).functionOids);
      });
    }
    for (const tree of ["{OPEXPR}", "{SCALARARRAYOPEXPR}", "{UNOBSERVED}",
      "{BOOLEXPR :boolop not :args ({UNOBSERVED})}", "{BOOLEXPR :boolop not :args (42)}",
      "{CONST :consttype 16 :constisnull true :constvalue <> :funcid 65}",
      "{OPEXPR :opno 0 :opfuncid 65 :opresulttype 16 :args ({CONST :consttype 16 :constisnull true :constvalue <>})}"]) {
      for (const table of ["clips", "institutional_leads"]) check(() => {
        const e = structuredClone(inventory), p = e.policies.find((p) => p.table === table);
        p[`${kind}Expression`] = "1 = 1"; p[`${kind}Tree`] = tree;
        const r = project(e), observed = r.additionalRuntimePolicies.find((v) => v.oid === p.oid);
        assert.equal(r.classification, "UNKNOWN"); assert.equal(observed[`${kind}DependencyEvidence`].treeStatus, "UNKNOWN");
        assert.equal(observed.resolvedFunctionOids, null); assert.equal(observed[`${kind}DependencyEvidence`].functionOids, null);
        assert.equal(r[table === "clips" ? "clipsEvidence" : "institutionalLeadsEvidence"].policyFunctionOids, null);
        assert.ok(r.unknownChecks.includes(observed[`${kind}DependencyEvidence`].reason));
      });
    }
    for (const table of ["clips", "institutional_leads"]) check(() => {
      const e = structuredClone(inventory), p = e.policies.find((p) => p.table === table);
      p[`${kind}Expression`] = "1 = 1";
      p[`${kind}Tree`] = "{UNOBSERVED :tag CONST :consttype 16 :constisnull true :constvalue <>}";
      const r = project(e); assert.equal(r.classification, "UNKNOWN");
      assert.equal(r.additionalRuntimePolicies.find((v) => v.oid === p.oid)[`${kind}DependencyEvidence`].treeStatus, "MALFORMED");
      assert.equal(r[table === "clips" ? "clipsEvidence" : "institutionalLeadsEvidence"].policyFunctionOids, null);
    });
  }
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
