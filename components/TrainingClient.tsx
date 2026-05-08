"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import type { Clip } from "@/lib/types";
import { ClipExercise } from "@/components/ClipExercise";
import { VarExercise } from "@/components/VarExercise";

type TrainingMode = "field" | "var" | "english";

type ClipWithMode = Clip & {
  mode?: TrainingMode;
};

type TrainingTopic =
  | "Dispute"
  | "Tactical foul"
  | "Offside"
  | "Handball"
  | "VAR";

type TrainingClientProps = {
  mode?: TrainingMode;
};

const trainingTopics: {
  value: TrainingTopic;
  label: string;
  description: string;
}[] = [
  {
    value: "Dispute",
    label: "Disputas",
    description: "Contacto, intensidad, punto de contacto y criterio técnico.",
  },
  {
    value: "Tactical foul",
    label: "Faltas tácticas",
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
    description: "Deliberada, bloqueo, inmediatez y posición antinatural.",
  },
  {
    value: "VAR",
    label: "VAR",
    description: "APP, OFR, factual review, subjective review y check complete.",
  },
];

export function TrainingClient({ mode = "field" }: TrainingClientProps) {
  const { user, isLoaded } = useUser();

  const [allClips, setAllClips] = useState<ClipWithMode[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<TrainingTopic | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTrainingClips() {
      if (!isLoaded) return;

      setLoading(true);
      setCurrentIndex(0);

      let query = supabase.from("clips").select("*");

      if (mode === "var") {
        query = query.eq("topic", "VAR");
      } else if (mode === "english") {
        query = query.eq("mode", "english");
      } else {
        query = query.in("topic", [
          "Dispute",
          "Tactical foul",
          "Offside",
          "Handball",
          "VAR",
        ]);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error cargando clips:", error);
        setAllClips([]);
      } else {
        setAllClips(shuffleClips((data ?? []) as ClipWithMode[]));
      }

      setLoading(false);
    }

    loadTrainingClips();
  }, [isLoaded, user, mode]);

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [currentIndex, selectedTopic]);

  const topicCounts = useMemo(() => {
    return trainingTopics.reduce(
      (acc, topic) => {
        acc[topic.value] = allClips.filter(
          (clip) => clip.topic === topic.value
        ).length;
        return acc;
      },
      {} as Record<TrainingTopic, number>
    );
  }, [allClips]);

  const clips = useMemo(() => {
    if (!selectedTopic) return [];

    return allClips.filter((clip) => clip.topic === selectedTopic);
  }, [allClips, selectedTopic]);

  const currentClip = clips[currentIndex];

  const selectedTopicLabel =
    trainingTopics.find((topic) => topic.value === selectedTopic)?.label ??
    "Tópico";

  const recommendationText = useMemo(() => {
    if (!selectedTopic) {
      return "Elegí un tópico para entrenar clips específicos.";
    }

    const map: Record<TrainingTopic, string> = {
      Dispute:
        "Disputas: evaluá intensidad, punto de contacto, disputa normal vs infracción y consecuencia de la acción.",
      "Tactical foul":
        "Faltas tácticas: trabajá SPA, DOGSO, ventaja, imprudencia, temeridad y control disciplinario.",
      Offside:
        "Fuera de juego: identificá interferencia en el juego, interferencia en adversario o sacar ventaja.",
      Handball:
        "Manos: diferenciá mano deliberada, bloqueo, inmediatez y posición antinatural del brazo.",
      VAR:
        "VAR: analizá APP, OFR, error claro y manifiesto, revisión factual o subjetiva.",
    };

    return map[selectedTopic];
  }, [selectedTopic]);

  function selectTopic(topic: TrainingTopic) {
    setSelectedTopic(topic);
    setCurrentIndex(0);
  }

  function backToTopics() {
    setSelectedTopic(mode === "var" ? "VAR" : null);
    setCurrentIndex(0);
  }

  function nextClip() {
    if (currentIndex < clips.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      alert("Terminaste todos los clips disponibles de este tópico.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        Cargando entrenamiento...
      </div>
    );
  }

  if (!selectedTopic) {
    return (
      <div className="space-y-5">
        <div className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Training Mode
          </p>

          <h2 className="mt-3 text-2xl font-black">
            Elegí qué tópico querés entrenar
          </h2>

          <p className="mt-2 text-sm text-zinc-300">
            Seleccioná una categoría técnica para practicar solo clips de ese
            tema.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trainingTopics.map((topic) => (
            <button
              key={topic.value}
              onClick={() => selectTopic(topic.value)}
              disabled={topicCounts[topic.value] === 0}
              className="rounded-3xl border border-white/10 bg-[#0f1720] p-5 text-left transition hover:border-[#6fc11f]/40 hover:bg-[#6fc11f]/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xl font-black">{topic.label}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {topic.description}
                  </p>
                </div>

                <span className="rounded-full border border-[#6fc11f]/30 px-3 py-1 text-xs font-black text-[#6fc11f]">
                  {topicCounts[topic.value]} clips
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "var" && !selectedTopic) {
  setSelectedTopic("VAR");
}

  if (!currentClip) {
    return (
      <div className="space-y-4">
        {mode !== "var" && (
          <button
            onClick={backToTopics}
            className="rounded-xl bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15"
          >
            ← Cambiar tópico
          </button>
        )}

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
          No hay clips cargados para este tópico.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-5">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
          {selectedTopic === "VAR" ? "VAR Training" : "Topic Training"}
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">
              Entrenamiento: {selectedTopicLabel}
            </h2>

            <p className="mt-2 text-sm text-zinc-300">
              {recommendationText}
            </p>
          </div>

          <div className="rounded-2xl bg-black/30 px-5 py-3 text-sm font-black">
            Clip {currentIndex + 1} / {clips.length}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        {mode !== "var" && (
          <button
            onClick={backToTopics}
            className="rounded-xl bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15"
          >
            ← Cambiar tópico
          </button>
        )}

        <button
          onClick={nextClip}
          className="rounded-xl bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15"
        >
          SIGUIENTE CLIP →
        </button>
      </div>

      {selectedTopic === "VAR" || currentClip.mode === "var" ? (
        <VarExercise clip={currentClip} />
      ) : (
        <ClipExercise clip={currentClip} />
      )}
    </div>
  );
}

function shuffleClips(clips: ClipWithMode[]) {
  return [...clips].sort(() => Math.random() - 0.5);
}