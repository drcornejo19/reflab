import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { browserFixtureEvidence, BOOLEAN_CONST_TREE, functionPredicateTree } from "./phase3-additional-browser-forensic-fixture.mjs";
import { inspectPredicateTree, buildBrowserReport, COMPLETE, functionSourceSha256, SOURCE_HASH_BASIS, typeIoSql } from "./phase3-additional-browser-forensic-contract.mjs";
import { parseSavedBrowserForensic, reprocessBrowserForensic } from "./reprocess-additional-browser-forensic.mjs";

// Synthetic identifiers only; never substitute these records for archived Production evidence.
const constant = { tag: "CONST", consttype: 301, constisnull: "true", constvalue: "<>" };
const tree = (n) => Array.isArray(n) ? `(${n.map(tree).join(" ")})` : n && typeof n === "object"
  ? `{${n.tag} ${Object.entries(n).filter(([k]) => k !== "tag").map(([k,v]) => `:${k} ${tree(v)}`).join(" ")}}` : String(n);
const func = (oid = 500, type = 300) => ({ tag: "FUNCEXPR", funcid: oid, funcresulttype: type, args: "<>" });
const coerce = () => ({ tag: "COERCEVIAIO", arg: func(), resulttype: 301, resultcollid: 0, coerceformat: 1 });
const fn = (oid) => ({ oid, schema: "synthetic", name: `helper_${oid}`, identityArguments: "", returnType: "synthetic",
  language: "internal", owner: "postgres", securityDefiner: false, strict: false, leakproof: false, volatility: "i",
  executeAcls: [], executeAclEntryCount: 0, effectiveExecute: ["anon", "authenticated", "PUBLIC", "service_role", "postgres"].map(role => ({ role, effective: true })),
  catalogDependencies: [], sqlBodyTree: null, sourceSha256: functionSourceSha256({ sourceText: "synthetic", sqlBodyTree: null }), sourceHashBasis: SOURCE_HASH_BASIS });
const catalog = () => ({ ...browserFixtureEvidence(), policyTypeIoCatalog: [
  { oid: 300, schema: "synthetic", name: "source", typinput: 510, typoutput: 501 },
  { oid: 301, schema: "synthetic", name: "target", typinput: 502, typoutput: 511 }], operatorFunctions: [{ oid: 123, functionOid: 503 }] });
const coalesce = () => ({ tag: "COALESCEEXPR", coalescetype: 301, coalescecollid: 0, args: [
  { tag: "OPEXPR", opno: 123, opfuncid: 503, opresulttype: 301, args: [func(504,302), constant] }, coerce()] });
const query = (relationOid) => ({ tag: "QUERY", commandType: 1, querySource: 0, canSetTag: "true", hasSubLinks: "false",
  rtable: [{ tag: "RANGETBLENTRY", alias: "<>", eref: { tag: "ALIAS", aliasname: "fixture", colnames: ["id"] },
    rtekind: 0, relid: relationOid, inh: "true", relkind: "r", rellockmode: 1, perminfoindex: 1,
    tablesample: "<>", lateral: "false", inFromCl: "true", securityQuals: "<>" }],
  rteperminfos: [{ tag: "RTEPERMISSIONINFO", relid: relationOid, inh: "true", requiredPerms: 2, checkAsUser: 0,
    selectedCols: ["b",8], insertedCols: ["b"], updatedCols: ["b"] }],
  jointree: { tag: "FROMEXPR", fromlist: [{ tag: "RANGETBLREF", rtindex: 1 }], quals: "<>" },
  targetList: [{ tag: "TARGETENTRY", expr: constant, resno: 1, resname: "fixture", resjunk: "false" }], stmt_location: -1, stmt_len: -1,
  ...Object.fromEntries(["utilityStmt", "cteList", "mergeActionList", "mergeJoinCondition", "onConflict", "returningList", "groupClause",
    "groupingSets", "havingQual", "windowClause", "distinctClause", "sortClause", "limitOffset", "limitCount", "rowMarks", "setOperations",
    "constraintDeps", "withCheckOptions"].map(k => [k,"<>"])),
  ...Object.fromEntries(["hasAggs", "hasWindowFuncs", "hasTargetSRFs", "hasDistinctOn", "hasRecursive", "hasModifyingCTE", "hasForUpdate",
    "hasRowSecurity", "isReturn", "groupDistinct"].map(k => [k,"false"])), resultRelation: 0, mergeTargetRelation: 0, override: 0, limitOption: 0 });
