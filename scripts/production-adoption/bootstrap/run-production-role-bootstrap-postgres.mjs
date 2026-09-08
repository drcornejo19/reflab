import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ROLE_BOOTSTRAP_ARTIFACT,
  ROLE_BOOTSTRAP_ATTESTATION,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS,
  assertAbsentRoleAttestation,
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

const targetScenarios = Object.freeze([
  "login", "inherit", "bypassrls", "superuser", "createdb", "createrole",
  "admin_option_drift", "set_option_drift", "inherit_option_drift", "incompatible_grantor",
  "unexpected_membership", "unexpected_ownership", "unexpected_grant",
  "unsafe_table_privilege", "unsafe_sequence_privilege", "unsafe_schema_create",
  "wrong_installer",
]);
const managedInstallerScenarios = Object.freeze([
  "installer_createdb_drift", "installer_bypassrls_drift", "installer_replication_drift",
  "installer_superuser_drift", "installer_missing_membership", "installer_extra_membership",
  "installer_wrong_grantor", "installer_admin_option_drift",
  "installer_inherit_option_drift", "installer_set_option_drift",
]);
const scenarios = Object.freeze([...targetScenarios, ...managedInstallerScenarios]);

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
  return `set createrole_self_grant = '';
    create role reflab_rls_owner ${roleOptions};
    grant reflab_rls_owner to postgres with admin false, inherit false, set true granted by postgres;
    comment on role reflab_rls_owner is ${sqlLiteral("NOLOGIN owner for audited RefLab RLS helper functions. It owns no product tables and has read-only access to authorization tables.")};`;
}

export function createManagedInstallerSql() {
  const customRoles = [
    "anon", "authenticated", "authenticator", "reflab_prod_preflight_ro",
    "service_role", "supabase_privileged_role",
  ];
  const statements = [
    "create role postgres login inherit nosuperuser createdb createrole replication bypassrls",
    ...customRoles.map((role) => `create role ${role} nologin`),
    "grant create on database postgres to postgres",
    ...ROLE_BOOTSTRAP_MANAGED_INSTALLER_MEMBERSHIPS.map((membership) =>
      `grant ${membership.grantedRole} to postgres with admin ${membership.adminOption}, inherit ${membership.inheritOption}, set ${membership.setOption} granted by supabase_admin`),
  ];
  return `${statements.join(";\n")};`;
}

function setupScenario(environment, scenario) {
  if (scenario === "wrong_installer") {
    psql(environment, "create role wrong_installer login inherit createrole nosuperuser nocreatedb noreplication nobypassrls; grant create on database postgres to wrong_installer;", "supabase_admin");
    return;
  }

  psql(environment, createTargetSql(), "postgres");
  if (scenario === "installer_createdb_drift") {
    psql(environment, "alter role postgres nocreatedb;", "supabase_admin");
    return;
  }
  if (scenario === "installer_bypassrls_drift") {
    psql(environment, "alter role postgres nobypassrls;", "supabase_admin");
    return;
  }
  if (scenario === "installer_replication_drift") {
    psql(environment, "alter role postgres noreplication;", "supabase_admin");
    return;
  }
  if (scenario === "installer_superuser_drift") {
    psql(environment, "alter role postgres superuser;", "supabase_admin");
    return;
  }
  if (scenario === "installer_missing_membership") {
    psql(environment, "revoke anon from postgres granted by supabase_admin;", "supabase_admin");
    return;
  }
  if (scenario === "installer_extra_membership") {
    psql(environment, "create role unexpected_ambient_role nologin; grant unexpected_ambient_role to postgres with admin false, inherit false, set false granted by supabase_admin;", "supabase_admin");
    return;
  }
  if (scenario === "installer_wrong_grantor") {
    psql(environment, "revoke anon from postgres granted by supabase_admin; create role unexpected_ambient_grantor nologin; grant anon to unexpected_ambient_grantor with admin true, inherit false, set true granted by supabase_admin; grant anon to postgres with admin true, inherit true, set true granted by unexpected_ambient_grantor;", "supabase_admin");
    return;
  }
  if (scenario === "installer_admin_option_drift") {
    psql(environment, "grant anon to postgres with admin false, inherit true, set true granted by supabase_admin;", "supabase_admin");
    return;
  }
  if (scenario === "installer_inherit_option_drift") {
    psql(environment, "grant anon to postgres with admin true, inherit false, set true granted by supabase_admin;", "supabase_admin");
    return;
  }
  if (scenario === "installer_set_option_drift") {
    psql(environment, "grant anon to postgres with admin true, inherit true, set false granted by supabase_admin;", "supabase_admin");
    return;
  }
  const attribute = ["login", "inherit", "bypassrls", "superuser", "createdb", "createrole"].find(
    (candidate) => candidate === scenario,
  );
  if (attribute) {
    psql(environment, `alter role reflab_rls_owner ${attribute};`, "supabase_admin");
    return;
  }
  if (scenario === "admin_option_drift") {
    psql(environment, "grant reflab_rls_owner to postgres with admin false granted by supabase_admin;", "supabase_admin");
  } else if (scenario === "set_option_drift") {
    psql(environment, "grant reflab_rls_owner to postgres with set false granted by postgres;", "postgres");
  } else if (scenario === "inherit_option_drift") {
    psql(environment, "grant reflab_rls_owner to postgres with inherit true granted by postgres;", "postgres");
  } else if (scenario === "incompatible_grantor") {
    psql(environment, "create role unexpected_grantor login; grant reflab_rls_owner to unexpected_grantor with admin true, inherit false, set false;", "supabase_admin");
    psql(environment, "grant reflab_rls_owner to postgres with admin false, inherit false, set true;", "unexpected_grantor");
  } else if (scenario === "unexpected_membership") {
    psql(environment, "create role unexpected_parent nologin; grant unexpected_parent to reflab_rls_owner;", "supabase_admin");
  } else if (scenario === "unexpected_ownership") {
    psql(environment, "create schema unexpected_owned authorization reflab_rls_owner;", "supabase_admin");
  } else if (scenario === "unexpected_grant") {
    psql(environment, "alter default privileges for role supabase_admin grant select on tables to reflab_rls_owner;", "supabase_admin");
  } else if (scenario === "unsafe_table_privilege") {
    psql(environment, "create table unsafe_product_table(id integer); grant insert on table unsafe_product_table to reflab_rls_owner;", "supabase_admin");
  } else if (scenario === "unsafe_sequence_privilege") {
    psql(environment, "create sequence unsafe_product_sequence; grant usage on sequence unsafe_product_sequence to reflab_rls_owner;", "supabase_admin");
  } else if (scenario === "unsafe_schema_create") {
    psql(environment, "create schema unsafe_product_schema; grant create on schema unsafe_product_schema to reflab_rls_owner;", "supabase_admin");
  }
}

