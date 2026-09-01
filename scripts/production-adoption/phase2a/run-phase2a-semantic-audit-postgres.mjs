import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashFunctionSource } from "../../production-preflight/queries.mjs";
import {
  SEMANTIC_AUDIT_CALLER,
  SEMANTIC_AUDIT_FUNCTION,
  SEMANTIC_AUDIT_OWNER,
  SEMANTIC_AUDIT_SOURCE_HASH,
  semanticAuditTableColumns,
  semanticAuditTables,
} from "./semantic-audit-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(directory, "..", "..", "..");
const migration = resolve(
  repositoryRoot,
  "supabase",
  "migrations",
  "202608310004_production_adoption_semantic_audit.sql",
);
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\18\\bin";
const binaries = {
  initdb: join(postgresBin, "initdb.exe"),
  pgCtl: join(postgresBin, "pg_ctl.exe"),
  createdb: join(postgresBin, "createdb.exe"),
  psql: join(postgresBin, "psql.exe"),
};

function columnType(column) {
  if (["criterion_result", "raw_source_reference"].includes(column)) return "jsonb";
  if (column === "score") return "integer";
  return "text";
}

function fixtureSql() {
  const tables = Object.entries(semanticAuditTableColumns).map(([table, columns]) => {
    const definitions = columns.map((column) => `${column} ${columnType(column)}`).join(", ");
    return `create table ${table} (${definitions});\nalter table ${table} enable row level security;\ngrant select on ${table} to ${SEMANTIC_AUDIT_CALLER};`;
  }).join("\n");

  return `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role ${SEMANTIC_AUDIT_CALLER} login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create schema reflab_meta;
create table reflab_meta.reflab_schema_state (installation_status text);
create table reflab_meta.production_adoption_state (phase_order smallint, phase_key text);
insert into reflab_meta.production_adoption_state values
  (1, 'foundation'),
  (2, 'exam_training_prerequisites'),
  (3, 'psychology_notification_prerequisites');
${tables}

insert into public.user_profiles (user_id) values
  ('user_phase2a_private_001'),
  ('user_phase2a_private_002');
insert into public.user_global_roles (user_id, role_key, source)
  values ('user_phase2a_private_001', 'referee', 'manual');
insert into public.user_subscriptions (user_id, source)
  values ('user_phase2a_private_001', 'manual');
insert into public.referee_exam_sessions (id, user_id, submission_id)
  values ('session-1', 'user_phase2a_private_001', 'submission-1');
insert into public.exam_results (id, user_id, exam_session_id, submission_id)
  values ('exam-1', 'user_phase2a_private_001', 'session-1', 'submission-1');
insert into public.attempts (id, user_id, exam_result_id, source_item_type, score, criterion_result) values
  ('attempt-training', 'user_phase2a_private_001', null, 'field_clip', 100, '{"scoring_version":"field_applicable_v2"}'),
  ('attempt-official', 'user_phase2a_private_001', 'exam-1', 'field_clip', 100, '{"scoring_version":"field_applicable_v2"}');
insert into public.fixtures (id, raw_source_reference)
  values ('fixture-1', '{"created_by":"user_phase2a_private_001","private_payload":"payload_must_not_leak"}');
insert into public.institutions (created_by_user_id) values ('user_phase2a_private_001');
insert into public.institution_memberships (id, institution_id, user_id, status)
  values ('membership-1', 'institution-1', 'user_phase2a_private_001', 'active');
insert into public.appointments (id, institution_id, user_id, created_by_user_id)
  values ('appointment-1', 'institution-1', 'user_phase2a_private_001', 'user_phase2a_private_001');
insert into public.notification_tokens (id, token, user_id)
  values ('token-1', 'token_must_not_leak', 'user_phase2a_private_001');
insert into public.notification_events (id, user_id)
  values ('event-1', 'user_phase2a_private_001');
insert into public.notification_preferences (id, user_id)
  values ('preference-1', 'user_phase2a_private_001');
insert into public.institution_permissions (permission_key)
  select 'permission_' || value from pg_catalog.generate_series(1, 27) value;
insert into public.institution_roles (id, institution_id, role_key)
  select 'role_' || value, null, 'canonical_role_' || value from pg_catalog.generate_series(1, 10) value;
insert into public.institution_role_permissions (role_id)
  select 'role_' || (((value - 1) % 10) + 1) from pg_catalog.generate_series(1, 87) value;
`;
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

export async function runPhase2aSemanticAuditPostgres() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-phase2a-audit-"));
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
    PGDATABASE: "phase2a_semantic_audit",
    PGSSLMODE: "disable",
  };
  let serverStarted = false;

  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {
      env: { ...environment, ...options.environment },
      encoding: "utf8",
      input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  }
  function sql(statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], { input: statement });
  }
  function sqlAs(role, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
      environment: { PGUSER: role },
      input: statement,
    });
  }
  function apply(file) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-f", file]);
  }

  try {
    run(binaries.initdb, ["--auth=trust", "--username=postgres", "--encoding=UTF8", "--no-locale", "--pgdata", dataDirectory]);
    run(binaries.pgCtl, ["start", "-D", dataDirectory, "-l", logPath, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    serverStarted = true;
    run(binaries.createdb, ["phase2a_semantic_audit"]);
    sql(fixtureSql());

    let missingDependencyRolledBack = false;
    sql("alter table public.wellness_logs rename to wellness_logs_missing;");
    try {
      apply(migration);
    } catch (error) {
      const diagnostic = String(error.stderr ?? error);
      if (!diagnostic.includes("Semantic audit dependency table is missing")) {
        throw new Error("Phase 2A negative dependency rehearsal returned an unexpected error.");
      }
      missingDependencyRolledBack = scalar(sql(
        `select pg_catalog.to_regrole('${SEMANTIC_AUDIT_OWNER}') is null and pg_catalog.to_regnamespace('reflab_audit') is null;`,
      )) === "t";
    }
    if (!missingDependencyRolledBack) throw new Error("Phase 2A dependency failure left partial infrastructure.");
    sql("alter table public.wellness_logs_missing rename to wellness_logs;");

    apply(migration);

    const installedSourceBase64 = scalar(sql(`select pg_catalog.translate(
        pg_catalog.encode(pg_catalog.convert_to(function_state.prosrc, 'UTF8'), 'base64'),
        pg_catalog.chr(10) || pg_catalog.chr(13),
        ''
      )
      from pg_catalog.pg_proc function_state
      where function_state.oid = pg_catalog.to_regprocedure('${SEMANTIC_AUDIT_FUNCTION}');`));
    const installedSource = Buffer.from(installedSourceBase64, "base64").toString("utf8");
    if (hashFunctionSource(installedSource) !== SEMANTIC_AUDIT_SOURCE_HASH) {
      throw new Error("Installed semantic audit function source hash does not match the preflight contract.");
    }

    const directRows = scalar(sqlAs(SEMANTIC_AUDIT_CALLER, "select pg_catalog.count(*) from public.user_profiles;"));
    if (!directRows.endsWith("0")) throw new Error("Preflight caller unexpectedly read RLS-hidden rows directly.");

    const snapshot = scalar(sqlAs(SEMANTIC_AUDIT_CALLER, `select ${SEMANTIC_AUDIT_FUNCTION}::text;`));
    for (const sensitive of ["user_phase2a_private_001", "payload_must_not_leak", "token_must_not_leak"]) {
      if (snapshot.includes(sensitive)) throw new Error("Semantic audit snapshot exposed a protected value.");
    }
    const parsed = JSON.parse(snapshot.slice(snapshot.indexOf("{")));
    if (parsed.attempt_semantics.training !== 1 || parsed.attempt_semantics.official !== 1) {
      throw new Error("Semantic audit snapshot did not observe the RLS-hidden fixture.");
    }
    if (parsed.identity_reference_integrity.unresolved_profile_refs !== 0) {
      throw new Error("Semantic audit snapshot reported a synthetic identity orphan.");
    }

    const roleContract = scalar(sql(`select
      not owner.rolcanlogin and not owner.rolsuper and not owner.rolcreatedb
      and not owner.rolcreaterole and not owner.rolinherit and not owner.rolbypassrls
      and not pg_catalog.pg_has_role('${SEMANTIC_AUDIT_CALLER}', '${SEMANTIC_AUDIT_OWNER}', 'MEMBER')
      from pg_catalog.pg_roles owner where owner.rolname = '${SEMANTIC_AUDIT_OWNER}';`));
    if (roleContract !== "t") throw new Error("Semantic audit owner or membership contract is unsafe.");

    for (const role of ["anon", "authenticated", "service_role", "reflab_rls_owner"]) {
      if (scalar(sql(`select pg_catalog.has_function_privilege('${role}', '${SEMANTIC_AUDIT_FUNCTION}', 'EXECUTE');`)) !== "f") {
        throw new Error("An application role can execute the semantic audit function.");
      }
    }

    let membershipEscalationRejected = false;
    try {
      sqlAs(SEMANTIC_AUDIT_CALLER, `set role ${SEMANTIC_AUDIT_OWNER};`);
    } catch {
      membershipEscalationRejected = true;
    }
    if (!membershipEscalationRejected) throw new Error("Preflight caller could assume the semantic audit owner role.");

    let directWriteRejected = false;
    try {
      sqlAs(SEMANTIC_AUDIT_CALLER, "insert into public.user_profiles (user_id) values ('user_forbidden');");
    } catch {
      directWriteRejected = true;
    }
    if (!directWriteRejected) throw new Error("Preflight caller unexpectedly wrote a product row.");

    const markerContract = scalar(sql(`select
      (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) = 0
      and (select pg_catalog.count(*) from reflab_meta.production_adoption_state) = 3;`));
    if (markerContract !== "t") throw new Error("Semantic audit migration changed an adoption marker.");

    return {
      localOnly: true,
      productTables: semanticAuditTables.length,
      directRowsVisibleToCaller: 0,
      aggregateSnapshotObservedRows: true,
      sourceHashExact: true,
      noSensitiveValuesReturned: true,
      noRoleEscalation: true,
      noDirectWrite: true,
      missingDependencyRollback: true,
      canonicalMarkerRows: 0,
      adoptionLedgerRows: 3,
    };
  } finally {
    if (serverStarted) {
      try {
        run(binaries.pgCtl, ["stop", "-D", dataDirectory, "-m", "immediate", "-w"], { quiet: true });
      } catch {
        // The isolated data directory is removed below even if shutdown reports an error.
      }
    }
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runPhase2aSemanticAuditPostgres())}\n`);
}
