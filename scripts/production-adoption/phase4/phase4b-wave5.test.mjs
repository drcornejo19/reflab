import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PHASE4B_WAVE5_CHECKS, PHASE4B_WAVE5_FOREIGN_KEYS, PHASE4B_WAVE5_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE5_CATALOG, PHASE4B_WAVE5_SUMMARY, assertWave5CatalogMajor, assertWave5Contract,
  PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION, assertWave5ReviewedTransition,
  PHASE4B_WAVE5_DATA_EVIDENCE, PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE,
  PHASE4B_WAVE5_CARDINALITY_RECONCILIATION, PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS,
  PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS, PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS,
  assessWave5DataValidation, canonicalCheckIdentityKey, canonicalForeignKeyIdentityKey,
  classifyWave5ObservedCatalog,
} from "./phase4b-wave5-contract.mjs";
import { buildPhase4BWave5GateSql } from "./generate-phase4b-wave5.mjs";
import {
  WAVE5_EFFECTIVE_CANONICAL_GRAPH,
  assertNoCanonicalCatalogCollisions,
} from "./generate-phase4b-wave5-canonical-catalog.mjs";
import { wave5GateSqlForScenario, wave5MutationAssertionSql, wave5NegativeInjectionSql } from "./run-phase4b-wave5-postgres.mjs";
import { buildWave5FixtureSql } from "./phase4b-wave5-fixture-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const gate = readFileSync(resolve(directory, "phase4b-wave5-gate.sql"), "utf8");

function observedCheck(expected, overrides = {}) {
  return {
    schema: expected.schema,
    table: expected.table,
    constraintName: expected.catalogConstraintName,
    constraintType: "c",
    referencedColumns: [...expected.referencedColumns],
    expressionHash: expected.expressionHash,
    validated: expected.validated,
    noInherit: expected.noInherit,
    nullableColumns: [],
    ...overrides,
  };
}

function observedForeignKey(expected, overrides = {}) {
  return {
    schema: expected.schema,
    table: expected.table,
    constraintName: expected.constraintName,
    constraintType: "f",
    sourceColumns: [...expected.sourceColumns],
    targetSchema: expected.targetSchema,
    targetTable: expected.targetTable,
    targetColumns: [...expected.targetColumns],
    matchType: expected.matchType,
    onUpdate: expected.onUpdate,
    onDelete: expected.onDelete,
    deferrable: expected.deferrable,
    initiallyDeferred: expected.initiallyDeferred,
    validated: expected.validated,
    ...overrides,
  };
}

test("Wave 5 closes the complete canonical CHECK and FK contracts", () => {
  assert.equal(assertWave5Contract(), true);
  assert.equal(PHASE4B_WAVE5_CHECKS.length, 301);
  assert.equal(PHASE4B_WAVE5_FOREIGN_KEYS.length, 129);
  assert.ok(PHASE4B_WAVE5_CHECKS.every((entry) => entry.referencedColumns.length > 0));
});

test("Wave 5 counts stable canonical identities separately from representations", () => {
  const checkKeys = PHASE4B_WAVE5_CHECKS.map(canonicalCheckIdentityKey);
  const foreignKeyKeys = PHASE4B_WAVE5_FOREIGN_KEYS.map(canonicalForeignKeyIdentityKey);
  assert.equal(new Set(checkKeys).size, 301);
  assert.equal(new Set(foreignKeyKeys).size, 129);
  assert.deepEqual(PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalIdentities, {
    checks: 301,
    foreignKeys: 129,
  });
  assert.equal(PHASE4B_WAVE5_SUMMARY.classificationUniverse, "EFFECTIVE_CANONICAL_IDENTITIES");
  assert.equal(PHASE4B_WAVE5_SUMMARY.classificationStage, "PRE_OBSERVATION_DEFAULTS");
  assert.equal(PHASE4B_WAVE5_SUMMARY.observedRepresentations, "CLASSIFIED_AT_REHEARSAL_TIME");
});

