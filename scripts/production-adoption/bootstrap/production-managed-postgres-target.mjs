import { DEVELOPMENT_PROJECT_REF, PRODUCTION_PROJECT_REF } from "../../production-preflight/manifest.mjs";
import { PRODUCTION_SESSION_POOLER_HOST } from "../../production-preflight/target.mjs";
import { ROLE_BOOTSTRAP_INSTALLER } from "./production-role-bootstrap-contract.mjs";

export function resolveProductionManagedPostgresTarget(environment, {
  projectRefVariable,
  databaseUrlVariable,
  operationLabel,
}) {
  if (Object.values(environment).some((value) => typeof value === "string" && value.includes(DEVELOPMENT_PROJECT_REF))) {
    throw new Error(`${operationLabel} aborted: Development project reference detected.`);
  }
  if (environment[projectRefVariable] !== PRODUCTION_PROJECT_REF) {
    throw new Error(`${operationLabel} project reference is not allowlisted.`);
  }
  let parsed;
  try {
    parsed = new URL(environment[databaseUrlVariable] ?? "");
  } catch {
    throw new Error(`${operationLabel} database URL is invalid.`);
  }
  const directHost = `db.${PRODUCTION_PROJECT_REF}.supabase.co`;
  const targets = new Map([
    [directHost, { username: ROLE_BOOTSTRAP_INSTALLER, ports: new Set(["", "5432"]) }],
    [PRODUCTION_SESSION_POOLER_HOST, {
      username: `${ROLE_BOOTSTRAP_INSTALLER}.${PRODUCTION_PROJECT_REF}`,
      ports: new Set(["5432"]),
    }],
  ]);
  const host = parsed.hostname.toLowerCase();
  const target = targets.get(host);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || !target || !target.ports.has(parsed.port) || parsed.pathname !== "/postgres"
      || parsed.hash || parsed.username !== target.username || !parsed.password
      || [...parsed.searchParams.keys()].some((key) => key !== "sslmode")
      || parsed.searchParams.get("sslmode") !== "require") {
    throw new Error(`${operationLabel} database target is not the exact allowlisted host.`);
  }
  return {
    projectRef: PRODUCTION_PROJECT_REF,
    host,
    connectionEnvironment: {
      PGHOST: host,
      PGPORT: parsed.port || "5432",
      PGDATABASE: "postgres",
      PGUSER: target.username,
      PGPASSWORD: decodeURIComponent(parsed.password),
      PGSSLMODE: "require",
    },
  };
}

export function assertRepositoryAttestation({ expectedHead, actualHead, status }) {
  if (!/^[0-9a-f]{40}$/.test(expectedHead ?? "") || actualHead !== expectedHead) {
    throw new Error("Production operation frozen HEAD attestation failed.");
  }
  if (String(status).trim()) throw new Error("Production operation requires a clean worktree.");
  return true;
}

