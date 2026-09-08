import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROLE_BOOTSTRAP_ARTIFACT,
  ROLE_BOOTSTRAP_ATTESTATION,
  assertRoleAttestation,
} from "./production-role-bootstrap-contract.mjs";
import { parseAttestationOutput } from "./run-production-role-bootstrap.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const bootstrap = readFileSync(resolve(root, ROLE_BOOTSTRAP_ARTIFACT), "utf8");
const attestation = readFileSync(resolve(root, ROLE_BOOTSTRAP_ATTESTATION), "utf8");
const pg17 = "C:\\Program Files\\PostgreSQL\\17\\bin";
const pg18 = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = existsSync(join(pg17, "initdb.exe")) ? pg17 : pg18;
const binaries = Object.freeze({
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  psql: join(postgresBin, "psql.exe"),
});

const scenarios = Object.freeze([
  "login", "inherit", "bypassrls", "superuser", "createdb", "createrole",
  "unexpected_membership", "unexpected_ownership", "unexpected_grant", "wrong_installer",
]);

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

function command(binary, args, options = {}) {
  return execFileSync(binary, args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options });
}

function psql(environment, sql, user = "postgres", allowFailure = false) {
  const result = spawnSync(binaries.psql, ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose", "--quiet", "--tuples-only", "--no-align"], {
    input: sql, encoding: "utf8", windowsHide: true,
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
      PGHOST: "127.0.0.1", PGPORT: String(environment.port), PGDATABASE: "postgres", PGUSER: user, PGSSLMODE: "disable" },
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const diagnostic = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
    throw Object.assign(new Error(`Local role bootstrap SQL failed; SQLSTATE=${diagnostic?.[1] ?? "UNKNOWN"}; message=${diagnostic?.[2] ?? "sanitized diagnostic unavailable"}.`), { stderr: result.stderr });
  }
  return result;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function createTargetSql(overrides = {}) {
  const attributes = {
    login: false,
    inherit: false,
    bypassrls: false,
    superuser: false,
    createdb: false,
    createrole: false,
    ...overrides,
  };
  const roleOptions = [
    attributes.login ? "login" : "nologin",
    attributes.inherit ? "inherit" : "noinherit",
    attributes.bypassrls ? "bypassrls" : "nobypassrls",
    attributes.superuser ? "superuser" : "nosuperuser",
    attributes.createdb ? "createdb" : "nocreatedb",
    attributes.createrole ? "createrole" : "nocreaterole",
  ].join(" ");
  return `create role reflab_rls_owner ${roleOptions};
    grant reflab_rls_owner to postgres;
    comment on role reflab_rls_owner is ${sqlLiteral("NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.")};`;
}

function setupSql(scenario) {
  const attribute = ["login", "inherit", "bypassrls", "superuser", "createdb", "createrole"].find(
    (candidate) => candidate === scenario,
  );
  if (attribute) return createTargetSql({ [attribute]: true });
  if (scenario === "unexpected_membership") return `${createTargetSql()} create role unexpected_parent nologin; grant unexpected_parent to reflab_rls_owner;`;
  if (scenario === "unexpected_ownership") return `${createTargetSql()} create schema unexpected_owned authorization reflab_rls_owner;`;
  if (scenario === "unexpected_grant") return `${createTargetSql()} alter default privileges for role cluster_admin grant select on tables to reflab_rls_owner;`;
  if (scenario === "wrong_installer") return "create role wrong_installer login inherit createrole nosuperuser nocreatedb nobypassrls; grant create on database postgres to wrong_installer;";
  return "";
}

function roleFingerprint(environment) {
  return psql(environment, `select pg_catalog.md5(coalesce(pg_catalog.json_agg(x order by x.kind,x.value)::text,'')) from (
    select 'role' kind, pg_catalog.concat_ws(':',rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls) value from pg_catalog.pg_roles where rolname='reflab_rls_owner'
    union all select 'membership',roleid::text||':'||member::text from pg_catalog.pg_auth_members where roleid=pg_catalog.to_regrole('reflab_rls_owner') or member=pg_catalog.to_regrole('reflab_rls_owner')
  ) x;`).stdout.trim();
}

