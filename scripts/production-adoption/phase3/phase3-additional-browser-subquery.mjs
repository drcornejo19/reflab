// PG17 sysattr.h: bitmap members encode attnum - FirstLowInvalidHeapAttributeNumber (-7).
export const COLUMN_BITMAP_OFFSET = 7;
export const RELATION_PRIVILEGE_BITS = [[1, "INSERT"], [2, "SELECT"], [4, "UPDATE"], [8, "DELETE"],
  [16, "TRUNCATE"], [32, "REFERENCES"], [64, "TRIGGER"], [16384, "MAINTAIN"]];
export const observedOid = (value) => {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(n) && n > 0 && n <= 4294967295 ? n : null;
};
const node = (n, tag) => n && typeof n === "object" && !Array.isArray(n) && n.tag === tag;
const list = (value) => value === "<>" ? [] : Array.isArray(value) ? value : null;
const bool = (v) => ["true", "false"].includes(v);
const bitmap = (v) => Array.isArray(v) && v[0] === "b" && v.slice(1).every((n) => Number.isSafeInteger(n) && n >= 0)
  && new Set(v.slice(1)).size === v.length - 1;
const exactKeys = (n, keys) => Object.keys(n).every((k) => keys.includes(k));

export function expressionTypeOid(n) {
  const field = { CONST: "consttype", VAR: "vartype", FUNCEXPR: "funcresulttype", OPEXPR: "opresulttype",
    ARRAYEXPR: "array_typeid", COALESCEEXPR: "coalescetype", COERCEVIAIO: "resulttype" }[n?.tag];
  return field ? observedOid(n[field]) : null;
}

export function resolveTypeIo(n, catalog, unknown, functions, requiredTypes) {
  const sourceTypeOid = expressionTypeOid(n.arg), targetTypeOid = observedOid(n.resulttype);
  const result = { sourceTypeOid, targetTypeOid, sourceType: null, targetType: null,
    sourceOutputFunctionOid: null, targetInputFunctionOid: null, resolutionBasis: "PG_TYPE_TYPOUTPUT_TYPINPUT" };
  for (const [side, oid, field, resultKey] of [["source", sourceTypeOid, "typoutput", "sourceOutputFunctionOid"],
    ["target", targetTypeOid, "typinput", "targetInputFunctionOid"]]) {
    if (!oid) { unknown("COERCEVIAIO", `${side.toUpperCase()}_TYPE_IDENTITY_MISSING`); continue; }
    requiredTypes.add(oid);
    const rows = (catalog.policyTypeIoCatalog ?? []).filter((t) => observedOid(t.oid) === oid);
    if (rows.length !== 1 || typeof rows[0].schema !== "string" || !rows[0].schema
      || typeof rows[0].name !== "string" || !rows[0].name || !observedOid(rows[0][field])) {
      unknown("COERCEVIAIO", `${side.toUpperCase()}_TYPE_IO_EVIDENCE_MISSING_${oid}`); continue;
    }
    result[`${side}Type`] = rows[0]; result[resultKey] = observedOid(rows[0][field]); functions.add(result[resultKey]);
  }
  return result;
}

const emptyQueryFields = ["utilityStmt", "cteList", "mergeActionList", "mergeJoinCondition", "onConflict", "returningList",
  "groupClause", "groupingSets", "havingQual", "windowClause", "distinctClause", "sortClause", "limitOffset", "limitCount",
  "rowMarks", "setOperations", "constraintDeps", "withCheckOptions"];
const falseQueryFields = ["hasAggs", "hasWindowFuncs", "hasTargetSRFs", "hasDistinctOn", "hasRecursive", "hasModifyingCTE",
  "hasForUpdate", "hasRowSecurity", "isReturn", "groupDistinct"];
