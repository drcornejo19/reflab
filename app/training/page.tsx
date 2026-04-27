import { AppShell } from "@/components/AppShell";
import { TrainingClient } from "@/components/TrainingClient";

export default function TrainingPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Training
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Modo Entrenamiento
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Analizá clips de juego, tomá una decisión técnica, definí la
            reanudación, la sanción disciplinaria y si la acción es revisable
            por VAR.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Objetivo"
            text="Mejorar criterio arbitral mediante clips y feedback técnico."
          />

          <InfoCard
            title="Evaluación"
            text="Infracción, reanudación, disciplina, VAR y justificación."
          />

          <InfoCard
            title="Feedback IA"
            text="Análisis técnico automático con criterio arbitral."
          />
        </div>

        <TrainingClient mode="field" />
      </div>
    </AppShell>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">
        {title}
      </p>

      <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}