import { buildSqlBatch, jsonQuery } from "../../production-preflight/queries.mjs";
import {
  PHASE1_HISTORICAL_FINGERPRINT,
  phase1ProductFingerprintQuery,
} from "./phase1-foundation-ddl-contract.mjs";
import {
  CANONICAL_PSYCHOLOGY_MODULE_SLUGS,
  PSYCHOLOGY_MODULE_MAPPINGS,
  assertPsychologyReconciliationArtifacts,
} from "./psychology-module-reconciliation-evidence-contract.mjs";
import {
  INSTALLER_IDENTITY_QUERY_ID,
  classifyInstallerIdentity,
  installerIdentityQuery,
} from "./run-production-installer-identity-attestation.mjs";

export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_FORMAT =
  "REFLAB_PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_V1";
export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPERATION =
  "--production-privileged-psychology-module-reconciliation-evidence";
export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_OPT_IN =
  "ALLOW_PRODUCTION_PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE";
export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD =
  "REFLAB_PRODUCTION_PRIVILEGED_PSYCHOLOGY_RECONCILIATION_EVIDENCE_APPROVED_HEAD";
export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID =
  "privileged_psychology_module_reconciliation_catalog";
export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID =
  "privileged_psychology_module_reconciliation_aggregates";

export const PRIVILEGED_PSYCHOLOGY_RECONCILIATION_QUERY_IDS = Object.freeze([
  INSTALLER_IDENTITY_QUERY_ID,
  phase1ProductFingerprintQuery.id,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID,
]);

const catalogPayloadSql = `(with expected_tables(table_name) as (
    values
      ('psychology_checkins'),
      ('psychology_wellbeing_assessments'),
      ('psychology_exercise_sessions')
  ), table_state as (
    select expected.table_name, relation.oid,
      pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
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
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type
    from expected_sources expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), module_slug_state as (
    select table_state.table_name, attribute.attname
    from table_state
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = table_state.oid
      and attribute.attname = 'module_slug' and attribute.attnum > 0 and not attribute.attisdropped
  ), target_state as (
    select
      pg_catalog.to_regclass('public.psychology_modules') is not null as target_table_present,
      exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid = pg_catalog.to_regclass('public.notification_events')
          and attribute.attname = 'deduplication_key'
          and attribute.attnum > 0 and not attribute.attisdropped
      ) as target_column_present,
      pg_catalog.to_regclass('public.notification_events_deduplication_unique') is not null
        as target_index_present,
      exists (
        select 1 from pg_catalog.pg_constraint constraint_record
        join pg_catalog.pg_class relation on relation.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and constraint_record.conname in ('psychology_modules_pkey', 'psychology_modules_sort_order_check')
      ) or pg_catalog.to_regclass('public.psychology_modules_pkey') is not null
        as target_constraint_present,
      exists (
        select 1 from reflab_meta.production_adoption_state where phase_order >= 3
      ) as target_ledger_present
  )
  select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', pg_catalog.json_build_object(
      'required_tables_exist', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(oid is not null) from table_state),
      'required_tables_owned_by_postgres', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(owner_name = 'postgres') from table_state),
      'source_column_types_exact', (select pg_catalog.count(*) = 2
        and pg_catalog.bool_and(observed_type is not null and observed_type = expected_type)
        from source_state),
      'module_slug_absent_exact', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(attname is null) from module_slug_state),
      'target_310003_infrastructure_absent', (select not target_table_present
        and not target_column_present and not target_index_present
        and not target_constraint_present and not target_ledger_present from target_state),
      'data_visibility_exact', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(can_select and not rls_applies) from table_state)
    ),
    'counts', pg_catalog.json_build_object(
      'required_tables', (select pg_catalog.count(*) from table_state where oid is not null),
      'source_columns', (select pg_catalog.count(*) from source_state where observed_type is not null),
      'module_slug_columns_present', (select pg_catalog.count(*) from module_slug_state where attname is not null),
      'target_310003_objects_present', (select
        target_table_present::integer + target_column_present::integer
        + target_index_present::integer + target_constraint_present::integer
        + target_ledger_present::integer from target_state)
    )
  ))`;

