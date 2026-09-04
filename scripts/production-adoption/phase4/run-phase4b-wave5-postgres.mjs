import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { runScenario as runWave4Scenario, parsePhase4BWave4Failure } from "./run-phase4b-wave4-postgres.mjs";
import {
  PHASE4B_WAVE5_CHECKS, PHASE4B_WAVE5_FOREIGN_KEYS, PHASE4B_WAVE5_GATE,
  PHASE4B_WAVE5_DATA_EVIDENCE, PHASE4B_WAVE5_NEGATIVE_SCENARIOS, PHASE4B_WAVE5_SUMMARY,
  classifyWave5ObservedCatalog,
} from "./phase4b-wave5-contract.mjs";
import { buildWave5FixtureSql } from "./phase4b-wave5-fixture-contract.mjs";
import { buildPhase4BWave5GateSql } from "./generate-phase4b-wave5.mjs";

const checkTarget = PHASE4B_WAVE5_CHECKS.find((entry) => entry.identity === "public.attempts.attempts_source_type_check");
const fkTarget = PHASE4B_WAVE5_FOREIGN_KEYS.find((entry) => entry.identity === "public.attempts.attempts_exam_result_fk");
if (!checkTarget || !fkTarget) throw new Error("Wave 5 negative target contract is missing.");

const canonicalCheck = `check ${checkTarget.normalizedExpression}`;
const canonicalFk = `foreign key (${fkTarget.sourceColumns.join(",")}) references ${fkTarget.qualifiedTarget}(${fkTarget.targetColumns.join(",")}) match ${fkTarget.matchType} on update ${fkTarget.onUpdate} on delete ${fkTarget.onDelete}`;

const observedCatalogSql = String.raw`
select pg_catalog.jsonb_build_object(
  'checks', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', namespace.nspname,
      'table', relation.relname,
      'constraintName', constraint_row.conname,
      'constraintType', constraint_row.contype,
      'referencedColumns', coalesce((select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum), '[]'::jsonb),
      'expressionHash', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false),'UTF8'),'sha256'),'hex'),
      'validated', constraint_row.convalidated,
      'noInherit', constraint_row.connoinherit,
      'nullableColumns', coalesce((select pg_catalog.jsonb_agg(attribute.attname order by attribute.attname)
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid=constraint_row.conrelid and attribute.attnum>0 and not attribute.attisdropped and not attribute.attnotnull), '[]'::jsonb)
    ))
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation on relation.oid=constraint_row.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname in ('public','reflab_private','reflab_meta') and constraint_row.contype='c'
  ), '[]'::jsonb),
  'foreignKeys', coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'schema', source_namespace.nspname,
      'table', source_relation.relname,
      'constraintName', constraint_row.conname,
      'constraintType', constraint_row.contype,
      'sourceColumns', (select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum),
      'targetSchema', target_namespace.nspname,
      'targetTable', target_relation.relname,
      'targetColumns', (select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality) from pg_catalog.unnest(constraint_row.confkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.confrelid and attribute.attnum=key_position.attnum),
      'matchType', case constraint_row.confmatchtype when 'f' then 'FULL' when 'p' then 'PARTIAL' else 'SIMPLE' end,
      'onUpdate', case constraint_row.confupdtype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end,
      'onDelete', case constraint_row.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' when 'r' then 'RESTRICT' else 'NO ACTION' end,
      'deferrable', constraint_row.condeferrable,
      'initiallyDeferred', constraint_row.condeferred,
      'validated', constraint_row.convalidated
    ))
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class source_relation on source_relation.oid=constraint_row.conrelid
    join pg_catalog.pg_namespace source_namespace on source_namespace.oid=source_relation.relnamespace
    join pg_catalog.pg_class target_relation on target_relation.oid=constraint_row.confrelid
    join pg_catalog.pg_namespace target_namespace on target_namespace.oid=target_relation.relnamespace
    where source_namespace.nspname in ('public','reflab_private','reflab_meta') and constraint_row.contype='f'
  ), '[]'::jsonb)
)::text;
`;