const sublink = (oid) => ({ tag: "SUBLINK", subLinkType: 0, subLinkId: 0, testexpr: "<>", operName: "<>", subselect: query(oid) });
const inspect = (n, c = catalog()) => inspectPredicateTree(tree(n), c.operatorFunctions, c);
function report(n, kind = "using", c = catalog(), functions = [500,501,502,503,504].map(fn)) {
  c.policies[0][`${kind}Expression`] = "synthetic predicate"; c.policies[0][`${kind}Tree`] = tree(n);
  return buildBrowserReport(c, functions);
}
for (const kind of ["using", "withCheck"]) {
  test(`${kind}: real-shape COALESCE walks jwt operator, uid cast and all I/O functions`, () => {
    const r = report(coalesce(),kind); assert.equal(r.classification,COMPLETE);
    assert.deepEqual(r.additionalRuntimePolicies[0].resolvedFunctionOids,[500,501,502,503,504]);
  });
  test(`${kind}: nested COALESCE preserves all children`, () => assert.deepEqual(inspect({ tag:"COALESCEEXPR",coalescetype:301,args:[coalesce(),constant] }).functionOids,[500,501,502,503,504]));
  for (const bad of [{tag:"UNOBSERVED"}, {tag:"FUNCEXPR"}, {tag:"OPEXPR"}, {tag:"SUBLINK"}])
    test(`${kind}: COALESCE unknown child ${bad.tag} propagates`, () => {
      const n=coalesce();n.args.push(bad);const r=report(n,kind);assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicies[0].resolvedFunctionOids,null);
    });
  for (const field of ["args","coalescetype"]) test(`${kind}: COALESCE missing ${field}`,()=>{const n=coalesce();delete n[field];assert.equal(report(n,kind).classification,"UNKNOWN");});
  test(`${kind}: COERCE records exact source output and target input`,()=>{
    const r=report(coerce(),kind), d=r.additionalRuntimePolicies[0][`${kind}DependencyEvidence`].typeIoDependencies[0];
    assert.equal(r.classification,COMPLETE);assert.equal(d.sourceOutputFunctionOid,501);assert.equal(d.targetInputFunctionOid,502);
    assert.deepEqual(r.additionalRuntimePolicies[0].resolvedFunctionOids,[500,501,502]);
  });
  for (const [row,key] of [[0,"typoutput"],[1,"typinput"]]) for (const mode of ["missing","zero","malformed"])
    test(`${kind}: COERCE ${key} ${mode} remains UNKNOWN`,()=>{const c=catalog();if(mode==="missing")delete c.policyTypeIoCatalog[row][key];else c.policyTypeIoCatalog[row][key]=mode==="zero"?0:"guessed";assert.equal(report(coerce(),kind,c).classification,"UNKNOWN");});
  for (const mode of ["absent","ambiguous","unknown child"]) test(`${kind}: COERCE ${mode}`,()=>{
    const c=catalog(),n=coerce();if(mode==="absent")delete c.policyTypeIoCatalog;else if(mode==="ambiguous")c.policyTypeIoCatalog.push(c.policyTypeIoCatalog[0]);else n.arg={tag:"UNOBSERVED"};
    const r=report(n,kind,c);assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicies[0].resolvedFunctionOids,null);
  });
  test(`${kind}: SUBLINK SELECT relation, bitmap columns and caller identity`,()=>{
    const c=catalog(),t=c.tables.find(t=>t.table==="institutions"),r=report(sublink(t.oid),kind,c),d=r.additionalRuntimePolicies[0].relationDependencies[0];
    assert.equal(r.classification,COMPLETE);assert.equal(d.table,"institutions");assert.equal(d.requiredPerms,2);assert.deepEqual(d.resolvedPrivileges,["SELECT"]);
    assert.deepEqual(d.selectedCols,["b",8]);assert.deepEqual(d.selectedColumns,[{attnum:1,column:"id",scope:"COLUMN"}]);assert.equal(d.executionRole,"POLICY_CALLER");
  });
  test(`${kind}: SUBLINK functions/operators/COALESCE and nested EXISTS`,()=>{
    const c=catalog(),n=sublink(c.tables.find(t=>t.table==="institutions").oid),nested=sublink(c.tables.find(t=>t.table==="institution_memberships").oid);
    n.subselect.hasSubLinks="true";n.subselect.jointree.quals={tag:"BOOLEXPR",boolop:"and",args:[coalesce(),nested]};
    const r=report(n,kind,c);assert.equal(r.classification,COMPLETE);assert.equal(r.additionalRuntimePolicies[0].relationDependencies.length,2);
    assert.deepEqual(r.additionalRuntimePolicies[0].resolvedFunctionOids,[500,501,502,503,504]);
  });
  for (const state of ["missing relation","ambiguous relation","missing column","bad bitmap","unknown qual","bad fromref","missing targets","unknown query field","unknown RTE","unbound permission","write query","missing jointree"])
    test(`${kind}: SUBLINK ${state} fails closed`,()=>{
      const c=catalog(),n=sublink(c.tables.find(t=>t.table==="institutions").oid),q=n.subselect;
      if(state==="missing relation")c.tables=c.tables.filter(t=>t.oid!==q.rtable[0].relid);
      if(state==="ambiguous relation")c.tables.push(c.tables.find(t=>t.oid===q.rtable[0].relid));
      if(state==="missing column")q.rteperminfos[0].selectedCols=["b",999];
      if(state==="bad bitmap")q.rteperminfos[0].selectedCols=["b","not observed"];
      if(state==="unknown qual")q.jointree.quals={tag:"UNOBSERVED"};
      if(state==="bad fromref")q.jointree.fromlist[0].rtindex=5;
      if(state==="missing targets")delete q.targetList;
      if(state==="unknown query field")q.unobserved={tag:"UNOBSERVED"};
      if(state==="unknown RTE")q.rtable[0].rtekind=1;
      if(state==="unbound permission")q.rteperminfos.push({...q.rteperminfos[0]});
      if(state==="write query")q.commandType=2;
      if(state==="missing jointree")delete q.jointree;
      const r=report(n,kind,c);assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicies[0].resolvedFunctionOids,null);
    });
  test(`${kind}: checkAsUser must resolve from captured roles`,()=>{
    const c=catalog(),n=sublink(c.tables.find(t=>t.table==="institutions").oid);c.roleAttributes.find(r=>r.name==="postgres").oid=7000;n.subselect.rteperminfos[0].checkAsUser=7000;
    assert.equal(report(n,kind,c).additionalRuntimePolicies[0].relationDependencies[0].executionRole,"postgres");
    n.subselect.rteperminfos[0].checkAsUser=7999;assert.equal(report(n,kind,c).classification,"UNKNOWN");
  });
}
test("policy-specific authenticated clips completeness survives unrelated owner UNKNOWN",()=>{
  const c=catalog(),p={...c.policies[0],oid:9999,name:"owner_unresolved",roles:["reflab_rls_owner"],usingTree:"{UNOBSERVED}"};c.policies.push(p);c.tables.find(t=>t.table==="clips").policyCount++;
  const r=buildBrowserReport(c,[]);assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicies.find(p=>p.name==="authenticated_read").dependencyComplete,true);
  assert.equal(r.clipsEvidence.roleActionEvidence.find(r=>r.role==="authenticated").status,"DEPENDENCY_EVIDENCE_COMPLETE");
});
test("ALL policy's UNKNOWN WITH CHECK does not mask complete SELECT USING",()=>{
  const c=catalog();c.policies[0].command="*";c.policies[0].withCheckExpression="unknown";c.policies[0].withCheckTree="{UNOBSERVED}";
  const r=buildBrowserReport(c,[]);assert.equal(r.classification,"UNKNOWN");assert.equal(r.clipsEvidence.roleActionEvidence.find(r=>r.role==="authenticated").status,"DEPENDENCY_EVIDENCE_COMPLETE");
  assert.equal(r.additionalRuntimePolicyRoleActionEvidence.find(r=>r.table==="clips"&&r.role==="authenticated"&&r.command==="a").status,"UNKNOWN");
});
test("institutional_leads observed empty policies stay empty, not invented",()=>{
  const c=catalog();c.policies=c.policies.filter(p=>p.table!=="institutional_leads");c.tables.find(t=>t.table==="institutional_leads").policyCount=0;
  const r=buildBrowserReport(c,[]);assert.deepEqual(r.institutionalLeadsEvidence.policies,[]);assert.equal(r.institutionalLeadsEvidence.roleActionEvidence[0].status,"OBSERVED_NO_APPLICABLE_POLICY");
});
test("new function identity must be observed, not inferred from tree OIDs",()=>{
  const r=report(coalesce(),"using",catalog(),[500,501,502,504].map(fn));assert.equal(r.classification,"UNKNOWN");assert.deepEqual(r.additionalRuntimePolicies[0].missingFunctionOids,[503]);
});
for(const value of [0,-1,"25;DROP",1.5,4294967296])test(`targeted type SQL rejects ${value}`,()=>assert.throws(()=>typeIoSql([value])));
test("type SQL is targeted pg_type metadata, not extension or generic dump",()=>{
  const sql=typeIoSql([301,300]);assert.match(sql,/where t.oid in \(300,301\)/);assert.equal(/pgcrypto|md5|create |grant /i.test(sql),false);
});
test("local reprocessor never invents missing type catalog",()=>{
  const c=catalog(),r=report(coerce(),"using",c),archive={...r,transaction:"ROLLBACK",mutationCount:0,ddlCount:0,dmlCount:0,migrationInvocationCount:0};
  delete archive.additionalRuntimePolicyTypeIoCatalog;
  const bytes=Buffer.from("\uFEFF\r\n> npm fixture\r\n"+JSON.stringify(archive),"utf16le");
  const parsed=parseSavedBrowserForensic(bytes),before=JSON.stringify(parsed),again=reprocessBrowserForensic(parsed);
  assert.equal(again.classification,"UNKNOWN");assert.equal(again.localReprocessing.typeCatalogObservation,"NOT_CAPTURED");assert.equal(JSON.stringify(parsed),before);
});
test("local reprocessor remains COMPLETE when archived evidence really suffices",()=>{
  const r=report(coalesce()),archive={...r,transaction:"ROLLBACK",mutationCount:0,ddlCount:0,dmlCount:0,migrationInvocationCount:0};
  assert.equal(reprocessBrowserForensic(archive).classification,COMPLETE);
});
test("local reprocessor has no connector or Production runner import",()=>assert.equal(/createSession|runProductionBrowserForensic|from.*run-production/.test(readFileSync(new URL("./reprocess-additional-browser-forensic.mjs",import.meta.url),"utf8")),false));
test("prior supported complete function and constant predicates remain complete",()=>{
  assert.deepEqual(inspectPredicateTree(functionPredicateTree(500)).functionOids,[500]);assert.deepEqual(inspectPredicateTree(BOOLEAN_CONST_TREE).functionOids,[]);
});
test("offline operator ambiguity remains observable, never omitted because resolution failed",()=>{
  const c=catalog();c.operatorFunctions.push({...c.operatorFunctions[0]});const r=report(coalesce(),"using",c);
  assert.equal(r.classification,"UNKNOWN");assert.equal(r.additionalRuntimePolicyOperatorFunctions.length,2);
  const archive={...r,transaction:"ROLLBACK",mutationCount:0,ddlCount:0,dmlCount:0,migrationInvocationCount:0};
  assert.equal(reprocessBrowserForensic(archive).classification,"UNKNOWN");
});
test("missing nested function metadata cannot disappear during offline reprocessing",()=>{
  const functions=[500,501,502,503,504].map(fn);functions[0].catalogDependencies=[{catalog:"pg_proc",oid:599}];
  const r=report(coalesce(),"using",catalog(),functions),archive={...r,transaction:"ROLLBACK",mutationCount:0,ddlCount:0,dmlCount:0,migrationInvocationCount:0};
  const again=reprocessBrowserForensic(archive);assert.equal(again.classification,"UNKNOWN");assert.ok(again.localReprocessing.missingFunctionOids.includes(599));
});
