import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { assertPsychologyModuleSlugReconciliationArtifact } from "../bootstrap/psychology-module-slug-reconciliation-ddl-contract.mjs";
import { assertPhase1PsychologyNotificationsDdlArtifact } from "../bootstrap/phase1-psychology-notifications-ddl-contract.mjs";
import { prepareExamTrainingState } from "../bootstrap/run-production-phase1-psychology-notifications-entry-attestation-postgres.mjs";
import { psql, withCluster } from "../bootstrap/run-production-role-bootstrap-postgres.mjs";
import { classifyInstallerIdentity, installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
} from "../bootstrap/phase1-exam-training-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID,
} from "../bootstrap/phase1-psychology-notifications-ddl-contract.mjs";
import {
  PHASE2A_SEMANTIC_AUDIT_ARTIFACT,
  PHASE2A_SEMANTIC_AUDIT_OPERATION,
  PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID,
  PHASE2A_SEMANTIC_AUDIT_SHA256,
  assertSemanticAuditTeardownArtifact,
  classifyPhase2aSemanticAuditPost,
} from "./phase2a-semantic-audit-ddl-contract.mjs";
import { semanticAuditExpectedFields, semanticAuditTableColumns, semanticAuditTables } from "./semantic-audit-contract.mjs";
import { buildPhase2aSemanticAuditPostBatch, runProductionPhase2aSemanticAudit } from "./run-production-phase2a-semantic-audit.mjs";
import {
  SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
  runProductionSemanticAuditSnapshot,
} from "./run-production-semantic-audit-snapshot.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const head = "a".repeat(40);

function columnType(table, column) {
  if (table === "public.institution_group_memberships" && column === "group_id") return "uuid";
  if (["criterion_result", "raw_source_reference"].includes(column)) return "jsonb";
  if (column === "score") return "integer";
  return "text";
}

function executeBatch(environment, sql, user = "postgres") {
  return parseJsonResults(psql(environment, sql, user).stdout);
}

function preparePost310003State(environment) {
  prepareExamTrainingState(environment);
  psql(environment, `alter role reflab_prod_preflight_ro
    login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;`, "supabase_admin");
  psql(environment, `
    truncate table public.psychology_checkins, public.psychology_wellbeing_assessments,
      public.psychology_exercise_sessions;
    alter table public.psychology_checkins drop column module_slug;
    alter table public.psychology_checkins add column checkin_type text not null;
    alter table public.psychology_wellbeing_assessments drop column module_slug;
    alter table public.psychology_exercise_sessions drop column module_slug;
    alter table public.psychology_exercise_sessions add column exercise_type text not null;
    insert into public.psychology_checkins(id,checkin_type) values
      (1,'error_recovery'),(2,'post_match'),(3,'pre_match');
  `, "postgres");
  psql(environment, assertPsychologyModuleSlugReconciliationArtifact(root).sql, "postgres");
  psql(environment, assertPhase1PsychologyNotificationsDdlArtifact(root).sql, "postgres");
  psql(environment, `
    alter table public.exam_results alter column id drop default;
    alter table public.exam_results alter column id type uuid using
      ('00000000-0000-0000-0000-' || pg_catalog.lpad(id::text,12,'0'))::uuid;
  `, "postgres");
  for (const [table, columns] of Object.entries(semanticAuditTableColumns)) {
    const definitions = columns.map((column) => `${column} ${columnType(table, column)}`).join(",");
    psql(environment, `create table if not exists ${table}(${definitions});`, "postgres");
    for (const column of columns) {
      psql(environment, `alter table ${table} add column if not exists ${column} ${columnType(table, column)};`, "postgres");
    }
    psql(environment, `alter table ${table} enable row level security; alter table ${table} no force row level security;`, "postgres");
  }
}

