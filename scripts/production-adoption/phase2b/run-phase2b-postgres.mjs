import { execFileSync, spawnSync } from "node:child_process";
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
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
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
  "202608130001_canonical_training_attempts.sql",
  "202608150001_canonical_communication_feedback.sql",
  "202608310006_production_adoption_canonical_runtime_installed.sql",
];

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
    for (const migration of phase1Migrations.slice(0, 2)) apply(positive, migration);
    sql(positive, `set role legacy_runtime;
      insert into public.attempts (id, user_id, exam_result_id, sport_type)
      values ('11000000-0000-4000-8000-000000000001', 'user_synthetic_001', '20000000-0000-4000-8000-000000000001', 'football_11');`);
    apply(positive, phase1Migrations[2]);
    sql(positive, buildSemanticSidecarFixtureSql());
    apply(positive, sidecarMigration);
    for (const migration of phase2bMigrations) apply(positive, migration);
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
        || !structuralContract.payload_hash_provider_present) {
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

    return {
      localOnly: true,
      localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      migrationOrder: [...phase1Migrations, sidecarMigration, ...phase2bMigrations],
      historicalCounts: structuralContract,
      rpcFailClosed: rpcFailures,
      securityContract: "PASS",
      negativeResults,
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
