"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { insertAttemptSafely } from "@/lib/attemptPersistence";
import { futsalRulesPracticeQuestions } from "@/lib/futsalRulesQuestions";
import { resolveRefCardId } from "@/lib/refCard";
import { useSupabase } from "@/components/SupabaseProvider";

const FREE_LIMIT = 10;

export function FutsalRulesPracticeClient() {
  const supabase = useSupabase();
  const { user } = useUser();
  const questions = futsalRulesPracticeQuestions.slice(0, FREE_LIMIT);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  const currentQuestion = questions[currentIndex];

  async function submitAnswer() {
    if (selected === null || answered) return;

    const isCorrect = selected === currentQuestion.correct;
    if (isCorrect) {
      setCorrectCount((prev) => prev + 1);
    }

    setAnswered(true);

    if (!user) return;

    setSaving(true);

    const profileRes = await supabase
      .from("user_profiles")
      .select("ref_card_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const refCardId = resolveRefCardId(user.id, profileRes.data);

    await insertAttemptSafely(
      supabase,
      {
        user_id: user.id,
        sport_type: "futsal",
        activity_type: "rules_practice",
        ref_card_id: refCardId,
        module: "futsal_rules",
        mode: "training",
        topic: currentQuestion.topic,
        subtopic: currentQuestion.subtopic ?? null,
        rule_reference: currentQuestion.rule_reference,
        season: currentQuestion.season,
        source_version: currentQuestion.source_version,
        difficulty: currentQuestion.difficulty,
        score: isCorrect ? 100 : 0,
        is_correct: isCorrect,
        selected_decision:
          selected === null ? null : currentQuestion.options[selected],
        correct_decision: currentQuestion.options[currentQuestion.correct],
        technical_correct: isCorrect,
        criterion_result: {
          question_id: currentQuestion.id,
          selected_option: selected,
          correct_option: currentQuestion.correct,
          source_official: currentQuestion.source_official,
        },
        feedback: `Trivia futsal: ${isCorrect ? "correcta" : "incorrecta"}`,
      },
      {
        user_id: user.id,
        sport_type: "futsal",
        activity_type: "rules_practice",
        topic: currentQuestion.topic,
        subtopic: currentQuestion.subtopic ?? null,
        rule_reference: currentQuestion.rule_reference,
        season: currentQuestion.season,
        source_version: currentQuestion.source_version,
        difficulty: currentQuestion.difficulty,
        score: isCorrect ? 100 : 0,
        technical_correct: isCorrect,
      }
    );

    setSaving(false);
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

  if (finished) {
    const percentage = Math.round((correctCount / questions.length) * 100);

    return (
      <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
          TRIVIA FIFA FUTSAL
        </p>

        <h2 className="mt-4 text-4xl font-black">Practica finalizada</h2>
        <p className="mt-6 text-5xl font-black text-[#16b8ff]">
          {percentage}%
        </p>
        <p className="mt-2 text-zinc-400">
          {correctCount} respuestas correctas de {questions.length}.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded-2xl bg-[#16b8ff] px-6 py-4 font-black text-black"
        >
          PRACTICAR DE NUEVO
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-[#16b8ff]">
          TRIVIA FIFA FUTSAL
        </p>

        <h2 className="mt-3 text-4xl font-black">
          Trivia de Reglas FIFA Futsal
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          Pregunta {currentIndex + 1} de {questions.length} - feedback inmediato
        </p>
      </header>

      <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="inline-flex rounded-full border border-[#16b8ff]/30 bg-[#16b8ff]/10 px-4 py-2 text-xs font-black text-[#16b8ff]">
            {currentQuestion.lawReference}
          </span>
          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-300">
            {currentQuestion.difficulty}
          </span>
          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-400">
            {currentQuestion.topic}
          </span>
        </div>

        <p className="text-lg font-bold leading-8">{currentQuestion.question}</p>

        <div className="mt-6 space-y-3">
          {currentQuestion.options.map((option, index) => {
            const active = selected === index;
            const isCorrect = answered && index === currentQuestion.correct;
            const isWrong =
              answered && selected === index && index !== currentQuestion.correct;

            return (
              <button
                key={`${currentQuestion.id}-${option}`}
                disabled={answered}
                onClick={() => setSelected(index)}
                className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                  isCorrect
                    ? "border-[#16b8ff] bg-[#16b8ff]/20"
                    : isWrong
                      ? "border-red-500 bg-red-500/15"
                      : active
                        ? "border-[#16b8ff] bg-[#16b8ff]/10"
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
          <div className="mt-6 rounded-2xl border border-[#16b8ff]/25 bg-[#16b8ff]/10 p-5">
            <p className="font-black text-[#16b8ff]">
              {selected === currentQuestion.correct ? "Correcto" : "Incorrecto"}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {currentQuestion.explanation}
            </p>
            <p className="mt-3 border-t border-[#16b8ff]/20 pt-3 text-sm leading-6 text-zinc-400">
              <strong className="text-white">Fundamento FIFA:</strong>{" "}
              {currentQuestion.officialExplanation ?? currentQuestion.ifabExplanation}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
              {currentQuestion.source_version}
            </p>
          </div>
        )}

        {!answered ? (
          <button
            disabled={selected === null || saving}
            onClick={submitAnswer}
            className="mt-6 w-full rounded-2xl bg-[#16b8ff] px-5 py-4 font-black text-black disabled:opacity-40"
          >
            {saving ? "GUARDANDO..." : "RESPONDER"}
          </button>
        ) : (
          <button
            onClick={nextQuestion}
            className="mt-6 w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
          >
            {currentIndex >= questions.length - 1 ? "FINALIZAR" : "SIGUIENTE"}
          </button>
        )}
      </section>
    </div>
  );
}


