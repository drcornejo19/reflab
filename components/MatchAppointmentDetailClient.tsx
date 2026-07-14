"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Gauge,
  MessageSquareQuote,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import type {
  MatchAppointmentDetail,
  MatchPreparationPayload,
  PostMatchReviewPayload,
} from "@/lib/matches/api";
import {
  appointmentStatusLabels,
  preparationStageDefinitions,
} from "@/lib/matches/config";
import { useDiscipline } from "@/components/DisciplineProvider";
import { getDisciplineDefinition } from "@/lib/discipline";

type StageKey = keyof typeof preparationStageDefinitions;

type PreparationFormState = {
  technicalFocus: string;
  physicalFocus: string;
  communicationFocus: string;
  psychologicalFocus: string;
  checklistText: string;
  answers: Record<string, string>;
  notes: string;
};

type ReviewFormState = {
  resultSummary: string;
  minutesPlayed: string;
  incidentsText: string;
  keyDecisionsText: string;
  perceivedLoad: string;
  fatigueScore: string;
  soreness: string;
  emotionalState: string;
  strengthsText: string;
  perceivedErrorsText: string;
  situationsToReviewText: string;
  notes: string;
  closureText: string;
};

const defaultStagePrompts: Record<
  StageKey,
  Array<{ key: string; label: string; placeholder: string }>
> = {
  "72_48_hours": [
    {
      key: "recent_load",
      label: "Carga reciente",
      placeholder: "Ultimos entrenamientos, partido previo o sensacion de carga",
    },
    {
      key: "sleep_status",
      label: "Sueno y descanso",
      placeholder: "Horas de sueno, recuperacion y descanso acumulado",
    },
    {
      key: "emotional_state",
      label: "Estado emocional",
      placeholder: "Confianza, energia mental y foco actual",
    },
    {
      key: "context_review",
      label: "Revision del contexto",
      placeholder: "Que del encuentro merece atencion previa",
    },
  ],
  "24_hours": [
    {
      key: "logistics",
      label: "Checklist logistico",
      placeholder: "Salida, traslado, uniforme, tarjetas, intercom y horario",
    },
    {
      key: "nutrition",
      label: "Alimentacion e hidratacion",
      placeholder: "Plan de comida, hidratacion y descanso previo",
    },
    {
      key: "rules_review",
      label: "Revision reglamentaria",
      placeholder: "Regla, procedimiento o criterio a repasar",
    },
    {
      key: "mental_routine",
      label: "Rutina mental",
      placeholder: "Activacion, respiracion y consigna pre partido",
    },
  ],
  matchday: [
    {
      key: "readiness",
      label: "Readiness final",
      placeholder: "Como llegas hoy al partido",
    },
    {
      key: "main_concern",
      label: "Preocupacion principal",
      placeholder: "Que aspecto deseas gestionar mejor",
    },
    {
      key: "communication_strategy",
      label: "Estrategia de comunicacion",
      placeholder: "Consigna para primeros minutos y manejo del entorno",
    },
    {
      key: "first_minutes_goal",
      label: "Objetivo para los primeros minutos",
      placeholder: "Que necesitas hacer bien al comienzo",
    },
  ],
};

