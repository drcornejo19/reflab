import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
  buildPhase1PsychologyNotificationsPrivilegedBatch,
  classifyPhase1PsychologyNotificationsPrivilegedEntry,
} from "./phase1-psychology-notifications-privileged-entry-attestation-contract.mjs";
import {
  prepareExamTrainingState,
} from "./run-production-phase1-psychology-notifications-entry-attestation-postgres.mjs";
import { psql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const postgresScenarios = Object.freeze([
  ["ledger_missing_phase2", "ledgerExact"],
  ["unexpected_phase3_ledger", "laterPhaseInfrastructureAbsent"],
  ["schema_state_nonempty", "schemaStateEmpty"],
  ["310002_structural_drift", "examTrainingState"],
  ["310003_partial_object", "targetColumnAbsent"],
  ["310004_sidecar_present", "laterPhaseInfrastructureAbsent"],
  ["product_fingerprint_mismatch", "fingerprintExact"],
  ["installer_profile_mismatch", "installerExact"],
]);

function collect(environment) {
  const result = psql(
    environment,
    buildPhase1PsychologyNotificationsPrivilegedBatch(),
    "postgres",
  );
  return parseJsonResults(result.stdout);
}

function rowCounts(environment) {
  const output = psql(environment, `select pg_catalog.json_build_object(
    'attempts', (select pg_catalog.count(*) from public.attempts),
    'exam_results', (select pg_catalog.count(*) from public.exam_results),
    'notification_events', (select pg_catalog.count(*) from public.notification_events)
  )::text;`, "postgres").stdout.trim();
  return JSON.parse(output);
}

function applyMutation(environment, scenario) {
  const mutations = {
    ledger_missing_phase2: `
      alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard;
      delete from reflab_meta.production_adoption_state where phase_order = 2;
      alter table reflab_meta.production_adoption_state enable trigger production_adoption_state_guard;`,
    unexpected_phase3_ledger: `insert into reflab_meta.production_adoption_state (
      phase_order, phase_key, previous_phase_key, plan_version, plan_hash, evidence_hash
    ) values (
      3, 'psychology_notification_prerequisites', 'exam_training_prerequisites',
      'production_adoption_bridge_v1',
      'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f',
      '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d'
    )`,
    schema_state_nonempty: `insert into reflab_meta.reflab_schema_state (
      baseline_version, sql_checksum, manifest_hash, environment,
      postgres_version, schema_version, installation_status
    ) values ('test-marker', repeat('0',64), repeat('1',64), 'test', '17', 1, 'installed')`,
    "310002_structural_drift": "drop index public.referee_exam_sessions_user_status_idx",
    "310003_partial_object": "alter table public.notification_events add column deduplication_key text",
    "310004_sidecar_present": "create schema reflab_audit",
    product_fingerprint_mismatch: "insert into public.attempts(id, exam_result_id) values (38, null)",
    installer_profile_mismatch: "alter role postgres nocreatedb",
  };
  psql(environment, mutations[scenario], scenario === "installer_profile_mismatch" ? "supabase_admin" : "postgres");
}

function mutationObserved(decision, scenario, expectedField) {
  if (scenario === "310002_structural_drift") return decision.examTrainingState === "BLOCKER";
  if (["product_fingerprint_mismatch", "installer_profile_mismatch"].includes(scenario)) {
    return decision[expectedField] === false;
  }
  return decision.checks?.[expectedField] === false;
}

async function positive() {
  return withCluster("absent", async (environment) => {
    prepareExamTrainingState(environment);
    const version = Number(psql(
      environment,
      "select pg_catalog.current_setting('server_version_num');",
      "postgres",
    ).stdout.trim());
    const before = rowCounts(environment);
    const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(collect(environment));
    const after = rowCounts(environment);
    if (Math.trunc(version / 10000) !== 17
        || decision.classification !== "PASS"
        || decision.nextAllowedRemoteOperation !== "310003_EXECUTION_REVIEW"
        || decision.catalogAttestation !== "PASS"
        || decision.protectedStateAttestation !== "PASS"
        || JSON.stringify(before) !== JSON.stringify(PHASE1_HISTORICAL_FINGERPRINT)
        || JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error(`Privileged 310003 PostgreSQL positive failed; major=${Math.trunc(version / 10000)}; classification=${decision.classification}.`);
    }
    return {
      postgresVersionNum: version,
      postgresMajor: Math.trunc(version / 10000),
      fixedQueryCount: 4,
      catalogAttestation: decision.catalogAttestation,
      protectedStateAttestation: decision.protectedStateAttestation,
      examTrainingState: decision.examTrainingState,
      historicalFingerprint: after,
      transactionReadOnly: "PASS",
      rollback: "PASS",
      classification: decision.classification,
    };
  });
}

async function negative(scenario, expectedField) {
  return withCluster("absent", async (environment) => {
    prepareExamTrainingState(environment);
    applyMutation(environment, scenario);
    const before = rowCounts(environment);
    const decision = classifyPhase1PsychologyNotificationsPrivilegedEntry(collect(environment));
    const after = rowCounts(environment);
    if (!mutationObserved(decision, scenario, expectedField)) {
      throw new Error(`HARNESS_SETUP_FAIL: ${scenario} did not change ${expectedField}.`);
    }
    if (decision.classification !== "BLOCKER"
        || decision.nextAllowedRemoteOperation !== "NONE") {
      throw new Error(`Privileged 310003 negative ${scenario} did not fail closed.`);
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Privileged 310003 negative ${scenario} changed rows during attestation.`);
    }
    return {
      scenario,
      mutationAssertion: "PASS",
      classification: "BLOCKER",
      readOnlyRollback: "PASS",
    };
  });
}

export async function runPhase1PsychologyNotificationsPrivilegedEntryPostgresRehearsal() {
  const positiveResult = await positive();
  const negatives = [];
  for (const [scenario, expectedField] of postgresScenarios) {
    negatives.push(await negative(scenario, expectedField));
  }
  return {
    localOnly: true,
    operation: PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_OPERATION,
    positive: positiveResult,
    negatives,
    negativeCount: negatives.length,
    negativeBlockCount: negatives.filter((result) => result.classification === "BLOCKER").length,
    rollbackCount: negatives.filter((result) => result.readOnlyRollback === "PASS").length + 1,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1PsychologyNotificationsPrivilegedEntryPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_PSYCHOLOGY_NOTIFICATIONS_PRIVILEGED_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}

