import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationManifest } from "../../production-preflight/manifest.mjs";
import {
  existingCanonicalMigrationDependencies,
  PHASE0_FINGERPRINT_HASH,
  PHASE1_PLAN_HASH,
  PHASE1_PLAN_VERSION,
  phase1BridgeMigrations,
  productionObjectProviders,
} from "./bridge-manifest.mjs";
import {
  buildDisposablePostgresEnvironment,
  parsePsqlScalar,
} from "./run-phase1-bridge-postgres.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(directory, "..", "..", "..");
const migrationDirectory = resolve(repositoryRoot, "supabase", "migrations");
const planPath = resolve(repositoryRoot, "docs", "production-adoption", "phase1-production-adoption-bridge.md");
const plan = readFileSync(planPath, "utf8");
const migrations = new Map(phase1BridgeMigrations.map((entry) => [
  entry.phase,
  readFileSync(resolve(migrationDirectory, `${entry.version}_${entry.name}.sql`), "utf8"),
]));
const allMigrationSql = [...migrations.values()].join("\n");

function psychologySeedRows(source) {
  const block = source.match(/insert into public\.psychology_modules[\s\S]*?;/i)?.[0] ?? "";
  return block
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[,;]$/, ""))
    .filter((line) => line.startsWith("("));
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

test("Phase 1 plan and evidence hashes are pinned to reviewed local evidence", () => {
  assert.equal(PHASE1_PLAN_VERSION, "production_adoption_bridge_v1");
  assert.equal(sha256(plan.replaceAll("\r\n", "\n")), PHASE1_PLAN_HASH);
  assert.match(PHASE0_FINGERPRINT_HASH, /^[0-9a-f]{64}$/);
  assert.deepEqual(phase1BridgeMigrations.map((entry) => entry.order), [1, 2, 3]);
  assert.deepEqual(phase1BridgeMigrations.map((entry) => entry.phase), [
    "foundation",
    "exam_training_prerequisites",
    "psychology_notification_prerequisites",
  ]);
  for (const sql of migrations.values()) {
    assert.ok(sql.includes(PHASE1_PLAN_HASH));
    assert.ok(sql.includes(PHASE0_FINGERPRINT_HASH));
  }
});

test("bridge migrations are transactional, time-limited, and fail-fast", () => {
  for (const [phase, sql] of migrations) {
    assert.match(sql, /^begin;/im, phase);
    assert.match(sql, /^commit;/im, phase);
    assert.match(sql, /set local lock_timeout = '[0-9]+s';/i, phase);
    assert.match(sql, /set local statement_timeout = '[0-9]+s';/i, phase);
    assert.match(sql, /using errcode = '(42501|55000|23514)'/i, phase);
    assert.doesNotMatch(sql, /\b(drop\s+(table|schema)|truncate)\b/i, phase);
  }
});

test("bridge creates empty schema-state infrastructure but never finalizes a marker", () => {
  assert.doesNotMatch(allMigrationSql, /create\s+table\s+reflab_private\.user_identity_links/i);
  assert.doesNotMatch(allMigrationSql, /create\s+(or\s+replace\s+)?function\s+public\.(resolve|link)_development_/i);
  assert.match(migrations.get("foundation"), /create\s+table\s+reflab_meta\.reflab_schema_state/i);
  assert.doesNotMatch(allMigrationSql, /insert\s+into\s+reflab_meta\.reflab_schema_state/i);
  assert.match(migrations.get("foundation"), /select pg_catalog\.count\(\*\) from reflab_meta\.reflab_schema_state\) <> 0/i);
  assert.doesNotMatch(allMigrationSql, /automatic_default|public\.user_roles/i);
});

