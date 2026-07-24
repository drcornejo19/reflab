"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Loader2, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useSupabase } from "@/components/SupabaseProvider";
import {
  deleteClipById,
  getClips,
  insertClipDecision,
  normalizeClipDecision,
  updateClipDecision,
  validateClipDecision,
  type ClipDecisionPayload,
} from "@/lib/clips";
import {
  getActiveSeasonForSport,
  getDefaultSourceVersionForSport,
  getGoverningBodyForSport,
  getSportLabel,
  normalizeSportType,
  type SportType,
} from "@/lib/sports";
import {
  clipDifficultyOptions,
  getVideoTopicOptionsForSport,
  languageOptions,
  normativeStatusOptions,
  sportTypeOptions,
} from "@/lib/sportFormOptions";
import type { Clip, TrainingMode } from "@/lib/types";
import { useUserRole } from "@/lib/useUserRole";
import {
  getVideoTopicSchema,
  type VideoFieldDefinition,
} from "@/lib/videoAnalysisSchemas";

type ClipWithDetails = Clip & {
  sub_type?: string | null;
  decision_detail?: string | null;
};

type VideoAnswerValue = string | boolean | null;
type AdminFormState = {
  title: string;
  description: string;
  sportType: SportType;
  mode: TrainingMode;
  videoUrl: string;
  topic: string;
  subType: string;
  decisionDetail: string;
  difficulty: string;
  correctFoul: boolean;
  correctRestart: string;
  correctDiscipline: string;
  explanation: string;
  season: string;
  sourceVersion: string;
  sourceOfficial: string;
  ruleReference: string;
  technicalResolution: string;
  disciplinaryResolution: string;
  normativeStatus: string;
  language: string;
  reviewedAt: string;
  analysisAnswers: Record<string, VideoAnswerValue>;
};

const footballTopicOptions = [
  { value: "Dispute", label: "Disputas" },
  { value: "Tactical foul", label: "Faltas tacticas" },
  { value: "Offside", label: "Fuera de juego" },
  { value: "Handball", label: "Manos" },
  { value: "VAR", label: "VAR" },
];

const englishTopicOptions = [
  { value: "Communication", label: "General Communication" },
  { value: "foul_explanation", label: "Foul Explanation" },
  { value: "disciplinary", label: "Disciplinary Communication" },
  { value: "var_communication", label: "VAR Communication" },
  { value: "team_management", label: "Team Management" },
  { value: "offside_communication", label: "Offside Communication" },
  { value: "penalty_incident", label: "Penalty Incident" },
  { value: "report_language", label: "Report / Post-Match Language" },
  { value: "DOGSO", label: "DOGSO" },
  { value: "SPA", label: "SPA" },
  { value: "Handball", label: "Handball" },
  { value: "Offside", label: "Offside" },
];

const footballSubTypeOptions: Record<string, Array<{ value: string; label: string }>> = {
  Offside: [
    { value: "interferir_juego", label: "Interfiere en el juego" },
    { value: "interferir_adversario", label: "Interfiere en el adversario" },
    { value: "sacar_ventaja", label: "Saca ventaja" },
    { value: "no_offside", label: "No fuera de juego" },
  ],
  Handball: [
    { value: "inmediatez", label: "Inmediatez" },
    { value: "deliberada", label: "Deliberada" },
    { value: "bloqueo", label: "Bloqueo" },
    { value: "no_sancionable", label: "No sancionable" },
  ],
  VAR: [
    { value: "check_complete", label: "Check complete" },
    { value: "on_field_review", label: "On-field review" },
    { value: "confirm_decision", label: "Confirm decision" },
    { value: "app_review", label: "APP review" },
    { value: "factual_review", label: "Factual review" },
  ],
};

const foulRestartOptions = [
  { value: "Tiro libre directo", label: "Tiro libre directo" },
  { value: "Tiro libre indirecto", label: "Tiro libre indirecto" },
  { value: "Penal", label: "Penal" },
];

