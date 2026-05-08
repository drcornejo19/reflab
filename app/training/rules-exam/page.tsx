"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { rulesQuestions } from "@/lib/rulesQuestions";

const EXAM_LIMIT = 20;
const EXAM_TIME = 30 * 60;

type TopicStats = {
  total: number;
  correct: number;
};

function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function RulesExamPage() {
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

    return shuffle([...selectedHeavy, ...selectedOther]).slice(0, EXAM_LIMIT);
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(EXAM_TIME);

  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (finished) return;

    if (timeLeft <= 0) {
      setFinished(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, finished]);

  function nextQuestion() {
    if (selected === null) return;

    const updated = [...answers];
    updated[currentIndex] = selected;

    setAnswers(updated);
    setSelected(null);

    if (currentIndex >= questions.length - 1) {
      setFinished(true);
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
    }));

    topicPerformance.sort((a, b) => b.percentage - a.percentage);

    return {
      correct,
      percentage,
      strongest: topicPerformance[0],
      weakest: topicPerformance[topicPerformance.length - 1],
      topicPerformance,
    };
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

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <StatCard title="Nivel" value={getLevel(result.percentage)} />

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
                      {item.percentage}%
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

          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black"
          >
            RENDIR NUEVAMENTE
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[950px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <div className="flex items-center justify-between gap-4">
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
            {currentQuestion.options.map((option, index) => {
              const active = selected === index;

              return (
                <button
                  key={`${currentQuestion.id}-${option}`}
                  onClick={() => setSelected(index)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    active
                      ? "border-[#6fc11f] bg-[#6fc11f]/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="font-black">
                    {String.fromCharCode(65 + index)}.
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