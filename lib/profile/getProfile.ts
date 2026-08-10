import "server-only";

import type { User as ClerkBackendUser } from "@clerk/backend";
import {
  IdentityLinkRequiredError,
  loadAccessSnapshot,
} from "../access/server.ts";
import { toLegacyPlan } from "../access/catalog.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  toClientProfile,
  type UserProfileRow,
  type UserRoleRow,
} from "../reflabUserRecords.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type LoadAccessSnapshot = (
  supabase: SupabaseAdminClient,
  externalUserId: string,
  options: { provisionMissing: false }
) => Promise<AccessSnapshot>;

type ProfileReadDependencies = {
  loadAccessSnapshot: LoadAccessSnapshot;
};

export type ProfileGetPayload = {
  profile: ReturnType<typeof toClientProfile>;
  access: AccessSnapshot;
};

export type SanitizedProfileError = {
  code: string | null;
  message: string;
};

type ProfileGetErrorLogger = (diagnostic: SanitizedProfileError) => void;

const defaultDependencies: ProfileReadDependencies = {
  loadAccessSnapshot,
};

export async function getProfilePayload(
  supabase: SupabaseAdminClient,
  externalUserId: string,
  clerkUser: ClerkBackendUser,
  dependencies: ProfileReadDependencies = defaultDependencies
): Promise<ProfileGetPayload> {
  const access = await dependencies.loadAccessSnapshot(
    supabase,
    externalUserId,
    { provisionMissing: false }
  );
  const profileResult = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", access.userId)
    .maybeSingle();

  if (profileResult.error) throw profileResult.error;

  const profile = profileResult.data as UserProfileRow | null;
  const canonicalRole: UserRoleRow = {
    user_id: access.userId,
    role: access.globalRole === "super_admin" ? "super_admin" : "individual_referee",
    subscription_plan: toLegacyPlan(access.effectiveIndividualPlan),
    institution_id: profile?.institution_id ?? null,
  };

  return {
    profile: {
      ...toClientProfile(profile, canonicalRole, clerkUser),
      role:
        access.globalRole === "super_admin"
          ? "super_admin"
          : "individual_referee",
      subscriptionPlan: toLegacyPlan(access.effectiveIndividualPlan),
    },
    access,
  };
}

export async function createProfileGetResponse(
  loadPayload: () => Promise<ProfileGetPayload>,
  logError: ProfileGetErrorLogger = (diagnostic) => {
    console.error("[profile.get]", diagnostic);
  }
) {
  try {
    return Response.json(await loadPayload());
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    const diagnostic = sanitizeProfileGetError(error);
    logError(diagnostic);

    return Response.json(
      {
        error: "No se pudo cargar el perfil.",
        code: diagnostic.code,
        technical: diagnostic.message,
      },
      { status: 500 }
    );
  }
}

export function sanitizeProfileGetError(error: unknown): SanitizedProfileError {
  if (error instanceof Error) {
    return {
      code: readSafeErrorField(error, "code"),
      message: sanitizeErrorMessage(error.message),
    };
  }

  if (typeof error === "object" && error !== null) {
    return {
      code: readSafeErrorField(error, "code"),
      message: sanitizeErrorMessage(readSafeErrorField(error, "message")),
    };
  }

  return {
    code: null,
    message: "Error desconocido al cargar el perfil.",
  };
}

function readSafeErrorField(error: object, field: string) {
  const value = Reflect.get(error, field);
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 300)
    : null;
}

function sanitizeErrorMessage(message?: string | null) {
  if (!message) return "Error desconocido al cargar el perfil.";

  return message
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 300);
}
