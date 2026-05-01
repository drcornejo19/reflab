"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Flame,
  ShieldCheck,
  Star,
  Target,
  Trophy,
  Megaphone,
} from "lucide-react";

type Attempt = {
  id: string;
  score: number;
  topic: string | null;
  created_at: string;
  technical_correct: boolean | null;
  restart_correct: boolean | null;
  discipline_correct: boolean | null;
  var_correct: boolean | null;
};

export default function MobileDashboardPage() {
  const { user, isLoaded } = useUser();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!isLoaded) return;

      if (!user) {
        setAttempts([]);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("attempts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setAttempts((data ?? []) as Attempt[]);
      setLoading(false);
    }

    loadData();
  }, [isLoaded, user]);

  const stats = useMemo(() => {
    const total = attempts.length;
    const hasAttempts = total > 0;

    const avg = hasAttempts
      ? Math.round(attempts.reduce((acc, a) => acc + a.score, 0) / total)
      : null;

    return {
      total,
      hasAttempts,
      avg,
      streak: hasAttempts ? Math.min(total, 7) : null,
    };
  }, [attempts]);

  const topicPerformance = useMemo(() => {
    return [
      { label: "Disputas", value: topicAvgReal(attempts, "Dispute") },
      { label: "Faltas tácticas", value: topicAvgReal(attempts, "Tactical foul") },
      { label: "Fuera de juego", value: topicAvgReal(attempts, "Offside") },
      { label: "Manos", value: topicAvgReal(attempts, "Handball") },
      { label: "VAR", value: topicAvgReal(attempts, "VAR") },
    ];
  }, [attempts]);

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
      <div className="min-h-screen space-y-5 px-0 pb-4">
        <section className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.22),transparent_38%),#0d1720] p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <img
              src="/rf-logo.png"
              alt="RF"
              className="h-14 w-14 rounded-full object-cover shadow-[0_0_28px_rgba(111,193,31,0.25)]"
            />

            <div>
              <h1 className="text-2xl font-black leading-tight">
                ¡Bienvenido, Árbitro!
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                Entrená tus decisiones.
              </p>
            </div>
          </div>

          <Link
            href="/training"
            className="mt-5 flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#6fc11f] text-base font-black text-black shadow-[0_0_35px_rgba(111,193,31,0.28)]"
          >
            <Megaphone size={28} />
            PRACTICAR AHORA
          </Link>
        </section>

        {!stats.hasAttempts && (
          <section className="rounded-[28px] border border-dashed border-[#6fc11f]/25 bg-[#6fc11f]/5 p-5 text-center">
            <p className="text-lg font-black text-white">Sin actividad todavía</p>
            <p className="mt-2 text-sm text-zinc-400">
              Cuando completes ejercicios, tus estadísticas reales aparecerán acá.
            </p>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xl font-black">Tu progreso</h2>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              icon={BarChart3}
              title="Nivel"
              value={stats.hasAttempts ? getMobileLevel(stats.avg ?? 0) : "-"}
              sub={stats.hasAttempts ? "Según rendimiento" : "Sin datos"}
            />

            <MetricCard
              icon={Star}
              title="Promedio"
              value={stats.avg === null ? "-" : `${stats.avg}%`}
              sub={stats.hasAttempts ? "Rendimiento real" : "Sin intentos"}
            />

            <MetricCard
              icon={Flame}
              title="Racha actual"
              value={stats.streak === null ? "-" : `${stats.streak} días`}
              sub={stats.hasAttempts ? "Actividad registrada" : "Sin actividad"}
            />

            <MetricCard
              icon={ClipboardList}
              title="Ejercicios"
              value={stats.hasAttempts ? stats.total : "-"}
              sub={stats.hasAttempts ? "Registrados" : "Sin registros"}
            />
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">Rendimiento</h2>
              <p className="mt-1 text-sm text-zinc-500">Resumen por criterio</p>
            </div>

            <Link href="/stats" className="text-sm font-black text-[#6fc11f]">
              Ver todas
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {topicPerformance.map((item) => (
              <ProgressRow key={item.label} label={item.label} value={item.value} />
            ))}
          </div>
        </section>

        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <h2 className="text-xl font-black">Rendimiento por tópico</h2>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {topicPerformance.map((item) => (
              <TopicCard key={item.label} title={item.label} value={item.value} />
            ))}
          </div>

          <Link
            href="/stats"
            className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black"
          >
            Ver detalles por tópico
            <ChevronRight />
          </Link>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <QuickAction
            href="/training/var"
            icon={Target}
            title="Modo VAR"
            text="APP, OFR, factual"
          />
          <QuickAction
            href="/training/exam"
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
  icon: any;
  title: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-[#111b24] p-4 shadow-xl">
      <Icon className="text-[#6fc11f]" size={30} />
      <p className="mt-4 text-sm text-zinc-400">{title}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#6fc11f]">{sub}</p>
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

      <div className="h-3 rounded-full bg-white/10">
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
      <ShieldCheck className="text-[#6fc11f]" size={26} />
      <p className="mt-3 text-sm font-bold text-zinc-300">{title}</p>
      <p className="mt-1 text-3xl font-black text-[#6fc11f]">
        {value === null ? "-" : `${value}%`}
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
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5"
    >
      <Icon className="text-[#6fc11f]" size={32} />
      <p className="mt-4 text-lg font-black">{title}</p>
      <p className="mt-1 text-sm text-zinc-400">{text}</p>
    </Link>
  );
}

function topicAvgReal(attempts: Attempt[], topic: string) {
  const filtered = attempts.filter((a) => a.topic === topic);

  if (filtered.length === 0) return null;

  return Math.round(
    filtered.reduce((acc, item) => acc + item.score, 0) / filtered.length
  );
}

function getMobileLevel(avg: number) {
  if (avg >= 90) return "Elite";
  if (avg >= 80) return "Avanzado";
  if (avg >= 70) return "Intermedio";
  return "Inicial";
}