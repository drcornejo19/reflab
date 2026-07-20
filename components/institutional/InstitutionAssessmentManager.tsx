"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock3,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import {
  formatDateTimeInTimeZone,
  isoToLocalDateTimeInput,
  localDateTimeInTimeZoneToIso,
} from "@/lib/dateTime";
import {
  institutionAssessmentModalities,
  institutionAssessmentStatuses,
  type InstitutionAssessmentModality,
  type InstitutionAssessmentRecord,
  type InstitutionAssessmentStatus,
  type InstitutionAssessmentWorkspace,
  type InstitutionAssignmentTarget,
  type InstitutionContentRecord,
} from "@/lib/institutional/types";
import type { SportType } from "@/lib/sports";

type AssessmentForm = {
  sportType: SportType;
  name: string;
  description: string;
  modality: InstitutionAssessmentModality;
  status: InstitutionAssessmentStatus;
  timezone: string;
  opensAt: string;
  closesAt: string;
  durationMinutes: string;
  attemptsAllowed: string;
  immediateFeedback: boolean;
  freeNavigation: boolean;
  randomizeQuestions: boolean;
  randomizeVideos: boolean;
  minimumScore: string;
  penaltyValue: string;
  allowReview: boolean;
  contentIds: string[];
  groupIds: string[];
  userIds: string[];
};

const modalityLabels: Record<InstitutionAssessmentModality, string> = {
  video_analysis: "Videoanalisis",
  rules_exam: "Examen de reglas",
  trivia: "Trivia",
  referee_exam: "Examen arbitral",
  communication: "Comunicacion",
  var: "VAR",
  futsal: "Futsal",
  psychology_orientation: "Orientacion psicologica",
  physical: "Preparacion fisica",
  custom: "Personalizada",
};

const assessmentStatusLabels: Record<InstitutionAssessmentStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
  archived: "Archivada",
};

function createInitialForm(sportType: SportType): AssessmentForm {
  return {
    sportType,
    name: "",
    description: "",
    modality: sportType === "futsal" ? "futsal" : "rules_exam",
    status: "draft",
    timezone: "America/Argentina/Buenos_Aires",
    opensAt: "",
    closesAt: "",
    durationMinutes: "30",
    attemptsAllowed: "1",
    immediateFeedback: false,
    freeNavigation: false,
    randomizeQuestions: false,
    randomizeVideos: false,
    minimumScore: "70",
    penaltyValue: "",
    allowReview: true,
    contentIds: [],
    groupIds: [],
    userIds: [],
  };
}

