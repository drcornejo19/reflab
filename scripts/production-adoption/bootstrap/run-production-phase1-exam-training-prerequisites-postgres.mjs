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

function payloadWithMutation(environment, query, mutationSql) {
  const output = psql(
    environment,
    `begin;
${mutationSql}
select (${query.payloadSql})::text;
rollback;`,
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
    const failed = Object.entries(classification.checks ?? {})
      .filter(([, value]) => value !== true)
      .map(([field]) => field)
      .join(",");
    throw new Error(`${label} did not pass the PostgreSQL 17 gate${failed ? `: ${failed}` : ""}.`);
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
      aclExact: "PASS",
      tableContractExact: "PASS",
      constraintSemanticsExact: "PASS",
      laterPhaseInfrastructureAbsent: "PASS",
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

const postDdlNegativeScenarios = Object.freeze([
  {
    name: "extra_anon_select",
    expectedCheck: "targetAclExact",
    mutationSql: "grant select on public.referee_exam_sessions to anon;",
  },
  {
    name: "extra_authenticated_select",
    expectedCheck: "targetAclExact",
    mutationSql: "grant select on public.referee_exam_sessions to authenticated;",
  },
  {
    name: "unexpected_service_role_privilege",
    expectedCheck: "targetAclExact",
    mutationSql: "grant insert on public.referee_exam_sessions to service_role;",
  },
  {
    name: "extra_table_level_grant",
    expectedCheck: "targetAclExact",
    mutationSql: "grant select on public.referee_exam_sessions to reflab_prod_preflight_ro;",
  },
  {
    name: "wrong_column_type",
    expectedCheck: "targetTableColumnsExact",
    mutationSql: "alter table public.referee_exam_sessions alter column season type varchar(32);",
  },
  {
    name: "wrong_default",
    expectedCheck: "targetTableColumnsExact",
    mutationSql: "alter table public.referee_exam_sessions alter column status set default 'created';",
  },
  {
    name: "wrong_not_null",
    expectedCheck: "targetTableColumnsExact",
    mutationSql: "alter table public.referee_exam_sessions alter column season set not null;",
  },
  {
    name: "missing_column",
    expectedCheck: "targetTableColumnsExact",
    mutationSql: "alter table public.referee_exam_sessions drop column source_version;",
  },
  {
    name: "extra_column",
    expectedCheck: "targetTableColumnsExact",
    mutationSql: "alter table public.referee_exam_sessions add column unexpected_column text;",
  },
  {
    name: "wrong_check_expression",
    expectedCheck: "targetCheckSemanticsExact",
    mutationSql: `alter table public.referee_exam_sessions
      drop constraint referee_exam_sessions_context_type_check;
    alter table public.referee_exam_sessions
      add constraint referee_exam_sessions_context_type_check check (context_type = 'individual');`,
  },
  {
    name: "wrong_check_validation_state",
    expectedCheck: "targetCheckSemanticsExact",
    mutationSql: `alter table public.exam_results drop constraint exam_results_payload_hash_check;
    alter table public.exam_results add constraint exam_results_payload_hash_check
      check ((payload_hash is null) or (payload_hash ~ '^[0-9a-f]{64}$'::text)) not valid;`,
  },
  {
    name: "wrong_fk_referenced_table",
    expectedCheck: "targetFkSemanticsExact",
    mutationSql: `alter table public.referee_exam_sessions drop constraint referee_exam_sessions_group_fk;
    alter table public.referee_exam_sessions add constraint referee_exam_sessions_group_fk
      foreign key (institution_group_id) references public.institutions(id) on delete set null;`,
  },
  {
    name: "wrong_fk_referenced_column",
    expectedCheck: "targetFkSemanticsExact",
    mutationSql: `alter table public.institutions add column alternate_id uuid unique;
    alter table public.referee_exam_sessions drop constraint referee_exam_sessions_institution_fk;
    alter table public.referee_exam_sessions add constraint referee_exam_sessions_institution_fk
      foreign key (institution_id) references public.institutions(alternate_id) on delete cascade;`,
  },
  {
    name: "wrong_fk_action",
    expectedCheck: "targetFkSemanticsExact",
    mutationSql: `alter table public.referee_exam_sessions drop constraint referee_exam_sessions_institution_fk;
    alter table public.referee_exam_sessions add constraint referee_exam_sessions_institution_fk
      foreign key (institution_id) references public.institutions(id) on delete restrict;`,
  },
  {
    name: "wrong_fk_deferrability",
    expectedCheck: "targetFkSemanticsExact",
    mutationSql: `alter table public.referee_exam_sessions
      alter constraint referee_exam_sessions_institution_fk deferrable initially immediate;`,
  },
  {
    name: "wrong_unique_key_order",
    expectedCheck: "targetUniqueSemanticsExact",
    mutationSql: `alter table public.referee_exam_sessions
      drop constraint referee_exam_sessions_user_submission_unique;
    alter table public.referee_exam_sessions
      add constraint referee_exam_sessions_user_submission_unique unique (submission_id, user_id);`,
  },
  {
    name: "partial_310003_object",
    expectedCheck: "laterPhaseInfrastructureAbsent",
    mutationSql: "create table public.psychology_modules(test_only integer);",
  },
]);

async function postDdlNegatives() {
  const results = [];
  for (const scenario of postDdlNegativeScenarios) {
    results.push(await withCluster("absent", async (environment) => {
      prepareFoundation(environment);
      const artifact = assertPhase1ExamTrainingDdlArtifact(root);
      psql(environment, artifact.sql, "postgres");
      const beforeFingerprint = payload(environment, phase1ProductFingerprintQuery);
      const mutated = payloadWithMutation(environment, phase1ExamTrainingPostQuery, scenario.mutationSql);
      if (mutated.checks?.[scenario.expectedCheck] !== false) {
        throw new Error(`${scenario.name} mutation assertion did not fail ${scenario.expectedCheck}.`);
      }
      const classification = classifyPhase1ExamTrainingPost(
        mutated,
        installerReady,
        beforeFingerprint,
        beforeFingerprint,
      );
      if (classification.classification !== "BLOCKER") {
        throw new Error(`${scenario.name} did not classify as BLOCKER.`);
      }
      const restored = classifyPhase1ExamTrainingPost(
        payload(environment, phase1ExamTrainingPostQuery),
        installerReady,
        beforeFingerprint,
        payload(environment, phase1ProductFingerprintQuery),
      );
      assertPg17Pass(restored, `${scenario.name} rollback state`);
      return {
        scenario: scenario.name,
        mutationAssertion: "PASS",
        classification: "BLOCKER",
        rollback: "PASS",
      };
    }));
  }
  return results;
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
  const negatives = pg17 ? await postDdlNegatives() : "NOT_EXECUTED_NON_PG17";
  return {
    localOnly: true,
    pg17Runtime: pg17 ? "AVAILABLE" : "NOT_AVAILABLE",
    positive: pg17 ? observedRuntime : "NOT_EXECUTED_NON_PG17",
    nonPg17Rejection: pg17 ? "NOT_APPLICABLE" : observedRuntime,
    rollback: pg17 ? await rollback() : "NOT_EXECUTED_NON_PG17",
    negatives,
    negativeCount: pg17 ? negatives.length : 0,
    negativeRollbackCount: pg17
      ? negatives.filter((result) => result.rollback === "PASS").length
      : 0,
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
