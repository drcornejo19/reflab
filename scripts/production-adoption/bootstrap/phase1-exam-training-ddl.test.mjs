import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import {
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
} from "./production-role-bootstrap-contract.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  PRODUCTION_DDL_DATABASE_URL,
  PRODUCTION_DDL_OPT_IN,
  PRODUCTION_DDL_PROJECT_REF,
  authorizeProductionDdlTarget,
} from "./run-production-role-bootstrap.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_ARTIFACT,
  PHASE1_EXAM_TRAINING_SHA256,
} from "./phase1-exam-training-entry-attestation-contract.mjs";
import {
  PHASE1_EXAM_TRAINING_DDL_SCOPE,
  PHASE1_EXAM_TRAINING_OPERATION,
  PHASE1_EXAM_TRAINING_OPT_IN,
  assertPhase1ExamTrainingDdlArtifact,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import { runProductionPhase1ExamTrainingPrerequisites } from "./run-production-phase1-exam-training-prerequisites.mjs";
import {
  PHASE1_EXAM_TRAINING_REQUIRED_POSTGRES_MAJOR,
  classifyDisposablePostgresRuntime,
} from "./run-production-phase1-exam-training-prerequisites-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);
const artifactSql = readFileSync(resolve(root, PHASE1_EXAM_TRAINING_ARTIFACT), "utf8");
const exactEntryChecks = Object.freeze({
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
const exactPostChecks = Object.freeze({
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

const memberships = ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS.map((membership) => ({
  granted_role: membership.grantedRole,
  member_role: membership.memberRole,
  grantor_role: membership.grantorRole,
  admin_option: membership.adminOption,
  inherit_option: membership.inheritOption,
  set_option: membership.setOption,
}));

function installerPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    server_version_num: 170000,
    installer: { rolname: "postgres", ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES },
    protected_role: { rolname: "reflab_rls_owner", ...ROLE_BOOTSTRAP_ROLE_ATTRIBUTES },
    memberships,
    membership_summary: { total_count: 12, as_member_count: 12, as_granted_role_count: 0 },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
    ...overrides,
  };
}

function foundationPayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on", server_version_num: 170000,
    schemas_exact: true, audit_schema_absent: true, tables_exact: true, unexpected_meta_tables: 0,
    private_schema_empty: true, functions_exact: true, unexpected_meta_functions: 0, triggers_exact: true,
    schema_state_rows: 0, ledger_rows: 1, ledger_exact: true, unexpected_adoption_acl: 0,
    rls_owner_exact: true, rls_owner_memberships_exact: true, rls_owner_owned_objects: 0,
    rls_owner_direct_acl: 0, rls_owner_table_writes: 0, rls_owner_sequence_writes: 0,
    rls_owner_schema_create: 0, identity_links_absent: true, development_objects_absent: true,
    phase2_infrastructure_absent: true,
    ...overrides,
  };
}

function entryPayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170000, checks: exactEntryChecks, evidence: {}, ...overrides,
  };
}

function postPayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170000, checks: exactPostChecks,
    counts: {
      target_columns: 6, target_indexes: 3, target_constraints: 20,
      check_constraints: 13, foreign_keys: 5, unique_constraints: 2,
      target_rows: 0, schema_state_rows: 0, ledger_rows: 2,
    },
    ...overrides,
  };
}

