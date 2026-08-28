import { DEVELOPMENT_PROJECT_REF, PRODUCTION_PROJECT_REF } from "./manifest.mjs";

export const PREFLIGHT_OPT_IN = "ALLOW_PRODUCTION_READ_ONLY_PREFLIGHT";
export const PREFLIGHT_PROJECT_REF = "REFLAB_PRODUCTION_PREFLIGHT_PROJECT_REF";
export const PREFLIGHT_DATABASE_URL = "REFLAB_PRODUCTION_PREFLIGHT_DB_URL";

export function authorizeProductionPreflightTarget(environment = process.env) {
  const values = Object.values(environment).filter((value) => typeof value === "string");
  if (values.some((value) => value.includes(DEVELOPMENT_PROJECT_REF))) {
    throw new Error("Production preflight aborted: Development project reference detected.");
  }
  if (environment[PREFLIGHT_OPT_IN] !== "true") {
    throw new Error("Production preflight requires an explicit read-only opt-in.");
  }
  if (environment[PREFLIGHT_PROJECT_REF] !== PRODUCTION_PROJECT_REF) {
    throw new Error("Production preflight project reference is not allowlisted.");
  }

  const rawDatabaseUrl = environment[PREFLIGHT_DATABASE_URL];
  let parsed;
  try {
    parsed = new URL(rawDatabaseUrl ?? "");
  } catch {
    throw new Error("Production preflight database URL is invalid.");
  }

  const allowedHost = `db.${PRODUCTION_PROJECT_REF}.supabase.co`;
  const allowedParameters = new Set(["sslmode"]);
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname.toLowerCase() !== allowedHost ||
    !["", "5432"].includes(parsed.port) ||
    parsed.pathname !== "/postgres" ||
    parsed.hash ||
    !parsed.username ||
    !parsed.password ||
    [...parsed.searchParams.keys()].some((key) => !allowedParameters.has(key)) ||
    parsed.searchParams.get("sslmode") !== "require"
  ) {
    throw new Error("Production preflight database target is not the exact allowlisted host.");
  }

  return {
    projectRef: PRODUCTION_PROJECT_REF,
    host: allowedHost,
    connectionEnvironment: {
      PGHOST: allowedHost,
      PGPORT: parsed.port || "5432",
      PGDATABASE: "postgres",
      PGUSER: decodeURIComponent(parsed.username),
      PGPASSWORD: decodeURIComponent(parsed.password),
      PGSSLMODE: "require",
    },
  };
}
