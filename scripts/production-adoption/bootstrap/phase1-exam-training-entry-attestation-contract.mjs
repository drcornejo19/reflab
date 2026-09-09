import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";

export const PHASE1_EXAM_TRAINING_ENTRY_FORMAT =
  "REFLAB_PRODUCTION_PHASE1_EXAM_TRAINING_ENTRY_ATTESTATION_V1";
export const PHASE1_EXAM_TRAINING_QUERY_ID = "production_phase1_exam_training_entry";
export const PHASE1_EXAM_TRAINING_ARTIFACT =
  "supabase/migrations/202608310002_production_adoption_exam_training_prerequisites.sql";
export const PHASE1_EXAM_TRAINING_SHA256 =
  "de338ac00d169da615a75ae721be743cedf6607bb6c83af8e0618916c583e67f";
export const PHASE1_EXAM_TRAINING_NEXT_REVIEW = "310002_EXECUTION_REVIEW";

export const PHASE1_EXAM_TRAINING_REQUIRED_TABLES = Object.freeze([
  "public.attempts",
  "public.exam_results",
  "public.institutions",
  "public.institution_groups",
  "public.institution_assessment_sessions",
]);

export const PHASE1_EXAM_TRAINING_SOURCE_COLUMNS = Object.freeze([
  Object.freeze({ table: "public.attempts", column: "exam_result_id", type: "uuid" }),
  Object.freeze({ table: "public.exam_results", column: "submission_id", type: "uuid" }),
]);

export const PHASE1_EXAM_TRAINING_TARGET_COLUMNS = Object.freeze([
  "public.attempts.source_item_type",
  "public.attempts.source_item_id",
  "public.attempts.source_occurrence_id",
  "public.attempts.institution_assessment_session_id",
  "public.exam_results.exam_session_id",
  "public.exam_results.payload_hash",
]);

export const PHASE1_EXAM_TRAINING_TARGET_INDEXES = Object.freeze([
  "public.attempts_exam_occurrence_unique",
  "public.referee_exam_sessions_user_status_idx",
  "public.referee_exam_sessions_institution_idx",
]);

export const PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS = Object.freeze([
  ...[
    "referee_exam_sessions_context_type_check",
    "referee_exam_sessions_sport_type_check",
    "referee_exam_sessions_activity_type_check",
    "referee_exam_sessions_item_manifest_check",
    "referee_exam_sessions_manifest_hash_check",
    "referee_exam_sessions_item_count_range_check",
    "referee_exam_sessions_status_check",
    "referee_exam_sessions_item_count_check",
    "referee_exam_sessions_expiry_check",
    "referee_exam_sessions_context_check",
  ].map((name) => Object.freeze({ table: "public.referee_exam_sessions", name, type: "c" })),
  Object.freeze({ table: "public.exam_results", name: "exam_results_payload_hash_check", type: "c" }),
  Object.freeze({ table: "public.attempts", name: "attempts_source_reference_check", type: "c" }),
  Object.freeze({ table: "public.attempts", name: "attempts_source_type_check", type: "c" }),
  ...[
    "referee_exam_sessions_institution_fk",
    "referee_exam_sessions_group_fk",
    "referee_exam_sessions_assessment_session_fk",
  ].map((name) => Object.freeze({ table: "public.referee_exam_sessions", name, type: "f" })),
  Object.freeze({ table: "public.exam_results", name: "exam_results_session_fk", type: "f" }),
  Object.freeze({ table: "public.attempts", name: "attempts_adoption_assessment_session_fk", type: "f" }),
  Object.freeze({
    table: "public.referee_exam_sessions",
    name: "referee_exam_sessions_user_submission_unique",
    type: "u",
  }),
  Object.freeze({ table: "public.exam_results", name: "exam_results_exam_session_unique", type: "u" }),
]);

