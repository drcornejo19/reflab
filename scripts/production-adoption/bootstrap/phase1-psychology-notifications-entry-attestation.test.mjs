import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import {
  PREFLIGHT_DATABASE_URL,
  PREFLIGHT_OPT_IN,
  PREFLIGHT_PROJECT_REF,
  authorizeProductionPreflightTarget,
} from "../../production-preflight/target.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import { installerIdentityQuery } from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_COLUMNS,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS,
  assertPhase1PsychologyNotificationsArtifact,
  classifyExamTrainingPreState,
  classifyPhase1PsychologyNotificationsEntry,
  phase1PsychologyNotificationsEntryQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import { runProductionPhase1PsychologyNotificationsEntryAttestation } from "./run-production-phase1-psychology-notifications-entry-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const artifact = readFileSync(resolve(root, PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT), "utf8");
const installerReady = Object.freeze({ managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" });
const exactChecks = Object.freeze({
  requiredTablesExist: true,
  requiredTablesOwnedByPostgres: true,
  postgresCanCreatePublic: true,
  requiredColumnTypesExact: true,
  futureFkTypeCompatibilityExact: true,
  targetTableAbsent: true,
  targetColumnAbsent: true,
  targetIndexAbsent: true,
  targetConstraintsAbsent: true,
  priorStateVisibilityExact: true,
  dataVisibilityExact: true,
  psychologyDataCompatible: true,
  ledgerExact: true,
  schemaStateEmpty: true,
  canonicalMarkerAbsent: true,
  identityLinksAbsent: true,
  developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: true,
});
const exactExamTrainingChecks = Object.freeze({
  foundationStatePreserved: true,
  targetTableExact: true,
  targetTableColumnsExact: true,
  targetPrimaryKeyExact: true,
  targetTableEmpty: true,
  targetAclExact: true,
  targetColumnsExact: true,
  targetColumnsNullable: true,
  targetIndexesExact: true,
  targetConstraintsExact: true,
  targetCheckSemanticsExact: true,
  targetFkSemanticsExact: true,
  targetUniqueSemanticsExact: true,
  ledgerExact: true,
  schemaStateEmpty: true,
  canonicalMarkerAbsent: true,
  identityLinksAbsent: true,
  developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: true,
  fabricatedAssociationsAbsent: true,
});

function payload(overrides = {}) {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    transaction_read_only: "on",
    server_version_num: 170000,
    checks: exactChecks,
    evidence: { required_table_count: 4, required_column_count: 4, unsupported_module_slug_count: 0 },
    ...overrides,
  };
}

function examTrainingPayload(overrides = {}) {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    transaction_read_only: "on",
    server_version_num: 170000,
    checks: exactExamTrainingChecks,
    counts: {
      target_columns: 6, target_indexes: 3, target_constraints: 20,
      check_constraints: 13, foreign_keys: 5, unique_constraints: 2,
      target_rows: 0, schema_state_rows: 0, ledger_rows: 2,
    },
    ...overrides,
  };
}

