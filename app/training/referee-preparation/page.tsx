import { AppShell } from "@/components/AppShell";
import { PhysicalTrainingClient } from "@/components/PhysicalTrainingClient";

export default function RefereePreparationPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1180px]">
        <PhysicalTrainingClient />
      </div>
    </AppShell>
  );
}
