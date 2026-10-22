import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationDirectory = resolve(repositoryRoot, "supabase", "migrations");
const canonicalMigrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^2026\d{8}_.+[.]sql$/.test(name) && name >= "202607270000")
  .sort();

const canonicalSql = canonicalMigrationFiles.map((name) => ({
  name,
  sql: readFileSync(resolve(migrationDirectory, name), "utf8").replace(/\r\n/g, "\n"),
}));

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

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
  throw new Error(`Unbalanced canonical SQL at byte ${openingIndex}.`);
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

function normalizeParameterTypes(value) {
  return splitTopLevel(value).map((parameter) => {
    const normalized = parameter
      .replace(/\s+default\s+[\s\S]*$/i, "")
      .replace(/\s*=\s*[\s\S]*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = normalized.split(" ");
    return tokens.length > 1 ? tokens.slice(1).join(" ") : normalized;
  }).join(", ");
}

export function normalizeFunctionSource(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

export function normalizeSqlExpression(value) {
  if (value === null || value === undefined || value === "") return null;
  let normalized = String(value)
    .replace(/\r\n/g, "\n")
    .replace(/::(?:pg_catalog[.])?text\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    try {
      if (readBalanced(normalized, 0) !== normalized.length - 1) break;
      normalized = normalized.slice(1, -1).trim();
    } catch {
      break;
    }
  }
  return normalized.replace(/\s*([(),=<>])\s*/g, "$1");
}

export function expressionHash(value) {
  const normalized = normalizeSqlExpression(value);
  return normalized === null ? null : sha256(normalized);
}

function extractFunctionContracts() {
  const functions = new Map();
  const owners = new Map();
  for (const { sql } of canonicalSql) {
    const createPattern = /create(?:\s+or\s+replace)?\s+function\s+([a-z_][a-z0-9_]*)[.]([a-z_][a-z0-9_]*)\s*\(/gi;
    let match;
    while ((match = createPattern.exec(sql)) !== null) {
      const openingIndex = sql.indexOf("(", match.index);
      const closingIndex = readBalanced(sql, openingIndex);
      const signature = `${match[1]}.${match[2]}(${normalizeParameterTypes(sql.slice(openingIndex + 1, closingIndex))})`;
      const tail = sql.slice(closingIndex + 1);
      const sourceMatch = tail.match(/\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1\s*;/i);
      if (!sourceMatch) throw new Error(`Canonical function body not found for ${signature}.`);
      functions.set(signature, {
        signature,
        sourceHash: sha256(normalizeFunctionSource(sourceMatch[2])),
      });
      if (!owners.has(signature)) owners.set(signature, "postgres");
      createPattern.lastIndex = closingIndex + sourceMatch.index + sourceMatch[0].length;
    }

    const ownerPattern = /alter\s+function\s+([a-z_][a-z0-9_]*)[.]([a-z_][a-z0-9_]*)\s*\(/gi;
    while ((match = ownerPattern.exec(sql)) !== null) {
      const openingIndex = sql.indexOf("(", match.index);
      const closingIndex = readBalanced(sql, openingIndex);
      const signature = `${match[1]}.${match[2]}(${normalizeParameterTypes(sql.slice(openingIndex + 1, closingIndex))})`;
      const ownerMatch = sql.slice(closingIndex + 1, sql.indexOf(";", closingIndex)).match(/owner\s+to\s+([a-z_][a-z0-9_]*)/i);
      if (ownerMatch) owners.set(signature, ownerMatch[1]);
      ownerPattern.lastIndex = closingIndex + 1;
    }
  }
  for (const [signature, contract] of functions) {
    contract.owner = owners.get(signature) ?? "postgres";
  }
  return functions;
}

function expressionAfter(statement, keyword) {
  const match = new RegExp(`\\b${keyword}\\s*\\(`, "i").exec(statement);
  if (!match) return null;
  const openingIndex = statement.indexOf("(", match.index);
  return statement.slice(openingIndex + 1, readBalanced(statement, openingIndex));
}

function extractExplicitPolicyContracts() {
  const policies = new Map();
  for (const { sql } of canonicalSql) {
    const createPattern = /^create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)[.]([a-z_][a-z0-9_]*)/gim;
    let match;
    while ((match = createPattern.exec(sql)) !== null) {
      const statementEnd = sql.indexOf(";", match.index);
      const statement = sql.slice(match.index, statementEnd + 1);
      const key = `${match[2]}.${match[3]}.${match[1]}`;
      policies.set(key, {
        usingExpressionHash: expressionHash(expressionAfter(statement, "using")),
        withCheckExpressionHash: expressionHash(expressionAfter(statement, "with\\s+check")),
      });
      createPattern.lastIndex = statementEnd + 1;
    }
  }
  return policies;
}

const functionContracts = extractFunctionContracts();
const explicitPolicyContracts = extractExplicitPolicyContracts();

const categoryExpressions = {
  authenticated_catalog: ["true", null],
  user_owned_read: ["user_id = reflab_private.request_user_id() or reflab_private.is_super_admin()", null],
  user_owned_server_write: ["user_id = reflab_private.request_user_id() or reflab_private.is_super_admin()", null],
  user_owned_insert: [null, "user_id = reflab_private.request_user_id()"],
  user_owned_update: ["user_id = reflab_private.request_user_id()", "user_id = reflab_private.request_user_id()"],
};

export function enrichFunctionContract(entry) {
  const contract = functionContracts.get(entry.signature);
  return contract ? { ...entry, ...contract } : { ...entry, owner: entry.owner ?? "postgres", sourceHash: null };
}

export function enrichPolicyContract(entry) {
  const key = `${entry.schema}.${entry.table}.${entry.name}`;
  const explicit = explicitPolicyContracts.get(key);
  if (explicit) return { ...entry, ...explicit };
  const expressions = categoryExpressions[entry.category];
  if (expressions) {
    return {
      ...entry,
      usingExpressionHash: expressionHash(expressions[0]),
      withCheckExpressionHash: expressionHash(expressions[1]),
    };
  }
  return { ...entry, usingExpressionHash: null, withCheckExpressionHash: null };
}

export function normalizeIndexDefinition(value) {
  return String(value ?? "")
    .replace(/^create\s+(?:unique\s+)?index\s+\S+\s+on\s+(?:only\s+)?\S+\s+(?:using\s+\S+\s+)?/i, "")
    .replace(/\r\n/g, "\n")
    .replace(/::(?:pg_catalog[.])?text\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s*([(),=<>])\s*/g, "$1");
}

export function indexDefinitionParts(value) {
  const definition = normalizeIndexDefinition(value);
  const whereIndex = definition.indexOf(" where ");
  const keyDefinition = whereIndex === -1 ? definition : definition.slice(0, whereIndex);
  const predicate = whereIndex === -1 ? null : definition.slice(whereIndex + 7);
  if (!keyDefinition.startsWith("(")) return { definition, columns: [], predicate };
  const closingIndex = readBalanced(keyDefinition, 0);
  return {
    definition,
    columns: splitTopLevel(keyDefinition.slice(1, closingIndex)).map(normalizeSqlExpression),
    predicate,
  };
}

export function normalizeTriggerDefinition(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/EXECUTE FUNCTION/g, "EXECUTE FUNCTION");
}

export function expectedTriggerDefinition(entry) {
  return normalizeTriggerDefinition(
    `CREATE TRIGGER ${entry.name} ${entry.timing_and_events} ON ${entry.table} FOR EACH ROW EXECUTE FUNCTION ${entry.function}`
  );
}

export const canonicalContractSources = Object.freeze(canonicalMigrationFiles);
