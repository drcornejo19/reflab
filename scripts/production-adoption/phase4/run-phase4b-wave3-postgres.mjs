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
import { PHASE4B_WAVE1_MIGRATION } from "./phase4b-wave1-contract.mjs";
import { PHASE4B_WAVE2_MIGRATION, PHASE4B_WAVE2_SAFE_INDEXES } from "./phase4b-wave2-contract.mjs";
import { buildWave2FixtureSql } from "./phase4b-wave2-fixture-contract.mjs";
import {
  PHASE4B_WAVE3_FUNCTIONS,
  PHASE4B_WAVE3_GATE,
  PHASE4B_WAVE3_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE3_UPDATED_AT_PAIRS,
} from "./phase4b-wave3-contract.mjs";
import { buildWave3FixtureSql } from "./phase4b-wave3-fixture-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
const migrationsDirectory = resolve(root, "supabase", "migrations");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = Object.freeze({
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  pgIsReady: join(postgresBin, "pg_isready.exe"),
  psql: join(postgresBin, "psql.exe"),
});
const baseline = readFileSync(resolve(migrationsDirectory, "202607270000_reflab_canonical_baseline.sql"), "utf8").replaceAll("\r\n", "\n");
const institutional = readFileSync(resolve(migrationsDirectory, "202607160001_institutional_multitenant_foundation.sql"), "utf8").replaceAll("\r\n", "\n");
const coach = readFileSync(resolve(migrationsDirectory, "202607200001_reflab_coach_foundation.sql"), "utf8").replaceAll("\r\n", "\n");
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
const targetPair = PHASE4B_WAVE3_UPDATED_AT_PAIRS.find((pair) => pair.table === "appointments");
const missingPair = PHASE4B_WAVE3_UPDATED_AT_PAIRS.find((pair) => pair.table === "associations");

if (!targetPair || !missingPair) throw new Error("Wave 3 negative targets are absent from the reviewed contract.");

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
  if (lines.length !== 1) throw new Error("Unexpected local Wave 3 scalar output.");
  return lines[0];
}

export function parsePhase4BWave3Failure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: diagnostic?.[1] ?? "UNKNOWN", message: diagnostic?.[2] ?? "Local Wave 3 SQL failed." };
}

function qualifiedTrigger(pair) {
  return `${pair.schema}.${pair.table}`;
}

function recreateTarget({ timing = "before", events = "update", level = "row", when = "", functionSignature = targetPair.historicalFunction, name = targetPair.historicalName } = {}) {
  return `drop trigger ${targetPair.historicalName} on ${qualifiedTrigger(targetPair)};
    create trigger ${name} ${timing} ${events} on ${qualifiedTrigger(targetPair)}
    for each ${level} ${when} execute function ${functionSignature};`;
}

export function wave3NegativeInjectionSql(scenario) {
  if (scenario === "wrong_trigger_function") {
    return `create function public.phase4b_wrong_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;
      ${recreateTarget({ functionSignature: "public.phase4b_wrong_updated_at()" })}`;
  }
  if (scenario === "wrong_timing") return recreateTarget({ timing: "after" });
  if (scenario === "wrong_event_mask") return recreateTarget({ events: "insert or update" });
  if (scenario === "wrong_level") return recreateTarget({ level: "statement" });
  if (scenario === "disabled_trigger") return `alter table ${qualifiedTrigger(targetPair)} disable trigger ${targetPair.historicalName};`;
  if (scenario === "unexpected_when") return recreateTarget({ when: "when (old.updated_at is distinct from new.updated_at)" });
  if (scenario === "double_execution") {
    return `create trigger phase4b_second_updated_at before update on ${qualifiedTrigger(targetPair)}
      for each row execute function ${targetPair.historicalFunction};`;
  }
  if (scenario === "unexpected_trigger_pair") return recreateTarget({ name: "phase4b_unexpected_updated_at" });
  if (scenario === "function_source_drift") {
    return `create or replace function public.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = pg_catalog.now() + interval '0 seconds'; return new; end $$;`;
  }
  if (scenario === "missing_prerequisite") return `alter table ${qualifiedTrigger(missingPair)} rename to phase4b_missing_associations;`;
  throw new Error(`Unknown Wave 3 negative injection: ${scenario}`);
}

function triggerPredicate(pair, name = pair.historicalName) {
  return `namespace.nspname='${pair.schema}' and relation.relname='${pair.table}' and trigger_row.tgname='${name}' and not trigger_row.tgisinternal`;
}

