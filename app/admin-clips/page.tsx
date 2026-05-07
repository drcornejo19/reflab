"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useUserRole } from "@/lib/useUserRole";
import type { Clip, TrainingMode } from "@/lib/types";

type ClipWithDetails = Clip & {
  sub_type?: string | null;
  decision_detail?: string | null;
};

const topicOptions = [
  { value: "Dispute", label: "Disputas" },
  { value: "Tactical foul", label: "Faltas tácticas" },
  { value: "Offside", label: "Fuera de juego" },
  { value: "Handball", label: "Manos" },
  { value: "VAR", label: "VAR" },
];

const offsideSubTypes = [
  { value: "interferir_juego", label: "Interfiere en el juego" },
  { value: "interferir_adversario", label: "Interfiere en el adversario" },
  { value: "sacar_ventaja", label: "Saca ventaja de su posición" },
];

const handballSubTypes = [
  { value: "inmediatez", label: "Mano de inmediatez" },
  { value: "deliberada", label: "Mano deliberada" },
  { value: "bloqueo", label: "Mano de bloqueo / cuerpo antinatural" },
  { value: "no_sancionable", label: "No sancionable" },
];

export default function AdminClipsPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();

  const [clips, setClips] = useState<ClipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<TrainingMode>("field");
  const [videoUrl, setVideoUrl] = useState("");
  const [topic, setTopic] = useState("Offside");
  const [subType, setSubType] = useState("interferir_juego");
  const [decisionDetail, setDecisionDetail] = useState("");
  const [difficulty, setDifficulty] = useState("medium");

  const [correctFoul, setCorrectFoul] = useState(false);
  const [correctRestart, setCorrectRestart] = useState("Seguir el juego");
  const [correctDiscipline, setCorrectDiscipline] =
    useState("Sin sanción");
  const [correctVar, setCorrectVar] = useState(false);
  const [explanation, setExplanation] = useState("");

  const [editingClipId, setEditingClipId] = useState<string | null>(null);

  function startEdit(clip: ClipWithDetails) {
    setEditingClipId(clip.id);

    setVideoUrl(clip.video_url ?? "");

    setTopic(clip.topic ?? "Offside");

    setSubType(clip.sub_type ?? "");

    setDecisionDetail(clip.decision_detail ?? "");

    setMode((clip.mode as TrainingMode) ?? "field");

    setDifficulty(clip.difficulty ?? "medium");

    setCorrectFoul(Boolean(clip.correct_foul));

    setCorrectRestart(
      clip.correct_restart ?? "Seguir el juego"
    );

    setCorrectDiscipline(
      clip.correct_discipline ?? "Sin sanción"
    );

    setCorrectVar(Boolean(clip.correct_var));

    setExplanation(clip.explanation ?? "");
  }

  const subTypeOptions = useMemo(() => {
    if (topic === "Offside") return offsideSubTypes;

    if (topic === "Handball") return handballSubTypes;

    return [];
  }, [topic]);

  const restartOptions = useMemo(() => {
    if (correctFoul) {
      return [
        {
          value: "Tiro libre directo",
          label: "Tiro libre directo",
        },
        {
          value: "Tiro libre indirecto",
          label: "Tiro libre indirecto",
        },
        {
          value: "Penal",
          label: "Penal",
        },
      ];
    }

    return [
      {
        value: "Seguir el juego",
        label: "Seguir el juego",
      },
      {
        value: "Saque de meta",
        label: "Saque de meta",
      },
      {
        value: "Saque de esquina",
        label: "Saque de esquina",
      },
      {
        value: "Saque de banda",
        label: "Saque de banda",
      },
      {
        value: "Gol",
        label: "Gol",
      },
      {
        value: "Balón a tierra",
        label: "Balón a tierra",
      },
    ];
  }, [correctFoul]);

  useEffect(() => {
    if (editingClipId) return;

    if (topic === "Offside") {
      setSubType("interferir_juego");
      setDecisionDetail("");
      setCorrectFoul(true);
      setCorrectRestart("Tiro libre indirecto");
      setCorrectDiscipline("Sin sanción");
      setCorrectVar(false);
    }

    if (topic === "Handball") {
      setSubType("inmediatez");
      setDecisionDetail("");
      setCorrectFoul(true);
      setCorrectRestart("Tiro libre directo");
      setCorrectDiscipline("Sin sanción");
      setCorrectVar(false);
    }

    if (topic === "Tactical foul") {
      setSubType("");
      setDecisionDetail("");
      setCorrectFoul(true);
      setCorrectRestart("Tiro libre directo");
      setCorrectDiscipline("Amarilla");
      setCorrectVar(false);
    }

    if (topic === "Dispute") {
      setSubType("");
      setDecisionDetail("");
      setCorrectFoul(true);
      setCorrectRestart("Tiro libre directo");
      setCorrectDiscipline("Sin sanción");
      setCorrectVar(false);
    }

    if (topic === "VAR") {
      setSubType("");
      setDecisionDetail("");
      setCorrectVar(true);
    }
  }, [topic, editingClipId]);

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, user, router]);

  useEffect(() => {
    if (
      !loadingRole &&
      isLoaded &&
      user &&
      !isVideoAdmin
    ) {
      router.replace("/dashboard");
    }
  }, [
    loadingRole,
    isLoaded,
    user,
    isVideoAdmin,
    router,
  ]);

  useEffect(() => {
    if (
      !isLoaded ||
      loadingRole ||
      !user ||
      !isVideoAdmin
    )
      return;

    loadClips();
  }, [
    isLoaded,
    loadingRole,
    user,
    isVideoAdmin,
  ]);

  async function loadClips() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clips")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(error);
      setClips([]);
    } else {
      setClips((data ?? []) as ClipWithDetails[]);
    }

    setLoading(false);
  }

  async function createClip() {
    setSaving(true);

    const payload = {
      title: generateClipTitle(
        topic,
        subType,
        decisionDetail
      ),

      description: "",

      video_url: videoUrl,

      topic,

      sub_type: subType || null,

      decision_detail: decisionDetail || null,

      difficulty,

      mode,

      correct_foul: correctFoul,

      correct_restart: correctRestart,

      correct_discipline: correctDiscipline,

      correct_var: correctVar,

      explanation,
    };

    if (editingClipId) {
      const { error } = await supabase
        .from("clips")
        .update(payload)
        .eq("id", editingClipId);

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase
        .from("clips")
        .insert([payload]);

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    }

    reset();

    await loadClips();

    setSaving(false);
  }

  function reset() {
    setVideoUrl("");

    setExplanation("");

    setTopic("Offside");

    setSubType("interferir_juego");

    setDecisionDetail("");

    setDifficulty("medium");

    setMode("field");

    setCorrectFoul(false);

    setCorrectRestart("Seguir el juego");

    setCorrectDiscipline("Sin sanción");

    setCorrectVar(false);

    setEditingClipId(null);
  }

  async function deleteClip(id: string) {
    const confirmDelete = confirm(
      "¿Eliminar este clip?"
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("clips")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadClips();
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user) return null;

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
          <h1 className="text-3xl font-black">
            Admin de Clips
          </h1>

          <p className="text-zinc-400">
            Cargá jugadas con decisión técnica validada.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-4 rounded-3xl border border-white/10 bg-[#0f1720] p-6">
            {editingClipId && (
              <div className="rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#6fc11f]">
                Estás editando un clip existente.
              </div>
            )}

            <Select
              label="Modo del clip"
              value={mode}
              onChange={(value) =>
                setMode(value as TrainingMode)
              }
              options={[
                {
                  value: "field",
                  label: "Árbitro",
                },
                {
                  value: "var",
                  label: "VAR",
                },
                {
                  value: "english",
                  label: "Inglés",
                },
                {
                  value: "exam",
                  label: "Examen",
                },
                {
                  value: "training",
                  label:
                    "Entrenamiento general",
                },
              ]}
            />

            <Input
              label="URL del video"
              value={videoUrl}
              onChange={setVideoUrl}
            />

            {videoUrl && (
              <video
                src={videoUrl}
                controls
                className="aspect-video w-full rounded-xl bg-black object-cover"
              />
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Categoría técnica"
                value={topic}
                onChange={setTopic}
                options={topicOptions}
              />

            </div>

            {subTypeOptions.length > 0 && (
              <Select
                label={
                  topic === "Offside"
                    ? "Tipo de fuera de juego"
                    : "Tipo de mano"
                }
                value={subType}
                onChange={setSubType}
                options={subTypeOptions}
              />
            )}

            <BooleanSelect
              label="¿Hubo infracción?"
              value={correctFoul}
              onChange={(value) => {
                setCorrectFoul(value);

                if (value) {
                  setCorrectRestart(
                    "Tiro libre directo"
                  );
                } else {
                  setCorrectRestart(
                    "Seguir el juego"
                  );
                }
              }}
            />

            <Select
              label="Reanudación correcta"
              value={correctRestart}
              onChange={setCorrectRestart}
              options={restartOptions}
            />

            <Select
              label="Disciplina correcta"
              value={correctDiscipline}
              onChange={setCorrectDiscipline}
              options={[
                {
                  value: "Sin sanción",
                  label: "Sin sanción",
                },
                {
                  value: "Amarilla",
                  label: "Amarilla",
                },
                {
                  value: "Roja",
                  label: "Roja",
                },
              ]}
            />


            <Textarea
              label="Fundamento / aval de la decisión"
              value={explanation}
              onChange={setExplanation}
            />

            <div className="flex gap-3">
              <button
                onClick={createClip}
                disabled={saving}
                className="w-full rounded-xl bg-[#6fc11f] py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50"
              >
                {saving
                  ? "GUARDANDO..."
                  : editingClipId
                    ? "GUARDAR CAMBIOS"
                    : "CREAR CLIP"}
              </button>

              {editingClipId && (
                <button
                  onClick={reset}
                  disabled={saving}
                  className="rounded-xl border border-white/10 px-5 py-4 font-black text-zinc-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  CANCELAR
                </button>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-3xl border border-white/10 bg-[#0f1720] p-6">
            <h2 className="text-xl font-black">
              Clips cargados
            </h2>

            {loading ? (
              <p className="text-zinc-400">
                Cargando clips...
              </p>
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
                    <div className="min-w-0">
                      <p className="font-black">
                        {clip.topic ?? "-"} ·{" "}
                        {labelFromValue(
                          clip.sub_type
                        )}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {clip.mode ?? "field"} ·{" "}
                        {clip.difficulty ??
                          "-"} ·{" "}
                        {clip.correct_restart ??
                          "-"}{" "}
                        ·{" "}
                        {clip.correct_discipline ??
                          "-"}
                      </p>

                      {clip.explanation && (
                        <p className="mt-2 line-clamp-2 text-xs text-zinc-400">
                          {clip.explanation}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          startEdit(clip)
                        }
                        className="rounded-xl bg-[#6fc11f]/10 px-3 py-2 text-xs font-black text-[#6fc11f] hover:bg-[#6fc11f]/20"
                      >
                        Editar
                      </button>

                      <button
                        onClick={() =>
                          deleteClip(clip.id)
                        }
                        className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-500/20"
                      >
                        Eliminar
                      </button>
                    </div>
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

function generateClipTitle(
  topic: string,
  subType: string,
  detail: string
) {
  const base = labelFromValue(topic);

  const sub = labelFromValue(subType);

  const extra = labelFromValue(detail);

  return [base, sub, extra]
    .filter(Boolean)
    .join(" · ");
}

function labelFromValue(
  value?: string | null
) {
  if (!value) return "";

  const dictionary: Record<string, string> =
    {
      Dispute: "Disputas",

      "Tactical foul":
        "Faltas tácticas",

      Offside: "Fuera de juego",

      Handball: "Manos",

      VAR: "VAR",

      interferir_juego:
        "Interfiere en el juego",

      interferir_adversario:
        "Interfiere en el adversario",

        
      sacar_ventaja:
        "Saca ventaja",

        No_fuera_de_juego:
        "No es fuera de juego",

      inmediatez:
        "Mano de inmediatez",

      deliberada:
        "Mano deliberada",

      bloqueo:
        "Mano de bloqueo",

      no_sancionable:
        "No sancionable",
    };

  return dictionary[value] ?? value;
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">
        {label}
      </span>

      <input
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
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
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">
        {label}
      </span>

      <textarea
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
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
  onChange: (
    value: string
  ) => void;
  options: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-bold text-zinc-400">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
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
  onChange: (
    value: boolean
  ) => void;
}) {
  return (
    <Select
      label={label}
      value={value ? "true" : "false"}
      onChange={(value) =>
        onChange(value === "true")
      }
      options={[
        {
          value: "true",
          label: "Sí",
        },
        {
          value: "false",
          label: "No",
        },
      ]}
    />
  );
}