import {
  SEMANTIC_AUDIT_CALLER,
  SEMANTIC_AUDIT_FUNCTION,
  SEMANTIC_AUDIT_OWNER,
  SEMANTIC_AUDIT_POLICY,
  SEMANTIC_AUDIT_QUERY_ID,
  SEMANTIC_AUDIT_REPLACED_QUERY_IDS,
  SEMANTIC_AUDIT_SCHEMA,
  SEMANTIC_AUDIT_SOURCE_HASH,
  semanticAuditExpectedFields,
  semanticAuditTableColumns,
  semanticAuditTables,
} from "../production-adoption/phase2a/semantic-audit-contract.mjs";

export {
  SEMANTIC_AUDIT_FUNCTION,
  SEMANTIC_AUDIT_QUERY_ID,
  SEMANTIC_AUDIT_REPLACED_QUERY_IDS,
  SEMANTIC_AUDIT_SOURCE_HASH,
};

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function exactNumericObject(payload, fields) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload).sort();
  const expected = [...fields].sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    fields.every((field) => isNonNegativeInteger(payload[field]));
}

export function expandSemanticAuditSnapshot(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Production preflight semantic audit returned an invalid aggregate snapshot.");
  }
  const actualKeys = Object.keys(payload).sort();
  const requiredKeys = Object.keys(semanticAuditExpectedFields).sort();
  if (
    actualKeys.length !== requiredKeys.length ||
    !actualKeys.every((key, index) => key === requiredKeys[index])
  ) {
    throw new Error("Production preflight semantic audit returned an unexpected aggregate contract.");
  }
  for (const [query, fields] of Object.entries(semanticAuditExpectedFields)) {
    if (!exactNumericObject(payload[query], fields)) {
      throw new Error(`Production preflight semantic audit returned invalid metrics for ${query}.`);
    }
  }
  return new Map(Object.entries(payload));
}

const normalizedSearchPath = (value) => String(value ?? "").replace(/^search_path=/, "");

