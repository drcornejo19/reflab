"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import {
  getRankingRows,
  type AttemptRecord,
  type RankingProfileRecord,
  type RankingRow,
} from "@/lib/performance";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/lib/useUserRole";

export default function RankingPage() {
  const { user } = useUser();
  const { isPro, loadingRole } = useUserRole();
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [profiles, setProfiles] = useState<RankingProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRanking() {
      const [attemptsRes, profilesRes] = await Promise.all([
        supabase.from("attempts").select("*").order("created_at", { ascending: false }),
        supabase.from("user_profiles").select("*"),
      ]);

      if (attemptsRes.error) {
        console.error("Error cargando ranking:", attemptsRes.error);
        setAttempts([]);
      } else {
        setAttempts((attemptsRes.data ?? []) as AttemptRecord[]);
      }

      setProfiles(profilesRes.error ? [] : ((profilesRes.data ?? []) as RankingProfileRecord[]));
      setLoading(false);
    }

    loadRanking();
  }, []);

  const ranking = useMemo(
    () => getRankingRows(attempts, user?.id, profiles),
    [attempts, profiles, user?.id]
  );
  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  if (loading || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Cargando ranking...
        </div>
      </AppShell>
    );
  }

  if (!isPro) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-[980px] space-y-5 overflow-hidden">
          <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
              RefLab Ranking
            </p>
            <h1 className="mt-3 break-words text-3xl font-black tracking-tight md:text-4xl">
              Ranking Pro
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              La comparacion comunitaria se desbloquea cuando el usuario ya
              tiene datos suficientes para competir con sentido.
            </p>
          </header>
          <ProUpgradeCard
            title="Ranking exclusivo de RefLab Pro"
            description="Desbloquea posicion, promedio, mejor score, cantidad de examenes, entrenamientos y actividad comparada con otros arbitros."
            compact
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1200px] space-y-6 overflow-hidden">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f] sm:tracking-[0.35em]">
            RefLab Ranking
          </p>

          <h1 className="mt-3 break-words text-3xl font-black tracking-tight md:text-4xl">
            Ranking de arbitros
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Clasificacion general segun promedio, mejor score, entrenamientos y evaluaciones. La identidad publica respeta la privacidad elegida en Perfil.
          </p>
        </header>

        {ranking.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-center text-zinc-400">
            Todavia no hay intentos registrados para generar ranking.
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {podium.map((row) => (
                <PodiumCard key={row.userId} row={row} />
              ))}
            </section>

            <section className="rounded-3xl border border-white/10 bg-[#071019] p-4 shadow-2xl sm:p-5">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f] sm:tracking-[0.35em]">
                    Tabla general
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    Clasificacion completa
                  </h2>
                </div>

                <div className="w-fit rounded-2xl bg-[#6fc11f]/10 px-4 py-3 text-sm font-black text-[#6fc11f]">
                  {ranking.length} arbitros
                </div>
              </div>

              <div className="space-y-3">
                {rest.map((row) => (
                  <RankingItem key={row.userId} row={row} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function PodiumCard({ row }: { row: RankingRow }) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-2xl sm:p-6 ${
        row.position === 1
          ? "border-[#6fc11f]/50 bg-[#6fc11f]/15"
          : "border-white/10 bg-[#0b131b]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/35 bg-black/35 text-2xl font-black text-[#b7ff8a]">
          {row.position}
        </span>

        <span className="rounded-full bg-black/35 px-3 py-1 text-xs font-black text-[#6fc11f]">
          #{row.position}
        </span>
      </div>

      <h3 className="mt-5 break-words text-xl font-black">{row.name}</h3>

      <p className="mt-1 break-words text-xs text-zinc-500">
        RefCard {row.refCardId} - Ultimo intento: {formatDate(row.lastAttempt)}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 text-center min-[420px]:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Prom." value={`${row.avgScore}`} />
        <MiniStat label="Best" value={`${row.bestScore}`} />
        <MiniStat label="Eval." value={`${row.tests}`} />
        <MiniStat label="Entr." value={`${row.trainings}`} />
      </div>
    </div>
  );
}

function RankingItem({ row }: { row: RankingRow }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-[#0f1a23] px-4 py-4 text-sm sm:grid-cols-[58px_minmax(0,1fr)_80px_80px_80px_80px] sm:items-center">
      <div className="text-xl font-black text-[#6fc11f]">#{row.position}</div>

      <div className="min-w-0">
        <p className="break-words font-black">{row.name}</p>
        <p className="mt-1 break-words text-xs text-zinc-500">
          RefCard {row.refCardId} - Ultimo intento: {formatDate(row.lastAttempt)}
        </p>
      </div>

      <RankingStat label="Promedio" value={row.avgScore.toString()} green />
      <RankingStat label="Mejor" value={row.bestScore.toString()} />
      <RankingStat label="Eval." value={row.tests.toString()} />
      <RankingStat label="Entr." value={row.trainings.toString()} />
    </div>
  );
}

function RankingStat({ label, value, green = false }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="rounded-2xl bg-black/25 p-3 text-left sm:bg-transparent sm:p-0 sm:text-center">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`font-black ${green ? "text-[#6fc11f]" : "text-white"}`}>{value}</p>
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
