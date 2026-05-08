"use client";

import { AppShell } from "@/components/AppShell";

export default function VideoAnalysisPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            REFLAB VIDEO ANALYSIS
          </p>

          <h1 className="mt-3 text-3xl font-black">Video Análisis</h1>

          <p className="mt-2 text-sm text-zinc-400">
            Analizá jugadas y justificá decisiones arbitrales.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <p className="text-zinc-400">
            Próximamente vas a poder analizar jugadas completas.
          </p>
        </section>
      </div>
    </AppShell>
  );
}