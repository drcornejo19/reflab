import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CANONICAL_JSONB_TEXT_ACL,
  CANONICAL_JSONB_TEXT_TRAINING_ACL,
  CANONICAL_RUNTIME_PREREQUISITES_CHECKS,
  CANONICAL_RUNTIME_PREREQUISITES_OPERATION,
  CANONICAL_RUNTIME_PREREQUISITES_SHA256,
  assertCanonicalRuntimePrerequisitesArtifact,
  canonicalRuntimePrerequisitesPostQuery,
  canonicalRuntimePrerequisitesPreQuery,
  classifyCanonicalJsonbTextProvider,
  classifyCanonicalRuntimePrerequisitesState,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  assertCanonicalRuntimePrerequisitesSessionPoolerTarget,
  runProductionPhase2bCanonicalRuntimePrerequisites,
} from "./run-production-phase2b-canonical-runtime-prerequisites.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerPath = resolve(import.meta.dirname,
  "run-production-phase2b-canonical-runtime-prerequisites.mjs");
const runner = readFileSync(runnerPath, "utf8");
const migration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const source = migration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1]?.trim();

function payload(post = false) {
  return {
    checks: Object.fromEntries(CANONICAL_RUNTIME_PREREQUISITES_CHECKS.map((name) => [name, true])),
    source_base64: post ? Buffer.from(source, "utf8").toString("base64") : null,
    acl: post ? CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })) : [],
    counts: { attempts: 37, exam_results: 6, notification_events: 60, ledger: 3, schema_state: 0 },
  };
}
function target(overrides = {}) {
  return {
    projectRef: "nagjddldrldwavmfaytc",
    host: "aws-1-sa-east-1.pooler.supabase.com",
    connectionEnvironment: {
      PGHOST: "aws-1-sa-east-1.pooler.supabase.com", PGPORT: "5432", PGDATABASE: "postgres",
      PGUSER: "postgres.nagjddldrldwavmfaytc", PGSSLMODE: "require",
    },
    ...overrides,
  };
}

test("310005 artifact is pinned and limited to the reviewed helper", () => {
  const artifact = assertCanonicalRuntimePrerequisitesArtifact(root);
  assert.equal(artifact.sha256, CANONICAL_RUNTIME_PREREQUISITES_SHA256);
  assert.equal((migration.match(/create\s+function/gi) ?? []).length, 1);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|truncate)\b[\s\S]*?\bpublic\./i);
});

test("pre and post fixed queries use catalog and bounded aggregate evidence", () => {
  for (const query of [canonicalRuntimePrerequisitesPreQuery, canonicalRuntimePrerequisitesPostQuery]) {
    assert.match(query.payloadSql, /transaction_read_only/);
    assert.match(query.payloadSql, /pg_catalog\.pg_proc/);
    assert.doesNotMatch(query.payloadSql, /select\s+\*\s+from\s+public\./i);
  }
});

test("exact pre-state passes and exact post-state is exact", () => {
  assert.equal(classifyCanonicalRuntimePrerequisitesState(payload()).classification, "PASS");
  assert.equal(classifyCanonicalRuntimePrerequisitesState(payload(true), { post: true }).classification, "EXACT");
});

for (const name of CANONICAL_RUNTIME_PREREQUISITES_CHECKS) {
  test(`check ${name} fails closed`, () => {
    const value = payload(true); value.checks[name] = false;
    assert.equal(classifyCanonicalRuntimePrerequisitesState(value, { post: true }).classification, "BLOCKER");
  });
}

test("source hash and exact ACL drift fail closed", () => {
  const sourceDrift = payload(true); sourceDrift.source_base64 = Buffer.from("begin return null; end").toString("base64");
  assert.equal(classifyCanonicalRuntimePrerequisitesState(sourceDrift, { post: true }).classification, "BLOCKER");
  const aclDrift = payload(true); aclDrift.acl.push({ grantee: "anon", grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false });
  assert.equal(classifyCanonicalRuntimePrerequisitesState(aclDrift, { post: true }).classification, "BLOCKER");
});

