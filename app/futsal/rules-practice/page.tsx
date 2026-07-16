import { AppShell } from "@/components/AppShell";
import { FutsalRulesPracticeClient } from "@/components/FutsalRulesPracticeClient";

export default function FutsalRulesPracticePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <FutsalRulesPracticeClient />
      </div>
    </AppShell>
  );
}
