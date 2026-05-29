"use client";

import type { ReactNode } from "react";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useUserRole } from "@/lib/useUserRole";

type ProFeatureGateProps = {
  children: ReactNode;
  title: string;
  description: string;
  reason?: string;
};

export function ProFeatureGate({
  children,
  title,
  description,
  reason,
}: ProFeatureGateProps) {
  const { loadingRole, isPro } = useUserRole();

  if (loadingRole) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        Validando plan...
      </div>
    );
  }

  if (isPro) {
    return <>{children}</>;
  }

  return <ProUpgradeCard title={title} description={description} reason={reason} />;
}
