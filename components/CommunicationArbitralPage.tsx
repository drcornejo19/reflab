import { AppShell } from "@/components/AppShell";
import { EnglishExercise } from "@/components/EnglishExercise";
import { ProFeatureGate } from "@/components/ProFeatureGate";

export function CommunicationArbitralPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.16),transparent_38%),#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Communication
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Comunicacion Arbitral
          </h1>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            Explica decisiones en espanol, entrena ingles arbitral IFAB y aprende vocabulario tecnico con trivia interactiva.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <InfoCard
            title="Decision en espanol"
            text="Voz de estadio, decision final, reanudacion y sancion disciplinaria."
          />
          <InfoCard
            title="IFAB English"
            text="Vocabulario arbitral, terminologia IFAB y claridad internacional."
          />
          <InfoCard
            title="Trivia"
            text="Multiple choice, verdadero/falso, relacionar conceptos y flashcards."
          />
        </div>

        <ProFeatureGate
          title="Comunicacion Arbitral es parte de RefLab Pro"
          description="Practica explicaciones tecnicas en espanol, ingles arbitral IFAB y vocabulario especializado."
          reason="El plan FREE conserva acceso base; la comunicacion arbitral avanzada se desbloquea con Pro."
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