test("Phase 4A cardinality gap is fully explained by extractor omissions and one incremental CHECK", () => {
  assert.deepEqual(PHASE4B_WAVE5_PHASE4A_REPORTED_COUNTS, { checks: 297, foreignKeys: 61 });
  assert.equal(PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS.length, 3);
  assert.equal(PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS.length, 68);
  assert.equal(new Set(PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS).size, 3);
  assert.equal(new Set(PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS).size, 68);
  assert.equal(297 + PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS.length, 300);
  assert.equal(61 + PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS.length, 129);
  assert.deepEqual(PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.canonicalIncrementalAdditions.checks, [
    "public.attempts.attempts_canonical_payload_hash_check",
  ]);
  assert.deepEqual(PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.providerEvolutions.checks, [
    "public.attempts.attempts_source_type_check",
  ]);
  assert.deepEqual(PHASE4B_WAVE5_CARDINALITY_RECONCILIATION.adoptionTransitionalRepresentations.checks, [
    "public.exam_results.exam_results_payload_hash_check",
  ]);
  const catalogChecks = new Set(PHASE4B_WAVE5_CHECKS.map((entry) => entry.stableIdentity));
  const catalogForeignKeys = new Set(PHASE4B_WAVE5_FOREIGN_KEYS.map((entry) => entry.identity));
  for (const identity of PHASE4B_WAVE5_RECOVERED_BASELINE_CHECKS) assert.ok(catalogChecks.has(identity), identity);
  for (const identity of PHASE4B_WAVE5_RECOVERED_BASELINE_FOREIGN_KEYS) assert.ok(catalogForeignKeys.has(identity), identity);
});

test("PostgreSQL 18 catalog artifact is complete, deterministic, and collision-free", () => {
  assert.equal(PHASE4B_WAVE5_CATALOG.format, "REFLAB_PHASE4B_WAVE5_EFFECTIVE_CANONICAL_CATALOG_V1");
  assert.equal(PHASE4B_WAVE5_CATALOG.postgresMajor, 18);
  assert.equal(assertNoCanonicalCatalogCollisions(PHASE4B_WAVE5_CATALOG), true);
  assert.equal(PHASE4B_WAVE5_CATALOG.checks.length, 301);
  assert.equal(PHASE4B_WAVE5_CATALOG.foreignKeys.length, 129);
  assert.deepEqual(PHASE4B_WAVE5_CATALOG.baselineExtractionCoverage, {
    checks: { physical: 300, extracted: 300, missing: 0, unexpected: 0 },
    foreignKeys: { physical: 129, extracted: 129, missing: 0, unexpected: 0 },
  });
});

test("effective canonical graph includes only baseline and Production-safe incrementals", () => {
  assert.deepEqual(
    PHASE4B_WAVE5_CATALOG.canonicalGraph.included.map((entry) => entry.file),
    WAVE5_EFFECTIVE_CANONICAL_GRAPH.included.map((entry) => entry.file),
  );
  assert.deepEqual(PHASE4B_WAVE5_CATALOG.canonicalGraph.excludedClassifications, ["production_adoption", "development_only"]);
  assert.ok(PHASE4B_WAVE5_CATALOG.canonicalGraph.included.every((entry) => /^[0-9]{12}_[a-z0-9_]+\.sql$/.test(entry.file) && /^[0-9a-f]{64}$/.test(entry.sha256)));
  assert.ok(PHASE4B_WAVE5_CATALOG.canonicalGraph.included.every((entry) => !entry.file.includes("development") && !entry.file.includes("production_adoption")));
  const graphHash = createHash("sha256").update(`${JSON.stringify(PHASE4B_WAVE5_CATALOG.canonicalGraph, null, 2)}\n`).digest("hex");
  assert.equal(PHASE4B_WAVE5_CATALOG.providerGraphHash, graphHash);
});

test("communication feedback intentionally provides the effective attempts source type contract", () => {
  const contract = PHASE4B_WAVE5_CHECKS.find((entry) => entry.constraintName === "attempts_source_type_check");
  assert.match(contract.expression, /communication_feedback/);
  assert.equal(contract.expressionHash, "a4df5f96b37804dcf146b1584669ef925037d0ea3ebc132a2ee5735b60b59356");
  assert.deepEqual(contract.providerHistory, [
    "202607270000_reflab_canonical_baseline.sql",
    "202608150001_canonical_communication_feedback.sql",
  ]);
  assert.equal(contract.provider, "202608150001_canonical_communication_feedback.sql");
});

