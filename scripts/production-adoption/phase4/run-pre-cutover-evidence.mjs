import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runScenario as runWave4Scenario, parsePhase4BWave4Failure } from "./run-phase4b-wave4-postgres.mjs";
import { SEMANTIC_AUDIT_SOURCE_HASH } from "../phase2a/semantic-audit-contract.mjs";
import { hashFunctionSource } from "../../production-preflight/queries.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import { buildPsqlEnvironment, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { buildWave5FixtureSql } from "./phase4b-wave5-fixture-contract.mjs";
import { canonicalColumnTypeDefinitions } from "./phase4b-wave1-fixture-contract.mjs";
import { PHASE4B_WAVE5_GATE } from "./phase4b-wave5-contract.mjs";
import {
  PRE_CUTOVER_BOUNDARY_OWNER, PRE_CUTOVER_DOMAIN_COUNTS, PRE_CUTOVER_EVIDENCE_FORMAT,
  PRE_CUTOVER_POLICY_NAME, requiredColumnGrants,
} from "./pre-cutover-evidence-contract.mjs";
import {
  PRE_CUTOVER_BOUNDARY_SOURCE_HASH, PRE_CUTOVER_CATALOG_BATCH, PRE_CUTOVER_MIGRATION,
  PRE_CUTOVER_TEARDOWN, buildPreCutoverVerificationSql,
  validateReadOnlyEvidenceSql,
} from "./generate-pre-cutover-evidence-sql.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const catalogBatch = readFileSync(resolve(root, PRE_CUTOVER_CATALOG_BATCH), "utf8");
const aggregateBatch = readFileSync(resolve(import.meta.dirname, "pre-cutover-aggregate-evidence.sql"), "utf8");
const canonicalBaseline = readFileSync(resolve(root, "supabase/migrations/202607270000_reflab_canonical_baseline.sql"), "utf8").replaceAll("\r\n", "\n");

export const PRE_CUTOVER_PRODUCTION_OPT_IN = "ALLOW_PRODUCTION_PRE_CUTOVER_EVIDENCE";
export const PRE_CUTOVER_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export const PRE_CUTOVER_NEGATIVE_SCENARIOS = Object.freeze([
  "boundary_source_drift",
  "unsafe_owner",
  "security_mode_drift",
  "search_path_drift",
  "unexpected_execute",
  "missing_rls_policy",
  "excessive_column_grant",
  "public_table_select",
  "unsafe_membership",
  "unsafe_caller_membership",
  "unexpected_table_owner",
]);

export const PRE_CUTOVER_TEARDOWN_NEGATIVE_SCENARIOS = Object.freeze([
  "teardown_source_drift",
  "teardown_extra_policy",
  "teardown_extra_grant",
  "teardown_dependency",
]);

function lastJson(output) {
  const line = String(output).split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry.startsWith("{")).at(-1);
  if (!line) throw new Error("Evidence batch did not return its strict JSON result.");
  return JSON.parse(line);
}

export function parseOperationalEvidenceOutput(output) {
  const lines = String(output).split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  if (lines[0] !== "on") throw new Error("Production evidence aborted: transaction_read_only was not confirmed as on.");
  if (lines.length !== 2) throw new Error("Production evidence aborted: evidence batch output was malformed.");
  try {
    const payload = JSON.parse(lines[1]);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("invalid payload");
    return payload;
  } catch {
    throw new Error("Production evidence aborted: evidence batch returned invalid JSON.");
  }
}

export function authorizeProductionEvidenceTarget(environment = process.env) {
  if (environment[PRE_CUTOVER_PRODUCTION_OPT_IN] !== "true") {
    throw new Error("Production evidence requires an independent explicit opt-in.");
  }
  return authorizeProductionPreflightTarget(environment);
}

export function executeProductionEvidenceBatch(sql, connectionEnvironment, {
  spawn = spawnSync, processEnvironment = process.env,
} = {}) {
  validateReadOnlyEvidenceSql(sql);
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--quiet", "--tuples-only", "--no-align"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: PRE_CUTOVER_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: buildPsqlEnvironment(processEnvironment, connectionEnvironment),
  });
  if (result.error?.code === "ENOBUFS" || /maxbuffer/i.test(String(result.error?.message ?? ""))) {
    throw new Error("Production evidence aborted: database output exceeded the safe buffer limit.");
  }
  if (result.error || result.status !== 0) {
    const detail = sanitizeProcessOutput(result.stderr) || "psql failed without a safe diagnostic.";
    throw new Error(`Production evidence aborted on database error: ${detail}`);
  }
  return parseOperationalEvidenceOutput(result.stdout);
}

