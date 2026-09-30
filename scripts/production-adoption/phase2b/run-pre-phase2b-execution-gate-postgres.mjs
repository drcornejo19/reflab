import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { createTargetSql, withCluster } from "../bootstrap/run-production-role-bootstrap-postgres.mjs";
import { buildSemanticSidecarFixtureSql } from "./run-phase2b-postgres.mjs";
import {
  PRE_PHASE2B_OPERATION,
  assertPrePhase2bArtifact,
} from "./pre-phase2b-adoption-prerequisite-contract.mjs";
import {
  buildPrePhase2bPreBatch,
  classifyPrePhase2bExecutionGate,
  inspectPrePhase2bExecutionGate,
  runProductionPrePhase2bAdoptionPrerequisite,
} from "./run-production-pre-phase2b-adoption-prerequisite.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const migrations = resolve(root, "supabase", "migrations");
const fixture = readFileSync(resolve(import.meta.dirname, "phase2b-production-fixture.sql"), "utf8");
const postgresBin = process.env.POSTGRES_BIN ?? "C:\\Program Files\\PostgreSQL\\17\\bin";
const psqlBinary = join(postgresBin, "psql.exe");
const head = "a".repeat(40);
const phase1 = [
  "202608310001_production_adoption_foundation.sql",
  "202608310002_production_adoption_exam_training_prerequisites.sql",
  "202608310003_production_adoption_psychology_notifications_prerequisites.sql",
];
const sidecar = "202608310004_production_adoption_semantic_audit.sql";
const helper = "202608310005_production_adoption_canonical_runtime_prerequisites.sql";
const admin = "202608110001_canonical_admin_user_access.sql";

function psql(environment, statement, user = "postgres") {
  const result = spawnSync(psqlBinary, [
    "-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--set", "VERBOSITY=verbose",
    "--quiet", "--tuples-only", "--no-align",
  ], {
    input: statement,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
      PATH: process.env.PATH,
      PGHOST: "127.0.0.1",
      PGPORT: String(environment.port),
      PGDATABASE: "postgres",
      PGUSER: user,
      PGSSLMODE: "disable",
    },
  });
  if (result.error || result.status !== 0) {
    const diagnostic = String(result.stderr ?? "").match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+([^\r\n]+)/);
    throw new Error(
      `Local prerequisite gate SQL failed; SQLSTATE=${diagnostic?.[1] ?? "UNKNOWN"}; reason=${diagnostic?.[2] ?? "SAFE_DIAGNOSTIC_UNAVAILABLE"}.`,
    );
  }
  return result;
}

function apply(environment, migration) {
  return psql(environment, readFileSync(resolve(migrations, migration), "utf8"));
}

function setup(environment) {
  psql(environment, "create schema extensions; create extension pgcrypto with schema extensions;");
  psql(environment,
    "create role legacy_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;",
    "supabase_admin");
  psql(environment, createTargetSql());
  psql(environment,
    "alter role reflab_prod_preflight_ro login noinherit nosuperuser nocreatedb nocreaterole nobypassrls",
    "supabase_admin");
  psql(environment, "alter database postgres owner to postgres", "supabase_admin");
  psql(environment, fixture);
  for (const migration of phase1) apply(environment, migration);
  psql(environment, buildSemanticSidecarFixtureSql());
  apply(environment, sidecar);
  apply(environment, helper);
  apply(environment, admin);
}

function exactTarget() {
  return {
    projectRef: "nagjddldrldwavmfaytc",
    host: "aws-1-sa-east-1.pooler.supabase.com",
    connectionEnvironment: {
      PGHOST: "aws-1-sa-east-1.pooler.supabase.com",
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: "postgres.nagjddldrldwavmfaytc",
      PGPASSWORD: "local-only",
      PGSSLMODE: "require",
    },
  };
}

function runnerEnvironment() {
  return {
    ALLOW_PRODUCTION_DDL: "true",
    ALLOW_PRODUCTION_PRE_PHASE2B_ADOPTION_PREREQUISITE: "true",
    REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head,
  };
}

