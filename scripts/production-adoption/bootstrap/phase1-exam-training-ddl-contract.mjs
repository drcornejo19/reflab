import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import {
  PHASE1_EXAM_TRAINING_ARTIFACT,
  PHASE1_EXAM_TRAINING_CHECK_NAMES,
  PHASE1_EXAM_TRAINING_FK_NAMES,
  PHASE1_EXAM_TRAINING_SHA256,
  PHASE1_EXAM_TRAINING_TARGET_COLUMNS,
  PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS,
  PHASE1_EXAM_TRAINING_TARGET_INDEXES,
  PHASE1_EXAM_TRAINING_UNIQUE_NAMES,
  assertPhase1ExamTrainingArtifact,
} from "./phase1-exam-training-entry-attestation-contract.mjs";

export const PHASE1_EXAM_TRAINING_DDL_FORMAT =
  "REFLAB_PRODUCTION_PHASE1_EXAM_TRAINING_PREREQUISITES_V1";
export const PHASE1_EXAM_TRAINING_OPERATION =
  "--production-phase1-exam-training-prerequisites";
export const PHASE1_EXAM_TRAINING_OPT_IN =
  "ALLOW_PRODUCTION_PHASE1_EXAM_TRAINING_PREREQUISITES";
export const PHASE1_EXAM_TRAINING_POST_QUERY_ID =
  "phase1_exam_training_prerequisites_post_attestation";

const expectedPostChecks = Object.freeze([
  "foundationStatePreserved",
  "targetTableExact",
  "targetTableEmpty",
  "targetColumnsExact",
  "targetColumnsNullable",
  "targetIndexesExact",
  "targetConstraintsExact",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
  "fabricatedAssociationsAbsent",
]);

const expectedColumnValues = [
  ["attempts", "source_item_type", "text"],
  ["attempts", "source_item_id", "text"],
  ["attempts", "source_occurrence_id", "uuid"],
  ["attempts", "institution_assessment_session_id", "uuid"],
  ["exam_results", "exam_session_id", "uuid"],
  ["exam_results", "payload_hash", "text"],
].map((row) => `('${row.join("','")}')`).join(",\n      ");

const expectedConstraintValues = PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS
  .map((entry) => {
    const [, table] = entry.table.split(".");
    return `('${table}','${entry.name}','${entry.type}')`;
  })
  .join(",\n      ");

