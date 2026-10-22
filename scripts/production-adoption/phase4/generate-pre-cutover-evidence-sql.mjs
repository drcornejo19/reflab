import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { semanticAuditFunctionSource } from "../phase2a/semantic-audit-contract.mjs";
import {
  PRE_CUTOVER_AGGREGATE_ITEMS, PRE_CUTOVER_BOUNDARY_OWNER, PRE_CUTOVER_BOUNDARY_SIGNATURE,
  PRE_CUTOVER_EVIDENCE_FORMAT, PRE_CUTOVER_EVIDENCE_ITEMS,
  PRE_CUTOVER_POLICY_NAME, evidenceContractHash, requiredColumnGrants,
} from "./pre-cutover-evidence-contract.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, "..", "..", "..");
export const PRE_CUTOVER_MIGRATION = "supabase/migrations/20260901064301_production_adoption_pre_cutover_evidence_boundary.sql";
export const PRE_CUTOVER_TEARDOWN = "supabase/migrations/20260901064305_production_adoption_pre_cutover_evidence_teardown.sql";
export const PRE_CUTOVER_CATALOG_BATCH = "scripts/production-adoption/phase4/pre-cutover-catalog-evidence.sql";

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const ident = (value) => `"${String(value).replaceAll('"', '""')}"`;
const qname = (schema, table) => `${ident(schema)}.${ident(table)}`;

function uniqueMetric(item) {
  const { contract } = item;
  const columns = contract.columns.map(ident).join(", ");
  const nullFilter = contract.nullsNotDistinct ? "true" : contract.columns.map((column) => `${ident(column)} is not null`).join(" and ");
  return `select pg_catalog.jsonb_build_object(
      'id', ${literal(item.id)}, 'result', case when pg_catalog.count(*)=0 then 'PASS' else 'BLOCKER' end,
      'duplicate_group_count', pg_catalog.count(*)::bigint,
      'max_duplicate_group_size', coalesce(pg_catalog.max(group_size),0)::bigint)
    from (select pg_catalog.count(*)::bigint group_size from ${qname(contract.schema, contract.table)}
      where ${nullFilter} group by ${columns} having pg_catalog.count(*)>1) duplicate_groups`;
}

function checkMetric(item) {
  const { contract } = item;
  const status = item.aggregateFacet === "VIOLATION_COUNT_AND_APPROVED_STATUS_DISTRIBUTION"
    ? `, 'status_counts', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('status',status,'count',status_count) order by status),'[]'::jsonb)
        from (select status,pg_catalog.count(*)::bigint status_count from public.notification_events group by status) approved_statuses)`
    : "";
  return `select pg_catalog.jsonb_build_object(
      'id', ${literal(item.id)}, 'result', case when violation_count=0 then 'PASS' else 'BLOCKER' end,
      'violation_count', violation_count::bigint${status})
    from (select pg_catalog.count(*)::bigint violation_count from ${qname(contract.schema, contract.table)}
      where (${contract.expression}) is false) aggregate_result`;
}

function fkMetric(item) {
  const { contract } = item;
  if (contract.matchType === "PARTIAL") throw new Error(`Unsupported MATCH PARTIAL aggregate: ${item.object}`);
  const joins = contract.sourceColumns.map((column, index) => `source_row.${ident(column)} = target_row.${ident(contract.targetColumns[index])}`).join(" and ");
  const nonNull = contract.sourceColumns.map((column) => `source_row.${ident(column)} is not null`).join(" and ");
  const allNull = contract.sourceColumns.map((column) => `source_row.${ident(column)} is null`).join(" and ");
  const sourceViolation = contract.matchType === "FULL" ? `(not (${allNull}) and not (${nonNull})) or ((${nonNull}) and not exists (` : `(${nonNull}) and not exists (`;
  const close = contract.matchType === "FULL" ? "))" : ")";
  return `select pg_catalog.jsonb_build_object(
      'id', ${literal(item.id)}, 'result', case when orphan_count=0 then 'PASS' else 'BLOCKER' end,
      'orphan_count', orphan_count::bigint)
    from (select pg_catalog.count(*)::bigint orphan_count from ${qname(contract.schema, contract.table)} source_row
      where ${sourceViolation}select 1 from ${qname(contract.targetSchema, contract.targetTable)} target_row where ${joins}${close}) aggregate_result`;
}

function nullabilityMetric(item) {
  const { contract } = item;
  return `select pg_catalog.jsonb_build_object(
      'id', ${literal(item.id)}, 'result', case when pg_catalog.count(*) filter (where ${ident(contract.column)} is null)=0 then 'PASS' else 'BLOCKER' end,
      'total_rows', pg_catalog.count(*)::bigint,
      'null_count', pg_catalog.count(*) filter (where ${ident(contract.column)} is null)::bigint)
    from ${qname(contract.schema, contract.table)}`;
}

