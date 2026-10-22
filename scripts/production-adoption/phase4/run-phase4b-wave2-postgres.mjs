import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSemanticSidecarFixtureSql } from "../phase2b/run-phase2b-postgres.mjs";
import { PHASE3_DEVELOPMENT_RPCS, PHASE3_MIGRATIONS } from "../phase3/phase3-security-contract.mjs";
import { buildWave1FixtureDependencySql } from "./phase4b-wave1-fixture-contract.mjs";
import {
  PHASE4B_WAVE1_MIGRATION,
  PHASE4B_WAVE1_PROVIDER,
} from "./phase4b-wave1-contract.mjs";
import {
  PHASE4B_WAVE2_MIGRATION,
  PHASE4B_WAVE2_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE2_PROVIDER,
  PHASE4B_WAVE2_SAFE_INDEXES,
} from "./phase4b-wave2-contract.mjs";
import { buildWave2FixtureSql } from "./phase4b-wave2-fixture-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = Object.freeze({
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  dropdb: join(postgresBin, "dropdb.exe"),
  pgIsReady: join(postgresBin, "pg_isready.exe"),
  psql: join(postgresBin, "psql.exe"),
});
const baseline = readFileSync(resolve(migrationsDirectory, "202607270000_reflab_canonical_baseline.sql"), "utf8").replaceAll("\r\n", "\n");
const phase2bFixture = readFileSync(resolve(root, "scripts", "production-adoption", "phase2b", "phase2b-production-fixture.sql"), "utf8");
const phase3Fixture = readFileSync(resolve(root, "scripts", "production-adoption", "phase3", "phase3-production-fixture.sql"), "utf8");
const phase1Migrations = Object.freeze([
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
]);
const phase2bMigrations = Object.freeze([
  "202608310005_production_adoption_canonical_runtime_prerequisites.sql",
  "202608110001_canonical_admin_user_access.sql",
  "202608130001_canonical_training_attempts.sql",
  "202608150001_canonical_communication_feedback.sql",
  "202608310006_production_adoption_canonical_runtime_installed.sql",
]);
const phase2aMigration = "202608310004_production_adoption_semantic_audit.sql";

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
  if (lines.length !== 1) throw new Error("Unexpected local Wave 2 scalar output.");
  return lines[0];
}

export function parsePhase4BWave2Failure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: diagnostic?.[1] ?? "UNKNOWN", message: diagnostic?.[2] ?? "Local Wave 2 SQL failed." };
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id,''),',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text,''),',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id,',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id,',' order by user_id) from public.user_profiles)
  ));`;
}

function indexDefinition(index, { name = index.name, keys = index.keys, suffix = "" } = {}) {
  const columns = keys.map((key) => `${key.column}${key.descending ? " desc" : ""}`).join(", ");
  return `create index ${name} on ${index.table} using btree (${columns})${suffix};`;
}

function target(name) {
  const index = PHASE4B_WAVE2_SAFE_INDEXES.find((candidate) => candidate.name === name);
  if (!index) throw new Error(`Unknown Wave 2 test index: ${name}`);
  return index;
}

function indexIdentity(index, name = index.name) {
  return `${index.schema}.${name}`;
}

const roleIndex = target("user_global_roles_role_idx");
const subscriptionIndex = target("user_subscriptions_plan_status_idx");

export function negativeInjectionSql(scenario) {
  if (scenario === "wrong_key_order") {
    return indexDefinition(subscriptionIndex, { keys: [subscriptionIndex.keys[1], subscriptionIndex.keys[0], subscriptionIndex.keys[2]] });
  }
  if (scenario === "wrong_predicate") return indexDefinition(roleIndex, { suffix: " where role_key is not null" });
  if (scenario === "wrong_access_method") return `create index ${roleIndex.name} on ${roleIndex.table} using hash (role_key);`;
  if (scenario === "wrong_include") return `create index ${roleIndex.name} on ${roleIndex.table} using btree (role_key) include (user_id);`;
  if (scenario === "wrong_opclass") return `create index ${roleIndex.name} on ${roleIndex.table} using btree (role_key text_pattern_ops);`;
  if (scenario === "duplicate_equivalent_index") return indexDefinition(roleIndex, { name: "phase4b_equivalent_user_global_roles_role_idx" });
  if (scenario === "invalid_index") {
    return `${indexDefinition(roleIndex)}
      update pg_catalog.pg_index set indisvalid=false where indexrelid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  }
  if (scenario === "missing_prerequisite") return "alter table public.clips drop column mode;";
  if (scenario === "provider_conflict") {
    return `${indexDefinition(roleIndex)} comment on index ${indexIdentity(roleIndex)} is 'reflab:production_adoption_provider=unexpected';`;
  }
  throw new Error(`Unknown Wave 2 negative injection: ${scenario}`);
}