export function wave3NegativeMutationAssertionSql(scenario) {
  const joins = `from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=routine.pronamespace`;
  if (scenario === "wrong_trigger_function") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and function_namespace.nspname||'.'||routine.proname||'()'='public.phase4b_wrong_updated_at()');`;
  if (scenario === "wrong_timing") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and trigger_row.tgtype=17);`;
  if (scenario === "wrong_event_mask") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and trigger_row.tgtype=23);`;
  if (scenario === "wrong_level") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and trigger_row.tgtype=18);`;
  if (scenario === "disabled_trigger") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and trigger_row.tgenabled='D');`;
  if (scenario === "unexpected_when") return `select exists(select 1 ${joins} where ${triggerPredicate(targetPair)} and trigger_row.tgqual is not null);`;
  if (scenario === "double_execution") return `select (select count(*) ${joins} where namespace.nspname='${targetPair.schema}' and relation.relname='${targetPair.table}' and trigger_row.tgtype=19 and not trigger_row.tgisinternal)=2;`;
  if (scenario === "unexpected_trigger_pair") return `select not exists(select 1 ${joins} where ${triggerPredicate(targetPair)}) and exists(select 1 ${joins} where ${triggerPredicate(targetPair, "phase4b_unexpected_updated_at")});`;
  if (scenario === "function_source_drift") {
    const contract = PHASE4B_WAVE3_FUNCTIONS.find((entry) => entry.signature === "public.set_updated_at()");
    return `select pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.regexp_replace(prosrc,'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8'),'sha256'),'hex')<>'${contract.sourceHash}' from pg_catalog.pg_proc where oid='public.set_updated_at()'::regprocedure;`;
  }
  if (scenario === "missing_prerequisite") return `select pg_catalog.to_regclass('${qualifiedTrigger(missingPair)}') is null and pg_catalog.to_regclass('${missingPair.schema}.phase4b_missing_associations') is not null;`;
  throw new Error(`Unknown Wave 3 mutation assertion: ${scenario}`);
}

function expectedMessage(scenario) {
  if (scenario === "wrong_trigger_function" || scenario === "wrong_timing" || scenario === "wrong_event_mask"
      || scenario === "wrong_level" || scenario === "disabled_trigger" || scenario === "unexpected_when"
      || scenario === "unexpected_trigger_pair") return "Reviewed updated_at trigger contract drift";
  if (scenario === "double_execution") return "double execution";
  if (scenario === "function_source_drift") return "Reviewed updated_at helper contract drift";
  if (scenario === "missing_prerequisite") return "trigger prerequisite is missing";
  throw new Error(`Unknown Wave 3 expected message: ${scenario}`);
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id,''),',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text,''),',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id,',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id,',' order by user_id) from public.user_profiles)
  ));`;
}