const aggregatePayloadSql = `(select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'tables', pg_catalog.json_build_array(
      pg_catalog.json_build_object(
        'table', 'public.psychology_checkins',
        'source_field', 'checkin_type',
        'total_rows', (select pg_catalog.count(*) from public.psychology_checkins),
        'source_counts', coalesce((select pg_catalog.json_agg(pg_catalog.json_build_object(
          'value', grouped.checkin_type, 'count', grouped.row_count) order by grouped.checkin_type)
          from (select checkin_type, pg_catalog.count(*) row_count
            from public.psychology_checkins
            where checkin_type in ('error_recovery', 'post_match', 'pre_match')
            group by checkin_type) grouped), '[]'::json),
        'mapped_counts', coalesce((select pg_catalog.json_agg(pg_catalog.json_build_object(
          'slug', grouped.module_slug, 'count', grouped.row_count) order by grouped.module_slug)
          from (select case checkin_type
              when 'error_recovery' then 'gestion-error'
              when 'post_match' then 'evaluacion-post-partido'
              when 'pre_match' then 'preparacion-mental-pre-partido'
            end module_slug, pg_catalog.count(*) row_count
            from public.psychology_checkins
            where checkin_type in ('error_recovery', 'post_match', 'pre_match')
            group by 1) grouped), '[]'::json),
        'mapped_row_count', (select pg_catalog.count(*) from public.psychology_checkins
          where checkin_type in ('error_recovery', 'post_match', 'pre_match')),
        'unmapped_row_count', (select pg_catalog.count(*) from public.psychology_checkins
          where checkin_type is null or checkin_type not in ('error_recovery', 'post_match', 'pre_match')),
        'ambiguous_row_count', 0,
        'null_source_count', (select pg_catalog.count(*) from public.psychology_checkins
          where checkin_type is null),
        'unexpected_value_count', (select pg_catalog.count(*) from public.psychology_checkins
          where checkin_type is not null
            and checkin_type not in ('error_recovery', 'post_match', 'pre_match'))
      ),
      pg_catalog.json_build_object(
        'table', 'public.psychology_wellbeing_assessments',
        'source_field', null,
        'total_rows', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
        'source_counts', '[]'::json,
        'mapped_counts', (select pg_catalog.json_build_array(pg_catalog.json_build_object(
          'slug', 'resiliencia', 'count', pg_catalog.count(*)))
          from public.psychology_wellbeing_assessments),
        'mapped_row_count', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
        'unmapped_row_count', 0,
        'ambiguous_row_count', 0,
        'null_source_count', 0,
        'unexpected_value_count', 0
      ),
      pg_catalog.json_build_object(
        'table', 'public.psychology_exercise_sessions',
        'source_field', 'exercise_type',
        'total_rows', (select pg_catalog.count(*) from public.psychology_exercise_sessions),
        'source_counts', coalesce((select pg_catalog.json_agg(pg_catalog.json_build_object(
          'value', grouped.exercise_type, 'count', grouped.row_count) order by grouped.exercise_type)
          from (select exercise_type, pg_catalog.count(*) row_count
            from public.psychology_exercise_sessions
            where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')
            group by exercise_type) grouped), '[]'::json),
        'mapped_counts', coalesce((select pg_catalog.json_agg(pg_catalog.json_build_object(
          'slug', grouped.module_slug, 'count', grouped.row_count) order by grouped.module_slug)
          from (select case exercise_type
              when 'focus_reset' then 'concentracion-foco'
              when 'pressure_scenario' then 'presion-competitiva'
              when 'self_talk' then 'confianza-arbitral'
              when 'team_prebrief' then 'preparacion-mental-pre-partido'
            end module_slug, pg_catalog.count(*) row_count
            from public.psychology_exercise_sessions
            where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')
            group by 1) grouped), '[]'::json),
        'mapped_row_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions
          where exercise_type in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
        'unmapped_row_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions
          where exercise_type is null
            or exercise_type not in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief')),
        'ambiguous_row_count', 0,
        'null_source_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions
          where exercise_type is null),
        'unexpected_value_count', (select pg_catalog.count(*) from public.psychology_exercise_sessions
          where exercise_type is not null
            and exercise_type not in ('focus_reset', 'pressure_scenario', 'self_talk', 'team_prebrief'))
      )
    )
  ))`;

export const privilegedPsychologyReconciliationCatalogQuery = jsonQuery(
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID,
  catalogPayloadSql,
);
export const privilegedPsychologyReconciliationAggregateQuery = jsonQuery(
  PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID,
  aggregatePayloadSql,
  { tables: PSYCHOLOGY_MODULE_MAPPINGS.map((entry) => entry.table) },
);

export function assertPrivilegedPsychologyReconciliationArtifacts(repositoryRoot) {
  return assertPsychologyReconciliationArtifacts(repositoryRoot);
}

export function buildPrivilegedPsychologyReconciliationCatalogBatch() {
  return buildSqlBatch([
    installerIdentityQuery,
    phase1ProductFingerprintQuery,
    privilegedPsychologyReconciliationCatalogQuery,
  ]);
}

