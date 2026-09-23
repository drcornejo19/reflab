import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { assertReadOnlyBatch } from "../../production-preflight/sql-safety.mjs";
import { semanticAuditSnapshotQuery } from "../../production-preflight/queries.mjs";
import {
  PRODUCTION_PROJECT_REF,
} from "../../production-preflight/manifest.mjs";
import {
  PRODUCTION_PREFLIGHT_ROLE,
  PRODUCTION_SESSION_POOLER_HOST,
} from "../../production-preflight/target.mjs";
import {
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
  ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
} from "../bootstrap/production-role-bootstrap-contract.mjs";
import {
  phase1ProductFingerprintQuery,
} from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import {
  phase1ExamTrainingPostQuery,
} from "../bootstrap/phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS,
  phase1PsychologyNotificationsMutationFingerprintQuery,
  phase1PsychologyNotificationsPostQuery,
} from "../bootstrap/phase1-psychology-notifications-ddl-contract.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_POST_CHECKS,
  phase2aSemanticAuditPostQuery,
} from "./phase2a-semantic-audit-ddl-contract.mjs";
import {
  SEMANTIC_AUDIT_SOURCE_HASH,
  semanticAuditExpectedFields,
} from "./semantic-audit-contract.mjs";
import {
  PHASE2A_SESSION_QUERY_ID,
  PHASE2A_SIDECAR_ATTESTATION_OPERATION,
  SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY,
  SEMANTIC_AUDIT_CALLER_PROBE_OPERATION,
  SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN,
  SNAPSHOT_FAILURE_STAGES,
  assertStrictSessionPoolerTarget,
  buildPhase2aSidecarAttestationBatch,
  buildSemanticAuditCallerProbeBatch,
  buildSemanticAuditSnapshotInvocationBatch,
  buildSemanticAuditSnapshotSessionBatch,
  classifyCallerProbe,
  classifyPhase2aSidecarAttestation,
  classifySemanticAuditSnapshot,
  classifySession,
  formatSnapshotGateFailure,
} from "./phase2a-semantic-snapshot-execution-contract.mjs";
import {
  runProductionPhase2aSidecarAttestation,
  runProductionPhase2aSidecarAttestationCli,
} from "./run-production-phase2a-sidecar-attestation.mjs";
import {
  runProductionSemanticAuditCallerProbe,
} from "./run-production-semantic-audit-caller-probe.mjs";
import {
  SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
  runProductionSemanticAuditSnapshot,
  runProductionSemanticAuditSnapshotCli,
} from "./run-production-semantic-audit-snapshot.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

function exactSnapshot() {
  return Object.fromEntries(Object.entries(semanticAuditExpectedFields)
    .map(([group, fields]) => [group, Object.fromEntries(fields.map((field) => [field, 0]))]));
}

function session(caller, overrides = {}) {
  return {
    current_user: caller,
    session_user: caller,
    database: "postgres",
    transaction_read_only: "on",
    default_transaction_read_only: "on",
    server_version_num: 170011,
    ...overrides,
  };
}

function poolerTarget(role) {
  const username = `${role}.${PRODUCTION_PROJECT_REF}`;
  return {
    projectRef: PRODUCTION_PROJECT_REF,
    host: PRODUCTION_SESSION_POOLER_HOST,
    connectionEnvironment: {
      PGHOST: PRODUCTION_SESSION_POOLER_HOST,
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: username,
      PGPASSWORD: "not-returned",
      PGSSLMODE: "require",
    },
  };
}

function catalogMemberships() {
  return ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((membership) => ({
    granted_role: membership.grantedRole,
    member_role: membership.memberRole,
    grantor_role: membership.grantorRole,
    admin_option: membership.adminOption,
    inherit_option: membership.inheritOption,
    set_option: membership.setOption,
  }));
}

function exactInstaller() {
  const memberships = catalogMemberships();
  return {
    caller: "postgres",
    session_user: "postgres",
    server_version_num: 170011,
    installer: { rolname: "postgres", ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES },
    protected_role: { rolname: "reflab_rls_owner", ...ROLE_BOOTSTRAP_ROLE_ATTRIBUTES },
    semantic_audit_role: {
      rolname: "reflab_preflight_audit_owner",
      ...ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
    },
    memberships,
    membership_summary: {
      total_count: memberships.length,
      as_member_count: memberships.length,
      as_granted_role_count: 0,
    },
    database: { name: "postgres", owner: "postgres", postgres_has_create: true },
    schemas: [],
  };
}

