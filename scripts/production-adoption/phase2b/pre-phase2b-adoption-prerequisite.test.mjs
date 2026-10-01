import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { migrationManifest, PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import {
  ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
} from "../bootstrap/production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
  PRODUCTION_DDL_DATABASE_URL,
  PRODUCTION_DDL_OPT_IN,
  PRODUCTION_DDL_PROJECT_REF,
} from "../bootstrap/run-production-role-bootstrap.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_CHECKS,
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_FUNCTIONS,
  ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
  ADMIN_CANONICAL_ACCESS_POLICIES,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  CANONICAL_JSONB_TEXT_ACL,
  CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  LEADERBOARD_ACL_FINGERPRINT,
  LEADERBOARD_POST_COLUMN_FINGERPRINT,
  LEADERBOARD_PRE_COLUMN_FINGERPRINT,
  LEADERBOARD_PRE_DEFINITION_SHA256,
  LEADERBOARD_UPSTREAM_FINGERPRINT,
  PRE_PHASE2B_ARTIFACT,
  PRE_PHASE2B_MUTATION_ACCOUNTING,
  PRE_PHASE2B_OPERATION,
  PRE_PHASE2B_OPT_IN,
  PRE_PHASE2B_POST_QUERY_ID,
  PRE_PHASE2B_PRE_QUERY_ID,
  PRE_PHASE2B_SHA256,
  assertPrePhase2bArtifact,
  classifyPrePhase2bPreservation,
  classifyPrePhase2bPost,
  classifyPrePhase2bPre,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  assertPrePhase2bSessionPoolerTarget,
  buildPrePhase2bPostBatch,
  buildPrePhase2bPreBatch,
  classifyPrePhase2bExecutionGate,
  runProductionPrePhase2bAdoptionPrerequisite,
} from "./run-production-pre-phase2b-adoption-prerequisite.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root, encoding: "utf8", windowsHide: true,
}).trim();
const sessionPoolerUsername = `postgres.${PRODUCTION_PROJECT_REF}`;
const phase2aMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310004_production_adoption_semantic_audit.sql"), "utf8");
const phase2aSource = phase2aMigration.match(
  /as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i,
)?.[1] ?? "";
const helperMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const helperSource = helperMigration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1] ?? "";
const adminMigration = readFileSync(resolve(root,
  "supabase/migrations/202608110001_canonical_admin_user_access.sql"), "utf8");

