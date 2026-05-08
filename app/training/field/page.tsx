import { AppShell } from "@/components/AppShell";
import { TrainingClient } from "@/components/TrainingClient";

export default function FieldTrainingPage() {
  return (
    <AppShell>
      <TrainingClient mode="field" />
    </AppShell>
  );
}