const CANONICAL_COLUMN_PROVIDER = "202607270000_reflab_canonical_baseline.sql";

const relation = (table, columns, usageType, requiredForCreate) => Object.freeze({
  table,
  columns: Object.freeze(columns),
  usageType,
  canonicalProvider: CANONICAL_COLUMN_PROVIDER,
  requiredForCreate,
  requiredForExecution: true,
});

export const PHASE4B_WAVE1_FIXTURE_COLUMN_USAGE = Object.freeze({
  "reflab_private.can_access_user_data(text, uuid, text)": Object.freeze([
    relation("public.institution_memberships", ["institution_id", "user_id", "status"], "query_column", true),
  ]),
  "reflab_private.has_active_institution_membership(uuid)": Object.freeze([
    relation("public.institution_memberships", ["institution_id", "user_id", "status"], "query_column", true),
    relation("public.institutions", ["id", "deleted_at", "status"], "query_column", true),
    relation("public.institution_subscriptions", ["institution_id", "status", "starts_at", "ends_at"], "query_column", true),
  ]),
  "reflab_private.has_institution_permission(uuid, text)": Object.freeze([
    relation("public.institution_memberships", ["id", "institution_id", "user_id", "status"], "query_column", true),
    relation("public.institution_permissions", ["id", "permission_key"], "query_column", true),
    relation("public.institution_membership_permission_overrides", ["allowed", "membership_id", "permission_id", "institution_id"], "query_column", true),
    relation("public.institution_membership_roles", ["membership_id", "institution_id", "role_id"], "query_column", true),
    relation("public.institution_roles", ["id", "institution_id"], "query_column", true),
    relation("public.institution_role_permissions", ["role_id", "permission_id"], "query_column", true),
  ]),
  "reflab_private.protect_referee_exam_session()": Object.freeze([
    relation("public.referee_exam_sessions", [
      "user_id", "submission_id", "context_type", "sport_type", "activity_type", "season",
      "source_version", "institution_id", "institution_group_id", "institution_assessment_session_id",
      "item_manifest", "manifest_hash", "item_count", "created_at", "started_at", "expires_at",
      "status", "submitted_at",
    ], "trigger_row_field", false),
  ]),
  "reflab_private.set_updated_at()": Object.freeze([]),
  "reflab_private.validate_assessment_session_assignment()": Object.freeze([
    relation("public.institution_assessment_assignments", ["id", "institution_id", "assessment_id", "user_id", "group_id"], "rowtype_and_query_column", false),
    relation("public.institution_memberships", ["id", "institution_id", "user_id", "status"], "query_column", false),
    relation("public.institution_group_memberships", ["membership_id", "institution_id", "status", "group_id"], "query_column", false),
  ]),
  "reflab_private.validate_attempt_exam_context()": Object.freeze([
    relation("public.exam_results", ["id", "user_id", "submission_id", "sport_type", "institution_id", "institution_group_id", "institution_assessment_session_id"], "rowtype_and_query_column", false),
  ]),
  "reflab_private.validate_exam_result_context()": Object.freeze([
    relation("public.referee_exam_sessions", ["id", "user_id", "submission_id", "sport_type", "activity_type", "institution_id", "institution_group_id", "institution_assessment_session_id"], "rowtype_and_query_column", false),
  ]),
  "reflab_private.validate_institution_data_consent()": Object.freeze([
    relation("public.institution_memberships", ["id", "institution_id", "user_id"], "query_column", false),
  ]),
  "reflab_private.validate_institution_role_scope()": Object.freeze([
    relation("public.institution_roles", ["id", "institution_id"], "query_column", false),
    relation("public.institution_memberships", ["id", "institution_id"], "query_column", false),
  ]),
  "reflab_private.validate_institution_user_target()": Object.freeze([
    relation("public.institution_memberships", ["institution_id", "user_id", "status"], "query_column", false),
  ]),
  "reflab_private.validate_owned_appointment()": Object.freeze([
    relation("public.appointments", ["id", "user_id", "sport_type"], "query_column", false),
  ]),
  "reflab_private.validate_performance_checkin_owner()": Object.freeze([
    relation("public.performance_checkins", ["id", "user_id"], "query_column", false),
  ]),
  "reflab_private.validate_referee_exam_manifest()": Object.freeze([
    relation("public.clips", ["id", "sport_type", "is_active", "status"], "query_column", false),
    relation("public.institutional_clips", ["id", "sport_type", "status", "is_public", "institution_id"], "query_column", false),
  ]),
  "reflab_private.validate_referee_exam_session_context()": Object.freeze([
    relation("public.institution_assessment_sessions", ["id", "assessment_id", "institution_id", "user_id", "group_id"], "query_column", false),
    relation("public.institution_assessments", ["id", "institution_id", "sport_type"], "query_column", false),
  ]),
  "reflab_private.validate_user_appointment_context()": Object.freeze([
    relation("public.appointments", ["id", "user_id", "fixture_id", "sport_type"], "query_column", false),
  ]),
});