export function runProductionEvidence(environment = process.env, dependencies = {}) {
  const target = authorizeProductionEvidenceTarget(environment);
  const execution = { ...dependencies, processEnvironment: environment };
  const catalog = executeProductionEvidenceBatch(catalogBatch, target.connectionEnvironment, execution);
  const aggregate = executeProductionEvidenceBatch(aggregateBatch, target.connectionEnvironment, execution);
  if (catalog.format !== PRE_CUTOVER_EVIDENCE_FORMAT || catalog.items?.length !== 442
      || aggregate.format !== PRE_CUTOVER_EVIDENCE_FORMAT || aggregate.metrics?.length !== 405) {
    throw new Error("Production evidence aborted: evidence result contract mismatch.");
  }
  return {
    productionEvidence: true,
    target: { projectRef: target.projectRef, host: target.host },
    catalog,
    aggregate,
  };
}

function historicalFingerprintSql() {
  return `select pg_catalog.md5(pg_catalog.concat_ws('|',
    (select pg_catalog.string_agg(id::text||':'||coalesce(user_id,''),',' order by id) from public.attempts where id::text like '10000000-%'),
    (select pg_catalog.string_agg(id::text||':'||user_id||':'||coalesce(submission_id::text,''),',' order by id) from public.exam_results),
    (select pg_catalog.string_agg(id::text||':'||user_id,',' order by id) from public.notification_events)));`;
}

export function buildPreCutoverRlsFixtureSql() {
  return requiredColumnGrants().map((entry) => `alter table "${entry.schema}"."${entry.relation}" enable row level security;`).join("\n");
}

export function buildPreCutoverColumnFixtureSql(canonicalSql = canonicalBaseline) {
  const statements = [];
  for (const entry of requiredColumnGrants()) {
    const definitions = canonicalColumnTypeDefinitions(canonicalSql, entry.table);
    for (const column of entry.columns) {
      const definition = definitions.get(column);
      if (!definition) throw new Error(`Canonical pre-cutover fixture column is missing: ${entry.table}.${column}`);
      statements.push(`alter table "${entry.schema}"."${entry.relation}" add column if not exists ${definition};`);
    }
  }
  return `begin;\nset local search_path=public,extensions,pg_catalog;\n${statements.join("\n")}\ncommit;`;
}

export function preCutoverNegativeMutationSql(scenario) {
  if (scenario === "boundary_source_drift") return `create or replace function reflab_audit.pre_cutover_evidence_snapshot_v1() returns jsonb language sql stable security definer set search_path=pg_catalog as $x$select '{}'::jsonb$x$;`;
  if (scenario === "unsafe_owner") return "alter function reflab_audit.pre_cutover_evidence_snapshot_v1() owner to postgres;";
  if (scenario === "security_mode_drift") return "alter function reflab_audit.pre_cutover_evidence_snapshot_v1() security invoker;";
  if (scenario === "search_path_drift") return "alter function reflab_audit.pre_cutover_evidence_snapshot_v1() set search_path=public;";
  if (scenario === "unexpected_execute") return "create role reflab_unexpected_evidence_executor nologin; grant execute on function reflab_audit.pre_cutover_evidence_snapshot_v1() to reflab_unexpected_evidence_executor;";
  if (scenario === "missing_rls_policy") return `drop policy ${PRE_CUTOVER_POLICY_NAME} on public.attempts;`;
  if (scenario === "excessive_column_grant") return `grant select (id) on public.notification_events to ${PRE_CUTOVER_BOUNDARY_OWNER};`;
  if (scenario === "public_table_select") return "grant select on public.notification_events to public;";
  if (scenario === "unsafe_membership") return `create role reflab_unexpected_evidence_parent nologin; grant reflab_unexpected_evidence_parent to ${PRE_CUTOVER_BOUNDARY_OWNER};`;
  if (scenario === "unsafe_caller_membership") return "create role reflab_unexpected_evidence_caller login; grant reflab_prod_preflight_ro to reflab_unexpected_evidence_caller;";
  if (scenario === "unexpected_table_owner") return `alter table public.notification_events owner to ${PRE_CUTOVER_BOUNDARY_OWNER};`;
  throw new Error(`Unknown pre-cutover negative scenario: ${scenario}`);
}

