import "server-only";

import type { User as ClerkBackendUser } from "@clerk/backend";
import { normalizeRole, type SystemRole } from "./institutionalRoles.ts";
import { generateRefCardId, resolveRefCardId } from "./refCard.ts";
import { normalizeSubscriptionPlan, type SubscriptionPlan } from "./subscription.ts";

export type UserProfileRow = {
  id?: string | null;
  user_id?: string | null;
  email?: string | null;
  reflab_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  city?: string | null;
  association?: string | null;
  association_logo?: string | null;
  referee_type?: string | null;
  main_role?: string | null;
  referee_role?: string | null;
  category?: string | null;
  level?: string | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  ref_card_id?: string | null;
  ranking_display_name?: string | null;
  show_real_name_in_ranking?: boolean | null;
  public_profile?: boolean | null;
  hide_ranking_name?: boolean | null;
  subscription_plan?: string | null;
  institution_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserRoleRow = {
  id?: string | null;
  user_id?: string | null;
  role?: string | null;
  subscription_plan?: string | null;
  institution_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ReflabUserProfile = {
  userId: string;
  email: string;
  reflabName: string;
  firstName: string;
  lastName: string;
  country: string;
  city: string;
  association: string;
  associationLogo: string;
  refereeType: string;
  mainRole: string;
  refereeRole: string;
  category: string;
  level: string;
  birthDate: string;
  avatarUrl: string;
  clerkImageUrl: string;
  refCardId: string;
  rankingDisplayName: string;
  showRealNameInRanking: boolean;
  publicProfile: boolean;
  hideRankingName: boolean;
  subscriptionPlan: SubscriptionPlan;
  role: SystemRole;
  institutionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function getClerkPrimaryEmail(user?: ClerkBackendUser | null) {
  if (!user) return null;

  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId
  );

  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

export function getClerkFullName(user?: ClerkBackendUser | null) {
  if (!user) return "";

  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

export function getClerkTimestamp(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : null;
}

export function resolveReflabName(
  profile?: UserProfileRow | null,
  clerkUser?: ClerkBackendUser | null
) {
  const email = getClerkPrimaryEmail(clerkUser) ?? textOrNull(profile?.email);
  const fallback =
    getClerkFullName(clerkUser) ||
    textOrNull(clerkUser?.username) ||
    getEmailLocalPart(email) ||
    "Usuario RefLab";

  return (
    textOrNull(profile?.reflab_name) ||
    textOrNull(profile?.ranking_display_name) ||
    fallback
  );
}

export function toClientProfile(
  profile: UserProfileRow | null | undefined,
  roleRow: UserRoleRow | null | undefined,
  clerkUser?: ClerkBackendUser | null
): ReflabUserProfile {
  const canonicalUserId =
    textOrNull(profile?.user_id) ??
    textOrNull(roleRow?.user_id) ??
    clerkUser?.id ??
    "";
  const email = getClerkPrimaryEmail(clerkUser) ?? textOrNull(profile?.email) ?? "";
  const firstName = textOrNull(profile?.first_name) ?? clerkUser?.firstName ?? "";
  const lastName = textOrNull(profile?.last_name) ?? clerkUser?.lastName ?? "";
  const reflabName = resolveReflabName(profile, clerkUser);
  const hideRankingName = Boolean(profile?.hide_ranking_name);
  const showRealNameInRanking =
    !hideRankingName && Boolean(profile?.show_real_name_in_ranking);
  const subscriptionPlan = normalizeSubscriptionPlan(
    roleRow?.subscription_plan ?? profile?.subscription_plan
  );
  const role = normalizeRole(roleRow?.role);
  const refCardId = profile?.ref_card_id
    ? resolveRefCardId(canonicalUserId, profile)
    : canonicalUserId
      ? generateRefCardId(canonicalUserId)
      : "";

  return {
    userId: canonicalUserId,
    email,
    reflabName,
    firstName,
    lastName,
    country: textOrNull(profile?.country) ?? "",
    city: textOrNull(profile?.city) ?? "",
    association: textOrNull(profile?.association) ?? "",
    associationLogo: textOrNull(profile?.association_logo) ?? "",
    refereeType: textOrNull(profile?.referee_type) ?? "Amateur",
    mainRole:
      textOrNull(profile?.main_role) ??
      textOrNull(profile?.referee_role) ??
      "Arbitro principal",
    refereeRole:
      textOrNull(profile?.referee_role) ??
      textOrNull(profile?.main_role) ??
      "Arbitro principal",
    category: textOrNull(profile?.category) ?? "",
    level: textOrNull(profile?.level) ?? "",
    birthDate: textOrNull(profile?.birth_date) ?? "",
    avatarUrl: textOrNull(profile?.avatar_url) ?? clerkUser?.imageUrl ?? "",
    clerkImageUrl: clerkUser?.imageUrl ?? "",
    refCardId,
    rankingDisplayName:
      textOrNull(profile?.ranking_display_name) ||
      reflabName ||
      [firstName, lastName].filter(Boolean).join(" ").trim(),
    showRealNameInRanking,
    publicProfile: profile?.public_profile !== false,
    hideRankingName,
    subscriptionPlan,
    role,
    institutionId: profile?.institution_id ?? roleRow?.institution_id ?? null,
    createdAt:
      profile?.created_at ??
      roleRow?.created_at ??
      getClerkTimestamp(clerkUser?.createdAt) ??
      null,
    updatedAt:
      profile?.updated_at ??
      roleRow?.updated_at ??
      getClerkTimestamp(clerkUser?.updatedAt) ??
      null,
  };
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEmailLocalPart(email?: string | null) {
  return email?.split("@")[0]?.trim() || "";
}
