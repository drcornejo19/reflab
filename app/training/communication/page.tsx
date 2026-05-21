import { AppShell } from "@/components/AppShell";
import { UnderConstruction } from "@/components/UnderConstruction";

export default function CommunicationTrainingPage() {
  return (
    <AppShell>
      <UnderConstruction
        title="Comunicación y liderazgo"
        description="Este módulo entrenará autoridad, lenguaje corporal, manejo de protestas, control emocional y puesta de límites."
        items={[
          "Manejo de protestas",
          "Comunicación verbal y no verbal",
          "Liderazgo arbitral",
          "Control de cuerpos técnicos",
          "Escaladas de conflicto",
        ]}
      />
    </AppShell>
  );
}
