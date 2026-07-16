"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useDiscipline } from "@/components/DisciplineProvider";
import {
  getAllDisciplines,
  getDisciplineDefinition,
  resolveDisciplinePath,
} from "@/lib/discipline";
import type { SportType } from "@/lib/sports";

export function DisciplineHeaderSwitch({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const { currentDiscipline, setDiscipline } = useDiscipline();
  const current = getDisciplineDefinition(currentDiscipline);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectDiscipline(nextDiscipline: SportType) {
    setOpen(false);
    if (nextDiscipline === currentDiscipline) return;

    setDiscipline(nextDiscipline);
    router.replace(resolveDisciplinePath(pathname, nextDiscipline));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center rounded-2xl border bg-[#0b131b]/95 font-black text-white shadow-xl backdrop-blur-xl transition hover:bg-[#111c26] focus-visible:outline-none focus-visible:ring-2 ${
          compact ? "h-11 gap-2 px-3 text-xs" : "h-12 min-w-[154px] justify-between gap-3 px-4 text-sm"
        }`}
        style={{
          borderColor: current.theme.border,
          boxShadow: `0 12px 35px rgba(0,0,0,0.32), 0 0 20px ${current.theme.glow}`,
          outlineColor: current.theme.accent,
        }}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{
              backgroundColor: current.theme.accent,
              boxShadow: `0 0 12px ${current.theme.glow}`,
            }}
          />
          <span className="truncate">{current.sessionLabel}</span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Cambiar disciplina"
          className="absolute right-0 top-[calc(100%+10px)] z-[70] w-[220px] overflow-hidden rounded-[22px] border border-white/10 bg-[#0b131b] p-2 shadow-2xl"
        >
          <p className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.24em] text-zinc-500">
            Cambiar disciplina
          </p>
          {getAllDisciplines().map((discipline) => {
            const active = discipline.key === currentDiscipline;

            return (
              <button
                key={discipline.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectDiscipline(discipline.key)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left text-sm font-black transition hover:bg-white/[0.06]"
                style={
                  active
                    ? {
                        color: discipline.theme.accent,
                        backgroundColor: discipline.theme.accentSoft,
                      }
                    : undefined
                }
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: discipline.theme.accent }}
                  />
                  {discipline.sessionLabel}
                </span>
                {active ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