function environment(overrides = {}) {
  return {
    [PRODUCTION_DDL_OPT_IN]: "true",
    [PHASE1_EXAM_TRAINING_OPT_IN]: "true",
    [PRODUCTION_DDL_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PRODUCTION_DDL_APPROVED_HEAD]: head,
    [PRODUCTION_DDL_DATABASE_URL]:
      `postgresql://postgres:<SET_LOCALLY>@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

function resultMaps({
  installer = installerPayload(), foundation = foundationPayload(), entry = entryPayload(),
  post = postPayload(), before = PHASE1_HISTORICAL_FINGERPRINT,
  after = PHASE1_HISTORICAL_FINGERPRINT,
} = {}) {
  return {
    pre: new Map([
      ["production_installer_identity", installer],
      ["phase1_foundation_post_attestation", foundation],
      ["phase1_product_fingerprint", before],
      ["production_phase1_exam_training_entry", entry],
    ]),
    post: new Map([
      ["production_installer_identity", installer],
      ["phase1_exam_training_prerequisites_post_attestation", post],
      ["phase1_product_fingerprint", after],
    ]),
  };
}

function run(overrides = {}) {
  const maps = overrides.maps ?? resultMaps();
  let readCount = 0;
  let migrationCount = 0;
  const result = runProductionPhase1ExamTrainingPrerequisites(
    overrides.environment ?? environment(),
    {
      argument: overrides.argument ?? PHASE1_EXAM_TRAINING_OPERATION,
      git: overrides.git ?? ((args) => args[0] === "rev-parse" ? `${head}\n` : ""),
      assertArtifact: overrides.assertArtifact ?? (() => ({
        path: PHASE1_EXAM_TRAINING_ARTIFACT,
        sha256: PHASE1_EXAM_TRAINING_SHA256,
        sql: artifactSql,
      })),
      authorize: overrides.authorize ?? ((_environment, options) => {
        assert.equal(options.operationOptIn, PHASE1_EXAM_TRAINING_OPT_IN);
        return { projectRef: PRODUCTION_PROJECT_REF, host: "approved.example", connectionEnvironment: {} };
      }),
      executeReadOnly: overrides.executeReadOnly ?? (() => readCount++ === 0 ? maps.pre : maps.post),
      executeMigration: overrides.executeMigration ?? ((sql) => {
        assert.equal(sql, artifactSql);
        migrationCount += 1;
      }),
    },
  );
  return { result, migrationCount };
}

test("exact reviewed state executes only 310002 and authorizes no continuation", () => {
  const { result, migrationCount } = run();
  assert.equal(migrationCount, 1);
  assert.equal(result.preDdl.installer, "READY");
  assert.equal(result.preDdl.foundation, "EXACT");
  assert.equal(result.preDdl.catalog, "PASS");
  assert.equal(result.postDdl.postState, "EXACT");
  assert.equal(result.nextMigration, "NOT_AUTHORIZED");
});

test("310002 artifact hash and DDL scope are exact", () => {
  const artifact = assertPhase1ExamTrainingDdlArtifact(root);
  assert.equal(artifact.sha256, PHASE1_EXAM_TRAINING_SHA256);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.productRowDml, 0);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.createdTables.length, 1);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.addedColumns.length, 6);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.indexes.length, 3);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.constraints.check.length, 13);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.constraints.foreignKey.length, 5);
  assert.equal(PHASE1_EXAM_TRAINING_DDL_SCOPE.constraints.unique.length, 2);
});

test("post-DDL attestation uses strict catalogs for ACL, table, constraints, and later-phase absence", () => {
  const source = phase1ExamTrainingPostQuery.payloadSql;
  assert.match(source, /pg_catalog\.aclexplode\(relation\.relacl\)/);
  assert.match(source, /attribute\.attacl is not null/);
  assert.match(source, /pg_catalog\.pg_get_expr/);
  assert.match(source, /constraint_record\.confmatchtype/);
  assert.match(source, /constraint_record\.confupdtype/);
  assert.match(source, /constraint_record\.confdeltype/);
  assert.match(source, /constraint_record\.condeferrable/);
  assert.match(source, /index_record\.indclass/);
  assert.match(source, /index_record\.indoption/);
  assert.match(source, /public\.psychology_modules/);
  assert.match(source, /notification_events_deduplication_unique/);
  assert.match(source, /state\.phase_order >= 3/);
  assert.doesNotMatch(source, /information_schema/i);
});

test("migration failure proves rollback through the exact precondition", () => {
  const maps = resultMaps();
  let reads = 0;
  let migrationCount = 0;
  assert.throws(() => run({
    executeReadOnly: () => { reads += 1; return maps.pre; },
    executeMigration: () => {
      migrationCount += 1;
      throw new Error("SQLSTATE=55000; message=reviewed failure");
    },
  }), /rollback=PASS/);
  assert.equal(reads, 2);
  assert.equal(migrationCount, 1);
});

const preconditionCases = [
  ["installer profile drift", { installer: installerPayload({ installer: { ...installerPayload().installer, rolname: "wrong" } }) }],
  ["Foundation state drift", { foundation: foundationPayload({ tables_exact: false }) }],
  ["target table present", { entry: entryPayload({ checks: { ...exactEntryChecks, targetTableAbsent: false } }) }],
  ["target column present", { entry: entryPayload({ checks: { ...exactEntryChecks, targetColumnsAbsent: false } }) }],
  ["target constraint present", { entry: entryPayload({ checks: { ...exactEntryChecks, targetConstraintsAbsent: false } }) }],
  ["target index present", { entry: entryPayload({ checks: { ...exactEntryChecks, targetIndexesAbsent: false } }) }],
  ["wrong source type", { entry: entryPayload({ checks: { ...exactEntryChecks, sourceColumnTypesExact: false } }) }],
  ["missing dependency", { entry: entryPayload({ checks: { ...exactEntryChecks, requiredTablesExist: false } }) }],
  ["ledger not foundation/1", { foundation: foundationPayload({ ledger_rows: 2 }) }],
  ["canonical marker present", { foundation: foundationPayload({ schema_state_rows: 1 }) }],
  ["PostgreSQL major mismatch", {
    installer: installerPayload({ server_version_num: 180000 }),
    foundation: foundationPayload({ server_version_num: 180000 }),
    entry: entryPayload({ server_version_num: 180000 }),
  }],
];

for (const [name, values] of preconditionCases) {
  test(`${name} aborts before migration`, () => {
    let migrationCount = 0;
    assert.throws(() => run({
      maps: resultMaps(values),
      executeMigration: () => { migrationCount += 1; },
    }), /pre-DDL/);
    assert.equal(migrationCount, 0);
  });
}

for (const [name, options, pattern] of [
  ["artifact hash mismatch", { assertArtifact: () => { throw new Error("hash mismatch"); } }, /hash mismatch/],
  ["dirty worktree", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M file" }, /clean worktree/],
  ["wrong HEAD", { git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" }, /HEAD/],
  ["wrong target", { authorize: () => { throw new Error("target mismatch"); } }, /target mismatch/],
]) {
  test(`${name} aborts before migration`, () => {
    let migrationCount = 0;
    assert.throws(() => run({ ...options, executeMigration: () => { migrationCount += 1; } }), pattern);
    assert.equal(migrationCount, 0);
  });
}

test("shared target guard requires double opt-in, exact installer, target, and SSL", () => {
  assert.throws(() => run({
    environment: environment({ [PHASE1_EXAM_TRAINING_OPT_IN]: "false" }),
    authorize: authorizeProductionDdlTarget,
  }), /explicit opt-ins/);
  assert.throws(() => run({
    environment: environment({ [PRODUCTION_DDL_OPT_IN]: "false" }),
    authorize: authorizeProductionDdlTarget,
  }), /explicit opt-ins/);
  assert.throws(() => run({
    environment: environment({
      [PRODUCTION_DDL_DATABASE_URL]:
        `postgresql://reflab_prod_preflight_ro:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    }),
    authorize: authorizeProductionDdlTarget,
  }), /allowlisted/);
  assert.throws(() => run({ environment: environment({ PGOPTIONS: "unsafe" }) }), /PGOPTIONS/);
});

