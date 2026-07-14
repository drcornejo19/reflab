import { AppShell } from "@/components/AppShell";
import { FutsalVideoAnalysisClient } from "@/components/FutsalVideoAnalysisClient";
import { SportDisciplineSwitch } from "@/components/SportDisciplineSwitch";

export default function FutsalVideoAnalysisPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <SportDisciplineSwitch
          items={[
            {
              key: "football_11",
              label: "Futbol 11",
              description:
                "Evaluaciones audiovisuales y reglas del arbitraje de futbol 11.",
              href: "/training/video-analysis",
              active: false,
            },
            {
              key: "futsal",
              label: "Futsal",
              description:
                "Videoanalisis y decisiones especificas de futsal con criterios propios.",
              href: "/futsal/video-analysis",
              active: true,
            },
          ]}
        />

        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
            VIDEOANALISIS FUTSAL
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Videoanalisis de futsal
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Analiza jugadas de futsal con topicos propios: faltas acumuladas,
            control de cuatro segundos, guardameta, sustituciones y trabajo
            arbitral.
          </p>
        </header>

        <FutsalVideoAnalysisClient />
      </div>
    </AppShell>
  );
}


