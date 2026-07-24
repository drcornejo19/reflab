"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { futsalRulesExamQuestions } from "@/lib/futsalRulesQuestions";
import { FREE_WEEKLY_EXAM_LIMIT, getCurrentWeekStart } from "@/lib/subscription";
import { useUserRole } from "@/lib/useUserRole";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";
import { useSupabase } from "@/components/SupabaseProvider";

const EXAM_LIMIT = 10;
const EXAM_TIME = 12 * 60;

type FinishReason = "completed" | "time" | "exit" | null;
type TopicStats = { total: number; correct: number };

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

export function FutsalRulesExamClient() {
  const supabase = useSupabase();
  const { user } = useUser();
  const { isPro, loadingRole } = useUserRole();

  const questions = useMemo(() => {
    return shuffle(futsalRulesExamQuestions).slice(0, EXAM_LIMIT);
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
  const freeExamLimitReached =
    !loadingRole && !isPro && weeklyExamCount >= FREE_WEEKLY_EXAM_LIMIT;

  useEffect(() => {
    let cancelled = false;

    async function loadWeeklyUsage() {
      if (!user || isPro) {
        setWeeklyExamCount(0);
        return;
      }

      const weekStart = getCurrentWeekStart().toISOString();
      const [videoRes, rulesRes] = await Promise.all([
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

      if (cancelled) return;

      if (videoRes.error || rulesRes.error) {
        console.warn("No se pudo calcular el limite semanal de examenes.");
        setWeeklyExamCount(0);
        return;
      }

      setWeeklyExamCount((videoRes.count ?? 0) + (rulesRes.count ?? 0));
    }

    loadWeeklyUsage();

    return () => {
      cancelled = true;
    };
  }, [isPro, supabase, user]);

  const finishExam = useCallback((reason: Exclude<FinishReason, null>) => {
    setFinishReason(reason);
    setFinished(true);
    setStarted(false);
  }, []);

  useEffect(() => {
    if (!started || finished) return;

    const timer = window.setTimeout(() => {
      if (timeLeft <= 1) {
        setTimeLeft(0);
        finishExam("time");
        return;
      }

      setTimeLeft((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timer);
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

    questions.forEach((question, index) => {
      const isCorrect = answers[index] === question.correct;
      if (isCorrect) correct++;

      if (!topicMap[question.topic]) {
        topicMap[question.topic] = { total: 0, correct: 0 };
      }

      topicMap[question.topic].total++;
      if (isCorrect) topicMap[question.topic].correct++;
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

  async function saveExam() {
    if (!user) {
      alert("Tenes que iniciar sesion para guardar el resultado.");
      return;
    }

    if (saved) {
      alert("Este resultado ya fue guardado.");
      return;
    }

    const result = calculateResults();
    const details = questions.map((question, index) => {
      const selectedAnswer = answers[index];
      const isAnswered = selectedAnswer !== undefined;
      const isCorrect = selectedAnswer === question.correct;

      return {
        question_id: question.id,
        topic: question.topic,
        subtopic: question.subtopic,
        question: question.question,
        selected_option: isAnswered ? selectedAnswer : null,
        selected_text: isAnswered ? question.options[selectedAnswer] : null,
        correct_option: question.correct,
        correct_text: question.options[question.correct],
        is_correct: isCorrect,
        unanswered: !isAnswered,
        explanation: question.explanation,
        official_explanation:
          question.officialExplanation ?? question.ifabExplanation ?? null,
        rule_reference: question.rule_reference,
        difficulty: question.difficulty,
      };
    });

    setSaving(true);

    const { error } = await supabase.from("rules_exam_results").insert([
      {
        user_id: user.id,
        sport_type: "futsal",
        activity_type: "rules_exam",
        season: "2024-25",
        source_version: "Futsal Laws of the Game 2024-25",
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
      console.error("Error guardando examen de futsal:", error);
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
      <div className="rounded-3xl border border-white/10 bg-[#101820] p-8 text-zinc-400">
        No hay preguntas cargadas para el examen de futsal.
      </div>
    );
  }

  if (!started && !finished) {
    return (
      <div className="space-y-5">
        {freeExamLimitReached && (
          <ProUpgradeCard
            title="Ya usaste tu examen gratuito de esta semana"
            description="El plan Basic permite 1 examen semanal. RefLab Pro desbloquea examenes ilimitados."
            reason={`Limite Basic: ${FREE_WEEKLY_EXAM_LIMIT} examen por semana.`}
          />
        )}

        <section className="rounded-3xl border border-[#16b8ff]/30 bg-[radial-gradient(circle_at_top_left,rgba(22,184,255,0.18),transparent_42%),#101820] p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
            EXAMEN FIFA FUTSAL
          </p>

          <h2 className="mt-4 text-5xl font-black">
            Examen de Reglas de Futsal
          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">
            Vas a responder {EXAM_LIMIT} preguntas basadas en FIFA Futsal Laws
            of the Game 2024-25. El feedback aparece al final.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard title="Preguntas" value={String(EXAM_LIMIT)} />
            <StatCard title="Tiempo" value="12:00" />
            <StatCard title="Feedback" value="Final" />
          </div>
        </section>

        <section className="rounded-3xl border border-yellow-500/25 bg-yellow-500/10 p-6">
          <h3 className="text-xl font-black text-yellow-300">
            Condiciones del examen
          </h3>
          <div className="mt-4 space-y-2 text-sm leading-7 text-zinc-300">
            <p>â€¢ El examen dura 12 minutos.</p>
            <p>â€¢ Si cambias de pestana o sales de la app, el examen finaliza.</p>
            <p>â€¢ Las preguntas no respondidas cuentan como incorrectas.</p>
            <p>â€¢ El analisis aparece al final y se guarda por disciplina.</p>
          </div>
        </section>

        <button
          onClick={startExam}
          disabled={freeExamLimitReached}
          className="w-full rounded-2xl bg-[#16b8ff] px-5 py-5 text-lg font-black text-black transition hover:bg-[#31b8ff]"
        >
          COMENZAR EXAMEN
        </button>
      </div>
    );
  }

  if (finished) {
    const result = calculateResults();

    return (
      <div className="space-y-5">
        <section className="rounded-3xl border border-[#16b8ff]/30 bg-[#16b8ff]/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
            EXAMEN FIFA FUTSAL
          </p>

          <h2 className="mt-4 text-5xl font-black">Examen finalizado</h2>
          <p className="mt-6 text-7xl font-black text-[#16b8ff]">
            {result.percentage}%
          </p>
          <p className="mt-3 text-xl font-bold">
            {result.correct} respuestas correctas de {questions.length}
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-500">
              Motivo de finalizacion
            </p>
            <p className="mt-2 font-black text-white">
              {finishReason === "completed"
                ? "Examen completado"
                : finishReason === "time"
                  ? "Tiempo agotado"
                  : finishReason === "exit"
                    ? "Salida o cambio de pestana detectado"
                    : "Finalizado"}
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-4">
            <StatCard title="Nivel" value={getLevel(result.percentage)} />
            <StatCard title="Sin responder" value={String(result.unanswered)} />
            <StatCard title="Punto fuerte" value={result.strongest?.topic ?? "-"} />
            <StatCard title="A mejorar" value={result.weakest?.topic ?? "-"} />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <h3 className="text-2xl font-black">Rendimiento por topico</h3>
          <div className="mt-6 space-y-4">
            {result.topicPerformance.map((item) => (
              <div key={item.topic}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-bold">{item.topic}</span>
                  <span className="font-black text-[#16b8ff]">
                    {item.percentage}% - {item.correct}/{item.total}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-white/10">
                  <div
                    className="h-3 rounded-full bg-[#16b8ff]"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <h3 className="text-2xl font-black">Revision tecnica</h3>
          <div className="mt-5 space-y-3">
            {questions.map((question, index) => {
              const selectedAnswer = answers[index];
              const answeredCorrectly = selectedAnswer === question.correct;

              return (
                <article
                  key={question.id}
                  className={`rounded-2xl border p-4 ${
                    answeredCorrectly
                      ? "border-[#16b8ff]/25 bg-[#16b8ff]/5"
                      : "border-red-400/20 bg-red-500/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                    <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-300">
                      {question.lawReference}
                    </span>
                    <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-400">
                      {question.difficulty}
                    </span>
                  </div>
                  <p className="mt-3 font-black leading-6 text-white">
                    {question.question}
                  </p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p className="rounded-xl bg-black/20 p-3 text-zinc-300">
                      Tu respuesta:{" "}
                      <strong
                        className={
                          answeredCorrectly ? "text-[#16b8ff]" : "text-red-300"
                        }
                      >
                        {selectedAnswer === undefined
                          ? "Sin responder"
                          : question.options[selectedAnswer]}
                      </strong>
                    </p>
                    <p className="rounded-xl bg-black/20 p-3 text-zinc-300">
                      Correcta:{" "}
                      <strong className="text-white">
                        {question.options[question.correct]}
                      </strong>
                    </p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">
                    {question.explanation}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {question.officialExplanation ?? question.ifabExplanation}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={saveExam}
            disabled={saving || saved}
            className="w-full rounded-2xl bg-[#16b8ff] px-5 py-4 font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
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
    );
  }

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
              EXAMEN FIFA FUTSAL
            </p>
            <h2 className="mt-3 text-4xl font-black">Examen de Reglas</h2>
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
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="inline-flex rounded-full border border-[#16b8ff]/30 bg-[#16b8ff]/10 px-4 py-2 text-xs font-black text-[#16b8ff]">
            {currentQuestion.lawReference}
          </span>
          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-300">
            {currentQuestion.difficulty}
          </span>
        </div>

        <p className="text-lg font-bold leading-8">{currentQuestion.question}</p>

        <div className="mt-6 space-y-3">
          {currentQuestion.options.map((option, optionIndex) => {
            const active = selected === optionIndex;

            return (
              <button
                key={`${currentQuestion.id}-${option}`}
                onClick={() => setSelected(optionIndex)}
                className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                  active
                    ? "border-[#16b8ff] bg-[#16b8ff]/10"
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
          className="mt-6 w-full rounded-2xl bg-[#16b8ff] px-5 py-4 font-black text-black disabled:opacity-40"
        >
          {currentIndex >= questions.length - 1 ? "FINALIZAR EXAMEN" : "SIGUIENTE"}
        </button>
      </section>
    </div>
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


