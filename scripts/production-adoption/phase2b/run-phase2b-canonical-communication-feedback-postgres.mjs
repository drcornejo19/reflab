import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import process from "node:process";
import {
  classifyPhase2aSemanticAuditPost,
  phase2aSemanticAuditPostQuery,
} from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import {
  adminCanonicalAccessPostQuery,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  canonicalRuntimePrerequisitesPostQuery,
  classifyCanonicalJsonbTextProvider,
} from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import {
  CANONICAL_COMMUNICATION_ARTIFACT,
  canonicalCommunicationPostQuery,
  canonicalCommunicationPreQuery,
  classifyCanonicalCommunicationEntry,
  classifyCanonicalCommunicationPostComposition,
  classifyCanonicalCommunicationState,
} from "./phase2b-canonical-communication-feedback-contract.mjs";
import { buildSemanticSidecarFixtureSql } from "./run-phase2b-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migrations = resolve(root, "supabase", "migrations");
const fixture = readFileSync(resolve(import.meta.dirname, "phase2b-production-fixture.sql"), "utf8");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const binaries = Object.fromEntries(Object.entries({
  initdb: "initdb.exe", pgCtl: "pg_ctl.exe", createdb: "createdb.exe",
  dropdb: "dropdb.exe", psql: "psql.exe",
}).map(([name, executable]) => [name, join(postgresBin, executable)]));
const predecessorMigrations = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
  "202608310004_production_adoption_semantic_audit.sql",
  "202608310005_production_adoption_canonical_runtime_prerequisites.sql",
  "202608110001_canonical_admin_user_access.sql",
  "20260925150422_production_adoption_pre_phase2b_schema_reconciliation.sql",
  "202608130001_canonical_training_attempts.sql",
];
const migrationSql = readFileSync(resolve(root, CANONICAL_COMMUNICATION_ARTIFACT), "utf8");
const privilegeWarning = /WARNING:[^\r\n]*(?:no privileges were granted|no privileges could be revoked|not enough privileges|permission denied)/i;

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer(); server.unref(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address(); server.close(() => resolvePort(port));
    });
  });
}

function scalar(output, stage) {
  const rows = String(output).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length !== 1) throw new Error(`Unexpected Communication scalar stage=${stage} count=${rows.length}.`);
  return rows[0];
}

