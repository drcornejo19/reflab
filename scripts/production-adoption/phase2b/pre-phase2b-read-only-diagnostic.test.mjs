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
import {
  PRE_PHASE2B_PRE_QUERY_ID,
  PRE_PHASE2B_REQUIRED_CHECKS,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import { buildPrePhase2bPreBatch } from "./run-production-pre-phase2b-adoption-prerequisite.mjs";
import {
  PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY,
  PRE_PHASE2B_DIAGNOSTIC_OPERATION,
  PRE_PHASE2B_DIAGNOSTIC_OPT_IN,
  authorizeProductionPrePhase2bDiagnosticTarget,
  classifyPrePhase2bDiagnostic,
  runProductionPrePhase2bReadOnlyDiagnostic,
  runProductionPrePhase2bReadOnlyDiagnosticCli,
} from "./run-production-pre-phase2b-read-only-diagnostic.mjs";

const head = "a".repeat(40);
const username = `postgres.${PRODUCTION_PROJECT_REF}`;
const expectedDdlRunnerSha256 = "7a02e6f06fb039f226ffb52b4d57cc433f55622553960ab59c4af79f6fe4c828";

const baseChecks = Object.freeze(Object.fromEntries(
  PRE_PHASE2B_REQUIRED_CHECKS.map((name) => [name, true]),
));

function installerPayload(overrides = {}) {
  const memberships = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
  const payload = {
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
  };
  return { ...payload, ...overrides };
}

function statePayload(overrides = {}) {
  return {
    caller: "postgres",
    session_user: "postgres",
    transaction_read_only: "on",
    server_version_num: 170011,
    checks: baseChecks,
    counts: {
      attempts: 37,
      exam_results: 6,
      notification_events: 60,
      clips: 30,
      score_non_null: 36,
      score_null: 1,
      training_duplicate_groups: 0,
    },
    ...overrides,
  };
}

function results(payload = statePayload(), installer = installerPayload()) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, installer],
    [PRE_PHASE2B_PRE_QUERY_ID, payload],
  ]);
}

function target() {
  return {
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
}

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [PRE_PHASE2B_DIAGNOSTIC_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: PRODUCTION_PROJECT_REF,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      `postgresql://${username}:fixture-password@${PRODUCTION_SESSION_POOLER_HOST}:5432/postgres?sslmode=require`,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: head,
    ...overrides,
  };
}

function run(payload = statePayload(), overrides = {}, installer = installerPayload()) {
  return runProductionPrePhase2bReadOnlyDiagnostic(environment(), {
    argument: PRE_PHASE2B_DIAGNOSTIC_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
    assertArtifact: () => ({ path: "prerequisite.sql", sha256: "f".repeat(64) }),
    authorize: () => target(),
    executeReadOnly: (sql) => {
      assert.equal(sql, buildPrePhase2bPreBatch());
      assert.doesNotThrow(() => assertReadOnlyBatch(sql));
      return results(payload, installer);
    },
    ...overrides,
  });
}

test("all exact fixture checks classify EXACT", () => {
  const output = run();
  assert.equal(output.classification, "EXACT");
  assert.deepEqual(output.failedChecks, []);
  assert.deepEqual(output.unknownChecks, []);
  assert.equal(output.checkCount, PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY.length);
  assert.deepEqual(Object.keys(output), [
    "format", "classification", "checkCount", "checks", "failedChecks",
    "unknownChecks", "expected", "observed",
  ]);
});

test("every pre-DDL predicate is exposed by its safe diagnostic name", () => {
  const output = run();
  assert.deepEqual(Object.keys(output.checks), [...PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY]);
  assert.equal(PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY.length, 25);
});

test("every pre-DDL predicate can be reported as a named failure", () => {
  const cases = new Map();
  const unsafeInstaller = installerPayload();
  unsafeInstaller.installer = { ...unsafeInstaller.installer, rolcreatedb: false };
  cases.set("installerManagedProfileExact", [statePayload(), unsafeInstaller]);
  cases.set("installerLifecycleExact", [
    statePayload(), installerPayload({ semantic_audit_role: null }),
  ]);
  cases.set("callerExact", [statePayload({ caller: "unexpected" })]);
  cases.set("sessionUserExact", [statePayload({ session_user: "unexpected" })]);
  cases.set("transactionReadOnlyExact", [statePayload({ transaction_read_only: "off" })]);
  cases.set("postgresMajorExact", [statePayload({ server_version_num: 180000 })]);
  for (const name of PRE_PHASE2B_REQUIRED_CHECKS) {
    cases.set(name, [statePayload({ checks: { ...baseChecks, [name]: false } })]);
  }
  for (const [name, field] of [
    ["attemptsCountExact", "attempts"],
    ["examResultsCountExact", "exam_results"],
    ["notificationEventsCountExact", "notification_events"],
    ["clipsCountExact", "clips"],
    ["scoreNonNullCountExact", "score_non_null"],
    ["scoreNullCountExact", "score_null"],
    ["trainingDuplicateGroupsExact", "training_duplicate_groups"],
  ]) {
    cases.set(name, [statePayload({ counts: { ...statePayload().counts, [field]: 999 } })]);
  }
  assert.deepEqual([...cases.keys()], [...PRE_PHASE2B_DIAGNOSTIC_CHECK_INVENTORY]);
  for (const [name, [payload, installer]] of cases) {
    const output = classifyPrePhase2bDiagnostic(results(payload, installer));
    assert.notEqual(output.classification, "EXACT", name);
    assert.ok(output.failedChecks.includes(name), name);
  }
});

