"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { Flame, Star, ClipboardList, BarChart3 } from "lucide-react";

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
      if (!isLoaded || !user) return;

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
    };
  }, [attempts]);

  return (
    <AppShell>
      <div className="max-w-md mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex items-center gap-3">
          <img src="/rf-logo.png" className="w-10 h-10" />
          <div>
            <h1 className="text-xl font-black">¡Bienvenido, Árbitro!</h1>
            <p className="text-sm text-zinc-400">
              Entrená tus decisiones.
            </p>
          </div>
        </div>

        {/* CTA */}
        <Link
          href="/training"
          className="w-full flex items-center justify-center gap-2 bg-[#6fc11f] text-black font-black py-4 rounded-xl text-sm"
        >
          PRACTICAR AHORA
        </Link>

        {/* STATS */}
        <div className="grid grid-cols-2 gap-4">

          <Card icon={<BarChart3 />} title="Nivel" value="12" subtitle="Intermedio" />

          <Card icon={<Star />} title="Promedio" value={`${stats.avg}%`} subtitle="Buen rendimiento" />

          <Card icon={<Flame />} title="Racha" value={`${stats.streak} días`} subtitle="¡Seguí así!" />

          <Card icon={<ClipboardList />} title="Ejercicios" value={stats.total} subtitle="Esta semana" />

        </div>

        {/* TITULO */}
        <h2 className="text-lg font-black mt-6">
          Rendimiento por tópico
        </h2>

        {/* RADAR SIMPLE (placeholder) */}
        <div className="bg-[#111b24] rounded-2xl p-5 text-center text-zinc-400">
          Radar PRO (lo integramos después con animación tipo FIFA 👀)
        </div>

        {/* BOTON */}
        <Link
          href="/stats"
          className="w-full block text-center py-4 rounded-xl bg-[#121f28] text-sm text-white border border-white/10"
        >
          Ver detalles por tópico →
        </Link>

      </div>
    </AppShell>
  );
}

function Card({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle: string;
}) {
  return (
    <div className="bg-[#111b24] p-4 rounded-2xl border border-white/10">
      <div className="text-[#6fc11f] mb-2">{icon}</div>
      <p className="text-xs text-zinc-400">{title}</p>
      <p className="text-xl font-black">{value}</p>
      <p className="text-xs text-[#6fc11f]">{subtitle}</p>
    </div>
  );
}