export function assertPhase1ExamTrainingDdlArtifact(repositoryRoot) {
  const artifact = assertPhase1ExamTrainingArtifact(repositoryRoot);
  const sql = artifact.sql;
  const createdTables = [...sql.matchAll(/\bcreate\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const createdIndexes = [...sql.matchAll(/\bcreate\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => `public.${match[1].toLowerCase()}`);
  const insertTargets = [...sql.matchAll(/\binsert\s+into\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const addedColumns = [...sql.matchAll(/\badd\s+column\s+([a-z_][a-z0-9_]*)\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => `${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
  const expectedColumns = [
    "exam_session_id:uuid", "payload_hash:text", "source_item_type:text",
    "source_item_id:text", "source_occurrence_id:uuid",
    "institution_assessment_session_id:uuid",
  ];

  if (artifact.sha256 !== PHASE1_EXAM_TRAINING_SHA256
      || createdTables.length !== 1 || createdTables[0] !== "public.referee_exam_sessions"
      || JSON.stringify(createdIndexes) !== JSON.stringify(PHASE1_EXAM_TRAINING_TARGET_INDEXES)
      || JSON.stringify(insertTargets) !== JSON.stringify(["reflab_meta.production_adoption_state"])
      || JSON.stringify(addedColumns) !== JSON.stringify(expectedColumns)) {
    throw new Error("Production 310002 DDL scope drifted.");
  }
  if (/\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?(?:public|auth|storage)\./i.test(sql)
      || /\binsert\s+into\s+(?:public|auth|storage)\./i.test(sql)
      || /\badd\s+column\s+canonical_payload_hash\b/i.test(sql)
      || /\badd\s+constraint\s+attempts_exam_source_check\b/i.test(sql)
      || /\b(?:insert|update|delete)\b[^;]*\bsupabase_migrations\b/i.test(sql)
      || /\bcreate\s+(?:table|function)\b[^;]*(?:user_identity_links|development_clerk_identity)/i.test(sql)) {
    throw new Error("Production 310002 contains forbidden product or finalization scope.");
  }
  if (!/values\s*\(\s*2\s*,\s*'exam_training_prerequisites'\s*,\s*'foundation'/i.test(sql)
      || !/begin\s*;/i.test(sql) || !/commit\s*;\s*$/i.test(sql)
      || !/set\s+local\s+lock_timeout\s*=\s*'5s'/i.test(sql)
      || !/set\s+local\s+statement_timeout\s*=\s*'60s'/i.test(sql)) {
    throw new Error("Production 310002 transaction or ledger contract drifted.");
  }
  return artifact;
}

export const phase1ExamTrainingPostQuery = jsonQuery(
  PHASE1_EXAM_TRAINING_POST_QUERY_ID,
  `(with expected_columns(table_name, column_name, expected_type) as (
    values ${expectedColumnValues}
  ), column_state as (
    select expected.*,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      not attribute.attnotnull as nullable
    from expected_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), expected_constraints(table_name, constraint_name, constraint_type) as (
    values ${expectedConstraintValues}
  ), constraint_state as (
    select expected.*, constraint_record.oid, constraint_record.convalidated
    from expected_constraints expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_constraint constraint_record on constraint_record.conrelid = relation.oid
      and constraint_record.conname = expected.constraint_name
      and constraint_record.contype = expected.constraint_type::"char"
  ), index_state as (
    select index_relation.relname,
      index_record.indisunique, index_record.indisvalid, index_record.indisready,
      access_method.amname,
      index_record.indnkeyatts, index_record.indnatts,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(index_record.indkey::smallint[]) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = index_record.indrelid
         and attribute.attnum = key.attnum
       where key.ordinality <= index_record.indnkeyatts) as key_columns,
      (select pg_catalog.array_agg(option_value order by option_key.ordinality)
       from pg_catalog.unnest(index_record.indoption::smallint[]) with ordinality option_key(option_value, ordinality)
       where option_key.ordinality <= index_record.indnkeyatts) as key_options,
      case when index_record.indpred is null then null else pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid, false)),
        '[()[:space:]]', '', 'g') end as predicate
    from pg_catalog.pg_class index_relation
    join pg_catalog.pg_namespace namespace on namespace.oid = index_relation.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid = index_relation.oid
    join pg_catalog.pg_class table_relation on table_relation.oid = index_record.indrelid
    join pg_catalog.pg_am access_method on access_method.oid = index_relation.relam
    where namespace.nspname = 'public'
      and index_relation.relname in (
        'attempts_exam_occurrence_unique',
        'referee_exam_sessions_user_status_idx',
        'referee_exam_sessions_institution_idx'
      )
  ), calculated as (
    select pg_catalog.json_build_object(
      'foundationStatePreserved',
        pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is not null
        and pg_catalog.to_regclass('reflab_meta.production_adoption_state') is not null,
      'targetTableExact', exists (
        select 1 from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public' and relation.relname = 'referee_exam_sessions'
          and relation.relkind = 'r' and relation.relrowsecurity and not relation.relforcerowsecurity
          and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      ),
      'targetTableEmpty', (select pg_catalog.count(*) = 0 from public.referee_exam_sessions),
      'targetColumnsExact', (select pg_catalog.count(*) = 6
        and pg_catalog.bool_and(observed_type = expected_type) from column_state),
      'targetColumnsNullable', (select pg_catalog.count(*) = 6
        and pg_catalog.bool_and(nullable) from column_state),
      'targetIndexesExact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(
        amname = 'btree' and indisvalid and indisready and indnkeyatts = indnatts
        and case relname
          when 'attempts_exam_occurrence_unique' then indisunique
            and key_columns = array['exam_result_id','source_occurrence_id']::name[]
            and key_options = array[0,0]::smallint[]
            and predicate = 'exam_result_idisnotnullandsource_occurrence_idisnotnull'
          when 'referee_exam_sessions_user_status_idx' then not indisunique
            and key_columns = array['user_id','status','expires_at']::name[]
            and key_options = array[0,0,0]::smallint[] and predicate is null
          when 'referee_exam_sessions_institution_idx' then not indisunique
            and key_columns = array['institution_id','status','created_at']::name[]
            and key_options = array[0,0,3]::smallint[] and predicate is null
          else false end
      ) from index_state),
      'targetConstraintsExact', (select pg_catalog.count(*) = ${PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.length}
        and pg_catalog.bool_and(oid is not null and convalidated) from constraint_state),
      'ledgerExact', (select pg_catalog.count(*) = 2
        and pg_catalog.count(*) filter (where phase_order = 1 and phase_key = 'foundation'
          and previous_phase_key is null) = 1
        and pg_catalog.count(*) filter (where phase_order = 2
          and phase_key = 'exam_training_prerequisites' and previous_phase_key = 'foundation') = 1
        from reflab_meta.production_adoption_state),
      'schemaStateEmpty', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'identityLinksAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'developmentObjectsAbsent', not exists (
        select 1 from pg_catalog.pg_proc routine
        join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
        where namespace.nspname = 'public' and routine.proname in (
          'resolve_development_clerk_identity', 'link_development_clerk_identity',
          'link_development_super_admin_clerk_identity')
      ),
      'fabricatedAssociationsAbsent', not exists (
        select 1 from public.attempts where source_item_type is not null
          or source_item_id is not null or source_occurrence_id is not null
          or institution_assessment_session_id is not null
      ) and not exists (
        select 1 from public.exam_results where exam_session_id is not null or payload_hash is not null
      )
    ) as checks
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', (select checks from calculated),
    'counts', pg_catalog.json_build_object(
      'target_columns', (select pg_catalog.count(*) from column_state),
      'target_indexes', (select pg_catalog.count(*) from index_state),
      'target_constraints', (select pg_catalog.count(*) from constraint_state where oid is not null),
      'check_constraints', (select pg_catalog.count(*) from constraint_state where oid is not null and constraint_type = 'c'),
      'foreign_keys', (select pg_catalog.count(*) from constraint_state where oid is not null and constraint_type = 'f'),
      'unique_constraints', (select pg_catalog.count(*) from constraint_state where oid is not null and constraint_type = 'u'),
      'target_rows', (select pg_catalog.count(*) from public.referee_exam_sessions),
      'schema_state_rows', (select pg_catalog.count(*) from reflab_meta.reflab_schema_state),
      'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state)
    )
  ))`,
);

export function classifyPhase1ExamTrainingPost(
  payload,
  installerClassification,
  beforeFingerprint,
  afterFingerprint,
) {
  const checks = payload?.checks;
  const complete = Boolean(payload)
    && typeof payload.caller === "string"
    && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num)
    && Boolean(checks)
    && expectedPostChecks.every((field) => typeof checks[field] === "boolean")
    && typeof installerClassification?.managedProfile === "string"
    && typeof installerClassification?.lifecycleState === "string"
    && Boolean(beforeFingerprint) && Boolean(afterFingerprint);
  if (!complete) return { classification: "UNKNOWN", postState: "UNKNOWN" };

  const callerExact = payload.caller === "postgres" && payload.session_user === "postgres";
  const readOnlyExact = payload.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(payload.server_version_num / 10000) === 17;
  const installerReady = installerClassification.managedProfile === "READY"
    && installerClassification.lifecycleState === "POST_BOOTSTRAP";
  const checksExact = expectedPostChecks.every((field) => checks[field] === true);
  const productFingerprintPreserved = ["attempts", "exam_results", "notification_events"]
    .every((field) => Number.isInteger(beforeFingerprint[field])
      && beforeFingerprint[field] === afterFingerprint[field]);
  const pass = callerExact && readOnlyExact && postgresMajorExact
    && installerReady && checksExact && productFingerprintPreserved;
  return {
    classification: pass ? "PASS" : "BLOCKER",
    postState: pass ? "EXACT" : "BLOCKER",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    installerReady,
    checksExact,
    productFingerprintPreserved,
    checks: Object.fromEntries(expectedPostChecks.map((field) => [field, checks[field]])),
  };
}

export const PHASE1_EXAM_TRAINING_DDL_SCOPE = Object.freeze({
  artifact: PHASE1_EXAM_TRAINING_ARTIFACT,
  sha256: PHASE1_EXAM_TRAINING_SHA256,
  createdTables: Object.freeze(["public.referee_exam_sessions"]),
  addedColumns: PHASE1_EXAM_TRAINING_TARGET_COLUMNS,
  indexes: PHASE1_EXAM_TRAINING_TARGET_INDEXES,
  constraints: Object.freeze({
    check: PHASE1_EXAM_TRAINING_CHECK_NAMES,
    foreignKey: PHASE1_EXAM_TRAINING_FK_NAMES,
    unique: PHASE1_EXAM_TRAINING_UNIQUE_NAMES,
  }),
  productRowDml: 0,
  ledgerWrites: 1,
});

export function phase1ExamTrainingDdlSource(repositoryRoot) {
  return readFileSync(resolve(repositoryRoot, PHASE1_EXAM_TRAINING_ARTIFACT), "utf8");
}
