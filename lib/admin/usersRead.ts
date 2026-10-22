import "server-only";

import {
  loadAccessSnapshot,
} from "../access/server.ts";
import {
  normalizeGlobalRole,
  normalizeIndividualPlan,
  toLegacyPlan,
} from "../access/catalog.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import type { SubscriptionPlan } from "../subscription.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type CanonicalProfileRow = {
  user_id: string;
  email: string | null;
  reflab_name: string | null;
  first_name: string | null;
  last_name: string | null;
  ref_card_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type MembershipRow = {
  user_id: string;
  institution_id: string;
  status: string;
};

type GlobalRoleRow = {
  user_id: string;
  role_key: string;
};

type SubscriptionRow = {
  user_id: string;
  plan_key: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type AdminUsersReadDependencies = {
  loadActorAccess: typeof loadAccessSnapshot;
};

const defaultDependencies: AdminUsersReadDependencies = {
  loadActorAccess: loadAccessSnapshot,
};

export class AdminUsersForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "AdminUsersForbiddenError";
  }
}

export type CanonicalAdminUser = {
  userId: string;
  name: string;
  fullName: string;
  email: string;
  refCardId: string;
  role: "super_admin" | "individual_referee";
  subscriptionPlan: SubscriptionPlan;
  institutionId: string | null;
  avatarUrl: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SanitizedAdminUsersReadError = {
  code: string | null;
  message: string;
};

export async function authorizeCanonicalAdminUsersRead(
  supabase: SupabaseAdminClient,
  externalUserId: string,
  dependencies: Pick<AdminUsersReadDependencies, "loadActorAccess"> =
    defaultDependencies
) {
  const access = await dependencies.loadActorAccess(
    supabase,
    externalUserId,
    { provisionMissing: false }
  );

  if (access.globalRole !== "super_admin") {
    throw new AdminUsersForbiddenError();
  }

  return access;
}

export async function loadCanonicalAdminUsers(
  supabase: SupabaseAdminClient
) {
  const [
    profilesResult,
    globalRolesResult,
    subscriptionsResult,
    membershipsResult,
  ] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "user_id,email,reflab_name,first_name,last_name,ref_card_id,avatar_url,created_at,updated_at"
      ),
    supabase.from("user_global_roles").select("user_id,role_key"),
    supabase
      .from("user_subscriptions")
      .select("user_id,plan_key,status,starts_at,ends_at"),
    supabase
      .from("institution_memberships")
      .select("user_id,institution_id,status")
      .eq("status", "active"),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (globalRolesResult.error) throw globalRolesResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const profiles = (profilesResult.data ?? []) as CanonicalProfileRow[];
  const globalRoles = (globalRolesResult.data ?? []) as GlobalRoleRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const globalRoleByUser = new Map(
    globalRoles.map((row) => [row.user_id, row])
  );
  const subscriptionByUser = new Map(
    subscriptions.map((row) => [row.user_id, row])
  );
  const institutionIdsByUser = groupInstitutionIds(memberships);

  const users = profiles
    .filter((profile) => Boolean(profile.user_id))
    .map((profile) => {
      const globalRole = globalRoleByUser.get(profile.user_id);
      const subscription = subscriptionByUser.get(profile.user_id);
      if (!globalRole || !subscription) {
        throw new Error("Canonical access records are missing for a user profile.");
      }
      return buildCanonicalAdminUser(
        profile,
        globalRole,
        subscription,
        institutionIdsByUser.get(profile.user_id) ?? []
      );
    });

  return users.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export function sanitizeAdminUsersReadError(
  error: unknown
): SanitizedAdminUsersReadError {
  const record = asRecord(error);
  const code = safeText(record?.code);
  const message = redactSensitiveText(
    error instanceof Error
      ? error.message
      : safeText(record?.message) ?? "Error de lectura administrativa."
  );

  return { code, message };
}

function buildCanonicalAdminUser(
  profile: CanonicalProfileRow,
  globalRole: GlobalRoleRow,
  subscription: SubscriptionRow,
  institutionIds: string[]
): CanonicalAdminUser {
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const role =
    normalizeGlobalRole(globalRole.role_key) === "super_admin"
      ? "super_admin"
      : "individual_referee";
  const individualPlan = isActiveSubscription(subscription)
    ? normalizeIndividualPlan(subscription.plan_key)
    : "basic";

  return {
    userId: profile.user_id,
    name:
      profile.reflab_name?.trim() ||
      fullName ||
      profile.ref_card_id?.trim() ||
      "Usuario RefLab",
    fullName,
    email: profile.email?.trim() || "Sin email registrado",
    refCardId: profile.ref_card_id?.trim() || "Pendiente",
    role,
    subscriptionPlan: toLegacyPlan(individualPlan),
    institutionId: institutionIds[0] ?? null,
    avatarUrl: profile.avatar_url ?? "",
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function isActiveSubscription(subscription: SubscriptionRow) {
  if (subscription.status !== "active") return false;
  const now = Date.now();
  if (subscription.starts_at && new Date(subscription.starts_at).getTime() > now) {
    return false;
  }
  if (subscription.ends_at && new Date(subscription.ends_at).getTime() <= now) {
    return false;
  }
  return true;
}

function groupInstitutionIds(rows: MembershipRow[]) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const current = grouped.get(row.user_id) ?? [];
    if (!current.includes(row.institution_id)) current.push(row.institution_id);
    grouped.set(row.user_id, current);
  }
  return grouped;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function safeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redactSensitiveText(value: string) {
  return value
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]")
    .slice(0, 500);
}
