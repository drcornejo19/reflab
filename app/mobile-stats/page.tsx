import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { ChartNoAxesCombined, Trophy } from "lucide-react";

export default function MobileStatsPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <h1 className="text-3xl font-black">Stats</h1>
        <p className="text-zinc-400">Seguimiento y competencia.</p>

        <div className="grid gap-4">
          <Link
            href="/stats"
            className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-6"
          >
            <ChartNoAxesCombined className="text-[#6fc11f]" size={40} />
            <h2 className="mt-4 text-2xl font-black">Estadísticas</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Rendimiento por tópico, precisión y evolución.
            </p>
          </Link>

          <Link
            href="/ranking"
            className="rounded-3xl border border-white/10 bg-[#101b24] p-6"
          >
            <Trophy className="text-[#6fc11f]" size={40} />
            <h2 className="mt-4 text-2xl font-black">Ranking</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Compará rendimiento entre árbitros.
            </p>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}