function localDependencies(environment, migrationSql) {
  return {
    argument: PHASE2A_SEMANTIC_AUDIT_OPERATION,
    allowLocalTarget: true,
    git: (args) => args[0] === "rev-parse" ? head : "",
    assertArtifact: () => ({ path: PHASE2A_SEMANTIC_AUDIT_ARTIFACT, sha256: PHASE2A_SEMANTIC_AUDIT_SHA256, sql: migrationSql }),
    authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "127.0.0.1",
      connectionEnvironment: { PGHOST: "127.0.0.1", PGPORT: String(environment.port), PGDATABASE: "postgres", PGUSER: "postgres", PGSSLMODE: "disable" } }),
    executeReadOnly: (sql) => executeBatch(environment, sql),
    executeMigration: (sql) => psql(environment, sql, "postgres"),
  };
}

function runnerEnvironment() {
  return { REFLAB_PRODUCTION_DDL_APPROVED_HEAD: head };
}

function preservedState(environment) {
  return JSON.parse(psql(environment, `select pg_catalog.json_build_object(
    'attempts',(select pg_catalog.count(*) from public.attempts),
    'exam_results',(select pg_catalog.count(*) from public.exam_results),
    'notification_events',(select pg_catalog.count(*) from public.notification_events),
    'checkins',(select pg_catalog.count(*) from public.psychology_checkins),
    'gestion_error',(select pg_catalog.count(*) from public.psychology_checkins where module_slug='gestion-error'),
    'post_match',(select pg_catalog.count(*) from public.psychology_checkins where module_slug='evaluacion-post-partido'),
    'pre_match',(select pg_catalog.count(*) from public.psychology_checkins where module_slug='preparacion-mental-pre-partido'),
    'wellbeing',(select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
    'exercise',(select pg_catalog.count(*) from public.psychology_exercise_sessions),
    'modules',(select pg_catalog.count(*) from public.psychology_modules),
    'ledger',(select pg_catalog.count(*) from reflab_meta.production_adoption_state),
    'schema_state',(select pg_catalog.count(*) from reflab_meta.reflab_schema_state)
  )::text;`, "postgres").stdout.trim());
}

function sidecarAbsent(environment) {
  return psql(environment, `select pg_catalog.to_regrole('reflab_preflight_audit_owner') is null
    and pg_catalog.to_regnamespace('reflab_audit') is null
    and pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
    and not exists(select 1 from pg_catalog.pg_policy where polname='reflab_preflight_audit_owner_read')
    and not exists(select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) x
      where x.grantee=pg_catalog.to_regrole('reflab_preflight_audit_owner'));`, "postgres").stdout.trim() === "t";
}

function auditOwnerMemberships(environment) {
  return JSON.parse(psql(environment, `select coalesce(pg_catalog.json_agg(x order by x.member_role,x.grantor_role)::text,'[]') from (
    select granted.rolname granted_role,member_role.rolname member_role,grantor.rolname grantor_role,
      membership.admin_option,membership.inherit_option,membership.set_option
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted on granted.oid=membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid=membership.member
    join pg_catalog.pg_roles grantor on grantor.oid=membership.grantor
    where granted.rolname='reflab_preflight_audit_owner'
       or member_role.rolname='reflab_preflight_audit_owner'
  ) x;`, "postgres").stdout.trim());
}

function assertExactAutomaticMembership(environment, label) {
  const rows = auditOwnerMemberships(environment);
  const [row] = rows;
  if (rows.length !== 1
      || row.granted_role !== "reflab_preflight_audit_owner"
      || row.member_role !== "postgres"
      || row.grantor_role !== "supabase_admin"
      || row.admin_option !== true
      || row.inherit_option !== false
      || row.set_option !== false) {
    throw new Error(`${label} did not preserve the exact PostgreSQL 17 creator-admin membership.`);
  }
}

function assertPreserved(state, label) {
  if (state.attempts !== 37 || state.exam_results !== 6 || state.notification_events !== 60
      || state.checkins !== 3 || state.gestion_error !== 1 || state.post_match !== 1 || state.pre_match !== 1
      || state.wellbeing !== 0 || state.exercise !== 0 || state.modules !== 8
      || state.ledger !== 3 || state.schema_state !== 0) throw new Error(`${label} did not preserve reviewed state.`);
}