function roleFingerprint(environment) {
  return psql(environment, `select pg_catalog.md5(coalesce(pg_catalog.json_agg(x order by x.kind,x.value)::text,'')) from (
    select 'role' kind, pg_catalog.concat_ws(':',rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls) value from pg_catalog.pg_roles where rolname in ('postgres','reflab_rls_owner')
    union all select 'membership',pg_catalog.concat_ws(':',granted.rolname,member_role.rolname,grantor.rolname,m.admin_option,m.inherit_option,m.set_option)
      from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles granted on granted.oid=m.roleid
      join pg_catalog.pg_roles member_role on member_role.oid=m.member
      join pg_catalog.pg_roles grantor on grantor.oid=m.grantor
      where granted.rolname in ('postgres','reflab_rls_owner') or member_role.rolname in ('postgres','reflab_rls_owner')
  ) x;`).stdout.trim();
}

function assertScenarioMutation(environment, scenario) {
  const installerAttribute = {
    installer_createdb_drift: "not rolcreatedb",
    installer_bypassrls_drift: "not rolbypassrls",
    installer_replication_drift: "not rolreplication",
    installer_superuser_drift: "rolsuper",
  }[scenario];
  const roleAttribute = {
    login: "rolcanlogin", inherit: "rolinherit", bypassrls: "rolbypassrls",
    superuser: "rolsuper", createdb: "rolcreatedb", createrole: "rolcreaterole",
  }[scenario];
  let predicate;
  if (installerAttribute) {
    predicate = `exists(select 1 from pg_catalog.pg_roles where rolname='postgres' and ${installerAttribute})`;
  } else if (roleAttribute) {
    predicate = `exists(select 1 from pg_catalog.pg_roles where rolname='reflab_rls_owner' and ${roleAttribute})`;
  } else if (scenario === "installer_missing_membership") {
    predicate = "not exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.roleid join pg_catalog.pg_roles g on g.oid=m.grantor where r.rolname='anon' and m.member='postgres'::regrole and g.rolname='supabase_admin')";
  } else if (scenario === "installer_extra_membership") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m where m.roleid='unexpected_ambient_role'::regrole and m.member='postgres'::regrole)";
  } else if (scenario === "installer_wrong_grantor") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.roleid join pg_catalog.pg_roles g on g.oid=m.grantor where r.rolname='anon' and m.member='postgres'::regrole and g.rolname='unexpected_ambient_grantor')";
  } else if (scenario === "installer_admin_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.roleid join pg_catalog.pg_roles g on g.oid=m.grantor where r.rolname='anon' and m.member='postgres'::regrole and g.rolname='supabase_admin' and not m.admin_option)";
  } else if (scenario === "installer_inherit_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.roleid join pg_catalog.pg_roles g on g.oid=m.grantor where r.rolname='anon' and m.member='postgres'::regrole and g.rolname='supabase_admin' and not m.inherit_option)";
  } else if (scenario === "installer_set_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles r on r.oid=m.roleid join pg_catalog.pg_roles g on g.oid=m.grantor where r.rolname='anon' and m.member='postgres'::regrole and g.rolname='supabase_admin' and not m.set_option)";
  } else if (scenario === "admin_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.grantor where m.roleid='reflab_rls_owner'::regrole and m.member='postgres'::regrole and g.rolname='supabase_admin' and not m.admin_option and not m.inherit_option and not m.set_option)";
  } else if (scenario === "set_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.grantor where m.roleid='reflab_rls_owner'::regrole and m.member='postgres'::regrole and g.rolname='postgres' and not m.set_option)";
  } else if (scenario === "inherit_option_drift") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.grantor where m.roleid='reflab_rls_owner'::regrole and m.member='postgres'::regrole and g.rolname='postgres' and m.inherit_option)";
  } else if (scenario === "incompatible_grantor") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.grantor where m.roleid='reflab_rls_owner'::regrole and m.member='postgres'::regrole and g.rolname='unexpected_grantor')";
  } else if (scenario === "unexpected_membership") {
    predicate = "exists(select 1 from pg_catalog.pg_auth_members where member='reflab_rls_owner'::regrole and roleid='unexpected_parent'::regrole)";
  } else if (scenario === "unexpected_ownership") {
    predicate = "exists(select 1 from pg_catalog.pg_namespace where nspname='unexpected_owned' and nspowner='reflab_rls_owner'::regrole)";
  } else if (scenario === "unexpected_grant") {
    predicate = "exists(select 1 from pg_catalog.pg_default_acl d cross join lateral pg_catalog.aclexplode(d.defaclacl) a where a.grantee='reflab_rls_owner'::regrole)";
  } else if (scenario === "unsafe_table_privilege") {
    predicate = "pg_catalog.has_table_privilege('reflab_rls_owner', 'unsafe_product_table', 'INSERT')";
  } else if (scenario === "unsafe_sequence_privilege") {
    predicate = "pg_catalog.has_sequence_privilege('reflab_rls_owner', 'unsafe_product_sequence', 'USAGE')";
  } else if (scenario === "unsafe_schema_create") {
    predicate = "pg_catalog.has_schema_privilege('reflab_rls_owner', 'unsafe_product_schema', 'CREATE')";
  } else if (scenario === "wrong_installer") {
    predicate = "exists(select 1 from pg_catalog.pg_roles where rolname='wrong_installer' and rolcanlogin and rolcreaterole and not rolsuper and not rolbypassrls)";
  }
  const observed = predicate ? psql(environment, `select ${predicate};`, "supabase_admin").stdout.trim() : "f";
  if (observed !== "t") throw new Error(`HARNESS_SETUP_FAIL: mutation was not installed for ${scenario}`);
}

