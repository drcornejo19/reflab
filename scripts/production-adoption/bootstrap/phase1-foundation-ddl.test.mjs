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
import {
  PHASE1_FOUNDATION_ARTIFACT,
  PHASE1_FOUNDATION_SHA256,
} from "./phase1-entry-attestation-contract.mjs";
import {
  PHASE1_FOUNDATION_OPERATION,
  PHASE1_FOUNDATION_OPT_IN,
  PHASE1_HISTORICAL_FINGERPRINT,
  PHASE1_POST_ATTESTATION_QUERY_ID,
  PHASE1_PRODUCT_FINGERPRINT_QUERY_ID,
  assertPhase1FoundationArtifact,
  classifyPhase1PostAttestation,
} from "./phase1-foundation-ddl-contract.mjs";
import { runProductionPhase1Foundation } from "./run-production-phase1-foundation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);
const artifactSql = readFileSync(resolve(root, PHASE1_FOUNDATION_ARTIFACT), "utf8");

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

function phase1EntryPayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170000,
    role_attestation: {
      role_present: true, attributes_exact: true, automatic_memberships: 1,
      explicit_memberships: 1, unexpected_memberships: 0, owned_objects: 0,
      direct_acl_entries: 0, effective_table_writes: 0,
      effective_sequence_writes: 0, effective_schema_create: 0, comment_exact: true,
    },
    absence: {
      reflab_meta_absent: true, reflab_private_absent: true, reflab_audit_absent: true,
      schema_state_absent: true, adoption_state_absent: true, canonical_marker_absent: true,
      identity_links_absent: true, development_objects_absent: true,
    },
    partial_adoption_object_count: 0,
    ...overrides,
  };
}