function installerEvidence() {
  return {
    caller: "reflab_prod_preflight_ro", session_user: "reflab_prod_preflight_ro",
    server_version_num: 170000,
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: true, rolbypassrls: true, rolreplication: true,
    },
    protected_role: {
      rolname: "reflab_rls_owner", rolcanlogin: false, rolinherit: false,
      rolcreaterole: false, rolsuper: false, rolcreatedb: false, rolbypassrls: false,
    },
    memberships: [
      ["anon", "supabase_admin", true, true, true],
      ["authenticated", "supabase_admin", true, true, true],
      ["authenticator", "supabase_admin", true, true, true],
      ["pg_create_subscription", "supabase_admin", true, true, true],
      ["pg_monitor", "supabase_admin", true, true, true],
      ["pg_read_all_data", "supabase_admin", true, true, true],
      ["pg_signal_backend", "supabase_admin", true, true, true],
      ["reflab_prod_preflight_ro", "supabase_admin", true, false, false],
      ["service_role", "supabase_admin", true, true, true],
      ["supabase_privileged_role", "supabase_admin", false, true, true],
      ["reflab_rls_owner", "supabase_admin", true, false, false],
      ["reflab_rls_owner", "postgres", false, false, true],
    ].map(([granted_role, grantor_role, admin_option, inherit_option, set_option]) => ({
      granted_role, member_role: "postgres", grantor_role,
      admin_option, inherit_option, set_option,
    })),
    membership_summary: { total_count: 12, as_member_count: 12, as_granted_role_count: 0 },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PREFLIGHT_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PREFLIGHT_DATABASE_URL]:
      `postgresql://reflab_prod_preflight_ro:<SET_LOCALLY>@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

function resultMap(overrides = {}) {
  return new Map([
    [installerIdentityQuery.id, installerEvidence()],
    [phase1ProductFingerprintQuery.id, PHASE1_HISTORICAL_FINGERPRINT],
    [PHASE1_EXAM_TRAINING_POST_QUERY_ID, overrides.examTraining ?? examTrainingPayload()],
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID, overrides.entry ?? payload()],
  ]);
}

test("310003 artifact hash and exact scope are pinned", () => {
  assert.equal(assertPhase1PsychologyNotificationsArtifact(root).sha256,
    PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES.length, 4);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_COLUMNS.length, 4);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.tables.length, 1);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.columns.length, 1);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.indexes.length, 1);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.constraints.length, 2);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE.deterministicCatalogRows, 8);
  assert.equal(PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE.historicalProductRowDml, 0);
  assert.doesNotMatch(artifact, /\bcreate\s+(?:or\s+replace\s+)?function\b|\bcreate\s+trigger\b/i);
});

test("310003 attestation batch is SELECT/SHOW only and rollback bounded", () => {
  const sql = buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    phase1ExamTrainingPostQuery,
    phase1PsychologyNotificationsEntryQuery,
  ]);
  const statements = assertReadOnlyBatch(sql);
  assert.ok(statements.every((statement) => /^(?:begin read only|set local|show|select|rollback)\b/i.test(statement)));
  assert.match(sql, /transaction_read_only/i);
  assert.match(sql, /rollback/i);
  assert.doesNotMatch(sql, /\bset\s+role\b/i);
});

test("exact PostgreSQL 17 entry state is PASS", () => {
  const phase2 = classifyExamTrainingPreState(examTrainingPayload(), PHASE1_HISTORICAL_FINGERPRINT);
  const result = classifyPhase1PsychologyNotificationsEntry(payload(), installerReady, phase2);
  assert.equal(phase2, "EXACT");
  assert.equal(result.classification, "PASS");
  assert.equal(result.nextAllowedRemoteOperation, "310003_EXECUTION_REVIEW");
});

for (const field of Object.keys(exactChecks).filter(
  (candidate) => !["priorStateVisibilityExact", "dataVisibilityExact"].includes(candidate),
)) {
  test(`${field} false is BLOCKER`, () => {
    const result = classifyPhase1PsychologyNotificationsEntry(
      payload({ checks: { ...exactChecks, [field]: false } }), installerReady, "EXACT",
    );
    assert.equal(result.classification, "BLOCKER");
    assert.equal(result.nextAllowedRemoteOperation, "NONE");
  });
}

test("incomplete evidence is UNKNOWN and never PASS", () => {
  assert.equal(classifyPhase1PsychologyNotificationsEntry(undefined, installerReady, "EXACT").classification,
    "UNKNOWN");
  assert.equal(classifyPhase1PsychologyNotificationsEntry(
    payload({ checks: { ...exactChecks, psychologyDataCompatible: null } }), installerReady, "EXACT",
  ).classification, "UNKNOWN");
  assert.equal(classifyPhase1PsychologyNotificationsEntry(payload(), installerReady, "UNKNOWN").classification,
    "UNKNOWN");
});

test("unproven RLS visibility is UNKNOWN and never PASS", () => {
  for (const field of ["priorStateVisibilityExact", "dataVisibilityExact"]) {
    const result = classifyPhase1PsychologyNotificationsEntry(
      payload({ checks: { ...exactChecks, [field]: false } }), installerReady, "EXACT",
    );
    assert.equal(result.classification, "UNKNOWN");
    assert.equal(result.nextAllowedRemoteOperation, "NONE");
  }
});

for (const [name, overrides] of [
  ["caller mismatch", { caller: "postgres" }],
  ["session user mismatch", { session_user: "postgres" }],
  ["transaction_read_only off", { transaction_read_only: "off" }],
  ["PostgreSQL major mismatch", { server_version_num: 180000 }],
]) {
  test(`${name} is BLOCKER`, () => {
    assert.equal(classifyPhase1PsychologyNotificationsEntry(
      payload(overrides), installerReady, "EXACT",
    ).classification, "BLOCKER");
  });
}

test("non-exact 310002 or installer state is BLOCKER", () => {
  assert.equal(classifyPhase1PsychologyNotificationsEntry(payload(), installerReady, "BLOCKER").classification,
    "BLOCKER");
  assert.equal(classifyPhase1PsychologyNotificationsEntry(payload(), {
    managedProfile: "BLOCKER", lifecycleState: "POST_BOOTSTRAP",
  }, "EXACT").classification, "BLOCKER");
});

test("runner reuses the exact read-only target path and emits no secrets", () => {
  const result = runProductionPhase1PsychologyNotificationsEntryAttestation(environment(), {
    assertArtifact: () => ({ sha256: PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256 }),
    authorize: () => ({
      projectRef: PRODUCTION_PROJECT_REF,
      host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
      connectionEnvironment: { PGUSER: "reflab_prod_preflight_ro" },
    }),
    execute: (sql, connectionEnvironment) => {
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      assert.equal(connectionEnvironment.PGUSER, "reflab_prod_preflight_ro");
      return resultMap();
    },
  });
  assert.equal(result.classification, "PASS");
  assert.equal(result.preState.examTrainingPrerequisites, "EXACT");
  assert.equal(result.nextAllowedRemoteOperation, "310003_EXECUTION_REVIEW");
  assert.doesNotMatch(JSON.stringify(result), /password|postgresql:\/\//i);
});

test("target and artifact failures abort before SQL", () => {
  let executions = 0;
  assert.throws(() => runProductionPhase1PsychologyNotificationsEntryAttestation(environment({
    [PREFLIGHT_PROJECT_REF]: "not-production",
  }), {
    authorize: authorizeProductionPreflightTarget,
    execute: () => { executions += 1; return new Map(); },
  }), /allowlisted/);
  assert.throws(() => runProductionPhase1PsychologyNotificationsEntryAttestation(environment(), {
    assertArtifact: () => { throw new Error("artifact hash mismatch"); },
    execute: () => { executions += 1; return new Map(); },
  }), /artifact hash mismatch/);
  assert.equal(executions, 0);
});

test("unsafe inherited PG state aborts before SQL", () => {
  let executions = 0;
  assert.throws(() => runProductionPhase1PsychologyNotificationsEntryAttestation(
    environment({ PGOPTIONS: "unsafe" }),
    { execute: () => { executions += 1; return new Map(); } },
  ), /PGOPTIONS/);
  assert.equal(executions, 0);
});

test("runner has no DDL, arbitrary SQL, 310004, or migration continuation path", () => {
  const source = readFileSync(resolve(
    root,
    "scripts/production-adoption/bootstrap/run-production-phase1-psychology-notifications-entry-attestation.mjs",
  ), "utf8");
  assert.match(source, /executeReadOnlyBatch/);
  assert.doesNotMatch(source, /executeMigration|spawnSync|310004|migration\s+(?:up|apply)|supabase\s+db/i);
});
