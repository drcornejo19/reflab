"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";

export default function VideoAnalysisPage() {
  const [videoUrl, setVideoUrl] = useState("");
  const [decision, setDecision] = useState("");
  const [restart, setRestart] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [analysis, setAnalysis] = useState("");

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] space-y-5">
        <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            REFLAB VIDEO ANALYSIS
          </p>

          <h1 className="mt-3 text-3xl font-black">Video Análisis</h1>

          <p className="mt-2 text-sm text-zinc-400">
            Cargá una URL de video, analizá la jugada y justificá tu decisión arbitral.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-[#101820] p-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                URL del video
              </span>

              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Pegá una URL pública del video..."
                className="w-full rounded-2xl border border-white/10 bg-[#0b111b] px-4 py-4 text-white outline-none placeholder:text-zinc-600"
              />
            </label>

            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                className="mt-5 aspect-video w-full rounded-2xl bg-black object-cover"
              />
            ) : (
              <div className="mt-5 grid aspect-video place-items-center rounded-2xl border border-dashed border-white/10 bg-black/30 text-center text-sm text-zinc-500">
                Pegá una URL para previsualizar el video.
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-3xl border border-white/10 bg-[#101820] p-5">
            <Select
              label="Decisión técnica"
              value={decision}
              onChange={setDecision}
              options={[
                "Falta",
                "No falta",
                "Fuera de juego",
                "No fuera de juego",
                "Mano sancionable",
                "Mano no sancionable",
                "Revisión VAR recomendada",
                "Check complete",
              ]}
            />

            <Select
              label="Reanudación"
              value={restart}
              onChange={setRestart}
              options={[
                "Seguir el juego",
                "Tiro libre directo",
                "Tiro libre indirecto",
                "Penal",
                "Saque de meta",
                "Saque de esquina",
                "Saque de banda",
                "Balón a tierra",
              ]}
            />

            <Select
              label="Sanción disciplinaria"
              value={discipline}
              onChange={setDiscipline}
              options={["Sin sanción", "Amarilla", "Roja"]}
            />

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
                Fundamento arbitral
              </span>

              <textarea
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                placeholder="Explicá criterio, punto de contacto, intensidad, APP, DOGSO, SPA, mano, offside, etc."
                className="min-h-36 w-full rounded-2xl border border-white/10 bg-[#0b111b] px-4 py-4 text-white outline-none placeholder:text-zinc-600"
              />
            </label>
          </div>
        </section>

        <section className="rounded-3xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
          <h2 className="text-lg font-black text-[#6fc11f]">Resumen del análisis</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info title="Decisión" value={decision || "-"} />
            <Info title="Reanudación" value={restart || "-"} />
            <Info title="Disciplina" value={discipline || "-"} />
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-300">
            {analysis || "Todavía no escribiste un fundamento."}
          </p>
        </section>
      </div>
    </AppShell>
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
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#0b111b] px-4 py-4 text-white outline-none"
      >
        <option value="">Seleccioná una opción</option>

        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Info({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}