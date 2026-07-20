"use client";

import {
  BellRing,
  Check,
  CircleAlert,
  Loader2,
  Megaphone,
  RefreshCw,
  Send,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import type {
  InstitutionNotificationPriority,
  InstitutionNotificationWorkspace,
} from "@/lib/institutional/types";

type TargetType = "institution" | "group" | "user";

const initialForm = {
  title: "",
  message: "",
  notificationType: "institutional_notice",
  priority: "normal" as InstitutionNotificationPriority,
  targetType: "institution" as TargetType,
  targetId: "",
  scheduledFor: "",
  expiresAt: "",
  web: true,
  pwa: true,
};

export function InstitutionNotificationCenter() {
  const { currentDiscipline } = useDiscipline();
  const { activeContext, loading: institutionLoading } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] =
    useState<InstitutionNotificationWorkspace | null>(null);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContext) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    void loadWorkspace();
    // Active tenant is the complete data boundary for this inbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/notifications", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        workspace?: InstitutionNotificationWorkspace;
        error?: string;
      };
      if (!response.ok || !data.workspace) {
        throw new Error(
          data.error || "No se pudieron cargar las notificaciones."
        );
      }
      setWorkspace(data.workspace);
    } catch (loadError) {
      setWorkspace(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las notificaciones."
      );
    } finally {
      setLoading(false);
    }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const channels = [
        form.web ? "web" : null,
        form.pwa ? "pwa" : null,
      ].filter(Boolean);
      const response = await fetch("/api/institution/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          notificationType: form.notificationType,
          priority: form.priority,
          channels,
          scheduledFor: toIsoOrNull(form.scheduledFor),
          expiresAt: toIsoOrNull(form.expiresAt),
          target: {
            type: form.targetType,
            id: form.targetType === "institution" ? null : form.targetId,
          },
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear el aviso.");
      }
      setForm(initialForm);
      setSuccess("Aviso institucional creado sin destinatarios duplicados.");
      await loadWorkspace();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo crear el aviso."
      );
    } finally {
      setSaving(false);
    }
  }

  async function markRead(recipientId: string) {
    try {
      const response = await fetch(
        `/api/institution/notifications/${recipientId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo marcar como leida.");
      }
      setWorkspace((current) =>
        current
          ? {
              ...current,
              inbox: current.inbox.map((item) =>
                item.id === recipientId
                  ? {
                      ...item,
                      deliveryStatus: "read",
                      readAt: new Date().toISOString(),
                    }
                  : item
              ),
            }
          : current
      );
    } catch (readError) {
      setError(
        readError instanceof Error
          ? readError.message
          : "No se pudo actualizar el aviso."
      );
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-8">
        <header
          className="rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 44%), #08131c`,
          }}
        >
          <p
            className="text-[10px] font-black uppercase tracking-[0.3em]"
            style={{ color: theme.accent }}
          >
            Fase 9 · Comunicacion institucional
          </p>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Notificaciones
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Avisos web y PWA segmentados por institucion, grupo o persona,
                con prioridad, agenda, expiracion y lectura trazable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black"
            >
              <RefreshCw size={17} />
              Actualizar
            </button>
          </div>
        </header>

        {error ? <Message tone="error">{error}</Message> : null}
        {success ? <Message tone="success">{success}</Message> : null}

        {institutionLoading || loading ? (
          <LoadingState />
        ) : !workspace ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Bandeja institucional" accent={theme.accent}>
                {workspace.inbox.length ? (
                  <div className="space-y-3">
                    {workspace.inbox.map((notification) => (
                      <article
                        key={notification.id}
                        className={`rounded-[22px] border p-4 ${
                          notification.deliveryStatus === "read"
                            ? "border-white/10 bg-white/[0.025]"
                            : "border-white/15 bg-white/[0.055]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-black text-white">
                                {notification.title}
                              </p>
                              <PriorityBadge
                                priority={notification.priority}
                              />
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-400">
                              {notification.message}
                            </p>
                            <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                              {formatDate(notification.createdAt)} ·{" "}
                              {notification.channels.join(" + ")}
                            </p>
                          </div>
                          {notification.deliveryStatus !== "read" ? (
                            <button
                              type="button"
                              onClick={() => void markRead(notification.id)}
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                              style={{
                                backgroundColor: theme.accentSoft,
                                color: theme.accent,
                              }}
                              title="Marcar como leida"
                              aria-label="Marcar como leida"
                            >
                              <Check size={18} />
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyRow text="No tenes avisos institucionales disponibles." />
                )}
              </Panel>

              {workspace.capabilities.canSend ? (
                <Panel title="Crear aviso" accent={theme.accent}>
                  <form onSubmit={createCampaign} className="grid gap-4">
                    <Field label="Titulo">
                      <input
                        required
                        minLength={3}
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className="control-input"
                        placeholder="Evaluacion disponible"
                      />
                    </Field>
                    <Field label="Mensaje">
                      <textarea
                        required
                        minLength={3}
                        maxLength={2000}
                        rows={4}
                        value={form.message}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            message: event.target.value,
                          }))
                        }
                        className="control-input resize-y"
                        placeholder="Escribi una indicacion clara y accionable."
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Destinatarios">
                        <select
                          value={form.targetType}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              targetType: event.target.value as TargetType,
                              targetId: "",
                            }))
                          }
                          className="control-input"
                        >
                          <option value="institution">
                            Toda la institucion
                          </option>
                          <option value="group">Un grupo</option>
                          <option value="user">Una persona</option>
                        </select>
                      </Field>
                      {form.targetType !== "institution" ? (
                        <Field
                          label={
                            form.targetType === "group" ? "Grupo" : "Persona"
                          }
                        >
                          <select
                            required
                            value={form.targetId}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                targetId: event.target.value,
                              }))
                            }
                            className="control-input"
                          >
                            <option value="">Seleccionar</option>
                            {(form.targetType === "group"
                              ? workspace.audiences.groups
                              : workspace.audiences.members
                            ).map((item) => (
                              <option
                                key={
                                  "id" in item ? item.id : item.userId
                                }
                                value={"id" in item ? item.id : item.userId}
                              >
                                {"name" in item
                                  ? item.name
                                  : item.displayName}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ) : (
                        <Field label="Alcance">
                          <div className="flex min-h-[54px] items-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm text-zinc-400">
                            {workspace.audiences.members.length} membresias
                            activas
                          </div>
                        </Field>
                      )}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Prioridad">
                        <select
                          value={form.priority}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              priority: event.target
                                .value as InstitutionNotificationPriority,
                            }))
                          }
                          className="control-input"
                        >
                          <option value="low">Baja</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </Field>
                      <Field label="Programar">
                        <input
                          type="datetime-local"
                          value={form.scheduledFor}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              scheduledFor: event.target.value,
                            }))
                          }
                          className="control-input"
                        />
                      </Field>
                      <Field label="Expira">
                        <input
                          type="datetime-local"
                          value={form.expiresAt}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              expiresAt: event.target.value,
                            }))
                          }
                          className="control-input"
                        />
                      </Field>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <ChannelToggle
                        label="Web"
                        checked={form.web}
                        onChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            web: checked,
                          }))
                        }
                      />
                      <ChannelToggle
                        label="PWA"
                        checked={form.pwa}
                        onChange={(checked) =>
                          setForm((current) => ({
                            ...current,
                            pwa: checked,
                          }))
                        }
                      />
                      <span className="self-center text-xs text-zinc-600">
                        Correo y push quedan preparados para un despachador
                        aprobado.
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={saving || (!form.web && !form.pwa)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor: theme.button,
                        color: theme.onAccent,
                      }}
                    >
                      {saving ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <Send size={18} />
                      )}
                      {saving ? "Guardando..." : "Crear notificacion"}
                    </button>
                  </form>
                </Panel>
              ) : (
                <Panel title="Permisos" accent={theme.accent}>
                  <EmptyRow text="Tu rol puede leer avisos, pero no crear campañas institucionales." />
                </Panel>
              )}
            </section>

            {workspace.capabilities.canSend ? (
              <Panel title="Historial de campañas" accent={theme.accent}>
                {workspace.campaigns.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {workspace.campaigns.map((campaign) => (
                      <article
                        key={campaign.id}
                        className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{campaign.title}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {campaign.recipientCount} destinatarios ·{" "}
                              {campaign.readCount} lecturas
                            </p>
                          </div>
                          <StatusBadge status={campaign.status} />
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-400">
                          {campaign.message}
                        </p>
                        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
                          {campaign.scheduledFor
                            ? `Programada ${formatDate(campaign.scheduledFor)}`
                            : formatDate(campaign.createdAt)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyRow text="Todavia no hay campañas creadas." />
                )}
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#09131c] p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-2xl"
          style={{ color: accent, backgroundColor: `${accent}18` }}
        >
          <BellRing size={19} />
        </span>
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function ChannelToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-black">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-[var(--reflab-accent)]"
      />
      {label}
    </label>
  );
}

function Message({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  const error = tone === "error";
  return (
    <div
      className={`flex gap-3 rounded-[22px] border p-4 text-sm ${
        error
          ? "border-red-500/25 bg-red-500/10 text-red-100"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
      }`}
    >
      {error ? <CircleAlert size={19} /> : <Check size={19} />}
      {children}
    </div>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: InstitutionNotificationPriority;
}) {
  const labels = {
    low: "Baja",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  };
  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">
      {labels[priority]}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    scheduled: "Programada",
    sending: "En envio",
    sent: "Publicada",
    cancelled: "Cancelada",
  };
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">
      {labels[status] ?? status}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-7 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[28px] border border-white/10 bg-[#09131c] text-zinc-400">
      <Loader2 className="mr-3 animate-spin" size={20} />
      Cargando comunicaciones...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 p-10 text-center">
      <Megaphone className="mx-auto text-zinc-600" size={38} />
      <p className="mt-4 font-black">Sin institucion activa</p>
      <p className="mt-2 text-sm text-zinc-500">
        Selecciona una institucion vinculada para abrir sus avisos.
      </p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
