"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { rulesQuestions } from "@/lib/rulesQuestions";

export default function RulesExamPage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = rulesQuestions[currentIndex];

  function nextQuestion() {
    if (selected === question.correct) {
      setScore((prev) => prev + 1);
    }

    setSelected(null);

    if (currentIndex >= rulesQuestions.length - 1) {
      setFinished(true);
      return;
    }

    setCurrentIndex((prev) => prev + 1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  if (finished) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[900px] rounded-3xl border border-white/10 bg-[#0b131b] p-8">
          <p className="text-xs font-black tracking-[0.35em] text-[#6fc11f]">
            REGLAS DE JUEGO
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Examen finalizado
          </h1>

          <p className="mt-6 text-2xl font-black text-[#6fc11f]">
            {score} / {rulesQuestions.length}
          </p>

          <p className="mt-2 text-zinc-400">
            Respuestas correctas.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[900px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black tracking-[0.35em] text-[#6fc11f]">
            REFLAB RULES EXAM
          </p>

          <h1 className="mt-3 text-4xl font-black">
            Examen Reglas de Juego
          </h1>

          <p className="mt-2 text-zinc-400">
            Pregunta {currentIndex + 1} de {rulesQuestions.length}
          </p>
        </header>

        <div className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <p className="text-lg font-bold leading-8">
            {question.question}
          </p>

          <div className="mt-6 space-y-3">
            {question.options.map((option, index) => {
              const active = selected === index;

              return (
                <button
                  key={option}
                  onClick={() => setSelected(index)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    active
                      ? "border-[#6fc11f] bg-[#6fc11f]/10"
                      : "border-white/10 bg-white/[0.03]"
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
            SIGUIENTE
          </button>
        </div>
      </div>
    </AppShell>
  );
}