"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { getDisciplineDefinition } from "@/lib/discipline";
import {
  formatPercent,
  formatScore,
  type SportCriterionMetric,
} from "@/lib/performanceBySport";
import {
  buildCanonicalPerformanceSummary,
  type CanonicalPerformanceSummaryModel,
} from "@/lib/performance/canonicalSummaryModel";
import { useUserRole } from "@/lib/useUserRole";

export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando estadisticas..." />}>
      <StatsPageContent />
    </Suspense>
  );
}

function StatsPageContent() {
  const { user, isLoaded } = useUser();
  const { currentDiscipline: sportType } = useDiscipline();
  const { isPro, loadingRole } = useUserRole();
  const theme = getDisciplineDefinition(sportType).theme;
  const [data, setData] = useState<CanonicalPerformanceSummaryModel | null>(null);
  const [weeklyTrainingUsed, setWeeklyTrainingUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStats() {
      if (!isLoaded) return;

      if (!user) {
        setData(null);
        setWeeklyTrainingUsed(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      try {
        const [performanceResponse, usageResponse] = await Promise.all([
          fetch(
            `/api/performance/summary?sportType=${encodeURIComponent(sportType)}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/training/usage?sportType=${encodeURIComponent(sportType)}`,
            { cache: "no-store" }
          ).catch(() => null),
        ]);
        if (!performanceResponse.ok) {
          const payload = (await performanceResponse.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error === "identity_link_required"
              ? "Tu identidad debe estar vinculada para consultar estadisticas."
              : "No se pudieron cargar las metricas oficiales."
          );
        }
        const payload = (await performanceResponse.json()) as {
          performance?: CanonicalPerformanceSummaryModel;
        };
        setData(payload.performance ?? null);
        if (usageResponse?.ok) {
          const usagePayload = (await usageResponse.json()) as {
            usage?: { weeklyUsed?: number };
          };
          setWeeklyTrainingUsed(usagePayload.usage?.weeklyUsed ?? 0);
        } else {
          setWeeklyTrainingUsed(0);
        }
      } catch (error) {
        setData(null);
        setWeeklyTrainingUsed(0);
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudieron cargar las metricas oficiales."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadStats();
  }, [isLoaded, sportType, user]);

  const emptyData = useMemo(
    () =>
      buildCanonicalPerformanceSummary({
        attempts: [],
        examResults: [],
        sportType,
        canonicalUserId: null,
      }),
    [sportType]
  );
  const performance = data?.sportType === sportType ? data : emptyData;
  const summary = performance.summary;
  const topics = useMemo(() => performance.topics.slice(0, 5), [performance.topics]);
  const criteria = performance.criteria;
  const recentItems = useMemo(() => performance.history.slice(0, 5), [performance.history]);

  if (loading || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 text-zinc-400">
          Cargando estadisticas...
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-4 text-red-200">
          {loadError}
        </div>
      </AppShell>
    );
  }

  if (!isPro) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[1200px] space-y-5">

          <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-6">
            <p
              className="text-[10px] font-black uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.35em]"
              style={{ color: theme.accent }}
            >
              REFLAB STATS
            </p>
            <h1 className="mt-2 text-2xl font-black md:text-3xl">Estadisticas basicas</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Vista resumida de evaluaciones oficiales y uso semanal de Entrenamiento.
            </p>
          </header>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Promedio" value={formatScore(summary.avgScore)} />
            <StatCard title="Intentos oficiales" value={summary.totalAttempts} />
            <StatCard title="Evaluaciones" value={summary.totalEvaluations} />
            <StatCard title="Entrenamiento semanal" value={weeklyTrainingUsed} />
          </section>

          <ProUpgradeCard
            title="Desbloquea estadisticas completas"
            description="RefLab Pro habilita desglose por topico, criterios, historial y comparacion mas profunda por disciplina."
            compact
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-5">

        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-6">
          <p
            className="text-[10px] font-black uppercase tracking-[0.22em] sm:text-xs sm:tracking-[0.35em]"
            style={{ color: theme.accent }}
          >
            REFLAB STATS
          </p>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">Estadisticas sincronizadas</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Esta vista usa el mismo motor de metricas que Dashboard, Perfil y Ref Performance.
          </p>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard title="Promedio" value={formatScore(summary.avgScore)} />
          <StatCard title="Intentos oficiales" value={summary.totalAttempts} />
          <StatCard title="Entrenamiento semanal" value={weeklyTrainingUsed} />
          <StatCard title="Evaluaciones" value={summary.totalEvaluations} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Actividad reciente">
            {recentItems.length === 0 ? (
              <EmptyState text="Todavia no hay registros para esta disciplina." />
            ) : (
              <div className="space-y-2">
                {recentItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm"
                  >
                    <span className="min-w-0 truncate">{item.topic}</span>
                    <span className="shrink-0 font-black" style={{ color: theme.accent }}>
                      {formatScore(item.score)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Rendimiento por topico">
            {topics.length === 0 ? (
              <EmptyState text="Sin datos suficientes por topico." />
            ) : (
              <div className="space-y-4">
                {topics.map((topic) => (
                  <ProgressMetric
                    key={topic.topic}
                    label={topic.topic}
                    value={topic.accuracy}
                    detail={`${topic.attempts} intentos`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </section>

        <Panel title="Precision por criterio">
          {criteria.length === 0 ? (
            <EmptyState text="Sin criterios disponibles." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {criteria.map((criterion) => (
                <CriterionCard key={criterion.key} criterion={criterion} />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4 sm:p-5">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black sm:text-3xl">{value}</p>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-black sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}

function ProgressMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  const { currentDiscipline } = useDiscipline();
  const theme = getDisciplineDefinition(currentDiscipline).theme;

  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span>{formatPercent(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(value ?? 0, 100))}%`,
            backgroundColor: theme.accent,
          }}
        />
      </div>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function CriterionCard({ criterion }: { criterion: SportCriterionMetric }) {
  const { currentDiscipline } = useDiscipline();
  const theme = getDisciplineDefinition(currentDiscipline).theme;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="font-black text-white">{criterion.label}</p>
      <p className="mt-2 text-sm text-zinc-400">{criterion.description}</p>
      <p className="mt-3 text-2xl font-black" style={{ color: theme.accent }}>
        {formatPercent(criterion.accuracy)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        {criterion.correct}/{criterion.attempts} aciertos
      </p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}
