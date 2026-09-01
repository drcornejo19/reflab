import {
  validateCanonicalDataEnvironment,
  type CanonicalIdentityEnvironment,
} from "../identity/developmentIdentityEnvironment.ts";

const DEFAULT_LOCAL_AUTHORIZED_PARTY = "http://localhost:3000";

export type ClerkAuthorizedPartiesEnvironment =
  CanonicalIdentityEnvironment & {
    CLERK_AUTHORIZED_PARTIES?: string;
    VERCEL?: string;
  };

export type ClerkAuthorizedPartiesErrorCode =
  | "clerk_authorized_parties_missing"
  | "clerk_authorized_parties_invalid";

export class ClerkAuthorizedPartiesConfigurationError extends Error {
  readonly code: ClerkAuthorizedPartiesErrorCode;

  constructor(code: ClerkAuthorizedPartiesErrorCode) {
    super("Clerk authorized parties configuration is invalid.");
    this.name = "ClerkAuthorizedPartiesConfigurationError";
    this.code = code;
  }
}

export function resolveClerkAuthorizedParties(
  environment: ClerkAuthorizedPartiesEnvironment
) {
  const policy = validateCanonicalDataEnvironment(environment);
  const configured = environment.CLERK_AUTHORIZED_PARTIES?.trim();
  const isVercelRuntime =
    environment.VERCEL === "1" ||
    policy.deploymentEnvironment === "preview" ||
    policy.deploymentEnvironment === "production";

  if (!configured) {
    if (
      !isVercelRuntime &&
      policy.dataEnvironment === "development" &&
      policy.deploymentEnvironment === "local"
    ) {
      return [DEFAULT_LOCAL_AUTHORIZED_PARTY];
    }

    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_missing"
    );
  }

  const candidates = configured.split(",").map((candidate) => candidate.trim());
  if (candidates.some((candidate) => candidate.length === 0)) {
    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_invalid"
    );
  }

  const authorizedParties = new Set<string>();
  for (const candidate of candidates) {
    authorizedParties.add(
      parseAuthorizedParty(
        candidate,
        policy.deploymentEnvironment,
        isVercelRuntime
      )
    );
  }

  return [...authorizedParties];
}

export function assertClerkAuthorizedPartiesAtStartup(
  environment: ClerkAuthorizedPartiesEnvironment
) {
  return resolveClerkAuthorizedParties(environment);
}

function parseAuthorizedParty(
  candidate: string,
  deploymentEnvironment: "local" | "development" | "preview" | "production",
  isVercelRuntime: boolean
) {
  if (
    candidate.includes("*") ||
    candidate.includes("\\") ||
    candidate.includes("%") ||
    !/^https?:\/\/[^/?#]+\/?$/i.test(candidate)
  ) {
    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_invalid"
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_invalid"
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_invalid"
    );
  }

  if (parsed.protocol === "https:") {
    return parsed.origin;
  }

  const localHttpAllowed =
    parsed.protocol === "http:" &&
    parsed.hostname === "localhost" &&
    parsed.port.length > 0 &&
    !isVercelRuntime &&
    (deploymentEnvironment === "local" ||
      deploymentEnvironment === "development");

  if (!localHttpAllowed) {
    throw new ClerkAuthorizedPartiesConfigurationError(
      "clerk_authorized_parties_invalid"
    );
  }

  return parsed.origin;
}
