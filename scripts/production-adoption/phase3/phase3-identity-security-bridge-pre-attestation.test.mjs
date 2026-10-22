import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PREFLIGHT_OPT_IN } from "../../production-preflight/target.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF,
} from "../bootstrap/phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { ADMIN_CANONICAL_ACCESS_POST_QUERY_ID } from "../phase2b/phase2b-admin-canonical-access-contract.mjs";
import { CANONICAL_COMMUNICATION_POST_QUERY_ID } from "../phase2b/phase2b-canonical-communication-feedback-contract.mjs";
import { CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-installed-contract.mjs";
import { CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID } from "../phase2b/phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  IDENTITY_SECURITY_BRIDGE_PRE_CHECKS,
  IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID,
  IDENTITY_SECURITY_BRIDGE_SHA256,
  assertIdentitySecurityBridgeArtifact,
  classifyIdentitySecurityBridgePreState,
} from "./phase3-identity-security-bridge-pre-attestation-contract.mjs";
import {
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS,
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_FORMAT,
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPERATION,
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN,
  IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID,
  authorizeProductionIdentitySecurityBridgePreAttestationTarget,
  buildIdentitySecurityBridgePreBatch,
  classifyIdentitySecurityBridgePreAttestation,
  runProductionIdentitySecurityBridgePreAttestation,
  runProductionIdentitySecurityBridgePreAttestationCli,
} from "./run-production-identity-security-bridge-pre-attestation.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerPath = resolve(import.meta.dirname,
  "run-production-identity-security-bridge-pre-attestation.mjs");
const runnerSource = readFileSync(runnerPath, "utf8");
const expectedHead = "a".repeat(40);
const helperHash = "d035c5365d2bef99fa241696564a74587dd47635005771c54731b8c76132edc1";
const approvedMemberships = [
  ["anon", "postgres", "supabase_admin", true, true, true],
  ["authenticated", "postgres", "supabase_admin", true, true, true],
  ["authenticator", "postgres", "supabase_admin", true, true, true],
  ["pg_create_subscription", "postgres", "supabase_admin", true, true, true],
  ["pg_monitor", "postgres", "supabase_admin", true, true, true],
  ["pg_read_all_data", "postgres", "supabase_admin", true, true, true],
  ["pg_signal_backend", "postgres", "supabase_admin", true, true, true],
  ["reflab_prod_preflight_ro", "postgres", "supabase_admin", true, false, false],
  ["service_role", "postgres", "supabase_admin", true, true, true],
  ["supabase_privileged_role", "postgres", "supabase_admin", false, true, true],
  ["reflab_rls_owner", "postgres", "supabase_admin", true, false, false],
  ["reflab_rls_owner", "postgres", "postgres", false, false, true],
  ["reflab_preflight_audit_owner", "postgres", "supabase_admin", true, false, false],
  ["anon", "authenticator", "supabase_admin", false, false, true],
  ["authenticated", "authenticator", "supabase_admin", false, false, true],
  ["service_role", "authenticator", "supabase_admin", false, false, true],
].map(([granted_role, member_role, grantor_role, admin_option, inherit_option, set_option]) =>
  ({ granted_role, member_role, grantor_role, admin_option, inherit_option, set_option }));
const effectiveRelationships = ["anon", "authenticated", "authenticator", "service_role"]
  .flatMap((subject_role) => ["postgres", "reflab_rls_owner", "reflab_prod_preflight_ro",
    "reflab_preflight_audit_owner", "supabase_admin", "supabase_privileged_role"]
    .map((target_role) => ({ subject_role, target_role, member: false, usage: false, set: false })))
  .concat({ subject_role: "postgres", target_role: "reflab_rls_owner", member: true, usage: false, set: true });
const signatures = [
  "public.institution_request_user_id()",
  "public.platform_request_user_id()",
  "public.reflab_request_user_id()",
];
const exactTarget = {
  projectRef: "nagjddldrldwavmfaytc",
  host: "aws-1-sa-east-1.pooler.supabase.com",
  connectionEnvironment: {
    PGHOST: "aws-1-sa-east-1.pooler.supabase.com",
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGUSER: "postgres.nagjddldrldwavmfaytc",
    PGSSLMODE: "require",
    PGPASSWORD: "fixture-secret",
  },
};

