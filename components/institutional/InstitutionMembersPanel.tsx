"use client";

import {
  FileUp,
  MailPlus,
  RefreshCw,
  Search,
  UserRoundCog,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  InstitutionDirectory,
  InstitutionDirectoryMember,
  InstitutionMembershipStatus,
  InstitutionRoleKey,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type PanelProps = {
  directory: InstitutionDirectory;
  accent: string;
  onChanged: () => Promise<InstitutionDirectory | null>;
};

export function InstitutionMembersPanel({
  directory,
  accent,
  onChanged,
}: PanelProps) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [showInvite, setShowInvite] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const members = directory.members.filter((member) => {
    if (!deferredSearch) return true;
    return [
      member.displayName,
      member.email,
      member.category,
      ...member.roleLabels,
    ].some((value) => value?.toLowerCase().includes(deferredSearch));
  });

  async function updateMember(
    member: InstitutionDirectoryMember,
    update: Record<string, unknown>
  ) {
    setActionId(member.id);
    setError(null);
    try {
      const response = await fetch(`/api/institution/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: directory.institution.id,
          ...update,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar la membresia.");
      }
      await onChanged();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No se pudo actualizar la membresia."
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a131c] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p
            className="text-[10px] font-black uppercase tracking-[0.24em]"
            style={{ color: accent }}
          >
            Directorio institucional
          </p>
          <h2 className="mt-2 text-2xl font-black">Miembros y accesos</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Las bajas son logicas y conservan el historial de cada persona.
          </p>
        </div>
        {directory.capabilities.canInviteMembers ? (
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black"
            style={{ backgroundColor: accent, color: "#04100a" }}
          >
            <MailPlus size={17} />
            Invitar personas
          </button>
        ) : null}
      </div>

      <label className="relative mt-5 block">
        <Search
          size={17}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, correo, rol o categoria"
          className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm font-bold text-white outline-none transition focus:border-white/25"
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-bold text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {members.length ? (
          members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              directory={directory}
              accent={accent}
              busy={actionId === member.id}
              onUpdate={(update) => updateMember(member, update)}
            />
          ))
        ) : (
          <EmptyState
            text={
              deferredSearch
                ? "No encontramos miembros con ese criterio."
                : "Todavia no hay personas visibles en esta institucion."
            }
          />
        )}
      </div>

      {showInvite ? (
        <InviteMembersDialog
          directory={directory}
          accent={accent}
          onClose={() => setShowInvite(false)}
          onChanged={onChanged}
        />
      ) : null}
    </section>
  );
}

function MemberRow({
  member,
  directory,
  accent,
  busy,
  onUpdate,
}: {
  member: InstitutionDirectoryMember;
  directory: InstitutionDirectory;
  accent: string;
  busy: boolean;
  onUpdate: (update: Record<string, unknown>) => Promise<void>;
}) {
  const currentRole = member.roleKeys[0] ?? "read_only";
  const canManage = directory.capabilities.canManageMembers;

  return (
    <article className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_160px_auto] xl:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {member.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-black text-white">
                {member.displayName}
              </p>
              <MembershipBadge status={member.status} />
            </div>
            <p className="mt-1 truncate text-xs text-zinc-500">
              {member.email || member.userId}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
              {member.primarySport === "futsal" ? "Futsal" : "Futbol 11"}
              {member.category ? ` · ${member.category}` : ""}
              {` · ${member.groupIds.length} grupos`}
            </p>
          </div>
        </div>

        {canManage ? (
          <select
            value={currentRole}
            disabled={busy}
            onChange={(event) =>
              void onUpdate({ roleKey: event.target.value as InstitutionRoleKey })
            }
            className={selectClass}
            aria-label={`Rol de ${member.displayName}`}
          >
            {directory.roles
              .filter((role) => role.isAssignable)
              .map((role) => (
                <option key={role.id} value={role.roleKey} className="bg-[#0b131b]">
                  {role.name}
                </option>
              ))}
          </select>
        ) : (
          <p className="text-xs font-bold text-zinc-400">
            {member.roleLabels.join(", ") || "Sin rol"}
          </p>
        )}

        {canManage ? (
          <select
            value={member.status}
            disabled={busy || member.status === "invited"}
            onChange={(event) =>
              void onUpdate({
                status: event.target.value as InstitutionMembershipStatus,
              })
            }
            className={selectClass}
            aria-label={`Estado de ${member.displayName}`}
          >
            {member.status === "invited" ? (
              <option value="invited" className="bg-[#0b131b]">
                Invitado
              </option>
            ) : null}
            <option value="active" className="bg-[#0b131b]">
              Activo
            </option>
            <option value="suspended" className="bg-[#0b131b]">
              Suspendido
            </option>
            <option value="revoked" className="bg-[#0b131b]">
              Baja
            </option>
          </select>
        ) : null}

        <div className="flex justify-end">
          {member.status === "invited" && directory.capabilities.canInviteMembers ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdate({ action: "resend" })}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-black text-white disabled:opacity-40"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
              Reenviar
            </button>
          ) : busy ? (
            <RefreshCw size={17} className="animate-spin text-zinc-500" />
          ) : (
            <UserRoundCog size={17} className="text-zinc-700" />
          )}
        </div>
      </div>
    </article>
  );
}

function InviteMembersDialog({
  directory,
  accent,
  onClose,
  onChanged,
}: PanelProps & { onClose: () => void }) {
  const defaultSport = directory.institution.enabledSports[0] ?? "football_11";
  const [mode, setMode] = useState<"single" | "csv">("single");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleKey, setRoleKey] = useState<InstitutionRoleKey>("referee");
  const [primarySport, setPrimarySport] = useState<SportType>(defaultSport);
  const [category, setCategory] = useState("");
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const members =
      mode === "single"
        ? [{ email, displayName, roleKey, primarySport, category }]
        : csvRows;
    if (!members.length) {
      setError("Selecciona un archivo CSV con al menos una persona.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/institution/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: directory.institution.id,
          members,
        }),
      });
      const data = (await response.json()) as {
        imported?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "No se pudieron enviar las invitaciones.");
      }
      await onChanged();
      if (data.failed) {
        setMessage(`${data.imported ?? 0} procesadas y ${data.failed} con error.`);
      } else {
        onClose();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudieron enviar las invitaciones."
      );
    } finally {
      setSaving(false);
    }
  }

  async function readCsv(file: File | null) {
    setCsvRows([]);
    setError(null);
    if (!file) return;
    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const hasHeader = lines[0]?.toLowerCase().includes("email");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = dataLines.slice(0, 25).map((line) => {
      const [rowEmail, rowName, rowRole, rowSport, rowCategory] = line
        .split(/[;,]/)
        .map((value) => value.trim());
      return {
        email: rowEmail || "",
        displayName: rowName || "",
        roleKey: rowRole || "referee",
        primarySport: rowSport || defaultSport,
        category: rowCategory || "",
      };
    });
    setCsvRows(rows);
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 p-3 backdrop-blur-md sm:p-6">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-members-title"
        className="max-h-[92dvh] w-full max-w-[680px] overflow-y-auto rounded-[30px] border border-white/10 bg-[#0a131c] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.24em]"
              style={{ color: accent }}
            >
              Acceso institucional
            </p>
            <h2 id="invite-members-title" className="mt-2 text-2xl font-black">Invitar personas</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-400"
            aria-label="Cerrar"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/20 p-1">
          <ModeButton
            active={mode === "single"}
            label="Una persona"
            onClick={() => setMode("single")}
            accent={accent}
          />
          <ModeButton
            active={mode === "csv"}
            label="Importar CSV"
            onClick={() => setMode("csv")}
            accent={accent}
          />
        </div>

        {mode === "single" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Correo" className="sm:col-span-2">
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                placeholder="arbitro@institucion.org"
              />
            </Field>
            <Field label="Nombre">
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={inputClass}
                placeholder="Nombre visible"
              />
            </Field>
            <Field label="Categoria">
              <input
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={inputClass}
                placeholder="Primera C"
              />
            </Field>
            <Field label="Rol">
              <select
                value={roleKey}
                onChange={(event) =>
                  setRoleKey(event.target.value as InstitutionRoleKey)
                }
                className={inputClass}
              >
                {directory.roles
                  .filter((role) => role.isAssignable)
                  .map((role) => (
                    <option key={role.id} value={role.roleKey} className="bg-[#0b131b]">
                      {role.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Disciplina">
              <select
                value={primarySport}
                onChange={(event) =>
                  setPrimarySport(event.target.value as SportType)
                }
                className={inputClass}
              >
                {directory.institution.enabledSports.map((sport) => (
                  <option key={sport} value={sport} className="bg-[#0b131b]">
                    {sport === "futsal" ? "Futsal" : "Futbol 11"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="mt-5 rounded-[22px] border border-dashed border-white/15 bg-black/20 p-5">
            <FileUp size={24} style={{ color: accent }} />
            <p className="mt-3 text-sm font-black text-white">Archivo CSV</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Columnas: email, nombre, rol, disciplina y categoria. Los valores de
              rol usan claves como `referee`, `student` o `instructor`.
            </p>
            <input
              type="file"
              aria-label="Seleccionar archivo CSV de miembros"
              accept=".csv,text/csv"
              onChange={(event) => void readCsv(event.target.files?.[0] ?? null)}
              className="mt-4 block w-full text-xs text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:px-3 file:py-2 file:text-xs file:font-black"
            />
            {csvRows.length ? (
              <p className="mt-3 text-xs font-black" style={{ color: accent }}>
                {csvRows.length} filas preparadas
              </p>
            ) : null}
          </div>
        )}

        {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
        {message ? <p className="mt-4 text-sm font-bold text-amber-300">{message}</p> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black"
          >
            Cancelar
          </button>
          <button
            disabled={saving}
            className="min-h-12 rounded-2xl text-sm font-black disabled:opacity-40"
            style={{ backgroundColor: accent, color: "#04100a" }}
          >
            {saving ? "Procesando..." : mode === "csv" ? "Importar e invitar" : "Enviar invitacion"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
  accent,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 rounded-xl text-xs font-black"
      style={active ? { backgroundColor: `${accent}18`, color: accent } : { color: "#71717a" }}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function MembershipBadge({ status }: { status: InstitutionMembershipStatus }) {
  const label: Record<InstitutionMembershipStatus, string> = {
    invited: "Invitado",
    active: "Activo",
    suspended: "Suspendido",
    revoked: "Baja",
  };
  const style =
    status === "active"
      ? "bg-emerald-400/10 text-emerald-300"
      : status === "invited"
        ? "bg-sky-400/10 text-sky-300"
        : "bg-amber-400/10 text-amber-300";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${style}`}>
      {label[status]}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 p-7 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-white/25";
const selectClass =
  "h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-xs font-bold text-white outline-none disabled:opacity-40";
