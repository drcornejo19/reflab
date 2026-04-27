"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { supabase } from "@/lib/supabase";
import type { Clip } from "@/lib/types";
import { calculateScore } from "@/lib/scoring";

const TOTAL_QUESTIONS = 10;

type Answer = {
  clipId: string;
  clipTitle: string;
  topic: string;
  difficulty: string;
  foul: boolean | null;
  restart: string;
  discipline: string;
  varReview: boolean | null;
  score: number;
};

export function ExamClient() {
  const { user } = useUser();

  const [clips, setClips] = useState<Clip[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  const [foul, setFoul] = useState<boolean | null>(null);
  const [restart, setRestart] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [varReview, setVarReview] = useState<boolean | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
const [loadingAi, setLoadingAi] = useState(false);

async function generateAIAnalysis() {
  setLoadingAi(true);

  const res = await fetch("/api/ai-exam-analysis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      avgScore: examStats.avgScore,
      correctCount: examStats.correctCount,
      totalQuestions: answers.length,
      answers,
    }),
  });

  const data = await res.json();

  if (data.feedback) {
    setAiAnalysis(data.feedback);
  } else {
    setAiAnalysis("No se pudo generar análisis IA.");
  }

  setLoadingAi(false);
}

  const [answers, setAnswers] = useState<Answer[]>([]);

  useEffect(() => {
    async function loadClips() {
      const { data, error } = await supabase.from("clips").select("*");

      if (error) {
        console.error("Error cargando clips:", error);
        setClips([]);
      } else {
        const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
        setClips(shuffled.slice(0, TOTAL_QUESTIONS));
      }

      setLoading(false);
    }

    loadClips();
  }, []);

  const currentClip = clips[index];

  const canSubmit =
    foul !== null && restart !== "" && discipline !== "" && varReview !== null;

  const examStats = useMemo(() => {
    const totalScore = answers.reduce((acc, a) => acc + a.score, 0);
    const avgScore =
      answers.length > 0 ? Math.round(totalScore / answers.length) : 0;
    const correctCount = answers.filter((a) => a.score >= 85).length;

    return {
      totalScore,
      avgScore,
      correctCount,
      level: getExamLevel(avgScore),
    };
  }, [answers]);

  function submitAnswer() {
    if (!currentClip || !canSubmit) return;

    const score = calculateScore(
      { foul, restart, discipline, var: varReview },
      {
        foul: currentClip.correct_foul,
        restart: currentClip.correct_restart,
        discipline: currentClip.correct_discipline,
        var: currentClip.correct_var,
      }
    );

    const answer: Answer = {
      clipId: currentClip.id,
      clipTitle: currentClip.title,
      topic: currentClip.topic,
      difficulty: currentClip.difficulty,
      foul,
      restart,
      discipline,
      varReview,
      score,
    };

    const nextAnswers = [...answers, answer];
    setAnswers(nextAnswers);

    resetInputs();

    if (index >= clips.length - 1) {
      setFinished(true);
    } else {
      setIndex((prev) => prev + 1);
    }
  }

  async function saveExam() {
    if (!user) {
      alert("Tenés que iniciar sesión.");
      return;
    }

    setSaving(true);

    const totalScore = answers.reduce((acc, a) => acc + a.score, 0);
    const avgScore = Math.round(totalScore / answers.length);
    const correctCount = answers.filter((a) => a.score >= 85).length;

    const { error } = await supabase.from("exam_results").insert([
      {
        user_id: user.id,
        total_questions: answers.length,
        total_score: totalScore,
        avg_score: avgScore,
        correct_count: correctCount,
        details: answers,
      },
    ]);

    if (error) {
      alert(error.message);
    } else {
      alert("Examen guardado correctamente.");
    }

    setSaving(false);
  }

  function resetInputs() {
    setFoul(null);
    setRestart("");
    setDiscipline("");
    setVarReview(null);
  }

  function restartExam() {
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        Cargando examen...
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-zinc-400">
        No hay clips suficientes para iniciar examen.
      </div>
    );
  }

  if (finished) {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-8">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
            Resultado final
          </p>

          <h2 className="mt-4 text-7xl font-black">
            {examStats.avgScore}/100
          </h2>

          <p className="mt-3 text-3xl font-black text-[#6fc11f]">
            {examStats.level}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FinalStat title="Preguntas" value={answers.length.toString()} />
            <FinalStat
              title="Aprobadas"
              value={examStats.correctCount.toString()}
            />
            <FinalStat
              title="Score total"
              value={examStats.totalScore.toString()}
            />
          </div>

<div className="mt-8 flex gap-3">
  <div className="flex-1 space-y-3">
    <button
      onClick={saveExam}
      disabled={saving}
      className="w-full rounded-2xl bg-[#6fc11f] px-5 py-4 font-black text-black disabled:opacity-50"
    >
      {saving ? "GUARDANDO..." : "GUARDAR EXAMEN"}
    </button>

    <button
      onClick={generateAIAnalysis}
      className="w-full rounded-2xl bg-blue-500 px-5 py-4 font-black text-white hover:bg-blue-600"
    >
      ANALIZAR CON IA
    </button>

    {loadingAi && (
      <p className="mt-4 text-sm text-zinc-400">
        Analizando desempeño...
      </p>
    )}

    {aiAnalysis && (
      <div className="mt-4 rounded-3xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 p-6">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
          Análisis IA del examen
        </p>

        <div className="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-200">
         {aiAnalysis.split("\n").map((line, i) => (
  <p key={i} className="mb-2">
    {line}
  </p>
))}
        </div>
      </div>
    )}
  </div>

  <button
    onClick={restartExam}
    className="flex-1 rounded-2xl bg-white/10 px-5 py-4 font-black text-white hover:bg-white/15"
  >
    NUEVO EXAMEN
  </button>
</div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h3 className="text-xl font-black">Detalle del examen</h3>

          <div className="mt-6 space-y-3">
            {answers.map((a, i) => (
              <div
                key={`${a.clipId}-${i}`}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-black">
                      {i + 1}. {a.clipTitle}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {a.topic} · {translateDifficulty(a.difficulty)}
                    </p>
                  </div>

                  <p
                    className={`text-2xl font-black ${
                      a.score >= 85
                        ? "text-[#6fc11f]"
                        : a.score >= 60
                          ? "text-yellow-400"
                          : "text-red-400"
                    }`}
                  >
                    {a.score}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Examen en curso
            </p>
            <h2 className="mt-2 text-2xl font-black">
              Pregunta {index + 1} de {clips.length}
            </h2>
          </div>

          <div className="h-3 w-full rounded-full bg-white/10 md:w-80">
            <div
              className="h-3 rounded-full bg-[#6fc11f]"
              style={{ width: `${((index + 1) / clips.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6fc11f]">
                Clip de examen
              </p>
              <h1 className="mt-2 text-2xl font-black">{currentClip.title}</h1>
            </div>

            <span className="rounded-full border border-[#6fc11f]/40 px-3 py-1 text-xs font-bold text-[#6fc11f]">
              {translateDifficulty(currentClip.difficulty)}
            </span>
          </div>

          <video
            className="aspect-video w-full rounded-2xl bg-black object-cover"
            src={currentClip.video_url}
            controls
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBox title="Tema" value={currentClip.topic} />
            <InfoBox title="Modo" value="Examen" />
            <InfoBox title="Feedback" value="Al final" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="space-y-6">
            <DecisionBlock title="1. ¿Hubo infracción?">
              <div className="grid grid-cols-2 gap-3">
                <DecisionButton
                  active={foul === true}
                  onClick={() => setFoul(true)}
                >
                  SÍ
                </DecisionButton>
                <DecisionButton
                  active={foul === false}
                  onClick={() => setFoul(false)}
                >
                  NO
                </DecisionButton>
              </div>
            </DecisionBlock>

            <DecisionBlock title="2. Reanudación">
              <select
                value={restart}
                onChange={(e) => setRestart(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-4 py-3 text-white outline-none"
              >
                <option value="">Seleccioná una opción</option>
                <option>Tiro libre directo</option>
                <option>Tiro libre indirecto</option>
                <option>Penal</option>
                <option>Saque de meta</option>
                <option>Córner</option>
                <option>Balón a tierra</option>
              </select>
            </DecisionBlock>

            <DecisionBlock title="3. Sanción disciplinaria">
              <div className="grid grid-cols-3 gap-3">
                {["Sin sanción", "Amarilla", "Roja"].map((item) => (
                  <button
                    key={item}
                    onClick={() => setDiscipline(item)}
                    className={`rounded-xl px-3 py-3 text-sm font-black transition ${
                      discipline === item
                        ? item === "Amarilla"
                          ? "bg-yellow-400 text-black"
                          : item === "Roja"
                            ? "bg-red-600 text-white"
                            : "bg-[#6fc11f] text-black"
                        : "bg-white/10 text-zinc-300 hover:bg-white/15"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </DecisionBlock>

            <DecisionBlock title="4. ¿Es revisable por VAR?">
              <div className="grid grid-cols-2 gap-3">
                <DecisionButton
                  active={varReview === true}
                  onClick={() => setVarReview(true)}
                >
                  SÍ
                </DecisionButton>
                <DecisionButton
                  active={varReview === false}
                  onClick={() => setVarReview(false)}
                >
                  NO
                </DecisionButton>
              </div>
            </DecisionBlock>

            <button
              disabled={!canSubmit}
              onClick={submitAnswer}
              className="w-full rounded-xl bg-[#6fc11f] px-5 py-4 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {index === clips.length - 1
                ? "FINALIZAR EXAMEN"
                : "SIGUIENTE PREGUNTA"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function getExamLevel(avg: number) {
  if (avg >= 90) return "Nivel FIFA";
  if (avg >= 80) return "Nivel Elite";
  if (avg >= 70) return "Nivel Nacional";
  if (avg >= 60) return "Nivel Regional";
  return "Nivel Inicial";
}

function translateDifficulty(value: string) {
  const map: Record<string, string> = {
    easy: "Fácil",
    medium: "Media",
    hard: "Difícil",
  };

  return map[value] ?? value;
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function DecisionBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-3 font-black">{title}</p>
      {children}
    </div>
  );
}

function DecisionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-3 font-black transition ${
        active
          ? "bg-[#6fc11f] text-black"
          : "bg-white/10 text-zinc-300 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

function FinalStat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/30 p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}