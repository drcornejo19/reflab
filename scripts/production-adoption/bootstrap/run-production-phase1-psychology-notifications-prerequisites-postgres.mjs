import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS,
  assertPhase1PsychologyNotificationsDdlArtifact,
  phase1PsychologyNotificationsPostQuery,
} from "./phase1-psychology-notifications-ddl-contract.mjs";
import { assertPsychologyModuleSlugReconciliationArtifact } from "./psychology-module-slug-reconciliation-ddl-contract.mjs";
import { PRODUCTION_DDL_APPROVED_HEAD } from "./run-production-role-bootstrap.mjs";
import {
  runProductionPhase1PsychologyNotificationsPrerequisites,
} from "./run-production-phase1-psychology-notifications-prerequisites.mjs";
import {
  prepareExamTrainingState,
  queryPayload,
} from "./run-production-phase1-psychology-notifications-entry-attestation-postgres.mjs";
import { psql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

const preDdlScenarios = Object.freeze([
  "psychology_modules_exists",
  "deduplication_column_exists",
  "deduplication_index_exists",
  "ledger_order_3_exists",
  "wrong_ledger_pre_state",
  "checkin_total_drift",
  "checkin_mapping_drift",
  "unexpected_module_slug",
  "wellbeing_nonempty",
  "exercise_nonempty",
  "attempts_fingerprint_drift",
  "exam_results_fingerprint_drift",
  "notification_events_fingerprint_drift",
  "schema_state_nonempty",
  "canonical_marker_present",
  "phase_310004_present",
  "development_object_present",
]);

const failurePoints = Object.freeze([
  "after_table_creation",
  "after_catalog_inserts",
  "after_deduplication_column",
  "after_deduplication_index",
  "before_ledger_insert",
  "after_ledger_insert",
]);

function executeBatch(environment, sql) {
  return parseJsonResults(psql(environment, sql, "postgres").stdout);
}

function preparePre310003State(environment) {
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
      (1, 'error_recovery'), (2, 'post_match'), (3, 'pre_match');
  `, "postgres");
  psql(environment, assertPsychologyModuleSlugReconciliationArtifact(root).sql, "postgres");
}

function preStateSnapshot(environment) {
  return JSON.parse(psql(environment, `select pg_catalog.json_build_object(
    'psychology_modules_absent', pg_catalog.to_regclass('public.psychology_modules') is null,
    'deduplication_column_absent', not exists (select 1 from pg_catalog.pg_attribute attribute
      where attribute.attrelid = 'public.notification_events'::pg_catalog.regclass
        and attribute.attname = 'deduplication_key' and attribute.attnum > 0 and not attribute.attisdropped),
    'deduplication_index_absent', pg_catalog.to_regclass('public.notification_events_deduplication_unique') is null,
    'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
    'attempts', (select pg_catalog.count(*) from public.attempts),
    'exam_results', (select pg_catalog.count(*) from public.exam_results),
    'notification_events', (select pg_catalog.count(*) from public.notification_events),
    'checkins', (select pg_catalog.count(*) from public.psychology_checkins),
    'null_module_slug', (select pg_catalog.count(*) from public.psychology_checkins where module_slug is null),
    'mapping_exact', (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type='error_recovery' and module_slug='gestion-error')
      and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type='post_match' and module_slug='evaluacion-post-partido')
      and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type='pre_match' and module_slug='preparacion-mental-pre-partido')
  )::text;`, "postgres").stdout.trim());
}

function assertExactRollback(environment, before, label) {
  const after = preStateSnapshot(environment);
  if (JSON.stringify(after) !== JSON.stringify(before)
      || !after.psychology_modules_absent || !after.deduplication_column_absent
      || !after.deduplication_index_absent || after.ledger_rows !== 2
      || after.attempts !== 37 || after.exam_results !== 6 || after.notification_events !== 60
      || after.checkins !== 3 || after.null_module_slug !== 0 || !after.mapping_exact) {
    throw new Error(`${label} left partial 310003 state.`);
  }
}

function applyPreDdlScenario(environment, scenario) {
  const mutations = {
    psychology_modules_exists: "create table public.psychology_modules(slug text primary key)",
    deduplication_column_exists: "alter table public.notification_events add column deduplication_key text",
    deduplication_index_exists: "create unique index notification_events_deduplication_unique on public.notification_events(user_id, id)",
    ledger_order_3_exists: `alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
      insert into reflab_meta.production_adoption_state(phase_order,phase_key,previous_phase_key,plan_version,plan_hash,evidence_hash)
      values(3,'psychology_notification_prerequisites','exam_training_prerequisites','production_adoption_bridge_v1',repeat('a',64),repeat('b',64));
      alter table reflab_meta.production_adoption_state enable trigger production_adoption_state_guard`,
    wrong_ledger_pre_state: `alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
      delete from reflab_meta.production_adoption_state where phase_order=2;
      alter table reflab_meta.production_adoption_state enable trigger production_adoption_state_guard`,
    checkin_total_drift: "insert into public.psychology_checkins(id,checkin_type,module_slug) values(4,'pre_match','preparacion-mental-pre-partido')",
    checkin_mapping_drift: "update public.psychology_checkins set module_slug='resiliencia' where checkin_type='error_recovery'",
    unexpected_module_slug: "update public.psychology_checkins set module_slug='unexpected' where checkin_type='error_recovery'",
    wellbeing_nonempty: "insert into public.psychology_wellbeing_assessments(id,module_slug) values(1,'resiliencia')",
    exercise_nonempty: "insert into public.psychology_exercise_sessions(id,exercise_type,module_slug) values(1,'focus_reset','concentracion-foco')",
    attempts_fingerprint_drift: "insert into public.attempts(id,exam_result_id) values(38,null)",
    exam_results_fingerprint_drift: "insert into public.exam_results(id,submission_id) values(7,null)",
    notification_events_fingerprint_drift: "insert into public.notification_events(id,user_id) values(61,'synthetic')",
    schema_state_nonempty: `insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status)
      values('premature',repeat('a',64),repeat('b',64),'production','17',1,'installed')`,
    canonical_marker_present: `insert into reflab_meta.reflab_schema_state(baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status)
      values('premature',repeat('c',64),repeat('d',64),'production','17',1,'installed')`,
    phase_310004_present: "create schema reflab_audit",
    development_object_present: "create function public.resolve_development_clerk_identity(text) returns text language sql as $$ select $1 $$",
  };
  psql(environment, mutations[scenario], "postgres");
}

function injectFailure(sql, point) {
  const failure = `\ndo $forced_failure$ begin raise exception '310003 ${point}' using errcode='55000'; end $forced_failure$;\n`;
  const replacements = {
    after_table_creation: [
      /(create\s+table\s+public\.psychology_modules\s*\([\s\S]*?\n\s*\);)/i,
      (match) => `${match}${failure}`,
    ],
    after_catalog_inserts: [
      /(insert\s+into\s+public\.psychology_modules[\s\S]*?\('sin-clasificar'[\s\S]*?999\)\s*;)/i,
      (match) => `${match}${failure}`,
    ],
    after_deduplication_column: [
      /(alter\s+table\s+public\.notification_events\s+add\s+column\s+deduplication_key\s+text\s*;)/i,
      (match) => `${match}${failure}`,
    ],
    after_deduplication_index: [
      /(create\s+unique\s+index\s+notification_events_deduplication_unique[\s\S]*?where\s+deduplication_key\s+is\s+not\s+null\s*;)/i,
      (match) => `${match}${failure}`,
    ],
    before_ledger_insert: [
      /(lock\s+table\s+reflab_meta\.production_adoption_state\s+in\s+exclusive\s+mode\s*;)/i,
      (match) => `${failure}${match}`,
    ],
    after_ledger_insert: [
      /(insert\s+into\s+reflab_meta\.production_adoption_state[\s\S]*?'07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'\s*\)\s*;)/i,
      (match) => `${match}${failure}`,
    ],
  };
  const [needle, replacement] = replacements[point];
  const mutated = sql.replace(needle, replacement);
  if (mutated === sql) throw new Error(`HARNESS_SETUP_FAIL: ${point} injection was a no-op.`);
  return mutated;
}

async function positive() {
  return withCluster("absent", async (environment) => {
    preparePre310003State(environment);
    const serverVersionNum = Number(psql(environment,
      "select pg_catalog.current_setting('server_version_num');", "postgres").stdout.trim());
    if (Math.trunc(serverVersionNum / 10000) !== 17) throw new Error("PG17_RUNTIME_REQUIRED");
    const output = runProductionPhase1PsychologyNotificationsPrerequisites({
      [PRODUCTION_DDL_APPROVED_HEAD]: head,
    }, {
      argument: PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
      git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
      authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "local-pg17", connectionEnvironment: {} }),
      allowLocalTarget: true,
      executeReadOnly: (sql) => executeBatch(environment, sql),
      executeMigration: (sql) => psql(environment, sql, "postgres"),
    });
    const postPayload = queryPayload(environment, phase1PsychologyNotificationsPostQuery, { user: "postgres" });
    if (output.migration !== "PASS" || output.postDdl !== "EXACT"
        || output.nextMigration !== "NOT_AUTHORIZED"
        || PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS.some((field) => postPayload.checks[field] !== true)) {
      throw new Error("310003 PostgreSQL 17 positive rehearsal did not reach the exact post-state.");
    }
    return {
      serverVersionNum,
      postgresMajor: Math.trunc(serverVersionNum / 10000),
      migration: output.migration,
      postDdl: output.postDdl,
      catalogRows: postPayload.counts.catalog_rows,
      notificationEvents: postPayload.counts.notification_events,
      notificationBackfills: postPayload.counts.notification_backfills,
      checkins: postPayload.counts.checkins,
      wellbeing: postPayload.counts.wellbeing,
      exerciseSessions: postPayload.counts.exercise_sessions,
      ledgerRows: postPayload.counts.ledger_rows,
      next310004Review: output.next310004Review,
      nextMigration: output.nextMigration,
      cleanup: "PASS",
    };
  });
}

async function preDdlNegative(scenario) {
  return withCluster("absent", async (environment) => {
    preparePre310003State(environment);
    applyPreDdlScenario(environment, scenario);
    let migrationCalls = 0;
    let blocked = false;
    try {
      runProductionPhase1PsychologyNotificationsPrerequisites({ [PRODUCTION_DDL_APPROVED_HEAD]: head }, {
        argument: PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION,
        git: (args) => args[0] === "rev-parse" ? `${head}\n` : "",
        authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "local-pg17", connectionEnvironment: {} }),
        allowLocalTarget: true,
        executeReadOnly: (sql) => executeBatch(environment, sql),
        executeMigration: () => { migrationCalls += 1; },
      });
    } catch {
      blocked = true;
    }
    if (!blocked || migrationCalls !== 0) throw new Error(`${scenario} did not block before DDL.`);
    return { scenario, classification: "BLOCKER", migrationInvocationCount: 0, rollback: "NOT_REQUIRED" };
  });
}

async function rollbackNegative(point) {
  return withCluster("absent", async (environment) => {
    preparePre310003State(environment);
    const before = preStateSnapshot(environment);
    const sql = injectFailure(assertPhase1PsychologyNotificationsDdlArtifact(root).sql, point);
    const result = psql(environment, sql, "postgres", true);
    const sqlstate = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
    if (result.status === 0 || sqlstate !== "55000") {
      throw new Error(`${point} did not abort with SQLSTATE 55000.`);
    }
    assertExactRollback(environment, before, point);
    return { point, expectedSqlstate: "55000", observedSqlstate: sqlstate, abort: "PASS", rollback: "PASS" };
  });
}

export async function runPhase1PsychologyNotificationsPostgresRehearsal() {
  const positiveResult = await positive();
  const negatives = [];
  for (const scenario of preDdlScenarios) negatives.push(await preDdlNegative(scenario));
  const rollbacks = [];
  for (const point of failurePoints) rollbacks.push(await rollbackNegative(point));
  return {
    localOnly: true,
    positive: positiveResult,
    preDdlNegatives: negatives,
    preDdlNegativeCount: negatives.length,
    staticNegativeCount: 8,
    totalNegativeCount: negatives.length + 8,
    rollbacks,
    rollbackCount: rollbacks.length,
    expectedHistoricalFingerprint: PHASE1_HISTORICAL_FINGERPRINT,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1PsychologyNotificationsPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
