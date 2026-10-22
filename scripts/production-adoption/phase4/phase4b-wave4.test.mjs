import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPhase4BWave4GateSql } from "./generate-phase4b-wave4.mjs";
import {
  PHASE4B_WAVE4_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE4_PROVIDER,
  PHASE4B_WAVE4_SUMMARY,
  PHASE4B_WAVE4_UNIQUES,
  assertWave4ProviderContract,
} from "./phase4b-wave4-contract.mjs";
import { buildWave4FixtureColumnContract, buildWave4FixtureSql } from "./phase4b-wave4-fixture-contract.mjs";
import {
  parsePhase4BWave4Failure,
  wave4NegativeInjectionSql,
  wave4NegativeMutationAssertionSql,
} from "./run-phase4b-wave4-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const baseline = readFileSync(resolve(root, "supabase", "migrations", PHASE4B_WAVE4_PROVIDER), "utf8");
const gate = buildPhase4BWave4GateSql();

test("checked-in Wave 4 gate exactly matches the deterministic generator", () => {
  assert.equal(readFileSync(resolve(directory, "phase4b-wave4-gate.sql"), "utf8"), gate);
});

test("Wave 4 contains exactly 13 unique canonical providers", () => {
  assert.equal(assertWave4ProviderContract(), true);
  assert.equal(PHASE4B_WAVE4_UNIQUES.length, 13);
  assert.equal(new Set(PHASE4B_WAVE4_UNIQUES.map((entry) => entry.identity)).size, 13);
  assert.ok(PHASE4B_WAVE4_UNIQUES.every((entry) => entry.canonicalProvider === PHASE4B_WAVE4_PROVIDER));
});

test("every UNIQUE contract preserves catalog semantics", () => {
  for (const contract of PHASE4B_WAVE4_UNIQUES) {
    assert.ok(contract.columns.length > 0);
    assert.equal(contract.nullsNotDistinct, false);
    assert.equal(contract.deferrable, false);
    assert.equal(contract.initiallyDeferred, false);
    assert.equal(contract.validated, true);
    assert.equal(contract.accessMethod, "btree");
    assert.deepEqual(contract.includeColumns, []);
    assert.equal(contract.predicate, null);
  }
});

test("partial historical indexes have exact value semantics but remain structurally distinct", () => {
  const partials = PHASE4B_WAVE4_UNIQUES.filter((entry) => entry.existingPartialIndex);
  assert.equal(partials.length, 2);
  assert.deepEqual(partials.map((entry) => entry.existingPartialIndex.name).sort(), [
    "exam_results_user_submission_unique",
    "user_profiles_ref_card_id_unique",
  ]);
  assert.ok(partials.every((entry) => entry.existingPartialIndex.valueSemantics === "EXACT_EQUIVALENCE"));
  assert.ok(partials.every((entry) => entry.existingPartialIndex.structuralEquivalence === false));
  assert.ok(partials.every((entry) => entry.canonicalForeignKeyDependents.length === 0));
  assert.ok(partials.every((entry) => entry.classification === "EQUIVALENT_REUSE"));
});

test("Wave 4 authorizes no installation without privileged Production evidence", () => {
  assert.deepEqual(PHASE4B_WAVE4_SUMMARY, {
    total: 13,
    exactCanonical: 0,
    equivalentReuse: 2,
    safeInstall: 0,
    requiresPrivilegedProductionEvidence: 11,
    migrationRequired: false,
  });
  assert.equal(PHASE4B_WAVE4_UNIQUES.filter((entry) => entry.classification === "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE").length, 11);
});

test("duplicate providers fail before SQL generation", () => {
  assert.throws(() => assertWave4ProviderContract([...PHASE4B_WAVE4_UNIQUES, PHASE4B_WAVE4_UNIQUES[0]]), /Duplicate Wave 4 UNIQUE identity/);
});

