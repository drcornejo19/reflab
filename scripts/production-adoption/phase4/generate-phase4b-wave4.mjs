import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PHASE4B_WAVE4_UNIQUES } from "./phase4b-wave4-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nullable(value) {
  return value === null ? "null" : quote(value);
}

function sqlArray(values) {
  return `array[${values.map(quote).join(",")}]::text[]`;
}

export function buildPhase4BWave4GateSql(contracts = PHASE4B_WAVE4_UNIQUES) {
  const rows = contracts.map((entry) => `(${[
    quote(entry.schema), quote(entry.table), nullable(entry.constraintName), sqlArray(entry.columns),
    nullable(entry.existingPartialIndex?.name ?? null), nullable(entry.existingPartialIndex?.predicate ?? null),
  ].join(",")})`).join(",\n      ");
  return `-- Phase 4B Wave 4 evidence-only gate. No UNIQUE installation is authorized.
begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '2min';

do $wave4_unique_gate$
declare
  expected_unique record;
  duplicate_groups bigint;
  exact_constraints integer;
  named_drift integer;
  partial_matches integer;
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Premature canonical marker blocks Wave 4 evidence' using errcode = '55000';
  end if;
  if not exists (
    select 1 from reflab_meta.production_adoption_state
    where phase_key = 'canonical_objects' and phase_order = 4
  ) then
    raise exception 'Wave 4 adoption prerequisite is missing' using errcode = '55000';
  end if;

  for expected_unique in
    select * from (values
      ${rows}
    ) contract(schema_name, table_name, constraint_name, key_columns, partial_index_name, partial_predicate)
  loop
    if pg_catalog.to_regclass(expected_unique.schema_name || '.' || expected_unique.table_name) is null then
      raise exception 'Wave 4 UNIQUE prerequisite table is missing' using errcode = '55000';
    end if;
    if exists (
      select 1 from pg_catalog.unnest(expected_unique.key_columns) key_column
      where not exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid = pg_catalog.to_regclass(expected_unique.schema_name || '.' || expected_unique.table_name)
          and attribute.attname = key_column and attribute.attnum > 0 and not attribute.attisdropped
      )
    ) then
      raise exception 'Wave 4 UNIQUE prerequisite column is missing' using errcode = '55000';
    end if;

    execute pg_catalog.format(
      'select count(*) from (select 1 from %I.%I where %s group by %s having count(*) > 1) duplicate_group',
      expected_unique.schema_name,
      expected_unique.table_name,
      (select pg_catalog.string_agg(pg_catalog.format('%I is not null', column_name), ' and ' order by ordinal)
       from pg_catalog.unnest(expected_unique.key_columns) with ordinality key_column(column_name, ordinal)),
      (select pg_catalog.string_agg(pg_catalog.format('%I', column_name), ', ' order by ordinal)
       from pg_catalog.unnest(expected_unique.key_columns) with ordinality key_column(column_name, ordinal))
    ) into duplicate_groups;
    if duplicate_groups <> 0 then
      raise exception 'Wave 4 UNIQUE duplicate data blocks reconciliation' using errcode = '55000';
    end if;

    select pg_catalog.count(*) into exact_constraints
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_index index_row on index_row.indexrelid = constraint_row.conindid
    where constraint_row.conrelid = pg_catalog.to_regclass(expected_unique.schema_name || '.' || expected_unique.table_name)
      and constraint_row.contype = 'u'
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
           from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum, ordinality)
           join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_row.conrelid and attribute.attnum = key_position.attnum)
          = expected_unique.key_columns
      and not constraint_row.condeferrable and not constraint_row.condeferred
      and index_row.indisvalid and index_row.indisready and index_row.indpred is null
      and not index_row.indnullsnotdistinct;
    if exact_constraints > 1 then
      raise exception 'Wave 4 UNIQUE provider conflict' using errcode = '55000';
    end if;

    if expected_unique.constraint_name is not null then
      select pg_catalog.count(*) into named_drift
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = pg_catalog.to_regclass(expected_unique.schema_name || '.' || expected_unique.table_name)
        and constraint_row.conname = expected_unique.constraint_name
        and not (
          constraint_row.contype = 'u'
          and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
               from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum, ordinality)
               join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_row.conrelid and attribute.attnum = key_position.attnum)
              = expected_unique.key_columns
          and not constraint_row.condeferrable and not constraint_row.condeferred
        );
      if named_drift <> 0 then
        raise exception 'Wave 4 UNIQUE constraint contract drift' using errcode = '55000';
      end if;
    end if;

    if expected_unique.partial_index_name is not null then
      select pg_catalog.count(*) into partial_matches
      from pg_catalog.pg_class index_relation
      join pg_catalog.pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
      join pg_catalog.pg_index index_row on index_row.indexrelid = index_relation.oid
      join pg_catalog.pg_class table_relation on table_relation.oid = index_row.indrelid
      join pg_catalog.pg_namespace table_namespace on table_namespace.oid = table_relation.relnamespace
      join pg_catalog.pg_am access_method on access_method.oid = index_relation.relam
      where table_namespace.nspname = expected_unique.schema_name
        and table_relation.relname = expected_unique.table_name
        and index_relation.relname = expected_unique.partial_index_name
        and index_row.indisunique and index_row.indisvalid and index_row.indisready
        and not index_row.indnullsnotdistinct
        and access_method.amname = 'btree'
        and index_row.indnkeyatts = pg_catalog.cardinality(expected_unique.key_columns)
        and index_row.indnatts = index_row.indnkeyatts
        and (select pg_catalog.array_agg(pg_catalog.pg_get_indexdef(index_row.indexrelid, ordinal, true) order by ordinal)
             from pg_catalog.generate_series(1, index_row.indnkeyatts) ordinal) = expected_unique.key_columns
        and pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)), '[[:space:]()]', '', 'g')
          = pg_catalog.regexp_replace(pg_catalog.lower(expected_unique.partial_predicate), '[[:space:]()]', '', 'g');
      if partial_matches <> 1 then
        raise exception 'Wave 4 reviewed partial UNIQUE index contract drift' using errcode = '55000';
      end if;
    end if;
  end loop;
end
$wave4_unique_gate$;

rollback;
`;
}

export function writePhase4BWave4Gate() {
  const target = resolve(directory, "phase4b-wave4-gate.sql");
  writeFileSync(target, buildPhase4BWave4GateSql(), "utf8");
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${writePhase4BWave4Gate()}\n`);
}
