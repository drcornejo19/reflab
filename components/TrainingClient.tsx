"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ClipExercise } from "@/components/ClipExercise";
import { VarExercise } from "@/components/VarExercise";
import { getTrainingClips, type ClipRecord } from "@/lib/clips";

type TrainingMode = "field" | "var" | "english";

type ClipWithMode = ClipRecord & {
  mode?: TrainingMode | string | null;
};

type TrainingTopic = "ALL" | "Dispute" | "Tactical foul" | "Offside" | "Handball";

type TrainingClientProps = {
  mode?: TrainingMode;
};

const trainingTopics: {
  value: TrainingTopic;
  label: string;
  description: string;
}[] = [
  {
    value: "ALL",
    label: "Todos los clips",
    description: "Entrenamiento general con todos los videos disponibles.",
  },
  {
    value: "Dispute",
    label: "Disputas",
    description: "Contacto, intensidad, punto de contacto y criterio tecnico.",
  },
  {
    value: "Tactical foul",
    label: "Faltas tacticas",
    description: "SPA, DOGSO, ventaja, control del juego y disciplina.",
  },
  {
    value: "Offside",
    label: "Fuera de juego",
    description: "Interferir en juego, adversario o sacar ventaja.",
  },
  {
    value: "Handball",
    label: "Manos",
    description: "Deliberada, bloqueo, inmediatez y posicion antinatural.",
  },
];

const topicAliases: Record<TrainingTopic, string[]> = {
  ALL: [],
  Dispute: ["Dispute", "Challenge"],
  "Tactical foul": ["Tactical foul", "SPA", "DOGSO"],
  Offside: ["Offside"],
  Handball: ["Handball"],
};