test("catalog rendering replaces raw DDL representation for boolean CHECKs", () => {
  const contract = PHASE4B_WAVE5_CHECKS.find((entry) => entry.constraintName === "attempts_source_reference_check");
  assert.match(contract.expression, /^\(\(\(/);
  assert.equal(contract.expressionHash, "46bf222945b352e0d27375ae4430d983d2481075aeb9ed625ed3c6db8f9212a2");
  assert.match(gate, new RegExp(contract.expressionHash));
});

test("wrong PostgreSQL major and structural identity collisions fail closed", () => {
  assert.equal(assertWave5CatalogMajor(18), true);
  assert.throws(() => assertWave5CatalogMajor(17), /unsupported/);
  const duplicate = { ...PHASE4B_WAVE5_CATALOG, checks: [...PHASE4B_WAVE5_CATALOG.checks, PHASE4B_WAVE5_CATALOG.checks[0]] };
  assert.throws(() => assertNoCanonicalCatalogCollisions(duplicate), /identity collision/);
});

test("all FK catalog attributes and ordered columns are explicit", () => {
  for (const entry of PHASE4B_WAVE5_FOREIGN_KEYS) {
    assert.equal(entry.sourceColumns.length, entry.targetColumns.length);
    for (const field of ["matchType", "onUpdate", "onDelete", "deferrable", "initiallyDeferred", "validated"]) assert.notEqual(entry[field], undefined);
  }
});

test("attempts exam source remains the only approved cutover-only CHECK", () => {
  const cutover = PHASE4B_WAVE5_CHECKS.filter((entry) => entry.classification === "CUTOVER_ONLY");
  assert.deepEqual(cutover.map((entry) => entry.identity), ["public.attempts.attempts_exam_source_check"]);
  assert.equal(PHASE4B_WAVE5_SUMMARY.checks.safeInstall, 0);
  assert.equal(PHASE4B_WAVE5_SUMMARY.foreignKeys.safeInstall, 0);
  assert.equal(PHASE4B_WAVE5_SUMMARY.migrationRequired, false);
});

test("Wave 5 data evidence provenance does not promote synthetic fixture rows to Production evidence", () => {
  const notificationStatus = PHASE4B_WAVE5_CHECKS.find((entry) => entry.schema === "public"
    && entry.table === "notification_events"
    && entry.catalogConstraintName === "notification_events_status_check");
  assert.ok(notificationStatus);
  assert.equal(PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE.identity, "public.notification_events.notification_events_status_check");
  assert.equal(notificationStatus.dataEvidence, PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE);
  assert.deepEqual(PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE.canonicalStatuses, ["queued", "sent", "failed", "skipped"]);
  assert.equal(PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE.fixtureStatus, "pending");
  assert.equal(PHASE4B_WAVE5_NOTIFICATION_STATUS_EVIDENCE.productionEvidenceAvailable, false);

  const absent = classifyWave5ObservedCatalog({ checks: [], foreignKeys: [] }, [notificationStatus], []);
  const assessment = assessWave5DataValidation({
    classification: absent.objects[notificationStatus.identity],
    violationCount: 60,
    dataEvidence: notificationStatus.dataEvidence,
  });
  assert.deepEqual(assessment, {
    abort: false,
    decision: "NON_AUTHORITATIVE_FIXTURE_OBSERVATION",
    classification: "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
  });
  assert.notEqual(assessment.classification, "SAFE_INSTALL");
  assert.notEqual(assessment.classification, "LEGACY_REQUIRED_TEMPORARILY");
  assert.notEqual(assessment.classification, "CUTOVER_ONLY");
});

test("reviewed historical and privileged Production violations remain blockers", () => {
  for (const dataEvidence of [
    PHASE4B_WAVE5_DATA_EVIDENCE.REVIEWED_HISTORICAL,
    PHASE4B_WAVE5_DATA_EVIDENCE.PRIVILEGED_PRODUCTION,
  ]) {
    assert.deepEqual(assessWave5DataValidation({
      classification: "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
      violationCount: 1,
      dataEvidence,
    }), {
      abort: true,
      decision: "BLOCKER_DATA_VIOLATION",
      classification: "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE",
    });
  }
});

test("present structural drift aborts independently of data provenance", () => {
  assert.deepEqual(assessWave5DataValidation({
    classification: "SEMANTIC_DRIFT",
    violationCount: 0,
    dataEvidence: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
  }), {
    abort: true,
    decision: "BLOCKER_STRUCTURAL_DRIFT",
    classification: "SEMANTIC_DRIFT",
  });
});

test("shared Phase 2B notification fixture remains explicitly synthetic and unchanged", () => {
  const fixture = readFileSync(resolve(directory, "../phase2b/phase2b-production-fixture.sql"), "utf8");
  assert.match(fixture, /create table public\.notification_events \(id uuid primary key, user_id text not null, status text not null default 'pending'\);/);
  assert.match(fixture, /insert into public\.notification_events \(id, user_id\)[\s\S]*from pg_catalog\.generate_series\(1, 60\) value;/);
  assert.doesNotMatch(fixture, /notification_events_status_check/);
});

test("Wave 5 distinguishes exact, equivalent, absent, and drifted CHECK catalog states", () => {
  const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === "attempts_source_type_check");
  const exact = classifyWave5ObservedCatalog({ checks: [observedCheck(expected)], foreignKeys: [] }, [expected], []);
  assert.equal(exact.objects[expected.identity], "EXACT_CANONICAL");

  const equivalent = classifyWave5ObservedCatalog({
    checks: [observedCheck(expected, { constraintName: "historical_equivalent_name" })], foreignKeys: [],
  }, [expected], []);
  assert.equal(equivalent.objects[expected.identity], "EQUIVALENT_REUSE");
  assert.equal(equivalent.canonicalIdentityCounts.checks, 1);
  assert.deepEqual(equivalent.observedRepresentations.checks.equivalentAliases, [{
    canonicalIdentity: expected.stableIdentity,
    observedIdentity: `${expected.schema}.${expected.table}.historical_equivalent_name`,
  }]);

  const absent = classifyWave5ObservedCatalog({ checks: [], foreignKeys: [] }, [expected], []);
  assert.equal(absent.objects[expected.identity], "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE");

  const drifted = classifyWave5ObservedCatalog({
    checks: [observedCheck(expected, { expressionHash: "0".repeat(64) })], foreignKeys: [],
  }, [expected], []);
  assert.equal(drifted.objects[expected.identity], "SEMANTIC_DRIFT");
});

test("absent reviewed plan CHECKs remain evidence blockers without aborting", () => {
  const names = ["institutions_plan_key_check", "user_profiles_subscription_plan_check"];
  const expected = PHASE4B_WAVE5_CHECKS.filter((entry) => names.includes(entry.catalogConstraintName));
  assert.equal(expected.length, 2);
  const result = classifyWave5ObservedCatalog({ checks: [], foreignKeys: [] }, expected, []);
  for (const entry of expected) {
    assert.equal(result.objects[entry.identity], "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE");
  }
  assert.equal(result.checks.REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE, 2);
  assert.equal(result.checks.SEMANTIC_DRIFT, 0);
});

test("attempts exam source remains cutover-only whether absent or present", () => {
  const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === "attempts_exam_source_check");
  for (const checks of [[], [observedCheck(expected)]]) {
    const result = classifyWave5ObservedCatalog({ checks, foreignKeys: [] }, [expected], []);
    assert.equal(result.objects[expected.identity], "CUTOVER_ONLY");
    assert.equal(result.checks.SEMANTIC_DRIFT, 0);
  }
});

test("reviewed exam payload hash transition is legacy-required only while adoption columns remain nullable", () => {
  const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === "exam_results_payload_hash_check");
  assert.equal(assertWave5ReviewedTransition(expected), true);

  const transitional = observedCheck(expected, {
    expressionHash: PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.expressionHash,
    nullableColumns: [...PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.requiredNullableColumns],
  });
  const result = classifyWave5ObservedCatalog({ checks: [transitional], foreignKeys: [] }, [expected], []);
  assert.equal(result.objects[expected.identity], "LEGACY_REQUIRED_TEMPORARILY");
  assert.equal(result.canonicalIdentityCounts.checks, 1);
  assert.deepEqual(result.observedRepresentations.checks.transitionalStates, [{
    canonicalIdentity: expected.stableIdentity,
    observedIdentity: expected.stableIdentity,
  }]);

  const canonical = classifyWave5ObservedCatalog({ checks: [observedCheck(expected)], foreignKeys: [] }, [expected], []);
  assert.equal(canonical.objects[expected.identity], "EXACT_CANONICAL");
});