test("one failed predicate reports its exact safe name", () => {
  const output = run(statePayload({ checks: { ...baseChecks, leaderboardExact: false } }));
  assert.equal(output.classification, "BLOCKER");
  assert.deepEqual(output.failedChecks, ["leaderboardExact"]);
});

test("multiple failed predicates report every safe name", () => {
  const output = run(statePayload({
    checks: { ...baseChecks, columnShapeExact: false, createdAtIndexesExact: false },
    counts: { ...statePayload().counts, attempts: 38 },
  }));
  assert.equal(output.classification, "BLOCKER");
  assert.deepEqual(output.failedChecks, [
    "columnShapeExact", "createdAtIndexesExact", "attemptsCountExact",
  ]);
});

test("transaction_read_only must be on", () => {
  const output = run(statePayload({
    transaction_read_only: "off",
    checks: { ...baseChecks, sessionExact: false },
  }));
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes("transactionReadOnlyExact"));
  assert.ok(output.failedChecks.includes("sessionExact"));
});

test("output is bounded to aggregate and catalog evidence", () => {
  const serialized = JSON.stringify(run());
  assert.doesNotMatch(serialized, /user_id|email|notification.*body|psychology.*text|raw.*row/i);
  assert.doesNotMatch(serialized, /fixture-password|postgresql:\/\//i);
});

test("Session Pooler is accepted and direct host is rejected", () => {
  assert.equal(authorizeProductionPrePhase2bDiagnosticTarget(environment()).host,
    PRODUCTION_SESSION_POOLER_HOST);
  assert.throws(() => authorizeProductionPrePhase2bDiagnosticTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      `postgresql://postgres:fixture-password@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`,
  })), /PRE_PHASE2B_TARGET_REJECTED/);
});

test("diagnostic rejects any DDL configuration", () => {
  assert.throws(() => authorizeProductionPrePhase2bDiagnosticTarget(environment({
    ALLOW_PRODUCTION_DDL: "true",
  })), /REJECTS_DDL_CONFIGURATION/);
});

test("diagnostic source cannot execute migration SQL or continue to Phase 2B", () => {
  const source = readFileSync(resolve(import.meta.dirname,
    "run-production-pre-phase2b-read-only-diagnostic.mjs"), "utf8");
  assert.doesNotMatch(source, /executeMigration|spawnSync|\bcommit\b|db push|migration discovery/i);
  assert.doesNotMatch(source, /202608310005|202608110001|202608130001|202608150001|202608310006/);
  assert.match(source, /buildPrePhase2bPreBatch\(\)/);
  assert.doesNotMatch(source, /nextMigration|nextAllowedRemoteOperation/);
});

test("CLI failures never expose secrets or URLs", async () => {
  let stderr = "";
  assert.equal(await runProductionPrePhase2bReadOnlyDiagnosticCli({}, {
    run: () => { throw new Error("postgresql://postgres:secret@unsafe.invalid/postgres"); },
    writeStderr: (value) => { stderr += value; },
  }), 1);
  assert.match(stderr, /READ_ONLY_DIAGNOSTIC_ABORTED/);
  assert.doesNotMatch(stderr, /secret|unsafe|postgresql/i);
});

test("existing DDL runner remains byte-for-byte unchanged", () => {
  const source = readFileSync(resolve(import.meta.dirname,
    "run-production-pre-phase2b-adoption-prerequisite.mjs"));
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedDdlRunnerSha256);
});

test("missing evidence is UNKNOWN and never EXACT", () => {
  const output = classifyPrePhase2bDiagnostic(new Map());
  assert.equal(output.classification, "UNKNOWN");
  assert.ok(output.unknownChecks.length > 0);
});
