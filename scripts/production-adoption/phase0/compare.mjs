import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import {
  canonicalObjectManifest,
  criticalColumns,
  migrationManifest,
} from "../../production-preflight/manifest.mjs";
import {
  expectedTriggerDefinition,
  expressionHash,
  indexDefinitionParts,
  normalizeTriggerDefinition,
} from "../../production-preflight/canonical-contracts.mjs";
import { canonicalize } from "./fingerprint.mjs";

export const OBJECT_STATES = Object.freeze([
  "EXACT", "DRIFTED", "ABSENT", "LEGACY_EXTRA", "AMBIGUOUS",
]);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const baselineManifest = JSON.parse(
  readFileSync(resolve(root, "supabase", "baseline", "manifest.json"), "utf8")
);
const knownLegacyTables = new Set([
  ...(baselineManifest.production_tables_compatibility ?? []),
  ...(baselineManifest.production_tables_excluded ?? []),
].map((name) => `public.${name}`));
const knownLegacyBuckets = new Set(["institutional-videos"]);
const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const keyBy = (rows, key) => new Map((rows ?? []).map((row) => [key(row), row]));

function classifyExpected({ kind, key, expected, actual, visibility, compare }) {
  if (!actual) {
    return { kind, key, state: visibility === "CONFIRMED" ? "ABSENT" : "AMBIGUOUS", expected };
  }
  const exact = compare(expected, actual);
  return { kind, key, state: exact ? "EXACT" : "DRIFTED", expected, actual };
}

function appendActualExtras(results, actual, actualKey, kind, classifyExtra = () => "AMBIGUOUS") {
  const expectedKeys = new Set(results.map((entry) => entry.key));
  for (const entry of actual ?? []) {
    const key = actualKey(entry);
    if (!expectedKeys.has(key)) results.push({ kind, key, state: classifyExtra(key), actual: entry });
  }
  return results;
}

function compareFunctions(actual, visibility) {
  const rows = keyBy(actual, (entry) => entry.signature);
  const results = canonicalObjectManifest.functions.map((expected) => classifyExpected({
    kind: "function",
    key: expected.signature,
    expected,
    actual: rows.get(expected.signature),
    visibility,
    compare: (left, right) => left.security === right.security
      && left.owner === right.owner
      && left.search_path === String(right.search_path ?? "").replace(/^search_path=/, "")
      && left.sourceHash === right.source_hash,
  }));
  return appendActualExtras(results, actual, (entry) => entry.signature, "function");
}

function comparePolicies(actual, visibility) {
  const id = (entry) => `${entry.schema ?? entry.schema_name}.${entry.table ?? entry.table_name}.${entry.name ?? entry.policy_name}`;
  const rows = keyBy(actual, id);
  const results = canonicalObjectManifest.policies.map((expected) => classifyExpected({
    kind: "policy",
    key: id(expected),
    expected,
    actual: rows.get(id(expected)),
    visibility,
    compare: (left, right) => left.command === right.command
      && left.mode === right.mode
      && JSON.stringify((left.roles ?? []).map((role) => role.toLowerCase()).sort())
        === JSON.stringify((right.roles ?? []).map((role) => role.toLowerCase()).sort())
      && left.usingExpressionHash === expressionHash(right.using_expression)
      && left.withCheckExpressionHash === expressionHash(right.with_check_expression),
  }));
  return appendActualExtras(results, actual, id, "policy");
}

function compareTriggers(actual, visibility) {
  const id = (entry) => `${entry.table ?? `${entry.schema_name}.${entry.table_name}`}.${entry.name ?? entry.trigger_name}`;
  const rows = keyBy(actual, id);
  const results = canonicalObjectManifest.triggers.map((expected) => classifyExpected({
    kind: "trigger",
    key: id(expected),
    expected,
    actual: rows.get(id(expected)),
    visibility,
    compare: (left, right) => normalizeTriggerDefinition(right.definition)
      === normalizeTriggerDefinition(expectedTriggerDefinition(left)),
  }));
  return appendActualExtras(results, actual, id, "trigger");
}