const runtimeCheckNames = IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_CHECKS
  .filter((name) => name.startsWith("runtime."))
  .map((name) => name.slice("runtime.".length));

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]: "nagjddldrldwavmfaytc",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: expectedHead,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      "postgresql://postgres.nagjddldrldwavmfaytc:fixture-secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    ...overrides,
  };
}

function identityPayload(overrides = {}) {
  const checks = Object.fromEntries(
    IDENTITY_SECURITY_BRIDGE_PRE_CHECKS
      .filter((name) => !["legacyHelpersExact", "legacyHelperAclsExact"].includes(name))
      .map((name) => [name, true]),
  );
  const legacyHelpers = signatures.map((signature) => ({
    signature, exists: true, identity_arguments: "", result_type: "text",
    language_name: "sql", volatility: "s", strict_mode: false,
    security_definer: false, leakproof: false, function_kind: "f",
    owner_name: "postgres", configuration: null,
    source_hash: helperHash, direct_identity_reader: true,
  }));
  const legacyHelperAcl = signatures.flatMap((signature) => [
    { signature, grantee: "postgres", grantor: "postgres", privilege_type: "EXECUTE",
      is_grantable: false },
    { signature, grantee: "authenticated", grantor: "postgres", privilege_type: "EXECUTE",
      is_grantable: false },
    { signature, grantee: "service_role", grantor: "postgres", privilege_type: "EXECUTE",
      is_grantable: false },
  ]);
  for (const signature of [signatures[0], signatures[2]]) {
    for (const grantee of ["PUBLIC", "anon"]) legacyHelperAcl.push({ signature, grantee,
      grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false });
  }
  return {
    checks,
    legacy_helpers: legacyHelpers,
    legacy_helper_acl: legacyHelperAcl,
    direct_identity_readers: [...signatures],
    canonical_functions: { requestUserIdPresent: false, isSuperAdminPresent: false },
    developmentIdentityObjectsPresent: [],
    roleMemberships: structuredClone(approvedMemberships),
    effectiveRelationships: structuredClone(effectiveRelationships),
    ...overrides,
  };
}

function runtimePayload(overrides = {}) {
  return {
    checks: Object.fromEntries(runtimeCheckNames.map((name) => [name, true])),
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60, clips: 30,
      payload_hash_nulls: 37, communication_attempts: 0,
      ledger_rows: 4, schema_state_rows: 0,
    },
    ledger_rows: [
      { phase_order: 1, phase_key: "foundation" },
      { phase_order: 2, phase_key: "exam_training_prerequisites" },
      { phase_order: 3, phase_key: "psychology_notification_prerequisites" },
      { phase_order: 4, phase_key: "canonical_objects" },
    ],
    ...overrides,
  };
}

function results(identity = identityPayload(), runtime = runtimePayload()) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, {}],
    [phase1ProductFingerprintQuery.id, {}],
    [phase2aSemanticAuditPostQuery.id, {}],
    [CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID, {}],
    [ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, {}],
    [CANONICAL_COMMUNICATION_POST_QUERY_ID, {}],
    [CANONICAL_RUNTIME_INSTALLED_POST_QUERY_ID, runtime],
    [IDENTITY_SECURITY_BRIDGE_PRE_QUERY_ID, identity],
  ]);
}

