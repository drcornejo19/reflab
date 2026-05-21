import { AppShell } from "@/components/AppShell";
import { UnderConstruction } from "@/components/UnderConstruction";

export default function RefereePreparationPage() {
  return (
    <AppShell>
      <UnderConstruction
        title="Preparación del árbitro"
        description="Este módulo integrará psicología arbitral, preparación pre-partido, hábitos físicos, recuperación, ética y carrera arbitral."
        items={[
          "Psicología arbitral",
          "Preparación pre-partido",
          "Nutrición y recuperación",
          "Entrenamiento físico",
          "Ética profesional",
          "Carrera arbitral",
        ]}
      />
    </AppShell>
  );
}
