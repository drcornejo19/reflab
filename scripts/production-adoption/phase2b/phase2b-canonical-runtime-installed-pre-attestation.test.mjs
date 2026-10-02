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
import { ADMIN_CANONICAL_ACCESS_POST_QUERY_ID } from "./phase2b-admin-canonical-access-contract.mjs";
import { CANONICAL_COMMUNICATION_POST_QUERY_ID } from "./phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID,
} from "./phase2b-canonical-runtime-installed-contract.mjs";
import {
  CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS,
  CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_FORMAT,
  CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION,
  CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN,
  authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget,
  classifyCanonicalRuntimeInstalledPreAttestation,
  runProductionCanonicalRuntimeInstalledPreAttestation,
  runProductionCanonicalRuntimeInstalledPreAttestationCli,
} from "./run-production-phase2b-canonical-runtime-installed-pre-attestation.mjs";
import { buildCanonicalRuntimeInstalledPreBatch } from "./run-production-phase2b-canonical-runtime-installed.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-runtime-installed-pre-attestation.mjs");
const runnerSource = readFileSync(runnerPath, "utf8");
const expectedHead = "a".repeat(40);
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

const runtimeCheckNames = CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS
  .filter((name) => name.startsWith("runtime."))
  .map((name) => name.slice("runtime.".length));

function environment(overrides = {}) {
  return {
    [PREFLIGHT_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN]: "true",
    [CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN]: "true",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_PROJECT_REF]:
      "nagjddldrldwavmfaytc",
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_APPROVED_HEAD]: expectedHead,
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL]:
      "postgresql://postgres.nagjddldrldwavmfaytc:fixture-secret@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    ...overrides,
  };
}

function runtimePayload(overrides = {}) {
  return {
    checks: Object.fromEntries(runtimeCheckNames
      .filter((name) => !["columnsExact", "constraintsExact", "guardFunctionExact",
        "ledgerAclExact", "schemaAclExact", "guardAclExact", "ledgerRowsExact"].includes(name))
      .map((name) => [name, true])),
    counts: {
      attempts: 37,
      exam_results: 6,
      notification_events: 60,
      clips: 30,
      payload_hash_nulls: 37,
      communication_attempts: 0,
      ledger_rows: 3,
      schema_state_rows: 0,
    },
    ledger_rows: [
      { phase_order: 1, phase_key: "foundation" },
      { phase_order: 2, phase_key: "exam_training_prerequisites" },
      { phase_order: 3, phase_key: "psychology_notification_prerequisites" },
    ],
    ...overrides,
  };
}

function results(runtime = runtimePayload()) {
  return new Map([
    [INSTALLER_IDENTITY_QUERY_ID, {}],
    [phase1ProductFingerprintQuery.id, {}],
    [phase2aSemanticAuditPostQuery.id, {}],
    [CANONICAL_RUNTIME_PREREQUISITES_POST_QUERY_ID, {}],
    [ADMIN_CANONICAL_ACCESS_POST_QUERY_ID, {}],
    [CANONICAL_COMMUNICATION_POST_QUERY_ID, {
      checks: { rlsOwnerCreateAbsent: true },
      training_preservation: { prerequisite_preservation: {} },
    }],
    [CANONICAL_RUNTIME_INSTALLED_PRE_QUERY_ID, runtime],
  ]);
}

function evidence(overrides = {}) {
  return {
    installer: {
      managedProfile: "READY",
      lifecycleState: "POST_PHASE2A_SEMANTIC_AUDIT",
    },
    historicalFingerprintExact: true,
    phase2a: { postState: "EXACT" },
    helper: { classification: "EXACT" },
    admin: { classification: "EXACT" },
    communication: { classification: "EXACT" },
    runtimeInstalled: {
      classification: "PASS",
      checks: Object.fromEntries(runtimeCheckNames.map((name) => [name, true])),
    },
    composition: { classification: "EXACT" },
    ...overrides,
  };
}

function classifiers(exactEvidence = evidence()) {
  return {
    classifyEvidence: () => exactEvidence,
    classifyTraining: () => ({ classification: "EXACT" }),
    classifyPrerequisite: () => ({ classification: "EXACT" }),
  };
}

function exactReport() {
  return classifyCanonicalRuntimeInstalledPreAttestation(results(), classifiers());
}

function dependencies(overrides = {}) {
  return {
    argument: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION,
    git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "",
    authorize: () => structuredClone(exactTarget),
    executeReadOnly: () => results(),
    classify: () => exactReport(),
    ...overrides,
  };
}

