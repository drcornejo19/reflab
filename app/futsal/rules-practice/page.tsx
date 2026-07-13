import { AppShell } from "@/components/AppShell";
import { FutsalRulesPracticeClient } from "@/components/FutsalRulesPracticeClient";
import { SportDisciplineSwitch } from "@/components/SportDisciplineSwitch";

export default function FutsalRulesPracticePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <SportDisciplineSwitch
          items={[
            {
              key: "football_11",
              label: "Futbol 11",
              description: "Practica reglamentaria IFAB para futbol 11.",
              href: "/training/rules-practice",
              active: false,
            },
            {
              key: "futsal",
              label: "Futsal",
              description:
                "Trivia reglamentaria basada en FIFA Futsal Laws of the Game.",
              href: "/futsal/rules-practice",
              active: true,
            },
          ]}
        />

        <FutsalRulesPracticeClient />
      </div>
    </AppShell>
  );
}
