import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";

export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_FORMAT =
  "REFLAB_PRODUCTION_PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_V1";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPERATION =
  "--production-psychology-module-slug-reconciliation";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_OPT_IN =
  "ALLOW_PRODUCTION_PSYCHOLOGY_MODULE_SLUG_RECONCILIATION";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_ARTIFACT =
  "supabase/migrations/20260901064309_production_adoption_psychology_module_slug_reconciliation.sql";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_SHA256 =
  "d63b63e68bff65b59056f043e28d4062f9aaf189b9dc9ec926734fcf374a50a9";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID =
  "psychology_module_slug_reconciliation_pre_attestation";
export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID =
  "psychology_module_slug_reconciliation_post_attestation";

export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_TABLES = Object.freeze([
  "public.psychology_checkins",
  "public.psychology_wellbeing_assessments",
  "public.psychology_exercise_sessions",
]);

export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MAPPING = Object.freeze([
  Object.freeze({ source: "error_recovery", target: "gestion-error" }),
  Object.freeze({ source: "post_match", target: "evaluacion-post-partido" }),
  Object.freeze({ source: "pre_match", target: "preparacion-mental-pre-partido" }),
]);

export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_LEDGER_DECISION = Object.freeze({
  rowInserted: false,
  reason: "310003 owns the next monotonic ledger row psychology_notification_prerequisites/order 3",
  requiredBefore: Object.freeze(["foundation/1", "exam_training_prerequisites/2"]),
  requiredAfter: Object.freeze(["foundation/1", "exam_training_prerequisites/2"]),
});

export const PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MUTATIONS = Object.freeze({
  psychologyCheckinUpdates: 3,
  otherProductUpdates: 0,
  productInserts: 0,
  productDeletes: 0,
});

const requiredPreChecks = Object.freeze([
  "tablesExact",
  "ownersExact",
  "sourceColumnsExact",
  "moduleSlugColumnsAbsent",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "psychologyModulesAbsent",
  "laterInfrastructureAbsent",
  "developmentObjectsAbsent",
  "psychologyEvidenceExact",
]);

