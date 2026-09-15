import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import {
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID,
  buildPrivilegedPsychologyReconciliationAggregateBatch,
  buildPrivilegedPsychologyReconciliationCatalogBatch,
  classifyPrivilegedPsychologyReconciliationEvidence,
  shouldRunPrivilegedPsychologyReconciliationAggregate,
  assertPrivilegedPsychologyEvidenceOutputSafe,
} from "./psychology-module-reconciliation-privileged-evidence-contract.mjs";
import { prepareExamTrainingState } from "./run-production-phase1-psychology-notifications-entry-attestation-postgres.mjs";
import { psql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const scenarios = Object.freeze([
  ["empty", "PASS", "OPTION_A_ONLY"],
  ["deterministic_complete", "PASS", "OPTION_B_ELIGIBLE"],
  ["checkin_null", "BLOCKER", "MANUAL_MAPPING_REQUIRED"],
  ["exercise_null", "BLOCKER", "MANUAL_MAPPING_REQUIRED"],
  ["unknown_checkin", "BLOCKER", "MANUAL_MAPPING_REQUIRED"],
  ["unknown_exercise", "BLOCKER", "MANUAL_MAPPING_REQUIRED"],
  ["partial_module_slug", "BLOCKER", "BLOCKER"],
  ["source_column_missing", "BLOCKER", "BLOCKER"],
  ["wrong_source_type", "BLOCKER", "BLOCKER"],
  ["partial_310003", "BLOCKER", "BLOCKER"],
]);

function prepareReconciliationState(environment) {
  prepareExamTrainingState(environment);
  psql(environment, `
    truncate table public.psychology_checkins,
      public.psychology_wellbeing_assessments,
      public.psychology_exercise_sessions;
    alter table public.psychology_checkins add column checkin_type text;
    alter table public.psychology_exercise_sessions add column exercise_type text;
    alter table public.psychology_checkins drop column module_slug;
    alter table public.psychology_wellbeing_assessments drop column module_slug;
    alter table public.psychology_exercise_sessions drop column module_slug;
  `, "postgres");
}

function mutate(environment, scenario) {
  const sql = {
    empty: null,
    deterministic_complete: `
      insert into public.psychology_checkins(id, checkin_type) values
        (1, 'error_recovery'), (2, 'post_match'), (3, 'pre_match');
      insert into public.psychology_wellbeing_assessments(id) values (1), (2);
      insert into public.psychology_exercise_sessions(id, exercise_type) values
        (1, 'focus_reset'), (2, 'pressure_scenario'), (3, 'self_talk'), (4, 'team_prebrief');`,
    checkin_null: "insert into public.psychology_checkins(id, checkin_type) values (1, null)",
    exercise_null: "insert into public.psychology_exercise_sessions(id, exercise_type) values (1, null)",
    unknown_checkin: "insert into public.psychology_checkins(id, checkin_type) values (1, 'new_category')",
    unknown_exercise: "insert into public.psychology_exercise_sessions(id, exercise_type) values (1, 'new_category')",
    partial_module_slug: "alter table public.psychology_checkins add column module_slug text",
    source_column_missing: "alter table public.psychology_checkins drop column checkin_type",
    wrong_source_type: "alter table public.psychology_exercise_sessions alter column exercise_type type integer using null",
    partial_310003: "create table public.psychology_modules(test_only integer)",
  }[scenario];
  if (sql) psql(environment, sql, "postgres");
}

function productFingerprint(environment) {
  return psql(environment, `select pg_catalog.concat_ws(':',
    (select pg_catalog.count(*) from public.attempts),
    (select pg_catalog.count(*) from public.exam_results),
    (select pg_catalog.count(*) from public.notification_events));`, "postgres").stdout.trim();
}

function psychologyFingerprint(environment) {
  return psql(environment, `select pg_catalog.concat_ws(':',
    (select pg_catalog.count(*) from public.psychology_checkins),
    (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
    (select pg_catalog.count(*) from public.psychology_exercise_sessions));`, "postgres").stdout.trim();
}

function collect(environment) {
  const catalog = parseJsonResults(psql(
    environment,
    buildPrivilegedPsychologyReconciliationCatalogBatch(),
    "postgres",
  ).stdout);
  const aggregate = shouldRunPrivilegedPsychologyReconciliationAggregate(catalog)
    ? parseJsonResults(psql(
      environment,
      buildPrivilegedPsychologyReconciliationAggregateBatch(),
      "postgres",
    ).stdout)
    : undefined;
  const payload = aggregate?.get(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID);
  if (payload) assertPrivilegedPsychologyEvidenceOutputSafe(payload);
  return { catalog, aggregate, batchCount: aggregate ? 2 : 1 };
}

async function runScenario([scenario, expectedClassification, expectedEligibility]) {
  return withCluster("absent", async (environment) => {
    prepareReconciliationState(environment);
    mutate(environment, scenario);
    const versionNum = Number(psql(
      environment,
      "select pg_catalog.current_setting('server_version_num');",
      "postgres",
    ).stdout.trim());
    if (Math.trunc(versionNum / 10000) !== 17) {
      throw new Error(`PostgreSQL 17 is required; observed ${versionNum}.`);
    }
    const productBefore = productFingerprint(environment);
    const psychologyBefore = psychologyFingerprint(environment);
    const collected = collect(environment);
    const decision = classifyPrivilegedPsychologyReconciliationEvidence(
      collected.catalog,
      collected.aggregate,
    );
    const productAfter = productFingerprint(environment);
    const psychologyAfter = psychologyFingerprint(environment);
    if (productBefore !== "37:6:60" || productAfter !== productBefore
        || psychologyAfter !== psychologyBefore) {
      throw new Error(`${scenario} changed or failed the product fingerprint contract.`);
    }
    if (decision.classification !== expectedClassification
        || decision.reconciliationEligibility !== expectedEligibility) {
      throw new Error(`${scenario} expected ${expectedClassification}/${expectedEligibility}, observed ${decision.classification}/${decision.reconciliationEligibility}.`);
    }
    return {
      scenario,
      postgresVersionNum: versionNum,
      mutationAssertion: "PASS",
      classification: decision.classification,
      reconciliationEligibility: decision.reconciliationEligibility,
      productFingerprint: productAfter,
      readOnlyRollback: "PASS",
      rollbackCount: collected.batchCount,
    };
  });
}

export async function runPrivilegedPsychologyReconciliationEvidencePostgres() {
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));
  const positives = results.filter((entry) => entry.classification === "PASS");
  const negatives = results.filter((entry) => entry.classification !== "PASS");
  return {
    localOnly: true,
    postgresMajor: 17,
    fixedQueryCount: 4,
    positives,
    negatives,
    positiveCount: positives.length,
    negativeCount: negatives.length,
    rollbackCount: results.reduce((sum, entry) => sum + entry.rollbackCount, 0),
    productFingerprint: "37:6:60",
    piiSafety: "PASS",
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPrivilegedPsychologyReconciliationEvidencePostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PRIVILEGED_PSYCHOLOGY_RECONCILIATION_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
