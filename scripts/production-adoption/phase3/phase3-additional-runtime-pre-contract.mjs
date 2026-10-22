import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { CURRENT_ARTIFACTS, HARNESS_ROOT, TARGET, defaultGit, hashBytes, failHarness,
  resolveCurrentHarnessTarget, serializeCurrentHarness, safeHarnessFailure } from "./phase3-current-service-role-pre-contract.mjs";
import { assertReadOnlySql } from "../../production-preflight/sql-safety.mjs";
import { additionalQueries, buildAdditionalObservation, classifyAdditionalTransition,
  PRE_EXACT, POST_EXACT } from "./phase3-additional-runtime-service-role-contract.mjs";
import { ADDITIONAL_MIGRATION_PATH } from "./phase3-additional-runtime-service-role-matrix.mjs";

export { HARNESS_ROOT, TARGET, defaultGit, hashBytes, failHarness, safeHarnessFailure, PRE_EXACT, POST_EXACT };
export const ADDITIONAL_MIGRATION_SHA = "b83e0c286de1f3bff4318b0df6893255ca57e0fe443de6a4a59f2838f871b4ba";
export const PRE_FORMAT = "REFLAB_ADDITIONAL_RUNTIME_SERVICE_ROLE_PRODUCTION_PRE_ATTESTATION_V1";
export const PRE_OPERATION = "--production-additional-runtime-service-role-pre-attestation";
export const DDL_OPERATION = "--execute-production-additional-runtime-service-role-reconciliation";
export const PRE_RUNNER = "scripts/production-adoption/phase3/run-production-additional-runtime-service-role-pre.mjs";
export const DDL_RUNNER = "scripts/production-adoption/phase3/run-production-additional-runtime-service-role-reconciliation.mjs";
export const PRE_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT", "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION",
  "ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_PRE", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD", "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL"]);
