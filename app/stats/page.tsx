"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";

type Attempt = {
  score: number;
  topic: string;
  difficulty: string;
  created_at: string;
};

export default function StatsPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const { data } = await supabase
        .from("attempts")
        .select("score, topic, difficulty, created_at")
        .order("created_at", { ascending: false });

      setAttempts(data ?? []);
      setLoading(false);
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <AppShell>
        <div className="text-zinc-400">Cargando estadísticas...</div>
      </AppShell>
    );
  }

  const total = attempts.length;
  const avg =
    total > 0
      ? Math.round(
          attempts.reduce((acc, a) => acc + (a.score ?? 0), 0) / total
        )
      : 0;

  const best = total > 0 ? Math.max(...attempts.map((a) => a.score ?? 0)) : 0;

  const last5 = attempts.slice(0, 5);

  const byTopic = groupBy(attempts, "topic");

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">

        {/* HEADER */}
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black tracking-[0.35em] text-[#6fc11f]">
            REFLAB STATS
          </p>
          <h1 className="text-3xl font-black">Estadísticas</h1>
        </header>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Intentos" value={total} />
          <StatCard title="Promedio" value={`${avg}/100`} />
          <StatCard title="Mejor Score" value={best} />
        </div>

        {/* ÚLTIMOS */}
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
          <h2 className="text-xl font-black mb-4">Últimos intentos</h2>

          <div className="space-y-2">
            {last5.map((a, i) => (
              <div
                key={i}
                className="flex justify-between rounded-xl bg-white/5 px-4 py-3 text-sm"
              >
                <span>{a.topic}</span>
                <span className="text-[#6fc11f] font-black">
                  {a.score}/100
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* POR TEMA */}
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
          <h2 className="text-xl font-black mb-4">Rendimiento por tema</h2>

          <div className="space-y-3">
            {Object.entries(byTopic).map(([topic, values]) => {
              const avgTopic =
                values.reduce((acc, v) => acc + v.score, 0) / values.length;

              return (
                <div key={topic}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{topic}</span>
                    <span>{Math.round(avgTopic)}/100</span>
                  </div>

                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6fc11f]"
                      style={{ width: `${avgTopic}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </AppShell>
  );
}

function StatCard({ title, value }: { title: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-5">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="text-3xl font-black mt-2">{value}</p>
    </div>
  );
}

function groupBy<T>(arr: T[], key: keyof T) {
  return arr.reduce((acc, item) => {
    const k = (item[key] as string) || "Sin categoría";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}