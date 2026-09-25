import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  semanticAuditTableColumns,
  semanticAuditTables,
} from "../phase2a/semantic-audit-contract.mjs";
import {
  PHASE2B_DEVELOPMENT_RPCS,
  PHASE2B_HISTORICAL_COUNTS,
  PHASE2B_RUNTIME_RPCS,
} from "./phase2b-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const fixture = readFileSync(resolve(directory, "phase2b-production-fixture.sql"), "utf8");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  dropdb: join(postgresBin, "dropdb.exe"),
  psql: join(postgresBin, "psql.exe"),
};

const phase1Migrations = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
];
const sidecarMigration = "202608310004_production_adoption_semantic_audit.sql";
const phase2bMigrations = [
  "202608310005_production_adoption_canonical_runtime_prerequisites.sql",
  "202608110001_canonical_admin_user_access.sql",
  "20260925150422_production_adoption_pre_phase2b_schema_reconciliation.sql",
  "202608130001_canonical_training_attempts.sql",
  "202608150001_canonical_communication_feedback.sql",
  "202608310006_production_adoption_canonical_runtime_installed.sql",
];
const prerequisiteMigrationSql = readFileSync(
  resolve(migrationsDirectory, phase2bMigrations[2]), "utf8",
);

const textIdentityColumns = new Set([
  "actor_user_id",
  "assigned_by_user_id",
  "changed_by_user_id",
  "converted_by_user_id",
  "created_by_user_id",
  "invited_by_user_id",
  "owner_user_id",
  "target_user_id",
  "uploaded_by",
  "user_id",
]);
const jsonColumns = new Set(["criterion_result", "raw_source_reference"]);

function fixtureColumnType(column) {
  if (jsonColumns.has(column)) return "jsonb";
  if (column === "score") return "integer";
  if (textIdentityColumns.has(column)) return "text";
  if (column === "token" || column === "permission_key" || column === "role_key"
      || column === "source" || column === "status" || column === "source_item_type") return "text";
  if (column === "id" || column === "run_id" || column.endsWith("_id")) return "uuid";
  return "text";
}

export function buildSemanticSidecarFixtureSql() {
  return semanticAuditTables.map((table) => {
    const definitions = semanticAuditTableColumns[table]
      .map((column) => `${column} ${fixtureColumnType(column)}`)
      .join(", ");
    const addColumns = semanticAuditTableColumns[table]
      .map((column) => `alter table ${table} add column if not exists ${column} ${fixtureColumnType(column)};`)
      .join("\n");
    return `create table if not exists ${table} (${definitions});\n${addColumns}\nalter table ${table} enable row level security;\ngrant select on ${table} to reflab_prod_preflight_ro;`;
  }).join("\n");
}

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function scalar(output) {
  const lines = String(output).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error("Unexpected local PostgreSQL scalar output.");
  return lines[0];
}

export function parsePostgresFailure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(
    /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/,
  );
  return {
    sqlstate: diagnostic?.[1] ?? "UNKNOWN",
    message: diagnostic?.[2] ?? "Local Phase 2B SQL failed.",
  };
}