export function MatchAppointmentDetailClient({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const { currentDiscipline } = useDiscipline();
  const [data, setData] = useState<MatchAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [preparationForms, setPreparationForms] = useState<
    Record<StageKey, PreparationFormState>
  >({
    "72_48_hours": emptyPreparationForm(),
    "24_hours": emptyPreparationForm(),
    matchday: emptyPreparationForm(),
  });
  const [reviewForm, setReviewForm] = useState<ReviewFormState>(emptyReviewForm());
  const activeDiscipline = data?.appointment.sport_type ?? currentDiscipline;
  const theme = getDisciplineDefinition(activeDiscipline).theme;
  const themeVars = useMemo(
    () =>
      ({
        "--accent": theme.accent,
        "--accent-soft": theme.accentSoft,
        "--accent-border": theme.border,
        "--accent-glow": theme.glow,
        "--accent-on": theme.onAccent,
      }) as CSSProperties,
    [theme.accent, theme.accentSoft, theme.border, theme.glow, theme.onAccent]
  );

  useEffect(() => {
    void loadDetail();
  }, [appointmentId]);

  useEffect(() => {
    if (!data) return;

    setPreparationForms({
      "72_48_hours": buildPreparationForm(data, "72_48_hours"),
      "24_hours": buildPreparationForm(data, "24_hours"),
      matchday: buildPreparationForm(data, "matchday"),
    });
    setReviewForm(buildReviewForm(data));
  }, [data]);

  const matchLabel = useMemo(() => {
    if (!data) return "";
    return `${data.homeTeam?.name ?? "Local"} vs ${data.awayTeam?.name ?? "Visitante"}`;
  }, [data]);

  async function loadDetail() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/appointments/${appointmentId}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as MatchAppointmentDetail & {
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(formatApiError(payload));
      }

      setData(payload);
      setLoading(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la ficha del partido."
      );
      setLoading(false);
    }
  }

  async function savePreparation(stage: StageKey) {
    const stageForm = preparationForms[stage];
    setSavingKey(stage);
    setMessage(null);
    setError(null);

    const payload: MatchPreparationPayload = {
      stage,
      status: "completed",
      technicalFocus: stageForm.technicalFocus || null,
      physicalFocus: stageForm.physicalFocus || null,
      communicationFocus: stageForm.communicationFocus || null,
      psychologicalFocus: stageForm.psychologicalFocus || null,
      checklist: splitLines(stageForm.checklistText),
      answers: normalizeAnswers(stageForm.answers),
      notes: stageForm.notes || null,
    };

    try {
      const response = await fetch(
        `/api/matches/appointments/${appointmentId}/preparations`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(formatApiError(result));
      }

      await loadDetail();
      setMessage(`Preparacion ${preparationStageDefinitions[stage].label} guardada.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la preparacion."
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function saveReview() {
    setSavingKey("review");
    setMessage(null);
    setError(null);

    const payload: PostMatchReviewPayload = {
      resultSummary: reviewForm.resultSummary || null,
      minutesPlayed: toOptionalNumber(reviewForm.minutesPlayed),
      incidents: splitLines(reviewForm.incidentsText),
      keyDecisions: splitLines(reviewForm.keyDecisionsText),
      perceivedLoad: toOptionalNumber(reviewForm.perceivedLoad),
      fatigueScore: toOptionalNumber(reviewForm.fatigueScore),
      soreness: reviewForm.soreness || null,
      emotionalState: reviewForm.emotionalState || null,
      strengths: splitLines(reviewForm.strengthsText),
      perceivedErrors: splitLines(reviewForm.perceivedErrorsText),
      situationsToReview: splitLines(reviewForm.situationsToReviewText),
      notes: reviewForm.notes || null,
      closureText: reviewForm.closureText || null,
    };

    try {
      const response = await fetch(
        `/api/matches/appointments/${appointmentId}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(formatApiError(result));
      }

      await loadDetail();
      setMessage("Cierre post partido guardado.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el cierre post partido."
      );
    } finally {
      setSavingKey(null);
    }
  }

  async function updateStatus(status: keyof typeof appointmentStatusLabels) {
    setSavingKey(`status-${status}`);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/matches/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        technical?: string;
      };

      if (!response.ok) {
        throw new Error(formatApiError(result));
      }

      await loadDetail();
      setMessage(`Estado actualizado a ${appointmentStatusLabels[status]}.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo actualizar el estado."
      );
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-zinc-300"
        style={themeVars}
      >
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-[var(--accent)]" />
          Cargando ficha del partido...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return <Notice tone="error">{error}</Notice>;
  }

  if (!data) {
    return <Notice tone="error">No se encontro la designacion solicitada.</Notice>;
  }

  return (
    <div className="space-y-6" style={themeVars}>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/matches"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-zinc-200 transition hover:border-[var(--accent-border)]"
        >
          <ArrowLeft size={18} />
          Volver a Mis partidos
        </Link>
        <Badge label={appointmentStatusLabels[data.appointment.status ?? "draft"]} tone="accent" />
        <Badge label={data.role?.label ?? "Rol"} tone="dark" />
        <Badge
          label={data.appointment.sport_type === "futsal" ? "Futsal" : "Futbol 11"}
          tone="dark"
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <section
        className="overflow-hidden rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-8"
        style={{
          backgroundImage: `radial-gradient(circle_at_top_left, ${theme.accentSoft}, transparent 38%)`,
          backgroundColor: "#0d1720",
        }}
      >
        <div className="grid gap-6 lg:grid-cols-[1.04fr_0.96fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-[var(--accent)]">
              FICHA DEL PARTIDO
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              {matchLabel}
            </h1>
            <p className="mt-4 text-sm leading-7 text-zinc-300">
              {data.competition?.name ?? "Competicion manual"}
              {data.category?.name ? ` - ${data.category.name}` : ""}
              {data.season?.label ? ` - ${data.season.label}` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Badge label={`Funcion: ${data.role?.label ?? "Sin rol"}`} tone="dark" />
              <Badge
                label={`Kickoff: ${formatKickoff(data.fixture.kickoff_at)}`}
                tone="dark"
              />
              <Badge
                label={
                  data.fixture.var_enabled ? "VAR habilitado" : "Sin VAR"
                }
                tone="dark"
              />
            </div>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-zinc-400">
              {data.appointment.observations ||
                "Esta ficha centraliza preparacion tecnica, fisica, psicologica y cierre post partido."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={Gauge}
              label="Readiness vinculado"
              value={
                data.relatedActivity.latestReadinessScore === null
                  ? "Sin datos"
                  : `${data.relatedActivity.latestReadinessScore}%`
              }
              detail="Ultimo registro fisico"
            />
            <MetricCard
              icon={Brain}
              label="Score mental"
              value={
                data.relatedActivity.latestMentalScore === null
                  ? "Sin datos"
                  : `${data.relatedActivity.latestMentalScore}/100`
              }
              detail="Ultimo check-in psicologico"
            />
            <MetricCard
              icon={ClipboardList}
              label="Preparaciones"
              value={String(data.preparations.length)}
              detail="Etapas completadas"
            />
            <MetricCard
              icon={ShieldCheck}
              label="Post partido"
              value={data.postMatchReview ? "Listo" : "Pendiente"}
              detail="Cierre del encuentro"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <article className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <SectionHeader
            eyebrow="Centro operativo"
            title="Datos del encuentro"
            icon={CalendarDays}
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoCard label="Fecha y hora" value={formatKickoff(data.fixture.kickoff_at)} />
            <InfoCard label="Pais" value={data.country?.name ?? "Sin dato"} />
            <InfoCard label="Asociacion" value={data.association?.name ?? "Sin dato"} />
            <InfoCard label="Estadio" value={data.venue?.name ?? "Sin dato"} />
            <InfoCard label="Ciudad" value={data.venue?.city ?? "Sin dato"} />
            <InfoCard
              label="Sistema arbitral"
              value={
                data.fixture.referee_system ??
                data.category?.referee_system ??
                "Sin dato"
              }
            />
            <InfoCard
              label="Equipo arbitral"
              value={`${data.officials.length} integrante(s)`}
            />
            <InfoCard
              label="Fuente"
              value={
                data.appointment.source_type === "institutional"
                  ? "Designacion institucional"
                  : "Registro manual del usuario"
              }
            />
            <InfoCard
              label="Usuario asignado"
              value={data.appointmentUser.displayName}
            />
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-black/20 p-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--accent)]">
              Equipo arbitral
            </p>
            <div className="mt-4 space-y-3">
              {data.officials.length === 0 ? (
                <p className="text-sm leading-6 text-zinc-400">
                  Aun no hay mas integrantes cargados para este partido.
                </p>
              ) : (
                data.officials.map((official) => (
                  <div
                    key={official.id}
                    className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-black text-white">
                        {official.role?.label ?? "Rol sin definir"}
                      </p>
                      <p className="text-xs font-bold text-zinc-400">
                        {official.displayName ?? official.official_name ?? "Sin asignar"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {official.refCardId && (
                        <Badge label={official.refCardId} tone="dark" />
                      )}
                      <Badge
                        label={official.status === "confirmed" ? "Confirmado" : "Asignado"}
                        tone="dark"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>

        <article className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <SectionHeader
            eyebrow="Plan recomendado"
            title="Preparacion personalizada"
            icon={Sparkles}
          />
          {data.recommendedPlan.dataAvailable ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm leading-7 text-zinc-300">
                {data.recommendedPlan.message}
              </p>
              <InfoCard
                label="Foco tecnico"
                value={data.recommendedPlan.focusTechnical ?? "Sin evidencia suficiente"}
                large
              />
              <InfoCard
                label="Foco comunicacional"
                value={
                  data.recommendedPlan.focusCommunication ??
                  "Sin evidencia suficiente"
                }
                large
              />
              <InfoCard
                label="Foco fisico"
                value={data.recommendedPlan.focusPhysical ?? "Sin evidencia suficiente"}
                large
              />
              <InfoCard
                label="Foco psicologico"
                value={
                  data.recommendedPlan.focusPsychological ??
                  "Sin evidencia suficiente"
                }
                large
              />
              <ListBlock title="Contenido sugerido" items={data.recommendedPlan.suggestedContent} />
              <ListBlock title="Checklist" items={data.recommendedPlan.checklist} />
              <ListBlock title="Recordatorios" items={data.recommendedPlan.reminders} />
              <ListBlock title="Objetivos del encuentro" items={data.recommendedPlan.objectives} />
              <ListBlock title="Evidencia utilizada" items={data.recommendedPlan.evidence} />
            </div>
          ) : (
            <div className="mt-6 rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-sm leading-7 text-zinc-400">
              {data.recommendedPlan.message}
            </div>
          )}
        </article>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <SectionHeader
          eyebrow="Accesos directos"
          title="Integraciones"
          icon={Target}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <QuickLinkCard
            href={`/performance?sport=${data.appointment.sport_type}&section=physical&appointmentId=${data.appointment.id}&fixtureId=${data.fixture.id}&roleKey=${data.role?.role_key ?? "other"}&matchLabel=${encodeURIComponent(matchLabel)}`}
            title="Check-in pre y post partido"
            description="Ref Performance ya recibe el appointment_id para que no dupliques carga."
            cta="Abrir Ref Performance"
            icon={Dumbbell}
          />
          <QuickLinkCard
            href={`/training/psychology?module=preparacion-mental-pre-partido&appointmentId=${data.appointment.id}&fixtureId=${data.fixture.id}&sport=${data.appointment.sport_type}&roleKey=${data.role?.role_key ?? "other"}&matchLabel=${encodeURIComponent(matchLabel)}`}
            title="Rutina mental y foco"
            description="Psicologia arbitral queda vinculada al mismo partido."
            cta="Abrir Psicologia"
            icon={Brain}
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <SectionHeader
          eyebrow="Contexto"
          title="Informacion competitiva y disciplinaria"
          icon={MessageSquareQuote}
        />
        <div className="mt-6 space-y-3">
          {data.contextSnapshots.length === 0 ? (
            <EmptyState
              title="Sin datos contextuales cargados"
              description="Todavia no hay tabla, forma reciente ni notas institucionales vinculadas a este encuentro."
            />
          ) : (
            data.contextSnapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="rounded-[26px] border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-wrap gap-2">
                  <Badge label={snapshot.snapshot_type} tone="accent" />
                  {snapshot.period_label && <Badge label={snapshot.period_label} tone="dark" />}
                  {snapshot.provider && <Badge label={snapshot.provider} tone="dark" />}
                </div>
                <p className="mt-3 text-sm leading-7 text-zinc-300">
                  {snapshot.summary || "Snapshot cargado sin resumen textual."}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <SectionHeader
          eyebrow="Preparacion"
          title="Checklist por etapas"
          icon={ClipboardList}
        />
        <div className="mt-6 grid gap-5 xl:grid-cols-3">
          {(Object.keys(preparationStageDefinitions) as StageKey[]).map((stage) => (
            <PreparationCard
              key={stage}
              stage={stage}
              form={preparationForms[stage]}
              prompts={defaultStagePrompts[stage]}
              saving={savingKey === stage}
              onChange={(patch) =>
                setPreparationForms((current) => ({
                  ...current,
                  [stage]: { ...current[stage], ...patch },
                }))
              }
              onAnswerChange={(key, value) =>
                setPreparationForms((current) => ({
                  ...current,
                  [stage]: {
                    ...current[stage],
                    answers: {
                      ...current[stage].answers,
                      [key]: value,
                    },
                  },
                }))
              }
              onSave={() => void savePreparation(stage)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <SectionHeader
          eyebrow="Post partido"
          title="Cierre arbitral"
          icon={ShieldCheck}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Field
            label="Resultado / resumen"
            value={reviewForm.resultSummary}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, resultSummary: value }))
            }
            placeholder="Resumen operativo del partido"
          />
          <Field
            label="Minutos jugados"
            type="number"
            value={reviewForm.minutesPlayed}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, minutesPlayed: value }))
            }
            placeholder="90"
          />
          <Field
            label="Carga percibida"
            type="number"
            value={reviewForm.perceivedLoad}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, perceivedLoad: value }))
            }
            placeholder="1 a 10"
          />
          <Field
            label="Fatiga"
            type="number"
            value={reviewForm.fatigueScore}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, fatigueScore: value }))
            }
            placeholder="1 a 10"
          />
          <Field
            label="Molestias"
            value={reviewForm.soreness}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, soreness: value }))
            }
            placeholder="Ninguna, leve, moderada..."
          />
          <Field
            label="Estado emocional"
            value={reviewForm.emotionalState}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, emotionalState: value }))
            }
            placeholder="Sereno, exigido, conforme..."
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <TextArea
            label="Incidencias"
            value={reviewForm.incidentsText}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, incidentsText: value }))
            }
            placeholder="Una incidencia por linea"
          />
          <TextArea
            label="Decisiones clave"
            value={reviewForm.keyDecisionsText}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, keyDecisionsText: value }))
            }
            placeholder="Una decision por linea"
          />
          <TextArea
            label="Fortalezas"
            value={reviewForm.strengthsText}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, strengthsText: value }))
            }
            placeholder="Una fortaleza por linea"
          />
          <TextArea
            label="Errores percibidos"
            value={reviewForm.perceivedErrorsText}
            onChange={(value) =>
              setReviewForm((current) => ({
                ...current,
                perceivedErrorsText: value,
              }))
            }
            placeholder="Un punto critico por linea"
          />
          <TextArea
            label="Situaciones a revisar"
            value={reviewForm.situationsToReviewText}
            onChange={(value) =>
              setReviewForm((current) => ({
                ...current,
                situationsToReviewText: value,
              }))
            }
            placeholder="Que acciones quieres volver a mirar"
          />
          <TextArea
            label="Notas del partido"
            value={reviewForm.notes}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, notes: value }))
            }
            placeholder="Observaciones generales"
          />
        </div>

        <div className="mt-4">
          <TextArea
            label="Cierre psicologico"
            value={reviewForm.closureText}
            onChange={(value) =>
              setReviewForm((current) => ({ ...current, closureText: value }))
            }
            placeholder="Aprendizaje principal, cierre emocional y proxima accion"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveReview()}
            disabled={savingKey === "review"}
            className="inline-flex min-h-14 items-center gap-2 rounded-2xl bg-[var(--accent)] px-6 font-black text-[var(--accent-on)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            <Save size={20} />
            {savingKey === "review" ? "Guardando..." : "Guardar cierre post partido"}
          </button>

          {data.appointment.status !== "confirmed" && (
            <button
              type="button"
              onClick={() => void updateStatus("confirmed")}
              disabled={savingKey === "status-confirmed"}
              className="inline-flex min-h-14 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 font-black text-zinc-200 transition hover:border-[var(--accent-border)]"
            >
              Confirmar designacion
            </button>
          )}

          {data.appointment.status !== "completed" && (
            <button
              type="button"
              onClick={() => void updateStatus("completed")}
              disabled={savingKey === "status-completed"}
              className="inline-flex min-h-14 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 font-black text-zinc-200 transition hover:border-[var(--accent-border)]"
            >
              Marcar completado
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PreparationCard({
  stage,
  form,
  prompts,
  saving,
  onChange,
  onAnswerChange,
  onSave,
}: {
  stage: StageKey;
  form: PreparationFormState;
  prompts: Array<{ key: string; label: string; placeholder: string }>;
  saving: boolean;
  onChange: (patch: Partial<PreparationFormState>) => void;
  onAnswerChange: (key: string, value: string) => void;
  onSave: () => void;
}) {
  const definition = preparationStageDefinitions[stage];

  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--accent)]">
        {definition.label}
      </p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{definition.description}</p>

      <div className="mt-5 grid gap-4">
        <Field
          label="Foco tecnico"
          value={form.technicalFocus}
          onChange={(value) => onChange({ technicalFocus: value })}
          placeholder="Que aspecto tecnico vas a priorizar"
        />
        <Field
          label="Foco fisico"
          value={form.physicalFocus}
          onChange={(value) => onChange({ physicalFocus: value })}
          placeholder="Carga, sensacion corporal, activacion"
        />
        <Field
          label="Foco comunicacional"
          value={form.communicationFocus}
          onChange={(value) => onChange({ communicationFocus: value })}
          placeholder="Consigna comunicacional"
        />
        <Field
          label="Foco psicologico"
          value={form.psychologicalFocus}
          onChange={(value) => onChange({ psychologicalFocus: value })}
          placeholder="Objetivo mental o emocional"
        />

        {prompts.map((prompt) => (
          <TextArea
            key={prompt.key}
            label={prompt.label}
            value={form.answers[prompt.key] ?? ""}
            onChange={(value) => onAnswerChange(prompt.key, value)}
            placeholder={prompt.placeholder}
          />
        ))}

        <TextArea
          label="Checklist"
          value={form.checklistText}
          onChange={(value) => onChange({ checklistText: value })}
          placeholder="Una accion por linea"
        />
        <TextArea
          label="Notas"
          value={form.notes}
          onChange={(value) => onChange({ notes: value })}
          placeholder="Observaciones finales de esta etapa"
        />

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 font-black text-[var(--accent-on)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          <Save size={18} />
          {saving ? "Guardando..." : "Guardar etapa"}
        </button>
      </div>
    </article>
  );
}

function QuickLinkCard({
  href,
  title,
  description,
  cta,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: typeof Brain;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/10 bg-black/20 p-5 transition hover:border-[var(--accent-border)] hover:bg-[#101820]"
    >
      <Icon className="h-6 w-6 text-[var(--accent)]" />
      <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[var(--accent)]">
        {cta}
        <ArrowRight size={18} className="transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

function SectionHeader({
  eyebrow,
  title,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  icon: typeof CalendarDays;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--accent)]">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-black">{title}</h2>
      </div>
      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon size={22} />
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
      <Icon className="h-5 w-5 text-[var(--accent)]" />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs font-bold text-zinc-400">{detail}</p>
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "accent" | "dark";
}) {
  const classes =
    tone === "accent"
      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-white/10 bg-white/[0.04] text-zinc-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${classes}`}
    >
      {label}
    </span>
  );
}

