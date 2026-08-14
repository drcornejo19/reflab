"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SPORT_TYPE } from "@/lib/sports";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";

const MAX_VIDEO_PLAYS = 2;

type ExamQuestion = {
  occurrenceId: string;
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  topic: string;
  difficulty: string;
};

type ExamSession = {
  id: string;
  submissionId: string;
  questions: ExamQuestion[];
};

type Answer = {
  occurrenceId: string;
  foul: boolean;
  restart: string;
  discipline: string;
  offsideReason: string | null;
  handballReason: string | null;
};

type CompletedAttempt = {
  occurrenceId: string;
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  selectedDecision: string;
  selectedRestart: string;
  selectedDiscipline: string;
  score: number;
  isCorrect: boolean;
};

type SubmissionResult = {
  examResultId: string;
  examSessionId: string;
  submissionId: string;
  avgScore: number;
  correctCount: number;
  totalQuestions: number;
  idempotentReplay: boolean;
  attempts: CompletedAttempt[];
};

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
  "Balon a tierra",
];

const offsideReasonOptions = [
  "interferir_juego",
  "interferir_adversario",
  "sacar_ventaja",
];

const handballReasonOptions = ["inmediatez", "bloqueo", "deliberada"];

export function ExamClient() {
  const sessionRequestStarted = useRef(false);
  const [session, setSession] = useState<ExamSession | null>(null);
  const [clips, setClips] = useState<ExamQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoPlays, setVideoPlays] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [freeExamLimitReached, setFreeExamLimitReached] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);
  const [completedAttempts, setCompletedAttempts] = useState<CompletedAttempt[]>([]);

  const [foul, setFoul] = useState<boolean | null>(null);
  const [restart, setRestart] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [offsideReason, setOffsideReason] = useState("");
  const [handballReason, setHandballReason] = useState("");

  const [answers, setAnswers] = useState<Answer[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const currentClip = clips[index];
  const remainingVideoPlays = Math.max(MAX_VIDEO_PLAYS - videoPlays, 0);
  const videoLocked = remainingVideoPlays <= 0;

  const isOffsideClip = currentClip?.topic === "Offside";
  const isHandballClip = currentClip?.topic === "Handball";

  const mustAnswerOffsideReason = isOffsideClip && foul === true;
  const mustAnswerHandballReason = isHandballClip && foul === true;

  const restartOptions = useMemo(() => {
    if (foul === true) return foulRestartOptions;
    if (foul === false) return noFoulRestartOptions;
    return [];
  }, [foul]);

  const canSubmit =
    foul !== null &&
    restart !== "" &&
    discipline !== "" &&
    (!mustAnswerOffsideReason || offsideReason !== "") &&
    (!mustAnswerHandballReason || handballReason !== "");

  const examStats = useMemo(() => {
    const avgScore = submissionResult?.avgScore ?? 0;
    return {
      totalScore: completedAttempts.reduce(
        (total, attempt) => total + attempt.score,
        0
      ),
      avgScore,
      correctCount: submissionResult?.correctCount ?? 0,
      level: getExamLevel(avgScore),
    };
  }, [completedAttempts, submissionResult]);

  useEffect(() => {
    if (sessionRequestStarted.current) return;
    sessionRequestStarted.current = true;

    async function startExam() {
      try {
        const response = await fetch("/api/exams/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sportType: DEFAULT_SPORT_TYPE }),
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.error === "weekly_exam_limit_reached") {
            setFreeExamLimitReached(true);
          } else {
            setLoadError(publicApiMessage(payload));
          }
          return;
        }
        setSession(payload.session as ExamSession);
        setClips((payload.session?.questions ?? []) as ExamQuestion[]);
      } catch {
        setLoadError("No se pudo iniciar la evaluacion.");
      } finally {
        setLoading(false);
      }
    }

    void startExam();
  }, []);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [index, finished]);

  useEffect(() => {
    setVideoPlays(0);
  }, [currentClip?.id]);

  useEffect(() => {
    if (!currentClip) return;

    if (foul === true && !foulRestartOptions.includes(restart)) {
      setRestart(
        currentClip.topic === "Offside"
          ? "Tiro libre indirecto"
          : "Tiro libre directo"
      );

      if (currentClip.topic === "Offside") {
        setDiscipline("Sin sancion");
      }
    }

    if (foul === false && !noFoulRestartOptions.includes(restart)) {
      setRestart("Seguir el juego");
      setDiscipline("Sin sancion");
      setOffsideReason("");
      setHandballReason("");
    }

    


  }, [foul, restart, currentClip]);

  async function generateAIAnalysis() {
    setLoadingAi(true);

    const res = await fetch("/api/ai-exam-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sportType: DEFAULT_SPORT_TYPE,
        answers: answers.map((answer) => ({
          clipId: clips.find((clip) => clip.occurrenceId === answer.occurrenceId)?.id,
          foul: answer.foul,
          restart: answer.restart,
          discipline: answer.discipline,
        })),
      }),
    });

    const data = await res.json();

    if (data.feedback) {
      setAiAnalysis(data.feedback);
    } else {
      setAiAnalysis("No se pudo generar analisis IA.");
    }

    setLoadingAi(false);
  }

  function handleVideoPlay(event: React.SyntheticEvent<HTMLVideoElement>) {
  if (videoLocked) {
    event.currentTarget.pause();
    event.currentTarget.currentTime = 0;
  }
}