async function withCluster(scenario, callback) {
  const temporary = mkdtempSync(join(tmpdir(), "reflab-role-bootstrap-"));
  const data = join(temporary, "data");
  const log = join(temporary, "postgres.log");
  const port = await reservePort();
  let started = false;
  try {
    for (const binary of Object.values(binaries)) if (!existsSync(binary)) throw new Error(`PostgreSQL binary unavailable: ${binary}`);
    command(binaries.initdb, ["--auth=trust", "--username=cluster_admin", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    command(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { stdio: "ignore" }); started = true;
    const environment = { port };
    psql(environment, "create role postgres login inherit nosuperuser nocreatedb createrole nobypassrls; grant create on database postgres to postgres;", "cluster_admin");
    const setup = setupSql(scenario);
    if (setup) psql(environment, setup, "cluster_admin");
    return await callback(environment);
  } finally {
    if (started) {
      try { command(binaries.pgCtl, ["stop", "-D", data, "-m", "immediate", "-w"], { stdio: "ignore" }); } catch {}
    }
    rmSync(temporary, { recursive: true, force: true });
    if (existsSync(temporary)) throw new Error("Local role bootstrap cleanup failed.");
  }
}

async function positive(scenario) {
  return withCluster(scenario, async (environment) => {
    if (scenario === "exact") psql(environment, createTargetSql());
    psql(environment, bootstrap);
    if (scenario === "exact") psql(environment, bootstrap);
    const payload = parseAttestationOutput(psql(environment, attestation).stdout);
    assertRoleAttestation(payload);
    const prerequisite = psql(environment, `select count(*)=1 and bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls) from pg_catalog.pg_roles where rolname='reflab_rls_owner';`).stdout.trim();
    if (prerequisite !== "t") throw new Error("Phase 1 reflab_rls_owner prerequisite did not pass.");
    return { scenario, bootstrap: "PASS", attestation: "PASS", phase1RolePrerequisite: "PASS", cleanup: "PASS" };
  });
}

async function negative(scenario) {
  return withCluster(scenario, async (environment) => {
    const before = roleFingerprint(environment);
    const result = psql(environment, bootstrap, scenario === "wrong_installer" ? "wrong_installer" : "postgres", true);
    if (result.status === 0) throw new Error(`Negative did not abort: ${scenario}`);
    const match = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/);
    const expected = scenario === "wrong_installer" ? "42501" : "55000";
    if (match?.[1] !== expected) throw new Error(`Unexpected SQLSTATE for ${scenario}: ${match?.[1] ?? "UNKNOWN"}`);
    const after = roleFingerprint(environment);
    if (before !== after) throw new Error(`Rollback changed role state: ${scenario}`);
    return { scenario, expectedSqlstate: expected, observedSqlstate: match[1], abort: "PASS", rollback: "PASS", cleanup: "PASS" };
  });
}

export async function runRoleBootstrapPostgres() {
  const version = command(binaries.psql, ["--version"]).trim();
  const positives = { absent: await positive("absent"), exact: await positive("exact") };
  const negatives = {};
  for (const scenario of scenarios) negatives[scenario] = await negative(scenario);
  return {
    localOnly: true,
    postgres: version,
    productionMajorAvailable: existsSync(join(pg17, "initdb.exe")),
    pg17Compatibility: existsSync(join(pg17, "initdb.exe")) ? "REHEARSED" : "STATIC_PASS_REHEARSAL_PG18",
    positives,
    negatives,
    negativeAbortCount: scenarios.length,
    negativeRollbackCount: scenarios.length,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const requested = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1];
  const operation = requested === "absent" || requested === "exact"
    ? positive(requested)
    : requested && scenarios.includes(requested)
      ? negative(requested)
      : runRoleBootstrapPostgres();
  operation.then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`ROLE_BOOTSTRAP_REHEARSAL_FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
