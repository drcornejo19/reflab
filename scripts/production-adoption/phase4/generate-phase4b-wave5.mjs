import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PHASE4B_WAVE5_CATALOG, PHASE4B_WAVE5_CHECKS, PHASE4B_WAVE5_FOREIGN_KEYS } from "./phase4b-wave5-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const nullable = (value) => value == null ? "null" : quote(value);
const array = (values) => `array[${values.map(quote).join(",")}]::text[]`;

export function buildPhase4BWave5GateSql(checks = PHASE4B_WAVE5_CHECKS, foreignKeys = PHASE4B_WAVE5_FOREIGN_KEYS) {
  const checkRows = checks.map((entry) => `(${quote(entry.schema)},${quote(entry.table)},${nullable(entry.constraintName)},${quote(entry.catalogConstraintName)},${array(entry.referencedColumns)},${quote(entry.expression)},${quote(entry.expressionHash)},${entry.validated},${entry.noInherit},${quote(entry.classification)},${quote(entry.dataEvidence)},${nullable(entry.transitionalState?.provider)},${nullable(entry.transitionalState?.expressionHash)},${array(entry.transitionalState?.requiredNullableColumns ?? [])})`).join(",\n      ");
  const fkRows = foreignKeys.map((entry) => `(${quote(entry.schema)},${quote(entry.table)},${quote(entry.constraintName)},${array(entry.sourceColumns)},${quote(entry.targetSchema)},${quote(entry.targetTable)},${array(entry.targetColumns)},${quote(entry.matchType)},${quote(entry.onUpdate)},${quote(entry.onDelete)},${entry.deferrable},${entry.initiallyDeferred},${entry.validated},${quote(entry.dataEvidence)})`).join(",\n      ");
  return `-- Phase 4B Wave 5 evidence-only gate. No CHECK or FK installation is authorized.
begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '2min';

do $wave5_gate$
declare
  expected_check record;
  expected_fk record;
  observed_count bigint;
  violation_count bigint;
  source_list text;
  join_predicate text;
begin
  if (current_setting('server_version_num')::integer / 10000) <> ${PHASE4B_WAVE5_CATALOG.postgresMajor} then
    raise exception 'Wave 5 PostgreSQL major is unsupported' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Premature canonical marker blocks Wave 5 evidence' using errcode = '55000';
  end if;
  if not exists (select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Wave 5 adoption prerequisite is missing' using errcode = '55000';
  end if;

  for expected_check in select * from (values
      ${checkRows}
    ) contract(schema_name,table_name,manifest_name,catalog_name,referenced_columns,expression,expression_hash,validated,no_inherit,classification,data_evidence,transitional_provider,transitional_expression_hash,transitional_nullable_columns)
  loop
    if expected_check.data_evidence not in ('SYNTHETIC_FIXTURE','REVIEWED_HISTORICAL','PRIVILEGED_PRODUCTION','NONE') then
      raise exception 'Wave 5 CHECK data evidence provenance is unsupported' using errcode='55000';
    end if;
    if pg_catalog.to_regclass(expected_check.schema_name||'.'||expected_check.table_name) is null then
      raise exception 'Wave 5 CHECK dependency is missing' using errcode='55000';
    end if;
    if expected_check.classification <> 'CUTOVER_ONLY' and exists (
      select 1 from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid=pg_catalog.to_regclass(expected_check.schema_name||'.'||expected_check.table_name)
        and constraint_row.conname=expected_check.catalog_name
    ) then
      if expected_check.transitional_expression_hash is not null
         and (expected_check.schema_name <> 'public'
           or expected_check.table_name <> 'exam_results'
           or expected_check.catalog_name <> 'exam_results_payload_hash_check'
           or expected_check.transitional_provider <> '202608310002_production_adoption_exam_training_prerequisites.sql') then
        raise exception 'Wave 5 reviewed transitional CHECK provider or contract drifted' using errcode='55000';
      end if;
      select pg_catalog.count(*) into observed_count
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid=pg_catalog.to_regclass(expected_check.schema_name||'.'||expected_check.table_name)
        and constraint_row.conname=expected_check.catalog_name
        and not (constraint_row.contype='c' and constraint_row.convalidated=expected_check.validated
          and constraint_row.connoinherit=expected_check.no_inherit
          and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum)=expected_check.referenced_columns
          and (
            pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false),'UTF8'),'sha256'),'hex')=expected_check.expression_hash
            or (
              expected_check.transitional_expression_hash is not null
              and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false),'UTF8'),'sha256'),'hex')=expected_check.transitional_expression_hash
              and not exists (
                select 1
                from pg_catalog.unnest(expected_check.transitional_nullable_columns) nullable_column(column_name)
                left join pg_catalog.pg_attribute nullable_attribute
                  on nullable_attribute.attrelid=constraint_row.conrelid
                 and nullable_attribute.attname=nullable_column.column_name
                 and nullable_attribute.attnum>0
                 and not nullable_attribute.attisdropped
                where nullable_attribute.attname is null or nullable_attribute.attnotnull
              )
            )
          ));
      if observed_count <> 0 then raise exception 'Wave 5 CHECK contract drift: %.%.%', expected_check.schema_name, expected_check.table_name, expected_check.catalog_name using errcode='55000'; end if;
    elsif expected_check.classification <> 'CUTOVER_ONLY' then
      select pg_catalog.count(*) into observed_count
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid=pg_catalog.to_regclass(expected_check.schema_name||'.'||expected_check.table_name)
        and constraint_row.contype='c'
        and constraint_row.conname<>expected_check.catalog_name
        and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum)=expected_check.referenced_columns
        and constraint_row.convalidated=expected_check.validated
        and constraint_row.connoinherit=expected_check.no_inherit
        and pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false),'UTF8'),'sha256'),'hex')=expected_check.expression_hash;
      if observed_count > 1 then raise exception 'Wave 5 CHECK provider conflict' using errcode='55000'; end if;
    end if;
    begin
      execute pg_catalog.format('select count(*) from %I.%I where (%s) is false',expected_check.schema_name,expected_check.table_name,expected_check.expression)
        into violation_count;
      if violation_count <> 0
         and expected_check.classification <> 'CUTOVER_ONLY'
         and expected_check.data_evidence in ('REVIEWED_HISTORICAL','PRIVILEGED_PRODUCTION') then
        raise exception 'Wave 5 CHECK data violation' using errcode='55000';
      end if;
    exception when undefined_column or undefined_function or datatype_mismatch then null;
    end;
  end loop;

  for expected_fk in select * from (values
      ${fkRows}
    ) contract(source_schema,source_table,constraint_name,source_columns,target_schema,target_table,target_columns,match_type,on_update,on_delete,is_deferrable,is_initially_deferred,is_validated,data_evidence)
  loop
    if expected_fk.data_evidence not in ('SYNTHETIC_FIXTURE','REVIEWED_HISTORICAL','PRIVILEGED_PRODUCTION','NONE') then
      raise exception 'Wave 5 FK data evidence provenance is unsupported' using errcode='55000';
    end if;
    if pg_catalog.to_regclass(expected_fk.source_schema||'.'||expected_fk.source_table) is null
       or pg_catalog.to_regclass(expected_fk.target_schema||'.'||expected_fk.target_table) is null then
      raise exception 'Wave 5 FK dependency is missing' using errcode='55000';
    end if;
    if exists (select 1 from pg_catalog.pg_constraint where conrelid=pg_catalog.to_regclass(expected_fk.source_schema||'.'||expected_fk.source_table) and conname=expected_fk.constraint_name) then
      select pg_catalog.count(*) into observed_count
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid=pg_catalog.to_regclass(expected_fk.source_schema||'.'||expected_fk.source_table)
        and constraint_row.conname=expected_fk.constraint_name
        and not (constraint_row.contype='f'
          and constraint_row.confrelid=pg_catalog.to_regclass(expected_fk.target_schema||'.'||expected_fk.target_table)
          and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum)=expected_fk.source_columns
          and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.confkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.confrelid and attribute.attnum=key_position.attnum)=expected_fk.target_columns
          and constraint_row.confmatchtype=case expected_fk.match_type when 'FULL' then 'f' when 'PARTIAL' then 'p' else 's' end
          and constraint_row.confupdtype=case expected_fk.on_update when 'CASCADE' then 'c' when 'SET NULL' then 'n' when 'SET DEFAULT' then 'd' when 'RESTRICT' then 'r' else 'a' end
          and constraint_row.confdeltype=case expected_fk.on_delete when 'CASCADE' then 'c' when 'SET NULL' then 'n' when 'SET DEFAULT' then 'd' when 'RESTRICT' then 'r' else 'a' end
          and constraint_row.condeferrable=expected_fk.is_deferrable and constraint_row.condeferred=expected_fk.is_initially_deferred
          and constraint_row.convalidated=expected_fk.is_validated);
      if observed_count <> 0 then raise exception 'Wave 5 FK contract drift' using errcode='55000'; end if;
    end if;
    select pg_catalog.count(*) into observed_count
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid=pg_catalog.to_regclass(expected_fk.source_schema||'.'||expected_fk.source_table)
      and constraint_row.contype='f'
      and constraint_row.confrelid=pg_catalog.to_regclass(expected_fk.target_schema||'.'||expected_fk.target_table)
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.conkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=key_position.attnum)=expected_fk.source_columns
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality) from pg_catalog.unnest(constraint_row.confkey) with ordinality key_position(attnum,ordinality) join pg_catalog.pg_attribute attribute on attribute.attrelid=constraint_row.confrelid and attribute.attnum=key_position.attnum)=expected_fk.target_columns
      and constraint_row.confmatchtype=case expected_fk.match_type when 'FULL' then 'f' when 'PARTIAL' then 'p' else 's' end
      and constraint_row.confupdtype=case expected_fk.on_update when 'CASCADE' then 'c' when 'SET NULL' then 'n' when 'SET DEFAULT' then 'd' when 'RESTRICT' then 'r' else 'a' end
      and constraint_row.confdeltype=case expected_fk.on_delete when 'CASCADE' then 'c' when 'SET NULL' then 'n' when 'SET DEFAULT' then 'd' when 'RESTRICT' then 'r' else 'a' end
      and constraint_row.condeferrable=expected_fk.is_deferrable
      and constraint_row.condeferred=expected_fk.is_initially_deferred
      and constraint_row.convalidated=expected_fk.is_validated;
    if observed_count > 1 then raise exception 'Wave 5 FK provider conflict' using errcode='55000'; end if;
    begin
      select pg_catalog.string_agg(pg_catalog.format('s.%I is not null',expected_fk.source_columns[ordinal]), ' and ' order by ordinal),
             pg_catalog.string_agg(pg_catalog.format('s.%I=t.%I',expected_fk.source_columns[ordinal],expected_fk.target_columns[ordinal]), ' and ' order by ordinal)
        into source_list,join_predicate
      from pg_catalog.generate_subscripts(expected_fk.source_columns,1) ordinal;
      execute pg_catalog.format('select count(*) from %I.%I s where %s and not exists(select 1 from %I.%I t where %s)',expected_fk.source_schema,expected_fk.source_table,source_list,expected_fk.target_schema,expected_fk.target_table,join_predicate)
        into violation_count;
      if violation_count <> 0 and expected_fk.data_evidence in ('REVIEWED_HISTORICAL','PRIVILEGED_PRODUCTION') then
        raise exception 'Wave 5 FK orphan data' using errcode='55000';
      end if;
    exception when undefined_column or undefined_table or datatype_mismatch then null;
    end;
  end loop;
end
$wave5_gate$;
rollback;
`;
}

export function writePhase4BWave5Gate() {
  const target = resolve(directory, "phase4b-wave5-gate.sql");
  writeFileSync(target, buildPhase4BWave5GateSql(), "utf8");
  return target;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.stdout.write(`${writePhase4BWave5Gate()}\n`);