const zeroQueryFields = ["resultRelation", "mergeTargetRelation", "override", "limitOption"];
export const SUBQUERY_NODE_FIELDS = Object.freeze({
  SUBLINK: ["tag", "subLinkType", "subLinkId", "testexpr", "operName", "subselect", "location"],
  QUERY: ["tag", "commandType", "querySource", "canSetTag", "hasSubLinks", "rtable", "rteperminfos", "jointree", "targetList",
    "stmt_location", "stmt_len", ...emptyQueryFields, ...falseQueryFields, ...zeroQueryFields],
  RANGETBLENTRY: ["tag", "alias", "eref", "rtekind", "relid", "inh", "relkind", "rellockmode", "perminfoindex",
    "tablesample", "lateral", "inFromCl", "securityQuals"],
  RTEPERMISSIONINFO: ["tag", "relid", "inh", "requiredPerms", "checkAsUser", "selectedCols", "insertedCols", "updatedCols"],
  FROMEXPR: ["tag", "fromlist", "quals"], RANGETBLREF: ["tag", "rtindex"],
  TARGETENTRY: ["tag", "expr", "resno", "resname", "ressortgroupref", "resorigtbl", "resorigcol", "resjunk"],
  ALIAS: ["tag", "aliasname", "colnames"],
});