function predecessor(overrides = {}) {
  return {
    installer: { managedProfile: "READY", lifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT" },
    historicalFingerprintExact: true,
    phase2a: { postState: "EXACT" },
    helper: { classification: "EXACT" },
    admin: { classification: "EXACT" },
    communication: { classification: "EXACT" },
    runtimeInstalled: {
      classification: "EXACT",
      checks: Object.fromEntries(runtimeCheckNames.map((name) => [name, true])),
    },
    composition: { classification: "EXACT" },
    ...overrides,
  };
}

function classify(identity = identityPayload(), runtime = runtimePayload(), prior = predecessor()) {
  return classifyIdentitySecurityBridgePreAttestation(results(identity, runtime), {
    classifyPredecessor: () => prior,
  });
}

function dependencies(overrides = {}) {
  return {
    argument: IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "",
    assertArtifact: () => ({ sha256: IDENTITY_SECURITY_BRIDGE_SHA256 }),
    resolveTarget: () => structuredClone(exactTarget),
    assertTarget: () => true,
    executeReadOnly: () => results(),
    classify: () => classify(),
    ...overrides,
  };
}

async function cliFailure(environmentValue = environment(), overrides = {}) {
  let stderr = "";
  const exit = await runProductionIdentitySecurityBridgePreAttestationCli(
    environmentValue,
    dependencies({ ...overrides, writeStdout: () => {},
      writeStderr: (value) => { stderr += value; } }),
  );
  assert.equal(exit, 1);
  assert.match(stderr, /^REFLAB_64236_PRE_ATTESTATION_FAIL\n/);
  return stderr;
}

function failureField(output, name) {
  return output.match(new RegExp(`^${name}=([^\\r\\n]+)$`, "m"))?.[1] ?? null;
}

test("dedicated 64236 PRE attestation has exact identifiers", () => {
  assert.equal(IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_FORMAT,
    "REFLAB_20260901064236_CURRENT_PRODUCTION_PRE_ATTESTATION_V1");
  assert.equal(IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPERATION,
    "--production-identity-security-bridge-pre-attestation");
  assert.equal(IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN,
    "ALLOW_PRODUCTION_IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION");
});

test("the reviewed 64236 artifact hash is pinned", () => {
  assert.equal(assertIdentitySecurityBridgeArtifact(root).sha256, IDENTITY_SECURITY_BRIDGE_SHA256);
});

test("the exact PRE batch is one bounded read-only transaction", () => {
  const batch = buildIdentitySecurityBridgePreBatch();
  assert.match(batch, /begin read only/i);
  assert.match(batch, /transaction_read_only/i);
  assert.match(batch, /lock_timeout/i);
  assert.match(batch, /statement_timeout/i);
  assert.match(batch, /rollback/i);
  assert.doesNotMatch(batch,
    /^\s*(?:insert|update|delete|create|alter|drop|grant|revoke|comment|notify)\b/gmi);
});

test("exact 64236 identity PRE state classifies exactly", () => {
  const output = classifyIdentitySecurityBridgePreState(identityPayload());
  assert.equal(output.classification, "EXACT_EXPECTED_PRE_STATE");
  assert.ok(IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.every((name) => output.checks[name]));
});

test("exact composed evidence emits 64236_PRE_EXACT", () => {
  const output = classify();
  assert.equal(output.classification, "64236_PRE_EXACT");
  assert.deepEqual(output.failedChecks, []);
  assert.deepEqual(output.unknownChecks, []);
  assert.equal(output.PRODUCTION_64236_PRE_STATE, "CURRENTLY_ATTESTED_EXACT");
  assert.equal(output.adoptionState.finalPhaseKey, "canonical_objects");
  assert.equal(output.historicalState.evidenceRole, "SHARED_PRESERVATION_EVIDENCE");
  assert.equal(output.securityState.serviceRoleAccessExact, true);
});

for (const [field, value] of [["configuration", ["search_path=pg_catalog"]],
  ["security_definer", true], ["strict_mode", true], ["leakproof", true],
  ["function_kind", "p"], ["volatility", "v"], ["language_name", "plpgsql"]]) {
  test("historical helper " + field + " drift is a named blocker", () => {
    const payload = identityPayload(); payload.legacy_helpers[0][field] = value;
    assert.ok(classify(payload).failedChecks.includes("identity.legacyHelpersExact"));
  });
}
for (const grantee of ["PUBLIC", "anon"]) {
  test("platform helper cannot gain historical " + grantee + " execute", () => {
    const payload = identityPayload(); payload.legacy_helper_acl.push({ signature: signatures[1],
      grantee, grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false });
    const report = classify(payload);
    assert.ok(report.failedChecks.includes("identity.legacyHelperAclsExact"));
    assert.equal(report.securityState.serviceRoleAccessExact, true);
  });
}

for (const [name, mutation, failedCheck] of [
  ["already-installed POST state", (payload) => {
    payload.checks.canonicalIdentityFunctionsAbsent = false;
    payload.canonical_functions.requestUserIdPresent = true;
  }, "identity.canonicalIdentityFunctionsAbsent"],
  ["affected wrapper source drift", (payload) => {
    payload.legacy_helpers[0].source_hash = "0".repeat(64);
  }, "identity.legacyHelpersExact"],
  ["affected wrapper owner drift", (payload) => {
    payload.legacy_helpers[1].owner_name = "reflab_rls_owner";
  }, "identity.legacyHelpersExact"],
  ["affected wrapper ACL drift", (payload) => {
    payload.legacy_helper_acl.push({ signature: signatures[0], grantee: "anon",
      grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false });
  }, "identity.legacyHelperAclsExact"],
  ["unexpected browser schema CREATE", (payload) => {
    payload.checks.browserSchemaCreateAbsent = false;
  }, "identity.browserSchemaCreateAbsent"],
  ["unsafe RLS owner", (payload) => { payload.checks.rlsOwnerExact = false; },
    "identity.rlsOwnerExact"],
  ["unexpected role membership", (payload) => {
    payload.checks.roleMembershipsExact = false;
    payload.roleMemberships.push({ granted_role: "service_role", member_role: "authenticated" });
  }, "identity.roleMembershipsExact"],
  ["development identity object", (payload) => {
    payload.checks.developmentIdentityObjectsAbsent = false;
    payload.developmentIdentityObjectsPresent.push("public.resolve_development_clerk_identity(text)");
  }, "identity.developmentIdentityObjectsAbsent"],
]) test(`${name} is a named blocker`, () => {
  const payload = identityPayload();
  mutation(payload);
  const output = classify(payload);
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes(failedCheck));
  assert.equal(Object.hasOwn(output, "PRODUCTION_64236_PRE_STATE"), false);
});