export function TrainingClient({ mode = "field" }: TrainingClientProps) {
  const [allClips, setAllClips] = useState<ClipWithMode[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TrainingTopic | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrainingClips() {
      setLoading(true);
      setCurrentIndex(0);

      const { data, error } = await getTrainingClips(supabase, mode);

      if (error) {
        console.error("Error cargando clips:", error);
        setAllClips([]);
        setLoading(false);
        return;
      }

      setAllClips(shuffleClips((data ?? []) as ClipWithMode[]));
      setLoading(false);
    }

    loadTrainingClips();
  }, [mode]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentIndex, selectedTopic]);

  const topicCounts = useMemo(() => {
    return trainingTopics.reduce(
      (acc, topic) => {
        acc[topic.value] =
          topic.value === "ALL"
            ? allClips.length
            : allClips.filter((clip) => matchTopic(clip, topic.value)).length;

        return acc;
      },
      {} as Record<TrainingTopic, number>
    );
  }, [allClips]);

  const clips = useMemo(() => {
    if (mode === "var") return allClips;

    if (!selectedTopic) return [];

    if (selectedTopic === "ALL") return allClips;

    return allClips.filter((clip) => matchTopic(clip, selectedTopic));
  }, [allClips, selectedTopic, mode]);

  const currentClip = clips[currentIndex];

  const selectedTopicLabel =
    mode === "var"
      ? "VAR"
      : trainingTopics.find((topic) => topic.value === selectedTopic)?.label ??
        "Topico";

  const recommendationText = useMemo(() => {
    if (mode === "var") {
      return "Modo VAR: analiza APP, OFR, error claro y manifiesto, revision factual o subjetiva.";
    }

    if (!selectedTopic) {
      return "Elegi un topico para entrenar clips especificos.";
    }

    const map: Record<TrainingTopic, string> = {
      ALL: "Entrenamiento general con todos los clips disponibles.",
      Dispute:
        "Disputas: evalua intensidad, punto de contacto, disputa normal vs infraccion y consecuencia de la accion.",
      "Tactical foul":
        "Faltas tacticas: trabaja SPA, DOGSO, ventaja, imprudencia, temeridad y control disciplinario.",
      Offside:
        "Fuera de juego: identifica interferencia en el juego, interferencia en adversario o sacar ventaja.",
      Handball:
        "Manos: diferencia mano deliberada, bloqueo, inmediatez y posicion antinatural del brazo.",
    };

    return map[selectedTopic];
  }, [selectedTopic, mode]);

  function selectTopic(topic: TrainingTopic) {
    setSelectedTopic(topic);
    setCurrentIndex(0);
  }

  function backToTopics() {
    setSelectedTopic(null);
    setCurrentIndex(0);
  }

  function nextClip() {
    if (currentIndex < clips.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      alert("Terminaste todos los clips disponibles.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-zinc-400 sm:p-8">
        Cargando entrenamiento...
      </div>
    );
  }

  if (mode !== "var" && !selectedTopic) {
    return (
      <div className="w-full max-w-full space-y-5 overflow-hidden">
        <div className="max-w-full overflow-hidden rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 sm:p-5">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
            TRAINING MODE
          </p>

          <h2 className="mt-3 break-words text-xl font-black leading-tight sm:text-2xl">
            Elegi que topico queres entrenar
          </h2>

          <p className="mt-2 text-sm text-zinc-300">
            Selecciona una categoria tecnica para practicar solo clips de ese tema.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {trainingTopics.map((topic) => (
            <button
              key={topic.value}
              onClick={() => selectTopic(topic.value)}
              disabled={topicCounts[topic.value] === 0}
              className="min-w-0 rounded-3xl border border-white/10 bg-[#0f1720] p-4 text-left transition hover:border-[#6fc11f]/40 hover:bg-[#6fc11f]/10 disabled:cursor-not-allowed disabled:opacity-40 sm:p-5"
            >
              <div className="flex min-w-0 flex-col gap-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between sm:gap-4">
                <div>
                  <p className="break-words text-lg font-black sm:text-xl">{topic.label}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {topic.description}
                  </p>
                </div>

                <span className="w-fit shrink-0 rounded-full border border-[#6fc11f]/30 px-3 py-1 text-xs font-black text-[#6fc11f]">
                  {topicCounts[topic.value]} clips
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!currentClip) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-zinc-400 sm:p-8">
        No hay clips cargados para este modo.
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-5 overflow-hidden">
      <div className="max-w-full overflow-hidden rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 sm:p-5">
        <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f] sm:text-xs sm:tracking-[0.35em]">
          {mode === "var" ? "VAR TRAINING" : "TOPIC TRAINING"}
        </p>

        <div className="mt-3 flex min-w-0 flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">
              Entrenamiento: {selectedTopicLabel}
            </h2>

            <p className="mt-2 text-sm text-zinc-300">{recommendationText}</p>
          </div>

          <div className="w-fit rounded-2xl bg-black/30 px-4 py-3 text-sm font-black md:px-5">
            Clip {currentIndex + 1} / {clips.length}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between">
        {mode !== "var" && (
          <button
            onClick={backToTopics}
            className="min-h-12 rounded-xl bg-white/10 px-5 py-3 text-center font-black text-white transition hover:bg-white/15"
          >
            Cambiar topico
          </button>
        )}

        <button
          onClick={nextClip}
          className="min-h-12 rounded-xl bg-white/10 px-5 py-3 text-center font-black text-white transition hover:bg-white/15"
        >
          SIGUIENTE CLIP
        </button>
      </div>

      {mode === "var" || currentClip.topic === "VAR" || currentClip.mode === "var" ? (
        <VarExercise clip={currentClip} />
      ) : (
        <ClipExercise clip={currentClip} />
      )}
    </div>
  );
}

function matchTopic(clip: ClipWithMode, topic: TrainingTopic) {
  if (topic === "ALL") return true;

  return topicAliases[topic].includes(clip.topic);
}

function shuffleClips(clips: ClipWithMode[]) {
  return [...clips].sort(() => Math.random() - 0.5);
}

