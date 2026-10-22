import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  PHASE4B_WAVE2_MIGRATION,
  PHASE4B_WAVE2_PROVIDER,
  PHASE4B_WAVE2_SAFE_INDEXES,
  PHASE4B_WAVE2_VERSION,
  assertWave2ProviderMap,
} from "./phase4b-wave2-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(directory, "..", "..", "..", "supabase", "migrations", PHASE4B_WAVE2_MIGRATION);

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function contractValues() {
  return PHASE4B_WAVE2_SAFE_INDEXES.map((index) => {
    const columns = index.keys.map((key) => sqlLiteral(key.column)).join(",");
    const descending = index.keys.map((key) => key.descending).join(",");
    const definition = index.keys.map((key) => `${key.column}${key.descending ? " desc" : ""}`).join(", ");
    const ddl = `create index ${index.name} on ${index.table} using btree (${definition})`;
    return `(${sqlLiteral(index.table)}, ${sqlLiteral(index.name)}, array[${columns}]::text[], array[${descending}]::boolean[], ${sqlLiteral(ddl)})`;
  }).join(",\n    ");
}

function exactIndexPredicate(indexAlias, expectedAlias) {
  return `${indexAlias}.indrelid = pg_catalog.to_regclass(${expectedAlias}.table_name)
      and not ${indexAlias}.indisunique
      and ${indexAlias}.indisvalid and ${indexAlias}.indisready and ${indexAlias}.indislive
      and not ${indexAlias}.indisclustered and not ${indexAlias}.indisreplident
      and ${indexAlias}.indpred is null and ${indexAlias}.indexprs is null
      and ${indexAlias}.indnkeyatts = pg_catalog.array_length(${expectedAlias}.key_columns, 1)
      and ${indexAlias}.indnatts = ${indexAlias}.indnkeyatts
      and not ${indexAlias}.indnullsnotdistinct
      and access_method.amname = 'btree'
      and index_relation.relowner = table_relation.relowner
      and not exists (select 1 from pg_catalog.pg_constraint constraint_row where constraint_row.conindid = ${indexAlias}.indexrelid)
      and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
           from pg_catalog.unnest(${indexAlias}.indkey::smallint[]) with ordinality key_position(attnum, ordinality)
           join pg_catalog.pg_attribute attribute on attribute.attrelid=${indexAlias}.indrelid and attribute.attnum=key_position.attnum
           where key_position.ordinality <= ${indexAlias}.indnkeyatts) = ${expectedAlias}.key_columns
      and (select pg_catalog.array_agg((option_position.option_value & 1)=1 order by option_position.ordinality)
           from pg_catalog.unnest(${indexAlias}.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= ${indexAlias}.indnkeyatts) = ${expectedAlias}.descending
      and (select pg_catalog.array_agg((option_position.option_value & 2)=2 order by option_position.ordinality)
           from pg_catalog.unnest(${indexAlias}.indoption::smallint[]) with ordinality option_position(option_value, ordinality)
           where option_position.ordinality <= ${indexAlias}.indnkeyatts) = ${expectedAlias}.descending
      and not exists (
        select 1 from pg_catalog.unnest(${indexAlias}.indclass::oid[]) with ordinality class_position(opclass_oid, ordinality)
        join pg_catalog.pg_opclass opclass on opclass.oid=class_position.opclass_oid
        where class_position.ordinality <= ${indexAlias}.indnkeyatts and not opclass.opcdefault
      )
      and not exists (
        select 1
        from pg_catalog.unnest(${indexAlias}.indkey::smallint[]) with ordinality key_collation_position(attnum, ordinality)
        join pg_catalog.unnest(${indexAlias}.indcollation::oid[]) with ordinality index_collation_position(collation_oid, ordinality)
          on index_collation_position.ordinality=key_collation_position.ordinality
        join pg_catalog.pg_attribute attribute on attribute.attrelid=${indexAlias}.indrelid and attribute.attnum=key_collation_position.attnum
        where key_collation_position.ordinality <= ${indexAlias}.indnkeyatts
          and (index_collation_position.collation_oid is distinct from attribute.attcollation
            or (index_collation_position.collation_oid <> 0 and not exists (
              select 1 from pg_catalog.pg_collation collation_row
              where collation_row.oid=index_collation_position.collation_oid
            )))
      )`;
}

