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
  { key: "Tactical foul", label: "Faltas tácticas" },
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
        console.error("Error cargando estadísticas:", error);
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
        <div className="text-zinc-400">Cargando estadísticas...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1200px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black tracking-[0.35em] text-[#6fc11f]">
            REFLAB STATS
          </p>
          <h1 className="text-3xl font-black">Estadísticas</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Estadísticas reales generadas solo con el Examen Arbitral.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title="Exámenes" value={totalExams} />
          <StatCard title="Respuestas" value={totalAnswers} />
          <StatCard title="Promedio" value={`${avg}/100`} />
          <StatCard title="Mejor Score" value={best} />
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
          <h2 className="mb-4 text-xl font-black">Últimas respuestas</h2>

          {last5.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Todavía no hay respuestas de examen.
            </p>
          ) : (
            <div className="space-y-2">
              {last5.map((a, i) => (
                <div
                  key={`${a.clipId}-${i}`}
                  className="flex justify-between rounded-xl bg-white/5 px-4 py-3 text-sm"
                >
                  <span>{labelFromValue(a.topic)}</span>
                  <span className="font-black text-[#6fc11f]">
                    {a.score}/100
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-5">
          <h2 className="mb-4 text-xl font-black">Rendimiento por tópico</h2>

          <div className="space-y-4">
            {byTopic.map((topic) => (
              <div key={topic.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{topic.label}</span>
                  <span>
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
    <div className="rounded-2xl border border-white/10 bg-[#101b24] p-5">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function labelFromValue(value?: string | null) {
  if (!value) return "Sin categoría";

  const dictionary: Record<string, string> = {
    Dispute: "Disputas",
    "Tactical foul": "Faltas tácticas",
    Handball: "Manos",
    Offside: "Fuera de juego",
    VAR: "VAR",
  };

  return dictionary[value] ?? value;
}