import { createHash } from "node:crypto";
import { PHASE3_LEGACY_IDENTITY_HELPERS } from "../phase3/phase3-security-contract.mjs";
import { PHASE4B_WAVE2_DRIFT_DECISIONS } from "./phase4b-wave2-contract.mjs";
import { PHASE4B_WAVE3_LEGACY_VALIDATORS } from "./phase4b-wave3-contract.mjs";
import { PHASE4B_WAVE4_UNIQUES } from "./phase4b-wave4-contract.mjs";
import { PHASE4B_WAVE5_CHECKS, PHASE4B_WAVE5_FOREIGN_KEYS } from "./phase4b-wave5-contract.mjs";

export const PRE_CUTOVER_EVIDENCE_FORMAT = "REFLAB_PRE_CUTOVER_PRODUCTION_EVIDENCE_V1";
export const PRE_CUTOVER_BOUNDARY_SIGNATURE = "reflab_audit.pre_cutover_evidence_snapshot_v1()";
export const PRE_CUTOVER_BOUNDARY_OWNER = "reflab_pre_cutover_evidence_owner";
export const PRE_CUTOVER_POLICY_NAME = "reflab_pre_cutover_evidence_owner_read";
export const PRE_CUTOVER_CLASSIFICATION = "ADOPTION_TEMPORARY";

export const PRE_CUTOVER_DOMAIN_COUNTS = Object.freeze({
  UNIQUE: 13,
  CHECK: 268,
  FK: 124,
  NULLABILITY: 2,
  INDEX_DRIFT: 11,
  LEGACY_VALIDATOR: 6,
  LEGACY_CALLER_TARGET: 5,
  PRIVILEGE_EDGE: 13,
});

const locallyReconciledChecks = new Set([
  "public.appointments.appointments_sport_type_check",
  "public.attempts.attempts_canonical_payload_hash_check",
  "public.attempts.attempts_source_reference_check",
  "public.attempts.attempts_source_type_check",
  "public.clips.clips_mode_check",
  "public.institution_assessment_assignments.institution_assessment_assignments_status_check",
  "public.institution_assessments.institution_assessments_sport_type_check",
  "public.institution_assessments.institution_assessments_status_check",
  "public.institution_cohorts.institution_cohorts_status_check",
  "public.institution_contents.institution_contents_sport_type_check",
  "public.institution_contents.institution_contents_status_check",
  "public.institution_group_memberships.institution_group_memberships_status_check",
  "public.institution_groups.institution_groups_sport_type_check",
  "public.institution_groups.institution_groups_status_check",
  "public.institution_notification_campaigns.institution_notification_campaigns_status_check",
  "public.institutional_clips.institutional_clips_sport_type_check",
  "public.institutional_clips.institutional_clips_status_check",
  "public.psychology_modules.psychology_modules_sort_order_check",
  "public.referee_exam_sessions.referee_exam_sessions_activity_type_check",
  "public.referee_exam_sessions.referee_exam_sessions_context_check",
  "public.referee_exam_sessions.referee_exam_sessions_context_type_check",
  "public.referee_exam_sessions.referee_exam_sessions_expiry_check",
  "public.referee_exam_sessions.referee_exam_sessions_item_count_check",
  "public.referee_exam_sessions.referee_exam_sessions_item_count_range_check",
  "public.referee_exam_sessions.referee_exam_sessions_item_manifest_check",
  "public.referee_exam_sessions.referee_exam_sessions_manifest_hash_check",
  "public.referee_exam_sessions.referee_exam_sessions_sport_type_check",
  "public.referee_exam_sessions.referee_exam_sessions_status_check",
  "reflab_meta.reflab_schema_state.reflab_schema_state_environment_check",
  "reflab_meta.reflab_schema_state.reflab_schema_state_installation_status_check",
  "reflab_meta.reflab_schema_state.reflab_schema_state_manifest_hash_check",
  "reflab_meta.reflab_schema_state.reflab_schema_state_schema_version_check",
  "reflab_meta.reflab_schema_state.reflab_schema_state_sql_checksum_check",
]);
const evidenceChecks = PHASE4B_WAVE5_CHECKS.filter((entry) => !locallyReconciledChecks.has(entry.stableIdentity));
const locallyReconciledForeignKeys = new Set([
  "public.attempts.attempts_assessment_session_fk",
  "public.exam_results.exam_results_session_fk",
  "public.referee_exam_sessions.referee_exam_sessions_assessment_session_fk",
  "public.referee_exam_sessions.referee_exam_sessions_group_fk",
  "public.referee_exam_sessions.referee_exam_sessions_institution_fk",
]);
const evidenceForeignKeys = PHASE4B_WAVE5_FOREIGN_KEYS.filter((entry) => !locallyReconciledForeignKeys.has(entry.identity));

