"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Plus,
  ShieldCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { InstitutionInvitationsPanel } from "@/components/institutional/InstitutionInvitationsPanel";
import { getDisciplineDefinition } from "@/lib/discipline";
import {
  hasEffectiveInstitutionPermission,
  institutionTypeLabels,
  institutionRoleLabels,
} from "@/lib/institutional/permissions";
import type {
  InstitutionOverview,
  InstitutionType,
} from "@/lib/institutional/types";

type CreateFormState = {
  name: string;
  institutionType: InstitutionType;
  country: string;
  provinceState: string;
  city: string;
  football11: boolean;
  futsal: boolean;
};

const initialCreateForm: CreateFormState = {
  name: "",
  institutionType: "school",
  country: "Argentina",
  provinceState: "",
  city: "",
  football11: true,
  futsal: false,
};

export function InstitutionDashboard() {
  const { currentDiscipline } = useDiscipline();
  const discipline = getDisciplineDefinition(currentDiscipline);
  const {
    snapshot,
    activeContext,
    loading: loadingContext,
    error: contextError,
    refreshInstitutions,
    selectInstitution,
  } = useInstitution();
  const [overview, setOverview] = useState<InstitutionOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const canManagePeople =
    hasEffectiveInstitutionPermission(activeContext, "members.read") ||
    hasEffectiveInstitutionPermission(activeContext, "groups.read");
  const canManageContent = hasEffectiveInstitutionPermission(
    activeContext,
    "content.manage"
  );
  const canManageAssessments = hasEffectiveInstitutionPermission(
    activeContext,
    "assessments.manage"
  );
  const canUseLearning = hasEffectiveInstitutionPermission(
    activeContext,
    "assessments.read"
  );
  const canReadMetrics =
    hasEffectiveInstitutionPermission(activeContext, "metrics.read_own") ||
    hasEffectiveInstitutionPermission(activeContext, "metrics.read_individual") ||
    hasEffectiveInstitutionPermission(activeContext, "metrics.read_aggregate");
  const canReadNotifications =
    hasEffectiveInstitutionPermission(activeContext, "notifications.read") ||
    hasEffectiveInstitutionPermission(activeContext, "notifications.send");
  const canReadReports = hasEffectiveInstitutionPermission(
    activeContext,
    "reports.read"
  );
  const canUseDemo =
    Boolean(activeContext?.demoMode) ||
    Boolean(activeContext?.isSuperAdmin) ||
    Boolean(
      activeContext?.membership?.permissionKeys.includes("demo.switch")
    );

  useEffect(() => {
    if (!activeContext) {
      setOverview(null);
      return;
    }

    const institutionId = activeContext.institution.id;
    const controller = new AbortController();
    async function loadOverview() {
      setLoadingOverview(true);
      setOverviewError(null);
      try {
        const response = await fetch(
          `/api/institution/overview?institutionId=${encodeURIComponent(institutionId)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = (await response.json()) as {
          overview?: InstitutionOverview;
          error?: string;
        };
        if (!response.ok || !data.overview) {
          throw new Error(data.error || "No se pudo cargar el panel institucional.");
        }
        setOverview(data.overview);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOverview(null);
        setOverviewError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el panel institucional."
        );
      } finally {
        if (!controller.signal.aborted) setLoadingOverview(false);
      }
    }

    void loadOverview();
    return () => controller.abort();
  }, [activeContext]);

  return (
    <AppShell>
      <div className="space-y-6 pb-8">
        <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#08121b] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:p-7">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-[90px]"
            style={{ backgroundColor: `${discipline.theme.accent}20` }}
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span
                  className="grid h-11 w-11 place-items-center rounded-2xl border"
                  style={{
                    borderColor: discipline.theme.border,
                    backgroundColor: discipline.theme.accentSoft,
                    color: discipline.theme.accent,
                  }}
                >
                  <Building2 size={21} />
                </span>
                <p
                  className="text-[10px] font-black uppercase tracking-[0.28em]"
                  style={{ color: discipline.theme.accent }}
                >
                  Panel institucional
                </p>
              </div>
              <h1 className="mt-5 break-words text-3xl font-black tracking-tight sm:text-4xl">
                {activeContext?.institution.name ?? "Tu espacio institucional"}
              </h1>
              <p className="mt-3 max-w-[760px] text-sm leading-6 text-zinc-400">
                Instituciones, membresias y roles conectados a la misma capa de permisos de RefLab.
              </p>
              {activeContext ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <InfoBadge
                    label={institutionTypeLabels[activeContext.institution.institutionType]}
                  />
                  <InfoBadge label={activeContext.institution.status} />
                  <InfoBadge label={formatLocation(activeContext.institution)} />
                  {activeContext.isSuperAdmin ? (
                    <InfoBadge label="Superadmin RefLab" highlighted />
                  ) : null}
                </div>
              ) : null}
            </div>

            {snapshot?.isSuperAdmin && !activeContext?.demoMode ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black transition active:scale-[0.98]"
                style={{
                  backgroundColor: discipline.theme.button,
                  color: discipline.theme.onAccent,
                  boxShadow: `0 0 28px ${discipline.theme.glow}`,
                }}
              >
                <Plus size={18} />
                Nueva institucion
              </button>
            ) : null}
          </div>
        </section>

        <InstitutionInvitationsPanel
          accent={discipline.theme.accent}
          onAccepted={async () => {
            await refreshInstitutions();
          }}
        />

        {contextError || overviewError ? (
          <ErrorPanel message={contextError || overviewError || "Error institucional"} />
        ) : null}

        {loadingContext || loadingOverview ? <LoadingPanel /> : null}

        {!loadingContext && !activeContext ? (
          <EmptyInstitutionState isSuperAdmin={Boolean(snapshot?.isSuperAdmin)} />
        ) : null}

        {!loadingOverview && overview ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={UsersRound}
                label="Membresias"
                value={String(overview.summary.totalMemberships)}
                detail={`${overview.summary.activeMemberships} activas`}
                accent={discipline.theme.accent}
              />
              <MetricCard
                icon={ShieldCheck}
                label="Roles disponibles"
                value={String(overview.summary.roleCount)}
                detail="sistema e institucionales"
                accent={discipline.theme.accent}
              />
              <MetricCard
                icon={BadgeCheck}
                label="Licencias usadas"
                value={String(overview.summary.licensesUsed)}
                detail={
                  overview.institution.licenseLimit > 0
                    ? `de ${overview.institution.licenseLimit}`
                    : "sin limite configurado"
                }
                accent={discipline.theme.accent}
              />
              <MetricCard
                icon={CheckCircle2}
                label="Licencias libres"
                value={
                  overview.summary.licensesAvailable == null
                    ? "Sin datos"
                    : String(overview.summary.licensesAvailable)
                }
                detail={overview.institution.planKey}
                accent={discipline.theme.accent}
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <Panel
                kicker="Membresias"
                title={overview.capabilities.canReadMembers ? "Personas vinculadas" : "Tu membresia"}
                accent={discipline.theme.accent}
              >
                {overview.members.length ? (
                  <div className="grid gap-3">
                    {overview.members.map((member) => (
                      <article
                        key={member.id}
                        className="grid gap-4 rounded-[22px] border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">
                            {member.displayName}
                          </p>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {member.email || member.userId}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(member.roleLabels.length
                              ? member.roleLabels
                              : ["Sin rol asignado"]
                            ).map((role) => (
                              <InfoBadge key={role} label={role} />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                          <StatusBadge status={member.status} />
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">
                            {member.primarySport === "futsal" ? "Futsal" : "Futbol 11"}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyRow text="Todavia no hay membresias visibles para este rol." />
                )}
              </Panel>

              <Panel
                kicker="Acceso"
                title="Roles y permisos"
                accent={discipline.theme.accent}
              >
                {overview.roles.length ? (
                  <div className="grid gap-3">
                    {overview.roles.map((role) => (
                      <div
                        key={role.id}
                        className="rounded-[22px] border border-white/10 bg-white/[0.035] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">{role.name}</p>
                            <p className="mt-1 text-xs leading-5 text-zinc-500">
                              {role.description || institutionRoleLabels[role.roleKey]}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em]"
                            style={{
                              color: discipline.theme.accent,
                              backgroundColor: discipline.theme.accentSoft,
                            }}
                          >
                            {role.permissionCount} permisos
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyRow text="No hay roles visibles para tu membresia." />
                )}
              </Panel>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {canManagePeople ? (
                <RoadmapCard
                  title="Usuarios y grupos"
                  description="Invita personas, asigna roles y organiza cohortes, comisiones y equipos de trabajo."
                  accent={discipline.theme.accent}
                  href="/institution/people"
                />
              ) : null}
              {canManageContent ? (
                <RoadmapCard
                  title="Contenidos"
                  description="Carga material privado, controla su vigencia y asignalo por grupo o persona."
                  accent={discipline.theme.accent}
                  href="/institution/contents"
                />
              ) : null}
              {canManageAssessments ? (
                <RoadmapCard
                  title="Evaluaciones"
                  description="Programa instancias, horarios, contenidos, intentos y destinatarios."
                  accent={discipline.theme.accent}
                  href="/institution/assessments"
                />
              ) : null}
              {canUseLearning ? (
                <RoadmapCard
                  title="Mi Programa"
                  description="Consulta la experiencia real del arbitro con sus contenidos y evaluaciones asignadas."
                  accent={discipline.theme.accent}
                  href="/institution/learning"
                />
              ) : null}
              {canReadMetrics ? (
                <RoadmapCard
                  title="Metricas"
                  description="Analiza intentos reales, cumplimiento, topicos, evolucion y grupos sin mezclar disciplinas."
                  accent={discipline.theme.accent}
                  href="/institution/metrics"
                />
              ) : null}
              {canReadNotifications ? (
                <RoadmapCard
                  title="Notificaciones"
                  description="Publica avisos segmentados y consulta confirmaciones de lectura sin duplicados."
                  accent={discipline.theme.accent}
                  href="/institution/notifications"
                />
              ) : null}
              {canReadReports ? (
                <RoadmapCard
                  title="Reportes"
                  description="Genera una vista trazable, exporta CSV o guarda un PDF desde la impresion segura."
                  accent={discipline.theme.accent}
                  href="/institution/reports"
                />
              ) : null}
              {canUseDemo ? (
                <RoadmapCard
                  title="Modo demo"
                  description="Simula roles institucionales en solo lectura y protege los datos reales."
                  accent={discipline.theme.accent}
                  href="/institution/demo"
                />
              ) : null}
            </section>
          </>
        ) : null}

        {showCreate ? (
          <CreateInstitutionDialog
            accent={discipline.theme.accent}
            onClose={() => setShowCreate(false)}
            onCreated={async (institutionId) => {
              const refreshed = await refreshInstitutions();
              if (
                refreshed?.contexts.some(
                  (context) => context.institution.id === institutionId
                )
              ) {
                await selectInstitution(institutionId);
              }
              setShowCreate(false);
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

function CreateInstitutionDialog({
  accent,
  onClose,
  onCreated,
}: {
  accent: string;
  onClose: () => void;
  onCreated: (institutionId: string) => Promise<void>;
}) {
  const [form, setForm] = useState(initialCreateForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const enabledSports = [
        form.football11 ? "football_11" : null,
        form.futsal ? "futsal" : null,
      ].filter(Boolean);
      const response = await fetch("/api/institution/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, enabledSports }),
      });
      const data = (await response.json()) as {
        institution?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.institution) {
        throw new Error(data.error || "No se pudo crear la institucion.");
      }
      await onCreated(data.institution.id);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo crear la institucion."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-3 backdrop-blur-md sm:p-6">
      <form
        onSubmit={submit}
        className="max-h-[92dvh] w-full max-w-[620px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#0a131c] p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.28em]"
              style={{ color: accent }}
            >
              Alta institucional
            </p>
            <h2 className="mt-3 text-2xl font-black">Nueva institucion</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <input
              required
              minLength={3}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className={inputClass}
              placeholder="Escuela arbitral regional"
            />
          </Field>
          <Field label="Tipo">
            <select
              value={form.institutionType}
              onChange={(event) =>
                setForm({
                  ...form,
                  institutionType: event.target.value as InstitutionType,
                })
              }
              className={inputClass}
            >
              {Object.entries(institutionTypeLabels).map(([value, label]) => (
                <option key={value} value={value} className="bg-[#0b131b]">
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pais">
            <input
              value={form.country}
              onChange={(event) => setForm({ ...form, country: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Provincia / estado">
            <input
              value={form.provinceState}
              onChange={(event) =>
                setForm({ ...form, provinceState: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <Field label="Ciudad">
            <input
              value={form.city}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <fieldset className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
          <legend className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            Disciplinas habilitadas
          </legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <CheckOption
              label="Futbol 11"
              checked={form.football11}
              onChange={(checked) => setForm({ ...form, football11: checked })}
            />
            <CheckOption
              label="Futsal"
              checked={form.futsal}
              onChange={(checked) => setForm({ ...form, futsal: checked })}
            />
          </div>
        </fieldset>

        {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white"
          >
            Cancelar
          </button>
          <button
            disabled={saving || (!form.football11 && !form.futsal)}
            className="min-h-12 rounded-2xl text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: accent, color: "#04100a" }}
          >
            {saving ? "Creando..." : "Crear institucion"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function CheckOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-black">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#6fc11f]"
      />
      {label}
    </label>
  );
}

function Panel({
  kicker,
  title,
  accent,
  children,
}: {
  kicker: string;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a131c] p-5 sm:p-6">
      <p
        className="text-[10px] font-black uppercase tracking-[0.26em]"
        style={{ color: accent }}
      >
        {kicker}
      </p>
      <h2 className="mt-3 text-2xl font-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-[#0a131c] p-5">
      <Icon size={20} style={{ color: accent }} />
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}

function RoadmapCard({
  title,
  description,
  accent,
  href,
}: {
  title: string;
  description: string;
  accent: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black">{title}</p>
        <ChevronRight size={18} style={{ color: accent }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{description}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-[26px] border border-white/10 bg-[#0a131c] p-5 transition hover:-translate-y-0.5 hover:border-white/20"
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="rounded-[26px] border border-white/10 bg-[#0a131c] p-5">
      {content}
    </article>
  );
}

function EmptyInstitutionState({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <section className="rounded-[30px] border border-dashed border-white/15 bg-[#0a131c] p-8 text-center">
      <Building2 className="mx-auto text-zinc-600" size={34} />
      <h2 className="mt-5 text-2xl font-black">No hay instituciones vinculadas</h2>
      <p className="mx-auto mt-3 max-w-[620px] text-sm leading-6 text-zinc-500">
        {isSuperAdmin
          ? "Crea la primera institucion para comenzar a configurar su entorno multi-tenant."
          : "Tu cuenta todavia no posee una membresia institucional activa."}
      </p>
      {!isSuperAdmin ? (
        <Link
          href="/institutional"
          className="mx-auto mt-6 flex min-h-12 w-fit items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-black"
        >
          Conocer RefLab Institucional
        </Link>
      ) : null}
    </section>
  );
}

function LoadingPanel() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cargando panel institucional">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-36 animate-pulse rounded-[26px] border border-white/10 bg-white/[0.035]"
        />
      ))}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[24px] border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
      <CircleAlert className="mt-0.5 shrink-0" size={18} />
      <p>{message}</p>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function InfoBadge({ label, highlighted = false }: { label: string; highlighted?: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
        highlighted
          ? "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#b7ff67]"
          : "border-white/10 bg-white/[0.04] text-zinc-400"
      }`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
        active ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
      }`}
    >
      {status}
    </span>
  );
}

function formatLocation(institution: InstitutionOverview["institution"]) {
  const location = [institution.city, institution.provinceState, institution.country]
    .filter(Boolean)
    .join(", ");
  return location || "Ubicacion sin configurar";
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-[#6fc11f]/60";