export function generatedAggregateSqlFor(item) {
  if (item.domain === "UNIQUE") return uniqueMetric(item);
  if (item.domain === "CHECK") return checkMetric(item);
  if (item.domain === "FK") return fkMetric(item);
  if (item.domain === "NULLABILITY") return nullabilityMetric(item);
  throw new Error(`Unsupported aggregate domain: ${item.domain}`);
}

export function buildPreCutoverBoundarySource(items = PRE_CUTOVER_AGGREGATE_ITEMS) {
  const metrics = items.map(generatedAggregateSqlFor).join("\n    union all\n    ");
  return `
  select pg_catalog.jsonb_build_object(
    'format', ${literal(PRE_CUTOVER_EVIDENCE_FORMAT)},
    'contract_hash', ${literal(evidenceContractHash())},
    'evidence_provenance', 'TEMPORARY_SECURITY_BOUNDARY',
    'authorizes_ddl', false,
    'metrics', (select pg_catalog.jsonb_agg(metric order by metric->>'id') from (
    ${metrics}
    ) evidence_metrics(metric))
  );
`;
}

export const PRE_CUTOVER_BOUNDARY_SOURCE = buildPreCutoverBoundarySource();
export const PRE_CUTOVER_BOUNDARY_SOURCE_HASH = createHash("sha256").update(PRE_CUTOVER_BOUNDARY_SOURCE.trim()).digest("hex");

export function assertBalancedGeneratedSql(sql) {
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quoted) {
      if (character === "'" && sql[index + 1] === "'") index += 1;
      else if (character === "'") quoted = false;
      continue;
    }
    if (character === "'") quoted = true;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth < 0) throw new Error(`Generated SQL closes an unmatched parenthesis at byte ${index}.`);
  }
  if (quoted || depth !== 0) throw new Error(`Generated SQL is unbalanced: quote=${quoted}, parenthesis_depth=${depth}.`);
  return true;
}

function constraintColumnsSql(alias, key = "conkey", relation = "conrelid") {
  return `(select coalesce(pg_catalog.array_agg(attribute.attname order by key_column.ordinality),array[]::text[])
    from pg_catalog.unnest(${alias}.${key}) with ordinality key_column(attnum,ordinality)
    join pg_catalog.pg_attribute attribute on attribute.attrelid=${alias}.${relation} and attribute.attnum=key_column.attnum)`;
}