test("foundation adoption state is separate, append-only, monotonic, and contains no PII", () => {
  const sql = migrations.get("foundation");
  const tableDefinition = sql.match(/create table reflab_meta\.production_adoption_state \([\s\S]*?\n\);/i)?.[0] ?? "";
  assert.match(tableDefinition, /phase_order/);
  assert.match(tableDefinition, /plan_hash/);
  assert.match(tableDefinition, /evidence_hash/);
  assert.doesNotMatch(tableDefinition, /user_id|email|name|token|storage_path|external_subject/i);
  assert.match(sql, /append-only/i);
  assert.match(sql, /invalid or non-monotonic/i);
  assert.match(sql, /alter table reflab_meta\.production_adoption_state enable row level security/i);
  assert.doesNotMatch(sql, /alter table reflab_meta\.production_adoption_state force row level security/i);
  assert.match(sql, /authorization current_user/i);
  assert.match(sql, /revoke all on table reflab_meta\.production_adoption_state/i);
});

test("Exam and Training prerequisites preserve legacy rows and add only nullable compatibility", () => {
  const sql = migrations.get("exam_training_prerequisites");
  for (const column of [
    "source_item_type text",
    "source_item_id text",
    "source_occurrence_id uuid",
    "institution_assessment_session_id uuid",
    "exam_session_id uuid",
    "payload_hash text",
  ]) {
    assert.match(sql, new RegExp(`add column ${column}`, "i"));
    assert.doesNotMatch(sql, new RegExp(`add column ${column}\\s+(not null|default)`, "i"));
  }
  assert.match(sql, /create table public\.referee_exam_sessions/i);
  assert.match(sql, /constraint referee_exam_sessions_item_count_range_check\s+check \(item_count between 1 and 100\)/i);
  assert.equal((sql.match(/constraint referee_exam_sessions_item_count_check\b/gi) ?? []).length, 1);
  assert.match(sql, /not valid/i);
  assert.doesNotMatch(sql, /add column canonical_payload_hash/i);
  assert.doesNotMatch(sql, /add constraint attempts_canonical_payload_hash_check/i);
  assert.doesNotMatch(sql, /attempts_exam_source_check/i);
  assert.doesNotMatch(sql, /update\s+public\.(attempts|exam_results)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.(attempts|exam_results)/i);
  assert.match(sql, /Phase 1 fabricated canonical Exam\/Training values/i);
});

test("legacy attempts, exam results, notifications, and Clerk-style IDs are never rewritten", () => {
  assert.doesNotMatch(allMigrationSql, /update\s+public\.(attempts|exam_results|notification_events)/i);
  assert.doesNotMatch(allMigrationSql, /delete\s+from\s+public\.(attempts|exam_results|notification_events)/i);
  assert.doesNotMatch(allMigrationSql, /set\s+user_id\s*=/i);
  assert.doesNotMatch(allMigrationSql, /replace\s*\([^)]*user_/i);
});

test("canonical payload hash remains owned exclusively by 202608130001", () => {
  const trainingMigration = readFileSync(
    resolve(migrationDirectory, "202608130001_canonical_training_attempts.sql"),
    "utf8",
  );
  assert.doesNotMatch(allMigrationSql, /add column canonical_payload_hash/i);
  assert.doesNotMatch(allMigrationSql, /attempts_canonical_payload_hash_check/i);
  assert.match(trainingMigration, /add column canonical_payload_hash text/i);
  assert.match(trainingMigration, /attempts_canonical_payload_hash_check/i);
});