function handleVideoEnded() {
  setVideoPlays((prev) => Math.min(prev + 1, MAX_VIDEO_PLAYS));
}

  async function submitAnswer() {
    if (!currentClip || !session || !canSubmit || foul === null || saving) return;
    const answer: Answer = {
      occurrenceId: currentClip.occurrenceId,
      foul,
      restart,
      discipline,
      offsideReason: offsideReason || null,
      handballReason: handballReason || null,
    };
    const nextAnswers = [...answers, answer];
    if (index >= clips.length - 1) {
      setSaving(true);
      setSubmitError(null);
      try {
        const response = await fetch(`/api/exams/sessions/${session.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_id: session.submissionId,
            answers: nextAnswers.map((item) => ({
              occurrence_id: item.occurrenceId,
              foul: item.foul,
              restart: item.restart,
              discipline: item.discipline,
              offside_reason: item.offsideReason,
              handball_reason: item.handballReason,
            })),
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          setSubmitError(publicApiMessage(payload));
          return;
        }
        const result = payload.result as SubmissionResult;
        setAnswers(nextAnswers);
        setSubmissionResult(result);
        setCompletedAttempts(result.attempts);
        setFinished(true);
        resetInputs();
      } catch {
        setSubmitError("No se pudo guardar la evaluacion. Podes reintentar de forma segura.");
      } finally {
        setSaving(false);
      }
      return;
    }
    setAnswers(nextAnswers);
    resetInputs();
    setIndex((previous) => previous + 1);
  }

  function resetInputs() {
    setFoul(null);
    setRestart("");
    setDiscipline("");
    setOffsideReason("");
    setHandballReason("");
  }

  function restartExam() {
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-zinc-400 sm:p-8">
        Cargando examen...
      </div>
    );
  }

  if (freeExamLimitReached) {
    return (
      <ProUpgradeCard
        title="Ya usaste tu examen gratuito de esta semana"
        description="El plan Basic permite 1 examen semanal. RefLab Pro desbloquea evaluaciones ilimitadas."
        reason="Limite Basic: 1 examen por semana."
      />
    );
  }

  if (loadError || clips.length === 0) {
    return (
      <div className="rounded-3xl border border-red-400/20 bg-red-400/10 p-4 text-red-100 sm:p-8">
        {loadError ?? "No hay clips suficientes para iniciar la evaluacion."}
      </div>
    );
  }

  if (finished) {
    return (
      <div className="grid max-w-full gap-5 overflow-hidden lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        <section className="min-w-0 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 sm:p-6 lg:p-8">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
            Resultado final
          </p>

          <h2 className="mt-4 break-words text-5xl font-black sm:text-6xl lg:text-7xl">
            {examStats.avgScore}/100
          </h2>

          <p className="mt-3 break-words text-2xl font-black text-[#6fc11f] sm:text-3xl">
            {examStats.level}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4 lg:mt-8">
            <FinalStat title="Preguntas" value={completedAttempts.length.toString()} />
            <FinalStat
              title="Aprobadas"
              value={examStats.correctCount.toString()}
            />
            <FinalStat title="Score total" value={examStats.totalScore.toString()} />
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:mt-8 lg:flex-row">
            <div className="flex-1 space-y-3">
              <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-5 py-4 text-center font-black text-[#6fc11f]">
                EVALUACION GUARDADA
              </div>

              <button
                onClick={generateAIAnalysis}
                className="min-h-14 w-full rounded-2xl bg-blue-500 px-5 py-4 font-black text-white hover:bg-blue-600"
              >
                ANALIZAR CON IA
              </button>

              {loadingAi && (
                <p className="mt-4 text-sm text-zinc-400">
                  Analizando desempeno...
                </p>
              )}

              {aiAnalysis && (
                <div className="mt-4 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-6">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                    Analisis IA del examen
                  </p>

                  <div className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-200">
                    {aiAnalysis.split("\n").map((line, i) => (
                      <p key={i} className="mb-2">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={restartExam}
              className="min-h-14 flex-1 rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
            >
              NUEVO EXAMEN
            </button>
          </div>
        </section>

        <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
          <h3 className="text-xl font-black">Detalle del examen</h3>

          <div className="mt-6 space-y-3">
            {completedAttempts.map((a, i) => (
              <div
                key={`${a.clipId}-${i}`}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex min-w-0 justify-between gap-3 sm:gap-4">
                  <div>
                    <p className="font-black">
                      {i + 1}. {a.clipTitle}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      {a.topic} - {translateDifficulty(a.difficulty)}
                    </p>
                  </div>

                  <p
                    className={`text-2xl font-black ${
                      a.score >= 85
                        ? "text-[#6fc11f]"
                        : a.score >= 60
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {a.score}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
              Examen en curso
            </p>

            <h2 className="mt-2 break-words text-xl font-black sm:text-2xl">
              Pregunta {index + 1} de {clips.length}
            </h2>
          </div>

          <div className="h-3 w-full rounded-full bg-white/10 md:w-80">
            <div
              className="h-3 rounded-full bg-[#6fc11f]"
              style={{ width: `${((index + 1) / clips.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid max-w-full gap-5 overflow-hidden lg:grid-cols-[1.35fr_0.9fr] lg:gap-6">
        <section className="max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="mb-4 flex min-w-0 flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6fc11f]">
                Clip de examen
              </p>

              <h1 className="mt-2 break-words text-xl font-black sm:text-2xl">
                {labelFromValue(currentClip.topic)}
              </h1>

              <p className="mt-1 text-xs text-zinc-500">
                Analiza la accion y selecciona la decision correcta.
              </p>
            </div>

            <span className="rounded-full border border-[#6fc11f]/40 px-3 py-1 text-xs font-bold text-[#6fc11f]">
              {translateDifficulty(currentClip.difficulty)}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-black">
  <video
    className="aspect-video w-full max-w-full bg-black object-contain"
    src={currentClip.videoUrl}
    controls={!videoLocked}
    onPlay={handleVideoPlay}
    onEnded={handleVideoEnded}
  />

  {videoLocked && (
    <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-300">
        <p className="text-lg font-black">Limite alcanzado</p>
        <p className="mt-2 text-sm">
          Ya viste este video 2 veces. Ahora tenes que tomar la decision.
        </p>
      </div>
    </div>
  )}
</div>

<p className="mt-3 text-xs font-bold text-zinc-400">
  Reproducciones disponibles:{" "}
  <span className="text-[#6fc11f]">
    {remainingVideoPlays}/{MAX_VIDEO_PLAYS}
  </span>
</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <InfoBox title="Tema" value={labelFromValue(currentClip.topic)} />
            <InfoBox title="Modo" value="Examen" />
            <InfoBox title="Feedback" value="Al final" />
          </div>
        </section>

        <section className="max-w-full overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
          <div className="space-y-6">
            <DecisionBlock
              title={
                currentClip.topic === "Offside"
                  ? "1. Existe fuera de juego?"
                  : "1. Hubo infraccion?"
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <DecisionButton
                  active={foul === true}
                  onClick={() => {
                    setFoul(true);

                    if (currentClip.topic === "Offside") {
                      setRestart("Tiro libre indirecto");
                      setDiscipline("Sin sancion");
                    } else {
                      setRestart("Tiro libre directo");
                    }
                  }}
                >
                  SI
                </DecisionButton>

                <DecisionButton
                  active={foul === false}
                  onClick={() => {
                    setFoul(false);
                    setRestart("Seguir el juego");
                    setDiscipline("Sin sancion");
                    setOffsideReason("");
                    setHandballReason("");
                  }}
                >
                  NO
                </DecisionButton>
              </div>
            </DecisionBlock>

            <DecisionBlock title="2. Reanudacion">
              <select
                value={restart}
                disabled={foul === null || currentClip.topic === "Offside"}
                onChange={(e) => setRestart(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="">
                  {foul === null
                    ? "Primero selecciona si hubo infraccion"
                    : "Selecciona una opcion"}
                </option>

                {restartOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </DecisionBlock>

            {mustAnswerOffsideReason && (
              <DecisionBlock title="3. Motivo del fuera de juego">
                <div className="grid gap-3">
                  {offsideReasonOptions.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setOffsideReason(reason)}
                      className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                        offsideReason === reason
                          ? "bg-[#6fc11f] text-black"
                          : "bg-white/10 text-zinc-300 hover:bg-white/15"
                      }`}
                    >
                      {labelFromValue(reason)}
                    </button>
                  ))}
                </div>
              </DecisionBlock>
            )}

            {mustAnswerHandballReason && (
              <DecisionBlock title="3. Tipo de mano">
                <div className="grid gap-3">
                  {handballReasonOptions.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => setHandballReason(reason)}
                      className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                        handballReason === reason
                          ? "bg-[#6fc11f] text-black"
                          : "bg-white/10 text-zinc-300 hover:bg-white/15"
                      }`}
                    >
                      {labelFromValue(reason)}
                    </button>
                  ))}
                </div>
              </DecisionBlock>
            )}

            <DecisionBlock
              title={
                mustAnswerOffsideReason || mustAnswerHandballReason
                  ? "4. Sancion disciplinaria"
                  : "3. Sancion disciplinaria"
              }
            >
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
                {["Sin sancion", "Amarilla", "Roja"].map((item) => (
                  <button
                    key={item}
                    disabled={currentClip.topic === "Offside"}
                    onClick={() => setDiscipline(item)}
                    className={`rounded-xl px-3 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      discipline === item
                        ? item === "Amarilla"
                          ? "bg-yellow-400 text-black"
                          : item === "Roja"
                            ? "bg-red-600 text-white"
                            : "bg-[#6fc11f] text-black"
                        : "bg-white/10 text-zinc-300 hover:bg-white/15"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </DecisionBlock>

            {submitError && (
              <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-bold text-red-100">
                {submitError}
              </p>
            )}

            <button
              disabled={!canSubmit || saving}
              onClick={() => void submitAnswer()}
              className="min-h-14 w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "GUARDANDO EVALUACION..."
                : index === clips.length - 1
                  ? submitError ? "REINTENTAR ENTREGA" : "FINALIZAR Y GUARDAR"
                : "SIGUIENTE PREGUNTA"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
function getExamLevel(avg: number) {
  if (avg >= 90) return "Nivel FIFA";
  if (avg >= 80) return "Nivel Elite";
  if (avg >= 70) return "Nivel Nacional";
  if (avg >= 60) return "Nivel Regional";
  return "Nivel Inicial";
}

function translateDifficulty(value: string) {
  const map: Record<string, string> = {
    easy: "Facil",
    medium: "Media",
    hard: "Dificil",
  };

  return map[value] ?? value;
}

function labelFromValue(value?: string | null) {
  if (!value) return "";

  const dictionary: Record<string, string> = {
    Dispute: "Disputas",
    "Tactical foul": "Faltas tacticas",
    Offside: "Fuera de juego",
    Handball: "Manos",
    VAR: "VAR",

    no_offside: "No fuera de juego",
    interferir_juego: "Interfiere en el juego",
    interferir_adversario: "Interfiere en el adversario",
    sacar_ventaja: "Saca ventaja de su posicion",

    inmediatez: "Mano de inmediatez",
    deliberada: "Mano deliberada",
    bloqueo: "Mano de bloqueo",
    no_sancionable: "No sancionable",
  };

  return dictionary[value] ?? value;
}

function publicApiMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "No se pudo completar la evaluacion.";
  const message = (payload as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : "No se pudo completar la evaluacion.";
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-black/30 p-3 sm:p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function DecisionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 font-black">{title}</p>
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
      className={`rounded-xl px-4 py-3 font-black transition ${
        active
          ? "bg-[#6fc11f] text-black"
          : "bg-white/10 text-zinc-300 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

function FinalStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-black/30 p-3 sm:p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 break-words text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}

