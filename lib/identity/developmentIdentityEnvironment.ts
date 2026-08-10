export const DEVELOPMENT_SUPABASE_PROJECT_REF = "bthnhbpgiyuajsgoccrp";
export const FORBIDDEN_PRODUCTION_PROJECT_REF = "nagjddldrldwavmfaytc";

export type CanonicalIdentityEnvironment = {
  APP_ENV?: string;
  CLERK_ENV?: string;
  ENABLE_DEVELOPMENT_IDENTITY_LINKER?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NODE_ENV?: string;
  SUPABASE_ENV?: string;
  SUPABASE_PROJECT_REF?: string;
};

export class DevelopmentIdentityLinkerConfigurationError extends Error {
  constructor() {
    super("Development identity linker is unavailable in this environment.");
    this.name = "DevelopmentIdentityLinkerConfigurationError";
  }
}

export function requiresCanonicalDevelopmentIdentity(
  environment: CanonicalIdentityEnvironment
) {
  const appEnvironment = normalized(environment.APP_ENV);
  const clerkEnvironment = normalized(environment.CLERK_ENV);
  const nodeEnvironment = normalized(environment.NODE_ENV);
  const supabaseEnvironment = normalized(environment.SUPABASE_ENV);
  const configuredProjectRef = normalized(environment.SUPABASE_PROJECT_REF);
  const enabled = normalized(
    environment.ENABLE_DEVELOPMENT_IDENTITY_LINKER
  );
  const parsedUrl = parseSupabaseUrl(environment.NEXT_PUBLIC_SUPABASE_URL);
  const configuredHost = parsedUrl?.hostname.toLowerCase() ?? "";
  const developmentConfigured =
    appEnvironment === "development" ||
    clerkEnvironment === "development" ||
    supabaseEnvironment === "development" ||
    configuredProjectRef === DEVELOPMENT_SUPABASE_PROJECT_REF ||
    configuredHost === `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co` ||
    enabled === "true";
  const productionConfigured =
    configuredProjectRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    configuredHost === `${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`;

  if (!developmentConfigured) return false;

  if (
    productionConfigured ||
    nodeEnvironment === "production" ||
    appEnvironment !== "development" ||
    clerkEnvironment !== "development" ||
    supabaseEnvironment !== "development" ||
    configuredProjectRef !== DEVELOPMENT_SUPABASE_PROJECT_REF ||
    configuredHost !== `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co` ||
    parsedUrl?.protocol !== "https:" ||
    parsedUrl?.username ||
    parsedUrl?.password ||
    parsedUrl?.port
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  return true;
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function parseSupabaseUrl(value: string | undefined) {
  try {
    return new URL(value ?? "");
  } catch {
    return null;
  }
}