function catalogObservedSql(item) {
  const c = item.contract;
  if (item.domain === "CHECK") return `(select pg_catalog.jsonb_build_object(
    'present',true,'constraint_name',x.conname,'constraint_type',x.contype,
    'referenced_columns',${constraintColumnsSql("x")},
    'definition',pg_catalog.pg_get_constraintdef(x.oid,false),
    'expression',pg_catalog.pg_get_expr(x.conbin,x.conrelid,false),
    'validated',x.convalidated,'no_inherit',x.connoinherit,
    'expression_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_expr(x.conbin,x.conrelid,false),'UTF8')),'hex'),
    'status_default',case when ${literal(c.stableIdentity)}='public.notification_events.notification_events_status_check'
      then (select pg_catalog.pg_get_expr(default_value.adbin,default_value.adrelid,false) from pg_catalog.pg_attrdef default_value
        join pg_catalog.pg_attribute status_column on status_column.attrelid=default_value.adrelid and status_column.attnum=default_value.adnum
        where default_value.adrelid=x.conrelid and status_column.attname='status') else null end)
    from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(`${c.schema}.${c.table}`)})
      and x.contype='c' and x.conname=${literal(c.catalogConstraintName)})`;
  if (item.domain === "FK") return `(select pg_catalog.jsonb_build_object(
    'present',true,'constraint_name',x.conname,'constraint_type',x.contype,
    'source_columns',${constraintColumnsSql("x")},
    'target_schema',target_namespace.nspname,'target_table',target_table.relname,
    'target_columns',${constraintColumnsSql("x", "confkey", "confrelid")},
    'definition',pg_catalog.pg_get_constraintdef(x.oid,false),'validated',x.convalidated,
    'deferrable',x.condeferrable,'initially_deferred',x.condeferred,
    'match_type',x.confmatchtype,'on_update',x.confupdtype,'on_delete',x.confdeltype)
    from pg_catalog.pg_constraint x
    join pg_catalog.pg_class target_table on target_table.oid=x.confrelid
    join pg_catalog.pg_namespace target_namespace on target_namespace.oid=target_table.relnamespace
    where x.conrelid=pg_catalog.to_regclass(${literal(`${c.schema}.${c.table}`)})
      and x.contype='f' and x.conname=${literal(c.constraintName)})`;
  if (item.domain === "UNIQUE") return `pg_catalog.jsonb_build_object(
    'constraint_present',exists(select 1 from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(c.qualifiedTable)}) and x.contype='u' and x.conname=${c.constraintName ? literal(c.constraintName) : "null"}),
    'constraints',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',x.conname,'columns',${constraintColumnsSql("x")},'deferrable',x.condeferrable,
      'initially_deferred',x.condeferred,'validated',x.convalidated,'definition',pg_catalog.pg_get_constraintdef(x.oid,false)) order by x.conname)
      from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(c.qualifiedTable)}) and x.contype='u'),'[]'::jsonb),
    'unique_indexes',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',index_class.relname,'access_method',access_method.amname,'valid',index_state.indisvalid,'ready',index_state.indisready,
      'key_count',index_state.indnkeyatts,'attribute_count',index_state.indnatts,
      'keys',(select pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(index_class.oid,key_position,false) order by key_position)
        from pg_catalog.generate_series(1,index_state.indnkeyatts) key_position),
      'include',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(index_class.oid,include_position,false) order by include_position),'[]'::jsonb)
        from pg_catalog.generate_series(index_state.indnkeyatts+1,index_state.indnatts) include_position),
      'predicate',pg_catalog.pg_get_expr(index_state.indpred,index_state.indrelid,false)) order by index_class.relname)
      from pg_catalog.pg_index index_state join pg_catalog.pg_class index_class on index_class.oid=index_state.indexrelid
      join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
      where index_state.indrelid=pg_catalog.to_regclass(${literal(c.qualifiedTable)}) and index_state.indisunique),'[]'::jsonb))`;
  if (item.domain === "NULLABILITY") return `(select pg_catalog.jsonb_build_object('column_present',pg_catalog.count(*)=1,'not_null',pg_catalog.bool_or(a.attnotnull)) from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(${literal(`${c.schema}.${c.table}`)}) and a.attname=${literal(c.column)} and a.attnum>0 and not a.attisdropped)`;
  if (item.domain === "INDEX_DRIFT") return `(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',index_class.relname,'access_method',access_method.amname,'unique',index_state.indisunique,
    'valid',index_state.indisvalid,'ready',index_state.indisready,'key_count',index_state.indnkeyatts,
    'attribute_count',index_state.indnatts,
    'keys',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'expression',pg_catalog.pg_get_indexdef(index_class.oid,key_position,false),
      'opclass',operator_class.opcname,'collation',index_collation.collname,
      'descending',(index_state.indoption[key_position-1] & 1)=1,
      'nulls_first',(index_state.indoption[key_position-1] & 2)=2) order by key_position)
      from pg_catalog.generate_series(1,index_state.indnkeyatts) key_position
      left join pg_catalog.pg_opclass operator_class on operator_class.oid=index_state.indclass[key_position-1]
      left join pg_catalog.pg_collation index_collation on index_collation.oid=index_state.indcollation[key_position-1]),
    'include',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(index_class.oid,include_position,false) order by include_position),'[]'::jsonb)
      from pg_catalog.generate_series(index_state.indnkeyatts+1,index_state.indnatts) include_position),
    'predicate',pg_catalog.pg_get_expr(index_state.indpred,index_state.indrelid,false)) order by index_class.relname),'[]'::jsonb)
    from pg_catalog.pg_index index_state join pg_catalog.pg_class index_class on index_class.oid=index_state.indexrelid
    join pg_catalog.pg_am access_method on access_method.oid=index_class.relam
    where index_state.indrelid=pg_catalog.to_regclass(${literal(c.table)}) and index_class.relname=${literal(c.name)})`;
  if (item.domain === "LEGACY_VALIDATOR") return `(select pg_catalog.jsonb_build_object(
    'present',true,'trigger_name',trigger_state.tgname,'enabled',trigger_state.tgenabled,
    'timing',case when (trigger_state.tgtype & 64)=64 then 'INSTEAD OF' when (trigger_state.tgtype & 2)=2 then 'BEFORE' else 'AFTER' end,
    'events',pg_catalog.array_remove(array[case when (trigger_state.tgtype & 4)=4 then 'INSERT' end,
      case when (trigger_state.tgtype & 16)=16 then 'UPDATE' end,case when (trigger_state.tgtype & 8)=8 then 'DELETE' end,
      case when (trigger_state.tgtype & 32)=32 then 'TRUNCATE' end],null),
    'level',case when (trigger_state.tgtype & 1)=1 then 'ROW' else 'STATEMENT' end,
    'when_expression',pg_catalog.pg_get_expr(trigger_state.tgqual,trigger_state.tgrelid,false),
    'constraint_trigger',trigger_state.tgconstraint<>0,
    'function_signature',pg_catalog.format('%I.%I(%s)',function_namespace.nspname,function_state.proname,pg_catalog.pg_get_function_identity_arguments(function_state.oid)),
    'function_source_hash',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.regexp_replace(pg_catalog.replace(function_state.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g'),'UTF8')),'hex'))
    from pg_catalog.pg_trigger trigger_state join pg_catalog.pg_proc function_state on function_state.oid=trigger_state.tgfoid
    join pg_catalog.pg_namespace function_namespace on function_namespace.oid=function_state.pronamespace
    where trigger_state.tgrelid=pg_catalog.to_regclass(${literal(`${c.schema}.${c.table}`)})
      and trigger_state.tgname=${literal(c.historicalName)} and not trigger_state.tgisinternal)`;
  if (item.domain === "LEGACY_CALLER_TARGET") {
    const [qualifiedName] = c.signature.split("(", 1);
    const functionName = qualifiedName.split(".").at(-1);
    const sourcePattern = `(^|[^a-zA-Z0-9_])((public\\.)?${functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})[[:space:]]*\\(`;
    return `(select pg_catalog.jsonb_build_object(
      'target_present',target.target_oid is not null,
      'callers',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'caller_schema',caller_schema,'caller_object',caller_object,'caller_type',caller_type,
        'called_signature',${literal(c.signature)}) order by caller_type,caller_schema,caller_object) from (
          select function_namespace.nspname caller_schema,
            pg_catalog.format('%I(%s)',caller_function.proname,pg_catalog.pg_get_function_identity_arguments(caller_function.oid)) caller_object,
            'FUNCTION'::text caller_type
          from pg_catalog.pg_proc caller_function join pg_catalog.pg_namespace function_namespace on function_namespace.oid=caller_function.pronamespace
          where caller_function.oid<>target.target_oid and caller_function.prosrc ~ ${literal(sourcePattern)}
          union
          select policy_namespace.nspname,policy_table.relname||'.'||policy_state.polname,'POLICY'
          from pg_catalog.pg_depend dependency join pg_catalog.pg_policy policy_state on dependency.classid='pg_catalog.pg_policy'::pg_catalog.regclass and policy_state.oid=dependency.objid
          join pg_catalog.pg_class policy_table on policy_table.oid=policy_state.polrelid
          join pg_catalog.pg_namespace policy_namespace on policy_namespace.oid=policy_table.relnamespace
          where dependency.refobjid=target.target_oid
          union
          select trigger_namespace.nspname,trigger_table.relname||'.'||trigger_state.tgname,'TRIGGER'
          from pg_catalog.pg_trigger trigger_state join pg_catalog.pg_class trigger_table on trigger_table.oid=trigger_state.tgrelid
          join pg_catalog.pg_namespace trigger_namespace on trigger_namespace.oid=trigger_table.relnamespace
          where trigger_state.tgfoid=target.target_oid and not trigger_state.tgisinternal
          union
          select view_namespace.nspname,view_class.relname,'VIEW'
          from pg_catalog.pg_depend dependency join pg_catalog.pg_rewrite rewrite_state on dependency.classid='pg_catalog.pg_rewrite'::pg_catalog.regclass and rewrite_state.oid=dependency.objid
          join pg_catalog.pg_class view_class on view_class.oid=rewrite_state.ev_class
          join pg_catalog.pg_namespace view_namespace on view_namespace.oid=view_class.relnamespace
          where dependency.refobjid=target.target_oid and view_class.relkind in ('v','m')
        ) caller_inventory),'[]'::jsonb))
      from (select pg_catalog.to_regprocedure(${literal(c.signature)}) target_oid) target)`;
  }
  if (item.domain === "PRIVILEGE_EDGE") {
    const check = c.objectType === "FUNCTION" && c.role === "PUBLIC"
      ? `exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl where p.oid=pg_catalog.to_regprocedure(${literal(c.object)}) and acl.grantee=0 and acl.privilege_type=${literal(c.privilege)})`
      : c.objectType === "TABLE"
      ? `pg_catalog.has_table_privilege(${literal(c.role)},${literal(c.object)},${literal(c.privilege)})`
      : `pg_catalog.has_function_privilege(${literal(c.role)},${literal(c.object)},${literal(c.privilege)})`;
    return `pg_catalog.jsonb_build_object('present',${check},'role',${literal(c.role)},'privilege',${literal(c.privilege)})`;
  }
  throw new Error(`Unsupported catalog domain: ${item.domain}`);
}

