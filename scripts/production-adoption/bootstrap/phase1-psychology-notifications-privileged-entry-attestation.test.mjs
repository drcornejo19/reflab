import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_QUERY_IDS,
  assertPhase1PsychologyNotificationsPrivilegedArtifacts,
  buildPhase1PsychologyNotificationsPrivilegedBatch,
  classifyPhase1PsychologyNotificationsPrivilegedEntry,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
} from "./production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "./run-production-installer-identity-attestation.mjs";
import {
  authorizeProductionPrivilegedReadOnlyTarget,
  runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation,
} from "./run-production-phase1-psychology-notifications-privileged-entry-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

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
  psychologyDataCompatible: true,
  ledgerExact: true,
  schemaStateEmpty: true,
  canonicalMarkerAbsent: true,
  identityLinksAbsent: true,
  developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: true,
});

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

function installerPayload(overrides = {}) {
  const memberships = ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
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
    memberships,
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

function entryPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170006,
    checks: entryChecks,
    evidence: { required_table_count: 4, required_column_count: 4, unsupported_module_slug_count: 0 },
    ...overrides,
  };
}

function resultMap(overrides = {}) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, overrides.installer ?? installerPayload()],
    [phase1ProductFingerprintQuery.id, overrides.fingerprint ?? PHASE1_HISTORICAL_FINGERPRINT],
    [PHASE1_EXAM_TRAINING_POST_QUERY_ID, overrides.exam ?? examPayload()],
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID, overrides.entry ?? entryPayload()],
  ]);
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: head,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      `postgresql://postgres:<SET_LOCALLY>@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

test("privileged artifacts and 310003 hash are pinned", () => {
  const artifacts = assertPhase1PsychologyNotificationsPrivilegedArtifacts(root);
  assert.equal(artifacts.psychologyNotifications.path, PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT);
  assert.equal(artifacts.psychologyNotifications.sha256, PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256);
});

test("fixed query inventory is exact and cannot accept arbitrary SQL", () => {
  assert.deepEqual(PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_QUERY_IDS, [
    "production_installer_identity",
    "phase1_product_fingerprint",
    "phase1_exam_training_prerequisites_post_attestation",
    "production_phase1_psychology_notifications_entry",
  ]);
  assert.equal(buildPhase1PsychologyNotificationsPrivilegedBatch.length, 0);
});

test("privileged batch is bounded SELECT/SHOW only and always rolls back", () => {
  const sql = buildPhase1PsychologyNotificationsPrivilegedBatch();
  const statements = assertReadOnlyBatch(sql);
  assert.ok(statements.every((statement) => /^(?:begin read only|set local|show|select|rollback)\b/i.test(statement)));
  assert.equal(statements[0].toLowerCase(), "begin read only");
  assert.equal(statements.at(-1).toLowerCase(), "rollback");
  assert.doesNotMatch(sql, /\bset\s+role\b|\bcreate\s+temp\b/i);
});

test("write SQL injection is rejected before execution", () => {
  const sql = buildPhase1PsychologyNotificationsPrivilegedBatch().replace(
    /rollback;\s*$/i,
    "insert into public.attempts default values; rollback;",
  );
  assert.throws(() => assertReadOnlyBatch(sql), /Forbidden SQL keyword/);
});

test("exact privileged post-310002 state is PASS", () => {
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap());
  assert.equal(decision.catalogAttestation, "PASS");
  assert.equal(decision.protectedStateAttestation, "PASS");
  assert.equal(decision.examTrainingState, "EXACT");
  assert.equal(decision.classification, "PASS");
  assert.equal(decision.nextAllowedRemoteOperation, "310003_EXECUTION_REVIEW");
});

for (const [name, field] of [
  ["ledger missing phase 2", "ledgerExact"],
  ["unexpected phase 3 ledger row", "laterPhaseInfrastructureAbsent"],
  ["schema_state non-empty", "schemaStateEmpty"],
  ["canonical marker present", "canonicalMarkerAbsent"],
  ["310003 target partially present", "targetColumnAbsent"],
  ["310004 sidecar present", "laterPhaseInfrastructureAbsent"],
]) {
  test(`${name} is BLOCKER`, () => {
    const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap({
      entry: entryPayload({ checks: { ...entryChecks, [field]: false } }),
    }));
    assert.equal(decision.classification, "BLOCKER");
    assert.equal(decision.nextAllowedRemoteOperation, "NONE");
  });
}

test("310002 structural drift is BLOCKER", () => {
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap({
    exam: examPayload({ checks: { ...examChecks, targetIndexesExact: false } }),
  }));
  assert.equal(decision.classification, "BLOCKER");
});

test("product fingerprint mismatch is BLOCKER", () => {
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap({
    fingerprint: { ...PHASE1_HISTORICAL_FINGERPRINT, attempts: 38 },
  }));
  assert.equal(decision.classification, "BLOCKER");
});

test("installer profile mismatch is BLOCKER", () => {
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap({
    installer: installerPayload({
      installer: { ...installerPayload().installer, rolcreatedb: false },
    }),
  }));
  assert.equal(decision.classification, "BLOCKER");
});

for (const [name, overrides] of [
  ["PostgreSQL major mismatch", { server_version_num: 180000 }],
  ["transaction_read_only off", { transaction_read_only: "off" }],
  ["wrong installer caller", { caller: "reflab_prod_preflight_ro" }],
]) {
  test(`${name} is BLOCKER`, () => {
    const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(resultMap({
      entry: entryPayload(overrides),
    }));
    assert.equal(decision.classification, "BLOCKER");
  });
}

test("incomplete protected evidence remains UNKNOWN", () => {
  const results = resultMap();
  results.delete(PHASE1_EXAM_TRAINING_POST_QUERY_ID);
  const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(results);
  assert.equal(decision.classification, "UNKNOWN");
  assert.equal(decision.nextAllowedRemoteOperation, "NONE");
});

test("privileged target requires independent plus read-only opt-ins", () => {
  const target = authorizeProductionPrivilegedReadOnlyTarget(environment({ ALLOW_PRODUCTION_DDL: "false" }));
  assert.equal(target.projectRef, PRODUCTION_PROJECT_REF);
  assert.equal(target.connectionEnvironment.PGUSER, "postgres");
  assert.equal(target.connectionEnvironment.PGSSLMODE, "require");
  assert.throws(() => authorizeProductionPrivilegedReadOnlyTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "false",
  })), /both explicit read-only opt-ins/);
  assert.throws(() => authorizeProductionPrivilegedReadOnlyTarget(environment({
    [PREFLIGHT_OPT_IN]: "false",
  })), /both explicit read-only opt-ins/);
});

test("wrong project and host fail before SQL", () => {
  assert.throws(() => authorizeProductionPrivilegedReadOnlyTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: "not-production",
  })), /not allowlisted/);
  assert.throws(() => authorizeProductionPrivilegedReadOnlyTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      "postgresql://postgres:<SET_LOCALLY>@example.invalid:5432/postgres?sslmode=require",
  })), /exact allowlisted host/);
});

test("runner enforces operation, HEAD, clean tree, hashes, and fixed batch", () => {
  let executions = 0;
  const dependencies = {
    argument: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifacts: () => ({
      psychologyNotifications: {
        path: PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT,
        sha256: PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256,
      },
    }),
    authorize: () => ({
      projectRef: PRODUCTION_PROJECT_REF,
      host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
      connectionEnvironment: { PGUSER: "postgres" },
    }),
    execute: (sql) => {
      executions += 1;
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      return resultMap();
    },
  };
  const result = runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation(
    environment(), dependencies,
  );
  assert.equal(executions, 1);
  assert.equal(result.classification, "PASS");
  assert.equal(result.target.caller, "postgres");
  assert.equal(result.nextAllowedRemoteOperation, "310003_EXECUTION_REVIEW");
  assert.doesNotMatch(JSON.stringify(result), /password|postgresql:\/\//i);

  for (const badDependencies of [
    { ...dependencies, argument: "--arbitrary" },
    { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M unsafe.sql" },
    { ...dependencies, git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" },
    { ...dependencies, assertArtifacts: () => { throw new Error("artifact hash mismatch"); } },
  ]) {
    assert.throws(() => runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation(
      environment(), badDependencies,
    ));
  }
  assert.equal(executions, 1);
});

test("inherited PostgreSQL state fails before SQL", () => {
  let executions = 0;
  assert.throws(() => runProductionPhase1PsychologyNotificationsPrivilegedEntryAttestation(
    environment({ PGOPTIONS: "unsafe" }),
    {
      argument: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
      execute: () => { executions += 1; return resultMap(); },
    },
  ), /PGOPTIONS/);
  assert.equal(executions, 0);
});

test("runner source has no DDL, arbitrary SQL, or migration continuation path", () => {
  const source = readFileSync(resolve(
    root,
    "scripts/production-adoption/bootstrap/run-production-phase1-psychology-notifications-privileged-entry-attestation.mjs",
  ), "utf8");
  assert.match(source, /executeReadOnlyBatch/);
  assert.match(source, /buildPhase1PsychologyNotificationsPrivilegedBatch\(\)/);
  assert.doesNotMatch(source, /ALLOW_PRODUCTION_DDL|executeMigration|310004|migration\s+(?:up|apply)|supabase\s+db/i);
});

