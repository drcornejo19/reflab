import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildPhase4BWave2Migration } from "./generate-phase4b-wave2.mjs";
import {
  PHASE4B_WAVE2_DRIFT_DECISIONS,
  PHASE4B_WAVE2_EQUIVALENT_REUSE,
  PHASE4B_WAVE2_LOCK_STRATEGY,
  PHASE4B_WAVE2_PROVIDER_MAP,
  PHASE4B_WAVE2_SAFE_INDEXES,
  PHASE4B_WAVE2_VERSION,
  assertWave2ProviderMap,
} from "./phase4b-wave2-contract.mjs";
import { buildWave2FixtureDependencyContract, buildWave2FixtureSql } from "./phase4b-wave2-fixture-contract.mjs";
import { negativeInjectionSql, negativeMutationAssertionSql } from "./run-phase4b-wave2-postgres.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const baseline = readFileSync(resolve(root, "supabase", "migrations", "202607270000_reflab_canonical_baseline.sql"), "utf8");
const generated = buildPhase4BWave2Migration();
const migration = readFileSync(resolve(root, "supabase", "migrations", "20260901064257_production_adoption_non_unique_indexes.sql"), "utf8");

test("versioned Wave 2 migration exactly matches the generator", () => {
  assert.equal(migration.replaceAll("\r\n", "\n"), generated);
});

test("Wave 2 contains exactly the 32 reviewed missing non-unique indexes", () => {
  assert.equal(PHASE4B_WAVE2_SAFE_INDEXES.length, 32);
  assert.equal(new Set(PHASE4B_WAVE2_SAFE_INDEXES.map((index) => index.identity)).size, 32);
  assert.ok(PHASE4B_WAVE2_SAFE_INDEXES.every((index) => !index.unique && index.classification === "SAFE_INSTALL"));
  assert.ok(!PHASE4B_WAVE2_SAFE_INDEXES.some((index) => index.name.includes("unique")));
});

test("Wave 2 reuses the reviewed renamed clips index without duplicating it", () => {
  assert.deepEqual(PHASE4B_WAVE2_EQUIVALENT_REUSE.map(({ canonicalName, observedName, classification }) => ({ canonicalName, observedName, classification })), [{
    canonicalName: "clips_sport_topic_idx",
    observedName: "clips_sport_topic_active_idx",
    classification: "EQUIVALENT_REUSE",
  }]);
  assert.doesNotMatch(generated, /create index clips_sport_topic_idx/i);
  assert.match(generated, /Reviewed renamed clips index is not equivalent/);
});

test("the 11 semantic drifts remain outside Wave 2 DDL", () => {
  assert.equal(PHASE4B_WAVE2_DRIFT_DECISIONS.length, 11);
  assert.equal(PHASE4B_WAVE2_DRIFT_DECISIONS.filter((entry) => entry.decision === "REPLACEMENT_REQUIRES_CUTOVER").length, 9);
  assert.equal(PHASE4B_WAVE2_DRIFT_DECISIONS.filter((entry) => entry.decision === "LEGACY_REQUIRED_TEMPORARILY").length, 2);
  for (const drift of PHASE4B_WAVE2_DRIFT_DECISIONS) {
    assert.equal(drift.wave2Action, "PRESERVE_NO_DDL");
    assert.doesNotMatch(generated, new RegExp(`create index ${drift.name}`, "i"));
  }
});

