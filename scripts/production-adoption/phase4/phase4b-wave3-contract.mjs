import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const evidence = JSON.parse(readFileSync(resolve(directory, "phase4a-evidence-report.json"), "utf8"));

export const PHASE4B_WAVE3_GATE = "scripts/production-adoption/phase4/phase4b-wave3-gate.sql";

export const PHASE4B_WAVE3_FUNCTIONS = Object.freeze([
  Object.freeze({
    signature: "public.set_updated_at()",
    provider: "202607160001_institutional_multitenant_foundation.sql",
    returns: "trigger",
    language: "plpgsql",
    volatility: "v",
    strict: false,
    securityDefiner: false,
    owner: "postgres",
    configuration: Object.freeze([]),
    source: "begin\n  new.updated_at = now();\n  return new;\nend;",
  }),
  Object.freeze({
    signature: "public.set_coach_updated_at()",
    provider: "202607200001_reflab_coach_foundation.sql",
    returns: "trigger",
    language: "plpgsql",
    volatility: "v",
    strict: false,
    securityDefiner: false,
    owner: "postgres",
    configuration: Object.freeze(["search_path=public"]),
    source: "begin\n  new.updated_at = now();\n  return new;\nend;",
  }),
].map((contract) => Object.freeze({
  ...contract,
  sourceHash: createHash("sha256").update(contract.source.trim()).digest("hex"),
})));

function triggerIdentity(value) {
  const [schema, table, ...nameParts] = String(value).split(".");
  if (!schema || !table || nameParts.length !== 1) throw new Error(`Invalid reviewed trigger identity: ${value}`);
  return { schema, table, name: nameParts[0] };
}

const reviewedPairs = evidence.triggers?.historicalPairs ?? [];
const updatedAtPairs = reviewedPairs.filter((entry) => entry.classification === "equivalent_different_name");
const validatorPairs = reviewedPairs.filter((entry) => entry.classification === "semantic_drift");

if (reviewedPairs.length !== 50 || updatedAtPairs.length !== 44 || validatorPairs.length !== 6) {
  throw new Error("Phase 4A trigger evidence does not match the reviewed 44/6 contract.");
}

export const PHASE4B_WAVE3_UPDATED_AT_PAIRS = Object.freeze(updatedAtPairs.map((entry) => {
  const canonical = triggerIdentity(entry.canonical);
  const historical = triggerIdentity(entry.historical);
  if (canonical.schema !== historical.schema || canonical.table !== historical.table
      || entry.canonicalFunction !== "reflab_private.set_updated_at()"
      || !PHASE4B_WAVE3_FUNCTIONS.some((contract) => contract.signature === entry.historicalFunction)) {
    throw new Error(`Unreviewed Wave 3 updated_at pair: ${entry.canonical}`);
  }
  return Object.freeze({
    schema: canonical.schema,
    table: canonical.table,
    canonicalName: canonical.name,
    canonicalFunction: entry.canonicalFunction,
    historicalName: historical.name,
    historicalFunction: entry.historicalFunction,
    timing: "BEFORE",
    events: Object.freeze(["UPDATE"]),
    level: "ROW",
    whenExpression: null,
    enabledState: "O",
    constraintTrigger: false,
    deferrable: false,
    initiallyDeferred: false,
    classification: "EQUIVALENT_REUSE",
  });
}));

export const PHASE4B_WAVE3_LEGACY_VALIDATORS = Object.freeze(validatorPairs.map((entry) => {
  const canonical = triggerIdentity(entry.canonical);
  const historical = triggerIdentity(entry.historical);
  if (canonical.schema !== historical.schema || canonical.table !== historical.table
      || entry.historicalFunction !== "public.validate_institution_tenant_links()") {
    throw new Error(`Unreviewed Wave 3 validator pair: ${entry.canonical}`);
  }
  return Object.freeze({
    schema: historical.schema,
    table: historical.table,
    canonicalName: canonical.name,
    historicalName: historical.name,
    historicalFunction: entry.historicalFunction,
    timing: "BEFORE",
    events: Object.freeze(["INSERT", "UPDATE"]),
    level: "ROW",
    whenExpression: null,
    enabledState: "O",
    constraintTrigger: false,
    classification: "LEGACY_REQUIRED_TEMPORARILY",
  });
}));

export const PHASE4B_WAVE3_NEGATIVE_SCENARIOS = Object.freeze([
  "wrong_trigger_function",
  "wrong_timing",
  "wrong_event_mask",
  "wrong_level",
  "disabled_trigger",
  "unexpected_when",
  "double_execution",
  "unexpected_trigger_pair",
  "function_source_drift",
  "missing_prerequisite",
]);

export function wave3TriggerIdentity(pair) {
  return `${pair.schema}.${pair.table}.${pair.historicalName}`;
}

export function assertWave3ProviderContract() {
  const identities = PHASE4B_WAVE3_UPDATED_AT_PAIRS.map(wave3TriggerIdentity);
  if (new Set(identities).size !== identities.length) throw new Error("Duplicate reviewed Wave 3 trigger identity.");
  const canonical = PHASE4B_WAVE3_UPDATED_AT_PAIRS.map((pair) => `${pair.schema}.${pair.table}.${pair.canonicalName}`);
  if (new Set(canonical).size !== canonical.length) throw new Error("Duplicate canonical Wave 3 trigger identity.");
  return true;
}
