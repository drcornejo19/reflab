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

export type ProfilePatchInput = {
  reflabName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  country?: unknown;
  city?: unknown;
  association?: unknown;
  refereeType?: unknown;
  mainRole?: unknown;
  category?: unknown;
  level?: unknown;
  birthDate?: unknown;
  publicProfile?: unknown;
  hideRankingName?: unknown;
  showRealNameInRanking?: unknown;
};

export type SanitizedProfileError = {
  code: string | null;
  message: string;
};

type ProfileGetErrorLogger = (diagnostic: SanitizedProfileError) => void;

const defaultDependencies: ProfileReadDependencies = {
  loadAccessSnapshot,
};

export class CanonicalProfileRequiredError extends Error {
  readonly code = "canonical_profile_required";

  constructor() {
    super("A canonical profile must exist before it can be updated.");
    this.name = "CanonicalProfileRequiredError";
  }
}

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

export async function updateProfilePayload(
  supabase: SupabaseAdminClient,
  externalUserId: string,
  clerkUser: ClerkBackendUser,
  body: ProfilePatchInput,
  dependencies: ProfileReadDependencies = defaultDependencies
): Promise<ProfileGetPayload> {
  const access = await dependencies.loadAccessSnapshot(
    supabase,
    externalUserId,
    { provisionMissing: false }
  );
  const existingResult = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", access.userId)
    .maybeSingle();

  if (existingResult.error) throw existingResult.error;
  const existingProfile = existingResult.data as UserProfileRow | null;
  if (!existingProfile) throw new CanonicalProfileRequiredError();

  const firstName = patchText(body.firstName, existingProfile.first_name);
  const lastName = patchText(body.lastName, existingProfile.last_name);
  const reflabName = patchText(body.reflabName, existingProfile.reflab_name);
  const mainRole =
    patchText(body.mainRole, existingProfile.main_role) || "Arbitro principal";
  const showRealNameInRanking = patchBoolean(
    body.showRealNameInRanking,
    existingProfile.show_real_name_in_ranking === true
  );
  const hideRankingName =
    typeof body.hideRankingName === "boolean"
      ? body.hideRankingName
      : body.showRealNameInRanking === undefined
        ? existingProfile.hide_ranking_name === true
        : !showRealNameInRanking;
  const rankingDisplayName =
    reflabName || [firstName, lastName].filter(Boolean).join(" ").trim() || null;
  const profilePatch = {
    reflab_name: reflabName || null,
    first_name: firstName || null,
    last_name: lastName || null,
    country: patchText(body.country, existingProfile.country) || null,
    city: patchText(body.city, existingProfile.city) || null,
    association: patchText(body.association, existingProfile.association) || null,
    referee_type:
      patchText(body.refereeType, existingProfile.referee_type) || "Amateur",
    main_role: mainRole,
    referee_role: mainRole,
    category: patchText(body.category, existingProfile.category) || null,
    level: patchText(body.level, existingProfile.level) || null,
    birth_date: patchDate(body.birthDate, existingProfile.birth_date),
    ranking_display_name: rankingDisplayName,
    show_real_name_in_ranking: showRealNameInRanking,
    public_profile: patchBoolean(
      body.publicProfile,
      existingProfile.public_profile !== false
    ),
    hide_ranking_name: hideRankingName,
    updated_at: new Date().toISOString(),
  };
  const updateResult = await supabase
    .from("user_profiles")
    .update(profilePatch)
    .eq("user_id", access.userId)
    .select("*")
    .maybeSingle();

  if (updateResult.error) throw updateResult.error;
  const profile = updateResult.data as UserProfileRow | null;
  if (!profile) throw new CanonicalProfileRequiredError();

  const canonicalRole = toCanonicalRole(access, profile);
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

export async function createProfilePatchResponse(
  updateProfile: () => Promise<ProfileGetPayload>,
  logError: ProfileGetErrorLogger = (diagnostic) => {
    console.error("[profile.patch]", diagnostic);
  }
) {
  try {
    const payload = await updateProfile();
    return Response.json({ success: true, ...payload });
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return Response.json({ error: error.code }, { status: 409 });
    }
    if (error instanceof CanonicalProfileRequiredError) {
      return Response.json({ error: error.code }, { status: 409 });
    }

    const diagnostic = sanitizeProfileGetError(error);
    logError(diagnostic);
    return Response.json(
      { error: "No se pudo guardar el perfil." },
      { status: 500 }
    );
  }
}

function toCanonicalRole(access: AccessSnapshot, profile: UserProfileRow): UserRoleRow {
  return {
    user_id: access.userId,
    role: access.globalRole === "super_admin" ? "super_admin" : "individual_referee",
    subscription_plan: toLegacyPlan(access.effectiveIndividualPlan),
    institution_id: profile.institution_id ?? null,
  };
}

function patchText(value: unknown, current: string | null | undefined) {
  if (value === undefined) return current?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function patchBoolean(value: unknown, current: boolean) {
  return typeof value === "boolean" ? value : current;
}

function patchDate(value: unknown, current: string | null | undefined) {
  if (value === undefined) return current ?? null;
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`).getTime();
  return Number.isFinite(parsed) ? normalized : null;
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
