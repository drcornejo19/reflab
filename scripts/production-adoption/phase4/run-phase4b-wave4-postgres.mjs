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
import { PHASE4B_WAVE3_GATE, PHASE4B_WAVE3_UPDATED_AT_PAIRS } from "./phase4b-wave3-contract.mjs";
import { buildWave3FixtureSql } from "./phase4b-wave3-fixture-contract.mjs";
import {
  PHASE4B_WAVE4_GATE,
  PHASE4B_WAVE4_NEGATIVE_SCENARIOS,
  PHASE4B_WAVE4_SUMMARY,
  PHASE4B_WAVE4_UNIQUES,
} from "./phase4b-wave4-contract.mjs";
import { buildWave4FixtureSql } from "./phase4b-wave4-fixture-contract.mjs";

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
  if (lines.length !== 1) throw new Error("Unexpected local Wave 4 scalar output.");
  return lines[0];
}

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe Wave 4 identifier.");
  return `"${value}"`;
}

export function parsePhase4BWave4Failure(error) {
  const diagnostic = String(error?.stderr ?? error ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
  return { sqlstate: diagnostic?.[1] ?? "UNKNOWN", message: diagnostic?.[2] ?? "Local Wave 4 SQL failed." };
}

function target(identity) {
  const match = PHASE4B_WAVE4_UNIQUES.find((entry) => entry.identity === identity);
  if (!match) throw new Error(`Unknown Wave 4 target: ${identity}`);
  return match;
}

const keyOrderTarget = target("public.institution_assessment_assignments.institution_assessment_assignments_id_tenant_assessment_unique");
const deferrabilityTarget = target("public.institution_groups.institution_groups_id_tenant_unique");
const providerTarget = target("public.institution_roles.institution_roles_id_tenant_unique");

export function wave4NegativeInjectionSql(scenario) {
  if (scenario === "duplicate_data") {
    return `drop index public.user_profiles_ref_card_id_unique;
      insert into public.user_profiles(user_id, ref_card_id) values
        ('wave4_duplicate_a', 'WAVE4-DUPLICATE'), ('wave4_duplicate_b', 'WAVE4-DUPLICATE');`;
  }
  if (scenario === "wrong_key_order") {
    return `alter table ${keyOrderTarget.qualifiedTable} add constraint ${keyOrderTarget.constraintName}
      unique (assessment_id, institution_id, id);`;
  }
  if (scenario === "wrong_null_semantics") {
    return `drop index public.user_profiles_ref_card_id_unique;
      create unique index user_profiles_ref_card_id_unique on public.user_profiles (ref_card_id)
      nulls not distinct where ref_card_id is not null;`;
  }
  if (scenario === "wrong_partial_predicate") {
    return `drop index public.user_profiles_ref_card_id_unique;
      create unique index user_profiles_ref_card_id_unique on public.user_profiles (ref_card_id)
      where ref_card_id is not null and ref_card_id <> '';`;
  }
  if (scenario === "wrong_deferrability") {
    return `alter table ${deferrabilityTarget.qualifiedTable} add constraint ${deferrabilityTarget.constraintName}
      unique (id, institution_id) deferrable initially immediate;`;
  }
  if (scenario === "provider_conflict") {
    return `alter table ${providerTarget.qualifiedTable} add constraint ${providerTarget.constraintName} unique (id, institution_id);
      alter table ${providerTarget.qualifiedTable} add constraint phase4b_duplicate_provider unique (id, institution_id);`;
  }
  if (scenario === "missing_prerequisite") {
    return "alter table public.institution_contents rename to phase4b_missing_institution_contents;";
  }
  throw new Error(`Unknown Wave 4 negative injection: ${scenario}`);
}

export function wave4NegativeMutationAssertionSql(scenario) {
  if (scenario === "duplicate_data") return "select count(*)=1 and max(group_size)=2 from (select count(*) group_size from public.user_profiles where ref_card_id is not null group by ref_card_id having count(*)>1) duplicate_group;";
  if (scenario === "wrong_key_order") return `select pg_catalog.pg_get_constraintdef(oid) like 'UNIQUE (assessment_id, institution_id, id)%' from pg_catalog.pg_constraint where conrelid='${keyOrderTarget.qualifiedTable}'::regclass and conname='${keyOrderTarget.constraintName}';`;
  if (scenario === "wrong_null_semantics") return "select indnullsnotdistinct from pg_catalog.pg_index where indexrelid='public.user_profiles_ref_card_id_unique'::regclass;";
  if (scenario === "wrong_partial_predicate") return "select pg_catalog.pg_get_expr(indpred,indrelid) like '%<>%''::text%' from pg_catalog.pg_index where indexrelid='public.user_profiles_ref_card_id_unique'::regclass;";
  if (scenario === "wrong_deferrability") return `select condeferrable and not condeferred from pg_catalog.pg_constraint where conrelid='${deferrabilityTarget.qualifiedTable}'::regclass and conname='${deferrabilityTarget.constraintName}';`;
  if (scenario === "provider_conflict") return `select count(*)=2 from pg_catalog.pg_constraint where conrelid='${providerTarget.qualifiedTable}'::regclass and contype='u' and conname in ('${providerTarget.constraintName}','phase4b_duplicate_provider');`;
  if (scenario === "missing_prerequisite") return "select pg_catalog.to_regclass('public.institution_contents') is null and pg_catalog.to_regclass('public.phase4b_missing_institution_contents') is not null;";
  throw new Error(`Unknown Wave 4 mutation assertion: ${scenario}`);
}

function expectedMessage(scenario) {
  if (scenario === "duplicate_data") return "duplicate data";
  if (scenario === "wrong_key_order" || scenario === "wrong_deferrability") return "constraint contract drift";
  if (scenario === "wrong_null_semantics" || scenario === "wrong_partial_predicate") return "partial UNIQUE index contract drift";
  if (scenario === "provider_conflict") return "provider conflict";
  if (scenario === "missing_prerequisite") return "prerequisite table is missing";
  throw new Error(`Unknown Wave 4 expected message: ${scenario}`);
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text || ':' || coalesce(user_id,''),',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text || ':' || user_id || ':' || coalesce(submission_id::text,''),',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text || ':' || user_id,',' order by id) from public.notification_events),
    (select pg_catalog.string_agg(user_id || ':' || coalesce(ref_card_id,''),',' order by user_id) from public.user_profiles where user_id like 'user_synthetic_%')
  ));`;
}

function structuralFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(namespace.nspname||'.'||relation.relname||'.'||constraint_row.conname||':'||pg_catalog.pg_get_constraintdef(constraint_row.oid),',' order by namespace.nspname,relation.relname,constraint_row.conname)
     from pg_catalog.pg_constraint constraint_row join pg_catalog.pg_class relation on relation.oid=constraint_row.conrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and constraint_row.contype in ('p','u')),
    (select pg_catalog.string_agg(namespace.nspname||'.'||relation.relname||':'||pg_catalog.pg_get_indexdef(relation.oid),',' order by namespace.nspname,relation.relname)
     from pg_catalog.pg_class relation join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where namespace.nspname='public' and relation.relkind='i')
  ));`;
}

