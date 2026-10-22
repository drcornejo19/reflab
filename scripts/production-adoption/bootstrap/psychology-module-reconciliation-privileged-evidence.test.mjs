import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch, assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PREFLIGHT_OPT_IN, PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT, phase1ProductFingerprintQuery } from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  ROLE_BOOTSTRAP_INSTALLER,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
} from "./production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "./run-production-installer-identity-attestation.mjs";
import {
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_QUERY_IDS,
  assertPrivilegedPsychologyEvidenceOutputSafe,
  assertPrivilegedPsychologyReconciliationArtifacts,
  buildPrivilegedPsychologyReconciliationAggregateBatch,
  buildPrivilegedPsychologyReconciliationCatalogBatch,
  classifyPrivilegedPsychologyReconciliationEvidence,
  shouldRunPrivilegedPsychologyReconciliationAggregate,
} from "./psychology-module-reconciliation-privileged-evidence-contract.mjs";
import {
  PRIVILEGED_PSYCHOLOGY_EVIDENCE_FAILURE_PREFIX,
  authorizePrivilegedPsychologyReconciliationEvidenceTarget,
  formatPrivilegedPsychologyEvidenceFailure,
  runProductionPsychologyModuleReconciliationPrivilegedEvidence,
} from "./run-production-psychology-module-reconciliation-privileged-evidence.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

function installerPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    server_version_num: 170011,
    installer: { rolname: ROLE_BOOTSTRAP_INSTALLER, ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES },
    protected_role: { rolname: ROLE_BOOTSTRAP_ROLE, ...ROLE_BOOTSTRAP_ROLE_ATTRIBUTES },
    memberships: ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.map((entry) => ({
      granted_role: entry.grantedRole,
      member_role: entry.memberRole,
      grantor_role: entry.grantorRole,
      admin_option: entry.adminOption,
      inherit_option: entry.inheritOption,
      set_option: entry.setOption,
    })),
    membership_summary: {
      total_count: ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.length,
      as_member_count: ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.filter(
        (entry) => entry.memberRole === ROLE_BOOTSTRAP_INSTALLER,
      ).length,
      as_granted_role_count: 0,
    },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
    ...overrides,
  };
}

function catalogPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170011,
    checks: {
      required_tables_exist: true,
      required_tables_owned_by_postgres: true,
      source_column_types_exact: true,
      module_slug_absent_exact: true,
      target_310003_infrastructure_absent: true,
      data_visibility_exact: true,
    },
    counts: {
      required_tables: 3,
      source_columns: 2,
      module_slug_columns_present: 0,
      target_310003_objects_present: 0,
    },
    ...overrides,
  };
}

function tablePayload(table, overrides = {}) {
  const source = table === "public.psychology_checkins" ? "checkin_type"
    : table === "public.psychology_exercise_sessions" ? "exercise_type" : null;
  return {
    table,
    source_field: source,
    total_rows: 0,
    source_counts: [],
    mapped_counts: source === null ? [{ slug: "resiliencia", count: 0 }] : [],
    mapped_row_count: 0,
    unmapped_row_count: 0,
    ambiguous_row_count: 0,
    null_source_count: 0,
    unexpected_value_count: 0,
    ...overrides,
  };
}

function aggregatePayload(tables = [
  tablePayload("public.psychology_checkins"),
  tablePayload("public.psychology_wellbeing_assessments"),
  tablePayload("public.psychology_exercise_sessions"),
], overrides = {}) {
  return { caller: "postgres", session_user: "postgres", transaction_read_only: "on", tables, ...overrides };
}