export function buildPrivilegedPsychologyReconciliationAggregateBatch() {
  return buildSqlBatch([privilegedPsychologyReconciliationAggregateQuery]);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function exactCountEntries(entries, key, allowed) {
  if (!Array.isArray(entries)) return false;
  const seen = new Set();
  return entries.every((entry) => {
    if (!exactKeys(entry, [key, "count"]) || typeof entry[key] !== "string"
        || !allowed.has(entry[key]) || !isCount(entry.count) || seen.has(entry[key])) return false;
    seen.add(entry[key]);
    return true;
  });
}

export function assertPrivilegedPsychologyEvidenceOutputSafe(payload) {
  const forbiddenKeys = new Set([
    "id", "user_id", "email", "name", "subject", "payload", "answer", "answers",
    "note", "notes", "token", "path", "created_at", "updated_at", "raw_rows",
  ]);
  const inspect = (value) => {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        throw new Error(`Privileged Psychology evidence exposed forbidden field: ${key}.`);
      }
      inspect(nested);
    }
  };
  inspect(payload);
  return true;
}

export function shouldRunPrivilegedPsychologyReconciliationAggregate(results) {
  const payload = results?.get(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID);
  const checks = payload?.checks;
  return checks?.required_tables_exist === true
    && checks?.required_tables_owned_by_postgres === true
    && checks?.source_column_types_exact === true
    && checks?.module_slug_absent_exact === true
    && checks?.target_310003_infrastructure_absent === true
    && checks?.data_visibility_exact === true;
}

function classifyTable(table, contract) {
  const expectedKeys = [
    "table", "source_field", "total_rows", "source_counts", "mapped_counts",
    "mapped_row_count", "unmapped_row_count", "ambiguous_row_count",
    "null_source_count", "unexpected_value_count",
  ];
  const countKeys = [
    "total_rows", "mapped_row_count", "unmapped_row_count", "ambiguous_row_count",
    "null_source_count", "unexpected_value_count",
  ];
  if (!exactKeys(table, expectedKeys) || table.table !== contract.table
      || table.source_field !== contract.sourceField
      || !countKeys.every((key) => isCount(table[key]))) return "INSUFFICIENT_EVIDENCE";

  const approvedSources = new Set(Object.keys(contract.mapping ?? {}));
  const approvedSlugs = new Set(CANONICAL_PSYCHOLOGY_MODULE_SLUGS);
  if (!exactCountEntries(table.source_counts, "value", approvedSources)
      || !exactCountEntries(table.mapped_counts, "slug", approvedSlugs)) {
    return "INSUFFICIENT_EVIDENCE";
  }
  const sourceTotal = table.source_counts.reduce((sum, entry) => sum + entry.count, 0);
  const mappedTotal = table.mapped_counts.reduce((sum, entry) => sum + entry.count, 0);
  const expectedMappedCounts = new Map();
  if (contract.sourceField === null) {
    expectedMappedCounts.set(contract.literal, table.total_rows);
  } else {
    for (const entry of table.source_counts) {
      const slug = contract.mapping[entry.value];
      expectedMappedCounts.set(slug, (expectedMappedCounts.get(slug) ?? 0) + entry.count);
    }
  }
  const observedMappedCounts = new Map(table.mapped_counts.map((entry) => [entry.slug, entry.count]));
  const mappingExact = observedMappedCounts.size === expectedMappedCounts.size
    && [...expectedMappedCounts].every(([slug, count]) => observedMappedCounts.get(slug) === count);
  const totalsExact = mappedTotal === table.mapped_row_count
    && table.mapped_row_count + table.unmapped_row_count === table.total_rows
    && (contract.sourceField === null
      ? table.mapped_row_count === table.total_rows && sourceTotal === 0
      : sourceTotal === table.mapped_row_count
        && table.unmapped_row_count === table.null_source_count + table.unexpected_value_count);
  if (!totalsExact || !mappingExact) return "INSUFFICIENT_EVIDENCE";
  if (table.ambiguous_row_count > 0) return "AMBIGUOUS";
  if (table.total_rows === 0) return "EMPTY";
  if (table.unmapped_row_count > 0 || table.null_source_count > 0
      || table.unexpected_value_count > 0) return "DETERMINISTIC_WITH_UNMAPPED_ROWS";
  return "DETERMINISTIC_COMPLETE";
}

function fingerprintExact(fingerprint) {
  return Object.entries(PHASE1_HISTORICAL_FINGERPRINT).every(
    ([key, expected]) => fingerprint?.[key] === expected,
  );
}

