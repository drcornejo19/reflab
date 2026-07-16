import { AppShell } from "@/components/AppShell";
import { FutsalRulesExamClient } from "@/components/FutsalRulesExamClient";

export default function FutsalRulesExamPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <FutsalRulesExamClient />
      </div>
    </AppShell>
  );
}
