import "server-only";

import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  normalizeGlobalRole,
  normalizeIndividualPlan,
} from "@/lib/access/catalog";
import type {
  AccessSnapshot,
  AccessSource,
  CanonicalPlanKey,
} from "@/lib/access/types";
import { resolveCapabilityKeys } from "@/lib/access/resolveCapabilities";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type InstitutionGrant = {
  institutionId: string;
  planKey: Extract<CanonicalPlanKey, "academy" | "enterprise">;
};

export async function loadAccessSnapshot(
  supabase: AdminClient,
  userId: string
): Promise<AccessSnapshot> {
  const [globalRoleResult, subscriptionResult, membershipResult] =
    await Promise.all([
      supabase
        .from("user_global_roles")
        .select("role_key")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_subscriptions")
        .select("plan_key,status,starts_at,ends_at")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("institution_memberships")
        .select("institution_id,status")
        .eq("user_id", userId)
        .eq("status", "active"),
    ]);

  if (globalRoleResult.error) throw globalRoleResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (membershipResult.error) throw membershipResult.error;

  await ensureCanonicalAccessRecords(supabase, userId, {
    hasGlobalRole: Boolean(globalRoleResult.data),
    hasSubscription: Boolean(subscriptionResult.data),
  });

  const globalRole = normalizeGlobalRole(globalRoleResult.data?.role_key);
  const individualPlan = isActiveSubscription(subscriptionResult.data)
    ? normalizeIndividualPlan(subscriptionResult.data?.plan_key)
    : "basic";

  if (globalRole === "super_admin") {
    const capabilitiesResult = await supabase
      .from("capabilities")
      .select("capability_key")
      .eq("is_active", true);

    if (capabilitiesResult.error) throw capabilitiesResult.error;

    return {
      userId,
      globalRole,
      individualPlan,
      effectiveIndividualPlan: "pro",
      capabilities: uniqueSorted(
        (capabilitiesResult.data ?? []).map((row) => row.capability_key)
      ),
      sources: ["super_admin"],
      inheritedFromInstitutionIds: [],
    };
  }

  const institutionGrants = await loadInstitutionGrants(
    supabase,
    membershipResult.data ?? []
  );
  const planKeys: CanonicalPlanKey[] = [
    "basic",
    individualPlan,
    ...institutionGrants.map((grant) => grant.planKey),
  ];
  const capabilityResult = await supabase
    .from("plan_capabilities")
    .select("plan_key,capability_key")
    .in("plan_key", uniqueSorted(planKeys));

  if (capabilityResult.error) throw capabilityResult.error;

  const overridesResult = await supabase
    .from("capability_overrides")
    .select(
      "institution_id,capability_key,scope_type,effect,valid_from,valid_until"
    )
    .eq("user_id", userId);

  if (overridesResult.error) throw overridesResult.error;

  const capabilities = resolveCapabilityKeys({
    individualPlan,
    institutionGrants,
    planCapabilities: (capabilityResult.data ?? []).map((row) => ({
      planKey: row.plan_key,
      capabilityKey: row.capability_key,
    })),
    overrides: (overridesResult.data ?? []).map((override) => ({
      institutionId: override.institution_id,
      capabilityKey: override.capability_key,
      scopeType: override.scope_type,
      effect: override.effect,
      validFrom: override.valid_from,
      validUntil: override.valid_until,
    })),
  });

  const sources: AccessSource[] = ["basic_default"];
  if (individualPlan === "pro") sources.push("individual");
  if (institutionGrants.length > 0) sources.push("institution");

  return {
    userId,
    globalRole,
    individualPlan,
    effectiveIndividualPlan:
      individualPlan === "pro" || institutionGrants.length > 0
        ? "pro"
        : "basic",
    capabilities,
    sources,
    inheritedFromInstitutionIds: institutionGrants.map(
      (grant) => grant.institutionId
    ),
  };
}

export async function ensureCanonicalAccessRecords(
  supabase: AdminClient,
  userId: string,
  knownState?: {
    hasGlobalRole: boolean;
    hasSubscription: boolean;
  }
) {
  const writes: Array<PromiseLike<unknown>> = [];

  if (!knownState?.hasGlobalRole) {
    writes.push(
      supabase.from("user_global_roles").upsert(
        {
          user_id: userId,
          role_key: "referee",
          source: "automatic_default",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
    );
  }

  if (!knownState?.hasSubscription) {
    writes.push(
      supabase.from("user_subscriptions").upsert(
        {
          user_id: userId,
          plan_key: "basic",
          status: "active",
          source: "automatic_default",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id", ignoreDuplicates: true }
      )
    );
  }

  const results = await Promise.all(writes);
  const failedResult = results.find(
    (result) =>
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      Boolean((result as { error?: unknown }).error)
  ) as { error?: unknown } | undefined;

  if (failedResult?.error) throw failedResult.error;
}

async function loadInstitutionGrants(
  supabase: AdminClient,
  memberships: Array<{ institution_id: string | null; status: string | null }>
) {
  const institutionIds = memberships
    .map((membership) => membership.institution_id)
    .filter((value): value is string => Boolean(value));

  if (institutionIds.length === 0) return [] as InstitutionGrant[];

  const [institutionsResult, subscriptionsResult] = await Promise.all([
    supabase
      .from("institutions")
      .select("id,status,deleted_at")
      .in("id", institutionIds),
    supabase
      .from("institution_subscriptions")
      .select("institution_id,plan_key,status,starts_at,ends_at")
      .in("institution_id", institutionIds),
  ]);

  if (institutionsResult.error) throw institutionsResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;

  const activeInstitutions = new Set(
    (institutionsResult.data ?? [])
      .filter(
        (institution) =>
          institution.status === "active" && !institution.deleted_at
      )
      .map((institution) => institution.id)
  );

  return (subscriptionsResult.data ?? [])
    .filter(
      (subscription) =>
        activeInstitutions.has(subscription.institution_id) &&
        (subscription.plan_key === "academy" ||
          subscription.plan_key === "enterprise") &&
        isActiveSubscription(subscription)
    )
    .map((subscription) => ({
      institutionId: subscription.institution_id,
      planKey: subscription.plan_key as InstitutionGrant["planKey"],
    }));
}

function isActiveSubscription(
  subscription:
    | {
        status?: string | null;
        starts_at?: string | null;
        ends_at?: string | null;
      }
    | null
    | undefined
) {
  return Boolean(
    subscription &&
      (subscription.status === "active" ||
        subscription.status === "trialing") &&
      isActiveWindow(subscription.starts_at, subscription.ends_at)
  );
}

function isActiveWindow(
  startsAt?: string | null,
  endsAt?: string | null,
  now = Date.now()
) {
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;

  return (
    (start === null || (Number.isFinite(start) && start <= now)) &&
    (end === null || (Number.isFinite(end) && end > now))
  );
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].sort() as T[];
}
