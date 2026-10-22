import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { authorizeLocalPostgresTarget } from "../phase0/local-target.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(directory, "..", "..", "..");
const fixtureSql = readFileSync(resolve(directory, "legacy-production-fixture.sql"), "utf8");
const assertionsSql = readFileSync(resolve(directory, "phase1-bridge-assertions.sql"), "utf8");
const legacyWriteSql = readFileSync(resolve(directory, "phase1-legacy-write-compatibility.sql"), "utf8");
const postCatalogWriteSql = readFileSync(resolve(directory, "phase1-post-catalog-write-compatibility.sql"), "utf8");
const migrations = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
].map((name) => ({ name, sql: readFileSync(resolve(repositoryRoot, "supabase", "migrations", name), "utf8") }));
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  psql: join(postgresBin, "psql.exe"),
};

function execute(sql, environment, spawn = spawnSync) {
  return spawn(binaries.psql, [
    "-X",
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--set",
    "VERBOSITY=verbose",
    "--tuples-only",
    "--no-align",
  ], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: environment,
  });
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

export function buildDisposablePostgresEnvironment(port, sourceEnvironment = process.env) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 6543) {
    throw new Error("Phase 1 disposable PostgreSQL port is invalid.");
  }
  return {
    ...(sourceEnvironment.SystemRoot ? { SystemRoot: sourceEnvironment.SystemRoot } : {}),
    ...(sourceEnvironment.WINDIR ? { WINDIR: sourceEnvironment.WINDIR } : {}),
    ...(sourceEnvironment.PATH ? { PATH: sourceEnvironment.PATH } : {}),
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGSSLMODE: "disable",
  };
}

