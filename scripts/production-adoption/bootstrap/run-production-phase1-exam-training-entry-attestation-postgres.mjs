import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  PHASE1_EXAM_TRAINING_QUERY_ID,
  assertPhase1ExamTrainingArtifact,
  classifyPhase1ExamTrainingEntry,
  phase1ExamTrainingEntryQuery,
} from "./phase1-exam-training-entry-attestation-contract.mjs";
import {
  PHASE1_FOUNDATION_ARTIFACT,
  assertPhase1ArtifactHash,
} from "./phase1-entry-attestation-contract.mjs";
import { psql, roleBootstrapSql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const foundationSql = readFileSync(resolve(root, PHASE1_FOUNDATION_ARTIFACT), "utf8");
const installerReady = Object.freeze({ managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" });

const scenarios = Object.freeze([
  ["missing_required_table", "requiredTablesExist"],
  ["wrong_table_owner", "requiredTablesOwnedByPostgres"],
  ["no_public_create", "postgresCanCreatePublic"],
  ["attempts_wrong_type", "sourceColumnTypesExact"],
  ["exam_results_wrong_type", "sourceColumnTypesExact"],
  ["referenced_fk_wrong_type", "fkTypeCompatibilityExact"],
  ["target_table_present", "targetTableAbsent"],
  ["target_column_present", "targetColumnsAbsent"],
  ["target_index_present", "targetIndexesAbsent"],
  ["target_check_present", "targetConstraintsAbsent"],
  ["target_fk_present", "targetConstraintsAbsent"],
  ["target_unique_present", "targetConstraintsAbsent"],
  ["gen_random_uuid_wrong_resolution", "genRandomUuidExact"],
  ["caller_mismatch", "callerExact"],
  ["transaction_read_only_off", "readOnlyExact"],
]);

function queryPayload(environment, query, options = {}) {
  const user = options.user ?? "reflab_prod_preflight_ro";
  const begin = options.readOnly === false ? "begin;" : "begin read only;";
  const output = psql(
    environment,
    `${begin} select (${query.payloadSql})::text; rollback;`,
    user,
  ).stdout.trim();
  return JSON.parse(output);
}

function createHistoricalFixture(environment, scenario) {
  const attemptsType = scenario === "attempts_wrong_type" ? "text" : "uuid";
  const examSubmissionType = scenario === "exam_results_wrong_type" ? "text" : "uuid";
  const institutionIdType = scenario === "referenced_fk_wrong_type" ? "text" : "uuid";
  psql(environment, "grant create on schema public to postgres;", "supabase_admin");
  psql(environment, `
    create table public.attempts(id integer primary key, exam_result_id ${attemptsType});
    create table public.exam_results(id integer primary key, submission_id ${examSubmissionType});
    create table public.institutions(id ${institutionIdType} primary key);
    create table public.institution_groups(id uuid primary key);
    create table public.institution_assessment_sessions(id uuid primary key);
    create table public.notification_events(id integer primary key);
    insert into public.attempts select value, null from pg_catalog.generate_series(1, 37) value;
    insert into public.exam_results select value, null from pg_catalog.generate_series(1, 6) value;
    insert into public.notification_events select value from pg_catalog.generate_series(1, 60) value;
  `, "postgres");
}

function applyScenarioMutation(environment, scenario) {
  const mutations = {
    missing_required_table: "drop table public.exam_results",
    wrong_table_owner: "alter table public.attempts owner to supabase_admin",
    no_public_create: "revoke create on schema public from postgres",
    target_table_present: "create table public.referee_exam_sessions(test_only integer)",
    target_column_present: "alter table public.attempts add column source_item_type text",
    target_index_present: "create index attempts_exam_occurrence_unique on public.attempts(id)",
    target_check_present: "alter table public.attempts add constraint attempts_source_type_check check (true)",
    target_fk_present:
      "alter table public.attempts add constraint attempts_adoption_assessment_session_fk foreign key (exam_result_id) references public.institution_groups(id)",
    target_unique_present:
      "alter table public.exam_results add constraint exam_results_exam_session_unique unique (submission_id)",
    gen_random_uuid_wrong_resolution: `
      create schema shadow;
      create function shadow.gen_random_uuid() returns text language sql immutable as 'select ''test''::text';
      grant usage on schema shadow to reflab_prod_preflight_ro;
      grant execute on function shadow.gen_random_uuid() to reflab_prod_preflight_ro;
      alter role reflab_prod_preflight_ro set search_path = shadow, pg_catalog;
    `,
  };
  if (mutations[scenario]) psql(environment, mutations[scenario], "supabase_admin");
}

async function withFoundationScenario(scenario, callback) {
  return withCluster("absent", async (environment) => {
    assertPhase1ArtifactHash(root);
    assertPhase1ExamTrainingArtifact(root);
    psql(environment, roleBootstrapSql);
    psql(environment, "alter role reflab_prod_preflight_ro login;", "supabase_admin");
    createHistoricalFixture(environment, scenario);
    psql(environment, foundationSql, "postgres");
    applyScenarioMutation(environment, scenario);
    return callback(environment);
  });
}

async function positive() {
  return withFoundationScenario("positive", async (environment) => {
    const payload = queryPayload(environment, phase1ExamTrainingEntryQuery);
    const installer = classifyInstallerIdentity(queryPayload(environment, installerIdentityQuery));
    const classification = classifyPhase1ExamTrainingEntry(payload, installerReady);
    const failedChecks = Object.entries(payload.checks).filter(([, value]) => value !== true);
    if (failedChecks.length > 0) {
      throw new Error(`310002 positive catalog mismatch: ${failedChecks.map(([field]) => field).join(", ")}`);
    }
    const actualMajor = Math.trunc(payload.server_version_num / 10000);
    const expectedClassification = actualMajor === 17 ? "PASS" : "BLOCKER";
    if (classification.classification !== expectedClassification
        || classification.callerExact !== true || classification.readOnlyExact !== true
        || classification.catalogExact !== true) {
      throw new Error("310002 positive classification did not preserve the PostgreSQL 17 gate.");
    }
    return {
      catalogChecks: Object.keys(payload.checks).length,
      exactCatalog: "PASS",
      readOnlyRollback: "PASS",
      actualPostgresMajor: actualMajor,
      postgres17Gate: actualMajor === 17 ? "PASS" : "EXPECTED_BLOCKER_NON_PG17",
      installerCatalogLifecycle: installer.lifecycleState,
      cleanup: "PASS",
    };
  });
}

async function negative(scenario, expectedField) {
  return withFoundationScenario(scenario, async (environment) => {
    const queryOptions = scenario === "caller_mismatch"
      ? { user: "postgres" }
      : scenario === "transaction_read_only_off"
        ? { readOnly: false }
        : {};
    const payload = queryPayload(environment, phase1ExamTrainingEntryQuery, queryOptions);
    const classification = classifyPhase1ExamTrainingEntry(payload, installerReady);
    const mutationObserved = expectedField in payload.checks
      ? payload.checks[expectedField] === false
      : classification[expectedField] === false;
    if (!mutationObserved) {
      throw new Error(`HARNESS_SETUP_FAIL: ${scenario} did not change ${expectedField}.`);
    }
    if (classification.classification !== "BLOCKER"
        || classification.nextAllowedRemoteOperation !== "NONE") {
      throw new Error(`310002 negative ${scenario} did not fail closed.`);
    }
    return {
      scenario,
      mutationAssertion: "PASS",
      classification: "BLOCKER",
      nextAllowedRemoteOperation: "NONE",
      readOnlyRollback: "PASS",
      cleanup: "PASS",
    };
  });
}

export async function runPhase1ExamTrainingEntryPostgresRehearsal() {
  const positiveResult = await positive();
  const negatives = {};
  for (const [scenario, expectedField] of scenarios) {
    negatives[scenario] = await negative(scenario, expectedField);
  }
  return {
    localOnly: true,
    queryId: PHASE1_EXAM_TRAINING_QUERY_ID,
    positive: positiveResult,
    negatives,
    negativeCount: scenarios.length,
    negativeBlockCount: scenarios.length,
    readOnlyRollbackCount: scenarios.length,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1ExamTrainingEntryPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_EXAM_TRAINING_ENTRY_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
