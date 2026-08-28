import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { migrationManifest } from "./manifest.mjs";
import {
  baseInventoryQueries,
  buildIdentityQueries,
  buildSqlBatch,
  compareInventoryWithManifest,
  queryDependenciesExist,
  semanticQueries,
} from "./queries.mjs";
import { assertReadOnlyBatch } from "./sql-safety.mjs";
import { authorizeProductionPreflightTarget } from "./target.mjs";

function sanitizeProcessOutput(value = "") {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")
    .slice(0, 2000);
}

export function parseJsonResults(output) {
  const results = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;
    const parsed = JSON.parse(candidate);
    if (typeof parsed.query === "string") results.set(parsed.query, parsed.payload);
  }
  return results;
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

export function executeReadOnlyBatch(sql, connectionEnvironment, { spawn = spawnSync } = {}) {
  assertReadOnlyBatch(sql);
  const result = spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], {
    input: sql,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...connectionEnvironment },
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Production preflight aborted on unexpected database error: ${sanitizeProcessOutput(result.stderr || result.stdout)}`);
  }
  return parseJsonResults(result.stdout);
}

export function buildConditionalInventory(catalog) {
  const linksAvailable = [
    "reflab_private.user_identity_links",
    "reflab_private.user_identity_links.provider",
    "reflab_private.user_identity_links.external_subject",
    "reflab_private.user_identity_links.user_id",
  ].every((name) => (name.split(".").length === 2 ? catalog.tables : catalog.columns).includes(name));
  const candidates = [...semanticQueries, ...buildIdentityQueries({ includeLinks: linksAvailable })];
  const runnable = candidates.filter((query) => queryDependenciesExist(query, catalog));
  const skipped = candidates.filter((query) => !queryDependenciesExist(query, catalog)).map((query) => ({
    query: query.id,
    status: "BLOCKER_SKIPPED_MISSING_DEPENDENCY",
    requires: query.requires,
  }));
  return { runnable, skipped, linksAvailable };
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

  const { runnable, skipped, linksAvailable } = buildConditionalInventory(catalog);
  const semanticResults = executeReadOnlyBatch(buildSqlBatch(runnable), target.connectionEnvironment, executionDependencies);
  const results = new Map([...baseResults, ...semanticResults]);
  const migrationHistory = classifyMigrationHistory(results.get("migration_history") ?? []);
  const report = {
    target: { projectRef: target.projectRef, host: target.host },
    readOnly: true,
    identityLinksAvailable: linksAvailable,
    skipped,
    migrationHistory,
    migrationBlockers: migrationHistory.filter((entry) => entry.gate.startsWith("BLOCKER_")),
    manifestComparison: compareInventoryWithManifest(results),
    results: Object.fromEntries(results),
  };
  writeReport(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProductionPreflight();
}
