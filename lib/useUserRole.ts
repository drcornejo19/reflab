"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";

export type UserRole = "user" | "video_admin" | "super_admin";

export function useUserRole() {
  const { user, isLoaded } = useUser();

  const [role, setRole] = useState<UserRole>("user");
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    async function loadRole() {
      if (!isLoaded) return;

      if (!user) {
        setRole("user");
        setLoadingRole(false);
        return;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data?.role) {
        setRole("user");
      } else {
        setRole(data.role as UserRole);
      }

      setLoadingRole(false);
    }

    loadRole();
  }, [isLoaded, user]);

  return {
    role,
    loadingRole,
    isVideoAdmin: role === "video_admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
  };
}