export const PHASE1_EXAM_TRAINING_FK_TYPES = Object.freeze([
  Object.freeze({
    source: "public.referee_exam_sessions.institution_id", sourceType: "uuid",
    target: "public.institutions.id", targetType: "uuid", targetOrigin: "catalog",
  }),
  Object.freeze({
    source: "public.referee_exam_sessions.institution_group_id", sourceType: "uuid",
    target: "public.institution_groups.id", targetType: "uuid", targetOrigin: "catalog",
  }),
  Object.freeze({
    source: "public.referee_exam_sessions.institution_assessment_session_id", sourceType: "uuid",
    target: "public.institution_assessment_sessions.id", targetType: "uuid", targetOrigin: "catalog",
  }),
  Object.freeze({
    source: "public.exam_results.exam_session_id", sourceType: "uuid",
    target: "public.referee_exam_sessions.id", targetType: "uuid", targetOrigin: "artifact",
  }),
  Object.freeze({
    source: "public.attempts.institution_assessment_session_id", sourceType: "uuid",
    target: "public.institution_assessment_sessions.id", targetType: "uuid", targetOrigin: "catalog",
  }),
]);

export const PHASE1_EXAM_TRAINING_CHECK_NAMES = Object.freeze(
  PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.filter((entry) => entry.type === "c").map((entry) => entry.name),
);
export const PHASE1_EXAM_TRAINING_FK_NAMES = Object.freeze(
  PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.filter((entry) => entry.type === "f").map((entry) => entry.name),
);
export const PHASE1_EXAM_TRAINING_UNIQUE_NAMES = Object.freeze(
  PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.filter((entry) => entry.type === "u").map((entry) => entry.name),
);

const requiredChecks = Object.freeze([
  "requiredTablesExist",
  "requiredTablesOwnedByPostgres",
  "postgresCanCreatePublic",
  "sourceColumnTypesExact",
  "fkTypeCompatibilityExact",
  "targetTableAbsent",
  "targetColumnsAbsent",
  "targetIndexesAbsent",
  "targetConstraintsAbsent",
  "genRandomUuidExact",
]);

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function splitIdentity(identity) {
  const parts = identity.split(".");
  return { schema: parts[0], table: parts[1], column: parts[2] };
}

function valuesSql(rows) {
  return rows.map((row) => `(${row.map(sqlLiteral).join(",")})`).join(",\n      ");
}

const requiredTableValues = valuesSql(PHASE1_EXAM_TRAINING_REQUIRED_TABLES.map((identity) => {
  const [schema, table] = identity.split(".");
  return [schema, table];
}));
const sourceColumnValues = valuesSql(PHASE1_EXAM_TRAINING_SOURCE_COLUMNS.map((entry) => {
  const { schema, table } = splitIdentity(`${entry.table}.${entry.column}`);
  return [schema, table, entry.column, entry.type];
}));
const targetColumnValues = valuesSql(PHASE1_EXAM_TRAINING_TARGET_COLUMNS.map((identity) => {
  const { schema, table, column } = splitIdentity(identity);
  return [schema, table, column];
}));
const targetIndexValues = valuesSql(PHASE1_EXAM_TRAINING_TARGET_INDEXES.map((identity) => {
  const [schema, name] = identity.split(".");
  return [schema, name];
}));
const targetConstraintValues = valuesSql(PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.map((entry) => {
  const [schema, table] = entry.table.split(".");
  return [schema, table, entry.name, entry.type];
}));
const fkTypeValues = valuesSql(PHASE1_EXAM_TRAINING_FK_TYPES.map((entry) => {
  const source = splitIdentity(entry.source);
  const target = splitIdentity(entry.target);
  return [
    source.schema, source.table, source.column, entry.sourceType,
    target.schema, target.table, target.column, entry.targetType, entry.targetOrigin,
  ];
}));

export function phase1ExamTrainingArtifactHash(repositoryRoot) {
  return createHash("sha256")
    .update(readFileSync(resolve(repositoryRoot, PHASE1_EXAM_TRAINING_ARTIFACT)))
    .digest("hex");
}

