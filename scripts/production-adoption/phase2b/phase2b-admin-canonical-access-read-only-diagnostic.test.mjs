import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import {
  PREFLIGHT_OPT_IN,
  PRODUCTION_SESSION_POOLER_HOST,
} from "../../production-preflight/target.mjs";
import {
  ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
  ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
} from "../bootstrap/production-role-bootstrap-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  ADMIN_CANONICAL_ACCESS_CHECKS,
  ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID,
} from "./phase2b-admin-canonical-access-contract.mjs";
import { CANONICAL_JSONB_TEXT_ACL } from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import { buildAdminCanonicalAccessPreBatch } from "./run-production-phase2b-admin-canonical-access.mjs";
import {
  ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS,
  ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS,
  ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS,
  ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION,
  ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPT_IN,
  authorizeProductionAdminCanonicalAccessDiagnosticTarget,
  classifyAdminCanonicalAccessDiagnostic,
  runProductionAdminCanonicalAccessReadOnlyDiagnostic,
  runProductionAdminCanonicalAccessReadOnlyDiagnosticCli,
} from "./run-production-phase2b-admin-canonical-access-read-only-diagnostic.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);
const username = `postgres.${PRODUCTION_PROJECT_REF}`;
const expectedMigrationSha256 = "0c8ea0383eb16bcef78b2252bd66682f9fbfa4b5dcea93d03807a1b91e6f8051";
const expectedDdlRunnerSha256 = "108be5302ef4816a1231b617ce6e53a2536447e6b9543b541e90543d00a43c67";
const diagnosticPath = resolve(import.meta.dirname,
  "run-production-phase2b-admin-canonical-access-read-only-diagnostic.mjs");
