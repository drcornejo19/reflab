"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  Dumbbell,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { insertAttemptSafely } from "@/lib/attemptPersistence";
import { supabase } from "@/lib/supabase";

type Phase = "idle" | "preparation" | "work" | "rest" | "series_rest" | "finished";
type TimerStatus = "idle" | "running" | "paused" | "finished";

type WorkoutRoutine = {
  id: string;
  name: string;
  objective: string;
  preparation: number;
  work: number;
  rest: number;
  rounds: number;
  series: number;
  seriesRest: number;
  tag: string;
  exercises: string[];
  note?: string;
};

const routines: WorkoutRoutine[] = [
  {
    id: "tabata-referee",
    name: "Tabata arbitral",
    objective: "Mejorar intensidad, reaccion y tolerancia al esfuerzo intermitente.",
    preparation: 30,
    work: 20,
    rest: 10,
    rounds: 8,
    series: 1,
    seriesRest: 60,
    tag: "Intermitente",
    exercises: [
      "Skipping",
      "Cambios de direccion cortos",
      "Desplazamiento lateral",
      "Sprint corto",
      "Burpees moderados",
      "Plancha dinamica",
      "Aceleraciones de 5 a 10 metros",
      "Recuperacion activa",
    ],
  },
  {
    id: "yo-yo-prep",
    name: "Preparacion Yo-Yo Test",
    objective: "Trabajar resistencia intermitente y recuperacion entre esfuerzos.",
    preparation: 60,
    work: 40,
    rest: 20,
    rounds: 10,
    series: 2,
    seriesRest: 120,
    tag: "Resistencia",
    note: "No reemplaza el audio oficial del Yo-Yo test. Es una rutina de preparacion.",
    exercises: [
      "Carrera ida y vuelta",
      "Recuperacion caminando",
      "Cambio de ritmo",
      "Control de respiracion",
    ],
  },
  {
    id: "intervals-75-25",
    name: "Intervalos 75/25",
    objective: "Preparar esfuerzos intermitentes similares a pruebas fisicas arbitrales.",
    preparation: 60,
    work: 20,
    rest: 25,
    rounds: 16,
    series: 1,
    seriesRest: 120,
    tag: "Prueba fisica",
    note: "Los tiempos son orientativos y deben ajustarse segun categoria, edad, sexo, asociacion o prueba.",
    exercises: ["Carrera intensa", "Caminata activa", "Control de postura", "Recuperacion corta"],
  },
  {
    id: "rsa",
    name: "RSA - Sprints repetidos",
    objective: "Entrenar la capacidad de repetir sprints con recuperacion incompleta.",
    preparation: 60,
    work: 8,
    rest: 40,
    rounds: 6,
    series: 2,
    seriesRest: 180,
    tag: "Velocidad",
    exercises: ["Sprint 6 a 8 segundos", "Vuelta caminando", "Salida reactiva", "Freno controlado"],
  },
  {
    id: "coda",
    name: "CODA - Cambios de direccion",
    objective: "Mejorar aceleracion, frenado, giro y desplazamientos laterales.",
    preparation: 45,
    work: 15,
    rest: 30,
    rounds: 8,
    series: 2,
    seriesRest: 120,
    tag: "CODA",
    exercises: ["Aceleracion", "Frenado", "Giro", "Desplazamiento lateral", "Retorno"],
  },
  {
    id: "core-prevention",
    name: "Core y prevencion",
    objective: "Fortalecer zona media, estabilidad y prevencion de lesiones.",
    preparation: 30,
    work: 30,
    rest: 15,
    rounds: 8,
    series: 2,
    seriesRest: 60,
    tag: "Prevencion",
    exercises: ["Plancha frontal", "Plancha lateral", "Puente de gluteos", "Bird dog", "Movilidad de cadera"],
  },
];

const phaseLabels: Record<Phase, string> = {
  idle: "Listo",
  preparation: "Preparacion",
  work: "Trabajo",
  rest: "Pausa",
  series_rest: "Descanso entre series",
  finished: "Finalizado",
};