export function negativeMutationAssertionSql(scenario) {
  if (scenario === "wrong_key_order") {
    return `select (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
      from pg_catalog.pg_index catalog_index
      cross join lateral pg_catalog.unnest(catalog_index.indkey::smallint[]) with ordinality key_position(attnum,ordinality)
      join pg_catalog.pg_attribute attribute on attribute.attrelid=catalog_index.indrelid and attribute.attnum=key_position.attnum
      where catalog_index.indexrelid=pg_catalog.to_regclass('${indexIdentity(subscriptionIndex)}'))
      = array['status','plan_key','ends_at']::text[];`;
  }
  if (scenario === "wrong_predicate") return `select indpred is not null from pg_catalog.pg_index where indexrelid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  if (scenario === "wrong_access_method") return `select access_method.amname='hash' from pg_catalog.pg_class index_relation join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam where index_relation.oid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  if (scenario === "wrong_include") return `select indnatts=2 and indnkeyatts=1 from pg_catalog.pg_index where indexrelid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  if (scenario === "wrong_opclass") return `select opclass.opcname='text_pattern_ops' from pg_catalog.pg_index catalog_index cross join lateral pg_catalog.unnest(catalog_index.indclass::oid[]) class_oid join pg_catalog.pg_opclass opclass on opclass.oid=class_oid where catalog_index.indexrelid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  if (scenario === "duplicate_equivalent_index") return `select pg_catalog.to_regclass('${indexIdentity(roleIndex)}') is null and pg_catalog.to_regclass('${indexIdentity(roleIndex, "phase4b_equivalent_user_global_roles_role_idx")}') is not null;`;
  if (scenario === "invalid_index") return `select not indisvalid and indisready from pg_catalog.pg_index where indexrelid=pg_catalog.to_regclass('${indexIdentity(roleIndex)}');`;
  if (scenario === "missing_prerequisite") return "select not exists(select 1 from pg_catalog.pg_attribute where attrelid='public.clips'::regclass and attname='mode' and attnum>0 and not attisdropped);";
  if (scenario === "provider_conflict") return `select pg_catalog.obj_description('${indexIdentity(roleIndex)}'::regclass,'pg_class')='reflab:production_adoption_provider=unexpected';`;
  throw new Error(`Unknown Wave 2 mutation assertion: ${scenario}`);
}

function expectedMessage(scenario) {
  if (scenario === "duplicate_equivalent_index") return "equivalent index already exists";
  if (scenario === "missing_prerequisite") return "prerequisite column is missing";
  if (scenario === "provider_conflict") return "provider conflict";
  return "named index contract drift";
}

