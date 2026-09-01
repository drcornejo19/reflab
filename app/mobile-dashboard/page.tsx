"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { PageShellFallback } from "@/components/PageShellFallback";
import { getDisciplineAction, getDisciplineDefinition } from "@/lib/discipline";
import {
  formatPercent,
  getSportRecommendedPlan,
} from "@/lib/performanceBySport";
import {
  buildCanonicalPerformanceSummary,
  type CanonicalPerformanceSummaryModel,
} from "@/lib/performance/canonicalSummaryModel";
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Flame,
  Megaphone,
  Star,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function MobileDashboardPage() {
  return (
    <Suspense fallback={<PageShellFallback message="Cargando inicio mobile..." />}>
      <MobileDashboardPageContent />
    </Suspense>
  );
}

function MobileDashboardPageContent() {
  const { user, isLoaded } = useUser();
  const { currentDiscipline: sportType } = useDiscipline();
  const theme = getDisciplineDefinition(sportType).theme;
  const [data, setData] = useState<CanonicalPerformanceSummaryModel | null>(null);
  const [weeklyTrainingUsed, setWeeklyTrainingUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Arbitro";

  useEffect(() => {
    async function loadData() {
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
              ? "Tu identidad debe estar vinculada para consultar el panel."
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

    void loadData();
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
  const criteria = useMemo(() => performance.criteria.slice(0, 4), [performance.criteria]);
  const topics = useMemo(() => performance.topics.slice(0, 3), [performance.topics]);
  const plan = useMemo(
    () => getSportRecommendedPlan(summary, sportType),
    [summary, sportType]
  );

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[70vh] rounded-[28px] border border-white/10 bg-[#101820] p-6 text-zinc-400">
          Cargando inicio...
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <div className="min-h-[70vh] rounded-[28px] border border-red-500/25 bg-red-500/10 p-6 text-red-200">
          {loadError}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen w-full max-w-full space-y-5 overflow-hidden pb-2">

        <section
          className="rounded-[30px] border border-white/10 p-4 shadow-2xl"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), #0d1720`,
          }}
        >
          <p
            className="text-xs font-black uppercase tracking-[0.28em]"
            style={{ color: theme.accent }}
          >
            RefLab Mobile
          </p>
          <h1 className="mt-2 text-xl font-black leading-tight">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Diagnostico rapido por disciplina, sincronizado con tu panel principal.
          </p>

          <div className="mt-5 grid grid-cols-[0.9fr_1.1fr] gap-3">
            <div
              className="rounded-[24px] border bg-black/30 p-4"
              style={{ borderColor: theme.border }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                OVR
              </p>
              <p className="mt-2 text-5xl font-black" style={{ color: theme.accent }}>
                {summary.avgScore ?? "--"}
              </p>
              <p className="mt-1 text-xs font-bold text-zinc-400">
                {summary.status}
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Proximo foco
              </p>
              <p className="mt-2 text-sm font-bold leading-5 text-zinc-200">
                {plan.priority1}
              </p>
            </div>
          </div>

          <Link
            href={getDisciplineAction(sportType, "primaryTraining")}
            className="mt-5 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl px-4 text-sm font-black transition active:scale-[0.98]"
            style={{
              backgroundColor: theme.button,
              color: theme.onAccent,
              boxShadow: `0 0 35px ${theme.glow}`,
            }}
          >
            <Megaphone size={24} />
            ENTRENAR
          </Link>
        </section>

        {!summary.hasData ? (
          <section
            className="rounded-[28px] border border-dashed p-5 text-center"
            style={{ borderColor: theme.border, backgroundColor: theme.accentSoft }}
          >
            <p className="text-lg font-black text-white">Sin actividad todavia</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Cuando completes evaluaciones oficiales de esta disciplina, tus metricas apareceran aca. El Entrenamiento se contabiliza por separado.
            </p>
          </section>
        ) : null}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-black">Tu progreso</h2>
            <span className="text-xs font-black" style={{ color: theme.accent }}>
              {summary.totalAttempts} intentos oficiales
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={BarChart3}
              title="Promedio"
              value={summary.avgScore === null ? "-" : `${summary.avgScore}%`}
              sub="Rendimiento real"
            />
            <MetricCard
              icon={Star}
              title="Mejor"
              value={summary.bestScore === null ? "-" : `${summary.bestScore}%`}
              sub="Pico individual"
            />
            <MetricCard
              icon={Flame}
              title="Entrenamiento semanal"
              value={weeklyTrainingUsed || "-"}
              sub="Practicas separadas"
            />
            <MetricCard
              icon={ClipboardList}
              title="Evaluaciones"
              value={summary.totalEvaluations || "-"}
              sub="Resultados cerrados"
            />
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[#101820] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Precision por criterio</h2>
            <Link
              href={`/performance?sport=${sportType}`}
              className="inline-flex items-center gap-1 text-xs font-black"
              style={{ color: theme.accent }}
            >
              Ver mas
              <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {criteria.map((criterion) => (
              <ProgressRow
                key={criterion.key}
                label={criterion.label}
                value={criterion.accuracy}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[#101820] p-4">
          <h2 className="text-lg font-black">Topicos con actividad</h2>
          <div className="mt-3 space-y-3">
            {topics.length === 0 ? (
              <p className="text-sm text-zinc-500">Sin datos por topico.</p>
            ) : (
              topics.map((topic) => (
                <ProgressRow
                  key={topic.topic}
                  label={topic.topic}
                  value={topic.accuracy}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  sub,
}: {
  icon: LucideIcon;
  title: string;
  value: string | number;
  sub: string;
}) {
  const { currentDiscipline } = useDiscipline();
  const theme = getDisciplineDefinition(currentDiscipline).theme;

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#101820] p-4">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon size={18} style={{ color: theme.accent }} />
        <p className="text-[10px] font-black uppercase tracking-[0.25em]">
          {title}
        </p>
      </div>
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
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
    </div>
  );
}
