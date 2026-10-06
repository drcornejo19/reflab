import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeReadOnlyBatch } from "../../production-preflight/run.mjs";
import { READ_ONLY_GUARD_QUERY_ID } from "../../production-preflight/queries.mjs";
import { PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PREFLIGHT_OPT_IN, PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { assertRepositoryAttestation, resolveProductionManagedPostgresTarget } from "../bootstrap/production-managed-postgres-target.mjs";
import { ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES } from "../bootstrap/production-role-bootstrap-contract.mjs";
import { INSTALLER_IDENTITY_QUERY_ID } from "../bootstrap/run-production-installer-identity-attestation.mjs";
import {
  ROLE_MEMBERSHIP_FORENSIC_FORMAT, ROLE_MEMBERSHIP_QUERY_ID,
  buildRoleMembershipForensicBatch, classifyRoleMembershipEvidence,
} from "./phase3-role-membership-forensic-contract.mjs";

export const FORENSIC_OPERATION = "--production-phase3-role-membership-forensic";
export const FORENSIC_OPT_IN = "ALLOW_PRODUCTION_PHASE3_ROLE_MEMBERSHIP_FORENSIC";
export const FORENSIC_VARIABLES = Object.freeze([
  PREFLIGHT_OPT_IN, "ALLOW_PRODUCTION_PRIVILEGED_READ_ONLY_ATTESTATION", FORENSIC_OPT_IN,
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_PROJECT_REF",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_APPROVED_HEAD",
  "REFLAB_PRODUCTION_PRIVILEGED_READ_ONLY_DB_URL",
]);
const root = resolve(import.meta.dirname, "..", "..", "..");
const allowed = new Set(FORENSIC_VARIABLES);
const substages = new Set(["OPERATION", "PG_ENVIRONMENT", "HEAD_READ", "WORKTREE_READ",
  "REPOSITORY", "AUTHORIZATION", "WRITE_CONFIGURATION", "TARGET", "MEMBERSHIP_BATCH",
  "QUERY_RESULTS", "INSTALLER", "CLASSIFICATION", "OUTPUT", "UNKNOWN"]);
const reasons = new Set(["OPERATION_NOT_AUTHORIZED", "OPT_IN_REQUIRED", "DDL_CONFIGURATION_REJECTED",
  "INHERITED_PG_STATE", "HEAD_MISMATCH", "WORKTREE_DIRTY", "TARGET_MISMATCH",
  "PSQL_NOT_FOUND", "AUTHENTICATION_FAILED", "HOST_RESOLUTION_FAILED", "TLS_FAILED",
  "CONNECTION_FAILED", "DATABASE_UNAVAILABLE", "TIMEOUT", "READ_ONLY_GUARD_FAILED",
  "JSON_PARSE_FAILED", "QUERY_RESULT_SHAPE_MISMATCH", "PRE_CLASSIFICATION_FAILED",
  "LOCAL_PROGRAMMING_ERROR", "PSQL_PROCESS_FAILED", "INSTALLER_MISMATCH"]);
export class ForensicFailure extends Error {
  constructor(substage, reason, details = {}) {
    super(reason);
    this.substage = substages.has(substage) ? substage : "UNKNOWN";
    this.reason = reasons.has(reason) || /^SQLSTATE_[0-9A-Z]{5}$/.test(reason)
      ? reason : "LOCAL_PROGRAMMING_ERROR";
    this.query = [ROLE_MEMBERSHIP_QUERY_ID, INSTALLER_IDENTITY_QUERY_ID, READ_ONLY_GUARD_QUERY_ID].includes(details.query)
      ? details.query : "NONE";
    this.sqlstate = /^[0-9A-Z]{5}$/.test(details.sqlstate ?? "") ? details.sqlstate : null;
    this.psqlExitStatus = Number.isInteger(details.psqlExitStatus) ? details.psqlExitStatus : null;
    this.stderrClass = details.stderrClass ?? "NOT_AVAILABLE";
  }
}
export function safeForensicFailure(error) {
  const failure = error instanceof ForensicFailure ? error
    : new ForensicFailure("UNKNOWN", "LOCAL_PROGRAMMING_ERROR");
  return {
    format: "REFLAB_64236_MEMBERSHIP_FORENSIC_FAIL", stage: "READ_ONLY_FORENSIC",
    substage: failure.substage, query: failure.query, reason: failure.reason,
    sqlstate: failure.sqlstate, psqlExitStatus: failure.psqlExitStatus,
    stderrClass: ["NOT_AVAILABLE", "PROCESS_SPAWN_ERROR", "AUTHENTICATION_ERROR",
      "HOST_RESOLUTION_ERROR", "TLS_ERROR", "CONNECTION_ERROR", "DATABASE_ERROR",
      "TIMEOUT", "SQLSTATE_ERROR", "UNCLASSIFIED_PROCESS_ERROR"].includes(failure.stderrClass)
      ? failure.stderrClass : "UNCLASSIFIED_PROCESS_ERROR",
  };
}
function at(substage, reason, callback) {
  try { return callback(); } catch (error) {
    if (error instanceof ForensicFailure) throw error;
    throw new ForensicFailure(substage, reason);
  }
}
export function processFailure(error, evidence = {}) {
  const text = String(evidence.stderr ?? "") + "\n" + String(error?.message ?? "");
  const sqlstate = text.match(/(?:ERROR|FATAL|PANIC):\s+([0-9A-Z]{5}):|SQLSTATE[_=:\s-]*([0-9A-Z]{5})/i)
    ?.slice(1).find(Boolean)?.toUpperCase();
  let reason = "PSQL_PROCESS_FAILED";
  let stderrClass = "UNCLASSIFIED_PROCESS_ERROR";
  if (evidence.code === "ENOENT") { reason = "PSQL_NOT_FOUND"; stderrClass = "PROCESS_SPAWN_ERROR"; }
  else if (evidence.code === "ETIMEDOUT" || sqlstate === "57014" || /statement timeout|lock timeout/i.test(text)) {
    reason = "TIMEOUT"; stderrClass = "TIMEOUT";
  } else if (sqlstate?.startsWith("28") || /authentication failed|no password supplied/i.test(text)) {
    reason = "AUTHENTICATION_FAILED"; stderrClass = "AUTHENTICATION_ERROR";
  } else if (/could not translate host name|getaddrinfo|name resolution/i.test(text)) {
    reason = "HOST_RESOLUTION_FAILED"; stderrClass = "HOST_RESOLUTION_ERROR";
  } else if (/ssl|tls|certificate/i.test(text)) { reason = "TLS_FAILED"; stderrClass = "TLS_ERROR"; }
  else if (sqlstate === "3D000") { reason = "DATABASE_UNAVAILABLE"; stderrClass = "DATABASE_ERROR"; }
  else if (sqlstate?.startsWith("08") || /connection refused|could not connect|connection to server|server closed/i.test(text)) {
    reason = "CONNECTION_FAILED"; stderrClass = "CONNECTION_ERROR";
  } else if (sqlstate) { reason = "SQLSTATE_" + sqlstate; stderrClass = "SQLSTATE_ERROR"; }
  if (error instanceof SyntaxError) reason = "JSON_PARSE_FAILED";
  else if (/transaction_read_only was not confirmed as on/i.test(text)) reason = "READ_ONLY_GUARD_FAILED";
  else if (/invalid result frame|duplicate query|expected a Map/i.test(text)) reason = "QUERY_RESULT_SHAPE_MISMATCH";
  return new ForensicFailure("MEMBERSHIP_BATCH", reason, {
    query: [ROLE_MEMBERSHIP_QUERY_ID, INSTALLER_IDENTITY_QUERY_ID, READ_ONLY_GUARD_QUERY_ID]
      .find((id) => String(error?.message ?? "").includes(id)),
    sqlstate, psqlExitStatus: evidence.status, stderrClass,
  });
}
export function executeMembershipReadOnlyBatch(sql, connectionEnvironment, {
  spawn = spawnSync, processEnvironment = process.env,
} = {}) {
  const evidence = {};
  const observingSpawn = (command, args, options) => {
    try {
      const result = spawn(command, [...args, "--set", "VERBOSITY=verbose"],
        { ...options, timeout: 30000, windowsHide: true });
      Object.assign(evidence, { code: result?.error?.code, status: result?.status, stderr: result?.stderr });
      return result;
    } catch (error) { evidence.code = error?.code; throw error; }
  };
  try { return executeReadOnlyBatch(sql, connectionEnvironment, { spawn: observingSpawn, processEnvironment }); }
  catch (error) { throw processFailure(error, evidence); }
}
export function assertForensicAuthorization(environment) {
  if (Object.keys(environment).some((key) => /^REFLAB_PRODUCTION_DDL_/i.test(key)
      || (/^ALLOW_PRODUCTION_/i.test(key) && !allowed.has(key.toUpperCase())))) {
    throw new ForensicFailure("WRITE_CONFIGURATION", "DDL_CONFIGURATION_REJECTED");
  }
  if (FORENSIC_VARIABLES.slice(0, 3).some((key) => environment[key] !== "true")) {
    throw new ForensicFailure("AUTHORIZATION", "OPT_IN_REQUIRED");
  }
}
export function resolveForensicTarget(environment) {
  const target = at("TARGET", "TARGET_MISMATCH", () => resolveProductionManagedPostgresTarget(environment, {
    projectRefVariable: FORENSIC_VARIABLES[3], databaseUrlVariable: FORENSIC_VARIABLES[5],
    operationLabel: "ROLE_MEMBERSHIP_FORENSIC",
  }));
  const pg = target.connectionEnvironment;
  if (target.projectRef !== PRODUCTION_PROJECT_REF || target.host !== PRODUCTION_SESSION_POOLER_HOST
      || pg.PGPORT !== "5432" || pg.PGDATABASE !== "postgres"
      || pg.PGUSER !== "postgres." + PRODUCTION_PROJECT_REF || pg.PGSSLMODE !== "require") {
    throw new ForensicFailure("TARGET", "TARGET_MISMATCH");
  }
  return target;
}
export function managedInstallerExact(payload) {
  // Membership drift is the subject of this forensic, not an installer-profile gate.
  return payload?.caller === "postgres" && payload?.session_user === "postgres"
    && payload?.database?.name === "postgres" && payload?.database?.postgres_has_create === true && Math.trunc(Number(payload?.server_version_num) / 10000) === 17
    && Object.entries(ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES)
      .every(([key, value]) => payload?.installer?.[key] === value);
}
export function runRoleMembershipForensic({
  argv = process.argv.slice(2), environment = process.env,
  head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  status = () => execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" }),
  execute = executeMembershipReadOnlyBatch,
  classify = classifyRoleMembershipEvidence,
} = {}) {
  if (argv.length !== 1 || argv[0] !== FORENSIC_OPERATION) {
    throw new ForensicFailure("OPERATION", "OPERATION_NOT_AUTHORIZED");
  }
  if (Object.keys(environment).some((key) => /^PG/i.test(key))) {
    throw new ForensicFailure("PG_ENVIRONMENT", "INHERITED_PG_STATE");
  }
  const actualHead = at("HEAD_READ", "LOCAL_PROGRAMMING_ERROR", head);
  const tree = at("WORKTREE_READ", "LOCAL_PROGRAMMING_ERROR", status);
  at("REPOSITORY", actualHead !== environment[FORENSIC_VARIABLES[4]] ? "HEAD_MISMATCH" : "WORKTREE_DIRTY",
    () => assertRepositoryAttestation({ expectedHead: environment[FORENSIC_VARIABLES[4]], actualHead, status: tree }));
  assertForensicAuthorization(environment);
  const target = resolveForensicTarget(environment);
  const results = execute(buildRoleMembershipForensicBatch(), target.connectionEnvironment,
    { processEnvironment: environment });
  if (!(results instanceof Map) || !results.has(INSTALLER_IDENTITY_QUERY_ID) || !results.has(ROLE_MEMBERSHIP_QUERY_ID)) {
    throw new ForensicFailure("QUERY_RESULTS", "QUERY_RESULT_SHAPE_MISMATCH");
  }
  if (!managedInstallerExact(results.get(INSTALLER_IDENTITY_QUERY_ID))) {
    throw new ForensicFailure("INSTALLER", "INSTALLER_MISMATCH", { query: INSTALLER_IDENTITY_QUERY_ID });
  }
  const report = at("CLASSIFICATION", "PRE_CLASSIFICATION_FAILED",
    () => classify(results.get(ROLE_MEMBERSHIP_QUERY_ID)));
  return { format: ROLE_MEMBERSHIP_FORENSIC_FORMAT, targetExact: true, ...report };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = runRoleMembershipForensic();
    at("OUTPUT", "LOCAL_PROGRAMMING_ERROR", () => process.stdout.write(JSON.stringify(report, null, 2) + "\n"));
    process.exitCode = report.classification === "EXACT_APPROVED_MEMBERSHIP_STATE" ? 0 : 2;
  } catch (error) {
    process.stderr.write(JSON.stringify(safeForensicFailure(error)) + "\n");
    process.exitCode = 1;
  }
}
