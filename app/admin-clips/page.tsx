"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/lib/useUserRole";
import type { Clip, TrainingMode } from "@/lib/types";

export default function AdminClipsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();

  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<TrainingMode>("field");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("Tactical foul");
  const [difficulty, setDifficulty] = useState("medium");
  const [correctFoul, setCorrectFoul] = useState(true);
  const [correctRestart, setCorrectRestart] = useState("Tiro libre directo");
  const [correctDiscipline, setCorrectDiscipline] = useState("Amarilla");
  const [correctVar, setCorrectVar] = useState(false);
  const [explanation, setExplanation] = useState("");

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [loadingRole, isLoaded, user, isVideoAdmin, router]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isVideoAdmin) return;

    loadClips();
  }, [isLoaded, loadingRole, user, isVideoAdmin]);

  async function loadClips() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clips")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando clips:", error);
      setClips([]);
    } else {
      setClips((data ?? []) as Clip[]);
    }

    setLoading(false);
  }

  async function createClip() {
    if (!title.trim() || !videoUrl.trim()) {
      alert("Título y URL del video son obligatorios.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("clips").insert([
      {
        title,
        description,
        video_url: videoUrl,
        topic,
        difficulty,
        mode,
        correct_foul: correctFoul,
        correct_restart: correctRestart,
        correct_discipline: correctDiscipline,
        correct_var: correctVar,
        explanation,
      },
    ]);

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    reset();
    await loadClips();
    setSaving(false);
  }

  function reset() {
    setTitle("");
    setDescription("");
    setVideoUrl("");
    setExplanation("");
  }

  async function deleteClip(id: string) {
    const confirmDelete = confirm("¿Eliminar este clip?");
    if (!confirmDelete) return;

    const { error } = await supabase.from("clips").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadClips();
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="text-zinc-400">Validando acceso...</div>
      </AppShell>
    );
  }

  if (!user) {
    return null;
  }

  if (!isVideoAdmin) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-300">
          No tenés permisos para acceder a Admin Clips.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-black">Admin de Clips</h1>
          <p className="text-zinc-400">Cargá jugadas para entrenamiento.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-4 rounded-3xl border border-white/10 bg-[#0f1720] p-6">
            <Select
              label="Modo"
              value={mode}
              onChange={(value) => setMode(value as TrainingMode)}
              options={[
                { value: "field", label: "Árbitro" },
                { value: "var", label: "VAR" },
                { value: "english", label: "Inglés" },
              ]}
            />

            <Input label="Título" value={title} onChange={setTitle} />
            <Textarea label="Descripción" value={description} onChange={setDescription} />
            <Input label="URL del video" value={videoUrl} onChange={setVideoUrl} />

            {videoUrl && (
              <video
                src={videoUrl}
                controls
                className="aspect-video w-full rounded-xl bg-black object-cover"
              />
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Categoría"
                value={topic}
                onChange={setTopic}
                options={[
                  { value: "Tactical foul", label: "Faltas tácticas" },
                  { value: "Handball", label: "Manos" },
                  { value: "Offside", label: "Fuera de juego" },
                  { value: "Dispute", label: "Disputas" },
                  { value: "DOGSO", label: "DOGSO" },
                  { value: "SPA", label: "SPA" },
                  { value: "VAR", label: "VAR" },
                ]}
              />

              <Select
                label="Dificultad"
                value={difficulty}
                onChange={setDifficulty}
                options={[
                  { value: "easy", label: "Fácil" },
                  { value: "medium", label: "Media" },
                  { value: "hard", label: "Difícil" },
                ]}
              />
            </div>

            {mode === "field" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <BooleanSelect
                    label="¿Hubo infracción?"
                    value={correctFoul}
                    onChange={setCorrectFoul}
                  />

                  <BooleanSelect
                    label="¿Revisable por VAR?"
                    value={correctVar}
                    onChange={setCorrectVar}
                  />
                </div>

                <Select
                  label="Reanudación"
                  value={correctRestart}
                  onChange={setCorrectRestart}
                  options={[
                    { value: "Tiro libre directo", label: "Tiro libre directo" },
                    { value: "Tiro libre indirecto", label: "Tiro libre indirecto" },
                    { value: "Penal", label: "Penal" },
                    { value: "Saque de meta", label: "Saque de meta" },
                    { value: "Saque de esquina", label: "Saque de esquina" },
                    { value: "Saque de banda", label: "Saque de banda" },
                    { value: "Balón a tierra", label: "Balón a tierra" },
                    { value: "Gol", label: "Gol" },
                    { value: "No gol", label: "No gol" },
                  ]}
                />

                <Select
                  label="Disciplina"
                  value={correctDiscipline}
                  onChange={setCorrectDiscipline}
                  options={[
                    { value: "Sin sanción", label: "Sin sanción" },
                    { value: "Amarilla", label: "Amarilla" },
                    { value: "Roja", label: "Roja" },
                  ]}
                />
              </>
            )}

            <Textarea label="Fundamento" value={explanation} onChange={setExplanation} />

            <button
              onClick={createClip}
              disabled={saving}
              className="w-full rounded-xl bg-[#6fc11f] py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
            >
              {saving ? "GUARDANDO..." : "CREAR CLIP"}
            </button>
          </section>

          <section className="space-y-3 rounded-3xl border border-white/10 bg-[#0f1720] p-6">
            <h2 className="text-xl font-black">Clips cargados</h2>

            {loading ? (
              <p className="text-zinc-400">Cargando clips...</p>
            ) : clips.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-zinc-500">
                Todavía no hay clips cargados.
              </div>
            ) : (
              clips.map((clip) => (
                <div
                  key={clip.id}
                  className="rounded-2xl border border-white/10 bg-black/25 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black">{clip.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {clip.mode ?? "field"} · {clip.topic ?? "-"} ·{" "}
                        {clip.difficulty ?? "-"}
                      </p>
                    </div>

                    <button
                      onClick={() => deleteClip(clip.id)}
                      className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-500/20"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-24 w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function BooleanSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Select
      label={label}
      value={value ? "true" : "false"}
      onChange={(value) => onChange(value === "true")}
      options={[
        { value: "true", label: "Sí" },
        { value: "false", label: "No" },
      ]}
    />
  );
}