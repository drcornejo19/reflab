import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildSqlBatch } from "../../production-preflight/queries.mjs";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import {
  PREFLIGHT_DATABASE_URL,
  PREFLIGHT_OPT_IN,
  PREFLIGHT_PROJECT_REF,
  authorizeProductionPreflightTarget,
} from "../../production-preflight/target.mjs";
import { installerIdentityQuery } from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_EXAM_TRAINING_ARTIFACT,
  PHASE1_EXAM_TRAINING_CHECK_NAMES,
  PHASE1_EXAM_TRAINING_FK_NAMES,
  PHASE1_EXAM_TRAINING_FK_TYPES,
  PHASE1_EXAM_TRAINING_REQUIRED_TABLES,
  PHASE1_EXAM_TRAINING_SHA256,
  PHASE1_EXAM_TRAINING_SOURCE_COLUMNS,
  PHASE1_EXAM_TRAINING_TARGET_COLUMNS,
  PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS,
  PHASE1_EXAM_TRAINING_TARGET_INDEXES,
  PHASE1_EXAM_TRAINING_UNIQUE_NAMES,
  assertPhase1ExamTrainingArtifact,
  classifyPhase1ExamTrainingEntry,
  phase1ExamTrainingEntryQuery,
} from "./phase1-exam-training-entry-attestation-contract.mjs";
import { PHASE1_FOUNDATION_SHA256, assertPhase1ArtifactHash } from "./phase1-entry-attestation-contract.mjs";
import { runProductionPhase1ExamTrainingEntryAttestation } from "./run-production-phase1-exam-training-entry-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const artifact = readFileSync(resolve(root, PHASE1_EXAM_TRAINING_ARTIFACT), "utf8");
const exactChecks = Object.freeze({
  requiredTablesExist: true,
  requiredTablesOwnedByPostgres: true,
  postgresCanCreatePublic: true,
  sourceColumnTypesExact: true,
  fkTypeCompatibilityExact: true,
  targetTableAbsent: true,
  targetColumnsAbsent: true,
  targetIndexesAbsent: true,
  targetConstraintsAbsent: true,
  genRandomUuidExact: true,
});

function payload(overrides = {}) {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
    transaction_read_only: "on",
    server_version_num: 170000,
    checks: exactChecks,
    evidence: {},
    ...overrides,
  };
}

const installerReady = Object.freeze({ managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" });

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

function installerEvidence() {
  return {
    caller: "reflab_prod_preflight_ro",
    session_user: "reflab_prod_preflight_ro",
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
      granted_role,
      member_role: "postgres",
      grantor_role,
      admin_option,
      inherit_option,
      set_option,
    })),
    membership_summary: { total_count: 12, as_member_count: 12, as_granted_role_count: 0 },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
}

test("310002 artifact and Foundation artifact hashes remain exact", () => {
  assert.equal(assertPhase1ExamTrainingArtifact(root).sha256, PHASE1_EXAM_TRAINING_SHA256);
  assert.equal(assertPhase1ArtifactHash(root), PHASE1_FOUNDATION_SHA256);
});

test("artifact-specific inventory has exact derived cardinality", () => {
  assert.equal(PHASE1_EXAM_TRAINING_REQUIRED_TABLES.length, 5);
  assert.equal(PHASE1_EXAM_TRAINING_SOURCE_COLUMNS.length, 2);
  assert.equal(PHASE1_EXAM_TRAINING_TARGET_COLUMNS.length, 6);
  assert.equal(PHASE1_EXAM_TRAINING_TARGET_INDEXES.length, 3);
  assert.equal(PHASE1_EXAM_TRAINING_CHECK_NAMES.length, 13);
  assert.equal(PHASE1_EXAM_TRAINING_FK_NAMES.length, 5);
  assert.equal(PHASE1_EXAM_TRAINING_UNIQUE_NAMES.length, 2);
  assert.equal(PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.length, 20);
  assert.equal(PHASE1_EXAM_TRAINING_FK_TYPES.length, 5);
  assert.equal(new Set(PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.map(
    (entry) => `${entry.table}.${entry.name}.${entry.type}`,
  )).size, 20);
});