export function PhysicalTrainingClient() {
  const { user } = useUser();
  const [selectedId, setSelectedId] = useState(routines[0].id);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [secondsLeft, setSecondsLeft] = useState(routines[0].preparation);
  const [round, setRound] = useState(1);
  const [series, setSeries] = useState(1);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const savedSessionRef = useRef(false);

  const routine = routines.find((item) => item.id === selectedId) ?? routines[0];
  const totalRounds = routine.rounds * routine.series;
  const completedRounds = Math.min(
    totalRounds,
    (series - 1) * routine.rounds + (phase === "work" ? round - 1 : round)
  );
  const progress = Math.round((completedRounds / totalRounds) * 100);
  const activeExercise = routine.exercises[(round - 1) % routine.exercises.length];

  useEffect(() => {
    resetTimer(routine);
  }, [routine.id]);

  useEffect(() => {
    if (status !== "running") return;

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) return current - 1;
        advancePhase();
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, phase, round, series, routine]);

  async function finishSession() {
    setPhase("finished");
    setStatus("finished");
    setSecondsLeft(0);
    beep(720);

    if (savedSessionRef.current) return;
    savedSessionRef.current = true;

    if (!user) {
      setSessionMessage("Sesion completada. Inicia sesion para guardar metricas fisicas.");
      return;
    }

    const totalDuration = calculateTotalDuration(routine);
    const primaryPayload = {
      user_id: user.id,
      module: "referee_preparation",
      mode: "physical_training",
      clip_title: routine.name,
      workout_name: routine.name,
      topic: "Preparacion fisica",
      score: null,
      total_duration: totalDuration,
      time_spent_seconds: totalDuration,
      completed_rounds: totalRounds,
      total_rounds: totalRounds,
      completed: true,
      feedback: `Sesion completada: ${routine.name}`,
      created_at: new Date().toISOString(),
    };

    const fallbackPayload = {
      user_id: user.id,
      clip_title: routine.name,
      foul: null,
      restart: null,
      discipline: null,
      var_review: null,
      score: null,
      topic: "Preparacion fisica",
      difficulty: "physical_training",
      technical_correct: null,
      restart_correct: null,
      discipline_correct: null,
      var_correct: null,
    };

    const result = await insertAttemptSafely(supabase, primaryPayload, fallbackPayload);
    setSessionMessage(
      result.saved
        ? "Sesion fisica registrada para futuras metricas de Preparacion del arbitro."
        : "Sesion completada. Registro de sesiones en construccion hasta habilitar campos fisicos en Supabase."
    );
  }

  function startTimer() {
    if (status === "paused") {
      setStatus("running");
      return;
    }

    savedSessionRef.current = false;
    setSessionMessage(null);
    setRound(1);
    setSeries(1);
    setPhase("preparation");
    setSecondsLeft(routine.preparation);
    setStatus("running");
    beep(520);
  }

  function pauseTimer() {
    setStatus("paused");
  }

  function resetTimer(nextRoutine = routine) {
    setStatus("idle");
    setPhase("idle");
    setRound(1);
    setSeries(1);
    setSecondsLeft(nextRoutine.preparation);
    setSessionMessage(null);
    savedSessionRef.current = false;
  }

  function advancePhase() {
    if (phase === "preparation") {
      setPhase("work");
      setSecondsLeft(routine.work);
      beep(660);
      return;
    }

    if (phase === "work") {
      if (round >= routine.rounds) {
        if (series >= routine.series) {
          void finishSession();
          return;
        }

        setPhase("series_rest");
        setSecondsLeft(routine.seriesRest);
        beep(420);
        return;
      }

      setPhase("rest");
      setSecondsLeft(routine.rest);
      beep(420);
      return;
    }

    if (phase === "rest") {
      setRound((current) => current + 1);
      setPhase("work");
      setSecondsLeft(routine.work);
      beep(660);
      return;
    }

    if (phase === "series_rest") {
      setSeries((current) => current + 1);
      setRound(1);
      setPhase("work");
      setSecondsLeft(routine.work);
      beep(660);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Preparacion del arbitro
            </p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Entrenamiento fisico</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Rutinas orientativas para resistencia intermitente, velocidad, RSA, CODA,
              intervalos arbitrales, recuperacion activa, core y prevencion.
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100 lg:max-w-[360px]">
            <div className="mb-2 flex items-center gap-2 font-black">
              <ShieldAlert size={18} /> Contenido orientativo
            </div>
            No reemplaza la planificacion de un preparador fisico ni indicaciones medicas.
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-3">
          {routines.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-[24px] border p-4 text-left transition ${
                item.id === routine.id
                  ? "border-[#6fc11f] bg-[#6fc11f]/15 shadow-[0_0_28px_rgba(111,193,31,0.18)]"
                  : "border-white/10 bg-[#101b24] hover:border-[#6fc11f]/35"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">
                    {item.tag}
                  </p>
                  <h2 className="mt-2 text-lg font-black text-white">{item.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.objective}</p>
                </div>
                <Dumbbell className="shrink-0 text-[#6fc11f]" />
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Rutina activa</p>
              <h2 className="mt-3 text-3xl font-black">{routine.name}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{routine.objective}</p>
            </div>
            <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">
              {phaseLabels[phase]}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <TimerMetric label="Preparacion" value={`${routine.preparation}s`} />
            <TimerMetric label="Trabajo" value={`${routine.work}s`} />
            <TimerMetric label="Pausa" value={`${routine.rest}s`} />
            <TimerMetric label="Rondas" value={`${routine.rounds}`} />
            <TimerMetric label="Series" value={`${routine.series}`} />
            <TimerMetric label="Descanso bloque" value={`${routine.seriesRest}s`} />
          </div>

          <div className="mt-6 rounded-[30px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-6 text-center">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-[#6fc11f]">{phaseLabels[phase]}</p>
            <p className="mt-3 text-7xl font-black leading-none text-white sm:text-8xl">
              {formatClock(secondsLeft)}
            </p>
            <p className="mt-4 text-sm text-zinc-300">
              Serie {series}/{routine.series} - Ronda {round}/{routine.rounds}
            </p>
            <p className="mt-2 text-lg font-black text-[#6fc11f]">{activeExercise}</p>

            <div className="mt-6 h-3 overflow-hidden rounded-full bg-black/30">
              <div className="h-full rounded-full bg-[#6fc11f]" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">Progreso total: {progress}%</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button
              onClick={startTimer}
              disabled={status === "running"}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-45"
            >
              <Play size={20} /> {status === "paused" ? "Reanudar" : "Iniciar"}
            </button>
            <button
              onClick={pauseTimer}
              disabled={status !== "running"}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-black text-white transition hover:bg-white/10 disabled:opacity-45"
            >
              <Pause size={20} /> Pausar
            </button>
            <button
              onClick={() => resetTimer()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-black text-white transition hover:bg-white/10"
            >
              <RotateCcw size={20} /> Reiniciar
            </button>
          </div>

          {sessionMessage && (
            <div className="mt-5 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
              {sessionMessage}
            </div>
          )}

          {routine.note && (
            <p className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
              {routine.note}
            </p>
          )}

          <div className="mt-6 rounded-[26px] border border-white/10 bg-[#101b24] p-5">
            <p className="text-sm font-black text-[#6fc11f]">Ejercicios sugeridos</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {routine.exercises.map((exercise) => (
                <div key={exercise} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-zinc-300">
                  {exercise}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <FutureMetric title="Sesiones fisicas" text="Rutinas completadas y minutos entrenados." />
        <FutureMetric title="Carga percibida" text="RPE, fatiga, recuperacion y cumplimiento semanal." />
        <FutureMetric title="Estado pre-partido" text="Foco, confianza, ansiedad, descanso e hidratacion." />
      </section>
    </div>
  );
}

function TimerMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function FutureMetric({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-[#101b24] p-5">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
        <Activity size={24} />
      </div>
      <h3 className="mt-4 font-black text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-yellow-200">Metricas en construccion</p>
    </article>
  );
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calculateTotalDuration(routine: WorkoutRoutine) {
  const workRest = routine.series * routine.rounds * routine.work;
  const roundRest = routine.series * Math.max(0, routine.rounds - 1) * routine.rest;
  const betweenSeries = Math.max(0, routine.series - 1) * routine.seriesRest;
  return routine.preparation + workRest + roundRest + betweenSeries;
}

function beep(frequency: number) {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
  } catch {
    // El sonido es opcional; si el navegador lo bloquea, el timer sigue funcionando.
  }
}

