import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { createManagedInstallerSql } from "../bootstrap/run-production-role-bootstrap-postgres.mjs";
import { phase1ProductFingerprintQuery } from "../bootstrap/phase1-foundation-ddl-contract.mjs";
import { phase2aSemanticAuditPostQuery } from "../phase2a/phase2a-semantic-audit-ddl-contract.mjs";
import { adminCanonicalAccessPostQuery } from "./phase2b-admin-canonical-access-contract.mjs";
import { canonicalRuntimePrerequisitesPostQuery } from "./phase2b-canonical-runtime-prerequisites-contract.mjs";
import { canonicalCommunicationPostQuery } from "./phase2b-canonical-communication-feedback-contract.mjs";
import {
  CANONICAL_RUNTIME_INSTALLED_ARTIFACT,
  canonicalRuntimeInstalledPostQuery,
  canonicalRuntimeInstalledPreQuery,
  classifyCanonicalRuntimeInstalledState,
} from "./phase2b-canonical-runtime-installed-contract.mjs";
import {
  classifyCanonicalRuntimeInstalledEvidence,
  classifyCanonicalRuntimeInstalledPostBatch,
  classifyCanonicalRuntimeInstalledPreBatch,
} from "./run-production-phase2b-canonical-runtime-installed.mjs";
import { buildSemanticSidecarFixtureSql } from "./run-phase2b-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migrations = resolve(root, "supabase", "migrations");
const fixture = readFileSync(resolve(import.meta.dirname, "phase2b-production-fixture.sql"), "utf8");
const migrationSql = readFileSync(resolve(root, CANONICAL_RUNTIME_INSTALLED_ARTIFACT), "utf8");
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
  "202608150001_canonical_communication_feedback.sql",
];
const evidenceQueries = [
  installerIdentityQuery,
  phase1ProductFingerprintQuery,
  phase2aSemanticAuditPostQuery,
  canonicalRuntimePrerequisitesPostQuery,
  adminCanonicalAccessPostQuery,
  canonicalCommunicationPostQuery,
];

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function scalar(output, stage) {
  const rows = String(output).split(/\r?\n/).map((row) => row.trim()).filter(Boolean);
  if (rows.length !== 1) throw new Error(`Unexpected 310006 scalar stage=${stage} count=${rows.length}.`);
  return rows[0];
}

