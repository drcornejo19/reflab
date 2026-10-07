import { createHash } from "node:crypto";
import { CORE_POLICY_QUERY_ID, CORE_POLICY_SHA256, CORE_POLICY_TABLES, classifyCorePolicyBatch,
  nonTargetPolicies } from "./phase3-core-policy-contract.mjs";
import { classifyIdentityBridgePostBatch } from "./phase3-identity-security-bridge-ddl-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";

export const CORE_POLICY_ATTESTATION_FORMAT = "REFLAB_20260901064245_CURRENT_PRODUCTION_PRE_ATTESTATION_V1";
// No independently reviewed Production inventory has been committed. Never approve an
// observation by comparing it with itself or with the disposable rehearsal fixture.
export const APPROVED_PRODUCTION_CORE_POLICY_BASELINE = null;
const project = "nagjddldrldwavmfaytc";
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
  { classifyIdentity = classifyIdentityBridgePostBatch, classifyCore = classifyCorePolicyBatch } = {}) {
  const evidence = results instanceof Map ? results : new Map();
  const inventory = projectInventory(evidence.get(CORE_POLICY_QUERY_ID));
  const approved = approval?.projectRef === project && approval?.migrationSha === CORE_POLICY_SHA256
    && approval?.reviewed === true && approval?.inventory != null;
  const identity = classifyIdentity(evidence);
  const core = classifyCore(evidence, approved ? approval.inventory : null);
  const runtime = evidence.get(CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID);
  const counts = runtime?.counts ?? {};
  const checks = {
    transactionReadOnly: evidence.get("read_only_guard") === "on",
    predecessorExact: identity.classification === "EXACT",
    productionBaselineApproved: approved ? true : "UNKNOWN",
    corePolicyEvidenceComplete: core.classification === "UNKNOWN" ? "UNKNOWN" : true,
    historicalCountsExact: counts.attempts === 37 && counts.exam_results === 6
      && counts.notification_events === 60 && counts.clips === 30,
    ledgerRowsExact: counts.ledger_rows === 4,
    schemaStateEmpty: counts.schema_state_rows === 0,
    canonicalMarkerAbsent: runtime?.checks?.canonicalMarkerAbsent === true,
    developmentObjectsAbsent: runtime?.checks?.developmentObjectsAbsent === true,
    ...Object.fromEntries(Object.entries(core.checks ?? {}).map(([k, v]) => [`core.${k}`, v])),
  };
  const failedChecks = Object.keys(checks).filter((key) => checks[key] === false);
  const unknownChecks = Object.keys(checks).filter((key) => checks[key] === "UNKNOWN");
  if (!approved) unknownChecks.push("PRODUCTION_BASELINE_REVIEW_REQUIRED");
  const exact = failedChecks.length === 0 && unknownChecks.length === 0;
  const classification = exact && core.classification === "EXECUTABLE_PRE" ? "64245_PRE_EXECUTABLE_EXACT"
    : exact && core.classification === "ALREADY_INSTALLED_POST" ? "64245_ALREADY_INSTALLED_POST" : "BLOCKER";
  const policies = Array.isArray(inventory?.policies) ? inventory.policies : [];
  const nonTargets = nonTargetPolicies(policies);
  const nonTargetSet = new Set(nonTargets);
  return {
    format: CORE_POLICY_ATTESTATION_FORMAT, classification, checkCount: Object.keys(checks).length,
    checks, failedChecks, unknownChecks,
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
      independentlyApproved: approved, preservationExact: core.checks?.nonTargetPoliciesPreserved ?? "UNKNOWN" },
    historicalState: { attempts: counts.attempts ?? null, examResults: counts.exam_results ?? null,
      notificationEvents: counts.notification_events ?? null, clips: counts.clips ?? null },
    baselineCandidate: inventory,
    baselineCandidateSha256: inventory ? createHash("sha256").update(JSON.stringify(inventory)).digest("hex") : null,
    PRODUCTION_64245_PRE_STATE: classification === "64245_PRE_EXECUTABLE_EXACT" ? "CURRENTLY_ATTESTED_EXECUTABLE_EXACT"
      : classification === "64245_ALREADY_INSTALLED_POST" ? "ALREADY_INSTALLED_POST" : "BLOCKER",
  };
}
