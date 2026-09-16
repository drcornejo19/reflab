import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PRODUCTION_PROJECT_REF, migrationManifest } from "../../production-preflight/manifest.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import { PHASE1_EXAM_TRAINING_POST_QUERY_ID } from "./phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
} from "./production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "./run-production-installer-identity-attestation.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
} from "./run-production-role-bootstrap.mjs";
import {
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_ARTIFACT,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_LEDGER_DECISION,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MAPPING,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MUTATIONS,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID,
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_SHA256,
  assertPsychologyModuleSlugReconciliationArtifact,
  classifyPsychologyModuleSlugReconciliationPost,
  classifyPsychologyModuleSlugReconciliationPre,
} from "./psychology-module-slug-reconciliation-ddl-contract.mjs";
import {
  buildPsychologyModuleSlugReconciliationPostBatch,
  buildPsychologyModuleSlugReconciliationPreBatch,
  buildPsychologyModuleSlugReconciliationReentryDataBatch,
  runProductionPsychologyModuleSlugReconciliation,
} from "./run-production-psychology-module-slug-reconciliation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

const examChecks = Object.freeze({
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

const entryChecks = Object.freeze({
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
  psychologyDataCompatible: null,
  ledgerExact: true,
  schemaStateEmpty: true,
  canonicalMarkerAbsent: true,
  identityLinksAbsent: true,
  developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: true,
});

function installerPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    server_version_num: 170006,
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: true, rolbypassrls: true, rolreplication: true,
    },
    protected_role: {
      rolname: "reflab_rls_owner", rolcanlogin: false, rolinherit: false,
      rolcreaterole: false, rolsuper: false, rolcreatedb: false, rolbypassrls: false,
    },
    memberships: ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.map((membership) => ({
      granted_role: membership.grantedRole,
      member_role: membership.memberRole,
      grantor_role: membership.grantorRole,
      admin_option: membership.adminOption,
      inherit_option: membership.inheritOption,
      set_option: membership.setOption,
    })),
    membership_summary: { total_count: 12, as_member_count: 12, as_granted_role_count: 0 },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
    ...overrides,
  };
}

function examPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170006,
    checks: examChecks,
    counts: {
      target_columns: 6, target_indexes: 3, target_constraints: 20,
      check_constraints: 13, foreign_keys: 5, unique_constraints: 2,
      target_rows: 0, schema_state_rows: 0, ledger_rows: 2,
    },
    ...overrides,
  };
}

function prePayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170006,
    checks: {
      tablesExact: true, ownersExact: true, sourceColumnsExact: true,
      moduleSlugColumnsAbsent: true, ledgerExact: true, schemaStateEmpty: true,
      canonicalMarkerAbsent: true, psychologyModulesAbsent: true,
      laterInfrastructureAbsent: true, developmentObjectsAbsent: true,
      psychologyEvidenceExact: true,
    },
    counts: {
      checkins: 3, error_recovery: 1, post_match: 1, pre_match: 1,
      wellbeing: 0, exercise_sessions: 0,
    },
    ...overrides,
  };
}

function postPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170006,
    columns: ["psychology_checkins", "psychology_exercise_sessions", "psychology_wellbeing_assessments"]
      .map((table) => ({ table: `public.${table}`, ordinal: 1, type: "text", not_null: false,
        default: null, identity: "", generated: "", appended_last: true })),
    checks: {
      columnsExact: true, psychologyDataExact: true, emptyTablesPreserved: true,
      ledgerExact: true, schemaStateEmpty: true, canonicalMarkerAbsent: true,
      psychologyModulesAbsent: true, laterInfrastructureAbsent: true,
      developmentObjectsAbsent: true,
    },
    counts: {
      checkins: 3, null_module_slug: 0, gestion_error: 1,
      evaluacion_post_partido: 1, preparacion_mental_pre_partido: 1,
      wellbeing: 0, exercise_sessions: 0,
    },
    ...overrides,
  };
}

function entryPayload() {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170006, checks: entryChecks,
    evidence: { required_table_count: 4, required_column_count: 4, unsupported_module_slug_count: null },
  };
}

function dataPayload() {
  return new Map([[PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID, {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    unsupported_module_slug_count: 0,
  }]]);
}

function preResults(installer = installerPayload(), pre = prePayload()) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, installer],
    [phase1ProductFingerprintQuery.id, PHASE1_HISTORICAL_FINGERPRINT],
    [PHASE1_EXAM_TRAINING_POST_QUERY_ID, examPayload()],
    [PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID, pre],
  ]);
}

function postResults() {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, installerPayload()],
    [phase1ProductFingerprintQuery.id, PHASE1_HISTORICAL_FINGERPRINT],
    [PHASE1_EXAM_TRAINING_POST_QUERY_ID, examPayload()],
    [PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID, postPayload()],
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID, entryPayload()],
  ]);
}

test("reconciliation artifact is pinned and 310003 remains unchanged", () => {
  const artifact = assertPsychologyModuleSlugReconciliationArtifact(root);
  assert.equal(artifact.path, PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_ARTIFACT);
  assert.equal(artifact.sha256, PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_SHA256);
  const target = readFileSync(resolve(root,
    "supabase/migrations/202608310003_production_adoption_psychology_notifications_prerequisites.sql"));
  assert.equal(createHash("sha256").update(target).digest("hex"), PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256);
});

