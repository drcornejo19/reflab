import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";

export const PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT =
  "REFLAB_PSYCHOLOGY_RECONCILIATION_EVIDENCE_V1";
export const PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION =
  "--production-psychology-module-reconciliation-evidence";
export const PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN =
  "ALLOW_PRODUCTION_PSYCHOLOGY_RECONCILIATION_EVIDENCE";
export const PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD =
  "REFLAB_PRODUCTION_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD";

export const PSYCHOLOGY_MODULE_PROVIDER_ARTIFACT =
  "supabase/migrations/202606240001_psychology_module_categories.sql";
export const PSYCHOLOGY_MODULE_PROVIDER_SHA256 =
  "f266e11958767dbae85e164c60c2439cc2a45cc00b302f6493469772537eadaa";
export const PSYCHOLOGY_NOTIFICATIONS_ARTIFACT =
  "supabase/migrations/202608310003_production_adoption_psychology_notifications_prerequisites.sql";
export const PSYCHOLOGY_NOTIFICATIONS_SHA256 =
  "b50a6fa0982244e3332d18b5354e146ab4cc202752612cce4897d0e17b1cd04e";

export const CANONICAL_PSYCHOLOGY_MODULE_SLUGS = Object.freeze([
  "gestion-error",
  "presion-competitiva",
  "concentracion-foco",
  "confianza-arbitral",
  "resiliencia",
  "preparacion-mental-pre-partido",
  "evaluacion-post-partido",
  "sin-clasificar",
]);

export const PSYCHOLOGY_MODULE_MAPPINGS = Object.freeze([
  Object.freeze({
    table: "public.psychology_checkins",
    sourceField: "checkin_type",
    mapping: Object.freeze({
      error_recovery: "gestion-error",
      post_match: "evaluacion-post-partido",
      pre_match: "preparacion-mental-pre-partido",
    }),
  }),
  Object.freeze({
    table: "public.psychology_wellbeing_assessments",
    sourceField: null,
    literal: "resiliencia",
  }),
  Object.freeze({
    table: "public.psychology_exercise_sessions",
    sourceField: "exercise_type",
    mapping: Object.freeze({
      focus_reset: "concentracion-foco",
      pressure_scenario: "presion-competitiva",
      self_talk: "confianza-arbitral",
      team_prebrief: "preparacion-mental-pre-partido",
    }),
  }),
]);

export const PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID =
  "psychology_module_reconciliation_catalog";
export const PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID =
  "psychology_module_reconciliation_aggregates";
