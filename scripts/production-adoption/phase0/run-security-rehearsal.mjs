import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { buildPsqlEnvironment } from "../../production-preflight/run.mjs";
import { authorizeLocalPostgresTarget } from "./local-target.mjs";

const directory = dirname(fileURLToPath(import.meta.url));
const positiveSql = readFileSync(resolve(directory, "phase1-security-rehearsal.sql"), "utf8");
const negativeSql = readFileSync(resolve(directory, "phase1-security-rehearsal-failure.sql"), "utf8");
const verificationSql = `begin read only;
set local statement_timeout = '5s';
select pg_catalog.to_regnamespace('phase0_acl_strategy_a') is null
  and pg_catalog.to_regnamespace('phase0_acl_strategy_b') is null
  and pg_catalog.to_regnamespace('phase0_acl_expected_failure') is null;
rollback;`;

function execute(sql, environment, spawn) {
  return spawn("psql", ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: environment,
  });
}

export function runPhase1SecurityRehearsal(environment = process.env, dependencies = {}) {
  const target = authorizeLocalPostgresTarget(environment);
  const subprocessEnvironment = buildPsqlEnvironment(environment, target);
  const spawn = dependencies.spawn ?? spawnSync;

  const positive = execute(positiveSql, subprocessEnvironment, spawn);
  if (positive.error || positive.status !== 0) {
    throw new Error("Phase 1 local security rehearsal failed its positive strategies.");
  }

  const negative = execute(negativeSql, subprocessEnvironment, spawn);
  if (negative.status === 0 || !String(negative.stderr ?? "").includes("PHASE0_EXPECTED_SECURITY_ABORT")) {
    throw new Error("Phase 1 local security rehearsal did not abort on an ACL deviation.");
  }

  const verification = execute(verificationSql, subprocessEnvironment, spawn);
  if (verification.error || verification.status !== 0 || !/^t$/m.test(String(verification.stdout ?? "").trim())) {
    throw new Error("Phase 1 local security rehearsal did not roll back cleanly.");
  }
  return { strategies: ["postgres_then_revoke", "rls_owner_set_role"], rollbackVerified: true };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const result = runPhase1SecurityRehearsal();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
