import fs from "node:fs";
import process from "node:process";

export const FORBIDDEN_PRODUCTION_PROJECT_REF =
  "nagjddldrldwavmfaytc";
export const SKIPPED_ISOLATED_TARGET_MESSAGE =
  "SKIPPED: isolated non-production Supabase target not configured";

export function loadLocalEnvironment(path = ".env.local") {
  if (!fs.existsSync(path)) return;

  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

export function getSupabaseProjectRef(urlValue) {
  if (typeof urlValue !== "string" || !urlValue.trim()) return null;

  try {
    const hostname = new URL(urlValue).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function evaluateIsolatedSupabaseTarget(
  environment,
  requiredVariables = []
) {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const actualRef =
    environment.SUPABASE_PROJECT_REF ??
    getSupabaseProjectRef(supabaseUrl);
  const expectedRef = environment.EXPECTED_TEST_SUPABASE_PROJECT_REF;
  const appEnvironment = environment.APP_ENV?.toLowerCase();
  const supabaseEnvironment = environment.SUPABASE_ENV?.toLowerCase();
  const nodeEnvironment = environment.NODE_ENV?.toLowerCase();

  if (
    actualRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    expectedRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    appEnvironment === "production" ||
    supabaseEnvironment === "production" ||
    nodeEnvironment === "production"
  ) {
    throw new Error(
      "Security tests are blocked because a production target or environment was detected."
    );
  }

  if (
    environment.ALLOW_SECURITY_TESTS !== "true" ||
    !expectedRef
  ) {
    return { allowed: false, reason: SKIPPED_ISOLATED_TARGET_MESSAGE };
  }

  if (!["development", "test"].includes(appEnvironment ?? "")) {
    throw new Error("APP_ENV must be development or test for security tests.");
  }
  if (!["development", "test"].includes(supabaseEnvironment ?? "")) {
    throw new Error(
      "SUPABASE_ENV must be development or test for security tests."
    );
  }
  if (!actualRef || actualRef !== expectedRef) {
    throw new Error(
      "The actual Supabase project reference does not match the explicitly authorized test project."
    );
  }

  const missingVariables = requiredVariables.filter(
    (name) => !environment[name]
  );
  if (missingVariables.length > 0) {
    throw new Error(
      `Required security-test variables are missing: ${missingVariables.join(", ")}.`
    );
  }

  return {
    allowed: true,
    projectRef: actualRef,
    environment: appEnvironment,
  };
}

export function authorizeIsolatedSupabaseTarget(requiredVariables = []) {
  loadLocalEnvironment();
  return evaluateIsolatedSupabaseTarget(process.env, requiredVariables);
}
