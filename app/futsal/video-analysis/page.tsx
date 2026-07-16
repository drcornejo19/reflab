import { AppShell } from "@/components/AppShell";
import { FutsalVideoAnalysisClient } from "@/components/FutsalVideoAnalysisClient";

export default function FutsalVideoAnalysisPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
            VIDEOANALISIS FUTSAL
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Videoanalisis de futsal
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Analiza jugadas de futsal con tres topicos tecnicos: manos,
            disputas y faltas tacticas.
          </p>
        </header>

        <FutsalVideoAnalysisClient />
      </div>
    </AppShell>
  );
}


