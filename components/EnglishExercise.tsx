"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Languages,
  Mic,
  PenLine,
  RefreshCw,
  Trophy,
} from "lucide-react";
import {
  ifabGlossaryTerms,
  spanishDecisionExercises,
  triviaItems,
  type SpanishDecisionExercise,
  type TriviaMode,
} from "@/lib/communicationContent";
import { getBrowserFeedbackLanguage } from "@/lib/feedbackLanguage";
import { DEFAULT_SPORT_TYPE } from "@/lib/sports";
import { getEnglishClips, type ClipRecord } from "@/lib/clips";
import { useSupabase } from "@/components/SupabaseProvider";
import {
  createTrainingSubmissionId,
  submitTrainingAttempt,
} from "@/lib/training/attemptClient";

type EnglishClip = ClipRecord;
type CommunicationMode = "spanish" | "english" | "trivia";

type FeedbackScores = {
  terminology?: number | null;
  clarity?: number | null;
  precision?: number | null;
  structure?: number | null;
  vocabulary?: number | null;
  grammar?: number | null;
  global?: number | null;
  globalLabel?: string | null;
  modelAnswer?: string | null;
};

const modeCards: {
  key: CommunicationMode;
  title: string;
  text: string;
  icon: typeof PenLine;
}[] = [
  {
    key: "spanish",
    title: "Explicacion de Decisiones",
    text: "Voz de estadio, decision final y terminologia arbitral en espanol.",
    icon: PenLine,
  },
  {
    key: "english",
    title: "Ingles Arbitral IFAB",
    text: "Explicaciones tecnicas con vocabulario IFAB, FIFA, CONMEBOL y UEFA.",
    icon: Languages,
  },
  {
    key: "trivia",
    title: "Trivia IFAB English",
    text: "Vocabulario arbitral con multiple choice, verdadero/falso y flashcards.",
    icon: BookOpenCheck,
  },
];

