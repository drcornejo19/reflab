"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ProUpgradeCard } from "@/components/ProUpgradeCard";

type RulesExamSport = "football" | "futsal";

type RulesQuestion = {
  occurrenceId: string;
  id: string;
  question: string;
  options: string[];
  lawReference: string;
  difficulty: string;
};

type RulesSession = {
  id: string;
  submissionId: string;
  sportType: RulesExamSport;
  expiresAt: string;
  questions: RulesQuestion[];
};

type CompletedRulesAttempt = {
  occurrenceId: string;
  questionId: string;
  question: string;
  topic: string;
  subtopic: string | null;
  lawReference: string;
  difficulty: string;
  selectedText: string;
  correctText: string;
  explanation: string;
  score: number;
  isCorrect: boolean;
};

type RulesSubmissionResult = {
  examResultId: string;
  examSessionId: string;
  submissionId: string;
  avgScore: number;
  correctCount: number;
  totalQuestions: number;
  idempotentReplay: boolean;
  attempts: CompletedRulesAttempt[];
};

const copy = {
  football: {
    eyebrow: "REFLAB RULES EXAM",
    title: "Examen de Reglas de Juego",
    description:
      "Evaluacion oficial sobre las Reglas IFAB. El resultado se confirma y calcula de forma segura al finalizar.",
    timeMinutes: 15,
    accent: "#6fc11f",
    accentRgb: "111,193,31",
    source: "IFAB Laws of the Game 2026/27",
  },
  futsal: {
    eyebrow: "EXAMEN FIFA FUTSAL",
    title: "Examen de Reglas de Futsal",
    description:
      "Evaluacion oficial basada en FIFA Futsal Laws of the Game 2024-25, con correccion server-side.",
    timeMinutes: 12,
    accent: "#16b8ff",
    accentRgb: "22,184,255",
    source: "FIFA Futsal Laws of the Game 2024-25",
  },
} as const;

