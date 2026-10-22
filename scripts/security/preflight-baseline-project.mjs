import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  authorizeBaselineValidationTarget,
  SKIPPED_BASELINE_TARGET_MESSAGE,
} from "./baseline-validation-target.mjs";

const require = createRequire(import.meta.url);
const databaseInspectionPrefix = "REFLAB_PREFLIGHT";
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

export const PREFLIGHT_DATABASE_INSPECTION_SQL = `
select concat(
  '${databaseInspectionPrefix}|',
  (
    select count(*)::text
    from information_schema.tables as table_info
    where table_info.table_schema = 'public'
      and table_info.table_type = 'BASE TABLE'
      and table_info.table_name <> 'spatial_ref_sys'
  ),
  '|',
  case when exists (
    select 1
    from pg_catalog.pg_class as relation
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'reflab_meta'
      and relation.relname = 'reflab_schema_state'
      and relation.relkind in ('r', 'p')
  ) then '1' else '0' end,
  '|',
  (
    select count(*)::text
    from storage.buckets as bucket
    where bucket.id in (
      'avatars',
      'institutional-content',
      'Videos',
      'Videos Modo Ingles'
    )
  )
) as preflight_result;
`.trim();

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
    environment.SUPABASE_SECRET_KEY,
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

export function parseRemoteMigrationCount(output) {
  for (const line of output.split(/\r?\n/)) {
    const candidate = line.trim();
    if (!candidate.startsWith("{")) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (!Array.isArray(parsed.migrations)) continue;
      return parsed.migrations.filter(
        (migration) =>
          typeof migration.remote === "string" &&
          migration.remote.trim() !== ""
      ).length;
    } catch {
      // Supabase CLI may emit non-JSON diagnostics on separate lines.
    }
  }

  throw new Error(
    "Migration-history preflight returned an unreadable response without applying changes."
  );
}

export function parseDatabaseInspection(output) {
  const escapedPrefix = databaseInspectionPrefix.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const match = output.match(
    new RegExp(`${escapedPrefix}\\|(\\d+)\\|([01])\\|(\\d+)`)
  );

  if (!match) {
    throw new Error(
      "Database inspection returned an unreadable response without applying changes."
    );
  }

  return {
    application_table_count: Number(match[1]),
    marker_exists: match[2] === "1",
    reflab_bucket_count: Number(match[3]),
  };
}

export async function runBaselinePreflight() {
  const authorization = authorizeBaselineValidationTarget({
    requireConnectionVariables: true,
  });

  if (!authorization.allowed) {
    process.stdout.write(`${SKIPPED_BASELINE_TARGET_MESSAGE}\n`);
    return;
  }

  const dbUrl = process.env.SUPABASE_DB_URL;

  const migrationOutput = runLocalSupabase(
    [
      "--output-format",
      "json",
      "migration",
      "list",
      "--db-url",
      dbUrl,
    ],
    "Migration-history preflight"
  );
  const migrationCount = parseRemoteMigrationCount(migrationOutput);

  const inspectionOutput = runLocalSupabase(
    [
      "--output-format",
      "json",
      "db",
      "query",
      "--db-url",
      dbUrl,
      PREFLIGHT_DATABASE_INSPECTION_SQL,
    ],
    "Read-only database preflight"
  );
  const inspection = parseDatabaseInspection(inspectionOutput);

  const summary = {
    environment: authorization.environment,
    project_ref: authorization.projectRef,
    hostname: authorization.hostname,
    migration_count: migrationCount,
    ...inspection,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (
    summary.migration_count !== 0 ||
    summary.application_table_count !== 0 ||
    summary.reflab_bucket_count !== 0 ||
    summary.marker_exists
  ) {
    throw new Error(
      "Baseline validation target is not empty. No migration was executed."
    );
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  await runBaselinePreflight();
}