test("dedicated attestation has an exact operation, format, and opt-in", () => {
  assert.equal(CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_FORMAT,
    "REFLAB_310006_CURRENT_PRODUCTION_PRE_ATTESTATION_V1");
  assert.equal(CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION,
    "--production-phase2b-canonical-runtime-installed-pre-attestation");
  assert.equal(CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN,
    "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION");
});

test("the exact 310006 PRE batch is bounded and read only", () => {
  const batch = buildCanonicalRuntimeInstalledPreBatch();
  assert.match(batch, /BEGIN READ ONLY/i);
  assert.match(batch, /transaction_read_only/i);
  assert.match(batch, /lock_timeout/i);
  assert.match(batch, /statement_timeout/i);
  assert.match(batch, /ROLLBACK/i);
  assert.doesNotMatch(batch,
    /^\s*(?:insert|update|delete|create|alter|drop|grant|revoke|comment|notify)\b/gmi);
});

test("exact evidence emits the dedicated exact classification", () => {
  const output = exactReport();
  assert.equal(output.classification, "310006_PRE_EXACT");
  assert.equal(output.checkCount, CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS.length);
  assert.deepEqual(output.failedChecks, []);
  assert.deepEqual(output.unknownChecks, []);
  assert.equal(output.PRODUCTION_PREDECESSOR_STATE, "CURRENTLY_ATTESTED_EXACT");
  assert.equal(output.adoptionState.finalPhaseKey,
    "psychology_notification_prerequisites");
  assert.equal(output.adoptionState.runtime, "DISABLED");
});

test("a predecessor mismatch is a named blocker", () => {
  const value = evidence({
    helper: { classification: "BLOCKER" },
    composition: { classification: "BLOCKER" },
  });
  const output = classifyCanonicalRuntimeInstalledPreAttestation(
    results(), classifiers(value),
  );
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes("canonicalJsonbTextExact"));
  assert.equal(output.predecessorState.canonicalRuntimePrerequisites310005, "BLOCKER");
});

test("a historical count mismatch is a named blocker", () => {
  const value = evidence({
    historicalFingerprintExact: false,
    runtimeInstalled: {
      classification: "BLOCKER",
      checks: { ...evidence().runtimeInstalled.checks, historicalFingerprintsExact: false },
    },
    composition: { classification: "BLOCKER" },
  });
  const runtime = runtimePayload();
  runtime.counts.attempts = 38;
  const output = classifyCanonicalRuntimeInstalledPreAttestation(
    results(runtime), classifiers(value),
  );
  assert.equal(output.classification, "BLOCKER");
  assert.equal(output.counts.attempts, 38);
  assert.ok(output.failedChecks.includes("historicalFingerprintExact"));
  assert.ok(output.failedChecks.includes("runtime.historicalFingerprintsExact"));
});

test("an already-installed four-row ledger is a blocker", () => {
  const value = evidence({
    runtimeInstalled: {
      classification: "BLOCKER",
      checks: { ...evidence().runtimeInstalled.checks, ledgerRowsExact: false },
    },
    composition: { classification: "BLOCKER" },
  });
  const runtime = runtimePayload();
  runtime.counts.ledger_rows = 4;
  runtime.ledger_rows.push({ phase_order: 4, phase_key: "canonical_objects" });
  const output = classifyCanonicalRuntimeInstalledPreAttestation(
    results(runtime), classifiers(value),
  );
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes("runtime.ledgerRowsExact"));
  assert.equal(output.adoptionState.canonicalObjectsAbsent, false);
});

for (const [name, check] of [
  ["canonical marker", "canonicalMarkerAbsent"],
  ["Phase4 state", "cutoverAbsent"],
]) test(`${name} presence is a blocker`, () => {
  const value = evidence({
    runtimeInstalled: {
      classification: "BLOCKER",
      checks: { ...evidence().runtimeInstalled.checks, [check]: false },
    },
    composition: { classification: "BLOCKER" },
  });
  const output = classifyCanonicalRuntimeInstalledPreAttestation(
    results(), classifiers(value),
  );
  assert.equal(output.classification, "BLOCKER");
  assert.ok(output.failedChecks.includes(`runtime.${check}`));
});

test("a malformed result is UNKNOWN and fail closed", () => {
  const output = classifyCanonicalRuntimeInstalledPreAttestation(new Map());
  assert.equal(output.classification, "UNKNOWN");
  assert.equal(output.unknownChecks.length,
    CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_CHECKS.length);
  assert.equal(Object.hasOwn(output, "PRODUCTION_PREDECESSOR_STATE"), false);
});

test("the read-only target variables authorize only the exact Session Pooler", () => {
  const target = authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget(
    environment(),
  );
  assert.equal(target.host, exactTarget.host);
  assert.equal(target.connectionEnvironment.PGUSER, exactTarget.connectionEnvironment.PGUSER);
  assert.equal(target.connectionEnvironment.PGSSLMODE, "require");
});