export function CanonicalRulesExamClient({ sportType }: { sportType: RulesExamSport }) {
  const theme = copy[sportType];
  const [session, setSession] = useState<RulesSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(theme.timeMinutes * 60);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [freeExamLimitReached, setFreeExamLimitReached] = useState(false);
  const [result, setResult] = useState<RulesSubmissionResult | null>(null);
  const timeoutSubmissionStarted = useRef(false);

  const currentQuestion = session?.questions[currentIndex];
  const topicPerformance = useMemo(() => buildTopicPerformance(result?.attempts ?? []), [result]);

  const submitExam = useCallback(
    async (answerState: Record<string, number> = answers) => {
      if (!session || saving || result) return;
      setSaving(true);
      setSubmitError(null);
      try {
        const response = await fetch(`/api/rules-exams/sessions/${session.id}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submission_id: session.submissionId,
            answers: session.questions.map((question) => ({
              occurrence_id: question.occurrenceId,
              selected_option: answerState[question.occurrenceId] ?? null,
            })),
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setSubmitError(publicApiMessage(payload));
          return;
        }
        setResult(payload.result as RulesSubmissionResult);
      } catch {
        setSubmitError(
          "No se pudo guardar la evaluacion. Podes reintentar con la misma entrega."
        );
      } finally {
        setSaving(false);
      }
    },
    [answers, result, saving, session]
  );
  const submitOnTimeout = useEffectEvent(() => {
    if (timeoutSubmissionStarted.current) return;
    timeoutSubmissionStarted.current = true;
    void submitExam();
  });

  useEffect(() => {
    if (!session || result) return;
    const updateRemainingTime = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
      if (remaining === 0) submitOnTimeout();
    };
    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 1000);
    return () => window.clearInterval(timer);
  }, [result, session]);

  async function startExam() {
    if (loading) return;
    setLoading(true);
    setLoadError(null);
    setFreeExamLimitReached(false);
    try {
      const response = await fetch("/api/rules-exams/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sportType }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (payload?.error === "weekly_exam_limit_reached") {
          setFreeExamLimitReached(true);
        } else {
          setLoadError(publicApiMessage(payload));
        }
        return;
      }
      const nextSession = payload.session as RulesSession;
      setSession(nextSession);
      setCurrentIndex(0);
      setAnswers({});
      setSelected(null);
      setResult(null);
      setSubmitError(null);
      timeoutSubmissionStarted.current = false;
      setTimeLeft(
        Math.max(0, Math.ceil((new Date(nextSession.expiresAt).getTime() - Date.now()) / 1000))
      );
    } catch {
      setLoadError("No se pudo iniciar la evaluacion.");
    } finally {
      setLoading(false);
    }
  }

  function advance() {
    if (!session || !currentQuestion || selected === null || saving) return;
    const nextAnswers = { ...answers, [currentQuestion.occurrenceId]: selected };
    setAnswers(nextAnswers);
    if (currentIndex >= session.questions.length - 1) {
      void submitExam(nextAnswers);
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelected(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retrySubmission() {
    void submitExam();
  }

  if (freeExamLimitReached) {
    return (
      <ProUpgradeCard
        title="Ya usaste tu evaluacion gratuita de esta semana"
        description="El plan Basic permite 1 evaluacion semanal. RefLab Pro desbloquea evaluaciones ilimitadas."
        reason="Limite Basic: 1 evaluacion por semana."
      />
    );
  }

  if (!session) {
    return (
      <div className="space-y-5">
        <section
          className="rounded-3xl border bg-[#101820] p-8 shadow-2xl"
          style={{
            borderColor: `rgba(${theme.accentRgb},0.3)`,
            backgroundImage: `radial-gradient(circle at top left, rgba(${theme.accentRgb},0.18), transparent 42%)`,
          }}
        >
          <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: theme.accent }}>
            {theme.eyebrow}
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">{theme.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">{theme.description}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard title="Preguntas" value={sportType === "futsal" ? "10" : "20"} />
            <StatCard title="Tiempo" value={`${theme.timeMinutes}:00`} />
            <StatCard title="Fuente" value={theme.source} />
          </div>
        </section>
        {loadError && (
          <p className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            {loadError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void startExam()}
          disabled={loading}
          className="w-full rounded-2xl px-5 py-5 text-lg font-black text-black disabled:opacity-50"
          style={{ backgroundColor: theme.accent }}
        >
          {loading ? "INICIANDO..." : "COMENZAR EVALUACION"}
        </button>
      </div>
    );
  }

  if (result) {
    const level = getLevel(result.avgScore);
    return (
      <div className="space-y-5">
        <section
          className="rounded-3xl border p-8"
          style={{
            borderColor: `rgba(${theme.accentRgb},0.3)`,
            backgroundColor: `rgba(${theme.accentRgb},0.1)`,
          }}
        >
          <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: theme.accent }}>
            RESULTADO OFICIAL CONFIRMADO
          </p>
          <h1 className="mt-4 text-4xl font-black sm:text-5xl">Evaluacion completada</h1>
          <p className="mt-6 text-6xl font-black sm:text-7xl" style={{ color: theme.accent }}>
            {formatScore(result.avgScore)}%
          </p>
          <p className="mt-3 text-xl font-bold">
            {result.correctCount} respuestas correctas de {result.totalQuestions}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard title="Nivel" value={level} />
            <StatCard title="Preguntas" value={String(result.totalQuestions)} />
            <StatCard title="Estado" value="Guardado" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <h2 className="text-2xl font-black">Rendimiento por topico</h2>
          <div className="mt-6 space-y-4">
            {topicPerformance.map((item) => (
              <div key={item.topic}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-bold">{item.topic}</span>
                  <span className="font-black" style={{ color: theme.accent }}>
                    {item.percentage}% · {item.correct}/{item.total}
                  </span>
                </div>
                <div className="h-3 rounded-full bg-white/10">
                  <div
                    className="h-3 rounded-full"
                    style={{ width: `${item.percentage}%`, backgroundColor: theme.accent }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
          <h2 className="text-2xl font-black">Revision tecnica</h2>
          <div className="mt-5 space-y-3">
            {result.attempts.map((attempt) => (
              <article
                key={attempt.occurrenceId}
                className={`rounded-2xl border p-4 ${
                  attempt.isCorrect
                    ? "border-emerald-400/25 bg-emerald-400/5"
                    : "border-red-400/20 bg-red-500/5"
                }`}
              >
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em]">
                  <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-300">
                    {attempt.lawReference}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-zinc-400">
                    {attempt.difficulty}
                  </span>
                </div>
                <p className="mt-3 font-black leading-6 text-white">{attempt.question}</p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-xl bg-black/20 p-3 text-zinc-300">
                    Tu respuesta: <strong>{attempt.selectedText}</strong>
                  </p>
                  <p className="rounded-xl bg-black/20 p-3 text-zinc-300">
                    Correcta: <strong className="text-white">{attempt.correctText}</strong>
                  </p>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{attempt.explanation}</p>
              </article>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
        >
          INICIAR OTRA EVALUACION
        </button>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <p className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-red-100">
        La sesion no contiene preguntas disponibles.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <header className="rounded-3xl border border-white/10 bg-[#0b131b] p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em]" style={{ color: theme.accent }}>
              {theme.eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-black">{theme.title}</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Pregunta {currentIndex + 1} de {session.questions.length}
            </p>
          </div>
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Tiempo</p>
            <p className="mt-1 text-3xl font-black text-red-300">{formatTime(timeLeft)}</p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-white/10 bg-[#101820] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className="inline-flex rounded-full border px-4 py-2 text-xs font-black"
            style={{
              color: theme.accent,
              borderColor: `rgba(${theme.accentRgb},0.3)`,
              backgroundColor: `rgba(${theme.accentRgb},0.1)`,
            }}
          >
            {currentQuestion.lawReference}
          </span>
          <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-zinc-300">
            {currentQuestion.difficulty}
          </span>
        </div>
        <p className="text-lg font-bold leading-8">{currentQuestion.question}</p>
        <div className="mt-6 space-y-3">
          {currentQuestion.options.map((option, optionIndex) => {
            const active = selected === optionIndex;
            return (
              <button
                type="button"
                key={`${currentQuestion.occurrenceId}-${optionIndex}`}
                onClick={() => setSelected(optionIndex)}
                disabled={saving || timeLeft === 0}
                className="w-full rounded-2xl border px-5 py-4 text-left transition disabled:opacity-50"
                style={{
                  borderColor: active ? theme.accent : "rgba(255,255,255,0.1)",
                  backgroundColor: active ? `rgba(${theme.accentRgb},0.1)` : "rgba(255,255,255,0.03)",
                }}
              >
                <span className="font-black">{String.fromCharCode(65 + optionIndex)}.</span>{" "}
                {option}
              </button>
            );
          })}
        </div>
        {submitError && (
          <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100">
            <p>{submitError}</p>
            <button type="button" onClick={retrySubmission} disabled={saving} className="mt-3 font-black underline">
              Reintentar la misma entrega
            </button>
          </div>
        )}
        <button
          type="button"
          disabled={selected === null || saving || timeLeft === 0}
          onClick={advance}
          className="mt-6 w-full rounded-2xl px-5 py-4 font-black text-black disabled:opacity-40"
          style={{ backgroundColor: theme.accent }}
        >
          {saving
            ? "GUARDANDO..."
            : currentIndex >= session.questions.length - 1
              ? "FINALIZAR Y GUARDAR"
              : "SIGUIENTE"}
        </button>
      </section>
    </div>
  );
}

function buildTopicPerformance(attempts: CompletedRulesAttempt[]) {
  const topics = new Map<string, { total: number; correct: number }>();
  for (const attempt of attempts) {
    const current = topics.get(attempt.topic) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (attempt.isCorrect) current.correct += 1;
    topics.set(attempt.topic, current);
  }
  return [...topics.entries()]
    .map(([topic, values]) => ({
      topic,
      ...values,
      percentage: Math.round((values.correct / values.total) * 100),
    }))
    .sort((left, right) => right.percentage - left.percentage || left.topic.localeCompare(right.topic));
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/25 p-5">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 break-words text-xl font-black">{value}</p>
    </div>
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(2).replace(/\.00$/, "");
}

function getLevel(score: number) {
  if (score >= 90) return "Elite";
  if (score >= 80) return "Avanzado";
  if (score >= 70) return "Intermedio";
  return "Inicial";
}

function publicApiMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "No se pudo completar la evaluacion.";
  const value = payload as { error?: unknown; message?: unknown };
  if (value.error === "identity_link_required") {
    return "Tu identidad debe estar vinculada antes de rendir la evaluacion.";
  }
  if (value.error === "exam_session_expired") return "La sesion de evaluacion vencio.";
  if (value.error === "submission_conflict") return "La entrega ya fue utilizada con otras respuestas.";
  return typeof value.message === "string" ? value.message : "No se pudo completar la evaluacion.";
}