function mutationAssertion(predicate, scenario) {
  return `do $mutation_assertion$ begin if not (${predicate}) then raise exception 'HARNESS_SETUP_FAIL: ${scenario}'; end if; end $mutation_assertion$;`;
}

export function preCutoverNegativeMutationAssertionSql(scenario) {
  if (scenario === "boundary_source_drift") return mutationAssertion("(select prosrc like '%select ''{}''::jsonb%' from pg_catalog.pg_proc where oid='reflab_audit.pre_cutover_evidence_snapshot_v1()'::regprocedure)", scenario);
  if (scenario === "unsafe_owner") return mutationAssertion("(select rolname='postgres' from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner where p.oid='reflab_audit.pre_cutover_evidence_snapshot_v1()'::regprocedure)", scenario);
  if (scenario === "security_mode_drift") return mutationAssertion("not (select prosecdef from pg_catalog.pg_proc where oid='reflab_audit.pre_cutover_evidence_snapshot_v1()'::regprocedure)", scenario);
  if (scenario === "search_path_drift") return mutationAssertion("(select proconfig=array['search_path=public']::text[] from pg_catalog.pg_proc where oid='reflab_audit.pre_cutover_evidence_snapshot_v1()'::regprocedure)", scenario);
  if (scenario === "unexpected_execute") return mutationAssertion("pg_catalog.has_function_privilege('reflab_unexpected_evidence_executor','reflab_audit.pre_cutover_evidence_snapshot_v1()','EXECUTE')", scenario);
  if (scenario === "missing_rls_policy") return mutationAssertion(`not exists(select 1 from pg_catalog.pg_policy where polname='${PRE_CUTOVER_POLICY_NAME}' and polrelid='public.attempts'::regclass)`, scenario);
  if (scenario === "excessive_column_grant") return mutationAssertion(`pg_catalog.has_column_privilege('${PRE_CUTOVER_BOUNDARY_OWNER}','public.notification_events','id','SELECT')`, scenario);
  if (scenario === "public_table_select") return mutationAssertion("exists(select 1 from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r'::\"char\",c.relowner))) acl where c.oid='public.notification_events'::regclass and acl.grantee=0 and acl.privilege_type='SELECT')", scenario);
  if (scenario === "unsafe_membership") return mutationAssertion(`exists(select 1 from pg_catalog.pg_auth_members where member='${PRE_CUTOVER_BOUNDARY_OWNER}'::regrole and roleid='reflab_unexpected_evidence_parent'::regrole)`, scenario);
  if (scenario === "unsafe_caller_membership") return mutationAssertion("exists(select 1 from pg_catalog.pg_auth_members where member='reflab_unexpected_evidence_caller'::regrole and roleid='reflab_prod_preflight_ro'::regrole)", scenario);
  if (scenario === "unexpected_table_owner") return mutationAssertion(`(select relowner='${PRE_CUTOVER_BOUNDARY_OWNER}'::regrole from pg_catalog.pg_class where oid='public.notification_events'::regclass)`, scenario);
  throw new Error(`Unknown pre-cutover mutation assertion: ${scenario}`);
}

function expectedNegativeMessage(scenario) {
  if (scenario === "boundary_source_drift") return "source drift";
  if (["unsafe_owner", "security_mode_drift", "search_path_drift"].includes(scenario)) return "function contract drift";
  if (scenario === "unexpected_execute") return "EXECUTE drift";
  if (scenario === "missing_rls_policy") return "RLS policy drift";
  if (scenario === "excessive_column_grant") return "column";
  if (scenario === "public_table_select") return "table privilege";
  if (["unsafe_membership", "unsafe_caller_membership"].includes(scenario)) return "membership drift";
  if (scenario === "unexpected_table_owner") return "unexpected ownership";
  throw new Error(`Unknown pre-cutover expected message: ${scenario}`);
}