const callerTargets = Object.freeze([
  ...PHASE3_LEGACY_IDENTITY_HELPERS.map((entry) => ({ signature: entry.signature, classification: entry.decision })),
  { signature: "public.platform_is_super_admin()", classification: "LEGACY_REQUIRED_TEMPORARILY" },
  { signature: "public.institution_is_super_admin()", classification: "LEGACY_REQUIRED_TEMPORARILY" },
]);

export const PRE_CUTOVER_PRIVILEGE_EDGES = Object.freeze([
  ["authenticated", "TABLE", "public.user_profiles", "INSERT"],
  ["authenticated", "TABLE", "public.user_profiles", "UPDATE"],
  ["authenticated", "TABLE", "public.attempts", "INSERT"],
  ["authenticated", "TABLE", "public.exam_results", "INSERT"],
  ["authenticated", "TABLE", "public.rules_exam_results", "INSERT"],
  ...PHASE3_LEGACY_IDENTITY_HELPERS.flatMap((entry) => entry.executeRoles.map((role) => [role, "FUNCTION", entry.signature, "EXECUTE"])),
  ["PUBLIC", "FUNCTION", "public.platform_is_super_admin()", "EXECUTE"],
  ["PUBLIC", "FUNCTION", "public.institution_is_super_admin()", "EXECUTE"],
].map(([role, objectType, object, privilege]) => Object.freeze({ role, objectType, object, privilege })));

function itemId(domain, ordinal) {
  return `PCE_${domain}_${String(ordinal + 1).padStart(3, "0")}`;
}

function baseItem(domain, ordinal, object, reason, queryKind, visibilityMethod, classificationEffect) {
  return Object.freeze({
    id: itemId(domain, ordinal), domain, object, reason, queryKind, visibilityMethod,
    requiredBefore: "PRODUCTION_CUTOVER", piiRisk: "NONE_AGGREGATED_OR_CATALOG_ONLY", classificationEffect,
  });
}

const uniqueItems = PHASE4B_WAVE4_UNIQUES.map((entry, ordinal) => Object.freeze({
  ...baseItem("UNIQUE", ordinal, entry.identity, "Confirm uniqueness metadata and aggregate duplicate safety.",
    "CATALOG_AND_AGGREGATE", entry.classification === "EQUIVALENT_REUSE" ? "DIRECT_PREFLIGHT_ROLE" : "TEMPORARY_SECURITY_BOUNDARY",
    "PASS_DOES_NOT_AUTHORIZE_DDL"),
  contract: entry,
  requiresAggregate: entry.classification !== "EQUIVALENT_REUSE",
}));

const checkItems = evidenceChecks.map((entry, ordinal) => Object.freeze({
  ...baseItem("CHECK", ordinal, entry.stableIdentity, "Resolve the effective canonical CHECK against Production catalog and aggregate violations.",
    "CATALOG_AND_AGGREGATE", "TEMPORARY_SECURITY_BOUNDARY", "PRESENT_DRIFT_OR_AUTHORITATIVE_VIOLATIONS_BLOCK"),
  contract: entry, requiresAggregate: true,
  aggregateFacet: entry.stableIdentity === "public.notification_events.notification_events_status_check"
    ? "VIOLATION_COUNT_AND_APPROVED_STATUS_DISTRIBUTION" : "VIOLATION_COUNT",
}));

const foreignKeyItems = evidenceForeignKeys.map((entry, ordinal) => Object.freeze({
  ...baseItem("FK", ordinal, entry.stableIdentity, "Resolve the effective canonical FK contract and aggregate orphan count.",
    "CATALOG_AND_AGGREGATE", "TEMPORARY_SECURITY_BOUNDARY", "PRESENT_DRIFT_OR_AUTHORITATIVE_ORPHANS_BLOCK"),
  contract: entry, requiresAggregate: true,
}));

const nullabilityContracts = Object.freeze([
  { schema: "public", table: "exam_results", column: "payload_hash" },
  { schema: "public", table: "exam_results", column: "exam_session_id" },
]);
const nullabilityItems = nullabilityContracts.map((entry, ordinal) => Object.freeze({
  ...baseItem("NULLABILITY", ordinal, `${entry.schema}.${entry.table}.${entry.column}`, "Measure the remaining nullable cutover population.",
    "AGGREGATE", "TEMPORARY_SECURITY_BOUNDARY", "NONZERO_NULL_COUNT_REMAINS_CUTOVER_DEBT"),
  contract: entry, requiresAggregate: true,
}));

