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

type Attempt = {
  technical_correct: boolean | null;
  restart_correct: boolean | null;
  discipline_correct: boolean | null;
  var_correct: boolean | null;
};

type WeakArea = "technical" | "restart" | "discipline" | "var" | "general";

type TrainingClientProps = {
  mode?: TrainingMode;
};

export function TrainingClient({ mode = "field" }: TrainingClientProps) {
  const { user, isLoaded } = useUser();

  const [clips, setClips] = useState<ClipWithMode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [weakArea, setWeakArea] = useState<WeakArea>("general");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSmartTraining() {
      if (!isLoaded || !user) return;

      setLoading(true);
      setCurrentIndex(0);

      let detectedWeakArea: WeakArea = "general";

      if (mode === "field") {
        const { data: attempts } = await supabase
          .from("attempts")
          .select(
            "technical_correct, restart_correct, discipline_correct, var_correct"
          )
          .eq("user_id", user.id);

        detectedWeakArea = detectWeakArea(attempts ?? []);
        setWeakArea(detectedWeakArea);
      } else {
        setWeakArea("general");
      }

      const { data: clipsData, error } = await supabase
        .from("clips")
        .select("*")
        .eq("mode", mode);

      if (error) {
        console.error("Error cargando clips:", error);
        setClips([]);
      } else {
        const clips = (clipsData ?? []) as ClipWithMode[];

        const ordered =
          mode === "field"
            ? prioritizeClips(clips, detectedWeakArea)
            : shuffleClips(clips);

        setClips(ordered);
      }

      setLoading(false);
    }

    loadSmartTraining();
  }, [isLoaded, user, mode]);

  const currentClip = clips[currentIndex];

  const recommendationText = useMemo(() => {
    if (mode === "var") {
      return "Modo VAR: analizá si corresponde intervenir, si hay error claro y manifiesto, y qué tipo de revisión corresponde.";
    }

    if (mode === "english") {
      return "Modo Inglés: entrená decisión arbitral y comunicación técnica en inglés.";
    }

    const map: Record<WeakArea, string> = {
      technical:
        "Modo recomendado: estás fallando en detectar infracción/no infracción. Priorizamos clips de criterio técnico.",
      restart:
        "Modo recomendado: tu punto débil es la reanudación. Priorizamos clips donde el restart es clave.",
      discipline:
        "Modo recomendado: estás fallando en sanción disciplinaria. Priorizamos SPA, DOGSO y fuerza excesiva.",
      var:
        "Modo recomendado: estás fallando en criterio VAR. Priorizamos incidentes revisables y no revisables.",
      general:
        "Modo general: todavía no hay suficiente información para detectar un punto débil claro.",
    };

    return map[weakArea];
  }, [weakArea, mode]);

  function nextClip() {
    if (currentIndex < clips.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      alert("Terminaste todos los clips disponibles.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        Cargando entrenamiento...
      </div>
    );
  }

  if (!currentClip) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        No hay clips cargados para este modo.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-5">
        <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
          {mode === "var"
            ? "VAR Training"
            : mode === "english"
              ? "English Training"
              : "Smart Training"}
        </p>

        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black">
              {mode === "var"
                ? "Modo VAR"
                : mode === "english"
                  ? "Modo Inglés"
                  : "Entrenamiento adaptativo"}
            </h2>

            <p className="mt-2 text-sm text-zinc-300">{recommendationText}</p>
          </div>

          <div className="rounded-2xl bg-black/30 px-5 py-3 text-sm font-black">
            Clip {currentIndex + 1} / {clips.length}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={nextClip}
          className="rounded-xl bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15"
        >
          SIGUIENTE CLIP →
        </button>
      </div>

      {mode === "var" || currentClip.mode === "var" ? (
        <VarExercise clip={currentClip} />
      ) : (
        <ClipExercise clip={currentClip} />
      )}
    </div>
  );
}

function detectWeakArea(attempts: Attempt[]): WeakArea {
  if (attempts.length < 3) return "general";

  const technical = percent(attempts, "technical_correct");
  const restart = percent(attempts, "restart_correct");
  const discipline = percent(attempts, "discipline_correct");
  const varScore = percent(attempts, "var_correct");

  const scores = [
    { key: "technical" as WeakArea, value: technical },
    { key: "restart" as WeakArea, value: restart },
    { key: "discipline" as WeakArea, value: discipline },
    { key: "var" as WeakArea, value: varScore },
  ];

  scores.sort((a, b) => a.value - b.value);

  return scores[0].value < 70 ? scores[0].key : "general";
}

function percent(attempts: Attempt[], key: keyof Attempt) {
  const valid = attempts.filter((a) => typeof a[key] === "boolean");
  if (valid.length === 0) return 0;

  const correct = valid.filter((a) => a[key] === true).length;
  return Math.round((correct / valid.length) * 100);
}

function shuffleClips(clips: ClipWithMode[]) {
  return [...clips].sort(() => Math.random() - 0.5);
}

function prioritizeClips(clips: ClipWithMode[], weakArea: WeakArea) {
  const shuffled = shuffleClips(clips);

  if (weakArea === "general") return shuffled;

  const priorityTopics: Record<WeakArea, string[]> = {
    technical: ["Challenge", "Dispute", "Tactical foul", "SPA", "Penalty area"],
    restart: ["SPA", "DOGSO", "Offside", "Handball", "Penalty area"],
    discipline: ["SPA", "DOGSO", "Reckless", "Excessive force", "Violent conduct"],
    var: ["VAR", "Penalty area", "DOGSO", "Red card", "Handball"],
    general: [],
  };

  const topics = priorityTopics[weakArea];

  return shuffled.sort((a, b) => {
    const aPriority = topics.includes(a.topic) ? 1 : 0;
    const bPriority = topics.includes(b.topic) ? 1 : 0;

    if (aPriority !== bPriority) return bPriority - aPriority;

    const difficultyOrder: Record<string, number> = {
      easy: 1,
      medium: 2,
      hard: 3,
    };

    return (
      (difficultyOrder[a.difficulty] ?? 99) -
      (difficultyOrder[b.difficulty] ?? 99)
    );
  });
}