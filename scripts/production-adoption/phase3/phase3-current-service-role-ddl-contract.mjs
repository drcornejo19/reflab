import { maskSqlCommentsAndStrings } from "../../production-preflight/sql-safety.mjs";
import { validateBrowserDdlEnvelope } from "./phase3-browser-privilege-ddl-contract.mjs";
import { SERVICE_TABLES, serviceMutationAccounting, serviceMatrix } from "./phase3-current-service-role-matrix.mjs";
import { serviceTransitionPreserved, exactServiceRows } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { CURRENT_SERVICE_SHA, hashBytes, failHarness } from "./phase3-current-service-role-pre-contract.mjs";

export const DDL_FORMAT = "REFLAB_CURRENT_SERVICE_ROLE_ISOLATED_PRODUCTION_EXECUTION_V1";
export const DDL_OPERATION = "--execute-production-current-service-role-reconciliation";
export const DDL_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_CURRENT_SERVICE_ROLE_DDL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL",
  "REFLAB_PRODUCTION_DDL_MIGRATION_SHA"]);
export const DDL_BEGIN = `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local transaction_timeout='180s';
set local idle_in_transaction_session_timeout='15s';
lock table ${[...SERVICE_TABLES].sort().map((table) => `public.${table}`).join(", ")} in access exclusive mode;`;
export const ZERO_ACCOUNTING = Object.freeze(Object.fromEntries(["effectivePrivilegeEntryRevocations", "effectivePrivilegeEntryGrants",
  "sqlRevokeStatements", "sqlGrantStatements", "anonMutations", "authenticatedMutations", "postgresMutations", "publicMutations",
  "rlsOwnerMutations", "preflightRoleMutations", "columnAclMutations", "policyMutations", "functionMutations", "executeMutations",
  "ownerMutations", "rlsMutations", "forceMutations", "schemaMutations", "indexMutations", "constraintMutations", "triggerMutations",
  "productDml", "adoptionDml", "runtimeMutations", "cutoverMutations", "phase4Mutations", "additionalRuntimeMutations"].map((key) => [key, 0])));

export function extractCurrentServiceDdlBody(bytes) {
  if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== CURRENT_SERVICE_SHA) failHarness("MIGRATION_SHA_MISMATCH");
  const source = bytes.toString("utf8"), envelope = validateBrowserDdlEnvelope(source);
  const start = "  -- BEGIN AUTHORIZED SERVICE TABLE ACL STATEMENTS\n", end = "  -- END AUTHORIZED SERVICE TABLE ACL STATEMENTS";
  const first = source.indexOf(start), last = source.indexOf(end);
  if (first < 0 || last <= first || source.indexOf(start, first + 1) >= 0 || source.indexOf(end, last + 1) >= 0)
    failHarness("MIGRATION_ACCOUNTING_MARKER_MISMATCH");
  const statements = maskSqlCommentsAndStrings(source.slice(first + start.length, last)).split(";").map((s) => s.trim()).filter(Boolean);
  if (statements.length !== 14 || statements.filter((s) => /^revoke\b/.test(s)).length !== 12
    || statements.filter((s) => /^grant\b/.test(s)).length !== 2
    || !exactServiceRows(statements, serviceMutationAccounting().statements.map((s) => s.replace(/;$/, ""))))
    failHarness("MIGRATION_STATEMENT_ACCOUNTING_MISMATCH");
  return {...envelope, bodySha256: hashBytes(envelope.body), sqlRevokeStatements: 12, sqlGrantStatements: 2};
}

export function verifyCurrentServiceAccounting(before, after) {
  if (!serviceTransitionPreserved(before, after)) failHarness("PROTECTED_CATALOG_CHANGED");
  const rows = (e) => e.get(SERVICE_FORENSIC_QUERY_ID)?.effectiveTablePrivileges?.filter((r) => SERVICE_TABLES.includes(r.table));
  if (!exactServiceRows(rows(before), serviceMatrix(false)) || !exactServiceRows(rows(after), serviceMatrix(true))) failHarness("EFFECTIVE_DELTA_MISMATCH");
  const expected = serviceMutationAccounting();
  if (expected.effectivePrivilegeEntryRevocations !== 72 || expected.effectivePrivilegeEntryGrants !== 2 || expected.unchangedCells !== 30)
    failHarness("MATRIX_ACCOUNTING_MISMATCH");
  return {...ZERO_ACCOUNTING, effectivePrivilegeEntryRevocations: expected.revoked.length,
    effectivePrivilegeEntryGrants: expected.granted.length, unchangedCells: expected.unchangedCells,
    sqlRevokeStatements: 12, sqlGrantStatements: 2};
}