export function assertPhase1ExamTrainingArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PHASE1_EXAM_TRAINING_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== PHASE1_EXAM_TRAINING_SHA256) {
    throw new Error("Production Phase 1 Exam/Training prerequisite artifact hash mismatch.");
  }
  return { path: PHASE1_EXAM_TRAINING_ARTIFACT, sha256, sql };
}

export const phase1ExamTrainingEntryQuery = jsonQuery(
  PHASE1_EXAM_TRAINING_QUERY_ID,
  `(with required_tables(schema_name, table_name) as (
    values ${requiredTableValues}
  ), required_table_state as (
    select expected.schema_name, expected.table_name, relation.oid,
      pg_catalog.pg_get_userbyid(relation.relowner) as owner_name
    from required_tables expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
  ), postgres_role as (
    select oid from pg_catalog.pg_roles where rolname = 'postgres'
  ), public_schema as (
    select namespace.oid, pg_catalog.pg_get_userbyid(namespace.nspowner) as owner_name
    from pg_catalog.pg_namespace namespace where namespace.nspname = 'public'
  ), source_columns(schema_name, table_name, column_name, expected_type) as (
    values ${sourceColumnValues}
  ), source_column_state as (
    select expected.*,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type
    from source_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), fk_types(
    source_schema, source_table, source_column, source_type,
    target_schema, target_table, target_column, target_type, target_origin
  ) as (
    values ${fkTypeValues}
  ), fk_type_state as (
    select expected.*,
      case when expected.target_origin = 'artifact' then expected.target_type
        else pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) end as observed_target_type
    from fk_types expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.target_schema
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.target_table and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.target_column and attribute.attnum > 0 and not attribute.attisdropped
  ), target_columns(schema_name, table_name, column_name) as (
    values ${targetColumnValues}
  ), target_column_state as (
    select expected.*, attribute.attnum is not null as present
    from target_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), target_indexes(schema_name, index_name) as (
    values ${targetIndexValues}
  ), target_index_state as (
    select expected.*, relation.oid is not null as present
    from target_indexes expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.index_name and relation.relkind in ('i', 'I')
  ), target_constraints(schema_name, table_name, constraint_name, constraint_type) as (
    values ${targetConstraintValues}
  ), target_constraint_state as (
    select expected.*, constraint_record.oid is not null as present
    from target_constraints expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_constraint constraint_record on constraint_record.conrelid = relation.oid
      and constraint_record.conname = expected.constraint_name
      and constraint_record.contype = expected.constraint_type::\"char\"
  ), uuid_resolution as (
    select routine.oid, namespace.nspname as schema_name,
      pg_catalog.pg_get_function_identity_arguments(routine.oid) as identity_arguments,
      pg_catalog.format_type(routine.prorettype, null) as return_type,
      pg_catalog.pg_function_is_visible(routine.oid) as visible
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    where routine.oid = pg_catalog.to_regprocedure('gen_random_uuid()')
      and routine.prokind = 'f'
  ), uuid_visible_candidates as (
    select pg_catalog.count(*) as candidate_count
    from pg_catalog.pg_proc routine
    where routine.proname = 'gen_random_uuid'
      and pg_catalog.pg_get_function_identity_arguments(routine.oid) = ''
      and pg_catalog.pg_function_is_visible(routine.oid)
  ), calculated as (
    select pg_catalog.json_build_object(
      'requiredTablesExist', (select pg_catalog.count(*) filter (where oid is not null) = ${PHASE1_EXAM_TRAINING_REQUIRED_TABLES.length} from required_table_state),
      'requiredTablesOwnedByPostgres', (select pg_catalog.count(*) filter (where oid is not null and owner_name = 'postgres') = ${PHASE1_EXAM_TRAINING_REQUIRED_TABLES.length} from required_table_state),
      'postgresCanCreatePublic', coalesce((select pg_catalog.has_schema_privilege(postgres_role.oid, public_schema.oid, 'CREATE') from postgres_role cross join public_schema), false),
      'sourceColumnTypesExact', (select pg_catalog.count(*) = ${PHASE1_EXAM_TRAINING_SOURCE_COLUMNS.length} and pg_catalog.bool_and(observed_type = expected_type) from source_column_state),
      'fkTypeCompatibilityExact', (select pg_catalog.count(*) = ${PHASE1_EXAM_TRAINING_FK_TYPES.length} and pg_catalog.bool_and(source_type = target_type and observed_target_type = target_type) from fk_type_state),
      'targetTableAbsent', not exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and relation.relname = 'referee_exam_sessions'
      ),
      'targetColumnsAbsent', not exists (select 1 from target_column_state where present),
      'targetIndexesAbsent', not exists (select 1 from target_index_state where present),
      'targetConstraintsAbsent', not exists (select 1 from target_constraint_state where present),
      'genRandomUuidExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        schema_name = 'pg_catalog' and identity_arguments = '' and return_type = 'uuid' and visible
      ) from uuid_resolution) and (select candidate_count = 1 from uuid_visible_candidates)
    ) as checks
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', (select checks from calculated),
    'evidence', pg_catalog.json_build_object(
      'required_table_count', (select pg_catalog.count(*) from required_table_state),
      'missing_required_table_count', (select pg_catalog.count(*) from required_table_state where oid is null),
      'wrong_owner_table_count', (select pg_catalog.count(*) from required_table_state where oid is not null and owner_name <> 'postgres'),
      'public_schema_owner', (select owner_name from public_schema),
      'source_column_count', (select pg_catalog.count(*) from source_column_state),
      'source_column_type_mismatch_count', (select pg_catalog.count(*) from source_column_state where observed_type is distinct from expected_type),
      'fk_type_contract_count', (select pg_catalog.count(*) from fk_type_state),
      'fk_type_mismatch_count', (select pg_catalog.count(*) from fk_type_state where source_type is distinct from target_type or observed_target_type is distinct from target_type),
      'present_target_column_count', (select pg_catalog.count(*) from target_column_state where present),
      'present_target_index_count', (select pg_catalog.count(*) from target_index_state where present),
      'present_target_constraint_count', (select pg_catalog.count(*) from target_constraint_state where present),
      'gen_random_uuid_schema', (select schema_name from uuid_resolution),
      'gen_random_uuid_identity_arguments', (select identity_arguments from uuid_resolution),
      'gen_random_uuid_return_type', (select return_type from uuid_resolution),
      'gen_random_uuid_visible_candidate_count', (select candidate_count from uuid_visible_candidates)
    )
  ))`,
);

