"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

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

type Metric = {
  label: string;
  value: number;
};

const topicList = [
  { key: "Handball", label: "Manos" },
  { key: "Tactical foul", label: "Faltas tácticas" },
  { key: "Dispute", label: "Disputas" },
  { key: "Offside", label: "Fuera de juego" },
  { key: "VAR", label: "VAR" },
];

export default function DashboardPage() {
  const { user, isLoaded } = useUser();

  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!isLoaded || !user) return;

      const { data, error } = await supabase
        .from("exam_results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando dashboard:", error);
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

    const avg =
      totalAnswers > 0
        ? Math.round(
            examAnswers.reduce((acc, item) => acc + item.score, 0) /
              totalAnswers
          )
        : 0;

    const lastExam = examResults[0]?.avg_score ?? 0;

    return {
      totalExams,
      totalAnswers,
      avg,
      lastExam,
      level: getLevel(avg),
    };
  }, [examResults, examAnswers]);

  const criteriaStats: Metric[] = useMemo(() => {
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

  const topicStats: Metric[] = useMemo(() => {
    return topicList.map((topic) => ({
      label: topic.label,
      value: topicAvg(examAnswers, topic.key),
    }));
  }, [examAnswers]);

  const strongestCriterion = useMemo(() => {
    if (examAnswers.length === 0) return null;
    return [...criteriaStats].sort((a, b) => b.value - a.value)[0];
  }, [criteriaStats, examAnswers.length]);

  const weakestCriterion = useMemo(() => {
    if (examAnswers.length === 0) return null;
    return [...criteriaStats].sort((a, b) => a.value - b.value)[0];
  }, [criteriaStats, examAnswers.length]);

  const strongestTopic = useMemo(() => {
    const withData = topicStats.filter((item) => item.value > 0);
    if (withData.length === 0) return null;
    return [...withData].sort((a, b) => b.value - a.value)[0];
  }, [topicStats]);

  const weakestTopic = useMemo(() => {
    const withData = topicStats.filter((item) => item.value > 0);
    if (withData.length === 0) return null;
    return [...withData].sort((a, b) => a.value - b.value)[0];
  }, [topicStats]);

  const recommendation = useMemo(() => {
    return buildRecommendation(weakestCriterion, weakestTopic);
  }, [weakestCriterion, weakestTopic]);

  if (loading) {
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
            <h1 className="mt-2 text-3xl font-black">Análisis arbitral</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Resumen técnico de tu rendimiento arbitral, fortalezas, puntos
              críticos y plan recomendado.
            </p>
          </div>

          <Link
            href="/training/exam"
            className="rounded-2xl bg-[#6fc11f] px-6 py-4 text-center font-black text-black transition hover:bg-[#82dc2a]"
          >
            Rendir examen
          </Link>
        </header>

        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-[#17212a] md:grid-cols-4">
          <TopMetric
            title="Puntuación general"
            value={`${stats.avg}/100`}
            detail={stats.level}
            featured
          />

          <TopMetric title="Exámenes" value={stats.totalExams} />

          <TopMetric title="Respuestas evaluadas" value={stats.totalAnswers} />

          <TopMetric title="Último examen" value={`${stats.lastExam}/100`} />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <AnalysisCard
            title="Fortalezas"
            tone="success"
            items={[
              `Mejor criterio: ${strongestCriterion?.label ?? "Sin datos"} ${
                strongestCriterion ? `(${strongestCriterion.value}%)` : ""
              }`,
              `Mejor tópico: ${strongestTopic?.label ?? "Sin datos"} ${
                strongestTopic ? `(${strongestTopic.value}/100)` : ""
              }`,
              getStrengthMessage(strongestCriterion),
            ]}
          />

          <AnalysisCard
            title="A mejorar"
            tone="danger"
            items={[
              `Criterio más bajo: ${weakestCriterion?.label ?? "Sin datos"} ${
                weakestCriterion ? `(${weakestCriterion.value}%)` : ""
              }`,
              `Tópico más bajo: ${weakestTopic?.label ?? "Sin datos"} ${
                weakestTopic ? `(${weakestTopic.value}/100)` : ""
              }`,
              getWeaknessMessage(weakestCriterion),
            ]}
          />

          <AnalysisCard
            title="Plan recomendado"
            tone="warning"
            items={recommendation}
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#111b24] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">Perfil arbitral tipo jugador</h2>
            <span className="text-xs font-black text-[#6fc11f]">
              Rendimiento por tópico
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
            <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-black/20 p-4">
              <RadarChart criteria={topicStats} />
            </div>

            <div className="space-y-4">
              {topicStats.map((item) => (
                <ProgressRow
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  suffix="/100"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          <Panel title="Precisión por criterio">
            <div className="space-y-4">
              {criteriaStats.map((item) => (
                <ProgressRow
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  suffix="%"
                />
              ))}
            </div>
          </Panel>

          <Panel title="Lectura técnica del rendimiento">
            <div className="grid gap-3">
              <InsightBlock
                title="Diagnóstico"
                text={
                  examAnswers.length === 0
                    ? "Todavía no hay datos suficientes. Rendí al menos un examen arbitral para generar diagnóstico."
                    : `Tu rendimiento actual es ${stats.avg}/100. El área más fuerte es ${
                        strongestCriterion?.label ?? "sin datos"
                      } y el principal foco de mejora es ${
                        weakestCriterion?.label ?? "sin datos"
                      }.`
                }
              />

              <InsightBlock
                title="Próximo foco"
                text={
                  weakestTopic
                    ? `Trabajá clips de ${weakestTopic.label}, priorizando el criterio de ${
                        weakestCriterion?.label ?? "decisión técnica"
                      }.`
                    : "Rendí exámenes con distintos tópicos para que RefLab pueda detectar patrones reales."
                }
              />
            </div>
          </Panel>
        </section>
      </div>
    </AppShell>
  );
}

function buildRecommendation(
  weakestCriterion: Metric | null,
  weakestTopic: Metric | null
) {
  if (!weakestCriterion || !weakestTopic) {
    return [
      "Rendí al menos un examen completo.",
      "Buscá variedad de clips: manos, disputas, offside, faltas tácticas y VAR.",
      "El sistema necesita datos reales para detectar patrones.",
    ];
  }

  const topic = weakestTopic.label;
  const criterion = weakestCriterion.label;

  if (criterion === "Subtipo técnico" && topic === "Fuera de juego") {
    return [
      "Entrenar fuera de juego con foco en el motivo técnico.",
      "Diferenciar: interferir en el juego, interferir en el adversario y sacar ventaja.",
      "Revisar impacto del jugador en posición adelantada sobre la acción.",
    ];
  }

  if (criterion === "Subtipo técnico" && topic === "Manos") {
    return [
      "Entrenar manos con foco en clasificación técnica.",
      "Diferenciar mano deliberada, mano de bloqueo e inmediatez.",
      "Analizar posición del brazo, movimiento corporal y consecuencia de la acción.",
    ];
  }

  if (criterion === "Disciplina") {
    return [
      `Entrenar ${topic} con foco disciplinario.`,
      "Separar imprudente, temeraria, SPA, DOGSO y fuerza excesiva.",
      "Después de decidir falta/no falta, evaluar consecuencia táctica y gravedad.",
    ];
  }

  if (criterion === "Reanudación") {
    return [
      `Entrenar ${topic} con foco en reanudaciones.`,
      "Asociar cada decisión con TLD, TLI, penal, seguir el juego o balón a tierra.",
      "Revisar especialmente offside, manos y faltas dentro del área.",
    ];
  }

  return [
    `Entrenar ${topic} con foco en decisión técnica.`,
    "Evaluar intensidad, punto de contacto, disputa normal vs infracción.",
    "Primero resolver si hay infracción; después reanudación y disciplina.",
  ];
}

function getStrengthMessage(metric: Metric | null) {
  if (!metric) return "Todavía no hay datos suficientes.";
  if (metric.value >= 85) return "Criterio consolidado. Podés subir dificultad.";
  if (metric.value >= 70) return "Buen criterio, pero todavía puede afinarse.";
  return "Aún no hay una fortaleza clara.";
}

function getWeaknessMessage(metric: Metric | null) {
  if (!metric) return "Sin datos suficientes.";
  if (metric.value < 60) return "Prioridad alta de entrenamiento.";
  if (metric.value < 80) return "Área en desarrollo.";
  return "No hay debilidades críticas.";
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
      <p className="mt-3 text-3xl font-black">{value}</p>
      {detail && (
        <p
          className={
            featured
              ? "mt-1 text-xs font-bold text-[#6fc11f]"
              : "mt-1 text-xs text-zinc-500"
          }
        >
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

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
      <h2 className="mb-5 text-xl font-black">{title}</h2>
      {children}
    </section>
  );
}

function ProgressRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span>
          {value}
          {suffix}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[#6fc11f]"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function InsightBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-sm font-black text-[#6fc11f]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p>
    </div>
  );
}

function RadarChart({ criteria }: { criteria: Metric[] }) {
  const size = 310;
  const center = size / 2;
  const radius = 98;

  const points = criteria.map((item, index) => {
    const angle = (Math.PI * 2 * index) / criteria.length - Math.PI / 2;
    const r = (radius * Math.max(item.value, 8)) / 100;

    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      labelX: center + Math.cos(angle) * (radius + 42),
      labelY: center + Math.sin(angle) * (radius + 42),
      ...item,
    };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-[320px] w-full max-w-[380px]"
    >
      {[1, 0.75, 0.5, 0.25].map((scale) => {
        const ring = criteria
          .map((_, index) => {
            const angle =
              (Math.PI * 2 * index) / criteria.length - Math.PI / 2;

            return `${center + Math.cos(angle) * radius * scale},${
              center + Math.sin(angle) * radius * scale
            }`;
          })
          .join(" ");

        return (
          <polygon
            key={scale}
            points={ring}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1"
          />
        );
      })}

      {criteria.map((_, index) => {
        const angle = (Math.PI * 2 * index) / criteria.length - Math.PI / 2;

        return (
          <line
            key={index}
            x1={center}
            y1={center}
            x2={center + Math.cos(angle) * radius}
            y2={center + Math.sin(angle) * radius}
            stroke="rgba(255,255,255,0.14)"
          />
        );
      })}

      <polygon
        points={polygon}
        fill="rgba(111,193,31,0.45)"
        stroke="#b7ff8a"
        strokeWidth="2.5"
      />

      {points.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" />

          <text
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fontWeight="800"
            fill="rgba(255,255,255,0.78)"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function percent(arr: ExamAnswer[], key: keyof ExamAnswer) {
  const valid = arr.filter((item) => typeof item[key] === "boolean");

  if (valid.length === 0) return 0;

  return Math.round(
    (valid.filter((item) => item[key] === true).length / valid.length) * 100
  );
}

function topicAvg(arr: ExamAnswer[], topic: string) {
  const filtered = arr.filter((item) => item.topic === topic);

  if (filtered.length === 0) return 0;

  return Math.round(
    filtered.reduce((acc, item) => acc + item.score, 0) / filtered.length
  );
}

function getLevel(avg: number) {
  if (avg >= 90) return "Elite";
  if (avg >= 80) return "Avanzado";
  if (avg >= 70) return "Intermedio";
  return "Inicial";
}