function runBinary(binary, args, environment, options = {}) {
  return execFileSync(binary, args, {
    env: environment,
    encoding: "utf8",
    stdio: options.quiet ? "ignore" : ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function bootstrapDisposableRoles(environment, spawn) {
  requireSuccess(execute(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  `, environment, spawn), "disposable role bootstrap");
}

export class PositiveAssertionFailure extends Error {
  constructor({ assertionId, passed, sqlstate }) {
    super("Positive assertion failed.");
    this.name = "PositiveAssertionFailure";
    this.assertionId = assertionId;
    this.passed = passed;
    this.sqlstate = sqlstate;
  }
}

const EXPECTED_PSQL_COMMAND_TAGS = new Set(["SET"]);

export function parsePsqlScalar(output) {
  const values = String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !EXPECTED_PSQL_COMMAND_TAGS.has(line));
  if (values.length !== 1) {
    throw new Error("Unexpected psql scalar output shape.");
  }
  return values[0];
}

function positiveAssertionPasses(output) {
  return String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^PHASE1_ASSERT_[0-9]{3}_[A-Z0-9_]+\|PASS$/.test(line))
    .map((line) => line.slice(0, -5));
}

function requirePositiveAssertions(result) {
  const passed = positiveAssertionPasses(result.stdout);
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr ?? "").match(
      /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+(PHASE1_ASSERT_[0-9]{3}_[A-Z0-9_]+)/,
    );
    throw new PositiveAssertionFailure({
      assertionId: diagnostic?.[2] ?? "PHASE1_ASSERT_UNKNOWN",
      passed,
      sqlstate: diagnostic?.[1] ?? "UNKNOWN",
    });
  }
  if (!String(result.stdout ?? "").includes("PHASE1_BRIDGE_LOCAL_PASS")) {
    throw new PositiveAssertionFailure({
      assertionId: "PHASE1_ASSERT_COMPLETION_MARKER_MISSING",
      passed,
      sqlstate: "UNKNOWN",
    });
  }
  return passed;
}

function requireSuccess(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(`Local Phase 1 bridge rehearsal failed during ${label}.`);
  }
  return String(result.stdout ?? "");
}

function requireExpectedSqlFailure(result, { label, message, sqlstate }) {
  if (result.error) {
    throw new Error(`Local Phase 1 bridge rehearsal could not execute ${label}.`);
  }
  if (result.status === 0) {
    throw new Error(`Local Phase 1 bridge rehearsal expected ${label} to abort.`);
  }
  const diagnostic = String(result.stderr ?? "").match(
    /(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/,
  );
  if (diagnostic?.[1] !== sqlstate || !diagnostic?.[2]?.includes(message)) {
    throw new Error(`Local Phase 1 bridge rehearsal received an unexpected diagnostic for ${label}.`);
  }
  return { sqlstate, status: "PASS" };
}

function databaseName(kind) {
  return `reflab_phase1_${kind}_${randomUUID().replaceAll("-", "")}`;
}

function installerRoleName() {
  return `reflab_phase1_installer_${randomUUID().replaceAll("-", "")}`;
}

function quoteIdentifier(identifier) {
  if (!/^reflab_phase1_[a-z]+_[a-f0-9]{32}$/.test(identifier)) {
    throw new Error("Unsafe disposable database identifier.");
  }
  return `"${identifier}"`;
}

function quoteInstallerRole(identifier) {
  if (!/^reflab_phase1_installer_[a-f0-9]{32}$/.test(identifier)) {
    throw new Error("Unsafe disposable installer role identifier.");
  }
  return `"${identifier}"`;
}

function executeAsInstaller(sql, environment, installerRole, spawn) {
  return execute(`set role ${quoteInstallerRole(installerRole)};\n${sql}`, environment, spawn);
}

function createInstallerRole(adminEnvironment, name, spawn) {
  const sql = `create role ${quoteInstallerRole(name)} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;`;
  requireSuccess(execute(sql, adminEnvironment, spawn), "installer role creation");
  const verification = requireSuccess(execute(
    `select not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls from pg_catalog.pg_roles where rolname = '${name}';`,
    adminEnvironment,
    spawn,
  ), "installer role verification");
  const normalizedVerification = parsePsqlScalar(verification);
  if (normalizedVerification !== "t") throw new Error("Disposable installer role is not least-privilege.");
}

function dropInstallerRole(adminEnvironment, name, spawn) {
  requireSuccess(execute(`drop role ${quoteInstallerRole(name)};`, adminEnvironment, spawn), "installer role cleanup");
}

function createDatabase(adminEnvironment, name, installerRole, spawn) {
  const sql = `create database ${quoteIdentifier(name)} owner ${quoteInstallerRole(installerRole)};`;
  requireSuccess(execute(sql, adminEnvironment, spawn), "database creation");
}

function dropDatabase(adminEnvironment, name, spawn) {
  const identifier = quoteIdentifier(name);
  const sql = `select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity where datname = '${name}' and pid <> pg_catalog.pg_backend_pid();\ndrop database if exists ${identifier};`;
  requireSuccess(execute(sql, adminEnvironment, spawn), "database cleanup");
}

function databaseEnvironment(adminEnvironment, name) {
  return { ...adminEnvironment, PGDATABASE: name };
}

function requireLocalRoles(adminEnvironment, spawn) {
  const sql = `select pg_catalog.count(*) from pg_catalog.pg_roles where rolname in ('anon','authenticated','service_role','reflab_rls_owner');`;
  const output = parsePsqlScalar(requireSuccess(execute(sql, adminEnvironment, spawn), "local role preflight"));
  if (output !== "4") throw new Error("Local Phase 1 bridge rehearsal requires the four Supabase-compatible test roles.");
}

function runPhase1BridgeAgainstLocalTarget(environment, dependencies = {}, options = {}) {
  const target = authorizeLocalPostgresTarget(environment);
  const adminEnvironment = buildPsqlEnvironment(environment, target);
  const spawn = dependencies.spawn ?? spawnSync;
  const installerRole = installerRoleName();
  const positiveOnly = options.positiveOnly === true;
  const databases = positiveOnly
    ? [databaseName("positive")]
    : [
      databaseName("positive"),
      databaseName("column"),
      databaseName("module"),
      databaseName("dependency"),
      databaseName("ledger"),
    ];
  requireLocalRoles(adminEnvironment, spawn);

  let result;
  let primaryError;
  let installerCreated = false;
  try {
    createInstallerRole(adminEnvironment, installerRole, spawn);
    installerCreated = true;
    for (const name of databases) createDatabase(adminEnvironment, name, installerRole, spawn);

    const positiveEnvironment = databaseEnvironment(adminEnvironment, databases[0]);
    requireSuccess(executeAsInstaller(fixtureSql, positiveEnvironment, installerRole, spawn), "positive fixture");
    requireSuccess(executeAsInstaller(migrations[0].sql, positiveEnvironment, installerRole, spawn), migrations[0].name);
    requireSuccess(executeAsInstaller(migrations[1].sql, positiveEnvironment, installerRole, spawn), migrations[1].name);
    const legacyWriteOutput = requireSuccess(
      executeAsInstaller(legacyWriteSql, positiveEnvironment, installerRole, spawn),
      "legacy write compatibility",
    );
    if (!legacyWriteOutput.includes("PHASE1_LEGACY_WRITE_COMPATIBILITY_PASS")) {
      throw new Error("Legacy write compatibility did not report PASS.");
    }
    requireSuccess(executeAsInstaller(migrations[2].sql, positiveEnvironment, installerRole, spawn), migrations[2].name);
    const postCatalogWriteOutput = requireSuccess(
      executeAsInstaller(postCatalogWriteSql, positiveEnvironment, installerRole, spawn),
      "post-catalog write compatibility",
    );
    if (!postCatalogWriteOutput.includes("PHASE1_POST_CATALOG_WRITE_COMPATIBILITY_PASS")) {
      throw new Error("Post-catalog write compatibility did not report PASS.");
    }
    const positiveAssertionPasses = requirePositiveAssertions(
      executeAsInstaller(assertionsSql, positiveEnvironment, installerRole, spawn),
    );

    result = {
      positive: true,
      positiveAssertionPasses,
      nonSuperuserInstaller: true,
      legacyWriteCompatibility: true,
      postCatalogWriteCompatibility: true,
      negativeTestsExecuted: false,
    };

    if (!positiveOnly) {
      const columnEnvironment = databaseEnvironment(adminEnvironment, databases[1]);
      requireSuccess(executeAsInstaller(fixtureSql, columnEnvironment, installerRole, spawn), "unexpected-column fixture");
      requireSuccess(executeAsInstaller(migrations[0].sql, columnEnvironment, installerRole, spawn), "unexpected-column foundation");
      requireSuccess(executeAsInstaller("alter table public.attempts add column source_item_type text;", columnEnvironment, installerRole, spawn), "unexpected-column setup");
      const columnFailure = executeAsInstaller(migrations[1].sql, columnEnvironment, installerRole, spawn);
      const unexpectedColumn = requireExpectedSqlFailure(columnFailure, {
        label: "unexpected target column",
        message: "Bridge target column already exists",
        sqlstate: "55000",
      });
      const columnRollback = parsePsqlScalar(requireSuccess(executeAsInstaller("select pg_catalog.to_regclass('public.referee_exam_sessions') is null and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 1;", columnEnvironment, installerRole, spawn), "unexpected-column rollback"));
      if (columnRollback !== "t") throw new Error("Unexpected-column migration left partial objects.");

      const moduleEnvironment = databaseEnvironment(adminEnvironment, databases[2]);
      requireSuccess(executeAsInstaller(fixtureSql, moduleEnvironment, installerRole, spawn), "unknown-module fixture");
      requireSuccess(executeAsInstaller(migrations[0].sql, moduleEnvironment, installerRole, spawn), "unknown-module foundation");
      requireSuccess(executeAsInstaller(migrations[1].sql, moduleEnvironment, installerRole, spawn), "unknown-module Exam/Training phase");
      requireSuccess(executeAsInstaller("insert into public.psychology_checkins (id, module_slug) values ('70000000-0000-4000-8000-000000000001', 'unknown-module');", moduleEnvironment, installerRole, spawn), "unknown-module setup");
      const moduleFailure = executeAsInstaller(migrations[2].sql, moduleEnvironment, installerRole, spawn);
      const unknownPsychologyModule = requireExpectedSqlFailure(moduleFailure, {
        label: "unknown Psychology slug",
        message: "Unknown Psychology module slug",
        sqlstate: "23514",
      });
      const moduleRollback = parsePsqlScalar(requireSuccess(executeAsInstaller("select pg_catalog.to_regclass('public.psychology_modules') is null and not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.notification_events'::pg_catalog.regclass and attname = 'deduplication_key' and attnum > 0 and not attisdropped) and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 2;", moduleEnvironment, installerRole, spawn), "unknown-module rollback"));
      if (moduleRollback !== "t") throw new Error("Unknown-module migration left partial objects.");

      const dependencyEnvironment = databaseEnvironment(adminEnvironment, databases[3]);
      requireSuccess(executeAsInstaller(fixtureSql, dependencyEnvironment, installerRole, spawn), "missing-dependency fixture");
      requireSuccess(executeAsInstaller(migrations[0].sql, dependencyEnvironment, installerRole, spawn), "missing-dependency foundation");
      requireSuccess(executeAsInstaller("drop table public.institution_groups;", dependencyEnvironment, installerRole, spawn), "missing-dependency setup");
      const dependencyFailure = executeAsInstaller(migrations[1].sql, dependencyEnvironment, installerRole, spawn);
      const missingDependency = requireExpectedSqlFailure(dependencyFailure, {
        label: "missing required dependency",
        message: "Required bridge dependency is missing",
        sqlstate: "55000",
      });
      const dependencyRollback = parsePsqlScalar(requireSuccess(executeAsInstaller("select pg_catalog.to_regclass('public.referee_exam_sessions') is null and not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.attempts'::pg_catalog.regclass and attname = 'source_item_type' and attnum > 0 and not attisdropped) and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 1;", dependencyEnvironment, installerRole, spawn), "missing-dependency rollback"));
      if (dependencyRollback !== "t") throw new Error("Missing-dependency migration left partial objects.");

      const ledgerEnvironment = databaseEnvironment(adminEnvironment, databases[4]);
      requireSuccess(executeAsInstaller(fixtureSql, ledgerEnvironment, installerRole, spawn), "invalid-ledger fixture");
      requireSuccess(executeAsInstaller(migrations[0].sql, ledgerEnvironment, installerRole, spawn), "invalid-ledger foundation");
      requireSuccess(executeAsInstaller(`
        alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
        insert into reflab_meta.production_adoption_state (
          phase_order, phase_key, previous_phase_key, plan_version, plan_hash, evidence_hash
        )
        select 2, 'canonical_objects', 'foundation', plan_version, plan_hash, evidence_hash
        from reflab_meta.production_adoption_state where phase_order = 1;
        alter table reflab_meta.production_adoption_state enable trigger production_adoption_state_guard;
      `, ledgerEnvironment, installerRole, spawn), "invalid-ledger setup");
      const ledgerFailure = executeAsInstaller(migrations[1].sql, ledgerEnvironment, installerRole, spawn);
      const invalidLedger = requireExpectedSqlFailure(ledgerFailure, {
        label: "invalid adoption ledger",
        message: "Reviewed Production adoption foundation is required",
        sqlstate: "55000",
      });
      const ledgerRollback = parsePsqlScalar(requireSuccess(executeAsInstaller("select pg_catalog.to_regclass('public.referee_exam_sessions') is null and not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.attempts'::pg_catalog.regclass and attname = 'source_item_type' and attnum > 0 and not attisdropped) and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 2;", ledgerEnvironment, installerRole, spawn), "invalid-ledger rollback"));
      if (ledgerRollback !== "t") throw new Error("Invalid-ledger migration left partial objects.");

      result = {
        ...result,
        negativeTestsExecuted: true,
        negativeResults: {
          unexpectedTargetColumn: { ...unexpectedColumn, rollback: "PASS" },
          unknownPsychologySlug: { ...unknownPsychologyModule, rollback: "PASS" },
          missingRequiredDependency: { ...missingDependency, rollback: "PASS" },
          invalidAdoptionLedger: { ...invalidLedger, rollback: "PASS" },
        },
        unexpectedColumnRollback: true,
        unknownModuleRollback: true,
        missingDependencyRollback: true,
        invalidLedgerRollback: true,
      };
    }
  } catch (error) {
    primaryError = error;
  }

  const cleanupFailures = [];
  for (const name of [...databases].reverse()) {
    try {
      dropDatabase(adminEnvironment, name, spawn);
    } catch {
      cleanupFailures.push(name);
    }
  }
  if (installerCreated) {
    try {
      dropInstallerRole(adminEnvironment, installerRole, spawn);
    } catch {
      cleanupFailures.push(installerRole);
    }
  }

  if (primaryError) throw primaryError;
  if (cleanupFailures.length > 0) {
    throw new Error("Local Phase 1 bridge rehearsal could not prove disposable database cleanup.");
  }
  return result;
}

export async function runPhase1BridgePostgres(environment = process.env, dependencies = {}, options = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-phase1-"));
  const dataDirectory = join(temporaryRoot, "data");
  const logPath = join(temporaryRoot, "postgres.log");
  const port = await reservePort();
  const disposableEnvironment = buildDisposablePostgresEnvironment(port, environment);
  const spawn = dependencies.spawn ?? spawnSync;
  let serverStarted = false;
  let result;
  let primaryError;
  let cleanupError;

  try {
    runBinary(binaries.initdb, [
      "--auth=trust",
      "--username=postgres",
      "--encoding=UTF8",
      "--no-locale",
      "--pgdata",
      dataDirectory,
    ], disposableEnvironment);
    runBinary(binaries.pgCtl, [
      "start",
      "-D",
      dataDirectory,
      "-l",
      logPath,
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
    ], disposableEnvironment, { quiet: true });
    serverStarted = true;
    bootstrapDisposableRoles(disposableEnvironment, spawn);
    result = runPhase1BridgeAgainstLocalTarget(disposableEnvironment, { ...dependencies, spawn }, options);
  } catch (error) {
    primaryError = error;
  } finally {
    if (serverStarted) {
      try {
        runBinary(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], disposableEnvironment, { quiet: true });
      } catch {
        cleanupError = new Error("Local Phase 1 bridge rehearsal could not stop its disposable PostgreSQL cluster.");
      }
    }
    try {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } catch {
      cleanupError ??= new Error("Local Phase 1 bridge rehearsal could not remove its disposable PostgreSQL cluster.");
    }
  }

  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
  return {
    ...result,
    localTarget: { host: disposableEnvironment.PGHOST, port: disposableEnvironment.PGPORT },
    clusterCleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.stdout.write(`${JSON.stringify(await runPhase1BridgePostgres(
      process.env,
      {},
      { positiveOnly: process.argv.includes("--positive-only") },
    ))}\n`);
  } catch (error) {
    if (!(error instanceof PositiveAssertionFailure)) throw error;
    process.stdout.write(`${JSON.stringify({
      positiveAssertions: {
        passed: error.passed.map((assertionId) => ({ assertionId, status: "PASS" })),
        failure: {
          assertionId: error.assertionId,
          status: "FAIL",
          sqlstate: error.sqlstate,
          message: "Positive assertion failed.",
        },
      },
    })}\n`);
    process.exitCode = 1;
  }
}
