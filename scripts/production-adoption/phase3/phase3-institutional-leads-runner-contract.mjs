import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { HARNESS_ROOT, TARGET, defaultGit, hashBytes, failHarness, safeHarnessFailure,
  resolveCurrentHarnessTarget, serializeCurrentHarness } from "./phase3-current-service-role-pre-contract.mjs";
import { PINNED_ARTIFACTS } from "./phase3-additional-runtime-pre-contract.mjs";
import { MIGRATION, assertMigration, preserved, PRE, POST } from "./phase3-institutional-leads-insert-contract.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { exactServiceRows } from "./phase3-current-service-role-contract.mjs";

export { PRE, POST, MIGRATION, TARGET, HARNESS_ROOT, hashBytes, failHarness, safeHarnessFailure };
export const FORMAT = "REFLAB_INSTITUTIONAL_LEADS_PROVIDER_PRODUCTION_EXECUTION_V1";
export const OPERATION = "--production-institutional-leads-provider";
export const RUNNER = "scripts/production-adoption/phase3/run-production-institutional-leads-provider.mjs";
export const PROVIDER_SHA = "ceadb1591b08e387c1ed061942d4ce069aa66bc7e1563160bd6a7cf8e5b9cb02";
export const VARIABLES = Object.freeze(["ALLOW_PRODUCTION_DDL", "ALLOW_PRODUCTION_INSTITUTIONAL_LEADS_PROVIDER",
  "REFLAB_PRODUCTION_DDL_PROJECT_REF", "REFLAB_PRODUCTION_DDL_APPROVED_HEAD", "REFLAB_PRODUCTION_DDL_DB_URL"]);
export const PROTECTED = Object.freeze({ ...PINNED_ARTIFACTS,
  [MIGRATION]: PROVIDER_SHA,
  "scripts/production-adoption/phase3/phase3-institutional-leads-insert-contract.mjs": "82972292f94eb6d7d5f27665cea97af66135feffa09e9c452661c6372f41f133",
  "scripts/production-adoption/phase3/phase3-institutional-leads-insert-fixture.mjs": "77a3e59294ca65afcde2f6d497e6a697b08bd001799c5dbf86d51c186a9a9b10",
  "scripts/production-adoption/phase3/phase3-institutional-leads-insert.spec.mjs": "cef62f75810b23143cae926f05cb9d2aaa7f7962eb51412399badd3235acc66a",
  "scripts/production-adoption/phase3/run-institutional-leads-insert-postgres.mjs": "95e9a646fa7bb8999ca596680a78b9c1c65be41ccd1359c9eff8bf36de4d6138",
  "docs/production-adoption/institutional-leads-insert-provider.md": "c4dc37c90e0428a0b155238b7da42b3975eb122b86de734844581d2ebb521895",
  "app/api/institutional-leads/route.ts": "b6e6d79a61d85c225486821f016e11a2d423936fc62d2a9b7bfdf264bb37708e",
});
export const ZERO_ACCOUNTING = Object.freeze(Object.fromEntries([
  "tableGrantChanges", "sqlGrantStatements", "sqlRevokeStatements", "productInserts", "productUpdates", "productDeletes", "backfill",
  "tableChanges", "functionChanges", "policyChanges", "indexChanges", "constraintChanges", "ownershipChanges", "columnAclChanges",
  "schemaGrantChanges", "browserAclChanges", "otherServiceRoleChanges", "ledgerWrites", "schemaStateWrites", "markerWrites",
  "notifications", "runtimeChanges", "cutoverChanges", "phase4Changes",
].map((key) => [key, 0])));
export const EXPECTED_ACCOUNTING = Object.freeze({ ...ZERO_ACCOUNTING, tableGrantChanges: 1, sqlGrantStatements: 1 });
export const BOUNDARY = Object.freeze({ provider: "INSTITUTIONAL_LEADS_SERVICE_ROLE_INSERT_ONLY", callerDeploymentAuthorized: false,
  providerRemoteExecutionAuthorized: false, genericMigrationPushAuthorized: false, completedWavesReexecutionAuthorized: false,
  browserAclDdlAuthorized: false, phase4Authorized: false, runtime: "NOT_EXECUTED", cutover: "NOT_EXECUTED",
  safeOrder: "PROVIDER_EXECUTION -> PROVIDER_POST_EXACT -> CALLER_DEPLOYMENT" });
export const serialize = (report, environment) => serializeCurrentHarness(report, environment, true);

