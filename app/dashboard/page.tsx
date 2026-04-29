"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Attempt = {
  id: string;
  score: number;
  clip_title: string | null;
  topic: string | null;
  difficulty: string | null;
  created_at: string;
  technical_correct: boolean | null;
  restart_correct: boolean | null;
  discipline_correct: boolean | null;
  var_correct: boolean | null;
};

type Criterion = {
  label: string;
  value: number;
};

export default function DashboardPage() {
  const { user, isLoaded } = useUser();

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!isLoaded || !user) return;

      const { data, error } = await supabase
        .from("attempts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando dashboard:", error);
        setAttempts([]);
      } else {
        setAttempts(data ?? []);
      }

      setLoading(false);
    }

    loadData();
  }, [isLoaded, user]);

  const stats = useMemo(() => {
    const total = attempts.length;

    const avg =
      total > 0
        ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / total)
        : 0;

    const last = attempts[0]?.score ?? 0;

    const initialPrecision = percent(attempts, "technical_correct");
    const disciplinePrecision = percent(attempts, "discipline_correct");
    const varPrecision = percent(attempts, "var_correct");

    return {
      total,
      avg,
      last,
      initialPrecision,
      disciplinePrecision,
      varPrecision,
      streak: Math.min(total, 7),
    };
  }, [attempts]);

  const criteria: Criterion[] = useMemo(() => {
    return [
      
      { label: "Manos", value: topicAvg(attempts, "Handball") },
      { label: "Faltas tácticas", value: topicAvg(attempts, "SPA") },
      { label: "Disputas", value: percent(attempts, "technical_correct") },
      { label: "Fuera de juego", value: topicAvg(attempts, "Offside") },
      { label: "VAR", value: percent(attempts, "var_correct") },
      
    ];
  }, [attempts]);

  const criterionStats = useMemo(() => {
    return [
      { label: "Decisión técnica", value: percent(attempts, "technical_correct") },
      { label: "Reanudación", value: percent(attempts, "restart_correct") },
      { label: "Disciplina", value: percent(attempts, "discipline_correct") },
      { label: "Criterio VAR", value: percent(attempts, "var_correct") },
    ];
  }, [attempts]);

  const weakest = useMemo(() => {
    if (attempts.length === 0) return null;
    return [...criterionStats].sort((a, b) => a.value - b.value)[0];
  }, [criterionStats, attempts.length]);

  const strongest = useMemo(() => {
    if (attempts.length === 0) return null;
    return [...criterionStats].sort((a, b) => b.value - a.value)[0];
  }, [criterionStats, attempts.length]);

  const recommendation = useMemo(() => {
    if (!weakest) return "Completá ejercicios para generar una recomendación automática.";

    if (weakest.value < 60) {
      return `Reforzar ${weakest.label}. Es tu criterio más bajo y conviene entrenarlo con clips simples antes de avanzar.`;
    }

    if (weakest.value < 80) {
      return `Seguí trabajando ${weakest.label}. Estás cerca de consolidar ese criterio.`;
    }

    return "Buen rendimiento general. Podés avanzar hacia clips más complejos o modo examen.";
  }, [weakest]);

  const nextProgress = Math.min(Math.round((stats.total / 18) * 100), 100);

  return (
    <AppShell>
      <div className="mx-auto max-w-[760px] space-y-4 rounded-[28px] border border-white/10 bg-[#101820] p-5 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Resumen de tu rendimiento
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#1b242d] px-4 py-3">
              <p className="text-xs text-zinc-400">🔥 Racha 7 días</p>
              <p className="text-sm font-black">{stats.streak}</p>
            </div>

            <Link
              href="/training"
              className="rounded-xl bg-[#6fc11f] px-5 py-4 text-sm font-black text-black transition hover:bg-[#82dc2a]"
            >
              Practicar ahora
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1fr] overflow-hidden rounded-2xl border border-white/10 bg-[#17212a]">
          <TopMetric
            title="Puntuación general"
            value={stats.avg || 0}
            suffix=""
            detail={stats.avg >= 85 ? "Excelente" : "En progreso"}
            featured
          />

          <TopMetric title="Ejercicios realizados" value={stats.total} />

          <TopMetric
            title="Precisión técnica"
            value={stats.initialPrecision}
            suffix="%"
          />

          <TopMetric
            title="Precisión disciplinaria"
            value={stats.disciplinePrecision}
            suffix="%"
          />

          <TopMetric title="Precisión VAR" value={stats.varPrecision} suffix="%" />
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#111b24] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-black">Rendimiento por categoría</h2>
            <span className="text-xs font-black text-[#6fc11f]">Ver todas</span>
          </div>

          <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr]">
            <div className="flex items-center justify-center">
              <RadarChart criteria={criteria} />
            </div>

            <div className="space-y-3">
              <InsightMini
                title="Fortalezas"
                icon="🎯"
                items={[
                  strongest?.label ?? "Sin datos",
                  stats.varPrecision >= 80 ? "Decisiones VAR" : "Criterio en desarrollo",
                  stats.disciplinePrecision >= 80 ? "Disciplina" : "Sanción disciplinaria",
                ]}
                color="green"
              />

              <InsightMini
                title="A mejorar"
                icon="↗"
                items={[
                  weakest?.label ?? "Sin datos",
                  recommendation,
                ]}
                color="orange"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-black text-yellow-300">
                Sigue entrenando para alcanzar el siguiente nivel
              </h2>
              <p className="mt-1 text-xs text-zinc-300">
                Estás en el top estimado según tu rendimiento actual.
              </p>
            </div>

            <div className="text-4xl">🏆</div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-400">Nivel actual</p>
              <p className="font-black">{getLevel(stats.avg)}</p>
            </div>

            <div className="flex-1">
              <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                <span>{nextProgress}%</span>
                <span>100%</span>
              </div>
              <div className="h-3 rounded-full bg-white/10">
                <div
                  className="h-3 rounded-full bg-[#4b6eff]"
                  style={{ width: `${nextProgress}%` }}
                />
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs text-zinc-400">Siguiente nivel</p>
              <p className="font-black">Elite</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <BottomInsight
            title="Punto crítico"
            value={weakest?.label ?? "Sin datos"}
            detail={
              weakest
                ? `${weakest.value}% de precisión. Requiere foco.`
                : "Completá ejercicios."
            }
            tone="danger"
          />

          <BottomInsight
            title="Punto fuerte"
            value={strongest?.label ?? "Sin datos"}
            detail={
              strongest
                ? `${strongest.value}% de precisión.`
                : "Todavía no hay datos."
            }
            tone="success"
          />

          <BottomInsight
            title="Recomendación"
            value="Plan automático"
            detail={recommendation}
            tone="warning"
          />
        </section>
      </div>
    </AppShell>
  );
}

