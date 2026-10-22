import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PREFLIGHT_DATABASE_URL, PREFLIGHT_OPT_IN, PREFLIGHT_PROJECT_REF } from "../../production-preflight/target.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import {
  CANONICAL_PSYCHOLOGY_MODULE_SLUGS,
  PSYCHOLOGY_MODULE_MAPPINGS,
  PSYCHOLOGY_NOTIFICATIONS_SHA256,
  PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
  PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN,
  PSYCHOLOGY_RECONCILIATION_QUERY_IDS,
  assertPsychologyEvidenceOutputSafe,
  assertPsychologyReconciliationArtifacts,
  buildPsychologyReconciliationAggregateBatch,
  buildPsychologyReconciliationCatalogBatch,
  classifyPsychologyReconciliationEvidence,
  shouldRunPsychologyReconciliationAggregate,
} from "./psychology-module-reconciliation-evidence-contract.mjs";
import {
  authorizePsychologyReconciliationEvidenceTarget,
  runProductionPsychologyModuleReconciliationEvidence,
} from "./run-production-psychology-module-reconciliation-evidence.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

function catalogPayload(overrides = {}) {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    transaction_read_only: "on",
    server_version_num: 170011,
    tables: PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => ({
      table: entry.table, present: true, can_select: true, rls_applies: false,
    })),
    source_columns: [
      { table: "public.psychology_checkins", column: "checkin_type", expected_type: "text", observed_type: "text", not_null: true },
      { table: "public.psychology_exercise_sessions", column: "exercise_type", expected_type: "text", observed_type: "text", not_null: true },
    ],
    module_slug_columns: PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => ({
      table: entry.table, present: false, observed_type: null, not_null: null,
    })),
    checks: {
      required_tables_exist: true,
      source_column_types_exact: true,
      module_slug_absent_exact: true,
      data_visibility_exact: true,
    },
    ...overrides,
  };
}

function tablePayload(table, overrides = {}) {
  const sourceField = PSYCHOLOGY_MODULE_MAPPINGS.find((entry) => entry.table === table).sourceField;
  return {
    table,
    source_field: sourceField,
    total_rows: 0,
    source_counts: [],
    mapped_counts: sourceField === null ? [{ slug: "resiliencia", count: 0 }] : [],
    mapped_row_count: 0,
    unmapped_row_count: 0,
    ambiguous_row_count: 0,
    null_source_count: 0,
    unexpected_source_values: [],
    redacted_unexpected_source_count: 0,
    ...overrides,
  };
}

