"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ClipExercise } from "@/components/ClipExercise";
import { supabase } from "@/lib/supabase";
import type { Clip } from "@/lib/types";

export default function FieldTrainingPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadClips() {
      setLoading(true);

      const { data, error } = await supabase
        .from("clips")
        .select("*")
        .eq("mode", "field")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error cargando clips:", error);
        setClips([]);
      } else {
        setClips((data ?? []) as Clip[]);
      }

      setLoading(false);
    }

    loadClips();
  }, []);

  const currentClip = clips[currentIndex];

  function nextClip() {
    setCurrentIndex((prev) => {
      if (prev >= clips.length - 1) return prev;
      return prev + 1;
    });
  }

  function previousClip() {
    setCurrentIndex((prev) => {
      if (prev <= 0) return prev;
      return prev - 1;
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="rounded-[24px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
                RefLab Training
              </p>

              <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
                Modo Entrenamiento
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                Analizá clips, tomá una decisión técnica, definí la reanudación
                y la sanción disciplinaria.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                Clip
              </p>
              <p className="mt-1 text-sm font-black text-white">
                {clips.length > 0 ? `${currentIndex + 1} / ${clips.length}` : "0 / 0"}
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            Cargando clips...
          </div>
        ) : !currentClip ? (
          <div className="rounded-[24px] border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
            No hay clips cargados para modo entrenamiento.
          </div>
        ) : (
          <>
            <div className="flex justify-end gap-3">
              <button
                onClick={previousClip}
                disabled={currentIndex === 0}
                className="rounded-xl bg-white/10 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
              >
                ← Anterior
              </button>

              <button
                onClick={nextClip}
                disabled={currentIndex >= clips.length - 1}
                className="rounded-xl bg-[#6fc11f] px-4 py-3 text-sm font-black text-black disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>

            <ClipExercise clip={currentClip} onBack={previousClip} />
          </>
        )}
      </div>
    </AppShell>
  );
}