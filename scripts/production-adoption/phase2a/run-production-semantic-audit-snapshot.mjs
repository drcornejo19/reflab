import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSqlBatch, semanticAuditSnapshotQuery } from "../../production-preflight/queries.mjs";
import { executeReadOnlyBatch, sanitizeProcessOutput } from "../../production-preflight/run.mjs";
import { expandSemanticAuditSnapshot } from "../../production-preflight/semantic-audit.mjs";
import { authorizeProductionPreflightTarget } from "../../production-preflight/target.mjs";
import { assertNoInheritedPgState } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import { assertRepositoryAttestation } from "../bootstrap/run-production-role-bootstrap.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
export const SEMANTIC_AUDIT_SNAPSHOT_OPERATION = "--production-semantic-audit-snapshot";
export const SEMANTIC_AUDIT_SNAPSHOT_OPT_IN = "ALLOW_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT";
export const SEMANTIC_AUDIT_SNAPSHOT_APPROVED_HEAD = "REFLAB_PRODUCTION_SEMANTIC_AUDIT_APPROVED_HEAD";

export function buildSemanticAuditSnapshotBatch() { return buildSqlBatch([semanticAuditSnapshotQuery]); }

export function runProductionSemanticAuditSnapshot(environment = process.env, dependencies = {}) {
  if (dependencies.argument !== SEMANTIC_AUDIT_SNAPSHOT_OPERATION) throw new Error("Production semantic audit snapshot requires its exact operation argument.");
  if (environment[SEMANTIC_AUDIT_SNAPSHOT_OPT_IN] !== "true") throw new Error("Production semantic audit snapshot requires its dedicated opt-in.");
  assertNoInheritedPgState(environment);
  const git = dependencies.git ?? ((args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }));
  const actualHead = git(["rev-parse", "HEAD"]).trim();
  const status = git(["status", "--short"]);
  assertRepositoryAttestation({ expectedHead: environment[SEMANTIC_AUDIT_SNAPSHOT_APPROVED_HEAD], actualHead, status });
  const target = (dependencies.authorize ?? authorizeProductionPreflightTarget)(environment);
  const results = (dependencies.executeReadOnly ?? executeReadOnlyBatch)(buildSemanticAuditSnapshotBatch(), target.connectionEnvironment, { processEnvironment: environment });
  const snapshot = results.get(semanticAuditSnapshotQuery.id);
  expandSemanticAuditSnapshot(snapshot);
  return { format: "REFLAB_PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT_V1",
    target: { projectRef: target.projectRef, host: target.host, database: "postgres" },
    caller: "reflab_prod_preflight_ro", readOnly: true, head: actualHead, snapshot, nextMigration: "NOT_AUTHORIZED" };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.length === 3 ? process.argv[2] : undefined;
  Promise.resolve().then(() => runProductionSemanticAuditSnapshot(process.env, { argument }))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => { process.stderr.write(`PRODUCTION_SEMANTIC_AUDIT_SNAPSHOT_FAIL: ${sanitizeProcessOutput(error.message)}\n`); process.exitCode = 1; });
}