async function withCluster(scenario, callback) {
  const temporary = mkdtempSync(join(tmpdir(), "reflab-role-bootstrap-"));
  const data = join(temporary, "data");
  const log = join(temporary, "postgres.log");
  const port = await reservePort();
  let started = false;
  try {
    for (const binary of Object.values(binaries)) if (!existsSync(binary)) throw new Error(`PostgreSQL binary unavailable: ${binary}`);
    command(binaries.initdb, ["--auth=trust", "--username=supabase_admin", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    command(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { stdio: "ignore" }); started = true;
    const environment = { port };
    psql(environment, createManagedInstallerSql(), "supabase_admin");
    if (scenarios.includes(scenario)) {
      setupScenario(environment, scenario);
      assertScenarioMutation(environment, scenario);
    }
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
    const before = parseAttestationOutput(psql(environment, attestation).stdout);
    if (scenario === "absent") {
      assertAbsentRoleAttestation(before);
    }
    if (scenario === "exact") psql(environment, createTargetSql(), "postgres");
    if (scenario === "exact") assertRoleAttestation(parseAttestationOutput(psql(environment, attestation).stdout));
    psql(environment, bootstrap);
    if (scenario === "exact") psql(environment, bootstrap);
    const payload = parseAttestationOutput(psql(environment, attestation).stdout);
    assertRoleAttestation(payload);
    const prerequisite = psql(environment, `select count(*)=1 and bool_and(not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole and not rolinherit and not rolbypassrls) from pg_catalog.pg_roles where rolname='reflab_rls_owner';`).stdout.trim();
    if (prerequisite !== "t") throw new Error("Phase 1 reflab_rls_owner prerequisite did not pass.");
    return {
      scenario,
      preBootstrapAttestation: scenario === "absent" ? "ABSENT_PASS" : "EXACT_PASS",
      bootstrap: "PASS",
      attestation: "PASS",
      phase1RolePrerequisite: "PASS",
      cleanup: "PASS",
    };
  });
}

async function negative(scenario) {
  return withCluster(scenario, async (environment) => {
    const before = roleFingerprint(environment);
    if (targetScenarios.includes(scenario) && scenario !== "wrong_installer") {
      const unsafePayload = parseAttestationOutput(psql(environment, attestation).stdout);
      let rejected = false;
      try {
        assertRoleAttestation(unsafePayload);
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error(`Attestation did not detect unsafe state: ${scenario}`);
    }
    const result = psql(environment, bootstrap, scenario === "wrong_installer" ? "wrong_installer" : "postgres", true);
    if (result.status === 0) throw new Error(`Negative did not abort: ${scenario}`);
    const match = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/);
    const expected = scenario === "wrong_installer" || managedInstallerScenarios.includes(scenario)
      ? "42501"
      : "55000";
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
