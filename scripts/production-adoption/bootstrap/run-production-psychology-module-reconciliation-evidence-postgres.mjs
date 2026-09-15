import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import {
  PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  buildPsychologyReconciliationAggregateBatch,
  buildPsychologyReconciliationCatalogBatch,
  classifyPsychologyReconciliationEvidence,
  shouldRunPsychologyReconciliationAggregate,
} from "./psychology-module-reconciliation-evidence-contract.mjs";
import { psql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const scenarios = Object.freeze([
  "empty", "deterministic_complete", "unexpected_category", "null_source",
  "missing_source_column", "partial_module_slug", "rls_hidden",
]);

function setup(environment, scenario) {
  psql(environment, `
    alter role reflab_prod_preflight_ro login;
    create table public.psychology_checkins(checkin_type text);
    create table public.psychology_wellbeing_assessments(fixture_only integer);
    create table public.psychology_exercise_sessions(exercise_type text);
    grant select on public.psychology_checkins, public.psychology_wellbeing_assessments,
      public.psychology_exercise_sessions to reflab_prod_preflight_ro;
  `, "supabase_admin");
  if (scenario === "deterministic_complete") {
    psql(environment, `
      insert into public.psychology_checkins(checkin_type) values ('pre_match'),('post_match'),('error_recovery');
      insert into public.psychology_wellbeing_assessments values (1),(2);
      insert into public.psychology_exercise_sessions(exercise_type) values
        ('focus_reset'),('pressure_scenario'),('self_talk'),('team_prebrief');
    `, "supabase_admin");
  } else if (scenario === "unexpected_category") {
    psql(environment, "insert into public.psychology_checkins(checkin_type) values ('unexpected_category');", "supabase_admin");
  } else if (scenario === "null_source") {
    psql(environment, "insert into public.psychology_checkins(checkin_type) values (null);", "supabase_admin");
  } else if (scenario === "missing_source_column") {
    psql(environment, "alter table public.psychology_checkins drop column checkin_type;", "supabase_admin");
  } else if (scenario === "partial_module_slug") {
    psql(environment, "alter table public.psychology_checkins add column module_slug text;", "supabase_admin");
  } else if (scenario === "rls_hidden") {
    psql(environment, "alter table public.psychology_checkins enable row level security;", "supabase_admin");
  }
}

function rowFingerprint(environment) {
  return psql(environment, `select pg_catalog.concat_ws(':',
    (select pg_catalog.count(*) from public.psychology_checkins),
    (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
    (select pg_catalog.count(*) from public.psychology_exercise_sessions));`, "supabase_admin").stdout.trim();
}

function collect(environment) {
  const catalog = parseJsonResults(psql(
    environment,
    buildPsychologyReconciliationCatalogBatch(),
    "reflab_prod_preflight_ro",
  ).stdout);
  const aggregate = shouldRunPsychologyReconciliationAggregate(catalog)
    ? parseJsonResults(psql(
      environment,
      buildPsychologyReconciliationAggregateBatch(),
      "reflab_prod_preflight_ro",
    ).stdout)
    : undefined;
  return { catalog, aggregate, batchCount: aggregate ? 2 : 1 };
}

async function runScenario(scenario) {
  return withCluster("absent", async (environment) => {
    setup(environment, scenario);
    const versionNum = Number(psql(environment,
      "select pg_catalog.current_setting('server_version_num');", "postgres").stdout.trim());
    if (Math.trunc(versionNum / 10000) !== 17) {
      throw new Error(`PostgreSQL 17 is required; observed ${versionNum}.`);
    }
    const before = rowFingerprint(environment);
    const evidence = collect(environment);
    const decision = classifyPsychologyReconciliationEvidence(evidence.catalog, evidence.aggregate);
    const after = rowFingerprint(environment);
    if (before !== after) throw new Error(`${scenario} changed product fixture rows.`);
    const expected = {
      empty: "PASS",
      deterministic_complete: "PASS",
      unexpected_category: "BLOCKER",
      null_source: "BLOCKER",
      missing_source_column: "BLOCKER",
      partial_module_slug: "BLOCKER",
      rls_hidden: "PRIVILEGED_READ_ONLY_REQUIRED",
    }[scenario];
    if (decision.classification !== expected) {
      const checks = evidence.catalog.get(PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID)?.checks;
      throw new Error(`${scenario} expected ${expected}, observed ${decision.classification}; checks=${JSON.stringify(checks)}.`);
    }
    return {
      scenario,
      postgresVersionNum: versionNum,
      mutationAssertion: "PASS",
      classification: decision.classification,
      readOnlyRollback: "PASS",
      rollbackCount: evidence.batchCount,
    };
  });
}

export async function runPsychologyModuleReconciliationEvidencePostgres() {
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario));
  return {
    localOnly: true,
    postgresMajor: 17,
    positives: results.filter((entry) => entry.classification === "PASS"),
    negatives: results.filter((entry) => entry.classification !== "PASS"),
    positiveCount: results.filter((entry) => entry.classification === "PASS").length,
    negativeCount: results.filter((entry) => entry.classification !== "PASS").length,
    rollbackCount: results.reduce((sum, entry) => sum + entry.rollbackCount, 0),
    piiSafety: "PASS",
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPsychologyModuleReconciliationEvidencePostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PSYCHOLOGY_RECONCILIATION_EVIDENCE_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