const diagnosticSource = readFileSync(diagnosticPath, "utf8");
const helperMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const helperSource = helperMigration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1] ?? "";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function installerPayload(overrides = {}, membershipContract = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS) {
  const memberships = membershipContract.map((membership) => ({
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
    server_version_num: 170011,
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

function fingerprintPayload(overrides = {}) {
  return { attempts: 37, exam_results: 6, notification_events: 60, ...overrides };
}

function sidecarPayload(overrides = {}) {
  const migration = readFileSync(resolve(root,
    "supabase/migrations/202608310004_production_adoption_semantic_audit.sql"), "utf8");
  const source = migration.match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i)?.[1];
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170011,
    checks: Object.fromEntries(PHASE2A_SEMANTIC_AUDIT_POST_CHECKS.map((name) => [name, true])),
    counts: {
      policies: 58,
      column_grants: 100,
      effective_select_columns: 100,
      ledger_rows: 3,
      schema_state_rows: 0,
    },
    function_source_base64: Buffer.from(source, "utf8").toString("base64"),
    ...overrides,
  };
}

function statePayload(overrides = {}) {
  return {
    checks: Object.fromEntries(ADMIN_CANONICAL_ACCESS_CHECKS.map((name) => [name, true])),
    helper_source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    helper_acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    functions: [],
    function_acl: [],
    policies: [],
    schema_acl: [],
    table_acl: [],
    column_acl: [],
    counts: {
      attempts: 37,
      exam_results: 6,
      notification_events: 60,
      ledger: 3,
      schema_state: 0,
    },
    ...overrides,
  };
}

function results({ installer, fingerprint, sidecar, state } = {}) {
  return new Map([
    [installerIdentityQuery.id, installer ?? installerPayload()],
    [phase1ProductFingerprintQuery.id, fingerprint ?? fingerprintPayload()],
    [phase2aSemanticAuditPostQuery.id, sidecar ?? sidecarPayload()],
    [ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID, state ?? statePayload()],
  ]);
}

function target(overrides = {}) {
  const base = {
    projectRef: PRODUCTION_PROJECT_REF,
    host: PRODUCTION_SESSION_POOLER_HOST,
    connectionEnvironment: {
      PGHOST: PRODUCTION_SESSION_POOLER_HOST,
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: username,
      PGPASSWORD: "fixture-password",
      PGSSLMODE: "require",
    },
  };
  return { ...base, ...overrides };
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      `postgresql://${username}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: head,
    ...overrides,
  };
}

function run(resultMap = results(), dependencyOverrides = {}, environmentOverrides = {}) {
  return runProductionAdminCanonicalAccessReadOnlyDiagnostic(
    environment(environmentOverrides),
    {
      argument: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
      authorize: () => target(),
      executeReadOnly: (batch) => {
        assert.equal(batch, buildAdminCanonicalAccessPreBatch());
        assert.doesNotThrow(() => assertReadOnlyBatch(batch));
        return resultMap;
      },
      ...dependencyOverrides,
    },
  );
}

test("all exact fixture state classifies EXACT", () => {
  const output = run();
  assert.equal(output.classification, "EXACT");
  assert.deepEqual(output.failedComponents, []);
  assert.deepEqual(output.unknownComponents, []);
  assert.deepEqual(output.failedChecks, []);
  assert.deepEqual(output.unknownChecks, []);
  assert.deepEqual(Object.keys(output.components), [...ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_COMPONENTS]);
  assert.deepEqual(Object.keys(output.checks), [...ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_CHECKS]);
});

for (const name of ADMIN_CANONICAL_ACCESS_CHECKS) {
  test(`check ${name} is surfaced by its exact safe name`, () => {
    const state = statePayload();
    state.checks[name] = false;
    const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
    assert.equal(output.classification, "BLOCKER", name);
    assert.ok(output.failedChecks.includes(name), name);
  });
}

test("multiple failures are surfaced together", () => {
  const state = statePayload();
  state.checks.ledgerExact = false;
  state.checks.adminPoliciesStateExact = false;
  state.checks.rlsOwnerCreateAbsent = false;
  const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
  assert.deepEqual(output.failedChecks, [
    "ledgerExact", "adminPoliciesStateExact", "rlsOwnerCreateAbsent",
  ]);
});

test("installer managed profile mismatch is a separate component", () => {
  const installer = installerPayload();
  installer.installer.rolcreatedb = false;
  const output = classifyAdminCanonicalAccessDiagnostic(results({ installer }));
  assert.equal(output.components.installerManagedProfileExact, false);
  assert.ok(output.failedComponents.includes("installerManagedProfileExact"));
});

test("installer lifecycle mismatch is a separate component", () => {
  const output = classifyAdminCanonicalAccessDiagnostic(results({
    installer: installerPayload(
      { semantic_audit_role: null },
      ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
    ),
  }));
  assert.equal(output.components.installerLifecycleExact, false);
  assert.ok(output.failedComponents.includes("installerLifecycleExact"));
});

test("historical fingerprint mismatch is a separate component", () => {
  const output = classifyAdminCanonicalAccessDiagnostic(results({
    fingerprint: fingerprintPayload({ attempts: 38 }),
  }));
  assert.equal(output.components.historicalFingerprintExact, false);
  assert.ok(output.failedComponents.includes("historicalFingerprintExact"));
});

test("Phase 2A sidecar mismatch is a separate component", () => {
  const sidecar = sidecarPayload();
  sidecar.checks.auditPoliciesExact = false;
  const output = classifyAdminCanonicalAccessDiagnostic(results({ sidecar }));
  assert.equal(output.components.phase2aSidecarExact, false);
  assert.ok(output.failedComponents.includes("phase2aSidecarExact"));
});

test("helper source mismatch is detected", () => {
  const state = statePayload({
    helper_source_base64: Buffer.from("begin return null; end", "utf8").toString("base64"),
  });
  const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
  assert.equal(output.checks.helperSourceExact, false);
  assert.ok(output.failedChecks.includes("helperSourceExact"));
});

test("helper ACL mismatch is detected", () => {
  const state = statePayload();
  state.helper_acl.push({
    grantee: "anon", grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false,
  });
  const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
  assert.equal(output.checks.helperAclExact, false);
  assert.ok(output.failedChecks.includes("helperAclExact"));
});

for (const [name, field, value] of [
  ["existing admin functions", "functions", { name: "admin_set_canonical_user_plan" }],
  ["existing function ACL", "function_acl", { routine: "admin_set_canonical_user_plan" }],
  ["existing admin policies", "policies", { policy_name: "admin access" }],
  ["existing schema grants", "schema_acl", { schema_name: "public" }],
  ["existing table grants", "table_acl", { table_name: "user_profiles" }],
  ["existing column grants", "column_acl", { column_name: "user_id" }],
]) test(`${name} are detected by the derived pre-state classifier`, () => {
  const state = statePayload();
  state[field].push(value);
  const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
  const derived = {
    functions: "functionsExact",
    function_acl: "functionAclExact",
    policies: "policiesExact",
    schema_acl: "schemaAclExact",
    table_acl: "tableAclExact",
    column_acl: "columnAclExact",
  }[field];
  assert.equal(output.checks[derived], false);
  assert.ok(output.failedChecks.includes(derived));
});

test("all eight derived classifier booleans are exposed", () => {
  const output = run();
  assert.deepEqual(ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS.map((name) => output.checks[name]),
    Array(ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS.length).fill(true));
});

test("UNKNOWN values remain UNKNOWN and fail closed", () => {
  const state = statePayload();
  delete state.checks.dependenciesExact;
  const output = classifyAdminCanonicalAccessDiagnostic(results({ state }));
  assert.equal(output.classification, "UNKNOWN");
  assert.ok(output.unknownComponents.includes("adminCanonicalAccessPreStateExact"));
  assert.ok(output.unknownChecks.includes("dependenciesExact"));
  for (const name of ADMIN_CANONICAL_ACCESS_DERIVED_CHECKS) {
    assert.ok(output.unknownChecks.includes(name), name);
  }
});

test("diagnostic representation discards function bodies, raw rows, identifiers, and PII", () => {
  const fingerprint = fingerprintPayload({
    rows: [{ user_id: "user-sensitive", email: "sensitive@example.invalid" }],
  });
  const state = statePayload({
    raw_rows: [{ notification_body: "private notification text" }],
  });
  const serialized = JSON.stringify(classifyAdminCanonicalAccessDiagnostic(
    results({ fingerprint, state }),
  ));
  assert.doesNotMatch(serialized,
    /user-sensitive|sensitive@example\.invalid|private notification text|raw_rows|source_base64/);
});

test("transaction_read_only is required by the exact fixed batch", () => {
  const batch = buildAdminCanonicalAccessPreBatch();
  assert.match(batch, /^begin read only;/i);
  assert.match(batch, /show transaction_read_only/i);
  assert.match(batch, /transaction_read_only/);
  assert.match(batch, /rollback;\s*$/i);
  assert.doesNotThrow(() => assertReadOnlyBatch(batch));
});

test("Session Pooler is accepted and direct database host is rejected", () => {
  assert.equal(authorizeProductionAdminCanonicalAccessDiagnosticTarget(
    environment(),
  ).host, PRODUCTION_SESSION_POOLER_HOST);
  assert.throws(() => authorizeProductionAdminCanonicalAccessDiagnosticTarget(
    environment({
      [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
        `postgresql://postgres:fixture-password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
    }),
  ), /TARGET_REJECTED/);
});