function catalogResultSql(item) {
  const c = item.contract;
  const table = c.qualifiedTable ?? (c.schema && c.table ? `${c.schema}.${c.table}` : c.table);
  if (["CHECK", "FK", "UNIQUE", "NULLABILITY", "INDEX_DRIFT", "LEGACY_VALIDATOR"].includes(item.domain)) {
    const present = item.domain === "CHECK"
      ? `exists(select 1 from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(table)}) and x.contype='c' and x.conname=${literal(c.catalogConstraintName)})`
      : item.domain === "FK"
      ? `exists(select 1 from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(table)}) and x.contype='f' and x.conname=${literal(c.constraintName)})`
      : item.domain === "UNIQUE"
      ? `(exists(select 1 from pg_catalog.pg_constraint x where x.conrelid=pg_catalog.to_regclass(${literal(table)}) and x.contype='u' and x.conname=${literal(c.constraintName)})${c.existingPartialIndex ? ` or exists(select 1 from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid where x.indrelid=pg_catalog.to_regclass(${literal(table)}) and x.indisunique and i.relname=${literal(c.existingPartialIndex.name)})` : ""})`
      : item.domain === "NULLABILITY"
      ? `exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pg_catalog.to_regclass(${literal(table)}) and a.attname=${literal(c.column)} and a.attnum>0 and not a.attisdropped)`
      : item.domain === "INDEX_DRIFT"
      ? `exists(select 1 from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid where x.indrelid=pg_catalog.to_regclass(${literal(table)}) and i.relname=${literal(c.name)})`
      : `exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=pg_catalog.to_regclass(${literal(table)}) and t.tgname=${literal(c.historicalName)} and not t.tgisinternal)`;
    return `case when pg_catalog.to_regclass(${literal(table)}) is null then 'SKIPPED' when ${present} then 'PASS' else 'BLOCKER' end`;
  }
  if (item.domain === "PRIVILEGE_EDGE") {
    const present = c.objectType === "FUNCTION" && c.role === "PUBLIC"
      ? `exists(select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl where p.oid=pg_catalog.to_regprocedure(${literal(c.object)}) and acl.grantee=0 and acl.privilege_type=${literal(c.privilege)})`
      : c.objectType === "TABLE"
      ? `pg_catalog.has_table_privilege(${literal(c.role)},${literal(c.object)},${literal(c.privilege)})`
      : `pg_catalog.has_function_privilege(${literal(c.role)},${literal(c.object)},${literal(c.privilege)})`;
    return `case when ${present} then 'BLOCKER' else 'PASS' end`;
  }
  if (item.domain === "LEGACY_CALLER_TARGET") return `'PASS'`;
  throw new Error(`Unsupported catalog result domain: ${item.domain}`);
}

