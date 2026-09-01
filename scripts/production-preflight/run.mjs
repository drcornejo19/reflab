import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { TextDecoder } from "node:util";
import { migrationManifest } from "./manifest.mjs";
import {
  baseInventoryQueries,
  buildIdentityQueries,
  buildSqlBatch,
  compareInventoryWithManifest,
  hashFunctionSource,
  queryDependenciesExist,
  READ_ONLY_GUARD_QUERY_ID,
  RESULT_FRAME_PREFIX,
  semanticAuditSnapshotQuery,
  semanticQueries,
} from "./queries.mjs";
import {
  expandSemanticAuditSnapshot,
  SEMANTIC_AUDIT_REPLACED_QUERY_IDS,
  semanticAuditContractBlockers,
  semanticAuditInfrastructurePresent,
} from "./semantic-audit.mjs";
import { assertReadOnlyBatch } from "./sql-safety.mjs";
import { authorizeProductionPreflightTarget } from "./target.mjs";
import { buildGateReport, connectionCredentialBlockers } from "./gates.mjs";

function sanitizeProcessOutput(value = "") {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")
    .slice(0, 2000);
}

export function parseJsonResults(output) {
  const results = new Map();
  const framePrefix = `${RESULT_FRAME_PREFIX}\t`;
  const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
  for (const line of String(output).split(/\r\n|\n|\r/)) {
    if (!line.startsWith(framePrefix)) continue;
    const parts = line.split("\t");
    const candidateQueryId = parts[1];
    const queryId = /^[a-z][a-z0-9_]*$/.test(candidateQueryId ?? "") ? candidateQueryId : "unknown";
    try {
      if (parts.length !== 3 || queryId === "unknown") throw new Error("invalid frame fields");
      const encoded = parts[2];
      if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error("invalid base64");
      }
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded) throw new Error("non-canonical base64");
      const parsed = JSON.parse(utf8Decoder.decode(bytes));
      if (
        parsed?.query !== queryId ||
        parsed?.payload_row_count !== 1 ||
        !Object.hasOwn(parsed ?? {}, "payload")
      ) {
        throw new Error("invalid envelope");
      }
      if (results.has(queryId)) throw new Error("duplicate query result");

      const payload = queryId === "function_inventory"
        ? sanitizeFunctionInventory(parsed.payload)
        : parsed.payload;
      results.set(queryId, payload);
    } catch {
      throw new Error(`Production preflight aborted: invalid result frame for query ${queryId}.`);
    }
  }
  return results;
}

function sanitizeFunctionInventory(payload) {
  if (!Array.isArray(payload)) throw new Error("invalid function inventory");
  return payload.map((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.source_definition !== "string") {
      throw new Error("invalid function inventory entry");
    }
    const safeEntry = { ...entry, source_hash: hashFunctionSource(entry.source_definition) };
    delete safeEntry.source_definition;
    return safeEntry;
  });
}

export function classifyMigrationHistory(remoteRows) {
  const expected = new Map(migrationManifest.map((entry) => [entry.version, entry]));
  const remote = new Map(remoteRows.map((row) => [String(row.version), row]));
  const known = migrationManifest.map((entry) => ({
    ...entry,
    status: remote.has(entry.version) ? "applied" : "missing",
    remoteName: remote.has(entry.version) ? String(remote.get(entry.version).name ?? "") : null,
    nameMatches: remote.has(entry.version) ? String(remote.get(entry.version).name ?? "") === entry.name : null,
    gate: remote.has(entry.version) && String(remote.get(entry.version).name ?? "") !== entry.name
      ? "BLOCKER_NAME_MISMATCH"
      : remote.has(entry.version) && entry.classification === "development_only"
        ? "BLOCKER_DEVELOPMENT_MIGRATION_IN_PRODUCTION"
        : "INVENTORY",
  }));
  const unknown = remoteRows
    .filter((row) => !expected.has(String(row.version)))
    .map((row) => ({
      version: String(row.version),
      name: String(row.name ?? ""),
      classification: "unknown",
      productionAction: "NEVER_EXECUTE_UNREVIEWED",
      status: "applied",
      remoteName: String(row.name ?? ""),
      nameMatches: null,
      gate: "BLOCKER_UNKNOWN_MIGRATION",
    }));
  return [...known, ...unknown].sort((left, right) => left.version.localeCompare(right.version));
}

