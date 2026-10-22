import { AppShell } from "@/components/AppShell";
import { CanonicalRulesExamClient } from "@/components/CanonicalRulesExamClient";

export default function RulesExamPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <CanonicalRulesExamClient sportType="football" />
      </div>
    </AppShell>
  );
}
