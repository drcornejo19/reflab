"use client";

import { usePathname } from "next/navigation";
import { useDiscipline } from "@/components/DisciplineProvider";
import { SportDisciplineSwitch } from "@/components/SportDisciplineSwitch";
import {
  SPORT_TYPES,
  getSportDefinition,
} from "@/lib/sports";
import { resolveDisciplinePath } from "@/lib/discipline";

export function SportPageSwitch({
  title = "Disciplina",
}: {
  title?: string;
}) {
  const pathname = usePathname();
  const { currentDiscipline } = useDiscipline();

  return (
    <SportDisciplineSwitch
      title={title}
      items={SPORT_TYPES.map((item) => {
        const definition = getSportDefinition(item);

        return {
          key: item,
          label: definition.label,
          description: definition.heroDescription,
          href: resolveDisciplinePath(pathname, item),
          active: currentDiscipline === item,
        };
      })}
    />
  );
}