function dependencies(environment, executeMigration) {
  return {
    argument: PRE_PHASE2B_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => exactTarget(),
    assertArtifact: () => assertPrePhase2bArtifact(root),
    executeReadOnly: (batch) => parseJsonResults(psql(environment, batch).stdout),
    executeMigration: executeMigration ?? ((statement) => psql(environment, statement)),
  };
}

function inspect(environment) {
  const results = parseJsonResults(psql(environment, buildPrePhase2bPreBatch()).stdout);
  return {
    results,
    inspection: inspectPrePhase2bExecutionGate(results),
  };
}

const driftCases = Object.freeze([
  {
    id: "phase2a_sidecar",
    expectedComponent: "sidecar",
    user: "supabase_admin",
    sql: "alter function reflab_audit.production_semantic_snapshot() volatile",
  },
  {
    id: "canonical_jsonb_text",
    expectedComponent: "canonicalJsonbText",
    sql: `create or replace function reflab_private.canonical_jsonb_text(p_value jsonb)
      returns text language plpgsql immutable strict security invoker set search_path=pg_catalog
      as $drift$ begin return 'drift'; end $drift$`,
  },
  {
    id: "admin_canonical_access",
    expectedComponent: "providers",
    user: "supabase_admin",
    sql: `create or replace function public.admin_set_canonical_user_plan(
        p_actor_user_id text,p_target_user_id text,p_plan_key text,p_reason text default null)
      returns jsonb language plpgsql volatile security definer set search_path=pg_catalog
      as $drift$ begin return '{}'::jsonb; end $drift$`,
  },
]);

async function positive() {
  return withCluster("absent", async (environment) => {
    setup(environment);
    const before = inspect(environment);
    classifyPrePhase2bExecutionGate(before.results);
    const result = runProductionPrePhase2bAdoptionPrerequisite(
      runnerEnvironment(), dependencies(environment),
    );
    if (result.migration !== "PASS" || result.postDdl.contract !== "EXACT"
        || result.postDdl.phase2bEntry !== "EXACT"
        || result.nextMigration !== "NOT_AUTHORIZED") {
      throw new Error("Prerequisite positive lifecycle mismatch.");
    }
    return {
      preProviders: "EXACT",
      prerequisitePre: "EXACT",
      migration: "PASS",
      post: "EXACT",
      nextMigration: "NOT_AUTHORIZED",
      cleanup: "PASS",
    };
  });
}

async function negative(testCase) {
  return withCluster("absent", async (environment) => {
    setup(environment);
    psql(environment, testCase.sql, testCase.user ?? "postgres");
    const { inspection } = inspect(environment);
    const componentExact = {
      sidecar: inspection.sidecar.postState === "EXACT",
      canonicalJsonbText: inspection.canonicalJsonbText.classification === "EXACT",
      providers: inspection.providers.classification === "EXACT",
    }[testCase.expectedComponent];
    if (componentExact !== false) {
      throw new Error(`Provider drift was not attributed to ${testCase.expectedComponent}.`);
    }
    let migrationCalls = 0;
    let blocked = false;
    try {
      runProductionPrePhase2bAdoptionPrerequisite(
        runnerEnvironment(),
        dependencies(environment, () => { migrationCalls += 1; }),
      );
    } catch (error) {
      blocked = /PRE_DDL_CONTRACT_MISMATCH/.test(String(error?.message));
    }
    if (!blocked || migrationCalls !== 0) {
      throw new Error(`Provider drift did not block before migration: ${testCase.id}.`);
    }
    return { pre: "BLOCKER", migration: "NOT_EXECUTED", cleanup: "PASS" };
  });
}

export async function runPrePhase2bExecutionGatePostgres() {
  const positiveResult = await positive();
  const negatives = {};
  for (const testCase of driftCases) negatives[testCase.id] = await negative(testCase);
  return {
    localOnly: true,
    postgresMajor: 17,
    positive: positiveResult,
    negatives,
    negativeProviderFamilyCount: driftCases.length,
    migrationNotExecutedCount: Object.values(negatives)
      .filter((result) => result.migration === "NOT_EXECUTED").length,
    residualTemporaryClusters: 0,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPrePhase2bExecutionGatePostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRE_PHASE2B_EXECUTION_GATE_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