function compareIndexes(actual, visibility) {
  const rows = keyBy((actual ?? []).filter((entry) => !entry.constraint_backed), (entry) => entry.index_name);
  const actualIndexes = (actual ?? []).filter((entry) => !entry.constraint_backed);
  const results = canonicalObjectManifest.explicitIndexes.map((expected) => classifyExpected({
    kind: "index",
    key: expected.name,
    expected,
    actual: rows.get(expected.name),
    visibility,
    compare: (left, right) => {
      const expectedParts = indexDefinitionParts(left.definition);
      const actualParts = indexDefinitionParts(right.definition);
      return Boolean(left.unique) === Boolean(right.unique)
        && normalize(expectedParts.columns) === normalize(actualParts.columns)
        && normalize(expectedParts.predicate) === normalize(actualParts.predicate);
    },
  }));
  return appendActualExtras(results, actualIndexes, (entry) => entry.index_name, "index");
}

function compareBuckets(actual, visibility) {
  const rows = keyBy(actual, (entry) => entry.id);
  const results = canonicalObjectManifest.buckets.map((expected) => classifyExpected({
    kind: "bucket",
    key: expected.id,
    expected,
    actual: rows.get(expected.id),
    visibility,
    compare: (left, right) => left.public === right.public
      && Number(left.file_size_limit_bytes) === Number(right.file_size_limit)
      && JSON.stringify([...(left.allowed_mime_types ?? [])].sort())
        === JSON.stringify([...(right.allowed_mime_types ?? [])].sort()),
  }));
  return appendActualExtras(
    results,
    actual,
    (entry) => entry.id,
    "bucket",
    (key) => knownLegacyBuckets.has(key) ? "LEGACY_EXTRA" : "AMBIGUOUS"
  );
}

function compareSchemas(fingerprint) {
  const rows = keyBy(fingerprint.sections.schemas, (entry) => entry.schema_name);
  const expectedSchemas = baselineManifest.object_inventory.schemas ?? [];
  const results = expectedSchemas.map((schema) => classifyExpected({
    kind: "schema", key: schema, expected: { schema, owner: "reflab_rls_owner" },
    actual: rows.get(schema), visibility: fingerprint.visibility.schemas,
    compare: (left, right) => left.owner === right.owner,
  }));
  return appendActualExtras(results, fingerprint.sections.schemas, (entry) => entry.schema_name, "schema");
}

function compareTablesAndColumns(fingerprint) {
  const tableVisibility = fingerprint.visibility.tables;
  const actualTables = keyBy(fingerprint.sections.tables, (entry) => `${entry.schema_name}.${entry.table_name}`);
  const rlsByTable = new Map(canonicalObjectManifest.rls.map((entry) => [entry.table, entry]));
  const tables = canonicalObjectManifest.tables.map((table) => classifyExpected({
    kind: "table", key: table,
    expected: { table, owner: "reflab_rls_owner", rls: rlsByTable.get(table) },
    actual: actualTables.get(table), visibility: tableVisibility,
    compare: (left, right) => right.owner === left.owner
      && right.rls_enabled === left.rls?.enabled
      && right.rls_forced === left.rls?.forced,
  }));

  const expectedSet = new Set(canonicalObjectManifest.tables);
  for (const [table, actual] of actualTables) {
    if (!/^(public|reflab_private|reflab_meta)[.]/.test(table) || expectedSet.has(table)) continue;
    tables.push({
      kind: "table",
      key: table,
      state: knownLegacyTables.has(table) ? "LEGACY_EXTRA" : "AMBIGUOUS",
      actual,
    });
  }

  const actualColumns = new Set((fingerprint.sections.columns ?? [])
    .map((entry) => `${entry.schema_name}.${entry.table_name}.${entry.column_name}`));
  const columns = Object.entries(criticalColumns).flatMap(([table, names]) => names.map((name) => {
    const key = `${table}.${name}`;
    if (!actualColumns.has(key)) {
      return { kind: "column", key, state: fingerprint.visibility.columns === "CONFIRMED" ? "ABSENT" : "AMBIGUOUS" };
    }
    return { kind: "column", key, state: "AMBIGUOUS", reason: "Manifest records presence but not the complete type/default/nullability contract." };
  }));
  return { tables, columns };
}

