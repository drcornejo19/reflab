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
  "targetTableColumnsExact",
  "targetPrimaryKeyExact",
  "targetTableEmpty",
  "targetAclExact",
  "targetColumnsExact",
  "targetColumnsNullable",
  "targetIndexesExact",
  "targetConstraintsExact",
  "targetCheckSemanticsExact",
  "targetFkSemanticsExact",
  "targetUniqueSemanticsExact",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
  "laterPhaseInfrastructureAbsent",
  "fabricatedAssociationsAbsent",
]);

function sqlLiteral(value) {
  return value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
}

function nameArraySql(values) {
  return `array[${values.map(sqlLiteral).join(",")}]::name[]`;
}

const targetTableColumns = Object.freeze([
  ["id", 1, "uuid", true, "gen_random_uuid()"],
  ["user_id", 2, "text", true, null],
  ["submission_id", 3, "uuid", true, null],
  ["context_type", 4, "text", true, null],
  ["sport_type", 5, "text", true, null],
  ["activity_type", 6, "text", true, null],
  ["season", 7, "text", false, null],
  ["source_version", 8, "text", false, null],
  ["institution_id", 9, "uuid", false, null],
  ["institution_group_id", 10, "uuid", false, null],
  ["institution_assessment_session_id", 11, "uuid", false, null],
  ["item_manifest", 12, "jsonb", true, null],
  ["manifest_hash", 13, "text", true, null],
  ["item_count", 14, "integer", true, null],
  ["status", 15, "text", true, "'active'::text"],
  ["created_at", 16, "timestamp with time zone", true, "now()"],
  ["started_at", 17, "timestamp with time zone", true, "now()"],
  ["expires_at", 18, "timestamp with time zone", true, null],
  ["submitted_at", 19, "timestamp with time zone", false, null],
]);

const checkContracts = Object.freeze([
  ["attempts", "attempts_source_reference_check",
    ["source_item_type", "source_item_id", "source_occurrence_id"],
    "(((source_item_type IS NULL) AND (source_item_id IS NULL) AND (source_occurrence_id IS NULL)) OR ((source_item_type IS NOT NULL) AND (source_item_id IS NOT NULL) AND (source_occurrence_id IS NOT NULL)))"],
  ["attempts", "attempts_source_type_check", ["source_item_type"],
    "((source_item_type IS NULL) OR (source_item_type = ANY (ARRAY['global_clip'::text, 'institutional_clip'::text, 'rule_question'::text, 'manual'::text])))"],
  ["exam_results", "exam_results_payload_hash_check", ["payload_hash"],
    "((payload_hash IS NULL) OR (payload_hash ~ '^[0-9a-f]{64}$'::text))"],
  ["referee_exam_sessions", "referee_exam_sessions_activity_type_check", ["activity_type"],
    "(activity_type = 'referee_exam'::text)"],
  ["referee_exam_sessions", "referee_exam_sessions_context_check",
    ["context_type", "institution_id", "institution_group_id", "institution_assessment_session_id"],
    "(((context_type = 'individual'::text) AND (institution_id IS NULL) AND (institution_group_id IS NULL) AND (institution_assessment_session_id IS NULL)) OR ((context_type = 'institutional'::text) AND (institution_id IS NOT NULL) AND (institution_assessment_session_id IS NOT NULL)))"],
  ["referee_exam_sessions", "referee_exam_sessions_context_type_check", ["context_type"],
    "(context_type = ANY (ARRAY['individual'::text, 'institutional'::text]))"],
  ["referee_exam_sessions", "referee_exam_sessions_expiry_check", ["expires_at", "started_at"],
    "(expires_at > started_at)"],
  ["referee_exam_sessions", "referee_exam_sessions_item_count_check", ["item_count", "item_manifest"],
    "(item_count = jsonb_array_length(item_manifest))"],
  ["referee_exam_sessions", "referee_exam_sessions_item_count_range_check", ["item_count"],
    "((item_count >= 1) AND (item_count <= 100))"],
  ["referee_exam_sessions", "referee_exam_sessions_item_manifest_check", ["item_manifest"],
    "(jsonb_typeof(item_manifest) = 'array'::text)"],
  ["referee_exam_sessions", "referee_exam_sessions_manifest_hash_check", ["manifest_hash"],
    "(manifest_hash ~ '^[0-9a-f]{64}$'::text)"],
  ["referee_exam_sessions", "referee_exam_sessions_sport_type_check", ["sport_type"],
    "(sport_type = ANY (ARRAY['football_11'::text, 'futsal'::text]))"],
  ["referee_exam_sessions", "referee_exam_sessions_status_check", ["status"],
    "(status = ANY (ARRAY['created'::text, 'active'::text, 'submitted'::text, 'expired'::text, 'cancelled'::text]))"],
]);

