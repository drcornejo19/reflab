import { AppShell } from "@/components/AppShell";
import { EnglishExercise } from "@/components/EnglishExercise";

export default function EnglishPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* HEADER */}
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Communication
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Modo Inglés Arbitral
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Describí decisiones arbitrales en inglés técnico.
            Mejorá tu comunicación para contextos FIFA.
          </p>
        </header>

        {/* INFO */}
        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Objetivo"
            text="Comunicar decisiones claras, precisas y técnicas en inglés."
          />
          <InfoCard
            title="Enfoque"
            text="Terminología FIFA: reckless, excessive force, SPA, DOGSO."
          />
          <InfoCard
            title="Evaluación"
            text="Precisión técnica + claridad + vocabulario."
          />
        </div>

        {/* EJERCICIO */}
        <EnglishExercise />
      </div>
    </AppShell>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <p className="text-xs font-black uppercase text-white">{title}</p>
      <p className="mt-2 text-sm text-zinc-400">{text}</p>
    </div>
  );
}