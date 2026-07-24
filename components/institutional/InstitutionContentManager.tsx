"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  BookOpenCheck,
  Check,
  FileUp,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useSupabase } from "@/components/SupabaseProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import {
  isoToLocalDateTimeInput,
  localDateTimeInTimeZoneToIso,
} from "@/lib/dateTime";
import {
  institutionContentStatuses,
  institutionContentTypes,
  institutionContentVisibilities,
  type InstitutionAssignmentTarget,
  type InstitutionContentRecord,
  type InstitutionContentStatus,
  type InstitutionContentType,
  type InstitutionContentVisibility,
  type InstitutionContentWorkspace,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type ContentForm = {
  sportType: SportType;
  contentType: InstitutionContentType;
  title: string;
  description: string;
  topic: string;
  subtopic: string;
  ruleReference: string;
  difficulty: string;
  language: string;
  validFrom: string;
  validUntil: string;
  sourceName: string;
  sourceUrl: string;
  visibility: InstitutionContentVisibility;
  status: InstitutionContentStatus;
  version: string;
  expiresAt: string;
  availableFrom: string;
  dueAt: string;
  required: boolean;
  groupIds: string[];
  userIds: string[];
  prompt: string;
  options: string;
  correctAnswer: string;
  explanation: string;
};

const contentTypeLabels: Record<InstitutionContentType, string> = {
  video: "Video",
  question: "Pregunta",
  trivia: "Trivia",
  document: "Documento",
  circular: "Circular",
  class: "Clase",
  exercise: "Ejercicio",
  presentation: "Presentacion",
  pdf: "PDF",
  link: "Enlace",
  audio: "Audio",
  case_study: "Caso de estudio",
};

const contentStatusLabels: Record<InstitutionContentStatus, string> = {
  draft: "Borrador",
  in_review: "En revision",
  published: "Publicado",
  archived: "Archivado",
  expired: "Vencido",
};

const visibilityLabels: Record<InstitutionContentVisibility, string> = {
  private: "Privado",
  institution: "Toda la institucion",
  assigned_groups: "Grupos o personas",
  public: "Publico",
};

function createInitialForm(sportType: SportType): ContentForm {
  return {
    sportType,
    contentType: "document",
    title: "",
    description: "",
    topic: "",
    subtopic: "",
    ruleReference: "",
    difficulty: "",
    language: "es",
    validFrom: "",
    validUntil: "",
    sourceName: "",
    sourceUrl: "",
    visibility: "institution",
    status: "draft",
    version: "1",
    expiresAt: "",
    availableFrom: "",
    dueAt: "",
    required: true,
    groupIds: [],
    userIds: [],
    prompt: "",
    options: "",
    correctAnswer: "",
    explanation: "",
  };
}

export function InstitutionContentManager() {
  const supabase = useSupabase();
  const { currentDiscipline } = useDiscipline();
  const { activeContext, loading: institutionLoading } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] =
    useState<InstitutionContentWorkspace | null>(null);
  const [form, setForm] = useState<ContentForm>(() =>
    createInitialForm(currentDiscipline)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContext) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    void loadWorkspace();
    // The active institution id is the server-side tenant source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id]);

  useEffect(() => {
    if (editingId) return;
    setForm(createInitialForm(currentDiscipline));
  }, [currentDiscipline, editingId]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/institution/contents", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        workspace?: InstitutionContentWorkspace;
        error?: string;
      };
      if (!response.ok || !data.workspace) {
        throw new Error(data.error || "No se pudieron cargar los contenidos.");
      }
      setWorkspace(data.workspace);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar los contenidos."
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace?.capabilities.canManage) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let storagePath =
        editingId
          ? workspace.contents.find((content) => content.id === editingId)
              ?.storagePath ?? null
          : null;
      if (file) storagePath = await uploadFile(file);
      const payload = {
        ...form,
        storagePath,
        version: Number(form.version),
        expiresAt: form.expiresAt
          ? localDateTimeInTimeZoneToIso(
              form.expiresAt,
              workspace.institution.timezone
            )
          : "",
        availableFrom: form.availableFrom
          ? localDateTimeInTimeZoneToIso(
              form.availableFrom,
              workspace.institution.timezone
            )
          : "",
        dueAt: form.dueAt
          ? localDateTimeInTimeZoneToIso(
              form.dueAt,
              workspace.institution.timezone
            )
          : "",
        metadata: {
          prompt: form.prompt || undefined,
          options: form.options
            .split("\n")
            .map((option) => option.trim())
            .filter(Boolean),
          correctAnswer: form.correctAnswer || undefined,
          explanation: form.explanation || undefined,
        },
      };
      const response = await fetch(
        editingId
          ? `/api/institution/contents/${editingId}`
          : "/api/institution/contents",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await response.json()) as {
        content?: InstitutionContentRecord;
        error?: string;
      };
      if (!response.ok || !data.content) {
        throw new Error(data.error || "No se pudo guardar el contenido.");
      }
      setMessage(
        editingId
          ? "Contenido actualizado correctamente."
          : "Contenido creado correctamente."
      );
      setEditingId(null);
      setFile(null);
      setForm(createInitialForm(currentDiscipline));
      await loadWorkspace();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el contenido."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(selectedFile: File) {
    const authorization = await fetch("/api/institution/contents/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: selectedFile.name,
        mimeType: selectedFile.type,
        size: selectedFile.size,
      }),
    });
    const upload = (await authorization.json()) as {
      bucket?: string;
      path?: string;
      token?: string;
      error?: string;
    };
    if (
      !authorization.ok ||
      !upload.bucket ||
      !upload.path ||
      !upload.token
    ) {
      throw new Error(upload.error || "No se pudo preparar el archivo.");
    }
    const { error: uploadError } = await supabase.storage
      .from(upload.bucket)
      .uploadToSignedUrl(upload.path, upload.token, selectedFile, {
        contentType: selectedFile.type,
      });
    if (uploadError) throw new Error(uploadError.message);
    return upload.path;
  }

  function edit(content: InstitutionContentRecord) {
    setEditingId(content.id);
    setFile(null);
    setForm({
      sportType: content.sportType,
      contentType: content.contentType,
      title: content.title,
      description: content.description ?? "",
      topic: content.topic ?? "",
      subtopic: content.subtopic ?? "",
      ruleReference: content.ruleReference ?? "",
      difficulty: content.difficulty ?? "",
      language: content.language,
      validFrom: content.validFrom ?? "",
      validUntil: content.validUntil ?? "",
      sourceName: content.sourceName ?? "",
      sourceUrl: content.sourceUrl ?? "",
      visibility: content.visibility,
      status: content.status,
      version: String(content.version),
      expiresAt: isoToLocalDateTimeInput(
        content.expiresAt,
        workspace?.institution.timezone ?? "America/Argentina/Buenos_Aires"
      ),
      availableFrom: isoToLocalDateTimeInput(
        content.availableFrom,
        workspace?.institution.timezone ?? "America/Argentina/Buenos_Aires"
      ),
      dueAt: isoToLocalDateTimeInput(
        content.dueAt,
        workspace?.institution.timezone ?? "America/Argentina/Buenos_Aires"
      ),
      required: content.required,
      groupIds: content.groupIds,
      userIds: content.userIds,
      prompt: String(content.metadata.prompt ?? ""),
      options: Array.isArray(content.metadata.options)
        ? content.metadata.options.join("\n")
        : "",
      correctAnswer: String(content.metadata.correctAnswer ?? ""),
      explanation: String(content.metadata.explanation ?? ""),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const visibleContents =
    workspace?.contents.filter((content) => {
      const normalized = query.trim().toLocaleLowerCase("es");
      return (
        !normalized ||
        `${content.title} ${content.topic ?? ""} ${content.contentType}`
          .toLocaleLowerCase("es")
          .includes(normalized)
      );
    }) ?? [];
  const canManage = workspace?.capabilities.canManage ?? false;

  return (
    <AppShell>
      <div className="space-y-6">
        <header
          className="rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 40%), #0b151e`,
          }}
        >
          <p
            className="text-[10px] font-black uppercase tracking-[0.32em]"
            style={{ color: theme.accent }}
          >
            Fase 5 · Contenidos
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Biblioteca institucional
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Material propio, privado y separado del contenido global de
                RefLab. Publica por disciplina y asigna solo a las personas
                correspondientes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black"
            >
              <RefreshCw size={17} />
              Actualizar
            </button>
          </div>
        </header>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {message ? <Alert tone="success">{message}</Alert> : null}

        {institutionLoading || loading ? (
          <LoadingState />
        ) : !workspace ? (
          <EmptyState text="No hay una institucion activa para gestionar contenidos." />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Contenidos"
                value={String(workspace.contents.length)}
                icon={BookOpenCheck}
                accent={theme.accent}
              />
              <Metric
                label="Publicados"
                value={String(
                  workspace.contents.filter(
                    (content) => content.status === "published"
                  ).length
                )}
                icon={ShieldCheck}
                accent={theme.accent}
              />
              <Metric
                label="En revision"
                value={String(
                  workspace.contents.filter(
                    (content) => content.status === "in_review"
                  ).length
                )}
                icon={RefreshCw}
                accent={theme.accent}
              />
              <Metric
                label="Archivados"
                value={String(
                  workspace.contents.filter(
                    (content) => content.status === "archived"
                  ).length
                )}
                icon={Archive}
                accent={theme.accent}
              />
            </section>

            {canManage ? (
              <form
                onSubmit={submit}
                className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p
                      className="text-[10px] font-black uppercase tracking-[0.26em]"
                      style={{ color: theme.accent }}
                    >
                      {editingId ? "Edicion editorial" : "Nuevo contenido"}
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      {editingId
                        ? "Actualizar contenido"
                        : "Cargar material institucional"}
                    </h2>
                  </div>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setFile(null);
                        setForm(createInitialForm(currentDiscipline));
                      }}
                      className="min-h-10 rounded-xl border border-white/10 px-4 text-xs font-black"
                    >
                      Cancelar edicion
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <Field label="Titulo" required>
                    <input
                      required
                      minLength={3}
                      value={form.title}
                      onChange={(event) =>
                        setForm({ ...form, title: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Tipo" required>
                    <select
                      value={form.contentType}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          contentType: event.target
                            .value as InstitutionContentType,
                        })
                      }
                      className={inputClass}
                    >
                      {institutionContentTypes.map((type) => (
                        <option key={type} value={type}>
                          {contentTypeLabels[type]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Disciplina" required>
                    <select
                      value={form.sportType}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          sportType: event.target.value as SportType,
                        })
                      }
                      className={inputClass}
                    >
                      {workspace.institution.enabledSports.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport === "futsal" ? "Futsal" : "Futbol 11"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Estado editorial" required>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          status: event.target
                            .value as InstitutionContentStatus,
                        })
                      }
                      className={inputClass}
                    >
                      {institutionContentStatuses
                        .filter(
                          (status) =>
                            status !== "published" ||
                            workspace.capabilities.canPublish
                        )
                        .map((status) => (
                          <option key={status} value={status}>
                            {contentStatusLabels[status]}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Descripcion" className="lg:col-span-2">
                    <textarea
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      className={`${inputClass} min-h-24 resize-y py-3`}
                    />
                  </Field>
                  <Field label="Topico">
                    <input
                      value={form.topic}
                      onChange={(event) =>
                        setForm({ ...form, topic: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Subtopico">
                    <input
                      value={form.subtopic}
                      onChange={(event) =>
                        setForm({ ...form, subtopic: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Regla / referencia">
                    <input
                      value={form.ruleReference}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          ruleReference: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Dificultad">
                    <select
                      value={form.difficulty}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          difficulty: event.target.value,
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">Sin definir</option>
                      <option value="basic">Basica</option>
                      <option value="intermediate">Intermedia</option>
                      <option value="advanced">Avanzada</option>
                    </select>
                  </Field>
                  <Field label="Archivo privado">
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime,video/webm,application/pdf,audio/mpeg,audio/wav,image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setFile(event.target.files?.[0] ?? null)
                      }
                      className={`${inputClass} py-2 file:mr-3 file:rounded-xl file:border-0 file:px-3 file:py-2 file:text-xs file:font-black`}
                    />
                  </Field>
                  <Field label="URL externa">
                    <input
                      type="url"
                      value={form.sourceUrl}
                      onChange={(event) =>
                        setForm({ ...form, sourceUrl: event.target.value })
                      }
                      className={inputClass}
                      placeholder="https://..."
                    />
                  </Field>
                  <Field label="Fuente">
                    <input
                      value={form.sourceName}
                      onChange={(event) =>
                        setForm({ ...form, sourceName: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Idioma">
                    <select
                      value={form.language}
                      onChange={(event) =>
                        setForm({ ...form, language: event.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="es">Espanol</option>
                      <option value="en">English</option>
                      <option value="pt">Portugues</option>
                    </select>
                  </Field>
                  <Field label="Vigente desde">
                    <input
                      type="date"
                      value={form.validFrom}
                      onChange={(event) =>
                        setForm({ ...form, validFrom: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Vigente hasta">
                    <input
                      type="date"
                      value={form.validUntil}
                      onChange={(event) =>
                        setForm({ ...form, validUntil: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Version">
                    <input
                      type="number"
                      min="1"
                      value={form.version}
                      onChange={(event) =>
                        setForm({ ...form, version: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Expira">
                    <input
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(event) =>
                        setForm({ ...form, expiresAt: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>

                {form.contentType === "question" ||
                form.contentType === "trivia" ? (
                  <section
                    className="mt-5 rounded-[24px] border p-4"
                    style={{
                      borderColor: theme.border,
                      backgroundColor: theme.accentSoft,
                    }}
                  >
                    <p className="text-sm font-black">
                      Resolucion de la pregunta
                    </p>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <Field label="Enunciado" className="lg:col-span-2">
                        <textarea
                          value={form.prompt}
                          onChange={(event) =>
                            setForm({ ...form, prompt: event.target.value })
                          }
                          className={`${inputClass} min-h-20 py-3`}
                        />
                      </Field>
                      <Field label="Opciones, una por linea">
                        <textarea
                          value={form.options}
                          onChange={(event) =>
                            setForm({ ...form, options: event.target.value })
                          }
                          className={`${inputClass} min-h-28 py-3`}
                        />
                      </Field>
                      <Field label="Respuesta correcta" required>
                        <input
                          required
                          value={form.correctAnswer}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              correctAnswer: event.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Explicacion" className="lg:col-span-2">
                        <textarea
                          value={form.explanation}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              explanation: event.target.value,
                            })
                          }
                          className={`${inputClass} min-h-20 py-3`}
                        />
                      </Field>
                    </div>
                  </section>
                ) : null}

                <section className="mt-5 rounded-[24px] border border-white/10 bg-black/20 p-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Field label="Visibilidad">
                      <select
                        value={form.visibility}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            visibility: event.target
                              .value as InstitutionContentVisibility,
                          })
                        }
                        className={inputClass}
                      >
                        {institutionContentVisibilities.map((visibility) => (
                          <option key={visibility} value={visibility}>
                            {visibilityLabels[visibility]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Disponible desde">
                      <input
                        type="datetime-local"
                        value={form.availableFrom}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            availableFrom: event.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Fecha limite">
                      <input
                        type="datetime-local"
                        value={form.dueAt}
                        onChange={(event) =>
                          setForm({ ...form, dueAt: event.target.value })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  {form.visibility === "assigned_groups" ? (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <TargetSelector
                        label="Grupos"
                        targets={workspace.groups.filter(
                          (group) =>
                            !group.sportType ||
                            group.sportType === form.sportType
                        )}
                        selected={form.groupIds}
                        onChange={(groupIds) =>
                          setForm({ ...form, groupIds })
                        }
                        accent={theme.accent}
                      />
                      <TargetSelector
                        label="Personas"
                        targets={workspace.members.filter(
                          (member) =>
                            !member.sportType ||
                            member.sportType === form.sportType
                        )}
                        selected={form.userIds}
                        onChange={(userIds) =>
                          setForm({ ...form, userIds })
                        }
                        accent={theme.accent}
                      />
                    </div>
                  ) : null}
                  <label className="mt-4 flex items-center gap-3 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={form.required}
                      onChange={(event) =>
                        setForm({ ...form, required: event.target.checked })
                      }
                    />
                    Actividad obligatoria cuando se asigna
                  </label>
                </section>

                <button
                  disabled={saving}
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:opacity-50"
                  style={{
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <FileUp size={18} />
                  )}
                  {saving
                    ? "Guardando..."
                    : editingId
                      ? "Guardar cambios"
                      : "Crear contenido"}
                </button>
              </form>
            ) : (
              <Alert tone="info">
                Tu rol puede consultar contenidos, pero no administrarlos.
              </Alert>
            )}

            <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.26em]"
                    style={{ color: theme.accent }}
                  >
                    Inventario editorial
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    {visibleContents.length} contenidos
                  </h2>
                </div>
                <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4">
                  <Search size={16} className="text-zinc-500" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar contenido"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </label>
              </div>
              {visibleContents.length ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {visibleContents.map((content) => (
                    <ContentCard
                      key={content.id}
                      content={content}
                      accent={theme.accent}
                      canEdit={canManage}
                      onEdit={() => edit(content)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="Todavia no hay contenidos para mostrar." />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ContentCard({
  content,
  accent,
  canEdit,
  onEdit,
}: {
  content: InstitutionContentRecord;
  accent: string;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em]"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {contentTypeLabels[content.contentType]}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {contentStatusLabels[content.status]}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-black">{content.title}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">
        {content.description || "Sin descripcion."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold text-zinc-500">
        <span>{content.sportType === "futsal" ? "Futsal" : "Futbol 11"}</span>
        <span>·</span>
        <span>{visibilityLabels[content.visibility]}</span>
        <span>·</span>
        <span>v{content.version}</span>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-xs font-black"
        >
          <Pencil size={14} />
          Editar
        </button>
      ) : null}
    </article>
  );
}

function TargetSelector({
  label,
  targets,
  selected,
  onChange,
  accent,
}: {
  label: string;
  targets: InstitutionAssignmentTarget[];
  selected: string[];
  onChange: (ids: string[]) => void;
  accent: string;
}) {
  return (
    <fieldset className="rounded-2xl border border-white/10 p-3">
      <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </legend>
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {targets.length ? (
          targets.map((target) => {
            const checked = selected.includes(target.id);
            return (
              <label
                key={target.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onChange(
                      checked
                        ? selected.filter((id) => id !== target.id)
                        : [...selected, target.id]
                    )
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">
                    {target.name}
                  </span>
                  {target.detail ? (
                    <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
                      {target.detail}
                    </span>
                  ) : null}
                </span>
                {checked ? <Check size={15} style={{ color: accent }} /> : null}
              </label>
            );
          })
        ) : (
          <p className="p-3 text-xs text-zinc-500">No hay opciones disponibles.</p>
        )}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: typeof BookOpenCheck;
  accent: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-[#0a141d] p-5">
      <Icon size={20} style={{ color: accent }} />
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </article>
  );
}

function Alert({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
}) {
  const classes = {
    error: "border-red-400/20 bg-red-400/10 text-red-200",
    success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    info: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  };
  return (
    <div className={`rounded-2xl border p-4 text-sm font-bold ${classes[tone]}`}>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-52 place-items-center rounded-[30px] border border-white/10 bg-[#0a141d]">
      <Loader2 className="animate-spin text-zinc-500" size={28} />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-[22px] border border-dashed border-white/10 p-7 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

const inputClass =
  "min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-white/30";