const subprocessEnvironmentAllowlist = Object.freeze([
  "PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP",
]);

export function buildPsqlEnvironment(hostEnvironment, connectionEnvironment) {
  const minimalEnvironment = {};
  for (const name of subprocessEnvironmentAllowlist) {
    if (hostEnvironment[name]) minimalEnvironment[name] = hostEnvironment[name];
  }
  for (const name of ["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE"]) {
    if (connectionEnvironment[name]) minimalEnvironment[name] = connectionEnvironment[name];
  }
  return minimalEnvironment;
}

export const PREFLIGHT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export function executeReadOnlyBatch(sql, connectionEnvironment, { spawn = spawnSync, processEnvironment = process.env } = {}) {
  assertReadOnlyBatch(sql);
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: PREFLIGHT_MAX_BUFFER_BYTES,
    windowsHide: true,
    env: buildPsqlEnvironment(processEnvironment, connectionEnvironment),
  });
  if (result.error?.code === "ENOBUFS" || /maxbuffer/i.test(String(result.error?.message ?? ""))) {
    throw new Error("Production preflight aborted: database output exceeded the safe buffer limit.");
  }
  if (result.error || result.status !== 0) {
    const safeDetail = sanitizeProcessOutput(result.stderr) || "psql failed without a safe diagnostic.";
    throw new Error(`Production preflight aborted on unexpected database error: ${safeDetail}`);
  }
  const results = parseJsonResults(result.stdout);
  if (results.get(READ_ONLY_GUARD_QUERY_ID) !== "on") {
    throw new Error("Production preflight aborted: transaction_read_only was not confirmed as on.");
  }
  return results;
}

function reportSafeResults(results) {
  return Object.fromEntries([...results].map(([query, payload]) => [
    query,
    query === "function_inventory" ? payload.map((entry) => {
      const safeEntry = { ...entry };
      delete safeEntry.source_definition;
      return safeEntry;
    }) : payload,
  ]));
}

export function buildConditionalInventory(catalog, semanticVisibility = [], options = {}) {
  const candidates = [...semanticQueries, ...buildIdentityQueries()];
  const visibilityByTable = new Map(semanticVisibility.map((entry) => [entry.table_name, entry]));
  const semanticAuditAvailable = options.semanticAuditAvailable === true;
  const auditReplacedIds = new Set(SEMANTIC_AUDIT_REPLACED_QUERY_IDS);
  const runnable = [];
  const skipped = [];
  const auditBacked = [];

  for (const query of candidates) {
    if (!queryDependenciesExist(query, catalog)) {
      skipped.push({ query: query.id, status: "BLOCKER_SKIPPED_MISSING_DEPENDENCY", requires: query.requires });
      continue;
    }
    if (semanticAuditAvailable && auditReplacedIds.has(query.id)) {
      auditBacked.push(query.id);
      continue;
    }
    const requiredTables = query.requires.tables ?? [];
    const unknownTables = requiredTables.filter((table) => !visibilityByTable.has(table));
    if (unknownTables.length > 0) {
      skipped.push({ query: query.id, status: "BLOCKER_SKIPPED_VISIBILITY_UNKNOWN", blockedTables: unknownTables, requires: query.requires });
      continue;
    }
    const noSelect = requiredTables.filter((table) => visibilityByTable.get(table)?.has_select !== true);
    if (noSelect.length > 0) {
      skipped.push({ query: query.id, status: "BLOCKER_SKIPPED_SELECT_UNAVAILABLE", blockedTables: noSelect, requires: query.requires });
      continue;
    }
    const rlsLimited = requiredTables.filter((table) => visibilityByTable.get(table)?.rls_applies === true);
    if (rlsLimited.length > 0) {
      skipped.push({ query: query.id, status: "BLOCKER_SKIPPED_RLS_VISIBILITY_UNPROVEN", blockedTables: rlsLimited, requires: query.requires });
      continue;
    }
    runnable.push(query);
  }
  if (auditBacked.length > 0) runnable.push(semanticAuditSnapshotQuery);
  return { runnable, skipped, auditBacked };
}