function invokeSnapshot(environment) {
  return runProductionSemanticAuditSnapshot({
    ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT: "true",
    REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD: head,
  }, {
    argument: SEMANTIC_AUDIT_SNAPSHOT_OPERATION,
    git: (args) => args[0] === "rev-parse" ? head : "",
    authorize: () => ({ projectRef: "nagjddldrldwavmfaytc", host: "127.0.0.1", connectionEnvironment: {} }),
    executeReadOnly: (sql) => executeBatch(environment, sql, "reflab_prod_preflight_ro"),
  });
}

function applyPreScenario(environment, scenario) {
  const firstTable = semanticAuditTables[0];
  const [firstColumn] = semanticAuditTableColumns[firstTable];
  const mutations = {
    audit_role_present: "create role reflab_preflight_audit_owner nologin",
    audit_schema_present: "create schema reflab_audit",
    audit_function_present: "create schema reflab_audit; create function reflab_audit.production_semantic_snapshot() returns jsonb language sql as $$select '{}'::jsonb$$",
    audit_policy_present: `create role reflab_preflight_audit_owner nologin; create policy reflab_preflight_audit_owner_read on ${firstTable} for select to reflab_preflight_audit_owner using(true)`,
    audit_grant_present: `create role reflab_preflight_audit_owner nologin; grant select(${firstColumn}) on ${firstTable} to reflab_preflight_audit_owner`,
    foundation_drift: "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; delete from reflab_meta.production_adoption_state where phase_order=1",
    exam_training_drift: "drop index public.referee_exam_sessions_user_status_idx",
    reconciliation_drift: "update public.psychology_checkins set module_slug='resiliencia' where id=1",
    phase310003_drift: "drop index public.notification_events_deduplication_unique",
    checkin_mapping_drift: "update public.psychology_checkins set module_slug='sin-clasificar' where id=1",
    modules_drift: "update public.psychology_modules set name='drift' where slug='gestion-error'",
    attempts_drift: "insert into public.attempts(id,exam_result_id) values(1000,null)",
    exam_results_drift: "insert into public.exam_results(id,submission_id) values('00000000-0000-0000-0000-000000001000',null)",
    notification_drift: "insert into public.notification_events(id,user_id) values(1000,'fixture-user')",
    ledger_drift: "alter table reflab_meta.production_adoption_state disable trigger production_adoption_state_guard; delete from reflab_meta.production_adoption_state where phase_order=3",
    schema_state_nonempty: `insert into reflab_meta.reflab_schema_state(
      baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status
    ) values('negative-fixture',repeat('a',64),repeat('b',64),'test','17.11',1,'installed')`,
    phase2b_present: "create function reflab_private.canonical_jsonb_text(jsonb) returns text language sql as $$select $1::text$$",
    development_present: "create function public.resolve_development_clerk_identity(text) returns text language sql as $$select $1$$",
    missing_table: `drop table ${semanticAuditTables.at(-1)}`,
    missing_column: `alter table ${firstTable} drop column ${firstColumn}`,
    rls_disabled: `alter table ${firstTable} disable row level security`,
  };
  psql(environment, mutations[scenario], "postgres");
}