export function buildPreCutoverCatalogBatch(items = PRE_CUTOVER_EVIDENCE_ITEMS) {
  const rows = items.map((item) => `select pg_catalog.jsonb_build_object(
      'id',${literal(item.id)},'domain',${literal(item.domain)},'object',${literal(item.object)},
      'reason',${literal(item.reason)},'query_kind',${literal(item.queryKind)},
      'visibility_method','DIRECT_PREFLIGHT_ROLE','required_before',${literal(item.requiredBefore)},
      'pii_risk',${literal(item.piiRisk)},'classification_effect',${literal(item.classificationEffect)},
      'result',${catalogResultSql(item)},
      'expected',${literal(JSON.stringify(item.contract))}::jsonb,
      'observed',coalesce(${catalogObservedSql(item)},'null'::jsonb)) as item`).join("\n    union all\n    ");
  return `-- Generated pre-cutover catalog evidence. Read-only by construction.
begin read only;
set local statement_timeout = '2min';
set local lock_timeout = '2s';
show transaction_read_only;
select case when pg_catalog.current_setting('transaction_read_only')='on' then pg_catalog.jsonb_build_object(
  'format',${literal(PRE_CUTOVER_EVIDENCE_FORMAT)},
  'contract_hash',${literal(evidenceContractHash())},
  'items',(select pg_catalog.jsonb_agg(item order by item->>'id') from (
    ${rows}
  ) catalog_items)
) else null end::text;
rollback;
`;
}

export function buildPreCutoverAggregateBatch() {
  return `-- Generated pre-cutover aggregate evidence. Read-only by construction.
begin read only;
set local statement_timeout = '5min';
set local lock_timeout = '2s';
show transaction_read_only;
select case when pg_catalog.current_setting('transaction_read_only')='on'
  then reflab_audit.pre_cutover_evidence_snapshot_v1()
  else null end::text;
rollback;
`;
}

