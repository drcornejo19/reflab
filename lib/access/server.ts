import "server-only";

import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import {
  normalizeGlobalRole,
  normalizeIndividualPlan,
} from "./catalog.ts";
import type {
  AccessSnapshot,
  AccessSource,
  CanonicalPlanKey,
} from "./types.ts";
import { requiresCanonicalDevelopmentIdentity } from "../identity/developmentLinker.ts";
import { resolveCapabilityKeys } from "./resolveCapabilities.ts";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type GlobalRoleRecord = {
  role_key: string;
};

type SubscriptionRecord = {
  plan_key: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type CanonicalAccessRecords = {
  userId: string;
  globalRole: GlobalRoleRecord;
  subscription: SubscriptionRecord;
};

type CanonicalAccessOptions = {
  environment?: NodeJS.ProcessEnv;
  resolveLinkedIdentity?: (externalSubject: string) => Promise<string | null>;
  provisionMissing?: boolean;
};

type IdentityResolutionRpcClient = {
  rpc(
    functionName: "resolve_development_clerk_identity",
    parameters: { p_external_subject: string }
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export const IDENTITY_LINK_REQUIRED = "identity_link_required";

export class IdentityLinkRequiredError extends Error {
  readonly code = IDENTITY_LINK_REQUIRED;

  constructor() {
    super(IDENTITY_LINK_REQUIRED);
    this.name = "IdentityLinkRequiredError";
  }
}

type InstitutionGrant = {
  institutionId: string;
  planKey: Extract<CanonicalPlanKey, "academy" | "enterprise">;
};

export async function loadAccessSnapshot(
  supabase: AdminClient,
  externalUserId: string,
  options: CanonicalAccessOptions = {}
): Promise<AccessSnapshot> {
  const userId = await resolveCanonicalAccessUserId(
    supabase,
    externalUserId,
    options
  );
  return loadCanonicalAccessSnapshot(supabase, userId, options);
}

export async function loadCanonicalAccessSnapshot(
  supabase: AdminClient,
  userId: string,
  options: Pick<CanonicalAccessOptions, "provisionMissing"> = {}
): Promise<AccessSnapshot> {
  const accessRecords = options.provisionMissing === false
    ? await requireCanonicalAccessRecordsForUserId(supabase, userId)
    : await ensureCanonicalAccessRecordsForUserId(supabase, userId);
  const membershipResult = await supabase
    .from("institution_memberships")
    .select("institution_id,status")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipResult.error) throw membershipResult.error;

  const globalRole = normalizeGlobalRole(accessRecords.globalRole.role_key);
  const individualPlan = isActiveSubscription(accessRecords.subscription)
    ? normalizeIndividualPlan(accessRecords.subscription.plan_key)
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
  externalUserId: string,
  options: CanonicalAccessOptions = {}
): Promise<CanonicalAccessRecords> {
  const userId = await resolveCanonicalAccessUserId(
    supabase,
    externalUserId,
    options
  );
  return ensureCanonicalAccessRecordsForUserId(supabase, userId);
}

async function requireCanonicalAccessRecordsForUserId(
  supabase: AdminClient,
  userId: string
): Promise<CanonicalAccessRecords> {
  const state = await loadCanonicalAccessRecords(supabase, userId);

  if (!state.globalRole || !state.subscription) {
    throw new Error("Canonical access records are missing.");
  }

  return {
    userId,
    globalRole: state.globalRole,
    subscription: state.subscription,
  };
}

async function ensureCanonicalAccessRecordsForUserId(
  supabase: AdminClient,
  userId: string
): Promise<CanonicalAccessRecords> {
  let state = await loadCanonicalAccessRecords(supabase, userId);
  const writes: Array<PromiseLike<unknown>> = [];

  if (!state.globalRole) {
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

  if (!state.subscription) {
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

  if (writes.length > 0) {
    state = await loadCanonicalAccessRecords(supabase, userId);
  }

  if (!state.globalRole || !state.subscription) {
    throw new Error("Canonical access provisioning did not complete.");
  }

  return {
    userId,
    globalRole: state.globalRole,
    subscription: state.subscription,
  };
}

export async function resolveCanonicalAccessUserId(
  supabase: AdminClient,
  externalUserId: string,
  options: CanonicalAccessOptions = {}
) {
  const environment = options.environment ?? process.env;
  if (!requiresCanonicalDevelopmentIdentity(environment)) {
    return externalUserId;
  }

  const resolveLinkedIdentity =
    options.resolveLinkedIdentity ??
    ((subject: string) => resolveDevelopmentIdentity(supabase, subject));
  const canonicalUserId = await resolveLinkedIdentity(externalUserId);

  if (canonicalUserId === null) {
    throw new IdentityLinkRequiredError();
  }

  if (
    !canonicalUserId ||
    canonicalUserId !== canonicalUserId.trim() ||
    canonicalUserId.length > 255
  ) {
    throw new Error("Canonical identity resolution returned invalid data.");
  }

  return canonicalUserId;
}

async function resolveDevelopmentIdentity(
  supabase: AdminClient,
  externalSubject: string
) {
  const { data, error } = await (
    supabase as IdentityResolutionRpcClient
  ).rpc("resolve_development_clerk_identity", {
    p_external_subject: externalSubject,
  });

  if (error) throw error;
  return data === null ? null : typeof data === "string" ? data : "";
}

async function loadCanonicalAccessRecords(
  supabase: AdminClient,
  userId: string
) {
  const [globalRoleResult, subscriptionResult] = await Promise.all([
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
  ]);

  if (globalRoleResult.error) throw globalRoleResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;

  return {
    globalRole: globalRoleResult.data as GlobalRoleRecord | null,
    subscription: subscriptionResult.data as SubscriptionRecord | null,
  };
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
