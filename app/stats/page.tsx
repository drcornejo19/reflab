"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useSupabase } from "@/components/SupabaseProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import {
  buildSportPerformanceDataset,
  formatPercent,
  formatScore,
  getSportCriterionPerformance,
  getSportPerformanceSummary,
  getSportTopicPerformance,
  type SportCriterionMetric,
} from "@/lib/performanceBySport";
import {
  type AttemptRecord,
  type ExamResultRecord,
  type PerformanceClipRecord,
  type RulesExamResultRecord,
} from "@/lib/performance";
import { useUserRole } from "@/lib/useUserRole";

export const dynamic = "force-dynamic";

type StatsData = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesResults: RulesExamResultRecord[];
  clips: PerformanceClipRecord[];
};

const emptyData: StatsData = {
  attempts: [],
  examResults: [],
  rulesResults: [],
  clips: [],
};

export default function StatsPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando estadisticas..." />}>
      <StatsPageContent />
    </Suspense>
  );
}

function StatsPageContent() {
  const supabase = useSupabase();
  const { user, isLoaded } = useUser();
  const { currentDiscipline: sportType } = useDiscipline();
  const { isPro, loadingRole } = useUserRole();
  const theme = getDisciplineDefinition(sportType).theme;
  const [data, setData] = useState<StatsData>(emptyData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!isLoaded) return;

      if (!user) {
        setData(emptyData);
        setLoading(false);
        return;
      }

      const [attemptsRes, examsRes, rulesRes, clipsRes] = await Promise.all([
        supabase
          .from("attempts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("exam_results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rules_exam_results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("clips").select("*"),
      ]);

      setData({
        attempts: (attemptsRes.data ?? []) as AttemptRecord[],
        examResults: (examsRes.data ?? []) as ExamResultRecord[],
        rulesResults: rulesRes.error ? [] : ((rulesRes.data ?? []) as RulesExamResultRecord[]),
        clips: clipsRes.error ? [] : ((clipsRes.data ?? []) as PerformanceClipRecord[]),
      });

      setLoading(false);
    }

    void loadStats();
  }, [isLoaded, supabase, user]);

  const dataset = useMemo(
    () =>
      buildSportPerformanceDataset({
        attempts: data.attempts,
        examResults: data.examResults,
        rulesExamResults: data.rulesResults,
        clips: data.clips,
        sportType,
      }),
    [data.attempts, data.examResults, data.rulesResults, data.clips, sportType]
  );
  const summary = useMemo(
    () => getSportPerformanceSummary(dataset.items, dataset.sessions, sportType),
    [dataset.items, dataset.sessions, sportType]
  );
  const topics = useMemo(
    () => getSportTopicPerformance(dataset.items, sportType).slice(0, 5),
    [dataset.items, sportType]
  );
  const criteria = useMemo(
    () => getSportCriterionPerformance(dataset.items, sportType),
    [dataset.items, sportType]
  );
  const recentItems = useMemo(() => dataset.items.slice(0, 5), [dataset.items]);

  if (loading || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 text-zinc-400">
          Cargando estadisticas...
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
              Vista resumida de {summary.totalAttempts} registros reales para la disciplina seleccionada.
            </p>
          </header>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard title="Promedio" value={formatScore(summary.avgScore)} />
            <StatCard title="Intentos" value={summary.totalAttempts} />
            <StatCard title="Evaluaciones" value={summary.totalEvaluations} />
            <StatCard title="Mejor score" value={formatScore(summary.bestScore)} />
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
          <StatCard title="Intentos" value={summary.totalAttempts} />
          <StatCard title="Entrenamientos" value={summary.totalTrainings} />
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