const noFoulRestartOptions = [
  { value: "Seguir el juego", label: "Seguir el juego" },
  { value: "Saque de meta", label: "Saque de meta" },
  { value: "Saque de esquina", label: "Saque de esquina" },
  { value: "Saque de banda", label: "Saque de banda" },
  { value: "Gol", label: "Gol" },
  { value: "Balon a tierra", label: "Balon a tierra" },
];

const disciplineOptions = [
  { value: "Sin tarjeta", label: "Sin tarjeta" },
  { value: "Amarilla", label: "Amarilla" },
  { value: "Roja", label: "Roja" },
];

const modeOptionsBySport: Record<SportType, Array<{ value: TrainingMode; label: string }>> = {
  football_11: [
    { value: "field", label: "Arbitro" },
    { value: "var", label: "VAR" },
    { value: "english", label: "Comunicacion" },
    { value: "exam", label: "Examen" },
    { value: "training", label: "Entrenamiento general" },
  ],
  futsal: [
    { value: "field", label: "Videoanalisis futsal" },
    { value: "exam", label: "Examen" },
    { value: "training", label: "Entrenamiento general" },
  ],
};

function createInitialForm(sportType: SportType = "football_11"): AdminFormState {
  return {
    title: "",
    description: "",
    sportType,
    mode: "field",
    videoUrl: "",
    topic: sportType === "football_11" ? "Offside" : "",
    subType: sportType === "football_11" ? "interferir_juego" : "",
    decisionDetail: "",
    difficulty: "intermediate",
    correctFoul: false,
    correctRestart: "Seguir el juego",
    correctDiscipline: "Sin tarjeta",
    explanation: "",
    season: getActiveSeasonForSport(sportType),
    sourceVersion: getDefaultSourceVersionForSport(sportType),
    sourceOfficial: "",
    ruleReference: "",
    technicalResolution: "",
    disciplinaryResolution: "",
    normativeStatus: "vigente",
    language: "es",
    reviewedAt: "",
    analysisAnswers: {},
  };
}