function adminFunctionSource(name) {
  return adminMigration.match(new RegExp(
    `create function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`,
    "i",
  ))?.[1] ?? "";
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function exactTarget() {
  return {
    projectRef: PRODUCTION_PROJECT_REF,
    host: PRODUCTION_SESSION_POOLER_HOST,
    connectionEnvironment: {
      PGHOST: PRODUCTION_SESSION_POOLER_HOST,
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: sessionPoolerUsername,
      PGPASSWORD: "fixture-password",
      PGSSLMODE: "require",
    },
  };
}

function productionEnvironment(overrides = {}) {
  return {
    [PRODUCTION_DDL_APPROVED_HEAD]: head,
    [PRODUCTION_DDL_OPT_IN]: "true",
    [PRE_PHASE2B_OPT_IN]: "true",
    [PRODUCTION_DDL_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PRODUCTION_DDL_DATABASE_URL]:
      `postgresql://${sessionPoolerUsername}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
    ...overrides,
  };
}
const checks = Object.freeze({
  sessionExact: true,
  columnShapeExact: true,
  historicalCountsExact: true,
  historicalSemanticsExact: true,
  clipsExact: true,
  sidecarExact: true,
  providerStateExact: true,
  ledgerExact: true,
  markerAbsent: true,
  leaderboardExact: true,
  createdAtIndexesExact: true,
  phase2bEntryExact: true,
});

function installerPayload(overrides = {}) {
  const memberships = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
  return {
    caller: "postgres", session_user: "postgres", server_version_num: 170011,
    installer: {
      rolname: "postgres", rolcanlogin: true, rolinherit: true, rolcreaterole: true,
      rolsuper: false, rolcreatedb: true, rolbypassrls: true, rolreplication: true,
    },
    protected_role: {
      rolname: "reflab_rls_owner", rolcanlogin: false, rolinherit: false,
      rolcreaterole: false, rolsuper: false, rolcreatedb: false, rolbypassrls: false,
    },
    semantic_audit_role: {
      rolname: "reflab_preflight_audit_owner",
      ...ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
    },
    memberships,
    membership_summary: {
      total_count: memberships.length,
      as_member_count: memberships.filter((value) => value.member_role === "postgres").length,
      as_granted_role_count: memberships.filter((value) => value.granted_role === "postgres").length,
    },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
    ...overrides,
  };
}

function statePayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170011,
    checks,
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      score_non_null: 36, score_null: 1, training_duplicate_groups: 0,
    },
    ...overrides,
  };
}

function fingerprintPayload(overrides = {}) {
  return { attempts: 37, exam_results: 6, notification_events: 60, ...overrides };
}

function sidecarPayload(overrides = {}) {
  return {
    caller: "postgres", session_user: "postgres", transaction_read_only: "on",
    server_version_num: 170011,
    checks: {
      ...Object.fromEntries(PHASE2A_SEMANTIC_AUDIT_POST_CHECKS.map((name) => [name, true])),
      phase2bAbsent: false,
    },
    counts: {
      policies: 58, column_grants: 100, effective_select_columns: 100,
      ledger_rows: 3, schema_state_rows: 0,
    },
    function_source_base64: Buffer.from(phase2aSource, "utf8").toString("base64"),
    ...overrides,
  };
}

function adminPostPayload(overrides = {}) {
  return {
    checks: Object.fromEntries(ADMIN_CANONICAL_ACCESS_CHECKS.map((name) => [name, true])),
    helper_source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    helper_acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    functions: ADMIN_CANONICAL_ACCESS_FUNCTIONS.map((fn) => ({
      name: fn.name,
      identity_arguments: fn.identity_arguments,
      result_type: "jsonb",
      language_name: "plpgsql",
      volatility: "v",
      strict_mode: false,
      security_definer: true,
      leakproof: false,
      function_kind: "f",
      owner_name: "reflab_rls_owner",
      configuration: ["search_path=pg_catalog"],
      source_base64: Buffer.from(adminFunctionSource(fn.name), "utf8").toString("base64"),
    })),
    function_acl: ADMIN_CANONICAL_ACCESS_FUNCTION_ACL.map((entry) => ({ ...entry })),
    policies: ADMIN_CANONICAL_ACCESS_POLICIES.map((entry) => ({ ...entry })),
    schema_acl: ADMIN_CANONICAL_ACCESS_SCHEMA_ACL.map((entry) => ({ ...entry })),
    table_acl: [],
    column_acl: ADMIN_CANONICAL_ACCESS_COLUMN_ACL.map((entry) => ({ ...entry })),
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60,
      ledger: 3, schema_state: 0,
    },
    ...overrides,
  };
}

function canonicalJsonbTextPayload(overrides = {}) {
  return {
    checks: {
      ...Object.fromEntries(CANONICAL_RUNTIME_PREREQUISITES_CHECKS.map((name) => [name, true])),
      adminProvidersAbsent: false,
    },
    source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60,
      ledger: 3, schema_state: 0,
    },
    ...overrides,
  };
}

function results(queryId, payload = statePayload(), installer = installerPayload(), exact = {}) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, installer],
    [phase1ProductFingerprintQuery.id, exact.fingerprint ?? fingerprintPayload()],
    [phase2aSemanticAuditPostQuery.id, exact.sidecar ?? sidecarPayload()],
    [CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
      exact.canonicalJsonbText ?? canonicalJsonbTextPayload()],
    [ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, exact.admin ?? adminPostPayload()],
    [queryId, payload],
  ]);
}

const providerDriftCases = [
  ["310005 wrong source hash", ({ canonicalJsonbText }) => {
    canonicalJsonbText.source_base64 = Buffer.from("drift", "utf8").toString("base64");
  }],
  ["310005 wrong owner", ({ canonicalJsonbText }) => {
    canonicalJsonbText.checks.canonicalJsonbTextStateExact = false;
  }],
  ["310005 wrong ACL", ({ canonicalJsonbText }) => {
    canonicalJsonbText.acl = canonicalJsonbText.acl.filter((entry) => entry.grantee !== "service_role");
  }],
  ["310005 relation dependency drift", ({ canonicalJsonbText }) => {
    canonicalJsonbText.checks.canonicalJsonbTextRelationDependenciesAbsent = false;
  }],
  ["admin function wrong source", ({ admin }) => {
    admin.functions[0].source_base64 = Buffer.from("drift", "utf8").toString("base64");
  }],
  ["admin function wrong owner", ({ admin }) => {
    admin.functions[0].owner_name = "postgres";
  }],
  ["admin function SECURITY DEFINER mismatch", ({ admin }) => {
    admin.functions[0].security_definer = false;
  }],
  ["admin function search_path mismatch", ({ admin }) => {
    admin.functions[0].configuration = ["search_path=public"];
  }],
  ["admin function unexpected PUBLIC EXECUTE", ({ admin }) => {
    admin.function_acl.push({
      routine: ADMIN_CANONICAL_ACCESS_FUNCTIONS[0].name,
      grantee: "PUBLIC", grantor: "reflab_rls_owner",
      privilege_type: "EXECUTE", is_grantable: false,
    });
  }],
  ["admin function unexpected anon EXECUTE", ({ admin }) => {
    admin.function_acl.push({
      routine: ADMIN_CANONICAL_ACCESS_FUNCTIONS[0].name,
      grantee: "anon", grantor: "reflab_rls_owner",
      privilege_type: "EXECUTE", is_grantable: false,
    });
  }],
  ["admin function unexpected authenticated EXECUTE", ({ admin }) => {
    admin.function_acl.push({
      routine: ADMIN_CANONICAL_ACCESS_FUNCTIONS[0].name,
      grantee: "authenticated", grantor: "reflab_rls_owner",
      privilege_type: "EXECUTE", is_grantable: false,
    });
  }],
  ["admin function missing service_role EXECUTE", ({ admin }) => {
    admin.function_acl = admin.function_acl.filter((entry) =>
      !(entry.routine === ADMIN_CANONICAL_ACCESS_FUNCTIONS[0].name
        && entry.grantee === "service_role"));
  }],
  ["admin policy drift", ({ admin }) => {
    admin.policies.pop();
  }],
  ["admin schema ACL drift", ({ admin }) => {
    admin.schema_acl[0].grantor = "postgres";
  }],
  ["admin column ACL drift", ({ admin }) => {
    admin.column_acl.pop();
  }],
  ["admin unexpected table ACL", ({ admin }) => {
    admin.table_acl.push({
      schema_name: "public", table_name: "user_profiles",
      grantee: "reflab_rls_owner", grantor: "postgres",
      privilege_type: "SELECT", is_grantable: false,
    });
  }],
  ["admin reflab_rls_owner CREATE gained", ({ admin }) => {
    admin.checks.rlsOwnerCreateAbsent = false;
  }],
  ["Phase 2A exact sidecar drift", ({ sidecar }) => {
    sidecar.checks.functionExecuteAclExact = false;
  }],
];

test("migration is pinned and contains only the approved reconciliation", () => {
  const artifact = assertPrePhase2bArtifact(root);
  assert.equal(artifact.path, PRE_PHASE2B_ARTIFACT);
  assert.equal(artifact.sha256, PRE_PHASE2B_SHA256);
  assert.match(artifact.sql, /approved adoption decision, not proven[\s\S]*timezone provenance/i);
  assert.doesNotMatch(artifact.sql, /\bupdate\s+public\.(?:attempts|clips)\b/i);
});

test("authoritative leaderboard fingerprints and mutation accounting are pinned", () => {
  for (const digest of [
    LEADERBOARD_PRE_DEFINITION_SHA256, LEADERBOARD_PRE_COLUMN_FINGERPRINT,
    LEADERBOARD_POST_COLUMN_FINGERPRINT, LEADERBOARD_ACL_FINGERPRINT,
    LEADERBOARD_UPSTREAM_FINGERPRINT,
  ]) assert.match(digest, /^[0-9a-f]{64}$/);
  assert.deepEqual(PRE_PHASE2B_MUTATION_ACCOUNTING, {
    attemptsCreatedAtRowsReinterpreted: 37,
    attemptsScoreValuesConverted: 36,
    attemptsScoreNullsPreserved: 1,
    historicalClipStatusAssignments: 30,
    leaderboardDrops: 1,
    leaderboardCreates: 1,
    explicitProductUpdates: 0,
    productInserts: 0,
    productDeletes: 0,
    ledgerWrites: 0,
    schemaStateWrites: 0,
    canonicalMarkerWrites: 0,
  });
});

test("pre/post attestations are fixed read-only batches", () => {
  for (const batch of [buildPrePhase2bPreBatch(), buildPrePhase2bPostBatch()]) {
    assert.doesNotThrow(() => assertReadOnlyBatch(batch));
    assert.doesNotMatch(batch, /\bset\s+role\b|\bcreate\s+temp\b/i);
  }
});

test("pre-DDL evidence batch orders exact dependencies before the prerequisite state", () => {
  const batch = buildPrePhase2bPreBatch();
  const queryIds = [
    INSTALLER_IDENTITY_QUERY_ID,
    phase1ProductFingerprintQuery.id,
    phase2aSemanticAuditPostQuery.id,
    CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
    ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
    PRE_PHASE2B_PRE_QUERY_ID,
  ];
  const positions = queryIds.map((id) => batch.indexOf(id));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.equal(classifyPrePhase2bExecutionGate(
    results(PRE_PHASE2B_PRE_QUERY_ID),
  ).providers.classification, "EXACT");
});

for (const [name, mutate] of providerDriftCases) {
  test(`${name} blocks before prerequisite DDL`, () => {
    const exact = {
      admin: structuredClone(adminPostPayload()),
      canonicalJsonbText: structuredClone(canonicalJsonbTextPayload()),
      sidecar: structuredClone(sidecarPayload()),
    };
    mutate(exact);
    let migrations = 0;
    assert.throws(() => runProductionPrePhase2bAdoptionPrerequisite(productionEnvironment(), {
      argument: PRE_PHASE2B_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
      authorize: () => exactTarget(),
      executeReadOnly: () => results(
        PRE_PHASE2B_PRE_QUERY_ID,
        statePayload(),
        installerPayload(),
        exact,
      ),
      executeMigration: () => { migrations += 1; },
    }), /PRE_DDL_CONTRACT_MISMATCH/);
    assert.equal(migrations, 0);
  });
}

test("provider migrations and the 202608110001 DDL runner remain byte-identical", () => {
  assert.equal(sha256File(resolve(root,
    "supabase/migrations/20260925150422_production_adoption_pre_phase2b_schema_reconciliation.sql")),
  "01e2fc62eb0d851b4c4616c70b37ae544ae6ae54af36a3491d68fb5484a375fe");
  assert.equal(sha256File(resolve(root,
    "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql")),
  "66ee4c2ce2f849d4d3d1aa20bbf87c90e4ed6c97cd29eb86448be75660a822e9");
  assert.equal(sha256File(resolve(root,
    "supabase/migrations/202608110001_canonical_admin_user_access.sql")),
  "0c8ea0383eb16bcef78b2252bd66682f9fbfa4b5dcea93d03807a1b91e6f8051");
  assert.equal(sha256File(resolve(import.meta.dirname,
    "run-production-phase2b-admin-canonical-access.mjs")),
  "108be5302ef4816a1231b617ce6e53a2536447e6b9543b541e90543d00a43c67");
});

test("pre/post classifiers fail closed", () => {
  const installer = { managedProfile: "READY", lifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT" };
  assert.equal(classifyPrePhase2bPre(statePayload(), installer).classification, "PASS");
  assert.equal(classifyPrePhase2bPost(statePayload(), installer).classification, "EXACT");
  for (const check of Object.keys(checks)) {
    const payload = statePayload({ checks: { ...checks, [check]: false } });
    assert.equal(classifyPrePhase2bPre(payload, installer).classification, "BLOCKER", check);
  }
  assert.equal(classifyPrePhase2bPre(undefined, installer).classification, "UNKNOWN");
});

test("post-Training preservation excludes only the two entry-only provider predicates", () => {
  const installer = { managedProfile: "READY", lifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT" };
  const payload = statePayload({
    checks: { ...checks, providerStateExact: false, phase2bEntryExact: false },
  });
  assert.equal(classifyPrePhase2bPreservation(payload).classification, "EXACT");
  assert.equal(classifyPrePhase2bPost(payload, installer).classification, "BLOCKER");
  for (const name of [
    "columnShapeExact", "historicalCountsExact", "historicalSemanticsExact", "clipsExact",
    "sidecarExact", "ledgerExact", "markerAbsent", "leaderboardExact", "createdAtIndexesExact",
  ]) {
    const drift = statePayload({
      checks: { ...checks, providerStateExact: false, phase2bEntryExact: false, [name]: false },
    });
    assert.equal(classifyPrePhase2bPreservation(drift).classification, "BLOCKER", name);
  }
});

test("dedicated runner executes exactly one pinned artifact and stops", () => {
  const responses = [results(PRE_PHASE2B_PRE_QUERY_ID), results(PRE_PHASE2B_POST_QUERY_ID)];
  let reads = 0;
  let migrations = 0;
  const output = runProductionPrePhase2bAdoptionPrerequisite(productionEnvironment(), {
    argument: PRE_PHASE2B_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    executeReadOnly: () => responses[reads++],
    executeMigration: (sql) => {
      migrations += 1;
      assert.equal(sql, assertPrePhase2bArtifact(root).sql);
    },
  });
  assert.equal(migrations, 1);
  assert.equal(reads, 2);
  assert.equal(output.migration, "PASS");
  assert.equal(output.postDdl.contract, "EXACT");
  assert.equal(output.postDdl.phase2bEntry, "EXACT");
  assert.notEqual(output.postDdl.phase2bEntry, "PASS");
  assert.equal(output.nextMigration, "NOT_AUTHORIZED");
});

test("non-exact Phase 2B entry post-state fails closed", () => {
  const responses = [
    results(PRE_PHASE2B_PRE_QUERY_ID),
    results(PRE_PHASE2B_POST_QUERY_ID,
      statePayload({ checks: { ...checks, phase2bEntryExact: false } })),
  ];
  let reads = 0;
  assert.throws(() => runProductionPrePhase2bAdoptionPrerequisite(productionEnvironment(), {
    argument: PRE_PHASE2B_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    executeReadOnly: () => responses[reads++],
    executeMigration: () => {},
  }), /POST_DDL_CONTRACT_MISMATCH/);
  assert.equal(reads, 2);
});

test("dedicated target guard accepts only the exact Session Pooler target", () => {
  assert.equal(assertPrePhase2bSessionPoolerTarget(exactTarget()).host,
    PRODUCTION_SESSION_POOLER_HOST);
  assert.throws(() => assertPrePhase2bSessionPoolerTarget({
    ...exactTarget(),
    host: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
    connectionEnvironment: {
      ...exactTarget().connectionEnvironment,
      PGHOST: `db.${PRODUCTION_PROJECT_REF}.supabase.co`,
      PGUSER: "postgres",
    },
  }), /PRE_PHASE2B_TARGET_REJECTED/);
});

for (const [name, databaseUrl] of [
  ["approved direct DB host", `postgresql://postgres:fixture-password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`],
  ["arbitrary host", "postgresql://postgres:fixture-password@example.invalid:5432/postgres?sslmode=require"],
  ["SSL missing", `postgresql://${sessionPoolerUsername}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres`],
  ["wrong database", `postgresql://${sessionPoolerUsername}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/not_postgres?sslmode=require`],
  ["wrong managed postgres username", `postgresql://postgres:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`],
]) test(`${name} is rejected before DDL`, () => {
  let migrations = 0;
  assert.throws(() => runProductionPrePhase2bAdoptionPrerequisite(productionEnvironment({
    [PRODUCTION_DDL_DATABASE_URL]: databaseUrl,
  }), {
    argument: PRE_PHASE2B_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    executeMigration: () => { migrations += 1; },
  }));
  assert.equal(migrations, 0);
});

test("malformed approved HEAD is rejected before DDL", () => {
  let migrations = 0;
  assert.throws(() => runProductionPrePhase2bAdoptionPrerequisite(productionEnvironment({
    [PRODUCTION_DDL_APPROVED_HEAD]: "a".repeat(41),
  }), {
    argument: PRE_PHASE2B_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    executeMigration: () => { migrations += 1; },
  }), /frozen HEAD attestation failed/);
  assert.equal(migrations, 0);
});

for (const [name, dependencies, environment = { [PRODUCTION_DDL_APPROVED_HEAD]: head }] of [
  ["dirty worktree", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : " M drift.sql" }],
  ["wrong HEAD", { git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "" }],
  ["hash drift", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : "", assertArtifact: () => { throw new Error("hash"); } }],
  ["wrong target", { git: (args) => args[0] === "rev-parse" ? `${head}\n` : "", authorize: () => { throw new Error("target"); } }],
  ["precondition drift", {
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    authorize: () => exactTarget(),
    executeReadOnly: () => results(PRE_PHASE2B_PRE_QUERY_ID,
      statePayload({ checks: { ...checks, leaderboardExact: false } })),
  }],
]) test(`${name} blocks before DDL`, () => {
  let migrations = 0;
  assert.throws(() => runProductionPrePhase2bAdoptionPrerequisite(environment, {
    argument: PRE_PHASE2B_OPERATION,
    executeMigration: () => { migrations += 1; },
    ...dependencies,
  }));
  assert.equal(migrations, 0);
});