export const PSYCHOLOGY_RECONCILIATION_QUERY_IDS = Object.freeze([
  PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID,
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function extractCatalogSlugs(sql) {
  const block = sql.match(/insert\s+into\s+public\.psychology_modules\s*\([\s\S]*?\)\s*values([\s\S]*?);/i);
  return block ? [...block[1].matchAll(/\(\s*'([^']+)'/g)].map((match) => match[1]) : [];
}

export function assertPsychologyReconciliationArtifacts(repositoryRoot) {
  const providerPath = resolve(repositoryRoot, PSYCHOLOGY_MODULE_PROVIDER_ARTIFACT);
  const targetPath = resolve(repositoryRoot, PSYCHOLOGY_NOTIFICATIONS_ARTIFACT);
  const providerSql = readFileSync(providerPath, "utf8");
  const targetSql = readFileSync(targetPath, "utf8");
  if (sha256(providerSql) !== PSYCHOLOGY_MODULE_PROVIDER_SHA256) {
    throw new Error("Psychology module historical provider hash mismatch.");
  }
  if (sha256(targetSql) !== PSYCHOLOGY_NOTIFICATIONS_SHA256) {
    throw new Error("Production 310003 artifact hash mismatch.");
  }
  if (JSON.stringify(extractCatalogSlugs(targetSql)) !== JSON.stringify(CANONICAL_PSYCHOLOGY_MODULE_SLUGS)) {
    throw new Error("Production 310003 Psychology catalog slug contract drifted.");
  }
  const requiredProviderFragments = [
    "when checkin_type = 'error_recovery' then 'gestion-error'",
    "when checkin_type = 'post_match' then 'evaluacion-post-partido'",
    "else 'preparacion-mental-pre-partido'",
    "set module_slug = 'resiliencia'",
    "when exercise_type = 'pressure_scenario' then 'presion-competitiva'",
    "when exercise_type = 'self_talk' then 'confianza-arbitral'",
    "when exercise_type = 'team_prebrief' then 'preparacion-mental-pre-partido'",
    "else 'concentracion-foco'",
  ];
  if (!requiredProviderFragments.every((fragment) => providerSql.includes(fragment))) {
    throw new Error("Psychology module historical mapping contract drifted.");
  }
  return {
    provider: { filename: PSYCHOLOGY_MODULE_PROVIDER_ARTIFACT, sha256: PSYCHOLOGY_MODULE_PROVIDER_SHA256 },
    target: { filename: PSYCHOLOGY_NOTIFICATIONS_ARTIFACT, sha256: PSYCHOLOGY_NOTIFICATIONS_SHA256 },
  };
}

const catalogPayloadSql = `(with expected_tables(table_name) as (
    values
      ('psychology_checkins'),
      ('psychology_wellbeing_assessments'),
      ('psychology_exercise_sessions')
  ), table_state as (
    select expected.table_name, relation.oid,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT') as can_select,
      case when relation.oid is null then null else pg_catalog.row_security_active(relation.oid) end as rls_applies
    from expected_tables expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
  ), expected_sources(table_name, column_name, expected_type) as (
    values
      ('psychology_checkins', 'checkin_type', 'text'),
      ('psychology_exercise_sessions', 'exercise_type', 'text')
  ), source_state as (
    select expected.*,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as not_null
    from expected_sources expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), module_slug_state as (
    select table_state.table_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as not_null
    from table_state
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = table_state.oid
      and attribute.attname = 'module_slug' and attribute.attnum > 0 and not attribute.attisdropped
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'tables', (select coalesce(pg_catalog.json_agg(pg_catalog.json_build_object(
      'table', 'public.' || table_name,
      'present', oid is not null,
      'can_select', can_select,
      'rls_applies', rls_applies
    ) order by table_name), '[]'::json) from table_state),
    'source_columns', (select coalesce(pg_catalog.json_agg(pg_catalog.json_build_object(
      'table', 'public.' || table_name,
      'column', column_name,
      'expected_type', expected_type,
      'observed_type', observed_type,
      'not_null', not_null
    ) order by table_name, column_name), '[]'::json) from source_state),
    'module_slug_columns', (select coalesce(pg_catalog.json_agg(pg_catalog.json_build_object(
      'table', 'public.' || table_name,
      'present', observed_type is not null,
      'observed_type', observed_type,
      'not_null', not_null
    ) order by table_name), '[]'::json) from module_slug_state),
    'checks', pg_catalog.json_build_object(
      'required_tables_exist', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(oid is not null) from table_state),
      'source_column_types_exact', (select pg_catalog.count(*) = 2 and pg_catalog.bool_and(observed_type is not null and observed_type = expected_type) from source_state),
      'module_slug_absent_exact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(observed_type is null) from module_slug_state),
      'data_visibility_exact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(can_select and not rls_applies) from table_state)
    )
  ))`;

function safeJsonArray(sql) {
  return `coalesce((${sql}), '[]'::json)`;
}

const checkinEvidenceSql = `select pg_catalog.json_build_object(
    'table', 'public.psychology_checkins',
    'source_field', 'checkin_type',
    'total_rows', (select pg_catalog.count(*) from public.psychology_checkins),
    'source_counts', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('value', grouped.checkin_type, 'count', grouped.row_count) order by grouped.checkin_type) from (select checkin_type, pg_catalog.count(*) row_count from public.psychology_checkins where checkin_type in ('pre_match', 'post_match', 'error_recovery') group by checkin_type) grouped`)},
    'mapped_counts', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('slug', grouped.module_slug, 'count', grouped.row_count) order by grouped.module_slug) from (select case checkin_type when 'error_recovery' then 'gestion-error' when 'post_match' then 'evaluacion-post-partido' when 'pre_match' then 'preparacion-mental-pre-partido' end module_slug, pg_catalog.count(*) row_count from public.psychology_checkins where checkin_type in ('pre_match', 'post_match', 'error_recovery') group by 1) grouped`)},
    'mapped_row_count', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type in ('pre_match', 'post_match', 'error_recovery')),
    'unmapped_row_count', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type is null or checkin_type not in ('pre_match', 'post_match', 'error_recovery')),
    'ambiguous_row_count', 0,
    'null_source_count', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type is null),
    'unexpected_source_values', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('value', grouped.checkin_type, 'count', grouped.row_count) order by grouped.checkin_type) from (select checkin_type, pg_catalog.count(*) row_count from public.psychology_checkins where checkin_type is not null and checkin_type not in ('pre_match', 'post_match', 'error_recovery') and checkin_type ~ '^[a-z][a-z0-9_]{0,63}$' group by checkin_type) grouped`)},
    'redacted_unexpected_source_count', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type is not null and checkin_type not in ('pre_match', 'post_match', 'error_recovery') and checkin_type !~ '^[a-z][a-z0-9_]{0,63}$')
  )`;

const wellbeingEvidenceSql = `select pg_catalog.json_build_object(
    'table', 'public.psychology_wellbeing_assessments',
    'source_field', null,
    'total_rows', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
    'source_counts', '[]'::json,
    'mapped_counts', (select pg_catalog.json_build_array(pg_catalog.json_build_object('slug', 'resiliencia', 'count', pg_catalog.count(*))) from public.psychology_wellbeing_assessments),
    'mapped_row_count', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
    'unmapped_row_count', 0,
    'ambiguous_row_count', 0,
    'null_source_count', 0,
    'unexpected_source_values', '[]'::json,
    'redacted_unexpected_source_count', 0
  )`;

const exerciseEvidenceSql = `select pg_catalog.json_build_object(
    'table', 'public.psychology_exercise_sessions',
    'source_field', 'exercise_type',
    'total_rows', (select pg_catalog.count(*) from public.psychology_exercise_sessions),
    'source_counts', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('value', grouped.exercise_type, 'count', grouped.row_count) order by grouped.exercise_type) from (select exercise_type, pg_catalog.count(*) row_count from public.psychology_exercise_sessions where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief') group by exercise_type) grouped`)},
    'mapped_counts', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('slug', grouped.module_slug, 'count', grouped.row_count) order by grouped.module_slug) from (select case exercise_type when 'pressure_scenario' then 'presion-competitiva' when 'self_talk' then 'confianza-arbitral' when 'team_prebrief' then 'preparacion-mental-pre-partido' when 'focus_reset' then 'concentracion-foco' end module_slug, pg_catalog.count(*) row_count from public.psychology_exercise_sessions where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief') group by 1) grouped`)},
    'mapped_row_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
    'unmapped_row_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions where exercise_type is null or exercise_type not in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
    'ambiguous_row_count', 0,
    'null_source_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions where exercise_type is null),
    'unexpected_source_values', ${safeJsonArray(`select pg_catalog.json_agg(pg_catalog.json_build_object('value', grouped.exercise_type, 'count', grouped.row_count) order by grouped.exercise_type) from (select exercise_type, pg_catalog.count(*) row_count from public.psychology_exercise_sessions where exercise_type is not null and exercise_type not in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief') and exercise_type ~ '^[a-z][a-z0-9_]{0,63}$' group by exercise_type) grouped`)},
    'redacted_unexpected_source_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions where exercise_type is not null and exercise_type not in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief') and exercise_type !~ '^[a-z][a-z0-9_]{0,63}$')
  )`;

const aggregatePayloadSql = `(select pg_catalog.json_build_object(
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'tables', pg_catalog.json_build_array(
      (${checkinEvidenceSql}),
      (${wellbeingEvidenceSql}),
      (${exerciseEvidenceSql})
    )
  ))`;

export const psychologyReconciliationCatalogQuery = jsonQuery(
  PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  catalogPayloadSql,
);
export const psychologyReconciliationAggregateQuery = jsonQuery(
  PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID,
  aggregatePayloadSql,
  { tables: PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => entry.table) },
);

export function buildPsychologyReconciliationCatalogBatch() {
  return buildSqlBatch([psychologyReconciliationCatalogQuery]);
}

export function buildPsychologyReconciliationAggregateBatch() {
  return buildSqlBatch([psychologyReconciliationAggregateQuery]);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function assertCountEntries(entries, valueKey) {
  if (!Array.isArray(entries) || !entries.every((entry) => exactKeys(entry, [valueKey, "count"])
      && typeof entry[valueKey] === "string" && isCount(entry.count))) {
    throw new Error("Psychology evidence aggregate output schema is invalid.");
  }
}

export function assertPsychologyEvidenceOutputSafe(payload) {
  const serialized = JSON.stringify(payload);
  if (/"(?:user_id|id|email|name|subject|payload|answer|notes?|token|path|created_at|updated_at)"\s*:/i.test(serialized)) {
    throw new Error("Psychology evidence output contains a forbidden PII field.");
  }
  for (const table of payload?.tables ?? []) {
    for (const entry of table.unexpected_source_values ?? []) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(entry.value)) {
        throw new Error("Psychology evidence output contains an unsafe categorical value.");
      }
    }
  }
  return true;
}

export function shouldRunPsychologyReconciliationAggregate(catalogResults) {
  const payload = catalogResults?.get(PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID);
  return payload?.checks?.required_tables_exist === true
    && payload?.checks?.source_column_types_exact === true
    && payload?.checks?.module_slug_absent_exact === true
    && payload?.checks?.data_visibility_exact === true;
}

function classifyTable(table, expected) {
  const keys = [
    "table", "source_field", "total_rows", "source_counts", "mapped_counts",
    "mapped_row_count", "unmapped_row_count", "ambiguous_row_count",
    "null_source_count", "unexpected_source_values", "redacted_unexpected_source_count",
  ];
  if (!exactKeys(table, keys) || table.table !== expected.table
      || table.source_field !== expected.sourceField
      || !["total_rows", "mapped_row_count", "unmapped_row_count", "ambiguous_row_count",
        "null_source_count", "redacted_unexpected_source_count"].every((key) => isCount(table[key]))) {
    return { classification: "INSUFFICIENT_EVIDENCE" };
  }
  try {
    assertCountEntries(table.source_counts, "value");
    assertCountEntries(table.mapped_counts, "slug");
    assertCountEntries(table.unexpected_source_values, "value");
    assertPsychologyEvidenceOutputSafe({ tables: [table] });
  } catch {
    return { classification: "INSUFFICIENT_EVIDENCE" };
  }
  const mappedTotal = table.mapped_counts.reduce((sum, entry) => sum + entry.count, 0);
  const sourceTotal = table.source_counts.reduce((sum, entry) => sum + entry.count, 0);
  const slugsExact = table.mapped_counts.every((entry) => CANONICAL_PSYCHOLOGY_MODULE_SLUGS.includes(entry.slug));
  const totalsExact = mappedTotal === table.mapped_row_count
    && table.mapped_row_count + table.unmapped_row_count === table.total_rows
    && (expected.sourceField === null || sourceTotal === table.mapped_row_count);
  if (!slugsExact || !totalsExact) return { classification: "INSUFFICIENT_EVIDENCE" };
  if (table.ambiguous_row_count > 0) return { classification: "AMBIGUOUS" };
  if (table.total_rows === 0) return { classification: "EMPTY" };
  if (table.unmapped_row_count > 0 || table.null_source_count > 0
      || table.redacted_unexpected_source_count > 0 || table.unexpected_source_values.length > 0) {
    return { classification: "DETERMINISTIC_WITH_UNMAPPED_ROWS" };
  }
  return { classification: "DETERMINISTIC_COMPLETE" };
}

export function classifyPsychologyReconciliationEvidence(catalogResults, aggregateResults) {
  const catalog = catalogResults?.get(PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID);
  const checks = catalog?.checks;
  const catalogComplete = exactKeys(checks, [
    "required_tables_exist", "source_column_types_exact",
    "module_slug_absent_exact", "data_visibility_exact",
  ]) && Array.isArray(catalog.tables) && catalog.tables.length === 3
    && Array.isArray(catalog.source_columns) && catalog.source_columns.length === 2
    && Array.isArray(catalog.module_slug_columns) && catalog.module_slug_columns.length === 3
    && Number.isInteger(catalog.server_version_num);
  if (!catalogComplete) {
    return { classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE", tables: [] };
  }
  const callerExact = catalog.caller === "reflab_prod_preflight_ro"
    && catalog.session_user === "reflab_prod_preflight_ro";
  const readOnlyExact = catalog.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(catalog.server_version_num / 10000) === 17;
  const structuralExact = checks.required_tables_exist === true
    && checks.source_column_types_exact === true
    && checks.module_slug_absent_exact === true;
  if (!callerExact || !readOnlyExact || !postgresMajorExact || !structuralExact) {
    return {
      classification: "BLOCKER", nextAllowedRemoteOperation: "NONE", tables: [],
      callerExact, readOnlyExact, postgresMajorExact, checks,
    };
  }
  if (checks.data_visibility_exact !== true) {
    return {
      classification: "PRIVILEGED_READ_ONLY_REQUIRED",
      nextAllowedRemoteOperation: "PREPARE_PRIVILEGED_READ_ONLY_PSYCHOLOGY_EVIDENCE",
      tables: [], callerExact, readOnlyExact, postgresMajorExact, checks,
    };
  }
  const aggregate = aggregateResults?.get(PSYCHOLOGY_RECONCILIATION_DATA_QUERY_ID);
  if (!exactKeys(aggregate, ["transaction_read_only", "tables"])
      || aggregate.transaction_read_only !== "on" || !Array.isArray(aggregate.tables)
      || aggregate.tables.length !== 3) {
    return {
      classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE", tables: [],
      callerExact, readOnlyExact, postgresMajorExact, checks,
    };
  }
  try {
    assertPsychologyEvidenceOutputSafe(aggregate);
  } catch {
    return {
      classification: "BLOCKER", nextAllowedRemoteOperation: "NONE", tables: [],
      callerExact, readOnlyExact, postgresMajorExact, checks,
    };
  }
  const byTable = new Map(aggregate.tables.map((table) => [table.table, table]));
  const tables = PSYCHOLOGY_MODULE_MAPPINGS.map((expected) => ({
    table: expected.table,
    ...classifyTable(byTable.get(expected.table), expected),
  }));
  const incomplete = tables.some((table) => table.classification === "INSUFFICIENT_EVIDENCE");
  const blocker = tables.some((table) => [
    "DETERMINISTIC_WITH_UNMAPPED_ROWS", "AMBIGUOUS",
  ].includes(table.classification));
  return {
    classification: incomplete ? "UNKNOWN" : blocker ? "BLOCKER" : "PASS",
    nextAllowedRemoteOperation: "NONE",
    tables,
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    checks,
  };
}