for (const variable of [
  PREFLIGHT_OPT_IN,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPT_IN,
  CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPT_IN,
]) test(`${variable} is required`, () => {
  const value = environment();
  delete value[variable];
  assert.throws(
    () => authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget(value),
    /NOT_AUTHORIZED/,
  );
});

for (const variable of [
  "ALLOW_PRODUCTION_DDL",
  "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF",
  "REFLAB_PRODUCTION_DDL_APPROVED_HEAD",
  "REFLAB_PRODUCTION_DDL_DB_URL",
]) test(`${variable} is rejected even when merely present`, () => {
  assert.throws(
    () => authorizeProductionCanonicalRuntimeInstalledPreAttestationTarget(
      environment({ [variable]: "false" }),
    ),
    /REJECTS_DDL_CONFIGURATION/,
  );
});

test("wrong HEAD is rejected before read-only SQL", () => {
  const value = dependencies({
    git: (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : "",
    executeReadOnly: () => assert.fail("SQL reached"),
  });
  assert.throws(() => runProductionCanonicalRuntimeInstalledPreAttestation(
    environment(), value,
  ));
});

test("a dirty worktree is rejected before read-only SQL", () => {
  const value = dependencies({
    git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : " M package.json\n",
    executeReadOnly: () => assert.fail("SQL reached"),
  });
  assert.throws(() => runProductionCanonicalRuntimeInstalledPreAttestation(
    environment(), value,
  ));
});

test("inherited PG state is rejected before repository or SQL access", () => {
  const value = dependencies({
    git: () => assert.fail("git reached"),
    executeReadOnly: () => assert.fail("SQL reached"),
  });
  assert.throws(() => runProductionCanonicalRuntimeInstalledPreAttestation(
    environment({ PGHOST: "inherited.invalid" }), value,
  ));
});

test("the successful runner performs one read-only batch and no write callback", () => {
  let readOnlyCalls = 0;
  const value = dependencies({
    executeReadOnly: (batch) => {
      readOnlyCalls += 1;
      assert.equal(batch, buildCanonicalRuntimeInstalledPreBatch());
      return results();
    },
    executeMigration: () => assert.fail("migration callback reached"),
    executeDdl: () => assert.fail("DDL callback reached"),
  });
  const output = runProductionCanonicalRuntimeInstalledPreAttestation(
    environment(), value,
  );
  assert.equal(readOnlyCalls, 1);
  assert.equal(output.classification, "310006_PRE_EXACT");
});

test("the diagnostic source contains no migration or DDL execution path", () => {
  assert.doesNotMatch(runnerSource, /executeMigration|executeDdl|spawnSync|readFileSync|[.]sql\b/);
  assert.doesNotMatch(runnerSource,
    /\brunProductionPhase2bCanonicalRuntimeInstalled\s*\(|supabase\s+db\s+push|readdir|glob/i);
  assert.match(runnerSource, /buildCanonicalRuntimeInstalledPreBatch/);
  assert.match(runnerSource, /classifyCanonicalRuntimeInstalledEvidence/);
});

test("the migration and Production DDL runner remain byte-for-byte unchanged", () => {
  const sha256 = (path) => createHash("sha256")
    .update(readFileSync(resolve(root, path))).digest("hex");
  assert.equal(sha256(
    "supabase/migrations/202608310006_production_adoption_canonical_runtime_installed.sql",
  ), "715ca35e32c91d9c4870362808a0ff12a67af74ef6d8bf539669875617919168");
  assert.equal(sha256(
    "scripts/production-adoption/phase2b/run-production-phase2b-canonical-runtime-installed.mjs",
  ), "74f1486b724767782b43fc52edca5c0089df0d672e7e5f675ab45ad6348dac39");
});

test("CLI failure output redacts URL, password, and thrown details", async () => {
  const secretUrl = environment()[PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_DATABASE_URL];
  let stderr = "";
  const exit = await runProductionCanonicalRuntimeInstalledPreAttestationCli(
    environment(),
    {
      argument: CANONICAL_RUNTIME_INSTALLED_PRE_ATTESTATION_OPERATION,
      run: () => { throw new Error(`${secretUrl} fixture-secret`); },
      writeStdout: () => {},
      writeStderr: (value) => { stderr += value; },
    },
  );
  assert.equal(exit, 1);
  assert.equal(stderr, [
    "REFLAB_310006_PRE_ATTESTATION_FAIL",
    "stage=READ_ONLY_PRE_ATTESTATION",
    "reason=READ_ONLY_PRE_ATTESTATION_ABORTED",
    "",
  ].join("\n"));
  assert.doesNotMatch(stderr, /fixture-secret|postgresql:\/\//);
});