test("manifest and Phase2B order classify the new bridge", async () => {
  const manifest = migrationManifest.find((entry) => entry.version === "20260925150422");
  assert.equal(manifest?.classification, "production_adoption_bridge");
  const contract = await import("./phase2b-contract.mjs");
  const admin = contract.PHASE2B_MIGRATIONS.indexOf("202608110001_canonical_admin_user_access.sql");
  const prerequisite = contract.PHASE2B_MIGRATIONS.indexOf(PRE_PHASE2B_ARTIFACT.split("/").at(-1));
  const training = contract.PHASE2B_MIGRATIONS.indexOf("202608130001_canonical_training_attempts.sql");
  assert.ok(admin < prerequisite && prerequisite < training);
});

test("runner has no arbitrary SQL, migration discovery, or continuation", () => {
  const source = readFileSync(resolve(import.meta.dirname,
    "run-production-pre-phase2b-adoption-prerequisite.mjs"), "utf8");
  assert.doesNotMatch(source, /process\.argv\[3\]|readdir|glob|db push|migration list|202608130001.*execute/i);
  assert.match(source, /phase2bEntry:\s*"EXACT"/);
  assert.doesNotMatch(source, /phase2bEntry:\s*"PASS"/);
  assert.match(source, /nextMigration:\s*"NOT_AUTHORIZED"/);
});

