import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sqlPath = resolve(
  root,
  "supabase/migrations/202607270000_reflab_canonical_baseline.sql"
);
const manifestPath = resolve(root, "supabase/baseline/manifest.json");
const writeMode = process.argv.includes("--write");

const normalizeNewlines = (value) => value.replace(/\r\n/g, "\n");
const normalizeSpace = (value) => value.replace(/\s+/g, " ").trim();
const sha256 = (value) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const uniqueSorted = (values) => [...new Set(values)].sort();
const sortObjects = (values, key) =>
  [...values].sort((left, right) => key(left).localeCompare(key(right)));

let sql = normalizeNewlines(readFileSync(sqlPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function readBalanced(source, openingIndex) {
  let depth = 0;
  let quote = null;

  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quote === "'") {
      if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === '"') {
      if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`Unbalanced SQL parentheses at byte ${openingIndex}.`);
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
      if (character === "'" && next === "'") {
        index += 1;
      } else if (character === "'") {
        quote = null;
      }
      continue;
    }

    if (quote === '"') {
      if (character === '"' && next === '"') {
        index += 1;
      } else if (character === '"') {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    } else if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = value.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function extractArrayFromBlock(tag) {
  const match = sql.match(
    new RegExp(
      `do \\$${tag}\\$[\\s\\S]*?foreach table_name in array array\\[([\\s\\S]*?)\\]::text\\[\\][\\s\\S]*?\\$${tag}\\$;`,
      "i"
    )
  );
  if (!match) throw new Error(`Dynamic SQL block ${tag} was not found.`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function extractHelpers(expression) {
  return uniqueSorted(
    [...expression.matchAll(/reflab_private\.([a-z_][a-z0-9_]*)\s*\(/gi)].map(
      (match) => `reflab_private.${match[1]}`
    )
  );
}

function policyCategory(policy) {
  if (policy.schema === "storage") {
    return policy.name === "institutional_content_authenticated_read"
      ? "institutional_storage_read"
      : "temporary_public_media_read";
  }
  if (policy.roles.includes("reflab_rls_owner")) return "rls_helper_source";
  if (policy.name.endsWith("_authenticated_read")) return "authenticated_catalog";
  if (policy.name.endsWith("_own_insert")) return "user_owned_insert";
  if (policy.name.endsWith("_own_update")) return "user_owned_update";
  if (policy.name.endsWith("_own_read")) return "user_owned_read";
  if (policy.name.includes("super_admin")) return "super_admin_audit_read";
  if (
    policy.name.includes("institution") ||
    policy.helpers.some((helper) => helper.includes("institution"))
  ) {
    return "institution_scoped_read";
  }
  if (policy.command === "SELECT") return "authenticated_read";
  return "explicit_application_policy";
}

function parseExplicitPolicies() {
  const policies = [];
  const pattern =
    /^create policy\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+(?:as\s+(permissive|restrictive)\s+)?for\s+([a-z]+)\s+to\s+([^\r\n]+)([\s\S]*?);/gim;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const policy = {
      name: match[1],
      schema: match[2],
      table: match[3],
      command: match[5].toUpperCase(),
      roles: uniqueSorted(match[6].split(",").map((role) => role.trim())),
      mode: (match[4] ?? "permissive").toUpperCase(),
      helpers: extractHelpers(match[7]),
      category: "",
    };
    policy.category = policyCategory(policy);
    policies.push(policy);
  }

  return policies;
}

function dynamicPolicy({
  name,
  table,
  command,
  helpers = [],
  category,
}) {
  return {
    name,
    schema: "public",
    table,
    command,
    roles: ["authenticated"],
    mode: "PERMISSIVE",
    helpers,
    category,
  };
}

function parsePolicies() {
  const policies = parseExplicitPolicies();

  for (const table of extractArrayFromBlock("catalog_policies")) {
    policies.push(
      dynamicPolicy({
        name: `${table}_authenticated_read`,
        table,
        command: "SELECT",
        category: "authenticated_catalog",
      })
    );
  }

  for (const table of extractArrayFromBlock("owned_read_write_policies")) {
    policies.push(
      dynamicPolicy({
        name: `${table}_own_read`,
        table,
        command: "SELECT",
        helpers: [
          "reflab_private.is_super_admin",
          "reflab_private.request_user_id",
        ],
        category: "user_owned_read",
      }),
      dynamicPolicy({
        name: `${table}_own_insert`,
        table,
        command: "INSERT",
        helpers: ["reflab_private.request_user_id"],
        category: "user_owned_insert",
      }),
      dynamicPolicy({
        name: `${table}_own_update`,
        table,
        command: "UPDATE",
        helpers: ["reflab_private.request_user_id"],
        category: "user_owned_update",
      })
    );
  }

  for (const table of extractArrayFromBlock("owned_read_only_policies")) {
    policies.push(
      dynamicPolicy({
        name: `${table}_own_read`,
        table,
        command: "SELECT",
        helpers: [
          "reflab_private.is_super_admin",
          "reflab_private.request_user_id",
        ],
        category: "user_owned_server_write",
      })
    );
  }

  return sortObjects(
    policies,
    (policy) => `${policy.schema}.${policy.table}.${policy.name}`
  );
}

function parseTables() {
  const tables = [];
  const definitions = new Map();
  const locations = new Map();
  const pattern = /^create table\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/gim;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const openingIndex = sql.indexOf("(", match.index);
    const closingIndex = readBalanced(sql, openingIndex);
    const qualifiedName = `${match[1]}.${match[2]}`;
    tables.push(qualifiedName);
    locations.set(qualifiedName, sql.slice(0, match.index).split("\n").length);
    definitions.set(
      qualifiedName,
      splitTopLevel(sql.slice(openingIndex + 1, closingIndex))
    );
    pattern.lastIndex = closingIndex;
  }

  return { tables: uniqueSorted(tables), definitions, locations };
}

function classifyTables(tables, locations) {
  const canonical = new Set(manifest.production_tables_canonical);
  const compatibility = new Set(manifest.production_tables_compatibility);
  const newCanonical = new Set(manifest.new_canonical_tables);

  return tables.map((qualifiedName) => {
    const [schema, name] = qualifiedName.split(".");
    let classification;
    let reason;

    if (schema === "reflab_meta" && name === "reflab_schema_state") {
      classification = "private_installation_metadata";
      reason =
        "Immutable baseline installation marker outside the exposed PostgREST schemas.";
    } else if (schema === "public" && canonical.has(name)) {
      classification = "production_canonical";
      reason =
        "Observed in production and approved as part of the canonical product model.";
    } else if (schema === "public" && compatibility.has(name)) {
      classification = "production_compatibility";
      reason =
        "Temporary compatibility table retained while canonical consumers replace legacy reads.";
    } else if (schema === "public" && newCanonical.has(name)) {
      classification = "new_canonical";
      reason =
        name === "psychology_modules"
          ? "Canonical catalog for validated Psychology module slugs."
          : "Immutable server-created manifest for secure referee exam submissions.";
    } else {
      throw new Error(`Unclassified baseline table: ${qualifiedName}.`);
    }

    return {
      name,
      schema,
      qualified_name: qualifiedName,
      classification,
      reason,
      source_file:
        "supabase/migrations/202607270000_reflab_canonical_baseline.sql",
      source_line: locations.get(qualifiedName),
      part_of_production_75: canonical.has(name),
      compatibility: compatibility.has(name),
      new_canonical: newCanonical.has(name),
      private_metadata: schema === "reflab_meta",
      supabase_managed: false,
    };
  });
}

function normalizeColumns(value) {
  return value
    .replace(/[()]/g, "")
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function parseConstraints(tableDefinitions) {
  const primaryKeys = [];
  const foreignKeys = [];
  const uniqueConstraints = [];
  const checkConstraints = [];

  function addDefinition(table, definition, explicitName = null) {
    const normalized = normalizeSpace(definition);
    const lower = normalized.toLowerCase();
    const constraintName =
      explicitName ??
      normalized.match(/^constraint\s+([a-z_][a-z0-9_]*)\s+/i)?.[1] ??
      null;
    const body = normalized.replace(
      /^constraint\s+[a-z_][a-z0-9_]*\s+/i,
      ""
    );

    const primaryMatch = body.match(/^primary key\s*(\([^)]*\))/i);
    if (primaryMatch) {
      primaryKeys.push({
        table,
        name: constraintName,
        columns: normalizeColumns(primaryMatch[1]),
      });
      return;
    }

    const uniqueMatch = body.match(/^unique\s*(\([^)]*\))/i);
    if (uniqueMatch) {
      uniqueConstraints.push({
        table,
        name: constraintName,
        columns: normalizeColumns(uniqueMatch[1]),
      });
      return;
    }

    const foreignMatch = body.match(
      /^foreign key\s*(\([^)]*\))\s+references\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*(\([^)]*\))/i
    );
    if (foreignMatch) {
      foreignKeys.push({
        table,
        name: constraintName,
        columns: normalizeColumns(foreignMatch[1]),
        references_table: foreignMatch[2],
        references_columns: normalizeColumns(foreignMatch[3]),
      });
      return;
    }

    if (/^check\s*\(/i.test(body)) {
      checkConstraints.push({
        table,
        name: constraintName,
        expression: body,
      });
      return;
    }

    const columnName = normalized.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i)?.[1];
    if (!columnName) return;

    if (/\bprimary key\b/i.test(normalized)) {
      primaryKeys.push({ table, name: null, columns: [columnName] });
    }
    if (/\bunique\b/i.test(normalized)) {
      uniqueConstraints.push({ table, name: null, columns: [columnName] });
    }

    const referenceMatch = normalized.match(
      /\breferences\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*(\([^)]*\))/i
    );
    if (referenceMatch) {
      foreignKeys.push({
        table,
        name: null,
        columns: [columnName],
        references_table: referenceMatch[1],
        references_columns: normalizeColumns(referenceMatch[2]),
      });
    }

    const checkIndex = lower.indexOf(" check ");
    if (checkIndex !== -1) {
      checkConstraints.push({
        table,
        name: null,
        expression: normalized.slice(checkIndex + 1),
      });
    }
  }

  for (const [table, definitions] of tableDefinitions) {
    for (const definition of definitions) addDefinition(table, definition);
  }

  const alterPattern =
    /^alter table\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+add constraint\s+([a-z_][a-z0-9_]*)\s+([\s\S]*?);/gim;
  let match;
  while ((match = alterPattern.exec(sql)) !== null) {
    addDefinition(match[1], match[3], match[2]);
  }

  const sorter = (constraint) =>
    `${constraint.table}.${constraint.name ?? ""}.${constraint.columns?.join(",") ?? constraint.expression}`;
  return {
    primary_keys: sortObjects(primaryKeys, sorter),
    foreign_keys: sortObjects(foreignKeys, sorter),
    unique_constraints: sortObjects(uniqueConstraints, sorter),
    check_constraints: sortObjects(checkConstraints, sorter),
  };
}

