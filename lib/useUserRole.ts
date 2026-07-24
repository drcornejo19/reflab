"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import {
  normalizeRole,
  roleAccess,
  type SystemRole,
} from "@/lib/institutionalRoles";
import {
  hasProAccess,
  normalizeSubscriptionPlan,
  type SubscriptionPlan,
} from "@/lib/subscription";

export type UserRole = SystemRole;

export function useUserRole() {
  const { user, isLoaded } = useUser();
  const { activeContext } = useInstitution();

  const [role, setRole] = useState<UserRole>("individual_referee");
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>("free");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    async function loadRole() {
      if (!isLoaded) return;

      if (!user) {
        setRole("individual_referee");
        setSubscriptionPlan("free");
        setCapabilities([]);
        setLoadingRole(false);
        return;
      }

      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const data = (await response.json()) as {
          profile?: {
            role?: string | null;
            subscriptionPlan?: string | null;
          };
          access?: {
            capabilities?: string[];
          };
        };

        if (!response.ok || !data.profile) {
          throw new Error("No se pudo cargar el acceso del usuario.");
        }

        setRole(normalizeRole(data.profile.role));
        setSubscriptionPlan(
          normalizeSubscriptionPlan(data.profile.subscriptionPlan)
        );
        setCapabilities(data.access?.capabilities ?? []);
      } catch {
        setRole("individual_referee");
        setSubscriptionPlan("free");
        setCapabilities([]);
      } finally {
        setLoadingRole(false);
      }
    }

    loadRole();
  }, [isLoaded, user]);

  const isPro = hasProAccess(subscriptionPlan, role);
  const institutionRoleKeys =
    activeContext?.membership?.roleKeys ?? [];
  const isInstitutionAdmin =
    institutionRoleKeys.includes("institution_admin");
  const isInstitutionInstructor =
    institutionRoleKeys.includes("instructor") ||
    institutionRoleKeys.includes("technical_coordinator") ||
    institutionRoleKeys.includes("evaluator");
  const isInstitutionStudent =
    institutionRoleKeys.includes("student") ||
    institutionRoleKeys.includes("referee") ||
    institutionRoleKeys.includes("invited_referee");

  return {
    role,
    subscriptionPlan,
    capabilities,
    canAccessFeature: (capability: string) =>
      role === "super_admin" || capabilities.includes(capability),
    loadingRole,
    isVideoAdmin: roleAccess[role].canAccessAdmin,
    isSuperAdmin: role === "super_admin",
    isPro,
    isFree: !isPro,
    isInstitutionAdmin,
    isInstitutionInstructor,
    isInstitutionStudent,
    isIndividualReferee: role === "individual_referee",
    canAccessIndividual: roleAccess[role].canAccessIndividual,
    canAccessInstitutionAdmin:
      role === "super_admin" ||
      isInstitutionAdmin ||
      isInstitutionInstructor,
    canAccessInstitutionStudent:
      role === "super_admin" || isInstitutionStudent,
    canUseIndividualPremium: true,
  };
}
