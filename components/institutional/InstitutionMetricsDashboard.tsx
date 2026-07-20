"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Printer,
  RefreshCw,
  Target,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import type {
  InstitutionMetricDimension,
  InstitutionMetricsWorkspace,
} from "@/lib/institutional/types";

export function InstitutionMetricsDashboard({
  reportMode = false,
}: {
  reportMode?: boolean;
}) {
  const { currentDiscipline } = useDiscipline();
  const { activeContext, loading: institutionLoading } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] =
    useState<InstitutionMetricsWorkspace | null>(null);
  const [groupId, setGroupId] = useState("");
  const [from, setFrom] = useState(() => dateOffset(-89));
  const [to, setTo] = useState(() => dateOffset(0));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContext) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    void loadWorkspace();
    // Institution, discipline and explicit filters define this report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id, currentDiscipline, groupId, from, to]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sportType: currentDiscipline,
        from,
        to,
      });
      if (groupId) params.set("groupId", groupId);
      const response = await fetch(
        `/api/institution/${reportMode ? "reports" : "metrics"}?${params}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        workspace?: InstitutionMetricsWorkspace;
        report?: { workspace: InstitutionMetricsWorkspace };
        error?: string;
      };
      const nextWorkspace = data.workspace ?? data.report?.workspace;
      if (!response.ok || !nextWorkspace) {
        throw new Error(data.error || "No se pudieron cargar las metricas.");
      }
      setWorkspace(nextWorkspace);
    } catch (loadError) {
      setWorkspace(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las metricas."
      );
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!workspace?.capabilities.canExport) return;
    const params = new URLSearchParams({
      sportType: currentDiscipline,
      from,
      to,
      format: "csv",
    });
    if (groupId) params.set("groupId", groupId);
    window.location.href = `/api/institution/reports/export?${params}`;
  }

  return (
    <AppShell>
      <div className="space-y-6 pb-8 print:bg-white print:text-black">
        <header
          className="overflow-hidden rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7 print:border-zinc-300 print:bg-white print:shadow-none"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 44%), #08131c`,
          }}
        >
          <p
            className="text-[10px] font-black uppercase tracking-[0.3em]"
            style={{ color: theme.accent }}
          >
            {reportMode ? "Fase 10 · Reportes" : "Fase 8 · Metricas"}
          </p>
          <div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                {reportMode
                  ? "Reporte institucional"
                  : "Rendimiento institucional"}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400 print:text-zinc-700">
                Una unica fuente de datos para intentos reales de{" "}
                {currentDiscipline === "futsal" ? "Futsal" : "Futbol 11"}.
                Cada valor informa su muestra y periodo.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button
                type="button"
                onClick={() => void loadWorkspace()}
                className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black"
              >
                <RefreshCw size={17} />
                Actualizar
              </button>
              {reportMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black"
                  >
                    <Printer size={17} />
                    Guardar PDF
                  </button>
                  <button
                    type="button"
                    onClick={exportCsv}
                    disabled={!workspace?.capabilities.canExport}
                    className="flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      backgroundColor: theme.button,
                      color: theme.onAccent,
                    }}
                  >
                    <Download size={17} />
                    Exportar CSV
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </header>

        <section className="grid gap-3 rounded-[28px] border border-white/10 bg-[#09131c] p-4 sm:grid-cols-3 print:border-zinc-300 print:bg-white">
          <Field label="Desde">
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="control-input"
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="control-input"
            />
          </Field>
          <Field label="Grupo">
            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              className="control-input"
            >
              <option value="">Todos los grupos habilitados</option>
              {workspace?.availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {institutionLoading || loading ? (
          <LoadingState />
        ) : !workspace ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Promedio general"
                value={metricLabel(workspace.summary.average.value)}
                detail={`${workspace.summary.average.attempts} evaluaciones · ${workspace.period.label}`}
                icon={Gauge}
                accent={theme.accent}
              />
              <MetricCard
                label="Intentos reales"
                value={String(workspace.summary.sessions)}
                detail={`${workspace.summary.decisions} respuestas corregidas`}
                icon={Activity}
                accent={theme.accent}
              />
              <MetricCard
                label="Cumplimiento"
                value={metricLabel(workspace.summary.completionRate)}
                detail={`${workspace.summary.assignedUsers} usuarios asignados`}
                icon={CheckCircle2}
                accent={theme.accent}
              />
              <MetricCard
                label="Usuarios activos"
                value={String(workspace.summary.activeUsers)}
                detail={`Disciplina: ${
                  currentDiscipline === "futsal" ? "Futsal" : "Futbol 11"
                }`}
                icon={UsersRound}
                accent={theme.accent}
              />
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CompactMetric
                label="Precision tecnica"
                value={metricLabel(
                  workspace.summary.technicalAverage.value
                )}
                attempts={workspace.summary.technicalAverage.attempts}
              />
              <CompactMetric
                label="Precision disciplinaria"
                value={metricLabel(
                  workspace.summary.disciplinaryAverage.value
                )}
                attempts={workspace.summary.disciplinaryAverage.attempts}
              />
              <CompactMetric
                label="Reanudaciones"
                value={metricLabel(workspace.summary.restartAverage.value)}
                attempts={workspace.summary.restartAverage.attempts}
              />
              <CompactMetric
                label="Consistencia"
                value={metricLabel(workspace.summary.consistency)}
                attempts={workspace.summary.sessions}
              />
            </section>

            {workspace.warnings.map((warning) => (
              <Alert key={warning} tone="warning">
                {warning}
              </Alert>
            ))}

            <section className="grid gap-5 xl:grid-cols-2">
              <Panel title="Rendimiento por topico" accent={theme.accent}>
                {workspace.topics.length ? (
                  <DimensionList
                    items={workspace.topics}
                    accent={theme.accent}
                  />
                ) : (
                  <EmptyRow text="Sin topicos calculables para este periodo." />
                )}
              </Panel>
              <Panel title="Rendimiento por criterio" accent={theme.accent}>
                {workspace.criteria.length ? (
                  <DimensionList
                    items={workspace.criteria}
                    accent={theme.accent}
                  />
                ) : (
                  <EmptyRow text="Los contenidos todavia no tienen criterios medibles etiquetados." />
                )}
              </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <Panel title="Comparativa de grupos" accent={theme.accent}>
                {workspace.groups.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        <tr>
                          <th className="pb-3">Grupo</th>
                          <th className="pb-3">Participantes</th>
                          <th className="pb-3">Activos</th>
                          <th className="pb-3">Intentos</th>
                          <th className="pb-3">Promedio</th>
                          <th className="pb-3">Cumplimiento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspace.groups.map((group) => (
                          <tr
                            key={group.id}
                            className="border-t border-white/10 print:border-zinc-300"
                          >
                            <td className="py-4 font-black">{group.name}</td>
                            <td className="py-4 text-zinc-400">
                              {group.participants}
                            </td>
                            <td className="py-4 text-zinc-400">
                              {group.activeUsers}
                            </td>
                            <td className="py-4 text-zinc-400">
                              {group.sessions}
                            </td>
                            <td className="py-4 font-black">
                              {metricLabel(group.average)}
                            </td>
                            <td className="py-4 font-black">
                              {metricLabel(group.compliance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyRow text="No hay grupos visibles para el alcance actual." />
                )}
              </Panel>

              <Panel title="Plan recomendado" accent={theme.accent}>
                {workspace.recommendations.length ? (
                  <div className="space-y-3">
                    {workspace.recommendations.map((recommendation) => (
                      <div
                        key={recommendation}
                        className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 print:border-zinc-300 print:bg-white"
                      >
                        <Target
                          size={18}
                          className="mt-0.5 shrink-0"
                          style={{ color: theme.accent }}
                        />
                        <p className="text-sm leading-6 text-zinc-300 print:text-zinc-800">
                          {recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyRow text="No hay evidencia suficiente para generar recomendaciones." />
                )}
              </Panel>
            </section>

            {reportMode ? (
              <section className="rounded-[28px] border border-white/10 bg-[#09131c] p-5 text-xs leading-6 text-zinc-500 print:border-zinc-300 print:bg-white print:text-zinc-700">
                <p className="font-black text-white print:text-black">
                  Trazabilidad del reporte
                </p>
                <p>
                  Institucion: {workspace.institution.name} · Periodo:{" "}
                  {workspace.period.label} · Usuarios activos:{" "}
                  {workspace.summary.activeUsers} · Intentos:{" "}
                  {workspace.summary.sessions}.
                </p>
                <p>
                  Este reporte no incluye notas psicologicas, medicas ni otra
                  informacion sensible.
                </p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}

function DimensionList({
  items,
  accent,
}: {
  items: InstitutionMetricDimension[];
  accent: string;
}) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key}>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-black">{item.label}</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {item.decisions} respuestas · {item.sessions} sesiones
              </p>
            </div>
            <p className="text-lg font-black">
              {metricLabel(item.average)}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${item.average ?? 0}%`,
                backgroundColor: accent,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof BarChart3;
  accent: string;
}) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-[#09131c] p-5 print:border-zinc-300 print:bg-white">
      <div
        className="grid h-10 w-10 place-items-center rounded-2xl"
        style={{ color: accent, backgroundColor: `${accent}18` }}
      >
        <Icon size={19} />
      </div>
      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </article>
  );
}

function CompactMetric({
  label,
  value,
  attempts,
}: {
  label: string;
  value: string;
  attempts: number;
}) {
  return (
    <article className="rounded-[22px] border border-white/10 bg-white/[0.025] p-4 print:border-zinc-300 print:bg-white">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-xl font-black">{value}</p>
        <p className="text-[10px] text-zinc-600">{attempts} registros</p>
      </div>
    </article>
  );
}

function Panel({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#09131c] p-5 sm:p-6 print:border-zinc-300 print:bg-white">
      <div className="mb-5 flex items-center gap-3">
        <span
          className="h-7 w-1 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: React.ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      className={`flex gap-3 rounded-[22px] border p-4 text-sm ${
        isError
          ? "border-red-500/25 bg-red-500/10 text-red-100"
          : "border-amber-400/25 bg-amber-400/10 text-amber-100"
      }`}
    >
      <AlertTriangle size={19} className="mt-0.5 shrink-0" />
      <p className="leading-6">{children}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500 print:border-zinc-300">
      {text}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-[28px] border border-white/10 bg-[#09131c] text-zinc-400">
      <Loader2 className="mr-3 animate-spin" size={20} />
      Calculando metricas reales...
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 p-10 text-center">
      <BarChart3 className="mx-auto text-zinc-600" size={36} />
      <p className="mt-4 font-black">Sin espacio institucional activo</p>
      <p className="mt-2 text-sm text-zinc-500">
        Selecciona una institucion para consultar sus metricas.
      </p>
    </div>
  );
}

function metricLabel(value: number | null) {
  return value == null ? "Sin datos" : `${formatNumber(value)}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
  }).format(value);
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