function parseFunctions() {
  const functions = [];
  const pattern =
    /^create function\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*\(/gim;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    const openingIndex = sql.indexOf("(", match.index);
    const closingIndex = readBalanced(sql, openingIndex);
    const parameterDefinitions = splitTopLevel(
      sql.slice(openingIndex + 1, closingIndex)
    );
    const parameterTypes = parameterDefinitions.map((parameter) => {
      const normalized = normalizeSpace(parameter)
        .replace(/\s+default\s+[\s\S]*$/i, "")
        .replace(/\s*=\s*[\s\S]*$/i, "");
      const tokens = normalized.split(" ");
      return tokens.length > 1 ? tokens.slice(1).join(" ") : normalized;
    });
    const following = sql.slice(closingIndex + 1, sql.indexOf(";", closingIndex));
    functions.push({
      signature: `${match[1]}.${match[2]}(${parameterTypes.join(", ")})`,
      security: /\bsecurity definer\b/i.test(following)
        ? "DEFINER"
        : "INVOKER",
      search_path:
        following.match(/\bset search_path\s*=\s*([^\r\n]+)/i)?.[1].trim() ??
        null,
    });
    pattern.lastIndex = closingIndex;
  }

  return sortObjects(functions, (entry) => entry.signature);
}

function parseExplicitIndexes() {
  const indexes = [];
  const pattern =
    /^create\s+(unique\s+)?index\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)([\s\S]*?);/gim;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    indexes.push({
      name: match[2],
      table: match[3],
      unique: Boolean(match[1]),
      definition: normalizeSpace(match[4]),
    });
  }

  return sortObjects(indexes, (index) => `${index.table}.${index.name}`);
}