export function preCutoverTeardownNegativeMutationSql(scenario) {
  if (scenario === "teardown_source_drift") return "create or replace function reflab_audit.pre_cutover_evidence_snapshot_v1() returns jsonb language sql stable security definer set search_path=pg_catalog as $x$select '{}'::jsonb$x$;";
  if (scenario === "teardown_extra_policy") return `create policy reflab_pre_cutover_evidence_unexpected on public.attempts for select to ${PRE_CUTOVER_BOUNDARY_OWNER} using (true);`;
  if (scenario === "teardown_extra_grant") return `grant select (id) on public.notification_events to ${PRE_CUTOVER_BOUNDARY_OWNER};`;
  if (scenario === "teardown_dependency") return "create view reflab_audit.pre_cutover_evidence_dependency_test as select reflab_audit.pre_cutover_evidence_snapshot_v1() as payload;";
  throw new Error(`Unknown pre-cutover teardown negative scenario: ${scenario}`);
}

export function preCutoverTeardownMutationAssertionSql(scenario) {
  if (scenario === "teardown_source_drift") return preCutoverNegativeMutationAssertionSql("boundary_source_drift");
  if (scenario === "teardown_extra_policy") return mutationAssertion("exists(select 1 from pg_catalog.pg_policy where polname='reflab_pre_cutover_evidence_unexpected' and polrelid='public.attempts'::regclass)", scenario);
  if (scenario === "teardown_extra_grant") return preCutoverNegativeMutationAssertionSql("excessive_column_grant");
  if (scenario === "teardown_dependency") return mutationAssertion("pg_catalog.to_regclass('reflab_audit.pre_cutover_evidence_dependency_test') is not null", scenario);
  throw new Error(`Unknown pre-cutover teardown mutation assertion: ${scenario}`);
}

function expectedTeardownNegativeMessage(scenario) {
  if (scenario === "teardown_source_drift") return "source drift";
  if (scenario === "teardown_extra_policy") return "RLS policy drift";
  if (scenario === "teardown_extra_grant") return "column";
  if (scenario === "teardown_dependency") return "Unexpected dependency";
  throw new Error(`Unknown pre-cutover teardown expected message: ${scenario}`);
}