export function validateReadOnlyEvidenceSql(sql) {
  const stripped = String(sql).replace(/--[^\r\n]*/g, " ").trim();
  const statements = stripped.split(";").map((entry) => entry.trim()).filter(Boolean);
  const allowed = [
    /^begin\s+read\s+only$/i,
    /^set\s+local\s+(statement_timeout|lock_timeout)\s*=\s*'[^']+'$/i,
    /^show\s+transaction_read_only$/i,
    /^select\b[\s\S]*$/i,
    /^rollback$/i,
  ];
  for (const statement of statements) {
    if (!allowed.some((pattern) => pattern.test(statement))) throw new Error(`Writable or unsupported evidence SQL statement: ${statement.slice(0, 40)}`);
  }
  const forbidden = /\b(create|alter|drop|insert|update|delete|truncate|grant|revoke|set\s+role)\b/i;
  if (forbidden.test(stripped.replace(/'[^']*'/g, "''"))) throw new Error("Writable SQL is forbidden in an evidence batch.");
  return true;
}

function buildBoundaryContractAssertions() {
  const grants = requiredColumnGrants();
  const grantRows = grants.flatMap((entry) => entry.columns.map((column) =>
    `(${literal(entry.schema)},${literal(entry.relation)},${literal(column)})`)).join(",");
  const tableRows = grants.map((entry) => `(${literal(entry.schema)},${literal(entry.relation)})`).join(",");
  return `
  if not exists(select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    join pg_catalog.pg_language l on l.oid=p.prolang
    join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)})
      and n.nspname='reflab_audit' and p.proname='pre_cutover_evidence_snapshot_v1'
      and pg_catalog.pg_get_function_identity_arguments(p.oid)=''
      and pg_catalog.format_type(p.prorettype,null)='jsonb'
      and l.lanname='sql' and p.provolatile='s' and not p.proisstrict and p.prosecdef
      and r.rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)}
      and p.proconfig=array['search_path=pg_catalog']::text[])
     or (select pg_catalog.count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='reflab_audit' and p.proname='pre_cutover_evidence_snapshot_v1')<>1 then
    raise exception 'Pre-cutover evidence boundary function contract drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)})
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')=${literal(PRE_CUTOVER_BOUNDARY_SOURCE.trim())}) then
    raise exception 'Pre-cutover evidence boundary source drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles r where r.rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)}
      and not r.rolcanlogin and not r.rolinherit and not r.rolbypassrls and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole) then
    raise exception 'Pre-cutover evidence owner drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_auth_members m
    where m.roleid in (pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)}),pg_catalog.to_regrole('reflab_prod_preflight_ro'))
       or m.member in (pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)}),pg_catalog.to_regrole('reflab_prod_preflight_ro'))) then
    raise exception 'Pre-cutover evidence boundary role membership drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl
    where p.oid=pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)})
      and (acl.privilege_type<>'EXECUTE'
        or acl.grantee not in (p.proowner,pg_catalog.to_regrole('reflab_prod_preflight_ro'))
        or (acl.grantee=pg_catalog.to_regrole('reflab_prod_preflight_ro') and acl.is_grantable)))
     or (select pg_catalog.count(*) from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f'::"char",p.proowner))) acl
       where p.oid=pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)})
         and acl.grantee=pg_catalog.to_regrole('reflab_prod_preflight_ro') and acl.privilege_type='EXECUTE' and not acl.is_grantable)<>1 then
    raise exception 'Pre-cutover evidence boundary EXECUTE drift' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p','v','m','f','S')
      and c.relowner=pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)}))
     or exists(select 1 from pg_catalog.pg_proc p
       where p.proowner=pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})
         and p.oid<>pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)}))
     or exists(select 1 from pg_catalog.pg_namespace n
       where n.nspowner=pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})) then
    raise exception 'Pre-cutover evidence owner has unexpected ownership' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name) as (values ${tableRows})
    select 1 from expected
    join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name))
    where pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'SELECT')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'INSERT')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'UPDATE')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'DELETE')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'TRUNCATE')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'REFERENCES')
       or pg_catalog.has_table_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,'TRIGGER')) then
    raise exception 'Pre-cutover evidence owner has unexpected table privilege' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name,column_name) as (values ${grantRows}),
    actual as (
      select n.nspname,c.relname,a.attname from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where n.nspname='public' and c.relkind in ('r','p','v','m','f')
        and pg_catalog.has_column_privilege(${literal(PRE_CUTOVER_BOUNDARY_OWNER)},c.oid,a.attnum,'SELECT')
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence effective column access drift' using errcode='55000';
  end if;
  if exists(with expected(schema_name,table_name,column_name,privilege_type) as (
      values ${grants.flatMap((entry) => entry.columns.map((column) => `(${literal(entry.schema)},${literal(entry.relation)},${literal(column)},'SELECT')`)).join(",")}),
    actual as (
      select n.nspname,c.relname,a.attname,acl.privilege_type from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral pg_catalog.aclexplode(a.attacl) acl
      where acl.grantee=pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence direct column ACL drift' using errcode='55000';
  end if;
  if exists(with expected(schema_name,privilege_type) as (values ('public','USAGE'),('reflab_audit','USAGE')),
    actual as (
      select n.nspname,acl.privilege_type from pg_catalog.pg_namespace n
      cross join lateral pg_catalog.aclexplode(n.nspacl) acl
      where acl.grantee=pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})
    )
    select 1 from ((select * from actual except select * from expected)
      union all (select * from expected except select * from actual)) drift) then
    raise exception 'Pre-cutover evidence schema ACL drift' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from (values ${tableRows}) expected(schema_name,table_name)
      join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name))
      join pg_catalog.pg_policy p on p.polrelid=c.oid
      where p.polname=${literal(PRE_CUTOVER_POLICY_NAME)} and p.polcmd='r' and p.polpermissive
        and p.polroles=array[pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})::oid]
        and pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) in ('true','(true)') and p.polwithcheck is null)<>${grants.length}
     or exists(select 1 from pg_catalog.pg_policy p
       where pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})::oid=any(p.polroles)
         and not (p.polname=${literal(PRE_CUTOVER_POLICY_NAME)}
           and exists(select 1 from (values ${tableRows}) expected(schema_name,table_name)
             where p.polrelid=pg_catalog.to_regclass(pg_catalog.format('%I.%I',expected.schema_name,expected.table_name)))
           and p.polcmd='r' and p.polpermissive
           and p.polroles=array[pg_catalog.to_regrole(${literal(PRE_CUTOVER_BOUNDARY_OWNER)})::oid]
           and pg_catalog.pg_get_expr(p.polqual,p.polrelid,false) in ('true','(true)') and p.polwithcheck is null)) then
    raise exception 'Pre-cutover evidence RLS policy drift' using errcode='55000';
  end if;`;
}

export function buildPreCutoverMigration() {
  const grants = requiredColumnGrants();
  const tables = grants.map((entry) => `${entry.schema}.${entry.relation}`);
  const roleCreation = `do $role$ begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)}) then
    create role ${ident(PRE_CUTOVER_BOUNDARY_OWNER)} nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $role$;`;
  const columnGrants = grants.map((entry) => `grant select (${entry.columns.map(ident).join(", ")}) on ${qname(entry.schema, entry.relation)} to ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};`).join("\n");
  const policies = grants.map((entry) => `create policy ${ident(PRE_CUTOVER_POLICY_NAME)} on ${qname(entry.schema, entry.relation)} for select to ${ident(PRE_CUTOVER_BOUNDARY_OWNER)} using (true);`).join("\n");
  const tableArray = `array[${tables.map(literal).join(",")}]::text[]`;
  const canonicalSidecarSource = semanticAuditFunctionSource().trim();
  return `-- ADOPTION_TEMPORARY: remove this boundary before the final canonical marker.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $preconditions$
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state) <> 0 then
    raise exception 'Premature canonical marker blocks pre-cutover evidence' using errcode='55000';
  end if;
  if not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence adoption prerequisite is missing' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null then
    raise exception 'Phase 2A semantic sidecar is missing' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')=${literal(canonicalSidecarSource)}) then
    raise exception 'Phase 2A semantic sidecar source drifted' using errcode='55000';
  end if;
  if pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)}) is not null
     or exists(select 1 from pg_catalog.pg_roles where rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)})
     or exists(select 1 from pg_catalog.pg_policy p where p.polname=${literal(PRE_CUTOVER_POLICY_NAME)}) then
    raise exception 'Pre-cutover evidence infrastructure is not in the reviewed absent state' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.unnest(${tableArray}) t(name) join pg_catalog.pg_class c on c.oid=pg_catalog.to_regclass(t.name) where not c.relrowsecurity) then
    raise exception 'Pre-cutover evidence requires RLS on every aggregate table' using errcode='55000';
  end if;
end $preconditions$;

${roleCreation}
grant usage on schema public, reflab_audit to ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};
${columnGrants}
${policies}

-- Pinned normalized source SHA-256: ${PRE_CUTOVER_BOUNDARY_SOURCE_HASH}
create function reflab_audit.pre_cutover_evidence_snapshot_v1() returns jsonb
language sql stable security definer set search_path=pg_catalog
as $pre_cutover$${PRE_CUTOVER_BOUNDARY_SOURCE}$pre_cutover$;
alter function reflab_audit.pre_cutover_evidence_snapshot_v1() owner to ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};
revoke all on function reflab_audit.pre_cutover_evidence_snapshot_v1() from public, anon, authenticated, service_role, reflab_rls_owner, reflab_preflight_audit_owner;
grant execute on function reflab_audit.pre_cutover_evidence_snapshot_v1() to reflab_prod_preflight_ro;

do $postconditions$
begin${buildBoundaryContractAssertions()}
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence changed adoption markers' using errcode='55000';
  end if;
end $postconditions$;
commit;
`;
}

export function buildPreCutoverVerificationSql() {
  return `begin;
do $verify$
begin${buildBoundaryContractAssertions()}
end $verify$;
rollback;
`;
}

export function buildPreCutoverTeardown() {
  const grants = requiredColumnGrants();
  const dropPolicies = grants.map((entry) => `drop policy ${ident(PRE_CUTOVER_POLICY_NAME)} on ${qname(entry.schema, entry.relation)};`).join("\n");
  const revokeColumns = grants.map((entry) => `revoke select (${entry.columns.map(ident).join(", ")}) on ${qname(entry.schema, entry.relation)} from ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};`).join("\n");
  const canonicalSidecarSource = semanticAuditFunctionSource().trim();
  return `-- ADOPTION_TEMPORARY teardown: execute only after evidence classification is complete.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '5min';

do $preconditions$
begin
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence teardown marker state drift' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')=${literal(canonicalSidecarSource)}) then
    raise exception 'Phase 2A semantic sidecar drift blocks pre-cutover teardown' using errcode='55000';
  end if;${buildBoundaryContractAssertions()}
  if exists(select 1 from pg_catalog.pg_depend dependency
    where dependency.refclassid='pg_catalog.pg_proc'::pg_catalog.regclass
      and dependency.refobjid=pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)})) then
    raise exception 'Unexpected dependency blocks pre-cutover evidence teardown' using errcode='55000';
  end if;
end $preconditions$;

revoke execute on function reflab_audit.pre_cutover_evidence_snapshot_v1() from reflab_prod_preflight_ro;
drop function reflab_audit.pre_cutover_evidence_snapshot_v1();
${dropPolicies}
${revokeColumns}
revoke usage on schema public, reflab_audit from ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};

do $residual_dependencies$
declare owner_oid oid;
begin
  select oid into owner_oid from pg_catalog.pg_roles where rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)};
  if not found or exists(select 1 from pg_catalog.pg_shdepend dependency
    where dependency.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass and dependency.refobjid=owner_oid) then
    raise exception 'Residual dependency blocks pre-cutover evidence owner teardown' using errcode='55000';
  end if;
end $residual_dependencies$;

drop role ${ident(PRE_CUTOVER_BOUNDARY_OWNER)};

do $postconditions$
begin
  if pg_catalog.to_regprocedure(${literal(PRE_CUTOVER_BOUNDARY_SIGNATURE)}) is not null
     or exists(select 1 from pg_catalog.pg_roles where rolname=${literal(PRE_CUTOVER_BOUNDARY_OWNER)})
     or exists(select 1 from pg_catalog.pg_policy where polname=${literal(PRE_CUTOVER_POLICY_NAME)}) then
    raise exception 'Pre-cutover evidence teardown is incomplete' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc p
    where p.oid=pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()')
      and pg_catalog.regexp_replace(pg_catalog.replace(p.prosrc,pg_catalog.chr(13)||pg_catalog.chr(10),pg_catalog.chr(10)),'^[[:space:]]+|[[:space:]]+$','','g')=${literal(canonicalSidecarSource)}) then
    raise exception 'Phase 2A semantic sidecar changed during pre-cutover teardown' using errcode='55000';
  end if;
  if (select pg_catalog.count(*) from reflab_meta.reflab_schema_state)<>0
     or not exists(select 1 from reflab_meta.production_adoption_state where phase_key='canonical_objects' and phase_order=4) then
    raise exception 'Pre-cutover evidence teardown changed adoption markers' using errcode='55000';
  end if;
end $postconditions$;
commit;
`;
}

export function writePreCutoverEvidenceFiles() {
  const catalog = buildPreCutoverCatalogBatch();
  const aggregate = buildPreCutoverAggregateBatch();
  validateReadOnlyEvidenceSql(catalog);
  validateReadOnlyEvidenceSql(aggregate);
  const outputs = [
    [resolve(root, PRE_CUTOVER_MIGRATION), buildPreCutoverMigration()],
    [resolve(root, PRE_CUTOVER_TEARDOWN), buildPreCutoverTeardown()],
    [resolve(root, PRE_CUTOVER_CATALOG_BATCH), catalog],
    [resolve(directory, "pre-cutover-aggregate-evidence.sql"), aggregate],
  ];
  for (const [path, contents] of outputs) writeFileSync(path, contents, "utf8");
  return outputs.map(([path]) => path);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${writePreCutoverEvidenceFiles().join("\n")}\n`);
}
