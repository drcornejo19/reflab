import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CANONICAL_COMMUNICATION_ARTIFACT,
  CANONICAL_COMMUNICATION_FORMAT,
  CANONICAL_COMMUNICATION_MUTATIONS,
  CANONICAL_COMMUNICATION_SHA256,
} from "./phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_COMMUNICATION_OPERATION,
  CANONICAL_COMMUNICATION_OPT_IN,
  assertCanonicalCommunicationSessionPoolerTarget,
  buildCanonicalCommunicationPostBatch,
  buildCanonicalCommunicationPreBatch,
  runProductionPhase2bCanonicalCommunicationFeedback,
  runProductionPhase2bCanonicalCommunicationFeedbackCli,
} from "./run-production-phase2b-canonical-communication-feedback.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-communication-feedback.mjs");
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

function environment(overrides = {}) {
  return {
    ALLOW_PRODUCTION_DDL: "true",
    [CANONICAL_COMMUNICATION_OPT_IN]: "true",
    REFLAB_PRODUCTION_DDL_PROJECT_REF: "nagjddldrldwavmfaytc",
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead,
    REFLAB_PRODUCTION_DDL_DB_URL: "postgresql://fixture.invalid/not-used",
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  let readCount = 0;
  const state = { migrationCalls: 0, readCount: () => readCount };
  return {
    state,
    value: {
      argument: CANONICAL_COMMUNICATION_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "",
      assertArtifact: () => ({
        path: CANONICAL_COMMUNICATION_ARTIFACT,
        sha256: CANONICAL_COMMUNICATION_SHA256,
        sql: "begin; select 1; commit;",
      }),
      authorize: () => structuredClone(exactTarget),
      executeReadOnly: () => new Map([["fixture", true]]),
      classifyPre: () => {
        readCount += 1;
        return { installer: { managedProfile: "READY" }, sidecar: { postState: "EXACT" } };
      },
      classifyPost: () => {
        readCount += 1;
        return { installer: { managedProfile: "READY" }, sidecar: { postState: "EXACT" } };
      },
      executeMigration: () => { state.migrationCalls += 1; },
      ...overrides,
    },
  };
}

test("dedicated runner pins the exact operation, opt-in, artifact, and stop boundary", () => {
  assert.equal(CANONICAL_COMMUNICATION_OPERATION,
    "--production-phase2b-canonical-communication-feedback");
  assert.equal(CANONICAL_COMMUNICATION_OPT_IN,
    "ALLOW_PRODUCTION_PHASE2B_CANONICAL_COMMUNICATION_FEEDBACK");
  assert.match(runnerSource, /nextProviderReview:\s*"202608310006_EXECUTION_REVIEW"/);
  assert.match(runnerSource, /nextProvider:\s*"NOT_AUTHORIZED"/);
  assert.doesNotMatch(runnerSource, /supabase\s+db\s+push|migration discovery|glob\s*\(/i);
});

test("PRE and POST batches use bounded read-only provider evidence", () => {
  for (const batch of [buildCanonicalCommunicationPreBatch(), buildCanonicalCommunicationPostBatch()]) {
    assert.match(batch, /BEGIN READ ONLY/i);
    assert.match(batch, /transaction_read_only/i);
    assert.match(batch, /ROLLBACK/i);
    assert.doesNotMatch(batch,
      /^\s*(?:insert|update|delete|create|alter|drop|grant|revoke|notify)\b/gmi);
  }
});

test("exact Session Pooler target passes", () => {
  assert.equal(assertCanonicalCommunicationSessionPoolerTarget(structuredClone(exactTarget)).host,
    exactTarget.host);
});

for (const [name, mutate] of [
  ["wrong project", (target) => { target.projectRef = "wrongprojectref00000"; }],
  ["direct database host", (target) => {
    target.host = "db.nagjddldrldwavmfaytc.supabase.co";
    target.connectionEnvironment.PGHOST = target.host;
  }],
  ["arbitrary host", (target) => {
    target.host = "example.invalid";
    target.connectionEnvironment.PGHOST = target.host;
  }],
  ["wrong port", (target) => { target.connectionEnvironment.PGPORT = "6543"; }],
  ["wrong database", (target) => { target.connectionEnvironment.PGDATABASE = "template1"; }],
  ["wrong username", (target) => { target.connectionEnvironment.PGUSER = "postgres"; }],
  ["missing SSL", (target) => { delete target.connectionEnvironment.PGSSLMODE; }],
]) test(`${name} fails closed`, () => {
  const target = structuredClone(exactTarget);
  mutate(target);
  assert.throws(() => assertCanonicalCommunicationSessionPoolerTarget(target),
    /202608150001_TARGET_REJECTED/);
});

test("successful flow performs PRE, migration once, POST, then stops", () => {
  const fixture = dependencies();
  const result = runProductionPhase2bCanonicalCommunicationFeedback(environment(), fixture.value);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.equal(fixture.state.readCount(), 2);
  assert.equal(result.format, CANONICAL_COMMUNICATION_FORMAT);
  assert.equal(result.preDdl.contract, "EXACT");
  assert.equal(result.migration, "PASS");
  assert.equal(result.postDdl.contract, "EXACT");
  assert.equal(result.nextProvider, "NOT_AUTHORIZED");
  assert.deepEqual(result.mutationAccounting, CANONICAL_COMMUNICATION_MUTATIONS);
});

test("wrong operation blocks before repository or database work", async () => {
  const fixture = dependencies({ argument: "--wrong", git: () => assert.fail("git reached") });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.match(stderr, /stage=TARGET_GUARD/);
  assert.equal(fixture.state.migrationCalls, 0);
});

test("inherited PG state blocks before repository or database work", async () => {
  const fixture = dependencies({ git: () => assert.fail("git reached") });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(
    environment({ PGHOST: "inherited.invalid" }),
    { ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {} },
  );
  assert.equal(exit, 1);
  assert.match(stderr, /stage=TARGET_GUARD/);
  assert.doesNotMatch(stderr, /inherited[.]invalid|fixture-secret/);
  assert.equal(fixture.state.migrationCalls, 0);
});

for (const [name, git] of [
  ["approved HEAD mismatch", (args) => args[0] === "rev-parse" ? `${"b".repeat(40)}\n` : ""],
  ["dirty worktree", (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : " M package.json\n"],
  ["staged file", (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "M  package.json\n"],
  ["untracked file", (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "?? local.tmp\n"],
]) test(`${name} blocks before artifact or database work`, () => {
  const fixture = dependencies({
    git,
    assertArtifact: () => assert.fail("artifact reached"),
    authorize: () => assert.fail("database target reached"),
  });
  assert.throws(() => runProductionPhase2bCanonicalCommunicationFeedback(
    environment(), fixture.value,
  ));
  assert.equal(fixture.state.migrationCalls, 0);
});

test("artifact mismatch blocks before target authorization", () => {
  const fixture = dependencies({
    assertArtifact: () => { throw new Error("hash mismatch"); },
    authorize: () => assert.fail("target reached"),
  });
  assert.throws(() => runProductionPhase2bCanonicalCommunicationFeedback(
    environment(), fixture.value,
  ));
  assert.equal(fixture.state.migrationCalls, 0);
});

for (const variable of ["ALLOW_PRODUCTION_DDL", CANONICAL_COMMUNICATION_OPT_IN]) {
  test(`missing ${variable} blocks before read-only SQL`, () => {
    const fixture = dependencies({
      authorize: undefined,
      executeReadOnly: () => assert.fail("read-only SQL reached"),
    });
    const env = environment();
    delete env[variable];
    assert.throws(() => runProductionPhase2bCanonicalCommunicationFeedback(env, fixture.value));
    assert.equal(fixture.state.migrationCalls, 0);
  });
}

test("PRE mismatch never invokes migration", async () => {
  const fixture = dependencies({ classifyPre: () => { throw new Error("contract drift"); } });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.match(stderr, /stage=PRE_DDL_CONTRACT/);
  assert.equal(fixture.state.migrationCalls, 0);
});

test("migration failure is attempted once, re-attests rollback, and never runs POST", async () => {
  let preCalls = 0;
  const fixture = dependencies({
    classifyPre: () => {
      preCalls += 1;
      return { installer: { managedProfile: "READY" }, sidecar: { postState: "EXACT" } };
    },
    executeMigration: () => {
      fixture.state.migrationCalls += 1;
      throw Object.assign(new Error("lock timeout"), { stderr: "ERROR: 55P03: lock unavailable" });
    },
    classifyPost: () => assert.fail("POST reached"),
  });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.equal(preCalls, 2);
  assert.match(stderr, /stage=MIGRATION_SQL/);
  assert.match(stderr, /reason=SQLSTATE_55P03/);
  assert.match(stderr, /rollback=PASS/);
});

test("POST mismatch treats migration as potentially committed and never retries", async () => {
  const fixture = dependencies({ classifyPost: () => { throw new Error("post drift"); } });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.match(stderr, /stage=POST_DDL_ATTESTATION/);
  assert.match(stderr, /rollback=NOT_REQUIRED/);
});

test("failure output is bounded and never prints DB URL or password", async () => {
  const secretUrl = "postgresql://postgres:super-secret@example.invalid/postgres";
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalCommunicationFeedbackCli(
    environment({ REFLAB_PRODUCTION_DDL_DB_URL: secretUrl }),
    {
      argument: CANONICAL_COMMUNICATION_OPERATION,
      run: () => { throw new Error(`${secretUrl} super-secret`); },
      writeStderr: (value) => { stderr += value; },
      writeStdout: () => {},
    },
  );
  assert.equal(exit, 1);
  assert.equal(stderr,
    "PHASE2B_CANONICAL_COMMUNICATION_FEEDBACK_FAIL:\nstage=OTHER\nreason=SAFE_DIAGNOSTIC_UNAVAILABLE\nrollback=NOT_REQUIRED\n");
});

test("runner has no migration discovery, retry, remediation, or next-provider execution path", () => {
  assert.match(runnerSource, /assertCanonicalCommunicationArtifact/);
  assert.match(runnerSource, /executeMigration/);
  assert.doesNotMatch(runnerSource, /202608310006[_-].*[.]sql|execute.*310006|retry|remediat/i);
  assert.doesNotMatch(runnerSource, /readdir|glob|db\s+push|supabase/i);
  assert.equal(readFileSync(resolve(root, CANONICAL_COMMUNICATION_ARTIFACT), "utf8").length > 0, true);
});