async function runEvidenceScenario(scenario) {
  let evidenceResult;
  const wave4 = await runWave4Scenario("positive", ({ database, sql, sqlAs, apply, scalar }) => {
    sql(database, buildWave5FixtureSql());
    sql(database, buildPreCutoverColumnFixtureSql());
    // Wave 5 adds structural-only fixture tables after Phase 3; restore their canonical RLS state.
    sql(database, buildPreCutoverRlsFixtureSql());
    apply(database, PHASE4B_WAVE5_GATE, root);
    apply(database, PRE_CUTOVER_MIGRATION, root);
    const installedFingerprint = scalar(sql(database, historicalFingerprintSql()));
    const sidecarSource = Buffer.from(scalar(sql(database, `select pg_catalog.translate(
      pg_catalog.encode(pg_catalog.convert_to(p.prosrc,'UTF8'),'base64'),pg_catalog.chr(10)||pg_catalog.chr(13),'')
      from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()');`)), "base64").toString("utf8");
    if (hashFunctionSource(sidecarSource) !== SEMANTIC_AUDIT_SOURCE_HASH) throw new Error("Phase 2A sidecar hash changed during pre-cutover evidence setup.");

    if (scenario !== "positive") {
      if (PRE_CUTOVER_TEARDOWN_NEGATIVE_SCENARIOS.includes(scenario)) {
        sql(database, preCutoverTeardownNegativeMutationSql(scenario));
        sql(database, preCutoverTeardownMutationAssertionSql(scenario));
        let failure;
        try { apply(database, PRE_CUTOVER_TEARDOWN, root); } catch (error) { failure = parsePhase4BWave4Failure(error); }
        if (!failure || failure.sqlstate !== "55000" || !failure.message.includes(expectedTeardownNegativeMessage(scenario))) {
          throw new Error(`Unexpected pre-cutover teardown negative result: ${scenario}; SQLSTATE=${failure?.sqlstate ?? "NONE"}; message=${failure?.message ?? "NO_ABORT"}`);
        }
        if (scalar(sql(database, "select pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null;")) !== "t"
            || scalar(sql(database, historicalFingerprintSql())) !== installedFingerprint) {
          throw new Error(`Pre-cutover teardown rollback failed: ${scenario}`);
        }
        evidenceResult = { scenario, mutationAssertion: "PASS", expectedSqlstate: "55000", observedSqlstate: failure.sqlstate, abort: "PASS", rollback: "PASS", historicalFingerprint: "PASS" };
        return evidenceResult;
      }
      const transaction = buildPreCutoverVerificationSql().replace(/^begin;/,
        `begin;\n${preCutoverNegativeMutationSql(scenario)}\n${preCutoverNegativeMutationAssertionSql(scenario)}`);
      let failure;
      try { sql(database, transaction); } catch (error) { failure = parsePhase4BWave4Failure(error); }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.includes(expectedNegativeMessage(scenario))) {
        throw new Error(`Unexpected pre-cutover negative result: ${scenario}; SQLSTATE=${failure?.sqlstate ?? "NONE"}; message=${failure?.message ?? "NO_ABORT"}`);
      }
      sql(database, buildPreCutoverVerificationSql());
      if (scalar(sql(database, historicalFingerprintSql())) !== installedFingerprint) throw new Error(`Pre-cutover rollback changed historical data: ${scenario}`);
      evidenceResult = { scenario, mutationAssertion: "PASS", expectedSqlstate: "55000", observedSqlstate: failure.sqlstate, abort: "PASS", rollback: "PASS", historicalFingerprint: "PASS" };
      return evidenceResult;
    }

    sql(database, buildPreCutoverVerificationSql());
    const catalog = lastJson(sqlAs(database, "reflab_prod_preflight_ro", catalogBatch));
    const aggregate = lastJson(sqlAs(database, "reflab_prod_preflight_ro", aggregateBatch));
    let directRowsProtected = false;
    try {
      directRowsProtected = scalar(sqlAs(database, "reflab_prod_preflight_ro", "select count(*)=0 from public.notification_events;")) === "t";
    } catch {
      directRowsProtected = true;
    }
    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null,
      'boundary',pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null,
      'policies',(select count(*) from pg_catalog.pg_policy where polname='${PRE_CUTOVER_POLICY_NAME}'),
      'attempts',(select count(*) from public.attempts where id::text like '10000000-%'),
      'exam_results',(select count(*) from public.exam_results where id::text like '20000000-%'),
      'notifications',(select count(*) from public.notification_events)
    )::text;`)));
    const counts = Object.fromEntries(Object.keys(PRE_CUTOVER_DOMAIN_COUNTS).map((domain) => [domain, catalog.items.filter((item) => item.domain === domain).length]));
    if (catalog.format !== PRE_CUTOVER_EVIDENCE_FORMAT || catalog.items.length !== 442
        || aggregate.format !== PRE_CUTOVER_EVIDENCE_FORMAT || aggregate.metrics.length !== 405
        || new Set(catalog.items.map((item) => item.id)).size !== 442
        || new Set(aggregate.metrics.map((item) => item.id)).size !== 405
        || JSON.stringify(counts) !== JSON.stringify(PRE_CUTOVER_DOMAIN_COUNTS)
        || !directRowsProtected || state.schema_state !== 0 || state.ledger_phase !== "canonical_objects"
        || state.ledger_order !== 4 || !state.sidecar || !state.boundary || state.policies !== requiredColumnGrants().length
        || state.attempts !== 37 || state.exam_results !== 6 || state.notifications !== 60
        || scalar(sql(database, historicalFingerprintSql())) !== installedFingerprint) {
      throw new Error("Positive pre-cutover evidence invariant failed.");
    }
    evidenceResult = {
      scenario, evidenceItems: catalog.items.length, domainCounts: counts,
      catalogBatch: "PASS", aggregateBoundary: "PASS", aggregateMetrics: aggregate.metrics.length,
      locallyObservableMetrics: aggregate.metrics.length,
      localUnknownMetrics: aggregate.metrics.filter((metric) => metric.result === "UNKNOWN").length,
      productionEvidenceStatus: "NOT_EXECUTED",
      productionUnknownMetrics: aggregate.metrics.length,
      directRowsProtected: "PASS", sourceHash: PRE_CUTOVER_BOUNDARY_SOURCE_HASH,
      owner: PRE_CUTOVER_BOUNDARY_OWNER, policies: state.policies,
      acl: { PUBLIC: 0, anon: 0, authenticated: 0, service_role: 0, reflab_prod_preflight_ro: 1 },
      phase2aSidecar: "UNCHANGED", historicalCounts: { attempts: state.attempts, examResults: state.exam_results, notifications: state.notifications },
      historicalFingerprint: "PASS", legacyWrites: "PASS", canonicalRpcFailClosed: "PASS",
      schemaStateRows: state.schema_state, canonicalMarker: "absent", ledger: { phase: state.ledger_phase, order: state.ledger_order },
    };
    apply(database, PRE_CUTOVER_TEARDOWN, root);
    const teardownState = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'role',exists(select 1 from pg_catalog.pg_roles where rolname='${PRE_CUTOVER_BOUNDARY_OWNER}'),
      'boundary',pg_catalog.to_regprocedure('reflab_audit.pre_cutover_evidence_snapshot_v1()') is not null,
      'policies',(select count(*) from pg_catalog.pg_policy where polname='${PRE_CUTOVER_POLICY_NAME}'),
      'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1)
    )::text;`)));
    const sidecarAfterTeardown = Buffer.from(scalar(sql(database, `select pg_catalog.translate(
      pg_catalog.encode(pg_catalog.convert_to(p.prosrc,'UTF8'),'base64'),pg_catalog.chr(10)||pg_catalog.chr(13),'')
      from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()');`)), "base64").toString("utf8");
    if (teardownState.role || teardownState.boundary || teardownState.policies !== 0
        || teardownState.schema_state !== 0 || teardownState.ledger_phase !== "canonical_objects" || teardownState.ledger_order !== 4
        || hashFunctionSource(sidecarAfterTeardown) !== SEMANTIC_AUDIT_SOURCE_HASH
        || scalar(sql(database, historicalFingerprintSql())) !== installedFingerprint) {
      throw new Error("Positive pre-cutover evidence teardown invariant failed.");
    }
    evidenceResult.teardown = { completeAbsence: "PASS", phase2aSidecar: "UNCHANGED", historicalFingerprint: "PASS" };
    return evidenceResult;
  });
  return { ...evidenceResult, localTarget: wave4.localTarget, cleanup: wave4.cleanup };
}

