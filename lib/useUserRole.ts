"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import {
  normalizeRole,
  roleAccess,
  type SystemRole,
} from "@/lib/institutionalRoles";

export type UserRole = SystemRole;

export function useUserRole() {
  const { user, isLoaded } = useUser();

  const [role, setRole] = useState<UserRole>("individual_referee");
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    async function loadRole() {
      if (!isLoaded) return;

      if (!user) {
        setRole("individual_referee");
        setLoadingRole(false);
        return;
      }

      const { data, error } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", user.id)
  .maybeSingle();

      setRole(error || !data?.role ? "individual_referee" : normalizeRole(data.role));

      setLoadingRole(false);
    }

    loadRole();
  }, [isLoaded, user]);

  return {
    role,
    loadingRole,
    isVideoAdmin: roleAccess[role].canAccessAdmin,
    isSuperAdmin: role === "super_admin",
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
