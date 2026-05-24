"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";

type ExamAnswer = {
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  score: number;
  technicalCorrect?: boolean;
  restartCorrect?: boolean;
  disciplineCorrect?: boolean;
  subtypeCorrect?: boolean | null;
};

type ExamResult = {
  id: string;
  user_id: string;
  avg_score: number;
  total_score: number;
  total_questions: number;
  correct_count: number;
  details: ExamAnswer[] | null;
  created_at: string;
};

const topics = [
  { key: "Dispute", label: "Disputas" },
  { key: "Tactical foul", label: "Faltas tacticas" },
  { key: "Handball", label: "Manos" },
  { key: "Offside", label: "Fuera de juego" },
  { key: "VAR", label: "VAR" },
];

export default function StatsPage() {
  const { user, isLoaded } = useUser();

  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      if (!isLoaded || !user) return;

      const { data, error } = await supabase
        .from("exam_results")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error cargando estadisticas:", error);
        setExamResults([]);
      } else {
        setExamResults((data ?? []) as ExamResult[]);
      }

      setLoading(false);
    }

    loadStats();
  }, [isLoaded, user]);

  const examAnswers = useMemo(() => {
    return examResults.flatMap((exam) => exam.details ?? []);
  }, [examResults]);

  const totalExams = examResults.length;
  const totalAnswers = examAnswers.length;

  const avg =
    totalAnswers > 0
      ? Math.round(
          examAnswers.reduce((acc, a) => acc + (a.score ?? 0), 0) /
            totalAnswers
        )
      : 0;

  const best =
    totalAnswers > 0
      ? Math.max(...examAnswers.map((a) => a.score ?? 0))
      : 0;

  const last5 = examAnswers.slice(0, 5);

  const byTopic = useMemo(() => {
    return topics.map((topic) => {
      const values = examAnswers.filter((a) => a.topic === topic.key);

      const avgTopic =
        values.length > 0
          ? Math.round(
              values.reduce((acc, v) => acc + (v.score ?? 0), 0) /
                values.length
            )
          : 0;

      return {
        ...topic,
        total: values.length,
        avg: avgTopic,
      };
    });
  }, [examAnswers]);

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 text-zinc-400">
          Cargando estadisticas...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-full space-y-5 overflow-hidden lg:max-w-[1200px] lg:space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-6">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
            REFLAB STATS
          </p>
          <h1 className="mt-2 break-words text-2xl font-black leading-tight md:text-3xl">
            Estadisticas
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Estadisticas reales generadas solo con el Examen Arbitral.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard title="Examenes" value={totalExams} />
          <StatCard title="Respuestas" value={totalAnswers} />
          <StatCard title="Promedio" value={`${avg}/100`} />
          <StatCard title="Mejor score" value={best} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-5">
          <h2 className="mb-4 break-words text-lg font-black sm:text-xl">
            Ultimas respuestas
          </h2>

          {last5.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Todavia no hay respuestas de examen.
            </p>
          ) : (
            <div className="space-y-2">
              {last5.map((a, i) => (
                <div
                  key={`${a.clipId}-${i}`}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-3 text-sm sm:px-4"
                >
                  <span className="min-w-0 break-words">{labelFromValue(a.topic)}</span>
                  <span className="shrink-0 font-black text-[#6fc11f]">
                    {a.score}/100
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-4 sm:p-5">
          <h2 className="mb-4 break-words text-lg font-black sm:text-xl">
            Rendimiento por topico
          </h2>

          <div className="space-y-4">
            {byTopic.map((topic) => (
              <div key={topic.key} className="min-w-0">
                <div className="mb-1 flex min-w-0 justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words">{topic.label}</span>
                  <span className="shrink-0">
                    {topic.total > 0 ? `${topic.avg}/100` : "Sin datos"}
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-[#6fc11f]"
                    style={{ width: `${topic.avg}%` }}
                  />
                </div>

                <p className="mt-1 text-xs text-zinc-500">
                  {topic.total} respuesta{topic.total === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#101b24] p-4 sm:p-5">
      <p className="break-words text-xs text-zinc-500">{title}</p>
      <p className="mt-2 break-words text-2xl font-black sm:text-3xl">{value}</p>
    </div>
  );
}

function labelFromValue(value?: string | null) {
  if (!value) return "Sin categoria";

  const dictionary: Record<string, string> = {
    Dispute: "Disputas",
    "Tactical foul": "Faltas tacticas",
    Handball: "Manos",
    Offside: "Fuera de juego",
    VAR: "VAR",
  };

  return dictionary[value] ?? value;
}