const examChecks = {
  foundationStatePreserved: true,
  targetTableExact: true,
  targetTableColumnsExact: true,
  targetPrimaryKeyExact: true,
  targetTableEmpty: true,
  targetAclExact: false,
  targetColumnsExact: true,
  targetColumnsNullable: true,
  targetIndexesExact: true,
  targetConstraintsExact: true,
  targetCheckSemanticsExact: true,
  targetFkSemanticsExact: true,
  targetUniqueSemanticsExact: true,
  ledgerExact: false,
  schemaStateEmpty: true,
  canonicalMarkerAbsent: true,
  identityLinksAbsent: true,
  developmentObjectsAbsent: true,
  laterPhaseInfrastructureAbsent: false,
  fabricatedAssociationsAbsent: true,
};

function exactGateAResults() {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/202608310004_production_adoption_semantic_audit.sql"),
    "utf8",
  );
  const functionSource = migration.match(/as \$semantic_audit\$([\s\S]*?)\$semantic_audit\$;/i)?.[1];
  assert.ok(functionSource);
  const psychologyChecks = Object.fromEntries(
    PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS.map((field) => [field, true]),
  );
  psychologyChecks.phase310004Absent = false;
  return new Map([
    [PHASE2A_SESSION_QUERY_ID, session("postgres")],
    [installerIdentityQuery.id, exactInstaller()],
    [phase1ProductFingerprintQuery.id, {
      attempts: 37,
      exam_results: 6,
      notification_events: 60,
    }],
    [phase1ExamTrainingPostQuery.id, {
      checks: examChecks,
      counts: {
        target_columns: 6,
        target_indexes: 3,
        target_constraints: 20,
        check_constraints: 13,
        foreign_keys: 5,
        unique_constraints: 2,
        target_rows: 0,
        schema_state_rows: 0,
        ledger_rows: 3,
      },
    }],
    [phase1PsychologyNotificationsMutationFingerprintQuery.id, {
      notification_count: 60,
      notification_rows_hash: "same",
    }],
    [phase1PsychologyNotificationsPostQuery.id, {
      caller: "postgres",
      session_user: "postgres",
      transaction_read_only: "on",
      server_version_num: 170011,
      checks: psychologyChecks,
      counts: {
        catalog_rows: 8,
        notification_events: 60,
        notification_backfills: 0,
        checkins: 3,
        wellbeing: 0,
        exercise_sessions: 0,
        ledger_rows: 3,
      },
    }],
    [phase2aSemanticAuditPostQuery.id, {
      caller: "postgres",
      session_user: "postgres",
      transaction_read_only: "on",
      server_version_num: 170011,
      checks: Object.fromEntries(PHASE2A_SEMANTIC_AUDIT_POST_CHECKS.map((field) => [field, true])),
      counts: {
        policies: 58,
        column_grants: 100,
        effective_select_columns: 100,
        ledger_rows: 3,
        schema_state_rows: 0,
      },
      function_source_base64: Buffer.from(functionSource).toString("base64"),
    }],
  ]);
}