test("post-Training helper preservation accepts only the reviewed owner dependency ACL extension", () => {
  const value = payload(true);
  value.checks.trainingProviderAbsent = false;
  value.checks.canonicalPayloadHashAbsent = false;
  value.checks.canonicalJsonbTextAclExact = false;
  value.acl = CANONICAL_JSONB_TEXT_TRAINING_ACL.map((entry) => ({ ...entry }));
  assert.equal(classifyCanonicalJsonbTextProvider(value).classification, "EXACT");

  for (const mutate of [
    (candidate) => candidate.acl.push({ grantee: "PUBLIC", grantor: "postgres",
      privilege_type: "EXECUTE", is_grantable: false }),
    (candidate) => candidate.acl.push({ grantee: "anon", grantor: "postgres",
      privilege_type: "EXECUTE", is_grantable: false }),
    (candidate) => { candidate.acl = candidate.acl.filter(({ grantee }) => grantee !== "service_role"); },
    (candidate) => { candidate.acl.find(({ grantee }) => grantee === "reflab_rls_owner").is_grantable = true; },
    (candidate) => { candidate.checks.canonicalJsonbTextStateExact = false; },
  ]) {
    const candidate = structuredClone(value);
    mutate(candidate);
    assert.equal(classifyCanonicalJsonbTextProvider(candidate).classification, "BLOCKER");
  }
});

test("only the exact Session Pooler target is accepted", () => {
  assert.equal(assertCanonicalRuntimePrerequisitesSessionPoolerTarget(target()).host,
    "aws-1-sa-east-1.pooler.supabase.com");
});

for (const [name, mutation] of [
  ["project", (value) => { value.projectRef = "wrong"; }],
  ["direct host", (value) => { value.host = "db.nagjddldrldwavmfaytc.supabase.co"; value.connectionEnvironment.PGHOST = value.host; }],
  ["arbitrary host", (value) => { value.host = "example.invalid"; value.connectionEnvironment.PGHOST = value.host; }],
  ["port", (value) => { value.connectionEnvironment.PGPORT = "6543"; }],
  ["database", (value) => { value.connectionEnvironment.PGDATABASE = "other"; }],
  ["username", (value) => { value.connectionEnvironment.PGUSER = "postgres"; }],
  ["ssl", (value) => { value.connectionEnvironment.PGSSLMODE = "disable"; }],
]) test(`${name} target drift is rejected`, () => {
  const value = target(); mutation(value);
  assert.throws(() => assertCanonicalRuntimePrerequisitesSessionPoolerTarget(value), /TARGET_REJECTED/);
});

test("runner pins repository, artifact, opt-ins, transaction and stop boundary", () => {
  for (const token of [
    "CANONICAL_RUNTIME_PREREQUISITES_OPT_IN", "authorizeProductionDdlTarget",
    "PRODUCTION_DDL_APPROVED_HEAD", "assertRepositoryAttestation",
    "assertCanonicalRuntimePrerequisitesArtifact", "ON_ERROR_STOP=1", "psql", "-X",
    "nextProviderReview", "202608110001_EXECUTION_REVIEW", "nextProvider", "NOT_AUTHORIZED",
  ]) assert.match(runner, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(runner, /db\s+push|readdir|glob|202608130001|202608150001|202608310006/);
});

test("runner reports only bounded diagnostics", () => {
  assert.match(runner, /stage=\$\{failure\.stage\}/);
  assert.match(runner, /reason=\$\{failure\.reason\}/);
  assert.doesNotMatch(runner, /process\.stderr\.write\([^)]*error\.stack|connectionEnvironment\.PGPASSWORD/);
});

test("runner rejects wrong HEAD, dirty worktree, artifact drift, and missing opt-ins before SQL", () => {
  const expectedHead = "a".repeat(40);
  let sqlCalls = 0;
  const base = {
    argument: CANONICAL_RUNTIME_PREREQUISITES_OPERATION,
    git: (args) => args[0] === "rev-parse" ? expectedHead : "",
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  };
  assert.throws(() => runProductionPhase2bCanonicalRuntimePrerequisites(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "b".repeat(40) }, base,
  ));
  assert.throws(() => runProductionPhase2bCanonicalRuntimePrerequisites(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead },
    { ...base, git: (args) => args[0] === "rev-parse" ? expectedHead : " M package.json" },
  ));
  assert.throws(() => runProductionPhase2bCanonicalRuntimePrerequisites(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead },
    { ...base, assertArtifact: () => { throw new Error("hash drift"); } },
  ));
  assert.throws(() => runProductionPhase2bCanonicalRuntimePrerequisites(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead }, base,
  ));
  assert.equal(sqlCalls, 0);
});
