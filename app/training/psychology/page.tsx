import { AppShell } from "@/components/AppShell";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { PsychologyTrainingClient } from "@/components/PsychologyTrainingClient";

export default function PsychologyTrainingPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1180px]">
        <ProFeatureGate
          title="Psicologia arbitral se desbloquea con RefLab Pro"
          description="Accede a check-ins mentales, gestion del error, rutinas de foco y seguimiento psicologico orientativo."
          reason="El plan FREE mantiene entrenamiento tecnico base; la preparacion mental forma parte de RefLab Pro."
        >
          <PsychologyTrainingClient />
        </ProFeatureGate>
      </div>
    </AppShell>
  );
}
