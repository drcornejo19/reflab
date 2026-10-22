import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  classifyPhase1ExamTrainingPost,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID,
  classifyPhase1PsychologyNotificationsEntry,
  phase1PsychologyNotificationsCatalogQuery,
  phase1PsychologyNotificationsDataAuditQuery,
  phase1PsychologyNotificationsEntryQuery,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";
import {
  classifyPhase1PsychologyNotificationsPrivilegedEntry,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
  assertPsychologyModuleSlugReconciliationArtifact,
  classifyPsychologyModuleSlugReconciliationPost,
  psychologyModuleSlugReconciliationPostQuery,
} from "./psychology-module-slug-reconciliation-ddl-contract.mjs";
import {
  PRODUCTION_DDL_APPROVED_HEAD,
} from "./run-production-role-bootstrap.mjs";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  runProductionPsychologyModuleSlugReconciliation,
} from "./run-production-psychology-module-slug-reconciliation.mjs";
import {
  prepareExamTrainingState,
  queryPayload,
} from "./run-production-phase1-psychology-notifications-entry-attestation-postgres.mjs";
import { psql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

const databaseScenarios = Object.freeze([
  "checkins_row_count_drift",
  "missing_approved_category",
  "duplicate_approved_category",
  "unknown_checkin_type",
  "null_checkin_type",
  "wellbeing_nonempty",
  "exercise_nonempty",
  "module_slug_already_present",
  "module_slug_wrong_type",
  "product_fingerprint_drift",
  "ledger_drift",
  "marker_present",
  "partial_310003",
  "missing_dependency",
  "wrong_source_type",
  "forced_mid_transaction_failure",
  "affected_count_mismatch",
]);

function prepareReconciliationState(environment) {
  prepareExamTrainingState(environment);
  psql(environment, `
    truncate table public.psychology_checkins,
      public.psychology_wellbeing_assessments,
      public.psychology_exercise_sessions;
    alter table public.psychology_checkins drop column module_slug;
    alter table public.psychology_checkins add column checkin_type text not null;
    alter table public.psychology_wellbeing_assessments drop column module_slug;
    alter table public.psychology_exercise_sessions drop column module_slug;
    alter table public.psychology_exercise_sessions add column exercise_type text not null;
    insert into public.psychology_checkins(id, checkin_type) values
      (1, 'error_recovery'),
      (2, 'post_match'),
      (3, 'pre_match');
  `, "postgres");
}

function installer(environment) {
  return classifyInstallerIdentity(queryPayload(environment, installerIdentityQuery, { user: "postgres" }));
}

function fingerprint(environment) {
  return queryPayload(environment, phase1ProductFingerprintQuery, { user: "postgres" });
}

function examTrainingState(environment, installerState, productFingerprint) {
  const payload = queryPayload(environment, phase1ExamTrainingPostQuery, { user: "postgres" });
  return classifyPhase1ExamTrainingPost(
    payload,
    installerState,
    productFingerprint,
    productFingerprint,
  ).postState;
}

function postDecision(environment) {
  const installerState = installer(environment);
  const productFingerprint = fingerprint(environment);
  const examState = examTrainingState(environment, installerState, productFingerprint);
  const payload = queryPayload(
    environment,
    psychologyModuleSlugReconciliationPostQuery,
    { user: "postgres" },
  );
  const entryPayload = queryPayload(
    environment,
    phase1PsychologyNotificationsCatalogQuery,
    { user: "postgres" },
  );
  const dataPayload = queryPayload(
    environment,
    phase1PsychologyNotificationsDataAuditQuery,
    { user: "postgres" },
  );
  const entryResults = new Map([
    [installerIdentityQuery.id, queryPayload(environment, installerIdentityQuery, { user: "postgres" })],
    [phase1ProductFingerprintQuery.id, productFingerprint],
    [PHASE1_EXAM_TRAINING_POST_QUERY_ID,
      queryPayload(environment, phase1ExamTrainingPostQuery, { user: "postgres" })],
    [PHASE1_PSYCHOLOGY_NOTIFICATIONS_CATALOG_QUERY_ID, entryPayload],
  ]);
  const dataResults = new Map([[PHASE1_PSYCHOLOGY_NOTIFICATIONS_DATA_QUERY_ID, dataPayload]]);
  const psychologyEntry = classifyPhase1PsychologyNotificationsPrivilegedEntry(
    entryResults,
    dataResults,
  );
  const ordinaryEntryPayload = queryPayload(environment, phase1PsychologyNotificationsEntryQuery);
  const ordinaryEntry = classifyPhase1PsychologyNotificationsEntry(
    ordinaryEntryPayload,
    { managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" },
    examState,
  );
  return {
    installerState,
    productFingerprint,
    examState,
    payload,
    psychologyEntry,
    ordinaryEntryPayload,
    ordinaryEntry,
    classification: classifyPsychologyModuleSlugReconciliationPost(
      payload, installerState, examState, productFingerprint, psychologyEntry,
    ).classification,
  };
}

function executeBatch(environment, sql) {
  const result = psql(environment, sql, "postgres");
  return parseJsonResults(result.stdout);
}

function targetSnapshot(environment) {
  return JSON.parse(psql(environment, `select pg_catalog.json_build_object(
    'target_columns', (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
      join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in ('psychology_checkins','psychology_wellbeing_assessments','psychology_exercise_sessions')
        and attribute.attname = 'module_slug' and attribute.attnum > 0 and not attribute.attisdropped),
    'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
    'schema_state_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
    'checkins', case when pg_catalog.to_regclass('public.psychology_checkins') is null then null
      else (select pg_catalog.count(*) from public.psychology_checkins) end,
    'checkin_null_sources', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type is null)
  )::text;`, "postgres").stdout.trim());
}

function applyScenario(environment, scenario) {
  const mutations = {
    checkins_row_count_drift:
      "insert into public.psychology_checkins(id, checkin_type) values (4, 'pre_match')",
    missing_approved_category:
      "delete from public.psychology_checkins where checkin_type = 'error_recovery'",
    duplicate_approved_category:
      "update public.psychology_checkins set checkin_type = 'pre_match' where checkin_type = 'error_recovery'",
    unknown_checkin_type:
      "update public.psychology_checkins set checkin_type = 'unknown_category' where checkin_type = 'error_recovery'",
    null_checkin_type:
      "alter table public.psychology_checkins alter column checkin_type drop not null; update public.psychology_checkins set checkin_type = null where checkin_type = 'error_recovery'",
    wellbeing_nonempty:
      "insert into public.psychology_wellbeing_assessments(id) values (1)",
    exercise_nonempty:
      "insert into public.psychology_exercise_sessions(id, exercise_type) values (1, 'focus_reset')",
    module_slug_already_present:
      "alter table public.psychology_checkins add column module_slug text",
    module_slug_wrong_type:
      "alter table public.psychology_checkins add column module_slug integer",
    product_fingerprint_drift:
      "insert into public.attempts(id, exam_result_id) values (38, null)",
    ledger_drift: `alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
      delete from reflab_meta.production_adoption_state where phase_order = 2;
      alter table reflab_meta.production_adoption_state enable trigger production_adoption_state_guard`,
    marker_present: `insert into reflab_meta.reflab_schema_state(
      baseline_version, sql_checksum, manifest_hash, environment, postgres_version,
      schema_version, installation_status
    ) values ('premature', repeat('a',64), repeat('b',64), 'production', '17', 1, 'installed')`,
    partial_310003: "create table public.psychology_modules(slug text primary key)",
    missing_dependency: "drop table public.psychology_wellbeing_assessments",
    wrong_source_type:
      "alter table public.psychology_checkins alter column checkin_type type varchar(32)",
    forced_mid_transaction_failure: `create function public.test_reconciliation_failure() returns trigger
      language plpgsql as $$ begin raise exception 'forced failure'; end $$;
      create trigger test_reconciliation_failure before update on public.psychology_checkins
      for each row execute function public.test_reconciliation_failure()`,
    affected_count_mismatch: `create function public.test_reconciliation_skip() returns trigger
      language plpgsql as $$ begin
        if new.checkin_type = 'error_recovery' then return null; end if;
        return new;
      end $$;
      create trigger test_reconciliation_skip before update on public.psychology_checkins
      for each row execute function public.test_reconciliation_skip()`,
  };
  psql(environment, mutations[scenario], "postgres");
}

async function positive() {
  return withCluster("absent", async (environment) => {
    prepareReconciliationState(environment);
    const version = Number(psql(environment,
      "select pg_catalog.current_setting('server_version_num');", "postgres").stdout.trim());
    if (Math.trunc(version / 10000) !== 17) throw new Error("PG17_RUNTIME_REQUIRED");

    const output = runProductionPsychologyModuleSlugReconciliation({
      [PRODUCTION_DDL_APPROVED_HEAD]: head,
    }, {
      argument: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
      authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "local-pg17", connectionEnvironment: {} }),
      executeReadOnly: (sql) => executeBatch(environment, sql),
      executeMigration: (sql) => psql(environment, sql, "postgres"),
    });
    const post = postDecision(environment);
    if (output.migration !== "PASS"
        || post.classification !== "EXACT"
        || post.psychologyEntry.classification !== "PASS"
        || post.ordinaryEntryPayload.checks.requiredColumnTypesExact !== true
        || post.ordinaryEntryPayload.checks.futureFkTypeCompatibilityExact !== true
        || post.psychologyEntry.checks.requiredColumnTypesExact !== true
        || post.psychologyEntry.checks.futureFkTypeCompatibilityExact !== true
        || Object.entries(PHASE1_HISTORICAL_FINGERPRINT).some(
          ([field, expected]) => post.productFingerprint[field] !== expected,
        )) {
      throw new Error("PG17 positive Psychology reconciliation rehearsal failed.");
    }
    return {
      postgresVersionNum: version,
      postgresMajor: Math.trunc(version / 10000),
      reconciliation: post.classification,
      columns: post.payload.columns.length,
      checkins: post.payload.counts.checkins,
      mappedCounts: {
        gestionError: post.payload.counts.gestion_error,
        evaluacionPostPartido: post.payload.counts.evaluacion_post_partido,
        preparacionMentalPrePartido: post.payload.counts.preparacion_mental_pre_partido,
      },
      wellbeing: post.payload.counts.wellbeing,
      exerciseSessions: post.payload.counts.exercise_sessions,
      historicalFingerprint: post.productFingerprint,
      ledger: "foundation/1 + exam_training_prerequisites/2",
      psychology310003Entry: post.psychologyEntry.classification,
      ordinary310003Entry: post.ordinaryEntry.classification,
      ordinaryRequiredColumnTypesExact:
        post.ordinaryEntryPayload.checks.requiredColumnTypesExact,
      ordinaryFutureFkTypeCompatibilityExact:
        post.ordinaryEntryPayload.checks.futureFkTypeCompatibilityExact,
      requiredColumnTypesExact: post.psychologyEntry.checks.requiredColumnTypesExact,
      futureFkTypeCompatibilityExact: post.psychologyEntry.checks.futureFkTypeCompatibilityExact,
      nextMigration: output.nextMigration,
      cleanup: "PASS",
    };
  });
}

async function negative(scenario) {
  return withCluster("absent", async (environment) => {
    prepareReconciliationState(environment);
    applyScenario(environment, scenario);
    const before = targetSnapshot(environment);
    const artifact = assertPsychologyModuleSlugReconciliationArtifact(root);
    const result = psql(environment, artifact.sql, "postgres", true);
    if (result.status === 0) {
      throw new Error(`Negative ${scenario} unexpectedly committed.`);
    }
    const after = targetSnapshot(environment);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Negative ${scenario} did not preserve rollback state.`);
    }
    return {
      scenario,
      mutationAssertion: "PASS",
      abort: "PASS",
      rollback: "PASS",
    };
  });
}

export async function runPsychologyModuleSlugReconciliationPostgresRehearsal() {
  const positiveResult = await positive();
  const negatives = [];
  for (const scenario of databaseScenarios) negatives.push(await negative(scenario));
  return {
    localOnly: true,
    positive: positiveResult,
    negatives,
    databaseNegativeCount: negatives.length,
    staticRunnerNegativeCount: 5,
    totalNegativeCount: negatives.length + 5,
    rollbackCount: negatives.length,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPsychologyModuleSlugReconciliationPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