async function runScenario(scenario) {
  const port = await reservePort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), `reflab-wave2-${scenario}-`));
  const dataDirectory = join(temporaryRoot, "data");
  const logPath = join(temporaryRoot, "postgres.log");
  const environment = Object.freeze({
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    PATH: process.env.PATH,
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGSSLMODE: "disable",
  });
  let serverStarted = false;
  let cleaned = false;

  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {
      env: { ...environment, ...options.environment },
      encoding: "utf8",
      input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    });
  }
  function sql(database, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-t", "-A"], {
      environment: { PGDATABASE: database }, input: statement,
    });
  }
  function apply(database, migration) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", resolve(migrationsDirectory, migration)], {
      environment: { PGDATABASE: database },
    });
  }
  function cleanup() {
    if (cleaned) return { serverStopped: true, portClosed: true, directoryRemoved: true };
    if (serverStarted) {
      run(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], { quiet: true });
      serverStarted = false;
    }
    const ready = spawnSync(binaries.pgIsReady, ["-h", "127.0.0.1", "-p", String(port), "-d", "postgres"], {
      env: environment, encoding: "utf8", windowsHide: true, maxBuffer: 1024 * 1024,
    });
    if (ready.status === 0) throw new Error("Wave 2 PostgreSQL process survived cleanup.");
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Wave 2 temporary directory survived cleanup.");
    cleaned = true;
    return { serverStopped: true, portClosed: true, directoryRemoved: true };
  }
  function setup(database) {
    sql(database, phase2bFixture);
    for (const migration of phase1Migrations) apply(database, migration);
    sql(database, buildSemanticSidecarFixtureSql());
    sql(database, buildWave2FixtureSql(baseline, PHASE4B_WAVE2_SAFE_INDEXES));
    sql(database, buildWave1FixtureDependencySql(baseline));
    apply(database, phase2aMigration);
    for (const migration of phase2bMigrations) apply(database, migration);
    sql(database, phase3Fixture);
    for (const migration of PHASE3_MIGRATIONS) apply(database, migration);
    apply(database, PHASE4B_WAVE1_MIGRATION);
  }

  const database = `wave2_${scenario}`;
  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", dataDirectory]);
    run(binaries.pgCtl, ["start", "-D", dataDirectory, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port} -c allow_system_table_mods=on`, "-w"], { quiet: true });
    serverStarted = true;
    sql("postgres", `create role anon nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_prod_preflight_ro login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;`);
    run(binaries.createdb, [database]);
    sql(database, "create schema extensions; create extension pgcrypto with schema extensions;");
    setup(database);
    const beforeFingerprint = scalar(sql(database, historicalFingerprintSql()));

    if (scenario !== "positive") {
      sql(database, negativeInjectionSql(scenario));
      if (scalar(sql(database, negativeMutationAssertionSql(scenario))) !== "t") {
        throw new Error(`HARNESS_SETUP_FAIL: ${scenario}`);
      }
      let failure;
      try { apply(database, PHASE4B_WAVE2_MIGRATION); } catch (error) { failure = parsePhase4BWave2Failure(error); }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.toLowerCase().includes(expectedMessage(scenario))) {
        throw new Error(`Unexpected sanitized Wave 2 negative result: ${scenario}`);
      }
      const partial = Number(scalar(sql(database, `select count(*) from pg_catalog.pg_class where pg_catalog.obj_description(oid,'pg_class')='${PHASE4B_WAVE2_PROVIDER}';`)));
      if (partial !== 0 || scalar(sql(database, historicalFingerprintSql())) !== beforeFingerprint) {
        throw new Error(`Wave 2 rollback contract failed: ${scenario}`);
      }
      return {
        scenario,
        localTarget: { host: environment.PGHOST, port: environment.PGPORT },
        mutationAssertion: "PASS",
        expectedSqlstate: "55000",
        observedSqlstate: failure.sqlstate,
        abort: "PASS",
        rollback: "PASS",
        historicalFingerprint: "PASS",
        cleanup: cleanup(),
      };
    }

    apply(database, PHASE4B_WAVE2_MIGRATION);
    apply(database, PHASE4B_WAVE2_MIGRATION);
    const installed = Number(scalar(sql(database, `select count(*) from pg_catalog.pg_class where relkind='i' and pg_catalog.obj_description(oid,'pg_class')='${PHASE4B_WAVE2_PROVIDER}';`)));
    const wave1 = Number(scalar(sql(database, `select count(*) from pg_catalog.pg_proc where pg_catalog.obj_description(oid,'pg_proc')='${PHASE4B_WAVE1_PROVIDER}';`)));
    const renamedReuse = scalar(sql(database, "select pg_catalog.to_regclass('public.clips_sport_topic_active_idx') is not null and pg_catalog.to_regclass('public.clips_sport_topic_idx') is null;"));
    if (installed !== 32 || wave1 !== 16 || renamedReuse !== "t") throw new Error("Positive Wave 2 index contract failed.");

    sql(database, `begin; set local role authenticated; set local request.jwt.claims='{"sub":"user_synthetic_001"}';
      insert into public.attempts(id,user_id,sport_type) values('13000000-0000-4000-8000-000000000001','user_synthetic_001','football_11');
      insert into public.exam_results(id,user_id) values('23000000-0000-4000-8000-000000000001','user_synthetic_001'); rollback;`);
    if (scalar(sql(database, historicalFingerprintSql())) !== beforeFingerprint) throw new Error("Positive Wave 2 changed historical values.");

    const rpc = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: database }, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      input: `set role service_role; select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000099','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`,
    });
    const rpcFailure = parsePhase4BWave2Failure(rpc);
    if (rpc.status === 0 || rpcFailure.sqlstate !== "55000") throw new Error("Canonical RPC did not remain fail-closed after Wave 2.");

    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'attempts',(select count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results',(select count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications',(select count(*) from public.notification_events),
      'schema_state_rows',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows',(select count(*) from reflab_meta.production_adoption_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'identity_links_absent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'development_absent',not exists(select 1 from pg_catalog.unnest(array[${PHASE3_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null)
    )::text;`)));
    if (state.attempts !== 37 || state.exam_results !== 6 || state.notifications !== 60 || state.schema_state_rows !== 0
        || state.ledger_rows !== 4 || state.ledger_phase !== "canonical_objects" || state.ledger_order !== 4
        || !state.sidecar || !state.identity_links_absent || !state.development_absent) {
      throw new Error("Positive Wave 2 adoption invariant failed.");
    }
    return {
      scenario,
      localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      installedIndexes: installed,
      exactIndexes: installed,
      equivalentReuse: "PASS",
      idempotentReplay: "PASS",
      historicalCounts: { attempts: state.attempts, examResults: state.exam_results, notifications: state.notifications },
      legacyWrites: "PASS",
      canonicalRpcFailClosed: { status: "PASS", sqlstate: rpcFailure.sqlstate },
      schemaStateRows: state.schema_state_rows,
      canonicalMarker: "absent",
      semanticSidecar: "PASS",
      developmentObjects: "absent",
      ledger: { phase: state.ledger_phase, order: state.ledger_order, rows: state.ledger_rows },
      cleanup: cleanup(),
    };
  } finally {
    if (!cleaned) cleanup();
  }
}

