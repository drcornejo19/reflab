import { createHash } from "node:crypto";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { CORE_POLICY_PRODUCTION_BASELINE } from "./phase3-core-policy-production-baseline.mjs";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_SHA256, corePolicyQuery, nonTargetPolicies,
  preservedCorePolicies, isRetiredCorePolicy } from "./phase3-core-policy-contract.mjs";
import { identityBridgePostQueries, IDENTITY_BRIDGE_POST_QUERY_ID } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { coreBaselineAdoptionQuery, CORE_BASELINE_ADOPTION_QUERY_ID } from "./phase3-core-policy-baseline-forensic-contract.mjs";

export const CORE_POLICY_BASELINE_PATH = "scripts/production-adoption/phase3/phase3-core-policy-production-baseline.mjs";
export const CORE_POLICY_BASELINE_ARTIFACT_SHA = "c67495fe8355fe716979aa3d9af634ce7c13c89f174dd313225015fcebe0a447";
export const CORE_POLICY_BASELINE_DIGEST = "1763d5054c2b6a806c687641811fd32aff97f2d48694397e71e152869fd3e7f7";
export const CORE_POLICY_BASELINE_SHARED_SHA = "b02ab74d043fd5cc91bf99f7c28b11bfafdae6f90d522df97ada6d6037bb13bd";
export const CORE_POLICY_BASELINE_VERSION = 1;

// Arrays in this catalog snapshot represent sets. Preserve duplicates and string bytes.
export function canonicalCorePolicyBaseline(value) {
  if (Array.isArray(value)) return value.map(canonicalCorePolicyBaseline).sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonicalCorePolicyBaseline(value[key])]));
  return value;
}
export function corePolicyBaselineDigest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalCorePolicyBaseline(value))).digest("hex");
}
export const sameCorePolicyBaseline = (left, right) => left !== undefined && right !== undefined
  && JSON.stringify(canonicalCorePolicyBaseline(left)) === JSON.stringify(canonicalCorePolicyBaseline(right));
const pick = (row, fields) => Object.fromEntries(fields.map((key) => [key, row?.[key]]));

export function buildCorePolicyProductionInventory(data = CORE_POLICY_PRODUCTION_BASELINE) {
  return {
    tables: data.tables,
    policies: [...data.targetSlots.filter((slot) => slot.policy).map((slot) => slot.policy),
      ...data.legacyPolicies, ...data.preservedPolicies],
    table_acl: data.tableAcl.flatMap(({ privileges, ...grant }) => privileges.map((privilege) => ({ ...grant, privilege }))),
    column_acl: data.columnAcl,
    productFingerprint: data.historical.productFingerprint,
    protectedObjectsHash: data.historical.protectedObjectsHash,
    phase4Absent: data.adoption.phase4Absent, cutoverAbsent: data.adoption.cutoverAbsent,
    runtimeDisabled: data.adoption.runtimeDisabled,
  };
}
export function corePolicyProductionApproval(data = CORE_POLICY_PRODUCTION_BASELINE) {
  return { reviewed: true, projectRef: data.projectRef, migrationSha: data.migrationSha,
    baseline: data, digest: corePolicyBaselineDigest(data), inventory: buildCorePolicyProductionInventory(data) };
}
export const APPROVED_CORE_POLICY_PRODUCTION_BASELINE = corePolicyProductionApproval();

export function validateCorePolicyProductionApproval(approval) {
  const data = approval?.baseline;
  let expectedInventory;
  try { expectedInventory = data && buildCorePolicyProductionInventory(data); } catch { /* Incomplete artifacts fail closed. */ }
  const checks = {
    baselineArtifactPresent: data != null,
    baselineVersionExact: data?.format === "REFLAB_64245_APPROVED_PRODUCTION_BASELINE_V1"
      && data?.version === CORE_POLICY_BASELINE_VERSION,
    baselineDigestExact: data != null && corePolicyBaselineDigest(data) === CORE_POLICY_BASELINE_DIGEST
      && approval?.digest === CORE_POLICY_BASELINE_DIGEST,
    baselineMigrationExact: data?.migrationSha === CORE_POLICY_SHA256 && approval?.migrationSha === CORE_POLICY_SHA256,
    baselineSharedContractExact: data?.sharedContractSha === CORE_POLICY_BASELINE_SHARED_SHA,
    baselineProjectExact: data?.projectRef === "nagjddldrldwavmfaytc" && approval?.projectRef === data?.projectRef,
    baselineReviewed: approval?.reviewed === true,
    baselineInventoryExact: expectedInventory != null && sameCorePolicyBaseline(approval?.inventory, expectedInventory),
  };
  const failedChecks = Object.keys(checks).filter((key) => !checks[key]);
  return { classification: failedChecks.length ? "BLOCKER" : "EXACT", checks, failedChecks };
}

