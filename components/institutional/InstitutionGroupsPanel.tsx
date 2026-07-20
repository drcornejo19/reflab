"use client";

import {
  ChevronDown,
  ChevronUp,
  Plus,
  UserPlus,
  UserRoundMinus,
  UsersRound,
  X,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  InstitutionDirectory,
  InstitutionGroupRole,
  InstitutionGroupType,
  InstitutionLifecycleStatus,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type PanelProps = {
  directory: InstitutionDirectory;
  accent: string;
  onChanged: () => Promise<InstitutionDirectory | null>;
};

const groupTypeLabels: Record<InstitutionGroupType, string> = {
  course: "Curso",
  cohort: "Grupo de cohorte",
  commission: "Comision",
  category: "Categoria arbitral",
  role: "Funcion arbitral",
  training: "Entrenamiento",
  work_team: "Equipo de trabajo",
};

const groupRoleLabels: Record<InstitutionGroupRole, string> = {
  participant: "Participante",
  instructor: "Instructor",
  coordinator: "Coordinador",
  observer: "Observador",
};

export function InstitutionGroupsPanel({ directory, accent, onChanged }: PanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    directory.groups[0]?.id ?? null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateGroup(groupId: string, status: InstitutionLifecycleStatus) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/institution/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ institutionId: directory.institution.id, status }),
      });
      await onChanged();
    } catch (requestError) {
      setError(messageFrom(requestError, "No se pudo actualizar el grupo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a131c] p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            className="text-[10px] font-black uppercase tracking-[0.24em]"
            style={{ color: accent }}
          >
            Organizacion operativa
          </p>
          <h2 className="mt-2 text-2xl font-black">Grupos y equipos de trabajo</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Participantes, instructores y coordinadores vinculados a una disciplina.
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
            Crear grupo
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-bold text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {directory.groups.length ? (
          directory.groups.map((group) => {
            const expanded = expandedId === group.id;
            return (
              <article
                key={group.id}
                className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03]"
              >
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : group.id)}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                      style={{ backgroundColor: `${accent}18`, color: accent }}
                    >
                      <UsersRound size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-black text-white">
                          {group.name}
                        </span>
                        <StatusPill status={group.status} />
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {groupTypeLabels[group.groupType]} · {group.sportType === "futsal" ? "Futsal" : "Futbol 11"}
                        {group.category ? ` · ${group.category}` : ""}
                      </span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                        {group.participantCount} participantes · {group.instructorCount} formadores
                      </span>
                    </span>
                  </button>

                  {directory.capabilities.canManageGroups ? (
                    <select
                      value={group.status}
                      disabled={busy}
                      onChange={(event) =>
                        void updateGroup(
                          group.id,
                          event.target.value as InstitutionLifecycleStatus
                        )
                      }
                      className={smallSelectClass}
                      aria-label={`Estado de ${group.name}`}
                    >
                      <LifecycleOptions />
                    </select>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : group.id)}
                    className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-zinc-500"
                    aria-label={expanded ? "Cerrar grupo" : "Abrir grupo"}
                  >
                    {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  </button>
                </div>

                {expanded ? (
                  <GroupMemberships
                    groupId={group.id}
                    groupMembers={group.members}
                    directory={directory}
                    accent={accent}
                    onChanged={onChanged}
                  />
                ) : null}
              </article>
            );
          })
        ) : (
          <EmptyState text="Todavia no hay grupos creados para esta institucion." />
        )}
      </div>

      {showCreate ? (
        <CreateGroupDialog
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

function GroupMemberships({
  groupId,
  groupMembers,
  directory,
  accent,
  onChanged,
}: {
  groupId: string;
  groupMembers: InstitutionDirectory["groups"][number]["members"];
  directory: InstitutionDirectory;
  accent: string;
  onChanged: () => Promise<InstitutionDirectory | null>;
}) {
  const availableMembers = directory.members.filter(
    (member) =>
      (member.status === "active" || member.status === "invited") &&
      !groupMembers.some((item) => item.membershipId === member.id)
  );
  const [membershipId, setMembershipId] = useState(availableMembers[0]?.id ?? "");
  const [groupRole, setGroupRole] = useState<InstitutionGroupRole>("participant");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!membershipId) return;
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/institution/groups/${groupId}/members`, {
        method: "POST",
        body: JSON.stringify({
          institutionId: directory.institution.id,
          membershipId,
          groupRole,
        }),
      });
      await onChanged();
      setMembershipId("");
    } catch (requestError) {
      setError(messageFrom(requestError, "No se pudo asignar la persona."));
    } finally {
      setSaving(false);
    }
  }

  async function remove(assignmentId: string) {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/institution/groups/${groupId}/members`, {
        method: "PATCH",
        body: JSON.stringify({
          institutionId: directory.institution.id,
          assignmentId,
          status: "removed",
        }),
      });
      await onChanged();
    } catch (requestError) {
      setError(messageFrom(requestError, "No se pudo quitar la asignacion."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-white/10 bg-black/15 p-4">
      {directory.capabilities.canManageGroups && directory.capabilities.canReadMembers ? (
        <div className="grid gap-3 rounded-[18px] border border-white/10 bg-white/[0.025] p-3 md:grid-cols-[1fr_180px_auto]">
          <select
            value={membershipId}
            onChange={(event) => setMembershipId(event.target.value)}
            className={smallSelectClass}
            aria-label="Persona para asignar"
          >
            <option value="" className="bg-[#0b131b]">
              Seleccionar persona
            </option>
            {availableMembers.map((member) => (
              <option key={member.id} value={member.id} className="bg-[#0b131b]">
                {member.displayName}
              </option>
            ))}
          </select>
          <select
            value={groupRole}
            onChange={(event) => setGroupRole(event.target.value as InstitutionGroupRole)}
            className={smallSelectClass}
            aria-label="Funcion dentro del grupo"
          >
            {Object.entries(groupRoleLabels).map(([value, label]) => (
              <option key={value} value={value} className="bg-[#0b131b]">
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void assign()}
            disabled={saving || !membershipId}
            className="flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black disabled:opacity-40"
            style={{ backgroundColor: accent, color: "#04100a" }}
          >
            <UserPlus size={15} />
            Asignar
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs font-bold text-red-300">{error}</p> : null}

      <div className="mt-3 grid gap-2">
        {groupMembers.length ? (
          groupMembers.map((member) => (
            <div
              key={member.id}
              className="flex flex-col gap-3 rounded-[16px] border border-white/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-white">{member.displayName}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  {groupRoleLabels[member.groupRole]}
                </p>
              </div>
              {directory.capabilities.canManageGroups ? (
                <button
                  type="button"
                  onClick={() => void remove(member.id)}
                  disabled={saving}
                  className="flex min-h-9 items-center justify-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-400"
                >
                  <UserRoundMinus size={14} />
                  Quitar
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <p className="py-4 text-center text-xs text-zinc-600">Sin integrantes asignados.</p>
        )}
      </div>
    </div>
  );
}

function CreateGroupDialog({
  directory,
  accent,
  onClose,
  onChanged,
}: {
  directory: InstitutionDirectory;
  accent: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const defaultSport = directory.institution.enabledSports[0] ?? "football_11";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupType, setGroupType] = useState<InstitutionGroupType>("training");
  const [sportType, setSportType] = useState<SportType>(defaultSport);
  const [cohortId, setCohortId] = useState("");
  const [category, setCategory] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await requestJson("/api/institution/groups", {
        method: "POST",
        body: JSON.stringify({
          institutionId: directory.institution.id,
          name,
          description,
          groupType,
          sportType,
          cohortId,
          category,
          startsOn,
          endsOn,
          status: "active",
        }),
      });
      await onChanged();
    } catch (requestError) {
      setError(messageFrom(requestError, "No se pudo crear el grupo."));
    } finally {
      setSaving(false);
    }
  }

  const compatibleCohorts = directory.cohorts.filter(
    (cohort) => cohort.sportType === sportType
  );

  return (
    <Dialog title="Crear grupo" kicker="Organizacion" accent={accent} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <input required minLength={3} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Tipo">
            <select value={groupType} onChange={(event) => setGroupType(event.target.value as InstitutionGroupType)} className={inputClass}>
              {Object.entries(groupTypeLabels).map(([value, label]) => <option key={value} value={value} className="bg-[#0b131b]">{label}</option>)}
            </select>
          </Field>
          <Field label="Disciplina">
            <select value={sportType} onChange={(event) => { setSportType(event.target.value as SportType); setCohortId(""); }} className={inputClass}>
              {directory.institution.enabledSports.map((sport) => <option key={sport} value={sport} className="bg-[#0b131b]">{sport === "futsal" ? "Futsal" : "Futbol 11"}</option>)}
            </select>
          </Field>
          <Field label="Cohorte">
            <select value={cohortId} onChange={(event) => setCohortId(event.target.value)} className={inputClass}>
              <option value="" className="bg-[#0b131b]">Sin cohorte</option>
              {compatibleCohorts.map((cohort) => <option key={cohort.id} value={cohort.id} className="bg-[#0b131b]">{cohort.name}</option>)}
            </select>
          </Field>
          <Field label="Categoria">
            <input value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass} placeholder="Primera C" />
          </Field>
          <Field label="Inicio">
            <input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Cierre">
            <input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Descripcion" className="sm:col-span-2">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClass} min-h-24 py-3`} />
          </Field>
        </div>
        {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
        <DialogActions accent={accent} saving={saving} onClose={onClose} label="Crear grupo" />
      </form>
    </Dialog>
  );
}

function Dialog({ title, kicker, accent, onClose, children }: { title: string; kicker: string; accent: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 backdrop-blur-md sm:p-6">
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-[720px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#0a131c] p-5 shadow-2xl sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: accent }}>{kicker}</p><h2 className="mt-2 text-2xl font-black">{title}</h2></div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-400" aria-label="Cerrar"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={className}><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">{label}</span>{children}</label>;
}

function DialogActions({ accent, saving, onClose, label }: { accent: string; saving: boolean; onClose: () => void; label: string }) {
  return <div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onClose} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black">Cancelar</button><button disabled={saving} className="min-h-12 rounded-2xl text-sm font-black disabled:opacity-40" style={{ backgroundColor: accent, color: "#04100a" }}>{saving ? "Guardando..." : label}</button></div>;
}

function LifecycleOptions() {
  return <><option value="draft" className="bg-[#0b131b]">Borrador</option><option value="active" className="bg-[#0b131b]">Activo</option><option value="paused" className="bg-[#0b131b]">Pausado</option><option value="completed" className="bg-[#0b131b]">Completado</option><option value="archived" className="bg-[#0b131b]">Archivado</option></>;
}

function StatusPill({ status }: { status: InstitutionLifecycleStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] ${status === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-zinc-400"}`}>{status}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[22px] border border-dashed border-white/10 p-7 text-center text-sm text-zinc-500">{text}</div>;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(data.error || "La operacion no pudo completarse.");
  return data;
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const inputClass = "h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-white/25";
const smallSelectClass = "h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-xs font-bold text-white outline-none disabled:opacity-40";