export async function runPhase4BWave2Postgres() {
  const positiveOnly = process.argv.includes("--positive-only");
  const requestedScenario = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1] ?? null;
  if (requestedScenario !== null) {
    if (!PHASE4B_WAVE2_NEGATIVE_SCENARIOS.includes(requestedScenario)) throw new Error("Unknown isolated Wave 2 scenario.");
    return runScenario(requestedScenario);
  }
  const positive = await runScenario("positive");
  if (positiveOnly) return { localOnly: true, positive, negatives: null };
  const negatives = {};
  for (const scenario of PHASE4B_WAVE2_NEGATIVE_SCENARIOS) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, POSTGRES_BIN: postgresBin },
      encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Isolated Wave 2 negative scenario failed: ${scenario}.`);
    let parsed;
    try { parsed = JSON.parse(String(child.stdout).trim()); } catch { throw new Error(`Invalid isolated Wave 2 output: ${scenario}.`); }
    if (parsed.scenario !== scenario || parsed.abort !== "PASS" || parsed.rollback !== "PASS"
        || parsed.mutationAssertion !== "PASS" || !parsed.cleanup?.directoryRemoved) {
      throw new Error(`Isolated Wave 2 negative contract failed: ${scenario}.`);
    }
    negatives[scenario] = parsed;
  }
  return {
    localOnly: true,
    positive,
    negatives,
    negativeAbortCount: Object.keys(negatives).length,
    negativeRollbackCount: Object.values(negatives).filter((result) => result.rollback === "PASS").length,
    indexDelta: {
      before: { trulyMissingNonUnique: 32, semanticDrift: 11, renamedEquivalent: 1 },
      resolved: 32,
      equivalentReuse: 1,
      remaining: { replacementRequiresCutover: 9, legacyRequiredTemporarily: 2 },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase4BWave2Postgres())}\n`);
}
