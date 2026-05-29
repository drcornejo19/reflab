import { AppShell } from "@/components/AppShell";
import { PhysicalTrainingClient } from "@/components/PhysicalTrainingClient";
import { ProFeatureGate } from "@/components/ProFeatureGate";

export default function RefereePreparationPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1180px]">
        <ProFeatureGate
          title="Preparacion arbitral se desbloquea con RefLab Pro"
          description="Accede a herramientas de preparacion, Tabata arbitral, rutinas configurables y seguimiento de desarrollo arbitral."
          reason="El plan FREE mantiene entrenamiento tecnico base; la preparacion integral queda reservada para Pro."
        >
          <PhysicalTrainingClient />
        </ProFeatureGate>
      </div>
    </AppShell>
  );
}
