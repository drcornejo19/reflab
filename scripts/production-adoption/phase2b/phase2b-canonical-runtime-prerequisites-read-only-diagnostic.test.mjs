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
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import { buildCanonicalRuntimePrerequisitesPreBatch } from "./run-production-phase2b-canonical-runtime-prerequisites.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS,
  CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION,
  CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPT_IN,
  authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget,
  classifyCanonicalRuntimePrerequisitesDiagnostic,
  runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnostic,
  runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnosticCli,
} from "./run-production-phase2b-canonical-runtime-prerequisites-read-only-diagnostic.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);
const username = `postgres.${PRODUCTION_PROJECT_REF}`;
const expectedMigrationSha256 = "66ee4c2ce2f849d4d3d1aa20bbf87c90e4ed6c97cd29eb86448be75660a822e9";
const expectedDdlRunnerSha256 = "f47321157b0a7dac76d9ff85af643c129aa87d55d9c2aa2477f7f375267539af";
const diagnosticPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-runtime-prerequisites-read-only-diagnostic.mjs");
const diagnosticSource = readFileSync(diagnosticPath, "utf8");

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
    checks: Object.fromEntries(CANONICAL_RUNTIME_PREREQUISITES_CHECKS.map((name) => [name, true])),
    source_base64: null,
    acl: [],
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
    [INSTALLER_IDENTITY_QUERY_ID, installer ?? installerPayload()],
    [phase1ProductFingerprintQuery.id, fingerprint ?? fingerprintPayload()],
    [phase2aSemanticAuditPostQuery.id, sidecar ?? sidecarPayload()],
    [CANONICAL_RUNTIME_PREREQUISITES_PRE_QUERY_ID, state ?? statePayload()],
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
    [CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      `postgresql://${username}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: head,
    ...overrides,
  };
}

function run(resultMap = results(), dependencyOverrides = {}, environmentOverrides = {}) {
  return runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnostic(
    environment(environmentOverrides),
    {
      argument: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
      authorize: () => target(),
      executeReadOnly: (batch) => {
        assert.equal(batch, buildCanonicalRuntimePrerequisitesPreBatch());
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
  assert.deepEqual(Object.keys(output.components),
    [...CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_COMPONENTS]);
  assert.deepEqual(Object.keys(output.checks),
    [...CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_CHECKS]);
});

test("every individual 310005 check is surfaced by its exact safe name", () => {
  for (const name of CANONICAL_RUNTIME_PREREQUISITES_CHECKS) {
    const state = statePayload();
    state.checks[name] = false;
    const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({ state }));
    assert.equal(output.classification, "BLOCKER", name);
    assert.deepEqual(output.failedChecks, [name], name);
  }
  const output = run();
  assert.equal(output.checks.sourceHashExact, true);
  assert.equal(output.checks.aclExact, true);
});

test("diagnostic representation discards raw rows, identifiers, and PII", () => {
  const fingerprint = fingerprintPayload({
    rows: [{ user_id: "user-sensitive", email: "sensitive@example.invalid" }],
  });
  const state = statePayload({
    raw_rows: [{ notification_body: "private notification text" }],
  });
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({ fingerprint, state }));
  const serialized = JSON.stringify(output);
  assert.equal(output.classification, "EXACT");
  assert.doesNotMatch(serialized,
    /user-sensitive|sensitive@example\.invalid|private notification text|raw_rows/);
});

test("multiple failed checks are all surfaced", () => {
  const state = statePayload();
  state.checks.ledgerExact = false;
  state.checks.adminProvidersAbsent = false;
  state.checks.laterAdoptionAbsent = false;
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({ state }));
  assert.deepEqual(output.failedChecks, [
    "ledgerExact", "adminProvidersAbsent", "laterAdoptionAbsent",
  ]);
});

test("installer lifecycle mismatch is a separate component", () => {
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({
    installer: installerPayload(
      { semantic_audit_role: null },
      ROLE_BOOTSTRAP_POST_BOOTSTRAP_MEMBERSHIPS,
    ),
  }));
  assert.equal(output.components.installerLifecycleExact, false);
  assert.ok(output.failedComponents.includes("installerLifecycleExact"));
});

test("historical fingerprint mismatch is a separate component", () => {
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({
    fingerprint: fingerprintPayload({ attempts: 38 }),
  }));
  assert.equal(output.components.historicalFingerprintExact, false);
  assert.ok(output.failedComponents.includes("historicalFingerprintExact"));
});

test("Phase 2A sidecar mismatch is a separate component", () => {
  const sidecar = sidecarPayload();
  sidecar.checks.auditPoliciesExact = false;
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({ sidecar }));
  assert.equal(output.components.phase2aSidecarExact, false);
  assert.ok(output.failedComponents.includes("phase2aSidecarExact"));
});

test("incomplete values remain UNKNOWN and fail closed", () => {
  const state = statePayload();
  delete state.checks.canonicalJsonbTextAclExact;
  const output = classifyCanonicalRuntimePrerequisitesDiagnostic(results({ state }));
  assert.equal(output.classification, "UNKNOWN");
  assert.ok(output.unknownComponents.includes("canonicalRuntimePreStateExact"));
  assert.ok(output.unknownChecks.includes("canonicalJsonbTextAclExact"));
  assert.ok(output.unknownChecks.includes("sourceHashExact"));
  assert.ok(output.unknownChecks.includes("aclExact"));
});

test("transaction_read_only is required by the exact fixed batch", () => {
  const batch = buildCanonicalRuntimePrerequisitesPreBatch();
  assert.match(batch, /^begin read only;/i);
  assert.match(batch, /show transaction_read_only/i);
  assert.match(batch, /transaction_read_only/);
  assert.match(batch, /rollback;\s*$/i);
  assert.doesNotThrow(() => assertReadOnlyBatch(batch));
});

test("Session Pooler is accepted and direct database host is rejected", () => {
  assert.equal(authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget(
    environment(),
  ).host, PRODUCTION_SESSION_POOLER_HOST);
  assert.throws(() => authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget(
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
    "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_PREREQUISITES",
    "REFLAB_PRODUCTION_DDL_PROJECT_REF",
    "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
    "REFLAB_PRODUCTION_DDL_DB_URL",
  ]) {
    assert.throws(() => authorizeProductionCanonicalRuntimePrerequisitesDiagnosticTarget(
      environment({ [name]: "forbidden" }),
    ), /REJECTS_DDL_CONFIGURATION/);
  }
  assert.equal(calls, 0);
});

test("diagnostic has no migration or provider execution path", () => {
  for (const forbidden of [
    /executeMigration/, /spawnSync/, /assertCanonicalRuntimePrerequisitesArtifact/,
    /202608310005_production_adoption_canonical_runtime_prerequisites\.sql/,
    /202608110001|202608130001|202608150001|202608310006/,
    /db\s+push|readdir|glob|migration discovery/i,
  ]) assert.doesNotMatch(diagnosticSource, forbidden);
  assert.match(diagnosticSource, /executeReadOnlyBatch/);
  assert.match(diagnosticSource, /buildCanonicalRuntimePrerequisitesPreBatch/);
  assert.doesNotMatch(diagnosticSource, /ALLOW_PRODUCTION_DDL\]\s*!==\s*"true"/);
});

test("existing DDL runner and migration remain byte-for-byte unchanged", () => {
  const ddlRunner = readFileSync(resolve(root,
    "scripts/production-adoption/phase2b/run-production-phase2b-canonical-runtime-prerequisites.mjs"));
  const migration = readFileSync(resolve(root,
    "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"));
  assert.equal(sha256(ddlRunner), expectedDdlRunnerSha256);
  assert.equal(sha256(migration), expectedMigrationSha256);
});

test("CLI emits bounded output and never serializes an unsafe error", async () => {
  let stdout = "";
  let stderr = "";
  assert.equal(await runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnosticCli({}, {
    argument: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION,
    run: () => ({ format: "REFLAB_310005_READ_ONLY_DIAGNOSTIC_V1", classification: "EXACT" }),
    writeStdout: (value) => { stdout += value; },
    writeStderr: (value) => { stderr += value; },
  }), 0);
  assert.match(stdout, /REFLAB_310005_READ_ONLY_DIAGNOSTIC_V1/);
  assert.equal(stderr, "");
  stdout = "";
  assert.equal(await runProductionCanonicalRuntimePrerequisitesReadOnlyDiagnosticCli({}, {
    argument: CANONICAL_RUNTIME_PREREQUISITES_DIAGNOSTIC_OPERATION,
    run: () => { throw new Error("postgresql:\/\/user:secret@example.invalid\/private"); },
    writeStdout: (value) => { stdout += value; },
    writeStderr: (value) => { stderr += value; },
  }), 1);
  assert.equal(stdout, "");
  assert.doesNotMatch(stderr, /secret|postgresql:|example\.invalid/);
  assert.match(stderr, /READ_ONLY_DIAGNOSTIC_ABORTED/);
});