function readBalanced(source, openingIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (quote === "'") {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`Unbalanced canonical table definition at byte ${openingIndex}.`);
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (quote === "'") {
      if (character === "'" && next === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (character === '"' && next === '"') index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

export function canonicalColumnDefinitions(source, table) {
  const pattern = new RegExp(`create table\\s+${table.replaceAll(".", "\\.")}\\s*\\(`, "i");
  const match = pattern.exec(source);
  if (!match) throw new Error(`Canonical fixture relation is missing: ${table}`);
  const openingIndex = source.indexOf("(", match.index);
  const closingIndex = readBalanced(source, openingIndex);
  return new Map(splitTopLevel(source.slice(openingIndex + 1, closingIndex)).flatMap((definition) => {
    const normalizedDefinition = definition.replace(/--[^\r\n]*(?:\r?\n|$)/g, "").trim();
    const column = normalizedDefinition.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1];
    if (!column || ["constraint", "primary", "foreign", "unique", "check"].includes(column.toLowerCase())) return [];
    return [[column, normalizedDefinition.replace(/\s+/g, " ").trim()]];
  }));
}

export function canonicalColumnTypeDefinitions(source, table) {
  return new Map([...canonicalColumnDefinitions(source, table)].map(([column, definition]) => {
    const remainder = definition.slice(column.length).trim();
    const type = remainder.match(/^(.+?)(?=\s+(?:not\s+null|default|primary\s+key|unique|references|check|generated)\b|$)/i)?.[1]?.trim();
    if (!type) throw new Error(`Canonical fixture column type is ambiguous: ${table}.${column}`);
    return [column, `${column} ${type}`];
  }));
}

export function buildWave1FixtureDependencyContract(canonicalSql) {
  const combined = new Map();
  for (const [helperSignature, relations] of Object.entries(PHASE4B_WAVE1_FIXTURE_COLUMN_USAGE)) {
    for (const usage of relations) {
      const definitions = canonicalColumnDefinitions(canonicalSql, usage.table);
      for (const column of usage.columns) {
        const definition = definitions.get(column);
        if (!definition) throw new Error(`Canonical fixture column is missing: ${usage.table}.${column}`);
        const identity = `${usage.table}.${column}`;
        const current = combined.get(identity) ?? {
          identity,
          table: usage.table,
          column,
          definition,
          canonicalProvider: usage.canonicalProvider,
          requiredForCreate: false,
          requiredForExecution: false,
          usages: [],
        };
        if (current.definition !== definition) throw new Error(`Conflicting canonical fixture column: ${identity}`);
        current.requiredForCreate ||= usage.requiredForCreate;
        current.requiredForExecution ||= usage.requiredForExecution;
        current.usages.push(Object.freeze({ helperSignature, usageType: usage.usageType }));
        combined.set(identity, current);
      }
    }
  }
  return Object.freeze([...combined.values()]
    .map((entry) => Object.freeze({ ...entry, usages: Object.freeze(entry.usages) }))
    .sort((left, right) => left.identity.localeCompare(right.identity)));
}

export function buildWave1FixtureDependencySql(canonicalSql) {
  const contract = buildWave1FixtureDependencyContract(canonicalSql);
  return `begin;
set local search_path = public, extensions, pg_catalog;
${contract.map((entry) => `alter table ${entry.table} add column if not exists ${entry.definition};`).join("\n")}
commit;`;
}

export function wave1FixtureMissingColumnsSql(canonicalSql) {
  const identities = buildWave1FixtureDependencyContract(canonicalSql).map((entry) => `'${entry.identity}'`).join(",");
  return `select coalesce(pg_catalog.jsonb_agg(expected.identity order by expected.identity), '[]'::jsonb)::text
from unnest(array[${identities}]::text[]) expected(identity)
where not exists (
  select 1
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = pg_catalog.to_regclass(
    pg_catalog.split_part(expected.identity, '.', 1) || '.' || pg_catalog.split_part(expected.identity, '.', 2)
  )
    and attribute.attname = pg_catalog.split_part(expected.identity, '.', 3)
    and attribute.attnum > 0
    and not attribute.attisdropped
);`;
}