function evidenceMaps({ installer = installerPayload(), catalog = catalogPayload(), aggregate = aggregatePayload(), fingerprint = PHASE1_HISTORICAL_FINGERPRINT } = {}) {
  return {
    catalog: new Map([
      [INSTALLER_IDENTITY_QUERY_ID, installer],
      [phase1ProductFingerprintQuery.id, fingerprint],
      [PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID, catalog],
    ]),
    aggregate: aggregate === undefined ? undefined : new Map([
      [PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID, aggregate],
    ]),
  };
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]: `postgresql://postgres.${PRODUCTION_PROJECT_REF}:secret@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
    [PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD]: head,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

test("provider, 310003, and exact four-query inventory are pinned", () => {
  const artifacts = assertPrivilegedPsychologyReconciliationArtifacts(root);
  assert.equal(artifacts.provider.sha256, "f266e11958767dbae85e164c60c2439cc2a45cc00b302f6493469772537eadaa");
  assert.equal(artifacts.target.sha256, "b50a6fa0982244e3332d18b5354e146ab4cc202752612cce4897d0e17b1cd04e");
  assert.equal(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_QUERY_IDS.length, 4);
  assert.equal(new Set(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_QUERY_IDS).size, 4);
});

test("both batches are fixed, bounded, read-only, and expose no unknown category literals", () => {
  for (const sql of [buildPrivilegedPsychologyReconciliationCatalogBatch(), buildPrivilegedPsychologyReconciliationAggregateBatch()]) {
    const statements = assertReadOnlyBatch(sql);
    assert.equal(statements[0].toLowerCase(), "begin read only");
    assert.equal(statements.at(-1).toLowerCase(), "rollback");
    assert.doesNotMatch(sql, /\bset\s+role\b|\bcreate\s+temp\b|\b(?:insert|update|delete|alter|drop|grant|revoke)\b/i);
  }
  const aggregateSql = buildPrivilegedPsychologyReconciliationAggregateBatch();
  assert.match(aggregateSql, /unexpected_value_count/);
  assert.doesNotMatch(aggregateSql, /unexpected_source_values|redacted_unexpected/);
});

test("all empty tables authorize OPTION_A_ONLY", () => {
  const maps = evidenceMaps();
  const result = classifyPrivilegedPsychologyReconciliationEvidence(maps.catalog, maps.aggregate);
  assert.equal(result.classification, "PASS");
  assert.equal(result.reconciliationEligibility, "OPTION_A_ONLY");
  assert.ok(result.tables.every((entry) => entry.classification === "EMPTY"));
});

test("deterministic complete data authorizes OPTION_B_ELIGIBLE", () => {
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
      total_rows: 4,
      source_counts: [{ value: "focus_reset", count: 1 }, { value: "pressure_scenario", count: 1 }, { value: "self_talk", count: 1 }, { value: "team_prebrief", count: 1 }],
      mapped_counts: [{ slug: "concentracion-foco", count: 1 }, { slug: "confianza-arbitral", count: 1 }, { slug: "preparacion-mental-pre-partido", count: 1 }, { slug: "presion-competitiva", count: 1 }],
      mapped_row_count: 4,
    }),
  ];
  const maps = evidenceMaps({ aggregate: aggregatePayload(tables) });
  const result = classifyPrivilegedPsychologyReconciliationEvidence(maps.catalog, maps.aggregate);
  assert.equal(result.classification, "PASS");
  assert.equal(result.reconciliationEligibility, "OPTION_B_ELIGIBLE");
  assert.equal(result.metrics.length, 3);
  assert.deepEqual(result.historicalFingerprint, PHASE1_HISTORICAL_FINGERPRINT);
});

test("a canonical but incorrect mapped slug is insufficient evidence", () => {
  const tables = aggregatePayload().tables;
  tables[0] = tablePayload(tables[0].table, {
    total_rows: 1,
    source_counts: [{ value: "pre_match", count: 1 }],
    mapped_counts: [{ slug: "resiliencia", count: 1 }],
    mapped_row_count: 1,
  });
  const maps = evidenceMaps({ aggregate: aggregatePayload(tables) });
  const result = classifyPrivilegedPsychologyReconciliationEvidence(maps.catalog, maps.aggregate);
  assert.equal(result.classification, "BLOCKER");
  assert.equal(result.reconciliationEligibility, "BLOCKER");
  assert.equal(result.tables[0].classification, "INSUFFICIENT_EVIDENCE");
});

for (const [name, index, overrides] of [
  ["checkin_type NULL", 0, { total_rows: 1, unmapped_row_count: 1, null_source_count: 1 }],
  ["exercise_type NULL", 2, { total_rows: 1, unmapped_row_count: 1, null_source_count: 1 }],
  ["unknown checkin category", 0, { total_rows: 1, unmapped_row_count: 1, unexpected_value_count: 1 }],
  ["unknown exercise category", 2, { total_rows: 1, unmapped_row_count: 1, unexpected_value_count: 1 }],
]) {
  test(`${name} requires manual mapping without returning the value`, () => {
    const tables = aggregatePayload().tables;
    tables[index] = tablePayload(tables[index].table, overrides);
    const maps = evidenceMaps({ aggregate: aggregatePayload(tables) });
    const result = classifyPrivilegedPsychologyReconciliationEvidence(maps.catalog, maps.aggregate);
    assert.equal(result.classification, "BLOCKER");
    assert.equal(result.reconciliationEligibility, "MANUAL_MAPPING_REQUIRED");
    assert.equal(result.tables[index].classification, "DETERMINISTIC_WITH_UNMAPPED_ROWS");
  });
}

test("ambiguous evidence is BLOCKER", () => {
  const tables = aggregatePayload().tables;
  tables[0] = tablePayload(tables[0].table, { ambiguous_row_count: 1 });
  const maps = evidenceMaps({ aggregate: aggregatePayload(tables) });
  assert.equal(classifyPrivilegedPsychologyReconciliationEvidence(
    maps.catalog, maps.aggregate,
  ).reconciliationEligibility, "BLOCKER");
});

for (const [name, field, countField, count] of [
  ["partial module_slug", "module_slug_absent_exact", "module_slug_columns_present", 1],
  ["missing source column", "source_column_types_exact", "source_columns", 1],
  ["wrong source type", "source_column_types_exact", "source_columns", 2],
  ["partial 310003 infrastructure", "target_310003_infrastructure_absent", "target_310003_objects_present", 1],
  ["visibility failure", "data_visibility_exact", "required_tables", 3],
]) {
  test(`${name} blocks before aggregate execution`, () => {
    const base = catalogPayload();
    const catalog = catalogPayload({
      checks: { ...base.checks, [field]: false },
      counts: { ...base.counts, [countField]: count },
    });
    const maps = evidenceMaps({ catalog, aggregate: undefined });
    assert.equal(shouldRunPrivilegedPsychologyReconciliationAggregate(maps.catalog), false);
    assert.equal(classifyPrivilegedPsychologyReconciliationEvidence(
      maps.catalog, maps.aggregate,
    ).classification, "BLOCKER");
  });
}

for (const [name, overrides] of [
  ["transaction_read_only off", { catalog: catalogPayload({ transaction_read_only: "off" }) }],
  ["wrong PostgreSQL major", { catalog: catalogPayload({ server_version_num: 180003 }) }],
  ["wrong installer profile", { installer: installerPayload({ installer: { rolname: "postgres", ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES, rolcreatedb: false } }) }],
  ["historical fingerprint drift", { fingerprint: { ...PHASE1_HISTORICAL_FINGERPRINT, attempts: 38 } }],
]) {
  test(`${name} is BLOCKER`, () => {
    const maps = evidenceMaps(overrides);
    assert.equal(classifyPrivilegedPsychologyReconciliationEvidence(
      maps.catalog, maps.aggregate,
    ).classification, "BLOCKER");
  });
}

test("PII/raw-row output and arbitrary SQL are rejected", () => {
  assert.throws(() => assertPrivilegedPsychologyEvidenceOutputSafe({ raw_rows: [] }), /forbidden/);
  assert.throws(() => assertPrivilegedPsychologyEvidenceOutputSafe({ tables: [{ user_id: "x" }] }), /forbidden/);
  assert.throws(() => assertReadOnlySql("begin read only; select 1; update public.x set y=1; rollback;"), /Forbidden/);
});

test("managed postgres target needs three read-only opt-ins and rejects DDL opt-in", () => {
  const target = authorizePrivilegedPsychologyReconciliationEvidenceTarget(environment());
  assert.equal(target.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(target.connectionEnvironment.PGUSER, `postgres.${PRODUCTION_PROJECT_REF}`);
  assert.equal(target.connectionEnvironment.PGSSLMODE, "require");
  for (const variable of [
    PREFLIGHT_OPT_IN,
    PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
    PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN,
  ]) {
    assert.throws(() => authorizePrivilegedPsychologyReconciliationEvidenceTarget(
      environment({ [variable]: "false" }),
    ), /opt-ins/);
  }
  assert.throws(() => authorizePrivilegedPsychologyReconciliationEvidenceTarget(
    environment({ ALLOW_PRODUCTION_DDL: "true" }),
  ), /rejects/);
});

test("wrong project and wrong host fail closed", () => {
  assert.throws(() => authorizePrivilegedPsychologyReconciliationEvidenceTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: "wrong-project",
  })));
  assert.throws(() => authorizePrivilegedPsychologyReconciliationEvidenceTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      "postgresql://postgres:secret@example.com:5432/postgres?sslmode=require",
  })));
});

test("runner is fixed, clean-HEAD pinned, aggregate-gated, and emits no secret", () => {
  const maps = evidenceMaps();
  let executions = 0;
  const dependencies = {
    argument: PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifacts: () => ({ provider: { sha256: "provider" }, target: { sha256: "target" } }),
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "aws-0-us-east-1.pooler.supabase.com", connectionEnvironment: {} }),
    execute: (sql) => {
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      executions += 1;
      return executions === 1 ? maps.catalog : maps.aggregate;
    },
  };
  const output = runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), dependencies,
  );
  assert.equal(output.classification, "PASS");
  assert.equal(output.reconciliationEligibility, "OPTION_A_ONLY");
  assert.equal(executions, 2);
  assert.equal(output.metrics.length, 3);
  assert.doesNotMatch(JSON.stringify(output), /postgresql:\/\/|secret/i);

  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...dependencies, argument: "--arbitrary" },
  ));
  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M drift.sql" },
  ));
  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...dependencies, assertArtifacts: () => { throw new Error("hash mismatch"); } },
  ), (error) => error.stage === "SQL_BUILD" && error.reason === "PINNED_ARTIFACT_REJECTED");
});

test("database and framing failures receive finite safe stages without raw stderr", () => {
  const maps = evidenceMaps();
  const base = {
    argument: PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifacts: () => ({ provider: {}, target: {} }),
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "db.example", connectionEnvironment: {} }),
  };
  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...base, execute: () => { throw new Error(""); } },
  ), (error) => error.stage === "PSQL_EXECUTION" && error.reason === "CATALOG_BATCH_FAILED");
  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...base, execute: () => { throw new Error("invalid result frame for query x"); } },
  ), (error) => error.stage === "QUERY_RESULT_PARSE" && error.reason === "CATALOG_BATCH_FAILED");
  assert.doesNotMatch(formatPrivilegedPsychologyEvidenceFailure(new Error("postgresql://secret")), /postgresql|secret/i);
  assert.match(formatPrivilegedPsychologyEvidenceFailure(new Error("")), /stage=ERROR_SANITIZATION\nreason=SAFE_DIAGNOSTIC_UNAVAILABLE/);

  let calls = 0;
  const aggregateFailure = () => {
    calls += 1;
    if (calls === 1) return maps.catalog;
    throw new Error("sensitive raw stderr must not escape");
  };
  assert.throws(() => runProductionPsychologyModuleReconciliationPrivilegedEvidence(
    environment(), { ...base, execute: aggregateFailure },
  ), (error) => error.stage === "PSQL_EXECUTION" && error.reason === "AGGREGATE_BATCH_FAILED");
});

test("CLI exit 1 always includes a safe stage and reason", () => {
  const runner = resolve(root,
    "scripts/production-adoption/bootstrap/run-production-psychology-module-reconciliation-privileged-evidence.mjs");
  const result = spawnSync(process.execPath, [
    runner,
    PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION,
  ], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`^${PRIVILEGED_PSYCHOLOGY_EVIDENCE_FAILURE_PREFIX}:`));
  assert.match(result.stderr, /stage=(?:HEAD_ATTESTATION|TARGET_GUARD)/);
  assert.match(result.stderr, /reason=[A-Z][A-Z0-9_]+/);
  assert.doesNotMatch(result.stderr, /postgresql:\/\/|password|secret/i);
});

test("runner source has no DDL, arbitrary SQL, migration, or SET ROLE path", () => {
  const source = readFileSync(resolve(root,
    "scripts/production-adoption/bootstrap/run-production-psychology-module-reconciliation-privileged-evidence.mjs"), "utf8");
  assert.match(source, /resolveProductionManagedPostgresTarget/);
  assert.match(source, /executeReadOnlyBatch/);
  assert.doesNotMatch(source, /executeMigration|readFileSync|migration\s+(?:up|apply)|310004|setRole/i);
});