test("reviewed exam payload hash transition is bound to PostgreSQL catalog rendering and exact provider", () => {
  const transition = PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION;
  assert.equal(
    createHash("sha256").update(transition.catalogExpression).digest("hex"),
    transition.expressionHash,
  );
  assert.equal(transition.provider, "202608310002_production_adoption_exam_training_prerequisites.sql");
  const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === "exam_results_payload_hash_check");
  assert.throws(() => assertWave5ReviewedTransition({
    ...expected,
    transitionalState: { ...expected.transitionalState, provider: "unexpected_provider.sql" },
  }), /provider or contract drifted/);
});

test("unreviewed exam payload hash expressions and columns remain semantic drift", () => {
  const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === "exam_results_payload_hash_check");
  const base = {
    expressionHash: PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.expressionHash,
    nullableColumns: [...PHASE4B_WAVE5_EXAM_PAYLOAD_HASH_TRANSITION.requiredNullableColumns],
  };
  for (const overrides of [
    { expressionHash: createHash("sha256").update("((payload_hash IS NULL) OR (payload_hash ~ '^[A-F]{64}$'::text))").digest("hex") },
    { expressionHash: createHash("sha256").update("((payload_hash IS NULL) OR (payload_hash ~ '^[0-9a-f]{64}$'::text) OR (payload_hash = 'extra'::text))").digest("hex") },
    { referencedColumns: ["exam_session_id"] },
    { nullableColumns: ["payload_hash"] },
  ]) {
    const observed = observedCheck(expected, { ...base, ...overrides });
    const result = classifyWave5ObservedCatalog({ checks: [observed], foreignKeys: [] }, [expected], []);
    assert.equal(result.objects[expected.identity], "SEMANTIC_DRIFT");
  }
});

