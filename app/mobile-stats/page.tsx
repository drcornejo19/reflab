"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { ChartNoAxesCombined, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { SportPageSwitch } from "@/components/SportPageSwitch";
import { getSportLabel } from "@/lib/sports";

export const dynamic = "force-dynamic";

export default function MobileStatsPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando estadisticas mobile..." />}>
      <MobileStatsPageContent />
    </Suspense>
  );
}

function MobileStatsPageContent() {
  const { currentDiscipline: sportType } = useDiscipline();

  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden pb-2">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-4">
          <h1 className="break-words text-2xl font-black leading-tight">Rendimiento mobile</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Seguimiento y competencia para {getSportLabel(sportType).toLowerCase()}.
          </p>
        </header>

        <SportPageSwitch title="Disciplina mobile" />

        <div className="grid gap-3">
          <Link
            href="/stats"
            className="min-w-0 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4"
          >
            <ChartNoAxesCombined className="text-[#6fc11f]" size={34} />
            <h2 className="mt-4 break-words text-xl font-black">Estadisticas</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Rendimiento por topico, precision y evolucion sin mezclar disciplinas.
            </p>
          </Link>

          <Link
            href="/ranking"
            className="min-w-0 rounded-3xl border border-white/10 bg-[#101b24] p-4"
          >
            <Trophy className="text-[#6fc11f]" size={34} />
            <h2 className="mt-4 break-words text-xl font-black">Ranking</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Compara rendimiento entre arbitros dentro de la misma disciplina.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