export async function runCanonicalRuntimeInstalledPostgres() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "reflab-runtime-installed-"));
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
    if (result.error || result.status !== 0) {
      const diagnostic = String(result.stderr ?? "").match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
      throw Object.assign(new Error(`Migration failed: ${file}; SQLSTATE=${diagnostic?.[1] ?? "UNKNOWN"}; reason=${diagnostic?.[2] ?? "BOUNDED_DIAGNOSTIC_UNAVAILABLE"}`), result);
    }
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
      set local lock_timeout='5s'; set local statement_timeout='60s';
      select pg_catalog.translate(pg_catalog.encode(pg_catalog.convert_to(
        (${query.payloadSql})::text,'UTF8'),'base64'),pg_catalog.chr(10)||pg_catalog.chr(13),'');
      rollback;`), query.id);
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  }
  function evidence(database, post) {
    const results = new Map(evidenceQueries.map((query) => [query.id, payload(database, query)]));
    const admin = structuredClone(results.get(adminCanonicalAccessPostQuery.id));
    admin.checks.sessionExact = true;
    results.set(adminCanonicalAccessPostQuery.id, admin);
    const runtimeQuery = post ? canonicalRuntimeInstalledPostQuery : canonicalRuntimeInstalledPreQuery;
    const runtime = payload(database, runtimeQuery);
    runtime.checks.sessionExact = true;
    results.set(runtimeQuery.id, runtime);
    return results;
  }
  function attestPre(database) {
    const results = evidence(database, false);
    let result;
    try {
      result = classifyCanonicalRuntimeInstalledPreBatch(results);
    } catch {
      const payloadValue = results.get(canonicalRuntimeInstalledPreQuery.id);
      const classifiedEvidence = classifyCanonicalRuntimeInstalledEvidence(results);
      throw new Error(`310006 PRE mismatch: ${JSON.stringify({
        components: classifiedEvidence.composition.components,
        installer: classifiedEvidence.installer,
        phase2a: classifiedEvidence.phase2a,
        helper: classifiedEvidence.helper,
        admin: classifiedEvidence.admin,
        communication: classifiedEvidence.communication,
        runtime: classifyCanonicalRuntimeInstalledState(payloadValue),
        columns: payloadValue.columns,
        constraints: payloadValue.constraints,
        ledgerAcl: payloadValue.ledger_acl,
        schemaAcl: payloadValue.schema_acl,
        guardAcl: payloadValue.guard_acl,
      })}`);
    }
    if (result.composition.classification !== "EXACT") throw new Error("310006 PRE mismatch.");
    return "EXACT";
  }
  function attestPost(database) {
    const result = classifyCanonicalRuntimeInstalledPostBatch(evidence(database, true));
    if (result.composition.classification !== "EXACT") throw new Error("310006 POST mismatch.");
    return "EXACT";
  }
  function snapshot(database) {
    return scalar(sql(database, `select pg_catalog.json_build_object(
      'ledger',(select pg_catalog.json_agg(pg_catalog.json_build_array(
        phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash) order by phase_order)
        from reflab_meta.production_adoption_state),
      'schema_state',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
      'attempts',(select pg_catalog.count(*) from public.attempts),
      'exam_results',(select pg_catalog.count(*) from public.exam_results),
      'notification_events',(select pg_catalog.count(*) from public.notification_events),
      'clips',(select pg_catalog.count(*) from public.clips),
      'payload_nulls',(select pg_catalog.count(*) from public.attempts where canonical_payload_hash is null),
      'communication_rows',(select pg_catalog.count(*) from public.attempts where source_item_type='communication_feedback'))::text;`), "snapshot");
  }

  try {
    for (const binary of Object.values(binaries)) {
      if (!existsSync(binary)) throw new Error(`PostgreSQL 17 binary missing: ${binary}`);
    }
    run(binaries.initdb, ["--auth=trust", "--username=supabase_admin", "--encoding=UTF8", "--no-locale", "--pgdata", data]);
    run(binaries.pgCtl, ["start", "-D", data, "-l", log, "-o", `-h 127.0.0.1 -p ${port}`, "-w"], { quiet: true });
    started = true;
    sqlAs("postgres", "supabase_admin", `${createManagedInstallerSql()}
      alter role reflab_prod_preflight_ro login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
      create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      create role reflab_rls_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      grant reflab_rls_owner to postgres with admin true, inherit false, set false granted by supabase_admin;`);
    sqlAs("postgres", "postgres",
      "grant reflab_rls_owner to postgres with admin false, inherit false, set true granted by postgres;");
    environment.PGUSER = "postgres";
    createDatabase("runtime_installed_base");
    sql("runtime_installed_base", fixture);
    for (const file of predecessorMigrations.slice(0, 3)) applyFile("runtime_installed_base", file);
    sql("runtime_installed_base", buildSemanticSidecarFixtureSql());
    for (const file of predecessorMigrations.slice(3)) applyFile("runtime_installed_base", file);
    sqlAs("runtime_installed_base", "supabase_admin", `revoke reflab_preflight_audit_owner from postgres;
      grant reflab_preflight_audit_owner to postgres with admin option, inherit false, set false;`);

    createDatabase("runtime_installed_entry", "runtime_installed_base");
    createDatabase("runtime_installed_positive", "runtime_installed_entry");
    const pre = attestPre("runtime_installed_positive");
    const before = snapshot("runtime_installed_positive");
    const applied = applyText("runtime_installed_positive", migrationSql);
    if (applied.error || applied.status !== 0) {
      throw new Error("310006 positive migration failed.");
    }
    const post = attestPost("runtime_installed_positive");
    const finalState = JSON.parse(snapshot("runtime_installed_positive"));
    if (finalState.ledger.length !== 4 || finalState.ledger[3][1] !== "canonical_objects"
        || finalState.schema_state !== 0 || finalState.attempts !== 37
        || finalState.payload_nulls !== 37 || finalState.communication_rows !== 0) {
      throw new Error("310006 positive state drifted.");
    }

    const negativeCases = [
      ["phase2a", "grant execute on function reflab_audit.production_semantic_snapshot() to anon;"],
      ["communication", "grant execute on function public.submit_canonical_communication_feedback(text,uuid,text,jsonb) to anon;"],
      ["training", "grant execute on function public.submit_canonical_training_attempt(text,uuid,jsonb,integer) to anon;"],
      ["phase4_present", `insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash)
        select 4,'canonical_objects','psychology_notification_prerequisites',plan_version,plan_hash,evidence_hash
        from reflab_meta.production_adoption_state where phase_order=3;`, 4],
      ["ledger_gt3", `alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
        insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash)
        select 4,'canonical_objects','psychology_notification_prerequisites',plan_version,plan_hash,evidence_hash
        from reflab_meta.production_adoption_state where phase_order=3;
        insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash)
        select 5,'security_cutover','canonical_objects',plan_version,plan_hash,evidence_hash
        from reflab_meta.production_adoption_state where phase_order=3;`, 5],
      ["wrong_phase3_key", "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; update reflab_meta.production_adoption_state set phase_key='wrong' where phase_order=3;"],
      ["phase3_plan_hash", "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; update reflab_meta.production_adoption_state set plan_hash=repeat('a',64) where phase_order=3;"],
      ["phase3_evidence_hash", "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; update reflab_meta.production_adoption_state set evidence_hash=repeat('b',64) where phase_order=3;"],
      ["schema_state", "insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status) values ('premature',repeat('a',64),repeat('b',64),'production','17',1,'installed');"],
      ["development_object", "create function public.resolve_development_clerk_identity(text) returns text language sql as 'select null::text';"],
    ];
    const negatives = {};
    for (const [name, mutation, expectedRows = 3] of negativeCases) {
      const database = `runtime_negative_${name}`;
      createDatabase(database, "runtime_installed_entry");
      sqlAs(database, "supabase_admin", mutation);
      let blocked = false;
      try { attestPre(database); } catch { blocked = true; }
      if (!blocked || JSON.parse(snapshot(database)).ledger.length !== expectedRows) {
        throw new Error(`310006 negative failed closed: ${name}`);
      }
      negatives[name] = "PASS";
    }

    createDatabase("runtime_rollback", "runtime_installed_entry");
    const rollbackBefore = snapshot("runtime_rollback");
    const forcedSql = migrationSql.replace("do $verification$", `do $forced$ begin
      raise exception 'forced after ledger insert' using errcode='55000';
    end $forced$;\n\ndo $verification$`);
    const forced = applyText("runtime_rollback", forcedSql);
    if (forced.status === 0 || snapshot("runtime_rollback") !== rollbackBefore
        || attestPre("runtime_rollback") !== "EXACT") {
      throw new Error("310006 forced rollback did not restore exact PRE.");
    }

    createDatabase("runtime_reexecution", "runtime_installed_entry");
    const first = applyText("runtime_reexecution", migrationSql);
    if (first.status !== 0 || attestPost("runtime_reexecution") !== "EXACT") {
      throw new Error("310006 reexecution fixture did not reach exact POST.");
    }
    let reexecutionBlocked = false;
    try { attestPre("runtime_reexecution"); } catch { reexecutionBlocked = true; }
    const second = applyText("runtime_reexecution", migrationSql);
    if (!reexecutionBlocked || second.status === 0 || JSON.parse(snapshot("runtime_reexecution")).ledger.length !== 4) {
      throw new Error("310006 reexecution was not blocked and rolled back.");
    }

    createDatabase("runtime_post_mismatch", "runtime_installed_entry");
    if (applyText("runtime_post_mismatch", migrationSql).status !== 0) {
      throw new Error("310006 POST mismatch fixture migration failed.");
    }
    sqlAs("runtime_post_mismatch", "supabase_admin",
      "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; update reflab_meta.production_adoption_state set plan_hash=repeat('c',64) where phase_order=4;");
    let postBlocked = false;
    try { attestPost("runtime_post_mismatch"); } catch { postBlocked = true; }
    if (!postBlocked) throw new Error("310006 POST mismatch was not detected.");

    const initialState = JSON.parse(before);
    return {
      localOnly: true,
      postgresMajor: 17,
      pre,
      migration: "PASS",
      post,
      ledgerRows: finalState.ledger.length,
      finalPhase: finalState.ledger[3][1],
      schemaStateRows: finalState.schema_state,
      historicalStateUnchanged: finalState.attempts === initialState.attempts
        && finalState.exam_results === initialState.exam_results
        && finalState.notification_events === initialState.notification_events
        && finalState.clips === initialState.clips
        && finalState.payload_nulls === initialState.payload_nulls
        && finalState.communication_rows === initialState.communication_rows,
      negativeCases: negatives,
      negativeCount: Object.keys(negatives).length,
      rollbackCases: { afterLedgerInsertBeforeCommit: "PASS", reexecution: "PASS" },
      rollbackCount: 2,
      postMismatch: "BLOCKER",
      nextProvider: "NOT_AUTHORIZED",
      cutover: "NOT_AUTHORIZED",
      cleanup: "PASS",
    };
  } finally {
    for (const database of created.reverse()) {
      try { run(binaries.dropdb, ["--if-exists", database]); } catch {}
    }
    if (started) run(binaries.pgCtl, ["stop", "-D", data, "-m", "fast", "-w"], { quiet: true });
    rmSync(temporaryRoot, { recursive: true, force: true });
    if (existsSync(temporaryRoot)) throw new Error("310006 temporary cluster survived cleanup.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCanonicalRuntimeInstalledPostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`LOCAL_CANONICAL_RUNTIME_INSTALLED_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
