import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path, { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  authorizeBaselineValidationTarget,
  SKIPPED_BASELINE_TARGET_MESSAGE,
} from "./baseline-validation-target.mjs";

const require = createRequire(import.meta.url);
const cliPackages = {
  darwin: {
    arm64: ["@supabase/cli-darwin-arm64"],
    x64: ["@supabase/cli-darwin-x64"],
  },
  linux: {
    arm64: [
      "@supabase/cli-linux-arm64",
      "@supabase/cli-linux-arm64-musl",
    ],
    x64: [
      "@supabase/cli-linux-x64",
      "@supabase/cli-linux-x64-musl",
    ],
  },
  win32: {
    arm64: ["@supabase/cli-windows-arm64"],
    x64: ["@supabase/cli-windows-x64"],
  },
};

export function resolveLocalSupabaseCliBinary({
  platform = process.platform,
  architecture = process.arch,
  resolvePackage = (specifier) => require.resolve(specifier),
  fileExists = existsSync,
} = {}) {
  const candidates = cliPackages[platform]?.[architecture] ?? [];
  const pathApi = platform === "win32" ? path.win32 : path.posix;

  for (const packageName of candidates) {
    try {
      const packageJson = resolvePackage(`${packageName}/package.json`);
      const executable = pathApi.join(
        pathApi.dirname(packageJson),
        "bin",
        platform === "win32" ? "supabase.exe" : "supabase"
      );
      if (fileExists(executable)) return executable;
    } catch {
      // npm installs only the optional binary matching the current platform.
    }
  }

  throw new Error(
    `The pinned local Supabase CLI binary is unavailable for ${platform}-${architecture}.`
  );
}

export function createSanitizedSupabaseError(
  label,
  result,
  environment = process.env
) {
  const raw = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const secrets = [
    environment.SUPABASE_DB_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
  ];

  try {
    const databaseUrl = new URL(environment.SUPABASE_DB_URL);
    secrets.push(
      databaseUrl.password,
      decodeURIComponent(databaseUrl.password)
    );
  } catch {
    // An invalid URL is reported by the target guard without exposing it.
  }

  let safe = raw;
  for (const secret of secrets.filter(Boolean).sort(
    (left, right) => right.length - left.length
  )) {
    safe = safe.replaceAll(secret, "[REDACTED]");
  }
  safe = safe
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")
    .slice(0, 1200);

  const errorCode = String(result.error?.code ?? "UNKNOWN")
    .replace(/[^A-Z0-9_-]/gi, "")
    .slice(0, 80);
  return new Error(
    `${label} failed without applying changes (process error: ${errorCode}): ${safe}`
  );
}

export function runLocalSupabase(
  arguments_,
  label,
  {
    executable = resolveLocalSupabaseCliBinary(),
    spawn = spawnSync,
    environment = process.env,
  } = {}
) {
  const result = spawn(executable, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw createSanitizedSupabaseError(label, result, environment);
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

export async function runBaselinePreflight() {
  const authorization = authorizeBaselineValidationTarget({
    requireConnectionVariables: true,
  });

  if (!authorization.allowed) {
    process.stdout.write(`${SKIPPED_BASELINE_TARGET_MESSAGE}\n`);
    return;
  }

  const scratch = mkdtempSync(
    join(tmpdir(), "reflab-baseline-preflight-")
  );
  const dumpPath = join(scratch, "schema.sql");
  const dbUrl = process.env.SUPABASE_DB_URL;

  try {
    const migrationOutput = runLocalSupabase(
      ["migration", "list", "--db-url", dbUrl],
      "Migration-history preflight"
    );
    const migrationVersions =
      migrationOutput.match(/\b20\d{12}\b/g) ?? [];

    runLocalSupabase(
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
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await runBaselinePreflight();
}
