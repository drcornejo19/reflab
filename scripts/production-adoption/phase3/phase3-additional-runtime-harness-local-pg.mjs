import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseJsonResults } from "../../production-preflight/run.mjs";
import { withCurrentServiceLocalPg } from "./phase3-current-service-role-harness-local-pg.mjs";
import { buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { ADDITIONAL_MIGRATION_PATH } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { classifyLocalAdditionalTransition, classifyAdditionalTransition } from "./phase3-additional-runtime-service-role-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { classifyBrowserPrivilegeObservation } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { PRE_BEGIN, PRE_EXACT, additionalObservationSql } from "./phase3-additional-runtime-pre-contract.mjs";

export const withAdditionalHarnessLocalPg = (action) => withCurrentServiceLocalPg(async ({ sql, createSession }) => {
  sql(buildAdditionalFixtureSetup());
  const collect = async (database = "postgres") => {
    const session = createSession(database);
    try { await session.query(PRE_BEGIN); return parseJsonResults(await session.query(additionalObservationSql())); }
    finally { await session.rollback(); await session.close(); }
  };
  const before = await collect(), inventory = before.get(SERVICE_FORENSIC_QUERY_ID);
  const proof = { fixtureStatus: "LOCAL_SYNTHETIC_DATA_ONLY", state: classifyBrowserPrivilegeObservation(before, { targetExact: true }).historicalState,
    functionHashes: Object.fromEntries(inventory.relevantFunctions.filter((f) => f.exists).map((f) => [f.signature, f.sourceHash])) };
  const classify = (e, options) => classifyLocalAdditionalTransition(e, proof, options);
  assert.equal(classify(before).classification, PRE_EXACT); assert.equal(classifyAdditionalTransition(before).classification, "BLOCKER");
  const bytes = readFileSync(new URL("../../../" + ADDITIONAL_MIGRATION_PATH, import.meta.url));
  return action({ sql, createSession, collect, before, classify, bytes });
});