test("index comparison is catalogal and covers all required semantics", () => {
  for (const catalog of ["pg_index", "pg_attribute", "pg_opclass", "pg_collation", "pg_am", "pg_constraint"]) {
    assert.match(generated, new RegExp(`pg_catalog\\.${catalog}`));
  }
  for (const field of ["indisunique", "indisvalid", "indisready", "indislive", "indnkeyatts", "indnatts", "indkey", "indoption", "indclass", "indcollation", "indpred", "indexprs", "indnullsnotdistinct"]) {
    assert.match(generated, new RegExp(field));
  }
  assert.doesNotMatch(generated, /pg_get_indexdef/i);
  assert.doesNotMatch(generated, /to_regclass\('public\.[a-z0-9_]+\.[a-z0-9_]+'\)/i);
  assert.doesNotMatch(generated, /to_regclass\(expected_index\.table_name\s*\|\|\s*'\.'\s*\|\|\s*expected_index\.index_name\)/i);
  assert.doesNotMatch(generated, /pg_collation\s+collation(?:\s|$)/i);
  assert.doesNotMatch(generated, /array_agg\(attribute\.attname\s+order/i);
  assert.match(generated, /array_agg\(attribute\.attname::text order/i);
  assert.doesNotMatch(generated, /unnest\([^\r\n]*,[^\r\n]*\)\s+with ordinality/i);
  assert.match(generated, /index_collation_position\.ordinality=key_collation_position\.ordinality/);
});

test("lock strategy is transactional, bounded, and never concurrent", () => {
  assert.deepEqual(PHASE4B_WAVE2_LOCK_STRATEGY, {
    statement: "CREATE INDEX",
    transactional: true,
    concurrently: false,
    lockTimeout: "5s",
    statementTimeout: "15min",
    reason: "Atomic rollback is required; timeout aborts the entire wave instead of leaving an invalid concurrent index.",
    productionGate: "approved maintenance window plus table-size and lock-duration evidence",
  });
  assert.match(generated, /begin;[\s\S]*set local lock_timeout = '5s';[\s\S]*set local statement_timeout = '15min';[\s\S]*commit;/i);
  assert.doesNotMatch(generated, /concurrently/i);
  assert.doesNotMatch(generated, /drop\s+index|reindex|alter\s+index/i);
});

test("provider map gives every Wave 2 index one provider and rejects conflicts", () => {
  assert.equal(assertWave2ProviderMap(), true);
  for (const index of PHASE4B_WAVE2_SAFE_INDEXES) {
    assert.equal(PHASE4B_WAVE2_PROVIDER_MAP.get(index.identity), PHASE4B_WAVE2_VERSION);
  }
  const conflict = new Map(PHASE4B_WAVE2_PROVIDER_MAP);
  conflict.set(PHASE4B_WAVE2_SAFE_INDEXES[0].identity, "unexpected_provider");
  assert.throws(() => assertWave2ProviderMap(conflict), /provider conflict/i);
});

test("fixture dependency contract is derived from canonical columns", () => {
  const contract = buildWave2FixtureDependencyContract(baseline, PHASE4B_WAVE2_SAFE_INDEXES);
  assert.ok(contract.length > 50);
  assert.ok(contract.some((column) => column.identity === "public.institution_permissions.id") === false);
  assert.ok(contract.some((column) => column.identity === "public.attempts.exam_result_id"));
  assert.ok(contract.some((column) => column.identity === "public.clips.is_active"));
  assert.ok(contract.every((column) => column.definition.startsWith(`${column.column} `)));
  const fixtureSql = buildWave2FixtureSql(baseline, PHASE4B_WAVE2_SAFE_INDEXES);
  for (const table of new Set(PHASE4B_WAVE2_SAFE_INDEXES.map((index) => index.table))) {
    assert.match(fixtureSql, new RegExp(`create table if not exists ${table.replaceAll(".", "\\.")} \\(\\)`));
  }
});

test("migration remains fail-closed and does not cross Wave 2 scope", () => {
  assert.match(generated, /raise exception 'Wave 2 named index contract drift:[\s\S]*errcode='55000'/);
  assert.match(generated, /raise exception 'Wave 2 equivalent index already exists under another name:[\s\S]*errcode='55000'/);
  assert.match(generated, /raise exception 'Wave 2 provider conflict:[\s\S]*errcode='55000'/);
  assert.doesNotMatch(generated, /create\s+unique\s+index|add\s+constraint|create\s+trigger|create\s+(?:or\s+replace\s+)?function/i);
  assert.doesNotMatch(generated, /insert\s+into\s+reflab_meta\.reflab_schema_state/i);
  assert.doesNotMatch(generated, /create\s+table[\s\S]*user_identity_links/i);
});

test("every negative scenario has an explicit mutation and catalog assertion", () => {
  const scenarios = [
    "wrong_key_order", "wrong_predicate", "wrong_access_method", "wrong_include", "wrong_opclass",
    "duplicate_equivalent_index", "invalid_index", "missing_prerequisite", "provider_conflict",
  ];
  for (const scenario of scenarios) {
    assert.ok(negativeInjectionSql(scenario).trim().length > 0);
    assert.match(negativeMutationAssertionSql(scenario), /^select /i);
  }
  assert.match(negativeMutationAssertionSql("wrong_key_order"), /pg_index[\s\S]*indkey/);
  assert.match(negativeMutationAssertionSql("wrong_opclass"), /pg_opclass/);
  assert.match(negativeMutationAssertionSql("invalid_index"), /not indisvalid/);
});
