"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import type { Clip, TrainingMode } from "@/lib/types";

export default function AdminClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // FORM
  const [mode, setMode] = useState<TrainingMode>("field");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("SPA");
  const [difficulty, setDifficulty] = useState("medium");

  const [correctFoul, setCorrectFoul] = useState(true);
  const [correctRestart, setCorrectRestart] = useState("Tiro libre directo");
  const [correctDiscipline, setCorrectDiscipline] = useState("Amarilla");
  const [correctVar, setCorrectVar] = useState(false);

  const [explanation, setExplanation] = useState("");

  async function loadClips() {
    setLoading(true);

    const { data } = await supabase
      .from("clips")
      .select("*")
      .order("created_at", { ascending: false });

    setClips(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadClips();
  }, []);

  async function createClip() {
    if (!title || !videoUrl) return alert("Faltan datos");

    setSaving(true);

    await supabase.from("clips").insert([
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
    await supabase.from("clips").delete().eq("id", id);
    loadClips();
  }

  return (
    <AppShell>
      <div className="space-y-6">

        {/* HEADER */}
        <div>
          <h1 className="text-3xl font-black">Admin de Clips</h1>
          <p className="text-zinc-400">Cargá jugadas para entrenamiento</p>
        </div>

        {/* FORM */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* LEFT */}
          <div className="bg-[#0f1720] p-6 rounded-2xl border border-white/10 space-y-4">

            <Select label="Modo" value={mode} onChange={setMode} options={[
              { value: "field", label: "Árbitro" },
              { value: "var", label: "VAR" },
              { value: "english", label: "Inglés" },
            ]} />

            <Input label="Título" value={title} onChange={setTitle} />

            <Textarea label="Descripción" value={description} onChange={setDescription} />

            <Input label="URL del video" value={videoUrl} onChange={setVideoUrl} />

            {videoUrl && (
              <video src={videoUrl} controls className="rounded-lg mt-2" />
            )}

           <Select
  label="Categoría"
  value={topic}
  onChange={setTopic}
  options={[
    { value: "Tactical foul", label: "Faltas tácticas" },
    { value: "Handball", label: "Manos" },
    { value: "Offside", label: "Fuera de juego" },
    { value: "Dispute", label: "Disputas" },
  ]}
/>

            <Select label="Dificultad" value={difficulty} onChange={setDifficulty} options={[
              { value: "easy", label: "Fácil" },
              { value: "medium", label: "Media" },
              { value: "hard", label: "Difícil" },
            ]} />

            {mode === "field" && (
              <>
                <BooleanSelect label="¿Falta?" value={correctFoul} onChange={setCorrectFoul} />
                <BooleanSelect label="¿VAR?" value={correctVar} onChange={setCorrectVar} />

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
  
  ]}
/>

                <Select label="Disciplina" value={correctDiscipline} onChange={setCorrectDiscipline} options={[
                  { value: "Sin sanción", label: "Sin sanción" },
                  { value: "Amarilla", label: "Amarilla" },
                  { value: "Roja", label: "Roja" },
                ]} />
              </>
            )}

            <Textarea label="Fundamento" value={explanation} onChange={setExplanation} />

            <button
              onClick={createClip}
              className="w-full bg-[#6fc11f] py-3 rounded-xl font-black text-black"
            >
              CREAR CLIP
            </button>
          </div>

          {/* RIGHT */}
          <div className="bg-[#0f1720] p-6 rounded-2xl border border-white/10 space-y-3">

            {loading ? (
              <p>Cargando...</p>
            ) : clips.map(c => (
              <div key={c.id} className="p-4 border border-white/10 rounded-xl">

                <div className="flex justify-between">
                  <div>
                    <p className="font-bold">{c.title}</p>
                    <p className="text-xs text-zinc-400">{c.mode}</p>
                  </div>

                  <button
                    onClick={() => deleteClip(c.id)}
                    className="text-red-400 text-xs"
                  >
                    Eliminar
                  </button>
                </div>

              </div>
            ))}

          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Input({ label, value, onChange }: any) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0b111b] border border-white/10 px-3 py-2 rounded-lg"
      />
    </div>
  );
}

function Textarea({ label, value, onChange }: any) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0b111b] border border-white/10 px-3 py-2 rounded-lg"
      />
    </div>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#0b111b] border border-white/10 px-3 py-2 rounded-lg text-white"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function BooleanSelect({ label, value, onChange }: any) {
  return (
    <Select
      label={label}
      value={value ? "true" : "false"}
      onChange={(v: string) => onChange(v === "true")}
      options={[
        { value: "true", label: "Sí" },
        { value: "false", label: "No" },
      ]}
    />
  );
}