"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { insertAttemptSafely } from "@/lib/attemptPersistence";
import { getTrainingClips, type ClipRecord } from "@/lib/clips";
import { resolveRefCardId } from "@/lib/refCard";
import { getSportTopics } from "@/lib/sports";
import { supabase } from "@/lib/supabase";
import { FREE_WEEKLY_CLIP_LIMIT, getCurrentWeekStart } from "@/lib/subscription";
import {
  evaluateVideoAnswers,
  normalizeVideoAnswerMap,
  type VideoAnswerMap,
  type VideoAnswerValue,
} from "@/lib/videoAnalysisEngine";
import {
  getVideoTopicSchema,
  type VideoFieldDefinition,
} from "@/lib/videoAnalysisSchemas";
import { useUserRole } from "@/lib/useUserRole";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";

type FutsalClip = ClipRecord & {
  analysis_answers?: Record<string, string | boolean | null> | null;
};

const MAX_VIDEO_PLAYS = 3;

export function FutsalVideoAnalysisClient() {
  const [allClips, setAllClips] = useState<FutsalClip[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadClips() {
      setLoading(true);
      const { data, error } = await getTrainingClips(supabase, "field", "futsal");

      if (cancelled) return;

      if (error) {
        console.error("Error cargando clips de futsal:", error);
        setAllClips([]);
        setLoading(false);
        return;
      }

      const filtered = ((data ?? []) as FutsalClip[]).filter((clip) => {
        return Boolean(
          getVideoTopicSchema("futsal", clip.topic) &&
            Object.keys(normalizeVideoAnswerMap(clip.analysis_answers)).length > 0
        );
      });

      setAllClips(shuffleClips(filtered));
      setLoading(false);
    }

    loadClips();

    return () => {
      cancelled = true;
    };
  }, []);

  const topicCards = useMemo(() => {
    const definitions = getSportTopics("futsal").filter((topic) => topic.group === "video");

    return definitions
      .map((topic) => {
        const clips = allClips.filter((clip) => clip.topic === topic.key);
        return {
          ...topic,
          count: clips.length,
        };
      })
      .filter((topic) => topic.count > 0);
  }, [allClips]);

  const visibleClips = useMemo(() => {
    if (!selectedTopic) return [];

    return allClips.filter((clip) => clip.topic === selectedTopic);
  }, [allClips, selectedTopic]);

  const currentClip = visibleClips[currentIndex];

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [selectedTopic, currentIndex]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-zinc-400">
        Cargando clips de futsal...
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="space-y-5">
        <section className="rounded-3xl border border-[#16b8ff]/30 bg-[#16b8ff]/10 p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#16b8ff] sm:text-xs sm:tracking-[0.35em]">
            FUTSAL VIDEOANALISIS
          </p>
          <h2 className="mt-3 text-2xl font-black sm:text-3xl">
            Elegi un topico tecnico de futsal
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
            Cada clip usa un formulario dinamico segun el topico y la resolucion
            reglamentaria cargada para futsal.
          </p>
        </section>

        {topicCards.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#101820] p-6 text-zinc-400">
            No hay clips de futsal listos para videoanalisis. Para aparecer aqui
            deben tener disciplina futsal, topico compatible y respuestas de
            analisis configuradas.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {topicCards.map((topic) => (
              <button
                key={topic.key}
                onClick={() => {
                  setSelectedTopic(topic.key);
                  setCurrentIndex(0);
                }}
                className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 text-left shadow-2xl transition hover:border-[#16b8ff]/40 hover:bg-[#13212b]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-black">{topic.label}</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">
                      {getVideoTopicSchema("futsal", topic.key)?.description ??
                        "Analisis especifico de futsal."}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#16b8ff]/30 px-3 py-1 text-xs font-black text-[#16b8ff]">
                    {topic.count}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!currentClip) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSelectedTopic(null)}
          className="rounded-xl bg-white/10 px-5 py-3 font-black text-white hover:bg-white/15"
        >
          Cambiar topico
        </button>
        <div className="rounded-3xl border border-white/10 bg-[#101820] p-6 text-zinc-400">
          No hay clips disponibles en este topico.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[#16b8ff]/30 bg-[#16b8ff]/10 p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#16b8ff] sm:text-xs sm:tracking-[0.35em]">
              FUTSAL VIDEOANALISIS
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              {labelFromValue(currentClip.topic)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Clip {currentIndex + 1} de {visibleClips.length} en este topico.
            </p>
          </div>

          <button
            onClick={() => setSelectedTopic(null)}
            className="rounded-xl bg-black/25 px-5 py-3 font-black text-white hover:bg-black/40"
          >
            Cambiar topico
          </button>
        </div>
      </section>

      <FutsalVideoExercise
        key={currentClip.id}
        clip={currentClip}
        onNext={() => {
          if (currentIndex < visibleClips.length - 1) {
            setCurrentIndex((prev) => prev + 1);
            return;
          }

          alert("Terminaste los clips disponibles para este topico.");
        }}
      />
    </div>
  );
}

function FutsalVideoExercise({
  clip,
  onNext,
}: {
  clip: FutsalClip;
  onNext: () => void;
}) {
  const { user } = useUser();
  const { isPro, loadingRole } = useUserRole();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const schema = getVideoTopicSchema("futsal", clip.topic);
  const expectedAnswers = normalizeVideoAnswerMap(clip.analysis_answers);

  const [answers, setAnswers] = useState<VideoAnswerMap>({});
  const [justification, setJustification] = useState("");
  const [result, setResult] = useState<ReturnType<typeof evaluateVideoAnswers> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [weeklyClipCount, setWeeklyClipCount] = useState(0);
  const [playCount, setPlayCount] = useState(() => {
    if (typeof window === "undefined") return 0;

    return Number(localStorage.getItem(`futsal-clip-plays-${clip.id}`) ?? "0");
  });

  const requiredFields = schema?.fields.filter((field) => field.required) ?? [];
  const canSubmit =
    schema !== undefined &&
    requiredFields.every((field) => hasAnswerValue(field, answers[field.key] ?? null));

  const remainingPlays = Math.max(MAX_VIDEO_PLAYS - playCount, 0);
  const videoLocked = remainingPlays <= 0;
  const freeClipLimitReached =
    !loadingRole && !isPro && weeklyClipCount >= FREE_WEEKLY_CLIP_LIMIT;

  useEffect(() => {
    let cancelled = false;

    async function loadWeeklyUsage() {
      if (!user || isPro) {
        setWeeklyClipCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("sport_type", "futsal")
        .gte("created_at", getCurrentWeekStart().toISOString());

      if (cancelled) return;

      if (error) {
        console.warn("No se pudo calcular el limite semanal de clips de futsal.");
        setWeeklyClipCount(0);
        return;
      }

      setWeeklyClipCount(count ?? 0);
    }

    loadWeeklyUsage();

    return () => {
      cancelled = true;
    };
  }, [user, isPro]);

  if (!schema) {
    return (
      <div className="rounded-3xl border border-white/10 bg-[#101820] p-6 text-zinc-400">
        El topico de este clip no tiene esquema configurado para futsal.
      </div>
    );
  }

  if (result) {
    return (
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-[#16b8ff]/30 bg-[#16b8ff]/10 p-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#16b8ff]">
            Resultado
          </p>
          <h3 className="mt-4 text-6xl font-black text-[#16b8ff]">
            {result.score}
            <span className="text-2xl text-zinc-400">/100</span>
          </h3>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {result.correctCount} aciertos sobre {result.totalScored} criterios
            puntuables.
          </p>

          <div className="mt-6 space-y-3">
            {result.fieldResults
              .filter((field) => field.scored)
              .map((field) => (
                <div
                  key={field.key}
                  className={`rounded-2xl border p-4 ${
                    field.correct
                      ? "border-[#16b8ff]/25 bg-[#16b8ff]/8"
                      : "border-red-400/20 bg-red-500/5"
                  }`}
                >
                  <p className="font-black">{field.label}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    Tu respuesta: <strong>{formatAnswerValue(field.actual)}</strong>
                  </p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    Correcta: <strong>{formatAnswerValue(field.expected)}</strong>
                  </p>
                </div>
              ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              onClick={onNext}
              className="rounded-2xl bg-[#16b8ff] px-5 py-4 font-black text-black hover:bg-[#31b8ff]"
            >
              SIGUIENTE CLIP
            </button>
            <button
              onClick={() => {
                setAnswers({});
                setJustification("");
                setResult(null);
                setSaveError(null);
              }}
              className="rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
            >
              REINTENTAR
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-[#101820] p-6">
            <h3 className="text-xl font-black">Resolucion oficial del clip</h3>
            <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-300">
              {clip.technical_resolution && (
                <p>
                  <strong className="text-white">Tecnica:</strong>{" "}
                  {clip.technical_resolution}
                </p>
              )}
              {clip.disciplinary_resolution && (
                <p>
                  <strong className="text-white">Disciplina:</strong>{" "}
                  {clip.disciplinary_resolution}
                </p>
              )}
              {clip.explanation && <p>{clip.explanation}</p>}
            </div>
          </div>

          <div className="rounded-3xl border border-blue-400/20 bg-blue-400/10 p-6">
            <h3 className="text-xl font-black text-blue-200">
              Trazabilidad reglamentaria
            </h3>
            <div className="mt-4 space-y-2 text-sm leading-6 text-zinc-200">
              <p>
                <strong className="text-white">Referencia:</strong>{" "}
                {clip.rule_reference ?? "Sin referencia cargada"}
              </p>
              <p>
                <strong className="text-white">Temporada:</strong>{" "}
                {clip.season ?? "2024-25"}
              </p>
              <p>
                <strong className="text-white">Fuente:</strong>{" "}
                {clip.source_version ?? "Futsal Laws of the Game 2024-25"}
              </p>
            </div>
          </div>

          {justification.trim() && (
            <div className="rounded-3xl border border-white/10 bg-[#101820] p-6">
              <h3 className="text-xl font-black">Tu justificacion</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {justification}
              </p>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (freeClipLimitReached) {
    return (
      <ProUpgradeCard
        title="Has completado tus clips gratuitos de futsal esta semana"
        description="RefLab Pro desbloquea mas volumen de trabajo y seguimientos mas amplios por disciplina."
        reason={`Limite FREE: ${FREE_WEEKLY_CLIP_LIMIT} clips por semana.`}
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
      <section className="space-y-4 rounded-3xl border border-white/10 bg-[#0b131b] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[#16b8ff]">
              {labelFromValue(clip.topic)}
            </p>
            <h3 className="mt-2 text-2xl font-black">{clip.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {clip.description ??
                "Analiza la jugada segun la normativa FIFA de futsal vigente."}
            </p>
          </div>

          <div className="rounded-2xl border border-[#16b8ff]/25 bg-[#16b8ff]/10 px-4 py-3 text-right text-sm font-black">
            <p className="text-[#16b8ff]">
              {remainingPlays}/{MAX_VIDEO_PLAYS}
            </p>
            <p className="mt-1 text-xs text-zinc-400">reproducciones</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full bg-black object-contain"
            src={clip.video_url}
            controls={!videoLocked}
            playsInline
            onPlay={() => {
              if (videoLocked) {
                videoRef.current?.pause();
                if (videoRef.current) videoRef.current.currentTime = 0;
                return;
              }
            }}
            onEnded={() => {
              const nextCount = Math.min(playCount + 1, MAX_VIDEO_PLAYS);
              setPlayCount(nextCount);
              localStorage.setItem(`futsal-clip-plays-${clip.id}`, String(nextCount));
            }}
          />

          {videoLocked && (
            <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-yellow-300">
                <p className="text-lg font-black">Limite alcanzado</p>
                <p className="mt-2 text-sm">
                  Ya viste este clip tres veces. Podes responder, pero no
                  reproducirlo otra vez.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#16b8ff]/25 bg-[#16b8ff]/10 p-4 text-sm leading-6 text-zinc-300">
          Formulario dinamico: {schema.title}. Las preguntas cambian segun el
          topico cargado para este clip.
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-white/10 bg-[#101820] p-5">
        {schema.fields.map((field, index) => (
          <DynamicField
            key={field.key}
            field={field}
            index={index}
            value={answers[field.key] ?? null}
            onChange={(value) =>
              setAnswers((current) => ({
                ...current,
                [field.key]: value,
              }))
            }
          />
        ))}

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="mb-3 text-sm font-black">Justificacion reglamentaria</p>
          <textarea
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            placeholder="Explica tu lectura tecnica y reglamentaria."
            className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b111b] p-3 text-sm text-white outline-none placeholder:text-zinc-600"
          />
        </div>

        {saveError && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {saveError}
          </div>
        )}

        <button
          disabled={!canSubmit || saving}
          onClick={async () => {
            if (!schema || !canSubmit || saving) return;

            const evaluation = evaluateVideoAnswers(schema, expectedAnswers, answers);

            if (!user) {
              setSaveError("Tenes que iniciar sesion para guardar el intento.");
              return;
            }

            setSaving(true);
            setSaveError(null);

            const profileRes = await supabase
              .from("user_profiles")
              .select("ref_card_id")
              .eq("user_id", user.id)
              .maybeSingle();
            const refCardId = resolveRefCardId(user.id, profileRes.data);

            const technicalDecisionValue = answers.technical_decision;
            const disciplinaryValue = answers.disciplinary_action;
            const restartValue = answers.restart;

            const savedAttempt = await insertAttemptSafely(
              supabase,
              {
                user_id: user.id,
                sport_type: "futsal",
                activity_type: "video_training",
                ref_card_id: refCardId,
                clip_id: clip.id,
                clip_title: clip.title,
                module: "futsal_video_analysis",
                mode: "training",
                topic: clip.topic,
                subtopic: clip.subtopic ?? null,
                rule_reference: clip.rule_reference ?? schema.topic,
                season: clip.season ?? "2024-25",
                source_version:
                  clip.source_version ?? "Futsal Laws of the Game 2024-25",
                difficulty: clip.difficulty,
                score: evaluation.score,
                is_correct: evaluation.score >= 85,
                selected_decision: formatTechnicalDecision(technicalDecisionValue),
                correct_decision: formatTechnicalDecision(
                  expectedAnswers.technical_decision ?? null
                ),
                selected_restart:
                  typeof restartValue === "string" ? restartValue : null,
                correct_restart:
                  typeof expectedAnswers.restart === "string"
                    ? expectedAnswers.restart
                    : null,
                selected_discipline:
                  typeof disciplinaryValue === "string" ? disciplinaryValue : null,
                correct_discipline:
                  typeof expectedAnswers.disciplinary_action === "string"
                    ? expectedAnswers.disciplinary_action
                    : null,
                foul:
                  typeof technicalDecisionValue === "boolean"
                    ? technicalDecisionValue
                    : null,
                restart: typeof restartValue === "string" ? restartValue : null,
                discipline:
                  typeof disciplinaryValue === "string" ? disciplinaryValue : null,
                technical_correct: evaluation.technicalCorrect,
                restart_correct: evaluation.restartCorrect,
                discipline_correct: evaluation.disciplinaryCorrect,
                disciplinary_correct: evaluation.disciplinaryCorrect,
                subtype_correct: evaluation.subtypeCorrect,
                accumulated_foul_correct: evaluation.accumulatedFoulCorrect,
                four_second_correct: evaluation.fourSecondCorrect,
                goalkeeper_correct: evaluation.goalkeeperCorrect,
                criterion_result: {
                  technical: evaluation.technicalCorrect,
                  restart: evaluation.restartCorrect,
                  discipline: evaluation.disciplinaryCorrect,
                  subtype: evaluation.subtypeCorrect,
                  accumulated_foul: evaluation.accumulatedFoulCorrect,
                  four_second: evaluation.fourSecondCorrect,
                  goalkeeper: evaluation.goalkeeperCorrect,
                  responses: answers,
                  expected: expectedAnswers,
                  field_results: evaluation.fieldResults,
                  justification,
                },
                feedback: `Videoanalisis futsal: ${evaluation.score}/100`,
              },
              {
                user_id: user.id,
                sport_type: "futsal",
                activity_type: "video_training",
                clip_title: clip.title,
                score: evaluation.score,
                topic: clip.topic,
                subtopic: clip.subtopic ?? null,
                rule_reference: clip.rule_reference ?? schema.topic,
                season: clip.season ?? "2024-25",
                source_version:
                  clip.source_version ?? "Futsal Laws of the Game 2024-25",
                difficulty: clip.difficulty,
                technical_correct: evaluation.technicalCorrect,
                restart_correct: evaluation.restartCorrect,
                discipline_correct: evaluation.disciplinaryCorrect,
                disciplinary_correct: evaluation.disciplinaryCorrect,
                subtype_correct: evaluation.subtypeCorrect,
                accumulated_foul_correct: evaluation.accumulatedFoulCorrect,
                four_second_correct: evaluation.fourSecondCorrect,
                goalkeeper_correct: evaluation.goalkeeperCorrect,
              }
            );

            if (!savedAttempt.saved) {
              setSaveError(savedAttempt.error ?? "No se pudo guardar el intento.");
              setSaving(false);
              return;
            }

            if (!isPro) {
              setWeeklyClipCount((current) => current + 1);
            }

            setSaving(false);
            setResult(evaluation);
          }}
          className="w-full rounded-2xl bg-[#16b8ff] px-5 py-4 font-black text-black transition hover:bg-[#31b8ff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "GUARDANDO..." : "ENVIAR RESPUESTA"}
        </button>
      </section>
    </div>
  );
}

function DynamicField({
  field,
  index,
  value,
  onChange,
}: {
  field: VideoFieldDefinition;
  index: number;
  value: VideoAnswerValue;
  onChange: (value: VideoAnswerValue) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-black">
          {index + 1}. {field.label}
        </p>
        {field.required && (
          <span className="rounded-full border border-[#16b8ff]/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#16b8ff]">
            Obligatorio
          </span>
        )}
      </div>

      {field.helperText && (
        <p className="mt-2 text-xs leading-5 text-zinc-500">{field.helperText}</p>
      )}

      {field.kind === "text" ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="mt-3 min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b111b] p-3 text-sm text-white outline-none"
        />
      ) : (
        <div className="mt-3 grid gap-2">
          {field.options?.map((option) => {
            const optionValue = coerceOptionValue(option.value);
            const active = value === optionValue;

            return (
              <button
                key={`${field.key}-${option.value}`}
                type="button"
                onClick={() => onChange(optionValue)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${
                  active
                    ? "border-[#16b8ff] bg-[#16b8ff]/15 text-white"
                    : "border-white/10 bg-[#0b111b] text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function hasAnswerValue(field: VideoFieldDefinition, value: VideoAnswerValue) {
  if (field.kind === "text") {
    return typeof value === "string" && value.trim().length > 0;
  }

  return value !== null;
}

function coerceOptionValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function formatAnswerValue(value: VideoAnswerValue) {
  if (value === true) return "Si";
  if (value === false) return "No";
  if (typeof value === "string" && value.length > 0) return labelFromValue(value);
  return "Sin dato";
}

function formatTechnicalDecision(value: VideoAnswerValue | undefined) {
  if (value === true) return "Infraccion";
  if (value === false) return "No infraccion";
  return null;
}

function labelFromValue(value?: string | null) {
  if (!value) return "";

  const dictionary: Record<string, string> = {
    "Fouls and contact": "Faltas y contactos",
    "Accumulated fouls": "Faltas acumuladas",
    "Direct free kick": "Tiro libre directo",
    "Indirect free kick": "Tiro libre indirecto",
    "Penalty kick": "Penal",
    "Second penalty mark": "Segundo punto penal",
    "Four-second count": "Control de cuatro segundos",
    Substitutions: "Sustituciones",
    "Substitution procedure": "Procedimiento de sustitucion",
    Goalkeeper: "Guardameta",
    "Back-pass to goalkeeper": "Cesion al guardameta",
    "Flying goalkeeper": "Portero-jugador",
    "Kick-in": "Saque de banda",
    "Goal clearance": "Saque de meta",
    "Corner kick": "Saque de esquina",
    "Dropped ball": "Balon a tierra",
    "Double touch": "Doble toque",
    "Required distance": "Distancia reglamentaria",
    "Unsporting behaviour": "Conducta antideportiva",
    DOGSO: "DOGSO",
    SPA: "SPA",
    "Reckless challenge": "Entrada temeraria",
    "Serious foul play": "Juego brusco grave",
    "Violent conduct": "Conducta violenta",
    Simulation: "Simulacion",
    Dissent: "Protestas",
    Advantage: "Ventaja",
    "Referee positioning": "Posicionamiento arbitral",
    "Second referee teamwork": "Trabajo del segundo arbitro",
    "Third referee and timekeeper": "Tercer arbitro y cronometrador",
    control_legal: "Control legal del guardameta",
    cuatro_segundos: "Infraccion de cuatro segundos",
    cuatros_segundos: "Infraccion de cuatro segundos",
    segunda_recepcion: "Segunda recepcion en propia mitad",
    cesion_prohibida: "Cesion prohibida con el pie",
    portero_jugador_legal: "Portero-jugador permitido",
    procedimiento_correcto: "Procedimiento correcto",
    ingreso_anticipado: "Ingreso anticipado",
    ingreso_fuera_zona: "Ingreso fuera de zona",
    salida_fuera_zona: "Salida fuera de zona",
    intervencion_correcta: "Intervencion correcta",
    debio_intervenir: "Debio intervenir",
    no_debia_intervenir: "No debia intervenir",
    mecanica_correcta: "Mecanica correcta",
    angulo_insuficiente: "Angulo insuficiente",
    segundo_arbitro_debia_apoyar: "Debio apoyar el segundo arbitro",
    tercer_arbitro_debia_intervenir:
      "Debio intervenir tercer arbitro / cronometrador",
    contacto_cuidadoso: "Contacto permitido",
    carga_imprudente: "Carga imprudente",
    entrada_temeraria: "Entrada temeraria",
    uso_fuerza_excesiva: "Uso de fuerza excesiva",
    mano_sancionable: "Mano sancionable",
    sin_infraccion: "Sin infraccion",
    dfksaf_desde_10m: "DFKSAF desde 10 metros",
    dfksaf_desde_punto_falta: "DFKSAF desde el punto de la falta",
    penal_por_area: "Penal por falta dentro del area",
  };

  return dictionary[value] ?? value;
}

function shuffleClips(clips: FutsalClip[]) {
  return [...clips].sort(() => Math.random() - 0.5);
}