test("all fixed inventories are read-only and only Gate B invocation calls the snapshot", () => {
  const gateA = buildPhase2aSidecarAttestationBatch();
  const probe = buildSemanticAuditCallerProbeBatch();
  const gateBSession = buildSemanticAuditSnapshotSessionBatch();
  const gateBInvocation = buildSemanticAuditSnapshotInvocationBatch();
  for (const sql of [gateA, probe, gateBSession, gateBInvocation]) {
    assert.doesNotThrow(() => assertReadOnlyBatch(sql));
    assert.match(sql, /^begin read only;/i);
    assert.match(sql, /rollback;\s*$/i);
    assert.doesNotMatch(sql, /\bset\s+role\b|\bcreate\s+temp\b/i);
  }
  const invocation = /(?:select|then)\s+reflab_audit\.production_semantic_snapshot\(\)/i;
  assert.doesNotMatch(gateA, invocation);
  assert.doesNotMatch(probe, invocation);
  assert.doesNotMatch(gateBSession, invocation);
  assert.match(gateBInvocation, invocation);
  assert.match(gateBInvocation, /default_transaction_read_only'\) = 'on'/i);
  assert.match(gateBInvocation, /transaction_read_only'\) = 'on'/i);
});

test("strict target permits only the Session Pooler and exact role", () => {
  assert.equal(assertStrictSessionPoolerTarget(
    poolerTarget("postgres"),
    `postgres.${PRODUCTION_PROJECT_REF}`,
  ).host, PRODUCTION_SESSION_POOLER_HOST);
  const direct = poolerTarget("postgres");
  direct.host = `db.${PRODUCTION_PROJECT_REF}.supabase.co`;
  direct.connectionEnvironment.PGHOST = direct.host;
  assert.throws(() => assertStrictSessionPoolerTarget(
    direct,
    `postgres.${PRODUCTION_PROJECT_REF}`,
  ), /Session Pooler/);
  assert.throws(() => assertStrictSessionPoolerTarget(
    poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
    `postgres.${PRODUCTION_PROJECT_REF}`,
  ), /Session Pooler/);
});

test("session contract is live, PG17-only, caller-exact and read-only", () => {
  assert.equal(classifySession(session(PRODUCTION_PREFLIGHT_ROLE), PRODUCTION_PREFLIGHT_ROLE).classification, "EXACT");
  for (const drift of [
    { current_user: "postgres" },
    { session_user: "postgres" },
    { database: "wrong" },
    { transaction_read_only: "off" },
    { server_version_num: 180003 },
  ]) assert.equal(classifySession(
    session(PRODUCTION_PREFLIGHT_ROLE, drift),
    PRODUCTION_PREFLIGHT_ROLE,
  ).classification, "BLOCKER");
});

test("Gate A reuses exact post-state classifiers and fails on every protected drift", () => {
  const exact = exactGateAResults();
  assert.equal(
    classifyPhase2aSidecarAttestation(exact).classification,
    "PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_EXACT",
  );
  const mutations = [
    [PHASE2A_SESSION_QUERY_ID, (value) => ({ ...value, server_version_num: 180003 })],
    [installerIdentityQuery.id, (value) => ({ ...value,
      semantic_audit_role: { ...value.semantic_audit_role, rolcanlogin: true } })],
    [installerIdentityQuery.id, (value) => ({ ...value,
      memberships: [...value.memberships, { ...value.memberships.at(-1), grantor_role: "postgres" }],
      membership_summary: { ...value.membership_summary, total_count: value.memberships.length + 1,
        as_member_count: value.memberships.length + 1 } })],
    [phase1ProductFingerprintQuery.id, (value) => ({ ...value, attempts: 38 })],
    [phase1ExamTrainingPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, targetConstraintsExact: false } })],
    [phase1PsychologyNotificationsPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, ledgerExact: false } })],
    [phase2aSemanticAuditPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, ownerMembershipsExact: false } })],
    [phase2aSemanticAuditPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, auditPoliciesExact: false } })],
    [phase2aSemanticAuditPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, columnGrantsExact: false } })],
    [phase2aSemanticAuditPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, canonicalMarkerAbsent: false } })],
    [phase2aSemanticAuditPostQuery.id, (value) => ({ ...value,
      checks: { ...value.checks, phase2bAbsent: false } })],
  ];
  for (const [id, mutate] of mutations) {
    const drift = new Map(exact);
    drift.set(id, mutate(exact.get(id)));
    assert.equal(classifyPhase2aSidecarAttestation(drift).classification, "BLOCKER");
  }
});

test("Gate A source hash is enforced by the shared exact post-state contract", () => {
  const exact = exactGateAResults();
  assert.match(SEMANTIC_AUDIT_SOURCE_HASH, /^[0-9a-f]{64}$/);
  const sidecar = exact.get(phase2aSemanticAuditPostQuery.id);
  exact.set(phase2aSemanticAuditPostQuery.id, {
    ...sidecar,
    function_source_base64: Buffer.from("select '{}'::jsonb").toString("base64"),
  });
  assert.equal(classifyPhase2aSidecarAttestation(exact).classification, "BLOCKER");
});

test("caller probe observes but never guesses default_transaction_read_only", () => {
  assert.equal(SEMANTIC_AUDIT_CALLER_DEFAULT_TRANSACTION_READ_ONLY, "on");
  const results = new Map([[PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)]]);
  const decision = classifyCallerProbe(results);
  assert.equal(decision.classification, "CALLER_DEFAULT_READ_ONLY_OBSERVED");
  assert.equal(decision.observedDefaultTransactionReadOnly, "on");
  assert.equal(decision.defaultContractPinned, false);
  const malformed = new Map([[PHASE2A_SESSION_QUERY_ID, session(
    PRODUCTION_PREFLIGHT_ROLE,
    { default_transaction_read_only: "unexpected" },
  )]]);
  assert.equal(classifyCallerProbe(malformed).classification, "BLOCKER");
});

