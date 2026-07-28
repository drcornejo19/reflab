import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  authorizeBaselineValidationTarget,
  SKIPPED_BASELINE_TARGET_MESSAGE,
} from "./baseline-validation-target.mjs";

const authorization = authorizeBaselineValidationTarget({
  requireConnectionVariables: true,
});

if (!authorization.allowed) {
  process.stdout.write(`${SKIPPED_BASELINE_TARGET_MESSAGE}\n`);
  process.exit(0);
}

const scratch = mkdtempSync(join(tmpdir(), "reflab-baseline-preflight-"));
const dumpPath = join(scratch, "schema.sql");
const dbUrl = process.env.SUPABASE_DB_URL;

function sanitizedError(label, result) {
  const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const safe = raw
    .replaceAll(dbUrl, "[REDACTED_DB_URL]")
    .replaceAll(process.env.SUPABASE_SERVICE_ROLE_KEY, "[REDACTED_KEY]")
    .slice(0, 1200);
  return new Error(`${label} failed without applying changes: ${safe}`);
}

function runSupabase(arguments_, label) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    executable,
    ["--no-install", "supabase", ...arguments_],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      windowsHide: true,
    }
  );
  if (result.status !== 0) throw sanitizedError(label, result);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

try {
  const migrationOutput = runSupabase(
    ["migration", "list", "--db-url", dbUrl],
    "Migration-history preflight"
  );
  const migrationVersions =
    migrationOutput.match(/\b20\d{12}\b/g) ?? [];

  runSupabase(
    ["db", "dump", "--db-url", dbUrl, "--file", dumpPath],
    "Schema preflight"
  );
  const dump = readFileSync(dumpPath, "utf8");
  const publicTables = [
    ...dump.matchAll(
      /CREATE TABLE (?:ONLY )?public\.("?[\w]+"?)/gi
    ),
  ].map((match) => match[1].replaceAll('"', ""));
  const applicationTables = publicTables.filter(
    (table) => table !== "spatial_ref_sys"
  );
  const markerExists =
    /reflab_meta\.reflab_schema_state/i.test(dump);

  const storageResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/bucket`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!storageResponse.ok) {
    throw new Error(
      `Storage preflight failed with HTTP ${storageResponse.status}.`
    );
  }
  const buckets = await storageResponse.json();

  const summary = {
    environment: authorization.environment,
    project_ref: authorization.projectRef,
    hostname: authorization.hostname,
    migration_count: new Set(migrationVersions).size,
    application_table_count: applicationTables.length,
    bucket_count: Array.isArray(buckets) ? buckets.length : -1,
    marker_exists: markerExists,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (
    summary.migration_count !== 0 ||
    summary.application_table_count !== 0 ||
    summary.bucket_count !== 0 ||
    summary.marker_exists
  ) {
    throw new Error(
      "Baseline validation target is not empty. No migration was executed."
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