function applyPostScenario(environment, scenario) {
  const firstTable = semanticAuditTables[0];
  if (scenario === "automatic_membership_absent") {
    psql(environment, "revoke reflab_preflight_audit_owner from postgres granted by supabase_admin", "supabase_admin");
    return;
  }
  if (["second_persistent_membership", "member_role_drift"].includes(scenario)) {
    psql(environment, `create role ${scenario} nologin;
      grant reflab_preflight_audit_owner to ${scenario}
        with admin false,inherit false,set false granted by supabase_admin`, "supabase_admin");
    return;
  }
  if (scenario === "grantor_role_drift") {
    psql(environment, `grant reflab_preflight_audit_owner to postgres
      with admin false,inherit false,set false granted by postgres`, "postgres");
    return;
  }
  if (scenario === "admin_option_false") {
    psql(environment, `revoke admin option for reflab_preflight_audit_owner
      from postgres granted by supabase_admin`, "supabase_admin");
    return;
  }
  if (scenario === "inherit_option_true") {
    psql(environment, `grant reflab_preflight_audit_owner to postgres
      with admin true,inherit true,set false granted by supabase_admin`, "supabase_admin");
    return;
  }
  if (scenario === "set_option_true") {
    psql(environment, `grant reflab_preflight_audit_owner to postgres
      with admin true,inherit false,set true granted by supabase_admin`, "supabase_admin");
    return;
  }
  if (scenario === "temporary_installer_membership_survives") {
    psql(environment, "grant reflab_preflight_audit_owner to postgres", "postgres");
    return;
  }
  if (["anon", "authenticated", "service_role", "reflab_rls_owner"].includes(scenario)) {
    psql(environment, `grant reflab_preflight_audit_owner to ${scenario}
      with admin false,inherit false,set false`, "postgres");
    return;
  }
  if (scenario === "unexpected_audit_ownership") {
    psql(environment, "create schema unexpected_audit_owned authorization reflab_preflight_audit_owner", "supabase_admin");
    return;
  }
  if (scenario === "product_dml") {
    psql(environment, `grant insert on ${firstTable} to reflab_preflight_audit_owner`, "postgres");
    return;
  }
  if (scenario === "schema_create_survives") {
    psql(environment, "grant create on schema reflab_audit to reflab_preflight_audit_owner", "postgres");
    return;
  }
  throw new Error(`Unknown post-DDL scenario: ${scenario}.`);
}

function injectFailure(sql, point) {
  const failure = `\ndo $failure$ begin raise exception '310004 ${point}' using errcode='55000'; end $failure$;\n`;
  const patterns = {
    after_role: /(create role reflab_preflight_audit_owner[\s\S]*?nobypassrls\s*;)/i,
    after_policy: /(create policy reflab_preflight_audit_owner_read[\s\S]*?using \(true\)\s*;)/i,
    after_grants: /(grant select \([^;]+\) on table public\.wellness_logs to reflab_preflight_audit_owner\s*;)/i,
    after_function: /(grant execute on function reflab_audit\.production_semantic_snapshot\(\) to reflab_prod_preflight_ro\s*;)/i,
    before_commit: /(commit\s*;\s*)$/i,
  };
  const mutated = sql.replace(patterns[point], (match) => point === "before_commit" ? `${failure}${match}` : `${match}${failure}`);
  if (mutated === sql) throw new Error(`HARNESS_SETUP_FAIL: ${point} injection was a no-op.`);
  return mutated;
}

function applyTeardownScenario(environment, scenario) {
  const firstTable = semanticAuditTables[0];
  const [firstColumn] = semanticAuditTableColumns[firstTable];
  const mutations = {
    unexpected_function_dependency: "create view public.semantic_audit_dependency as select reflab_audit.production_semantic_snapshot() payload",
    unexpected_role_ownership: "create schema unexpected_audit_owned authorization reflab_preflight_audit_owner",
    unexpected_membership: "grant reflab_preflight_audit_owner to authenticated",
    policy_drift: `alter policy reflab_preflight_audit_owner_read on ${firstTable} using(false)`,
    grant_drift: `revoke select(${firstColumn}) on ${firstTable} from reflab_preflight_audit_owner`,
    missing_object: "drop function reflab_audit.production_semantic_snapshot()",
    unexpected_schema_object: "create table reflab_audit.unexpected_object(id integer)",
    inconsistent_phase: `insert into reflab_meta.reflab_schema_state(
      baseline_version,sql_checksum,manifest_hash,environment,postgres_version,schema_version,installation_status
    ) values('teardown-negative',repeat('c',64),repeat('d',64),'test','17.11',1,'installed')`,
  };
  if (scenario === "creator_membership_absent") {
    psql(environment, "revoke reflab_preflight_audit_owner from postgres granted by supabase_admin", "supabase_admin");
    return;
  }
  if (scenario === "creator_membership_option_drift") {
    psql(environment, `grant reflab_preflight_audit_owner to postgres
      with admin true,inherit false,set true granted by supabase_admin`, "supabase_admin");
    return;
  }
  if (scenario === "creator_membership_grantor_drift") {
    psql(environment, `grant reflab_preflight_audit_owner to postgres
      with admin false,inherit false,set false granted by postgres`, "postgres");
    return;
  }
  psql(environment, mutations[scenario], "supabase_admin");
}

