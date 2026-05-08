"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import type { Clip } from "@/lib/types";
import { calculateScore } from "@/lib/scoring";

const TOTAL_QUESTIONS = 10;
const MAX_VIDEO_PLAYS = 2;

type ClipWithDetails = Clip & {
  sub_type?: string | null;
  decision_detail?: string | null;
};

type Answer = {
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  foul: boolean | null;
  restart: string;
  discipline: string;
  offsideReason?: string;
  handballReason?: string;
  technicalCorrect: boolean;
  restartCorrect: boolean;
  disciplineCorrect: boolean;
  subtypeCorrect: boolean | null;
  score: number;
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
  "Balón a tierra",
];

const offsideReasonOptions = [
  "interferir_juego",
  "interferir_adversario",
  "sacar_ventaja",
];

const handballReasonOptions = ["inmediatez", "bloqueo", "deliberada"];

export function ExamClient() {
  const { user } = useUser();

  const [clips, setClips] = useState<ClipWithDetails[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [videoPlays, setVideoPlays] = useState(0);

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
    const totalScore = answers.reduce((acc, a) => acc + a.score, 0);
    const avgScore =
      answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
    const correctCount = answers.filter((a) => a.score >= 85).length;

    return {
      totalScore,
      avgScore,
      correctCount,
      level: getExamLevel(avgScore),
    };
  }, [answers]);

  useEffect(() => {
    async function loadClips() {
      const { data, error } = await supabase.from("clips").select("*");

      if (error) {
        console.error("Error cargando clips:", error);
        setClips([]);
      } else {
        const shuffled = [...((data ?? []) as ClipWithDetails[])].sort(
          () => Math.random() - 0.5
        );

        setClips(shuffled.slice(0, TOTAL_QUESTIONS));
      }

      setLoading(false);
    }

    loadClips();
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

    const isNoOffside =
      currentClip.topic === "Offside" && currentClip.sub_type === "no_offside";

    const isNoHandball =
      currentClip.topic === "Handball" &&
      currentClip.sub_type === "no_sancionable";

    if (isNoOffside || isNoHandball) {
      setFoul(false);
      setRestart("Seguir el juego");
      setDiscipline("Sin sanción");
      setOffsideReason("");
      setHandballReason("");
    }
  }, [currentClip]);

  useEffect(() => {
    if (!currentClip) return;

    if (foul === true && !foulRestartOptions.includes(restart)) {
      setRestart(
        currentClip.topic === "Offside"
          ? "Tiro libre indirecto"
          : "Tiro libre directo"
      );

      if (currentClip.topic === "Offside") {
        setDiscipline("Sin sanción");
      }
    }

    if (foul === false && !noFoulRestartOptions.includes(restart)) {
      setRestart("Seguir el juego");
      setDiscipline("Sin sanción");
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
        avgScore: examStats.avgScore,
        correctCount: examStats.correctCount,
        totalQuestions: answers.length,
        answers,
      }),
    });

    const data = await res.json();

    if (data.feedback) {
      setAiAnalysis(data.feedback);
    } else {
      setAiAnalysis("No se pudo generar análisis IA.");
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

  function submitAnswer() {
    if (!currentClip || !canSubmit) return;

    const technicalCorrect = foul === currentClip.correct_foul;
    const restartCorrect = restart === currentClip.correct_restart;
    const disciplineCorrect = discipline === currentClip.correct_discipline;

    const subtypeCorrect =
      currentClip.topic === "Offside" && foul === true
        ? offsideReason === currentClip.sub_type
        : currentClip.topic === "Handball" && foul === true
          ? handballReason === currentClip.sub_type
          : null;

    const baseScore = calculateScore(
      {
        foul,
        restart,
        discipline,
        var: currentClip.correct_var,
      },
      {
        foul: currentClip.correct_foul,
        restart: currentClip.correct_restart,
        discipline: currentClip.correct_discipline,
        var: currentClip.correct_var,
      }
    );

    let score = baseScore;

    if (subtypeCorrect === false) score -= 20;

    score = Math.max(score, 0);

    const answer: Answer = {
      clipId: currentClip.id,
      clipTitle: labelFromValue(currentClip.topic),
      topic: currentClip.topic,
      difficulty: currentClip.difficulty,
      foul,
      restart,
      discipline,
      offsideReason: offsideReason || undefined,
      handballReason: handballReason || undefined,
      technicalCorrect,
      restartCorrect,
      disciplineCorrect,
      subtypeCorrect,
      score,
    };

    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    resetInputs();

    if (index >= clips.length - 1) {
      setFinished(true);
    } else {
      setIndex((prev) => prev + 1);
    }
  }

  async function saveExam() {
    if (!user) {
      alert("Tenés que iniciar sesión.");
      return;
    }

    setSaving(true);

    const totalScore = answers.reduce((acc, a) => acc + a.score, 0);
    const avgScore = Math.round(totalScore / answers.length);
    const correctCount = answers.filter((a) => a.score >= 85).length;

    const { error } = await supabase.from("exam_results").insert([
      {
        user_id: user.id,
        total_questions: answers.length,
        total_score: totalScore,
        avg_score: avgScore,
        correct_count: correctCount,
        details: answers,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Examen guardado correctamente.");
    }

    setSaving(false);
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
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        Cargando examen...
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        No hay clips suficientes para iniciar examen.
      </div>
    );
  }

  if (finished) {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Resultado final
          </p>

          <h2 className="mt-4 text-7xl font-black">
            {examStats.avgScore}/100
          </h2>

          <p className="mt-3 text-3xl font-black text-[#6fc11f]">
            {examStats.level}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FinalStat title="Preguntas" value={answers.length.toString()} />
            <FinalStat
              title="Aprobadas"
              value={examStats.correctCount.toString()}
            />
            <FinalStat title="Score total" value={examStats.totalScore.toString()} />
          </div>

          <div className="mt-8 flex gap-3">
            <div className="flex-1 space-y-3">
              <button
                onClick={saveExam}
                disabled={saving}
                className="w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black disabled:opacity-50"
              >
                {saving ? "GUARDANDO..." : "GUARDAR EXAMEN"}
              </button>

              <button
                onClick={generateAIAnalysis}
                className="w-full rounded-2xl bg-blue-500 px-5 py-4 font-black text-white hover:bg-blue-600"
              >
                ANALIZAR CON IA
              </button>

              {loadingAi && (
                <p className="mt-4 text-sm text-zinc-400">
                  Analizando desempeño...
                </p>
              )}

              {aiAnalysis && (
                <div className="mt-4 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-6">
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                    Análisis IA del examen
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
              className="flex-1 rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
            >
              NUEVO EXAMEN
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="text-xl font-black">Detalle del examen</h3>

          <div className="mt-6 space-y-3">
            {answers.map((a, i) => (
              <div
                key={`${a.clipId}-${i}`}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-black">
                      {i + 1}. {a.clipTitle}
                    </p>

                    <p className="mt-1 text-xs text-zinc-500">
                      {a.topic} · {translateDifficulty(a.difficulty)}
                    </p>

                    {a.offsideReason && (
                      <p className="mt-1 text-xs text-[#6fc11f]">
                        Motivo FDJ: {labelFromValue(a.offsideReason)}
                      </p>
                    )}

                    {a.handballReason && (
                      <p className="mt-1 text-xs text-[#6fc11f]">
                        Tipo de mano: {labelFromValue(a.handballReason)}
                      </p>
                    )}
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
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Examen en curso
            </p>

            <h2 className="mt-2 text-2xl font-black">
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

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6fc11f]">
                Clip de examen
              </p>

              <h1 className="mt-2 text-2xl font-black">
                {labelFromValue(currentClip.topic)}
              </h1>

              <p className="mt-1 text-xs text-zinc-500">
                Analizá la acción y seleccioná la decisión correcta.
              </p>
            </div>

            <span className="rounded-full border border-[#6fc11f]/40 px-3 py-1 text-xs font-bold text-[#6fc11f]">
              {translateDifficulty(currentClip.difficulty)}
            </span>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-black">
  <video
    className="aspect-video w-full bg-black object-cover"
    src={currentClip.video_url}
    controls={!videoLocked}
    onPlay={handleVideoPlay}
    onEnded={handleVideoEnded}
  />

  {videoLocked && (
    <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-300">
        <p className="text-lg font-black">Límite alcanzado</p>
        <p className="mt-2 text-sm">
          Ya viste este video 2 veces. Ahora tenés que tomar la decisión.
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

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBox title="Tema" value={labelFromValue(currentClip.topic)} />
            <InfoBox title="Modo" value="Examen" />
            <InfoBox title="Feedback" value="Al final" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="space-y-6">
            <DecisionBlock
              title={
                currentClip.topic === "Offside"
                  ? "1. ¿Existe fuera de juego?"
                  : "1. ¿Hubo infracción?"
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <DecisionButton
                  active={foul === true}
                  onClick={() => {
                    setFoul(true);

                    if (currentClip.topic === "Offside") {
                      setRestart("Tiro libre indirecto");
                      setDiscipline("Sin sanción");
                    } else {
                      setRestart("Tiro libre directo");
                    }
                  }}
                >
                  SÍ
                </DecisionButton>

                <DecisionButton
                  active={foul === false}
                  onClick={() => {
                    setFoul(false);
                    setRestart("Seguir el juego");
                    setDiscipline("Sin sanción");
                    setOffsideReason("");
                    setHandballReason("");
                  }}
                >
                  NO
                </DecisionButton>
              </div>
            </DecisionBlock>

            <DecisionBlock title="2. Reanudación">
              <select
                value={restart}
                disabled={foul === null || currentClip.topic === "Offside"}
                onChange={(e) => setRestart(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-70"
              >
                <option value="">
                  {foul === null
                    ? "Primero seleccioná si hubo infracción"
                    : "Seleccioná una opción"}
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
                  ? "4. Sanción disciplinaria"
                  : "3. Sanción disciplinaria"
              }
            >
              <div className="grid grid-cols-3 gap-3">
                {["Sin sanción", "Amarilla", "Roja"].map((item) => (
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

            <button
              disabled={!canSubmit}
              onClick={submitAnswer}
              className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {index === clips.length - 1
                ? "FINALIZAR EXAMEN"
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
    easy: "Fácil",
    medium: "Media",
    hard: "Difícil",
  };

  return map[value] ?? value;
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
  };

  return dictionary[value] ?? value;
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
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
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}