test("inventory remains pinned to the exact 310002 DDL source", () => {
  for (const table of PHASE1_EXAM_TRAINING_REQUIRED_TABLES) {
    assert.match(artifact, new RegExp(table.replaceAll(".", "\\.")));
  }
  for (const identity of PHASE1_EXAM_TRAINING_TARGET_COLUMNS) {
    const column = identity.split(".").at(-1);
    assert.match(artifact, new RegExp(`add column ${column}\\b`, "i"));
  }
  for (const identity of PHASE1_EXAM_TRAINING_TARGET_INDEXES) {
    assert.match(artifact, new RegExp(`create (?:unique )?index ${identity.split(".").at(-1)}\\b`, "i"));
  }
  for (const name of [...PHASE1_EXAM_TRAINING_CHECK_NAMES, ...PHASE1_EXAM_TRAINING_FK_NAMES,
    ...PHASE1_EXAM_TRAINING_UNIQUE_NAMES]) {
    const explicitlyNamed = new RegExp(`(?:constraint|index) ${name}\\b`, "i").test(artifact);
    const inferredInline = name.startsWith("referee_exam_sessions_")
      && name.endsWith("_check")
      && artifact.includes(`${name.slice("referee_exam_sessions_".length, -"_check".length)} `);
    assert.equal(explicitlyNamed || inferredInline, true, name);
  }
});

