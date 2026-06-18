import { AppShell } from "@/components/AppShell";
import { PhysicalTrainingClient } from "@/components/PhysicalTrainingClient";
import { ProFeatureGate } from "@/components/ProFeatureGate";

export default function RefereePreparationPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1180px]">
        <ProFeatureGate
          title="Preparacion Integral se desbloquea con RefLab Pro"
          description="Accede a entrenamiento fisico, Tabata arbitral, psicologia arbitral, preparacion mental y rutinas pre/post partido."
          reason="El plan FREE mantiene entrenamiento tecnico base; la preparacion integral queda reservada para Pro."
        >
          <PhysicalTrainingClient />
        </ProFeatureGate>
      </div>
    </AppShell>
  );
}
