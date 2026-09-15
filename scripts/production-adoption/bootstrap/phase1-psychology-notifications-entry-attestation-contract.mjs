import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsonQuery } from "../../production-preflight/queries.mjs";
import { PHASE1_HISTORICAL_FINGERPRINT } from "./phase1-foundation-ddl-contract.mjs";

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_FORMAT =
  "REFLAB_PRODUCTION_PHASE1_PSYCHOLOGY_NOTIFICATIONS_ENTRY_ATTESTATION_V1";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID =
  "production_phase1_psychology_notifications_entry";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT =
  "supabase/migrations/202608310003_production_adoption_psychology_notifications_prerequisites.sql";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256 =
  "b50a6fa0982244e3332d18b5354e146ab4cc202752612cce4897d0e17b1cd04e";
export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_NEXT_REVIEW = "310003_EXECUTION_REVIEW";

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_ALLOWED_MODULES = Object.freeze([
  "gestion-error",
  "presion-competitiva",
  "concentracion-foco",
  "confianza-arbitral",
  "resiliencia",
  "preparacion-mental-pre-partido",
  "evaluacion-post-partido",
  "sin-clasificar",
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES = Object.freeze([
  "public.notification_events",
  "public.psychology_checkins",
  "public.psychology_wellbeing_assessments",
  "public.psychology_exercise_sessions",
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_COLUMNS = Object.freeze([
  Object.freeze({ table: "public.notification_events", column: "user_id", type: "text" }),
  Object.freeze({ table: "public.psychology_checkins", column: "module_slug", type: "text" }),
  Object.freeze({ table: "public.psychology_wellbeing_assessments", column: "module_slug", type: "text" }),
  Object.freeze({ table: "public.psychology_exercise_sessions", column: "module_slug", type: "text" }),
]);

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS = Object.freeze({
  tables: Object.freeze(["public.psychology_modules"]),
  columns: Object.freeze(["public.notification_events.deduplication_key"]),
  indexes: Object.freeze(["public.notification_events_deduplication_unique"]),
  constraints: Object.freeze([
    "public.psychology_modules_pkey",
    "public.psychology_modules_sort_order_check",
  ]),
  functions: Object.freeze([]),
  triggers: Object.freeze([]),
});

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_DDL_SCOPE = Object.freeze({
  createdTables: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.tables,
  addedColumns: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.columns,
  indexes: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.indexes,
  constraints: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.constraints,
  functions: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.functions,
  triggers: PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.triggers,
  rlsEnabledTables: Object.freeze(["public.psychology_modules"]),
  aclRevokedRoles: Object.freeze(["PUBLIC", "anon", "authenticated", "service_role", "reflab_rls_owner"]),
  deterministicCatalogRows: 8,
  historicalProductRowDml: 0,
  ledger: Object.freeze({ phaseKey: "psychology_notification_prerequisites", phaseOrder: 3 }),
});

export const PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS = Object.freeze([
  "requiredTablesExist",
  "requiredTablesOwnedByPostgres",
  "postgresCanCreatePublic",
  "requiredColumnTypesExact",
  "futureFkTypeCompatibilityExact",
  "targetTableAbsent",
  "targetColumnAbsent",
  "targetIndexAbsent",
  "targetConstraintsAbsent",
  "priorStateVisibilityExact",
  "dataVisibilityExact",
  "psychologyDataCompatible",
  "ledgerExact",
  "schemaStateEmpty",
  "canonicalMarkerAbsent",
  "identityLinksAbsent",
  "developmentObjectsAbsent",
  "laterPhaseInfrastructureAbsent",
]);

const examTrainingPostChecks = Object.freeze([
  "foundationStatePreserved", "targetTableExact", "targetTableColumnsExact",
  "targetPrimaryKeyExact", "targetTableEmpty", "targetAclExact", "targetColumnsExact",
  "targetColumnsNullable", "targetIndexesExact", "targetConstraintsExact",
  "targetCheckSemanticsExact", "targetFkSemanticsExact", "targetUniqueSemanticsExact",
  "ledgerExact", "schemaStateEmpty", "canonicalMarkerAbsent", "identityLinksAbsent",
  "developmentObjectsAbsent", "laterPhaseInfrastructureAbsent", "fabricatedAssociationsAbsent",
]);

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function valuesSql(rows) {
  return rows.map((row) => `(${row.map(sqlLiteral).join(",")})`).join(",\n      ");
}

const requiredTableValues = valuesSql(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES.map(
  (identity) => identity.split("."),
));
const requiredColumnValues = valuesSql(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_COLUMNS.map((entry) => {
  const [schema, table] = entry.table.split(".");
  return [schema, table, entry.column, entry.type];
}));
const allowedModuleSql = `array[${PHASE1_PSYCHOLOGY_NOTIFICATIONS_ALLOWED_MODULES.map(sqlLiteral).join(",")}]::text[]`;

export function assertPhase1PsychologyNotificationsArtifact(repositoryRoot) {
  const path = resolve(repositoryRoot, PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT);
  const sql = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(sql).digest("hex");
  if (sha256 !== PHASE1_PSYCHOLOGY_NOTIFICATIONS_SHA256) {
    throw new Error("Production Phase 1 Psychology/Notifications artifact hash mismatch.");
  }

  const createdTables = [...sql.matchAll(/\bcreate\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  const addedColumns = [...sql.matchAll(/\balter\s+table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+add\s+column\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => `${match[1]}.${match[2]}`.toLowerCase());
  const indexes = [...sql.matchAll(/\bcreate\s+(?:unique\s+)?index\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => `public.${match[1].toLowerCase()}`);
  const insertTargets = [...sql.matchAll(/\binsert\s+into\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase());
  if (JSON.stringify(createdTables) !== JSON.stringify(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.tables)
      || JSON.stringify(addedColumns) !== JSON.stringify(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.columns)
      || JSON.stringify(indexes) !== JSON.stringify(PHASE1_PSYCHOLOGY_NOTIFICATIONS_TARGETS.indexes)
      || JSON.stringify(insertTargets) !== JSON.stringify([
        "public.psychology_modules", "reflab_meta.production_adoption_state",
      ])
      || /\bcreate\s+(?:or\s+replace\s+)?function\b|\bcreate\s+trigger\b/i.test(sql)
      || /\b(?:update|delete\s+from|truncate)\s+(?:table\s+)?public\./i.test(sql)
      || /reflab_schema_state\s*\([^)]*\)\s*values|canonical_finalized/i.test(sql)) {
    throw new Error("Production Phase 1 Psychology/Notifications DDL scope drifted.");
  }
  return { path: PHASE1_PSYCHOLOGY_NOTIFICATIONS_ARTIFACT, sha256, sql };
}

export function classifyExamTrainingPreState(payload, fingerprint, visibilityExact = true) {
  const checks = payload?.checks;
  const counts = payload?.counts;
  const complete = Boolean(payload) && Boolean(checks) && Boolean(counts)
    && examTrainingPostChecks.every((field) => typeof checks[field] === "boolean")
    && Number.isInteger(payload.server_version_num)
    && typeof visibilityExact === "boolean"
    && Object.keys(PHASE1_HISTORICAL_FINGERPRINT).every((field) => Number.isInteger(fingerprint?.[field]));
  if (!complete) return "UNKNOWN";
  const rowDependentChecks = new Set([
    "targetTableEmpty", "ledgerExact", "schemaStateEmpty",
    "canonicalMarkerAbsent", "fabricatedAssociationsAbsent",
  ]);
  if (examTrainingPostChecks.some((field) => !rowDependentChecks.has(field) && checks[field] !== true)) {
    return "BLOCKER";
  }
  if (!visibilityExact) return "UNKNOWN";
  const exact = payload.transaction_read_only === "on"
    && Math.trunc(payload.server_version_num / 10000) === 17
    && examTrainingPostChecks.every((field) => checks[field] === true)
    && counts.target_columns === 6 && counts.target_indexes === 3 && counts.target_constraints === 20
    && counts.check_constraints === 13 && counts.foreign_keys === 5 && counts.unique_constraints === 2
    && counts.target_rows === 0 && counts.schema_state_rows === 0 && counts.ledger_rows === 2
    && Object.entries(PHASE1_HISTORICAL_FINGERPRINT).every(([field, expected]) => fingerprint[field] === expected);
  return exact ? "EXACT" : "BLOCKER";
}

export const phase1PsychologyNotificationsEntryQuery = jsonQuery(
  PHASE1_PSYCHOLOGY_NOTIFICATIONS_QUERY_ID,
  `(with required_tables(schema_name, table_name) as (
    values ${requiredTableValues}
  ), required_table_state as (
    select expected.*, relation.oid,
      pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT') as can_select,
      case when relation.oid is null then null else pg_catalog.row_security_active(relation.oid) end as rls_applies
    from required_tables expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
  ), required_columns(schema_name, table_name, column_name, expected_type) as (
    values ${requiredColumnValues}
  ), required_column_state as (
    select expected.*,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as observed_type
    from required_columns expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
    left join pg_catalog.pg_attribute attribute on attribute.attrelid = relation.oid
      and attribute.attname = expected.column_name and attribute.attnum > 0 and not attribute.attisdropped
  ), data_audit as (
    select
      (select pg_catalog.count(*) from public.psychology_checkins
        where module_slug is not null and not (module_slug::text = any (${allowedModuleSql})))
      + (select pg_catalog.count(*) from public.psychology_wellbeing_assessments
        where module_slug is not null and not (module_slug::text = any (${allowedModuleSql})))
      + (select pg_catalog.count(*) from public.psychology_exercise_sessions
        where module_slug is not null and not (module_slug::text = any (${allowedModuleSql})))
      as unsupported_module_slug_count
  ), prior_state_relations(schema_name, table_name) as (
    values
      ('public', 'attempts'),
      ('public', 'exam_results'),
      ('public', 'notification_events'),
      ('public', 'referee_exam_sessions'),
      ('reflab_meta', 'production_adoption_state'),
      ('reflab_meta', 'reflab_schema_state')
  ), prior_state_visibility as (
    select expected.*,
      relation.oid,
      pg_catalog.has_table_privilege(current_user, relation.oid, 'SELECT') as can_select,
      case when relation.oid is null then null else pg_catalog.row_security_active(relation.oid) end as rls_applies
    from prior_state_relations expected
    left join pg_catalog.pg_namespace namespace on namespace.nspname = expected.schema_name
    left join pg_catalog.pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = expected.table_name and relation.relkind in ('r', 'p')
  ), calculated as (
    select pg_catalog.json_build_object(
      'requiredTablesExist', (select pg_catalog.count(*) = ${PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES.length}
        and pg_catalog.bool_and(oid is not null) from required_table_state),
      'requiredTablesOwnedByPostgres', (select pg_catalog.count(*) = ${PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_TABLES.length}
        and pg_catalog.bool_and(owner_name = 'postgres') from required_table_state),
      'postgresCanCreatePublic', pg_catalog.has_schema_privilege('postgres', 'public', 'CREATE'),
      'requiredColumnTypesExact', (select pg_catalog.count(*) = ${PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_COLUMNS.length}
        and pg_catalog.bool_and(observed_type = expected_type) from required_column_state),
      'futureFkTypeCompatibilityExact', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(observed_type = 'text') from required_column_state
        where table_name like 'psychology_%' and column_name = 'module_slug'),
      'targetTableAbsent', pg_catalog.to_regclass('public.psychology_modules') is null,
      'targetColumnAbsent', not exists (
        select 1 from pg_catalog.pg_attribute attribute
        where attribute.attrelid = pg_catalog.to_regclass('public.notification_events')
          and attribute.attname = 'deduplication_key'
          and attribute.attnum > 0 and not attribute.attisdropped
      ),
      'targetIndexAbsent', pg_catalog.to_regclass('public.notification_events_deduplication_unique') is null,
      'targetConstraintsAbsent', not exists (
        select 1 from pg_catalog.pg_constraint constraint_record
        join pg_catalog.pg_class relation on relation.oid = constraint_record.conrelid
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and constraint_record.conname in ('psychology_modules_pkey', 'psychology_modules_sort_order_check')
      ) and pg_catalog.to_regclass('public.psychology_modules_pkey') is null,
      'priorStateVisibilityExact', (select pg_catalog.count(*) = 6
        and pg_catalog.bool_and(oid is not null and can_select and not rls_applies)
        from prior_state_visibility),
      'dataVisibilityExact', (select pg_catalog.count(*) = 3
        and pg_catalog.bool_and(can_select and not rls_applies) from required_table_state
        where table_name like 'psychology_%'),
      'psychologyDataCompatible', (select unsupported_module_slug_count = 0 from data_audit),
      'ledgerExact', (select pg_catalog.count(*) = 2
        and pg_catalog.count(*) filter (where phase_order = 1 and phase_key = 'foundation'
          and previous_phase_key is null) = 1
        and pg_catalog.count(*) filter (where phase_order = 2 and phase_key = 'exam_training_prerequisites'
          and previous_phase_key = 'foundation') = 1
        and pg_catalog.bool_and(plan_version = 'production_adoption_bridge_v1'
          and plan_hash = 'ed99907e9c116da69a3be03a6c8fb1d1781aa622f92fb73c785f073b62d1ed0f'
          and evidence_hash = '07a8f7875ecf326af3a68dfe997d0711cdb0808e9f117e4059f059f12e2e2a9d')
        from reflab_meta.production_adoption_state),
      'schemaStateEmpty', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'canonicalMarkerAbsent', (select pg_catalog.count(*) = 0 from reflab_meta.reflab_schema_state),
      'identityLinksAbsent', pg_catalog.to_regclass('reflab_private.user_identity_links') is null,
      'developmentObjectsAbsent', not exists (
        select 1 from pg_catalog.pg_proc procedure_record
        join pg_catalog.pg_namespace namespace on namespace.oid = procedure_record.pronamespace
        where namespace.nspname = 'public' and procedure_record.proname in (
          'resolve_development_clerk_identity', 'link_development_clerk_identity',
          'link_development_super_admin_clerk_identity'
        )
      ),
      'laterPhaseInfrastructureAbsent', not exists (
        select 1 from pg_catalog.pg_namespace where nspname = 'reflab_audit'
      ) and not exists (
        select 1 from pg_catalog.pg_roles where rolname = 'reflab_preflight_audit_owner'
      ) and not exists (
        select 1 from reflab_meta.production_adoption_state where phase_order >= 3
      )
    ) as checks
  ) select pg_catalog.json_build_object(
    'caller', current_user,
    'session_user', session_user,
    'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
    'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
    'checks', calculated.checks,
    'evidence', pg_catalog.json_build_object(
      'required_table_count', (select pg_catalog.count(*) from required_table_state where oid is not null),
      'required_column_count', (select pg_catalog.count(*) from required_column_state where observed_type is not null),
      'unsupported_module_slug_count', (select unsupported_module_slug_count from data_audit)
    )
  ) from calculated)`,
);

export function classifyPhase1PsychologyNotificationsEntry(payload, installer, examTrainingState) {
  const checks = payload?.checks;
  const complete = Boolean(payload) && Boolean(checks)
    && typeof payload.caller === "string" && typeof payload.session_user === "string"
    && typeof payload.transaction_read_only === "string" && Number.isInteger(payload.server_version_num)
    && PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.every(
      (field) => typeof checks[field] === "boolean",
    )
    && typeof installer?.managedProfile === "string" && typeof installer?.lifecycleState === "string"
    && ["EXACT", "BLOCKER", "UNKNOWN"].includes(examTrainingState);
  if (!complete) {
    return { classification: "UNKNOWN", nextAllowedRemoteOperation: "NONE" };
  }
  const callerExact = payload.caller === "reflab_prod_preflight_ro"
    && payload.session_user === "reflab_prod_preflight_ro";
  const readOnlyExact = payload.transaction_read_only === "on";
  const postgresMajorExact = Math.trunc(payload.server_version_num / 10000) === 17;
  const installerReady = installer.managedProfile === "READY"
    && installer.lifecycleState === "POST_BOOTSTRAP";
  const catalogExact = PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.every(
    (field) => checks[field] === true,
  );
  const examTrainingExact = examTrainingState === "EXACT";
  const structuralFields = PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.filter((field) => ![
    "priorStateVisibilityExact", "dataVisibilityExact", "psychologyDataCompatible",
    "ledgerExact", "schemaStateEmpty", "canonicalMarkerAbsent",
  ].includes(field));
  const structuralBlocker = structuralFields.some((field) => checks[field] !== true);
  const visibleDataBlocker = checks.dataVisibilityExact && !checks.psychologyDataCompatible;
  if (!callerExact || !readOnlyExact || !postgresMajorExact || !installerReady
      || examTrainingState === "BLOCKER" || structuralBlocker || visibleDataBlocker) {
    return {
      classification: "BLOCKER",
      nextAllowedRemoteOperation: "NONE",
      callerExact,
      readOnlyExact,
      postgresMajorExact,
      installerReady,
      examTrainingExact,
      catalogExact,
      checks: Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
        (field) => [field, checks[field]],
      )),
    };
  }
  if (examTrainingState === "UNKNOWN"
      || !checks.priorStateVisibilityExact || !checks.dataVisibilityExact) {
    return {
      classification: "UNKNOWN",
      nextAllowedRemoteOperation: "NONE",
      callerExact,
      readOnlyExact,
      postgresMajorExact,
      installerReady,
      examTrainingExact,
      catalogExact,
      checks: Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
        (field) => [field, checks[field]],
      )),
    };
  }
  const pass = callerExact && readOnlyExact && postgresMajorExact && installerReady
    && catalogExact && examTrainingExact;
  return {
    classification: pass ? "PASS" : "BLOCKER",
    nextAllowedRemoteOperation: pass ? PHASE1_PSYCHOLOGY_NOTIFICATIONS_NEXT_REVIEW : "NONE",
    callerExact,
    readOnlyExact,
    postgresMajorExact,
    installerReady,
    examTrainingExact,
    catalogExact,
    checks: Object.fromEntries(PHASE1_PSYCHOLOGY_NOTIFICATIONS_REQUIRED_CHECKS.map(
      (field) => [field, checks[field]],
    )),
  };
}