function parseExplicitTriggers() {
  const triggers = [];
  const pattern =
    /^create trigger\s+([a-z_][a-z0-9_]*)\s+([\s\S]*?)\s+on\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+for each row\s+execute function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s*\(\s*\)\s*;/gim;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    triggers.push({
      name: match[1],
      table: match[3],
      timing_and_events: normalizeSpace(match[2]).toUpperCase(),
      function: `${match[4]}()`,
      source: "explicit",
    });
  }

  return triggers;
}

function dynamicTriggers(tag, suffix, timingAndEvents, functionName) {
  return extractArrayFromBlock(tag).map((table) => ({
    name: `${table}_${suffix}`,
    table: `public.${table}`,
    timing_and_events: timingAndEvents,
    function: `${functionName}()`,
    source: `generated:${tag}`,
  }));
}

function parseTriggers() {
  const triggers = [
    ...parseExplicitTriggers(),
    ...dynamicTriggers(
      "updated_at_triggers",
      "set_updated_at",
      "BEFORE UPDATE",
      "reflab_private.set_updated_at"
    ),
    ...dynamicTriggers(
      "appointment_context_triggers",
      "validate_appointment_context",
      "BEFORE INSERT OR UPDATE",
      "reflab_private.validate_user_appointment_context"
    ),
    ...dynamicTriggers(
      "performance_checkin_context_triggers",
      "validate_appointment_context",
      "BEFORE INSERT OR UPDATE",
      "reflab_private.validate_performance_checkin_owner"
    ),
  ];

  return sortObjects(triggers, (trigger) => `${trigger.table}.${trigger.name}`);
}

