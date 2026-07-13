import { AppShell } from "@/components/AppShell";
import { FutsalRulesExamClient } from "@/components/FutsalRulesExamClient";
import { SportDisciplineSwitch } from "@/components/SportDisciplineSwitch";

export default function FutsalRulesExamPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <SportDisciplineSwitch
          items={[
            {
              key: "football_11",
              label: "Futbol 11",
              description: "Examen reglamentario IFAB para futbol 11.",
              href: "/training/rules-exam",
              active: false,
            },
            {
              key: "futsal",
              label: "Futsal",
              description:
                "Examen formal de reglas FIFA Futsal con resultados separados por disciplina.",
              href: "/futsal/rules-exam",
              active: true,
            },
          ]}
        />

        <FutsalRulesExamClient />
      </div>
    </AppShell>
  );
}