const fkContracts = Object.freeze([
  ["attempts", "attempts_adoption_assessment_session_fk", ["institution_assessment_session_id"],
    "institution_assessment_sessions", ["id"], "s", "a", "n"],
  ["exam_results", "exam_results_session_fk", ["exam_session_id"],
    "referee_exam_sessions", ["id"], "s", "a", "r"],
  ["referee_exam_sessions", "referee_exam_sessions_assessment_session_fk",
    ["institution_assessment_session_id"], "institution_assessment_sessions", ["id"], "s", "a", "c"],
  ["referee_exam_sessions", "referee_exam_sessions_group_fk", ["institution_group_id"],
    "institution_groups", ["id"], "s", "a", "n"],
  ["referee_exam_sessions", "referee_exam_sessions_institution_fk", ["institution_id"],
    "institutions", ["id"], "s", "a", "c"],
]);

const uniqueContracts = Object.freeze([
  ["exam_results", "exam_results_exam_session_unique", ["exam_session_id"], ["uuid_ops"]],
  ["referee_exam_sessions", "referee_exam_sessions_user_submission_unique",
    ["user_id", "submission_id"], ["text_ops", "uuid_ops"]],
]);

const targetTableColumnValues = targetTableColumns.map(([name, ordinal, type, notNull, defaultExpression]) =>
  `(${sqlLiteral(name)},${ordinal},${sqlLiteral(type)},${notNull},${sqlLiteral(defaultExpression)},'','')`)
  .join(",\n      ");
const checkContractValues = checkContracts.map(([table, name, columns, expression]) =>
  `(${sqlLiteral(table)},${sqlLiteral(name)},${nameArraySql(columns)},${sqlLiteral(expression)},true,false)`)
  .join(",\n      ");
const fkContractValues = fkContracts.map(([
  table, name, columns, targetTable, targetColumns, matchType, updateAction, deleteAction,
]) => `(${sqlLiteral(table)},${sqlLiteral(name)},${nameArraySql(columns)},'public',${sqlLiteral(targetTable)},${nameArraySql(targetColumns)},${sqlLiteral(matchType)},${sqlLiteral(updateAction)},${sqlLiteral(deleteAction)},false,false,true)`)
  .join(",\n      ");