test("Psychology seed is deterministic and notification deduplication remains nullable", () => {
  const sql = migrations.get("psychology_notification_prerequisites");
  const baseline = readFileSync(
    resolve(migrationDirectory, "202607270000_reflab_canonical_baseline.sql"),
    "utf8",
  );
  assert.match(sql, /unknown Psychology module slug requires a manual decision/i);
  assert.equal((sql.match(/^\s*\('[a-z-]+',\s*'[^']+'/gm) ?? []).length, 8);
  assert.deepEqual(psychologySeedRows(sql), psychologySeedRows(baseline));
  assert.doesNotMatch(sql, /add constraint psychology_(checkins|wellbeing|exercise|exercises)_module_fk/i);
  assert.match(baseline, /constraint psychology_exercise_module_fk/i);
  assert.match(sql, /add column deduplication_key text;/i);
  assert.doesNotMatch(sql, /add column deduplication_key text\s+(not null|default)/i);
  assert.match(sql, /where deduplication_key is not null/i);
  assert.doesNotMatch(sql, /update\s+public\.(notification_events|psychology_)/i);
});

test("new tables are closed and bridge grants no browser DML or PUBLIC execute", () => {
  for (const table of [
    "reflab_meta.reflab_schema_state",
    "reflab_meta.production_adoption_state",
    "public.referee_exam_sessions",
    "public.psychology_modules",
  ]) {
    assert.match(allMigrationSql, new RegExp(`alter table ${table.replaceAll(".", "\\.")} (enable|force) row level security`, "i"));
    assert.match(allMigrationSql, new RegExp(`revoke all on table ${table.replaceAll(".", "\\.")}`, "i"));
  }
  assert.doesNotMatch(allMigrationSql, /grant\s+(insert|update|delete|truncate|references|trigger|all)[\s\S]{0,180}\bto\s+(public|anon|authenticated|service_role)/i);
  assert.doesNotMatch(allMigrationSql, /grant\s+execute[\s\S]{0,180}\bto\s+(public|anon|authenticated|service_role)/i);
  assert.doesNotMatch(allMigrationSql, /security\s+definer/i);
});

test("schema-state infrastructure matches the baseline shape and remains empty", () => {
  const foundation = migrations.get("foundation");
  for (const column of [
    "installation_id uuid primary key default gen_random_uuid()",
    "baseline_version text not null unique",
    "sql_checksum text not null",
    "manifest_hash text not null",
    "environment text not null",
    "installed_at timestamptz not null default pg_catalog.now()",
    "postgres_version text not null",
    "supabase_platform_version text",
    "schema_version integer not null",
    "installation_status text not null",
  ]) {
    assert.ok(foundation.includes(column), column);
  }
  assert.match(foundation, /create function reflab_meta\.reject_schema_state_mutation\(\)/i);
  assert.match(foundation, /create trigger reflab_schema_state_immutable/i);
  assert.doesNotMatch(foundation, /insert into reflab_meta\.reflab_schema_state/i);
});

test("Matches keeps appointment-derived fixture context", () => {
  assert.doesNotMatch(allMigrationSql, /alter\s+table\s+public\.(match_preparations|post_match_reviews)[\s\S]{0,200}add\s+column\s+fixture_id/i);
  const fixture = readFileSync(resolve(directory, "legacy-production-fixture.sql"), "utf8");
  assert.match(fixture, /create table public\.match_preparations[\s\S]*appointment_id uuid not null/i);
  assert.match(fixture, /create table public\.post_match_reviews[\s\S]*appointment_id uuid not null/i);
});

test("existing canonical incrementals retain explicit Production adoption prerequisites", () => {
  const admin = existingCanonicalMigrationDependencies.find((entry) => entry.version === "202608110001");
  const training = existingCanonicalMigrationDependencies.find((entry) => entry.version === "202608130001");
  const communication = existingCanonicalMigrationDependencies.find((entry) => entry.version === "202608150001");
  assert.equal(admin.developmentOnlyCommentDependency, "202608030001");
  assert.ok(admin.productionRequires.includes("empty_schema_state_infrastructure"));
  assert.ok(!admin.productionRequires.includes("202608030001"));
  assert.equal(admin.runtimeRequiresInstalledMarker, true);
  assert.equal(training.runtimeRequiresInstalledMarker, true);
  assert.equal(communication.runtimeRequiresInstalledMarker, true);
  assert.ok(communication.productionRequires.includes("empty_schema_state_infrastructure"));
  assert.ok(!communication.productionRequires.includes("late_canonical_marker"));
  assert.equal(migrationManifest.find((entry) => entry.version === "202608030001").classification, "development_only");
  assert.equal(migrationManifest.find((entry) => entry.version === "202608030001").productionAction, "NEVER_EXECUTE_IN_PRODUCTION");
});

test("the executable object-provider graph has one owner per object", () => {
  assert.equal(
    new Set(productionObjectProviders.map(([object]) => object)).size,
    productionObjectProviders.length,
  );
  assert.deepEqual(
    productionObjectProviders.find(([object]) => object === "public.attempts.canonical_payload_hash"),
    ["public.attempts.canonical_payload_hash", "202608130001"],
  );
  assert.deepEqual(
    productionObjectProviders.find(([object]) => object === "reflab_meta.reflab_schema_state.installed_row"),
    ["reflab_meta.reflab_schema_state.installed_row", "canonical_finalization_future"],
  );
  assert.deepEqual(
    productionObjectProviders.find(([object]) => object === "public.attempts.attempts_canonical_payload_hash_check"),
    ["public.attempts.attempts_canonical_payload_hash_check", "202608130001"],
  );
  assert.deepEqual(
    productionObjectProviders.find(([object]) => object === "public.psychology_module_foreign_keys"),
    ["public.psychology_module_foreign_keys", "psychology_runtime_cutover_future"],
  );
  assert.ok(!phase1BridgeMigrations[2].provides.includes("psychology_module_fks"));
});

test("synthetic Production preserves 37 attempts, 6 exam results and 60 notifications", () => {
  const fixture = readFileSync(resolve(directory, "legacy-production-fixture.sql"), "utf8");
  const compatibility = readFileSync(resolve(directory, "phase1-legacy-write-compatibility.sql"), "utf8");
  assert.match(fixture, /generate_series\(1, 37\)/i);
  assert.match(fixture, /generate_series\(1, 6\)/i);
  assert.match(fixture, /generate_series\(1, 60\)/i);
  assert.match(compatibility, /exam_result_id[\s\S]+source_item_type is null/i);
  assert.match(compatibility, /PHASE1_LEGACY_WRITE_COMPATIBILITY_PASS/);
});

test("bridge migrations are classified separately from replayable or Development migrations", () => {
  for (const bridge of phase1BridgeMigrations) {
    const entry = migrationManifest.find((candidate) => candidate.version === bridge.version);
    assert.equal(entry?.name, bridge.name);
    assert.equal(entry?.classification, "production_adoption_bridge");
    assert.equal(entry?.productionAction, "MANUAL_PHASED_ADOPTION_AFTER_PHASE0_EVIDENCE");
  }
  const localNames = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql"));
  assert.ok(phase1BridgeMigrations.every((entry) => localNames.includes(`${entry.version}_${entry.name}.sql`)));
});

test("legacy identity helpers have no TypeScript or JavaScript runtime callers", () => {
  const roots = ["app", "components", "lib"];
  const helperPattern = /\b(institution_request_user_id|platform_request_user_id|reflab_request_user_id)\b/;
  function scan(path) {
    const entries = readdirSync(path, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const target = resolve(path, entry.name);
      if (entry.isDirectory()) return scan(target);
      if (!/\.(?:ts|tsx|mts|mjs|js|jsx)$/.test(entry.name)) return [];
      return helperPattern.test(readFileSync(target, "utf8")) ? [target] : [];
    });
  }
  assert.deepEqual(roots.flatMap((root) => scan(resolve(repositoryRoot, root))), []);
});

test("local PostgreSQL rehearsal is target-guarded and never references Supabase hosts", () => {
  const runner = readFileSync(resolve(directory, "run-phase1-bridge-postgres.mjs"), "utf8");
  assert.match(runner, /mkdtempSync/);
  assert.match(runner, /binaries\.initdb/);
  assert.match(runner, /binaries\.pgCtl/);
  assert.match(runner, /bootstrapDisposableRoles/);
  assert.match(runner, /clusterCleanup: "PASS"/);
  assert.doesNotMatch(runner, /supabase\.co|nagjddldrldwavmfaytc|bthnhbpgiyuajsgoccrp/i);
  assert.match(runner, /unexpectedColumnRollback: true/);
  assert.match(runner, /unknownModuleRollback: true/);
  assert.match(runner, /missingDependencyRollback: true/);
  assert.match(runner, /invalidLedgerRollback: true/);
  assert.match(runner, /nonSuperuserInstaller: true/);
  assert.match(runner, /legacyWriteCompatibility: true/);
  assert.match(runner, /postCatalogWriteCompatibility: true/);
  assert.match(runner, /nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls/i);
  assert.match(runner, /set role/);
  assert.match(runner, /could not prove disposable database cleanup/i);
  assert.doesNotMatch(runner, /catch\s*\{\s*\/\*\s*Surface the primary rehearsal error/i);
});

test("Phase 1 disposable PostgreSQL ignores inherited connection settings", () => {
  const environment = buildDisposablePostgresEnvironment(55432, {
    SystemRoot: "C:\\Windows",
    PATH: "C:\\Program Files\\PostgreSQL\\18\\bin",
    PGHOST: "db.example.supabase.co",
    PGPORT: "6543",
    PGDATABASE: "remote",
    PGUSER: "remote_user",
    PGPASSWORD: "must_not_leak",
    PGOPTIONS: "-c role=unsafe",
    PGSERVICE: "unsafe",
    PGPASSFILE: "unsafe",
  });
  assert.equal(environment.PGHOST, "127.0.0.1");
  assert.equal(environment.PGPORT, "55432");
  assert.equal(environment.PGDATABASE, "postgres");
  assert.equal(environment.PGUSER, "postgres");
  assert.equal(environment.PGSSLMODE, "disable");
  for (const name of ["PGPASSWORD", "PGOPTIONS", "PGSERVICE", "PGSERVICEFILE", "PGPASSFILE"]) {
    assert.ok(!(name in environment));
  }
});

test("psql scalar parser ignores only expected command tags", () => {
  assert.equal(parsePsqlScalar("SET\nt\n"), "t");
  assert.equal(parsePsqlScalar("SET\r\nf\r\n"), "f");
  assert.equal(parsePsqlScalar("t\n"), "t");
  assert.throws(() => parsePsqlScalar("SET\nUPDATE 1\nt\n"), /Unexpected psql scalar output shape/);
  assert.throws(() => parsePsqlScalar("SET\n"), /Unexpected psql scalar output shape/);
});

test("positive rehearsal assertions have stable sanitized diagnostics", () => {
  const assertions = readFileSync(resolve(directory, "phase1-bridge-assertions.sql"), "utf8");
  const runner = readFileSync(resolve(directory, "run-phase1-bridge-postgres.mjs"), "utf8");
  const expectedIds = [
    "PHASE1_ASSERT_001_HISTORICAL_COUNTS",
    "PHASE1_ASSERT_002_LEGACY_VALUES_PRESERVED",
    "PHASE1_ASSERT_003_BRIDGE_OBJECT_CONTRACT",
    "PHASE1_ASSERT_004_ADOPTION_LEDGER_AND_MARKER",
    "PHASE1_ASSERT_005_MATCHES_APPOINTMENT_CONTRACT",
    "PHASE1_ASSERT_006_CANONICAL_PAYLOAD_HASH_ABSENT",
    "PHASE1_ASSERT_007_CUTOVER_CONSTRAINTS_ABSENT",
    "PHASE1_ASSERT_008_BRIDGE_TABLES_RLS_ENABLED",
    "PHASE1_ASSERT_009_BRIDGE_TABLES_APP_ACL_ABSENT",
  ];
  assert.deepEqual(
    [...assertions.matchAll(/raise exception '(PHASE1_ASSERT_[0-9]{3}_[A-Z0-9_]+)'/g)].map((match) => match[1]),
    expectedIds,
  );
  assert.deepEqual(
    [...assertions.matchAll(/using errcode = '(P10[0-9]{2})'/g)].map((match) => match[1]),
    expectedIds.map((_, index) => `P10${String(index + 1).padStart(2, "0")}`),
  );
  for (const assertionId of expectedIds) {
    assert.match(assertions, new RegExp(`${assertionId}\\|PASS`));
  }
  assert.match(runner, /positiveOnly: process\.argv\.includes\("--positive-only"\)/);
  assert.match(runner, /message: "Positive assertion failed\."/);
  assert.doesNotMatch(runner, /message:\s*(error\.)?stderr|JSON\.stringify\([^)]*stderr/i);
});

test("documentation keeps canonical marker and migration-history claims fail-closed", () => {
  assert.match(plan, /empty schema-state table is infrastructure, not installation/i);
  assert.match(plan, /no synthetic migration-history row/i);
  assert.match(plan, /must never run `202608030001_development_identity_resolution\.sql`/i);
  assert.match(plan, /does not address the broad grant\/policy drift by mass revocation/i);
});
