"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
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

  const [role, setRole] = useState<UserRole>("individual_referee");
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan>("free");
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    async function loadRole() {
      if (!isLoaded) return;

      if (!user) {
        setRole("individual_referee");
        setSubscriptionPlan("free");
        setLoadingRole(false);
        return;
      }

      let roleResult = await supabase
        .from("user_roles")
        .select("role,subscription_plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleResult.error && isSchemaCompatibilityError(roleResult.error)) {
        roleResult = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
      }

      let profileResult = await supabase
        .from("user_profiles")
        .select("subscription_plan")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileResult.error && isSchemaCompatibilityError(profileResult.error)) {
        profileResult = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
      }

      const nextRole =
        roleResult.error || !roleResult.data?.role
          ? "individual_referee"
          : normalizeRole(roleResult.data.role);

      setRole(nextRole);
      setSubscriptionPlan(
        profileResult.error
          ? normalizeSubscriptionPlan(roleResult.data?.subscription_plan)
          : normalizeSubscriptionPlan(profileResult.data?.subscription_plan ?? roleResult.data?.subscription_plan)
      );

      setLoadingRole(false);
    }

    loadRole();
  }, [isLoaded, user]);

  const isPro = hasProAccess(subscriptionPlan, role);

  return {
    role,
    subscriptionPlan,
    loadingRole,
    isVideoAdmin: roleAccess[role].canAccessAdmin,
    isSuperAdmin: role === "super_admin",
    isPro,
    isFree: !isPro,
    isInstitutionAdmin: role === "institution_admin",
    isInstitutionInstructor: role === "institutional_instructor",
    isInstitutionStudent: role === "institutional_student",
    isIndividualReferee: role === "individual_referee",
    canAccessIndividual: roleAccess[role].canAccessIndividual,
    canAccessInstitutionAdmin: roleAccess[role].canAccessInstitutionAdmin,
    canAccessInstitutionStudent: roleAccess[role].canAccessInstitutionStudent,
    canUseIndividualPremium: roleAccess[role].canUseIndividualPremium,
  };
}

function isSchemaCompatibilityError(error: { code?: string; message?: string; details?: string }) {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    message.includes("pgrst204") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}
