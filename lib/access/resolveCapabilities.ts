export type CapabilityPlanGrant = {
  planKey: string;
  capabilityKey: string;
};

export type CapabilityInstitutionGrant = {
  institutionId: string;
  planKey: string;
};

export type CapabilityOverride = {
  institutionId?: string | null;
  capabilityKey: string;
  scopeType: "global_user" | "institution_user";
  effect: "allow" | "deny";
  validFrom?: string | null;
  validUntil?: string | null;
};

type ResolveCapabilitiesInput = {
  individualPlan: "basic" | "pro";
  institutionGrants: CapabilityInstitutionGrant[];
  planCapabilities: CapabilityPlanGrant[];
  overrides: CapabilityOverride[];
  now?: number;
};

export function resolveCapabilityKeys({
  individualPlan,
  institutionGrants,
  planCapabilities,
  overrides,
  now = Date.now(),
}: ResolveCapabilitiesInput) {
  const capabilitySources = new Map<string, Set<string>>();

  for (const row of planCapabilities) {
    const sources = capabilitySources.get(row.capabilityKey) ?? new Set();

    if (row.planKey === "basic") {
      sources.add("basic_default");
    }

    if (row.planKey === individualPlan) {
      sources.add("individual");
    }

    for (const grant of institutionGrants) {
      if (row.planKey === grant.planKey) {
        sources.add(`institution:${grant.institutionId}`);
      }
    }

    if (sources.size > 0) {
      capabilitySources.set(row.capabilityKey, sources);
    }
  }

  const activeInstitutionIds = new Set(
    institutionGrants.map((grant) => grant.institutionId)
  );

  for (const override of overrides) {
    if (!isActiveWindow(override.validFrom, override.validUntil, now)) continue;

    if (
      override.scopeType === "institution_user" &&
      (!override.institutionId ||
        !activeInstitutionIds.has(override.institutionId))
    ) {
      continue;
    }

    if (override.effect === "allow") {
      const sources =
        capabilitySources.get(override.capabilityKey) ?? new Set<string>();
      sources.add(
        override.scopeType === "global_user"
          ? "override:global"
          : `override:institution:${override.institutionId}`
      );
      capabilitySources.set(override.capabilityKey, sources);
      continue;
    }

    if (override.scopeType === "global_user") {
      capabilitySources.delete(override.capabilityKey);
      continue;
    }

    if (override.institutionId) {
      const sources = capabilitySources.get(override.capabilityKey);
      sources?.delete(`institution:${override.institutionId}`);
      sources?.delete(`override:institution:${override.institutionId}`);

      if (sources?.size === 0) {
        capabilitySources.delete(override.capabilityKey);
      }
    }
  }

  return [...capabilitySources.keys()].sort();
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
