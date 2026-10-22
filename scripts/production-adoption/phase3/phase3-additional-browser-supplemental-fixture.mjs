import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { HARNESS_ROOT } from "./phase3-current-service-role-pre-contract.mjs";
import { ARCHIVE_SHA, BOUNDARY, FUNCTION_OIDS, TYPE_OIDS, VARIABLES, OPERATION, RUNNER, TARGET,
  functionSourceSha256, SOURCE_HASH_BASIS, classifySupplemental } from "./phase3-additional-browser-supplemental-contract.mjs";

export const FIXTURE_STATUS = "SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH";
export const fixtureHead = "a".repeat(40);
export const fixturePassword = "SUPPLEMENT_LOCAL_ONLY_P@ss!";
export const supplementalTypes = () => [{ oid: 25, namespaceOid: 11, schema: "pg_catalog", name: "fixture_target", typinput: 8001, typoutput: 8003 },
  { oid: 2950, namespaceOid: 11, schema: "pg_catalog", name: "fixture_source", typinput: 8004, typoutput: 8002 }];
export const supplementalFunction = (oid) => ({ oid, schema: "pg_catalog", name: `fixture_${oid}`, identityArguments: "",
  returnType: "text", owner: "postgres", securityDefiner: false, configuration: null, language: "internal", volatility: "i",
  strict: true, leakproof: false, sqlBodyTree: null, sourceText: `SYNTHETIC_SOURCE_${oid}`, rawAcl: null,
  catalogDependencies: [], executeAclEntryCount: 1,
  executeAcls: [{ function: oid, basis: "POSTGRESQL_DEFAULT_ACL", grantee: "PUBLIC", grantor: "postgres", privilege: "EXECUTE", grantable: false }],
  effectiveExecute: ["anon", "authenticated", "PUBLIC", "service_role", "postgres"].map((role) => ({ role, effective: true })) });
export function hashedFixtureFunction(oid) {
  const f = supplementalFunction(oid), result = { ...f, sourceSha256: functionSourceSha256(f), sourceHashBasis: SOURCE_HASH_BASIS };
  delete result.sourceText; return result;
}
export function supplementalFixtureReport() {
  return { ...classifySupplemental({ transactionReadOnly: true, requestedFunctionOids: [...FUNCTION_OIDS], requestedTypeOids: [...TYPE_OIDS],
    typeEvidence: supplementalTypes(), directFunctionEvidence: FUNCTION_OIDS.map(hashedFixtureFunction), discoveredIoFunctionOids: [8001, 8002],
    ioFunctionEvidence: [8001,8002].map(hashedFixtureFunction) }), transaction: "ROLLBACK", approval: "NOT_PERFORMED",
    approvedHead: fixtureHead, target: TARGET, runnerArtifactExact: true, protectedArtifactsExact: true,
    archiveSha256Expected: ARCHIVE_SHA, scopeBoundary: BOUNDARY, mutationCount: 0, ddlCount: 0, dmlCount: 0,
    migrationInvocationCount: 0, automaticRetryAuthorized: false };
}
export const fixtureEnv = () => Object.fromEntries(VARIABLES.map((key, i) => [key, i < 3 ? "true" : i === 3 ? TARGET.project : i === 4 ? fixtureHead :
  `postgresql://${TARGET.installer}:${encodeURIComponent(fixturePassword)}@${TARGET.host}:5432/postgres?sslmode=require`]));
const checkout = (path) => readFileSync(resolve(HARNESS_ROOT, path));
const git = (args) => args[0] === "rev-parse" ? fixtureHead : args[0] === "status" ? "" : args[0] === "ls-tree"
  ? readdirSync(resolve(HARNESS_ROOT, "supabase/migrations")).map((n) => "supabase/migrations/" + n).join("\n")
  : checkout(args[1].slice(41)).toString("utf8").replaceAll("\r\n", "\n");
export const fixtureDependencies = () => ({ argument: OPERATION, git, readCheckout: checkout, readRunnerBytes: () => checkout(RUNNER) });
export const frame = (query, payload) => `REFLAB_PREFLIGHT_V1\t${query}\t${Buffer.from(JSON.stringify({query,payload_row_count:1,payload})).toString("base64")}\n`;
export function captureSupplementalSession({ types = supplementalTypes(), functions = null, readOnly = "on" } = {}) {
  const queries = [], lifecycle = [];
  return { queries, lifecycle, query: async (sql) => {
    queries.push(sql);
    if (/additional_browser_inventory|pg_policy|pg_attribute|has_table_privilege|has_column_privilege/.test(sql))
      throw new Error("BROAD_QUERY_FORBIDDEN");
    if (sql.includes("browser_supplemental_read_only")) return frame("browser_supplemental_read_only", {readOnly});
    if (sql.includes("browser_supplemental_types")) return frame("browser_supplemental_types", types);
    if (sql.includes("browser_supplemental_functions")) {
      const ids = sql.match(/where p\.oid in \(([\d,]+)\)/)[1].split(",").map(Number);
      return frame("browser_supplemental_functions", functions === null ? ids.map(supplementalFunction) : functions.filter((f) => ids.includes(f.oid)));
    }
    return "";
  }, rollback: async () => { lifecycle.push("ROLLBACK"); }, close: async () => { lifecycle.push("CLOSE"); } };
}
