"use client";

import Link from "next/link";
import { useDiscipline } from "@/components/DisciplineProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import { isSportType, type SportType } from "@/lib/sports";

type DisciplineItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  active: boolean;
};

export function SportDisciplineSwitch({
  title = "Disciplina",
  items,
}: {
  title?: string;
  items: DisciplineItem[];
}) {
  const { currentDiscipline, setDiscipline } = useDiscipline();
  const theme = getDisciplineDefinition(currentDiscipline).theme;

  return (
    <section className="rounded-[26px] border border-white/10 bg-[#0f1720] p-4 shadow-2xl sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className="text-[10px] font-black uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.35em]"
            style={{ color: theme.accent }}
          >
            {title}
          </p>
          <h2 className="mt-2 text-xl font-black sm:text-2xl">
            Disciplina activa
          </h2>
        </div>

        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Cambia el contexto de la plataforma sin mezclar contenido, reglas ni metricas.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <DisciplineSwitchCard
            key={item.key}
            item={item}
            onSelect={setDiscipline}
          />
        ))}
      </div>
    </section>
  );
}

function DisciplineSwitchCard({
  item,
  onSelect,
}: {
  item: DisciplineItem;
  onSelect: (value: SportType) => void;
}) {
  const definition = getDisciplineDefinition(
    isSportType(item.key) ? item.key : "football_11"
  );
  const theme = definition.theme;

  return (
    <Link
      href={item.href}
      onClick={() => {
        if (isSportType(item.key)) {
          onSelectDiscipline(item.key, onSelect);
        }
      }}
      style={
        item.active
          ? {
              borderColor: theme.border,
              backgroundColor: theme.accentSoft,
              boxShadow: `0 0 28px ${theme.glow}`,
            }
          : undefined
      }
      className={`rounded-3xl border p-4 text-left transition sm:p-5 ${
        item.active
          ? ""
          : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-black">{item.label}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {item.description}
          </p>
        </div>

        <span
          style={
            item.active
              ? {
                  backgroundColor: theme.button,
                  color: theme.onAccent,
                }
              : undefined
          }
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
            item.active
              ? ""
              : "border border-white/10 bg-white/[0.04] text-zinc-400"
          }`}
        >
          {item.active ? "Activa" : "Cambiar"}
        </span>
      </div>
    </Link>
  );
}

function onSelectDiscipline(
  key: string,
  setDiscipline: (discipline: SportType) => void
) {
  if (isSportType(key)) {
    setDiscipline(key);
  }
}