test("Gate B accepts only an exact pinned caller session and 10/37 snapshot", () => {
  const results = new Map([
    [PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)],
    [semanticAuditSnapshotQuery.id, exactSnapshot()],
  ]);
  assert.equal(classifySemanticAuditSnapshot(results).classification, "PASS");
  const wrongDefault = new Map(results);
  wrongDefault.set(PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE, {
    default_transaction_read_only: "off",
  }));
  assert.equal(classifySemanticAuditSnapshot(wrongDefault).classification, "BLOCKER");
  const missingDefault = new Map(results);
  const missingSession = session(PRODUCTION_PREFLIGHT_ROLE);
  delete missingSession.default_transaction_read_only;
  missingDefault.set(PHASE2A_SESSION_QUERY_ID, missingSession);
  assert.equal(classifySemanticAuditSnapshot(missingDefault).classification, "UNKNOWN");
  const unexpected = structuredClone(exactSnapshot());
  unexpected.unexpected = { raw_rows: 1 };
  const bad = new Map(results);
  bad.set(semanticAuditSnapshotQuery.id, unexpected);
  assert.equal(classifySemanticAuditSnapshot(bad).classification, "BLOCKER");
  const pii = structuredClone(exactSnapshot());
  const [firstGroup] = Object.keys(pii);
  const [firstMetric] = Object.keys(pii[firstGroup]);
  pii[firstGroup][firstMetric] = "user@example.invalid";
  const unsafe = new Map(results);
  unsafe.set(semanticAuditSnapshotQuery.id, pii);
  assert.equal(classifySemanticAuditSnapshot(unsafe).classification, "BLOCKER");
});

test("Gate B runner requires reviewed Gate A, attests first, and returns no continuation", () => {
  const environment = {
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    [SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN]: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: head,
  };
  let calls = 0;
  const result = runProductionSemanticAuditSnapshot(environment, {
    argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
    executeReadOnly: (sql) => {
      calls += 1;
      return /production_semantic_snapshot\(\)/i.test(sql)
        ? new Map([
          [PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)],
          [semanticAuditSnapshotQuery.id, exactSnapshot()],
        ])
        : new Map([[PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)]]);
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.callerDefaultTransactionReadOnly, "on");
  assert.equal(result.output.groups, 10);
  assert.equal(result.output.numericMetrics, 37);
  assert.equal(result.nextMigration, "NOT_AUTHORIZED");
});

test("Gate B rejects default off before the snapshot invocation with a bounded reason", async () => {
  const environment = {
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    [SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN]: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: head,
  };
  let snapshotCalls = 0;
  let stderr = "";
  assert.equal(await runProductionSemanticAuditSnapshotCli(environment, {
    argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
    executeReadOnly: (sql) => {
      if (/production_semantic_snapshot\(\)/i.test(sql)) snapshotCalls += 1;
      return new Map([[PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE, {
        default_transaction_read_only: "off",
      })]]);
    },
    writeStderr: (value) => { stderr += value; },
  }), 1);
  assert.equal(snapshotCalls, 0);
  assert.match(stderr, /stage=SESSION_ATTESTATION/);
  assert.match(stderr, /reason=DEFAULT_TRANSACTION_READ_ONLY_MISMATCH/);
  assert.match(stderr, /rollback=PASS/);
});

test("Gate B rejects every live session drift before snapshot invocation", () => {
  const environment = {
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    [SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN]: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: head,
  };
  const drifts = [
    { default_transaction_read_only: "invalid" },
    { transaction_read_only: "off" },
    { current_user: "postgres" },
    { session_user: "postgres" },
    { server_version_num: 180003 },
    { database: "wrong" },
  ];
  for (const drift of drifts) {
    let snapshotCalls = 0;
    assert.throws(() => runProductionSemanticAuditSnapshot(environment, {
      argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
      git: (args) => args[0] === "rev-parse" ? head : "",
      authorize: () => poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
      executeReadOnly: (sql) => {
        if (/production_semantic_snapshot\(\)/i.test(sql)) snapshotCalls += 1;
        return new Map([[PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE, drift)]]);
      },
    }), /SESSION_ATTESTATION/);
    assert.equal(snapshotCalls, 0);
  }
});

test("Gate B requires fresh reviewed Gate A authorization before target or SQL", () => {
  let authorized = 0;
  let executed = 0;
  assert.throws(() => runProductionSemanticAuditSnapshot({
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
  }, {
    argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    authorize: () => { authorized += 1; },
    executeReadOnly: () => { executed += 1; },
  }), /TARGET_GUARD:OPERATION_NOT_AUTHORIZED/);
  assert.equal(authorized, 0);
  assert.equal(executed, 0);
});