export function mergeSemanticAuditResults(results, auditBacked) {
  if (auditBacked.length === 0) return results;
  const snapshot = results.get(semanticAuditSnapshotQuery.id);
  const expanded = expandSemanticAuditSnapshot(snapshot);
  const merged = new Map(results);
  merged.delete(semanticAuditSnapshotQuery.id);
  for (const query of auditBacked) {
    if (query.startsWith("identity_")) continue;
    if (!expanded.has(query)) {
      throw new Error(`Production preflight semantic audit omitted ${query}.`);
    }
    merged.set(query, expanded.get(query));
  }
  if (auditBacked.some((query) => query.startsWith("identity_"))) {
    merged.set("identity_reference_integrity", expanded.get("identity_reference_integrity"));
  }
  return merged;
}

export function runProductionPreflight(environment = process.env, dependencies = {}) {
  const writeReport = dependencies.writeReport ?? ((value) => process.stdout.write(value));
  const executionDependencies = { ...dependencies };
  delete executionDependencies.writeReport;
  const target = authorizeProductionPreflightTarget(environment);
  const baseSql = buildSqlBatch(baseInventoryQueries);
  const baseResults = executeReadOnlyBatch(baseSql, target.connectionEnvironment, executionDependencies);
  const catalog = baseResults.get("catalog_gate");
  if (!catalog) throw new Error("Production preflight catalog gate returned no result.");

  const semanticVisibility = baseResults.get("semantic_visibility");
  if (!Array.isArray(semanticVisibility)) {
    throw new Error("Production preflight semantic visibility inventory returned no result.");
  }
  const semanticAuditBlockers = semanticAuditContractBlockers(baseResults);
  const temporarySemanticAuditPresent = semanticAuditInfrastructurePresent(baseResults);
  const { runnable, skipped, auditBacked } = buildConditionalInventory(
    catalog,
    semanticVisibility,
    { semanticAuditAvailable: semanticAuditBlockers.length === 0 },
  );
  const credentialBlockers = connectionCredentialBlockers(baseResults);
  const rawSemanticResults = credentialBlockers.length === 0
    ? executeReadOnlyBatch(buildSqlBatch(runnable), target.connectionEnvironment, executionDependencies)
    : new Map();
  const semanticResults = credentialBlockers.length === 0
    ? mergeSemanticAuditResults(rawSemanticResults, auditBacked)
    : rawSemanticResults;
  const effectiveSkipped = credentialBlockers.length === 0 ? skipped : [
    ...skipped,
    ...runnable.map((query) => ({
      query: query.id,
      status: "BLOCKER_SKIPPED_UNSAFE_CONNECTION_CREDENTIAL",
      requires: query.requires,
    })),
  ];
  const results = new Map([...baseResults, ...semanticResults]);
  const migrationHistory = classifyMigrationHistory(results.get("migration_history") ?? []);
  const manifestComparison = compareInventoryWithManifest(results);
  const gates = buildGateReport({
    results,
    migrationHistory,
    manifestComparison,
    skipped: effectiveSkipped,
    targetBlockers: credentialBlockers,
    temporarySemanticAuditPresent,
  });
  const report = {
    target: { projectRef: target.projectRef, host: target.host },
    readOnly: true,
    skipped: effectiveSkipped,
    migrationHistory,
    manifestComparison,
    semanticAudit: {
      available: semanticAuditBlockers.length === 0,
      lifecycle: "TEMPORARY_PRODUCTION_ADOPTION",
      teardownRequiredBeforeCanonicalMarker: temporarySemanticAuditPresent,
      contractBlockers: semanticAuditBlockers,
      replacedChecks: auditBacked,
    },
    ...gates,
    results: reportSafeResults(results),
  };
  writeReport(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProductionPreflight();
}
