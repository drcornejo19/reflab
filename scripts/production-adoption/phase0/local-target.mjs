const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function authorizeLocalPostgresTarget(environment = process.env) {
  const host = String(environment.PGHOST ?? "").toLowerCase();
  const port = String(environment.PGPORT ?? "5432");
  const database = String(environment.PGDATABASE ?? "");

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error("Phase 0 rehearsal requires an explicit local PostgreSQL host.");
  }
  if (!/^\d{2,5}$/.test(port) || port === "6543") {
    throw new Error("Phase 0 rehearsal requires a local PostgreSQL session port.");
  }
  if (!database || database.toLowerCase().includes("supabase.co")) {
    throw new Error("Phase 0 rehearsal requires an explicit local database name.");
  }

  return {
    PGHOST: host,
    PGPORT: port,
    PGDATABASE: database,
    PGUSER: String(environment.PGUSER ?? "postgres"),
    PGPASSWORD: String(environment.PGPASSWORD ?? ""),
    PGSSLMODE: "disable",
  };
}
