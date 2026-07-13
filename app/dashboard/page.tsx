"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { SportPageSwitch } from "@/components/SportPageSwitch";
import { SportRadarGraphic } from "@/components/SportRadarGraphic";
import {
  buildSportPerformanceDataset,
  getSportCriterionPerformance,
  getSportPerformanceSummary,
  getSportRecommendedPlan,
  getSportRadarData,
  getSportTopicPerformance,
  type RadarMetric,
  type SportCriterionMetric,
} from "@/lib/performanceBySport";
import { supabase } from "@/lib/supabase";
import {
  formatPercent,
  formatScore,
  type AttemptRecord,
  type ExamResultRecord,
  type PerformanceClipRecord,
  type RulesExamResultRecord,
} from "@/lib/performance";
import { getFreemiumUsage } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

export const dynamic = "force-dynamic";

type DashboardData = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesResults: RulesExamResultRecord[];
  clips: DashboardClip[];
};

type DashboardClip = PerformanceClipRecord;

const emptyData: DashboardData = {
  attempts: [],
  examResults: [],
  rulesResults: [],
  clips: [],
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando dashboard..." />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const { user, isLoaded } = useUser();
  const { currentDiscipline: sportType } = useDiscipline();
  const { isPro, loadingRole } = useUserRole();
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!isLoaded) return;

      if (!user) {
        setData(emptyData);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

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
        supabase
          .from("clips")
          .select("*"),
      ]);

      if (attemptsRes.error || examsRes.error || clipsRes.error) {
        setLoadError(
          "No se pudieron cargar todas las metricas. El dashboard no inventa datos."
        );
      }

      if (rulesRes.error) {
        console.warn("Rules exam metrics unavailable:", rulesRes.error.message);
      }

      setData({
        attempts: (attemptsRes.data ?? []) as AttemptRecord[],
        examResults: (examsRes.data ?? []) as ExamResultRecord[],
        rulesResults: rulesRes.error
          ? []
          : ((rulesRes.data ?? []) as RulesExamResultRecord[]),
        clips: clipsRes.error ? [] : ((clipsRes.data ?? []) as DashboardClip[]),
      });

      setLoading(false);
    }

    loadData();
  }, [isLoaded, user]);

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
  const technicalSummary = summary;
  const topicMetrics = useMemo(
    () => getSportTopicPerformance(dataset.items, sportType),
    [dataset.items, sportType]
  );
  const topics = useMemo(() => topicMetrics.slice(0, 5), [topicMetrics]);
  const radarAxes = useMemo(
    () => getSportRadarData(dataset.items, sportType),
    [dataset.items, sportType]
  );
  const playerTopicHasData = radarAxes.some((axis) => axis.accuracy !== null);
  const criteria = useMemo(
    () => getSportCriterionPerformance(dataset.items, sportType),
    [dataset.items, sportType]
  );
  const plan = useMemo(
    () => getSportRecommendedPlan(technicalSummary, sportType),
    [technicalSummary, sportType]
  );
  const freemiumUsage = useMemo(
    () =>
      getFreemiumUsage({
        attempts: data.attempts,
        examResults: data.examResults,
        rulesResults: data.rulesResults,
      }),
    [data.attempts, data.examResults, data.rulesResults]
  );

  if (!isLoaded || loading || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
          Cargando dashboard...
        </div>
      </AppShell>
    );
  }

  if (!isPro) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[1080px] space-y-5 overflow-hidden">
          <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
              Dashboard basico
            </p>
            <h1 className="mt-3 break-words text-3xl font-black leading-tight md:text-4xl">
              Primer diagnostico RefLab
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Usa tus clips y examenes gratuitos para descubrir fortalezas,
              puntos a mejorar y motivos reales para evolucionar.
            </p>
          </header>

          {loadError && (
            <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
              {loadError}
            </div>
          )}

          <SportPageSwitch title="Disciplina del dashboard" />

          <FreeDashboardSummary
            summary={technicalSummary}
            usage={freemiumUsage}
          />

          <ProUpgradeCard
            title="Ver analisis completo"
            description="RefLab Pro desbloquea radar arbitral, evolucion historica, precision por criterio, historial completo, ranking, VAR Lab y entrenamiento sin limites."
            reason="El plan FREE mantiene el foco en un resumen basico para que pruebes la plataforma sin paywall inicial."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="w-full max-w-full space-y-5 overflow-hidden rounded-[24px] border border-white/10 bg-[#101820] p-3 shadow-2xl sm:p-5 lg:mx-auto lg:max-w-[1080px]">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
              Dashboard tecnico
            </p>
            <h1 className="mt-2 break-words text-2xl font-black md:text-3xl">Analisis arbitral</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Resumen tecnico de tu rendimiento arbitral, fortalezas, puntos
              criticos y plan recomendado.
            </p>
          </div>

          <Link
            href={sportType === "futsal" ? "/futsal/rules-exam" : "/training/exam"}
            className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#6fc11f] px-5 py-3 text-center font-black text-black transition hover:bg-[#82dc2a] sm:w-auto sm:px-6 sm:py-4"
          >
            Rendir examen
          </Link>
        </header>

        {loadError && (
          <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-100">
            {loadError}
          </div>
        )}

        <SportPageSwitch title="Disciplina del dashboard" />

        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-[#17212a] md:grid-cols-4">
          <TopMetric
            title="Promedio general"
            value={formatScore(technicalSummary.avgScore)}
            detail={technicalSummary.status}
            featured
          />
          <TopMetric title="Intentos" value={technicalSummary.totalAttempts} />
          <TopMetric title="Evaluaciones" value={summary.totalEvaluations} />
          <TopMetric title="Ultimo score" value={formatScore(technicalSummary.lastScore)} />
        </section>

        <TechnicalProfileCard axes={radarAxes} hasData={playerTopicHasData} />

        {!playerTopicHasData && (
          <section className="rounded-3xl border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-6 text-center">
            <p className="text-lg font-black text-white">Sin actividad registrada</p>
            <p className="mt-2 text-sm text-zinc-400">
              El mapa tecnico solo usa intentos y examenes reales con topico valido.
            </p>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <AnalysisCard
            title="Fortalezas"
            tone="success"
            items={[
              `Mejor criterio: ${technicalSummary.strongestCriterion?.label ?? "Sin datos"} ${
                technicalSummary.strongestCriterion
                  ? `(${formatPercent(technicalSummary.strongestCriterion.accuracy)})`
                  : ""
              }`,
              `Mejor topico: ${technicalSummary.strongestTopic?.topic ?? "Sin datos"} ${
                technicalSummary.strongestTopic
                  ? `(${formatPercent(technicalSummary.strongestTopic.accuracy)})`
                  : ""
              }`,
              technicalSummary.sampleNote,
            ]}
          />

          <AnalysisCard
            title="A mejorar"
            tone="danger"
            items={[
              `Criterio a mejorar: ${technicalSummary.weakestCriterion?.label ?? "Sin datos"}`,
              `Topico a mejorar: ${technicalSummary.weakestTopic?.topic ?? "Sin datos"}`,
              technicalSummary.weakestCriterion?.status ?? "Completa intentos con clips para detectar patrones.",
            ]}
          />

          <AnalysisCard
            title="Plan recomendado"
            tone="warning"
            items={[plan.diagnosis, plan.priority1, plan.nextStep]}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Panel title="Rendimiento por topico" href="/performance">
            {!technicalSummary.hasData ? (
              <Empty text="Sin actividad registrada." />
            ) : (
              <div className="space-y-4">
                {topics.map((item) => (
                  <ProgressRow
                    key={item.topic}
                    label={item.topic}
                    value={item.accuracy ?? 0}
                    suffix="%"
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Precision por criterio" href="/performance">
            <div className="space-y-4">
              {criteria.map((item) => (
                <CriterionRow key={item.key} item={item} />
              ))}
            </div>
          </Panel>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#111b24] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="break-words text-lg font-black sm:text-xl">Lectura tecnica del rendimiento</h2>
              <p className="mt-1 text-sm text-zinc-500">
                El analisis profundo vive en Rendimiento; este panel muestra solo el foco inmediato.
              </p>
            </div>
            <Link
              href="/performance"
              className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-5 py-3 text-center text-sm font-black text-[#6fc11f] transition hover:bg-[#6fc11f]/20"
            >
              Ver rendimiento completo
            </Link>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <InsightBlock title="Diagnostico" text={plan.diagnosis} />
            <InsightBlock title="Proximo foco" text={plan.reason} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function FreeDashboardSummary({
  summary,
  usage,
}: {
  summary: ReturnType<typeof getSportPerformanceSummary>;
  usage: ReturnType<typeof getFreemiumUsage>;
}) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-4 shadow-2xl sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TopMetric
          title="Tu precision"
          value={formatScore(summary.avgScore)}
          detail={summary.hasData ? summary.status : "Sin datos suficientes"}
          featured
        />
        <TopMetric
          title="Mejor topico"
          value={summary.strongestTopic?.topic ?? "Sin datos"}
          detail={
            summary.strongestTopic
              ? `${formatPercent(summary.strongestTopic.accuracy)} de acierto`
              : "Completa clips para activarlo"
          }
        />
        <TopMetric
          title="Topico a mejorar"
          value={summary.weakestTopic?.topic ?? "Sin datos"}
          detail={
            summary.weakestTopic
              ? `${formatPercent(summary.weakestTopic.accuracy)} de acierto`
              : "Completa clips para activarlo"
          }
        />
        <TopMetric
          title="Uso semanal FREE"
          value={`${usage.weeklyClips}/${usage.clipLimit}`}
          detail={`${usage.examsRemaining} examen gratis disponible`}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InsightBlock
          title="Clips gratuitos"
          text={
            usage.clipLimitReached
              ? "Ya usaste tus clips gratuitos de esta semana."
              : `Te quedan ${usage.clipsRemaining} clips gratuitos esta semana.`
          }
        />
        <InsightBlock
          title="Examen gratuito"
          text={
            usage.examLimitReached
              ? "Ya usaste tu examen gratuito semanal."
              : `Te quedan ${usage.examsRemaining} examenes gratuitos esta semana.`
          }
        />
      </div>
    </section>
  );
}

function TechnicalProfileCard({
  axes,
  hasData,
}: {
  axes: RadarMetric[];
  hasData: boolean;
}) {
  return (
    <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,#071019,#0b151d_58%,#101820)] p-4 shadow-2xl sm:rounded-[34px] lg:p-6">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#6fc11f] sm:text-xs sm:tracking-[0.34em]">
            Mapa tecnico
          </p>
          <h2 className="mt-3 break-words text-2xl font-black leading-tight text-white md:text-3xl lg:text-4xl">
            Radar por disciplina
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            El mapa tecnico usa solo actividad real de la disciplina seleccionada y mantiene sus ejes separados.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {axes.map((axis) => (
              <div key={axis.key} className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="break-words text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 sm:tracking-[0.16em]">{axis.label}</p>
                <p className="mt-2 text-2xl font-black text-white">{axis.accuracy === null ? "Sin datos" : `${axis.accuracy}%`}</p>
                <p className="mt-1 text-xs text-[#6fc11f]">
                  {axis.attempts > 0 ? `${axis.attempts} intentos` : axis.emptyStateLabel}
                </p>
              </div>
            ))}
          </div>
        </div>

        <SportRadarGraphic
          axes={axes}
          glowId="dashboard-radar-glow"
          overlayText={hasData ? null : "Sin actividad registrada."}
        />
      </div>
    </section>
  );
}

function TopMetric({ title, value, detail, featured = false }: { title: string; value: string | number; detail?: string; featured?: boolean }) {
  return (
    <div className="min-w-0 border-r border-b border-white/10 p-3 last:border-r-0 sm:p-4 md:border-b-0">
      <p className="text-[11px] text-zinc-400">{title}</p>
      <p className="mt-2 break-words text-xl font-black sm:mt-3 sm:text-3xl">{value}</p>
      {detail && (
        <p className={featured ? "mt-1 text-xs font-bold text-[#6fc11f]" : "mt-1 text-xs text-zinc-500"}>
          {detail}
        </p>
      )}
    </div>
  );
}

function AnalysisCard({ title, items, tone }: { title: string; items: string[]; tone: "success" | "danger" | "warning" }) {
  const style = {
    success: "border-[#6fc11f]/30 bg-[#6fc11f]/10",
    danger: "border-red-500/25 bg-red-500/10",
    warning: "border-yellow-400/25 bg-yellow-400/10",
  }[tone];

  return (
    <div className={`min-w-0 rounded-3xl border p-4 sm:p-5 ${style}`}>
      <h2 className="text-lg font-black">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-300">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2">
            <span className="text-[#6fc11f]">-</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-5">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3">
        <h2 className="break-words text-lg font-black sm:text-xl">{title}</h2>
        <Link href={href} className="text-xs font-black text-[#6fc11f]">
          Abrir
        </Link>
      </div>
      {children}
    </section>
  );
}

function ProgressRow({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span>{value}{suffix}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-[#6fc11f]" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function CriterionRow({ item }: { item: SportCriterionMetric }) {
  if (item.accuracy === null) {
    return <Empty text={`${item.label}: metrica en construccion o sin datos.`} compact />;
  }

  return <ProgressRow label={item.label} value={item.accuracy} suffix="%" />;
}

function InsightBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-sm font-black text-[#6fc11f]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p>
    </div>
  );
}

function Empty({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-white/10 text-center text-zinc-500 ${compact ? "p-4 text-sm" : "p-8"}`}>
      {text}
    </div>
  );
}