test("inherited PostgreSQL state and every DDL configuration are rejected", () => {
  let calls = 0;
  assert.throws(() => run(results(), {
    executeReadOnly: () => { calls += 1; return results(); },
  }, { PGHOST: "inherited.invalid" }), /inherited PostgreSQL/i);
  for (const name of [
    "ALLOW_PRODUCTION_DDL",
    "ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS",
    "REFLAB_PRODUCTION_DDL_DB_URL",
    "REFLAB_PRODUCTION_DDL_PROJECT_REF",
    "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  ]) {
    assert.throws(() => authorizeProductionAdminCanonicalAccessDiagnosticTarget(
      environment({ [name]: "forbidden" }),
    ), /REJECTS_DDL_CONFIGURATION/);
  }
  assert.equal(calls, 0);
});

test("diagnostic has no migration or provider execution path", () => {
  for (const forbidden of [
    /executeMigration/, /spawnSync/, /assertAdminCanonicalAccessArtifact/,
    /ADMIN_CANONICAL_ACCESS_ARTIFACT/,
    /202608110001_canonical_admin_user_access\.sql/,
    /runProductionPhase2bAdminCanonicalAccess\b/,
    /202608130001|202608150001|202608310006/,
    /db\s+push|readdir|glob|migration discovery/i,
  ]) assert.doesNotMatch(diagnosticSource, forbidden);
  assert.match(diagnosticSource, /executeReadOnlyBatch/);
  assert.match(diagnosticSource, /buildAdminCanonicalAccessPreBatch/);
});

test("existing DDL runner and migration remain byte-for-byte unchanged", () => {
  const ddlRunner = readFileSync(resolve(root,
    "scripts/production-adoption/phase2b/run-production-phase2b-admin-canonical-access.mjs"));
  const migration = readFileSync(resolve(root,
    "supabase/migrations/202608110001_canonical_admin_user_access.sql"));
  assert.equal(sha256(ddlRunner), expectedDdlRunnerSha256);
  assert.equal(sha256(migration), expectedMigrationSha256);
});

test("CLI emits bounded output and never serializes an unsafe error", async () => {
  let stdout = "";
  let stderr = "";
  assert.equal(await runProductionAdminCanonicalAccessReadOnlyDiagnosticCli({}, {
    argument: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION,
    run: () => ({ format: "REFLAB_202608110001_READ_ONLY_DIAGNOSTIC_V1", classification: "EXACT" }),
    writeStdout: (value) => { stdout += value; },
    writeStderr: (value) => { stderr += value; },
  }), 0);
  assert.match(stdout, /REFLAB_202608110001_READ_ONLY_DIAGNOSTIC_V1/);
  assert.equal(stderr, "");
  stdout = "";
  assert.equal(await runProductionAdminCanonicalAccessReadOnlyDiagnosticCli({}, {
    argument: ADMIN_CANONICAL_ACCESS_DIAGNOSTIC_OPERATION,
    run: () => { throw new Error("postgresql:\/\/user:secret@example.invalid\/private"); },
    writeStdout: (value) => { stdout += value; },
    writeStderr: (value) => { stderr += value; },
  }), 1);
  assert.equal(stdout, "");
  assert.doesNotMatch(stderr, /secret|postgresql:|example\.invalid/);
  assert.match(stderr, /READ_ONLY_DIAGNOSTIC_ABORTED/);
});