export function wave5NegativeInjectionSql(scenario) {
  if (scenario === "check_wrong_expression") return `alter table public.attempts drop constraint if exists attempts_source_type_check; alter table public.attempts add constraint attempts_source_type_check check (source_item_type is null or source_item_type='wrong');`;
  if (scenario === "check_parentheses_semantic_drift") return `alter table public.attempts drop constraint if exists attempts_source_reference_check; alter table public.attempts add constraint attempts_source_reference_check check ((source_item_type is null and source_item_id is null) or source_occurrence_id is null);`;
  if (scenario === "check_validation_drift") return `alter table public.attempts drop constraint if exists attempts_source_type_check; alter table public.attempts add constraint attempts_source_type_check ${canonicalCheck} not valid;`;
  if (scenario === "check_write_affecting_mismatch") return `alter table public.attempts drop constraint if exists attempts_source_type_check; alter table public.attempts add constraint attempts_source_type_check check (source_item_type is not null) not valid;`;
  if (scenario.startsWith("fk_") && scenario !== "fk_orphan_data") {
    const definition = scenario === "fk_wrong_source" ? `foreign key (source_occurrence_id) references public.exam_results(id)`
      : scenario === "fk_wrong_target" ? `foreign key (exam_result_id) references public.referee_exam_sessions(id)`
      : scenario === "fk_wrong_delete" ? canonicalFk.replace(`on delete ${fkTarget.onDelete}`, "on delete RESTRICT")
      : scenario === "fk_wrong_update" ? canonicalFk.replace(`on update ${fkTarget.onUpdate}`, "on update CASCADE")
      : scenario === "fk_wrong_match" ? canonicalFk.replace(`match ${fkTarget.matchType}`, "match FULL")
      : `${canonicalFk} deferrable initially deferred`;
    return `alter table public.attempts drop constraint if exists attempts_exam_result_fk; alter table public.attempts add constraint attempts_exam_result_fk ${definition} not valid;`;
  }
  if (scenario === "fk_orphan_data") return `alter table public.attempts drop constraint if exists attempts_exam_result_fk; update public.attempts set exam_result_id='ffffffff-ffff-4fff-8fff-ffffffffffff' where id='10000000-0000-4000-8000-000000000001';`;
  if (scenario === "missing_dependency") return "alter table public.exam_results rename to wave5_missing_exam_results;";
  if (scenario === "provider_conflict") return `alter table public.attempts add constraint attempts_exam_result_fk ${canonicalFk}; alter table public.attempts add constraint wave5_duplicate_exam_fk ${canonicalFk};`;
  throw new Error(`Unknown Wave 5 negative scenario: ${scenario}`);
}

export function wave5MutationAssertionSql(scenario) {
  if (scenario === "check_parentheses_semantic_drift") return "select exists(select 1 from pg_catalog.pg_constraint where conrelid='public.attempts'::regclass and conname='attempts_source_reference_check' and pg_catalog.pg_get_expr(conbin,conrelid) like '%source_occurrence_id IS NULL%');";
  if (scenario.startsWith("check_")) return "select exists(select 1 from pg_catalog.pg_constraint where conrelid='public.attempts'::regclass and conname='attempts_source_type_check' and (not convalidated or pg_catalog.pg_get_expr(conbin,conrelid) like '%wrong%' or pg_catalog.pg_get_expr(conbin,conrelid) like '%is not null%'));";
  if (scenario === "fk_orphan_data") return "select count(*)=1 from public.attempts where exam_result_id='ffffffff-ffff-4fff-8fff-ffffffffffff';";
  if (scenario === "missing_dependency") return "select pg_catalog.to_regclass('public.exam_results') is null;";
  if (scenario === "provider_conflict") return "select pg_catalog.array_agg(conname order by conname)=array['attempts_exam_result_fk','wave5_duplicate_exam_fk']::name[] from pg_catalog.pg_constraint where conrelid='public.attempts'::regclass and contype='f' and confrelid='public.exam_results'::regclass;";
  return "select exists(select 1 from pg_catalog.pg_constraint where conrelid='public.attempts'::regclass and conname='attempts_exam_result_fk');";
}

export function wave5GateSqlForScenario(scenario) {
  if (scenario !== "fk_orphan_data") return null;
  const foreignKeys = PHASE4B_WAVE5_FOREIGN_KEYS.map((entry) => entry.identity === fkTarget.identity
    ? { ...entry, dataEvidence: PHASE4B_WAVE5_DATA_EVIDENCE.PRIVILEGED_PRODUCTION }
    : entry);
  return buildPhase4BWave5GateSql(PHASE4B_WAVE5_CHECKS, foreignKeys);
}

function expectedMessage(scenario) {
  if (scenario.startsWith("check_")) return "CHECK contract drift";
  if (scenario === "fk_orphan_data") return "FK orphan data";
  if (scenario === "missing_dependency") return "dependency is missing";
  if (scenario === "provider_conflict") return "provider conflict";
  return "FK contract drift";
}