test("ledger remains 1/2 and mutation accounting is exact", () => {
  assert.equal(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_LEDGER_DECISION.rowInserted, false);
  assert.deepEqual(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_LEDGER_DECISION.requiredAfter,
    ["foundation/1", "exam_training_prerequisites/2"]);
  assert.deepEqual(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MUTATIONS, {
    psychologyCheckinUpdates: 3, otherProductUpdates: 0, productInserts: 0, productDeletes: 0,
  });
  assert.deepEqual(PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MAPPING, [
    { source: "error_recovery", target: "gestion-error" },
    { source: "post_match", target: "evaluacion-post-partido" },
    { source: "pre_match", target: "preparacion-mental-pre-partido" },
  ]);
});

test("read-only pre/post inventories are bounded", () => {
  for (const sql of [
    buildPsychologyModuleSlugReconciliationPreBatch(),
    buildPsychologyModuleSlugReconciliationPostBatch(),
    buildPsychologyModuleSlugReconciliationReentryDataBatch(),
  ]) {
    assert.doesNotThrow(() => assertReadOnlyBatch(sql));
    assert.doesNotMatch(sql, /\bset\s+role\b|\bcreate\s+temp\b/i);
  }
});

test("pre and post classifiers fail closed", () => {
  const installer = { managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" };
  assert.equal(classifyPsychologyModuleSlugReconciliationPre(
    prePayload(), installer, "EXACT", PHASE1_HISTORICAL_FINGERPRINT,
  ).classification, "PASS");
  assert.equal(classifyPsychologyModuleSlugReconciliationPre(
    prePayload({ checks: { ...prePayload().checks, psychologyEvidenceExact: false } }),
    installer, "EXACT", PHASE1_HISTORICAL_FINGERPRINT,
  ).classification, "BLOCKER");
  assert.equal(classifyPsychologyModuleSlugReconciliationPre(
    undefined, installer, "EXACT", PHASE1_HISTORICAL_FINGERPRINT,
  ).classification, "UNKNOWN");
  assert.equal(classifyPsychologyModuleSlugReconciliationPost(
    postPayload(), installer, "EXACT", PHASE1_HISTORICAL_FINGERPRINT,
    { classification: "PASS", nextAllowedRemoteOperation: "310003_EXECUTION_REVIEW" },
  ).classification, "EXACT");
  assert.equal(classifyPsychologyModuleSlugReconciliationPost(
    postPayload({ checks: { ...postPayload().checks, columnsExact: false } }),
    installer, "EXACT", PHASE1_HISTORICAL_FINGERPRINT,
    { classification: "PASS", nextAllowedRemoteOperation: "310003_EXECUTION_REVIEW" },
  ).classification, "BLOCKER");
});

test("dedicated runner executes only its pinned artifact and stops before 310003", () => {
  const results = [preResults(), postResults(), dataPayload()];
  let readOnlyCalls = 0;
  let migrationCalls = 0;
  const output = runProductionPsychologyModuleSlugReconciliation({
    [PRODUCTION_DDL_APPROVED_HEAD]: head,
  }, {
    argument: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "approved.local", connectionEnvironment: {} }),
    executeReadOnly: () => results[readOnlyCalls++],
    executeMigration: (sql) => {
      migrationCalls += 1;
      assert.equal(sql, assertPsychologyModuleSlugReconciliationArtifact(root).sql);
    },
  });
  assert.equal(migrationCalls, 1);
  assert.equal(readOnlyCalls, 3);
  assert.equal(output.migration, "PASS");
  assert.equal(output.postDdl.psychology310003Entry, "PASS");
  assert.equal(output.nextMigration, "NOT_AUTHORIZED");
});

for (const [name, dependencies, environment = { [PRODUCTION_DDL_APPROVED_HEAD]: head }] of [
  ["dirty worktree", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M drift.sql" }],
  ["artifact hash mismatch", {
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifact: () => { throw new Error("hash mismatch"); },
  }],
  ["wrong target", {
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    authorize: () => { throw new Error("target mismatch"); },
  }],
  ["installer mismatch", {
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "approved.local", connectionEnvironment: {} }),
    executeReadOnly: () => preResults(installerPayload({ installer: {
      ...installerPayload().installer, rolcreaterole: false,
    } })),
  }],
  ["PostgreSQL major mismatch", {
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    authorize: () => ({ projectRef: PRODUCTION_PROJECT_REF, host: "approved.local", connectionEnvironment: {} }),
    executeReadOnly: () => preResults(installerPayload(), prePayload({ server_version_num: 180000 })),
  }],
]) {
  test(`${name} blocks before migration`, () => {
    let migrationCalls = 0;
    assert.throws(() => runProductionPsychologyModuleSlugReconciliation(environment, {
      argument: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
      executeMigration: () => { migrationCalls += 1; },
      ...dependencies,
    }));
    assert.equal(migrationCalls, 0);
  });
}

test("manifest records the reconciliation without changing ledger order semantics", () => {
  const entry = migrationManifest.find((candidate) => candidate.version === "20260901064309");
  assert.equal(entry?.name, "production_adoption_psychology_module_slug_reconciliation");
  assert.equal(entry?.classification, "production_adoption_bridge");
});

test("runner has no arbitrary SQL, glob, apply-all, or automatic 310003 path", () => {
  const source = readFileSync(resolve(root,
    "scripts/production-adoption/bootstrap/run-production-psychology-module-slug-reconciliation.mjs"), "utf8");
  assert.doesNotMatch(source, /process\.argv\[3\]|readdir|glob|supabase\s+(?:db\s+push|migration)|310003.*execute/i);
  assert.match(source, /nextMigration:\s*"NOT_AUTHORIZED"/);
});
