import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { ChartNoAxesCombined, Trophy } from "lucide-react";

export default function MobileStatsPage() {
  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden pb-2">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-4">
          <h1 className="break-words text-2xl font-black leading-tight">Rendimiento mobile</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Seguimiento y competencia.</p>
        </header>

        <div className="grid gap-3">
          <Link
            href="/stats"
            className="min-w-0 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4"
          >
            <ChartNoAxesCombined className="text-[#6fc11f]" size={34} />
            <h2 className="mt-4 break-words text-xl font-black">Estadisticas</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Rendimiento por topico, precision y evolucion.
            </p>
          </Link>

          <Link
            href="/ranking"
            className="min-w-0 rounded-3xl border border-white/10 bg-[#101b24] p-4"
          >
            <Trophy className="text-[#6fc11f]" size={34} />
            <h2 className="mt-4 break-words text-xl font-black">Ranking</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Compara rendimiento entre arbitros.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
