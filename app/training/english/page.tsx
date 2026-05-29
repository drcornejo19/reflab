import { AppShell } from "@/components/AppShell";
import { EnglishExercise } from "@/components/EnglishExercise";
import { ProFeatureGate } from "@/components/ProFeatureGate";

export default function EnglishPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Communication
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Ingles arbitral
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Explica decisiones en ingles tecnico arbitral con vocabulario FIFA,
            VAR y reportes.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Objetivo"
            text="Comunicar decisiones claras, precisas y tecnicas en ingles."
          />
          <InfoCard
            title="Enfoque"
            text="Terminologia FIFA: reckless, excessive force, SPA, DOGSO."
          />
          <InfoCard
            title="Evaluacion"
            text="Precision tecnica + claridad + vocabulario."
          />
        </div>

        <ProFeatureGate
          title="Ingles arbitral es parte de RefLab Pro"
          description="Practica explicaciones tecnicas en ingles con feedback y terminologia arbitral."
          reason="El plan FREE conserva acceso base; la comunicacion avanzada se desbloquea con Pro."
        >
          <EnglishExercise />
        </ProFeatureGate>
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