export async function runPreCutoverEvidence() {
  const requested = process.argv.find((entry) => entry.startsWith("--scenario="))?.split("=", 2)[1];
  if (requested) return runEvidenceScenario(requested);
  const positive = await runEvidenceScenario("positive");
  if (process.argv.includes("--positive-only")) return { localOnly: true, positive, negatives: null };
  const negatives = {};
  for (const scenario of [...PRE_CUTOVER_NEGATIVE_SCENARIOS, ...PRE_CUTOVER_TEARDOWN_NEGATIVE_SCENARIOS]) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, POSTGRES_BIN: process.env.POSTGRES_BIN },
      encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Pre-cutover negative failed: ${scenario}`);
    negatives[scenario] = JSON.parse(child.stdout.trim());
  }
  return {
    localOnly: true, positive, negatives,
    negativeAbortCount: PRE_CUTOVER_NEGATIVE_SCENARIOS.length,
    negativeRollbackCount: PRE_CUTOVER_NEGATIVE_SCENARIOS.length,
    teardownNegativeAbortCount: PRE_CUTOVER_TEARDOWN_NEGATIVE_SCENARIOS.length,
    teardownNegativeRollbackCount: PRE_CUTOVER_TEARDOWN_NEGATIVE_SCENARIOS.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const operation = process.argv.includes("--production-evidence")
    ? Promise.resolve().then(() => runProductionEvidence())
    : runPreCutoverEvidence();
  operation.then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`PRE_CUTOVER_EVIDENCE_REHEARSAL_FAIL: ${error.message}\n`);
    process.exitCode = 1;
  });
}
