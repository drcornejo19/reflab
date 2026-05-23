"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
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
} from "@/lib/performance";

type DashboardData = {
  attempts: AttemptRecord[];
  examResults: ExamResultRecord[];
  rulesResults: RulesExamResultRecord[];
};

const emptyData: DashboardData = {
  attempts: [],
  examResults: [],
  rulesResults: [],
};

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
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
  const topics = useMemo(() => getTopicPerformance(dataset.items).slice(0, 5), [dataset.items]);
  const criteria = useMemo(() => getCriterionPerformance(dataset.items), [dataset.items]);
  const plan = useMemo(() => getRecommendedPlan(summary), [summary]);

  if (!isLoaded || loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
          Cargando dashboard...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="w-full space-y-5 rounded-[24px] border border-white/10 bg-[#101820] p-4 shadow-2xl sm:p-5 lg:mx-auto lg:max-w-[1050px]">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#0b131b] p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              REFLAB DASHBOARD
            </p>
            <h1 className="mt-2 text-3xl font-black">Analisis arbitral</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Resumen tecnico de tu rendimiento arbitral, fortalezas, puntos
              criticos y plan recomendado.
            </p>
          </div>

          <Link
            href="/training/exam"
            className="rounded-2xl bg-[#6fc11f] px-6 py-4 text-center font-black text-black transition hover:bg-[#82dc2a]"
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

        {!summary.hasData && (
          <section className="rounded-3xl border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-6 text-center">
            <p className="text-lg font-black text-white">Sin datos suficientes</p>
            <p className="mt-2 text-sm text-zinc-400">
              Completa entrenamientos o evaluaciones para activar el diagnostico de RefLab.
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

        <section className="rounded-3xl border border-white/10 bg-[#111b24] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Lectura tecnica del rendimiento</h2>
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

function TopMetric({
  title,
  value,
  detail,
  featured = false,
}: {
  title: string;
  value: string | number;
  detail?: string;
  featured?: boolean;
}) {
  return (
    <div className="border-r border-b border-white/10 p-4 last:border-r-0 md:border-b-0">
      <p className="text-[11px] text-zinc-400">{title}</p>
      <p className="mt-3 text-2xl font-black sm:text-3xl">{value}</p>
      {detail && (
        <p className={featured ? "mt-1 text-xs font-bold text-[#6fc11f]" : "mt-1 text-xs text-zinc-500"}>
          {detail}
        </p>
      )}
    </div>
  );
}

function AnalysisCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "success" | "danger" | "warning";
}) {
  const style = {
    success: "border-[#6fc11f]/30 bg-[#6fc11f]/10",
    danger: "border-red-500/25 bg-red-500/10",
    warning: "border-yellow-400/25 bg-yellow-400/10",
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 ${style}`}>
      <h2 className="text-lg font-black">{title}</h2>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-300">
        {items.map((item, index) => (
          <li key={`${title}-${index}`} className="flex gap-2">
            <span className="text-[#6fc11f]">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
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
        <span>
          {value}
          {suffix}
        </span>
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

