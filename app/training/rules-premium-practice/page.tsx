"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { rulesQuestions } from "@/lib/rulesQuestions";

const isPremium = false;

export default function RulesPremiumPracticePage() {
  const questions = useMemo(() => {
    return [...rulesQuestions].sort(() => Math.random() - 0.5);
  }, []);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const currentQuestion = questions[currentIndex];

  function submitAnswer() {
    if (selected === null || answered) return;

    if (selected === currentQuestion.correct) {
      setCorrectCount((prev) => prev + 1);
    }

    setAnswered(true);
  }

  function nextQuestion() {
    setSelected(null);
    setAnswered(false);

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

  if (!isPremium) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] rounded-3xl border border-yellow-500/20 bg-yellow-500/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-yellow-300">
            REFLAB PREMIUM
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Práctica Premium de Reglas
          </h1>

          <p className="mt-4 text-sm leading-7 text-zinc-300">
            Este módulo desbloquea la práctica completa con todas las preguntas
            disponibles, explicación inmediata y entrenamiento por reglas.
          </p>

          <button className="mt-6 rounded-2xl bg-[#6fc11f] px-6 py-4 font-black text-black">
            DESBLOQUEAR PREMIUM
          </button>
        </div>
      </AppShell>
    );
  }

  if (finished) {
    const percentage = Math.round((correctCount / questions.length) * 100);

    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] rounded-3xl border border-white/10 bg-[#0b131b] p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            REFLAB PREMIUM PRACTICE
          </p>

          <h1 className="mt-3 text-4xl font-black">Práctica finalizada</h1>

          <p className="mt-6 text-6xl font-black text-[#6fc11f]">
            {percentage}%
          </p>

          <p className="mt-2 text-zinc-400">
            {correctCount} respuestas correctas de {questions.length}.
          </p>

          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-2xl bg-[#6fc11f] px-6 py-4 font-black text-black"
          >
            PRACTICAR DE NUEVO
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[900px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            REFLAB PREMIUM PRACTICE
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Práctica completa de Reglas
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Pregunta {currentIndex + 1} de {questions.length}
          </p>
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
              const isCorrect = answered && index === currentQuestion.correct;
              const isWrong =
                answered &&
                selected === index &&
                index !== currentQuestion.correct;

              return (
                <button
                  key={option}
                  disabled={answered}
                  onClick={() => setSelected(index)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    isCorrect
                      ? "border-[#6fc11f] bg-[#6fc11f]/20"
                      : isWrong
                        ? "border-red-500 bg-red-500/15"
                        : active
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

          {answered && (
            <div className="mt-6 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
              <p className="font-black text-[#6fc11f]">
                {selected === currentQuestion.correct
                  ? "Correcto"
                  : "Incorrecto"}
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {currentQuestion.explanation}
              </p>
            </div>
          )}

          {!answered ? (
            <button
              disabled={selected === null}
              onClick={submitAnswer}
              className="mt-6 w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black disabled:opacity-40"
            >
              RESPONDER
            </button>
          ) : (
            <button
              onClick={nextQuestion}
              className="mt-6 w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
            >
              {currentIndex >= questions.length - 1
                ? "FINALIZAR"
                : "SIGUIENTE"}
            </button>
          )}
        </section>
      </div>
    </AppShell>
  );
}