test("postcondition and historical fingerprint drift fail closed", () => {
  assert.throws(() => run({ maps: resultMaps({
    post: postPayload({ checks: { ...exactPostChecks, targetConstraintsExact: false } }),
  }) }), /post-DDL/);
  assert.throws(() => run({ maps: resultMaps({
    after: { ...PHASE1_HISTORICAL_FINGERPRINT, attempts: 38 },
  }) }), /post-DDL/);
});

for (const check of [
  "targetTableColumnsExact",
  "targetPrimaryKeyExact",
  "targetAclExact",
  "targetCheckSemanticsExact",
  "targetFkSemanticsExact",
  "targetUniqueSemanticsExact",
  "laterPhaseInfrastructureAbsent",
]) {
  test(`${check} drift fails the post-DDL attestation`, () => {
    assert.throws(() => run({ maps: resultMaps({
      post: postPayload({ checks: { ...exactPostChecks, [check]: false } }),
    }) }), /post-DDL/);
  });
}

test("runner cannot accept arbitrary SQL, globs, or continue to 310003", () => {
  const source = readFileSync(
    resolve(root, "scripts/production-adoption/bootstrap/run-production-phase1-exam-training-prerequisites.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /process\.argv\[[^\]]+\].*(?:\.sql|path)|glob|migration\s+(?:up|apply)|supabase\s+db/i);
  assert.doesNotMatch(source, /202608310003|064236|064245|064249/);
  assert.match(source, /PHASE1_EXAM_TRAINING_OPERATION/);
  assert.match(source, /nextMigration:\s*"NOT_AUTHORIZED"/);
});

test("disposable rehearsal separates real PG17 positive evidence from non-PG17 rejection", () => {
  assert.equal(PHASE1_EXAM_TRAINING_REQUIRED_POSTGRES_MAJOR, 17);
  assert.deepEqual(classifyDisposablePostgresRuntime(170000), {
    actualMajor: 17,
    mode: "PG17_POSITIVE",
  });
  assert.deepEqual(classifyDisposablePostgresRuntime(180006), {
    actualMajor: 18,
    mode: "NON_PG17_REJECTION",
  });
  assert.deepEqual(classifyDisposablePostgresRuntime(undefined), {
    actualMajor: null,
    mode: "UNKNOWN",
  });
});

test("disposable rehearsal derives the major only from observed PostgreSQL catalog evidence", () => {
  const source = readFileSync(
    resolve(root, "scripts/production-adoption/bootstrap/run-production-phase1-exam-training-prerequisites-postgres.mjs"),
    "utf8",
  );
  assert.match(source, /installerPayload\.server_version_num/);
  assert.match(source, /current_setting\('server_version_num'\)/);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /process\.argv[^\n]*(?:major|version)/i);
  assert.match(source, /migrationInvocationCount:\s*0/);
  assert.match(source, /productionVersionGate:\s*"BLOCKER_NON_PG17"/);
  assert.match(source, /productionVersionGate:\s*"PASS_PG17"/);
});

test("Production authorization remains fail-closed on every non-17 major", () => {
  const maps = resultMaps({
    installer: installerPayload({ server_version_num: 180000 }),
    foundation: foundationPayload({ server_version_num: 180000 }),
    entry: entryPayload({ server_version_num: 180000 }),
  });
  let migrationCount = 0;
  assert.throws(() => run({
    maps,
    executeMigration: () => { migrationCount += 1; },
  }), /pre-DDL/);
  assert.equal(migrationCount, 0);
});
