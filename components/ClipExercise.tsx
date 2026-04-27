"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { calculateScore } from "@/lib/scoring";
import { supabase } from "@/lib/supabase";
import type { Clip } from "@/lib/types";

type ExamAnswer = {
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  score: number;
};

type ClipExerciseProps = {
  clip: Clip;
  examMode?: boolean;
  onComplete?: (data: ExamAnswer) => void;
};

export function ClipExercise({
  clip,
  examMode = false,
  onComplete,
}: ClipExerciseProps) {
  const { user } = useUser();

  const [foul, setFoul] = useState<boolean | null>(null);
  const [restart, setRestart] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [varReview, setVarReview] = useState<boolean | null>(null);
  const [justification, setJustification] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const canSubmit =
    foul !== null && restart !== "" && discipline !== "" && varReview !== null;

  async function submit() {
    if (!canSubmit || isSaving) return;

    const userAnswer = {
      foul,
      restart,
      discipline,
      var: varReview,
    };

    const correctAnswer = {
      foul: clip.correct_foul,
      restart: clip.correct_restart,
      discipline: clip.correct_discipline,
      var: clip.correct_var,
    };

    const score = calculateScore(userAnswer, correctAnswer);

    if (examMode && onComplete) {
      onComplete({
        clipId: clip.id,
        clipTitle: clip.title,
        topic: clip.topic,
        difficulty: clip.difficulty,
        score,
      });

      reset();
      return;
    }

    if (!user) {
      setSaveError("Tenés que iniciar sesión para guardar el intento.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setAiFeedback(null);

    const { error } = await supabase.from("attempts").insert([
      {
        user_id: user.id,
        clip_title: clip.title,
        foul,
        restart,
        discipline,
        var_review: varReview,
        score,
        topic: clip.topic,
        difficulty: clip.difficulty,
        technical_correct: foul === clip.correct_foul,
        restart_correct: restart === clip.correct_restart,
        discipline_correct: discipline === clip.correct_discipline,
        var_correct: varReview === clip.correct_var,
      },
    ]);

    if (error) {
      const message = `${error.code ?? "SIN_CODE"} - ${
        error.message ?? "SIN_MESSAGE"
      } - ${error.details ?? ""}`;

      setSaveError(message);
      setIsSaving(false);
      return;
    }

    setResult(score);
    setIsSaving(false);

    try {
      setLoadingAi(true);

      const aiRes = await fetch("/api/ai-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clipTitle: clip.title,
          topic: clip.topic,
          difficulty: clip.difficulty,
          userAnswer,
          correctAnswer,
          justification,
          explanation: clip.explanation,
          score,
        }),
      });

      const aiData = await aiRes.json();

      if (!aiRes.ok) {
        setAiFeedback("No se pudo generar el feedback IA.");
      } else {
        setAiFeedback(aiData.feedback ?? "Sin feedback IA disponible.");
      }
    } catch (error) {
      console.error("Error generando feedback IA:", error);
      setAiFeedback("No se pudo generar el feedback IA.");
    } finally {
      setLoadingAi(false);
    }
  }

  function reset() {
    setFoul(null);
    setRestart("");
    setDiscipline("");
    setVarReview(null);
    setJustification("");
    setResult(null);
    setSaveError(null);
    setAiFeedback(null);
    setLoadingAi(false);
  }

  if (result !== null && !examMode) {
    return (
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[22px] border border-[#23303b] bg-[#0f171f] p-6">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Resultado del ejercicio
          </p>

          <h2 className="mt-5 text-7xl font-black leading-none text-[#6fc11f]">
            {result}
            <span className="text-2xl text-zinc-400">/100</span>
          </h2>

          <p className="mt-2 text-2xl font-black">
            {result >= 85
              ? "¡Excelente!"
              : result >= 60
                ? "Buen intento"
                : "A revisar"}
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <h3 className="font-black">Respuesta correcta</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Infracción: <b>{clip.correct_foul ? "Sí" : "No"}</b>.
              Reanudación: <b> {clip.correct_restart}</b>. Sanción:{" "}
              <b>{clip.correct_discipline}</b>. VAR:{" "}
              <b>{clip.correct_var ? "Revisable" : "No revisable"}</b>.
            </p>
          </div>

          <button
            onClick={reset}
            className="mt-6 w-full rounded-xl bg-white/10 px-5 py-4 font-black text-white transition hover:bg-white/15"
          >
            REINTENTAR
          </button>
        </section>

        <section className="space-y-4">
          <div className="rounded-[22px] border border-[#23303b] bg-[#0f171f] p-5">
            <h3 className="font-black text-[#6fc11f]">Fundamento</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              {clip.explanation ?? "Sin explicación cargada."}
            </p>
          </div>

          <div className="rounded-[22px] border border-blue-400/25 bg-blue-400/10 p-5">
            <h3 className="font-black text-blue-300">Feedback IA</h3>

            {loadingAi ? (
              <p className="mt-3 text-sm text-zinc-300">
                Generando análisis...
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                {(aiFeedback ?? "Sin feedback IA disponible.")
                  .split("\n")
                  .filter(Boolean)
                  .map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-[#1e2a34] bg-[#0b131b] p-4 shadow-2xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-zinc-300">
            ←
          </button>

          <div>
            <p className="text-sm font-black">
              {examMode ? "Examen - Modo Árbitro" : "Ejercicio - Modo Árbitro"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {clip.topic} · {translateDifficulty(clip.difficulty)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs text-zinc-400">
          <div className="text-right">
            <p className="font-black text-[#6fc11f]">⏱ 00:28</p>
            <p>Tiempo restante</p>
          </div>

          <div className="text-right">
            <p className="font-black text-zinc-200">
              {examMode ? "Examen" : "1/10"}
            </p>
            <p>Modo</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_0.75fr]">
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              className="aspect-video w-full bg-black object-cover"
              src={clip.video_url}
              controls
            />
          </div>

          {clip.description && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-zinc-400">
              {clip.description}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <QuestionCard title="1. ¿Hay infracción?">
            <div className="grid grid-cols-2 gap-3">
              <DecisionButton
                active={foul === true}
                onClick={() => setFoul(true)}
              >
                Sí
              </DecisionButton>

              <DecisionButton
                active={foul === false}
                onClick={() => setFoul(false)}
              >
                No
              </DecisionButton>
            </div>
          </QuestionCard>

          <QuestionCard title="2. Reanudación">
            <select
              value={restart}
              onChange={(e) => setRestart(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#17222b] px-3 py-3 text-sm text-white outline-none"
            >
              <option value="">Seleccioná</option>
              <option>Tiro libre directo</option>
              <option>Tiro libre indirecto</option>
              <option>Penal</option>
              <option>Saque de meta</option>
              <option>Córner</option>
              <option>Balón a tierra</option>
            </select>
          </QuestionCard>

          <QuestionCard title="3. Sanción disciplinaria">
            <div className="grid grid-cols-3 gap-2">
              <DisciplineButton
                label="Sin sanción"
                active={discipline === "Sin sanción"}
                onClick={() => setDiscipline("Sin sanción")}
                color="none"
              />

              <DisciplineButton
                label="Amonestación"
                active={discipline === "Amarilla"}
                onClick={() => setDiscipline("Amarilla")}
                color="yellow"
              />

              <DisciplineButton
                label="Expulsión"
                active={discipline === "Roja"}
                onClick={() => setDiscipline("Roja")}
                color="red"
              />
            </div>
          </QuestionCard>

          <QuestionCard title="4. ¿Aplicable VAR?">
            <div className="grid grid-cols-2 gap-3">
              <DecisionButton
                active={varReview === true}
                onClick={() => setVarReview(true)}
              >
                Sí
              </DecisionButton>

              <DecisionButton
                active={varReview === false}
                onClick={() => setVarReview(false)}
              >
                No
              </DecisionButton>
            </div>
          </QuestionCard>

          {!examMode && (
            <QuestionCard title="5. Justificación (escrita u oral)">
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explica tu decisión..."
                className="min-h-20 w-full rounded-lg border border-white/10 bg-[#17222b] p-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />

              <button className="mt-2 w-full rounded-lg bg-[#17222b] px-3 py-3 text-left text-sm font-black text-zinc-300 hover:bg-white/10">
                🎙 Grabar voz
              </button>
            </QuestionCard>
          )}

          {saveError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {saveError}
            </div>
          )}

          <button
            disabled={!canSubmit || isSaving}
            onClick={submit}
            className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {examMode
              ? "SIGUIENTE PREGUNTA"
              : isSaving
                ? "GUARDANDO..."
                : "Enviar respuesta"}
          </button>
        </section>
      </div>
    </div>
  );
}

function translateDifficulty(value: string) {
  const map: Record<string, string> = {
    easy: "Fácil",
    medium: "Media",
    hard: "Difícil",
  };

  return map[value] ?? value;
}

function QuestionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#101b24] p-3">
      <p className="mb-3 text-sm font-black">{title}</p>
      {children}
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-3 text-sm font-black transition ${
        active
          ? "bg-[#6fc11f] text-black"
          : "bg-[#1b2730] text-zinc-300 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function DisciplineButton({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: "none" | "yellow" | "red";
}) {
  const activeStyle =
    color === "yellow"
      ? "border-yellow-400 bg-yellow-400/20"
      : color === "red"
        ? "border-red-500 bg-red-500/20"
        : "border-[#6fc11f] bg-[#6fc11f]/20";

  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2 py-3 text-center text-[11px] font-black transition ${
        active
          ? activeStyle
          : "border-white/10 bg-[#1b2730] text-zinc-400 hover:bg-white/10"
      }`}
    >
      <span
        className={`mx-auto mb-2 block h-5 w-5 rounded-sm ${
          color === "yellow"
            ? "bg-yellow-400"
            : color === "red"
              ? "bg-red-500"
              : "border border-zinc-400 bg-transparent"
        }`}
      />
      {label}
    </button>
  );
}