const uniqueContractValues = uniqueContracts.map(([table, name, columns, opclasses]) =>
  `(${sqlLiteral(table)},${sqlLiteral(name)},${nameArraySql(columns)},${nameArraySql(opclasses)},false,false,true)`)
  .join(",\n      ");

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
  `(with expected_target_table_columns(
    column_name, ordinal_position, expected_type, expected_not_null,
    expected_default, expected_identity, expected_generated
  ) as (
    values ${targetTableColumnValues}
  ), target_table_column_state as (
    select expected.*,
      attribute.attnum as observed_ordinal,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as observed_not_null,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) as observed_default,
      attribute.attidentity as observed_identity,
      attribute.attgenerated as observed_generated
    from expected_target_table_columns expected
    left join pg_catalog.pg_attribute attribute
      on attribute.attrelid = pg_catalog.to_regclass('public.referee_exam_sessions')
      and attribute.attname = expected.column_name
      and attribute.attnum > 0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
  ), expected_columns(table_name, column_name, expected_type) as (
    values ${expectedColumnValues}
  ), column_state as (
    select expected.*,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      not attribute.attnotnull as nullable,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) as observed_default,
      attribute.attidentity as observed_identity,
      attribute.attgenerated as observed_generated
    from expected_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
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
  ), expected_checks(
    table_name, constraint_name, expected_columns, expected_expression,
    expected_validated, expected_noinherit
  ) as (
    values ${checkContractValues}
  ), check_state as (
    select expected.*,
      constraint_record.oid,
      constraint_record.convalidated as observed_validated,
      constraint_record.connoinherit as observed_noinherit,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(constraint_record.conkey) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_record.conrelid
         and attribute.attnum = key.attnum) as observed_columns,
      pg_catalog.regexp_replace(
        pg_catalog.btrim(pg_catalog.pg_get_expr(
          constraint_record.conbin, constraint_record.conrelid, false
        )), '[[:space:]]+', ' ', 'g') as observed_expression
    from expected_checks expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_constraint constraint_record on constraint_record.conrelid = relation.oid
      and constraint_record.conname = expected.constraint_name and constraint_record.contype = 'c'
  ), expected_fks(
    table_name, constraint_name, expected_columns,
    expected_target_schema, expected_target_table, expected_target_columns,
    expected_match_type, expected_update_action, expected_delete_action,
    expected_deferrable, expected_deferred, expected_validated
  ) as (
    values ${fkContractValues}
  ), fk_state as (
    select expected.*,
      constraint_record.oid,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(constraint_record.conkey) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_record.conrelid
         and attribute.attnum = key.attnum) as observed_columns,
      target_namespace.nspname as observed_target_schema,
      target_relation.relname as observed_target_table,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(constraint_record.confkey) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_record.confrelid
         and attribute.attnum = key.attnum) as observed_target_columns,
      constraint_record.confmatchtype as observed_match_type,
      constraint_record.confupdtype as observed_update_action,
      constraint_record.confdeltype as observed_delete_action,
      constraint_record.condeferrable as observed_deferrable,
      constraint_record.condeferred as observed_deferred,
      constraint_record.convalidated as observed_validated
    from expected_fks expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_constraint constraint_record on constraint_record.conrelid = relation.oid
      and constraint_record.conname = expected.constraint_name and constraint_record.contype = 'f'
    left join pg_catalog.pg_class target_relation on target_relation.oid = constraint_record.confrelid
    left join pg_catalog.pg_namespace target_namespace on target_namespace.oid = target_relation.relnamespace
  ), expected_uniques(
    table_name, constraint_name, expected_columns, expected_opclasses,
    expected_deferrable, expected_deferred, expected_validated
  ) as (
    values ${uniqueContractValues}
  ), unique_state as (
    select expected.*,
      constraint_record.oid,
      constraint_record.condeferrable as observed_deferrable,
      constraint_record.condeferred as observed_deferred,
      constraint_record.convalidated as observed_validated,
      index_record.indisunique,
      index_record.indisvalid,
      index_record.indisready,
      access_method.amname,
      index_record.indnkeyatts,
      index_record.indnatts,
      index_record.indpred,
      index_record.indexprs,
      index_relation.relname as backing_index_name,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(index_record.indkey::smallint[]) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = index_record.indrelid
         and attribute.attnum = key.attnum
       where key.ordinality <= index_record.indnkeyatts) as observed_columns,
      (select pg_catalog.array_agg(opclass.opcname order by key.ordinality)
       from pg_catalog.unnest(index_record.indclass::oid[]) with ordinality key(opclass_oid, ordinality)
       join pg_catalog.pg_opclass opclass on opclass.oid = key.opclass_oid
       where key.ordinality <= index_record.indnkeyatts) as observed_opclasses,
      (select pg_catalog.bool_and(index_collation.collation_oid = attribute.attcollation)
       from pg_catalog.unnest(index_record.indcollation::oid[]) with ordinality
         index_collation(collation_oid, ordinality)
       join pg_catalog.unnest(index_record.indkey::smallint[]) with ordinality
         index_key(attnum, ordinality) using (ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = index_record.indrelid
         and attribute.attnum = index_key.attnum
       where index_collation.ordinality <= index_record.indnkeyatts) as column_collations_exact
    from expected_uniques expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_constraint constraint_record on constraint_record.conrelid = relation.oid
      and constraint_record.conname = expected.constraint_name and constraint_record.contype = 'u'
    left join pg_catalog.pg_index index_record on index_record.indexrelid = constraint_record.conindid
    left join pg_catalog.pg_class index_relation on index_relation.oid = index_record.indexrelid
    left join pg_catalog.pg_am access_method on access_method.oid = index_relation.relam
  ), table_acl_state as (
    select case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end as grantee,
      pg_catalog.pg_get_userbyid(acl.grantor) as grantor,
      acl.privilege_type,
      acl.is_grantable
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(relation.relacl) acl
    where relation.oid = pg_catalog.to_regclass('public.referee_exam_sessions')
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
  ), structural_checks as (
    select
      (select pg_catalog.count(*) = ${targetTableColumns.length}
        and pg_catalog.bool_and(
          observed_ordinal = ordinal_position
          and observed_type = expected_type
          and observed_not_null = expected_not_null
          and observed_default is not distinct from expected_default
          and observed_identity = expected_identity::"char"
          and observed_generated = expected_generated::"char"
        ) from target_table_column_state)
        and (select pg_catalog.count(*) = ${targetTableColumns.length}
          from pg_catalog.pg_attribute attribute
          where attribute.attrelid = pg_catalog.to_regclass('public.referee_exam_sessions')
            and attribute.attnum > 0 and not attribute.attisdropped) as table_columns_exact,
      exists (
        select 1
        from pg_catalog.pg_constraint constraint_record
        join pg_catalog.pg_index index_record on index_record.indexrelid = constraint_record.conindid
        join pg_catalog.pg_class index_relation on index_relation.oid = index_record.indexrelid
        join pg_catalog.pg_am access_method on access_method.oid = index_relation.relam
        where constraint_record.conrelid = pg_catalog.to_regclass('public.referee_exam_sessions')
          and constraint_record.conname = 'referee_exam_sessions_pkey'
          and constraint_record.contype = 'p'
          and not constraint_record.condeferrable and not constraint_record.condeferred
          and constraint_record.convalidated
          and index_record.indisunique and index_record.indisprimary
          and index_record.indisvalid and index_record.indisready
          and index_record.indnkeyatts = 1 and index_record.indnatts = 1
          and index_record.indpred is null and index_record.indexprs is null
          and not index_record.indnullsnotdistinct
          and access_method.amname = 'btree'
          and (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
            from pg_catalog.unnest(index_record.indkey::smallint[]) with ordinality key(attnum, ordinality)
            join pg_catalog.pg_attribute attribute on attribute.attrelid = index_record.indrelid
              and attribute.attnum = key.attnum) = array['id']::name[]
          and (select pg_catalog.array_agg(opclass.opcname order by key.ordinality)
            from pg_catalog.unnest(index_record.indclass::oid[]) with ordinality key(opclass_oid, ordinality)
            join pg_catalog.pg_opclass opclass on opclass.oid = key.opclass_oid) = array['uuid_ops']::name[]
          and (select pg_catalog.array_agg(option_value order by option_key.ordinality)
            from pg_catalog.unnest(index_record.indoption::smallint[]) with ordinality
              option_key(option_value, ordinality)) = array[0]::smallint[]
      ) as primary_key_exact,
      (select pg_catalog.count(*) = 8
        and pg_catalog.bool_and(
          grantee = 'postgres' and grantor = 'postgres' and not is_grantable
          and privilege_type = any(array[
            'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
          ]::text[])
        )
        and pg_catalog.array_agg(privilege_type order by privilege_type) = array[
          'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
        ]::text[]
        from table_acl_state)
        and not exists (
          select 1
          from pg_catalog.pg_attribute attribute
          where attribute.attrelid = pg_catalog.to_regclass('public.referee_exam_sessions')
            and attribute.attnum > 0 and not attribute.attisdropped
            and attribute.attacl is not null
        ) as acl_exact,
      (select pg_catalog.count(*) = ${checkContracts.length}
        and pg_catalog.bool_and(
          oid is not null
          and observed_columns = expected_columns
          and observed_expression = expected_expression
          and observed_validated = expected_validated
          and observed_noinherit = expected_noinherit
        ) from check_state) as checks_exact,
      (select pg_catalog.count(*) = ${fkContracts.length}
        and pg_catalog.bool_and(
          oid is not null
          and observed_columns = expected_columns
          and observed_target_schema = expected_target_schema
          and observed_target_table = expected_target_table
          and observed_target_columns = expected_target_columns
          and observed_match_type = expected_match_type::"char"
          and observed_update_action = expected_update_action::"char"
          and observed_delete_action = expected_delete_action::"char"
          and observed_deferrable = expected_deferrable
          and observed_deferred = expected_deferred
          and observed_validated = expected_validated
        ) from fk_state) as fks_exact,
      (select pg_catalog.count(*) = ${uniqueContracts.length}
        and pg_catalog.bool_and(
          oid is not null
          and observed_columns = expected_columns
          and observed_opclasses = expected_opclasses
          and observed_deferrable = expected_deferrable
          and observed_deferred = expected_deferred
          and observed_validated = expected_validated
          and indisunique and indisvalid and indisready
          and amname = 'btree'
          and indnkeyatts = indnatts
          and indpred is null and indexprs is null
          and backing_index_name = constraint_name
          and column_collations_exact
        ) from unique_state) as uniques_exact,
      pg_catalog.to_regclass('public.psychology_modules') is null
        and not exists (
          select 1 from pg_catalog.pg_attribute attribute
          where attribute.attrelid = pg_catalog.to_regclass('public.notification_events')
            and attribute.attname = 'deduplication_key'
            and attribute.attnum > 0 and not attribute.attisdropped
        )
        and pg_catalog.to_regclass('public.notification_events_deduplication_unique') is null
        and not exists (
          select 1 from pg_catalog.pg_namespace namespace
          where namespace.nspname = 'reflab_audit'
        )
        and not exists (
          select 1 from pg_catalog.pg_roles role_record
          where role_record.rolname in (
            'reflab_preflight_audit_owner', 'reflab_pre_cutover_evidence_owner'
          )
        )
        and not exists (
          select 1 from reflab_meta.production_adoption_state state
          where state.phase_order >= 3
             or state.phase_key = 'psychology_notification_prerequisites'
        ) as later_phase_infrastructure_absent
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
      ) and (select table_columns_exact and primary_key_exact from structural_checks),
      'targetTableColumnsExact', (select table_columns_exact from structural_checks),
      'targetPrimaryKeyExact', (select primary_key_exact from structural_checks),
      'targetTableEmpty', (select pg_catalog.count(*) = 0 from public.referee_exam_sessions),
      'targetAclExact', (select acl_exact from structural_checks),
      'targetColumnsExact', (select pg_catalog.count(*) = 6
        and pg_catalog.bool_and(
          observed_type = expected_type
          and observed_default is null
          and observed_identity = ''::"char"
          and observed_generated = ''::"char"
        ) from column_state),
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
      'targetConstraintsExact', (select checks_exact and fks_exact and uniques_exact from structural_checks)
        and (select pg_catalog.count(*) = ${PHASE1_EXAM_TRAINING_TARGET_CONSTRAINTS.length}
          and pg_catalog.bool_and(oid is not null and convalidated) from constraint_state),
      'targetCheckSemanticsExact', (select checks_exact from structural_checks),
      'targetFkSemanticsExact', (select fks_exact from structural_checks),
      'targetUniqueSemanticsExact', (select uniques_exact from structural_checks),
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
      'laterPhaseInfrastructureAbsent',
        (select later_phase_infrastructure_absent from structural_checks),
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