async function prepared(callback) {
  return withCluster("absent", async (environment) => {
    preparePost310003State(environment);
    return callback(environment);
  });
}

export async function runProductionPhase2aSemanticAuditPostgres() {
  const migrationSql = readFileSync(resolve(root, PHASE2A_SEMANTIC_AUDIT_ARTIFACT), "utf8");
  const teardown = assertSemanticAuditTeardownArtifact(root);
  const positive = await prepared(async (environment) => {
    const before = preservedState(environment); assertPreserved(before, "Pre-DDL");
    let result;
    try {
      result = runProductionPhase2aSemanticAudit(runnerEnvironment(), localDependencies(environment, migrationSql));
    } catch (error) {
      const diagnosticResults = executeBatch(environment, buildPhase2aSemanticAuditPostBatch());
      const diagnostic = diagnosticResults.get(PHASE2A_SEMANTIC_AUDIT_POST_QUERY_ID);
      const installerDiagnostic = classifyInstallerIdentity(diagnosticResults.get(installerIdentityQuery.id));
      const examDiagnostic = diagnosticResults.get(PHASE1_EXAM_TRAINING_POST_QUERY_ID);
      const psychologyDiagnostic = diagnosticResults.get(PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID);
      const diagnosticShape = { keys: Object.keys(diagnostic ?? {}).sort(), counts: diagnostic?.counts,
        caller: diagnostic?.caller, sessionUser: diagnostic?.session_user,
        readOnly: diagnostic?.transaction_read_only,
        versionType: typeof diagnostic?.server_version_num,
        sourceType: typeof diagnostic?.function_source_base64,
        classification: classifyPhase2aSemanticAuditPost(diagnostic) };
      const membership = psql(environment, `select coalesce(pg_catalog.json_agg(x order by x.grantor_role)::text,'[]') from (
        select granted.rolname granted_role,member_role.rolname member_role,grantor.rolname grantor_role,
          membership.admin_option,membership.inherit_option,membership.set_option
        from pg_catalog.pg_auth_members membership
        join pg_catalog.pg_roles granted on granted.oid=membership.roleid
        join pg_catalog.pg_roles member_role on member_role.oid=membership.member
        join pg_catalog.pg_roles grantor on grantor.oid=membership.grantor
        where granted.rolname='reflab_preflight_audit_owner' or member_role.rolname='reflab_preflight_audit_owner'
      ) x;`, "postgres").stdout.trim();
      throw new Error(`${error.message} installer=${JSON.stringify(installerDiagnostic)} examChecks=${JSON.stringify(examDiagnostic?.checks)} psychologyChecks=${JSON.stringify(psychologyDiagnostic?.checks)} shape=${JSON.stringify(diagnosticShape)} checks=${JSON.stringify(diagnostic?.checks)} membership=${membership}`);
    }
    assertExactAutomaticMembership(environment, "Post-DDL");
    const after = preservedState(environment); assertPreserved(after, "Post-DDL");
    const snapshot = invokeSnapshot(environment);
    if (Object.keys(snapshot.snapshot).sort().join(",") !== Object.keys(semanticAuditExpectedFields).sort().join(",")) {
      throw new Error("Semantic snapshot aggregate contract drifted.");
    }
    psql(environment, teardown.sql, "postgres");
    if (!sidecarAbsent(environment)) throw new Error("Teardown left Phase 2A sidecar infrastructure.");
    if (auditOwnerMemberships(environment).length !== 0) throw new Error("Teardown left an audit-owner membership.");
    assertPreserved(preservedState(environment), "Teardown");
    return { result, snapshot: { classification: "PASS", readOnly: true,
      groups: Object.keys(snapshot.snapshot).length,
      metrics: Object.values(semanticAuditExpectedFields).flat().length }, teardown: "PASS" };
  });

  const preScenarios = ["audit_role_present", "audit_schema_present", "audit_function_present", "audit_policy_present",
    "audit_grant_present", "foundation_drift", "exam_training_drift", "reconciliation_drift", "phase310003_drift",
    "checkin_mapping_drift", "modules_drift", "attempts_drift", "exam_results_drift", "notification_drift",
    "ledger_drift", "schema_state_nonempty", "phase2b_present", "development_present", "missing_table",
    "missing_column", "rls_disabled"];
  for (const scenario of preScenarios) await prepared(async (environment) => {
    applyPreScenario(environment, scenario);
    let migrationCalls = 0;
    let blocked = false;
    try {
      runProductionPhase2aSemanticAudit(runnerEnvironment(), { ...localDependencies(environment, migrationSql),
        executeMigration: () => { migrationCalls += 1; } });
    } catch { blocked = true; }
    if (!blocked || migrationCalls !== 0) throw new Error(`Pre-DDL negative failed closed incorrectly: ${scenario}.`);
  });

  const membershipScenarios = ["automatic_membership_absent", "second_persistent_membership", "member_role_drift",
    "grantor_role_drift", "admin_option_false", "inherit_option_true", "set_option_true",
    "temporary_installer_membership_survives", "anon", "authenticated", "service_role", "reflab_rls_owner",
    "unexpected_audit_ownership", "product_dml", "schema_create_survives"];
  for (const scenario of membershipScenarios) await prepared(async (environment) => {
    let blocked = false;
    try {
      runProductionPhase2aSemanticAudit(runnerEnvironment(), { ...localDependencies(environment, migrationSql),
        executeMigration: (sql) => { psql(environment, sql, "postgres"); applyPostScenario(environment, scenario); } });
    } catch (error) { blocked = /post-DDL attestation failed/.test(error.message); }
    if (!blocked) throw new Error(`Post-DDL membership/security negative did not block: ${scenario}.`);
  });

  const failurePoints = ["after_role", "after_policy", "after_grants", "after_function", "before_commit"];
  for (const point of failurePoints) await prepared(async (environment) => {
    const before = preservedState(environment);
    let blocked = false;
    try { runProductionPhase2aSemanticAudit(runnerEnvironment(), localDependencies(environment, injectFailure(migrationSql, point))); }
    catch (error) { blocked = /rollback=PASS/.test(error.message); }
    if (!blocked || !sidecarAbsent(environment)) throw new Error(`310004 rollback failed: ${point}.`);
    assertPreserved(preservedState(environment), `Rollback ${point}`);
    assertPreserved(before, `Rollback baseline ${point}`);
  });

  const teardownScenarios = ["unexpected_function_dependency", "unexpected_role_ownership", "unexpected_membership",
    "policy_drift", "grant_drift", "missing_object", "unexpected_schema_object", "inconsistent_phase",
    "creator_membership_absent", "creator_membership_option_drift", "creator_membership_grantor_drift"];
  for (const scenario of teardownScenarios) await prepared(async (environment) => {
    psql(environment, migrationSql, "postgres");
    const before = preservedState(environment);
    applyTeardownScenario(environment, scenario);
    const mutated = preservedState(environment);
    const result = psql(environment, teardown.sql, "postgres", true);
    if (result.status === 0) throw new Error(`Teardown negative did not abort: ${scenario}.`);
    if (sidecarAbsent(environment)) throw new Error(`Teardown negative removed the sidecar: ${scenario}.`);
    const afterFailure = preservedState(environment);
    if (JSON.stringify(afterFailure) !== JSON.stringify(mutated)) {
      throw new Error(`Teardown negative changed state despite rollback: ${scenario}.`);
    }
    if (scenario !== "inconsistent_phase") assertPreserved(afterFailure, `Teardown rollback ${scenario}`);
    assertPreserved(before, `Teardown rollback baseline ${scenario}`);
  });

  return { localOnly: true, postgresMajor: 17, positiveInstall: positive.result.postDdl,
    semanticSnapshot: positive.snapshot, installNegatives: preScenarios.length,
    membershipNegatives: membershipScenarios.length, rollbackTests: failurePoints.length, teardownPositive: positive.teardown,
    teardownNegatives: teardownScenarios.length, cleanup: "PASS" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runProductionPhase2aSemanticAuditPostgres())}\n`);
}
