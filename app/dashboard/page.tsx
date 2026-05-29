"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { supabase } from "@/lib/supabase";
import {
  buildPerformanceDataset,
  formatPercent,
  formatScore,
  getCriterionPerformance,
  getPerformanceSummary,
  getRecommendedPlan,
  getTopicPerformance,
  type AttemptRecord,
  type CriterionMetric,
  type ExamResultRecord,
  type RulesExamResultRecord,
  type TopicMetric,
} from "@/lib/performance";
import { getFreemiumUsage } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

type DashboardData = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesResults: RulesExamResultRecord[];
};

type PlayerTopic = {
  label: string;
  value: number | null;
  attempts: number;
};

const emptyData: DashboardData = {
  attempts: [],
  examResults: [],
  rulesResults: [],
};

const playerTopicKeys = [
  { label: "VAR", aliases: ["VAR"] },
  { label: "Fuera de juego", aliases: ["Fuera de juego", "Offside"] },
  { label: "Manos", aliases: ["Manos", "Handball", "Mano"] },
  { label: "Disputas", aliases: ["Disputas", "Dispute", "Challenge"] },
  { label: "Faltas tacticas", aliases: ["Faltas tacticas", "Tactical foul"] },
];

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
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

      const [attemptsRes, examsRes, rulesRes] = await Promise.all([
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
      ]);

      if (attemptsRes.error || examsRes.error) {
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
      });

      setLoading(false);
    }

    loadData();
  }, [isLoaded, user]);

  const dataset = useMemo(
    () =>
      buildPerformanceDataset({
        attempts: data.attempts,
        examResults: data.examResults,
        rulesExamResults: data.rulesResults,
      }),
    [data.attempts, data.examResults, data.rulesResults]
  );

  const summary = useMemo(
    () => getPerformanceSummary(dataset.items, dataset.sessions),
    [dataset.items, dataset.sessions]
  );
  const topicMetrics = useMemo(() => getTopicPerformance(dataset.items), [dataset.items]);
  const topics = useMemo(() => topicMetrics.slice(0, 5), [topicMetrics]);
  const playerTopics = useMemo(() => buildPlayerTopics(topicMetrics), [topicMetrics]);
  const criteria = useMemo(() => getCriterionPerformance(dataset.items), [dataset.items]);
  const plan = useMemo(() => getRecommendedPlan(summary), [summary]);
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

          <FreeDashboardSummary
            summary={summary}
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
            href="/training/exam"
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

        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-[#17212a] md:grid-cols-4">
          <TopMetric
            title="Promedio general"
            value={formatScore(summary.avgScore)}
            detail={summary.status}
            featured
          />
          <TopMetric title="Intentos" value={summary.totalAttempts} />
          <TopMetric title="Evaluaciones" value={summary.totalEvaluations} />
          <TopMetric title="Ultimo score" value={formatScore(summary.lastScore)} />
        </section>

        <TechnicalProfileCard topics={playerTopics} hasData={summary.hasData} />

        {!summary.hasData && (
          <section className="rounded-3xl border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-6 text-center">
            <p className="text-lg font-black text-white">Sin datos suficientes</p>
            <p className="mt-2 text-sm text-zinc-400">
              Completa entrenamientos o evaluaciones para activar el diagnostico.
            </p>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-3">
          <AnalysisCard
            title="Fortalezas"
            tone="success"
            items={[
              `Mejor criterio: ${summary.strongestCriterion?.label ?? "Sin datos"} ${
                summary.strongestCriterion
                  ? `(${formatPercent(summary.strongestCriterion.accuracy)})`
                  : ""
              }`,
              `Mejor topico: ${summary.strongestTopic?.topic ?? "Sin datos"} ${
                summary.strongestTopic
                  ? `(${formatPercent(summary.strongestTopic.accuracy)})`
                  : ""
              }`,
              summary.sampleNote,
            ]}
          />

          <AnalysisCard
            title="A mejorar"
            tone="danger"
            items={[
              `Criterio a mejorar: ${summary.weakestCriterion?.label ?? "Sin datos"}`,
              `Topico a mejorar: ${summary.weakestTopic?.topic ?? "Sin datos"}`,
              summary.weakestCriterion?.status ?? "Completa mas ejercicios para detectar patrones.",
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
            {topics.length === 0 ? (
              <Empty text="Completa ejercicios para calcular topicos reales." />
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

function buildPlayerTopics(topicMetrics: TopicMetric[]): PlayerTopic[] {
  return playerTopicKeys.map((target) => {
    const metric = topicMetrics.find((item) =>
      target.aliases.some((alias) => item.topic.toLowerCase() === alias.toLowerCase())
    );

    return {
      label: target.label,
      value: metric?.accuracy ?? null,
      attempts: metric?.attempts ?? 0,
    };
  });
}

function FreeDashboardSummary({
  summary,
  usage,
}: {
  summary: ReturnType<typeof getPerformanceSummary>;
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

function TechnicalProfileCard({ topics, hasData }: { topics: PlayerTopic[]; hasData: boolean }) {
  const points = radarPoints(topics.map((topic) => topic.value ?? 0), 92, 110);
  const guideRings = [25, 50, 75, 100].map((value) => radarPoints([value, value, value, value, value], 92, 110));

  return (
    <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,#071019,#0b151d_58%,#101820)] p-4 shadow-2xl sm:rounded-[34px] lg:p-6">
      <div className="grid min-w-0 gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[#6fc11f] sm:text-xs sm:tracking-[0.34em]">
            Mapa tecnico
          </p>
          <h2 className="mt-3 break-words text-2xl font-black leading-tight text-white md:text-3xl lg:text-4xl">
            Perfil por topicos
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Lectura resumida de los cinco ejes principales del criterio arbitral: VAR, fuera de juego, manos, disputas y faltas tacticas.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
            {topics.map((topic) => (
              <div key={topic.label} className="min-w-0 rounded-2xl border border-white/10 bg-black/25 p-3">
                <p className="break-words text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500 sm:tracking-[0.16em]">{topic.label}</p>
                <p className="mt-2 text-2xl font-black text-white">{topic.value === null ? "-" : topic.value}</p>
                <p className="mt-1 text-xs text-[#6fc11f]">{topic.attempts} intentos</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[300px] overflow-hidden rounded-[28px] border border-[#6fc11f]/20 bg-[#050b12] p-3 shadow-[inset_0_0_50px_rgba(111,193,31,0.08)] sm:max-w-[380px] sm:p-5 lg:max-w-[410px]">
          <svg viewBox="0 0 220 220" className="h-full w-full">
            <defs>
              <filter id="radarGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {guideRings.map((ring, index) => (
              <polygon key={index} points={ring} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            ))}
            {topics.map((topic, index) => {
              const end = radarAxisPoint(index, 92, 110);
              const label = radarAxisPoint(index, 99, 110);
              return (
                <g key={topic.label}>
                  <line x1="110" y1="110" x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.12)" />
                  <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" className="fill-white text-[7px] font-black uppercase sm:text-[8px]">
                    {shortTopicLabel(topic.label)}
                  </text>
                </g>
              );
            })}
            <polygon points={points} fill="rgba(111,193,31,0.32)" stroke="#6fc11f" strokeWidth="3" filter="url(#radarGlow)" />
            {points.split(" ").map((point, index) => {
              const [x, y] = point.split(",").map(Number);
              return <circle key={index} cx={x} cy={y} r="4" fill="#b7ff8a" />;
            })}
            <circle cx="110" cy="110" r="4" fill="#6fc11f" />
          </svg>

          {!hasData && (
            <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-dashed border-[#6fc11f]/25 bg-[#050b12]/90 p-3 text-center text-xs font-bold text-zinc-300">
              Completa ejercicios para activar este mapa con datos reales.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function radarPoints(values: number[], radius: number, center: number) {
  return values
    .map((value, index) => {
      const point = radarAxisPoint(index, radius * (Math.max(0, Math.min(value, 100)) / 100), center);
      return `${point.x},${point.y}`;
    })
    .join(" ");
}

function radarAxisPoint(index: number, radius: number, center: number) {
  const angle = (-90 + index * 72) * (Math.PI / 180);
  return {
    x: Math.round((center + Math.cos(angle) * radius) * 10) / 10,
    y: Math.round((center + Math.sin(angle) * radius) * 10) / 10,
  };
}

function shortTopicLabel(label: string) {
  if (label === "Fuera de juego") return "FDJ";
  if (label === "Faltas tacticas") return "FT";
  if (label === "Disputas") return "DISP";
  return label;
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

function CriterionRow({ item }: { item: CriterionMetric }) {
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
