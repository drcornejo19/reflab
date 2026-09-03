import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPhase4BWave3GateSql } from "./generate-phase4b-wave3.mjs";
import {
  PHASE4B_WAVE3_FUNCTIONS,
  PHASE4B_WAVE3_LEGACY_VALIDATORS,
  PHASE4B_WAVE3_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE3_UPDATED_AT_PAIRS,
  assertWave3ProviderContract,
  wave3TriggerIdentity,
} from "./phase4b-wave3-contract.mjs";
import { buildWave3FixtureSql, extractHistoricalFunctionSource } from "./phase4b-wave3-fixture-contract.mjs";
import {
  parsePhase4BWave3Failure,
  wave3NegativeInjectionSql,
  wave3NegativeMutationAssertionSql,
} from "./run-phase4b-wave3-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const baseline = readFileSync(resolve(root, "supabase/migrations/202607270000_reflab_canonical_baseline.sql"), "utf8");
const institutional = readFileSync(resolve(root, "supabase/migrations/202607160001_institutional_multitenant_foundation.sql"), "utf8");
const coach = readFileSync(resolve(root, "supabase/migrations/202607200001_reflab_coach_foundation.sql"), "utf8");
const gate = buildPhase4BWave3GateSql();

test("Wave 3 contract contains exactly 44 reviewed updated_at pairs and six legacy validators", () => {
  assert.equal(assertWave3ProviderContract(), true);
  assert.equal(PHASE4B_WAVE3_UPDATED_AT_PAIRS.length, 44);
  assert.equal(PHASE4B_WAVE3_LEGACY_VALIDATORS.length, 6);
  assert.equal(new Set(PHASE4B_WAVE3_UPDATED_AT_PAIRS.map(wave3TriggerIdentity)).size, 44);
  assert.ok(PHASE4B_WAVE3_UPDATED_AT_PAIRS.every((pair) => pair.classification === "EQUIVALENT_REUSE"));
  assert.ok(PHASE4B_WAVE3_LEGACY_VALIDATORS.every((pair) => pair.classification === "LEGACY_REQUIRED_TEMPORARILY"));
});

test("reviewed updated_at pairs have exact catalog semantics and no rename decision", () => {
  for (const pair of PHASE4B_WAVE3_UPDATED_AT_PAIRS) {
    assert.equal(pair.timing, "BEFORE");
    assert.deepEqual(pair.events, ["UPDATE"]);
    assert.equal(pair.level, "ROW");
    assert.equal(pair.whenExpression, null);
    assert.equal(pair.enabledState, "O");
    assert.equal(pair.constraintTrigger, false);
  }
  assert.equal(PHASE4B_WAVE3_UPDATED_AT_PAIRS.filter((pair) => pair.canonicalName === pair.historicalName).length, 1);
});

test("historical updated_at helpers have reviewed source hashes and isolated configuration", () => {
  assert.equal(PHASE4B_WAVE3_FUNCTIONS.length, 2);
  assert.equal(PHASE4B_WAVE3_FUNCTIONS[0].sourceHash, "5eec1929897ca2ec25d6a2c88b2fd8c37e847f7229681f2314151d11ceca9d12");
  assert.deepEqual(PHASE4B_WAVE3_FUNCTIONS.find((entry) => entry.signature === "public.set_updated_at()").configuration, []);
  assert.deepEqual(PHASE4B_WAVE3_FUNCTIONS.find((entry) => entry.signature === "public.set_coach_updated_at()").configuration, ["search_path=public"]);
});

test("Wave 3 fixture is derived from reviewed historical providers", () => {
  const sql = buildWave3FixtureSql({ canonicalSql: baseline, institutionalSql: institutional, coachSql: coach });
  assert.match(sql, /create or replace function public\.set_updated_at\(\)/i);
  assert.match(sql, /create or replace function public\.set_coach_updated_at\(\)/i);
  assert.match(sql, /create or replace function public\.validate_institution_tenant_links\(\)/i);
  assert.equal((sql.match(/create trigger/gi) ?? []).length, 50);
  assert.equal((sql.match(/before update on/gi) ?? []).length, 44);
  assert.equal((sql.match(/before insert or update on/gi) ?? []).length, 6);
});

test("function source extraction ignores exterior whitespace but preserves internal source", () => {
  assert.equal(extractHistoricalFunctionSource("create function x() returns int language sql as $$\n select 1; \n$$;"), "select 1;");
  assert.notEqual(
    extractHistoricalFunctionSource("create function x() returns int language sql as $$ select 1; $$;"),
    extractHistoricalFunctionSource("create function x() returns int language sql as $$ select  1; $$;"),
  );
});

