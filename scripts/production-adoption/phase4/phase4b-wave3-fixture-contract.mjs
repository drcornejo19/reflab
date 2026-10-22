import { createHash } from "node:crypto";
import {
  PHASE4B_WAVE3_FUNCTIONS,
  PHASE4B_WAVE3_LEGACY_VALIDATORS,
  PHASE4B_WAVE3_UPDATED_AT_PAIRS,
} from "./phase4b-wave3-contract.mjs";

function extractFunctionStatement(source, signature) {
  const normalizedSource = String(source).replaceAll("\r\n", "\n");
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escaped}\\s*[\\s\\S]*?\\$\\$;`, "i");
  const match = normalizedSource.match(pattern);
  if (!match) throw new Error(`Historical function provider is missing: ${signature}`);
  return match[0];
}

export function extractHistoricalFunctionSource(statement) {
  const match = String(statement).match(/\bas\s+\$\$\s*([\s\S]*?)\s*\$\$\s*;\s*$/i);
  if (!match) throw new Error("Historical function statement has no supported dollar-quoted body.");
  return match[1].trim();
}

export function buildWave3FixtureSql({ canonicalSql, institutionalSql, coachSql }) {
  const setUpdatedAt = extractFunctionStatement(institutionalSql, "public.set_updated_at()");
  const setCoachUpdatedAt = extractFunctionStatement(coachSql, "public.set_coach_updated_at()");
  const validator = extractFunctionStatement(institutionalSql, "public.validate_institution_tenant_links()");
  const extracted = new Map([
    ["public.set_updated_at()", extractHistoricalFunctionSource(setUpdatedAt)],
    ["public.set_coach_updated_at()", extractHistoricalFunctionSource(setCoachUpdatedAt)],
  ]);
  for (const contract of PHASE4B_WAVE3_FUNCTIONS) {
    const hash = createHash("sha256").update(extracted.get(contract.signature)).digest("hex");
    if (hash !== contract.sourceHash) throw new Error(`Historical updated_at helper source drift: ${contract.signature}`);
  }

  const tables = [...new Set(PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `${pair.schema}.${pair.table}`))].sort();
  const missingTables = tables.filter((table) => !new RegExp(`create table\\s+${table.replaceAll(".", "\\.")}\\s*\\(`, "i").test(canonicalSql));
  if (missingTables.length) throw new Error(`Canonical Wave 3 tables are missing: ${missingTables.join(", ")}`);

  return `begin;
set local search_path = public, extensions, pg_catalog;
${tables.map((table) => `create table if not exists ${table} (updated_at timestamptz not null default pg_catalog.now());
alter table ${table} add column if not exists updated_at timestamptz not null default pg_catalog.now();`).join("\n")}
${setUpdatedAt}
${setCoachUpdatedAt}
${validator}
${PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `create trigger ${pair.historicalName}
before update on ${pair.schema}.${pair.table}
for each row execute function ${pair.historicalFunction};`).join("\n")}
${PHASE4B_WAVE3_LEGACY_VALIDATORS.map((pair) => `create trigger ${pair.historicalName}
before insert or update on ${pair.schema}.${pair.table}
for each row execute function ${pair.historicalFunction};`).join("\n")}
commit;`;
}