const exactNamedPredicate = exactIndexPredicate("catalog_index", "expected_index");
const exactDuplicatePredicate = exactIndexPredicate("candidate_index", "expected_index");

export function buildPhase4BWave2Migration() {
  assertWave2ProviderMap();
  const values = contractValues();
  return `-- Production adoption Phase 4B Wave 2: confirmed non-unique indexes only.
-- Lock model: transactional CREATE INDEX with bounded waits and atomic rollback.
-- No UNIQUE, constraint, trigger, function replacement, DROP, or runtime cutover.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '15min';

do $preflight$
declare
  expected_index record;
  named_oid oid;
  exact_match boolean;
  equivalent_count integer;
  provider_comment text;
begin
  if pg_catalog.to_regclass('reflab_meta.production_adoption_state') is null
     or pg_catalog.to_regclass('reflab_meta.reflab_schema_state') is null
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4
     or not exists (select 1 from reflab_meta.production_adoption_state where phase_order=4 and phase_key='canonical_objects')
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Reviewed adoption state is required for Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
     or (select pg_catalog.count(*) from pg_catalog.pg_proc routine
         where pg_catalog.obj_description(routine.oid,'pg_proc')='reflab:production_adoption_provider=20260901064253') <> 16 then
    raise exception 'Phase 2A sidecar and Wave 1 helpers are required for Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regclass('reflab_private.user_identity_links') is not null
     or exists (select 1 from pg_catalog.unnest(array[
       'public.resolve_development_clerk_identity(text)',
       'public.link_development_clerk_identity(text)',
       'public.link_development_super_admin_clerk_identity(text)']::text[]) forbidden(signature)
       where pg_catalog.to_regprocedure(forbidden.signature) is not null) then
    raise exception 'Development-only identity infrastructure is forbidden in Wave 2' using errcode='55000';
  end if;

  if pg_catalog.to_regclass('public.clips_sport_topic_idx') is not null
     or pg_catalog.to_regclass('public.clips_sport_topic_active_idx') is null
     or not exists (
       select 1 from pg_catalog.pg_index renamed_index
       join pg_catalog.pg_class index_relation on index_relation.oid=renamed_index.indexrelid
       join pg_catalog.pg_class table_relation on table_relation.oid=renamed_index.indrelid
       join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
       where index_relation.oid=pg_catalog.to_regclass('public.clips_sport_topic_active_idx')
         and renamed_index.indrelid=pg_catalog.to_regclass('public.clips')
         and not renamed_index.indisunique and renamed_index.indisvalid and renamed_index.indisready and renamed_index.indislive
         and renamed_index.indpred is null and renamed_index.indexprs is null
         and renamed_index.indnkeyatts=3 and renamed_index.indnatts=3 and access_method.amname='btree'
         and (select pg_catalog.array_agg(attribute.attname::text order by key_position.ordinality)
              from pg_catalog.unnest(renamed_index.indkey::smallint[]) with ordinality key_position(attnum,ordinality)
              join pg_catalog.pg_attribute attribute on attribute.attrelid=renamed_index.indrelid and attribute.attnum=key_position.attnum)
             = array['sport_type','topic','is_active']::text[]
         and not exists (select 1 from pg_catalog.unnest(renamed_index.indclass::oid[]) class_oid
                         join pg_catalog.pg_opclass opclass on opclass.oid=class_oid where not opclass.opcdefault)
     ) then
    raise exception 'Reviewed renamed clips index is not equivalent' using errcode='55000';
  end if;

  for expected_index in
    select * from (values
    ${values}
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    if pg_catalog.to_regclass(expected_index.table_name) is null then
      raise exception 'Wave 2 prerequisite table is missing: %', expected_index.table_name using errcode='55000';
    end if;
    if exists (select 1 from pg_catalog.unnest(expected_index.key_columns) required(column_name)
               where not exists (select 1 from pg_catalog.pg_attribute attribute
                 where attribute.attrelid=pg_catalog.to_regclass(expected_index.table_name)
                   and attribute.attname=required.column_name and attribute.attnum>0 and not attribute.attisdropped)) then
      raise exception 'Wave 2 prerequisite column is missing: %', expected_index.index_name using errcode='55000';
    end if;

    named_oid := pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name);
    exact_match := false;
    provider_comment := null;
    if named_oid is not null then
      select exists (
        select 1 from pg_catalog.pg_index catalog_index
        join pg_catalog.pg_class index_relation on index_relation.oid=catalog_index.indexrelid
        join pg_catalog.pg_class table_relation on table_relation.oid=catalog_index.indrelid
        join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
        where catalog_index.indexrelid=named_oid and ${exactNamedPredicate}
      ), pg_catalog.obj_description(named_oid,'pg_class') into exact_match, provider_comment;
      if not exact_match then
        raise exception 'Wave 2 named index contract drift: %', expected_index.index_name using errcode='55000';
      end if;
      if provider_comment is distinct from '${PHASE4B_WAVE2_PROVIDER}' then
        raise exception 'Wave 2 provider conflict: %', expected_index.index_name using errcode='55000';
      end if;
    else
      select pg_catalog.count(*) into equivalent_count
      from pg_catalog.pg_index candidate_index
      join pg_catalog.pg_class index_relation on index_relation.oid=candidate_index.indexrelid
      join pg_catalog.pg_class table_relation on table_relation.oid=candidate_index.indrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
      where ${exactDuplicatePredicate};
      if equivalent_count <> 0 then
        raise exception 'Wave 2 equivalent index already exists under another name: %', expected_index.index_name using errcode='55000';
      end if;
    end if;
  end loop;
end
$preflight$;

do $install$
declare expected_index record;
begin
  for expected_index in
    select * from (values
    ${values}
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    if pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name) is null then
      execute expected_index.ddl;
      execute pg_catalog.format('comment on index %I.%I is %L', pg_catalog.split_part(expected_index.table_name,'.',1), expected_index.index_name, '${PHASE4B_WAVE2_PROVIDER}');
    end if;
  end loop;
end
$install$;

do $postconditions$
declare expected_index record; exact_match boolean; exact_count integer := 0;
begin
  for expected_index in
    select * from (values
    ${values}
    ) contract(table_name,index_name,key_columns,descending,ddl)
  loop
    select exists (
      select 1 from pg_catalog.pg_index catalog_index
      join pg_catalog.pg_class index_relation on index_relation.oid=catalog_index.indexrelid
      join pg_catalog.pg_class table_relation on table_relation.oid=catalog_index.indrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_relation.relam
      where catalog_index.indexrelid=pg_catalog.to_regclass(pg_catalog.split_part(expected_index.table_name,'.',1) || '.' || expected_index.index_name)
        and ${exactNamedPredicate}
        and pg_catalog.obj_description(catalog_index.indexrelid,'pg_class')='${PHASE4B_WAVE2_PROVIDER}'
    ) into exact_match;
    if not exact_match then
      raise exception 'Wave 2 index postcondition failed: %', expected_index.index_name using errcode='55000';
    end if;
    exact_count := exact_count + 1;
  end loop;
  if exact_count <> 32
     or (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0
     or (select pg_catalog.count(*) from reflab_meta.production_adoption_state) <> 4 then
    raise exception 'Wave 2 disabled-runtime or ledger invariant failed' using errcode='55000';
  end if;
end
$postconditions$;

commit;
`;
}

if (process.argv.includes("--write")) {
  writeFileSync(outputPath, buildPhase4BWave2Migration(), "utf8");
  process.stdout.write(`${PHASE4B_WAVE2_VERSION} ${outputPath}\n`);
}
