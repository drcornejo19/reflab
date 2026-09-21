import { jsonQuery } from "../../production-preflight/queries.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";
import {
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE,
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256,
  assertPhase1PsychologyNotificationsArtifact,
} from "./phase1-psychology-notifications-entry-attestation-contract.mjs";

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_FORMAT =
  "REFLAB_PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_PREREQUISITES_V1";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPERATION =
  "--production-phase1-psychology-notifications-prerequisites";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_OPT_IN =
  "ALLOW_PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_PREREQUISITES";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SHA256 =
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256;
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID =
  "phase1_psychology_notifications_post_attestation";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID =
  "phase1_psychology_notifications_mutation_fingerprint";

export const PHASE1_PSYCHOLOGY_MODULE_ROWS = Object.freeze([
  Object.freeze(["gestion-error", "Gestion del error", "Recovery and learning after an error.", true, 10]),
  Object.freeze(["presion-competitiva", "Presion competitiva", "Decision-making under competitive pressure.", true, 20]),
  Object.freeze(["concentracion-foco", "Concentracion y foco", "Attention reset and concentration routines.", true, 30]),
  Object.freeze(["confianza-arbitral", "Confianza arbitral", "Constructive self-talk and confidence.", true, 40]),
  Object.freeze(["resiliencia", "Resiliencia", "Wellbeing, recovery and sustained motivation.", true, 50]),
  Object.freeze(["preparacion-mental-pre-partido", "Preparacion mental pre partido", "Pre-match mental preparation.", true, 60]),
  Object.freeze(["evaluacion-post-partido", "Evaluacion post partido", "Post-match reflection and emotional closure.", true, 70]),
  Object.freeze(["sin-clasificar", "Sin clasificar", "Explicit temporary category for reviewed legacy content.", false, 999]),
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATIONS = Object.freeze({
  catalogInserts: 8,
  ledgerInserts: 1,
  historicalProductUpdates: 0,
  historicalProductDeletes: 0,
  notificationBackfills: 0,
  psychologyHistoricalUpdates: 0,
});

const requiredPostChecks = Object.freeze([
  "psychologyModulesTableExact",
  "psychologyModulesColumnsExact",
  "psychologyModulesPrimaryKeyExact",
  "psychologyModulesCheckExact",
  "psychologyModulesIndexesExact",
  "psychologyModulesRlsExact",
  "psychologyModulesAclExact",
  "psychologyModulesPoliciesExact",
  "psychologyCatalogExact",
  "notificationColumnExact",
  "notificationIndexExact",
  "notificationRowsPreserved",
  "psychologyReconciliationExact",
  "examTrainingStatePreserved",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
  "phase310004Absent",
]);

const preservedExamTrainingChecks = Object.freeze([
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
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
  "fabricatedAssociationsAbsent",
]);

function sqlLiteral(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const expectedCatalogValues = PHASE1_PSYCHOLOGY_MODULE_ROWS
  .map((row) => `(${row.map(sqlLiteral).join(",")})`).join(",\n      ");

export function assertPhase1PsychologyNotificationsDdlArtifact(repositoryRoot) {
  const artifact = assertPhase1PsychologyNotificationsArtifact(repositoryRoot);
  const { sql } = artifact;
  if (!/^\s*--[\s\S]*?\bbegin\s*;/i.test(sql)
      || !/\bcommit\s*;\s*$/i.test(sql)
      || !/set\s+local\s+lock_timeout\s*=\s*'5s'/i.test(sql)
      || !/set\s+local\s+statement_timeout\s*=\s*'60s'/i.test(sql)
      || !/create\s+unique\s+index\s+notification_events_deduplication_unique\s+on\s+public\.notification_events\s*\(\s*user_id\s*,\s*deduplication_key\s*\)\s*where\s+deduplication_key\s+is\s+not\s+null/i.test(sql)
      || /\b(?:update|delete\s+from|truncate)\s+public\./i.test(sql)) {
    throw new Error("Production 310003 transaction or mutation scope drifted.");
  }
  for (const [slug, name, description, active, sortOrder] of PHASE1_PSYCHOLOGY_MODULE_ROWS) {
    const tuple = `(${sqlLiteral(slug)}, ${sqlLiteral(name)}, ${sqlLiteral(description)}, ${active}, ${sortOrder})`;
    if (!sql.includes(tuple)) throw new Error("Production 310003 catalog rows drifted.");
  }
  return artifact;
}

export const phase1PsychologyNotificationsMutationFingerprintQuery = jsonQuery(
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_MUTATION_FINGERPRINT_QUERY_ID,
  `pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'default_transaction_read_only', pg_catalog.current_setting('default_transaction_read_only'),
    'notification_count', (select pg_catalog.count(*) from public.notification_events),
    'notification_rows_hash', (select pg_catalog.md5(coalesce(
      pg_catalog.string_agg(pg_catalog.md5((pg_catalog.to_jsonb(event_record) - 'deduplication_key')::text), ',' order by event_record.id::text), ''
    )) from public.notification_events event_record)
  )`,
);

export const phase1PsychologyNotificationsPostQuery = jsonQuery(
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_QUERY_ID,
  `(with expected_columns(column_name, ordinal, expected_type, expected_not_null, expected_default) as (
    values
      ('slug',1,'text',true,null::text),
      ('name',2,'text',true,null::text),
      ('description',3,'text',false,null::text),
      ('is_active',4,'boolean',true,'true'),
      ('sort_order',5,'integer',true,null::text),
      ('created_at',6,'timestamp with time zone',true,'now()'),
      ('updated_at',7,'timestamp with time zone',true,'now()')
  ), target as (
    select relation.* from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'psychology_modules'
  ), observed_columns as (
    select expected.*, attribute.attname,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) observed_type,
      attribute.attnotnull observed_not_null,
      attribute.attidentity observed_identity,
      attribute.attgenerated observed_generated,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) observed_default
    from expected_columns expected
    left join target on true
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = target.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
  ), expected_catalog(slug,name,description,is_active,sort_order) as (
    values ${expectedCatalogValues}
  ), notification_column as (
    select attribute.*, pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) observed_type,
      pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid, false) observed_default
    from pg_catalog.pg_attribute attribute
    left join pg_catalog.pg_attrdef default_record
      on default_record.adrelid = attribute.attrelid and default_record.adnum = attribute.attnum
    where attribute.attrelid = 'public.notification_events'::pg_catalog.regclass
      and attribute.attname = 'deduplication_key' and attribute.attnum > 0 and not attribute.attisdropped
  ), dedup_index as (
    select index_relation.oid, method.amname, index_record.indisunique, index_record.indisvalid,
      index_record.indisready, index_record.indislive, index_record.indnkeyatts, index_record.indnatts,
      pg_catalog.pg_get_expr(index_record.indpred, index_record.indrelid, false) predicate,
      (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
       from pg_catalog.unnest(index_record.indkey::smallint[]) with ordinality key(attnum, ordinality)
       join pg_catalog.pg_attribute attribute on attribute.attrelid = index_record.indrelid
         and attribute.attnum = key.attnum) key_columns,
      (select pg_catalog.array_agg(opclass.opcname order by key.ordinality)
       from pg_catalog.unnest(index_record.indclass::oid[]) with ordinality key(opclass_oid, ordinality)
       join pg_catalog.pg_opclass opclass on opclass.oid = key.opclass_oid) opclasses,
      (select pg_catalog.array_agg(option_value order by option_position)
       from pg_catalog.unnest(index_record.indoption::smallint[])
         with ordinality option_entry(option_value, option_position)) key_options
    from pg_catalog.pg_class index_relation
    join pg_catalog.pg_namespace namespace on namespace.oid = index_relation.relnamespace
    join pg_catalog.pg_index index_record on index_record.indexrelid = index_relation.oid
    join pg_catalog.pg_am method on method.oid = index_relation.relam
    where namespace.nspname = 'public'
      and index_relation.relname = 'notification_events_deduplication_unique'
  ), calculated as (
    select pg_catalog.json_build_object(
      'psychologyModulesTableExact', exists (select 1 from target where relkind = 'r'
        and relrowsecurity and not relforcerowsecurity
        and pg_catalog.pg_get_userbyid(relowner) = 'postgres'),
      'psychologyModulesColumnsExact', (select pg_catalog.count(*) = 7 and pg_catalog.bool_and(
        attname is not null and ordinal = (select attribute.attnum from pg_catalog.pg_attribute attribute
          where attribute.attrelid = (select oid from target) and attribute.attname = column_name)
        and observed_type = expected_type and observed_not_null = expected_not_null
        and coalesce(observed_default, '<null>') = coalesce(expected_default, '<null>')
        and observed_identity = ''::"char" and observed_generated = ''::"char"
      ) from observed_columns)
        and (select pg_catalog.count(*) = 7 from pg_catalog.pg_attribute attribute
          where attribute.attrelid = (select oid from target)
            and attribute.attnum > 0 and not attribute.attisdropped),
      'psychologyModulesPrimaryKeyExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        constraint_record.conname = 'psychology_modules_pkey' and constraint_record.convalidated
        and not constraint_record.condeferrable and not constraint_record.condeferred
        and (select pg_catalog.array_agg(attribute.attname order by key.ordinality)
          from pg_catalog.unnest(constraint_record.conkey) with ordinality key(attnum, ordinality)
          join pg_catalog.pg_attribute attribute on attribute.attrelid = constraint_record.conrelid
            and attribute.attnum = key.attnum) = array['slug']::name[]
      ) from pg_catalog.pg_constraint constraint_record
        where constraint_record.conrelid = (select oid from target) and constraint_record.contype = 'p'),
      'psychologyModulesCheckExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        constraint_record.conname = 'psychology_modules_sort_order_check'
        and constraint_record.convalidated and not constraint_record.connoinherit
        and pg_catalog.regexp_replace(pg_catalog.pg_get_expr(constraint_record.conbin, constraint_record.conrelid, false), '\\s+', '', 'g') = '(sort_order>=0)'
      ) from pg_catalog.pg_constraint constraint_record
        where constraint_record.conrelid = (select oid from target) and constraint_record.contype = 'c'),
      'psychologyModulesIndexesExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        index_record.indisprimary and index_record.indisunique and index_record.indisvalid
        and index_record.indisready and index_record.indislive and method.amname = 'btree'
        and index_record.indnkeyatts = 1 and index_record.indnatts = 1
      ) from pg_catalog.pg_index index_record
        join pg_catalog.pg_class index_relation on index_relation.oid = index_record.indexrelid
        join pg_catalog.pg_am method on method.oid = index_relation.relam
        where index_record.indrelid = (select oid from target)),
      'psychologyModulesRlsExact', exists (select 1 from target where relrowsecurity and not relforcerowsecurity),
      'psychologyModulesAclExact', (select pg_catalog.count(*) = 8
        and pg_catalog.count(distinct acl.privilege_type) = 8
        and pg_catalog.bool_and(acl.grantee = target.relowner and acl.grantor = target.relowner
          and not acl.is_grantable and acl.privilege_type = any (array[
            'DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'
          ]::text[]))
        from target cross join lateral pg_catalog.aclexplode(target.relacl) acl),
      'psychologyModulesPoliciesExact', not exists (select 1 from pg_catalog.pg_policy policy
        where policy.polrelid = (select oid from target)),
      'psychologyCatalogExact', (select pg_catalog.count(*) = 8 from public.psychology_modules)
        and not exists (select * from expected_catalog except select slug,name,description,is_active,sort_order from public.psychology_modules)
        and not exists (select slug,name,description,is_active,sort_order from public.psychology_modules except select * from expected_catalog),
      'notificationColumnExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        observed_type = 'text' and not attnotnull and observed_default is null
        and attidentity = ''::"char" and attgenerated = ''::"char"
      ) from notification_column),
      'notificationIndexExact', (select pg_catalog.count(*) = 1 and pg_catalog.bool_and(
        amname = 'btree' and indisunique and indisvalid and indisready and indislive
        and indnkeyatts = 2 and indnatts = 2
        and key_columns = array['user_id','deduplication_key']::name[]
        and opclasses = array['text_ops','text_ops']::name[]
        and key_options = array[0,0]::smallint[]
        and pg_catalog.regexp_replace(predicate, '\\s+', '', 'g') = '(deduplication_keyISNOTNULL)'
      ) from dedup_index),
      'notificationRowsPreserved', (select pg_catalog.count(*) = 60 from public.notification_events)
        and not exists (select 1 from public.notification_events where deduplication_key is not null),
      'psychologyReconciliationExact',
        (select pg_catalog.count(*) = 3 from public.psychology_checkins)
        and (select pg_catalog.count(*) = 0 from public.psychology_checkins where module_slug is null)
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'error_recovery' and module_slug = 'gestion-error')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'post_match' and module_slug = 'evaluacion-post-partido')
        and (select pg_catalog.count(*) = 1 from public.psychology_checkins where checkin_type = 'pre_match' and module_slug = 'preparacion-mental-pre-partido')
        and (select pg_catalog.count(*) = 0 from public.psychology_wellbeing_assessments)
        and (select pg_catalog.count(*) = 0 from public.psychology_exercise_sessions),
      'examTrainingStatePreserved', true,
      'ledgerExact', (select pg_catalog.count(*) = 3
        and pg_catalog.count(*) filter (where phase_order = 1 and phase_key = 'foundation' and previous_phase_key is null) = 1
        and pg_catalog.count(*) filter (where phase_order = 2 and phase_key = 'exam_training_prerequisites' and previous_phase_key = 'foundation') = 1
        and pg_catalog.count(*) filter (where phase_order = 3 and phase_key = 'psychology_notification_prerequisites' and previous_phase_key = 'exam_training_prerequisites') = 1
        and pg_catalog.bool_and(plan_version = 'production_adoption_bridge_v1'
          and plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
          and evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d')
        from reflab_meta.production_adoption_state),
      'schemaStateEmpty', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'identityLinksAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'developmentObjectsAbsent', pg_catalog.to_regprocedure('public.resolve_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_clerk_identity(text)') is null
        and pg_catalog.to_regprocedure('public.link_development_super_admin_clerk_identity(text)') is null,
      'phase310004Absent', pg_catalog.to_regnamespace('reflab_audit') is null
        and pg_catalog.to_regrole('reflab_preflight_audit_owner') is null
        and pg_catalog.to_regprocedure('reflab_audit.production_semantic_snapshot()') is null
        and not exists (select 1 from reflab_meta.production_adoption_state where phase_order >= 4)
    ) checks
  ) select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', (select checks from calculated),
    'counts', pg_catalog.json_build_object(
      'catalog_rows', (select pg_catalog.count(*) from public.psychology_modules),
      'notification_events', (select pg_catalog.count(*) from public.notification_events),
      'notification_backfills', (select pg_catalog.count(*) from public.notification_events where deduplication_key is not null),
      'checkins', (select pg_catalog.count(*) from public.psychology_checkins),
      'wellbeing', (select pg_catalog.count(*) from public.psychology_wellbeing_assessments),
      'exercise_sessions', (select pg_catalog.count(*) from public.psychology_exercise_sessions),
      'ledger_rows', (select pg_catalog.count(*) from reflab_meta.production_adoption_state)
    ),
    'structural_diagnostics', pg_catalog.json_build_object(
      'acl_entries', (select pg_catalog.count(*) from target
        cross join lateral pg_catalog.aclexplode(target.relacl) acl),
      'index_key_columns', (select key_columns from dedup_index),
      'index_opclasses', (select opclasses from dedup_index),
      'index_key_options', (select key_options from dedup_index),
      'index_predicate', (select predicate from dedup_index)
    )
  ))`,
);

export function classifyExamTrainingAfter310003(payload, options = {}) {
  if (!payload?.checks || !payload?.counts) return "UNKNOWN";
  if (preservedExamTrainingChecks.some((field) => typeof payload.checks[field] !== "boolean")) {
    return "UNKNOWN";
  }
  const expectedTargetAclExact = options.expectedTargetAclExact ?? true;
  const preservedChecksExact = preservedExamTrainingChecks.every((field) => field === "targetAclExact"
    ? payload.checks[field] === expectedTargetAclExact
    : payload.checks[field] === true);
  const exact = preservedChecksExact
    && payload.checks.ledgerExact === false
    && payload.checks.laterPhaseInfrastructureAbsent === false
    && payload.counts.target_columns === 6
    && payload.counts.target_indexes === 3
    && payload.counts.target_constraints === 20
    && payload.counts.check_constraints === 13
    && payload.counts.foreign_keys === 5
    && payload.counts.unique_constraints === 2
    && payload.counts.target_rows === 0
    && payload.counts.schema_state_rows === 0
    && payload.counts.ledger_rows === 3;
  return exact ? "EXACT" : "BLOCKER";
}

export function classifyPhase1PsychologyNotificationsPost(
  payload,
  installer,
  beforeFingerprint,
  afterFingerprint,
  beforeMutationFingerprint,
  afterMutationFingerprint,
  examTrainingAfter310003,
  options = {},
) {
  const complete = payload?.checks && payload?.counts
    && requiredPostChecks.every((field) => typeof payload.checks[field] === "boolean")
    && typeof payload.caller === "string" && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string"
    && Number.isInteger(payload.server_version_num)
    && beforeFingerprint && afterFingerprint
    && beforeMutationFingerprint && afterMutationFingerprint;
  if (!complete) return { classification: "UNKNOWN", postState: "UNKNOWN" };

  const historicalFingerprintExact = Object.entries(PHASE1_HISTORICAL_FINGERPRINT).every(
    ([field, expected]) => beforeFingerprint[field] === expected && afterFingerprint[field] === expected,
  );
  const notificationRowsUnchanged = beforeMutationFingerprint.notification_count === 60
    && afterMutationFingerprint.notification_count === 60
    && beforeMutationFingerprint.notification_rows_hash === afterMutationFingerprint.notification_rows_hash;
  const expectedPhase310004Absent = options.expectedPhase310004Absent ?? true;
  const postChecksExact = requiredPostChecks.every((field) => field === "phase310004Absent"
    ? payload.checks[field] === expectedPhase310004Absent
    : payload.checks[field] === true);
  const exact = installer?.managedProfile === "READY"
    && installer?.lifecycleState === "POST_BOOTSTRAP"
    && payload.caller === "postgres" && payload.session_user === "postgres"
    && payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && historicalFingerprintExact && notificationRowsUnchanged
    && examTrainingAfter310003 === "EXACT"
    && postChecksExact
    && payload.counts.catalog_rows === 8
    && payload.counts.notification_events === 60
    && payload.counts.notification_backfills === 0
    && payload.counts.checkins === 3
    && payload.counts.wellbeing === 0
    && payload.counts.exercise_sessions === 0
    && payload.counts.ledger_rows === 3;
  return {
    classification: exact ? "EXACT" : "BLOCKER",
    postState: exact ? "EXACT" : "BLOCKER",
    notificationRowsUnchanged,
    historicalFingerprintExact,
    examTrainingAfter310003,
  };
}

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_POST_CHECKS = requiredPostChecks;
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_FIXED_QUERY_COUNT = 8;
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_SCOPE = PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE;