export const DDL_VARIABLES = Object.freeze(["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_ADDITIONAL_RUNTIME_SERVICE_ROLE_DDL",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL", "REFLAB_PRODUCTION_DDL_MIGRATION_SHA"]);
export const PINNED_ARTIFACTS = Object.freeze({ ...CURRENT_ARTIFACTS,
  [ADDITIONAL_MIGRATION_PATH]: ADDITIONAL_MIGRATION_SHA,
  "scripts/production-adoption/phase3/phase3-additional-runtime-service-role-matrix.mjs": "71dbf26e99ed74f4eef847ba6f79ae661876b94cd52fb16c1ca01e466032a084",
  "scripts/production-adoption/phase3/phase3-additional-runtime-service-role-contract.mjs": "303799eba1667404c16d65e8015863fffafd2cb62bc20914c711532e9845eee7",
  "scripts/production-adoption/phase3/phase3-additional-runtime-service-role-migration-source.mjs": "8f0bd41f30fdb0530c58fab59fad5f02f5da5501158fd264dc27fe4b2d1bd64b",
  "scripts/production-adoption/phase3/phase3-additional-runtime-service-role-fixture.mjs": "2b6e5ab9880b48ba3878d3d7e0ac5ed0c4113a1e4966e6c36df3cfc70d1a57a7",
  "scripts/production-adoption/phase3/phase3-additional-runtime-service-role.spec.mjs": "7be5263b9f7441063281e2b271a95d22ec514cd045f635ad3b2f01b69503e4b0",
  "scripts/production-adoption/phase3/run-additional-runtime-service-role-postgres.mjs": "075d01f458b31bf825edc09ca001dfb90564443ed097b0bcb914b69a51117bb7",
  "docs/production-adoption/additional-runtime-service-role-reconciliation.md": "17a600bcaa0ebddd13a911980c3248a1250dd634f205d63d5dea940b93db133a",
  "scripts/production-preflight/manifest.mjs": "8e4920cfe1092f9609f4afeea8f081aff573c3937f8fef8379313973e65038c5",
});
const headArtifacts = [PRE_RUNNER, DDL_RUNNER,
  "scripts/production-adoption/phase3/phase3-additional-runtime-pre-contract.mjs",
  "scripts/production-adoption/phase3/phase3-additional-runtime-ddl-contract.mjs",
  "supabase/baseline/manifest.json", "supabase/migrations/202607270000_reflab_canonical_baseline.sql", "package.json"];
export const PRE_BEGIN = "begin read only;\nset local lock_timeout='2s';\nset local statement_timeout='15s';\nset local idle_in_transaction_session_timeout='15s';\nset local transaction_timeout='180s';";
export const SCOPE_BOUNDARY = Object.freeze({ target: "332_REVOKE_0_GRANT", primaryThirteen: "COMPLETED_IN_PRODUCTION_NOT_REEXECUTABLE",
  browser: "SEPARATE_NOT_IMPLEMENTED", futureCoach: "SELECT_INSERT_UPDATE_NOT_IMPLEMENTED", genericMigrationPushAuthorized: false,
  GLOBAL_TABLE_ACL_RECONCILIATION: "INCOMPLETE", TABLE_ACL_RECONCILIATION_STILL_REQUIRED: "YES",
  CURRENT_RUNTIME_USABILITY_NOT_ESTABLISHED: "YES", "64253_INDEPENDENT_REVIEW_REQUIRED": "YES",
  runtime: "NOT_AUTHORIZED", cutover: "NOT_AUTHORIZED", phase4: "NOT_AUTHORIZED" });

export function authorizeAdditionalHarness(environment, operation, ddl, git) {
  const variables = ddl ? DDL_VARIABLES : PRE_VARIABLES;
  if (operation !== (ddl ? DDL_OPERATION : PRE_OPERATION)) failHarness("OPERATION_NOT_AUTHORIZED");
  if (variables.slice(0, ddl ? 2 : 3).some((key) => environment[key] !== "true")) failHarness("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((key) => /^PG/i.test(key))) failHarness("INHERITED_PG_STATE");
  if (Object.keys(environment).some((key) => /^(NODE_OPTIONS$|NODE_PATH$|NODE_TEST)/i.test(key))) failHarness("INHERITED_EXECUTION_OVERRIDE");
  if (Object.keys(environment).some((key) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(key) && !variables.includes(key)))
    failHarness("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || environment[variables[ddl ? 3 : 4]] !== head) failHarness("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) failHarness("WORKTREE_DIRTY");
  if (ddl && environment[DDL_VARIABLES[5]] !== ADDITIONAL_MIGRATION_SHA) failHarness("APPROVED_MIGRATION_SHA_MISMATCH");
  return head;
}
export function verifyAdditionalHarnessArtifacts(git, head, runner, executingBytes,
  readCheckout = (path) => readFileSync(resolve(HARNESS_ROOT, path))) {
  const pending = [...Object.keys(PINNED_ARTIFACTS), ...headArtifacts], hashes = {};
  while (pending.length) {
    const path = pending.shift();
    if (Object.hasOwn(hashes, path)) continue;
    if (path.startsWith("../") || !/^[a-zA-Z0-9_./-]+$/.test(path)) failHarness("ARTIFACT_PATH_REJECTED");
    const value = git(["show", `${head}:${path}`]), bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const checkout = readCheckout(path);
    if (!Buffer.isBuffer(checkout) || checkout.toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8")) failHarness("CHECKOUT_ARTIFACT_MISMATCH");
    hashes[path] = hashBytes(bytes);
    if (PINNED_ARTIFACTS[path] && hashes[path] !== PINNED_ARTIFACTS[path]) failHarness("COMMITTED_ARTIFACT_MISMATCH");
    if (path.endsWith(".mjs")) {
      for (const match of bytes.toString("utf8").matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g))
        pending.push(posix.normalize(posix.join(posix.dirname(path), match[1])));
      if (/\bimport\s*\(/.test(bytes.toString("utf8"))) failHarness("DYNAMIC_EXECUTION_DEPENDENCY_REJECTED");
    }
  }
  if (!Buffer.isBuffer(executingBytes) || hashBytes(executingBytes) !== hashes[runner]) failHarness("RUNNER_ARTIFACT_MISMATCH");
  return { runnerArtifactExact: true, protectedArtifactsExact: true, artifactHashes: hashes };
}
export const resolveAdditionalTarget = (environment, ddl) => resolveCurrentHarnessTarget(environment,
  (ddl ? DDL_VARIABLES : PRE_VARIABLES)[ddl ? 2 : 3], (ddl ? DDL_VARIABLES : PRE_VARIABLES)[ddl ? 4 : 5]);
export const serializeAdditionalHarness = serializeCurrentHarness;
export function additionalObservationSql() {
  const sql = buildAdditionalObservation(); assertReadOnlySql(sql); return sql;
}
export function classifyAdditionalHarnessEvidence(results, readOnly, classify = classifyAdditionalTransition) {
  const required = ["read_only_guard", ...additionalQueries.map((q) => q.id)];
  if (!(results instanceof Map) || required.some((id) => !results.has(id))) return { classification: "UNKNOWN", executablePre: false,
    failedChecks: [], unknownChecks: ["catalogObservationIncomplete"], transactionReadOnly: null, migrationInvocationCount: 0 };
  return classify(results, { readOnly });
}
export function prepareAdditionalHarness(environment, dependencies, ddl, runnerBytes) {
  const git = dependencies.git ?? defaultGit, runner = ddl ? DDL_RUNNER : PRE_RUNNER;
  const head = authorizeAdditionalHarness(environment, dependencies.argument, ddl, git);
  const integrity = verifyAdditionalHarnessArtifacts(git, head, runner, runnerBytes(), dependencies.readCheckout);
  const target = resolveAdditionalTarget(environment, ddl);
  const metadata = { approvedHead: head, target: TARGET, ...integrity,
    artifact: { path: ADDITIONAL_MIGRATION_PATH, sha256: ADDITIONAL_MIGRATION_SHA }, scopeBoundary: SCOPE_BOUNDARY };
  // Validate deterministic structured output against credentials before constructing any session.
  serializeAdditionalHarness(metadata, environment, ddl);
  return { git, metadata, connectionEnvironment: target.connectionEnvironment };
}