function TopMetric({
  title,
  value,
  suffix = "",
  detail,
  featured = false,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  detail?: string;
  featured?: boolean;
}) {
  return (
    <div className="border-r border-white/10 p-4 last:border-r-0">
      <p className="text-[11px] text-zinc-400">{title}</p>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-3xl font-black">
            {value}
            {suffix}
          </p>
          {detail && (
            <p
              className={`mt-1 text-xs font-bold ${
                featured ? "text-[#6fc11f]" : "text-zinc-500"
              }`}
            >
              {detail}
            </p>
          )}
        </div>

        {featured && <span className="text-3xl text-[#6fc11f]">⌁</span>}
      </div>
    </div>
  );
}

function RadarChart({ criteria }: { criteria: Criterion[] }) {
  const size = 260;
  const center = size / 2;
  const radius = 82;

  const points = criteria.map((item, index) => {
    const angle = (Math.PI * 2 * index) / criteria.length - Math.PI / 2;
    const r = radius * Math.max(item.value, 20) / 100;

    return {
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      labelX: center + Math.cos(angle) * (radius + 32),
      labelY: center + Math.sin(angle) * (radius + 32),
      ...item,
    };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-[260px] w-full max-w-[300px]">
      {[1, 0.75, 0.5, 0.25].map((scale) => {
        const ring = criteria
          .map((_, index) => {
            const angle = (Math.PI * 2 * index) / criteria.length - Math.PI / 2;
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
            stroke="rgba(255,255,255,0.12)"
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
            stroke="rgba(255,255,255,0.12)"
          />
        );
      })}

      <polygon
        points={polygon}
        fill="rgba(111,193,31,0.45)"
        stroke="#b7ff8a"
        strokeWidth="2"
      />

      {points.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="4" fill="#ffffff" />
          <text
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="10"
            fill="rgba(255,255,255,0.72)"
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function InsightMini({
  title,
  items,
  icon,
  color,
}: {
  title: string;
  items: string[];
  icon: string;
  color: "green" | "orange";
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121f28] p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black">{title}</h3>
        <span className="text-4xl">{icon}</span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-zinc-300">
        {items.slice(0, 3).map((item, index) => (
  <li key={`${item}-${index}`} className="flex gap-2">
            <span className={color === "green" ? "text-[#6fc11f]" : "text-orange-400"}>
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BottomInsight({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "danger" | "success" | "warning";
}) {
  const style = {
    danger: "border-red-500/20 bg-red-500/10 text-red-300",
    success: "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]",
    warning: "border-yellow-500/20 bg-yellow-500/10 text-yellow-300",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${style}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.25em]">
        {title}
      </p>
      <p className="mt-2 text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-300">{detail}</p>
    </div>
  );
}

function percent(arr: Attempt[], key: keyof Attempt) {
  const valid = arr.filter((a) => typeof a[key] === "boolean");
  if (valid.length === 0) return 0;

  return Math.round(
    (valid.filter((a) => a[key] === true).length / valid.length) * 100
  );
}

function topicAvg(arr: Attempt[], topic: string) {
  const filtered = arr.filter((a) => a.topic === topic);
  if (filtered.length === 0) return 55;

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