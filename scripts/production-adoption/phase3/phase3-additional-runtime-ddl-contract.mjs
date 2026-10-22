import { exactServiceRows } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { additionalMatrix, additionalAccounting, ADDITIONAL_SERVICE_TABLES } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { additionalPreserved } from "./phase3-additional-runtime-service-role-contract.mjs";
import { verifyAdditionalMigration } from "./phase3-additional-runtime-service-role-migration-source.mjs";
import { ADDITIONAL_MIGRATION_SHA, hashBytes, failHarness } from "./phase3-additional-runtime-pre-contract.mjs";

export const DDL_FORMAT = "REFLAB_ADDITIONAL_RUNTIME_SERVICE_ROLE_ISOLATED_PRODUCTION_EXECUTION_V1";
export const DDL_BEGIN = `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local idle_in_transaction_session_timeout='15s';
set local transaction_timeout='180s';
lock table ${ADDITIONAL_SERVICE_TABLES.map((t) => `public.${t}`).join(", ")} in access exclusive mode;`;
export const ZERO_ACCOUNTING = Object.freeze(Object.fromEntries(["effectivePrivilegeEntryRevocations", "effectivePrivilegeEntryGrants",
  "sqlRevokeStatements", "sqlGrantStatements", "primary13Mutations", "anonMutations", "authenticatedMutations", "postgresMutations",
  "publicMutations", "rlsOwnerMutations", "preflightRoleMutations", "columnAclMutations", "policyMutations", "functionMutations",
  "executeMutations", "ownerMutations", "roleMembershipMutations", "roleAttributeMutations", "rlsMutations", "forceMutations",
  "schemaMutations", "indexMutations", "constraintMutations", "triggerMutations", "productDml", "adoptionDml", "runtimeMutations",
  "cutoverMutations", "phase4Mutations", "64253Mutations"].map((key) => [key, 0])));
export function extractAdditionalDdlBody(bytes) {
  if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== ADDITIONAL_MIGRATION_SHA) failHarness("MIGRATION_SHA_MISMATCH");
  const verified = verifyAdditionalMigration(bytes.toString("utf8"));
  return { ...verified, bodySha256: hashBytes(verified.body) };
}
export function verifyAdditionalAccounting(before, after) {
  if (!additionalPreserved(before, after)) failHarness("PROTECTED_CATALOG_CHANGED");
  const rows = (e) => e.get(SERVICE_FORENSIC_QUERY_ID)?.effectiveTablePrivileges?.filter((r) => ADDITIONAL_SERVICE_TABLES.includes(r.table));
  if (!exactServiceRows(rows(before), additionalMatrix()) || !exactServiceRows(rows(after), additionalMatrix(true))) failHarness("EFFECTIVE_DELTA_MISMATCH");
  const delta = additionalAccounting();
  if (delta.revoked.length !== 332 || delta.granted.length !== 0 || delta.unchanged.length !== 124
    || delta.sqlRevokeStatements !== 57 || delta.sqlGrantStatements !== 0) failHarness("MATRIX_ACCOUNTING_MISMATCH");
  return { ...ZERO_ACCOUNTING, effectivePrivilegeEntryRevocations: delta.revoked.length, effectivePrivilegeEntryGrants: delta.granted.length,
    unchangedCells: delta.unchanged.length, sqlRevokeStatements: delta.sqlRevokeStatements, sqlGrantStatements: delta.sqlGrantStatements };
}
