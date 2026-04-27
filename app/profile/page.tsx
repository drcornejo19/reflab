"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

type Attempt = {
  id: string;
  score: number;
  topic: string | null;
  difficulty: string | null;
  created_at: string;
  technical_correct: boolean | null;
  restart_correct: boolean | null;
  discipline_correct: boolean | null;
  var_correct: boolean | null;
};

type Exam = {
  id: string;
  avg_score: number;
  correct_count: number;
  total_questions: number;
  created_at: string;
};

export default function ProfilePage() {
  const { user, isLoaded } = useUser();

  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!isLoaded || !user) return;

      setLoading(true);

      const [{ data: attemptsData }, { data: examsData }] = await Promise.all([
        supabase
          .from("attempts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),

        supabase
          .from("exam_results")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      setAttempts(attemptsData ?? []);
      setExams(examsData ?? []);
      setLoading(false);
    }

    loadProfile();
  }, [isLoaded, user]);

  const stats = useMemo(() => {
    const totalAttempts = attempts.length;
    const avgAttempt =
      totalAttempts > 0
        ? Math.round(
            attempts.reduce((acc, item) => acc + item.score, 0) / totalAttempts
          )
        : 0;

    const totalExams = exams.length;
    const avgExam =
      totalExams > 0
        ? Math.round(
            exams.reduce((acc, item) => acc + item.avg_score, 0) / totalExams
          )
        : 0;

    const bestExam =
      totalExams > 0 ? Math.max(...exams.map((exam) => exam.avg_score)) : 0;

    const level = getProfileLevel(avgAttempt, avgExam, totalAttempts, totalExams);

    return {
      totalAttempts,
      avgAttempt,
      totalExams,
      avgExam,
      bestExam,
      level,
    };
  }, [attempts, exams]);

  const criteria = useMemo(() => {
    return [
      { label: "Técnica", value: percent(attempts, "technical_correct") },
      { label: "Reanudación", value: percent(attempts, "restart_correct") },
      { label: "Disciplina", value: percent(attempts, "discipline_correct") },
      { label: "VAR", value: percent(attempts, "var_correct") },
    ];
  }, [attempts]);

  const trend = useMemo(() => {
    return attempts.slice(-8);
  }, [attempts]);

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Perfil arbitral
          </p>

          <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h1 className="text-5xl font-black">
                {user?.firstName ?? "Árbitro"} {user?.lastName ?? ""}
              </h1>

              <p className="mt-2 text-zinc-300">
                {user?.primaryEmailAddress?.emailAddress}
              </p>

              <p className="mt-5 text-3xl font-black text-[#6fc11f]">
                {stats.level}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SmallStat title="Intentos" value={stats.totalAttempts} />
              <SmallStat title="Exámenes" value={stats.totalExams} />
              <SmallStat title="Mejor examen" value={stats.bestExam || "-"} />
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard
            title="Promedio training"
            value={`${stats.avgAttempt}/100`}
            detail="Prácticas individuales"
          />

          <MetricCard
            title="Promedio examen"
            value={`${stats.avgExam}/100`}
            detail="Simulaciones completas"
          />

          <MetricCard
            title="Volumen"
            value={(stats.totalAttempts + stats.totalExams).toString()}
            detail="Actividad total"
          />

          <MetricCard
            title="Estado"
            value={stats.avgAttempt >= 80 ? "Sólido" : "En desarrollo"}
            detail="Lectura general"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Panel title="Precisión por criterio" subtitle="Perfil técnico actual.">
            {criteria.map((item) => (
              <Bar key={item.label} label={item.label} value={item.value} />
            ))}
          </Panel>

          <Panel title="Evolución reciente" subtitle="Últimos intentos registrados.">
            {loading ? (
              <p className="text-zinc-400">Cargando perfil...</p>
            ) : trend.length === 0 ? (
              <Empty text="Todavía no hay intentos." />
            ) : (
              <div className="space-y-3">
                {trend.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div>
                      <p className="font-black">Intento #{index + 1}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(item.created_at).toLocaleString("es-AR")}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {item.topic ?? "Sin tema"} · {item.difficulty ?? "-"}
                      </p>
                    </div>

                    <p className="text-2xl font-black text-[#6fc11f]">
                      {item.score}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">Historial de exámenes</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Resultados guardados del modo examen.
          </p>

          <div className="mt-6 space-y-3">
            {exams.length === 0 ? (
              <Empty text="Todavía no hay exámenes guardados." />
            ) : (
              exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <div>
                    <p className="font-black">
                      Examen · {exam.correct_count}/{exam.total_questions} aprobadas
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(exam.created_at).toLocaleString("es-AR")}
                    </p>
                  </div>

                  <p className="text-2xl font-black text-[#6fc11f]">
                    {exam.avg_score}/100
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function getProfileLevel(
  avgAttempt: number,
  avgExam: number,
  attempts: number,
  exams: number
) {
  const combined = Math.round(avgAttempt * 0.55 + avgExam * 0.45);

  if (exams >= 3 && combined >= 90) return "Nivel FIFA";
  if (exams >= 2 && combined >= 80) return "Nivel Elite";
  if (attempts >= 10 && combined >= 70) return "Nivel Nacional";
  if (attempts >= 5 && combined >= 60) return "Nivel Regional";
  return "Nivel Inicial";
}

function percent(attempts: Attempt[], key: keyof Attempt) {
  const valid = attempts.filter((a) => typeof a[key] === "boolean");
  if (valid.length === 0) return 0;

  return Math.round(
    (valid.filter((a) => a[key] === true).length / valid.length) * 100
  );
}

function SmallStat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-3 text-3xl font-black">{value}</p>
      <p className="mt-2 text-sm text-[#6fc11f]">{detail}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <p className="font-black">{label}</p>
        <p>{value}%</p>
      </div>

      <div className="h-3 rounded-full bg-white/10">
        <div
          className="h-3 rounded-full bg-[#6fc11f]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-zinc-500">
      {text}
    </div>
  );
}