export function inspectSublink(n, catalog, walk, unknown, relations, subqueries) {
  if (!node(n, "SUBLINK") || !exactKeys(n, SUBQUERY_NODE_FIELDS.SUBLINK) || n.subLinkType !== 0
    || n.subLinkId !== 0 || n.testexpr !== "<>" || n.operName !== "<>") {
    unknown("SUBLINK", "UNSUPPORTED_OR_INCOMPLETE_STRUCTURE"); return;
  }
  const q = n.subselect, queryIndex = subqueries.length;
  subqueries.push({ queryIndex, subLinkType: n.subLinkType, subLinkId: n.subLinkId, basis: "PG17_EXISTS_SUBLINK" });
  if (!node(q, "QUERY") || !exactKeys(q, SUBQUERY_NODE_FIELDS.QUERY) || q.commandType !== 1 || !bool(q.hasSubLinks)
    || !bool(q.canSetTag) || !Number.isInteger(q.querySource) || !Number.isInteger(q.stmt_location) || !Number.isInteger(q.stmt_len)
    || emptyQueryFields.some((k) => q[k] !== "<>") || falseQueryFields.some((k) => q[k] !== "false")
    || zeroQueryFields.some((k) => q[k] !== 0) || !Array.isArray(q.targetList) || !q.targetList.length) {
    unknown("QUERY", "UNSUPPORTED_OR_INCOMPLETE_STRUCTURE"); return;
  }
  const rtable = list(q.rtable), permissions = list(q.rteperminfos);
  if (!rtable || !permissions) { unknown("QUERY", "RELATION_COLLECTION_MISSING"); return; }
  const usedPermissions = new Set();
  const aliasValid = (a) => a === "<>" || (node(a, "ALIAS") && exactKeys(a, SUBQUERY_NODE_FIELDS.ALIAS)
    && typeof a.aliasname === "string" && list(a.colnames)?.every((c) => typeof c === "string"));
  for (const [index, rte] of rtable.entries()) {
    if (!node(rte, "RANGETBLENTRY") || !exactKeys(rte, SUBQUERY_NODE_FIELDS.RANGETBLENTRY) || rte.rtekind !== 0
      || !observedOid(rte.relid) || !["r", "p"].includes(rte.relkind) || !bool(rte.inh) || !bool(rte.lateral)
      || !bool(rte.inFromCl) || !Number.isInteger(rte.rellockmode) || rte.rellockmode <= 0
      || rte.tablesample !== "<>" || rte.securityQuals !== "<>" || !aliasValid(rte.alias) || !aliasValid(rte.eref)
      || !Number.isInteger(rte.perminfoindex) || rte.perminfoindex < 1 || rte.perminfoindex > permissions.length) {
      unknown("RANGETBLENTRY", "UNSUPPORTED_OR_INCOMPLETE_STRUCTURE"); continue;
    }
    const p = permissions[rte.perminfoindex - 1];
    if (usedPermissions.has(rte.perminfoindex)) unknown("QUERY", "DUPLICATE_PERMISSION_BINDING");
    usedPermissions.add(rte.perminfoindex);
    if (!node(p, "RTEPERMISSIONINFO") || !exactKeys(p, SUBQUERY_NODE_FIELDS.RTEPERMISSIONINFO)
      || p.relid !== rte.relid || !bool(p.inh) || !Number.isSafeInteger(p.requiredPerms) || p.requiredPerms < 0
      || p.requiredPerms > 4294967295 || !Number.isSafeInteger(p.checkAsUser) || p.checkAsUser < 0
      || ![p.selectedCols, p.insertedCols, p.updatedCols].every(bitmap)) {
      unknown("RTEPERMISSIONINFO", "STRUCTURE_INCOMPLETE"); continue;
    }
    const candidates = (catalog.tables ?? []).filter((t) => observedOid(t.oid) === rte.relid);
    const relation = candidates.length === 1 && typeof candidates[0].schema === "string" && typeof candidates[0].table === "string"
      ? candidates[0] : null;
    if (!relation) unknown("SUBLINK", `RELATION_IDENTITY_UNRESOLVED_${rte.relid}`);
    const roleRows = (catalog.roleAttributes ?? []).filter((r) => observedOid(r.oid) === p.checkAsUser);
    const executionRole = p.checkAsUser === 0 ? "POLICY_CALLER" : roleRows.length === 1 ? roleRows[0].name : null;
    if (!executionRole) unknown("SUBLINK", `CHECK_AS_USER_UNRESOLVED_${p.checkAsUser}`);
    const allowedBits = RELATION_PRIVILEGE_BITS.reduce((bits, [mask]) => bits | mask, 0);
    if (p.requiredPerms & ~allowedBits) unknown("SUBLINK", "UNMODELED_RELATION_PRIVILEGE");
    const dependency = { queryIndex, rangeTableIndex: index + 1, permissionIndex: rte.perminfoindex,
      relationOid: rte.relid, schema: relation?.schema ?? null, table: relation?.table ?? null,
      requiredPerms: p.requiredPerms, resolvedPrivileges: RELATION_PRIVILEGE_BITS.filter(([mask]) => p.requiredPerms & mask).map(([, priv]) => priv),
      selectedCols: p.selectedCols, insertedCols: p.insertedCols, updatedCols: p.updatedCols,
      checkAsUser: p.checkAsUser, executionRole, resolutionBasis: "PG17_RTEPERMISSIONINFO_AND_OBSERVED_RELATION_COLUMNS" };
    for (const [raw, decoded] of [["selectedCols", "selectedColumns"], ["insertedCols", "insertedColumns"], ["updatedCols", "updatedColumns"]]) {
      dependency[decoded] = p[raw].slice(1).map((bit) => {
        const attnum = bit - COLUMN_BITMAP_OFFSET;
        if (attnum === 0) return { attnum, column: null, scope: "WHOLE_ROW" };
        const columns = relation ? (catalog.columns ?? []).filter((c) => c.schema === relation.schema && c.table === relation.table && c.attnum === attnum) : [];
        if (columns.length !== 1) { unknown("SUBLINK", `COLUMN_IDENTITY_UNRESOLVED_${rte.relid}_${attnum}`); return { attnum, column: null, scope: "UNKNOWN" }; }
        return { attnum, column: columns[0].column, scope: "COLUMN" };
      });
    }
    relations.push(dependency);
  }
  if (usedPermissions.size !== permissions.length) unknown("QUERY", "UNBOUND_PERMISSION_INFO");
  const jointree = q.jointree;
  if (!node(jointree, "FROMEXPR") || !exactKeys(jointree, SUBQUERY_NODE_FIELDS.FROMEXPR) || !list(jointree.fromlist)
    || !Object.hasOwn(jointree, "quals")) unknown("FROMEXPR", "STRUCTURE_INCOMPLETE");
  else {
    for (const ref of list(jointree.fromlist)) if (!node(ref, "RANGETBLREF") || !exactKeys(ref, SUBQUERY_NODE_FIELDS.RANGETBLREF)
      || !Number.isInteger(ref.rtindex) || ref.rtindex < 1 || ref.rtindex > rtable.length) unknown("RANGETBLREF", "UNRESOLVED_REFERENCE");
    if (jointree.quals !== "<>") walk(jointree.quals);
  }
  for (const entry of q.targetList) {
    if (!node(entry, "TARGETENTRY") || !exactKeys(entry, SUBQUERY_NODE_FIELDS.TARGETENTRY)
      || !Number.isInteger(entry.resno) || entry.resno < 1 || !bool(entry.resjunk) || !entry.expr) unknown("TARGETENTRY", "STRUCTURE_INCOMPLETE");
    else walk(entry.expr);
  }
}