test("Wave 5 preserves nullable exam adoption columns and never installs NOT NULL", () => {
  const bridge = readFileSync(resolve(directory, "../../../supabase/migrations/202608310002_production_adoption_exam_training_prerequisites.sql"), "utf8");
  assert.match(bridge, /add column exam_session_id uuid,\s*add column payload_hash text;/i);
  assert.doesNotMatch(bridge, /add column (?:exam_session_id uuid|payload_hash text) not null/i);
  assert.doesNotMatch(gate, /alter\s+table|set\s+not\s+null/i);
});

test("Wave 5 distinguishes absent FKs from present FK semantic drift", () => {
  const expected = PHASE4B_WAVE5_FOREIGN_KEYS.find((entry) => entry.identity === "public.attempts.attempts_exam_result_fk");
  const absent = classifyWave5ObservedCatalog({ checks: [], foreignKeys: [] }, [], [expected]);
  assert.equal(absent.objects[expected.identity], "REQUIRES_PRIVILEGED_PRODUCTION_EVIDENCE");

  const exact = classifyWave5ObservedCatalog({ checks: [], foreignKeys: [observedForeignKey(expected)] }, [], [expected]);
  assert.equal(exact.objects[expected.identity], "EXACT_CANONICAL");

  const equivalent = classifyWave5ObservedCatalog({
    checks: [],
    foreignKeys: [observedForeignKey(expected, { constraintName: "historical_exam_result_fk" })],
  }, [], [expected]);
  assert.equal(equivalent.objects[expected.identity], "EQUIVALENT_REUSE");
  assert.equal(equivalent.canonicalIdentityCounts.foreignKeys, 1);
  assert.deepEqual(equivalent.observedRepresentations.foreignKeys.equivalentAliases, [{
    canonicalIdentity: expected.stableIdentity,
    observedIdentity: canonicalForeignKeyIdentityKey(observedForeignKey(expected, { constraintName: "historical_exam_result_fk" })),
  }]);

  const drifted = classifyWave5ObservedCatalog({
    checks: [], foreignKeys: [observedForeignKey(expected, { onDelete: expected.onDelete === "CASCADE" ? "RESTRICT" : "CASCADE" })],
  }, [], [expected]);
  assert.equal(drifted.objects[expected.identity], "SEMANTIC_DRIFT");
});