const indexItems = PHASE4B_WAVE2_DRIFT_DECISIONS.map((entry, ordinal) => Object.freeze({
  ...baseItem("INDEX_DRIFT", ordinal, `${entry.table}.${entry.name}`, "Confirm reviewed Production index semantics without DDL.",
    "CATALOG", "DIRECT_PREFLIGHT_ROLE", "DRIFT_CLASSIFICATION_ONLY"), contract: entry, requiresAggregate: false,
}));

const validatorItems = PHASE4B_WAVE3_LEGACY_VALIDATORS.map((entry, ordinal) => Object.freeze({
  ...baseItem("LEGACY_VALIDATOR", ordinal, `${entry.schema}.${entry.table}.${entry.historicalName}`,
    "Confirm the reviewed legacy validator trigger and function contract.", "CATALOG", "DIRECT_PREFLIGHT_ROLE",
    "DRIFT_BLOCKS_CUTOVER_PLANNING"), contract: entry, requiresAggregate: false,
}));

const callerItems = callerTargets.map((entry, ordinal) => Object.freeze({
  ...baseItem("LEGACY_CALLER_TARGET", ordinal, entry.signature, "Inventory privileged catalog callers before wrapper cleanup.",
    "CATALOG", "DIRECT_PREFLIGHT_ROLE", "NONZERO_CALLERS_BLOCK_WRAPPER_TEARDOWN"), contract: entry, requiresAggregate: false,
}));

const privilegeItems = PRE_CUTOVER_PRIVILEGE_EDGES.map((entry, ordinal) => Object.freeze({
  ...baseItem("PRIVILEGE_EDGE", ordinal, `${entry.role}:${entry.privilege}:${entry.object}`,
    "Confirm an explicitly reviewed temporary privilege edge.", "CATALOG", "DIRECT_PREFLIGHT_ROLE",
    "PRESENT_EDGE_REMAINS_CUTOVER_DEBT"), contract: entry, requiresAggregate: false,
}));

export const PRE_CUTOVER_EVIDENCE_ITEMS = Object.freeze([
  ...uniqueItems, ...checkItems, ...foreignKeyItems, ...nullabilityItems,
  ...indexItems, ...validatorItems, ...callerItems, ...privilegeItems,
]);

export const PRE_CUTOVER_AGGREGATE_ITEMS = Object.freeze(PRE_CUTOVER_EVIDENCE_ITEMS.filter((entry) => entry.requiresAggregate));

export function evidenceContractHash(items = PRE_CUTOVER_EVIDENCE_ITEMS) {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

export function requiredColumnGrants(items = PRE_CUTOVER_AGGREGATE_ITEMS) {
  const tables = new Map();
  const add = (schema, table, columns) => {
    const key = `${schema}.${table}`;
    const set = tables.get(key) ?? new Set();
    for (const column of columns) set.add(column);
    tables.set(key, set);
  };
  for (const item of items) {
    const { domain, contract } = item;
    if (domain === "UNIQUE") add(contract.schema, contract.table, contract.columns);
    if (domain === "CHECK") add(contract.schema, contract.table, contract.referencedColumns);
    if (domain === "FK") {
      add(contract.schema, contract.table, contract.sourceColumns);
      add(contract.targetSchema, contract.targetTable, contract.targetColumns);
    }
    if (domain === "NULLABILITY") add(contract.schema, contract.table, [contract.column]);
  }
  add("public", "notification_events", ["status"]);
  return Object.freeze([...tables].sort(([left], [right]) => left.localeCompare(right)).map(([table, columns]) => Object.freeze({
    table, schema: table.split(".")[0], relation: table.split(".")[1], columns: Object.freeze([...columns].sort()),
  })));
}

export function assertPreCutoverEvidenceContract(items = PRE_CUTOVER_EVIDENCE_ITEMS) {
  const counts = Object.fromEntries(Object.keys(PRE_CUTOVER_DOMAIN_COUNTS).map((domain) => [domain, 0]));
  for (const item of items) {
    if (!(item.domain in counts)) throw new Error(`Unknown evidence domain: ${item.domain}`);
    counts[item.domain] += 1;
  }
  if (items.length !== 442 || new Set(items.map((entry) => entry.id)).size !== 442) {
    throw new Error("Pre-cutover evidence item cardinality must be exactly 442 with unique IDs.");
  }
  for (const [domain, expected] of Object.entries(PRE_CUTOVER_DOMAIN_COUNTS)) {
    if (counts[domain] !== expected) throw new Error(`Pre-cutover ${domain} cardinality must be ${expected}, observed ${counts[domain]}.`);
  }
  if (PRE_CUTOVER_AGGREGATE_ITEMS.length !== 405) throw new Error("Pre-cutover aggregate mapping must contain exactly 405 evidence items.");
  if (requiredColumnGrants().some((entry) => entry.columns.length === 0)) throw new Error("Empty pre-cutover column grant contract.");
  return true;
}

assertPreCutoverEvidenceContract();
