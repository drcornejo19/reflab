import { AppShell } from "@/components/AppShell";
import { ProFeatureGate } from "@/components/ProFeatureGate";
import { UnderConstruction } from "@/components/UnderConstruction";

export default function CommunicationTrainingPage() {
  return (
    <AppShell>
      <ProFeatureGate
        title="Comunicacion y liderazgo es parte de RefLab Pro"
        description="Este modulo entrenara autoridad, lenguaje corporal, manejo de protestas, control emocional y puesta de limites."
        reason="La experiencia FREE se enfoca en probar entrenamiento tecnico base."
      >
        <UnderConstruction
          title="Comunicacion y liderazgo"
          description="Este modulo entrenara autoridad, lenguaje corporal, manejo de protestas, control emocional y puesta de limites."
          items={[
            "Manejo de protestas",
            "Comunicacion verbal y no verbal",
            "Liderazgo arbitral",
            "Control de cuerpos tecnicos",
            "Escaladas de conflicto",
          ]}
        />
      </ProFeatureGate>
    </AppShell>
  );
}
