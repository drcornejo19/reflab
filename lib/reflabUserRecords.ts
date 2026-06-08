import "server-only";

import type { User as ClerkBackendUser } from "@clerk/backend";
import { normalizeRole, type SystemRole } from "@/lib/institutionalRoles";
import { generateRefCardId, resolveRefCardId } from "@/lib/refCard";
import { normalizeSubscriptionPlan, type SubscriptionPlan } from "@/lib/subscription";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type SupabaseAnyClient = ReturnType<typeof createSupabaseAdminClient>;

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

type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
};

type UpsertResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

const roleFallbackColumns = [
  ["user_id", "role", "subscription_plan"],
  ["user_id", "role"],
];

const profileFallbackColumns = [
  [
    "user_id",
    "email",
    "first_name",
    "last_name",
    "country",
    "city",
    "association",
    "referee_type",
    "main_role",
    "category",
    "avatar_url",
    "ref_card_id",
    "ranking_display_name",
    "show_real_name_in_ranking",
    "subscription_plan",
  ],
  ["user_id", "email", "first_name", "last_name", "avatar_url", "ref_card_id"],
  ["user_id", "email"],
];

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

export function isConfiguredSuperAdmin(clerkUser?: ClerkBackendUser | null) {
  const email = getClerkPrimaryEmail(clerkUser)?.toLowerCase();
  if (!email) return false;

  const configuredEmails = [
    process.env.REFLAB_SUPER_ADMIN_EMAILS,
    process.env.REFLAB_SUPER_ADMIN_EMAIL,
    process.env.SUPER_ADMIN_EMAILS,
    process.env.SUPER_ADMIN_EMAIL,
    process.env.NEXT_PUBLIC_REFLAB_SUPER_ADMIN_EMAILS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configuredEmails.includes(email);
}

export async function ensureUserRecords(
  supabase: SupabaseAnyClient,
  clerkUser: ClerkBackendUser
) {
  const now = new Date().toISOString();
  const email = getClerkPrimaryEmail(clerkUser);
  const [profileRes, roleRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", clerkUser.id)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("*")
      .eq("user_id", clerkUser.id)
      .maybeSingle(),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (roleRes.error) throw roleRes.error;

  const profile = profileRes.data as UserProfileRow | null;
  const roleRow = roleRes.data as UserRoleRow | null;
  const bootstrapSuperAdmin = isConfiguredSuperAdmin(clerkUser);
  const role = bootstrapSuperAdmin ? "super_admin" : normalizeRole(roleRow?.role);
  const subscriptionPlan = normalizeSubscriptionPlan(
    roleRow?.subscription_plan ?? profile?.subscription_plan
  );

  let savedRole = roleRow;
  if (
    !roleRow ||
    normalizeRole(roleRow.role) !== role ||
    normalizeSubscriptionPlan(roleRow.subscription_plan) !== subscriptionPlan
  ) {
    const roleResult = await upsertUserRole(supabase, {
      user_id: clerkUser.id,
      role,
      subscription_plan: subscriptionPlan,
      institution_id: roleRow?.institution_id ?? profile?.institution_id ?? null,
      created_at: roleRow?.created_at ?? now,
      updated_at: now,
    });

    if (roleResult.error) throw roleResult.error;
    savedRole = roleResult.data ?? {
      ...roleRow,
      user_id: clerkUser.id,
      role,
      subscription_plan: subscriptionPlan,
      updated_at: now,
    };
  }

  const profilePatch = buildProfilePatch(profile, clerkUser, {
    email,
    subscriptionPlan,
    now,
  });

  let savedProfile = profile;
  if (!profile || Object.keys(profilePatch).length > 1) {
    const profileResult = await upsertUserProfile(supabase, profilePatch);
    if (profileResult.error) throw profileResult.error;
    savedProfile = profileResult.data ?? {
      ...profile,
      ...profilePatch,
    };
  }

  return {
    profile: savedProfile,
    role: savedRole,
    clientProfile: toClientProfile(savedProfile, savedRole, clerkUser),
  };
}

export async function upsertUserRole(
  supabase: SupabaseAnyClient,
  payload: Record<string, unknown>
): Promise<UpsertResult<UserRoleRow>> {
  return upsertWithFallback<UserRoleRow>(
    supabase,
    "user_roles",
    payload,
    roleFallbackColumns
  );
}

export async function upsertUserProfile(
  supabase: SupabaseAnyClient,
  payload: Record<string, unknown>
): Promise<UpsertResult<UserProfileRow>> {
  return upsertWithFallback<UserProfileRow>(
    supabase,
    "user_profiles",
    payload,
    profileFallbackColumns
  );
}

export function toClientProfile(
  profile: UserProfileRow | null | undefined,
  roleRow: UserRoleRow | null | undefined,
  clerkUser?: ClerkBackendUser | null
): ReflabUserProfile {
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
    ? resolveRefCardId(clerkUser?.id ?? profile?.user_id ?? "", profile)
    : clerkUser?.id
      ? generateRefCardId(clerkUser.id)
      : "";

  return {
    userId: clerkUser?.id ?? profile?.user_id ?? "",
    email,
    reflabName,
    firstName,
    lastName,
    country: textOrNull(profile?.country) ?? "",
    city: textOrNull(profile?.city) ?? "",
    association: textOrNull(profile?.association) ?? "",
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

function buildProfilePatch(
  profile: UserProfileRow | null,
  clerkUser: ClerkBackendUser,
  {
    email,
    subscriptionPlan,
    now,
  }: {
    email: string | null;
    subscriptionPlan: SubscriptionPlan;
    now: string;
  }
) {
  const refCardId = resolveRefCardId(clerkUser.id, profile);
  const firstName = textOrNull(profile?.first_name) ?? clerkUser.firstName ?? null;
  const lastName = textOrNull(profile?.last_name) ?? clerkUser.lastName ?? null;
  const reflabName = resolveReflabName(profile, clerkUser);
  const rankingDisplayName =
    textOrNull(profile?.ranking_display_name) ||
    reflabName ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    null;

  if (!profile) {
    return stripUndefined({
      user_id: clerkUser.id,
      email,
      reflab_name: reflabName,
      first_name: firstName,
      last_name: lastName,
      avatar_url: clerkUser.imageUrl || null,
      ref_card_id: refCardId,
      ranking_display_name: rankingDisplayName,
      show_real_name_in_ranking: false,
      public_profile: true,
      hide_ranking_name: false,
      subscription_plan: subscriptionPlan,
      created_at: now,
      updated_at: now,
    });
  }

  const patch: Record<string, unknown> = { user_id: clerkUser.id };
  setIfDifferent(patch, profile.email, "email", email);
  setIfMissing(patch, profile.reflab_name, "reflab_name", reflabName);
  setIfMissing(patch, profile.first_name, "first_name", firstName);
  setIfMissing(patch, profile.last_name, "last_name", lastName);
  setIfMissing(patch, profile.avatar_url, "avatar_url", clerkUser.imageUrl || null);
  setIfMissing(patch, profile.ref_card_id, "ref_card_id", refCardId);
  setIfMissing(
    patch,
    profile.ranking_display_name,
    "ranking_display_name",
    rankingDisplayName
  );
  setIfDifferent(
    patch,
    normalizeSubscriptionPlan(profile.subscription_plan),
    "subscription_plan",
    subscriptionPlan
  );

  if (profile.public_profile === null || profile.public_profile === undefined) {
    patch.public_profile = true;
  }

  if (profile.hide_ranking_name === null || profile.hide_ranking_name === undefined) {
    patch.hide_ranking_name = false;
  }

  if (Object.keys(patch).length > 1) {
    patch.updated_at = now;
  }

  return stripUndefined(patch);
}

async function upsertWithFallback<T>(
  supabase: SupabaseAnyClient,
  table: string,
  payload: Record<string, unknown>,
  fallbackColumns: string[][]
): Promise<UpsertResult<T>> {
  const primary = stripUndefined(payload);
  let result = await runUpsert<T>(supabase, table, primary);

  if (!result.error || !isSchemaCompatibilityError(result.error)) {
    return result;
  }

  for (const columns of fallbackColumns) {
    const fallback = pick(primary, columns);
    if (!fallback.user_id) continue;

    result = await runUpsert<T>(supabase, table, fallback);
    if (!result.error || !isSchemaCompatibilityError(result.error)) {
      return result;
    }
  }

  return result;
}

async function runUpsert<T>(
  supabase: SupabaseAnyClient,
  table: string,
  payload: Record<string, unknown>
): Promise<UpsertResult<T>> {
  const result = await supabase
    .from(table)
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();

  return {
    data: (result.data as T | null) ?? null,
    error: (result.error as SupabaseErrorLike | null) ?? null,
  };
}

function setIfMissing(
  patch: Record<string, unknown>,
  current: unknown,
  key: string,
  value: unknown
) {
  if (!textOrNull(current) && value !== undefined && value !== null && value !== "") {
    patch[key] = value;
  }
}

function setIfDifferent(
  patch: Record<string, unknown>,
  current: unknown,
  key: string,
  value: unknown
) {
  if ((current ?? null) !== (value ?? null)) {
    patch[key] = value;
  }
}

function pick(payload: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys
      .filter((key) => payload[key] !== undefined)
      .map((key) => [key, payload[key]])
  );
}

function stripUndefined(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEmailLocalPart(email?: string | null) {
  return email?.split("@")[0]?.trim() || "";
}

function isSchemaCompatibilityError(error: SupabaseErrorLike) {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    message.includes("pgrst204") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}
