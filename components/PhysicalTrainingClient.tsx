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
type Phase = "idle" | "preparation" | "work" | "rest" | "finished";
type TimerStatus = "idle" | "running" | "paused" | "finished";

type PrepModule = {
  title: string;
  description: string;
  status: "Disponible" | "En construccion" | "Proximamente";
  icon: IconType;
};

type ConstructionRoutine = {
  title: string;
  description: string;
  tag: string;
  icon: IconType;
};

const prepModules: PrepModule[] = [
  { title: "Entrenamiento fisico", description: "Tabata libre funcional y rutinas arbitrales preparadas para crecer.", status: "Disponible", icon: Dumbbell },
  { title: "Preparacion pre-partido", description: "Checklist previo, visualizacion, llegada, entrada en calor y foco operativo.", status: "En construccion", icon: CalendarCheck },
  { title: "Nutricion y recuperacion", description: "Hidratacion, descanso, retorno a la calma y habitos de recuperacion.", status: "Proximamente", icon: HeartPulse },
  { title: "Psicologia arbitral", description: "Manejo de presion, confianza, tolerancia al error y control emocional.", status: "En construccion", icon: Brain },
  { title: "Comunicacion y liderazgo", description: "Autoridad, lenguaje corporal, protestas y control de cuerpos tecnicos.", status: "En construccion", icon: Users },
  { title: "Manejo de conflictos", description: "Escaladas, protesta colectiva, limites y comunicacion preventiva.", status: "Proximamente", icon: MessageCircle },
  { title: "Lectura y posicionamiento", description: "Angulos, proximidad, diagonal, transiciones y lectura tactica.", status: "Proximamente", icon: Route },
  { title: "Preparacion mental / foco", description: "Rutinas de concentracion, respiracion, activacion y reset durante el partido.", status: "En construccion", icon: Target },
  { title: "Carrera arbitral", description: "Objetivos, desarrollo profesional, etica, informes y plan de crecimiento.", status: "Proximamente", icon: Briefcase },
];

const constructionRoutines: ConstructionRoutine[] = [
  { title: "Intermitentes 75 m - 15/15", description: "Formato arbitral de carrera y recuperacion corta. Queda preparado como rutina futura.", tag: "75 m", icon: Activity },
  { title: "Intermitentes 75 m - 15/18", description: "Base intermitente con recuperacion moderada segun categoria y plan fisico.", tag: "75 m", icon: Activity },
  { title: "Intermitentes 75 m - 15/20", description: "Trabajo preparatorio con recuperacion mas amplia para cargas progresivas.", tag: "75 m", icon: Activity },
  { title: "Preparacion Yo-Yo Test", description: "Resistencia intermitente y cambios de direccion sin reemplazar el audio oficial.", tag: "Yo-Yo", icon: Timer },
  { title: "La estrella progresiva", description: "Drill de aceleracion, frenado, giro y aumento de velocidad por bloques.", tag: "Agilidad", icon: Route },
  { title: "RSA - sprints repetidos", description: "Capacidad de repetir sprints con recuperacion incompleta.", tag: "Velocidad", icon: Zap },
  { title: "CODA - cambios de direccion", description: "Aceleracion, frenado, giro y desplazamientos laterales.", tag: "CODA", icon: Route },
  { title: "Movilidad y recuperacion", description: "Retorno a la calma, movilidad y prevencion de molestias.", tag: "Recovery", icon: HeartPulse },
];

const phaseLabels: Record<Phase, string> = {
  idle: "Listo",
  preparation: "Preparacion",
  work: "Ejercicio",
  rest: "Pausa",
  finished: "Finalizado",
};

const defaultConfig = {
  preparation: 30,
  work: 20,
  rest: 10,
  sets: 8,
};

