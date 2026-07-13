"use client";

import Link from "next/link";
import { useDiscipline } from "@/components/DisciplineProvider";
import { isSportType } from "@/lib/sports";

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
  const { setDiscipline } = useDiscipline();

  return (
    <section className="rounded-[26px] border border-white/10 bg-[#0f1720] p-4 shadow-2xl sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
            {title}
          </p>
          <h2 className="mt-2 text-xl font-black sm:text-2xl">
            Elegi el entorno de trabajo
          </h2>
        </div>

        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Cada disciplina mantiene contenido, reglas y resultados separados.
        </p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            onClick={() => {
              if (isSportType(item.key)) {
                setDiscipline(item.key);
              }
            }}
            className={`rounded-3xl border p-4 text-left transition sm:p-5 ${
              item.active
                ? item.key === "futsal"
                  ? "border-sky-400/45 bg-sky-500/12 shadow-[0_0_28px_rgba(34,195,255,0.14)]"
                  : "border-[#6fc11f]/40 bg-[#6fc11f]/12 shadow-[0_0_28px_rgba(111,193,31,0.12)]"
                : item.key === "futsal"
                  ? "border-white/10 bg-black/20 hover:border-sky-400/35 hover:bg-white/[0.04]"
                  : "border-white/10 bg-black/20 hover:border-[#6fc11f]/30 hover:bg-white/[0.04]"
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
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                  item.active
                    ? item.key === "futsal"
                      ? "bg-sky-400 text-[#03111d]"
                      : "bg-[#6fc11f] text-black"
                    : "border border-white/10 bg-white/[0.04] text-zinc-400"
                }`}
              >
                {item.active ? "Activa" : "Cambiar"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
