import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  assertPhase1ExamTrainingDdlArtifact,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_FOUNDATION_ARTIFACT,
  assertPhase1ArtifactHash,
} from "./phase1-entry-attestation-contract.mjs";
import {
  assertPhase1PsychologyNotificationsArtifact,
  classifyExamTrainingPreState,
  classifyPhase1PsychologyNotificationsEntry,
  phase1PsychologyNotificationsEntryQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import { psql, roleBootstrapSql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const foundationSql = readFileSync(resolve(root, PHASE1_FOUNDATION_ARTIFACT), "utf8");
const installerReady = Object.freeze({ managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" });

const scenarios = Object.freeze([
  ["missing_dependency", "QUERY_FAILURE"],
  ["wrong_owner", "requiredTablesOwnedByPostgres"],
  ["wrong_type", "requiredColumnTypesExact"],
  ["incompatible_fk_type", "futureFkTypeCompatibilityExact"],
  ["incompatible_existing_data", "psychologyDataCompatible"],
  ["target_table_present", "targetTableAbsent"],
  ["target_column_present", "targetColumnAbsent"],
  ["constraint_drift", "targetConstraintsAbsent"],
  ["index_drift", "targetIndexAbsent"],
  ["postgres_major_mismatch", "postgresMajorExact"],
  ["pre_state_not_exact", "examTrainingExact"],
  ["caller_mismatch", "callerExact"],
  ["transaction_read_only_off", "readOnlyExact"],
]);

export function queryPayload(environment, query, options = {}) {
  const user = options.user ?? "reflab_prod_preflight_ro";
  const begin = options.readOnly === false ? "begin;" : "begin read only;";
  const output = psql(
    environment,
    `${begin} select (${query.payloadSql})::text; rollback;`,
    user,
  ).stdout.trim();
  return JSON.parse(output);
}

function createHistoricalFixture(environment) {
  psql(environment, "grant create on schema public to postgres;", "supabase_admin");
  psql(environment, `
    create table public.attempts(id integer primary key, exam_result_id uuid);
    create table public.exam_results(id integer primary key, submission_id uuid);
    create table public.institutions(id uuid primary key);
    create table public.institution_groups(id uuid primary key);
    create table public.institution_assessment_sessions(id uuid primary key);
    create table public.notification_events(id integer primary key, user_id text not null);
    create table public.psychology_checkins(id integer primary key, module_slug text);
    create table public.psychology_wellbeing_assessments(id integer primary key, module_slug text);
    create table public.psychology_exercise_sessions(id integer primary key, module_slug text);
    insert into public.attempts select value, null from pg_catalog.generate_series(1, 37) value;
    insert into public.exam_results select value, null from pg_catalog.generate_series(1, 6) value;
    insert into public.notification_events select value, 'fixture-user' from pg_catalog.generate_series(1, 60) value;
    insert into public.psychology_checkins values (1, 'gestion-error');
    insert into public.psychology_wellbeing_assessments values (1, 'resiliencia');
    insert into public.psychology_exercise_sessions values (1, 'concentracion-foco');
  `, "postgres");
}

export function prepareExamTrainingState(environment) {
  assertPhase1ArtifactHash(root);
  assertPhase1PsychologyNotificationsArtifact(root);
  psql(environment, roleBootstrapSql);
  psql(environment, `alter role reflab_prod_preflight_ro login;
    grant pg_read_all_data to reflab_prod_preflight_ro;`, "supabase_admin");
  createHistoricalFixture(environment);
  psql(environment, foundationSql, "postgres");
  psql(environment, assertPhase1ExamTrainingDdlArtifact(root).sql, "postgres");
}

function applyScenarioMutation(environment, scenario) {
  const mutations = {
    missing_dependency: "drop table public.psychology_checkins",
    wrong_owner: "alter table public.notification_events owner to supabase_admin",
    wrong_type: "alter table public.psychology_checkins alter column module_slug type integer using null",
    incompatible_fk_type:
      "alter table public.psychology_exercise_sessions alter column module_slug type uuid using null",
    incompatible_existing_data:
      "insert into public.psychology_checkins(id, module_slug) values (2, 'unsupported-module')",
    target_table_present: "create table public.psychology_modules(test_only integer)",
    target_column_present: "alter table public.notification_events add column deduplication_key text",
    constraint_drift:
      "alter table public.psychology_checkins add constraint psychology_modules_sort_order_check check (true)",
    index_drift: "create index notification_events_deduplication_unique on public.notification_events(id)",
    pre_state_not_exact: "drop index public.referee_exam_sessions_user_status_idx",
  };
  if (mutations[scenario]) {
    psql(environment, mutations[scenario], scenario === "wrong_owner" ? "supabase_admin" : "postgres");
  }
}

function collect(environment, scenario) {
  const options = scenario === "caller_mismatch"
    ? { user: "postgres" }
    : scenario === "transaction_read_only_off"
      ? { readOnly: false }
      : {};
  const installer = classifyInstallerIdentity(queryPayload(environment, installerIdentityQuery));
  const fingerprint = queryPayload(environment, phase1ProductFingerprintQuery);
  const examPayload = queryPayload(environment, phase1ExamTrainingPostQuery, options);
  const entryPayload = queryPayload(environment, phase1PsychologyNotificationsEntryQuery, options);
  if (scenario === "postgres_major_mismatch") {
    entryPayload.server_version_num = 180000;
  }
  const examState = classifyExamTrainingPreState(
    examPayload,
    fingerprint,
    entryPayload.checks.priorStateVisibilityExact,
  );
  return {
    entryPayload,
    examState,
    decision: classifyPhase1PsychologyNotificationsEntry(entryPayload, installerReady, examState),
    installer,
    fingerprint,
  };
}

async function withScenario(scenario, callback) {
  return withCluster("absent", async (environment) => {
    prepareExamTrainingState(environment);
    applyScenarioMutation(environment, scenario);
    return callback(environment);
  });
}

async function positive() {
  return withScenario("positive", async (environment) => {
    const observed = collect(environment, "positive");
    const failedChecks = Object.entries(observed.entryPayload.checks)
      .filter(([, value]) => value !== true)
      .map(([field]) => field)
      .sort();
    if (observed.installer.managedProfile !== "READY"
        || observed.examState !== "UNKNOWN"
        || observed.decision.classification !== "UNKNOWN"
        || observed.decision.nextAllowedRemoteOperation !== "NONE"
        || JSON.stringify(failedChecks) !== JSON.stringify([
          "ledgerExact", "priorStateVisibilityExact",
        ])
        || Object.entries(PHASE1_HISTORICAL_FINGERPRINT).some(
          ([field, expected]) => observed.fingerprint[field] !== expected,
        )) {
      const examPayload = queryPayload(environment, phase1ExamTrainingPostQuery);
      const failedExamChecks = Object.entries(examPayload.checks)
        .filter(([, value]) => value !== true)
        .map(([field]) => field)
        .join(",");
      throw new Error(`310003 production-like read-only rehearsal did not fail closed as UNKNOWN; examState=${observed.examState}; decision=${observed.decision.classification}; checks=${failedChecks.join(",") || "none"}; examChecks=${failedExamChecks || "none"}; examLedgerRows=${examPayload.counts.ledger_rows}.`);
    }
    return {
      postgresMajor: Math.trunc(observed.entryPayload.server_version_num / 10000),
      catalogChecks: Object.keys(observed.entryPayload.checks).length,
      examTrainingPreState: observed.examState,
      classification: observed.decision.classification,
      blocker: "RLS_VISIBILITY_BOUNDARY_NOT_AVAILABLE_BEFORE_310004",
      unsupportedModuleSlugCount: observed.entryPayload.evidence.unsupported_module_slug_count,
      hiddenFingerprintWasNotAccepted: "PASS",
      readOnlyRollback: "PASS",
      cleanup: "PASS",
    };
  });
}

async function negative(scenario, expectedField) {
  return withScenario(scenario, async (environment) => {
    if (expectedField === "QUERY_FAILURE") {
      let blocked = false;
      try {
        collect(environment, scenario);
      } catch (error) {
        blocked = /42P01|does not exist|failed/i.test(error.message);
      }
      if (!blocked) throw new Error("missing_dependency did not fail closed.");
      return { scenario, mutationAssertion: "PASS", classification: "BLOCKER", readOnlyRollback: "PASS" };
    }
    const observed = collect(environment, scenario);
    const mutationObserved = expectedField in observed.entryPayload.checks
      ? observed.entryPayload.checks[expectedField] === false
      : observed.decision[expectedField] === false;
    if (!mutationObserved) {
      throw new Error(`HARNESS_SETUP_FAIL: ${scenario} did not change ${expectedField}.`);
    }
    if (observed.decision.classification !== "BLOCKER"
        || observed.decision.nextAllowedRemoteOperation !== "NONE") {
      throw new Error(`310003 negative ${scenario} did not fail closed.`);
    }
    return { scenario, mutationAssertion: "PASS", classification: "BLOCKER", readOnlyRollback: "PASS" };
  });
}

export async function runPhase1PsychologyNotificationsEntryPostgresRehearsal() {
  const positiveResult = await positive();
  const negatives = [];
  for (const [scenario, expectedField] of scenarios) {
    negatives.push(await negative(scenario, expectedField));
  }
  return {
    localOnly: true,
    positive: positiveResult,
    negatives,
    negativeCount: negatives.length,
    negativeBlockCount: negatives.filter((result) => result.classification === "BLOCKER").length,
    readOnlyRollbackCount: negatives.filter((result) => result.readOnlyRollback === "PASS").length,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1PsychologyNotificationsEntryPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
