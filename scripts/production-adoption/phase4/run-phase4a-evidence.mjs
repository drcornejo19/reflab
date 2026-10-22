import { readFileSync } from "node:fs";
import process from "node:process";
import { resolve } from "node:path";
import { canonicalObjectManifest } from "../../production-preflight/manifest.mjs";
import {
  CONSTRAINT_EVIDENCE,
  FUNCTION_CLASSIFICATION,
  INDEX_SEMANTIC_DRIFTS,
  PENDING_UNIQUES,
  RENAMED_EQUIVALENT_INDEXES,
  TRIGGER_CONTRADICTION_RESOLUTION,
  duplicateTriggerContracts,
} from "./phase4-structural-contract.mjs";

const installedFunctionProviders = new Set([
  "reflab_meta.reject_schema_state_mutation()",
  "reflab_private.canonical_jsonb_text(jsonb)",
  "reflab_private.request_user_id()",
  "reflab_private.is_super_admin()",
  "public.admin_set_canonical_user_plan(text, text, text, text)",
  "public.admin_set_canonical_global_role(text, text, text, text)",
  "public.submit_canonical_training_attempt(text, uuid, jsonb, integer)",
  "public.submit_canonical_communication_feedback(text, uuid, text, jsonb)",
]);

const installedIndexProviders = new Set([
  "attempts_exam_occurrence_unique",
  "referee_exam_sessions_user_status_idx",
  "referee_exam_sessions_institution_idx",
  "notification_events_deduplication_unique",
  "attempts_canonical_training_submission_unique",
]);

function readJson(path) {
  const raw = readFileSync(path);
  const encoding = raw[0] === 0xff && raw[1] === 0xfe ? "utf16le" : "utf8";
  return JSON.parse(raw.toString(encoding).replace(/^\uFEFF/, ""));
}

function observedTiming(definition) {
  const match = String(definition).match(/create trigger\s+\S+\s+(before|after|instead of)\s+(.+?)\s+on\s+/i);
  return match ? `${match[1]} ${match[2]}`.replace(/\s+/g, " ").toUpperCase() : null;
}

function triggerReport(fingerprint) {
  const observed = fingerprint.sections.triggers.filter((entry) =>
    ["public", "reflab_private", "reflab_meta"].includes(entry.schema_name));
  const exact = [];
  const pairs = [];
  const missingWithoutPair = [];

  for (const expected of canonicalObjectManifest.triggers) {
    if (expected.table === "reflab_meta.reflab_schema_state"
        && expected.name === "reflab_schema_state_immutable") {
      exact.push({ expected, provider: "202608310001" });
      continue;
    }
    const [schema, table] = expected.table.split(".");
    const sameName = observed.find((entry) => entry.schema_name === schema
      && entry.table_name === table && entry.trigger_name === expected.name);
    if (sameName?.function_signature === expected.function) {
      exact.push({ expected, observed: sameName });
      continue;
    }
    const historical = sameName ?? observed.find((entry) => entry.schema_name === schema
      && entry.table_name === table
      && observedTiming(entry.definition) === expected.timing_and_events);
    if (!historical) {
      missingWithoutPair.push(expected);
      continue;
    }
    const updatedAt = expected.function === "reflab_private.set_updated_at()"
      && ["public.set_updated_at()", "public.set_coach_updated_at()"].includes(historical.function_signature);
    pairs.push({
      canonical: `${expected.table}.${expected.name}`,
      canonicalFunction: expected.function,
      historical: `${schema}.${table}.${historical.trigger_name}`,
      historicalFunction: historical.function_signature,
      classification: updatedAt ? "equivalent_different_name" : "semantic_drift",
      decision: updatedAt ? "SAFE_RENAME_OR_REUSE" : "LEGACY_REQUIRED_TEMPORARILY",
    });
  }
  return { exact, pairs, missingWithoutPair };
}

