import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { PENDING_UNIQUES } from "./phase4-structural-contract.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = Object.fromEntries(Object.entries({
  initdb: "initdb.exe", pgCtl: "pg_ctl.exe", createdb: "createdb.exe", psql: "psql.exe",
}).map(([key, name]) => [key, join(postgresBin, name)]));

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

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("Unsafe structural identifier.");
  return `"${value}"`;
}

function scalar(output) {
  const rows = String(output).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length !== 1) throw new Error("Unexpected Phase 4A aggregate output.");
  return rows[0];
}

export async function runPhase4AUniquePostgres() {
  for (const path of Object.values(binaries)) {
    if (!existsSync(path)) throw new Error("Local PostgreSQL 18 binaries are required for Phase 4A evidence.");
  }
  const temporary = mkdtempSync(join(tmpdir(), "reflab-phase4a-"));
  const data = join(temporary, "data");
  const log = join(temporary, "postgres.log");
  const port = String(await reservePort());
  const environment = {
    PATH: `${postgresBin};${process.env.SystemRoot}\\System32`,
    SystemRoot: process.env.SystemRoot,
    TEMP: temporary,
    TMP: temporary,
    PGHOST: "127.0.0.1",
    PGPORT: port,
    PGDATABASE: "postgres",
    PGUSER: "postgres",
    PGSSLMODE: "disable",
  };
  const run = (binary, args, options = {}) => execFileSync(binary, args, {
    env: environment, encoding: "utf8", windowsHide: true,
    stdio: options.quiet ? "ignore" : (options.stdio ?? "pipe"),
    input: options.input, maxBuffer: 16 * 1024 * 1024,
  });
  const sql = (statement) => run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], { input: statement });
  let started = false;
  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    run(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    started = true;
    run(binaries.createdb, ["phase4a_unique"]);
    environment.PGDATABASE = "phase4a_unique";
    sql("create role legacy_runtime nologin; create schema extensions; create extension pgcrypto with schema extensions;");
    run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-f",
      resolve(root, "scripts", "production-adoption", "phase2b", "phase2b-production-fixture.sql")]);

    const results = [];
    for (const contract of PENDING_UNIQUES) {
      const [schema, table] = contract.table.split(".");
      const exists = scalar(sql(`select pg_catalog.to_regclass('${schema}.${table}') is not null;`)) === "t";
      if (!exists) {
        results.push({ ...contract, fixtureStatus: "fixture_table_not_modeled", duplicateCount: null, maxDuplicateGroupSize: null });
        continue;
      }
      const columns = contract.columns.map(identifier);
      const tableName = `${identifier(schema)}.${identifier(table)}`;
      const catalogColumnCount = Number(scalar(sql(`select pg_catalog.count(*) from pg_catalog.pg_attribute
        where attrelid = '${schema}.${table}'::pg_catalog.regclass
          and attnum > 0 and not attisdropped
          and attname = any (array[${contract.columns.map((column) => `'${column}'`).join(", ")}]::text[]);`)));
      if (catalogColumnCount !== columns.length) {
        results.push({
          ...contract,
          fixtureStatus: "fixture_columns_not_modeled",
          missingColumnCount: columns.length - catalogColumnCount,
          duplicateCount: null,
          maxDuplicateGroupSize: null,
        });
        continue;
      }
      const nonNull = columns.map((column) => `${column} is not null`).join(" and ");
      const aggregate = JSON.parse(scalar(sql(`select pg_catalog.json_build_object(
        'duplicateCount', pg_catalog.count(*),
        'maxDuplicateGroupSize', coalesce(pg_catalog.max(group_size), 0)
      )::text from (
        select pg_catalog.count(*) as group_size from ${tableName}
        where ${nonNull} group by ${columns.join(", ")} having pg_catalog.count(*) > 1
      ) duplicate_group;`)));
      results.push({ ...contract, fixtureStatus: "audited", ...aggregate });
    }
    return {
      localOnly: true,
      target: { host: "127.0.0.1", port },
      modeled: results.filter((entry) => entry.fixtureStatus === "audited").length,
      notModeled: results.filter((entry) => entry.fixtureStatus !== "audited").length,
      results,
    };
  } finally {
    if (started) {
      try {
        run(binaries.pgCtl, ["stop", "-D", data, "-m", "immediate", "-w"], { quiet: true });
      } catch {
        throw new Error("Local PostgreSQL cleanup failed before temporary directory removal.");
      }
    }
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("run-phase4a-unique-postgres.mjs")) {
  process.stdout.write(`${JSON.stringify(await runPhase4AUniquePostgres())}\n`);
}
