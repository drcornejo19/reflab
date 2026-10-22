import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";

type CanonicalRequestIdentitySuccess<TClient> = {
  response: null;
  supabase: TClient;
  access: AccessSnapshot;
  canonicalUserId: string;
};

type CanonicalRequestIdentityFailure = {
  response: Response;
  supabase: null;
  access: null;
  canonicalUserId: null;
};

export type CanonicalRequestIdentityResult<TClient> =
  | CanonicalRequestIdentitySuccess<TClient>
  | CanonicalRequestIdentityFailure;

export type CanonicalRequestIdentityDependencies<TClient> = {
  createSupabase(): TClient;
  loadAccess(
    supabase: TClient,
    externalSubject: string
  ): Promise<AccessSnapshot>;
  logError(label: string, diagnostic: { code: string; message: string }): void;
};

export async function resolveCanonicalRequestIdentity<TClient>(
  externalSubject: string | null,
  dependencies: CanonicalRequestIdentityDependencies<TClient>
): Promise<CanonicalRequestIdentityResult<TClient>> {
  if (!externalSubject) {
    return failure(
      Response.json({ error: "authentication_required" }, { status: 401 })
    );
  }

  const supabase = dependencies.createSupabase();

  try {
    const access = await dependencies.loadAccess(supabase, externalSubject);
    return {
      response: null,
      supabase,
      access,
      canonicalUserId: access.userId,
    };
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return failure(
        Response.json({ error: "identity_link_required" }, { status: 409 })
      );
    }

    dependencies.logError(
      "Canonical request identity resolution failed",
      sanitizeDiagnostic(error)
    );
    return failure(
      Response.json(
        {
          error: "identity_unavailable",
          message: "No se pudo resolver la identidad de la sesion.",
        },
        { status: 500 }
      )
    );
  }
}

function failure(response: Response): CanonicalRequestIdentityFailure {
  return {
    response,
    supabase: null,
    access: null,
    canonicalUserId: null,
  };
}

function sanitizeDiagnostic(error: unknown) {
  if (error instanceof Error) {
    return { code: "unexpected_error", message: error.message };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code:
        typeof record.code === "string" ? record.code : "unexpected_error",
      message:
        typeof record.message === "string"
          ? record.message
          : "Unknown identity error",
    };
  }

  return { code: "unexpected_error", message: String(error) };
}
