import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import {
  CONSTRAINT_EVIDENCE,
  FUNCTION_CLASSIFICATION,
  INDEX_SEMANTIC_DRIFTS,
  PENDING_UNIQUES,
  PHASE4_PROVIDER_MAP,
  RENAMED_EQUIVALENT_INDEXES,
  TRIGGER_CONTRADICTION_RESOLUTION,
  TRIGGER_PAIR_SUMMARY,
  buildUniqueProviderMap,
  canonicalStructuralInventory,
  classifyIndexEvidence,
  classifyUniqueEvidence,
  duplicateTriggerContracts,
} from "./phase4-structural-contract.mjs";
import {
  PHASE4_STRUCTURAL_FINGERPRINT_SQL,
  PHASE4_STRUCTURAL_FINGERPRINT_VERSION,
  REQUIRED_V2_FIELDS,
  validateStructuralFingerprintV2,
} from "./phase4-structural-fingerprint-v2.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const baseline = JSON.parse(readFileSync(resolve(root, "supabase", "baseline", "manifest.json"), "utf8"));
const uniqueRunner = readFileSync(resolve(directory, "run-phase4a-unique-postgres.mjs"), "utf8");

test("canonical trigger identities are unique and preserve both context validators", () => {
  assert.deepEqual(duplicateTriggerContracts(baseline.object_inventory.triggers), []);
  assert.equal(TRIGGER_CONTRADICTION_RESOLUTION.length, 3);
  for (const resolution of TRIGGER_CONTRADICTION_RESOLUTION) {
    const rows = baseline.object_inventory.triggers.filter((trigger) => trigger.table === resolution.table);
    assert.ok(rows.some((trigger) => trigger.name === resolution.appointmentTrigger
      && trigger.function === resolution.appointmentFunction));
    assert.ok(rows.some((trigger) => trigger.name === resolution.checkinTrigger
      && trigger.function === resolution.checkinFunction));
  }
});

test("duplicate trigger contracts fail structural evidence", () => {
  const duplicates = duplicateTriggerContracts([
    { table: "public.sample", name: "sample_guard", timing_and_events: "BEFORE INSERT", function: "private.first()" },
    { table: "public.sample", name: "sample_guard", timing_and_events: "BEFORE INSERT", function: "private.second()" },
  ]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].identity, "public.sample.sample_guard");
});

test("structural fingerprint V2 is read-only and captures catalog semantics", () => {
  assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, /^begin read only;/i);
  assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, /rollback;$/i);
  assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, /set local lock_timeout/i);
  assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, /set local statement_timeout/i);
  assert.doesNotThrow(() => assertReadOnlySql(PHASE4_STRUCTURAL_FINGERPRINT_SQL));
  for (const fields of Object.values(REQUIRED_V2_FIELDS)) {
    for (const field of fields) assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, new RegExp(`\\b${field}\\b`, "i"));
  }
  for (const catalogField of ["tgtype", "tgqual", "indnkeyatts", "indoption", "confmatchtype", "confupdtype", "confdeltype", "convalidated"]) {
    assert.match(PHASE4_STRUCTURAL_FINGERPRINT_SQL, new RegExp(catalogField));
  }
});

test("fingerprint V2 rejects missing FK metadata instead of guessing", () => {
  const incomplete = {
    format: PHASE4_STRUCTURAL_FINGERPRINT_VERSION,
    triggers: [], indexes: [], checks: [], uniques: [],
    foreign_keys: [{ source_columns: ["id"], target_columns: ["id"] }],
  };
  const missing = validateStructuralFingerprintV2(incomplete);
  assert.ok(missing.some((entry) => entry.section === "foreign_keys" && entry.field === "on_delete"));
  assert.ok(missing.some((entry) => entry.section === "foreign_keys" && entry.field === "match_type"));
});

test("index evidence separates renamed equivalents from semantic drift", () => {
  assert.equal(RENAMED_EQUIVALENT_INDEXES.length, 1);
  assert.equal(classifyIndexEvidence(
    { name: "canonical", unique: false, keys: ["sport_type", "topic", "is_active"], predicate: null },
    { name: "historical", unique: false, keys: ["sport_type", "topic", "is_active"], predicate: null },
  ).classification, "naming_only");
  assert.equal(classifyIndexEvidence(
    { name: "ordered", unique: false, keys: ["a", "b"], predicate: null },
    { name: "ordered", unique: false, keys: ["b", "a"], predicate: null },
  ).classification, "wrong_order");
  assert.equal(classifyIndexEvidence(
    { name: "partial", unique: true, keys: ["provider", "external_id"], predicate: "provider is not null and external_id is not null" },
    { name: "partial", unique: true, keys: ["provider", "external_id"], predicate: "external_id is not null" },
  ).classification, "wrong_predicate");
  assert.equal(INDEX_SEMANTIC_DRIFTS.length, 11);
});