export default function AdminClipsPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const { isVideoAdmin, loadingRole } = useUserRole();
  const [clips, setClips] = useState<ClipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [form, setForm] = useState<AdminFormState>(createInitialForm());

  const isEnglishMode = form.sportType === "football_11" && form.mode === "english";
  const isFutsal = form.sportType === "futsal";
  const topicOptions = useMemo(() => {
    if (isEnglishMode) return englishTopicOptions;
    if (isFutsal) return getVideoTopicOptionsForSport("futsal");
    return footballTopicOptions;
  }, [isEnglishMode, isFutsal]);
  const subTypeOptions = useMemo(
    () => footballSubTypeOptions[form.topic] ?? [],
    [form.topic]
  );
  const futsalSchema = useMemo(
    () => (isFutsal && form.topic ? getVideoTopicSchema("futsal", form.topic) : null),
    [form.topic, isFutsal]
  );
  const restartOptions = form.correctFoul
    ? foulRestartOptions
    : noFoulRestartOptions;

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace("/sign-in");
    }
  }, [isLoaded, router, user]);

  useEffect(() => {
    if (!loadingRole && isLoaded && user && !isVideoAdmin) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isVideoAdmin, loadingRole, router, user]);

  const loadClips = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getClips(supabase);

    if (error) {
      console.error(error);
      setClips([]);
    } else {
      setClips((data ?? []) as ClipWithDetails[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!isLoaded || loadingRole || !user || !isVideoAdmin) return;
    void loadClips();
  }, [isLoaded, isVideoAdmin, loadClips, loadingRole, user]);

  function updateForm<Key extends keyof AdminFormState>(
    key: Key,
    value: AdminFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function applySportType(nextSportType: SportType) {
    setForm((current) => ({
      ...createInitialForm(nextSportType),
      sportType: nextSportType,
      title: current.title,
      description: current.description,
      videoUrl: current.videoUrl,
    }));
  }

  function startEdit(clip: ClipWithDetails) {
    const sportType = normalizeSportType(clip.sport_type);
    setEditingClipId(clip.id);
    setForm({
      title: clip.title ?? "",
      description: clip.description ?? "",
      sportType,
      mode: (clip.mode as TrainingMode) ?? "field",
      videoUrl: clip.video_url ?? "",
      topic: clip.topic ?? "",
      subType: clip.subtopic ?? clip.sub_type ?? "",
      decisionDetail: clip.decision_detail ?? "",
      difficulty: clip.difficulty ?? "intermediate",
      correctFoul: Boolean(clip.correct_foul),
      correctRestart: clip.correct_restart ?? "Seguir el juego",
      correctDiscipline: clip.correct_discipline ?? "Sin tarjeta",
      explanation: clip.explanation ?? "",
      season: clip.season ?? getActiveSeasonForSport(sportType),
      sourceVersion: clip.source_version ?? getDefaultSourceVersionForSport(sportType),
      sourceOfficial: clip.source_official ?? "",
      ruleReference: clip.rule_reference ?? "",
      technicalResolution: clip.technical_resolution ?? "",
      disciplinaryResolution: clip.disciplinary_resolution ?? "",
      normativeStatus: clip.normative_status ?? "vigente",
      language: clip.language ?? "es",
      reviewedAt: clip.reviewed_at ? clip.reviewed_at.slice(0, 10) : "",
      analysisAnswers: normalizeAnswerRecord(clip.analysis_answers),
    });
  }

  function resetForm() {
    setEditingClipId(null);
    setForm(createInitialForm());
  }

  async function saveClip() {
    setSaving(true);

    const title = form.title.trim() || generateClipTitle(form);
    const rawPayload: ClipDecisionPayload = {
      title,
      description: form.description || null,
      sport_type: form.sportType,
      video_url: form.videoUrl,
      topic: form.topic,
      sub_type:
        form.sportType === "football_11" ? form.subType || null : undefined,
      subtopic: form.subType || null,
      decision_detail: form.decisionDetail || null,
      difficulty: form.difficulty,
      mode: form.mode,
      correct_foul:
        form.sportType === "football_11" && !isEnglishMode ? form.correctFoul : null,
      correct_restart:
        form.sportType === "football_11" && !isEnglishMode
          ? form.correctRestart
          : null,
      correct_discipline:
        form.sportType === "football_11" && !isEnglishMode
          ? form.correctDiscipline
          : null,
      correct_var:
        form.sportType === "football_11" && form.topic === "VAR"
          ? true
          : null,
      explanation: form.explanation || null,
      season: form.season || null,
      source_version: form.sourceVersion || null,
      source_official: form.sourceOfficial || null,
      governing_body: getGoverningBodyForSport(form.sportType),
      rule_reference: form.ruleReference || null,
      technical_resolution: form.technicalResolution || null,
      disciplinary_resolution: form.disciplinaryResolution || null,
      normative_status: form.normativeStatus || null,
      language: form.language || null,
      reviewed_at: form.reviewedAt || null,
      analysis_answers:
        form.sportType === "futsal"
          ? serializeAnswerRecord(form.analysisAnswers)
          : null,
    };

    const payload = normalizeClipDecision(rawPayload);
    const validation = validateClipDecision(payload);

    if (!validation.valid) {
      const proceed = confirm(
        `Hay una posible inconsistencia tecnica:\n\n${validation.messages
          .map((message) => `- ${message}`)
          .join("\n")}\n\nGuardar de todos modos?`
      );

      if (!proceed) {
        setSaving(false);
        return;
      }
    }

    if (editingClipId) {
      const { data, error } = await updateClipDecision(
        supabase,
        editingClipId,
        payload
      );

      if (error || !data) {
        alert(error?.message ?? "No se pudo confirmar el guardado del clip.");
        setSaving(false);
        return;
      }
    } else {
      const { error } = await insertClipDecision(supabase, payload);

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    }

    resetForm();
    await loadClips();
    alert(editingClipId ? "Clip actualizado correctamente." : "Clip creado correctamente.");
    setSaving(false);
  }

  async function removeClip(id: string) {
    const confirmed = confirm("Eliminar este clip?");
    if (!confirmed) return;

    const { error } = await deleteClipById(supabase, id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadClips();
  }

  if (!isLoaded || loadingRole) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-[#0b131b] p-8 text-zinc-400">
          Validando acceso...
        </div>
      </AppShell>
    );
  }

  if (!user || !isVideoAdmin) return null;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            ADMIN CLIPS
          </p>
          <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Clips globales</h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-400">
                Carga y edita clips de futbol 11 y futsal con trazabilidad normativa,
                topico valido por disciplina y resolucion tecnica completa.
              </p>
            </div>
            <button
              type="button"
              onClick={loadClips}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white transition hover:bg-white/10"
            >
              <RefreshCw size={16} />
              Actualizar
            </button>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
          <section className="rounded-[30px] border border-white/10 bg-[#0b131b] p-5 shadow-2xl sm:p-6">
            {editingClipId ? (
              <div className="mb-5 rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff67]">
                Estas editando un clip existente.
              </div>
            ) : null}

            <div className="grid gap-4">
              <Field label="Disciplina" required>
                <select
                  value={form.sportType}
                  onChange={(event) => applySportType(event.target.value as SportType)}
                  className={inputClass}
                >
                  {sportTypeOptions.map((item) => (
                    <option key={item.value} value={item.value} className="bg-[#0b131b]">
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Modo" required>
                  <select
                    value={form.mode}
                    onChange={(event) => updateForm("mode", event.target.value as TrainingMode)}
                    className={inputClass}
                  >
                    {modeOptionsBySport[form.sportType].map((item) => (
                      <option key={item.value} value={item.value} className="bg-[#0b131b]">
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Organismo rector">
                  <input
                    value={getGoverningBodyForSport(form.sportType)}
                    readOnly
                    className={`${inputClass} opacity-80`}
                  />
                </Field>
              </div>

              <Field label="Titulo">
                <input
                  value={form.title}
                  onChange={(event) => updateForm("title", event.target.value)}
                  className={inputClass}
                  placeholder="Si queda vacio, RefLab genera uno automaticamente"
                />
              </Field>

              <Field label="URL del video" required>
                <input
                  value={form.videoUrl}
                  onChange={(event) => updateForm("videoUrl", event.target.value)}
                  className={inputClass}
                  placeholder="https://..."
                />
              </Field>

              {form.videoUrl ? (
                <video
                  src={form.videoUrl}
                  controls
                  className="aspect-video w-full rounded-2xl border border-white/10 bg-black object-cover"
                />
              ) : null}

              <Field label="Descripcion">
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  className={`${inputClass} min-h-24 resize-y`}
                  placeholder="Contexto breve de la jugada"
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label={isEnglishMode ? "Categoria de comunicacion" : "Topico"} required>
                  <select
                    value={form.topic}
                    onChange={(event) => {
                      const nextTopic = event.target.value;
                      updateForm("topic", nextTopic);
                      updateForm("subType", "");
                      updateForm("analysisAnswers", {});
                    }}
                    className={inputClass}
                  >
                    <option value="" className="bg-[#0b131b]">Seleccionar topico</option>
                    {topicOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b131b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Dificultad">
                  <select
                    value={form.difficulty}
                    onChange={(event) => updateForm("difficulty", event.target.value)}
                    className={inputClass}
                  >
                    {clipDifficultyOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b131b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {!isFutsal && subTypeOptions.length > 0 ? (
                <Field
                  label={
                    form.topic === "Offside"
                      ? "Subtipo de fuera de juego"
                      : form.topic === "Handball"
                        ? "Subtipo de mano"
                        : "Subtipo"
                  }
                >
                  <select
                    value={form.subType}
                    onChange={(event) => updateForm("subType", event.target.value)}
                    className={inputClass}
                  >
                    <option value="" className="bg-[#0b131b]">Sin subtipo</option>
                    {subTypeOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b131b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}

              {isFutsal ? (
                <>
                  <Field label="Subtopico">
                    <input
                      value={form.subType}
                      onChange={(event) => updateForm("subType", event.target.value)}
                      className={inputClass}
                      placeholder="Detalle complementario del caso"
                    />
                  </Field>

                  {futsalSchema ? (
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm leading-6 text-zinc-200">
                        Esquema dinamico: <strong>{futsalSchema.title}</strong>. Las
                        respuestas esperadas que cargues aqui son las que usara el
                        videoanalisis de futsal en produccion.
                      </div>

                      {futsalSchema.fields.map((field, index) => (
                        <AdminDynamicField
                          key={field.key}
                          field={field}
                          index={index}
                          value={form.analysisAnswers[field.key] ?? null}
                          onChange={(value) =>
                            updateForm("analysisAnswers", {
                              ...form.analysisAnswers,
                              [field.key]: value,
                            })
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : isEnglishMode ? (
                <Field label="Expected answer / feedback base">
                  <textarea
                    value={form.explanation}
                    onChange={(event) => updateForm("explanation", event.target.value)}
                    className={`${inputClass} min-h-28 resize-y`}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Respuesta correcta final / criterio asociado">
                    <input
                      value={form.decisionDetail}
                      onChange={(event) => updateForm("decisionDetail", event.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <BooleanSelect
                    label="Existe infraccion"
                    value={form.correctFoul}
                    onChange={(value) => {
                      updateForm("correctFoul", value);
                      updateForm(
                        "correctRestart",
                        value ? "Tiro libre directo" : "Seguir el juego"
                      );
                    }}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Reanudacion correcta">
                      <select
                        value={form.correctRestart}
                        onChange={(event) => updateForm("correctRestart", event.target.value)}
                        className={inputClass}
                      >
                        {restartOptions.map((option) => (
                          <option key={option.value} value={option.value} className="bg-[#0b131b]">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Disciplina correcta">
                      <select
                        value={form.correctDiscipline}
                        onChange={(event) =>
                          updateForm("correctDiscipline", event.target.value)
                        }
                        className={inputClass}
                      >
                        {disciplineOptions.map((option) => (
                          <option key={option.value} value={option.value} className="bg-[#0b131b]">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Fundamento / aval de la decision">
                    <textarea
                      value={form.explanation}
                      onChange={(event) => updateForm("explanation", event.target.value)}
                      className={`${inputClass} min-h-28 resize-y`}
                    />
                  </Field>
                </>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Referencia reglamentaria">
                  <input
                    value={form.ruleReference}
                    onChange={(event) => updateForm("ruleReference", event.target.value)}
                    className={inputClass}
                    placeholder="Regla, articulo o criterio"
                  />
                </Field>
                <Field label="Temporada">
                  <input
                    value={form.season}
                    onChange={(event) => updateForm("season", event.target.value)}
                    className={inputClass}
                    placeholder="2026/27 o 2024-25"
                  />
                </Field>
                <Field label="Version fuente">
                  <input
                    value={form.sourceVersion}
                    onChange={(event) => updateForm("sourceVersion", event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Idioma">
                  <select
                    value={form.language}
                    onChange={(event) => updateForm("language", event.target.value)}
                    className={inputClass}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b131b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Fuente oficial">
                  <input
                    value={form.sourceOfficial}
                    onChange={(event) => updateForm("sourceOfficial", event.target.value)}
                    className={inputClass}
                    placeholder="https://..."
                  />
                </Field>
                <Field label="Estado normativo">
                  <select
                    value={form.normativeStatus}
                    onChange={(event) => updateForm("normativeStatus", event.target.value)}
                    className={inputClass}
                  >
                    {normativeStatusOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0b131b]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Resolucion tecnica">
                <textarea
                  value={form.technicalResolution}
                  onChange={(event) =>
                    updateForm("technicalResolution", event.target.value)
                  }
                  className={`${inputClass} min-h-20 resize-y`}
                />
              </Field>

              <Field label="Resolucion disciplinaria">
                <textarea
                  value={form.disciplinaryResolution}
                  onChange={(event) =>
                    updateForm("disciplinaryResolution", event.target.value)
                  }
                  className={`${inputClass} min-h-20 resize-y`}
                />
              </Field>

              <Field label="Fecha de revision">
                <input
                  type="date"
                  value={form.reviewedAt}
                  onChange={(event) => updateForm("reviewedAt", event.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={saveClip}
                  disabled={saving}
                  className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 text-sm font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-60"
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {editingClipId ? "Guardar cambios" : "Crear clip"}
                </button>

                {editingClipId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="min-h-12 rounded-2xl border border-white/10 px-5 text-sm font-black text-white transition hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
                  Clips cargados
                </p>
                <h2 className="mt-2 text-2xl font-black">Biblioteca audiovisual</h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-black text-zinc-300">
                {clips.length}
              </span>
            </div>

            {loading ? (
              <div className="flex min-h-56 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-zinc-400">
                <Loader2 className="mr-2 animate-spin" size={18} />
                Cargando clips...
              </div>
            ) : clips.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-zinc-400">
                Todavia no hay clips cargados.
              </div>
            ) : (
              <div className="space-y-3">
                {clips.map((clip) => (
                  <article
                    key={clip.id}
                    className="rounded-2xl border border-white/10 bg-[#071019] p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          <Chip label={getSportLabel(clip.sport_type)} />
                          <Chip label={clip.topic || "Sin topico"} />
                          {clip.season ? <Chip label={clip.season} /> : null}
                          {clip.mode ? <Chip label={clip.mode} /> : null}
                        </div>
                        <h3 className="mt-3 break-words text-lg font-black">
                          {clip.title}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-zinc-400">
                          {clip.explanation || clip.description || "Sin explicacion cargada."}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(clip)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white transition hover:border-[#6fc11f]/30"
                          title="Editar clip"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeClip(clip.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-200 transition hover:bg-red-500/15"
                          title="Eliminar clip"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function generateClipTitle(form: AdminFormState) {
  const parts = [
    getSportLabel(form.sportType),
    form.topic,
    form.subType,
    form.decisionDetail,
  ].filter(Boolean);

  return parts.join(" · ") || "Clip arbitral";
}

function normalizeAnswerRecord(
  value: Record<string, string | boolean | null> | null | undefined
) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, currentValue]) => [key, currentValue])
  ) as Record<string, VideoAnswerValue>;
}

function serializeAnswerRecord(record: Record<string, VideoAnswerValue>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== null && value !== "")
  );
}

function coerceOptionValue(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function labelFromOptionValue(value: VideoAnswerValue) {
  if (value === true) return "Si";
  if (value === false) return "No";
  if (typeof value === "string") return value;
  return "Sin dato";
}

function AdminDynamicField({
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
        {field.required ? (
          <span className="rounded-full border border-[#6fc11f]/30 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#6fc11f]">
            Obligatorio
          </span>
        ) : null}
      </div>

      {field.kind === "text" ? (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} mt-3 min-h-24 resize-y`}
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
                    ? "border-[#6fc11f] bg-[#6fc11f]/15 text-white"
                    : "border-white/10 bg-[#0b111b] text-zinc-300 hover:bg-white/[0.04]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}

      {value !== null && field.kind !== "text" ? (
        <p className="mt-3 text-xs text-zinc-500">
          Valor esperado: {labelFromOptionValue(value)}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
        {required ? <span className="text-[#6fc11f]"> *</span> : null}
      </span>
      {children}
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
    <Field label={label}>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
            value
              ? "border-[#6fc11f] bg-[#6fc11f]/15 text-white"
              : "border-white/10 bg-[#0b111b] text-zinc-300"
          }`}
        >
          Si
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
            !value
              ? "border-[#6fc11f] bg-[#6fc11f]/15 text-white"
              : "border-white/10 bg-[#0b111b] text-zinc-300"
          }`}
        >
          No
        </button>
      </div>
    </Field>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">
      {label}
    </span>
  );
}

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-[#6fc11f]/50";
