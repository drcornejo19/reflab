"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  Brain,
  Briefcase,
  CalendarCheck,
  Dumbbell,
  HeartPulse,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Route,
  ShieldAlert,
  Target,
  Timer,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { insertAttemptSafely } from "@/lib/attemptPersistence";
import { supabase } from "@/lib/supabase";

type IconType = ComponentType<{ size?: number; className?: string }>;
type Phase = "idle" | "preparation" | "work" | "rest" | "series_rest" | "finished";
type TimerStatus = "idle" | "running" | "paused" | "finished";

type PrepModule = {
  title: string;
  description: string;
  status: "Disponible" | "En construccion" | "Proximamente";
  icon: IconType;
};

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
  intensity: string;
  distance?: string;
  exercises: string[];
  note?: string;
};

const prepModules: PrepModule[] = [
  { title: "Entrenamiento fisico", description: "Intermitentes, velocidad, RSA, CODA, Tabata y recuperacion activa.", status: "Disponible", icon: Dumbbell },
  { title: "Preparacion pre-partido", description: "Checklist previo, visualizacion, llegada, entrada en calor y foco operativo.", status: "En construccion", icon: CalendarCheck },
  { title: "Nutricion y recuperacion", description: "Hidratacion, descanso, retorno a la calma y habitos de recuperacion.", status: "Proximamente", icon: HeartPulse },
  { title: "Psicologia arbitral", description: "Manejo de presion, confianza, tolerancia al error y control emocional.", status: "En construccion", icon: Brain },
  { title: "Comunicacion y liderazgo", description: "Autoridad, lenguaje corporal, protestas y control de cuerpos tecnicos.", status: "En construccion", icon: Users },
  { title: "Manejo de conflictos", description: "Escaladas, protesta colectiva, limites y comunicacion preventiva.", status: "Proximamente", icon: MessageCircle },
  { title: "Lectura y posicionamiento", description: "Angulos, proximidad, diagonal, transiciones y lectura tactica.", status: "Proximamente", icon: Route },
  { title: "Preparacion mental / foco", description: "Rutinas de concentracion, respiracion, activacion y reset durante el partido.", status: "En construccion", icon: Target },
  { title: "Carrera arbitral", description: "Objetivos, desarrollo profesional, etica, informes y plan de crecimiento.", status: "Proximamente", icon: Briefcase },
];