export function buildApprovedCorePolicyPreBatch() {
  return buildSqlBatch([...identityBridgePostQueries, corePolicyQuery, coreBaselineAdoptionQuery]);
}

export function productionCorePolicyBaselineChecks(results, approval, { installedPost = false } = {}) {
  const data = approval?.baseline;
  const payload = results.get(CORE_POLICY_QUERY_ID);
  const identity = results.get(IDENTITY_BRIDGE_POST_QUERY_ID);
  const adoption = results.get(CORE_BASELINE_ADOPTION_QUERY_ID);
  const functionFields = ["signature", "identity_arguments", "result_type", "language", "volatility", "strict",
    "security_definer", "leakproof", "kind", "owner", "configuration", "source_hash"];
  const policies = Array.isArray(payload?.policies) ? payload.policies : [];
  return {
    baselineIdentityExact: sameCorePolicyBaseline(Array.isArray(identity?.functions)
      ? identity.functions.map((row) => pick(row, functionFields)) : undefined, data?.identity?.functions)
      && sameCorePolicyBaseline(identity?.acl, data?.identity?.acl),
    baselineSchemaCreateExact: sameCorePolicyBaseline(adoption?.schemaCreatePrivileges, data?.identity?.schemaCreate),
    baselineLedgerChainExact: sameCorePolicyBaseline(Array.isArray(adoption?.ledgerRows) ? adoption.ledgerRows.map((row) =>
      pick(row, ["phase_order", "phase_key", "previous_phase_key"])) : undefined, data?.adoption?.ledgerChain),
    baselineSchemaStateEmpty: Array.isArray(adoption?.schemaStateRows) && adoption.schemaStateRows.length === 0,
    baselineAdoptionExact: data != null && adoption?.canonicalMarkerAbsent === data.adoption?.canonicalMarkerAbsent
      && ["runtimeDisabled", "cutoverAbsent", "phase4Absent"].every((key) => payload?.[key] === data.adoption?.[key]),
    baselineDevelopmentObjectsExact: sameCorePolicyBaseline(adoption?.developmentObjects, data?.adoption?.developmentObjects),
    baselineHistoricalCountsExact: sameCorePolicyBaseline(adoption?.historicalCounts, data?.historical?.counts),
    baselinePolicyTopologyExact: Array.isArray(payload?.policies) && policies.length === (installedPost ? 42 : 27)
      && preservedCorePolicies(policies).length === 20
      && policies.filter(isRetiredCorePolicy).length === (installedPost ? 0 : 3)
      && policies.length - nonTargetPolicies(policies).length === (installedPost ? 22 : 4),
    tableAclPreservationStructureExact: payload?.table_acl?.length === 301
      && payload.table_acl.every((row) => row.grantor === "postgres" && row.grantable === false && row.grantee !== "PUBLIC"),
    columnAclPreservationStructureExact: payload?.column_acl?.length === 20
      && payload.column_acl.every((row) => row.grantor === "postgres" && row.grantable === false && row.privilege === "SELECT"),
  };
}

// Used only by the disposable rehearsal to compare platform structure across different catalog OIDs/data.
export function corePolicyFixtureStructure(inventory) {
  const { productFingerprint: _product, protectedObjectsHash: _objects, ...structure } = inventory;
  void _product; void _objects;
  return { ...structure, policies: inventory.policies.map(({ oid: _oid, ...policy }) => { void _oid; return policy; }) };
}
