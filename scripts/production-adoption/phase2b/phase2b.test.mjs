import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationManifest } from "../../production-preflight/manifest.mjs";
import {
  PHASE2B_DEPENDENCY_GRAPH,
  PHASE2B_FORBIDDEN_MIGRATIONS,
  PHASE2B_MIGRATIONS,
  PHASE2B_OBJECT_PROVIDERS,
  PHASE2B_RUNTIME_RPCS,
} from "./phase2b-contract.mjs";
import {
  buildSemanticSidecarFixtureSql,
  parsePostgresFailure,
  requireExpectedPostgresFailure,
} from "./run-phase2b-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationSql = Object.fromEntries(PHASE2B_MIGRATIONS.map((name) => [
  name,
  readFileSync(resolve(root, "supabase", "migrations", name), "utf8").replace(/\r\n/g, "\n"),
]));
const admin = migrationSql["202608110001_canonical_admin_user_access.sql"];
const training = migrationSql["202608130001_canonical_training_attempts.sql"];
const communication = migrationSql["202608150001_canonical_communication_feedback.sql"];
const prerequisite = migrationSql["202608310005_production_adoption_canonical_runtime_prerequisites.sql"];
const completion = migrationSql["202608310006_production_adoption_canonical_runtime_installed.sql"];
const docs = readFileSync(resolve(root, "docs", "production-adoption", "phase2b-canonical-runtime-installation.md"), "utf8");
const runner = readFileSync(resolve(directory, "run-phase2b-postgres.mjs"), "utf8");

test("Phase 2B order excludes every Development-only migration", () => {
  for (const migration of PHASE2B_FORBIDDEN_MIGRATIONS) {
    assert.ok(!PHASE2B_MIGRATIONS.includes(migration));
  }
  assert.doesNotMatch(PHASE2B_MIGRATIONS.join("\n"), /identity_links|development_identity|super_admin_identity/i);
});

test("dependency graph assigns one provider to every Phase 2B object", () => {
  assert.equal(PHASE2B_DEPENDENCY_GRAPH.length, 5);
  assert.equal(PHASE2B_OBJECT_PROVIDERS["public.attempts.canonical_payload_hash"], "202608130001");
  assert.equal((Object.values(PHASE2B_OBJECT_PROVIDERS).filter((provider) => provider === "202608130001")).length, 3);
  const orderedSql = PHASE2B_MIGRATIONS.map((name) => migrationSql[name]).join("\n");
  assert.equal((orderedSql.match(/add column canonical_payload_hash text/gi) ?? []).length, 1);
});

test("Production prerequisite supplies the exact baseline JSON helper only", () => {
  const baseline = readFileSync(resolve(root, "supabase", "migrations", "202607270000_reflab_canonical_baseline.sql"), "utf8");
  const functionPattern = /create function reflab_private\.canonical_jsonb_text\(p_value jsonb\)[\s\S]*?\n\$function\$;/i;
  assert.equal(prerequisite.match(functionPattern)?.[0], baseline.match(functionPattern)?.[0]);
  assert.doesNotMatch(prerequisite, /create table reflab_private\.user_identity_links/i);
  assert.doesNotMatch(prerequisite, /insert into reflab_meta\.reflab_schema_state/i);
  assert.match(prerequisite, /reflab_audit\.production_semantic_snapshot\(\)/i);
});

test("Admin has Production prerequisites instead of a Development migration edge", () => {
  assert.doesNotMatch(admin, /must run after 202608030001/i);
  assert.match(admin, /reviewed disabled Production adoption state/i);
  assert.match(admin, /Development identity infrastructure is forbidden/i);
  assert.match(admin, /Canonical Admin provider conflict/i);
});

test("Training remains the sole canonical payload-hash provider and is marker-disabled", () => {
  assert.match(training, /add column canonical_payload_hash text/i);
  assert.match(training, /Canonical Training provider conflict/i);
  assert.match(training, /count\(\*\) from reflab_meta\.reflab_schema_state\) <> 0/i);
  assert.match(training, /Canonical schema marker is invalid for training/i);
  assert.doesNotMatch(prerequisite, /add column canonical_payload_hash/i);
});

test("Communication intentionally replaces only the source-type constraint", () => {
  assert.match(communication, /drop constraint attempts_source_type_check,[\s\S]*communication_feedback/i);
  assert.match(communication, /source_item_type is null/i);
  assert.match(communication, /submit_canonical_training_attempt\(text,uuid,jsonb,integer\)/i);
  assert.match(communication, /Canonical Communication provider conflict/i);
});

