import { PHASE4B_WAVE5_CHECKS, PHASE4B_WAVE5_FOREIGN_KEYS } from "./phase4b-wave5-contract.mjs";

// Structure-only completion: no columns, constraints, defaults, or rows are invented.
export function buildWave5FixtureSql() {
  const tables = [...new Set([
    ...PHASE4B_WAVE5_CHECKS.map((entry) => entry.qualifiedTable),
    ...PHASE4B_WAVE5_FOREIGN_KEYS.flatMap((entry) => [entry.qualifiedTable, entry.qualifiedTarget]),
  ])].sort();
  return `begin;\n${tables.map((table) => `create table if not exists ${table} ();`).join("\n")}\ncommit;`;
}