export function PhysicalTrainingClient() {
  const { user } = useUser();
  const [preparation, setPreparation] = useState(defaultConfig.preparation);
  const [work, setWork] = useState(defaultConfig.work);
  const [rest, setRest] = useState(defaultConfig.rest);
  const [sets, setSets] = useState(defaultConfig.sets);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TimerStatus>("idle");
  const [secondsLeft, setSecondsLeft] = useState(defaultConfig.preparation);
  const [currentSet, setCurrentSet] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const savedSessionRef = useRef(false);

  const safePreparation = clampSeconds(preparation, 1, 600);
  const safeWork = clampSeconds(work, 1, 600);
  const safeRest = clampSeconds(rest, 0, 600);
  const safeSets = clampSeconds(sets, 1, 99);
  const activeDuration = getActiveDuration(phase, safePreparation, safeWork, safeRest);
  const progress = getProgress(phase, currentSet, safeSets, secondsLeft, activeDuration);

  useEffect(() => {
    if (status === "idle") setSecondsLeft(safePreparation);
  }, [safePreparation, status]);

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
  }, [status, phase, currentSet, safePreparation, safeWork, safeRest, safeSets, soundEnabled]);

  function updateNumber(value: string, setter: (value: number) => void, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const next = clampSeconds(parsed, min, max);
    setter(next);
  }

  function startTimer() {
    if (status === "paused") {
      setStatus("running");
      playWhistle(soundEnabled);
      return;
    }

    savedSessionRef.current = false;
    setSessionMessage(null);
    setCurrentSet(1);
    setPhase("preparation");
    setSecondsLeft(safePreparation);
    setStatus("running");
    playWhistle(soundEnabled);
  }

  function pauseTimer() {
    setStatus("paused");
  }

  function resetTimer() {
    setStatus("idle");
    setPhase("idle");
    setCurrentSet(1);
    setSecondsLeft(safePreparation);
    setSessionMessage(null);
    savedSessionRef.current = false;
  }

  function advancePhase() {
    if (phase === "preparation") {
      setPhase("work");
      setSecondsLeft(safeWork);
      playWhistle(soundEnabled);
      return;
    }

    if (phase === "work") {
      playWhistle(soundEnabled);

      if (currentSet >= safeSets) {
        void finishSession();
        return;
      }

      if (safeRest <= 0) {
        setCurrentSet((value) => value + 1);
        setPhase("work");
        setSecondsLeft(safeWork);
        playWhistle(soundEnabled);
        return;
      }

      setPhase("rest");
      setSecondsLeft(safeRest);
      return;
    }

    if (phase === "rest") {
      setCurrentSet((value) => value + 1);
      setPhase("work");
      setSecondsLeft(safeWork);
      playWhistle(soundEnabled);
    }
  }

  async function finishSession() {
    setPhase("finished");
    setStatus("finished");
    setSecondsLeft(0);
    playWhistle(soundEnabled);

    if (savedSessionRef.current) return;
    savedSessionRef.current = true;

    if (!user) {
      setSessionMessage("Rutina completada. Inicia sesion para guardar metricas fisicas.");
      return;
    }

    const totalDuration = safePreparation + safeSets * safeWork + Math.max(0, safeSets - 1) * safeRest;
    const primaryPayload = {
      user_id: user.id,
      module: "referee_preparation",
      mode: "physical_training",
      clip_title: "Tabata arbitral libre",
      workout_name: "Tabata arbitral libre",
      topic: "Preparacion fisica",
      score: null,
      total_duration: totalDuration,
      time_spent_seconds: totalDuration,
      completed_rounds: safeSets,
      total_rounds: safeSets,
      completed: true,
      feedback: `Rutina completada: Tabata arbitral libre (${safeSets} sets)`,
      created_at: new Date().toISOString(),
    };

    const fallbackPayload = {
      user_id: user.id,
      clip_title: "Tabata arbitral libre",
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
        ? "Tabata registrado para futuras metricas de Preparacion del arbitro."
        : "Rutina completada. Registro de sesiones en construccion hasta habilitar campos fisicos en Supabase."
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Preparacion del arbitro</p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Preparacion integral</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Un espacio para preparar al arbitro de forma fisica, mental, comunicacional y profesional. Hoy queda funcional el Tabata libre; el resto se muestra como estructura futura.
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
            <h2 className="mt-3 text-3xl font-black">Tabata arbitral libre</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Configura preparacion, ejercicio, pausa y sets. Los silbatos marcan inicio, cambio de fase y final para entrenar sin mirar la pantalla todo el tiempo.
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

        <div className="mt-6 grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <article className="rounded-[28px] border border-[#6fc11f]/35 bg-[#6fc11f]/10 p-5 shadow-[0_0_28px_rgba(111,193,31,0.14)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">Funcional</p>
                  <h3 className="mt-2 text-2xl font-black text-white">Tabata arbitral libre</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">Rutina editable para bloques cortos de intensidad, reaccion, desplazamientos y tolerancia al esfuerzo intermitente.</p>
                </div>
                <Zap className="shrink-0 text-[#6fc11f]" />
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {constructionRoutines.map((routine) => (
                <ConstructionRoutineCard key={routine.title} routine={routine} />
              ))}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#050b12] p-4 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">Rutina activa</p>
                <h3 className="mt-3 text-3xl font-black">Tabata arbitral libre</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Ajusta los tiempos antes de iniciar. Los valores se mantienen claros y tactiles para mobile.</p>
              </div>
              <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">{phaseLabels[phase]}</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberControl label="Preparacion" value={preparation} min={1} max={600} suffix="s" onChange={(value) => updateNumber(value, setPreparation, 1, 600)} disabled={status === "running" || status === "paused"} />
              <NumberControl label="Ejercicio" value={work} min={1} max={600} suffix="s" onChange={(value) => updateNumber(value, setWork, 1, 600)} disabled={status === "running" || status === "paused"} />
              <NumberControl label="Pausa" value={rest} min={0} max={600} suffix="s" onChange={(value) => updateNumber(value, setRest, 0, 600)} disabled={status === "running" || status === "paused"} />
              <NumberControl label="Sets" value={sets} min={1} max={99} suffix="" onChange={(value) => updateNumber(value, setSets, 1, 99)} disabled={status === "running" || status === "paused"} />
            </div>

            <div className="mt-6 rounded-[30px] border border-[#6fc11f]/20 bg-[#6fc11f]/10 p-5 text-center sm:p-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-[#6fc11f]">{phaseLabels[phase]}</p>
              <p className="mt-3 text-6xl font-black leading-none text-white sm:text-8xl">{formatClock(secondsLeft)}</p>
              <p className="mt-4 text-sm text-zinc-300">Set {Math.min(currentSet, safeSets)}/{safeSets}</p>
              <p className="mt-2 text-lg font-black text-[#6fc11f]">{phase === "work" ? "Ejercicio activo" : phase === "rest" ? "Recuperacion" : phaseLabels[phase]}</p>

              <div className="mt-6 h-3 overflow-hidden rounded-full bg-black/30">
                <div className="h-full rounded-full bg-[#6fc11f] transition-all" style={{ width: `${progress}%` }} />
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
              <button onClick={resetTimer} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-5 font-black text-white transition hover:bg-white/10">
                <RotateCcw size={20} /> Reiniciar
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-300">
              <p className="font-black text-white">Silbatos de transicion</p>
              <p className="mt-1">Silbato fuerte al iniciar, al terminar cada ejercicio, al volver de la pausa y al finalizar toda la rutina.</p>
            </div>

            {sessionMessage && <div className="mt-5 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">{sessionMessage}</div>}
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

function ConstructionRoutineCard({ routine }: { routine: ConstructionRoutine }) {
  const Icon = routine.icon;
  return (
    <article className="rounded-[24px] border border-white/10 bg-[#101b24] p-4 opacity-90">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]"><Icon size={20} /></div>
        <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-200">En construccion</span>
      </div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-[#6fc11f]">{routine.tag}</p>
      <h3 className="mt-2 font-black text-white">{routine.title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{routine.description}</p>
    </article>
  );
}

function NumberControl({ label, value, onChange, suffix, min, max, disabled }: { label: string; value: number; onChange: (value: string) => void; suffix: string; min: number; max: number; disabled: boolean }) {
  return (
    <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[#0b111b] px-3 py-3 text-lg font-black text-white outline-none disabled:opacity-55"
        />
        {suffix && <span className="text-sm font-black text-[#6fc11f]">{suffix}</span>}
      </div>
    </label>
  );
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clampSeconds(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getActiveDuration(phase: Phase, preparation: number, work: number, rest: number) {
  if (phase === "preparation") return preparation;
  if (phase === "work") return work;
  if (phase === "rest") return Math.max(rest, 1);
  return 1;
}

function getProgress(phase: Phase, currentSet: number, sets: number, secondsLeft: number, activeDuration: number) {
  if (phase === "finished") return 100;
  if (phase === "idle" || phase === "preparation") return 0;
  const completedSets = phase === "rest" ? currentSet : currentSet - 1;
  const phaseFraction = phase === "work" ? (activeDuration - secondsLeft) / activeDuration : phase === "rest" ? 1 : 0;
  return Math.max(0, Math.min(100, Math.round(((completedSets + phaseFraction) / sets) * 100)));
}

function playWhistle(enabled: boolean) {
  if (!enabled || typeof window === "undefined") return;

  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillatorA = context.createOscillator();
    const oscillatorB = context.createOscillator();
    const now = context.currentTime;

    oscillatorA.type = "square";
    oscillatorB.type = "sawtooth";
    oscillatorA.frequency.setValueAtTime(1480, now);
    oscillatorB.frequency.setValueAtTime(1860, now);
    oscillatorA.frequency.exponentialRampToValueAtTime(1720, now + 0.18);
    oscillatorB.frequency.exponentialRampToValueAtTime(2100, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    gain.gain.setValueAtTime(0.22, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);

    oscillatorA.connect(gain);
    oscillatorB.connect(gain);
    gain.connect(context.destination);
    oscillatorA.start(now);
    oscillatorB.start(now);
    oscillatorA.stop(now + 0.8);
    oscillatorB.stop(now + 0.8);
    window.setTimeout(() => void context.close(), 900);
  } catch {
    // El sonido es opcional. Si el navegador lo bloquea, el timer sigue funcionando.
  }
}