function duplicateAggregateSql(contract) {
  const columns = contract.columns.map(quoteIdentifier);
  const table = `${quoteIdentifier(contract.schema)}.${quoteIdentifier(contract.table)}`;
  return `select pg_catalog.jsonb_build_object(
    'duplicateGroupCount',pg_catalog.count(*),'maxDuplicateGroupSize',coalesce(pg_catalog.max(group_size),0)
  )::text from (
    select pg_catalog.count(*) group_size from ${table}
    where ${columns.map((column) => `${column} is not null`).join(" and ")}
    group by ${columns.join(",")} having pg_catalog.count(*)>1
  ) duplicate_group;`;
}

export async function runScenario(scenario, localExtension = null) {
  const port = await reservePort();
  const temporaryRoot = mkdtempSync(join(tmpdir(), `reflab-wave4-${scenario}-`));
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
  function sqlAs(database, user, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-t", "-A"], {
      environment: { PGDATABASE: database, PGUSER: user }, input: statement,
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
    if (ready.status === 0) throw new Error("Wave 4 PostgreSQL process survived cleanup.");
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Wave 4 temporary directory survived cleanup.");
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
    sql(database, buildWave4FixtureSql(baseline));
    apply(database, phase2aMigration);
    for (const migration of phase2bMigrations) apply(database, migration);
    sql(database, phase3Fixture);
    for (const migration of PHASE3_MIGRATIONS) apply(database, migration);
    apply(database, PHASE4B_WAVE1_MIGRATION);
    apply(database, PHASE4B_WAVE2_MIGRATION);
    apply(database, PHASE4B_WAVE3_GATE, root);
  }

  const database = `wave4_${scenario}`;
  try {
    for (const path of Object.values(binaries)) if (!existsSync(path)) throw new Error("Local PostgreSQL 18 binaries are required for Wave 4.");
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
    const historicalBefore = scalar(sql(database, historicalFingerprintSql()));

    if (scenario !== "positive") {
      sql(database, wave4NegativeInjectionSql(scenario));
      if (scalar(sql(database, wave4NegativeMutationAssertionSql(scenario))) !== "t") throw new Error(`HARNESS_SETUP_FAIL: ${scenario}`);
      const structuralBefore = scalar(sql(database, structuralFingerprintSql()));
      const historicalMutated = scalar(sql(database, historicalFingerprintSql()));
      let failure;
      try { apply(database, PHASE4B_WAVE4_GATE, root); } catch (error) { failure = parsePhase4BWave4Failure(error); }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.toLowerCase().includes(expectedMessage(scenario).toLowerCase())) {
        throw new Error(`Unexpected sanitized Wave 4 negative result: ${scenario}`);
      }
      if (scalar(sql(database, structuralFingerprintSql())) !== structuralBefore
          || scalar(sql(database, historicalFingerprintSql())) !== historicalMutated) {
        throw new Error(`Wave 4 rollback contract failed: ${scenario}`);
      }
      return {
        scenario, localTarget: { host: environment.PGHOST, port: environment.PGPORT }, mutationAssertion: "PASS",
        expectedSqlstate: "55000", observedSqlstate: failure.sqlstate, abort: "PASS", rollback: "PASS",
        historicalFingerprint: "PASS", partialInstallation: 0, cleanup: cleanup(),
      };
    }

    apply(database, PHASE4B_WAVE4_GATE, root);
    const duplicateAudit = PHASE4B_WAVE4_UNIQUES.map((contract) => ({
      identity: contract.identity,
      ...JSON.parse(scalar(sql(database, duplicateAggregateSql(contract)))),
      evidence: "LOCAL_DATA_VALIDATION_PASS",
      classification: contract.classification,
    }));
    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'attempts',(select count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results',(select count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications',(select count(*) from public.notification_events),
      'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows',(select count(*) from reflab_meta.production_adoption_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'identity_links_absent',pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'development_absent',not exists(select 1 from pg_catalog.unnest(array[${PHASE3_DEVELOPMENT_RPCS.map((value) => `'${value}'`).join(",")}]) signature where pg_catalog.to_regprocedure(signature) is not null),
      'reviewed_triggers',(select count(*) from pg_catalog.pg_trigger trigger_row join pg_catalog.pg_class relation on relation.oid=trigger_row.tgrelid join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace where not trigger_row.tgisinternal and (namespace.nspname||'.'||relation.relname||'.'||trigger_row.tgname)=any(array[${PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `'${pair.schema}.${pair.table}.${pair.historicalName}'`).join(",")}]::text[]))
    )::text;`)));
    if (duplicateAudit.some((entry) => entry.duplicateGroupCount !== 0 || entry.maxDuplicateGroupSize !== 0)
        || state.attempts !== 37 || state.exam_results !== 6 || state.notifications !== 60
        || state.schema_state !== 0 || state.ledger_rows !== 4 || state.ledger_phase !== "canonical_objects"
        || state.ledger_order !== 4 || !state.sidecar || !state.identity_links_absent || !state.development_absent
        || state.reviewed_triggers !== 44 || scalar(sql(database, historicalFingerprintSql())) !== historicalBefore) {
      throw new Error("Positive Wave 4 invariant failed.");
    }
    sql(database, `begin; set local role authenticated; set local request.jwt.claims='{"sub":"user_synthetic_001"}';
      insert into public.attempts(id,user_id,sport_type) values('15000000-0000-4000-8000-000000000001','user_synthetic_001','football_11'); rollback;`);
    const rpc = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], {
      env: { ...environment, PGDATABASE: database }, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024,
      input: `set role service_role; select public.submit_canonical_training_attempt('user_synthetic_001','97000000-0000-4000-8000-000000000099','{"sport_type":"football_11","activity_type":"rules_practice","source_item_type":"rule_question","source_item_id":"law-1"}'::jsonb,0);`,
    });
    const rpcFailure = parsePhase4BWave4Failure(rpc);
    if (rpc.status === 0 || rpcFailure.sqlstate !== "55000") throw new Error("Canonical RPC did not remain fail-closed after Wave 4.");
    const extension = localExtension ? await localExtension({ database, sql, sqlAs, apply, scalar, historicalBefore }) : null;
    return {
      scenario, localTarget: { host: environment.PGHOST, port: environment.PGPORT },
      audit: duplicateAudit, partialIndexes: { reviewed: 2, valueSemantics: "EXACT_EQUIVALENCE", structuralEquivalence: false },
      classification: PHASE4B_WAVE4_SUMMARY, migrationCreated: false,
      historicalCounts: { attempts: state.attempts, examResults: state.exam_results, notifications: state.notifications },
      historicalFingerprint: "PASS", legacyWrites: "PASS", canonicalRpcFailClosed: { status: "PASS", sqlstate: rpcFailure.sqlstate },
      schemaStateRows: state.schema_state, canonicalMarker: "absent", semanticSidecar: "PASS",
      developmentObjects: "absent", ledger: { phase: state.ledger_phase, order: state.ledger_order, rows: state.ledger_rows },
      extension, cleanup: cleanup(),
    };
  } finally {
    if (!cleaned) cleanup();
  }
}

export async function runPhase4BWave4Postgres() {
  const positiveOnly = process.argv.includes("--positive-only");
  const requestedScenario = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1] ?? null;
  if (requestedScenario !== null) {
    if (!PHASE4B_WAVE4_NEGATIVE_SCENARIOS.includes(requestedScenario)) throw new Error("Unknown isolated Wave 4 scenario.");
    return runScenario(requestedScenario);
  }
  const positive = await runScenario("positive");
  if (positiveOnly) return { localOnly: true, positive, negatives: null };
  const negatives = {};
  for (const scenario of PHASE4B_WAVE4_NEGATIVE_SCENARIOS) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, POSTGRES_BIN: postgresBin },
      encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Isolated Wave 4 negative scenario failed: ${scenario}.`);
    let parsed;
    try { parsed = JSON.parse(String(child.stdout).trim()); } catch { throw new Error(`Invalid isolated Wave 4 output: ${scenario}.`); }
    if (parsed.scenario !== scenario || parsed.abort !== "PASS" || parsed.rollback !== "PASS"
        || parsed.mutationAssertion !== "PASS" || !parsed.cleanup?.directoryRemoved) {
      throw new Error(`Isolated Wave 4 negative contract failed: ${scenario}.`);
    }
    negatives[scenario] = parsed;
  }
  return {
    localOnly: true, positive, negatives,
    negativeAbortCount: Object.keys(negatives).length,
    negativeRollbackCount: Object.values(negatives).filter((result) => result.rollback === "PASS").length,
    uniqueDelta: {
      before: 13,
      resolvedByEquivalentReuse: 2,
      safeInstall: 0,
      requiresPrivilegedProductionEvidence: 11,
      migrationCreated: false,
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase4BWave4Postgres())}\n`);
}