test("the generated gate is deterministic, read-only, and evidence-only", () => {
  assert.equal(buildPhase4BWave5GateSql(), gate);
  assert.match(gate, /begin read only;/i);
  assert.match(gate, /rollback;\s*$/i);
  assert.doesNotMatch(gate, /\balter\s+table\b|\bcreate\s+(?:table|index)\b|\bdrop\b/i);
  assert.match(gate, /No CHECK or FK installation is authorized/);
  assert.match(gate, /data_evidence in \('REVIEWED_HISTORICAL','PRIVILEGED_PRODUCTION'\)/);
  assert.match(gate, /data evidence provenance is unsupported/);
  assert.doesNotMatch(gate, /'undefined'/);
});

test("CHECK gate audits validation, NO INHERIT, expression, and aggregate violations", () => {
  for (const token of ["convalidated", "connoinherit", "pg_get_expr", "CHECK data violation"]) assert.match(gate, new RegExp(token));
  assert.match(gate, /where \(%s\) is false/);
  assert.match(gate, /if observed_count > 1 then raise exception 'Wave 5 CHECK provider conflict'/);
  assert.doesNotMatch(gate, /CHECK (?:contract drift|dependency is missing).*institutions_plan_key_check/i);
});

test("FK gate audits complete catalog semantics and aggregate orphans", () => {
  for (const token of ["conkey", "confkey", "confmatchtype", "confupdtype", "confdeltype", "condeferrable", "condeferred", "convalidated", "FK orphan data"]) assert.match(gate, new RegExp(token));
  assert.match(gate, /generate_subscripts\(expected_fk\.source_columns,1\)/);
  assert.doesNotMatch(gate, /unnest\(expected_fk\.source_columns,expected_fk\.target_columns\)/);
});

test("all required negative scenarios inject and prove a mutation", () => {
  assert.equal(PHASE4B_WAVE5_NEGATIVE_SCENARIOS.length, 13);
  for (const scenario of PHASE4B_WAVE5_NEGATIVE_SCENARIOS) {
    assert.ok(wave5NegativeInjectionSql(scenario).length > 0, scenario);
    assert.match(wave5MutationAssertionSql(scenario), /^select/i, scenario);
  }
});

test("FK orphan negative uses authoritative evidence rather than synthetic fixture provenance", () => {
  const scenarioGate = wave5GateSqlForScenario("fk_orphan_data");
  assert.match(scenarioGate, /\('public','attempts','attempts_exam_result_fk',[^\n]+,'PRIVILEGED_PRODUCTION'\)/);
  assert.equal(wave5GateSqlForScenario("fk_wrong_target"), null);
});

test("provider conflict negative creates and verifies two exact competing FK providers", () => {
  const injection = wave5NegativeInjectionSql("provider_conflict");
  const assertionSql = wave5MutationAssertionSql("provider_conflict");
  assert.match(injection, /add constraint attempts_exam_result_fk/);
  assert.match(injection, /add constraint wave5_duplicate_exam_fk/);
  assert.match(assertionSql, /array_agg\(conname order by conname\)/);
  assert.match(assertionSql, /attempts_exam_result_fk.*wave5_duplicate_exam_fk/);
});

test("Wave 5 runner inherits no sensitive PG target variables", () => {
  const runner = readFileSync(resolve(directory, "run-phase4b-wave5-postgres.mjs"), "utf8");
  assert.doesNotMatch(runner, /\.\.\.process\.env|PGPASSWORD|PGOPTIONS|PGSERVICE|PGPASSFILE/);
  assert.match(runner, /spawnSync/);
});

test("fixture completion creates only empty missing relations", () => {
  const sql = buildWave5FixtureSql();
  assert.match(sql, /^begin;/);
  assert.match(sql, /create table if not exists public\./);
  assert.doesNotMatch(sql, /\binsert\b|\balter\s+table\b|\badd\s+constraint\b/i);
});