export function requireExpectedPostgresFailure(error, { expectedSqlstate, expectedMessage, stage }) {
  const diagnostic = parsePostgresFailure(error);
  if (diagnostic.sqlstate !== expectedSqlstate || !diagnostic.message.includes(expectedMessage)) {
    throw new Error(`Unexpected Phase 2B SQL diagnostic during ${stage}.`);
  }
  return {
    stage,
    sqlstate: diagnostic.sqlstate,
    message: expectedMessage,
    status: "PASS",
  };
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id, ''), ',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text, ''), ',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id, ',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id, ',' order by user_id) from public.user_profiles)
  ));`;
}

function validCommunicationPayload() {
  return JSON.stringify({
    sport_type: "football_11",
    activity_type: "english_communication_feedback",
    clip_id: "d3f00000-0000-4000-8000-000000000003",
    mode: "ifab_english",
    answer_text: "The referee should stop play and award a direct free kick.",
    feedback_language: "en",
    has_voice_recording: false,
    oral_evaluable: false,
    feedback: "Synthetic canonical feedback for a local rehearsal.",
    scores: { terminology: 8, clarity: 7, precision: 9, structure: 8, vocabulary: 7, grammar: 8, global: 8 },
    global_label: "solid",
    model_answer: "Stop play and award a direct free kick.",
    human_review_reason: null,
    confidence: { label: "high", score: 0.95, reasons: [], requiresHumanReview: false },
    evidence: [],
    coach_run_id: "96000000-0000-4000-8000-000000000010",
  }).replaceAll("'", "''");
}

export async function runPhase2bPostgres() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-phase2b-"));
  const dataDirectory = join(temporaryRoot, "data");
  const logPath = join(temporaryRoot, "postgres.log");
  const port = await reservePort();
  const environment = {
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: process.env.PATH,
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGSSLMODE: "disable",
  };
  let serverStarted = false;

  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {
      env: { ...environment, ...options.environment },
      encoding: "utf8",
      input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  function sql(database, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
      environment: { PGDATABASE: database },
      input: statement,
    });
  }
  function apply(database, migration) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", resolve(migrationsDirectory, migration)], {
      environment: { PGDATABASE: database },
    });
  }
  function applySql(database, migrationSql) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      environment: { PGDATABASE: database },
      input: migrationSql,
    });
  }
  function createDatabase(name) {
    run(binaries.createdb, [name]);
    sql(name, "create schema extensions; create extension pgcrypto with schema extensions;");
  }
  function dropDatabase(name) {
    try {
      run(binaries.dropdb, ["--if-exists", name]);
    } finally {
      sql("postgres", "drop role if exists reflab_preflight_audit_owner;");
    }
  }
  function setupThroughSidecar(name) {
    sql(name, fixture);
    for (const migration of phase1Migrations) apply(name, migration);
    sql(name, buildSemanticSidecarFixtureSql());
    apply(name, sidecarMigration);
  }
  function setupThroughPrerequisiteEntry(name) {
    setupThroughSidecar(name);
    apply(name, phase2bMigrations[0]);
    apply(name, phase2bMigrations[1]);
  }
  function prerequisiteSnapshot(name) {
    return scalar(sql(name, `select pg_catalog.jsonb_build_object(
      'attempts_count', (select pg_catalog.count(*) from public.attempts),
      'attempts_values', (select pg_catalog.md5(pg_catalog.string_agg(id::text || ':' || coalesce(score::text,'NULL') || ':' || coalesce(created_at::text,'NULL'), ',' order by id)) from public.attempts),
      'exam_results_count', (select pg_catalog.count(*) from public.exam_results),
      'notification_events_count', (select pg_catalog.count(*) from public.notification_events),
      'clips_count', (select pg_catalog.count(*) from public.clips),
      'clips_values', (select pg_catalog.md5(pg_catalog.string_agg(id::text || ':' || coalesce(is_active::text,'NULL'), ',' order by id)) from public.clips),
      'created_at_shape', (select pg_catalog.jsonb_build_array(pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.attempts'::pg_catalog.regclass and a.attname='created_at' and a.attnum>0 and not a.attisdropped),
      'score_shape', (select pg_catalog.jsonb_build_array(pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.attempts'::pg_catalog.regclass and a.attname='score' and a.attnum>0 and not a.attisdropped),
      'status_shape', (select pg_catalog.jsonb_build_array(pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid,false)) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.clips'::pg_catalog.regclass and a.attname='status' and a.attnum>0 and not a.attisdropped),
      'leaderboard_kind', (select relkind from pg_catalog.pg_class where oid=pg_catalog.to_regclass('public.leaderboard')),
      'leaderboard_definition', case when pg_catalog.to_regclass('public.leaderboard') is null then null else pg_catalog.pg_get_viewdef('public.leaderboard'::pg_catalog.regclass,true) end,
      'leaderboard_acl', (select relacl::text from pg_catalog.pg_class where oid=pg_catalog.to_regclass('public.leaderboard')),
      'created_indexes', pg_catalog.jsonb_build_array(pg_catalog.to_regclass('public.attempts_institution_sport_created_idx') is not null,pg_catalog.to_regclass('public.attempts_user_sport_created_idx') is not null),
      'sidecar', pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')),
      'providers', pg_catalog.jsonb_build_array(pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is not null,pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is not null,pg_catalog.to_regprocedure('public.submit_canonical_training_attempt(text,uuid,jsonb,integer)') is not null,pg_catalog.to_regprocedure('public.submit_canonical_communication_feedback(text,uuid,text,jsonb)') is not null),
      'ledger', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(phase_key,phase_order) order by phase_order) from reflab_meta.production_adoption_state),
      'marker_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)
    )::text;`));
  }
  function expectPrerequisiteFailure(name, expectedMessage) {
    const before = prerequisiteSnapshot(name);
    try {
      apply(name, phase2bMigrations[2]);
    } catch (error) {
      const diagnostic = requireExpectedPostgresFailure(error, {
        expectedSqlstate: "55000",
        expectedMessage,
        stage: `pre-Phase2B prerequisite negative ${name}`,
      });
      const after = prerequisiteSnapshot(name);
      if (before !== after) throw new Error(`Pre-Phase2B prerequisite rollback mismatch for ${name}.`);
      return { status: "PASS", sqlstate: diagnostic.sqlstate, rollback: "PASS" };
    }
    throw new Error(`Pre-Phase2B prerequisite negative did not abort for ${name}.`);
  }
  function expectPrerequisiteSqlFailure(name, migrationSql, expectedMessage) {
    const before = prerequisiteSnapshot(name);
    try {
      applySql(name, migrationSql);
    } catch (error) {
      const diagnostic = requireExpectedPostgresFailure(error, {
        expectedSqlstate: "55000",
        expectedMessage,
        stage: `pre-Phase2B prerequisite injected negative ${name}`,
      });
      const after = prerequisiteSnapshot(name);
      if (before !== after) throw new Error(`Pre-Phase2B injected rollback mismatch for ${name}.`);
      return { status: "PASS", sqlstate: diagnostic.sqlstate, rollback: "PASS" };
    }
    throw new Error(`Pre-Phase2B injected negative did not abort for ${name}.`);
  }
  function holdAttemptsLock(name) {
    return new Promise((resolveLock, rejectLock) => {
      const child = spawn(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
        env: { ...environment, PGDATABASE: name },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => rejectLock(new Error("Timed out acquiring the local rehearsal lock.")), 10_000);
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.includes("LOCKED")) {
          clearTimeout(timer);
          resolveLock(child);
        }
      });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => {
        clearTimeout(timer);
        rejectLock(error);
      });
      child.once("close", (code) => {
        if (!stdout.includes("LOCKED")) {
          clearTimeout(timer);
          rejectLock(new Error(`Local lock holder exited before lock acquisition (${code}; ${stderr.length} diagnostic bytes).`));
        }
      });
      child.stdin.end("begin; lock table public.attempts in access exclusive mode; select 'LOCKED'; select pg_catalog.pg_sleep(30); rollback;\n");
    });
  }
  async function expectLockTimeoutRollback(name) {
    const before = prerequisiteSnapshot(name);
    const lockHolder = await holdAttemptsLock(name);
    let diagnostic;
    try {
      apply(name, phase2bMigrations[2]);
      throw new Error("Pre-Phase2B prerequisite unexpectedly bypassed lock_timeout.");
    } catch (error) {
      diagnostic = requireExpectedPostgresFailure(error, {
        expectedSqlstate: "55P03",
        expectedMessage: "lock timeout",
        stage: "pre-Phase2B prerequisite lock timeout",
      });
    } finally {
      lockHolder.kill();
      await new Promise((resolveClose) => lockHolder.once("close", resolveClose));
    }
    const after = prerequisiteSnapshot(name);
    if (before !== after) throw new Error("Pre-Phase2B prerequisite lock-timeout rollback mismatch.");
    return { status: "PASS", sqlstate: diagnostic.sqlstate, rollback: "PASS" };
  }
  function expectMigrationFailure(name, migration, expectedMessage) {
    try {
      apply(name, migration);
    } catch (error) {
      const diagnostic = requireExpectedPostgresFailure(error, {
        expectedSqlstate: "55000",
        expectedMessage,
        stage: `negative migration ${migration}`,
      });
      const rollback = scalar(sql(name, `select
        pg_catalog.to_regprocedure('reflab_private.canonical_jsonb_text(jsonb)') is null
        and pg_catalog.to_regprocedure('public.admin_set_canonical_user_plan(text,text,text,text)') is null
        and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 3;`));
      if (rollback !== "t") throw new Error(`Phase 2B negative rehearsal left partial changes for ${expectedMessage}.`);
      return { status: "PASS", sqlstate: diagnostic.sqlstate, rollback: "PASS" };
    }
    throw new Error(`Phase 2B negative rehearsal did not abort for ${expectedMessage}.`);
  }
  function expectRpcClosed(name, signature, callSql, expectedSqlstate) {
    const result = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: name },
      input: `set role service_role;\n${callSql}`,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status === 0) throw new Error(`Disabled RPC unexpectedly executed: ${signature}.`);
    const diagnostic = requireExpectedPostgresFailure(result, {
      expectedSqlstate,
      expectedMessage: "Canonical",
      stage: `disabled RPC ${signature}`,
    });
    return { signature, sqlstate: diagnostic.sqlstate, status: "PASS" };
  }

  const databases = [
    "phase2b_positive",
    "phase2b_missing_dependency",
    "phase2b_incompatible_column",
    "phase2b_marker",
    "phase2b_development_rpc",
    "phase2b_unsafe_role",
    "phase2b_duplicate_provider",
  ];
  const created = [];

  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", dataDirectory]);
    run(binaries.pgCtl, ["start", "-D", dataDirectory, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    serverStarted = true;
    sql("postgres", `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_prod_preflight_ro login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    `);

    const positive = databases[0];
    createDatabase(positive);
    created.push(positive);
    sql(positive, fixture);
    const beforeFingerprint = scalar(sql(positive, historicalFingerprintSql()));
    for (const migration of phase1Migrations) apply(positive, migration);
    sql(positive, buildSemanticSidecarFixtureSql());
    apply(positive, sidecarMigration);
    for (const migration of phase2bMigrations.slice(0, 3)) apply(positive, migration);
    const phase2bEntry = JSON.parse(scalar(sql(positive, `select pg_catalog.jsonb_build_object(
      'digest_exact', pg_catalog.to_regprocedure('extensions.digest(text,text)') is not null,
      'duplicate_key_groups', (select pg_catalog.count(*) from (select user_id,submission_id from public.attempts where exam_result_id is null and submission_id is not null group by user_id,submission_id having pg_catalog.count(*)>1) duplicate_group),
      'provider_collisions', (select pg_catalog.count(*) from unnest(array['public.submit_canonical_training_attempt(text,uuid,jsonb,integer)','public.submit_canonical_communication_feedback(text,uuid,text,jsonb)']) signature where pg_catalog.to_regprocedure(signature) is not null),
      'created_at_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.attempts'::pg_catalog.regclass and attname='created_at' and attnum>0 and not attisdropped),
      'created_at_not_null', (select attnotnull from pg_catalog.pg_attribute where attrelid='public.attempts'::pg_catalog.regclass and attname='created_at' and attnum>0 and not attisdropped),
      'score_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.attempts'::pg_catalog.regclass and attname='score' and attnum>0 and not attisdropped),
      'clips_status_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.clips'::pg_catalog.regclass and attname='status' and attnum>0 and not attisdropped),
      'clips_status_not_null', (select attnotnull from pg_catalog.pg_attribute where attrelid='public.clips'::pg_catalog.regclass and attname='status' and attnum>0 and not attisdropped),
      'published_clips', (select pg_catalog.count(*) from public.clips where status='published')
    )::text;`)));
    if (!phase2bEntry.digest_exact || phase2bEntry.duplicate_key_groups !== 0
        || phase2bEntry.provider_collisions !== 0
        || phase2bEntry.created_at_type !== "timestamp with time zone"
        || !phase2bEntry.created_at_not_null || phase2bEntry.score_type !== "numeric(7,2)"
        || phase2bEntry.clips_status_type !== "text" || !phase2bEntry.clips_status_not_null
        || phase2bEntry.published_clips !== 30) {
      throw new Error("Pre-Phase2B entry recheck failed before later providers.");
    }
    sql(positive, `set role legacy_runtime;
      insert into public.attempts (id, user_id, exam_result_id, sport_type)
      values ('11000000-0000-4000-8000-000000000001', 'user_synthetic_001', '20000000-0000-4000-8000-000000000001', 'football_11');`);
    for (const migration of phase2bMigrations.slice(3)) apply(positive, migration);
    sql(positive, `set role legacy_runtime;
      insert into public.attempts (id, user_id, exam_result_id, sport_type)
      values ('11000000-0000-4000-8000-000000000002', 'user_synthetic_002', '20000000-0000-4000-8000-000000000002', 'football_11');`);
    const afterFingerprint = scalar(sql(positive, historicalFingerprintSql()));
    if (beforeFingerprint !== afterFingerprint) throw new Error("Phase 2B changed historical synthetic values.");

    const structuralContract = JSON.parse(scalar(sql(positive, `select pg_catalog.jsonb_build_object(
      'attempts', (select pg_catalog.count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results', (select pg_catalog.count(*) from public.exam_results),
      'notifications', (select pg_catalog.count(*) from public.notification_events),
      'legacy_writes', (select pg_catalog.count(*) from public.attempts where id::text like '11000000-%'),
      'legacy_write_null_sources', (select pg_catalog.count(*) from public.attempts where id::text like '11000000-%' and source_item_type is null and source_item_id is null and source_occurrence_id is null),
      'exam_null_sessions', (select pg_catalog.count(*) from public.exam_results where exam_session_id is null and payload_hash is null),
      'notification_null_keys', (select pg_catalog.count(*) from public.notification_events where deduplication_key is null),
      'exam_sessions', (select pg_catalog.count(*) from public.referee_exam_sessions),
      'schema_marker_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'identity_links_absent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'payload_hash_provider_present', exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.attempts'::regclass and attname = 'canonical_payload_hash' and attnum > 0 and not attisdropped)
      ,'created_at_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.attempts'::regclass and attname='created_at' and attnum>0 and not attisdropped)
      ,'score_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.attempts'::regclass and attname='score' and attnum>0 and not attisdropped)
      ,'published_clips', (select pg_catalog.count(*) from public.clips where status='published')
      ,'leaderboard_best_score_type', (select pg_catalog.format_type(atttypid,atttypmod) from pg_catalog.pg_attribute where attrelid='public.leaderboard'::regclass and attname='best_score' and attnum>0 and not attisdropped)
    )::text;`)));
    if (structuralContract.attempts !== PHASE2B_HISTORICAL_COUNTS.attempts
        || structuralContract.exam_results !== PHASE2B_HISTORICAL_COUNTS.examResults
        || structuralContract.notifications !== PHASE2B_HISTORICAL_COUNTS.notificationEvents
        || structuralContract.legacy_writes !== 2
        || structuralContract.legacy_write_null_sources !== 2
        || structuralContract.exam_null_sessions !== PHASE2B_HISTORICAL_COUNTS.examResults
        || structuralContract.notification_null_keys !== PHASE2B_HISTORICAL_COUNTS.notificationEvents
        || structuralContract.exam_sessions !== 0
        || structuralContract.schema_marker_rows !== 0
        || structuralContract.ledger_rows !== 4
        || !structuralContract.identity_links_absent
        || !structuralContract.payload_hash_provider_present
        || structuralContract.created_at_type !== "timestamp with time zone"
        || structuralContract.score_type !== "numeric(7,2)"
        || structuralContract.published_clips !== 30
        || structuralContract.leaderboard_best_score_type !== "numeric") {
      throw new Error("Phase 2B structural or historical compatibility contract failed.");
    }

    const rpcFailures = [
      expectRpcClosed(positive, PHASE2B_RUNTIME_RPCS[0], "select public.admin_set_canonical_user_plan('user_synthetic_001','user_synthetic_002','pro',null);", "55000"),
      expectRpcClosed(positive, PHASE2B_RUNTIME_RPCS[1], "select public.admin_set_canonical_global_role('user_synthetic_001','user_synthetic_002','referee',null);", "55000"),
      expectRpcClosed(positive, PHASE2B_RUNTIME_RPCS[2], `select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000001','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`, "55000"),
      expectRpcClosed(positive, PHASE2B_RUNTIME_RPCS[3], `select public.submit_canonical_communication_feedback('user_synthetic_001','97000000-0000-4000-8000-000000000002',repeat('a',64),'${validCommunicationPayload()}'::jsonb);`, "P0002"),
    ];

    const securityContract = scalar(sql(positive, `select
      not exists (select 1 from pg_catalog.pg_roles where rolname in ('reflab_rls_owner','reflab_preflight_audit_owner') and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls))
      and not exists (select 1 from pg_catalog.pg_class relation join pg_catalog.pg_roles owner on owner.oid = relation.relowner where owner.rolname in ('reflab_rls_owner','reflab_preflight_audit_owner') and relation.relkind in ('r','p'))
      and not exists (select 1 from unnest(array[${PHASE2B_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null)
      and not exists (select 1 from information_schema.role_table_grants where grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER') and table_schema in ('reflab_meta','reflab_private'));
    `));
    if (securityContract !== "t") throw new Error("Phase 2B security contract failed.");

    dropDatabase(positive);
    created.pop();

    const negativeCases = [
      {
        database: databases[1],
        setup: "alter table public.clips rename to clips_missing;",
        expected: "Phase 2B dependency is missing",
      },
      {
        database: databases[2],
        setup: "alter table public.attempts alter column source_item_id type integer using null::integer;",
        expected: "Phase 2B dependency column is missing or incompatible",
      },
      {
        database: databases[3],
        setup: `insert into reflab_meta.reflab_schema_state (baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values ('premature',repeat('a',64),repeat('b',64),'production','local',1,'installed');`,
        expected: "Reviewed disabled Production adoption state is required",
      },
      {
        database: databases[4],
        setup: "create function public.resolve_development_clerk_identity(text) returns text language sql as 'select null::text';",
        expected: "Development identity infrastructure is forbidden",
      },
      {
        database: databases[5],
        setup: "alter role reflab_rls_owner login;",
        expected: "Canonical RLS owner is missing or unsafe",
      },
      {
        database: databases[6],
        setup: "alter table public.attempts add column canonical_payload_hash text;",
        expected: "duplicate provider conflict",
      },
    ];
    const negativeResults = {};
    for (const testCase of negativeCases) {
      createDatabase(testCase.database);
      created.push(testCase.database);
      setupThroughSidecar(testCase.database);
      sql(testCase.database, testCase.setup);
      negativeResults[testCase.database] = expectMigrationFailure(
        testCase.database,
        phase2bMigrations[0],
        testCase.expected,
      );
      if (testCase.database === databases[5]) sql(testCase.database, "alter role reflab_rls_owner nologin;");
      dropDatabase(testCase.database);
      created.pop();
    }

    const prerequisiteNegativeCases = [
      ["created_at_type", "alter table public.attempts alter column created_at type timestamptz using created_at at time zone 'UTC';", "Historical attempts.created_at contract mismatch"],
      ["created_at_null", "update public.attempts set created_at=null where id='10000000-0000-4000-8000-000000000001';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["score_wrong_type", `drop view public.leaderboard; alter table public.attempts alter column score type bigint using score::bigint; create view public.leaderboard as select user_id,count(*) attempts,round(avg(score)) avg_score,max(score) best_score,sum(case when var_review then 1 else 0 end) var_yes from public.attempts group by user_id order by round(avg(score)) desc,count(*) desc; alter view public.leaderboard owner to postgres; revoke all on table public.leaderboard from public,anon,authenticated,service_role; grant select on table public.leaderboard to reflab_prod_preflight_ro;`, "Historical attempts.score contract mismatch"],
      ["score_out_of_range", "update public.attempts set score=100000 where id='10000000-0000-4000-8000-000000000001';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["leaderboard_definition", "create or replace view public.leaderboard as select user_id,count(*) attempts,round(avg(score)) avg_score,max(score) best_score,sum(case when var_review then 1 else 0 end) var_yes from public.attempts group by user_id;", "Leaderboard definition fingerprint mismatch"],
      ["leaderboard_columns", "alter view public.leaderboard rename column best_score to best_score_drift;", "Leaderboard definition fingerprint mismatch"],
      ["leaderboard_upstream", `create table public.leaderboard_upstream_drift(flag integer); drop view public.leaderboard; create view public.leaderboard as select attempt.user_id,count(*) attempts,round(avg(attempt.score)) avg_score,max(attempt.score) best_score,sum(case when attempt.var_review then 1 else 0 end) var_yes from public.attempts attempt cross join public.leaderboard_upstream_drift drift group by attempt.user_id order by round(avg(attempt.score)) desc,count(*) desc; alter view public.leaderboard owner to postgres; revoke all on table public.leaderboard from public,anon,authenticated,service_role; grant select on table public.leaderboard to reflab_prod_preflight_ro;`, "Leaderboard definition fingerprint mismatch"],
      ["leaderboard_drop_failure", "create function public.block_leaderboard_drop() returns event_trigger language plpgsql as $$begin raise exception 'forced leaderboard drop failure' using errcode='55000'; end$$; create event trigger block_leaderboard_drop on ddl_command_start when tag in ('DROP VIEW') execute function public.block_leaderboard_drop();", "forced leaderboard drop failure"],
      ["score_alter_failure", "create function public.block_score_alter() returns event_trigger language plpgsql as $$begin raise exception 'forced score alter failure' using errcode='55000'; end$$; create event trigger block_score_alter on ddl_command_start when tag in ('ALTER TABLE') execute function public.block_score_alter();", "forced score alter failure"],
      ["clips_status_present", "alter table public.clips add column status text;", "Historical clips contract mismatch"],
      ["clip_count", "delete from public.clips where id='d4f00000-0000-4000-8000-000000000029';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["inactive_clip", "update public.clips set is_active=false where id='d4f00000-0000-4000-8000-000000000001';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["provider_present", "alter table public.attempts add column canonical_payload_hash text;", "Pre-Phase2B provider or adoption state mismatch"],
      ["sidecar_absent", "drop schema reflab_audit cascade;", "Phase 2A semantic sidecar is not exact"],
      ["marker_present", "insert into reflab_meta.reflab_schema_state (baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values ('premature',repeat('a',64),repeat('b',64),'production','local',1,'installed');", "Pre-Phase2B provider or adoption state mismatch"],
      ["attempt_count", "insert into public.attempts (id,user_id,sport_type) values ('12000000-0000-4000-8000-000000000001','user_synthetic_001','football_11');", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["exam_count", "delete from public.exam_results where id='20000000-0000-4000-8000-000000000006';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["notification_count", "delete from public.notification_events where id='30000000-0000-4000-8000-000000000060';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["created_at_default", "alter table public.attempts alter column created_at set default statement_timestamp();", "Historical attempts.created_at contract mismatch"],
      ["score_default", "alter table public.attempts alter column score set default 0;", "Historical attempts.score contract mismatch"],
      ["score_not_null", "update public.attempts set score=0 where score is null; alter table public.attempts alter column score set not null;", "Historical attempts.score contract mismatch"],
      ["is_active_default", "alter table public.clips alter column is_active set default false;", "Historical clips contract mismatch"],
      ["is_active_nullable", "alter table public.clips alter column is_active drop not null;", "Historical clips contract mismatch"],
      ["leaderboard_acl", "grant select on public.leaderboard to anon;", "Leaderboard ACL fingerprint mismatch"],
      ["leaderboard_option", "alter view public.leaderboard set (security_barrier=true);", "Leaderboard relation/options contract mismatch"],
      ["leaderboard_comment", "comment on view public.leaderboard is 'unexpected';", "Leaderboard relation/options contract mismatch"],
      ["leaderboard_downstream", "create view public.leaderboard_downstream as select * from public.leaderboard;", "Leaderboard gained downstream dependencies"],
      ["first_created_index", "drop index public.attempts_institution_sport_created_idx;", "Created-at dependency index contract mismatch"],
      ["second_created_index", "drop index public.attempts_user_sport_created_idx;", "Created-at dependency index contract mismatch"],
      ["ledger_drift", "insert into reflab_meta.production_adoption_state (phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash) values (4,'canonical_objects','psychology_notification_prerequisites','negative-rehearsal',repeat('a',64),repeat('b',64));", "Pre-Phase2B provider or adoption state mismatch"],
      ["admin_provider_missing", "drop function public.admin_set_canonical_user_plan(text,text,text,text);", "Pre-Phase2B provider or adoption state mismatch"],
      ["json_helper_missing", "drop function reflab_private.canonical_jsonb_text(jsonb);", "Pre-Phase2B provider or adoption state mismatch"],
      ["training_provider_present", "create function public.submit_canonical_training_attempt(text,uuid,jsonb,integer) returns uuid language sql as 'select null::uuid';", "Pre-Phase2B provider or adoption state mismatch"],
      ["communication_provider_present", "create function public.submit_canonical_communication_feedback(text,uuid,text,jsonb) returns uuid language sql as 'select null::uuid';", "Pre-Phase2B provider or adoption state mismatch"],
      ["legacy_scoring_drift", "update public.attempts set criterion_result='{\"scoring_version\":\"v1\"}'::jsonb where id='10000000-0000-4000-8000-000000000001';", "Pre-Phase2B adoption aggregate contract mismatch"],
      ["leaderboard_recreation_failure", `create function public.block_leaderboard_recreation() returns event_trigger language plpgsql as $$begin if tg_tag='CREATE VIEW' then raise exception 'forced leaderboard recreation failure' using errcode='55000'; end if; end$$; create event trigger block_leaderboard_recreation on ddl_command_start execute function public.block_leaderboard_recreation();`, "forced leaderboard recreation failure"],
    ];
    const prerequisiteNegativeResults = {};
    for (const [id, setup, expected] of prerequisiteNegativeCases) {
      const database = `pre2b_${id}`;
      createDatabase(database);
      created.push(database);
      setupThroughPrerequisiteEntry(database);
      sql(database, setup);
      prerequisiteNegativeResults[id] = expectPrerequisiteFailure(database, expected);
      dropDatabase(database);
      created.pop();
    }
    const lockTimeoutDatabase = "pre2b_lock_timeout";
    createDatabase(lockTimeoutDatabase);
    created.push(lockTimeoutDatabase);
    setupThroughPrerequisiteEntry(lockTimeoutDatabase);
    prerequisiteNegativeResults.lock_timeout = await expectLockTimeoutRollback(lockTimeoutDatabase);
    dropDatabase(lockTimeoutDatabase);
    created.pop();

    const injectedCases = [
      ["recreated_column_contract", prerequisiteMigrationSql.replace(
        "max(score) as best_score", "max(score)::integer as best_score",
      ), "Leaderboard recreation postcondition mismatch"],
      ["postcondition_mismatch", prerequisiteMigrationSql.replace(
        "do $postflight$", "alter view public.leaderboard set (security_barrier=true);\n\ndo $postflight$",
      ), "Leaderboard recreation postcondition mismatch"],
    ];
    for (const [id, migrationSql, expected] of injectedCases) {
      const database = `pre2b_${id}`;
      createDatabase(database);
      created.push(database);
      setupThroughPrerequisiteEntry(database);
      prerequisiteNegativeResults[id] = expectPrerequisiteSqlFailure(database, migrationSql, expected);
      dropDatabase(database);
      created.pop();
    }

    return {
      localOnly: true,
      localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      migrationOrder: [...phase1Migrations, sidecarMigration, ...phase2bMigrations],
      historicalCounts: structuralContract,
      prePhase2bEntry: { ...phase2bEntry, classification: "EXACT" },
      rpcFailClosed: rpcFailures,
      securityContract: "PASS",
      negativeResults,
      prerequisiteNegativeResults,
      prerequisiteNegativeCount: Object.keys(prerequisiteNegativeResults).length,
      prerequisiteRollbackCount: Object.values(prerequisiteNegativeResults).filter((result) => result.rollback === "PASS").length,
      cleanup: "PASS",
    };
  } finally {
    for (const database of [...created].reverse()) {
      try {
        dropDatabase(database);
      } catch {
        // The isolated cluster is removed below.
      }
    }
    if (serverStarted) {
      try {
        run(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], { quiet: true });
      } catch {
        // The isolated data directory is removed below.
      }
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase2bPostgres())}\n`);
}