async function runScenario(scenario) {
  const port = await reservePort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), `reflab-wave3-${scenario}-`));
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
      env: { ...environment, ...options.environment }, encoding: "utf8", input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024, windowsHide: true,
    });
  }
  function sql(database, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-t", "-A"], {
      environment: { PGDATABASE: database }, input: statement,
    });
  }
  function apply(database, path, base = migrationsDirectory) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-f", resolve(base, path)], {
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
    if (ready.status === 0) throw new Error("Wave 3 PostgreSQL process survived cleanup.");
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Wave 3 temporary directory survived cleanup.");
    cleaned = true;
    return { serverStopped: true, portClosed: true, directoryRemoved: true };
  }
  function setup(database) {
    sql(database, phase2bFixture);
    for (const migration of phase1Migrations) apply(database, migration);
    sql(database, buildSemanticSidecarFixtureSql());
    sql(database, buildWave2FixtureSql(baseline, PHASE4B_WAVE2_SAFE_INDEXES));
    sql(database, buildWave1FixtureDependencySql(baseline));
    sql(database, buildWave3FixtureSql({ canonicalSql: baseline, institutionalSql: institutional, coachSql: coach }));
    apply(database, phase2aMigration);
    for (const migration of phase2bMigrations) apply(database, migration);
    sql(database, phase3Fixture);
    for (const migration of PHASE3_MIGRATIONS) apply(database, migration);
    apply(database, PHASE4B_WAVE1_MIGRATION);
    apply(database, PHASE4B_WAVE2_MIGRATION);
  }

  const database = `wave3_${scenario}`;
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
      sql(database, wave3NegativeInjectionSql(scenario));
      if (scalar(sql(database, wave3NegativeMutationAssertionSql(scenario))) !== "t") throw new Error(`HARNESS_SETUP_FAIL: ${scenario}`);
      let failure;
      try { apply(database, PHASE4B_WAVE3_GATE, root); } catch (error) { failure = parsePhase4BWave3Failure(error); }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.toLowerCase().includes(expectedMessage(scenario).toLowerCase())) {
        throw new Error(`Unexpected sanitized Wave 3 negative result: ${scenario}`);
      }
      const invariant = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
        'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
        'ledger',(select count(*) from reflab_meta.production_adoption_state),
        'canonical_triggers',(select count(*) from pg_catalog.pg_trigger trigger_row join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and trigger_row.tgname like '%_set_updated_at' and trigger_row.tgname not like 'set_%' and not trigger_row.tgisinternal)
      )::text;`)));
      if (invariant.schema_state !== 0 || invariant.ledger !== 4 || invariant.canonical_triggers !== 1
          || scalar(sql(database, historicalFingerprintSql())) !== beforeFingerprint) {
        throw new Error(`Wave 3 rollback contract failed: ${scenario}`);
      }
      return {
        scenario, localTarget: { host: environment.PGHOST, port: environment.PGPORT }, mutationAssertion: "PASS",
        expectedSqlstate: "55000", observedSqlstate: failure.sqlstate, abort: "PASS", rollback: "PASS",
        historicalFingerprint: "PASS", cleanup: cleanup(),
      };
    }

    apply(database, PHASE4B_WAVE3_GATE, root);
    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'reviewed_triggers',(select count(*) from pg_catalog.pg_trigger trigger_row join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where not trigger_row.tgisinternal and (namespace.nspname||'.'||relation.relname||'.'||trigger_row.tgname)=any(array[${PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `'${pair.schema}.${pair.table}.${pair.historicalName}'`).join(",")}]::text[])),
      'validators',(select count(*) from pg_catalog.pg_trigger trigger_row join pg_catalog.pg_proc routine on routine.oid=trigger_row.tgfoid where not trigger_row.tgisinternal and routine.oid='public.validate_institution_tenant_links()'::regprocedure),
      'attempts',(select count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results',(select count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications',(select count(*) from public.notification_events),
      'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows',(select count(*) from reflab_meta.production_adoption_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'identity_links_absent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'development_absent',not exists(select 1 from pg_catalog.unnest(array[${PHASE3_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null)
    )::text;`)));
    if (state.reviewed_triggers !== 44 || state.validators !== 6 || state.attempts !== 37 || state.exam_results !== 6
        || state.notifications !== 60 || state.schema_state !== 0 || state.ledger_rows !== 4
        || state.ledger_phase !== "canonical_objects" || state.ledger_order !== 4 || !state.sidecar
        || !state.identity_links_absent || !state.development_absent || scalar(sql(database, historicalFingerprintSql())) !== beforeFingerprint) {
      throw new Error("Positive Wave 3 invariant failed.");
    }
    sql(database, `begin; set local role authenticated; set local request.jwt.claims='{"sub":"user_synthetic_001"}';
      insert into public.attempts(id,user_id,sport_type) values('14000000-0000-4000-8000-000000000001','user_synthetic_001','football_11'); rollback;`);
    const rpc = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: database }, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      input: `set role service_role; select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000099','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`,
    });
    const rpcFailure = parsePhase4BWave3Failure(rpc);
    if (rpc.status === 0 || rpcFailure.sqlstate !== "55000") throw new Error("Canonical RPC did not remain fail-closed after Wave 3.");
    return {
      scenario, localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      reviewedUpdatedAt: state.reviewed_triggers, exactCanonical: 0, equivalentReuse: state.reviewed_triggers,
      effectiveTriggerCount: "1_PER_TABLE", validatorsLegacyUnchanged: state.validators,
      historicalCounts: { attempts: state.attempts, examResults: state.exam_results, notifications: state.notifications },
      historicalFingerprint: "PASS", legacyWrites: "PASS",
      canonicalRpcFailClosed: { status: "PASS", sqlstate: rpcFailure.sqlstate },
      schemaStateRows: state.schema_state, canonicalMarker: "absent", semanticSidecar: "PASS",
      developmentObjects: "absent", ledger: { phase: state.ledger_phase, order: state.ledger_order, rows: state.ledger_rows },
      ddlPerformed: false, cleanup: cleanup(),
    };
  } finally {
    if (!cleaned) cleanup();
  }
}

export async function runPhase4BWave3Postgres() {
  const positiveOnly = process.argv.includes("--positive-only");
  const requestedScenario = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1] ?? null;
  if (requestedScenario !== null) {
    if (!PHASE4B_WAVE3_NEGATIVE_SCENARIOS.includes(requestedScenario)) throw new Error("Unknown isolated Wave 3 scenario.");
    return runScenario(requestedScenario);
  }
  const positive = await runScenario("positive");
  if (positiveOnly) return { localOnly: true, positive, negatives: null };
  const negatives = {};
  for (const scenario of PHASE4B_WAVE3_NEGATIVE_SCENARIOS) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, POSTGRES_BIN: postgresBin },
      encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Isolated Wave 3 negative scenario failed: ${scenario}.`);
    let parsed;
    try { parsed = JSON.parse(String(child.stdout).trim()); } catch { throw new Error(`Invalid isolated Wave 3 output: ${scenario}.`); }
    if (parsed.scenario !== scenario || parsed.abort !== "PASS" || parsed.rollback !== "PASS"
        || parsed.mutationAssertion !== "PASS" || !parsed.cleanup?.directoryRemoved) {
      throw new Error(`Isolated Wave 3 negative contract failed: ${scenario}.`);
    }
    negatives[scenario] = parsed;
  }
  return {
    localOnly: true, positive, negatives,
    negativeAbortCount: Object.keys(negatives).length,
    negativeRollbackCount: Object.values(negatives).filter((result) => result.rollback === "PASS").length,
    triggerDelta: {
      before: { reviewedUpdatedAt: 44, legacyValidators: 6 },
      resolved: { exactCanonical: 0, equivalentReuse: 44, renamed: 0 },
      remaining: { legacyRequiredTemporarily: 6, semanticDrift: 0 },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase4BWave3Postgres())}\n`);
}
