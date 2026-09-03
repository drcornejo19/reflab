import { PHASE4B_WAVE4_UNIQUES } from "./phase4b-wave4-contract.mjs";

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
    else if (character === ")" && --depth === 0) return index;
  }
  throw new Error("Unbalanced canonical table definition.");
}

function splitTopLevel(value) {
  const output = [];
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
      output.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  output.push(value.slice(start).trim());
  return output.filter(Boolean);
}

function canonicalColumns(source, qualifiedTable) {
  const pattern = new RegExp(`create table\\s+${qualifiedTable.replaceAll(".", "\\.")}\\s*\\(`, "i");
  const match = pattern.exec(source);
  if (!match) throw new Error(`Canonical Wave 4 fixture table is missing: ${qualifiedTable}`);
  const openingIndex = source.indexOf("(", match.index);
  const closingIndex = readBalanced(source, openingIndex);
  return new Map(splitTopLevel(source.slice(openingIndex + 1, closingIndex)).flatMap((definition) => {
    const normalized = definition.replace(/--[^\r\n]*(?:\r?\n|$)/g, "").trim();
    const column = normalized.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1];
    if (!column || ["constraint", "primary", "foreign", "unique", "check"].includes(column.toLowerCase())) return [];
    return [[column, normalized.replace(/\s+/g, " ").trim()]];
  }));
}

export function buildWave4FixtureColumnContract(canonicalSql) {
  return Object.freeze(PHASE4B_WAVE4_UNIQUES.flatMap((contract) => {
    const definitions = canonicalColumns(canonicalSql, contract.qualifiedTable);
    return contract.columns.map((column) => {
      const definition = definitions.get(column);
      if (!definition) throw new Error(`Canonical Wave 4 fixture column is missing: ${contract.qualifiedTable}.${column}`);
      return Object.freeze({ table: contract.qualifiedTable, column, definition });
    });
  }).filter((entry, index, all) => all.findIndex(
    (candidate) => candidate.table === entry.table && candidate.column === entry.column,
  ) === index));
}

export function buildWave4FixtureSql(canonicalSql) {
  const columns = buildWave4FixtureColumnContract(canonicalSql);
  const tables = [...new Set(PHASE4B_WAVE4_UNIQUES.map((entry) => entry.qualifiedTable))].sort();
  return `begin;
set local search_path = public, extensions, pg_catalog;
${tables.map((table) => `create table if not exists ${table} ();`).join("\n")}
${columns.map((entry) => `alter table ${entry.table} add column if not exists ${entry.definition};`).join("\n")}
create unique index exam_results_user_submission_unique
  on public.exam_results (user_id, submission_id)
  where submission_id is not null;
create unique index user_profiles_ref_card_id_unique
  on public.user_profiles (ref_card_id)
  where ref_card_id is not null;
commit;`;
}
