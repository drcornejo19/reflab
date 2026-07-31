import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";

export const DEVELOPMENT_SUPABASE_PROJECT_REF = "bthnhbpgiyuajsgoccrp";
export const FORBIDDEN_PRODUCTION_PROJECT_REF = "nagjddldrldwavmfaytc";
export const DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER =
  "x-reflab-development-identity-link-secret";

const MINIMUM_DEVELOPMENT_SECRET_LENGTH = 32;
const LOOPBACK_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

export type DevelopmentIdentityLinkStatus =
  | "created"
  | "already_linked"
  | "conflict";

type RpcError = {
  code?: string;
};

type IdentityLinkRpcClient = {
  rpc(
    functionName: "link_development_clerk_identity",
    parameters: { p_external_subject: string }
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

type LinkerOptions = {
  environment?: NodeJS.ProcessEnv;
  createClient?: () => IdentityLinkRpcClient;
};

type RequestHandlerOptions = LinkerOptions & {
  getAuthenticatedUserId: () => Promise<string | null>;
  linkIdentity?: (
    externalSubject: string,
    options?: LinkerOptions
  ) => Promise<DevelopmentIdentityLinkStatus>;
};

type HandlerResult = {
  status: number;
  body:
    | { status: DevelopmentIdentityLinkStatus }
    | { error: string };
};

export class DevelopmentIdentityLinkerConfigurationError extends Error {
  constructor() {
    super("Development identity linker is unavailable in this environment.");
    this.name = "DevelopmentIdentityLinkerConfigurationError";
  }
}

export class DevelopmentIdentityLinkerRpcError extends Error {
  readonly code?: string;

  constructor(code?: string) {
    super("Development identity link operation failed.");
    this.name = "DevelopmentIdentityLinkerRpcError";
    this.code = code;
  }
}

export function assertDevelopmentIdentityLinkerEnvironment(
  environment: NodeJS.ProcessEnv = process.env
) {
  const appEnvironment = normalized(environment.APP_ENV);
  const clerkEnvironment = normalized(environment.CLERK_ENV);
  const nodeEnvironment = normalized(environment.NODE_ENV);
  const supabaseEnvironment = normalized(environment.SUPABASE_ENV);
  const configuredProjectRef = normalized(environment.SUPABASE_PROJECT_REF);
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL;
  const enabled = normalized(
    environment.ENABLE_DEVELOPMENT_IDENTITY_LINKER
  );
  const configuredSecret =
    environment.DEVELOPMENT_IDENTITY_LINK_SECRET ?? "";

  if (
    enabled !== "true" ||
    nodeEnvironment === "production" ||
    appEnvironment !== "development" ||
    clerkEnvironment !== "development" ||
    supabaseEnvironment !== "development" ||
    configuredProjectRef === FORBIDDEN_PRODUCTION_PROJECT_REF ||
    configuredProjectRef !== DEVELOPMENT_SUPABASE_PROJECT_REF ||
    configuredSecret.length < MINIMUM_DEVELOPMENT_SECRET_LENGTH ||
    !environment.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl ?? "");
  } catch {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname.toLowerCase() !==
      `${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co` ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.port ||
    parsedUrl.href.includes(FORBIDDEN_PRODUCTION_PROJECT_REF)
  ) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }
}

export function assertDevelopmentIdentityLinkerRequest(
  request: Request,
  environment: NodeJS.ProcessEnv = process.env
) {
  assertDevelopmentIdentityLinkerEnvironment(environment);

  const requestUrl = new URL(request.url);
  if (!LOOPBACK_HOSTNAMES.has(requestUrl.hostname.toLowerCase())) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }

  const providedSecret =
    request.headers.get(DEVELOPMENT_IDENTITY_LINK_SECRET_HEADER) ?? "";
  const configuredSecret =
    environment.DEVELOPMENT_IDENTITY_LINK_SECRET ?? "";

  if (!constantTimeSecretEqual(providedSecret, configuredSecret)) {
    throw new DevelopmentIdentityLinkerConfigurationError();
  }
}

export async function linkDevelopmentClerkIdentity(
  externalSubject: string,
  options: LinkerOptions = {}
): Promise<DevelopmentIdentityLinkStatus> {
  assertDevelopmentIdentityLinkerEnvironment(
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
    (createSupabaseAdminClient() as IdentityLinkRpcClient);
  const { data, error } = await client.rpc(
    "link_development_clerk_identity",
    { p_external_subject: normalizedSubject }
  );

  if (error) {
    throw new DevelopmentIdentityLinkerRpcError(error.code);
  }

  if (!isDevelopmentIdentityLinkStatus(data)) {
    throw new DevelopmentIdentityLinkerRpcError();
  }

  return data;
}

export async function handleDevelopmentIdentityLinkRequest(
  request: Request,
  options: RequestHandlerOptions
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
    assertDevelopmentIdentityLinkerRequest(
      request,
      options.environment ?? process.env
    );

    const linkIdentity =
      options.linkIdentity ?? linkDevelopmentClerkIdentity;
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
            "El vinculador de identidad solo esta disponible en Development.",
        },
      };
    }

    return {
      status: 500,
      body: {
        error: "No se pudo completar el vinculo de identidad.",
      },
    };
  }
}

function normalized(value: string | undefined) {
  return value?.trim().toLowerCase();
}

function constantTimeSecretEqual(provided: string, expected: string) {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function isDevelopmentIdentityLinkStatus(
  value: unknown
): value is DevelopmentIdentityLinkStatus {
  return (
    value === "created" ||
    value === "already_linked" ||
    value === "conflict"
  );
}
