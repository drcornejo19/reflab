import process from "node:process";

export const FORBIDDEN_PRODUCTION_PROJECT_REF =
  "nagjddldrldwavmfaytc";
export const SKIPPED_BASELINE_TARGET_MESSAGE =
  "SKIPPED: isolated baseline validation target not configured";

function getProjectRefFromSupabaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseUrlMatchesProject(value, projectRef) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    const username = decodeURIComponent(parsed.username).toLowerCase();
    return (
      hostname === `db.${projectRef}.supabase.co` ||
      username === `postgres.${projectRef}` ||
      username.endsWith(`.${projectRef}`)
    );
  } catch {
    return false;
  }
}

export function evaluateBaselineValidationTarget(
  environment,
  { requireConnectionVariables = false } = {}
) {
  const actualRef = environment.SUPABASE_PROJECT_REF?.trim();
  const expectedRef =
    environment.EXPECTED_TEST_SUPABASE_PROJECT_REF?.trim();
  const urlRef = getProjectRefFromSupabaseUrl(
    environment.NEXT_PUBLIC_SUPABASE_URL
  );
  const appEnvironment = environment.APP_ENV?.toLowerCase();
  const supabaseEnvironment = environment.SUPABASE_ENV?.toLowerCase();
  const nodeEnvironment = environment.NODE_ENV?.toLowerCase();

  if (
    actualRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    expectedRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    urlRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    appEnvironment === "production" ||
    supabaseEnvironment === "production" ||
    nodeEnvironment === "production"
  ) {
    throw new Error(
      "Baseline validation is blocked because a production target or environment was detected."
    );
  }

  if (
    environment.ALLOW_BASELINE_VALIDATION !== "true" ||
    !expectedRef ||
    !actualRef
  ) {
    return {
      allowed: false,
      reason: SKIPPED_BASELINE_TARGET_MESSAGE,
    };
  }

  if (!["development", "test"].includes(appEnvironment ?? "")) {
    throw new Error(
      "APP_ENV must be development or test for baseline validation."
    );
  }
  if (!["development", "test"].includes(supabaseEnvironment ?? "")) {
    throw new Error(
      "SUPABASE_ENV must be development or test for baseline validation."
    );
  }
  if (actualRef !== expectedRef || urlRef !== expectedRef) {
    throw new Error(
      "The actual Supabase project reference does not match the explicitly authorized validation project."
    );
  }

  if (requireConnectionVariables) {
    const required = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_DB_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    const missing = required.filter((name) => !environment[name]);
    if (missing.length > 0) {
      throw new Error(
        `Required baseline-validation variables are missing: ${missing.join(", ")}.`
      );
    }
    if (
      !databaseUrlMatchesProject(
        environment.SUPABASE_DB_URL,
        expectedRef
      )
    ) {
      throw new Error(
        "The database URL does not identify the explicitly authorized validation project."
      );
    }
  }

  return {
    allowed: true,
    environment: appEnvironment,
    projectRef: actualRef,
    hostname: new URL(environment.NEXT_PUBLIC_SUPABASE_URL).hostname,
  };
}

export function authorizeBaselineValidationTarget(options) {
  return evaluateBaselineValidationTarget(process.env, options);
}

