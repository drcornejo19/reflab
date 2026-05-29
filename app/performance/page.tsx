"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Dumbbell,
  Gauge,
  History,
  Languages,
  LineChart,
  ListChecks,
  MessageCircle,
  MonitorCheck,
  PlaySquare,
  RefreshCw,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RefPerformanceClient } from "@/components/RefPerformanceClient";
import { supabase } from "@/lib/supabase";
import {
  buildPerformanceDataset,
  formatDate,
  formatPercent,
  formatScore,
  getCriterionPerformance,
  getEvolutionData,
  getModulePerformance,
  getPerformanceSummary,
  getRankingRows,
  getRecentHistory,
  getRecommendedPlan,
  getTopicPerformance,
  type AttemptRecord,
  type CriterionMetric,
  type ExamResultRecord,
  type ModulePerformance,
  type PerformanceItem,
  type RankingRow,
  type RankingProfileRecord,
  type RulesExamResultRecord,
  type SummaryMetric,
  type TopicMetric,
} from "@/lib/performance";

type HistoryMode = "ALL" | "training" | "exam" | "rules_exam";
type HistoryResult = "ALL" | PerformanceItem["result"];
type PerformanceView = "evolution" | "plan" | "topics" | "criteria" | "modules" | "history" | "ranking" | "complementary";

type LoadState = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesResults: RulesExamResultRecord[];
  rankingAttempts: AttemptRecord[];
  rankingProfiles: RankingProfileRecord[];
};

const initialData: LoadState = {
  attempts: [],
  examResults: [],
  rulesResults: [],
  rankingAttempts: [],
  rankingProfiles: [],
};

const sourceLabels: Record<HistoryMode, string> = {
  ALL: "Todos los modos",
  training: "Entrenamiento",
  exam: "Examen arbitral",
  rules_exam: "Examen de reglas",
};

const resultLabels: Record<HistoryResult, string> = {
  ALL: "Todos los resultados",
  Correcto: "Correctos",
  Parcial: "Parciales",
  Incorrecto: "Incorrectos",
  "Sin datos": "Sin datos",
};

const moduleIcons: Record<string, LucideIcon> = {
  decision: ClipboardCheck,
  video: PlaySquare,
  var: MonitorCheck,
  english: Languages,
  communication: MessageCircle,
  preparation: Dumbbell,
};

const mainTopicOrder = ["VAR", "Fuera de juego", "Manos", "Disputas", "Faltas tacticas"];

const performanceViewMeta: Record<
  PerformanceView,
  {
    title: string;
    description: string;
    icon: LucideIcon;
  }
> = {
  evolution: { title: "Mi evolucion", description: "Progreso, tendencia y actividad reciente a lo largo del tiempo.", icon: LineChart },
  plan: { title: "Plan recomendado", description: "Diagnostico, prioridades y proximo entrenamiento sugerido.", icon: Target },
  topics: { title: "Por topico", description: "Mapa tecnico y rendimiento por tipo de jugada arbitral.", icon: BarChart3 },
  criteria: { title: "Por criterio", description: "Decision tecnica, reanudacion y sancion disciplinaria.", icon: ListChecks },
  modules: { title: "Por modulo", description: "Que mide cada area de entrenamiento dentro de RefLab.", icon: Activity },
  history: { title: "Historial", description: "Intentos reales, filtros, puntajes, decisiones y feedback.", icon: History },
  ranking: { title: "Ranking", description: "Comparacion comunitaria y posicion segun actividad registrada.", icon: Trophy },
  complementary: { title: "Analisis complementario", description: "Resumen general de metricas, indicadores y diagnostico global.", icon: Gauge },
};