test("unique evidence never treats absent aggregates as safe", () => {
  assert.equal(PENDING_UNIQUES.length, 13);
  assert.equal(classifyUniqueEvidence({ duplicateCount: null, maxDuplicateGroupSize: null }), "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE");
  assert.equal(classifyUniqueEvidence({ duplicateCount: 1, maxDuplicateGroupSize: 2 }), "REQUIRES_DATA_VALIDATION");
  assert.equal(classifyUniqueEvidence({ duplicateCount: 0, maxDuplicateGroupSize: 1 }), "SAFE_INSTALL_PHASE4B");
  assert.equal(classifyUniqueEvidence({ duplicateCount: 0, maxDuplicateGroupSize: 1, equivalentIndex: { predicate: "value is not null" } }), "SAFE_RENAME_OR_REUSE");
});

test("unique aggregate rehearsal is local-only and preserves missing fixture evidence", () => {
  assert.match(uniqueRunner, /PGHOST:\s*"127\.0\.0\.1"/);
  assert.match(uniqueRunner, /PGDATABASE:\s*"postgres"/);
  assert.match(uniqueRunner, /environment\.PGDATABASE = "phase4a_unique"/);
  assert.match(uniqueRunner, /options\.quiet \? "ignore"/);
  assert.match(uniqueRunner, /pgCtl,[\s\S]*?"start"[\s\S]*?\{ quiet: true \}/);
  assert.match(uniqueRunner, /pgCtl,[\s\S]*?"stop"[\s\S]*?\{ quiet: true \}/);
  assert.match(uniqueRunner, /PGSSLMODE:\s*"disable"/);
  assert.match(uniqueRunner, /fixture_table_not_modeled/);
  assert.match(uniqueRunner, /fixture_columns_not_modeled/);
  assert.match(uniqueRunner, /catalogColumnCount !== columns\.length/);
  assert.match(uniqueRunner, /having pg_catalog\.count\(\*\) > 1/i);
  assert.match(uniqueRunner, /cleanup failed before temporary directory removal/);
  assert.doesNotMatch(uniqueRunner, /catch\s*\{\s*\/\* directory cleanup remains fail-closed/);
  assert.doesNotMatch(uniqueRunner, /supabase\.co|PGPASSWORD|PGOPTIONS|PGSERVICE|PGPASSFILE/i);
});

test("CHECK and FK evidence remains fail-closed until V2 is captured", () => {
  assert.equal(CONSTRAINT_EVIDENCE.checks.canonicalTotal, 297);
  assert.deepEqual(CONSTRAINT_EVIDENCE.checks.cutoverOnly, ["public.attempts.attempts_exam_source_check"]);
  assert.equal(CONSTRAINT_EVIDENCE.foreignKeys.canonicalTotal, 61);
  assert.equal(CONSTRAINT_EVIDENCE.foreignKeys.unknownRequiresV2, 61);
});

test("provider ownership rejects conflicting migrations", () => {
  assert.ok(PHASE4_PROVIDER_MAP.size > 20);
  assert.throws(() => buildUniqueProviderMap([
    ["public.attempts.canonical_payload_hash", "202608130001"],
    ["public.attempts.canonical_payload_hash", "phase4_duplicate"],
  ]), /Conflicting providers/);
  assert.equal(PHASE4_PROVIDER_MAP.get("public.attempts.canonical_payload_hash"), "202608130001");
});

test("Phase 4A closes contracts but creates no installation migration", () => {
  const migrations = readdirSync(resolve(root, "supabase", "migrations"));
  assert.equal(migrations.filter((name) => /phase4|structural_reconciliation/i.test(name)).length, 0);
  assert.equal(FUNCTION_CLASSIFICATION.length, 19);
  assert.equal(TRIGGER_PAIR_SUMMARY.totalHistoricalPairs, 50);
  assert.equal(TRIGGER_PAIR_SUMMARY.updatedAtEquivalentDifferentNameOrHelper, 44);
  assert.equal(TRIGGER_PAIR_SUMMARY.institutionalValidatorSemanticDrift, 6);
  const inventory = canonicalStructuralInventory();
  assert.equal(inventory.triggers.length, 82);
  assert.equal(inventory.checks.length, 297);
  assert.equal(inventory.foreignKeys.length, 61);
});