export function classifyPrivilegedPsychologyReconciliationEvidence(results, aggregateResults) {
  if (!(results instanceof Map) || (aggregateResults !== undefined && !(aggregateResults instanceof Map))) {
    return { classification: "UNKNOWN", reconciliationEligibility: "BLOCKER", tables: [] };
  }
  const installerPayload = results.get(INSTALLER_IDENTITY_QUERY_ID);
  const fingerprint = results.get(phase1ProductFingerprintQuery.id);
  const catalog = results.get(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_CATALOG_QUERY_ID);
  const aggregate = aggregateResults?.get(PRIVILEGED_PSYCHOLOGY_RECONCILIATION_AGGREGATE_QUERY_ID);
  const checks = catalog?.checks;
  const counts = catalog?.counts;
  const requiredChecks = [
    "required_tables_exist", "required_tables_owned_by_postgres", "source_column_types_exact",
    "module_slug_absent_exact", "target_310003_infrastructure_absent", "data_visibility_exact",
  ];
  const complete = Boolean(installerPayload) && Boolean(fingerprint) && Boolean(catalog)
    && exactKeys(checks, requiredChecks)
    && requiredChecks.every((key) => typeof checks[key] === "boolean")
    && exactKeys(counts, [
      "required_tables", "source_columns", "module_slug_columns_present",
      "target_310003_objects_present",
    ])
    && Object.values(counts).every(isCount)
    && typeof catalog.caller === "string" && typeof catalog.session_user === "string"
    && typeof catalog.transaction_read_only === "string"
    && Number.isInteger(catalog.server_version_num);
  if (!complete) return { classification: "UNKNOWN", reconciliationEligibility: "BLOCKER", tables: [] };

  const installer = classifyInstallerIdentity(installerPayload);
  const installerExact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP";
  const callerExact = catalog.caller === "postgres" && catalog.session_user === "postgres"
    && installerPayload.caller === "postgres" && installerPayload.session_user === "postgres"
    && (aggregate === undefined
      || (aggregate.caller === "postgres" && aggregate.session_user === "postgres"));
  const readOnlyExact = catalog.transaction_read_only === "on"
    && (aggregate === undefined || aggregate.transaction_read_only === "on");
  const postgresMajorExact = Math.trunc(catalog.server_version_num / 10000) === 17
    && installer.postgresMajorExact === true;
  const structureExact = requiredChecks.every((key) => checks[key] === true)
    && counts.required_tables === 3 && counts.source_columns === 2
    && counts.module_slug_columns_present === 0 && counts.target_310003_objects_present === 0;
  const productFingerprintExact = fingerprintExact(fingerprint);

  if (!installerExact || !callerExact || !readOnlyExact || !postgresMajorExact
      || !structureExact || !productFingerprintExact) {
    return {
      classification: "BLOCKER",
      reconciliationEligibility: "BLOCKER",
      tables: [], metrics: [], installerExact, callerExact, readOnlyExact, postgresMajorExact,
      structureExact, productFingerprintExact,
    };
  }
  if (!aggregate || !Array.isArray(aggregate.tables) || aggregate.tables.length !== 3) {
    return {
      classification: "UNKNOWN", reconciliationEligibility: "BLOCKER", tables: [], metrics: [],
      installerExact, callerExact, readOnlyExact, postgresMajorExact,
      structureExact, productFingerprintExact,
    };
  }
  try {
    assertPrivilegedPsychologyEvidenceOutputSafe(aggregate);
  } catch {
    return {
      classification: "BLOCKER", reconciliationEligibility: "BLOCKER", tables: [], metrics: [],
      installerExact, callerExact, readOnlyExact, postgresMajorExact,
      structureExact, productFingerprintExact,
    };
  }
  const tables = PSYCHOLOGY_MODULE_MAPPINGS.map((contract, index) => ({
    table: contract.table,
    classification: classifyTable(aggregate.tables[index], contract),
  }));
  let reconciliationEligibility;
  if (tables.every((entry) => entry.classification === "EMPTY")) {
    reconciliationEligibility = "OPTION_A_ONLY";
  } else if (tables.every((entry) => ["EMPTY", "DETERMINISTIC_COMPLETE"].includes(entry.classification))) {
    reconciliationEligibility = "OPTION_B_ELIGIBLE";
  } else if (tables.some((entry) => entry.classification === "DETERMINISTIC_WITH_UNMAPPED_ROWS")) {
    reconciliationEligibility = "MANUAL_MAPPING_REQUIRED";
  } else {
    reconciliationEligibility = "BLOCKER";
  }
  return {
    classification: ["OPTION_A_ONLY", "OPTION_B_ELIGIBLE"].includes(reconciliationEligibility)
      ? "PASS" : "BLOCKER",
    reconciliationEligibility,
    tables,
    metrics: aggregate.tables,
    historicalFingerprint: {
      attempts: fingerprint.attempts,
      exam_results: fingerprint.exam_results,
      notification_events: fingerprint.notification_events,
    },
    installerExact,
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    structureExact,
    productFingerprintExact,
  };
}
