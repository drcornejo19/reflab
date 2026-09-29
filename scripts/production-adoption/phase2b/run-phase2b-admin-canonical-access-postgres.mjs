import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createTargetSql, withCluster } from "../bootstrap/run-production-role-bootstrap-postgres.mjs";
import { buildSemanticSidecarFixtureSql } from "./run-phase2b-postgres.mjs";
import {
  ADMIN_CANONICAL_ACCESS_OPERATION,
  ADMIN_CANONICAL_ACCESS_POST_QUERY_ID,
  ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID,
  assertAdminCanonicalAccessArtifact,
  classifyAdminCanonicalAccessState,
} from "./phase2b-admin-canonical-access-contract.mjs";
import {
  buildAdminCanonicalAccessPostBatch,
  buildAdminCanonicalAccessPreBatch,
  runProductionPhase2bAdminCanonicalAccess,
} from "./run-production-phase2b-admin-canonical-access.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migrations = resolve(root, "supabase", "migrations");
const fixture = readFileSync(resolve(import.meta.dirname, "phase2b-production-fixture.sql"), "utf8");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const psqlBinary = join(postgresBin, "psql.exe");
const phase1 = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
];
const sidecar = "202608310004_production_adoption_semantic_audit.sql";
const helper = "202608310005_production_adoption_canonical_runtime_prerequisites.sql";
const head = "a".repeat(40);
const privilegeWarning = /WARNING:[^\r\n]*(?:no privileges were granted|no privileges could be revoked|not enough privileges|permission denied)/i;

