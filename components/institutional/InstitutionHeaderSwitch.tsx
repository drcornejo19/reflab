"use client";

import { Building2, ChevronDown, LoaderCircle } from "lucide-react";
import { useInstitution } from "@/components/institutional/InstitutionProvider";

export function InstitutionHeaderSwitch({ compact = false }: { compact?: boolean }) {
  const { snapshot, activeContext, loading, selecting, selectInstitution } =
    useInstitution();

  if (loading || !activeContext || !snapshot?.contexts.length) return null;

  const accent = activeContext.institution.brandColor;

  return (
    <label
      className={`relative flex shrink-0 items-center overflow-hidden rounded-2xl border bg-white/[0.04] transition hover:bg-white/[0.07] ${
        compact ? "h-11 w-11 justify-center" : "h-11 min-w-[190px] max-w-[250px]"
      }`}
      style={{ borderColor: `${accent}55` }}
      title={`Institucion activa: ${activeContext.institution.name}`}
    >
      <span
        className={`grid shrink-0 place-items-center ${compact ? "h-full w-full" : "ml-2 h-8 w-8 rounded-xl"}`}
        style={{ color: accent, backgroundColor: compact ? undefined : `${accent}18` }}
      >
        {selecting ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : (
          <Building2 size={17} />
        )}
      </span>

      {!compact ? (
        <>
          <select
            aria-label="Cambiar institucion activa"
            value={activeContext.institution.id}
            disabled={selecting}
            onChange={(event) => void selectInstitution(event.target.value)}
            className="h-full min-w-0 flex-1 appearance-none bg-transparent py-1 pl-2 pr-8 text-xs font-black text-white outline-none disabled:opacity-60"
          >
            {snapshot.contexts.map((context) => (
              <option
                key={context.institution.id}
                value={context.institution.id}
                className="bg-[#0b131b] text-white"
              >
                {context.institution.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 text-zinc-500"
          />
        </>
      ) : (
        <select
          aria-label="Cambiar institucion activa"
          value={activeContext.institution.id}
          disabled={selecting}
          onChange={(event) => void selectInstitution(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {snapshot.contexts.map((context) => (
            <option key={context.institution.id} value={context.institution.id}>
              {context.institution.name}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}
