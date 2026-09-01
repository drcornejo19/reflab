import "server-only";

import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import {
  InstitutionTenantAccessError,
  requireAuthorizedInstitutionContext,
  selectActiveInstitutionContext,
} from "../institutional/tenantIsolation.ts";
import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "../institutional/types.ts";
import type { MatchActorContext } from "./api.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type MatchProfileRow = {
  user_id?: string | null;
  reflab_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  association?: string | null;
  category?: string | null;
  main_role?: string | null;
  referee_type?: string | null;
  ref_card_id?: string | null;
};

export type MatchesActorAuthorization = {
  supabase: SupabaseAdminClient;
  access: AccessSnapshot;
  institutionAccess: InstitutionAccessSnapshot;
  institutionContext: InstitutionContext | null;
  actor: MatchActorContext;
};

export type RequireMatchesActorInput = {
  requestedInstitutionId?: string | null;
  requireInstitutionPermission?: "matches.read" | "matches.manage";
  requireInstitutionContext?: boolean;
};

export type ResolveMatchesActorDependencies = {
  supabase: SupabaseAdminClient;
  loadAccess: (clerkSubject: string) => Promise<AccessSnapshot>;
  loadInstitutionAccess: (
    canonicalUserId: string
  ) => Promise<InstitutionAccessSnapshot>;
  getRequestedInstitutionId: (
    explicitInstitutionId?: string | null
  ) => Promise<string | null>;
  loadProfile: (canonicalUserId: string) => Promise<MatchProfileRow | null>;
};

export class MatchesAccessError extends Error {
  readonly code: string;
  readonly status: 401 | 403 | 409;

  constructor(code: string, status: 401 | 403 | 409, message = code) {
    super(message);
    this.name = "MatchesAccessError";
    this.code = code;
    this.status = status;
  }
}

export async function resolveMatchesActor(
  clerkSubject: string | null,
  input: RequireMatchesActorInput,
  dependencies: ResolveMatchesActorDependencies
): Promise<MatchesActorAuthorization> {
  if (!clerkSubject) {
    throw new MatchesAccessError("authentication_required", 401);
  }

  let access: AccessSnapshot;
  try {
    access = await dependencies.loadAccess(clerkSubject);
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      throw new MatchesAccessError("identity_link_required", 409);
    }
    throw error;
  }

  const [institutionAccess, profile] = await Promise.all([
    dependencies.loadInstitutionAccess(access.userId),
    dependencies.loadProfile(access.userId),
  ]);
  const requestedInstitutionId = await dependencies.getRequestedInstitutionId(
    input.requestedInstitutionId
  );

  let institutionContext: InstitutionContext | null;
  try {
    institutionContext = requestedInstitutionId
      ? requireAuthorizedInstitutionContext(
          institutionAccess,
          requestedInstitutionId
        )
      : selectActiveInstitutionContext(institutionAccess);
  } catch (error) {
    if (error instanceof InstitutionTenantAccessError) {
      throw new MatchesAccessError("institution_forbidden", 403);
    }
    throw error;
  }

  if (input.requireInstitutionContext && !institutionContext) {
    throw new MatchesAccessError("institution_context_required", 403);
  }

  const permissionKeys = institutionContext?.membership?.permissionKeys ?? [];
  const isSuperAdmin = access.globalRole === "super_admin";
  const canReadInstitution =
    Boolean(institutionContext) &&
    (isSuperAdmin || permissionKeys.includes("matches.read"));
  const canManageInstitution =
    Boolean(institutionContext) &&
    (isSuperAdmin || permissionKeys.includes("matches.manage"));

  if (
    input.requireInstitutionPermission === "matches.read" &&
    !canReadInstitution
  ) {
    throw new MatchesAccessError("matches_read_forbidden", 403);
  }
  if (
    input.requireInstitutionPermission === "matches.manage" &&
    !canManageInstitution
  ) {
    throw new MatchesAccessError("matches_manage_forbidden", 403);
  }

  return {
    supabase: dependencies.supabase,
    access,
    institutionAccess,
    institutionContext,
    actor: {
      userId: access.userId,
      role: isSuperAdmin ? "super_admin" : "individual_referee",
      institutionId: institutionContext?.institution.id ?? null,
      institutionName: institutionContext?.institution.name ?? null,
      canReadInstitution,
      canManageInstitution,
      isSuperAdmin,
      profile: {
        displayName: resolveDisplayName(profile, access.userId),
        refCardId: textOrNull(profile?.ref_card_id),
        country: textOrNull(profile?.country),
        association: textOrNull(profile?.association),
        category: textOrNull(profile?.category),
        mainRole: textOrNull(profile?.main_role),
        refereeType: textOrNull(profile?.referee_type),
      },
    },
  };
}

export function getMatchesAccessError(error: unknown) {
  return error instanceof MatchesAccessError
    ? { code: error.code, status: error.status }
    : null;
}

function resolveDisplayName(profile: MatchProfileRow | null, fallback: string) {
  const fullName = [
    textOrNull(profile?.first_name),
    textOrNull(profile?.last_name),
  ]
    .filter(Boolean)
    .join(" ");

  return textOrNull(profile?.reflab_name) ?? textOrNull(fullName) ?? fallback;
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}