export function InstitutionAssessmentManager() {
  const { currentDiscipline } = useDiscipline();
  const { activeContext, loading: institutionLoading } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] =
    useState<InstitutionAssessmentWorkspace | null>(null);
  const [form, setForm] = useState<AssessmentForm>(() =>
    createInitialForm(currentDiscipline)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      const response = await fetch("/api/institution/assessments", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        workspace?: InstitutionAssessmentWorkspace;
        error?: string;
      };
      if (!response.ok || !data.workspace) {
        throw new Error(data.error || "No se pudieron cargar las evaluaciones.");
      }
      setWorkspace(data.workspace);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudieron cargar las evaluaciones."
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
      const payload = {
        ...form,
        opensAt: form.opensAt
          ? localDateTimeInTimeZoneToIso(form.opensAt, form.timezone)
          : "",
        closesAt: form.closesAt
          ? localDateTimeInTimeZoneToIso(form.closesAt, form.timezone)
          : "",
        durationMinutes: numberOrNull(form.durationMinutes),
        attemptsAllowed: Number(form.attemptsAllowed),
        minimumScore: numberOrNull(form.minimumScore),
        penaltyValue: numberOrNull(form.penaltyValue),
        settings: {},
      };
      const response = await fetch(
        editingId
          ? `/api/institution/assessments/${editingId}`
          : "/api/institution/assessments",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await response.json()) as {
        assessment?: InstitutionAssessmentRecord;
        error?: string;
      };
      if (!response.ok || !data.assessment) {
        throw new Error(data.error || "No se pudo guardar la evaluacion.");
      }
      setMessage(
        editingId
          ? "Evaluacion actualizada correctamente."
          : "Evaluacion programada correctamente."
      );
      setEditingId(null);
      setForm(createInitialForm(currentDiscipline));
      await loadWorkspace();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la evaluacion."
      );
    } finally {
      setSaving(false);
    }
  }

  function edit(assessment: InstitutionAssessmentRecord) {
    setEditingId(assessment.id);
    setForm({
      sportType: assessment.sportType,
      name: assessment.name,
      description: assessment.description ?? "",
      modality: assessment.modality,
      status: assessment.status,
      timezone: assessment.timezone,
      opensAt: isoToLocalDateTimeInput(
        assessment.opensAt,
        assessment.timezone
      ),
      closesAt: isoToLocalDateTimeInput(
        assessment.closesAt,
        assessment.timezone
      ),
      durationMinutes: assessment.durationMinutes
        ? String(assessment.durationMinutes)
        : "",
      attemptsAllowed: String(assessment.attemptsAllowed),
      immediateFeedback: assessment.immediateFeedback,
      freeNavigation: assessment.freeNavigation,
      randomizeQuestions: assessment.randomizeQuestions,
      randomizeVideos: assessment.randomizeVideos,
      minimumScore:
        assessment.minimumScore == null
          ? ""
          : String(assessment.minimumScore),
      penaltyValue:
        assessment.penaltyValue == null
          ? ""
          : String(assessment.penaltyValue),
      allowReview: assessment.allowReview,
      contentIds: assessment.items
        .map((item) => item.sourceId)
        .filter((id): id is string => Boolean(id)),
      groupIds: assessment.groupIds,
      userIds: assessment.userIds,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const canManage = workspace?.capabilities.canManage ?? false;
  const contentOptions =
    workspace?.contents.filter(
      (content) =>
        content.sportType === form.sportType &&
        content.status === "published"
    ) ?? [];
  const now = Date.now();
  const upcomingCount =
    workspace?.assessments.filter(
      (assessment) =>
        assessment.opensAt && new Date(assessment.opensAt).getTime() > now
    ).length ?? 0;
  const openCount =
    workspace?.assessments.filter((assessment) => {
      const opens = assessment.opensAt
        ? new Date(assessment.opensAt).getTime()
        : -Infinity;
      const closes = assessment.closesAt
        ? new Date(assessment.closesAt).getTime()
        : Infinity;
      return (
        ["scheduled", "open"].includes(assessment.status) &&
        opens <= now &&
        closes >= now
      );
    }).length ?? 0;

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
            Fase 6 · Evaluaciones programadas
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">
                Agenda de evaluaciones
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Programa actividades con horario institucional, contenidos
                publicados, intentos limitados y asignaciones trazables.
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
          <EmptyState text="No hay una institucion activa para gestionar evaluaciones." />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon={ClipboardCheck}
                label="Evaluaciones"
                value={String(workspace.assessments.length)}
                accent={theme.accent}
              />
              <Metric
                icon={Clock3}
                label="Abiertas"
                value={String(openCount)}
                accent={theme.accent}
              />
              <Metric
                icon={CalendarClock}
                label="Proximas"
                value={String(upcomingCount)}
                accent={theme.accent}
              />
              <Metric
                icon={ShieldCheck}
                label="Contenidos listos"
                value={String(workspace.contents.length)}
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
                      {editingId ? "Editar programacion" : "Nueva instancia"}
                    </p>
                    <h2 className="mt-2 text-2xl font-black">
                      Configurar evaluacion
                    </h2>
                  </div>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setForm(createInitialForm(currentDiscipline));
                      }}
                      className="min-h-10 rounded-xl border border-white/10 px-4 text-xs font-black"
                    >
                      Cancelar edicion
                    </button>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <Field label="Nombre" required>
                    <input
                      required
                      minLength={3}
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Disciplina" required>
                    <select
                      value={form.sportType}
                      onChange={(event) => {
                        const sportType = event.target.value as SportType;
                        setForm({
                          ...form,
                          sportType,
                          modality:
                            sportType === "futsal" ? "futsal" : "rules_exam",
                          contentIds: [],
                        });
                      }}
                      className={inputClass}
                    >
                      {workspace.institution.enabledSports.map((sport) => (
                        <option key={sport} value={sport}>
                          {sport === "futsal" ? "Futsal" : "Futbol 11"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Modalidad" required>
                    <select
                      value={form.modality}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          modality: event.target
                            .value as InstitutionAssessmentModality,
                        })
                      }
                      className={inputClass}
                    >
                      {institutionAssessmentModalities
                        .filter(
                          (modality) =>
                            !(form.sportType === "futsal" && modality === "var") &&
                            !(
                              form.sportType === "football_11" &&
                              modality === "futsal"
                            )
                        )
                        .map((modality) => (
                          <option key={modality} value={modality}>
                            {modalityLabels[modality]}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Estado" required>
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          status: event.target
                            .value as InstitutionAssessmentStatus,
                        })
                      }
                      className={inputClass}
                    >
                      {institutionAssessmentStatuses.map((status) => (
                        <option key={status} value={status}>
                          {assessmentStatusLabels[status]}
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
                      className={`${inputClass} min-h-24 py-3`}
                    />
                  </Field>
                  <Field label="Abre" required>
                    <input
                      type="datetime-local"
                      required={form.status === "scheduled" || form.status === "open"}
                      value={form.opensAt}
                      onChange={(event) =>
                        setForm({ ...form, opensAt: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Cierra" required>
                    <input
                      type="datetime-local"
                      required={form.status === "scheduled" || form.status === "open"}
                      value={form.closesAt}
                      onChange={(event) =>
                        setForm({ ...form, closesAt: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Zona horaria">
                    <input
                      value={form.timezone}
                      onChange={(event) =>
                        setForm({ ...form, timezone: event.target.value })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Duracion, minutos">
                    <input
                      type="number"
                      min="1"
                      value={form.durationMinutes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          durationMinutes: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Intentos permitidos">
                    <input
                      type="number"
                      min="1"
                      required
                      value={form.attemptsAllowed}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          attemptsAllowed: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Puntaje minimo">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={form.minimumScore}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          minimumScore: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Penalizacion por error">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.penaltyValue}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          penaltyValue: event.target.value,
                        })
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>

                <section className="mt-5 grid gap-4 lg:grid-cols-3">
                  <Toggle
                    label="Feedback inmediato"
                    checked={form.immediateFeedback}
                    onChange={(immediateFeedback) =>
                      setForm({ ...form, immediateFeedback })
                    }
                  />
                  <Toggle
                    label="Navegacion libre"
                    checked={form.freeNavigation}
                    onChange={(freeNavigation) =>
                      setForm({ ...form, freeNavigation })
                    }
                  />
                  <Toggle
                    label="Permitir revision"
                    checked={form.allowReview}
                    onChange={(allowReview) =>
                      setForm({ ...form, allowReview })
                    }
                  />
                  <Toggle
                    label="Mezclar preguntas"
                    checked={form.randomizeQuestions}
                    onChange={(randomizeQuestions) =>
                      setForm({ ...form, randomizeQuestions })
                    }
                  />
                  <Toggle
                    label="Mezclar videos"
                    checked={form.randomizeVideos}
                    onChange={(randomizeVideos) =>
                      setForm({ ...form, randomizeVideos })
                    }
                  />
                </section>

                <section className="mt-5 grid gap-4 xl:grid-cols-3">
                  <ContentSelector
                    contents={contentOptions}
                    selected={form.contentIds}
                    onChange={(contentIds) =>
                      setForm({ ...form, contentIds })
                    }
                    accent={theme.accent}
                  />
                  <TargetSelector
                    label="Asignar a grupos"
                    targets={workspace.groups.filter(
                      (group) =>
                        !group.sportType ||
                        group.sportType === form.sportType
                    )}
                    selected={form.groupIds}
                    onChange={(groupIds) => setForm({ ...form, groupIds })}
                    accent={theme.accent}
                  />
                  <TargetSelector
                    label="Asignar a personas"
                    targets={workspace.members.filter(
                      (member) =>
                        !member.sportType ||
                        member.sportType === form.sportType
                    )}
                    selected={form.userIds}
                    onChange={(userIds) => setForm({ ...form, userIds })}
                    accent={theme.accent}
                  />
                </section>

                {!contentOptions.length ? (
                  <Alert tone="info">
                    Primero publica al menos un contenido de{" "}
                    {form.sportType === "futsal" ? "Futsal" : "Futbol 11"} en
                    la biblioteca institucional.
                  </Alert>
                ) : null}

                <button
                  disabled={saving || !contentOptions.length}
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:opacity-50"
                  style={{
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }}
                >
                  {saving ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <CalendarClock size={18} />
                  )}
                  {saving
                    ? "Guardando..."
                    : editingId
                      ? "Guardar programacion"
                      : "Crear evaluacion"}
                </button>
              </form>
            ) : (
              <Alert tone="info">
                Tu rol puede consultar la agenda, pero no programar evaluaciones.
              </Alert>
            )}

            <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-6">
              <p
                className="text-[10px] font-black uppercase tracking-[0.26em]"
                style={{ color: theme.accent }}
              >
                Cronograma institucional
              </p>
              <h2 className="mt-2 text-2xl font-black">Instancias programadas</h2>
              {workspace.assessments.length ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {workspace.assessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      canEdit={canManage}
                      accent={theme.accent}
                      onEdit={() => edit(assessment)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="Todavia no hay evaluaciones programadas." />
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function AssessmentCard({
  assessment,
  canEdit,
  accent,
  onEdit,
}: {
  assessment: InstitutionAssessmentRecord;
  canEdit: boolean;
  accent: string;
  onEdit: () => void;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em]"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {modalityLabels[assessment.modality]}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {assessmentStatusLabels[assessment.status]}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-black">{assessment.name}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">
        {assessment.description || "Sin descripcion."}
      </p>
      <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
        <span>
          Abre:{" "}
          {formatDateTimeInTimeZone(
            assessment.opensAt,
            assessment.timezone
          )}
        </span>
        <span>
          Cierra:{" "}
          {formatDateTimeInTimeZone(
            assessment.closesAt,
            assessment.timezone
          )}
        </span>
        <span>
          {assessment.items.length} actividades ·{" "}
          {assessment.attemptsAllowed} intento(s)
        </span>
        <span>
          {assessment.groupIds.length} grupo(s) ·{" "}
          {assessment.userIds.length} persona(s)
        </span>
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

function ContentSelector({
  contents,
  selected,
  onChange,
  accent,
}: {
  contents: InstitutionContentRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
  accent: string;
}) {
  return (
    <fieldset className="rounded-[22px] border border-white/10 p-3">
      <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        Actividades publicadas
      </legend>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {contents.length ? (
          contents.map((content) => (
            <ChoiceRow
              key={content.id}
              id={content.id}
              label={content.title}
              detail={content.contentType}
              checked={selected.includes(content.id)}
              selected={selected}
              onChange={onChange}
              accent={accent}
            />
          ))
        ) : (
          <p className="p-3 text-xs text-zinc-500">
            No hay contenidos publicados para esta disciplina.
          </p>
        )}
      </div>
    </fieldset>
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
    <fieldset className="rounded-[22px] border border-white/10 p-3">
      <legend className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </legend>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {targets.length ? (
          targets.map((target) => (
            <ChoiceRow
              key={target.id}
              id={target.id}
              label={target.name}
              detail={target.detail}
              checked={selected.includes(target.id)}
              selected={selected}
              onChange={onChange}
              accent={accent}
            />
          ))
        ) : (
          <p className="p-3 text-xs text-zinc-500">
            No hay opciones disponibles.
          </p>
        )}
      </div>
    </fieldset>
  );
}

function ChoiceRow({
  id,
  label,
  detail,
  checked,
  selected,
  onChange,
  accent,
}: {
  id: string;
  label: string;
  detail: string | null;
  checked: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  accent: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={() =>
          onChange(
            checked
              ? selected.filter((selectedId) => selectedId !== id)
              : [...selected, id]
          )
        }
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black">{label}</span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[10px] text-zinc-500">
            {detail}
          </span>
        ) : null}
      </span>
      {checked ? <Check size={15} style={{ color: accent }} /> : null}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
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
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
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
    <div
      className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${classes[tone]}`}
    >
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

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const inputClass =
  "min-h-12 w-full rounded-2xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-white/30";