function resultMap(catalog = catalogPayload(), tables = PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => tablePayload(entry.table))) {
  return {
    catalog: new Map([[PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID, catalog]]),
    aggregate: new Map([[PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID, {
      transaction_read_only: "on", tables,
    }]]),
  };
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN]: "true",
    [PREFLIGHT_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PREFLIGHT_DATABASE_URL]: `postgresql://reflab_prod_preflight_ro:secret@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    [PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD]: head,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

test("historical provider, 310003, mappings, and eight canonical slugs are pinned", () => {
  const artifacts = assertPsychologyReconciliationArtifacts(root);
  assert.equal(artifacts.target.sha256, PSYCHOLOGY_NOTIFICATIONS_SHA256);
  assert.equal(CANONICAL_PSYCHOLOGY_MODULE_SLUGS.length, 8);
  assert.deepEqual(PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => entry.sourceField), [
    "checkin_type", null, "exercise_type",
  ]);
});

test("provider history distinguishes pre-module tables, nullable evolution, and canonical final FKs", () => {
  const initialFiles = [
    "202606160001_psychology_checkins.sql",
    "202606160002_psychology_wellbeing_assessments.sql",
    "202606160003_psychology_exercise_sessions.sql",
  ];
  for (const filename of initialFiles) {
    const sql = readFileSync(resolve(root, "supabase", "migrations", filename), "utf8");
    assert.doesNotMatch(sql, /\bmodule_slug\b/i);
  }
  const provider = readFileSync(resolve(root,
    "supabase/migrations/202606240001_psychology_module_categories.sql"), "utf8");
  assert.equal((provider.match(/add column if not exists module_slug text/g) ?? []).length, 3);
  assert.equal((provider.match(/update public\.psychology_/g) ?? []).length, 3);
  assert.doesNotMatch(provider, /module_slug\s+text\s+not\s+null/i);

  const baseline = readFileSync(resolve(root,
    "supabase/migrations/202607270000_reflab_canonical_baseline.sql"), "utf8");
  assert.ok((baseline.match(/module_slug text not null/g) ?? []).length >= 3);
  for (const constraint of [
    "psychology_checkins_module_fk",
    "psychology_wellbeing_module_fk",
    "psychology_exercise_module_fk",
  ]) assert.match(baseline, new RegExp(`add constraint ${constraint}`));

  const target = readFileSync(resolve(root,
    "supabase/migrations/202608310003_production_adoption_psychology_notifications_prerequisites.sql"), "utf8");
  assert.doesNotMatch(target, /alter table public\.psychology_(?:checkins|wellbeing_assessments|exercise_sessions)\s+add column module_slug/i);
  assert.doesNotMatch(target, /add constraint psychology_(?:checkins|wellbeing|exercise)_module_fk/i);
});

test("fixed two-query inventory is read-only and aggregate-only", () => {
  assert.deepEqual(PSYCHOLOGY_RECONCILIATION_QUERY_IDS, [
    PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
    PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID,
  ]);
  for (const sql of [buildPsychologyReconciliationCatalogBatch(), buildPsychologyReconciliationAggregateBatch()]) {
    const statements = assertReadOnlyBatch(sql);
    assert.equal(statements[0].toLowerCase(), "begin read only");
    assert.equal(statements.at(-1).toLowerCase(), "rollback");
    assert.doesNotMatch(sql, /\bset\s+role\b|\bcreate\s+temp\b|\buser_id\b/i);
  }
  assert.match(buildPsychologyReconciliationCatalogBatch(),
    /bool_and\(observed_type is not null and observed_type = expected_type\)/i);
});

test("all three empty tables classify EMPTY and PASS", () => {
  const results = resultMap();
  const decision = classifyPsychologyReconciliationEvidence(results.catalog, results.aggregate);
  assert.equal(decision.classification, "PASS");
  assert.deepEqual(decision.tables.map((entry) => entry.classification), ["EMPTY", "EMPTY", "EMPTY"]);
});

test("deterministic complete mappings classify PASS", () => {
  const tables = [
    tablePayload("public.psychology_checkins", {
      total_rows: 3,
      source_counts: [{ value: "error_recovery", count: 1 }, { value: "post_match", count: 1 }, { value: "pre_match", count: 1 }],
      mapped_counts: [{ slug: "evaluacion-post-partido", count: 1 }, { slug: "gestion-error", count: 1 }, { slug: "preparacion-mental-pre-partido", count: 1 }],
      mapped_row_count: 3,
    }),
    tablePayload("public.psychology_wellbeing_assessments", {
      total_rows: 2, mapped_counts: [{ slug: "resiliencia", count: 2 }], mapped_row_count: 2,
    }),
    tablePayload("public.psychology_exercise_sessions", {
      total_rows: 2,
      source_counts: [{ value: "focus_reset", count: 1 }, { value: "self_talk", count: 1 }],
      mapped_counts: [{ slug: "concentracion-foco", count: 1 }, { slug: "confianza-arbitral", count: 1 }],
      mapped_row_count: 2,
    }),
  ];
  const results = resultMap(catalogPayload(), tables);
  const decision = classifyPsychologyReconciliationEvidence(results.catalog, results.aggregate);
  assert.equal(decision.classification, "PASS");
  assert.ok(decision.tables.every((entry) => entry.classification === "DETERMINISTIC_COMPLETE"));
});

for (const [name, overrides, expected] of [
  ["unexpected category", {
    total_rows: 1, mapped_row_count: 0, unmapped_row_count: 1,
    unexpected_source_values: [{ value: "unexpected_category", count: 1 }],
  }, "DETERMINISTIC_WITH_UNMAPPED_ROWS"],
  ["null source", {
    total_rows: 1, mapped_row_count: 0, unmapped_row_count: 1, null_source_count: 1,
  }, "DETERMINISTIC_WITH_UNMAPPED_ROWS"],
  ["ambiguous mapping", {
    total_rows: 1, source_counts: [{ value: "pre_match", count: 1 }],
    mapped_counts: [{ slug: "preparacion-mental-pre-partido", count: 1 }],
    mapped_row_count: 1, ambiguous_row_count: 1,
  }, "AMBIGUOUS"],
]) {
  test(`${name} fails closed`, () => {
    const tables = PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => tablePayload(entry.table));
    tables[0] = tablePayload("public.psychology_checkins", overrides);
    const results = resultMap(catalogPayload(), tables);
    const decision = classifyPsychologyReconciliationEvidence(results.catalog, results.aggregate);
    assert.equal(decision.tables[0].classification, expected);
    assert.equal(decision.classification, "BLOCKER");
  });
}

test("missing source column and partial module_slug are BLOCKER and skip aggregates", () => {
  for (const field of ["source_column_types_exact", "module_slug_absent_exact"]) {
    const catalog = catalogPayload({ checks: { ...catalogPayload().checks, [field]: false } });
    const results = new Map([[PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID, catalog]]);
    assert.equal(shouldRunPsychologyReconciliationAggregate(results), false);
    assert.equal(classifyPsychologyReconciliationEvidence(results).classification, "BLOCKER");
  }
});

test("RLS-hidden data requires a privileged read-only boundary and never PASSes", () => {
  const catalog = catalogPayload({ checks: { ...catalogPayload().checks, data_visibility_exact: false } });
  const results = new Map([[PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID, catalog]]);
  assert.equal(shouldRunPsychologyReconciliationAggregate(results), false);
  const decision = classifyPsychologyReconciliationEvidence(results);
  assert.equal(decision.classification, "PRIVILEGED_READ_ONLY_REQUIRED");
});

test("transaction_read_only off is BLOCKER", () => {
  const results = resultMap(catalogPayload({ transaction_read_only: "off" }));
  assert.equal(classifyPsychologyReconciliationEvidence(results.catalog, results.aggregate).classification, "BLOCKER");
});

test("PII or unsafe categorical output is rejected", () => {
  assert.throws(() => assertPsychologyEvidenceOutputSafe({ tables: [{ user_id: "forbidden" }] }), /PII/);
  assert.throws(() => assertPsychologyEvidenceOutputSafe({
    tables: [{ unexpected_source_values: [{ value: "free text@example.com", count: 1 }] }],
  }), /unsafe categorical/);
});

test("target guard reuses approved preflight path with independent opt-in", () => {
  const target = authorizePsychologyReconciliationEvidenceTarget(environment());
  assert.equal(target.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(target.connectionEnvironment.PGUSER, "reflab_prod_preflight_ro");
  assert.equal(target.connectionEnvironment.PGSSLMODE, "require");
  assert.throws(() => authorizePsychologyReconciliationEvidenceTarget(environment({
    [PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN]: "false",
  })), /both explicit/);
});

test("runner accepts only fixed batches, exact operation, clean HEAD, and pinned artifacts", () => {
  const maps = resultMap();
  let executions = 0;
  const dependencies = {
    argument: PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifacts: () => ({ provider: { sha256: "provider" }, target: { sha256: PSYCHOLOGY_NOTIFICATIONS_SHA256 } }),
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`, connectionEnvironment: {} }),
    execute: (sql) => {
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      executions += 1;
      return executions === 1 ? maps.catalog : maps.aggregate;
    },
  };
  const output = runProductionPsychologyModuleReconciliationEvidence(environment(), dependencies);
  assert.equal(output.classification, "PASS");
  assert.equal(executions, 2);
  assert.doesNotMatch(JSON.stringify(output), /postgresql:\/\/|secret/i);
  for (const bad of [
    { ...dependencies, argument: "--arbitrary" },
    { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M unsafe.sql" },
    { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" },
  ]) {
    assert.throws(() => runProductionPsychologyModuleReconciliationEvidence(environment(), bad));
  }
});

test("runner source contains no privileged or arbitrary execution path", () => {
  const source = readFileSync(resolve(root,
    "scripts/production-adoption/bootstrap/run-production-psychology-module-reconciliation-evidence.mjs"), "utf8");
  assert.match(source, /authorizeProductionPreflightTarget/);
  assert.match(source, /executeReadOnlyBatch/);
  assert.doesNotMatch(source, /production.*ddl|setRole|executeMigration|310004|migration\s+(?:up|apply)/i);
});
