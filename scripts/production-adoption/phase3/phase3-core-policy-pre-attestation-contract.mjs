import { createHash } from "node:crypto";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_TABLES, classifyCorePolicyBatch,
  nonTargetPolicies, preservedCorePolicies, isRetiredCorePolicy } from "./phase3-core-policy-contract.mjs";
import { classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { APPROVED_CORE_POLICY_PRODUCTION_BASELINE, validateCorePolicyProductionApproval,
  productionCorePolicyBaselineChecks } from "./phase3-core-policy-production-baseline-contract.mjs";

export const CORE_POLICY_ATTESTATION_FORMAT = "REFLAB_20260901064245_CURRENT_PRODUCTION_PRE_ATTESTATION_V1";
// The CLI independently verifies this artifact in its clean approved committed HEAD.
export const APPROVED_PRODUCTION_CORE_POLICY_BASELINE = APPROVED_CORE_POLICY_PRODUCTION_BASELINE;
const fields = {
  tables: ["schema", "table", "owner", "rls", "force", "installer_authority"],
  table_acl: ["table", "grantee", "grantor", "privilege", "grantable"],
  column_acl: ["table", "column", "grantee", "grantor", "privilege", "grantable"],
  policies: ["oid", "schema", "table", "name", "command", "permissive", "roles", "using", "withCheck"],
};
function projectInventory(payload) {
  if (!payload || typeof payload !== "object") return null;
  const inventory = Object.fromEntries(Object.entries(fields).map(([key, names]) => [key,
    Array.isArray(payload[key]) ? payload[key].map((row) => Object.fromEntries(names.map((name) =>
      [name, row?.[name] ?? null]))) : null]));
  for (const key of ["productFingerprint", "protectedObjectsHash", "phase4Absent", "cutoverAbsent", "runtimeDisabled"])
    inventory[key] = payload[key] ?? null;
  return inventory;
}

export function classifyCorePolicyPreAttestation(results, approval = APPROVED_PRODUCTION_CORE_POLICY_BASELINE,
  { classifyIdentity = classifyIdentityBridgePostBatch, classifyCore = classifyCorePolicyBatch,
    validateApproval = validateCorePolicyProductionApproval, classifyBaseline = productionCorePolicyBaselineChecks } = {}) {
  const evidence = results instanceof Map ? results : new Map();
  const inventory = projectInventory(evidence.get(CORE_POLICY_QUERY_ID));
  const validation = validateApproval(approval);
  const approved = validation.classification === "EXACT";
  const identity = classifyIdentity(evidence);
  const core = classifyCore(evidence, approved ? approval.inventory : null);
  const runtime = evidence.get(CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID);
  const targets = (p) => {
    const nonTargets = new Set(nonTargetPolicies(p?.policies ?? []));
    return (p?.policies ?? []).filter((r) => !nonTargets.has(r)).map((r) =>
      JSON.stringify(fields.policies.map((key) => r[key]))).sort();
  };
  const counts = runtime?.counts ?? {};
  const checks = {
    transactionReadOnly: evidence.get("read_only_guard") === "on",
    predecessorExact: identity.classification === "EXACT",
    productionBaselineApproved: approved,
    ...validation.checks,
    approvedTargetInputExact: core.classification === "ALREADY_INSTALLED_POST" || approved
      && JSON.stringify(targets(inventory)) === JSON.stringify(targets(approval.inventory)),
    corePolicyEvidenceComplete: core.classification === "UNKNOWN" ? "UNKNOWN" : true,
    historicalCountsExact: counts.attempts === 37 && counts.exam_results === 6
      && counts.notification_events === 60 && counts.clips === 30,
    ledgerRowsExact: counts.ledger_rows === 4,
    schemaStateEmpty: counts.schema_state_rows === 0,
    canonicalMarkerAbsent: runtime?.checks?.canonicalMarkerAbsent === true,
    developmentObjectsAbsent: runtime?.checks?.developmentObjectsAbsent === true,
    ...classifyBaseline(evidence, approval, { installedPost: core.classification === "ALREADY_INSTALLED_POST" }),
    ...Object.fromEntries(Object.entries(core.checks ?? {}).map(([k, v]) => [`core.${k}`, v])),
  };
  const failedChecks = Object.keys(checks).filter((key) => checks[key] === false);
  const unknownChecks = Object.keys(checks).filter((key) => checks[key] === "UNKNOWN");
  const exact = failedChecks.length === 0 && unknownChecks.length === 0;
  const classification = exact && core.classification === "EXECUTABLE_PRE" ? "64245_PRE_EXECUTABLE_EXACT"
    : exact && core.classification === "ALREADY_INSTALLED_POST" ? "64245_ALREADY_INSTALLED_POST" : "BLOCKER";
  const policies = Array.isArray(inventory?.policies) ? inventory.policies : [];
  const nonTargets = nonTargetPolicies(policies);
  const nonTargetSet = new Set(nonTargets);
  return {
    format: CORE_POLICY_ATTESTATION_FORMAT, classification, executablePre: classification === "64245_PRE_EXECUTABLE_EXACT",
    checkCount: Object.keys(checks).length,
    checks, failedChecks, unknownChecks,
    baselineApproval: { status: approved ? "INTEGRATED_APPROVED_TRANSITION" : "BLOCKER",
      version: Number.isInteger(approval?.baseline?.version) ? approval.baseline.version : null,
      digest: /^[a-f0-9]{64}$/.test(approval?.digest ?? "") ? approval.digest : null,
      committedArtifactVerified: approval?.committedArtifactVerified === true },
    TABLE_ACL_BASELINE_PURPOSE: "PRESERVATION_ONLY",
    TABLE_ACL_SECURITY_STATUS: "PENDING_RECONCILIATION",
    TABLE_ACL_RECONCILIATION_STILL_REQUIRED: true,
    adoptionState: { ledgerRows: counts.ledger_rows ?? null, schemaStateRows: counts.schema_state_rows ?? null,
      finalPhaseOrder: runtime?.ledger_rows?.at(-1)?.phase_order ?? null,
      finalPhaseKey: runtime?.ledger_rows?.at(-1)?.phase_key ?? null,
      canonicalMarkerAbsent: runtime?.checks?.canonicalMarkerAbsent ?? null,
      developmentObjectsAbsent: runtime?.checks?.developmentObjectsAbsent ?? null,
      runtimeDisabled: inventory?.runtimeDisabled ?? null, cutoverAbsent: inventory?.cutoverAbsent ?? null,
      phase4Absent: inventory?.phase4Absent ?? null },
    predecessorState: { classification: identity.classification, checks: identity.checks ?? {},
      components: identity.predecessorComponents ?? {},
      failedChecks: identity.failedChecks ?? [] },
    tableSecurityState: { presence: CORE_POLICY_TABLES.map((table) => ({ table,
      exists: inventory?.tables?.some((row) => row.schema === "public" && row.table === table) ?? false })),
      tables: inventory?.tables ?? [], tableAcls: inventory?.table_acl ?? [],
      columnAcls: inventory?.column_acl ?? [] },
    targetPolicyState: { classification: core.classification, policies: policies.filter((p) => !nonTargetSet.has(p)),
      missingTargets: core.missingTargets ?? null },
    nonTargetPolicyState: { policies: nonTargets, count: nonTargets.length,
      retirementCandidates: nonTargets.filter(isRetiredCorePolicy),
      preservedPolicies: preservedCorePolicies(policies),
      independentlyApproved: approved, preservationExact: core.checks?.nonTargetPoliciesPreserved ?? "UNKNOWN" },
    historicalState: { attempts: counts.attempts ?? null, examResults: counts.exam_results ?? null,
      notificationEvents: counts.notification_events ?? null, clips: counts.clips ?? null },
    baselineCandidate: inventory,
    baselineCandidateSha256: inventory ? createHash("sha256").update(JSON.stringify(inventory)).digest("hex") : null,
    PRODUCTION_64245_PRE_STATE: classification === "64245_PRE_EXECUTABLE_EXACT" ? "CURRENTLY_ATTESTED_EXECUTABLE_EXACT"
      : classification === "64245_ALREADY_INSTALLED_POST" ? "ALREADY_INSTALLED_POST" : "BLOCKER",
  };
}