function unmodeledStructuralEvidence(fingerprint, alreadyModeledColumns) {
  const columnKeys = new Set(alreadyModeledColumns.map((entry) => entry.key));
  const extraColumns = (fingerprint.sections.columns ?? [])
    .map((entry) => ({
      kind: "column",
      key: `${entry.schema_name}.${entry.table_name}.${entry.column_name}`,
      state: "AMBIGUOUS",
      reason: "No complete expected column contract exists in the canonical manifest.",
      actual: entry,
    }))
    .filter((entry) => !columnKeys.has(entry.key));
  const mapEvidence = (section, kind, key) => (fingerprint.sections[section] ?? []).map((entry) => ({
    kind,
    key: key(entry),
    state: "AMBIGUOUS",
    reason: "Captured for Phase 0 evidence; no complete canonical comparison contract exists yet.",
    actual: entry,
  }));
  return [
    ...extraColumns,
    ...mapEvidence("constraints", "constraint", (entry) => `${entry.schema_name}.${entry.table_name}.${entry.constraint_name}`),
    ...mapEvidence("explicitAcls", "explicit_acl", (entry) => `${entry.object_type}:${entry.schema_name}.${entry.object_name}:${entry.grantee}:${entry.privilege_type}`),
    ...mapEvidence("defaultAcls", "default_acl", (entry) => `${entry.owner}:${entry.schema_name}:${entry.object_type}:${entry.grantee}:${entry.privilege_type}`),
    ...mapEvidence("roleMemberships", "role_membership", (entry) => `${entry.role_name}:${entry.member_name}`),
  ];
}

function compareInstitutionCatalog(fingerprint) {
  const actual = fingerprint.sections.institutionCatalog;
  if (!actual || fingerprint.visibility.institutionCatalog !== "CONFIRMED") {
    return { kind: "institution_catalog", key: "system_catalog", state: "AMBIGUOUS", actual };
  }
  const exact = Number(actual.permission_count) === 27
    && Number(actual.system_role_count) === 10
    && Number(actual.system_relation_count) === 87;
  return { kind: "institution_catalog", key: "system_catalog", state: exact ? "EXACT" : "DRIFTED", actual };
}

export function buildGitMigrationEvidence(repositoryRoot = root) {
  const migrationDirectory = resolve(repositoryRoot, "supabase", "migrations");
  const manifestByFile = new Map(migrationManifest.map((entry) => [`${entry.version}_${entry.name}.sql`, entry]));
  return readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = readFileSync(resolve(migrationDirectory, name), "utf8");
      const known = manifestByFile.get(name);
      return {
        file: `supabase/migrations/${name}`,
        sha256: sha256(sql.replace(/\r\n/g, "\n")),
        gitClassification: known?.classification ?? "unclassified_historical",
        productionAction: known?.productionAction ?? "INVENTORY_ONLY",
        appliedStatus: "NOT_INFERRED",
      };
    });
}

export function compareFingerprint(fingerprint, repositoryRoot = root) {
  if (fingerprint?.format !== "REFLAB_PRODUCTION_FINGERPRINT_V1") {
    throw new Error("Unsupported Production fingerprint format.");
  }
  const tableAndColumns = compareTablesAndColumns(fingerprint);
  const objects = [
    ...compareSchemas(fingerprint),
    ...tableAndColumns.tables,
    ...tableAndColumns.columns,
    ...compareFunctions(fingerprint.sections.functions, fingerprint.visibility.functions),
    ...comparePolicies(fingerprint.sections.policies, fingerprint.visibility.policies),
    ...compareTriggers(fingerprint.sections.triggers, fingerprint.visibility.triggers),
    ...compareIndexes(fingerprint.sections.indexes, fingerprint.visibility.indexes),
    ...compareBuckets(fingerprint.sections.storageBuckets, fingerprint.visibility.storageBuckets),
    ...unmodeledStructuralEvidence(fingerprint, tableAndColumns.columns),
    compareInstitutionCatalog(fingerprint),
  ];
  const summary = Object.fromEntries(OBJECT_STATES.map((state) => [
    state, objects.filter((entry) => entry.state === state).length,
  ]));
  return canonicalize({
    format: "REFLAB_PRODUCTION_SCHEMA_COMPARISON_V1",
    fingerprintHash: fingerprint.fingerprintHash,
    migrationInference: "PROHIBITED",
    summary,
    objects,
    migrationEvidence: buildGitMigrationEvidence(repositoryRoot),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: node compare.mjs <production-fingerprint.json>");
  const fingerprint = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  process.stdout.write(`${JSON.stringify(compareFingerprint(fingerprint), null, 2)}\n`);
}
