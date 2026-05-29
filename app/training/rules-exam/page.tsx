"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { rulesQuestions } from "@/lib/rulesQuestions";
import { supabase } from "@/lib/supabase";
import { FREE_WEEKLY_EXAM_LIMIT, getCurrentWeekStart } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";

const EXAM_LIMIT = 20;
const EXAM_TIME = 15 * 60;

type FinishReason = "completed" | "time" | "exit" | null;

type TopicStats = {
  total: number;
  correct: number;
};

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function RulesExamPage() {
  const { user } = useUser();
  const { isPro, loadingRole } = useUserRole();

  const questions = useMemo(() => {
    const heavyTopics = [
      "Fuera de juego",
      "Mano",
      "SPA / DOGSO",
      "VAR",
      "Disciplina",
      "Situaciones especiales",
    ];

    const heavyQuestions = rulesQuestions.filter((q) =>
      heavyTopics.includes(q.topic)
    );

    const otherQuestions = rulesQuestions.filter(
      (q) => !heavyTopics.includes(q.topic)
    );

    const selectedHeavy = shuffle(heavyQuestions).slice(0, 14);
    const selectedOther = shuffle(otherQuestions).slice(0, 6);

    const selected = [...selectedHeavy, ...selectedOther];
    const selectedIds = new Set(selected.map((q) => q.id));

    const missingCount = EXAM_LIMIT - selected.length;

    const filler =
      missingCount > 0
        ? shuffle(rulesQuestions.filter((q) => !selectedIds.has(q.id))).slice(
            0,
            missingCount
          )
        : [];

    return shuffle([...selected, ...filler]).slice(0, EXAM_LIMIT);
  }, []);

  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [finishReason, setFinishReason] = useState<FinishReason>(null);
  const [timeLeft, setTimeLeft] = useState(EXAM_TIME);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [weeklyExamCount, setWeeklyExamCount] = useState(0);

  const currentQuestion = questions[currentIndex];
  const freeExamLimitReached = !loadingRole && !isPro && weeklyExamCount >= FREE_WEEKLY_EXAM_LIMIT;

  useEffect(() => {
    async function loadWeeklyUsage() {
      if (!user || isPro) {
        setWeeklyExamCount(0);
        return;
      }

      const weekStart = getCurrentWeekStart().toISOString();
      const [examRes, rulesRes] = await Promise.all([
        supabase
          .from("exam_results")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", weekStart),
        supabase
          .from("rules_exam_results")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", weekStart),
      ]);

      if (examRes.error || rulesRes.error) {
        console.warn("No se pudo calcular el limite semanal de examenes FREE.");
        setWeeklyExamCount(0);
        return;
      }

      setWeeklyExamCount((examRes.count ?? 0) + (rulesRes.count ?? 0));
    }

    loadWeeklyUsage();
  }, [user, isPro]);

  const finishExam = useCallback((reason: Exclude<FinishReason, null>) => {
    setFinishReason(reason);
    setFinished(true);
    setStarted(false);
  }, []);

  useEffect(() => {
    if (!started || finished) return;

    if (timeLeft <= 0) {
      finishExam("time");
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [started, finished, timeLeft, finishExam]);

  useEffect(() => {
    if (!started || finished) return;

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        finishExam("exit");
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [started, finished, finishExam]);

  useEffect(() => {
    if (!started || finished) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [started, finished]);

  function startExam() {
    if (freeExamLimitReached) return;

    setStarted(true);
    setFinished(false);
    setFinishReason(null);
    setCurrentIndex(0);
    setSelected(null);
    setAnswers([]);
    setTimeLeft(EXAM_TIME);
    setSaved(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function nextQuestion() {
    if (selected === null) return;

    const updated = [...answers];
    updated[currentIndex] = selected;

    setAnswers(updated);
    setSelected(null);

    if (currentIndex >= questions.length - 1) {
      finishExam("completed");
      return;
    }

    setCurrentIndex((prev) => prev + 1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function calculateResults() {
    let correct = 0;

    const topicMap: Record<string, TopicStats> = {};

    questions.forEach((q, index) => {
      const isCorrect = answers[index] === q.correct;

      if (isCorrect) correct++;

      if (!topicMap[q.topic]) {
        topicMap[q.topic] = {
          total: 0,
          correct: 0,
        };
      }

      topicMap[q.topic].total++;

      if (isCorrect) {
        topicMap[q.topic].correct++;
      }
    });

    const percentage =
      questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;

    const topicPerformance = Object.entries(topicMap).map(([topic, data]) => ({
      topic,
      percentage: Math.round((data.correct / data.total) * 100),
      correct: data.correct,
      total: data.total,
    }));

    topicPerformance.sort((a, b) => b.percentage - a.percentage);

    return {
      correct,
      percentage,
      unanswered:
        questions.length - answers.filter((answer) => answer !== undefined).length,
      strongest: topicPerformance[0],
      weakest: topicPerformance[topicPerformance.length - 1],
      topicPerformance,
    };
  }

  async function saveRulesExam() {
    if (!user) {
      alert("Tenés que iniciar sesión para guardar el resultado.");
      return;
    }

    if (saved) {
      alert("Este resultado ya fue guardado.");
      return;
    }

    if (freeExamLimitReached) {
      alert("Ya usaste tu examen gratuito de esta semana. Desbloquea RefLab Pro para rendir examenes ilimitados.");
      return;
    }

    const result = calculateResults();

    const details = questions.map((question, questionIndex) => {
      const selectedAnswer = answers[questionIndex];
      const isAnswered = selectedAnswer !== undefined;
      const isCorrect = selectedAnswer === question.correct;

      return {
        question_id: question.id,
        topic: question.topic,
        question: question.question,
        selected_option: isAnswered ? selectedAnswer : null,
        selected_text: isAnswered ? question.options[selectedAnswer] : null,
        correct_option: question.correct,
        correct_text: question.options[question.correct],
        is_correct: isCorrect,
        unanswered: !isAnswered,
        explanation: question.explanation,
      };
    });

    setSaving(true);

    const { error } = await supabase.from("rules_exam_results").insert([
      {
        user_id: user.id,
        total_questions: questions.length,
        correct_count: result.correct,
        percentage: result.percentage,
        unanswered_count: result.unanswered,
        finish_reason: finishReason,
        level: getLevel(result.percentage),
        details,
        topic_performance: result.topicPerformance,
      },
    ]);

    if (error) {
      console.error("Error guardando examen de reglas:", error);
      alert(error.message);
    } else {
      setSaved(true);
      if (!isPro) setWeeklyExamCount((prev) => prev + 1);
      alert("Resultado guardado correctamente.");
    }

    setSaving(false);
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  if (!currentQuestion && !finished) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[950px] rounded-3xl border border-white/10 bg-[#101820] p-8 text-zinc-400">
          No hay preguntas cargadas para el examen.
        </div>
      </AppShell>
    );
  }

  if (!started && !finished) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[950px] space-y-5">
          {freeExamLimitReached && (
            <ProUpgradeCard
              title="Ya usaste tu examen gratuito de esta semana"
              description="El plan FREE permite 1 examen semanal. RefLab Pro desbloquea examenes ilimitados y estadisticas completas."
              reason={`Limite FREE: ${FREE_WEEKLY_EXAM_LIMIT} examen por semana.`}
            />
          )}

          <section className="rounded-3xl border border-[#6fc11f]/30 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_42%),#101820] p-8 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              REFLAB RULES EXAM
            </p>

            <h1 className="mt-4 text-5xl font-black">
              Examen de Reglas de Juego
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">
              Vas a responder 20 preguntas exigentes sobre Reglas IFAB. El
              tiempo empieza únicamente cuando presionás comenzar.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <StatCard title="Preguntas" value="20" />
              <StatCard title="Tiempo" value="15:00" />
              <StatCard title="Feedback" value="Final" />
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/25 bg-yellow-500/10 p-6">
            <h2 className="text-xl font-black text-yellow-300">
              Condiciones del examen
            </h2>

            <div className="mt-4 space-y-2 text-sm leading-7 text-zinc-300">
              <p>• El examen dura 15 minutos.</p>
              <p>• Si cambiás de pestaña o salís de la app, el examen finaliza.</p>
              <p>• Las preguntas no respondidas cuentan como incorrectas.</p>
              <p>• El resultado y el feedback aparecen al final.</p>
            </div>
          </section>

          <button
            onClick={startExam}
            disabled={freeExamLimitReached}
            className="w-full rounded-2xl bg-[#6fc11f] px-5 py-5 text-lg font-black text-black transition hover:bg-[#82dc2a]"
          >
            COMENZAR EXAMEN
          </button>
        </div>
      </AppShell>
    );
  }

  if (finished) {
    const result = calculateResults();

    return (
      <AppShell>
        <div className="mx-auto max-w-[950px] space-y-5">
          <section className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-8">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              REFLAB RULES EXAM
            </p>

            <h1 className="mt-4 text-5xl font-black">Examen finalizado</h1>

            <p className="mt-6 text-7xl font-black text-[#6fc11f]">
              {result.percentage}%
            </p>

            <p className="mt-3 text-xl font-bold">
              {result.correct} respuestas correctas de {questions.length}
            </p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
                Motivo de finalización
              </p>

              <p className="mt-2 font-black text-white">
                {finishReason === "completed"
                  ? "Examen completado"
                  : finishReason === "time"
                    ? "Tiempo agotado"
                    : finishReason === "exit"
                      ? "Salida o cambio de pestaña detectado"
                      : "Finalizado"}
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <StatCard title="Nivel" value={getLevel(result.percentage)} />

              <StatCard
                title="Sin responder"
                value={result.unanswered.toString()}
              />

              <StatCard
                title="Punto fuerte"
                value={result.strongest?.topic ?? "-"}
              />

              <StatCard
                title="A mejorar"
                value={result.weakest?.topic ?? "-"}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
            <h2 className="text-2xl font-black">Rendimiento por tópico</h2>

            <div className="mt-6 space-y-4">
              {result.topicPerformance.map((item) => (
                <div key={item.topic}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold">{item.topic}</span>

                    <span className="font-black text-[#6fc11f]">
                      {item.percentage}% · {item.correct}/{item.total}
                    </span>
                  </div>

                  <div className="h-3 rounded-full bg-white/10">
                    <div
                      className="h-3 rounded-full bg-[#6fc11f]"
                      style={{
                        width: `${item.percentage}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-6">
            <h2 className="text-xl font-black text-yellow-300">
              Feedback automático
            </h2>

            <p className="mt-4 text-sm leading-7 text-zinc-300">
              {result.percentage >= 90
                ? "Excelente interpretación de las Reglas IFAB. Mostrás consistencia técnica y disciplinaria."
                : result.percentage >= 75
                  ? "Buen rendimiento general. Hay pequeños errores de interpretación que todavía deben ajustarse."
                  : result.percentage >= 60
                    ? "Rendimiento intermedio. Conviene reforzar tópicos específicos y practicar situaciones complejas."
                    : "Necesitás reforzar lectura técnica, reanudaciones y criterio disciplinario."}
            </p>

            <p className="mt-4 text-sm leading-7 text-zinc-300">
              Tópico más sólido:
              <span className="ml-2 font-black text-[#6fc11f]">
                {result.strongest?.topic ?? "-"}
              </span>
            </p>

            <p className="mt-2 text-sm leading-7 text-zinc-300">
              Tópico más débil:
              <span className="ml-2 font-black text-red-400">
                {result.weakest?.topic ?? "-"}
              </span>
            </p>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <button
              onClick={saveRulesExam}
              disabled={saving || saved}
              className="w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "GUARDANDO..."
                : saved
                  ? "RESULTADO GUARDADO"
                  : "GUARDAR RESULTADO"}
            </button>

            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
            >
              RENDIR NUEVAMENTE
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                REFLAB RULES EXAM
              </p>

              <h1 className="mt-3 text-4xl font-black">Examen de Reglas</h1>

              <p className="mt-2 text-sm text-zinc-400">
                Pregunta {currentIndex + 1} de {questions.length}
              </p>
            </div>

            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
                Tiempo
              </p>

              <p className="mt-1 text-3xl font-black text-red-300">
                {formatTime(timeLeft)}
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <div className="mb-4 inline-flex rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">
            {currentQuestion.topic}
          </div>

          <p className="text-lg font-bold leading-8">
            {currentQuestion.question}
          </p>

          <div className="mt-6 space-y-3">
            {currentQuestion.options.map((option, optionIndex) => {
              const active = selected === optionIndex;

              return (
                <button
                  key={`${currentQuestion.id}-${option}`}
                  onClick={() => setSelected(optionIndex)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    active
                      ? "border-[#6fc11f] bg-[#6fc11f]/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="font-black">
                    {String.fromCharCode(65 + optionIndex)}.
                  </span>{" "}
                  {option}
                </button>
              );
            })}
          </div>

          <button
            disabled={selected === null}
            onClick={nextQuestion}
            className="mt-6 w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black disabled:opacity-40"
          >
            {currentIndex >= questions.length - 1
              ? "FINALIZAR EXAMEN"
              : "SIGUIENTE"}
          </button>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/25 p-5">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

function getLevel(avg: number) {
  if (avg >= 90) return "Elite";
  if (avg >= 80) return "Avanzado";
  if (avg >= 70) return "Intermedio";
  return "Inicial";
}