function InfoCard({
  label,
  value,
  large = false,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p
        className={`mt-2 font-black text-white ${
          large ? "text-sm leading-6" : "text-lg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ListBlock({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) return null;

  return (
    <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">
        {title}
      </p>
      <div className="mt-4 space-y-2">
        {items.map((item) => (
          <div
            key={`${title}-${item}`}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-zinc-300"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-[var(--accent-border)]"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder={placeholder}
        className="mt-2 min-h-28 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600 focus:border-[var(--accent-border)]"
      />
    </label>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-center">
      <p className="text-lg font-black text-white">{title}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const classes =
    tone === "success"
      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-white"
      : "border-red-500/25 bg-red-500/10 text-red-200";

  return (
    <div className={`rounded-3xl border p-4 text-sm font-bold leading-6 ${classes}`}>
      {children}
    </div>
  );
}

function buildPreparationForm(
  detail: MatchAppointmentDetail,
  stage: StageKey
): PreparationFormState {
  const saved = detail.preparations.find((item) => item.stage === stage);
  const answers = saved?.answers ?? {};

  return {
    technicalFocus: textValue(saved?.technical_focus),
    physicalFocus: textValue(saved?.physical_focus),
    communicationFocus: textValue(saved?.communication_focus),
    psychologicalFocus: textValue(saved?.psychological_focus),
    checklistText: Array.isArray(saved?.checklist)
      ? saved?.checklist
          .map((item) => (typeof item === "string" ? item : ""))
          .filter(Boolean)
          .join("\n")
      : "",
    answers: Object.fromEntries(
      Object.entries(answers).map(([key, value]) => [key, textValue(value)])
    ),
    notes: textValue(saved?.notes),
  };
}

function buildReviewForm(detail: MatchAppointmentDetail): ReviewFormState {
  const review = detail.postMatchReview;
  return {
    resultSummary: textValue(review?.result_summary),
    minutesPlayed:
      review?.minutes_played === null || review?.minutes_played === undefined
        ? ""
        : String(review.minutes_played),
    incidentsText: toMultiline(review?.incidents),
    keyDecisionsText: toMultiline(review?.key_decisions),
    perceivedLoad:
      review?.perceived_load === null || review?.perceived_load === undefined
        ? ""
        : String(review.perceived_load),
    fatigueScore:
      review?.fatigue_score === null || review?.fatigue_score === undefined
        ? ""
        : String(review.fatigue_score),
    soreness: textValue(review?.soreness),
    emotionalState: textValue(review?.emotional_state),
    strengthsText: toMultiline(review?.strengths),
    perceivedErrorsText: toMultiline(review?.perceived_errors),
    situationsToReviewText: toMultiline(review?.situations_to_review),
    notes: textValue(review?.notes),
    closureText: textValue(review?.closure_text),
  };
}

function emptyPreparationForm(): PreparationFormState {
  return {
    technicalFocus: "",
    physicalFocus: "",
    communicationFocus: "",
    psychologicalFocus: "",
    checklistText: "",
    answers: {},
    notes: "",
  };
}

function emptyReviewForm(): ReviewFormState {
  return {
    resultSummary: "",
    minutesPlayed: "",
    incidentsText: "",
    keyDecisionsText: "",
    perceivedLoad: "",
    fatigueScore: "",
    soreness: "",
    emotionalState: "",
    strengthsText: "",
    perceivedErrorsText: "",
    situationsToReviewText: "",
    notes: "",
    closureText: "",
  };
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAnswers(value: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, answer]) => [key, answer.trim()])
      .filter((entry) => Boolean(entry[1]))
  );
}

function toOptionalNumber(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toMultiline(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => (typeof item === "string" ? item : ""))
    .filter(Boolean)
    .join("\n");
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatApiError(payload: { error?: string; technical?: string }) {
  if (!payload.technical) return payload.error ?? "No se pudo completar la accion.";
  return `${payload.error ?? "No se pudo completar la accion."} ${payload.technical}`;
}
