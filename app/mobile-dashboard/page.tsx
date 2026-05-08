"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  ClipboardList,
  Flame,
  Megaphone,
  PlaySquare,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

type ExamAnswer = {
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  foul: boolean | null;
  restart: string;
  discipline: string;
  offsideReason?: string;
  handballReason?: string;
  technicalCorrect?: boolean;
  restartCorrect?: boolean;
  disciplineCorrect?: boolean;
  subtypeCorrect?: boolean | null;
  score: number;
};

type ExamResult = {
  id: string;
  user_id: string;
  total_questions: number;
  total_score: number;
  avg_score: number;
  correct_count: number;
  details: ExamAnswer[] | null;
  created_at: string;
};

type NullableMetric = {
  label: string;
  value: number | null;
};

const topicList = [
  { key: "Dispute", label: "Disputas" },
  { key: "Tactical foul", label: "Faltas tácticas" },
  { key: "Offside", label: "Fuera de juego" },
  { key: "Handball", label: "Manos" },
  { key: "VAR", label: "VAR" },
];

export default function MobileDashboardPage() {
  const { user, isLoaded } = useUser();

  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Árbitro";

  useEffect(() => {
    async function loadData() {
      if (!isLoaded) return;

      if (!user) {
        setExamResults([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("exam_results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando mobile dashboard:", error);
        setExamResults([]);
      } else {
        setExamResults((data ?? []) as ExamResult[]);
      }

      setLoading(false);
    }

    loadData();
  }, [isLoaded, user]);

  const examAnswers = useMemo(() => {
    return examResults.flatMap((exam) => exam.details ?? []);
  }, [examResults]);

  const stats = useMemo(() => {
    const totalExams = examResults.length;
    const totalAnswers = examAnswers.length;
    const hasData = totalAnswers > 0;

    const avg = hasData
      ? Math.round(
          examAnswers.reduce((acc, answer) => acc + answer.score, 0) /
            totalAnswers
        )
      : null;

    const lastExam = examResults[0]?.avg_score ?? null;

    return {
      totalExams,
      totalAnswers,
      hasData,
      avg,
      lastExam,
      level: avg === null ? "Sin nivel" : getMobileLevel(avg),
      streak: totalExams > 0 ? Math.min(totalExams, 7) : null,
    };
  }, [examResults, examAnswers]);

  const criterionPerformance: NullableMetric[] = useMemo(() => {
    return [
      {
        label: "Decisión técnica",
        value: percent(examAnswers, "technicalCorrect"),
      },
      {
        label: "Reanudación",
        value: percent(examAnswers, "restartCorrect"),
      },
      {
        label: "Disciplina",
        value: percent(examAnswers, "disciplineCorrect"),
      },
      {
        label: "Subtipo técnico",
        value: percent(examAnswers, "subtypeCorrect"),
      },
    ];
  }, [examAnswers]);

  const topicPerformance: NullableMetric[] = useMemo(() => {
    return topicList.map((topic) => ({
      label: topic.label,
      value: topicAvgReal(examAnswers, topic.key),
    }));
  }, [examAnswers]);

  const strongestCriterion = useMemo(() => {
    return getStrongest(criterionPerformance);
  }, [criterionPerformance]);

  const weakestCriterion = useMemo(() => {
    return getWeakest(criterionPerformance);
  }, [criterionPerformance]);

  const strongestTopic = useMemo(() => {
    return getStrongest(topicPerformance);
  }, [topicPerformance]);

  const weakestTopic = useMemo(() => {
    return getWeakest(topicPerformance);
  }, [topicPerformance]);

  const recommendation = useMemo(() => {
    if (!stats.hasData) {
      return "Rendí un examen arbitral para generar tu diagnóstico.";
    }

    if (weakestTopic && weakestCriterion) {
      return `Trabajá ${weakestTopic.label}, priorizando ${weakestCriterion.label}.`;
    }

    if (weakestCriterion) {
      return `Reforzá ${weakestCriterion.label}.`;
    }

    return "Seguí acumulando exámenes para mejorar el diagnóstico.";
  }, [stats.hasData, weakestTopic, weakestCriterion]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[70vh] rounded-[28px] border border-white/10 bg-[#101820] p-6 text-zinc-400">
          Cargando inicio...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen space-y-5 pb-5">
        <section className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.24),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(75,110,255,0.16),transparent_34%),#0d1720] p-5 shadow-2xl">
          <div className="absolute right-[-45px] top-[-45px] h-36 w-36 rounded-full bg-[#6fc11f]/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <img
              src="/rf-logo.png"
              alt="RF"
              className="h-14 w-14 rounded-full object-cover shadow-[0_0_28px_rgba(111,193,31,0.28)]"
            />

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                RefLab Mobile
              </p>

              <h1 className="mt-1 truncate text-2xl font-black leading-tight">
                {displayName}
              </h1>

              <p className="mt-1 text-sm text-zinc-400">
                Perfil arbitral en progreso.
              </p>
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-[0.9fr_1.1fr] gap-3">
            <div className="rounded-[26px] border border-[#6fc11f]/25 bg-black/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                OVR
              </p>

              <p className="mt-2 text-5xl font-black text-[#6fc11f]">
                {stats.avg ?? "--"}
              </p>

              <p className="mt-1 text-xs font-bold text-zinc-400">
                {stats.level}
              </p>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Próximo foco
              </p>

              <p className="mt-2 text-sm font-bold leading-5 text-zinc-200">
                {recommendation}
              </p>
            </div>
          </div>

          <Link
            href="/training/exam"
            className="relative mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#6fc11f] text-base font-black text-black shadow-[0_0_35px_rgba(111,193,31,0.3)] transition active:scale-[0.98]"
          >
            <Megaphone size={28} />
            RENDIR EXAMEN
          </Link>
        </section>

        {!stats.hasData && (
          <section className="rounded-[28px] border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-5 text-center">
            <p className="text-lg font-black text-white">Sin exámenes todavía</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Cuando completes exámenes arbitrales, tus estadísticas reales
              aparecerán acá.
            </p>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-black">Tu progreso</h2>
            <span className="text-xs font-black text-[#6fc11f]">
              Solo exámenes
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={BarChart3}
              title="Nivel"
              value={stats.hasData ? stats.level : "-"}
              sub={stats.hasData ? "Según examen" : "Sin datos"}
            />

            <MetricCard
              icon={Star}
              title="Promedio"
              value={stats.avg === null ? "-" : `${stats.avg}%`}
              sub={stats.hasData ? "Rendimiento real" : "Sin exámenes"}
            />

            <MetricCard
              icon={Flame}
              title="Racha"
              value={stats.streak === null ? "-" : `${stats.streak}`}
              sub={stats.hasData ? "Exámenes recientes" : "Sin actividad"}
            />

            <MetricCard
              icon={ClipboardList}
              title="Exámenes"
              value={stats.hasData ? stats.totalExams : "-"}
              sub={stats.hasData ? "Registrados" : "Sin registros"}
            />
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Diagnóstico</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Fortalezas y puntos a mejorar
              </p>
            </div>

            <Activity className="text-[#6fc11f]" size={28} />
          </div>

          <div className="mt-5 grid gap-3">
            <DiagnosisCard
              title="Punto fuerte"
              value={strongestCriterion?.label ?? "Sin datos"}
              detail={
                strongestCriterion
                  ? `${strongestCriterion.value}% de precisión`
                  : "Completá exámenes."
              }
              tone="success"
            />

            <DiagnosisCard
              title="A mejorar"
              value={weakestCriterion?.label ?? "Sin datos"}
              detail={
                weakestCriterion
                  ? `${weakestCriterion.value}% de precisión`
                  : "Todavía no hay datos."
              }
              tone="warning"
            />
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Rendimiento</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Precisión por criterio
              </p>
            </div>

            <Link href="/stats" className="text-sm font-black text-[#6fc11f]">
              Ver todas
            </Link>
          </div>

          <div className="mt-5 grid gap-4">
            {criterionPerformance.map((item) => (
              <ProgressRow
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Tópicos</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Perfil técnico arbitral
              </p>
            </div>

            <ShieldCheck className="text-[#6fc11f]" size={28} />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {topicPerformance.map((item) => (
              <TopicCard
                key={item.label}
                title={item.label}
                value={item.value}
              />
            ))}
          </div>

          <Link
            href="/stats"
            className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black transition active:scale-[0.98]"
          >
            Ver detalles por tópico
            <ChevronRight />
          </Link>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <QuickAction
            href="/training/field"
            icon={Target}
            title="Entrenar"
            text="Clips por tópico"
          />

          <QuickAction
            href="/training/video-analysis"
            icon={PlaySquare}
            title="Video"
            text="Análisis técnico"
          />

          <QuickAction
            href="/training/rules-practice"
            icon={BookOpenCheck}
            title="Reglas"
            text="Práctica gratis"
          />

          <QuickAction
            href="/training/rules-exam"
            icon={Trophy}
            title="Examen"
            text="Modo evaluación"
          />
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
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#111b24] p-4 shadow-xl">
      <Icon className="text-[#6fc11f]" size={28} />

      <p className="mt-4 text-sm text-zinc-400">{title}</p>

      <p className="mt-1 text-2xl font-black leading-none">{value}</p>

      <p className="mt-2 text-xs font-bold text-[#6fc11f]">{sub}</p>
    </div>
  );
}

function DiagnosisCard({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "success" | "warning";
}) {
  const style =
    tone === "success"
      ? "border-[#6fc11f]/25 bg-[#6fc11f]/10"
      : "border-yellow-400/25 bg-yellow-400/10";

  const text = tone === "success" ? "text-[#6fc11f]" : "text-yellow-300";

  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <p className={`text-xs font-black uppercase tracking-[0.2em] ${text}`}>
        {title}
      </p>

      <p className="mt-2 text-lg font-black text-white">{value}</p>

      <p className="mt-1 text-xs leading-5 text-zinc-300">{detail}</p>
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
  const safeValue = value ?? 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-bold text-zinc-300">{label}</span>

        <span className="font-black text-[#6fc11f]">
          {value === null ? "-" : `${value}%`}
        </span>
      </div>

      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-3 rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.45)]"
          style={{ width: `${Math.min(safeValue, 100)}%` }}
        />
      </div>
    </div>
  );
}

function TopicCard({
  title,
  value,
}: {
  title: string;
  value: number | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <p className="text-sm font-bold text-zinc-300">{title}</p>

      <p className="mt-2 text-3xl font-black text-[#6fc11f]">
        {value === null ? "-" : `${value}`}
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        {value === null ? "Sin datos" : "puntos"}
      </p>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5 transition active:scale-[0.98]"
    >
      <Icon className="text-[#6fc11f]" size={30} />

      <p className="mt-4 text-lg font-black">{title}</p>

      <p className="mt-1 text-sm text-zinc-400">{text}</p>
    </Link>
  );
}

function topicAvgReal(answers: ExamAnswer[], topic: string) {
  const filtered = answers.filter((answer) => answer.topic === topic);

  if (filtered.length === 0) return null;

  return Math.round(
    filtered.reduce((acc, item) => acc + item.score, 0) / filtered.length
  );
}

function percent(answers: ExamAnswer[], key: keyof ExamAnswer) {
  const valid = answers.filter((answer) => typeof answer[key] === "boolean");

  if (valid.length === 0) return null;

  return Math.round(
    (valid.filter((answer) => answer[key] === true).length / valid.length) *
      100
  );
}

function getStrongest(items: NullableMetric[]) {
  const valid = items.filter((item): item is { label: string; value: number } => {
    return typeof item.value === "number";
  });

  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => b.value - a.value)[0];
}

function getWeakest(items: NullableMetric[]) {
  const valid = items.filter((item): item is { label: string; value: number } => {
    return typeof item.value === "number";
  });

  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => a.value - b.value)[0];
}

function getMobileLevel(avg: number) {
  if (avg >= 90) return "Elite";
  if (avg >= 80) return "Avanzado";
  if (avg >= 70) return "Intermedio";
  return "Inicial";
}