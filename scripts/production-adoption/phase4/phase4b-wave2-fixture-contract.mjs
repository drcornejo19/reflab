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
  throw new Error("Unbalanced canonical table definition.");
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
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function columnDefinitions(source, table) {
  const match = new RegExp(`create table\\s+${table.replaceAll(".", "\\.")}\\s*\\(`, "i").exec(source);
  if (!match) throw new Error(`Wave 2 fixture relation is absent from the canonical baseline: ${table}`);
  const opening = source.indexOf("(", match.index);
  const closing = readBalanced(source, opening);
  return new Map(splitTopLevel(source.slice(opening + 1, closing)).flatMap((raw) => {
    const definition = raw.replace(/--[^\r\n]*(?:\r?\n|$)/g, "").replace(/\s+/g, " ").trim();
    const column = definition.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1];
    if (!column || ["constraint", "primary", "foreign", "unique", "check"].includes(column.toLowerCase())) return [];
    return [[column, definition]];
  }));
}

export function buildWave2FixtureDependencyContract(canonicalSql, indexes) {
  const columns = new Map();
  for (const index of indexes) {
    const definitions = columnDefinitions(canonicalSql, index.table);
    for (const key of index.keys) {
      const definition = definitions.get(key.column);
      if (!definition) throw new Error(`Wave 2 canonical key column is missing: ${index.table}.${key.column}`);
      columns.set(`${index.table}.${key.column}`, Object.freeze({
        identity: `${index.table}.${key.column}`,
        table: index.table,
        column: key.column,
        definition,
      }));
    }
  }
  for (const column of ["sport_type", "topic", "is_active"]) {
    const definition = columnDefinitions(canonicalSql, "public.clips").get(column);
    columns.set(`public.clips.${column}`, Object.freeze({ identity: `public.clips.${column}`, table: "public.clips", column, definition }));
  }
  return Object.freeze([...columns.values()].sort((left, right) => left.identity.localeCompare(right.identity)));
}

export function buildWave2FixtureSql(canonicalSql, indexes) {
  const columns = buildWave2FixtureDependencyContract(canonicalSql, indexes);
  const tables = [...new Set(columns.map((entry) => entry.table))].sort();
  return `begin;
set local search_path = public, extensions, pg_catalog;
${tables.map((table) => `create table if not exists ${table} ();`).join("\n")}
${columns.map((entry) => `alter table ${entry.table} add column if not exists ${entry.definition};`).join("\n")}
create index clips_sport_topic_active_idx on public.clips using btree (sport_type, topic, is_active);
commit;`;
}
