import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import {
  buildFingerprintInventory,
  buildFingerprintSql,
  fingerprintBaseQueries,
} from "./fingerprint-queries.mjs";

export const FINGERPRINT_FORMAT = "REFLAB_PRODUCTION_FINGERPRINT_V1";

const sectionIds = Object.freeze({
  schemas: "schema_inventory",
  tables: "table_inventory",
  columns: "column_inventory",
  constraints: "constraint_inventory",
  indexes: "index_inventory",
  functions: "function_inventory",
  triggers: "trigger_inventory",
  policies: "policy_inventory",
  explicitAcls: "explicit_acl_inventory",
  defaultAcls: "default_acl_inventory",
  roleMemberships: "role_membership_inventory",
  migrationHistoryStructure: "migration_history_structure",
  storageBuckets: "storage_bucket_inventory",
  storageObjects: "storage_object_aggregate",
  institutionCatalog: "institution_catalog_aggregate",
});

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
  );
}

export const canonicalJson = (value) => JSON.stringify(canonicalize(value));

function definitionHash(value) {
  return typeof value === "string" ? sha256(value.replace(/\r\n/g, "\n")) : null;
}

function sanitizeSection(name, payload) {
  if (!Array.isArray(payload)) return canonicalize(payload);
  if (name === "functions") {
    return payload.map((entry) => {
      const clean = { ...entry };
      delete clean.source_definition;
      if (!clean.source_hash) throw new Error("Fingerprint function source hash is missing.");
      return canonicalize(clean);
    });
  }
  if (name === "triggers") {
    return payload.map((entry) => canonicalize({
      ...entry,
      definition_hash: definitionHash(entry.definition),
    }));
  }
  return payload.map(canonicalize);
}

function sectionVisibility(name, results, skipped, role) {
  const queryId = sectionIds[name];
  if (skipped.some((entry) => entry.query === queryId)) return "UNKNOWN";
  if (!results.has(queryId)) return "UNKNOWN";
  if (["storageBuckets", "storageObjects", "institutionCatalog"].includes(name)) {
    return role?.rolbypassrls === true ? "CONFIRMED" : "OBSERVED_NOT_PROVEN_COMPLETE";
  }
  return "CONFIRMED";
}

export function buildFingerprint(results, skipped = []) {
  const role = results.get("fingerprint_role");
  if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole) {
    throw new Error("Production fingerprint requires a non-superuser structural read-only role.");
  }

  const sections = {};
  const visibility = {};
  for (const [name, queryId] of Object.entries(sectionIds)) {
    const payload = results.has(queryId) ? results.get(queryId) : null;
    sections[name] = sanitizeSection(name, payload);
    visibility[name] = sectionVisibility(name, results, skipped, role);
  }

  const content = canonicalize({
    format: FINGERPRINT_FORMAT,
    scope: "production-structural-evidence",
    visibility,
    skipped: canonicalize(skipped),
    sections,
  });
  const output = canonicalize({ ...content, fingerprintHash: sha256(canonicalJson(content)) });
  if (canonicalJson(output).includes("source_definition")) {
    throw new Error("Production fingerprint attempted to retain function source.");
  }
  return output;
}

export function runProductionFingerprint(environment = process.env, dependencies = {}) {
  const target = authorizeProductionPreflightTarget(environment);
  const executionDependencies = { ...dependencies };
  delete executionDependencies.writeOutput;

  const baseResults = executeReadOnlyBatch(
    buildFingerprintSql(fingerprintBaseQueries),
    target.connectionEnvironment,
    executionDependencies
  );
  const catalog = baseResults.get("fingerprint_catalog");
  if (!catalog) throw new Error("Production fingerprint catalog gate returned no result.");

  const { runnable, skipped } = buildFingerprintInventory(catalog);
  const inventoryResults = executeReadOnlyBatch(
    buildFingerprintSql(runnable),
    target.connectionEnvironment,
    executionDependencies
  );
  const fingerprint = buildFingerprint(new Map([...baseResults, ...inventoryResults]), skipped);
  const writeOutput = dependencies.writeOutput ?? ((value) => process.stdout.write(value));
  writeOutput(`${JSON.stringify(fingerprint, null, 2)}\n`);
  return fingerprint;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProductionFingerprint();
}