async function runWave5Scenario(scenario) {
  let wave5Result;
  const wave4 = await runWave4Scenario("positive", ({ database, sql, apply, scalar, historicalBefore }) => {
    sql(database, buildWave5FixtureSql());
    if (scenario !== "positive") {
      sql(database, wave5NegativeInjectionSql(scenario));
      if (scalar(sql(database, wave5MutationAssertionSql(scenario))) !== "t") throw new Error(`HARNESS_SETUP_FAIL: ${scenario}`);
      let failure;
      try {
        const scenarioGate = wave5GateSqlForScenario(scenario);
        if (scenarioGate === null) apply(database, PHASE4B_WAVE5_GATE, process.cwd());
        else sql(database, scenarioGate);
      } catch (error) { failure = parsePhase4BWave4Failure(error); }
      if (!failure || failure.sqlstate !== "55000" || !failure.message.includes(expectedMessage(scenario))) {
        throw new Error(`Unexpected Wave 5 negative result: ${scenario}`);
      }
      wave5Result = { scenario, mutationAssertion: "PASS", expectedSqlstate: "55000", observedSqlstate: failure.sqlstate, abort: "PASS", rollback: "PASS" };
      return wave5Result;
    }
    apply(database, PHASE4B_WAVE5_GATE, process.cwd());
    const classification = classifyWave5ObservedCatalog(JSON.parse(scalar(sql(database, observedCatalogSql))));
    if (classification.checks.SEMANTIC_DRIFT !== 0 || classification.foreignKeys.SEMANTIC_DRIFT !== 0) {
      throw new Error("Wave 5 classification retained semantic drift after the gate.");
    }
    const state = JSON.parse(scalar(sql(database, `select pg_catalog.jsonb_build_object(
      'checks',(select count(*) from pg_catalog.pg_constraint where contype='c'),
      'fks',(select count(*) from pg_catalog.pg_constraint where contype='f'),
      'schema_state',(select count(*) from reflab_meta.reflab_schema_state),
      'ledger_phase',(select phase_key from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'ledger_order',(select phase_order from reflab_meta.production_adoption_state order by phase_order desc limit 1),
      'sidecar',pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is not null
    )::text;`)));
    const classificationFor = (constraintName) => {
      const expected = PHASE4B_WAVE5_CHECKS.find((entry) => entry.catalogConstraintName === constraintName);
      return classification.objects[expected.identity];
    };
    wave5Result = { scenario, contract: PHASE4B_WAVE5_SUMMARY, classification,
      reviewedChecks: {
        institutionsPlanKey: classificationFor("institutions_plan_key_check"),
        userProfilesSubscriptionPlan: classificationFor("user_profiles_subscription_plan_check"),
        attemptsExamSource: classificationFor("attempts_exam_source_check"),
        examResultsPayloadHash: classificationFor("exam_results_payload_hash_check"),
        notificationEventsStatus: classificationFor("notification_events_status_check"),
      },
      dataEvidence: {
        checks: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
        foreignKeys: PHASE4B_WAVE5_DATA_EVIDENCE.SYNTHETIC_FIXTURE,
        authoritativeForProduction: false,
      },
      localCheckViolations: "NON_AUTHORITATIVE_FIXTURE_OBSERVATIONS_NOT_PROMOTED",
      localFkOrphans: "NON_AUTHORITATIVE_FIXTURE_OBSERVATIONS_NOT_PROMOTED",
      migrationCreated: false, schemaStateRows: state.schema_state, canonicalMarker: "absent",
      semanticSidecar: state.sidecar ? "PASS" : "FAIL", ledger: { phase: state.ledger_phase, order: state.ledger_order },
      historicalFingerprint: "PASS", legacyWrites: "PASS", canonicalRpcFailClosed: "PASS" };
    return wave5Result;
  });
  return { ...wave5Result, localTarget: wave4.localTarget, cleanup: wave4.cleanup };
}

export async function runPhase4BWave5Postgres() {
  const requested = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=", 2)[1];
  if (requested) return runWave5Scenario(requested);
  const positive = await runWave5Scenario("positive");
  const negatives = {};
  for (const scenario of PHASE4B_WAVE5_NEGATIVE_SCENARIOS) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), `--scenario=${scenario}`], {
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, PATH: process.env.PATH, POSTGRES_BIN: process.env.POSTGRES_BIN },
      encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    if (child.status !== 0) throw new Error(`Isolated Wave 5 scenario failed: ${scenario}.`);
    const result = JSON.parse(String(child.stdout).trim());
    if (result.abort !== "PASS" || result.rollback !== "PASS" || result.mutationAssertion !== "PASS") throw new Error(`Wave 5 negative contract failed: ${scenario}.`);
    negatives[scenario] = result;
  }
  return { localOnly: true, positive, negatives, negativeAbortCount: Object.keys(negatives).length, negativeRollbackCount: Object.keys(negatives).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.stdout.write(`${JSON.stringify(await runPhase4BWave5Postgres())}\n`);