export function EnglishExercise() {
  const supabase = useSupabase();
  const pendingFeedbackRef = useRef<{
    submissionId: string;
    fingerprint: string;
  } | null>(null);
  const [clips, setClips] = useState<EnglishClip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadingClips, setLoadingClips] = useState(true);
  const [activeMode, setActiveMode] = useState<CommunicationMode>("spanish");
  const [selectedSpanishExerciseId, setSelectedSpanishExerciseId] = useState(
    spanishDecisionExercises[0]?.id ?? ""
  );

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackScores, setFeedbackScores] = useState<FeedbackScores | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentClip = clips[currentIndex];
  const spanishExerciseOptions = useMemo(
    () =>
      spanishDecisionExercises.map((exercise) => ({
        ...exercise,
        clipIndex: clips.findIndex((clip) => matchesSpanishExercise(clip, exercise)),
      })),
    [clips]
  );
  const selectedSpanishExercise = spanishDecisionExercises.find(
    (exercise) => exercise.id === selectedSpanishExerciseId
  );

  useEffect(() => {
    let active = true;

    async function loadClips() {
      setLoadingClips(true);

      const { data, error } = await getEnglishClips(supabase);

      if (!active) return;

      if (error) {
        console.error("Error loading communication clips:", error);
        setClips([]);
      } else {
        setClips((data ?? []) as EnglishClip[]);
      }

      setLoadingClips(false);
    }

    void loadClips();

    return () => {
      active = false;
    };
  }, [supabase]);

  function changeMode(mode: CommunicationMode) {
    resetAnswer();
    setActiveMode(mode);
  }

  async function evaluate() {
    if (
      activeMode === "trivia" ||
      (!answer.trim() && !audioBlob) ||
      loadingAi ||
      !currentClip
    ) {
      return;
    }

    setLoadingAi(true);
    setFeedback(null);
    setFeedbackScores(null);
    setSaveMessage(null);

    try {
      const feedbackLanguage = getBrowserFeedbackLanguage();
      const requestInput = {
        mode:
          activeMode === "spanish"
            ? "decision_explanation_es"
            : "ifab_english",
        clipId: currentClip.id,
        sportType: DEFAULT_SPORT_TYPE,
        answer: answer.trim(),
        hasVoiceRecording: Boolean(audioBlob),
        feedbackLanguage,
      };
      const fingerprint = JSON.stringify(requestInput);
      const pending = pendingFeedbackRef.current;
      const submissionId =
        pending?.fingerprint === fingerprint
          ? pending.submissionId
          : createTrainingSubmissionId();
      pendingFeedbackRef.current = { submissionId, fingerprint };
      const res = await fetch("/api/english-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionId,
          ...requestInput,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback(data.error ?? "No se pudo generar feedback.");
      } else {
        const scores = normalizeScores(data.scores);
        const feedbackText = data.feedback ?? "Sin feedback disponible.";

        setFeedback(feedbackText);
        setFeedbackScores(scores);
        setSaveMessage(
          data.status === "already_recorded"
            ? "Feedback de entrenamiento recuperado sin duplicar el intento."
            : "Feedback guardado en tu historial de Entrenamiento."
        );
        pendingFeedbackRef.current = null;
      }
    } catch (error) {
      console.error("Communication feedback error:", error);
      setFeedback("No se pudo generar feedback.");
    } finally {
      setLoadingAi(false);
    }
  }

  async function startRecording() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Tu navegador no permite grabar audio.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error("Recording error:", error);
      alert("No se pudo iniciar la grabacion. Revisa permisos del microfono.");
    }
  }

  function stopRecording() {
    if (!recorderRef.current) return;

    recorderRef.current.stop();
    setRecording(false);
  }

  function resetAnswer() {
    setAnswer("");
    setFeedback(null);
    setFeedbackScores(null);
    setSaveMessage(null);
    setLoadingAi(false);
    setAudioBlob(null);
    pendingFeedbackRef.current = null;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setAudioUrl(null);
  }

  function nextClip() {
    if (currentIndex >= clips.length - 1) return;
    resetAnswer();
    setCurrentIndex((prev) => prev + 1);
  }

  function previousClip() {
    if (currentIndex <= 0) return;
    resetAnswer();
    setCurrentIndex((prev) => prev - 1);
  }

  if (loadingClips) {
    return (
      <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        Cargando clips de comunicacion...
      </div>
    );
  }

  if (!currentClip && activeMode !== "trivia") {
    return (
      <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-6 text-zinc-400">
        Todavia no hay clips de comunicacion cargados.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 lg:grid-cols-3">
        {modeCards.map((mode) => {
          const Icon = mode.icon;
          const selected = activeMode === mode.key;

          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => changeMode(mode.key)}
              className={`min-h-[132px] rounded-[24px] border p-4 text-left transition ${
                selected
                  ? "border-[#6fc11f]/60 bg-[#6fc11f]/10 shadow-[0_0_28px_rgba(111,193,31,0.12)]"
                  : "border-white/10 bg-[#101b24] hover:border-[#6fc11f]/35"
              }`}
            >
              <Icon className={selected ? "text-[#6fc11f]" : "text-zinc-500"} size={26} />
              <p className="mt-4 text-base font-black text-white">{mode.title}</p>
              <p className="mt-2 text-sm leading-5 text-zinc-400">{mode.text}</p>
            </button>
          );
        })}
      </section>

      {activeMode === "trivia" ? (
        <IfabTrivia />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
          <section className="space-y-4">
            {activeMode === "spanish" && (
              <div className="rounded-2xl border border-white/10 bg-[#0b131b] p-4">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
                  5 ejercicios de explicación pública
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {spanishExerciseOptions.map((exercise) => {
                    const available = exercise.clipIndex >= 0;
                    const selected = exercise.id === selectedSpanishExerciseId;

                    return (
                      <button
                        key={exercise.id}
                        type="button"
                        disabled={!available}
                        onClick={() => {
                          resetAnswer();
                          setSelectedSpanishExerciseId(exercise.id);
                          setCurrentIndex(exercise.clipIndex);
                        }}
                        className={`rounded-xl border p-3 text-left transition ${
                          selected
                            ? "border-[#6fc11f]/60 bg-[#6fc11f]/10"
                            : "border-white/10 bg-white/[0.03]"
                        } disabled:cursor-not-allowed disabled:opacity-45`}
                      >
                        <p className="text-sm font-black text-white">{exercise.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {available ? "Clip compatible disponible" : "Pendiente de clip compatible"}
                        </p>
                      </button>
                    );
                  })}
                </div>
                {selectedSpanishExercise && (
                  <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm leading-6 text-zinc-300">
                    {selectedSpanishExercise.prompt}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0b131b] p-4">
              <button
                onClick={previousClip}
                disabled={currentIndex === 0}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
              >
                Anterior
              </button>

              <p className="text-sm font-black text-zinc-300">
                Clip {currentIndex + 1} / {clips.length}
              </p>

              <button
                onClick={nextClip}
                disabled={currentIndex >= clips.length - 1}
                className="rounded-xl bg-[#6fc11f] px-4 py-2 text-sm font-black text-black disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
              <div className="absolute z-10 m-4 rounded-full bg-black/70 px-4 py-2 text-xs font-black">
                <span className="mr-2 text-[#6fc11f]">REC</span>
                Camara principal
              </div>

              <video
                key={currentClip?.id}
                className="aspect-video w-full bg-black object-cover"
                controls
                src={currentClip?.video_url}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111c25] p-4">
              <p className="text-sm font-black">
                {activeMode === "english" ? "Vocabulario util" : "Estructura sugerida"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {(activeMode === "english"
                  ? ifabGlossaryTerms
                  : [
                      "Luego de la revision observo...",
                      "Decision final",
                      "Tiro libre directo",
                      "Tiro libre indirecto",
                      "Penal",
                      "Tarjeta amarilla",
                      "Tarjeta roja",
                      "Sin infraccion",
                    ]
                ).map((term) => (
                  <span
                    key={term}
                    className="rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-1 text-xs text-[#6fc11f]"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-[24px] border border-white/10 bg-[#0b131b] p-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                {activeMode === "english" ? "IFAB English" : "Decision en espanol"}
              </p>

              <h2 className="mt-3 text-2xl font-black">
                {activeMode === "english"
                  ? "Explica tu decision en ingles"
                  : "Explica la decision tecnica"}
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {activeMode === "english"
                  ? "RefLab evalua vocabulario arbitral, terminologia IFAB, claridad y gramatica basica."
                  : "RefLab evalua terminologia arbitral, claridad, precision y estructura de la explicacion."}
              </p>
            </div>

            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={
                activeMode === "english"
                  ? "The defender commits a reckless challenge. Direct free kick and yellow card."
                  : "Luego de la revision observo una infraccion sancionable. Decision final: tiro libre directo y tarjeta amarilla."
              }
              className="min-h-40 w-full rounded-xl border border-white/10 bg-[#17222b] p-4 text-sm text-white outline-none placeholder:text-zinc-600"
            />

            <div className="grid gap-3 md:grid-cols-2">
              {!recording ? (
                <button
                  onClick={startRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 font-black text-red-300 hover:bg-red-500/20"
                >
                  <Mic size={18} />
                  Grabar audio
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="rounded-xl bg-red-500 px-5 py-4 font-black text-white"
                >
                  Detener grabacion
                </button>
              )}

              <button
                onClick={resetAnswer}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
              >
                <RefreshCw size={18} />
                Limpiar
              </button>
            </div>

            {audioUrl && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="mb-3 text-sm font-black text-[#6fc11f]">
                  Respuesta de voz grabada
                </p>

                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}

            <button
              onClick={evaluate}
              disabled={(!answer.trim() && !audioBlob) || loadingAi}
              className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loadingAi ? "ANALIZANDO..." : "EVALUAR RESPUESTA"}
            </button>

            {feedbackScores && <ScorePanel scores={feedbackScores} mode={activeMode} />}

            {saveMessage && (
              <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
                {saveMessage}
              </div>
            )}

            {feedback && (
              <div className="rounded-2xl border border-blue-400/25 bg-blue-400/10 p-5">
                <h3 className="font-black text-blue-300">Feedback RefLab</h3>

                <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                  {feedback
                    .split("\n")
                    .filter(Boolean)
                    .map((line, index) => (
                      <p key={index}>{line}</p>
                    ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ScorePanel({
  scores,
  mode,
}: {
  scores: FeedbackScores;
  mode: Exclude<CommunicationMode, "trivia">;
}) {
  const rows =
    mode === "english"
      ? [
          ["Vocabulario", scores.vocabulary],
          ["Terminologia IFAB", scores.terminology],
          ["Claridad", scores.clarity],
          ["Gramatica basica", scores.grammar],
        ]
      : [
          ["Terminologia", scores.terminology],
          ["Claridad", scores.clarity],
          ["Precision", scores.precision],
          ["Estructura", scores.structure],
        ];

  return (
    <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">Evaluacion</p>
        <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-black text-[#6fc11f]">
          {scores.globalLabel ?? "Comunicacion global"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{formatOutOf10(value as number | null | undefined)}</p>
          </div>
        ))}
      </div>

      {scores.modelAnswer && (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-300">
          <p className="mb-2 font-black text-white">Modelo sugerido</p>
          {scores.modelAnswer}
        </div>
      )}
    </div>
  );
}

function IfabTrivia() {
  const [mode, setMode] = useState<TriviaMode>("choice");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<Record<string, boolean>>({});
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const items = useMemo(
    () => triviaItems.filter((item) => item.mode === mode),
    [mode]
  );
  const current = items[index] ?? items[0];
  const answeredEntries = Object.entries(results);
  const correctCount = answeredEntries.filter(([, correct]) => correct).length;
  const percent = answeredEntries.length
    ? Math.round((correctCount / answeredEntries.length) * 100)
    : 0;
  const mastered = triviaItems
    .filter((item) => results[item.id] === true)
    .map((item) => item.term);
  const pending = triviaItems
    .filter((item) => results[item.id] === false)
    .map((item) => item.term);
  const level = percent >= 85 ? "Avanzado" : percent >= 60 ? "Intermedio" : "Inicial";

  function changeTriviaMode(nextMode: TriviaMode) {
    setMode(nextMode);
    setIndex(0);
    setSelected(null);
    setAnswered(false);
  }

  async function submit(selectedAnswer: string) {
    if (!current || answered) return;

    const correct = selectedAnswer === current.answer || selectedAnswer === "Dominado";
    setSelected(selectedAnswer);
    setAnswered(true);
    setResults((prev) => ({ ...prev, [current.id]: correct }));
    try {
      await submitTrainingAttempt({
        kind: "ifab_trivia",
        submissionId: createTrainingSubmissionId(),
        itemId: current.id,
        selectedAnswer,
      });
      setSaveMessage("Progreso de vocabulario guardado.");
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el progreso de vocabulario."
      );
    }
  }

  function next() {
    setSelected(null);
    setAnswered(false);
    setIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="space-y-4 rounded-[24px] border border-white/10 bg-[#0b131b] p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Trivia IFAB English
          </p>
          <h2 className="mt-3 text-2xl font-black">Vocabulario arbitral</h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["choice", "Multiple Choice"],
            ["true_false", "Verdadero/Falso"],
            ["match", "Relacionar"],
            ["flashcards", "Flashcards"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => changeTriviaMode(key as TriviaMode)}
              className={`rounded-xl border px-4 py-3 text-sm font-black transition ${
                mode === key
                  ? "border-[#6fc11f]/60 bg-[#6fc11f]/15 text-[#6fc11f]"
                  : "border-white/10 bg-white/[0.04] text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label="Vocabulary Score" value={`${percent}%`} />
          <Metric label="Nivel IFAB English" value={level} />
          <Metric label="Conceptos dominados" value={String(mastered.length)} />
          <Metric label="Conceptos pendientes" value={String(pending.length)} />
        </div>

        <ConceptList title="Dominados" items={mastered} />
        <ConceptList title="Pendientes" items={pending} />
      </section>

      <section className="rounded-[24px] border border-white/10 bg-[#101b24] p-5">
        {current && (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                  <span className="rounded-full bg-[#6fc11f]/10 px-3 py-1 text-[#6fc11f]">{current.term}</span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-400">{current.difficulty}</span>
                </div>
                <h3 className="mt-3 text-2xl font-black text-white">{current.prompt}</h3>
                <p className="mt-2 text-xs font-bold text-zinc-500">{current.reference}</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-zinc-400">
                {index + 1}/{items.length}
              </span>
            </div>

            {mode === "flashcards" ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">
                    Respuesta
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">{current.answer}</p>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">{current.explanation}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => submit("Pendiente")}
                    disabled={answered}
                    className="rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-4 py-4 font-black text-yellow-100 disabled:opacity-50"
                  >
                    Pendiente
                  </button>
                  <button
                    type="button"
                    onClick={() => submit("Dominado")}
                    disabled={answered}
                    className="rounded-xl bg-[#6fc11f] px-4 py-4 font-black text-black disabled:opacity-50"
                  >
                    Dominado
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid gap-3">
                {(current.options ?? []).map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = option === current.answer;
                  const stateClass = !answered
                    ? "border-white/10 bg-[#0b131b] text-white hover:border-[#6fc11f]/40"
                    : isCorrect
                      ? "border-[#6fc11f]/50 bg-[#6fc11f]/15 text-[#6fc11f]"
                      : isSelected
                        ? "border-red-400/40 bg-red-500/10 text-red-200"
                        : "border-white/10 bg-[#0b131b] text-zinc-500";

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => submit(option)}
                      disabled={answered}
                      className={`rounded-xl border px-4 py-4 text-left text-sm font-black transition ${stateClass}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {answered && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-[#6fc11f]" size={18} />
                  <p className="font-black text-white">{selected === current.answer || selected === "Dominado" ? "Correcto" : "Revision"}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{current.explanation}</p>
                {saveMessage && <p className="mt-3 text-xs font-bold text-[#6fc11f]">{saveMessage}</p>}
                <button
                  type="button"
                  onClick={next}
                  className="mt-4 w-full rounded-xl bg-[#6fc11f] px-4 py-3 font-black text-black"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <Trophy className="text-[#6fc11f]" size={20} />
      <p className="mt-3 text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function ConceptList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-black text-white">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <span className="text-xs text-zinc-500">Sin registros</span>
        ) : (
          items.slice(0, 8).map((item) => (
            <span
              key={item}
              className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-xs font-bold text-[#6fc11f]"
            >
              {item}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function matchesSpanishExercise(
  clip: EnglishClip,
  exercise: SpanishDecisionExercise
) {
  const topic = normalizeMatchValue(clip.topic);
  const restart = normalizeMatchValue(clip.correct_restart);
  const discipline = normalizeMatchValue(clip.correct_discipline);
  const expectedTopic = normalizeMatchValue(exercise.match.topic);
  const expectedRestart = normalizeMatchValue(exercise.match.correctRestart);
  const expectedDiscipline = normalizeMatchValue(exercise.match.correctDiscipline);

  if (expectedTopic && topic !== expectedTopic) return false;
  if (expectedRestart && restart !== expectedRestart) return false;
  if (expectedDiscipline && !discipline.includes(expectedDiscipline)) return false;
  if (
    typeof exercise.match.correctFoul === "boolean" &&
    clip.correct_foul !== exercise.match.correctFoul
  ) {
    return false;
  }

  return true;
}

function normalizeMatchValue(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeScores(value: unknown): FeedbackScores | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  return {
    terminology: cleanOutOf10(record.terminology),
    clarity: cleanOutOf10(record.clarity),
    precision: cleanOutOf10(record.precision),
    structure: cleanOutOf10(record.structure),
    vocabulary: cleanOutOf10(record.vocabulary),
    grammar: cleanOutOf10(record.grammar),
    global: cleanOutOf10(record.global),
    globalLabel: typeof record.globalLabel === "string" ? record.globalLabel : null,
    modelAnswer: typeof record.modelAnswer === "string" ? record.modelAnswer : null,
  };
}

function cleanOutOf10(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function formatOutOf10(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}/10` : "Sin datos";
}