export function buildPhase4AEvidence(fingerprint) {
  if (fingerprint.visibility?.functions !== "CONFIRMED"
      || fingerprint.visibility?.indexes !== "CONFIRMED"
      || fingerprint.visibility?.triggers !== "CONFIRMED") {
    throw new Error("Phase 4A requires confirmed structural visibility.");
  }
  const duplicates = duplicateTriggerContracts(canonicalObjectManifest.triggers);
  if (duplicates.length) throw new Error("Canonical trigger contract is ambiguous.");

  const triggers = triggerReport(fingerprint);
  const normalizeSignature = (value) => String(value)
    .replace(/([,(]\s*)p_[a-z0-9_]+\s+/gi, "$1")
    .replace(/\s+/g, "");
  const observedFunctionSignatures = new Set(fingerprint.sections.functions.map((entry) => normalizeSignature(entry.signature)));
  for (const signature of installedFunctionProviders) observedFunctionSignatures.add(normalizeSignature(signature));
  const missingFunctions = canonicalObjectManifest.functions
    .filter((entry) => !observedFunctionSignatures.has(normalizeSignature(entry.signature)));
  const driftFunctions = canonicalObjectManifest.functions.filter((expected) => {
    const observed = fingerprint.sections.functions.find((entry) =>
      normalizeSignature(entry.signature) === normalizeSignature(expected.signature));
    return observed && (observed.security !== expected.security
      || observed.owner !== expected.owner
      || String(observed.search_path).replace(/^search_path=/, "") !== expected.search_path
      || observed.source_hash !== expected.sourceHash);
  });

  const observedIndexNames = new Set(fingerprint.sections.indexes
    .filter((entry) => !entry.constraint_backed).map((entry) => entry.index_name));
  for (const name of installedIndexProviders) observedIndexNames.add(name);
  const missingIndexNames = canonicalObjectManifest.explicitIndexes
    .filter((entry) => !observedIndexNames.has(entry.name)).map((entry) => entry.name);
  const namingOnly = new Set(RENAMED_EQUIVALENT_INDEXES.map((entry) => entry.canonicalName));
  const trulyMissingIndexes = canonicalObjectManifest.explicitIndexes
    .filter((entry) => missingIndexNames.includes(entry.name) && !namingOnly.has(entry.name));

  return {
    format: "production_structural_evidence_v2_plan",
    sourceFingerprintHash: fingerprint.fingerprintHash,
    triggerContractRepair: TRIGGER_CONTRADICTION_RESOLUTION,
    functions: {
      missing: missingFunctions.map((entry) => entry.signature),
      drift: driftFunctions.map((entry) => entry.signature),
      classification: FUNCTION_CLASSIFICATION,
    },
    triggers: {
      canonicalExact: triggers.exact.length,
      historicalPairs: triggers.pairs,
      missingWithoutHistoricalSameEvent: triggers.missingWithoutPair.map((entry) => `${entry.table}.${entry.name}`),
    },
    indexes: {
      missingNames: missingIndexNames,
      trulyMissing: trulyMissingIndexes.map((entry) => ({ name: entry.name, table: entry.table, unique: entry.unique })),
      semanticDrifts: INDEX_SEMANTIC_DRIFTS,
      renamedEquivalent: RENAMED_EQUIVALENT_INDEXES,
    },
    uniques: PENDING_UNIQUES,
    constraints: CONSTRAINT_EVIDENCE,
    blockers: {
      v2ProductionFingerprintRequired: true,
      privilegedDuplicateAggregatesRequired: true,
      legacyWriteValidationRequired: true,
    },
  };
}

if (process.argv[1]?.endsWith("run-phase4a-evidence.mjs")) {
  const path = resolve(process.argv[2] ?? ".qa-local/production-fingerprint.json");
  process.stdout.write(`${JSON.stringify(buildPhase4AEvidence(readJson(path)), null, 2)}\n`);
}
