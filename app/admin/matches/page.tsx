"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { AdminMatchesClient } from "@/components/AdminMatchesClient";
import { useUserRole } from "@/lib/useUserRole";

export default function AdminMatchesPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isLoaded, user, isVideoAdmin, router]);

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user || !isVideoAdmin) return null;

  return (
    <AppShell>
      <AdminMatchesClient />
    </AppShell>
  );
}