test("snapshot SQL failure emits bounded SQLSTATE and rollback classification", async () => {
  let calls = 0;
  let stderr = "";
  assert.equal(await runProductionSemanticAuditSnapshotCli({
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    [SEMANTIC_AUDIT_SIDECAR_REVIEW_OPT_IN]: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: head,
  }, {
    argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
    executeReadOnly: () => {
      calls += 1;
      if (calls === 1) {
        return new Map([[PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)]]);
      }
      throw Object.assign(new Error("secret-bearing details"), { sqlstate: "42501" });
    },
    writeStderr: (value) => { stderr += value; },
  }), 1);
  assert.equal(calls, 2);
  assert.match(stderr, /stage=PSQL_EXECUTION/);
  assert.match(stderr, /reason=SQLSTATE_42501/);
  assert.match(stderr, /rollback=PASS/);
  assert.doesNotMatch(stderr, /secret-bearing/);
});

test("Gate A and caller probe runners preserve their caller separation", () => {
  const gateAEnvironment = {
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION: "true",
    ALLOW_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION: "true",
    REFLAB_PRODUCTION_PHASE2A_SIDECAR_ATTESTATION_APPROVED_HEAD: head,
  };
  const gateA = runProductionPhase2aSidecarAttestation(gateAEnvironment, {
    argument: PHASE2A_SIDECAR_ATTESTATION_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    assertArtifact: () => ({ path: "310004.sql", sha256: "f".repeat(64) }),
    authorize: () => poolerTarget("postgres"),
    executeReadOnly: () => exactGateAResults(),
  });
  assert.equal(gateA.caller, "postgres");
  assert.equal(gateA.classification, "PHASE2A_SIDECAR_PRIVILEGED_ATTESTATION_EXACT");

  const probe = runProductionSemanticAuditCallerProbe({
    ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT: "true",
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_CALLER_PROBE: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_CALLER_PROBE_APPROVED_HEAD: head,
  }, {
    argument: SEMANTIC_AUDIT_CALLER_PROBE_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => poolerTarget(PRODUCTION_PREFLIGHT_ROLE),
    executeReadOnly: () => new Map([
      [PHASE2A_SESSION_QUERY_ID, session(PRODUCTION_PREFLIGHT_ROLE)],
    ]),
  });
  assert.equal(probe.caller, PRODUCTION_PREFLIGHT_ROLE);
  assert.equal(probe.observed.defaultTransactionReadOnly, "on");
});

test("bounded diagnostics preserve only stage, SQLSTATE and rollback", () => {
  for (const stage of SNAPSHOT_FAILURE_STAGES) {
    const diagnostic = formatSnapshotGateFailure("SEMANTIC_AUDIT_SNAPSHOT_FAIL", Object.assign(
      new Error("postgresql://user:password@unsafe.invalid/postgres ERROR: 42501 raw row"),
      { sqlstate: "42501", stage },
    ));
    assert.match(diagnostic, /^SEMANTIC_AUDIT_SNAPSHOT_FAIL:\nstage=/);
    assert.match(diagnostic, /reason=SQLSTATE_42501/);
    assert.match(diagnostic, /rollback=PASS/);
    assert.doesNotMatch(diagnostic, /password|unsafe|postgresql|raw row/i);
  }
});

test("every CLI failure remains observable without secret-bearing output", async () => {
  for (const cli of [runProductionPhase2aSidecarAttestationCli, runProductionSemanticAuditSnapshotCli]) {
    let stderr = "";
    assert.equal(await cli({}, {
      run: () => { throw new Error("postgresql://user:password@unsafe.invalid/postgres"); },
      writeStderr: (value) => { stderr += value; },
    }), 1);
    assert.match(stderr, /stage=OTHER\nreason=SAFE_DIAGNOSTIC_UNAVAILABLE\nrollback=PASS/);
    assert.doesNotMatch(stderr, /password|unsafe|postgresql/i);
  }
});

test("the contracts expose no PII, raw rows, DDL continuation, or secret configuration", () => {
  const sources = [
    "phase2a-semantic-snapshot-execution-contract.mjs",
    "run-production-phase2a-sidecar-attestation.mjs",
    "run-production-semantic-audit-caller-probe.mjs",
    "run-production-semantic-audit-snapshot.mjs",
  ].map((file) => readFileSync(resolve(import.meta.dirname, file), "utf8")).join("\n");
  assert.doesNotMatch(sources, /console\.log|process\.env\.(?:PGPASSWORD|.*DB_URL)/);
  assert.doesNotMatch(sources, /expectedDefaultTransactionReadOnly/);
  assert.doesNotMatch(sources, /310005|310006|phase2b|db push|migration glob/i);
  assert.doesNotMatch(buildSemanticAuditCallerProbeBatch(), /\bfrom\s+public\./i);
});