const routines: WorkoutRoutine[] = [
  {
    id: "tabata-referee",
    name: "Tabata arbitral",
    objective: "Mejorar tolerancia al esfuerzo intermitente con acciones cortas de alta intensidad.",
    preparation: 30,
    work: 20,
    rest: 10,
    rounds: 8,
    series: 1,
    seriesRest: 60,
    tag: "Tabata",
    intensity: "Alta",
    exercises: ["Skipping", "Cambios de direccion", "Desplazamiento lateral", "Sprint corto", "Plancha dinamica", "Aceleracion 5-10 m", "Backpedal", "Recuperacion activa"],
  },
  {
    id: "75-15-15",
    name: "Intermitentes 75 m - 15/15",
    objective: "Preparar carreras de 75 m con recuperacion corta, formato exigente de referencia arbitral.",
    preparation: 60,
    work: 15,
    rest: 15,
    rounds: 20,
    series: 1,
    seriesRest: 120,
    tag: "75 m",
    intensity: "Muy alta",
    distance: "75 m carrera + recuperacion caminando",
    note: "Usar como trabajo preparatorio. Ajustar volumen segun categoria, edad, sexo y plan del preparador fisico.",
    exercises: ["75 m carrera", "25 m caminata", "Control de ritmo", "Respiracion"],
  },
  {
    id: "75-15-18",
    name: "Intermitentes 75 m - 15/18",
    objective: "Trabajar resistencia intermitente con recuperacion moderada entre esfuerzos.",
    preparation: 60,
    work: 15,
    rest: 18,
    rounds: 20,
    series: 1,
    seriesRest: 120,
    tag: "75 m",
    intensity: "Alta",
    distance: "75 m carrera + 25 m caminata",
    exercises: ["75 m carrera", "Caminata tecnica", "Postura", "Recuperacion nasal"],
  },
  {
    id: "75-15-20",
    name: "Intermitentes 75 m - 15/20",
    objective: "Base de preparacion pre test con recuperacion mas amplia.",
    preparation: 60,
    work: 15,
    rest: 20,
    rounds: 20,
    series: 1,
    seriesRest: 120,
    tag: "75 m",
    intensity: "Media/alta",
    distance: "75 m carrera + 25 m caminata",
    exercises: ["75 m carrera", "Caminata activa", "Ritmo constante", "Tecnica de carrera"],
  },
  {
    id: "yo-yo-prep",
    name: "Preparacion Yo-Yo Test",
    objective: "Estimular resistencia intermitente y recuperacion entre cambios de direccion.",
    preparation: 60,
    work: 40,
    rest: 20,
    rounds: 10,
    series: 2,
    seriesRest: 120,
    tag: "Yo-Yo",
    intensity: "Progresiva",
    note: "No reemplaza el audio oficial del Yo-Yo test. Es una rutina de preparacion.",
    exercises: ["Ida y vuelta", "Recuperacion caminando", "Giro controlado", "Cambio de ritmo"],
  },
  {
    id: "star-drill",
    name: "La estrella progresiva",
    objective: "Acelerar, frenar, girar y volver al centro aumentando velocidad por bloques.",
    preparation: 45,
    work: 20,
    rest: 20,
    rounds: 10,
    series: 2,
    seriesRest: 120,
    tag: "Agilidad",
    intensity: "Progresiva",
    exercises: ["Centro a cono 1", "Centro a cono 2", "Centro a cono 3", "Centro a cono 4", "Aumento de velocidad"],
  },
  {
    id: "rsa",
    name: "RSA - sprints repetidos",
    objective: "Entrenar la capacidad de repetir sprints con recuperacion incompleta.",
    preparation: 60,
    work: 8,
    rest: 40,
    rounds: 6,
    series: 2,
    seriesRest: 180,
    tag: "Velocidad",
    intensity: "Maxima",
    distance: "6 a 8 segundos de sprint",
    exercises: ["Sprint 6-8 s", "Vuelta caminando", "Salida reactiva", "Freno controlado"],
  },
  {
    id: "coda",
    name: "CODA - cambios de direccion",
    objective: "Mejorar aceleracion, frenado, giro y desplazamientos laterales.",
    preparation: 45,
    work: 15,
    rest: 30,
    rounds: 8,
    series: 2,
    seriesRest: 120,
    tag: "CODA",
    intensity: "Alta",
    exercises: ["Aceleracion", "Lateral izquierdo", "Lateral derecho", "Freno", "Retorno"],
  },
  {
    id: "mobility-recovery",
    name: "Movilidad y recuperacion",
    objective: "Bajar carga, recuperar movilidad y prevenir molestias despues de alta intensidad.",
    preparation: 20,
    work: 40,
    rest: 15,
    rounds: 8,
    series: 1,
    seriesRest: 60,
    tag: "Recuperacion",
    intensity: "Baja",
    exercises: ["Movilidad de cadera", "Isquios", "Gemelos", "Gluteos", "Respiracion", "Core suave"],
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const savedSessionRef = useRef(false);

  const routine = routines.find((item) => item.id === selectedId) ?? routines[0];
  const totalRounds = routine.rounds * routine.series;
  const completedRounds = Math.min(totalRounds, (series - 1) * routine.rounds + (phase === "work" ? round - 1 : round));
  const progress = Math.round((completedRounds / totalRounds) * 100);
  const activeExercise = routine.exercises[(round - 1) % routine.exercises.length];

  useEffect(() => {
    resetTimer(routine);
  }, [routine.id]);

  useEffect(() => {
    if (status !== "running") return;

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current === 10) playCue("pip", soundEnabled);
        if (current === 5) playCue("double", soundEnabled);
        if (current === 1) playCue("finish", soundEnabled);

        if (current > 1) return current - 1;
        advancePhase();
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, phase, round, series, routine, soundEnabled]);

  async function finishSession() {
    setPhase("finished");
    setStatus("finished");
    setSecondsLeft(0);

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
      playCue("start", soundEnabled);
      return;
    }

    savedSessionRef.current = false;
    setSessionMessage(null);
    setRound(1);
    setSeries(1);
    setPhase("preparation");
    setSecondsLeft(routine.preparation);
    setStatus("running");
    playCue("start", soundEnabled);
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
      playCue("start", soundEnabled);
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
        playCue("start", soundEnabled);
        return;
      }

      setPhase("rest");
      setSecondsLeft(routine.rest);
      playCue("start", soundEnabled);
      return;
    }

    if (phase === "rest") {
      setRound((current) => current + 1);
      setPhase("work");
      setSecondsLeft(routine.work);
      playCue("start", soundEnabled);
      return;
    }

    if (phase === "series_rest") {
      setSeries((current) => current + 1);
      setRound(1);
      setPhase("work");
      setSecondsLeft(routine.work);
      playCue("start", soundEnabled);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Preparacion del arbitro</p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Preparacion integral</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Un espacio para preparar al arbitro de forma fisica, mental, comunicacional y profesional. Lo disponible funciona; lo futuro queda armado sin pantallas vacias.
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
            <div className="mb-2 flex items-center gap-2 font-black"><ShieldAlert size={18} /> Contenido orientativo</div>
            No reemplaza la planificacion de un preparador fisico ni indicaciones medicas.
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {prepModules.map((module) => (
          <PreparationModuleCard key={module.title} module={module} />
        ))}
      </section>

      <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Modulo disponible</p>
            <h2 className="mt-3 text-3xl font-black">Entrenamiento fisico</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Rutinas inspiradas en demandas reales del arbitraje: intermitentes 75 m, Yo-Yo, RSA, CODA, cambios de direccion y movilidad.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled((value) => !value)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white transition hover:bg-white/10"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            Sonido {soundEnabled ? "activo" : "apagado"}
          </button>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
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
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">{item.tag} - {item.intensity}</p>
                    <h3 className="mt-2 text-lg font-black text-white">{item.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{item.objective}</p>
                    {item.distance && <p className="mt-2 text-xs font-bold text-zinc-500">{item.distance}</p>}
                  </div>
                  <Zap className="shrink-0 text-[#6fc11f]" />
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#050b12] p-4 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">Rutina activa</p>
                <h3 className="mt-3 text-3xl font-black">{routine.name}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{routine.objective}</p>
              </div>
              <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">{phaseLabels[phase]}</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <TimerMetric label="Preparacion" value={`${routine.preparation}s`} />
              <TimerMetric label="Trabajo" value={`${routine.work}s`} />
              <TimerMetric label="Pausa" value={`${routine.rest}s`} />
              <TimerMetric label="Rondas" value={`${routine.rounds}`} />
              <TimerMetric label="Series" value={`${routine.series}`} />
              <TimerMetric label="Descanso" value={`${routine.seriesRest}s`} />
            </div>

            <div className="mt-6 rounded-[30px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-5 text-center sm:p-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-[#6fc11f]">{phaseLabels[phase]}</p>
              <p className="mt-3 text-6xl font-black leading-none text-white sm:text-8xl">{formatClock(secondsLeft)}</p>
              <p className="mt-4 text-sm text-zinc-300">Serie {series}/{routine.series} - Ronda {round}/{routine.rounds}</p>
              <p className="mt-2 text-lg font-black text-[#6fc11f]">{activeExercise}</p>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full bg-[#6fc11f]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-zinc-400">Progreso total: {progress}%</p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <button onClick={startTimer} disabled={status === "running"} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-45">
                <Play size={20} /> {status === "paused" ? "Reanudar" : "Iniciar"}
              </button>
              <button onClick={pauseTimer} disabled={status !== "running"} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-black text-white transition hover:bg-white/10 disabled:opacity-45">
                <Pause size={20} /> Pausar
              </button>
              <button onClick={() => resetTimer()} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-black text-white transition hover:bg-white/10">
                <RotateCcw size={20} /> Reiniciar
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-300">
              <p className="font-black text-white">Senales sonoras</p>
              <p className="mt-1">Pitido fuerte al iniciar fase, pip corto a 10 segundos, doble pip a 5 segundos y pitazo al terminar cada bloque.</p>
            </div>

            {sessionMessage && <div className="mt-5 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">{sessionMessage}</div>}
            {routine.note && <p className="mt-5 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">{routine.note}</p>}

            <div className="mt-6 rounded-[26px] border border-white/10 bg-[#101b24] p-5">
              <p className="text-sm font-black text-[#6fc11f]">Ejercicios sugeridos</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {routine.exercises.map((exercise) => <div key={exercise} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-zinc-300">{exercise}</div>)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function PreparationModuleCard({ module }: { module: PrepModule }) {
  const Icon = module.icon;
  const available = module.status === "Disponible";
  return (
    <article className={`rounded-[28px] border p-5 shadow-2xl ${available ? "border-[#6fc11f]/30 bg-[#6fc11f]/10" : "border-white/10 bg-[#101b24]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]"><Icon size={24} /></div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${available ? "border-[#6fc11f]/30 bg-[#6fc11f] text-black" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-200"}`}>{module.status}</span>
      </div>
      <h3 className="mt-4 text-lg font-black text-white">{module.title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{module.description}</p>
    </article>
  );
}

function TimerMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-black text-white">{value}</p></div>;
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

function playCue(type: "start" | "pip" | "double" | "finish", enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;
  if (type === "double") {
    beep(900, 0.07, 0.08);
    window.setTimeout(() => beep(900, 0.07, 0.08), 180);
    return;
  }
  if (type === "pip") return beep(840, 0.08, 0.07);
  if (type === "finish") return beep(420, 0.22, 0.14);
  return beep(680, 0.18, 0.12);
}

function beep(frequency: number, duration: number, volume: number) {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch {
    // El sonido es opcional. Si el navegador lo bloquea, el timer sigue funcionando.
  }
}