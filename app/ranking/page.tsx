"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Attempt = {
  user_id: string;
  score: number;
  topic: string | null;
  difficulty: string | null;
  created_at: string;
};

type RankingRow = {
  user_id: string;
  name: string;
  attempts: number;
  avgScore: number;
  bestScore: number;
  lastAttempt: string;
};

export default function RankingPage() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRanking() {
      const { data, error } = await supabase
        .from("attempts")
        .select("user_id, score, topic, difficulty, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando ranking:", error);
        setAttempts([]);
      } else {
        setAttempts(data ?? []);
      }

      setLoading(false);
    }

    loadRanking();
  }, []);

  const ranking = useMemo(() => {
    const grouped = new Map<string, Attempt[]>();

    attempts.forEach((attempt) => {
      if (!attempt.user_id) return;

      if (!grouped.has(attempt.user_id)) {
        grouped.set(attempt.user_id, []);
      }

      grouped.get(attempt.user_id)?.push(attempt);
    });

    const rows: RankingRow[] = Array.from(grouped.entries()).map(
      ([user_id, userAttempts]) => {
        const scores = userAttempts.map((a) => a.score ?? 0);
        const total = scores.reduce((acc, score) => acc + score, 0);
        const avgScore = Math.round(total / scores.length);
        const bestScore = Math.max(...scores);

        return {
          user_id,
          name: `Árbitro ${user_id.slice(0, 6)}`,
          attempts: userAttempts.length,
          avgScore,
          bestScore,
          lastAttempt: userAttempts[0]?.created_at,
        };
      }
    );

    return rows.sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return b.attempts - a.attempts;
    });
  }, [attempts]);

  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Cargando ranking...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            RefLab Ranking
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            Ranking de árbitros
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Clasificación general según promedio, mejor score y cantidad de
            ejercicios completados.
          </p>
        </header>

        {ranking.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-center text-zinc-400">
            Todavía no hay intentos registrados para generar ranking.
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {podium.map((row, index) => (
                <PodiumCard key={row.user_id} row={row} position={index + 1} />
              ))}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#071019] p-5 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                    Tabla general
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    Clasificación completa
                  </h2>
                </div>

                <div className="rounded-2xl bg-[#6fc11f]/10 px-4 py-3 text-sm font-black text-[#6fc11f]">
                  {ranking.length} árbitros
                </div>
              </div>

              <div className="space-y-3">
                {rest.map((row, index) => (
                  <RankingItem
                    key={row.user_id}
                    row={row}
                    position={index + 4}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function PodiumCard({
  row,
  position,
}: {
  row: RankingRow;
  position: number;
}) {
  const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉";

  return (
    <div
      className={`rounded-3xl border p-6 shadow-2xl ${
        position === 1
          ? "border-[#6fc11f]/50 bg-[#6fc11f]/15"
          : "border-white/10 bg-[#0b131b]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-4xl">{medal}</span>

        <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-black text-[#6fc11f]">
          #{position}
        </span>
      </div>

      <h3 className="mt-5 text-xl font-black">{row.name}</h3>

      <p className="mt-1 text-xs text-zinc-500">
        Último intento: {formatDate(row.lastAttempt)}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <MiniStat label="Prom." value={`${row.avgScore}`} />
        <MiniStat label="Best" value={`${row.bestScore}`} />
        <MiniStat label="Tests" value={`${row.attempts}`} />
      </div>
    </div>
  );
}

function RankingItem({
  row,
  position,
}: {
  row: RankingRow;
  position: number;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr_90px_90px_90px] items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1a23] px-4 py-4 text-sm">
      <div className="text-xl font-black text-[#6fc11f]">#{position}</div>

      <div>
        <p className="font-black">{row.name}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Último intento: {formatDate(row.lastAttempt)}
        </p>
      </div>

      <div className="text-center">
        <p className="text-xs text-zinc-500">Promedio</p>
        <p className="font-black text-[#6fc11f]">{row.avgScore}</p>
      </div>

      <div className="text-center">
        <p className="text-xs text-zinc-500">Mejor</p>
        <p className="font-black">{row.bestScore}</p>
      </div>

      <div className="text-center">
        <p className="text-xs text-zinc-500">Intentos</p>
        <p className="font-black">{row.attempts}</p>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function formatDate(date: string) {
  if (!date) return "-";

  return new Date(date).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}