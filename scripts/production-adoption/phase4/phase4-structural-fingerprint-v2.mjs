export const PHASE4_STRUCTURAL_FINGERPRINT_VERSION = "reflab_structural_v2";

const structuralSchemas = "('public', 'reflab_private', 'reflab_meta')";

// Evidence tooling only: this query has no connection runner and cannot mutate a database.
export const PHASE4_STRUCTURAL_FINGERPRINT_SQL = `begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
select pg_catalog.jsonb_build_object(
  'format', '${PHASE4_STRUCTURAL_FINGERPRINT_VERSION}',
  'tables', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name) from (
    select namespace.nspname as schema_name, relation.relname as table_name,
      relation.relkind as relation_kind, pg_catalog.pg_get_userbyid(relation.relowner) as owner,
      relation.relrowsecurity as rls_enabled, relation.relforcerowsecurity as rls_forced
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ${structuralSchemas} and relation.relkind in ('r', 'p')
  ) row_data), '[]'::pg_catalog.jsonb),
  'columns', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name, ordinal) from (
    select namespace.nspname as schema_name, relation.relname as table_name, attribute.attnum as ordinal,
      attribute.attname as column_name, pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
      attribute.attnotnull as not_null, attribute.attidentity as identity_kind,
      attribute.attgenerated as generated_kind,
      pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, false) as default_expression,
      case when attribute.attcollation = 0 then null else collation_namespace.nspname || '.' || collation.collname end as collation
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    left join pg_catalog.pg_attrdef default_value on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
    left join pg_catalog.pg_collation collation on collation.oid = attribute.attcollation
    left join pg_catalog.pg_namespace collation_namespace on collation_namespace.oid = collation.collnamespace
    where namespace.nspname in ${structuralSchemas} and relation.relkind in ('r', 'p')
      and attribute.attnum > 0 and not attribute.attisdropped
  ) row_data), '[]'::pg_catalog.jsonb),
  'functions', coalesce((select pg_catalog.jsonb_agg(row_data order by signature) from (
    select namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' as signature,
      pg_catalog.format_type(routine.prorettype, null) as return_type,
      language.lanname as language, routine.provolatile as volatility,
      routine.proisstrict as strict, routine.prosecdef as security_definer,
      pg_catalog.pg_get_userbyid(routine.proowner) as owner,
      coalesce(routine.proconfig, array[]::text[]) as configuration,
      pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
        pg_catalog.regexp_replace(routine.prosrc, '^[[:space:]]+|[[:space:]]+$', '', 'g'), 'UTF8'
      ), 'sha256'), 'hex') as source_hash,
      pg_catalog.count(*) over (partition by routine.pronamespace, routine.proname) as overload_count
    from pg_catalog.pg_proc routine
    join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
    join pg_catalog.pg_language language on language.oid = routine.prolang
    where namespace.nspname in ${structuralSchemas} and routine.prokind = 'f'
  ) row_data), '[]'::pg_catalog.jsonb),
  'triggers', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name, trigger_name) from (
    select namespace.nspname as schema_name, relation.relname as table_name, trigger.tgname as trigger_name,
      case when (trigger.tgtype & 2) <> 0 then 'BEFORE' when (trigger.tgtype & 64) <> 0 then 'INSTEAD OF' else 'AFTER' end as timing,
      case when (trigger.tgtype & 1) <> 0 then 'ROW' else 'STATEMENT' end as level,
      array_remove(array[
        case when (trigger.tgtype & 4) <> 0 then 'INSERT' end,
        case when (trigger.tgtype & 16) <> 0 then 'UPDATE' end,
        case when (trigger.tgtype & 8) <> 0 then 'DELETE' end,
        case when (trigger.tgtype & 32) <> 0 then 'TRUNCATE' end
      ], null) as events,
      pg_catalog.pg_get_expr(trigger.tgqual, trigger.tgrelid, false) as when_expression,
      function_namespace.nspname || '.' || routine.proname || '(' ||
        pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')' as function_signature,
      trigger.tgenabled as enabled_state, trigger.tgconstraint <> 0 as constraint_trigger,
      coalesce(constraint_row.condeferrable, false) as deferrable,
      coalesce(constraint_row.condeferred, false) as initially_deferred
    from pg_catalog.pg_trigger trigger
    join pg_catalog.pg_class relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_catalog.pg_proc routine on routine.oid = trigger.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid = routine.pronamespace
    left join pg_catalog.pg_constraint constraint_row on constraint_row.oid = trigger.tgconstraint
    where namespace.nspname in ${structuralSchemas} and not trigger.tgisinternal
  ) row_data), '[]'::pg_catalog.jsonb),
  'indexes', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name, index_name) from (
    select namespace.nspname as schema_name, table_row.relname as table_name, index_row.relname as index_name,
      access_method.amname as access_method, state.indisunique as unique, state.indisprimary as primary,
      state.indisvalid as valid, state.indisready as ready, state.indislive as live,
      state.indnullsnotdistinct as nulls_not_distinct,
      coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position', position, 'expression', pg_catalog.pg_get_indexdef(index_row.oid, position, false),
        'opclass', opclass_namespace.nspname || '.' || opclass.opcname,
        'collation', case when collation.oid is null then null else collation_namespace.nspname || '.' || collation.collname end,
        'descending', (option_value & 1) <> 0, 'nulls_first', (option_value & 2) <> 0
      ) order by position)
      from pg_catalog.generate_series(1, state.indnkeyatts) position
      left join pg_catalog.pg_opclass opclass on opclass.oid = state.indclass[position - 1]
      left join pg_catalog.pg_namespace opclass_namespace on opclass_namespace.oid = opclass.opcnamespace
      left join pg_catalog.pg_collation collation on collation.oid = state.indcollation[position - 1]
      left join pg_catalog.pg_namespace collation_namespace on collation_namespace.oid = collation.collnamespace
      cross join lateral (select state.indoption[position - 1]::integer as option_value) option_row), '[]'::pg_catalog.jsonb) as keys,
      coalesce((select pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(index_row.oid, position, false) order by position)
        from pg_catalog.generate_series(state.indnkeyatts + 1, state.indnatts) position), '[]'::pg_catalog.jsonb) as include,
      pg_catalog.pg_get_expr(state.indpred, state.indrelid, false) as predicate,
      exists (select 1 from pg_catalog.pg_constraint constraint_row where constraint_row.conindid = index_row.oid) as constraint_backed
    from pg_catalog.pg_index state
    join pg_catalog.pg_class index_row on index_row.oid = state.indexrelid
    join pg_catalog.pg_class table_row on table_row.oid = state.indrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = table_row.relnamespace
    join pg_catalog.pg_am access_method on access_method.oid = index_row.relam
    where namespace.nspname in ${structuralSchemas}
  ) row_data), '[]'::pg_catalog.jsonb),
  'checks', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name, constraint_name) from (
    select namespace.nspname as schema_name, relation.relname as table_name, constraint_row.conname as constraint_name,
      pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid, false) as expression,
      constraint_row.convalidated as validated, constraint_row.connoinherit as no_inherit
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ${structuralSchemas} and constraint_row.contype = 'c'
  ) row_data), '[]'::pg_catalog.jsonb),
  'foreign_keys', coalesce((select pg_catalog.jsonb_agg(row_data order by source_schema, source_table, constraint_name) from (
    select source_namespace.nspname as source_schema, source_table.relname as source_table,
      constraint_row.conname as constraint_name, target_namespace.nspname as target_schema, target_table.relname as target_table,
      (select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality)
        from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum, ordinality)
        join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_row.conrelid and attribute.attnum = key_position.attnum) as source_columns,
      (select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality)
        from pg_catalog.unnest(constraint_row.confkey) with ordinality key_position(attnum, ordinality)
        join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_row.confrelid and attribute.attnum = key_position.attnum) as target_columns,
      constraint_row.confmatchtype as match_type, constraint_row.confupdtype as on_update,
      constraint_row.confdeltype as on_delete, constraint_row.condeferrable as deferrable,
      constraint_row.condeferred as initially_deferred, constraint_row.convalidated as validated
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class source_table on source_table.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
    join pg_catalog.pg_class target_table on target_table.oid = constraint_row.confrelid
    join pg_catalog.pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
    where source_namespace.nspname in ${structuralSchemas} and constraint_row.contype = 'f'
  ) row_data), '[]'::pg_catalog.jsonb),
  'uniques', coalesce((select pg_catalog.jsonb_agg(row_data order by schema_name, table_name, constraint_name) from (
    select namespace.nspname as schema_name, relation.relname as table_name, constraint_row.conname as constraint_name,
      (select pg_catalog.jsonb_agg(attribute.attname order by key_position.ordinality)
        from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum, ordinality)
        join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_row.conrelid and attribute.attnum = key_position.attnum) as columns,
      constraint_row.condeferrable as deferrable, constraint_row.condeferred as initially_deferred,
      constraint_row.convalidated as validated, index_state.indnullsnotdistinct as nulls_not_distinct,
      index_row.relname as backing_index
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_class relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    left join pg_catalog.pg_class index_row on index_row.oid = constraint_row.conindid
    left join pg_catalog.pg_index index_state on index_state.indexrelid = constraint_row.conindid
    where namespace.nspname in ${structuralSchemas} and constraint_row.contype = 'u'
  ) row_data), '[]'::pg_catalog.jsonb)
)::text;
rollback;`;

export const REQUIRED_V2_FIELDS = Object.freeze({
  triggers: ["timing", "level", "events", "function_signature", "when_expression", "enabled_state", "constraint_trigger", "deferrable", "initially_deferred"],
  indexes: ["access_method", "unique", "keys", "include", "predicate", "valid", "ready", "nulls_not_distinct"],
  checks: ["expression", "validated", "no_inherit"],
  foreign_keys: ["source_columns", "target_columns", "match_type", "on_update", "on_delete", "deferrable", "initially_deferred", "validated"],
  uniques: ["columns", "nulls_not_distinct", "deferrable", "initially_deferred", "backing_index"],
});

export function validateStructuralFingerprintV2(fingerprint) {
  if (fingerprint?.format !== PHASE4_STRUCTURAL_FINGERPRINT_VERSION) {
    return [{ section: "root", field: "format" }];
  }
  const missing = [];
  for (const [section, fields] of Object.entries(REQUIRED_V2_FIELDS)) {
    for (const [index, row] of (fingerprint[section] ?? []).entries()) {
      for (const field of fields) {
        if (!Object.hasOwn(row, field)) missing.push({ section, index, field });
      }
    }
  }
  return missing;
}