function postPayload(overrides = {}) {
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

const fingerprint = PHASE1_HISTORICAL_FINGERPRINT;

function environment(overrides = {}) {
  return {
    [PRODUCTION_DDL_OPT_IN]: "true",
    [PHASE1_FOUNDATION_OPT_IN]: "true",
    [PRODUCTION_DDL_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PRODUCTION_DDL_APPROVED_HEAD]: head,
    [PRODUCTION_DDL_DATABASE_URL]: `postgresql://postgres:<SET_LOCALLY>@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    ...overrides,
  };
}

function resultMaps({
  installer = installerPayload(),
  entry = phase1EntryPayload(),
  post = postPayload(),
  before = fingerprint,
  after = fingerprint,
} = {}) {
  return {
    pre: new Map([
      ["production_installer_identity", installer],
      ["production_phase1_entry", entry],
      [PHASE1_PRODUCT_FINGERPRINT_QUERY_ID, before],
    ]),
    post: new Map([
      ["production_installer_identity", installer],
      [PHASE1_POST_ATTESTATION_QUERY_ID, post],
      [PHASE1_PRODUCT_FINGERPRINT_QUERY_ID, after],
    ]),
  };
}

function run(overrides = {}) {
  const maps = overrides.maps ?? resultMaps();
  let readCount = 0;
  let migrationCount = 0;
  const result = runProductionPhase1Foundation(overrides.environment ?? environment(), {
    argument: overrides.argument ?? PHASE1_FOUNDATION_OPERATION,
    git: overrides.git ?? ((args) => args[0] === "rev-parse" ? `${head}\n` : ""),
    assertArtifact: overrides.assertArtifact ?? (() => ({
      path: PHASE1_FOUNDATION_ARTIFACT, sha256: PHASE1_FOUNDATION_SHA256, sql: artifactSql,
    })),
    authorize: overrides.authorize ?? ((_environment, options) => {
      assert.equal(options.operationOptIn, PHASE1_FOUNDATION_OPT_IN);
      return { projectRef: PRODUCTION_PROJECT_REF, host: "approved.example", connectionEnvironment: {} };
    }),
    executeReadOnly: overrides.executeReadOnly ?? (() => readCount++ === 0 ? maps.pre : maps.post),
    executeMigration: overrides.executeMigration ?? ((sql) => {
      assert.equal(sql, artifactSql);
      migrationCount += 1;
    }),
  });
  return { result, migrationCount };
}

test("exact Production-like pre-state executes only Phase 1 and post-state is exact", () => {
  const { result, migrationCount } = run();
  assert.equal(migrationCount, 1);
  assert.equal(result.preDdl.phase1Entry, "READY");
  assert.equal(result.postDdl.phase1PostState, "EXACT");
  assert.equal(result.nextMigration, "NOT_AUTHORIZED");
});

test("historical fingerprint contract uses notification_events and no stale relation", () => {
  assert.deepEqual(PHASE1_HISTORICAL_FINGERPRINT, {
    attempts: 37,
    exam_results: 6,
    notification_events: 60,
  });
  const staleRelation = ["public", "notifications"].join(".");
  for (const relativePath of [
    "scripts/production-adoption/bootstrap/phase1-foundation-ddl-contract.mjs",
    "scripts/production-adoption/bootstrap/run-production-phase1-foundation.mjs",
    "scripts/production-adoption/bootstrap/run-production-phase1-foundation-postgres.mjs",
  ]) {
    const source = readFileSync(resolve(root, relativePath), "utf8");
    assert.equal(source.includes(staleRelation), false, `${relativePath} contains the stale relation`);
  }
  const rehearsalSource = readFileSync(
    resolve(root, "scripts/production-adoption/bootstrap/run-production-phase1-foundation-postgres.mjs"),
    "utf8",
  );
  assert.match(rehearsalSource, /create table public\.notification_events\b/);
});

for (const [name, before] of [
  ["notification_events count 59", { ...fingerprint, notification_events: 59 }],
  ["notification_events count 61", { ...fingerprint, notification_events: 61 }],
  ["attempts count drift", { ...fingerprint, attempts: 38 }],
  ["exam_results count drift", { ...fingerprint, exam_results: 7 }],
]) {
  test(`${name} blocks before migration invocation`, () => {
    let migrationInvocations = 0;
    assert.throws(() => run({
      maps: resultMaps({ before }),
      executeMigration: () => { migrationInvocations += 1; },
    }), /pre-DDL/);
    assert.equal(migrationInvocations, 0);
  });
}

test("missing notification_events fails closed before migration invocation", () => {
  let migrationInvocations = 0;
  assert.throws(() => run({
    executeReadOnly: () => { throw new Error("required historical relation is missing"); },
    executeMigration: () => { migrationInvocations += 1; },
  }), /required historical relation is missing/);
  assert.equal(migrationInvocations, 0);
});

test("any before-attestation failure invokes no migration", () => {
  let migrationInvocations = 0;
  assert.throws(() => run({
    maps: resultMaps({ entry: phase1EntryPayload({ partial_adoption_object_count: 1 }) }),
    executeMigration: () => { migrationInvocations += 1; },
  }), /pre-DDL/);
  assert.equal(migrationInvocations, 0);
});

for (const [name, options, pattern] of [
  ["wrong HEAD", { git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" }, /HEAD/],
  ["dirty worktree", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M file" }, /clean worktree/],
  ["wrong hash", { assertArtifact: () => { throw new Error("hash mismatch"); } }, /hash mismatch/],
  ["wrong operation", { argument: "--another-operation" }, /exact operation/],
]) {
  test(`${name} aborts before DDL`, () => assert.throws(() => run(options), pattern));
}

for (const [name, databaseUrl, projectRef] of [
  ["wrong project", `postgresql://postgres:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`, "not-production"],
  ["wrong host", "postgresql://postgres:password@example.invalid:5432/postgres?sslmode=require", PRODUCTION_PROJECT_REF],
  ["wrong target installer", `postgresql://reflab_prod_preflight_ro:password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`, PRODUCTION_PROJECT_REF],
]) {
  test(`${name} aborts in the shared DDL target guard`, () => {
    assert.throws(() => run({
      environment: environment({
        [PRODUCTION_DDL_PROJECT_REF]: projectRef,
        [PRODUCTION_DDL_DATABASE_URL]: databaseUrl,
      }),
      authorize: authorizeProductionDdlTarget,
    }), /allowlisted/);
  });
}

for (const [name, maps] of [
  ["wrong installer", resultMaps({ installer: installerPayload({ installer: { ...installerPayload().installer, rolname: "wrong" } }) })],
  ["PG18", resultMaps({ installer: installerPayload({ server_version_num: 180000 }), entry: phase1EntryPayload({ server_version_num: 180000 }) })],
  ["reflab_rls_owner absent", resultMaps({ installer: installerPayload({ protected_role: null }) })],
  ["protected role drift", resultMaps({ installer: installerPayload({ protected_role: { ...installerPayload().protected_role, rolbypassrls: true } }) })],
  ["Phase 1 object present", resultMaps({ entry: phase1EntryPayload({ absence: { ...phase1EntryPayload().absence, reflab_meta_absent: false } }) })],
  ["partial adoption", resultMaps({ entry: phase1EntryPayload({ partial_adoption_object_count: 1 }) })],
  ["unexpected installer membership", resultMaps({ installer: installerPayload({
    memberships: [...memberships, { granted_role: "extra", member_role: "postgres", grantor_role: "postgres", admin_option: false, inherit_option: false, set_option: true }],
    membership_summary: { total_count: 13, as_member_count: 13, as_granted_role_count: 0 },
  }) })],
]) {
  test(`${name} aborts in immediate pre-DDL attestation`, () => assert.throws(() => run({ maps }), /pre-DDL/));
}

test("migration failure reports safe SQLSTATE and proves rollback", () => {
  const maps = resultMaps();
  let reads = 0;
  assert.throws(() => run({
    executeReadOnly: () => { reads += 1; return maps.pre; },
    executeMigration: () => { throw new Error("SQLSTATE=55000; message=reviewed failure"); },
  }), /rollback=PASS/);
  assert.equal(reads, 2);
});

test("post-attestation mismatch fails closed", () => {
  assert.throws(() => run({ maps: resultMaps({ post: postPayload({ ledger_rows: 2 }) }) }), /post-DDL/);
});

test("post classifier preserves exact product counts and rejects every count drift", () => {
  const installer = { managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" };
  assert.equal(classifyPhase1PostAttestation(postPayload(), installer, fingerprint, fingerprint).phase1PostState, "EXACT");
  for (const after of [
    { ...fingerprint, attempts: 38 },
    { ...fingerprint, exam_results: 7 },
    { ...fingerprint, notification_events: 59 },
    { ...fingerprint, notification_events: 61 },
  ]) {
    assert.equal(classifyPhase1PostAttestation(postPayload(), installer, fingerprint, after).phase1PostState, "BLOCKER");
  }
});

test("artifact pin and static DDL scope are exact", () => {
  const artifact = assertPhase1FoundationArtifact(root);
  assert.equal(artifact.sha256, PHASE1_FOUNDATION_SHA256);
  assert.equal(artifact.sql, artifactSql);
});

test("arbitrary SQL paths, migration globs, Phase 2, and Supabase apply are impossible", () => {
  const source = readFileSync(resolve(root, "scripts/production-adoption/bootstrap/run-production-phase1-foundation.mjs"), "utf8");
  assert.doesNotMatch(source, /process\.argv\[[^\]]+\].*(?:\.sql|path)|glob|migration\s+(?:up|apply)|supabase\s+db/i);
  assert.doesNotMatch(source, /202608310002|202608310003|064236|064245|064249/);
  assert.match(source, /PHASE1_FOUNDATION_OPERATION/);
});

test("both opt-ins and inherited PG state are fail-closed", () => {
  assert.throws(() => run({
    environment: environment({ [PHASE1_FOUNDATION_OPT_IN]: "false" }),
    authorize: authorizeProductionDdlTarget,
  }), /explicit opt-ins/);
  assert.throws(() => run({
    environment: environment({ [PRODUCTION_DDL_OPT_IN]: "false" }),
    authorize: authorizeProductionDdlTarget,
  }), /explicit opt-ins/);
  assert.throws(() => run({ environment: environment({ PGOPTIONS: "unsafe" }) }), /PGOPTIONS/);
});

test("secrets and URLs are absent from failure output", () => {
  assert.throws(() => run({ executeMigration: () => { throw new Error("postgresql://postgres:password@example.invalid/postgres"); } }), (error) => {
    assert.doesNotMatch(error.message, /password|postgresql:\/\//);
    return true;
  });
});