test("catalog attestation is read-only and invokes no product function", () => {
  const sql = buildSqlBatch([installerIdentityQuery, phase1ExamTrainingEntryQuery]);
  const statements = assertReadOnlyBatch(sql);
  assert.match(sql, /begin read only/i);
  assert.match(sql, /transaction_read_only/i);
  assert.match(sql, /rollback/i);
  assert.ok(statements.every((statement) => /^(?:begin read only|set local|show|select|rollback)\b/i.test(statement)));
  assert.doesNotMatch(phase1ExamTrainingEntryQuery.payloadSql, /\bfrom\s+public\./i);
  assert.match(phase1ExamTrainingEntryQuery.payloadSql, /to_regprocedure\('gen_random_uuid\(\)'\)/i);
  assert.doesNotMatch(phase1ExamTrainingEntryQuery.payloadSql, /select\s+gen_random_uuid\s*\(/i);
});

test("exact PostgreSQL 17 catalog is PASS and permits only execution review", () => {
  const result = classifyPhase1ExamTrainingEntry(payload(), installerReady);
  assert.equal(result.classification, "PASS");
  assert.equal(result.nextAllowedRemoteOperation, "310002_EXECUTION_REVIEW");
});

for (const field of Object.keys(exactChecks)) {
  test(`${field} false is BLOCKER`, () => {
    const result = classifyPhase1ExamTrainingEntry(
      payload({ checks: { ...exactChecks, [field]: false } }),
      installerReady,
    );
    assert.equal(result.classification, "BLOCKER");
    assert.equal(result.nextAllowedRemoteOperation, "NONE");
  });
}

test("missing gen_random_uuid catalog evidence is BLOCKER", () => {
  const result = classifyPhase1ExamTrainingEntry(payload({
    checks: { ...exactChecks, genRandomUuidExact: false },
    evidence: {
      gen_random_uuid_schema: null,
      gen_random_uuid_identity_arguments: null,
      gen_random_uuid_return_type: null,
      gen_random_uuid_visible_candidate_count: 0,
    },
  }), installerReady);
  assert.equal(result.classification, "BLOCKER");
  assert.equal(result.nextAllowedRemoteOperation, "NONE");
});

test("missing or malformed evidence is UNKNOWN and never PASS", () => {
  assert.equal(classifyPhase1ExamTrainingEntry(undefined, installerReady).classification, "UNKNOWN");
  assert.equal(classifyPhase1ExamTrainingEntry(payload({ checks: { ...exactChecks, genRandomUuidExact: null } }), installerReady).classification, "UNKNOWN");
});

for (const [name, overrides] of [
  ["caller mismatch", { caller: "postgres" }],
  ["session user mismatch", { session_user: "postgres" }],
  ["transaction_read_only off", { transaction_read_only: "off" }],
  ["PostgreSQL major mismatch", { server_version_num: 180000 }],
]) {
  test(`${name} is BLOCKER`, () => {
    assert.equal(classifyPhase1ExamTrainingEntry(payload(overrides), installerReady).classification, "BLOCKER");
  });
}

test("installer must remain exact POST_BOOTSTRAP READY", () => {
  assert.equal(classifyPhase1ExamTrainingEntry(payload(), {
    managedProfile: "BLOCKER", lifecycleState: "POST_BOOTSTRAP",
  }).classification, "BLOCKER");
  assert.equal(classifyPhase1ExamTrainingEntry(payload(), {
    managedProfile: "READY", lifecycleState: "PRE_BOOTSTRAP",
  }).classification, "BLOCKER");
});

test("runner uses approved read-only target path and emits compact safe output", () => {
  const results = new Map([
    [installerIdentityQuery.id, installerEvidence()],
    [phase1ExamTrainingEntryQuery.id, payload()],
  ]);
  const result = runProductionPhase1ExamTrainingEntryAttestation(environment(), {
    assertArtifact: () => ({ sha256: PHASE1_EXAM_TRAINING_SHA256 }),
    authorize: () => ({
      projectRef: PRODUCTION_PROJECT_REF,
      host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
      connectionEnvironment: { PGUSER: "reflab_prod_preflight_ro" },
    }),
    execute: (sql, connectionEnvironment) => {
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      assert.equal(connectionEnvironment.PGUSER, "reflab_prod_preflight_ro");
      return results;
    },
  });
  assert.equal(result.classification, "PASS");
  assert.equal(result.target.hostCategory, "DIRECT");
  assert.equal(result.target.caller, "reflab_prod_preflight_ro");
  assert.equal(result.target.readOnly, true);
  assert.equal(result.nextAllowedRemoteOperation, "310002_EXECUTION_REVIEW");
  assert.doesNotMatch(JSON.stringify(result), /password|postgresql:\/\//i);
});

test("target mismatch aborts before SQL", () => {
  let executions = 0;
  assert.throws(() => runProductionPhase1ExamTrainingEntryAttestation(environment({
    [PREFLIGHT_PROJECT_REF]: "not-production",
  }), {
    assertArtifact: () => ({ sha256: PHASE1_EXAM_TRAINING_SHA256 }),
    authorize: authorizeProductionPreflightTarget,
    execute: () => { executions += 1; return new Map(); },
  }), /allowlisted/);
  assert.equal(executions, 0);
});

test("artifact hash mismatch aborts before target or SQL", () => {
  let authorized = 0;
  let executions = 0;
  assert.throws(() => runProductionPhase1ExamTrainingEntryAttestation(environment(), {
    assertArtifact: () => { throw new Error("artifact hash mismatch"); },
    authorize: () => { authorized += 1; return {}; },
    execute: () => { executions += 1; return new Map(); },
  }), /artifact hash mismatch/);
  assert.equal(authorized, 0);
  assert.equal(executions, 0);
});

test("inherited PostgreSQL state aborts before target or SQL", () => {
  let executions = 0;
  assert.throws(() => runProductionPhase1ExamTrainingEntryAttestation(
    environment({ PGOPTIONS: "unsafe" }),
    {
      assertArtifact: () => ({ sha256: PHASE1_EXAM_TRAINING_SHA256 }),
      execute: () => { executions += 1; return new Map(); },
    },
  ), /PGOPTIONS/);
  assert.equal(executions, 0);
});

test("runner contains no DDL execution path or later migration", () => {
  const source = readFileSync(
    resolve(root, "scripts/production-adoption/bootstrap/run-production-phase1-exam-training-entry-attestation.mjs"),
    "utf8",
  );
  assert.match(source, /executeReadOnlyBatch/);
  assert.doesNotMatch(source, /executeMigration|spawnSync|310003|migration\s+(?:up|apply)|supabase\s+db/i);
});