test("historical provider CRLF and LF produce the same fixture contract", () => {
  const institutionalLf = institutional.replaceAll("\r\n", "\n");
  const coachLf = coach.replaceAll("\r\n", "\n");
  const lf = buildWave3FixtureSql({ canonicalSql: baseline, institutionalSql: institutionalLf, coachSql: coachLf });
  const crlf = buildWave3FixtureSql({ canonicalSql: baseline, institutionalSql: institutionalLf.replaceAll("\n", "\r\n"), coachSql: coachLf.replaceAll("\n", "\r\n") });
  assert.equal(crlf, lf);
});

test("Wave 3 gate is read-only and intentionally contains no trigger DDL", () => {
  assert.match(gate, /^--[\s\S]*begin read only;/i);
  assert.match(gate, /rollback;\s*$/i);
  assert.doesNotMatch(gate, /\bcreate\s+trigger\b|\bdrop\s+trigger\b|\balter\s+table\b/i);
  assert.match(gate, /Updated_at trigger double execution contract drift/);
});

test("Wave 3 gate validates complete trigger and function catalog contracts", () => {
  for (const token of ["tgtype", "tgenabled", "tgqual", "tgconstraint", "pg_get_function_identity_arguments", "provolatile", "proisstrict", "prosecdef", "proconfig", "source_hash"]) {
    assert.match(gate, new RegExp(token));
  }
  assert.match(gate, /effective_count <> 1/);
  assert.match(gate, /expected_trigger\.canonical_name <> expected_trigger\.historical_name/);
});

test("Wave 3 gate preserves adoption invariants and development exclusions", () => {
  assert.match(gate, /reflab_schema_state\) <> 0/);
  assert.match(gate, /phase_key='canonical_objects' and phase_order=4/);
  assert.match(gate, /reflab_audit\.production_semantic_snapshot\(\)/);
  assert.match(gate, /reflab_private\.user_identity_links/);
  assert.doesNotMatch(gate, /insert\s+into\s+reflab_meta\.reflab_schema_state/i);
});

test("all ten negative scenarios have non-empty mutation and catalog assertions", () => {
  assert.equal(PHASE4B_WAVE3_NEGATIVE_SCENARIOS.length, 10);
  for (const scenario of PHASE4B_WAVE3_NEGATIVE_SCENARIOS) {
    assert.ok(wave3NegativeInjectionSql(scenario).trim().length > 0, scenario);
    assert.match(wave3NegativeMutationAssertionSql(scenario), /^select|^with/i, scenario);
  }
});

test("negative trigger mutations are catalog-specific rather than text no-ops", () => {
  assert.match(wave3NegativeMutationAssertionSql("wrong_timing"), /tgtype=17/);
  assert.match(wave3NegativeMutationAssertionSql("wrong_event_mask"), /tgtype=23/);
  assert.match(wave3NegativeMutationAssertionSql("wrong_level"), /tgtype=18/);
  assert.match(wave3NegativeMutationAssertionSql("disabled_trigger"), /tgenabled='D'/);
  assert.match(wave3NegativeMutationAssertionSql("unexpected_when"), /tgqual is not null/);
  assert.match(wave3NegativeMutationAssertionSql("function_source_drift"), /digest/);
});

test("PostgreSQL diagnostics are sanitized to SQLSTATE and first message", () => {
  const parsed = parsePhase4BWave3Failure({ stderr: "ERROR:  55000: Reviewed updated_at trigger contract drift\nDETAIL: sensitive" });
  assert.deepEqual(parsed, { sqlstate: "55000", message: "Reviewed updated_at trigger contract drift" });
  assert.equal(parsePhase4BWave3Failure({ stderr: "unstructured" }).sqlstate, "UNKNOWN");
});

test("Wave 3 runner isolates every scenario and allowlists only local PG environment", () => {
  const runner = readFileSync(resolve(directory, "run-phase4b-wave3-postgres.mjs"), "utf8");
  assert.match(runner, /mkdtempSync\(join\(tmpdir\(\), `reflab-wave3-\$\{scenario\}-`\)\)/);
  assert.match(runner, /PGHOST: "127\.0\.0\.1"/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.doesNotMatch(runner, /\.\.\.process\.env|PGPASSWORD|PGOPTIONS|PGSERVICE|PGPASSFILE/);
  assert.match(runner, /rmSync\(temporaryRoot, \{ recursive: true, force: true \}\)/);
});
