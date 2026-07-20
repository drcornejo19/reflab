"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { useInstitution } from "@/components/institutional/InstitutionProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import { formatDateTimeInTimeZone } from "@/lib/dateTime";
import {
  type InstitutionLearningAssessment,
  type InstitutionLearningContent,
  type InstitutionLearningWorkspace as LearningWorkspace,
} from "@/lib/institutional/types";

const availabilityLabels = {
  available: "Disponible",
  upcoming: "Proxima",
  closed: "Cerrada",
  completed: "Completada",
  attempts_exhausted: "Sin intentos",
} as const;

export function InstitutionLearningWorkspace() {
  const router = useRouter();
  const { currentDiscipline } = useDiscipline();
  const { activeContext, loading: institutionLoading } = useInstitution();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [workspace, setWorkspace] = useState<LearningWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeContext) {
      setWorkspace(null);
      setLoading(false);
      return;
    }
    void loadWorkspace();
    // Tenant and discipline are the complete workspace filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext?.institution.id, currentDiscipline]);

  async function loadWorkspace() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/learning?sportType=${currentDiscipline}`,
        { cache: "no-store" }
      );
      const data = (await response.json()) as {
        workspace?: LearningWorkspace;
        error?: string;
      };
      if (!response.ok || !data.workspace) {
        throw new Error(data.error || "No se pudo cargar tu espacio.");
      }
      setWorkspace(data.workspace);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar tu espacio."
      );
    } finally {
      setLoading(false);
    }
  }

  async function openAssessment(assessment: InstitutionLearningAssessment) {
    if (
      assessment.latestSessionId &&
      ["in_progress", "submitted", "graded"].includes(
        assessment.latestSessionStatus ?? ""
      )
    ) {
      router.push(
        `/institution/learning/assessments/${assessment.latestSessionId}`
      );
      return;
    }
    if (assessment.availability !== "available") return;
    setStartingId(assessment.assignmentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/learning/assessments/${assessment.assignmentId}/start`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
      const data = (await response.json()) as {
        session?: { id: string };
        error?: string;
      };
      if (!response.ok || !data.session) {
        throw new Error(data.error || "No se pudo iniciar la evaluacion.");
      }
      router.push(`/institution/learning/assessments/${data.session.id}`);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "No se pudo iniciar la evaluacion."
      );
    } finally {
      setStartingId(null);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header
          className="overflow-hidden rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 42%), #0b151e`,
          }}
        >
          <p
            className="text-[10px] font-black uppercase tracking-[0.32em]"
            style={{ color: theme.accent }}
          >
            Fase 7 · Mi espacio institucional
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black sm:text-5xl">Mi Programa</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                Material, fechas y evaluaciones asignadas por tu institucion
                para {currentDiscipline === "futsal" ? "Futsal" : "Futbol 11"}.
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

        {error ? <Alert>{error}</Alert> : null}
        {institutionLoading || loading ? (
          <LoadingState />
        ) : !workspace ? (
          <EmptyState
            title="Sin espacio institucional activo"
            description="Selecciona una institucion vinculada para consultar tus asignaciones."
          />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Material asignado"
                value={String(workspace.summary.assignedContents)}
                icon={BookOpen}
                accent={theme.accent}
              />
              <Metric
                label="Evaluaciones disponibles"
                value={String(workspace.summary.availableAssessments)}
                icon={PlayCircle}
                accent={theme.accent}
              />
              <Metric
                label="Proximas"
                value={String(workspace.summary.upcomingAssessments)}
                icon={CalendarClock}
                accent={theme.accent}
              />
              <Metric
                label="Completadas"
                value={String(workspace.summary.completedAssessments)}
                icon={CheckCircle2}
                accent={theme.accent}
              />
            </section>

            <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div
                  className="grid h-12 w-12 place-items-center rounded-2xl border"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.accentSoft,
                    color: theme.accent,
                  }}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <p
                    className="text-[10px] font-black uppercase tracking-[0.24em]"
                    style={{ color: theme.accent }}
                  >
                    Agenda personal
                  </p>
                  <h2 className="mt-1 text-2xl font-black">Mis evaluaciones</h2>
                </div>
              </div>
              {workspace.assessments.length ? (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {workspace.assessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.assignmentId}
                      assessment={assessment}
                      accent={theme.accent}
                      loading={startingId === assessment.assignmentId}
                      onOpen={() => void openAssessment(assessment)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sin evaluaciones asignadas"
                  description="Cuando tu institucion programe una instancia para vos o tu grupo, aparecera aqui."
                />
              )}
            </section>

            <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-6">
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-[0.24em]"
                  style={{ color: theme.accent }}
                >
                  Biblioteca asignada
                </p>
                <h2 className="mt-2 text-2xl font-black">
                  Material habilitado
                </h2>
              </div>
              {workspace.contents.length ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {workspace.contents.map((content) => (
                    <ContentCard
                      key={content.id}
                      content={content}
                      accent={theme.accent}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Sin material asignado"
                  description="No hay contenidos publicados para esta disciplina y tu membresia."
                />
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
  accent,
  loading,
  onOpen,
}: {
  assessment: InstitutionLearningAssessment;
  accent: string;
  loading: boolean;
  onOpen: () => void;
}) {
  const canOpen =
    assessment.availability === "available" ||
    Boolean(assessment.latestSessionId);
  const actionLabel =
    assessment.latestSessionStatus === "in_progress"
      ? "Continuar"
      : assessment.latestSessionStatus === "submitted" ||
          assessment.latestSessionStatus === "graded"
        ? "Ver resultado"
        : assessment.availability === "available"
          ? "Comenzar"
          : availabilityLabels[assessment.availability];

  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className="rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em]"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          {assessment.sportType === "futsal" ? "Futsal" : "Futbol 11"}
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {availabilityLabels[assessment.availability]}
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black">{assessment.name}</h3>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-500">
        {assessment.description || "Evaluacion institucional programada."}
      </p>
      <div className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
        <span>
          Abre:{" "}
          {formatDateTimeInTimeZone(
            assessment.effectiveOpensAt,
            assessment.timezone
          )}
        </span>
        <span>
          Cierra:{" "}
          {formatDateTimeInTimeZone(
            assessment.effectiveClosesAt,
            assessment.timezone
          )}
        </span>
        <span>
          Intentos: {assessment.attemptsUsed}/{assessment.attemptsAllowed}
        </span>
        {assessment.latestPercentage != null ? (
          <span>Ultimo resultado: {assessment.latestPercentage}%</span>
        ) : null}
      </div>
      <button
        type="button"
        disabled={!canOpen || loading}
        onClick={onOpen}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-black disabled:cursor-not-allowed disabled:border disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
        style={
          canOpen
            ? { backgroundColor: accent, color: "#04110a" }
            : undefined
        }
      >
        {loading ? <Loader2 className="animate-spin" size={16} /> : null}
        {actionLabel}
        {canOpen && !loading ? <ArrowRight size={15} /> : null}
      </button>
    </article>
  );
}

function ContentCard({
  content,
  accent,
}: {
  content: InstitutionLearningContent;
  accent: string;
}) {
  const href = content.accessUrl || content.sourceUrl;
  return (
    <article className="flex min-h-60 flex-col rounded-[24px] border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-start justify-between gap-3">
        <div
          className="grid h-11 w-11 place-items-center rounded-2xl"
          style={{ backgroundColor: `${accent}1f`, color: accent }}
        >
          <FileText size={20} />
        </div>
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500">
          {content.assignedBy === "institution"
            ? "Institucion"
            : content.assignedBy === "group"
              ? "Tu grupo"
              : "Asignacion directa"}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-black">{content.title}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-5 text-zinc-500">
        {content.description || "Material institucional habilitado."}
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
          {content.contentType}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs font-black"
            style={{ color: accent }}
          >
            Abrir
            <ExternalLink size={14} />
          </a>
        ) : (
          <span className="text-xs font-bold text-zinc-600">
            Lectura en evaluacion
          </span>
        )}
      </div>
    </article>
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
  icon: typeof BookOpen;
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

function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-200">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-60 place-items-center rounded-[30px] border border-white/10 bg-[#0a141d]">
      <Loader2 className="animate-spin text-zinc-500" size={30} />
    </div>
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
    <div className="mt-5 rounded-[24px] border border-dashed border-white/10 p-8 text-center">
      <Clock3 className="mx-auto text-zinc-700" size={28} />
      <p className="mt-4 text-lg font-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
        {description}
      </p>
    </div>
  );
}