test("fixture completeness is derived from baseline columns and inserts no historical rows", () => {
  const columns = buildWave4FixtureColumnContract(baseline);
  const sql = buildWave4FixtureSql(baseline);
  const expectedColumns = new Set(PHASE4B_WAVE4_UNIQUES.flatMap((entry) => (
    entry.columns.map((column) => `${entry.qualifiedTable}.${column}`)
  )));
  assert.equal(columns.length, expectedColumns.size);
  assert.deepEqual(new Set(columns.map((entry) => `${entry.table}.${entry.column}`)), expectedColumns);
  assert.ok(columns.some((entry) => entry.table === "public.institution_assessment_assignments" && entry.column === "assessment_id"));
  assert.ok(columns.some((entry) => entry.table === "public.institution_notification_campaigns" && entry.column === "institution_id"));
  assert.doesNotMatch(sql, /\binsert\s+into\b/i);
  assert.match(sql, /create unique index exam_results_user_submission_unique[\s\S]*where submission_id is not null/i);
  assert.match(sql, /create unique index user_profiles_ref_card_id_unique[\s\S]*where ref_card_id is not null/i);
});

test("Wave 4 gate is read-only evidence and contains no installation DDL", () => {
  assert.match(gate, /^--[\s\S]*begin read only;/i);
  assert.match(gate, /rollback;\s*$/i);
  assert.doesNotMatch(gate, /\balter\s+table\b|\bcreate\s+(?:unique\s+)?index\b|\bdrop\b/i);
  assert.match(gate, /No UNIQUE installation is authorized/);
});

test("duplicate audit runs before partial-index acceptance", () => {
  assert.ok(gate.indexOf("duplicate data blocks reconciliation") < gate.indexOf("reviewed partial UNIQUE index contract drift"));
  assert.match(gate, /where %s group by %s having count\(\*\) > 1/);
});

test("gate compares ordered keys, null semantics, deferrability, predicate, validity, and readiness", () => {
  for (const token of ["conkey", "condeferrable", "condeferred", "indnullsnotdistinct", "indisvalid", "indisready", "indnkeyatts", "indnatts", "pg_get_indexdef", "pg_get_expr", "amname"]) {
    assert.match(gate, new RegExp(token));
  }
  assert.equal((gate.match(/array_agg\(attribute\.attname::text/g) ?? []).length, 2);
  assert.doesNotMatch(gate, /array_agg\(attribute\.attname\s+order by/);
});

test("all seven negative scenarios inject and prove catalog drift", () => {
  assert.equal(PHASE4B_WAVE4_NEGATIVE_SCENARIOS.length, 7);
  for (const scenario of PHASE4B_WAVE4_NEGATIVE_SCENARIOS) {
    assert.ok(wave4NegativeInjectionSql(scenario).trim().length > 0, scenario);
    assert.match(wave4NegativeMutationAssertionSql(scenario), /^select/i, scenario);
  }
});

test("negative scenarios cover required unique failure modes", () => {
  assert.match(wave4NegativeInjectionSql("wrong_key_order"), /unique \(assessment_id, institution_id, id\)/i);
  assert.match(wave4NegativeInjectionSql("wrong_null_semantics"), /nulls not distinct/i);
  assert.match(wave4NegativeInjectionSql("wrong_partial_predicate"), /ref_card_id <> ''/i);
  assert.match(wave4NegativeInjectionSql("wrong_deferrability"), /deferrable initially immediate/i);
  assert.match(wave4NegativeMutationAssertionSql("provider_conflict"), /count\(\*\)=2/i);
});

test("PostgreSQL diagnostics remain sanitized", () => {
  assert.deepEqual(parsePhase4BWave4Failure({ stderr: "ERROR:  55000: Wave 4 UNIQUE provider conflict\nDETAIL: hidden" }), {
    sqlstate: "55000",
    message: "Wave 4 UNIQUE provider conflict",
  });
  assert.equal(parsePhase4BWave4Failure({ stderr: "unstructured" }).sqlstate, "UNKNOWN");
});

test("Wave 4 runner isolates scenarios and allowlists only local PG target variables", () => {
  const runner = readFileSync(resolve(directory, "run-phase4b-wave4-postgres.mjs"), "utf8");
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\), `reflab-wave4-\$\{scenario\}-`\)\)/);
  assert.match(runner, /PGHOST: "127\.0\.0\.1"/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.doesNotMatch(runner, /\.\.\.process\.env|PGPASSWORD|PGOPTIONS|PGSERVICE|PGPASSFILE/);
  assert.match(runner, /rmSync\(temporaryRoot, \{ recursive: true, force: true \}\)/);
});
