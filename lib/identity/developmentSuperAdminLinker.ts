import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  DevelopmentIdentityLinkerConfigurationError,
  requiresCanonicalDevelopmentIdentity,
} from "./developmentIdentityEnvironment.ts";

export const DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER =
  "x-reflab-development-super-admin-identity-link-secret";
export const DEVELOPMENT_SUPER_ADMIN_CANONICAL_USER_ID =
  "user_dev_super_admin";

const MINIMUM_DEVELOPMENT_SECRET_LENGTH = 32;
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);
const LOOPBACK_FORWARDED_FOR_VALUES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);
const DEPLOYED_RUNTIME_VARIABLES = [
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_REGION",
] as const;
const SUPER_ADMIN_IDENTITY_LINK_PATH =
  "/api/development/super-admin-identity-link";

export type DevelopmentSuperAdminIdentityLinkStatus =
  | "created"
  | "already_linked"
  | "conflict";

type RpcError = {
  code?: string;
};

type SuperAdminIdentityLinkRpcClient = {
  rpc(
    functionName: "link_development_super_admin_clerk_identity",
    parameters: { p_external_subject: string }
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type LinkerOptions = {
  environment?: NodeJS.ProcessEnv;
  createClient?: () => SuperAdminIdentityLinkRpcClient;
};

export type DevelopmentSuperAdminIdentityLinkRequestOptions =
  LinkerOptions & {
    getAuthenticatedUserId: () => Promise<string | null>;
    linkIdentity?: (
      externalSubject: string,
      options?: LinkerOptions
    ) => Promise<DevelopmentSuperAdminIdentityLinkStatus>;
  };

type HandlerResult = {
  status: number;
  body:
    | { status: DevelopmentSuperAdminIdentityLinkStatus }
    | { error: string };
};

export class DevelopmentSuperAdminIdentityLinkerRpcError extends Error {
  readonly code?: string;

  constructor(code?: string) {
    super("Development Super Admin identity link operation failed.");
    this.name = "DevelopmentSuperAdminIdentityLinkerRpcError";
    this.code = code;
  }
}

export function assertDevelopmentSuperAdminIdentityLinkerEnvironment(
  environment: NodeJS.ProcessEnv = process.env
) {
  const enabled = normalized(
    environment.ENABLE_DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINKER
  );
  const configuredSecret =
    environment.DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET ?? "";
  const clerkPublishableKey =
    environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const clerkSecretKey = environment.CLERK_SECRET_KEY ?? "";

  if (
    !requiresCanonicalDevelopmentIdentity(environment) ||
    enabled !== "true" ||
    normalized(environment.NODE_ENV) !== "development" ||
    !clerkPublishableKey.startsWith("pk_test_") ||
    !clerkSecretKey.startsWith("sk_test_") ||
    configuredSecret.length < MINIMUM_DEVELOPMENT_SECRET_LENGTH ||
    !environment.SUPABASE_SERVICE_ROLE_KEY ||
    DEPLOYED_RUNTIME_VARIABLES.some((name) =>
      Boolean(environment[name]?.trim())
    )
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }
}

export function assertDevelopmentSuperAdminIdentityLinkerRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env
) {
  assertDevelopmentSuperAdminIdentityLinkerEnvironment(environment);

  const requestUrl = new URL(request.url);
  const requestOrigin = parseOrigin(request.headers.get("origin"));
  const requestHost = request.headers.get("host")?.trim().toLowerCase();
  const forwardedFor = request.headers.get("x-forwarded-for");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (
    requestUrl.protocol !== "http:" ||
    requestUrl.username ||
    requestUrl.password ||
    requestUrl.pathname !== SUPER_ADMIN_IDENTITY_LINK_PATH ||
    !LOOPBACK_HOSTNAMES.has(requestUrl.hostname.toLowerCase()) ||
    !requestOrigin ||
    requestOrigin.protocol !== "http:" ||
    !LOOPBACK_HOSTNAMES.has(requestOrigin.hostname.toLowerCase()) ||
    requestOrigin.origin !== requestUrl.origin ||
    requestHost !== requestUrl.host.toLowerCase() ||
    request.headers.has("forwarded") ||
    !isValidOptionalForwardedHeader(forwardedFor, (value) =>
      LOOPBACK_FORWARDED_FOR_VALUES.has(value)
    ) ||
    !isValidOptionalForwardedHeader(
      forwardedHost,
      (value) =>
        value === requestHost && value === requestUrl.host.toLowerCase()
    ) ||
    !isValidOptionalForwardedHeader(
      forwardedProto,
      (value) => value === "http"
    )
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  const providedSecret =
    request.headers.get(
      DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER
    ) ?? "";
  const configuredSecret =
    environment.DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET ?? "";

  if (!constantTimeSecretEqual(providedSecret, configuredSecret)) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }
}

export async function linkDevelopmentSuperAdminClerkIdentity(
  externalSubject: string,
  options: LinkerOptions = {}
): Promise<DevelopmentSuperAdminIdentityLinkStatus> {
  assertDevelopmentSuperAdminIdentityLinkerEnvironment(
    options.environment ?? process.env
  );

  const normalizedSubject = externalSubject.trim();
  if (
    !normalizedSubject ||
    normalizedSubject !== externalSubject ||
    normalizedSubject.length > 255
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  const client =
    options.createClient?.() ??
    (createSupabaseAdminClient() as SuperAdminIdentityLinkRpcClient);
  const { data, error } = await client.rpc(
    "link_development_super_admin_clerk_identity",
    { p_external_subject: normalizedSubject }
  );

  if (error) {
    throw new DevelopmentSuperAdminIdentityLinkerRpcError(error.code);
  }

  if (!isDevelopmentSuperAdminIdentityLinkStatus(data)) {
    throw new DevelopmentSuperAdminIdentityLinkerRpcError();
  }

  return data;
}

export async function handleDevelopmentSuperAdminIdentityLinkRequest(
  request: Request,
  options: DevelopmentSuperAdminIdentityLinkRequestOptions
): Promise<HandlerResult> {
  const requestUrl = new URL(request.url);
  const body = await request.text();

  if (requestUrl.searchParams.size > 0 || body.trim().length > 0) {
    return {
      status: 400,
      body: {
        error:
          "Esta operacion no acepta datos de identidad enviados por el cliente.",
      },
    };
  }

  const userId = await options.getAuthenticatedUserId();
  if (!userId) {
    return {
      status: 401,
      body: { error: "Debes iniciar sesion para continuar." },
    };
  }

  try {
    assertDevelopmentSuperAdminIdentityLinkerRequest(
      request,
      options.environment ?? process.env
    );

    const linkIdentity =
      options.linkIdentity ?? linkDevelopmentSuperAdminClerkIdentity;
    const status = await linkIdentity(userId, {
      environment: options.environment,
      createClient: options.createClient,
    });

    return {
      status:
        status === "created" ? 201 : status === "conflict" ? 409 : 200,
      body: { status },
    };
  } catch (error) {
    if (error instanceof DevelopmentIdentityLinkerConfigurationError) {
      return {
        status: 403,
        body: {
          error:
            "El vinculador Super Admin solo esta disponible en Development.",
        },
      };
    }

    return {
      status: 500,
      body: {
        error: "No se pudo completar el vinculo Super Admin.",
      },
    };
  }
}

export async function executeDevelopmentSuperAdminIdentityLinkRoute(
  request: Request,
  options: DevelopmentSuperAdminIdentityLinkRequestOptions
) {
  const result = await handleDevelopmentSuperAdminIdentityLinkRequest(
    request,
    options
  );

  return Response.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function constantTimeSecretEqual(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function isDevelopmentSuperAdminIdentityLinkStatus(
  value: unknown
): value is DevelopmentSuperAdminIdentityLinkStatus {
  return (
    value === "created" ||
    value === "already_linked" ||
    value === "conflict"
  );
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function parseOrigin(value: string | null) {
  try {
    return new URL(value ?? "");
  } catch {
    return null;
  }
}

function isValidOptionalForwardedHeader(
  value: string | null,
  validate: (value: string) => boolean
) {
  if (value === null) {
    return true;
  }

  return (
    value.length > 0 &&
    value === value.trim() &&
    !value.includes(",") &&
    validate(value)
  );
}
