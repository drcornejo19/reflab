export const DEVELOPMENT_SUPABASE_PROJECT_REF = "bthnhbpgiyuajsgoccrp";
export const PRODUCTION_SUPABASE_PROJECT_REF = "nagjddldrldwavmfaytc";
export const FORBIDDEN_PRODUCTION_PROJECT_REF = PRODUCTION_SUPABASE_PROJECT_REF;

export type CanonicalDataEnvironment = "development" | "production";
export type CanonicalDeploymentEnvironment =
  | "local"
  | "development"
  | "preview"
  | "production";

export type CanonicalDataEnvironmentPolicy = {
  dataEnvironment: CanonicalDataEnvironment;
  deploymentEnvironment: CanonicalDeploymentEnvironment;
  projectRef: string;
};

export type CanonicalIdentityEnvironment = {
  APP_ENV?: string;
  CLERK_ENV?: string;
  ENABLE_DEVELOPMENT_IDENTITY_LINKER?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NODE_ENV?: string;
  REFLAB_DATA_ENV?: string;
  SUPABASE_ENV?: string;
  SUPABASE_PROJECT_REF?: string;
  VERCEL_ENV?: string;
};

export type CanonicalDataEnvironmentErrorCode =
  | "canonical_data_environment_missing"
  | "canonical_data_environment_invalid"
  | "canonical_data_target_invalid"
  | "canonical_data_target_mismatch"
  | "canonical_deployment_data_mismatch";

export class CanonicalDataEnvironmentConfigurationError extends Error {
  readonly code: CanonicalDataEnvironmentErrorCode;

  constructor(code: CanonicalDataEnvironmentErrorCode) {
    super("Canonical data environment configuration is invalid.");
    this.name = "CanonicalDataEnvironmentConfigurationError";
    this.code = code;
  }
}

export class ProductionCanonicalIdentityUnavailableError extends Error {
  readonly code = "production_canonical_identity_unavailable";

  constructor() {
    super("Canonical Production identity resolution is not available.");
    this.name = "ProductionCanonicalIdentityUnavailableError";
  }
}

export class DevelopmentIdentityLinkerConfigurationError extends Error {
  constructor() {
    super("Development identity linker is unavailable in this environment.");
    this.name = "DevelopmentIdentityLinkerConfigurationError";
  }
}

export function validateCanonicalDataEnvironment(
  environment: CanonicalIdentityEnvironment
): CanonicalDataEnvironmentPolicy {
  const dataEnvironment = parseDataEnvironment(environment.REFLAB_DATA_ENV);
  const deploymentEnvironment = parseDeploymentEnvironment(
    environment.VERCEL_ENV
  );
  const configuredProjectRef = exactLowercaseValue(
    environment.SUPABASE_PROJECT_REF
  );
  const urlProjectRef = parseSupabaseProjectRef(
    environment.NEXT_PUBLIC_SUPABASE_URL
  );

  if (!dataEnvironment) {
    throw new CanonicalDataEnvironmentConfigurationError(
      environment.REFLAB_DATA_ENV === undefined
        ? "canonical_data_environment_missing"
        : "canonical_data_environment_invalid"
    );
  }

  if (!configuredProjectRef || !urlProjectRef) {
    throw new CanonicalDataEnvironmentConfigurationError(
      "canonical_data_target_invalid"
    );
  }

  if (configuredProjectRef !== urlProjectRef) {
    throw new CanonicalDataEnvironmentConfigurationError(
      "canonical_data_target_mismatch"
    );
  }

  const expectedProjectRef =
    dataEnvironment === "development"
      ? DEVELOPMENT_SUPABASE_PROJECT_REF
      : PRODUCTION_SUPABASE_PROJECT_REF;

  if (configuredProjectRef !== expectedProjectRef) {
    throw new CanonicalDataEnvironmentConfigurationError(
      "canonical_data_target_mismatch"
    );
  }

  const deploymentAcceptsData =
    dataEnvironment === "development"
      ? deploymentEnvironment === "local" ||
        deploymentEnvironment === "development" ||
        deploymentEnvironment === "preview"
      : deploymentEnvironment === "production";

  if (!deploymentAcceptsData) {
    throw new CanonicalDataEnvironmentConfigurationError(
      "canonical_deployment_data_mismatch"
    );
  }

  return {
    dataEnvironment,
    deploymentEnvironment,
    projectRef: configuredProjectRef,
  };
}

export function requireCanonicalIdentityPolicy(
  environment: CanonicalIdentityEnvironment
) {
  const policy = validateCanonicalDataEnvironment(environment);

  if (policy.dataEnvironment === "production") {
    throw new ProductionCanonicalIdentityUnavailableError();
  }

  return policy;
}

export function assertCanonicalIdentityEnvironmentAtStartup(
  environment: CanonicalIdentityEnvironment
) {
  return requireCanonicalIdentityPolicy(environment);
}

export function requiresCanonicalDevelopmentIdentity(
  environment: CanonicalIdentityEnvironment
) {
  return (
    validateCanonicalDataEnvironment(environment).dataEnvironment ===
    "development"
  );
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function parseDataEnvironment(
  value: string | undefined
): CanonicalDataEnvironment | null {
  const candidate = normalized(value);
  return candidate === "development" || candidate === "production"
    ? candidate
    : null;
}

function parseDeploymentEnvironment(
  value: string | undefined
): CanonicalDeploymentEnvironment {
  if (value === undefined) return "local";

  const candidate = normalized(value);
  if (
    candidate === "development" ||
    candidate === "preview" ||
    candidate === "production"
  ) {
    return candidate;
  }

  throw new CanonicalDataEnvironmentConfigurationError(
    "canonical_data_environment_invalid"
  );
}

function exactLowercaseValue(value: string | undefined) {
  if (!value || value !== value.trim() || value !== value.toLowerCase()) {
    return null;
  }
  return value;
}

function parseSupabaseProjectRef(value: string | undefined) {
  try {
    const parsedUrl = new URL(value ?? "");
    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.port ||
      (parsedUrl.pathname !== "" && parsedUrl.pathname !== "/") ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      return null;
    }

    if (
      parsedUrl.hostname ===
      `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`
    ) {
      return DEVELOPMENT_SUPABASE_PROJECT_REF;
    }
    if (
      parsedUrl.hostname === `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
    ) {
      return PRODUCTION_SUPABASE_PROJECT_REF;
    }
    return null;
  } catch {
    return null;
  }
}
