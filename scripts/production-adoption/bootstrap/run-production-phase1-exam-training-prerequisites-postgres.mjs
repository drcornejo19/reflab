import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";
import {
  assertPhase1FoundationArtifact,
  classifyPhase1PostAttestation,
  phase1PostAttestationQuery,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  classifyPhase1ExamTrainingInstallerEntry,
  phase1ExamTrainingEntryQuery,
} from "./phase1-exam-training-entry-attestation-contract.mjs";
import {
  assertPhase1ExamTrainingDdlArtifact,
  classifyPhase1ExamTrainingPost,
  phase1ExamTrainingPostQuery,
} from "./phase1-exam-training-ddl-contract.mjs";
import { psql, roleBootstrapSql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const installerReady = Object.freeze({ managedProfile: "READY", lifecycleState: "POST_BOOTSTRAP" });
export const PHASE1_EXAM_TRAINING_REQUIRED_POSTGRES_MAJOR = 17;

export function classifyDisposablePostgresRuntime(serverVersionNum) {
  if (!Number.isInteger(serverVersionNum)) {
    return Object.freeze({ actualMajor: null, mode: "UNKNOWN" });
  }
  const actualMajor = Math.trunc(serverVersionNum / 10000);
  return Object.freeze({
    actualMajor,
    mode: actualMajor === PHASE1_EXAM_TRAINING_REQUIRED_POSTGRES_MAJOR
      ? "PG17_POSITIVE"
      : "NON_PG17_REJECTION",
  });
}

function payload(environment, query) {
  const output = psql(
    environment,
    `begin read only; select (${query.payloadSql})::text; rollback;`,
    "postgres",
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
    create table public.notification_events(id integer primary key);
    insert into public.attempts select value, null from pg_catalog.generate_series(1, 37) value;
    insert into public.exam_results select value, null from pg_catalog.generate_series(1, 6) value;
    insert into public.notification_events select value from pg_catalog.generate_series(1, 60) value;
  `, "postgres");
}

function assertVersionOnlyBlock(classification, label) {
  if (classification.postgresMajorExact !== false) {
    throw new Error(`${label} did not exercise the PostgreSQL major gate.`);
  }
  for (const [field, value] of Object.entries(classification)) {
    if ([
      "classification", "decision", "phase1PostState", "postState",
      "postgresMajorExact", "checks", "nextAllowedRemoteOperation",
    ].includes(field)) continue;
    if (typeof value === "boolean" && value !== true) {
      throw new Error(`${label} failed non-version field ${field}.`);
    }
  }
}

function assertPg17Pass(classification, label) {
  const decision = classification.decision ?? classification.classification;
  if (classification.postgresMajorExact !== true || decision !== "PASS") {
    throw new Error(`${label} did not pass the PostgreSQL 17 gate.`);
  }
  for (const [field, value] of Object.entries(classification)) {
    if ([
      "classification", "decision", "phase1PostState", "postState",
      "checks", "nextAllowedRemoteOperation",
    ].includes(field)) continue;
    if (typeof value === "boolean" && value !== true) {
      throw new Error(`${label} failed field ${field}.`);
    }
  }
}

function prepareFoundation(environment) {
  psql(environment, roleBootstrapSql);
  createHistoricalFixture(environment);
  const foundation = assertPhase1FoundationArtifact(root);
  psql(environment, foundation.sql, "postgres");
}

async function rehearseObservedRuntime() {
  return withCluster("absent", async (environment) => {
    prepareFoundation(environment);
    const artifact = assertPhase1ExamTrainingDdlArtifact(root);
    const beforeFingerprint = payload(environment, phase1ProductFingerprintQuery);
    const installerPayload = payload(environment, installerIdentityQuery);
    const runtime = classifyDisposablePostgresRuntime(installerPayload.server_version_num);
    if (runtime.mode === "UNKNOWN") {
      throw new Error("310002 disposable PostgreSQL version is not observable.");
    }
    const installer = classifyInstallerIdentity(installerPayload);
    const expectedMajorExact = runtime.mode === "PG17_POSITIVE";
    if (installer.lifecycleState !== "POST_BOOTSTRAP"
        || installer.requiredAttributesExact !== true
        || installer.membershipFingerprintExact !== true
        || installer.databaseCreate !== true
        || installer.protectedRoleExact !== true
        || installer.postgresMajorExact !== expectedMajorExact) {
      throw new Error("310002 local installer fixture is not structurally exact.");
    }
    const foundation = classifyPhase1PostAttestation(
      payload(environment, phase1PostAttestationQuery),
      installerReady,
      beforeFingerprint,
      beforeFingerprint,
    );
    const entry = classifyPhase1ExamTrainingInstallerEntry(
      payload(environment, phase1ExamTrainingEntryQuery),
      installerReady,
    );
    if (runtime.mode === "NON_PG17_REJECTION") {
      assertVersionOnlyBlock(installer, "Installer identity");
      assertVersionOnlyBlock(foundation, "Foundation pre-state");
      assertVersionOnlyBlock(entry, "310002 entry");
      return {
        mode: runtime.mode,
        postgresMajor: runtime.actualMajor,
        serverVersionEvidence: "current_setting('server_version_num')",
        productionVersionGate: "BLOCKER_NON_PG17",
        migration: "NOT_EXECUTED",
        migrationInvocationCount: 0,
        cleanup: "PASS",
      };
    }

    assertPg17Pass(installer, "Installer identity");
    assertPg17Pass(foundation, "Foundation pre-state");
    assertPg17Pass(entry, "310002 entry");

    psql(environment, artifact.sql, "postgres");

    const afterFingerprint = payload(environment, phase1ProductFingerprintQuery);
    const postPayload = payload(environment, phase1ExamTrainingPostQuery);
    const post = classifyPhase1ExamTrainingPost(
      postPayload,
      installerReady,
      beforeFingerprint,
      afterFingerprint,
    );
    assertPg17Pass(post, "310002 post-state");
    if (postPayload.counts.target_columns !== 6
        || postPayload.counts.target_indexes !== 3
        || postPayload.counts.target_constraints !== 20
        || postPayload.counts.check_constraints !== 13
        || postPayload.counts.foreign_keys !== 5
        || postPayload.counts.unique_constraints !== 2
        || postPayload.counts.target_rows !== 0
        || postPayload.counts.schema_state_rows !== 0
        || postPayload.counts.ledger_rows !== 2) {
      throw new Error("310002 PostgreSQL postcondition cardinality drifted.");
    }

    psql(environment, `begin;
      insert into public.attempts(id, exam_result_id) values (38, null);
      insert into public.exam_results(id, submission_id) values (7, null);
      rollback;`, "postgres");
    const legacyCounts = psql(environment, `select
      (select pg_catalog.count(*) from public.attempts),
      (select pg_catalog.count(*) from public.exam_results),
      (select pg_catalog.count(*) from public.notification_events);`, "postgres").stdout.trim();
    if (legacyCounts !== "37|6|60") throw new Error("310002 legacy write rollback changed historical counts.");

    return {
      mode: runtime.mode,
      migration: "PASS",
      exactPostcondition: "PASS",
      targetTableRows: 0,
      nullableColumns: 6,
      indexes: 3,
      constraints: 20,
      ledger: "exam_training_prerequisites/2",
      historicalFingerprint: "37/6/60",
      legacyWrites: "PASS",
      schemaStateRows: 0,
      marker: "ABSENT",
      postgresMajor: runtime.actualMajor,
      serverVersionEvidence: "current_setting('server_version_num')",
      productionVersionGate: "PASS_PG17",
      migrationInvocationCount: 1,
      cleanup: "PASS",
    };
  });
}

async function rollback() {
  return withCluster("absent", async (environment) => {
    prepareFoundation(environment);
    const installerPayload = payload(environment, installerIdentityQuery);
    const runtime = classifyDisposablePostgresRuntime(installerPayload.server_version_num);
    if (runtime.mode !== "PG17_POSITIVE") {
      throw new Error("310002 rollback rehearsal requires a real PostgreSQL 17 server.");
    }
    const artifact = assertPhase1ExamTrainingDdlArtifact(root);
    const failingSql = artifact.sql.replace(/\ncommit;\s*$/i, `
do $forced_failure$ begin
  raise exception '310002 local rollback rehearsal' using errcode = '55000';
end $forced_failure$;
commit;
`);
    if (failingSql === artifact.sql) throw new Error("310002 rollback mutation was not installed.");
    const result = psql(environment, failingSql, "postgres", true);
    const sqlstate = String(result.stderr).match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
    if (result.status === 0 || sqlstate !== "55000") {
      throw new Error("310002 rollback rehearsal did not abort with SQLSTATE 55000.");
    }
    const state = psql(environment, `select pg_catalog.json_build_object(
      'target_absent', pg_catalog.to_regclass('public.referee_exam_sessions') is null,
      'target_columns', (select pg_catalog.count(*) from pg_catalog.pg_attribute attribute
        where attribute.attrelid in ('public.attempts'::pg_catalog.regclass, 'public.exam_results'::pg_catalog.regclass)
          and attribute.attname in ('source_item_type','source_item_id','source_occurrence_id',
            'institution_assessment_session_id','exam_session_id','payload_hash')
          and attribute.attnum > 0 and not attribute.attisdropped),
      'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state),
      'schema_state_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
      'attempts', (select pg_catalog.count(*) from public.attempts),
      'exam_results', (select pg_catalog.count(*) from public.exam_results),
      'notification_events', (select pg_catalog.count(*) from public.notification_events)
    );`, "postgres").stdout.trim();
    const observed = JSON.parse(state);
    if (!observed.target_absent || observed.target_columns !== 0 || observed.ledger_rows !== 1
        || observed.schema_state_rows !== 0 || observed.attempts !== 37
        || observed.exam_results !== 6 || observed.notification_events !== 60) {
      throw new Error("310002 rollback left partial state.");
    }
    return {
      expectedSqlstate: "55000",
      observedSqlstate: sqlstate,
      abort: "PASS",
      rollback: "PASS",
      partialState: 0,
      cleanup: "PASS",
    };
  });
}

export async function runPhase1ExamTrainingPrerequisitesPostgres() {
  const observedRuntime = await rehearseObservedRuntime();
  const pg17 = observedRuntime.mode === "PG17_POSITIVE";
  return {
    localOnly: true,
    pg17Runtime: pg17 ? "AVAILABLE" : "NOT_AVAILABLE",
    positive: pg17 ? observedRuntime : "NOT_EXECUTED_NON_PG17",
    nonPg17Rejection: pg17 ? "NOT_APPLICABLE" : observedRuntime,
    rollback: pg17 ? await rollback() : "NOT_EXECUTED_NON_PG17",
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1ExamTrainingPrerequisitesPostgres()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_EXAM_TRAINING_DDL_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