for (const [name, check] of [
  ["adoption ledger mismatch", "ledgerRowsExact"],
  ["schema_state populated", "schemaStateEmpty"],
  ["canonical marker present", "canonicalMarkerAbsent"],
  ["runtime/cutover provider present", "cutoverAbsent"],
  ["later ledger phase present", "noLaterLedgerPhase"],
]) test(`${name} fails closed before 64236`, () => {
  const prior = predecessor();
  prior.runtimeInstalled.checks[check] = false;
  prior.runtimeInstalled.classification = "BLOCKER";
  prior.composition.classification = "BLOCKER";
  const output = classify(identityPayload(), runtimePayload(), prior);
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes(`runtime.${check}`));
});

test("malformed or incomplete evidence is UNKNOWN", () => {
  const payload = identityPayload();
  delete payload.legacy_helpers;
  const output = classifyIdentitySecurityBridgePreAttestation(
    results(payload), { classifyPredecessor: () => predecessor() },
  );
  assert.equal(output.classification, "UNKNOWN");
  assert.deepEqual(output.unknownChecks, [
    "identitySecurityBridgePreExact",
    ...IDENTITY_SECURITY_BRIDGE_PRE_CHECKS.map((name) => `identity.${name}`),
  ]);
  assert.equal(output.failedChecks.length, 0);
});

test("only the exact Production Session Pooler target is accepted", () => {
  const target = authorizeProductionIdentitySecurityBridgePreAttestationTarget(environment());
  assert.equal(target.host, exactTarget.host);
  assert.equal(target.connectionEnvironment.PGUSER, exactTarget.connectionEnvironment.PGUSER);
  assert.equal(target.connectionEnvironment.PGSSLMODE, "require");
});

test("the approved direct database host is rejected", () => {
  assert.throws(() => authorizeProductionIdentitySecurityBridgePreAttestationTarget(environment({
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      "postgresql://postgres:fixture-secret@db.nagjddldrldwavmfaytc.supabase.co:5432/postgres?sslmode=require",
  })), /TARGET_REJECTED/);
});