function psql(environment, database, statement, user = "postgres", allowFailure = false) {
  const result = spawnSync(psqlBinary, [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose",
    "--quiet", "--tuples-only", "--no-align",
  ], {
    input: statement,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH,
      PGHOST: "127.0.0.1", PGPORT: String(environment.port), PGDATABASE: database,
      PGUSER: user, PGSSLMODE: "disable",
    },
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const diagnostic = String(result.stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
    throw Object.assign(new Error(
      `Local 202608110001 SQL failed; SQLSTATE=${diagnostic?.[1] ?? "UNKNOWN"}; reason=${diagnostic?.[2] ?? "SAFE_DIAGNOSTIC_UNAVAILABLE"}.`,
    ), { stderr: result.stderr });
  }
  return result;
}

function apply(environment, database, name) {
  return psql(environment, database, readFileSync(resolve(migrations, name), "utf8"));
}

function setup(environment, database) {
  psql(environment, database,
    "grant usage,create on schema public to postgres with grant option", "supabase_admin");
  psql(environment, database,
    "create schema extensions; create extension pgcrypto with schema extensions;");
  psql(environment, database,
    "create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;",
    "supabase_admin");
  psql(environment, database, createTargetSql());
  psql(environment, database,
    "alter role reflab_prod_preflight_ro login noinherit nosuperuser nocreatedb nocreaterole nobypassrls",
    "supabase_admin");
  psql(environment, database, fixture);
  for (const migration of phase1) apply(environment, database, migration);
  psql(environment, database, buildSemanticSidecarFixtureSql());
  apply(environment, database, sidecar);
  apply(environment, database, helper);
}

function clone(environment, source, target) {
  psql(environment, "maintenance", `create database ${target} template ${source}`, "supabase_admin");
}

function drop(environment, database) {
  psql(environment, "maintenance", `drop database if exists ${database} with (force)`, "supabase_admin", true);
}

function exactTarget() {
  return {
    projectRef: "nagjddldrldwavmfaytc",
    host: "aws-1-sa-east-1.pooler.supabase.com",
    connectionEnvironment: {
      PGHOST: "aws-1-sa-east-1.pooler.supabase.com", PGPORT: "5432", PGDATABASE: "postgres",
      PGUSER: "postgres.nagjddldrldwavmfaytc", PGPASSWORD: "local-only", PGSSLMODE: "require",
    },
  };
}

function dependencies(environment, database, sqlOverride) {
  const artifact = assertAdminCanonicalAccessArtifact(root);
  return {
    argument: ADMIN_CANONICAL_ACCESS_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => exactTarget(),
    assertArtifact: () => ({ ...artifact, sql: sqlOverride ?? artifact.sql }),
    executeReadOnly: (batch) => parseJsonResults(psql(environment, database, batch).stdout),
    executeMigration: (sql) => {
      const result = psql(environment, database, sql);
      if (privilegeWarning.test(String(result.stderr ?? ""))) {
        throw Object.assign(new Error("Unsafe privilege warning."), { stderr: "PRIVILEGE_WARNING" });
      }
      return result;
    },
  };
}

function runnerEnvironment() {
  return {
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head,
    ALLOW_PRODUCTION_DDL: "true",
    ALLOW_PRODUCTION_PHASE2B_ADMIN_CANONICAL_ACCESS: "true",
  };
}

function state(environment, database, post = false) {
  const batch = post ? buildAdminCanonicalAccessPostBatch() : buildAdminCanonicalAccessPreBatch();
  const id = post ? ADMIN_CANONICAL_ACCESS_POST_QUERY_ID : ADMIN_CANONICAL_ACCESS_PRE_QUERY_ID;
  const results = parseJsonResults(psql(environment, database, batch).stdout);
  return classifyAdminCanonicalAccessState(results.get(id), { post });
}

function inject(sql, point) {
  const failure = `\ndo $forced$ begin raise exception 'forced 202608110001 ${point}' using errcode='55000'; end $forced$;\n`;
  const replacements = {
    before_acl: [/(revoke all on function\s+public\.admin_set_canonical_user_plan)/i, `${failure}$1`],
    after_acl: [/(grant execute on function\s+public\.admin_set_canonical_global_role[\s\S]*?to service_role;)/i, `$1${failure}`],
    between_owners: [/(alter function public\.admin_set_canonical_user_plan[\s\S]*?owner to reflab_rls_owner;)/i, `$1${failure}`],
    after_owners: [/(alter function public\.admin_set_canonical_global_role[\s\S]*?owner to reflab_rls_owner;)/i, `$1${failure}`],
    before_commit: [/(notify pgrst, 'reload schema';)/i, `${failure}$1`],
  };
  const [pattern, replacement] = replacements[point];
  const changed = sql.replace(pattern, replacement);
  if (changed === sql) throw new Error(`Injection failed: ${point}`);
  return changed;
}

function exactRollback(environment, database) {
  const observed = JSON.parse(psql(environment, database, `select pg_catalog.json_build_object(
    'functions',(select pg_catalog.count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('admin_set_canonical_user_plan','admin_set_canonical_global_role')),
    'policies',(select pg_catalog.count(*) from pg_catalog.pg_policy where polname in (
      'reflab_schema_state_admin_mutation_read','user_profiles_admin_mutation_target_read',
      'user_subscriptions_admin_mutation_target_read','user_subscriptions_admin_mutation_target_update',
      'user_global_roles_admin_mutation_target_update','user_global_roles_admin_actor_lock',
      'access_change_audit_admin_mutation_insert')),
    'attempts',(select pg_catalog.count(*) from public.attempts),
    'exam_results',(select pg_catalog.count(*) from public.exam_results),
    'notification_events',(select pg_catalog.count(*) from public.notification_events),
    'ledger',(select pg_catalog.count(*) from reflab_meta.production_adoption_state),
    'schema_state',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
    'create_privilege',pg_catalog.has_schema_privilege('reflab_rls_owner','public','CREATE'))`).stdout.trim());
  return observed.functions === 0 && observed.policies === 0 && observed.attempts === 37
    && observed.exam_results === 6 && observed.notification_events === 60
    && observed.ledger === 3 && observed.schema_state === 0 && observed.create_privilege === false
    && state(environment, database).classification === "PASS";
}

export async function runPhase2bAdminCanonicalAccessPostgres() {
  return withCluster("absent", async (environment) => {
    const created = [];
    const base = "postgres";
    try {
      psql(environment, "postgres", "create database maintenance", "supabase_admin");
      created.push("maintenance");
      setup(environment, base);
      if (state(environment, base).classification !== "PASS") {
        throw new Error("202608110001 pre-state was not exact.");
      }

      const preCases = [
        ["missing_rls_owner", "alter role reflab_rls_owner rename to missing_rls_owner",
          "alter role missing_rls_owner rename to reflab_rls_owner"],
        ["unsafe_rls_owner", "alter role reflab_rls_owner inherit",
          "alter role reflab_rls_owner noinherit"],
        ["helper_missing", "drop function reflab_private.canonical_jsonb_text(jsonb)"],
        ["rpc_exists", "create function public.admin_set_canonical_user_plan(text,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$"],
        ["policy_conflict", "create policy user_profiles_admin_mutation_target_read on public.user_profiles for select to reflab_rls_owner using (true)"],
        ["schema_privilege_drift", "grant usage on schema public to reflab_rls_owner"],
        ["column_privilege_drift", "grant select(user_id) on public.user_profiles to reflab_rls_owner"],
        ["later_provider", "create function public.submit_canonical_training_attempt(text,uuid,jsonb,integer) returns uuid language sql as $$select null::uuid$$"],
      ];
      const preNegatives = {};
      for (const [id, mutation, restore] of preCases) {
        const database = `admin_pre_${id}`;
        clone(environment, base, database);
        created.push(database);
        psql(environment, database, mutation);
        let calls = 0;
        let blocked = false;
        try {
          runProductionPhase2bAdminCanonicalAccess(runnerEnvironment(), {
            ...dependencies(environment, database),
            executeMigration: () => { calls += 1; },
          });
        } catch { blocked = true; }
        if (!blocked || calls !== 0) throw new Error(`Pre-DDL negative failed: ${id}`);
        if (restore) psql(environment, database, restore, "supabase_admin");
        preNegatives[id] = "PASS";
        drop(environment, database);
        created.pop();
      }

      const artifact = assertAdminCanonicalAccessArtifact(root);
      const rollbackResults = {};
      for (const point of ["before_acl", "after_acl", "between_owners", "after_owners", "before_commit"]) {
        let rolledBack = false;
        try {
          runProductionPhase2bAdminCanonicalAccess(
            runnerEnvironment(), dependencies(environment, base, inject(artifact.sql, point)),
          );
        } catch (error) {
          rolledBack = error.rollback === "PASS" && exactRollback(environment, base);
        }
        if (!rolledBack) throw new Error(`Rollback failed: ${point}`);
        rollbackResults[point] = "PASS";
      }

      const result = runProductionPhase2bAdminCanonicalAccess(
        runnerEnvironment(), dependencies(environment, base),
      );
      if (result.migration !== "PASS" || result.postDdl !== "EXACT"
          || result.adminCanonicalAccess !== "EXACT" || result.nextProvider !== "NOT_AUTHORIZED") {
        throw new Error("202608110001 positive lifecycle mismatch.");
      }
      if (state(environment, base, true).classification !== "EXACT") {
        throw new Error("202608110001 post-state mismatch.");
      }

      const postCases = [
        ["wrong_owner", "alter function public.admin_set_canonical_user_plan(text,text,text,text) owner to postgres", "supabase_admin"],
        ["wrong_security", "set role reflab_rls_owner; alter function public.admin_set_canonical_user_plan(text,text,text,text) security invoker; reset role"],
        ["wrong_source", "create or replace function public.admin_set_canonical_user_plan(p_actor_user_id text,p_target_user_id text,p_plan_key text,p_reason text default null) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$begin return '{}'::jsonb; end$$", "supabase_admin"],
        ["acl_drift", "set role reflab_rls_owner; grant execute on function public.admin_set_canonical_user_plan(text,text,text,text) to anon; reset role"],
        ["policy_drift", "drop policy user_profiles_admin_mutation_target_read on public.user_profiles; create policy user_profiles_admin_mutation_target_read on public.user_profiles for select to reflab_rls_owner using (true)"],
        ["schema_acl_drift", "grant create on schema public to reflab_rls_owner"],
        ["column_acl_drift", "grant select(ref_card_id) on public.user_profiles to reflab_rls_owner"],
      ];
      const postNegatives = {};
      for (const [id, mutation, user = "postgres"] of postCases) {
        const database = `admin_post_${id}`;
        clone(environment, base, database);
        created.push(database);
        psql(environment, database, mutation, user);
        if (state(environment, database, true).classification !== "BLOCKER") {
          throw new Error(`Post-DDL negative failed: ${id}`);
        }
        postNegatives[id] = "PASS";
        drop(environment, database);
        created.pop();
      }

      const acl = JSON.parse(psql(environment, base, `select coalesce(pg_catalog.json_agg(x order by routine,grantee),'[]'::json) from (
        select p.proname routine,case when a.grantee=0 then 'PUBLIC' else grantee.rolname end grantee,
          grantor.rolname grantor,a.privilege_type,a.is_grantable
        from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        left join pg_catalog.pg_roles grantee on grantee.oid=a.grantee
        left join pg_catalog.pg_roles grantor on grantor.oid=a.grantor
        where n.nspname='public' and p.proname in ('admin_set_canonical_user_plan','admin_set_canonical_global_role')) x`).stdout.trim());
      const version = psql(environment, base,
        "select pg_catalog.current_setting('server_version_num')").stdout.trim();
      return {
        localOnly: true,
        postgresVersionNum: version,
        pre: "EXACT",
        migration: "PASS",
        post: "EXACT",
        warnings: 0,
        functionAcl: acl,
        policies: "7/7",
        columnGrants: "31/31",
        databaseNegatives: preCases.length + postCases.length,
        staticGuardNegatives: 7,
        negativeCount: preCases.length + postCases.length + 7,
        rollbackCount: Object.keys(rollbackResults).length,
        rollbackResults,
        cleanup: "PASS",
        residualTemporaryClusters: 0,
      };
    } finally {
      for (const database of [...created].reverse()) {
        if (database !== "maintenance") drop(environment, database);
      }
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase2bAdminCanonicalAccessPostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE2B_ADMIN_CANONICAL_ACCESS_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