test("PostgreSQL rehearsal pins every required negative and rollback class", () => {
  const source = readFileSync(resolve(import.meta.dirname, "run-phase2b-postgres.mjs"), "utf8");
  const requiredCases = [
    "created_at_type", "created_at_null", "score_wrong_type", "score_out_of_range",
    "leaderboard_definition", "leaderboard_columns", "leaderboard_acl",
    "leaderboard_option", "leaderboard_comment", "leaderboard_downstream",
    "leaderboard_upstream", "leaderboard_drop_failure", "score_alter_failure",
    "leaderboard_recreation_failure", "recreated_column_contract", "clips_status_present",
    "clip_count", "inactive_clip", "attempt_count", "exam_count", "notification_count",
    "sidecar_absent", "marker_present", "provider_present", "lock_timeout",
    "postcondition_mismatch",
  ];
  for (const id of requiredCases) assert.match(source, new RegExp(`\\b${id}\\b`), id);
  assert.match(source, /if \(before !== after\).*rollback mismatch/i);
  assert.match(source, /expectedSqlstate:\s*"55P03"/);
});

test("dedicated PostgreSQL rehearsal exercises each exact provider family", () => {
  const source = readFileSync(resolve(import.meta.dirname,
    "run-pre-phase2b-execution-gate-postgres.mjs"), "utf8");
  for (const id of ["phase2a_sidecar", "canonical_jsonb_text", "admin_canonical_access"]) {
    assert.match(source, new RegExp(`\\b${id}\\b`), id);
  }
  assert.match(source, /classifyPrePhase2bExecutionGate/);
  assert.match(source, /migrationCalls !== 0/);
  assert.match(source, /PRE_DDL_CONTRACT_MISMATCH/);
  assert.match(source, /residualTemporaryClusters:\s*0/);
});