test("completion records Phase 4 without finalizing the canonical marker", () => {
  assert.match(completion, /4,[\s\S]*'canonical_objects'/i);
  assert.doesNotMatch(completion, /insert into reflab_meta\.reflab_schema_state/i);
  assert.match(completion, /count\(\*\) from reflab_meta\.reflab_schema_state\) <> 0/i);
  for (const signature of PHASE2B_RUNTIME_RPCS) assert.match(completion, new RegExp(signature.replace(/[()]/g, "\\$&")));
});

test("completion qualifies derived function signatures without PL/pgSQL ambiguity", () => {
  assert.match(completion, /as required_function\(function_signature\)/i);
  assert.match(completion, /to_regprocedure\(\s*required_function\.function_signature\s*\)/i);
  assert.doesNotMatch(completion, /\]\s*::text\[\]\)\s+function_signature\b/i);
  assert.doesNotMatch(completion, /declare[\s\S]*?\bfunction_signature\s+text\s*;/i);
});

test("all modified migrations are transactional and fail closed", () => {
  for (const sql of [admin, training, communication, prerequisite, completion]) {
    assert.match(sql, /^begin;/im);
    assert.match(sql, /^commit;/im);
    assert.match(sql, /set local lock_timeout/i);
    assert.match(sql, /set local statement_timeout/i);
  }
});

test("browser roles receive no new function execution", () => {
  for (const sql of [admin, training, communication, prerequisite, completion]) {
    const executeGrants = sql.split(";").filter((statement) => /grant execute/i.test(statement));
    for (const statement of executeGrants) {
      assert.doesNotMatch(statement, /to\s+(public|anon|authenticated)\b/i);
    }
  }
  assert.match(completion, /retained browser execution/i);
});

test("local runner exercises legacy compatibility and all required negative cases", () => {
  for (const phrase of [
    "legacy_runtime",
    "legacy_write_null_sources",
    "missing_dependency",
    "incompatible_column",
    "marker",
    "development_rpc",
    "unsafe_role",
    "duplicate_provider",
  ]) assert.match(runner, new RegExp(phrase, "i"));
  assert.match(runner, /PGHOST: "127\.0\.0\.1"/);
  assert.match(runner, /PGSSLMODE: "disable"/);
  assert.doesNotMatch(runner, /supabase[.]co|PGPASSWORD|dotenv|--env-file|\.env\.validation/i);
});

test("PostgreSQL verbose diagnostics preserve SQLSTATE without exposing raw stderr", () => {
  for (const sqlstate of ["55000", "23514", "42702"]) {
    const diagnostic = parsePostgresFailure({
      stderr: `psql:migration.sql:42: ERROR:  ${sqlstate}: reviewed synthetic failure\nDETAIL:  sensitive payload`,
    });
    assert.deepEqual(diagnostic, {
      sqlstate,
      message: "reviewed synthetic failure",
    });
  }

  const missing = parsePostgresFailure({ stderr: "ERROR: diagnostic without a SQLSTATE" });
  assert.deepEqual(missing, {
    sqlstate: "UNKNOWN",
    message: "Local Phase 2B SQL failed.",
  });
  assert.throws(
    () => requireExpectedPostgresFailure(
      { stderr: "ERROR: diagnostic without a SQLSTATE; sensitive payload" },
      { expectedSqlstate: "55000", expectedMessage: "expected", stage: "synthetic negative" },
    ),
    (error) => error.message === "Unexpected Phase 2B SQL diagnostic during synthetic negative."
      && !error.message.includes("sensitive payload"),
  );
});

test("migration wrapper requests verbose PostgreSQL diagnostics", () => {
  assert.match(runner, /function apply[\s\S]*?"VERBOSITY=verbose"/);
});

test("semantic sidecar fixture covers its complete reviewed table set", () => {
  const sql = buildSemanticSidecarFixtureSql();
  assert.match(sql, /alter table public\.attempts enable row level security/i);
  assert.match(sql, /grant select on public\.user_profiles to reflab_prod_preflight_ro/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|truncate)/i);
});

test("new adoption migrations are explicitly classified", () => {
  for (const version of ["202608310005", "202608310006"]) {
    const entry = migrationManifest.find((candidate) => candidate.version === version);
    assert.equal(entry?.classification, "production_adoption_bridge");
    assert.equal(entry?.productionAction, "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
  }
});

test("documentation keeps unresolved global cutover debt explicit", () => {
  for (const phrase of [
    "empty canonical marker",
    "Development-only migrations are never executed",
    "96 missing policies",
    "791 browser DML",
    "temporary semantic audit sidecar",
    "does not enable runtime",
  ]) assert.match(docs, new RegExp(phrase.replaceAll(" ", "\\s+"), "i"));
});
