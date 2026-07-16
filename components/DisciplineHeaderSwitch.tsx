"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowRightLeft, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useDiscipline } from "@/components/DisciplineProvider";
import {
  getDisciplineDefinition,
  resolveDisciplinePath,
} from "@/lib/discipline";
import type { SportType } from "@/lib/sports";
import { RF_LOGO_SIZE } from "@/lib/brand";

export function DisciplineHeaderSwitch({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [changing, startChange] = useTransition();
  const { currentDiscipline, setDiscipline } = useDiscipline();
  const current = getDisciplineDefinition(currentDiscipline);
  const targetDiscipline: SportType =
    currentDiscipline === "futsal" ? "football_11" : "futsal";
  const target = getDisciplineDefinition(targetDiscipline);

  useEffect(() => {
    if (!confirmationOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConfirmationOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [confirmationOpen]);

  function confirmChange() {
    setDiscipline(targetDiscipline);
    setConfirmationOpen(false);

    startChange(() => {
      router.replace(resolveDisciplinePath(pathname, targetDiscipline));
    });
  }

  const confirmationModal = confirmationOpen ? (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setConfirmationOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="discipline-change-title"
        className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border bg-[#09121b] p-6 text-left shadow-2xl sm:p-7"
        style={{
          borderColor: target.theme.border,
          boxShadow: `0 28px 90px rgba(0,0,0,0.62), 0 0 45px ${target.theme.glow}`,
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-50"
          style={{
            background: `radial-gradient(circle at 50% 0%, ${target.theme.glow}, transparent 72%)`,
          }}
        />

        <button
          type="button"
          onClick={() => setConfirmationOpen(false)}
          aria-label="Cerrar confirmacion"
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/25 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <X size={18} />
        </button>

        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <DisciplineMark discipline={targetDiscipline} size="large" />
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-[0.26em]"
                style={{ color: target.theme.accent }}
              >
                RefLab {target.sessionLabel}
              </p>
              <h2
                id="discipline-change-title"
                className="mt-1 text-2xl font-black text-white"
              >
                Cambiar a {target.sessionLabel}?
              </h2>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-zinc-300">
            Se actualizaran el contenido, las reglas, las evaluaciones y las metricas correspondientes a esta disciplina.
          </p>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            Tus resultados de {current.sessionLabel} permaneceran guardados y separados.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setConfirmationOpen(false)}
              className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmChange}
              className="min-h-12 rounded-2xl px-4 text-sm font-black transition hover:brightness-110"
              style={{
                backgroundColor: target.theme.button,
                color: target.theme.onAccent,
                boxShadow: `0 0 28px ${target.theme.glow}`,
              }}
            >
              Cambiar disciplina
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmationOpen(true)}
        disabled={changing}
        aria-label={`Cambiar a ${target.sessionLabel}`}
        title={`Cambiar a ${target.sessionLabel}`}
        className={`group flex items-center rounded-2xl border bg-[#0b131b]/95 font-black shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-[#111c26] focus-visible:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-65 ${
          compact ? "h-11 gap-2 px-2.5 text-xs" : "h-12 gap-3 px-3.5 text-sm"
        }`}
        style={{
          borderColor: target.theme.border,
          color: target.theme.accent,
          boxShadow: `0 10px 28px rgba(0,0,0,0.3), 0 0 18px ${target.theme.glow}`,
          outlineColor: target.theme.accent,
        }}
      >
        <DisciplineMark
          discipline={targetDiscipline}
          size={compact ? "small" : "medium"}
        />
        <span className={compact ? "hidden min-[470px]:inline" : "inline"}>
          {changing ? "Cambiando..." : `Cambiar a ${target.sessionLabel}`}
        </span>
        {compact ? (
          <span className="min-[470px]:hidden">{target.sessionLabel}</span>
        ) : null}
        <ArrowRightLeft
          size={compact ? 15 : 17}
          aria-hidden="true"
          className="shrink-0 transition-transform group-hover:rotate-180"
        />
      </button>

      {confirmationModal ? createPortal(confirmationModal, document.body) : null}
    </>
  );
}

function DisciplineMark({
  discipline,
  size,
}: {
  discipline: SportType;
  size: "small" | "medium" | "large";
}) {
  const definition = getDisciplineDefinition(discipline);
  const sizeClass =
    size === "small" ? "h-6 w-6" : size === "medium" ? "h-8 w-8" : "h-14 w-14";

  return (
    <span
      aria-hidden="true"
      className={`${sizeClass} grid shrink-0 place-items-center overflow-hidden rounded-full border`}
      style={{
        borderColor: definition.theme.border,
        boxShadow: `0 0 14px ${definition.theme.glow}`,
      }}
    >
      <Image
        src={definition.logoSrc}
        alt=""
        width={RF_LOGO_SIZE}
        height={RF_LOGO_SIZE}
        sizes={size === "small" ? "24px" : size === "medium" ? "32px" : "56px"}
        className={`h-full w-full object-cover ${discipline === "futsal" ? "scale-[1.42]" : ""}`}
      />
    </span>
  );
}
