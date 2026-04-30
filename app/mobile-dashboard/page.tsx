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

      setAttempts(data ?? []);
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

    return {
      total,
      avg,
      streak: Math.min(total, 7),
      technical: percent(attempts, "technical_correct"),
      discipline: percent(attempts, "discipline_correct"),
      varPrecision: percent(attempts, "var_correct"),
    };
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
        {/* HERO */}
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

        {/* STATS */}
        <section>
          <h2 className="mb-3 text-xl font-black">Tu progreso</h2>

          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={BarChart3} title="Nivel" value="12" sub="Intermedio" />
            <MetricCard icon={Star} title="Promedio" value={`${stats.avg}%`} sub="Buen rendimiento" />
            <MetricCard icon={Flame} title="Racha actual" value={`${stats.streak} días`} sub="¡Seguí así!" />
            <MetricCard icon={ClipboardList} title="Ejercicios" value={stats.total} sub="Registrados" />
          </div>
        </section>

        {/* PERFORMANCE */}
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
            <ProgressRow label="Técnica" value={stats.technical} />
            <ProgressRow label="Disciplina" value={stats.discipline} />
            <ProgressRow label="VAR" value={stats.varPrecision} />
            <ProgressRow label="Promedio general" value={stats.avg} />
          </div>
        </section>

        {/* TOPIC PANEL */}
        <section className="rounded-[34px] border border-white/10 bg-[#0d1720] p-5 shadow-2xl">
          <h2 className="text-xl font-black">Rendimiento por tópico</h2>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <TopicCard title="Fuera de juego" value="86%" />
            <TopicCard title="Manos" value="76%" />
            <TopicCard title="Faltas tácticas" value="78%" />
            <TopicCard title="Disputas" value="83%" />
          </div>

          <Link
            href="/stats"
            className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-sm font-black"
          >
            Ver detalles por tópico
            <ChevronRight />
          </Link>
        </section>

        {/* QUICK ACTIONS */}
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

function ProgressRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-bold text-zinc-300">{label}</span>
        <span className="font-black text-[#6fc11f]">{value}%</span>
      </div>

      <div className="h-3 rounded-full bg-white/10">
        <div
          className="h-3 rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.45)]"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function TopicCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-4">
      <ShieldCheck className="text-[#6fc11f]" size={26} />
      <p className="mt-3 text-sm font-bold text-zinc-300">{title}</p>
      <p className="mt-1 text-3xl font-black text-[#6fc11f]">{value}</p>
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

function percent(arr: Attempt[], key: keyof Attempt) {
  const valid = arr.filter((a) => typeof a[key] === "boolean");
  if (valid.length === 0) return 0;

  return Math.round(
    (valid.filter((a) => a[key] === true).length / valid.length) * 100
  );
}