export function authorize(environment, operation, git) {
  if (operation !== OPERATION) failHarness("OPERATION_NOT_AUTHORIZED");
  if (VARIABLES.slice(0, 2).some((key) => environment[key] !== "true")) failHarness("OPT_IN_REQUIRED");
  if (Object.keys(environment).some((key) => /^PG/i.test(key))) failHarness("INHERITED_PG_STATE");
  if (Object.keys(environment).some((key) => /^(NODE_OPTIONS$|NODE_PATH$|NODE_TEST)/i.test(key))) failHarness("INHERITED_EXECUTION_OVERRIDE");
  if (Object.keys(environment).some((key) => /^(ALLOW_PRODUCTION_|REFLAB_PRODUCTION_)/i.test(key) && !VARIABLES.includes(key)))
    failHarness("CONFLICTING_PRODUCTION_CONFIGURATION");
  const head = String(git(["rev-parse", "HEAD"])).trim();
  if (!/^[a-f0-9]{40}$/.test(head) || environment.REFLAB_PRODUCTION_DDL_APPROVED_HEAD !== head) failHarness("HEAD_MISMATCH");
  if (String(git(["status", "--porcelain", "--untracked-files=all"])).trim()) failHarness("WORKTREE_DIRTY");
  return head;
}
export function verifyArtifacts(git, head, executingBytes, readCheckout = (path) => readFileSync(resolve(HARNESS_ROOT, path))) {
  const pending = [...Object.keys(PROTECTED), RUNNER, "package.json", "supabase/baseline/manifest.json",
    "scripts/production-adoption/phase3/phase3-institutional-leads-runner.spec.mjs",
    "scripts/production-adoption/phase3/run-institutional-leads-provider-postgres.mjs",
    "docs/production-adoption/institutional-leads-production-runner.md"], hashes = {};
  while (pending.length) {
    const path = pending.shift();
    if (Object.hasOwn(hashes, path)) continue;
    if (path.startsWith("../") || !/^[a-zA-Z0-9_./-]+$/.test(path)) failHarness("ARTIFACT_PATH_REJECTED");
    const bytes = Buffer.from(git(["show", `${head}:${path}`])), checkout = readCheckout(path);
    if (!Buffer.isBuffer(checkout) || checkout.toString("utf8").replaceAll("\r\n", "\n") !== bytes.toString("utf8")) failHarness("CHECKOUT_ARTIFACT_MISMATCH");
    hashes[path] = hashBytes(bytes);
    if (PROTECTED[path] && hashes[path] !== PROTECTED[path]) failHarness("COMMITTED_ARTIFACT_MISMATCH");
    if (path.endsWith(".mjs")) {
      for (const match of bytes.toString("utf8").matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.[^"']+)["']/g))
        pending.push(posix.normalize(posix.join(posix.dirname(path), match[1])));
      if (/\bimport\s*\(/.test(bytes.toString("utf8"))) failHarness("DYNAMIC_EXECUTION_DEPENDENCY_REJECTED");
    }
  }
  if (!Buffer.isBuffer(executingBytes) || hashBytes(executingBytes) !== hashes[RUNNER]) failHarness("RUNNER_ARTIFACT_MISMATCH");
  return { runnerArtifactExact: true, protectedArtifactsExact: true, artifactHashes: hashes };
}
export function extractProvider(bytes) {
  if (!Buffer.isBuffer(bytes) || hashBytes(bytes) !== PROVIDER_SHA) failHarness("PROVIDER_SHA_MISMATCH");
  assertMigration(bytes);
  const source = bytes.toString("utf8"), start = source.indexOf("do $lead_insert$"), end = source.lastIndexOf("commit;");
  if (start < 0 || end <= start || source.slice(end) !== "commit;\n") failHarness("PROVIDER_BOUNDARY_MISMATCH");
  return { begin: source.slice(0, start) + "lock table public.institutional_leads in access exclusive mode;",
    body: source.slice(start, end), bodySha256: hashBytes(source.slice(start, end)) };
}
export function verifyAccounting(before, after) {
  if (!preserved(before, after)) failHarness("PROTECTED_CATALOG_CHANGED");
  const a = before.get(SERVICE_FORENSIC_QUERY_ID), b = after.get(SERVICE_FORENSIC_QUERY_ID);
  const key = (row) => JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)));
  const previous = new Set(a.tableAcls.map(key));
  const added = b.tableAcls.filter((row) => !previous.has(key(row)));
  const expected = { table: "institutional_leads", schema: "public", grantee: "service_role", grantor: "postgres", grantable: false, privilege: "INSERT" };
  if (!exactServiceRows(added, [expected]) || !exactServiceRows(a.tableAcls, b.tableAcls.filter((row) => !exactServiceRows([row], [expected]))))
    failHarness("RAW_PRIVILEGE_DELTA_MISMATCH");
  const projected = structuredClone(b.effectiveTablePrivileges);
  const inserted = projected.filter((row) => row.table === "institutional_leads" && row.privilege === "INSERT");
  if (inserted.length !== 1 || inserted[0].granted !== true) failHarness("EFFECTIVE_PRIVILEGE_DELTA_MISMATCH");
  inserted[0].granted = false;
  if (!exactServiceRows(a.effectiveTablePrivileges, projected)) failHarness("EFFECTIVE_PRIVILEGE_DELTA_MISMATCH");
  return { ...EXPECTED_ACCOUNTING };
}
export function prepare(environment, dependencies, runnerBytes) {
  const git = dependencies.git ?? defaultGit, head = authorize(environment, dependencies.argument, git);
  const integrity = verifyArtifacts(git, head, runnerBytes(), dependencies.readCheckout);
  const target = resolveCurrentHarnessTarget(environment, VARIABLES[2], VARIABLES[4]);
  // Reject duplicate URL options as well as the exact shared Session Pooler target checks.
  if ([...new URL(environment[VARIABLES[4]]).searchParams].length !== 1) failHarness("TARGET_MISMATCH");
  const bytes = Buffer.from(git(["show", `${head}:${MIGRATION}`])); extractProvider(bytes);
  const metadata = { approvedHead: head, target: TARGET, ...integrity, artifact: { path: MIGRATION, sha256: PROVIDER_SHA }, scopeBoundary: BOUNDARY };
  serialize(metadata, environment);
  return { bytes, metadata, connectionEnvironment: target.connectionEnvironment };
}