for (const variable of [
  PREFLIGHT_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN,
]) test(`${variable} is required`, () => {
  const value = environment();
  delete value[variable];
  assert.throws(() => authorizeProductionIdentitySecurityBridgePreAttestationTarget(value),
    /NOT_AUTHORIZED/);
});

for (const variable of [
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE3_IDENTITY_SECURITY_BRIDGE",
  "ALLOW_PRODUCTION_CUTOVER",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  "REFLAB_PRODUCTION_DDL_DB_URL",
]) test(`${variable} is rejected by presence`, () => {
  assert.throws(() => authorizeProductionIdentitySecurityBridgePreAttestationTarget(
    environment({ [variable]: "false" })), /REJECTS_DDL_CONFIGURATION/);
});

test("wrong HEAD is rejected before SQL", () => {
  assert.throws(() => runProductionIdentitySecurityBridgePreAttestation(environment(),
    dependencies({ git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "",
      executeReadOnly: () => assert.fail("SQL reached") })));
});

test("artifact mismatch is rejected before SQL", () => {
  assert.throws(() => runProductionIdentitySecurityBridgePreAttestation(environment(),
    dependencies({ assertArtifact: () => { throw new Error("artifact hash mismatch"); },
      executeReadOnly: () => assert.fail("SQL reached") })));
});

test("dirty worktree is rejected before SQL", () => {
  assert.throws(() => runProductionIdentitySecurityBridgePreAttestation(environment(),
    dependencies({ git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : " M package.json\n",
      executeReadOnly: () => assert.fail("SQL reached") })));
});

test("inherited PG state is rejected before repository access", () => {
  assert.throws(() => runProductionIdentitySecurityBridgePreAttestation(
    environment({ PGHOST: "inherited.invalid" }),
    dependencies({ git: () => assert.fail("git reached") })));
});

test("target mismatch is safely classified", async () => {
  const output = await cliFailure(environment(), {
    resolveTarget: () => { throw new Error("database target is not the exact allowlisted host"); },
  });
  assert.equal(failureField(output, "reason"), "TARGET_MISMATCH");
});

test("the successful path performs exactly one read-only batch and no write callback", () => {
  let calls = 0;
  const output = runProductionIdentitySecurityBridgePreAttestation(environment(), dependencies({
    executeReadOnly: (batch) => {
      calls += 1;
      assert.equal(batch, buildIdentitySecurityBridgePreBatch());
      return results();
    },
    executeMigration: () => assert.fail("migration callback reached"),
    executeDdl: () => assert.fail("DDL callback reached"),
  }));
  assert.equal(calls, 1);
  assert.equal(output.classification, "64236_PRE_EXACT");
});

test("the attestation source has no migration or write execution path", () => {
  assert.doesNotMatch(runnerSource, /executeMigration|executeDdl|readFileSync|supabase\s+db\s+push/i);
  assert.doesNotMatch(runnerSource, /runProductionPhase3|readdir|glob/i);
  assert.match(runnerSource, /executeReadOnlyBatch/);
  assert.match(runnerSource, /buildIdentitySecurityBridgePreBatch/);
});

test("missing opt-in has a bounded failure", async () => {
  const value = environment();
  delete value[IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_OPT_IN];
  const output = await cliFailure(value);
  assert.equal(failureField(output, "reason"), "OPT_IN_REQUIRED");
});

test("wrong operation has a bounded failure", async () => {
  const output = await cliFailure(environment(), { argument: "--wrong" });
  assert.equal(failureField(output, "reason"), "OPERATION_NOT_AUTHORIZED");
});

test("HEAD mismatch and dirty worktree retain bounded reasons", async () => {
  const head = await cliFailure(environment(), {
    git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "",
  });
  assert.equal(failureField(head, "reason"), "HEAD_MISMATCH");
  const dirty = await cliFailure(environment(), {
    git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : " M package.json\n",
  });
  assert.equal(failureField(dirty, "reason"), "WORKTREE_DIRTY");
});