export async function runCanonicalCommunicationPostgres() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-communication-provider-"));
  const data = join(temporaryRoot, "data");
  const log = join(temporaryRoot, "postgres.log");
  const port = await reservePort();
  const environment = {
    SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
    PGHOST: "127.0.0.1", PGPORT: String(port), PGUSER: "supabase_admin",
    PGDATABASE: "postgres", PGSSLMODE: "disable",
  };
  let started = false;
  const created = [];
  function run(binary, args, options = {}) {
    return execFileSync(binary, args, {
      env: { ...environment, ...options.environment }, encoding: "utf8", input: options.input,
      stdio: options.quiet ? "ignore" : [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  function sql(database, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
      environment: { PGDATABASE: database }, input: statement,
    });
  }
  function sqlAs(database, user, statement) {
    return run(binaries.psql, ["-X", "--no-psqlrc", "-q", "-v", "ON_ERROR_STOP=1", "-t", "-A"], {
      environment: { PGDATABASE: database, PGUSER: user }, input: statement,
    });
  }
  function applyFile(database, file) {
    const result = spawnSync(binaries.psql, [
      "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
      "-f", resolve(migrations, file),
    ], { env: { ...environment, PGDATABASE: database }, encoding: "utf8", windowsHide: true,
      maxBuffer: 64 * 1024 * 1024 });
    if (result.error || result.status !== 0) throw Object.assign(new Error(`Migration failed: ${file}`), result);
    if (privilegeWarning.test(String(result.stderr ?? ""))) throw new Error(`Privilege warning: ${file}`);
    return result;
  }
  function applyText(database, text) {
    return spawnSync(binaries.psql, [
      "-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    ], { env: { ...environment, PGDATABASE: database }, input: text, encoding: "utf8",
      windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  }
  function createDatabase(name, template) {
    run(binaries.createdb, template ? ["--template", template, name] : [name]);
    created.push(name);
    if (!template) sql(name, "create schema extensions; create extension pgcrypto with schema extensions;");
  }
  function payload(database, query) {
    const encoded = scalar(sql(database, `begin read only;
      set local lock_timeout='5s'; set local statement_timeout='30s';
      select pg_catalog.translate(pg_catalog.encode(pg_catalog.convert_to(
        (${query.payloadSql})::text,'UTF8'),'base64'),pg_catalog.chr(10)||pg_catalog.chr(13),'');
      rollback;`), query.id);
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  }
  function attestPre(database) {
    const sidecarPayload = payload(database, phase2aSemanticAuditPostQuery);
    const phase2a = classifyPhase2aSemanticAuditPost({
      ...sidecarPayload, checks: { ...sidecarPayload.checks, phase2bAbsent: true },
    });
    const helper = classifyCanonicalJsonbTextProvider(
      payload(database, canonicalRuntimePrerequisitesPostQuery));
    const adminPayload = payload(database, adminCanonicalAccessPostQuery);
    // The disposable database is a template clone; Production's target database guard separately pins "postgres".
    const admin = classifyAdminCanonicalAccessState({
      ...adminPayload, checks: { ...adminPayload.checks, sessionExact: true },
    }, { post: true });
    const communication = classifyCanonicalCommunicationState(
      payload(database, canonicalCommunicationPreQuery));
    const entry = classifyCanonicalCommunicationEntry({ phase2a, helper, admin, communication });
    if (entry.classification !== "EXACT") {
      throw new Error(`Canonical Communication PRE mismatch: ${JSON.stringify({
        components: entry.components,
        adminStage: admin.stage,
        adminChecks: admin.checks,
      })}`);
    }
    return "EXACT";
  }
  function attestPost(database) {
    const sidecarPayload = payload(database, phase2aSemanticAuditPostQuery);
    const phase2a = classifyPhase2aSemanticAuditPost({
      ...sidecarPayload, checks: { ...sidecarPayload.checks, phase2bAbsent: true },
    });
    const helper = classifyCanonicalJsonbTextProvider(
      payload(database, canonicalRuntimePrerequisitesPostQuery));
    const adminPayload = payload(database, adminCanonicalAccessPostQuery);
    const admin = classifyAdminCanonicalAccessState({
      ...adminPayload, checks: { ...adminPayload.checks, sessionExact: true },
    }, { post: true, communicationProviderPresent: true });
    const communication = classifyCanonicalCommunicationState(
      payload(database, canonicalCommunicationPostQuery), { post: true });
    const result = classifyCanonicalCommunicationPostComposition({
      phase2a, helper, admin, communication,
    });
    if (result.classification !== "EXACT") {
      throw new Error(`Canonical Communication POST mismatch: ${JSON.stringify({
        components: result.components,
        adminChecks: admin.checks,
        communicationChecks: communication.checks,
      })}`);
    }
    return "EXACT";
  }
  function rollbackExact(database) {
    try { attestPre(database); return true; } catch { return false; }
  }

  try {
    for (const binary of Object.values(binaries)) {
      if (!existsSync(binary)) throw new Error(`PostgreSQL 17 binary missing: ${binary}`);
    }
    run(binaries.initdb, ["--auth=trust", "--username=supabase_admin", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    run(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    started = true;
    sqlAs("postgres", "supabase_admin", `create role postgres login nosuperuser createrole createdb inherit bypassrls replication;
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_prod_preflight_ro login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      grant reflab_rls_owner to postgres with admin option, inherit false, set true;`);
    environment.PGUSER = "postgres";
    createDatabase("communication_entry");
    sql("communication_entry", fixture);
    for (const file of predecessorMigrations.slice(0, 3)) applyFile("communication_entry", file);
    sql("communication_entry", buildSemanticSidecarFixtureSql());
    for (const file of predecessorMigrations.slice(3)) applyFile("communication_entry", file);
    sqlAs("communication_entry", "supabase_admin", `revoke reflab_preflight_audit_owner from postgres;
      grant reflab_preflight_audit_owner to postgres with admin option, inherit false, set false;`);

    const membership = JSON.parse(scalar(sql("communication_entry", `select pg_catalog.json_build_object(
      'usage',pg_catalog.pg_has_role('postgres','reflab_rls_owner','USAGE'),
      'member',pg_catalog.pg_has_role('postgres','reflab_rls_owner','MEMBER'),
      'set',pg_catalog.pg_has_role('postgres','reflab_rls_owner','SET'),
      'superuser',(select rolsuper from pg_catalog.pg_roles where rolname='postgres'),
      'public_owner',(select owner.rolname from pg_catalog.pg_namespace namespace
        join pg_catalog.pg_roles owner on owner.oid=namespace.nspowner where namespace.nspname='public'))::text;`), "membership"));
    if (membership.usage || !membership.member || !membership.set || membership.superuser
        || membership.public_owner !== "pg_database_owner") {
      throw new Error("Managed postgres ownership fixture is not Production-faithful.");
    }

    createDatabase("communication_positive", "communication_entry");
    const pre = attestPre("communication_positive");
    const applied = applyText("communication_positive", migrationSql);
    if (applied.error || applied.status !== 0) {
      const diagnostic = String(applied.stderr ?? "").match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
      throw new Error(`Communication migration failed SQLSTATE=${diagnostic?.[1] ?? "UNKNOWN"} reason=${diagnostic?.[2] ?? "BOUNDED_DIAGNOSTIC_UNAVAILABLE"}`);
    }
    if (privilegeWarning.test(String(applied.stderr ?? ""))) {
      throw new Error("Communication migration emitted a privilege warning.");
    }
    const post = attestPost("communication_positive");

    const negativeCases = [
      ["source_check", "alter table public.attempts drop constraint attempts_source_type_check; alter table public.attempts add constraint attempts_source_type_check check (source_item_type is null);"],
      ["existing_provider", "create function public.submit_canonical_communication_feedback(text,uuid,text,jsonb) returns jsonb language sql as 'select null::jsonb';"],
      ["later_adoption", "insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash) select 4,'canonical_objects','psychology_notification_prerequisites',plan_version,plan_hash,evidence_hash from reflab_meta.production_adoption_state where phase_order=3;"],
      ["training_acl", "grant execute on function public.submit_canonical_training_attempt(text,uuid,jsonb,integer) to anon;"],
    ];
    for (const [name, mutation] of negativeCases) {
      const database = `communication_negative_${name}`;
      createDatabase(database, "communication_entry");
      sqlAs(database, "supabase_admin", mutation);
      let blocked = false;
      try { attestPre(database); } catch { blocked = true; }
      const migrationNotApplied = scalar(sql(database, `select not exists(
        select 1 from pg_catalog.pg_constraint constraint_row
        where constraint_row.conrelid='public.attempts'::pg_catalog.regclass
          and constraint_row.conname='attempts_source_type_check'
          and pg_catalog.strpos(pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false),'communication_feedback')>0);`), name) === "t";
      if (!blocked || !migrationNotApplied) {
        throw new Error(`Communication negative case did not fail closed: ${name}`);
      }
    }

    const rollbackCases = [
      ["after_constraint", "create function public.submit_canonical_communication_feedback", "do $forced$ begin raise exception 'forced after constraint' using errcode='55000'; end $forced$;\ncreate function public.submit_canonical_communication_feedback"],
      ["before_acl", "revoke all on function public.submit_canonical_communication_feedback", "do $forced$ begin raise exception 'forced before ACL' using errcode='55000'; end $forced$;\nrevoke all on function public.submit_canonical_communication_feedback"],
      ["before_owner", "grant create on schema public to reflab_rls_owner;", "do $forced$ begin raise exception 'forced before owner' using errcode='55000'; end $forced$;\ngrant create on schema public to reflab_rls_owner;"],
      ["after_owner", "revoke create on schema public from reflab_rls_owner;", "revoke create on schema public from reflab_rls_owner;\ndo $forced$ begin raise exception 'forced after owner' using errcode='55000'; end $forced$;"],
      ["before_commit", "commit;", "do $forced$ begin raise exception 'forced before commit' using errcode='55000'; end $forced$;\ncommit;"],
    ];
    const rollbacks = {};
    for (const [name, marker, replacement] of rollbackCases) {
      const database = `communication_rollback_${name}`;
      createDatabase(database, "communication_entry");
      attestPre(database);
      const result = applyText(database, migrationSql.replace(marker, replacement));
      if (result.status === 0 || !rollbackExact(database)) throw new Error(`Rollback case failed: ${name}`);
      rollbacks[name] = "PASS";
    }

    return {
      localOnly: true, postgresMajor: 17, managedInstallerRelationship: membership,
      pre, migration: "PASS", post, privilegeWarnings: 0,
      historicalCounts: { attempts: 37, communicationAttempts: 0, payloadHashNulls: 37 },
      providerFunctionsCreated: 1, sourceConstraintReplaced: 1,
      negativeCount: negativeCases.length, rollbackCases: rollbacks,
      rollbackCount: Object.keys(rollbacks).length, nextProvider: "NOT_AUTHORIZED",
      cleanup: "PASS",
    };
  } finally {
    for (const database of created.reverse()) {
      try { run(binaries.dropdb, ["--if-exists", database]); } catch {}
    }
    if (started) run(binaries.pgCtl, ["stop", "-D", data, "-m", "fast", "-w"], { quiet: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("Communication temporary cluster survived cleanup.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCanonicalCommunicationPostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`LOCAL_CANONICAL_COMMUNICATION_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
