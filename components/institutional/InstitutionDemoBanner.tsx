"use client";

import Link from "next/link";
import { Eye, LockKeyhole } from "lucide-react";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { institutionRoleLabels } from "@/lib/institutional/permissions";

export function InstitutionDemoBanner() {
  const { activeContext } = useInstitution();
  if (!activeContext?.demoMode || !activeContext.simulatedRole) return null;

  return (
    <Link
      href="/institution/demo"
      className="mb-5 flex items-center justify-between gap-4 rounded-[22px] border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-amber-100"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/15">
          <Eye size={18} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">
            Modo demo: {institutionRoleLabels[activeContext.simulatedRole]}
          </span>
          <span className="block truncate text-[11px] text-amber-100/65">
            Solo lectura · los datos reales estan protegidos
          </span>
        </span>
      </span>
      <LockKeyhole size={17} className="shrink-0" />
    </Link>
  );
}