test("psql ENOENT is reported safely", async () => {
  const error = Object.assign(new Error("spawn psql ENOENT"), { code: "ENOENT" });
  const output = await cliFailure(environment(), {
    executeReadOnly: undefined,
    spawn: () => ({ status: null, stdout: "", stderr: "", error }),
  });
  assert.equal(failureField(output, "reason"), "PSQL_NOT_FOUND");
  assert.equal(failureField(output, "query"), IDENTITY_SECURITY_BRIDGE_PRE_BATCH_QUERY_ID);
});

for (const [name, stderr, reason, stderrClass] of [
  ["authentication", "FATAL:  28P01: password authentication failed", "AUTHENTICATION_FAILED",
    "AUTHENTICATION_ERROR"],
  ["host resolution", "could not translate host name", "HOST_RESOLUTION_FAILED",
    "HOST_RESOLUTION_ERROR"],
  ["TLS", "SSL certificate verify failed", "TLS_FAILED", "TLS_ERROR"],
  ["connection", "connection to server failed: connection refused", "CONNECTION_FAILED",
    "CONNECTION_ERROR"],
  ["timeout", "ERROR:  57014: canceling statement due to statement timeout", "TIMEOUT", "TIMEOUT"],
  ["SQLSTATE", "ERROR:  42501: permission denied", "SQLSTATE_42501", "SQLSTATE_ERROR"],
]) test(`${name} process failure is bounded`, async () => {
  const output = await cliFailure(environment(), {
    executeReadOnly: undefined,
    spawn: () => ({ status: 2, stdout: "", stderr }),
  });
  assert.equal(failureField(output, "reason"), reason);
  assert.equal(failureField(output, "stderrClass"), stderrClass);
  assert.doesNotMatch(output, /password|certificate|connection refused|permission denied/i);
});

test("read-only guard failure is explicit", async () => {
  const output = await cliFailure(environment(), { executeReadOnly: () => {
    throw new Error("transaction_read_only was not confirmed as on");
  } });
  assert.equal(failureField(output, "reason"), "READ_ONLY_GUARD_FAILED");
});

test("malformed result shape is explicit", async () => {
  const output = await cliFailure(environment(), { executeReadOnly: () => ({}) });
  assert.equal(failureField(output, "reason"), "QUERY_RESULT_SHAPE_MISMATCH");
});

test("classifier exception is explicit and redacted", async () => {
  const output = await cliFailure(environment(), { classify: () => {
    throw new Error("private classifier detail");
  } });
  assert.equal(failureField(output, "reason"), "PRE_CLASSIFICATION_FAILED");
  assert.doesNotMatch(output, /private classifier detail/);
});

test("credentials and URLs never appear in failure output", async () => {
  const secretUrl = environment()[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL];
  const output = await cliFailure(environment(), { run: () => {
    throw new Error(`${secretUrl} fixture-secret PGPASSWORD`);
  } });
  assert.doesNotMatch(output, /fixture-secret|postgresql:\/\/|PGPASSWORD/);
  for (const field of ["stage", "substage", "query", "reason", "sqlstate",
    "psqlExitStatus", "stderrClass"]) assert.notEqual(failureField(output, field), null);
});

test("exact CLI happy path emits the safe structured report", async () => {
  let stdout = "";
  const exit = await runProductionIdentitySecurityBridgePreAttestationCli(
    environment(), dependencies({ writeStdout: (value) => { stdout += value; },
      writeStderr: () => {} }),
  );
  assert.equal(exit, 0);
  const output = JSON.parse(stdout);
  assert.equal(output.format, IDENTITY_SECURITY_BRIDGE_PRE_ATTESTATION_FORMAT);
  assert.equal(output.classification, "64236_PRE_EXACT");
});

test("protected Production write artifacts remain byte-for-byte unchanged", () => {
  const sha256 = (path) => createHash("sha256")
    .update(readFileSync(resolve(root, path))).digest("hex");
  assert.equal(sha256(
    "supabase/migrations/20260901064236_production_adoption_identity_security_bridge.sql",
  ), IDENTITY_SECURITY_BRIDGE_SHA256);
  assert.equal(sha256(
    "scripts/production-adoption/phase2b/run-production-phase2b-canonical-runtime-installed.mjs",
  ), "74f1486b724767782b43fc52edca5c0089df0d672e7e5f675ab45ad6348dac39");
});
