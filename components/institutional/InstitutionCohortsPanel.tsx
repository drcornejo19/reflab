"use client";

import { CalendarRange, Plus, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  InstitutionDirectory,
  InstitutionLifecycleStatus,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type PanelProps = {
  directory: InstitutionDirectory;
  accent: string;
  onChanged: () => Promise<InstitutionDirectory | null>;
};

export function InstitutionCohortsPanel({
  directory,
  accent,
  onChanged,
}: PanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateCohort(
    cohortId: string,
    status: InstitutionLifecycleStatus
  ) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/institution/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: directory.institution.id, status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la cohorte.");
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo actualizar la cohorte.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a131c] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: accent }}>
            Ciclos de formacion
          </p>
          <h2 className="mt-2 text-2xl font-black">Cohortes</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Agrupa cursos, comisiones y equipos dentro de una temporada.
          </p>
        </div>
        {directory.capabilities.canManageGroups ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            style={{ backgroundColor: accent, color: "#04100a" }}
          >
            <Plus size={17} />
            Crear cohorte
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-bold text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {directory.cohorts.length ? (
          directory.cohorts.map((cohort) => (
            <article key={cohort.id} className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ backgroundColor: `${accent}18`, color: accent }}>
                  <CalendarRange size={19} />
                </span>
                <StatusPill status={cohort.status} />
              </div>
              <h3 className="mt-5 text-lg font-black text-white">{cohort.name}</h3>
              <p className="mt-2 text-xs text-zinc-500">
                {cohort.sportType === "futsal" ? "Futsal" : "Futbol 11"}
                {cohort.seasonLabel ? ` · ${cohort.seasonLabel}` : ""}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Metric label="Grupos" value={cohort.groupCount} />
                <Metric label="Participantes" value={cohort.participantCount} />
              </div>
              <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-600">
                {formatRange(cohort.startsOn, cohort.endsOn)}
              </p>
              {directory.capabilities.canManageGroups ? (
                <select
                  value={cohort.status}
                  disabled={busy}
                  onChange={(event) => void updateCohort(cohort.id, event.target.value as InstitutionLifecycleStatus)}
                  className="mt-4 h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-xs font-bold text-white outline-none disabled:opacity-40"
                  aria-label={`Estado de ${cohort.name}`}
                >
                  <LifecycleOptions />
                </select>
              ) : null}
            </article>
          ))
        ) : (
          <div className="md:col-span-2 xl:col-span-3 rounded-[22px] border border-dashed border-white/10 p-7 text-center text-sm text-zinc-500">
            Todavia no hay cohortes creadas.
          </div>
        )}
      </div>

      {showCreate ? (
        <CreateCohortDialog
          directory={directory}
          accent={accent}
          onClose={() => setShowCreate(false)}
          onChanged={async () => {
            await onChanged();
            setShowCreate(false);
          }}
        />
      ) : null}
    </section>
  );
}

function CreateCohortDialog({ directory, accent, onClose, onChanged }: {
  directory: InstitutionDirectory;
  accent: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const defaultSport = directory.institution.enabledSports[0] ?? "football_11";
  const [name, setName] = useState("");
  const [sportType, setSportType] = useState<SportType>(defaultSport);
  const [seasonLabel, setSeasonLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: directory.institution.id,
          name,
          sportType,
          seasonLabel,
          startsOn,
          endsOn,
          status: "active",
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo crear la cohorte.");
      await onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo crear la cohorte.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 backdrop-blur-md sm:p-6">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="create-cohort-title" className="max-h-[92dvh] w-full max-w-[620px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#0a131c] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: accent }}>Ciclo institucional</p>
            <h2 id="create-cohort-title" className="mt-2 text-2xl font-black">Crear cohorte</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-400" aria-label="Cerrar"><X size={17} /></button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2"><input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Curso inicial 2026" /></Field>
          <Field label="Disciplina"><select value={sportType} onChange={(event) => setSportType(event.target.value as SportType)} className={inputClass}>{directory.institution.enabledSports.map((sport) => <option key={sport} value={sport} className="bg-[#0b131b]">{sport === "futsal" ? "Futsal" : "Futbol 11"}</option>)}</select></Field>
          <Field label="Temporada"><input value={seasonLabel} onChange={(event) => setSeasonLabel(event.target.value)} className={inputClass} placeholder="2026" /></Field>
          <Field label="Inicio"><input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={inputClass} /></Field>
          <Field label="Cierre"><input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className={inputClass} /></Field>
        </div>
        {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onClose} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black">Cancelar</button>
          <button disabled={saving} className="min-h-12 rounded-2xl text-sm font-black disabled:opacity-40" style={{ backgroundColor: accent, color: "#04100a" }}>{saving ? "Creando..." : "Crear cohorte"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={className}><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</span>{children}</label>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-lg font-black text-white">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-600">{label}</p></div>;
}

function StatusPill({ status }: { status: InstitutionLifecycleStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${status === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-zinc-400"}`}>{status}</span>;
}

function LifecycleOptions() {
  return <><option value="draft" className="bg-[#0b131b]">Borrador</option><option value="active" className="bg-[#0b131b]">Activo</option><option value="paused" className="bg-[#0b131b]">Pausado</option><option value="completed" className="bg-[#0b131b]">Completado</option><option value="archived" className="bg-[#0b131b]">Archivado</option></>;
}

function formatRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return "Fechas sin configurar";
  return `${startsOn || "Sin inicio"} · ${endsOn || "Sin cierre"}`;
}

const inputClass = "h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-white/25";