const requiredPostChecks = Object.freeze([
  "columnsExact",
  "psychologyDataExact",
  "emptyTablesPreserved",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "psychologyModulesAbsent",
  "laterInfrastructureAbsent",
  "developmentObjectsAbsent",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertPsychologyModuleSlugReconciliationArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const digest = sha256(sql);
  const addedColumns = [...sql.matchAll(
    /alter\s+table\s+(public\.[a-z_][a-z0-9_]*)\s+add\s+column\s+module_slug\s+text\s*;/gi,
  )].map((match) => match[1].toLowerCase());
  const updateTargets = [...sql.matchAll(/\bupdate\s+(public\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const mappedPairs = [...sql.matchAll(
    /set\s+module_slug\s*=\s*'([^']+)'\s+where\s+checkin_type\s*=\s*'([^']+)'/gi,
  )].map((match) => ({ source: match[2], target: match[1] }));

  if (digest !== PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_SHA256
      || !same(addedColumns, PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_TABLES)
      || !same(updateTargets, Array(3).fill("public.psychology_checkins"))
      || !same(mappedPairs, PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_MAPPING)) {
    throw new Error("Psychology module_slug reconciliation scope drifted.");
  }
  if (!/^\s*--[\s\S]*?\bbegin\s*;/i.test(sql)
      || !/\bcommit\s*;\s*$/i.test(sql)
      || !/set\s+local\s+lock_timeout\s*=\s*'5s'/i.test(sql)
      || !/set\s+local\s+statement_timeout\s*=\s*'60s'/i.test(sql)
      || (sql.match(/get\s+diagnostics\s+affected\s*=\s*row_count/gi) ?? []).length !== 3
      || (sql.match(/if\s+affected\s*<>\s*1/gi) ?? []).length !== 3
      || !/if\s+affected_total\s*<>\s*3/i.test(sql)) {
    throw new Error("Psychology module_slug reconciliation transaction or row-count contract drifted.");
  }
  if (/\belse\b|sin-clasificar/i.test(sql)
      || /\bcreate\s+(?:table|index|unique\s+index|function|trigger)\b/i.test(sql)
      || /\badd\s+constraint\b/i.test(sql)
      || /\b(?:insert\s+into|delete\s+from|truncate)\b/i.test(sql)
      || /\b(?:grant|revoke)\b/i.test(sql)
      || /\b(?:insert|update|delete)\b[^;]*\breflab_meta\.(?:production_adoption_state|reflab_schema_state)\b/i.test(sql)
      || /\bmodule_slug\s+text\s+(?:not\s+null|default)\b/i.test(sql)) {
    throw new Error("Psychology module_slug reconciliation contains forbidden scope.");
  }
  return { path: PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_ARTIFACT, sha256: digest, sql };
}

const protectedStateSql = `
      'ledgerExact', (select pg_catalog.count(*) = 2
        and pg_catalog.count(*) filter (where phase_order = 1 and phase_key = 'foundation'
          and previous_phase_key is null and plan_version = 'production_adoption_bridge_v1'
          and plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
          and evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d') = 1
        and pg_catalog.count(*) filter (where phase_order = 2 and phase_key = 'exam_training_prerequisites'
          and previous_phase_key = 'foundation' and plan_version = 'production_adoption_bridge_v1'
          and plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
          and evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d') = 1
        from reflab_meta.production_adoption_state),
      'schemaStateEmpty', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'psychologyModulesAbsent', pg_catalog.to_regclass('public.psychology_modules') is null,
      'laterInfrastructureAbsent', not exists (
        select 1 from pg_catalog.pg_namespace where nspname = 'reflab_audit'
      ) and not exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid = pg_catalog.to_regclass('public.notification_events')
          and attribute.attname = 'deduplication_key'
          and attribute.attnum > 0 and not attribute.attisdropped
      ) and pg_catalog.to_regclass('public.notification_events_deduplication_unique') is null
        and not exists (select 1 from reflab_meta.production_adoption_state where phase_order >= 3),
      'developmentObjectsAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null
        and pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null`;

export const psychologyModuleSlugReconciliationPreQuery = jsonQuery(
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_PRE_QUERY_ID,
  `(with expected_tables(table_name) as (
    values ('psychology_checkins'), ('psychology_wellbeing_assessments'), ('psychology_exercise_sessions')
  ), table_state as (
    select expected.table_name, relation.oid,
      pg_catalog.pg_get_userbyid(relation.relowner) as owner_name
    from expected_tables expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
  ), source_state as (
    select expected.table_name, expected.column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as observed_not_null
    from (values
      ('psychology_checkins', 'checkin_type'),
      ('psychology_exercise_sessions', 'exercise_type')
    ) expected(table_name, column_name)
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), module_state as (
    select table_state.table_name, attribute.attname
    from table_state
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = table_state.oid
      and attribute.attname = 'module_slug' and attribute.attnum > 0 and not attribute.attisdropped
  ) select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', pg_catalog.json_build_object(
      'tablesExact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(oid is not null) from table_state),
      'ownersExact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(owner_name = 'postgres') from table_state),
      'sourceColumnsExact', (select pg_catalog.count(*) = 2
        and pg_catalog.bool_and(observed_type = 'text' and observed_not_null) from source_state),
      'moduleSlugColumnsAbsent', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(attname is null) from module_state),
      ${protectedStateSql},
      'psychologyEvidenceExact',
        (select pg_catalog.count(*) = 3 from public.psychology_checkins)
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'error_recovery')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'post_match')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'pre_match')
        and (select pg_catalog.count(*) = 0 from public.psychology_checkins where checkin_type is null)
        and (select pg_catalog.count(*) = 0 from public.psychology_checkins
          where checkin_type not in ('error_recovery', 'post_match', 'pre_match'))
        and (select pg_catalog.count(*) = 0 from public.psychology_wellbeing_assessments)
        and (select pg_catalog.count(*) = 0 from public.psychology_exercise_sessions)
    ),
    'counts', pg_catalog.json_build_object(
      'checkins', (select pg_catalog.count(*) from public.psychology_checkins),
      'error_recovery', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'error_recovery'),
      'post_match', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'post_match'),
      'pre_match', (select pg_catalog.count(*) from public.psychology_checkins where checkin_type = 'pre_match'),
      'wellbeing', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
      'exercise_sessions', (select pg_catalog.count(*) from public.psychology_exercise_sessions)
    )
  ))`,
);

export const psychologyModuleSlugReconciliationPostQuery = jsonQuery(
  PSYCHOLOGY_MODULE_SLUG_RECONCILIATION_POST_QUERY_ID,
  `(with expected_tables(table_name) as (
    values ('psychology_checkins'), ('psychology_wellbeing_assessments'), ('psychology_exercise_sessions')
  ), column_state as (
    select expected.table_name,
      attribute.attnum as ordinal,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type,
      attribute.attnotnull as observed_not_null,
      attribute.attidentity as observed_identity,
      attribute.attgenerated as observed_generated,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) as observed_default,
      attribute.attnum = (select pg_catalog.max(candidate.attnum) from pg_catalog.pg_attribute candidate
        where candidate.attrelid = relation.oid and candidate.attnum > 0 and not candidate.attisdropped) as appended_last
    from expected_tables expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = 'public'
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = 'module_slug' and attribute.attnum > 0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
  ) select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'columns', (select pg_catalog.json_agg(pg_catalog.json_build_object(
      'table', 'public.' || table_name,
      'ordinal', ordinal,
      'type', observed_type,
      'not_null', observed_not_null,
      'default', observed_default,
      'identity', observed_identity,
      'generated', observed_generated,
      'appended_last', appended_last
    ) order by table_name) from column_state),
    'checks', pg_catalog.json_build_object(
      'columnsExact', (select pg_catalog.count(*) = 3 and pg_catalog.bool_and(
        ordinal is not null and observed_type = 'text' and not observed_not_null
        and observed_default is null and observed_identity = '' and observed_generated = '' and appended_last
      ) from column_state),
      'psychologyDataExact',
        (select pg_catalog.count(*) = 3 from public.psychology_checkins)
        and (select pg_catalog.count(*) = 0 from public.psychology_checkins where module_slug is null)
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins
          where checkin_type = 'error_recovery' and module_slug = 'gestion-error')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins
          where checkin_type = 'post_match' and module_slug = 'evaluacion-post-partido')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins
          where checkin_type = 'pre_match' and module_slug = 'preparacion-mental-pre-partido')
        and (select pg_catalog.count(*) = 0 from public.psychology_checkins
          where (checkin_type, module_slug) not in (
            ('error_recovery', 'gestion-error'),
            ('post_match', 'evaluacion-post-partido'),
            ('pre_match', 'preparacion-mental-pre-partido')
          )),
      'emptyTablesPreserved',
        (select pg_catalog.count(*) = 0 from public.psychology_wellbeing_assessments)
        and (select pg_catalog.count(*) = 0 from public.psychology_exercise_sessions),
      ${protectedStateSql}
    ),
    'counts', pg_catalog.json_build_object(
      'checkins', (select pg_catalog.count(*) from public.psychology_checkins),
      'null_module_slug', (select pg_catalog.count(*) from public.psychology_checkins where module_slug is null),
      'gestion_error', (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'gestion-error'),
      'evaluacion_post_partido', (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'evaluacion-post-partido'),
      'preparacion_mental_pre_partido', (select pg_catalog.count(*) from public.psychology_checkins where module_slug = 'preparacion-mental-pre-partido'),
      'wellbeing', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
      'exercise_sessions', (select pg_catalog.count(*) from public.psychology_exercise_sessions)
    )
  ))`,
);

function fingerprintExact(fingerprint) {
  return Object.entries(PHASE1_HISTORICAL_FINGERPRINT).every(
    ([field, expected]) => fingerprint?.[field] === expected,
  );
}

function completePayload(payload, requiredChecks) {
  return payload && typeof payload === "object"
    && payload.checks && payload.counts
    && requiredChecks.every((field) => typeof payload.checks[field] === "boolean")
    && typeof payload.caller === "string"
    && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num);
}

export function classifyPsychologyModuleSlugReconciliationPre(
  payload, installer, examTrainingState, fingerprint,
) {
  if (!completePayload(payload, requiredPreChecks)
      || !installer || typeof examTrainingState !== "string" || !fingerprint) {
    return { classification: "UNKNOWN" };
  }
  const exact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP"
    && payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && examTrainingState === "EXACT"
    && fingerprintExact(fingerprint)
    && requiredPreChecks.every((field) => payload.checks[field] === true)
    && payload.counts.checkins === 3
    && payload.counts.error_recovery === 1
    && payload.counts.post_match === 1
    && payload.counts.pre_match === 1
    && payload.counts.wellbeing === 0
    && payload.counts.exercise_sessions === 0;
  return { classification: exact ? "PASS" : "BLOCKER" };
}

export function classifyPsychologyModuleSlugReconciliationPost(
  payload, installer, examTrainingState, fingerprint, psychologyEntry,
) {
  if (!completePayload(payload, requiredPostChecks)
      || !Array.isArray(payload.columns) || payload.columns.length !== 3
      || !installer || typeof examTrainingState !== "string" || !fingerprint || !psychologyEntry) {
    return { classification: "UNKNOWN" };
  }
  const exact = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP"
    && payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && examTrainingState === "EXACT"
    && fingerprintExact(fingerprint)
    && psychologyEntry.classification === "PASS"
    && psychologyEntry.nextAllowedRemoteOperation === "310003_EXECUTION_REVIEW"
    && requiredPostChecks.every((field) => payload.checks[field] === true)
    && payload.counts.checkins === 3
    && payload.counts.null_module_slug === 0
    && payload.counts.gestion_error === 1
    && payload.counts.evaluacion_post_partido === 1
    && payload.counts.preparacion_mental_pre_partido === 1
    && payload.counts.wellbeing === 0
    && payload.counts.exercise_sessions === 0;
  return { classification: exact ? "EXACT" : "BLOCKER" };
}