export default function PerformancePage() {
  const { user, isLoaded } = useUser();
  const [data, setData] = useState<LoadState>(initialData);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("ALL");
  const [historyResult, setHistoryResult] = useState<HistoryResult>("ALL");
  const [activeView, setActiveView] = useState<PerformanceView | null>(null);

  useEffect(() => {
    async function loadPerformance() {
      if (!isLoaded) return;

      if (!user) {
        setData(initialData);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      const [attemptsRes, examsRes, rulesRes, rankingRes, profilesRes] = await Promise.all([
        supabase
          .from("attempts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("exam_results")
          .select("id,user_id,total_questions,total_score,avg_score,correct_count,details,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("rules_exam_results")
          .select("id,user_id,total_questions,correct_count,percentage,unanswered_count,finish_reason,level,details,topic_performance,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("attempts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(800),
        supabase
          .from("user_profiles")
          .select("*"),
      ]);

      if (attemptsRes.error || examsRes.error) {
        setLoadError("No se pudieron cargar todas las metricas principales. RefLab mantiene la pantalla sin inventar datos.");
      }

      if (rulesRes.error) {
        console.warn("Rules exam metrics unavailable:", rulesRes.error.message);
      }

      setData({
        attempts: (attemptsRes.data ?? []) as AttemptRecord[],
        examResults: (examsRes.data ?? []) as ExamResultRecord[],
        rulesResults: rulesRes.error ? [] : ((rulesRes.data ?? []) as RulesExamResultRecord[]),
        rankingAttempts: (rankingRes.data ?? []) as AttemptRecord[],
        rankingProfiles: profilesRes.error ? [] : ((profilesRes.data ?? []) as RankingProfileRecord[]),
      });

      setLoading(false);
    }

    loadPerformance();
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

  const summary = useMemo(() => getPerformanceSummary(dataset.items, dataset.sessions), [dataset.items, dataset.sessions]);
  const evolution = useMemo(() => getEvolutionData(dataset.sessions), [dataset.sessions]);
  const topics = useMemo(() => getTopicPerformance(dataset.items), [dataset.items]);
  const criteria = useMemo(() => getCriterionPerformance(dataset.items), [dataset.items]);
  const modules = useMemo(() => getModulePerformance(dataset.items), [dataset.items]);
  const plan = useMemo(() => getRecommendedPlan(summary), [summary]);
  const ranking = useMemo(() => getRankingRows(data.rankingAttempts, user?.id, data.rankingProfiles), [data.rankingAttempts, data.rankingProfiles, user?.id]);
  const currentRanking = ranking.find((row) => row.userId === user?.id);

  const history = useMemo(() => {
    return getRecentHistory(dataset.items, 30).filter((item) => {
      const modeMatch = historyMode === "ALL" || item.source === historyMode;
      const resultMatch = historyResult === "ALL" || item.result === historyResult;
      return modeMatch && resultMatch;
    });
  }, [dataset.items, historyMode, historyResult]);

  if (!isLoaded || loading) {
    return (
      <AppShell>
        <LoadingCard />
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <EmptyState
          title="Inicia sesion para ver tu rendimiento"
          text="Las metricas de RefLab se calculan con tus intentos, examenes y actividad guardada."
          actionHref="/sign-in"
          actionLabel="Iniciar sesion"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-full space-y-5 overflow-hidden lg:max-w-[1180px] lg:space-y-6">
        <RefPerformanceClient />

        <PerformanceHero />

        {loadError && (
          <div className="rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm font-bold leading-6 text-yellow-100">
            {loadError}
          </div>
        )}

        {activeView ? (
          <>
            <PerformanceModuleHeader activeView={activeView} onBack={() => setActiveView(null)} />
            <PrimaryAnalysisView
              activeView={activeView}
              summary={summary}
              evolution={evolution}
              plan={plan}
              topics={topics}
              criteria={criteria}
              modules={modules}
              history={history}
              historyMode={historyMode}
              historyResult={historyResult}
              setHistoryMode={setHistoryMode}
              setHistoryResult={setHistoryResult}
              ranking={ranking}
              currentRanking={currentRanking}
            />
          </>
        ) : (
          <PerformanceEntryGrid activeView={activeView} onSelect={setActiveView} />
        )}
      </div>
    </AppShell>
  );
}
function PerformanceEntryGrid({
  activeView,
  onSelect,
}: {
  activeView: PerformanceView | null;
  onSelect: (view: PerformanceView) => void;
}) {
  const entries = (Object.keys(performanceViewMeta) as PerformanceView[]).map((view) => ({ view, ...performanceViewMeta[view] }));

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {entries.map((entry) => {
        const Icon = entry.icon;
        const active = entry.view === activeView;

        return (
          <button
            key={entry.view}
            type="button"
            onClick={() => onSelect(entry.view)}
            aria-pressed={active}
            className={`group min-h-[190px] min-w-0 rounded-[30px] border p-5 text-left shadow-2xl transition active:scale-[0.98] sm:p-6 ${
              active
                ? "border-[#6fc11f]/70 bg-[#6fc11f]/15 shadow-[0_0_34px_rgba(111,193,31,0.18)]"
                : "border-white/10 bg-[#101b24] hover:-translate-y-1 hover:border-[#6fc11f]/45 hover:bg-[#13212b]"
            }`}
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border transition sm:h-14 sm:w-14 ${
                  active
                    ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                    : "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f] group-hover:bg-[#6fc11f]/15"
                }`}
              >
                <Icon size={24} />
              </div>
              <ArrowRight className={`h-5 w-5 shrink-0 transition ${active ? "translate-x-1 text-[#6fc11f]" : "text-zinc-600 group-hover:translate-x-1 group-hover:text-[#6fc11f]"}`} />
            </div>
            <h2 className="mt-5 break-words text-2xl font-black leading-tight text-white">{entry.title}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{entry.description}</p>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f]">
              {active ? "Modulo activo" : "Abrir modulo"}
            </p>
          </button>
        );
      })}
    </section>
  );
}

function PerformanceModuleHeader({ activeView, onBack }: { activeView: PerformanceView; onBack: () => void }) {
  const meta = performanceViewMeta[activeView];
  const Icon = meta.icon;

  return (
    <section className="rounded-[30px] border border-[#6fc11f]/25 bg-[#071019] p-4 shadow-2xl sm:p-5 lg:p-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-black text-zinc-200 transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f]"
      >
        <ArrowLeft size={18} />
        Volver a modulos
      </button>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:tracking-[0.35em]">Modulo de analisis</p>
          <h2 className="mt-2 break-words text-3xl font-black leading-tight text-white sm:text-4xl">{meta.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">{meta.description}</p>
        </div>
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/35 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={26} />
        </div>
      </div>
    </section>
  );
}

function PrimaryAnalysisView({
  activeView,
  summary,
  evolution,
  plan,
  topics,
  criteria,
  modules,
  history,
  historyMode,
  historyResult,
  setHistoryMode,
  setHistoryResult,
  ranking,
  currentRanking,
}: {
  activeView: PerformanceView;
  summary: ReturnType<typeof getPerformanceSummary>;
  evolution: ReturnType<typeof getEvolutionData>;
  plan: ReturnType<typeof getRecommendedPlan>;
  topics: TopicMetric[];
  criteria: CriterionMetric[];
  modules: ModulePerformance[];
  history: PerformanceItem[];
  historyMode: HistoryMode;
  historyResult: HistoryResult;
  setHistoryMode: (value: HistoryMode) => void;
  setHistoryResult: (value: HistoryResult) => void;
  ranking: RankingRow[];
  currentRanking?: RankingRow;
}) {
  return (
    <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.12),transparent_36%),#061018] p-3 shadow-2xl sm:p-4 lg:p-5">
      {activeView === "evolution" && <EvolutionPanel evolution={evolution} />}
      {activeView === "plan" && <RecommendedPlanPanel plan={plan} />}
      {activeView === "topics" && <TopicsPanel topics={topics} />}
      {activeView === "criteria" && <CriteriaPanel criteria={criteria} />}
      {activeView === "modules" && <ModulesPanel modules={modules} />}
      {activeView === "history" && (
        <HistoryPanel
          history={history}
          historyMode={historyMode}
          historyResult={historyResult}
          setHistoryMode={setHistoryMode}
          setHistoryResult={setHistoryResult}
        />
      )}
      {activeView === "ranking" && <RankingPanel ranking={ranking} currentRanking={currentRanking} />}
      {activeView === "complementary" && <ComplementaryAnalysisPanel summary={summary} />}
    </section>
  );
}

function ComplementaryAnalysisPanel({ summary }: { summary: ReturnType<typeof getPerformanceSummary> }) {
  const criterionWeak = {
    label: "Criterio debil",
    value: summary.weakestCriterion?.label ?? "Sin datos",
    detail: summary.weakestCriterion ? `${formatPercent(summary.weakestCriterion.accuracy)} de precision` : "No hay criterios suficientes.",
    tone: "danger" as const,
  };
  const criterionToImprove = {
    label: "Criterio a mejorar",
    value: summary.weakestCriterion?.label ?? "Sin datos",
    detail: summary.weakestCriterion?.status ?? "Completa mas ejercicios para detectar patrones.",
    tone: "danger" as const,
  };

  const metric = (label: string) => summary.metrics.find((item) => item.label === label);
  const groups = [
    {
      title: "Actividad",
      metrics: [metric("Intentos analizados"), metric("Entrenamientos"), metric("Evaluaciones")].filter(Boolean),
    },
    {
      title: "Rendimiento general",
      metrics: [metric("Promedio general"), metric("Mejor score"), metric("Ultimo score")].filter(Boolean),
    },
    {
      title: "Fortalezas",
      metrics: [metric("Topico fuerte"), metric("Criterio fuerte")].filter(Boolean),
    },
    {
      title: "Debilidades",
      metrics: [metric("Topico debil"), criterionWeak, criterionToImprove],
    },
    {
      title: "Recomendacion",
      metrics: [metric("Modulo recomendado"), metric("Estado general")].filter(Boolean),
    },
  ];

  return (
    <Panel
      eyebrow="Analisis complementario"
      title="Resumen general del rendimiento arbitral"
      description="Metricas generales agrupadas para que el hub principal quede limpio y modular."
      icon={Gauge}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-[26px] border border-white/10 bg-black/20 p-4">
            <h3 className="text-lg font-black text-white">{group.title}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.metrics.map((item) => item && <SummaryCard key={`${group.title}-${item.label}`} metric={item} />)}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
function PerformanceHero() {
  return (
    <header className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-4 shadow-2xl sm:rounded-[34px] lg:p-7">
      <div>
        <p className="break-words text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.45em]">REFLAB PERFORMANCE</p>
        <h1 className="mt-3 break-words text-3xl font-black leading-tight md:mt-4 md:text-5xl">Rendimiento</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 md:text-base">
          Elegi un modulo de analisis para revisar evolucion, plan recomendado, topicos, criterios, modulos, historial, ranking o diagnostico complementario.
        </p>
      </div>
    </header>
  );
}

function SummaryCard({ metric }: { metric: SummaryMetric }) {
  const tone = {
    success: "border-[#6fc11f]/30 bg-[#6fc11f]/10",
    warning: "border-yellow-400/25 bg-yellow-400/10",
    danger: "border-red-500/25 bg-red-500/10",
    neutral: "border-white/10 bg-[#101b24]",
    undefined: "border-white/10 bg-[#101b24]",
  }[String(metric.tone) as "success" | "warning" | "danger" | "neutral" | "undefined"];

  return (
    <article className={`min-h-[132px] min-w-0 rounded-[24px] border p-4 shadow-2xl sm:min-h-[150px] sm:rounded-[26px] ${tone}`}>
      <p className="break-words text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400 sm:text-[11px] sm:tracking-[0.18em]">{metric.label}</p>
      <p className="mt-3 break-words text-xl font-black text-white sm:text-2xl">{metric.value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{metric.detail}</p>
    </article>
  );
}

function EvolutionPanel({ evolution }: { evolution: ReturnType<typeof getEvolutionData> }) {
  return (
    <Panel
      eyebrow="Mi evolucion"
      title="Como cambia tu rendimiento en el tiempo"
      description="Compara ultimos intentos contra el historial disponible y evita diagnosticos cuando la muestra todavia es baja."
      icon={LineChart}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniMetric label="Promedio historico" value={formatScore(evolution.historicalAverage)} />
        <MiniMetric label="Ultimos 5" value={formatScore(evolution.lastAverage)} />
        <MiniMetric label="Variacion" value={evolution.variation === null ? "Sin datos" : `${evolution.variation > 0 ? "+" : ""}${evolution.variation} pts`} />
        <MiniMetric label="Tendencia" value={evolution.trend} />
        <MiniMetric label="Semana" value={`${evolution.weeklyCount} sesiones`} />
        <MiniMetric label="Mes" value={`${evolution.monthlyCount} sesiones`} />
        <MiniMetric label="Mejor marca" value={formatScore(evolution.bestScore)} />
        <MiniMetric label="Regularidad" value={evolution.regularity} />
      </div>

      {evolution.series.length === 0 ? (
        <InlineEmpty text="Completa entrenamientos o evaluaciones para activar la linea de evolucion." />
      ) : (
        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4">
          <EvolutionBars series={evolution.series} />
        </div>
      )}
    </Panel>
  );
}

function EvolutionBars({ series }: { series: ReturnType<typeof getEvolutionData>["series"] }) {
  return (
    <div className="flex h-40 max-w-full items-end gap-1 overflow-hidden pb-1 sm:h-44 sm:gap-2">
      {series.map((item) => (
        <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end rounded-full bg-white/5 p-1">
            <div
              className="w-full rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.35)]"
              style={{ height: `${Math.max(item.score ?? 0, 4)}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-zinc-500">{item.score ?? "-"}</span>
        </div>
      ))}
    </div>
  );
}

function RecommendedPlanPanel({ plan }: { plan: ReturnType<typeof getRecommendedPlan> }) {
  return (
    <div id="plan-recomendado">
      <Panel
      eyebrow="Plan recomendado"
      title="Que deberias entrenar despues"
      description="La recomendacion sale de los registros actuales. Si falta informacion, la pantalla lo declara."
      icon={Target}
    >
      <div className="space-y-3">
        <PlanLine label="Diagnostico" value={plan.diagnosis} />
        <PlanLine label="Prioridad 1" value={plan.priority1} />
        <PlanLine label="Prioridad 2" value={plan.priority2} />
        <PlanLine label="Motivo tecnico" value={plan.reason} />
      </div>

      <Link href={plan.href} className="mt-5 flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-2xl bg-[#6fc11f] px-4 font-black text-black transition hover:bg-[#82dc2a] sm:px-5">
        <span>{plan.nextStep}</span>
        <ArrowRight size={20} />
      </Link>
      </Panel>
    </div>
  );
}
function TopicsPanel({ topics }: { topics: TopicMetric[] }) {
  const technicalTopics = buildTechnicalTopics(topics);
  const visibleTopics = topics.filter((topic) => mainTopicOrder.some((label) => label.toLowerCase() === topic.topic.toLowerCase()));

  return (
    <Panel
      eyebrow="Por topicos"
      title="En que jugadas rendis mejor o peor"
      description="Concentra el analisis en los cinco pilares tecnicos: VAR, disputas, faltas tacticas, manos y fuera de juego."
      icon={BarChart3}
    >
      <TopicTechnicalMap topics={technicalTopics} />

      {visibleTopics.length === 0 ? (
        <InlineEmpty text="Todavia no hay topicos suficientes. Completa ejercicios para activar este analisis." />
      ) : (
        <div className="space-y-3">
          {visibleTopics.map((topic) => (
            <TopicRow key={topic.topic} topic={topic} />
          ))}
        </div>
      )}
    </Panel>
  );
}


type TechnicalTopic = {
  label: string;
  shortLabel: string;
  value: number | null;
  attempts: number;
};

function buildTechnicalTopics(topics: TopicMetric[]): TechnicalTopic[] {
  return mainTopicOrder.map((label) => {
    const metric = topics.find((topic) => topic.topic.toLowerCase() === label.toLowerCase());
    return {
      label,
      shortLabel: shortTopicLabel(label),
      value: metric?.accuracy ?? null,
      attempts: metric?.attempts ?? 0,
    };
  });
}

function TopicTechnicalMap({ topics }: { topics: TechnicalTopic[] }) {
  return (
    <section className="mb-5 rounded-[30px] border border-[#6fc11f]/25 bg-[linear-gradient(145deg,#071019,#0b151d_58%,#101820)] p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#6fc11f] sm:text-xs sm:tracking-[0.32em]">
            Dashboard tecnico
          </p>
          <h3 className="mt-2 break-words text-2xl font-black leading-tight text-white">
            Mapa tecnico por topicos
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Vista mobile y desktop de los ejes principales: VAR, fuera de juego, manos, disputas y faltas tacticas.
          </p>
        </div>

        <div className="grid gap-3 min-[390px]:grid-cols-2 xl:grid-cols-5">
          {topics.map((topic) => (
            <div key={topic.label} className="rounded-2xl border border-white/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400">
                  {topic.label}
                </p>
                <span className="text-xs font-black text-[#6fc11f]">{topic.attempts} int.</span>
              </div>
              <p className="mt-2 text-2xl font-black text-white">
                {topic.value === null ? "Sin datos" : `${topic.value}%`}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.35)]"
                  style={{ width: `${Math.max(0, Math.min(topic.value ?? 0, 100))}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-zinc-500">{topic.shortLabel}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
function TopicRow({ topic }: { topic: TopicMetric }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">{topic.topic}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {topic.attempts} intentos - {topic.correct} aciertos - {topic.errors} errores
          </p>
        </div>
        <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-xs font-black text-[#6fc11f]">
          {topic.status}
        </span>
      </div>
      <ProgressBar value={topic.accuracy ?? 0} label={`${formatPercent(topic.accuracy)} acierto`} />
      <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-3">
        <span>Promedio: {formatScore(topic.avgScore)}</span>
        <span>Ultimo: {formatScore(topic.lastScore)}</span>
        <span>Tendencia: {topic.trend}</span>
      </div>
    </div>
  );
}

function CriteriaPanel({ criteria }: { criteria: CriterionMetric[] }) {
  const activeCriteria = criteria.filter((criterion) => ["technical", "restart", "discipline"].includes(criterion.key));
  const futureCriteria = criteria.filter((criterion) => ["interpretation", "justification", "var"].includes(criterion.key));

  return (
    <div id="por-criterio">
      <Panel
      eyebrow="Por criterio"
      title="Que parte de la decision estas resolviendo mal"
      description="Por ahora RefLab muestra solo criterios con logica suficiente: decision tecnica, reanudacion y sancion disciplinaria."
      icon={ListChecks}
    >
      <div className="space-y-3">
        {activeCriteria.map((criterion) => (
          <CriterionRow key={criterion.key} criterion={criterion} />
        ))}
      </div>

      <div className="mt-5 rounded-[26px] border border-yellow-400/20 bg-yellow-400/10 p-4">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-yellow-200">Proximamente</p>
        <p className="mt-2 text-sm leading-6 text-yellow-50/80">
          Estas metricas quedan preparadas, pero no muestran resultados hasta tener una logica tecnica suficientemente confiable.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {futureCriteria.map((criterion) => (
            <FutureCriterionCard key={criterion.key} criterion={criterion} />
          ))}
        </div>
      </div>
      </Panel>
    </div>
  );
}

function FutureCriterionCard({ criterion }: { criterion: CriterionMetric }) {
  return (
    <article className="rounded-2xl border border-yellow-400/20 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-white">{criterion.label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{criterion.description}</p>
        </div>
        <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-200">
          En construccion
        </span>
      </div>
    </article>
  );
}

function CriterionRow({ criterion }: { criterion: CriterionMetric }) {
  const hasData = criterion.accuracy !== null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">{criterion.label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{criterion.description}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-black ${hasData ? "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]" : "border-yellow-400/20 bg-yellow-400/10 text-yellow-200"}`}>
          {criterion.status}
        </span>
      </div>
      {hasData ? (
        <>
          <ProgressBar value={criterion.accuracy ?? 0} label={`${formatPercent(criterion.accuracy)} precision`} />
          <p className="mt-2 text-xs text-zinc-500">{criterion.correct}/{criterion.attempts} aciertos registrados.</p>
        </>
      ) : (
        <InlineEmpty text="Metrica en construccion o sin datos suficientes para este criterio." compact />
      )}
    </div>
  );
}

function ModulesPanel({ modules }: { modules: ModulePerformance[] }) {
  return (
    <section className="max-w-full overflow-hidden rounded-[30px] border border-white/10 bg-[#071019] p-4 shadow-2xl sm:rounded-[34px] sm:p-5 lg:p-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Por modulo</p>
          <h2 className="mt-3 break-words text-2xl font-black leading-tight sm:text-3xl">Cada modulo mide algo distinto</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Cada modulo mide una dimension distinta: decision arbitral, lectura de video, protocolo VAR, comunicacion en ingles y preparacion integral.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <ModuleCard key={module.key} module={module} />
        ))}
      </div>
    </section>
  );
}

function ModuleCard({ module }: { module: ModulePerformance }) {
  const Icon = moduleIcons[module.key] ?? Activity;
  const construction = module.status === "Metricas en construccion";

  return (
    <article className="min-w-0 rounded-[24px] border border-white/10 bg-[#101b24] p-4 sm:rounded-[28px] sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3 sm:gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={25} />
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${construction ? "border-yellow-400/25 bg-yellow-400/10 text-yellow-200" : "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]"}`}>
          {module.status}
        </span>
      </div>

      <h3 className="mt-4 break-words text-lg font-black sm:text-xl">{module.title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{module.description}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {module.metrics.map((metric) => (
          <div key={`${module.key}-${metric.label}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[11px] font-bold text-zinc-500">{metric.label}</p>
            <p className={metric.available ? "mt-1 font-black text-white" : "mt-1 font-black text-zinc-500"}>{metric.value}</p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">{metric.detail}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
function HistoryPanel({
  history,
  historyMode,
  historyResult,
  setHistoryMode,
  setHistoryResult,
}: {
  history: PerformanceItem[];
  historyMode: HistoryMode;
  historyResult: HistoryResult;
  setHistoryMode: (value: HistoryMode) => void;
  setHistoryResult: (value: HistoryResult) => void;
}) {
  return (
    <Panel
      eyebrow="Historial"
      title="Registros concretos de tus intentos"
      description="Muestra fecha, modo, topico, decision tomada, decision correcta cuando existe, score y resultado."
      icon={History}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={historyMode} onChange={(event) => setHistoryMode(event.target.value as HistoryMode)} className="rounded-2xl border border-white/10 bg-[#111b24] px-4 py-3 text-sm font-bold text-white outline-none">
          {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={historyResult} onChange={(event) => setHistoryResult(event.target.value as HistoryResult)} className="rounded-2xl border border-white/10 bg-[#111b24] px-4 py-3 text-sm font-bold text-white outline-none">
          {Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {history.length === 0 ? (
        <InlineEmpty text="No hay registros para estos filtros. Completa mas ejercicios para ampliar el historial." />
      ) : (
        <div className="mt-4 space-y-3">
          {history.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function HistoryItem({ item }: { item: PerformanceItem }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-white">{item.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatDate(item.date)} - {item.modeLabel} - {item.topic}</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-2xl font-black text-[#6fc11f]">{item.score ?? "-"}</p>
          <p className="text-xs font-bold text-zinc-500">{item.result}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-3">
        <InfoChip label="Decision tomada" value={item.selectedDecision ?? "No disponible"} />
        <InfoChip label="Decision correcta" value={item.correctDecision ?? "No disponible"} />
        <InfoChip label="Reanudacion" value={item.selectedRestart ?? "No disponible"} />
        <InfoChip label="Disciplina" value={item.selectedDiscipline ?? "No disponible"} />
        <InfoChip label="Dificultad" value={item.difficulty ?? "No disponible"} />
        <InfoChip label="Fuente" value={item.modeLabel} />
      </div>
    </article>
  );
}

function RankingPanel({ ranking, currentRanking }: { ranking: RankingRow[]; currentRanking?: RankingRow }) {
  return (
    <Panel
      eyebrow="Ranking"
      title="Comparacion comunitaria"
      description="El ranking se calcula separado del analisis personal y usa intentos reales de entrenamiento disponibles."
      icon={Trophy}
    >
      {ranking.length === 0 ? (
        <InlineEmpty text="Ranking disponible cuando existan mas usuarios con actividad registrada." />
      ) : (
        <>
          <div className="rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">Tu posicion</p>
            <p className="mt-2 text-4xl font-black">{currentRanking ? `#${currentRanking.position}` : "Sin datos"}</p>
            <p className="mt-2 text-sm text-zinc-300">
              {currentRanking ? `${currentRanking.avgScore}/100 promedio - RefCard ${currentRanking.refCardId}` : "Completa entrenamientos para aparecer en el ranking."}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            {ranking.slice(0, 6).map((row) => (
              <div key={row.userId} className="grid min-w-0 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:gap-3">
                <p className="font-black text-[#6fc11f]">#{row.position}</p>
                <div>
                  <p className="font-black text-white">{row.name}</p>
                  <p className="text-xs text-zinc-500">RefCard {row.refCardId} - Ultima actividad: {formatDate(row.lastAttempt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-white">{row.avgScore}</p>
                  <p className="text-xs text-zinc-500">{row.tests} eval. / {row.trainings} ent.</p>
                </div>
              </div>
            ))}
          </div>

          <Link href="/ranking" className="mt-4 flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-white transition hover:border-[#6fc11f]/40 hover:text-[#6fc11f]">
            Abrir ranking completo
          </Link>
        </>
      )}
    </Panel>
  );
}

function Panel({ eyebrow, title, description, icon: Icon, children }: { eyebrow: string; title: string; description: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="max-w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#071019] p-4 shadow-2xl sm:rounded-[32px] sm:p-5 lg:p-6">
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f] sm:h-12 sm:w-12"><Icon size={25} /></div>
        <div>
          <p className="break-words text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f] sm:text-xs sm:tracking-[0.3em]">{eyebrow}</p>
          <h2 className="mt-2 break-words text-xl font-black leading-tight sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>;
}

function PlanLine({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">{label}</p><p className="mt-2 text-sm leading-6 text-zinc-300">{value}</p></div>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-zinc-500"><span>{label}</span><span>{Math.min(Math.max(value, 0), 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#6fc11f]" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div></div>;
}

function InlineEmpty({ text, compact = false }: { text: string; compact?: boolean }) {
  return <div className={`mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-center text-sm leading-6 text-zinc-500 ${compact ? "p-4" : "p-6"}`}>{text}</div>;
}

function EmptyState({ title, text, actionHref, actionLabel }: { title: string; text: string; actionHref: string; actionLabel: string }) {
  return <div className="mx-auto w-full max-w-[720px] rounded-[30px] border border-white/10 bg-[#071019] p-5 text-center shadow-2xl sm:rounded-[34px] sm:p-8"><AlertTriangle className="mx-auto h-12 w-12 text-[#6fc11f]" /><h1 className="mt-4 text-3xl font-black">{title}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p><Link href={actionHref} className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-[#6fc11f] px-6 font-black text-black">{actionLabel}</Link></div>;
}

function LoadingCard() {
  return <div className="rounded-[32px] border border-white/10 bg-[#071019] p-8 text-zinc-400"><div className="flex items-center gap-3"><RefreshCw className="h-5 w-5 animate-spin text-[#6fc11f]" /><span>Cargando centro de rendimiento...</span></div></div>;
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/[0.04] px-3 py-2"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</p><p className="mt-1 font-bold text-zinc-300">{value}</p></div>;
}

function shortTopicLabel(label: string) {
  if (label === "Fuera de juego") return "FDJ";
  if (label === "Faltas tacticas") return "FT";
  if (label === "Disputas") return "DISP";
  return label;
}
