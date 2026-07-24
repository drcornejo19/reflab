import type {
  CanonicalPlanKey,
  GlobalRoleKey,
  IndividualPlanKey,
} from "@/lib/access/types";

export function normalizeGlobalRole(value?: string | null): GlobalRoleKey {
  return value === "super_admin" || value === "video_admin"
    ? "super_admin"
    : "referee";
}

export function normalizeIndividualPlan(
  value?: string | null
): IndividualPlanKey {
  return value === "pro" ? "pro" : "basic";
}

export function toLegacyPlan(plan: IndividualPlanKey) {
  return plan === "pro" ? "pro" : "free";
}

export function isCanonicalPlan(value?: string | null): value is CanonicalPlanKey {
  return (
    value === "basic" ||
    value === "pro" ||
    value === "academy" ||
    value === "enterprise"
  );
}