function buildInventory() {
  const { tables, definitions, locations } = parseTables();
  const constraints = parseConstraints(definitions);
  const policies = parsePolicies();
  const functions = parseFunctions();
  const triggers = parseTriggers();
  const indexes = parseExplicitIndexes();
  const schemas = uniqueSorted(
    [...sql.matchAll(/^create schema\s+([a-z_][a-z0-9_]*)/gim)].map(
      (match) => match[1]
    )
  );
  const roles = uniqueSorted(
    [...sql.matchAll(/\bcreate role\s+([a-z_][a-z0-9_]*)/gi)].map(
      (match) => match[1]
    )
  );
  const extensions = sortObjects(
    [
      ...sql.matchAll(
        /^create extension(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)([\s\S]*?);/gim
      ),
    ].map((match) => ({
      name: match[1],
      schema:
        match[2].match(/\bwith schema\s+([a-z_][a-z0-9_]*)/i)?.[1] ?? null,
    })),
    (extension) => extension.name
  );
  const types = sortObjects(
    [...sql.matchAll(/^create type\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)([\s\S]*?);/gim)].map(
      (match) => ({
        name: match[1],
        definition: normalizeSpace(match[2]),
      })
    ),
    (type) => type.name
  );
  const views = uniqueSorted(
    [...sql.matchAll(/^create view\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gim)].map(
      (match) => match[1]
    )
  );

  const buckets = manifest.storage_buckets.map((bucket) => ({
    id: bucket.id,
    public: bucket.public,
    file_size_limit_bytes: bucket.file_size_limit_bytes,
    allowed_mime_types: [...bucket.allowed_mime_types].sort(),
    browser_write: bucket.browser_write,
  }));

  for (const bucket of buckets) {
    if (!sql.includes(`'${bucket.id}'`)) {
      throw new Error(`Bucket ${bucket.id} is declared in manifest but not SQL.`);
    }
  }

  return {
    schemas,
    technical_roles: roles,
    extensions,
    types_and_enums: types,
    tables,
    table_inventory: classifyTables(tables, locations),
    views,
    functions,
    policies,
    triggers,
    explicit_indexes: indexes,
    ...constraints,
    buckets,
    storage_policies: policies.filter((policy) => policy.schema === "storage"),
    baseline_marker: "reflab_meta.reflab_schema_state",
  };
}

function normalizedManifestHash(value) {
  const clone = structuredClone(value);
  clone.integrity.sql_checksum = "0".repeat(64);
  clone.integrity.manifest_hash = "0".repeat(64);
  return sha256(`${JSON.stringify(clone, null, 2)}\n`);
}

function normalizedSqlChecksum(value) {
  const normalized = value.replace(
    /(\n\s*'202607270000',\n\s*)'[0-9a-f]{64}'/,
    `$1'${"0".repeat(64)}'`
  );
  if (normalized === value) {
    throw new Error("Could not normalize baseline sql_checksum literal.");
  }
  return sha256(normalized);
}

