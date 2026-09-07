import {
  PRE_CUTOVER_BOUNDARY_OWNER,
  PRE_CUTOVER_BOUNDARY_SIGNATURE,
  PRE_CUTOVER_POLICY_NAME,
} from "../production-adoption/phase4/pre-cutover-evidence-contract.mjs";

export function preCutoverEvidenceInfrastructurePresent(results) {
  const roleState = results.get("pre_cutover_evidence_role_security");
  const functions = results.get("function_inventory") ?? [];
  const routineGrants = results.get("routine_grants") ?? [];
  const schemaGrants = results.get("schema_grants") ?? [];
  const columnGrants = results.get("column_grants") ?? [];
  const policies = results.get("policy_inventory") ?? [];
  return Boolean(
    roleState?.owner
    || functions.some((entry) => entry.signature === PRE_CUTOVER_BOUNDARY_SIGNATURE)
    || routineGrants.some((entry) => entry.signature === PRE_CUTOVER_BOUNDARY_SIGNATURE)
    || schemaGrants.some((entry) => entry.grantee === PRE_CUTOVER_BOUNDARY_OWNER)
    || columnGrants.some((entry) => entry.grantee === PRE_CUTOVER_BOUNDARY_OWNER)
    || policies.some((entry) => entry.policy_name === PRE_CUTOVER_POLICY_NAME || entry.roles?.includes(PRE_CUTOVER_BOUNDARY_OWNER))
  );
}