export function semanticAuditContractBlockers(results) {
  const blockers = [];
  const roleState = results.get("semantic_audit_role_security");
  const functionInventory = results.get("function_inventory") ?? [];
  const routineGrants = results.get("routine_grants") ?? [];
  const tableGrants = results.get("table_grants") ?? [];
  const schemaGrants = results.get("schema_grants") ?? [];
  const columnGrants = results.get("column_grants") ?? [];
  const policyInventory = results.get("policy_inventory") ?? [];
  const functionState = functionInventory.find((entry) => entry.signature === SEMANTIC_AUDIT_FUNCTION);

  if (!roleState?.owner) blockers.push("AUDIT_OWNER_ABSENT");
  else {
    for (const property of ["rolcanlogin", "rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolbypassrls"]) {
      if (roleState.owner[property] !== false) blockers.push(`AUDIT_OWNER_UNSAFE_${property.toUpperCase()}`);
    }
  }
  if (!roleState?.caller) blockers.push("AUDIT_CALLER_ABSENT");
  if (roleState?.caller_is_owner_member !== false) blockers.push("AUDIT_CALLER_OWNER_MEMBERSHIP");
  if (Number(roleState?.owner_membership_count ?? -1) !== 0) blockers.push("AUDIT_OWNER_ROLE_MEMBERSHIP");
  if (Number(roleState?.owner_effective_dml_count ?? -1) !== 0) blockers.push("AUDIT_OWNER_EFFECTIVE_DML");

  if (!functionState) blockers.push("AUDIT_FUNCTION_ABSENT");
  else {
    if (functionState.security !== "DEFINER") blockers.push("AUDIT_FUNCTION_NOT_DEFINER");
    if (functionState.volatility !== "STABLE") blockers.push("AUDIT_FUNCTION_VOLATILITY_DRIFT");
    if (functionState.owner !== SEMANTIC_AUDIT_OWNER) blockers.push("AUDIT_FUNCTION_OWNER_DRIFT");
    if (normalizedSearchPath(functionState.search_path) !== "pg_catalog") blockers.push("AUDIT_FUNCTION_SEARCH_PATH_DRIFT");
    if (functionState.source_hash !== SEMANTIC_AUDIT_SOURCE_HASH) blockers.push("AUDIT_FUNCTION_SOURCE_DRIFT");
  }

  const executeGrantees = routineGrants
    .filter((entry) => entry.signature === SEMANTIC_AUDIT_FUNCTION && entry.privilege === "EXECUTE")
    .map((entry) => entry.grantee)
    .sort();
  const expectedExecuteGrantees = [SEMANTIC_AUDIT_OWNER, SEMANTIC_AUDIT_CALLER].sort();
  if (
    executeGrantees.length !== expectedExecuteGrantees.length ||
    !executeGrantees.every((grantee, index) => grantee === expectedExecuteGrantees[index])
  ) blockers.push("AUDIT_FUNCTION_EXECUTE_DRIFT");

  for (const role of [SEMANTIC_AUDIT_OWNER, SEMANTIC_AUDIT_CALLER]) {
    if (!schemaGrants.some((entry) =>
      entry.schema_name === SEMANTIC_AUDIT_SCHEMA && entry.grantee === role && entry.privilege === "USAGE"
    )) blockers.push(`AUDIT_SCHEMA_USAGE_MISSING_${role.toUpperCase()}`);
  }
  if (schemaGrants.some((entry) =>
    entry.schema_name === SEMANTIC_AUDIT_SCHEMA &&
    ["PUBLIC", "anon", "authenticated", "service_role", "reflab_rls_owner"].includes(entry.grantee)
  )) blockers.push("AUDIT_SCHEMA_APPLICATION_GRANT");

  const expectedColumnGrants = new Set(Object.entries(semanticAuditTableColumns).flatMap(([table, columns]) => {
    const [schema, relation] = table.split(".");
    return columns.map((column) => `${schema}.${relation}.${column}`);
  }));
  const actualColumnGrants = new Set(columnGrants
    .filter((entry) => entry.grantee === SEMANTIC_AUDIT_OWNER && entry.privilege === "SELECT")
    .map((entry) => `${entry.schema_name}.${entry.table_name}.${entry.column_name}`));
  if (
    actualColumnGrants.size !== expectedColumnGrants.size ||
    [...expectedColumnGrants].some((entry) => !actualColumnGrants.has(entry))
  ) blockers.push("AUDIT_COLUMN_GRANT_DRIFT");
  if (tableGrants.some((entry) => entry.grantee === SEMANTIC_AUDIT_OWNER)) {
    blockers.push("AUDIT_TABLE_GRANT_DRIFT");
  }

  for (const table of semanticAuditTables) {
    const [schema, relation] = table.split(".");
    const policy = policyInventory.find((entry) =>
      entry.schema_name === schema && entry.table_name === relation && entry.policy_name === SEMANTIC_AUDIT_POLICY
    );
    if (!policy) {
      blockers.push(`AUDIT_POLICY_MISSING_${table}`);
      continue;
    }
    if (
      policy.permissive !== "PERMISSIVE" ||
      policy.cmd !== "SELECT" ||
      JSON.stringify(policy.roles) !== JSON.stringify([SEMANTIC_AUDIT_OWNER]) ||
      String(policy.using_expression).replace(/[()\s]/g, "").toLowerCase() !== "true" ||
      policy.with_check_expression !== null
    ) blockers.push(`AUDIT_POLICY_DRIFT_${table}`);
  }
  return blockers;
}

export function semanticAuditInfrastructurePresent(results) {
  const roleState = results.get("semantic_audit_role_security");
  const catalog = results.get("catalog_gate") ?? {};
  const functionInventory = results.get("function_inventory") ?? [];
  const routineGrants = results.get("routine_grants") ?? [];
  const schemaGrants = results.get("schema_grants") ?? [];
  const columnGrants = results.get("column_grants") ?? [];
  const policyInventory = results.get("policy_inventory") ?? [];
  return Boolean(
    roleState?.owner ||
    (catalog.schemas ?? []).includes(SEMANTIC_AUDIT_SCHEMA) ||
    functionInventory.some((entry) => entry.signature === SEMANTIC_AUDIT_FUNCTION) ||
    routineGrants.some((entry) => entry.signature === SEMANTIC_AUDIT_FUNCTION) ||
    schemaGrants.some((entry) => entry.schema_name === SEMANTIC_AUDIT_SCHEMA) ||
    columnGrants.some((entry) => entry.grantee === SEMANTIC_AUDIT_OWNER) ||
    policyInventory.some((entry) =>
      entry.policy_name === SEMANTIC_AUDIT_POLICY || entry.roles?.includes(SEMANTIC_AUDIT_OWNER)
    )
  );
}
