export const globalRoleKeys = ["super_admin", "referee"] as const;
export type GlobalRoleKey = (typeof globalRoleKeys)[number];

export const canonicalPlanKeys = [
  "basic",
  "pro",
  "academy",
  "enterprise",
] as const;
export type CanonicalPlanKey = (typeof canonicalPlanKeys)[number];
export type IndividualPlanKey = Extract<CanonicalPlanKey, "basic" | "pro">;

export type AccessSource =
  | "super_admin"
  | "institution"
  | "individual"
  | "basic_default";

export type AccessSnapshot = {
  userId: string;
  globalRole: GlobalRoleKey;
  individualPlan: IndividualPlanKey;
  effectiveIndividualPlan: IndividualPlanKey;
  capabilities: string[];
  sources: AccessSource[];
  inheritedFromInstitutionIds: string[];
};
