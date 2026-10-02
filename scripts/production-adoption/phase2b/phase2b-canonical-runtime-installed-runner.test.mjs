import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CANONICAL_RUNTIME_INSTALLED_ARTIFACT,
  CANONICAL_RUNTIME_INSTALLED_FORMAT,
  CANONICAL_RUNTIME_INSTALLED_MUTATIONS,
  CANONICAL_RUNTIME_INSTALLED_SHA256,
} from "./phase2b-canonical-runtime-installed-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_OPERATION,
  CANONICAL_RUNTIME_INSTALLED_OPT_IN,
  assertCanonicalRuntimeInstalledSessionPoolerTarget,
  buildCanonicalRuntimeInstalledPostBatch,
  buildCanonicalRuntimeInstalledPreBatch,
  runProductionPhase2bCanonicalRuntimeInstalled,
  runProductionPhase2bCanonicalRuntimeInstalledCli,
} from "./run-production-phase2b-canonical-runtime-installed.mjs";

const runnerPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-runtime-installed.mjs");
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
    [CANONICAL_RUNTIME_INSTALLED_OPT_IN]: "true",
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
      argument: CANONICAL_RUNTIME_INSTALLED_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${expectedHead}\n` : "",
      assertArtifact: () => ({
        path: CANONICAL_RUNTIME_INSTALLED_ARTIFACT,
        sha256: CANONICAL_RUNTIME_INSTALLED_SHA256,
        sql: "begin; select 1; commit;",
      }),
      authorize: () => structuredClone(exactTarget),
      executeReadOnly: () => new Map([["fixture", true]]),
      classifyPre: () => {
        readCount += 1;
        return { installer: { managedProfile: "READY" }, phase2a: { postState: "EXACT" } };
      },
      classifyPost: () => {
        readCount += 1;
        return { installer: { managedProfile: "READY" }, phase2a: { postState: "EXACT" } };
      },
      executeMigration: () => { state.migrationCalls += 1; },
      ...overrides,
    },
  };
}

test("dedicated runner pins exact operation, opt-in, artifact, and stop boundary", () => {
  assert.equal(CANONICAL_RUNTIME_INSTALLED_OPERATION,
    "--production-phase2b-canonical-runtime-installed");
  assert.equal(CANONICAL_RUNTIME_INSTALLED_OPT_IN,
    "ALLOW_PRODUCTION_PHASE2B_CANONICAL_RUNTIME_INSTALLED");
  assert.match(runnerSource, /nextProviderReview:\s*"PHASE4_EXECUTION_REVIEW"/);
  assert.match(runnerSource, /nextProvider:\s*"NOT_AUTHORIZED"/);
  assert.match(runnerSource, /cutover:\s*"NOT_AUTHORIZED"/);
  assert.doesNotMatch(runnerSource, /supabase\s+db\s+push|migration discovery|glob\s*\(/i);
});

test("PRE and POST run as single bounded read-only evidence batches", () => {
  for (const batch of [buildCanonicalRuntimeInstalledPreBatch(), buildCanonicalRuntimeInstalledPostBatch()]) {
    assert.match(batch, /BEGIN READ ONLY/i);
    assert.match(batch, /transaction_read_only/i);
    assert.match(batch, /lock_timeout/i);
    assert.match(batch, /statement_timeout/i);
    assert.match(batch, /ROLLBACK/i);
    assert.doesNotMatch(batch,
      /^\s*(?:insert|update|delete|create|alter|drop|grant|revoke|notify)\b/gmi);
  }
});

test("exact Session Pooler target passes", () => {
  assert.equal(assertCanonicalRuntimeInstalledSessionPoolerTarget(structuredClone(exactTarget)).host,
    exactTarget.host);
});

for (const [name, mutate] of [
  ["wrong project", (target) => { target.projectRef = "wrongprojectref00000"; }],
  ["direct database host", (target) => { target.host = "db.nagjddldrldwavmfaytc.supabase.co"; target.connectionEnvironment.PGHOST = target.host; }],
  ["arbitrary host", (target) => { target.host = "example.invalid"; target.connectionEnvironment.PGHOST = target.host; }],
  ["wrong port", (target) => { target.connectionEnvironment.PGPORT = "6543"; }],
  ["wrong database", (target) => { target.connectionEnvironment.PGDATABASE = "template1"; }],
  ["wrong username", (target) => { target.connectionEnvironment.PGUSER = "postgres"; }],
  ["missing SSL", (target) => { delete target.connectionEnvironment.PGSSLMODE; }],
]) test(`${name} fails closed`, () => {
  const target = structuredClone(exactTarget);
  mutate(target);
  assert.throws(() => assertCanonicalRuntimeInstalledSessionPoolerTarget(target),
    /202608310006_TARGET_REJECTED/);
});

test("successful flow performs PRE, migration once, POST, then stops", () => {
  const fixture = dependencies();
  const result = runProductionPhase2bCanonicalRuntimeInstalled(environment(), fixture.value);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.equal(fixture.state.readCount(), 2);
  assert.equal(result.format, CANONICAL_RUNTIME_INSTALLED_FORMAT);
  assert.equal(result.preDdl.contract, "EXACT");
  assert.equal(result.migration, "PASS");
  assert.equal(result.postDdl.contract, "EXACT");
  assert.equal(result.runtime, "DISABLED");
  assert.equal(result.nextProvider, "NOT_AUTHORIZED");
  assert.equal(result.cutover, "NOT_AUTHORIZED");
  assert.deepEqual(result.mutationAccounting, CANONICAL_RUNTIME_INSTALLED_MUTATIONS);
});

test("wrong operation blocks before repository or database work", async () => {
  const fixture = dependencies({ argument: "--wrong", git: () => assert.fail("git reached") });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalRuntimeInstalledCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.match(stderr, /stage=TARGET_GUARD/);
  assert.equal(fixture.state.migrationCalls, 0);
});

test("inherited PG state blocks before repository or database work", async () => {
  const fixture = dependencies({ git: () => assert.fail("git reached") });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalRuntimeInstalledCli(
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
  assert.throws(() => runProductionPhase2bCanonicalRuntimeInstalled(environment(), fixture.value));
  assert.equal(fixture.state.migrationCalls, 0);
});

test("artifact mismatch blocks before target authorization", () => {
  const fixture = dependencies({
    assertArtifact: () => { throw new Error("hash mismatch"); },
    authorize: () => assert.fail("target reached"),
  });
  assert.throws(() => runProductionPhase2bCanonicalRuntimeInstalled(environment(), fixture.value));
  assert.equal(fixture.state.migrationCalls, 0);
});

for (const variable of ["ALLOW_PRODUCTION_DDL", CANONICAL_RUNTIME_INSTALLED_OPT_IN]) {
  test(`missing ${variable} blocks before read-only SQL`, () => {
    const fixture = dependencies({ executeReadOnly: () => assert.fail("read-only SQL reached") });
    const env = environment();
    delete env[variable];
    assert.throws(() => runProductionPhase2bCanonicalRuntimeInstalled(env, fixture.value));
    assert.equal(fixture.state.migrationCalls, 0);
  });
}

for (const name of [
  "wrong installer", "PostgreSQL 18", "missing reflab_rls_owner", "Phase2A drift",
  "310005 drift", "Admin drift", "prerequisite drift", "Training drift",
  "Communication drift", "ledger phase 4 exists", "ledger has more than three rows",
  "wrong phase-3 key", "phase-3 plan hash drift", "phase-3 evidence hash drift",
  "schema state non-empty", "canonical marker present", "development object present",
]) test(`PRE ${name} never invokes migration`, () => {
  const fixture = dependencies({ classifyPre: () => { throw new Error(name); } });
  assert.throws(() => runProductionPhase2bCanonicalRuntimeInstalled(environment(), fixture.value));
  assert.equal(fixture.state.migrationCalls, 0);
});

test("migration failure is attempted once, proves rollback, and never runs POST", async () => {
  let preCalls = 0;
  const fixture = dependencies({
    classifyPre: () => {
      preCalls += 1;
      return { installer: { managedProfile: "READY" }, phase2a: { postState: "EXACT" } };
    },
    executeMigration: () => {
      fixture.state.migrationCalls += 1;
      throw Object.assign(new Error("forced"), { stderr: "ERROR: 55000: forced before commit" });
    },
    classifyPost: () => assert.fail("POST reached"),
  });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalRuntimeInstalledCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.equal(preCalls, 2);
  assert.match(stderr, /stage=MIGRATION_SQL/);
  assert.match(stderr, /reason=SQLSTATE_55000/);
  assert.match(stderr, /rollback=PASS/);
});

test("POST mismatch treats migration as potentially committed and never retries", async () => {
  const fixture = dependencies({ classifyPost: () => { throw new Error("post drift"); } });
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalRuntimeInstalledCli(environment(), {
    ...fixture.value, writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
  });
  assert.equal(exit, 1);
  assert.equal(fixture.state.migrationCalls, 1);
  assert.match(stderr, /stage=POST_DDL_ATTESTATION/);
  assert.match(stderr, /rollback=NOT_REQUIRED/);
});

test("failure output is bounded and redacts URL and password", async () => {
  const secretUrl = "postgresql://postgres:super-secret@example.invalid/postgres";
  let stderr = "";
  const exit = await runProductionPhase2bCanonicalRuntimeInstalledCli(
    environment({ REFLAB_PRODUCTION_DDL_DB_URL: secretUrl }),
    {
      argument: CANONICAL_RUNTIME_INSTALLED_OPERATION,
      run: () => { throw new Error(`${secretUrl} super-secret`); },
      writeStderr: (value) => { stderr += value; }, writeStdout: () => {},
    },
  );
  assert.equal(exit, 1);
  assert.equal(stderr,
    "PHASE2B_CANONICAL_RUNTIME_INSTALLED_FAIL:\nstage=OTHER\nreason=SAFE_DIAGNOSTIC_UNAVAILABLE\nrollback=NOT_REQUIRED\n");
});

test("runner has one pinned migration path and no retry, discovery, continuation, or cutover", () => {
  assert.match(runnerSource, /assertCanonicalRuntimeInstalledArtifact/);
  assert.match(runnerSource, /executeMigration/);
  assert.doesNotMatch(runnerSource, /202608150001[_-].*[.]sql|execute.*150001|retry|remediat/i);
  assert.doesNotMatch(runnerSource, /readdir|glob|db\s+push|supabase/i);
  assert.doesNotMatch(runnerSource, /security_cutover|runtime_cutover|canonical_finalized/i);
});
