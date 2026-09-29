import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { hashFunctionSource } from "../../production-preflight/queries.mjs";
import {
  ADMIN_CANONICAL_ACCESS_ARTIFACT,
  ADMIN_CANONICAL_ACCESS_CHECKS,
  ADMIN_CANONICAL_ACCESS_COLUMN_ACL,
  ADMIN_CANONICAL_ACCESS_FUNCTIONS,
  ADMIN_CANONICAL_ACCESS_FUNCTION_ACL,
  ADMIN_CANONICAL_ACCESS_OPERATION,
  ADMIN_CANONICAL_ACCESS_POLICIES,
  ADMIN_CANONICAL_ACCESS_SCHEMA_ACL,
  ADMIN_CANONICAL_ACCESS_SHA256,
  adminCanonicalAccessPostQuery,
  adminCanonicalAccessPreQuery,
  assertAdminCanonicalAccessArtifact,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  assertAdminCanonicalAccessSessionPoolerTarget,
  runProductionPhase2bAdminCanonicalAccess,
} from "./run-production-phase2b-admin-canonical-access.mjs";
import {
  CANONICAL_JSONB_TEXT_ACL,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const runnerPath = resolve(import.meta.dirname, "run-production-phase2b-admin-canonical-access.mjs");
const runner = readFileSync(runnerPath, "utf8");
const migration = readFileSync(resolve(root, ADMIN_CANONICAL_ACCESS_ARTIFACT), "utf8");
const helperMigration = readFileSync(resolve(root,
  "supabase/migrations/202608310005_production_adoption_canonical_runtime_prerequisites.sql"), "utf8");
const helperSource = helperMigration.match(/as \$function\$([\s\S]*?)\$function\$;/i)?.[1] ?? "";

function sourceFor(name) {
  return migration.match(new RegExp(
    `create function public\\.${name}\\([\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`, "i",
  ))?.[1] ?? "";
}

function payload(post = false) {
  return {
    checks: Object.fromEntries(ADMIN_CANONICAL_ACCESS_CHECKS.map((name) => [name, true])),
    helper_source_base64: Buffer.from(helperSource, "utf8").toString("base64"),
    helper_acl: CANONICAL_JSONB_TEXT_ACL.map((entry) => ({ ...entry })),
    functions: post ? ADMIN_CANONICAL_ACCESS_FUNCTIONS.map((fn) => ({
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
      source_base64: Buffer.from(sourceFor(fn.name), "utf8").toString("base64"),
    })) : [],
    function_acl: post ? ADMIN_CANONICAL_ACCESS_FUNCTION_ACL.map((entry) => ({ ...entry })) : [],
    policies: post ? ADMIN_CANONICAL_ACCESS_POLICIES.map((entry) => ({ ...entry })) : [],
    schema_acl: post ? ADMIN_CANONICAL_ACCESS_SCHEMA_ACL.map((entry) => ({ ...entry })) : [],
    table_acl: [],
    column_acl: post ? ADMIN_CANONICAL_ACCESS_COLUMN_ACL.map((entry) => ({ ...entry })) : [],
    counts: {
      attempts: 37, exam_results: 6, notification_events: 60,
      ledger: 3, schema_state: 0,
    },
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

test("corrected artifact is pinned and ACL hardening precedes ownership transfer", () => {
  const artifact = assertAdminCanonicalAccessArtifact(root);
  assert.equal(artifact.sha256, ADMIN_CANONICAL_ACCESS_SHA256);
  assert.equal(artifact.sha256, "0c8ea0383eb16bcef78b2252bd66682f9fbfa4b5dcea93d03807a1b91e6f8051");
  assert.notEqual(artifact.sha256, "b1ae4cfa4bb88e8bd6b903078d23b27d6c03563e8cb0de7305d89add6d23b1ca");
  assert.ok(migration.indexOf("revoke all on function") < migration.indexOf("alter function public.admin_set_canonical_user_plan"));
});

test("function bodies and source hashes are unchanged", () => {
  for (const fn of ADMIN_CANONICAL_ACCESS_FUNCTIONS) {
    assert.equal(hashFunctionSource(sourceFor(fn.name)), fn.source_hash);
  }
});

test("migration retains exact reviewed scope", () => {
  assert.equal((migration.match(/^create function public\.admin_set_canonical_/gmi) ?? []).length, 2);
  assert.equal((migration.match(/^create policy /gmi) ?? []).length, 7);
  assert.equal((migration.match(/^grant (?:select|update|insert) \(/gmi) ?? []).length, 7);
  assert.match(migration, /notify pgrst, 'reload schema';/i);
});

test("schema ACL contract records the effective owner as the public grantor", () => {
  assert.deepEqual(ADMIN_CANONICAL_ACCESS_SCHEMA_ACL, [
    { schema_name: "public", grantee: "reflab_rls_owner", grantor: "pg_database_owner",
      privilege_type: "USAGE", is_grantable: false },
    { schema_name: "reflab_meta", grantee: "reflab_rls_owner", grantor: "postgres",
      privilege_type: "USAGE", is_grantable: false },
  ]);
});

test("pre and post queries are fixed catalog and bounded aggregate evidence", () => {
  for (const query of [adminCanonicalAccessPreQuery, adminCanonicalAccessPostQuery]) {
    assert.match(query.payloadSql, /transaction_read_only/);
    assert.match(query.payloadSql, /pg_catalog\.pg_proc/);
    assert.match(query.payloadSql, /pg_catalog\.pg_policy/);
    assert.doesNotMatch(query.payloadSql, /select\s+\*\s+from\s+(?:public|reflab_meta)\./i);
  }
});

test("public schema grant authority recognizes only ownership or CREATE grant option", () => {
  const sql = adminCanonicalAccessPreQuery.payloadSql.replaceAll(/\s+/g, " ");
  const predicate = sql.match(
    /'installerCanGrantPublicExact',exists\(select 1 from pg_catalog\.pg_namespace namespace where namespace\.nspname='public' and \(([\s\S]*?)\)\), 'rlsOwnerExact'/,
  )?.[1] ?? "";

  assert.match(predicate,
    /namespace\.nspowner=\(select oid from pg_catalog\.pg_roles where rolname=current_user\)/,
    "direct schema ownership must remain sufficient");
  assert.match(predicate,
    /coalesce\(pg_catalog\.pg_has_role\(current_user,namespace\.nspowner,'USAGE'\),false\)/,
    "effective membership in the actual schema-owner role must be sufficient");
  assert.match(predicate,
    /acl\.grantee=\(select oid from pg_catalog\.pg_roles where rolname=current_user\)[\s\S]*acl\.privilege_type='CREATE' and acl\.is_grantable/,
    "explicit CREATE must still require grant option");
  assert.doesNotMatch(predicate, /has_schema_privilege/,
    "effective CREATE without grant authority must not pass");
  assert.doesNotMatch(predicate, /pg_database_owner/,
    "membership must be checked against the observed owner, not an unrelated hardcoded role");
  assert.match(sql,
    /'installerCanGrantPublicExact',exists\(select 1 from pg_catalog\.pg_namespace namespace where namespace\.nspname='public'/,
    "a missing public schema must fail the enclosing exists predicate");
});

function installerCanGrantPublicFixture({
  schemaExists = true,
  directOwner = false,
  effectiveOwner = false,
  createAcl = false,
  createGrantable = false,
} = {}) {
  return schemaExists
    && (directOwner || effectiveOwner || (createAcl && createGrantable));
}

test("direct public schema owner passes installer authority", () => {
  assert.equal(installerCanGrantPublicFixture({ directOwner: true }), true);
});

test("effective pg_database_owner schema owner passes installer authority", () => {
  assert.equal(installerCanGrantPublicFixture({ effectiveOwner: true }), true);
});

test("explicit CREATE with grant option passes installer authority", () => {
  assert.equal(installerCanGrantPublicFixture({ createAcl: true, createGrantable: true }), true);
});

test("CREATE without grant authority remains blocked", () => {
  assert.equal(installerCanGrantPublicFixture({ createAcl: true, createGrantable: false }), false);
});

test("unrelated role membership remains blocked", () => {
  assert.equal(installerCanGrantPublicFixture({ effectiveOwner: false }), false);
});

test("missing public schema remains blocked", () => {
  assert.equal(installerCanGrantPublicFixture({ schemaExists: false, directOwner: true }), false);
});

test("exact pre-state passes and exact post-state is exact", () => {
  assert.equal(classifyAdminCanonicalAccessState(payload()).classification, "PASS");
  assert.equal(classifyAdminCanonicalAccessState(payload(true), { post: true }).classification, "EXACT");
});

for (const name of ADMIN_CANONICAL_ACCESS_CHECKS) {
  test(`check ${name} fails closed`, () => {
    const value = payload(true);
    value.checks[name] = false;
    assert.equal(classifyAdminCanonicalAccessState(value, { post: true }).classification, "BLOCKER");
  });
}

for (const [name, mutate] of [
  ["function source", (value) => { value.functions[0].source_base64 = Buffer.from("begin return null; end").toString("base64"); }],
  ["function ACL", (value) => { value.function_acl.push({ routine: "admin_set_canonical_user_plan", grantee: "anon", grantor: "reflab_rls_owner", privilege_type: "EXECUTE", is_grantable: false }); }],
  ["policy", (value) => { value.policies[0].check_expression = "true"; }],
  ["schema ACL", (value) => { value.schema_acl[0].privilege_type = "CREATE"; }],
  ["column ACL", (value) => { value.column_acl.pop(); }],
]) test(`${name} semantic drift fails closed`, () => {
  const value = payload(true);
  mutate(value);
  assert.equal(classifyAdminCanonicalAccessState(value, { post: true }).classification, "BLOCKER");
});

test("only the exact Session Pooler target is accepted", () => {
  assert.equal(assertAdminCanonicalAccessSessionPoolerTarget(target()).host,
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
  const value = target();
  mutation(value);
  assert.throws(() => assertAdminCanonicalAccessSessionPoolerTarget(value), /TARGET_REJECTED/);
});

test("runner pins artifact, opt-ins, atomic execution, warning rejection, and stop boundary", () => {
  for (const token of [
    "ADMIN_CANONICAL_ACCESS_OPT_IN", "authorizeProductionDdlTarget",
    "PRODUCTION_DDL_APPROVED_HEAD", "assertRepositoryAttestation",
    "assertAdminCanonicalAccessArtifact", "ON_ERROR_STOP=1", "psql", "-X",
    "PRIVILEGE_WARNING", "nextProviderReview", "PRE_PHASE2B_ADOPTION_PREREQUISITE_EXECUTION_REVIEW",
    "nextProvider", "NOT_AUTHORIZED",
  ]) assert.match(runner, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(runner, /db\s+push|readdir|glob|202608130001|202608150001|202608310006/);
});

test("runner reports bounded diagnostics without secrets", () => {
  assert.match(runner, /stage=\$\{failure\.stage\}/);
  assert.match(runner, /reason=\$\{failure\.reason\}/);
  assert.doesNotMatch(runner, /process\.stderr\.write\([^)]*error\.stack|connectionEnvironment\.PGPASSWORD/);
});

test("repository, artifact, and opt-in failures occur before SQL", () => {
  const expectedHead = "a".repeat(40);
  let sqlCalls = 0;
  const base = {
    argument: ADMIN_CANONICAL_ACCESS_OPERATION,
    git: (args) => args[0] === "rev-parse" ? expectedHead : "",
    executeReadOnly: () => { sqlCalls += 1; return new Map(); },
  };
  assert.throws(() => runProductionPhase2bAdminCanonicalAccess(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: "b".repeat(40) }, base,
  ));
  assert.throws(() => runProductionPhase2bAdminCanonicalAccess(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead },
    { ...base, git: (args) => args[0] === "rev-parse" ? expectedHead : " M package.json" },
  ));
  assert.throws(() => runProductionPhase2bAdminCanonicalAccess(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead },
    { ...base, assertArtifact: () => { throw new Error("hash drift"); } },
  ));
  assert.throws(() => runProductionPhase2bAdminCanonicalAccess(
    { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: expectedHead }, base,
  ));
  assert.equal(sqlCalls, 0);
});
