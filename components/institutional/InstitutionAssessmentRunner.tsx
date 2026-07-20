"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useDiscipline } from "@/components/DisciplineProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import type {
  InstitutionAssessmentSessionRecord,
  InstitutionSessionItem,
} from "@/lib/institutional/types";

export function InstitutionAssessmentRunner({
  sessionId,
}: {
  sessionId: string;
}) {
  const { currentDiscipline } = useDiscipline();
  const theme = getDisciplineDefinition(currentDiscipline).theme;
  const [session, setSession] =
    useState<InstitutionAssessmentSessionRecord | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/institution/learning/sessions/${sessionId}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as {
          session?: InstitutionAssessmentSessionRecord;
          error?: string;
        };
        if (!response.ok || !data.session) {
          throw new Error(data.error || "No se pudo cargar la evaluacion.");
        }
        if (active) {
          setSession(data.session);
          setAnswers(data.session.answers);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar la evaluacion."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (
      !session?.startedAt ||
      !session.assessment.durationMinutes ||
      session.status !== "in_progress"
    ) {
      setRemainingSeconds(null);
      return;
    }
    const deadline =
      new Date(session.startedAt).getTime() +
      session.assessment.durationMinutes * 60_000;
    const tick = () =>
      setRemainingSeconds(
        Math.max(0, Math.floor((deadline - Date.now()) / 1000))
      );
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [session]);

  async function submit() {
    if (!session) return;
    const missing = session.items.find(
      (item) => item.isRequired && !answers[item.id]?.trim()
    );
    if (missing) {
      setCurrentIndex(
        Math.max(
          0,
          session.items.findIndex((item) => item.id === missing.id)
        )
      );
      setError("Completa todas las actividades obligatorias.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/institution/learning/sessions/${sessionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        }
      );
      const data = (await response.json()) as {
        session?: InstitutionAssessmentSessionRecord;
        error?: string;
      };
      if (!response.ok || !data.session) {
        throw new Error(data.error || "No se pudo finalizar la evaluacion.");
      }
      setSession(data.session);
      setAnswers(data.session.answers);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo finalizar la evaluacion."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="grid min-h-72 place-items-center rounded-[30px] border border-white/10 bg-[#0a141d]">
          <Loader2 className="animate-spin text-zinc-500" size={30} />
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell>
        <div className="rounded-[30px] border border-red-400/20 bg-red-400/10 p-6 text-red-200">
          {error || "La evaluacion no esta disponible."}
        </div>
      </AppShell>
    );
  }

  const finished = ["submitted", "graded"].includes(session.status);
  const currentItem = session.items[currentIndex];
  const completedCount = session.items.filter(
    (item) => answers[item.id]?.trim()
  ).length;

  return (
    <AppShell>
      <div className="space-y-6">
        <header
          className="rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-7"
          style={{
            background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 42%), #0b151e`,
          }}
        >
          <Link
            href="/institution/learning"
            className="inline-flex items-center gap-2 text-xs font-black text-zinc-400"
          >
            <ArrowLeft size={15} />
            Volver a Mi Programa
          </Link>
          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-[0.28em]"
                style={{ color: theme.accent }}
              >
                Intento {session.attemptNumber}
              </p>
              <h1 className="mt-2 text-3xl font-black sm:text-5xl">
                {session.assessment.name}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                {session.assessment.description ||
                  "Evaluacion institucional asignada."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <InfoPill
                icon={ShieldCheck}
                text={`${completedCount}/${session.items.length} actividades`}
              />
              {remainingSeconds != null ? (
                <InfoPill
                  icon={Clock3}
                  text={formatDuration(remainingSeconds)}
                  urgent={remainingSeconds <= 300}
                />
              ) : null}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm font-bold text-red-200">
            {error}
          </div>
        ) : null}

        {finished ? (
          <ResultPanel session={session} accent={theme.accent} />
        ) : currentItem ? (
          <>
            {session.assessment.freeNavigation ? (
              <div className="flex flex-wrap gap-2">
                {session.items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCurrentIndex(index)}
                    className="grid h-10 w-10 place-items-center rounded-xl border text-xs font-black"
                    style={{
                      borderColor:
                        index === currentIndex
                          ? theme.border
                          : "rgba(255,255,255,0.1)",
                      backgroundColor: answers[item.id]
                        ? theme.accentSoft
                        : "rgba(255,255,255,0.03)",
                      color: answers[item.id] ? theme.accent : "#a1a1aa",
                    }}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            ) : null}

            <ActivityCard
              item={currentItem}
              index={currentIndex}
              total={session.items.length}
              value={answers[currentItem.id] ?? ""}
              onChange={(value) =>
                setAnswers((current) => ({
                  ...current,
                  [currentItem.id]: value,
                }))
              }
              accent={theme.accent}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={
                  currentIndex === 0 ||
                  !session.assessment.freeNavigation
                }
                onClick={() =>
                  setCurrentIndex((index) => Math.max(0, index - 1))
                }
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black disabled:opacity-30"
              >
                <ArrowLeft size={17} />
                Anterior
              </button>
              {currentIndex < session.items.length - 1 ? (
                <button
                  type="button"
                  disabled={!answers[currentItem.id]?.trim()}
                  onClick={() =>
                    setCurrentIndex((index) =>
                      Math.min(session.items.length - 1, index + 1)
                    )
                  }
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:opacity-40"
                  style={{
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }}
                >
                  Siguiente
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submit()}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black disabled:opacity-50"
                  style={{
                    backgroundColor: theme.button,
                    color: theme.onAccent,
                  }}
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <Send size={17} />
                  )}
                  Finalizar evaluacion
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-[30px] border border-dashed border-white/10 p-8 text-center text-zinc-500">
            Esta evaluacion no contiene actividades.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ActivityCard({
  item,
  index,
  total,
  value,
  onChange,
  accent,
}: {
  item: InstitutionSessionItem;
  index: number;
  total: number;
  value: string;
  onChange: (value: string) => void;
  accent: string;
}) {
  const isQuestion =
    item.contentType === "question" || item.contentType === "trivia";
  const href = item.accessUrl || item.sourceUrl;
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-5 sm:p-7">
      <p
        className="text-[10px] font-black uppercase tracking-[0.24em]"
        style={{ color: accent }}
      >
        Actividad {index + 1} de {total}
      </p>
      <h2 className="mt-3 text-2xl font-black">{item.title}</h2>
      {item.description ? (
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          {item.description}
        </p>
      ) : null}

      {item.contentType === "video" && item.accessUrl ? (
        <video
          controls
          preload="metadata"
          className="mt-5 aspect-video w-full rounded-[22px] bg-black"
          src={item.accessUrl}
        />
      ) : null}
      {item.contentType === "audio" && item.accessUrl ? (
        <audio controls className="mt-5 w-full" src={item.accessUrl} />
      ) : null}
      {href && !(item.contentType === "video" && item.accessUrl) ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black"
        >
          Abrir material
          <ExternalLink size={16} />
        </a>
      ) : null}

      {isQuestion ? (
        <div className="mt-6">
          <p className="text-lg font-black">
            {item.prompt || "Selecciona la respuesta correcta."}
          </p>
          {item.options.length ? (
            <div className="mt-4 grid gap-3">
              {item.options.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold"
                >
                  <input
                    type="radio"
                    name={item.id}
                    value={option}
                    checked={value === option}
                    onChange={() => onChange(option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          ) : (
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="mt-4 min-h-28 w-full rounded-2xl border border-white/10 bg-black/25 p-4 text-sm outline-none"
              placeholder="Escribe tu respuesta"
            />
          )}
        </div>
      ) : (
        <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold">
          <input
            type="checkbox"
            checked={value === "acknowledged"}
            onChange={(event) =>
              onChange(event.target.checked ? "acknowledged" : "")
            }
          />
          Confirme que revise esta actividad
        </label>
      )}
    </section>
  );
}

function ResultPanel({
  session,
  accent,
}: {
  session: InstitutionAssessmentSessionRecord;
  accent: string;
}) {
  return (
    <section className="rounded-[30px] border border-white/10 bg-[#0a141d] p-6 sm:p-8">
      <CheckCircle2 size={38} style={{ color: accent }} />
      <p
        className="mt-5 text-[10px] font-black uppercase tracking-[0.26em]"
        style={{ color: accent }}
      >
        Evaluacion finalizada
      </p>
      <h2 className="mt-2 text-3xl font-black">
        {session.percentage == null
          ? "Pendiente de correccion"
          : `${session.percentage}%`}
      </h2>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        {session.percentage == null
          ? "La actividad contiene criterios que requieren revision del equipo institucional."
          : session.passed === true
            ? "Alcanzaste el puntaje minimo configurado."
            : session.passed === false
              ? "El resultado quedo registrado para seguimiento."
              : "El resultado quedo registrado."}
      </p>
      {session.items.some((item) => item.correctAnswer) ? (
        <div className="mt-6 grid gap-3">
          {session.items.map((item) =>
            item.correctAnswer ? (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <p className="text-sm font-black">{item.title}</p>
                <p className="mt-2 text-xs text-zinc-400">
                  Tu respuesta: {session.answers[item.id] || "Sin respuesta"}
                </p>
                <p className="mt-1 text-xs font-bold" style={{ color: accent }}>
                  Respuesta correcta: {item.correctAnswer}
                </p>
                {item.explanation ? (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {item.explanation}
                  </p>
                ) : null}
              </div>
            ) : null
          )}
        </div>
      ) : null}
      <Link
        href="/institution/learning"
        className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-black"
        style={{ backgroundColor: accent, color: "#04110a" }}
      >
        Volver a Mi Programa
        <ArrowRight size={17} />
      </Link>
    </section>
  );
}

function InfoPill({
  icon: Icon,
  text,
  urgent = false,
}: {
  icon: typeof Clock3;
  text: string;
  urgent?: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-xs font-black ${
        urgent
          ? "border-red-400/30 bg-red-400/10 text-red-200"
          : "border-white/10 bg-black/20 text-zinc-300"
      }`}
    >
      <Icon size={15} />
      {text}
    </span>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}
