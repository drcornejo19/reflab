import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PENDING_UNIQUES } from "./phase4-structural-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const manifest = JSON.parse(readFileSync(resolve(root, "supabase", "baseline", "manifest.json"), "utf8"));

export const PHASE4B_WAVE4_PROVIDER = "202607270000_reflab_canonical_baseline.sql";
export const PHASE4B_WAVE4_GATE = "scripts/production-adoption/phase4/phase4b-wave4-gate.sql";

const reviewedNullableColumns = Object.freeze({
  "public.exam_results": Object.freeze([]),
  "public.institution_assessment_assignments": Object.freeze([]),
  "public.institution_assessment_sessions": Object.freeze([]),
  "public.institution_assessments": Object.freeze([]),
  "public.institution_cohorts": Object.freeze([]),
  "public.institution_contents": Object.freeze([]),
  "public.institution_groups": Object.freeze([]),
  "public.institution_memberships": Object.freeze([]),
  "public.institution_notification_campaigns": Object.freeze([]),
  "public.institution_roles": Object.freeze(["institution_id"]),
  "public.institution_subscriptions": Object.freeze([]),
  "public.user_profiles": Object.freeze(["ref_card_id"]),
  "public.user_subscriptions": Object.freeze([]),
});

const partialIndexes = Object.freeze({
  "public.exam_results.exam_results_user_submission_unique": Object.freeze({
    name: "exam_results_user_submission_unique",
    keys: Object.freeze(["user_id", "submission_id"]),
    predicate: "submission_id is not null",
    valueSemantics: "EXACT_EQUIVALENCE",
    structuralEquivalence: false,
  }),
  "public.user_profiles.unique(ref_card_id)": Object.freeze({
    name: "user_profiles_ref_card_id_unique",
    keys: Object.freeze(["ref_card_id"]),
    predicate: "ref_card_id is not null",
    valueSemantics: "EXACT_EQUIVALENCE",
    structuralEquivalence: false,
  }),
});

function identity(entry) {
  return `${entry.table}.${entry.name ?? `unique(${entry.columns.join(",")})`}`;
}

function sameColumns(left, right) {
  return left.length === right.length && left.every((column, index) => column === right[index]);
}

const canonicalUniques = manifest.object_inventory.unique_constraints;

export const PHASE4B_WAVE4_UNIQUES = Object.freeze(PENDING_UNIQUES.map((pending) => {
  const candidates = canonicalUniques.filter((candidate) => candidate.table === pending.table
    && candidate.name === pending.name && sameColumns(candidate.columns, pending.columns));
  if (candidates.length !== 1) throw new Error(`Canonical Wave 4 UNIQUE provider is ambiguous: ${identity(pending)}`);
  const canonical = candidates[0];
  const partialIndex = partialIndexes[identity(pending)] ?? null;
  const canonicalForeignKeyDependents = manifest.object_inventory.foreign_keys.filter((foreignKey) => (
    foreignKey.references_table === pending.table && sameColumns(foreignKey.references_columns, pending.columns)
  )).map((foreignKey) => `${foreignKey.table}.${foreignKey.name ?? "unnamed_fk"}`);
  if (partialIndex && canonicalForeignKeyDependents.length !== 0) {
    throw new Error(`Partial UNIQUE reuse cannot satisfy canonical FK dependencies: ${identity(pending)}`);
  }
  return Object.freeze({
    identity: identity(pending),
    schema: pending.table.split(".")[0],
    table: pending.table.split(".")[1],
    qualifiedTable: pending.table,
    constraintName: pending.name,
    columns: Object.freeze([...pending.columns]),
    nullableColumns: reviewedNullableColumns[pending.table],
    nullsNotDistinct: canonical.nulls_not_distinct,
    deferrable: canonical.deferrable,
    initiallyDeferred: canonical.initially_deferred,
    validated: canonical.validated,
    accessMethod: "btree",
    includeColumns: Object.freeze([]),
    predicate: null,
    canonicalProvider: PHASE4B_WAVE4_PROVIDER,
    canonicalForeignKeyDependents: Object.freeze(canonicalForeignKeyDependents),
    existingPartialIndex: partialIndex,
    classification: partialIndex ? "EQUIVALENT_REUSE" : "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
    localEvidence: "LOCAL_DATA_VALIDATION_REQUIRED",
    productionEvidence: partialIndex ? "REVIEWED_PARTIAL_INDEX_CONTRACT" : "PRIVILEGED_AGGREGATE_REQUIRED",
    historicalWriteCompatibility: partialIndex
      ? "UNCHANGED_REUSE"
      : "UNPROVEN_UNTIL_PRODUCTION_DUPLICATE_AND_WRITE_AUDIT",
  });
}));

export const PHASE4B_WAVE4_NEGATIVE_SCENARIOS = Object.freeze([
  "duplicate_data",
  "wrong_key_order",
  "wrong_null_semantics",
  "wrong_partial_predicate",
  "wrong_deferrability",
  "provider_conflict",
  "missing_prerequisite",
]);

export function assertWave4ProviderContract(contracts = PHASE4B_WAVE4_UNIQUES) {
  const identities = contracts.map((entry) => entry.identity);
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate Wave 4 UNIQUE identity/provider.");
  if (contracts.length !== 13) throw new Error("Wave 4 must contain exactly 13 reviewed UNIQUE contracts.");
  if (contracts.some((entry) => entry.canonicalProvider !== PHASE4B_WAVE4_PROVIDER)) {
    throw new Error("Wave 4 UNIQUE provider conflict.");
  }
  return true;
}

export const PHASE4B_WAVE4_SUMMARY = Object.freeze({
  total: PHASE4B_WAVE4_UNIQUES.length,
  exactCanonical: 0,
  equivalentReuse: PHASE4B_WAVE4_UNIQUES.filter((entry) => entry.classification === "EQUIVALENT_REUSE").length,
  safeInstall: 0,
  requiresPrivilegedProductionEvidence: PHASE4B_WAVE4_UNIQUES.filter(
    (entry) => entry.classification === "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  ).length,
  migrationRequired: false,
});
