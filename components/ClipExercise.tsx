"use client";

import { useEffect, useRef, useState } from "react";
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
  onBack?: () => void;
};

const MAX_VIDEO_PLAYS = 3;

export function ClipExercise({
  clip,
  examMode = false,
  onComplete,
  onBack,
}: ClipExerciseProps) {
  const { user } = useUser();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [foul, setFoul] = useState<boolean | null>(null);
  const [restart, setRestart] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [justification, setJustification] = useState("");
  const [result, setResult] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const [playCount, setPlayCount] = useState(0);

  const remainingPlays = Math.max(MAX_VIDEO_PLAYS - playCount, 0);
  const videoLocked = remainingPlays <= 0;

  const canSubmit = foul !== null && restart !== "" && discipline !== "";

  useEffect(() => {
    const savedCount = Number(localStorage.getItem(`clip-plays-${clip.id}`) ?? "0");
    setPlayCount(savedCount);
    reset(false);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [clip.id]);

  function handleVideoPlay() {
    if (videoLocked) {
      videoRef.current?.pause();
      return;
    }

    const nextCount = playCount + 1;
    setPlayCount(nextCount);
    localStorage.setItem(`clip-plays-${clip.id}`, String(nextCount));
  }

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }

    window.history.back();
  }

  async function submit() {
    if (!canSubmit || isSaving) return;

    const userAnswer = {
      foul,
      restart,
      discipline,
      var: clip.correct_var,
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
        var_review: clip.correct_var,
        score,
        topic: clip.topic,
        difficulty: clip.difficulty,
        technical_correct: foul === clip.correct_foul,
        restart_correct: restart === clip.correct_restart,
        discipline_correct: discipline === clip.correct_discipline,
        var_correct: null,
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

  function reset(resetVideoCount = false) {
    setFoul(null);
    setRestart("");
    setDiscipline("");
    setJustification("");
    setResult(null);
    setSaveError(null);
    setAiFeedback(null);
    setLoadingAi(false);

    if (resetVideoCount) {
      setPlayCount(0);
      localStorage.setItem(`clip-plays-${clip.id}`, "0");
    }
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
            {result >= 85 ? "¡Excelente!" : result >= 60 ? "Buen intento" : "A revisar"}
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <h3 className="font-black">Respuesta correcta</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Infracción: <b>{clip.correct_foul ? "Sí" : "No"}</b>.
              Reanudación: <b> {clip.correct_restart}</b>. Sanción:{" "}
              <b>{clip.correct_discipline}</b>.
            </p>
          </div>

          <button
            onClick={() => reset(false)}
            className="mt-6 w-full rounded-xl bg-white/10 px-5 py-4 font-black text-white transition hover:bg-white/15"
          >
            REINTENTAR RESPUESTA
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
              <p className="mt-3 text-sm text-zinc-300">Generando análisis...</p>
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
          <button
            onClick={handleBack}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            ←
          </button>

          <div>
            <p className="text-sm font-black">
              {examMode ? "Examen - Modo Árbitro" : "Ejercicio - Modo Árbitro"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{clip.topic}</p>
          </div>
        </div>

        <div className="text-right text-xs">
          <p className="font-black text-[#6fc11f]">
            {remainingPlays}/{MAX_VIDEO_PLAYS}
          </p>
          <p className="text-zinc-400">Reproducciones disponibles</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_0.75fr]">
        <section className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black object-cover"
              src={clip.video_url}
              controls={!videoLocked}
              playsInline
              onPlay={handleVideoPlay}
            />

            {videoLocked && (
              <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
                <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-300">
                  <p className="text-lg font-black">Límite alcanzado</p>
                  <p className="mt-2 text-sm">
                    Ya usaste las 3 reproducciones disponibles para este clip.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-4 text-sm text-zinc-300">
            Tenés <b className="text-[#6fc11f]">3 reproducciones</b> para analizar
            este video. Una vez agotadas, podés responder, pero no volver a
            reproducirlo.
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
              <DecisionButton active={foul === true} onClick={() => setFoul(true)}>
                Sí
              </DecisionButton>

              <DecisionButton active={foul === false} onClick={() => setFoul(false)}>
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
              <option>Continuar juego</option>
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

          {!examMode && (
            <QuestionCard title="4. Justificación escrita">
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explicá tu decisión..."
                className="min-h-20 w-full rounded-lg border border-white/10 bg-[#17222b] p-3 text-sm text-white outline-none placeholder:text-zinc-600"
              />
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