export function classifyPhase1ExamTrainingEntry(payload, installerClassification) {
  const checks = payload?.checks;
  const complete = Boolean(payload)
    && typeof payload.caller === "string"
    && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num)
    && Boolean(checks)
    && requiredChecks.every((field) => typeof checks[field] === "boolean")
    && typeof installerClassification?.managedProfile === "string"
    && typeof installerClassification?.lifecycleState === "string";
  if (!complete) {
    return { classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE" };
  }

  const callerExact = payload.caller === "reflab_prod_preflight_ro"
    && payload.session_user === "reflab_prod_preflight_ro";
  const readOnlyExact = payload.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(payload.server_version_num / 10000) === 17;
  const installerReady = installerClassification.managedProfile === "READY"
    && installerClassification.lifecycleState === "POST_BOOTSTRAP";
  const catalogExact = requiredChecks.every((field) => checks[field] === true);
  const pass = callerExact && readOnlyExact && postgresMajorExact && installerReady && catalogExact;

  return {
    classification: pass ? "PASS" : "BLOCKER",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    installerReady,
    catalogExact,
    checks: Object.fromEntries(requiredChecks.map((field) => [field, checks[field]])),
    nextAllowedRemoteOperation: pass ? PHASE1_EXAM_TRAINING_NEXT_REVIEW : "NONE",
  };
}