function updateIntegrity(inventory) {
  manifest.object_inventory = inventory;
  manifest.counts.baseline_public_tables = inventory.table_inventory.filter(
    (table) => table.schema === "public"
  ).length;
  manifest.counts.baseline_private_metadata_tables =
    inventory.table_inventory.filter(
      (table) => table.classification === "private_installation_metadata"
    ).length;
  manifest.counts.baseline_total_tables = inventory.table_inventory.length;
  manifest.counts.supabase_managed_tables_created =
    inventory.table_inventory.filter((table) => table.supabase_managed).length;
  manifest.counts.functions = inventory.functions.length;
  manifest.counts.policies = inventory.policies.length;
  manifest.counts.public_policies = inventory.policies.filter(
    (policy) => policy.schema === "public"
  ).length;
  manifest.counts.storage_policies = inventory.storage_policies.length;
  manifest.counts.triggers = inventory.triggers.length;
  manifest.counts.explicit_indexes = inventory.explicit_indexes.length;
  manifest.counts.primary_keys = inventory.primary_keys.length;
  manifest.counts.foreign_keys = inventory.foreign_keys.length;
  manifest.counts.unique_constraints = inventory.unique_constraints.length;
  manifest.counts.check_constraints = inventory.check_constraints.length;

  const manifestHash = normalizedManifestHash(manifest);
  sql = sql.replace(
    /(\n\s*'202607270000',\n\s*'[0-9a-f]{64}',\n\s*)'[0-9a-f]{64}'/,
    `$1'${manifestHash}'`
  );
  const sqlChecksum = normalizedSqlChecksum(sql);
  sql = sql.replace(
    /(\n\s*'202607270000',\n\s*)'[0-9a-f]{64}'/,
    `$1'${sqlChecksum}'`
  );
  manifest.integrity.sql_checksum = sqlChecksum;
  manifest.integrity.manifest_hash = manifestHash;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const inventory = buildInventory();
assert(
  inventory.tables.filter((table) => table.startsWith("public.")).length === 79,
  "Expected exactly 79 public baseline tables."
);
assert(
  inventory.table_inventory.length === 80,
  "Expected exactly 80 baseline tables including private metadata."
);
assert(
  inventory.table_inventory.filter(
    (table) => table.classification === "production_canonical"
  ).length === 75,
  "Expected exactly 75 production canonical tables."
);
assert(
  inventory.table_inventory.filter(
    (table) => table.classification === "production_compatibility"
  ).length === 2,
  "Expected exactly 2 production compatibility tables."
);
assert(
  inventory.table_inventory.filter(
    (table) => table.classification === "new_canonical"
  ).length === 2,
  "Expected exactly 2 new canonical tables."
);
assert(
  inventory.table_inventory.filter(
    (table) => table.classification === "private_installation_metadata"
  ).length === 1,
  "Expected exactly 1 private metadata table."
);
assert(
  JSON.stringify(inventory.extensions) ===
    JSON.stringify([{ name: "pgcrypto", schema: "extensions" }]),
  "Expected exactly the pgcrypto extension in the extensions schema."
);
assert(inventory.functions.length === 21, "Expected exactly 21 functions.");
assert(inventory.policies.length === 120, "Expected exactly 120 policies.");
assert(
  inventory.storage_policies.length === 3,
  "Expected exactly 3 Storage policies."
);
assert(
  new Set(inventory.policies.map((policy) => `${policy.schema}.${policy.name}`))
    .size === inventory.policies.length,
  "Duplicate policy names detected within a schema."
);

if (writeMode) {
  updateIntegrity(inventory);
  writeFileSync(sqlPath, sql, "utf8");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Canonical manifest updated: ${inventory.policies.length} policies, ` +
      `${inventory.triggers.length} triggers, ${inventory.explicit_indexes.length} explicit indexes.\n`
  );
} else {
  assert(
    JSON.stringify(manifest.object_inventory) === JSON.stringify(inventory),
    "Manifest object_inventory does not match canonical SQL. Run with --write after review."
  );
  assert(
    manifest.counts.policies === inventory.policies.length,
    "Manifest policy count does not match SQL."
  );
  assert(
    manifest.integrity.manifest_hash === normalizedManifestHash(manifest),
    "Manifest hash is invalid."
  );
  assert(
    manifest.integrity.sql_checksum === normalizedSqlChecksum(sql),
    "Canonical SQL checksum is invalid."
  );
  process.stdout.write(
    `Canonical baseline verified: ${inventory.tables.length} tables, ` +
      `${inventory.functions.length} functions, ${inventory.policies.length} policies, ` +
      `${inventory.triggers.length} triggers, ${inventory.explicit_indexes.length} explicit indexes.\n`
  );
}
