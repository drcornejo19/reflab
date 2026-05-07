"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type ClipWithDetails = Clip & {
  sub_type?: string | null;
  decision_detail?: string | null;
};

const MAX_VIDEO_PLAYS = 3;

const foulRestartOptions = [
  "Tiro libre directo",
  "Tiro libre indirecto",
  "Penal",
];

const noFoulRestartOptions = [
  "Seguir el juego",
  "Saque de meta",
  "Saque de esquina",
  "Saque de banda",
  "Gol",
  "Balón a tierra",
];

export function ClipExercise({
  clip,
  examMode = false,
  onComplete,
  onBack,
}: ClipExerciseProps) {
  const typedClip = clip as ClipWithDetails;

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

  const isOffside = typedClip.topic === "Offside";
  const isVarClip = typedClip.topic === "VAR";
  const isNoOffside =
    typedClip.topic === "Offside" && typedClip.sub_type === "no_offside";

  const restartOptions = useMemo(() => {
    if (foul === true) return foulRestartOptions;
    if (foul === false) return noFoulRestartOptions;
    return [...foulRestartOptions, ...noFoulRestartOptions];
  }, [foul]);

  const remainingPlays = Math.max(MAX_VIDEO_PLAYS - playCount, 0);
  const videoLocked = remainingPlays <= 0;

  const canSubmit = foul !== null && restart !== "" && discipline !== "";

  useEffect(() => {
    const savedCount = Number(
      localStorage.getItem(`clip-plays-${typedClip.id}`) ?? "0"
    );

    setPlayCount(savedCount);
    reset(false);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [typedClip.id]);

  useEffect(() => {
    if (isNoOffside) {
      setFoul(false);
      setRestart("Seguir el juego");
      setDiscipline("Sin sanción");
    }
  }, [isNoOffside]);

  useEffect(() => {
    if (foul === true && !foulRestartOptions.includes(restart)) {
      setRestart("Tiro libre directo");
    }

    if (foul === false && !noFoulRestartOptions.includes(restart)) {
      setRestart("Seguir el juego");
      setDiscipline("Sin sanción");
    }
  }, [foul, restart]);

  function handleVideoPlay() {
    if (videoLocked) {
      videoRef.current?.pause();
      return;
    }

    const nextCount = playCount + 1;

    setPlayCount(nextCount);
    localStorage.setItem(`clip-plays-${typedClip.id}`, String(nextCount));
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
      var: typedClip.correct_var,
    };

    const correctAnswer = {
      foul: typedClip.correct_foul,
      restart: typedClip.correct_restart,
      discipline: typedClip.correct_discipline,
      var: typedClip.correct_var,
    };

    const score = calculateScore(userAnswer, correctAnswer);

    if (examMode && onComplete) {
      onComplete({
        clipId: typedClip.id,
        clipTitle: typedClip.title,
        topic: typedClip.topic,
        difficulty: typedClip.difficulty,
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
        clip_title: typedClip.title,
        foul,
        restart,
        discipline,
        var_review: typedClip.correct_var,
        score,
        topic: typedClip.topic,
        difficulty: typedClip.difficulty,
        technical_correct: foul === typedClip.correct_foul,
        restart_correct: restart === typedClip.correct_restart,
        discipline_correct: discipline === typedClip.correct_discipline,
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
          clipTitle: typedClip.title,
          topic: typedClip.topic,
          subType: typedClip.sub_type,
          decisionDetail: typedClip.decision_detail,
          difficulty: typedClip.difficulty,
          userAnswer,
          correctAnswer,
          justification,
          explanation: typedClip.explanation,
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
      localStorage.setItem(`clip-plays-${typedClip.id}`, "0");
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
            {result >= 85
              ? "¡Excelente!"
              : result >= 60
                ? "Buen intento"
                : "A revisar"}
          </p>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-4">
            <h3 className="font-black">Respuesta correcta</h3>

            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Infracción:{" "}
              <b>{typedClip.correct_foul ? "Sí" : "No"}</b>. Reanudación:{" "}
              <b>{typedClip.correct_restart}</b>. Sanción:{" "}
              <b>{typedClip.correct_discipline}</b>.
            </p>

            {typedClip.sub_type && (
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Tipo: <b>{labelFromValue(typedClip.sub_type)}</b>
              </p>
            )}

            {typedClip.decision_detail && (
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Detalle: <b>{labelFromValue(typedClip.decision_detail)}</b>
              </p>
            )}
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
              {typedClip.explanation ?? "Sin explicación cargada."}
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

            <p className="mt-1 text-xs text-zinc-500">
              {typedClip.topic}
              {typedClip.sub_type
                ? ` · ${labelFromValue(typedClip.sub_type)}`
                : ""}
            </p>
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
              src={typedClip.video_url}
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
            Tenés <b className="text-[#6fc11f]">3 reproducciones</b> para
            analizar este video. Una vez agotadas, podés responder, pero no
            volver a reproducirlo.
          </div>

          {typedClip.description && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-zinc-400">
              {typedClip.description}
            </p>
          )}
        </section>

        <section className="space-y-3">
          <QuestionCard
            title={
              isOffside
                ? "1. ¿Existe fuera de juego?"
                : "1. ¿Hay infracción?"
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <DecisionButton
                active={foul === true}
                onClick={() => {
                  setFoul(true);
                  setRestart("Tiro libre directo");
                }}
              >
                Sí
              </DecisionButton>

              <DecisionButton
                active={foul === false}
                onClick={() => {
                  setFoul(false);
                  setRestart("Seguir el juego");
                  setDiscipline("Sin sanción");
                }}
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

              {restartOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
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
                label="Amarilla"
                active={discipline === "Amarilla"}
                onClick={() => setDiscipline("Amarilla")}
                color="yellow"
              />

              <DisciplineButton
                label="Roja"
                active={discipline === "Roja"}
                onClick={() => setDiscipline("Roja")}
                color="red"
              />
            </div>
          </QuestionCard>

          {isVarClip && (
            <QuestionCard title="4. Modo VAR">
              <div className="rounded-xl border border-blue-400/20 bg-blue-400/10 p-4 text-sm leading-6 text-blue-200">
                <p>
                  Situación VAR:{" "}
                  <b>
                    {typedClip.sub_type
                      ? labelFromValue(typedClip.sub_type)
                      : "Sin subtipo cargado"}
                  </b>
                </p>

                {typedClip.decision_detail && (
                  <p className="mt-2">
                    Detalle:{" "}
                    <b>{labelFromValue(typedClip.decision_detail)}</b>
                  </p>
                )}
              </div>
            </QuestionCard>
          )}

          {!examMode && (
            <QuestionCard title={isVarClip ? "5. Justificación escrita" : "4. Justificación escrita"}>
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

function labelFromValue(value?: string | null) {
  if (!value) return "";

  const dictionary: Record<string, string> = {
    Dispute: "Disputas",
    "Tactical foul": "Faltas tácticas",
    Offside: "Fuera de juego",
    Handball: "Manos",
    VAR: "VAR",

    no_offside: "No fuera de juego",
    interferir_juego: "Interfiere en el juego",
    interferir_adversario: "Interfiere en el adversario",
    sacar_ventaja: "Saca ventaja de su posición",

    inmediatez: "Mano de inmediatez",
    deliberada: "Mano deliberada",
    bloqueo: "Mano de bloqueo",
    no_sancionable: "No sancionable",

    check_complete: "Check complete",
    review_recommended: "Review recommended",
    on_field_review: "On-field review",
    confirm_decision: "Confirm decision",
    overturn_decision: "Overturn decision",
    app_review: "APP review",
    factual_review: "Factual review",
    subjective_review: "Subjective review",

    movimiento_justificado: "Movimiento justificado",
    movimiento_no_justificado: "Movimiento no justificado",
    brazo_amplia_cuerpo: "Brazo amplía el volumen corporal",
    brazo_apoyo: "Brazo de apoyo",
  };

  return dictionary[value] ?? value;
}