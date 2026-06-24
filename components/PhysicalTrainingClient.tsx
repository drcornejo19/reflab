"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Brain,
  Briefcase,
  CalendarCheck,
  Dumbbell,
  HeartPulse,
  Lock,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  Target,
  Timer,
  Unlock,
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
  href?: string;
};

type TabataPresetKey = "yoyo" | "intermittent_40x75" | "sprint" | "resistance" | "recovery" | "custom";
type TabataPreset = {
  key: TabataPresetKey;
  title: string;
  description: string;
  preparation: number;
  work: number;
  rest: number;
  sets: number;
};

const prepModules: PrepModule[] = [
  { title: "Preparacion integral", description: "Bienestar, rutina previa, habitos y control diario del arbitro.", status: "Disponible", icon: Target },
  { title: "Preparacion fisica", description: "Tabata arbitral configurable con presets de trabajo especifico.", status: "Disponible", icon: Dumbbell },
  { title: "Nutricion y recuperacion", description: "Hidratacion, descanso, retorno a la calma y habitos de recuperacion.", status: "Proximamente", icon: HeartPulse },
  { title: "Psicologia arbitral", description: "Modulitos internos de error, presion, foco, confianza, resiliencia y cierre mental.", status: "Disponible", icon: Brain, href: "/training/psychology" },
  { title: "Planificacion arbitral", description: "Partidos, descanso, carga semanal y objetivos de preparacion.", status: "Proximamente", icon: CalendarCheck },
  { title: "Etica y deontologia", description: "Habitos profesionales, responsabilidad, informes y conducta arbitral.", status: "Proximamente", icon: Briefcase },
];

const tabataPresets: TabataPreset[] = [
  { key: "yoyo", title: "Yo-Yo", description: "Estimulo intermitente orientativo para preparar tolerancia al cambio de ritmo.", preparation: 60, work: 40, rest: 20, sets: 10 },
  { key: "intermittent_40x75", title: "Intermitencia 40x75", description: "Bloques 15/15 como base ajustable para trabajos arbitrales de 75 m.", preparation: 60, work: 15, rest: 15, sets: 16 },
  { key: "sprint", title: "Sprint", description: "Sprints cortos con recuperacion suficiente para repetir calidad.", preparation: 45, work: 8, rest: 40, sets: 8 },
  { key: "resistance", title: "Resistencia", description: "Trabajo intermitente mas largo para sostener ritmo y recuperacion.", preparation: 45, work: 45, rest: 20, sets: 8 },
  { key: "recovery", title: "Recuperacion", description: "Movilidad suave, retorno a la calma y descarga activa.", preparation: 30, work: 30, rest: 20, sets: 6 },
  { key: "custom", title: "Personalizado", description: "Ajusta manualmente tiempos y sets segun tu plan del dia.", preparation: 30, work: 20, rest: 10, sets: 8 },
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

const tabataCueSrc = "/audio/tabata-arbitral.wav";
const tabataCountdownSrc = "/sounds/beeps-3-seconds.mp3";
const mainCueGain = 2.8;
const countdownGain = 2.6;
const beepGain = 0.72;

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
  const [selectedPreset, setSelectedPreset] = useState<TabataPresetKey>("custom");
  const [screenLocked, setScreenLocked] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const savedSessionRef = useRef(false);
  const playedSoundKeysRef = useRef<Set<string>>(new Set());

  const safePreparation = clampSeconds(preparation, 1, 600);
  const safeWork = clampSeconds(work, 1, 600);
  const safeRest = clampSeconds(rest, 0, 600);
  const safeSets = clampSeconds(sets, 1, 99);
  const activeDuration = getActiveDuration(phase, safePreparation, safeWork, safeRest);
  const progress = getProgress(phase, currentSet, safeSets, secondsLeft, activeDuration);

  const playSoundOnce = useCallback((key: string, play: () => void) => {
    if (playedSoundKeysRef.current.has(key)) return;
    playedSoundKeysRef.current.add(key);
    play();
  }, []);

  function updateNumber(value: string, setter: (value: number) => void, min: number, max: number, onNext?: (next: number) => void) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const next = clampSeconds(parsed, min, max);
    setSelectedPreset("custom");
    setter(next);
    onNext?.(next);
  }

  function applyPreset(preset: TabataPreset) {
    if (status === "running" || status === "paused") return;
    setSelectedPreset(preset.key);
    setPreparation(preset.preparation);
    setWork(preset.work);
    setRest(preset.rest);
    setSets(preset.sets);
    setPhase("idle");
    setCurrentSet(1);
    setSecondsLeft(preset.preparation);
    setSessionMessage(null);
    playedSoundKeysRef.current.clear();
  }

  function startTimer() {
    if (status === "paused") {
      setStatus("running");
      return;
    }

    savedSessionRef.current = false;
    playedSoundKeysRef.current.clear();
    setSessionMessage(null);
    setCurrentSet(1);
    setPhase("preparation");
    setSecondsLeft(safePreparation);
    setStatus("running");
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
    setScreenLocked(false);
    savedSessionRef.current = false;
    playedSoundKeysRef.current.clear();
  }

  const finishSession = useCallback(async () => {
    setPhase("finished");
    setStatus("finished");
    setScreenLocked(false);
    setSecondsLeft(0);
    playSoundOnce(`main:finish:${currentSet}`, () => playTabataCue(soundEnabled));

    if (savedSessionRef.current) return;
    savedSessionRef.current = true;

    if (!user) {
      setSessionMessage("Rutina completada. Inicia sesion para guardar metricas fisicas.");
      return;
    }

    const totalDuration = safePreparation + safeSets * safeWork + Math.max(0, safeSets - 1) * safeRest;
    const preset = tabataPresets.find((item) => item.key === selectedPreset);
    const workoutName = `Tabata arbitral - ${preset?.title ?? "Personalizado"}`;
    const primaryPayload = {
      user_id: user.id,
      module: "referee_preparation",
      mode: "physical_training",
      clip_title: workoutName,
      workout_name: workoutName,
      topic: "Preparacion fisica",
      score: null,
      total_duration: totalDuration,
      time_spent_seconds: totalDuration,
      completed_rounds: safeSets,
      total_rounds: safeSets,
      completed: true,
      feedback: `Rutina completada: ${workoutName} (${safeSets} sets)`,
      created_at: new Date().toISOString(),
    };

    const fallbackPayload = {
      user_id: user.id,
      clip_title: workoutName,
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
        ? "Tabata registrado para futuras metricas de Preparacion Integral."
        : "Rutina completada. Registro de sesiones en construccion hasta habilitar campos fisicos en Supabase."
    );
  }, [currentSet, playSoundOnce, safePreparation, safeRest, safeSets, safeWork, selectedPreset, soundEnabled, user]);

  const advancePhase = useCallback(() => {
    if (phase === "preparation") {
      setPhase("work");
      setSecondsLeft(safeWork);
      playSoundOnce(`main:preparation-to-work:${currentSet}`, () => playTabataCue(soundEnabled));
      return;
    }

    if (phase === "work") {
      if (currentSet >= safeSets) {
        void finishSession();
        return;
      }

      if (safeRest <= 0) {
        setCurrentSet((value) => value + 1);
        setPhase("work");
        setSecondsLeft(safeWork);
        playSoundOnce(`main:work-to-next-work:${currentSet}`, () => playTabataCue(soundEnabled));
        return;
      }

      setPhase("rest");
      setSecondsLeft(safeRest);
      playSoundOnce(`main:work-to-rest:${currentSet}`, () => playTabataCue(soundEnabled));
      return;
    }

    if (phase === "rest") {
      setCurrentSet((value) => value + 1);
      setPhase("work");
      setSecondsLeft(safeWork);
      playSoundOnce(`main:rest-to-work:${currentSet}`, () => playTabataCue(soundEnabled));
    }
  }, [currentSet, finishSession, phase, playSoundOnce, safeRest, safeSets, safeWork, soundEnabled]);

  useEffect(() => {
    if (status !== "running") return;

    if ((phase === "preparation" || phase === "work") && secondsLeft <= 3 && secondsLeft >= 1) {
      playSoundOnce(`countdown:${phase}:${currentSet}:${secondsLeft}`, () => playCountdownCue(soundEnabled));
    }

    if (phase === "rest" && secondsLeft === 10) {
      playSoundOnce(`rest-warning-10:${currentSet}`, () => playBeep(soundEnabled, 1));
    }

    if (phase === "rest" && secondsLeft === 5) {
      playSoundOnce(`rest-warning-5:${currentSet}`, () => playBeep(soundEnabled, 2));
    }
  }, [currentSet, phase, playSoundOnce, secondsLeft, soundEnabled, status]);

  useEffect(() => {
    if (status !== "running") return;

    const interval = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current > 1) {
          return current - 1;
        }
        advancePhase();
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, phase, currentSet, safePreparation, safeWork, safeRest, safeSets, soundEnabled, advancePhase]);

  return (
    <div className="space-y-6">
      {screenLocked && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#02060a]/95 p-5 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[34px] border border-[#6fc11f]/35 bg-[#071019] p-6 text-center shadow-[0_0_48px_rgba(111,193,31,0.2)]">
            <Lock className="mx-auto h-12 w-12 text-[#6fc11f]" />
            <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">Pantalla bloqueada</p>
            <p className="mt-3 text-6xl font-black leading-none text-white">{formatClock(secondsLeft)}</p>
            <p className="mt-3 text-sm font-bold text-zinc-300">
              {phaseLabels[phase]} - Set {Math.min(currentSet, safeSets)}/{safeSets}
            </p>
            <button
              type="button"
              onClick={() => setScreenLocked(false)}
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a]"
            >
              <Unlock size={20} />
              Desbloquear
            </button>
          </div>
        </div>
      )}
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">Preparacion Integral</p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">Preparacion integral</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Un espacio individual para preparar al arbitro desde bienestar, fisico, nutricion, psicologia, planificacion y etica profesional. Hoy el foco operativo es el Tabata arbitral.
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
            <h2 className="mt-3 text-3xl font-black">Tabata arbitral</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Elegi una prueba, ajusta tiempos si hace falta y entrena con silbatos fuertes y alertas de transicion.
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
                  <h3 className="mt-2 text-2xl font-black text-white">Prueba activa</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {tabataPresets.find((preset) => preset.key === selectedPreset)?.description ?? "Ajuste personalizado para tu sesion."}
                  </p>
                </div>
                <Zap className="shrink-0 text-[#6fc11f]" />
              </div>
            </article>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {tabataPresets.map((preset) => {
                const active = selectedPreset === preset.key;
                const locked = status === "running" || status === "paused";
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    disabled={locked}
                    className={`rounded-[24px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? "border-[#6fc11f]/70 bg-[#6fc11f]/15 shadow-[0_0_22px_rgba(111,193,31,0.15)]"
                        : "border-white/10 bg-[#101b24] hover:border-[#6fc11f]/35 hover:bg-[#13212b]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]">
                        <Timer size={20} />
                      </div>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">
                        {preset.work}s / {preset.rest}s
                      </span>
                    </div>
                    <h3 className="mt-3 font-black text-white">{preset.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-[#050b12] p-4 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">Rutina activa</p>
                <h3 className="mt-3 text-3xl font-black">Tabata {tabataPresets.find((preset) => preset.key === selectedPreset)?.title ?? "Personalizado"}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">Ajusta los tiempos antes de iniciar. Los valores se mantienen claros y tactiles para mobile.</p>
              </div>
              <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-2 text-xs font-black text-[#6fc11f]">{phaseLabels[phase]}</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberControl
                label="Preparacion"
                value={preparation}
                min={1}
                max={600}
                suffix="s"
                onChange={(value) => updateNumber(value, setPreparation, 1, 600, (next) => {
                  if (status === "idle") setSecondsLeft(next);
                })}
                disabled={status === "running" || status === "paused"}
              />
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
            <button
              type="button"
              onClick={() => setScreenLocked(true)}
              disabled={status !== "running"}
              className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-5 font-black text-[#6fc11f] transition hover:bg-[#6fc11f]/15 disabled:opacity-45"
            >
              <Lock size={20} />
              Bloquear pantalla
            </button>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-zinc-300">
              <p className="font-black text-white">Audio de transicion</p>
              <p className="mt-1">
                Preparacion y ejercicio reproducen beep en 3, 2 y 1. En descanso se mantienen los avisos de 10 y 5 segundos, y cada cambio de fase dispara el sonido principal fuerte.
              </p>
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
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]"><Icon size={24} /></div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${available ? "border-[#6fc11f]/30 bg-[#6fc11f] text-black" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-200"}`}>{module.status}</span>
      </div>
      <h3 className="mt-4 text-lg font-black text-white">{module.title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{module.description}</p>
    </>
  );

  if (module.href) {
    return (
      <Link
        href={module.href}
        className={`block rounded-[28px] border p-5 shadow-2xl transition hover:border-[#6fc11f]/55 hover:bg-[#6fc11f]/15 ${available ? "border-[#6fc11f]/30 bg-[#6fc11f]/10" : "border-white/10 bg-[#101b24]"}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className={`rounded-[28px] border p-5 shadow-2xl ${available ? "border-[#6fc11f]/30 bg-[#6fc11f]/10" : "border-white/10 bg-[#101b24]"}`}>
      {content}
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

function playTabataCue(enabled: boolean, repetitions = 1) {
  if (!enabled || typeof window === "undefined") return;

  const playOnce = () => playAmplifiedAudio(tabataCueSrc, enabled, mainCueGain);

  playOnce();

  for (let index = 1; index < repetitions; index += 1) {
    window.setTimeout(playOnce, index * 1900);
  }
}

function playCountdownCue(enabled: boolean) {
  playAmplifiedAudio(tabataCountdownSrc, enabled, countdownGain, 0.45);
}

function playAmplifiedAudio(src: string, enabled: boolean, gainValue: number, maxDurationSeconds?: number) {
  if (!enabled || typeof window === "undefined") return;

  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.volume = 1;
    audio.currentTime = 0;

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      void audio.play().catch(() => undefined);
      return;
    }

    const context = new AudioContextClass();
    const source = context.createMediaElementSource(audio);
    const gain = context.createGain();
    const compressor = context.createDynamicsCompressor();

    gain.gain.setValueAtTime(gainValue, context.currentTime);
    compressor.threshold.setValueAtTime(-10, context.currentTime);
    compressor.knee.setValueAtTime(16, context.currentTime);
    compressor.ratio.setValueAtTime(6, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.18, context.currentTime);

    source.connect(gain);
    gain.connect(compressor);
    compressor.connect(context.destination);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      audio.pause();
      try {
        source.disconnect();
        gain.disconnect();
        compressor.disconnect();
      } catch {
        // La limpieza del grafo de audio no debe afectar el temporizador.
      }
      void context.close().catch(() => undefined);
    };

    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });
    if (maxDurationSeconds) {
      window.setTimeout(cleanup, maxDurationSeconds * 1000);
    }

    const startPlayback = async () => {
      if (context.state === "suspended") await context.resume();
      await audio.play();
    };

    void startPlayback().catch(cleanup);
  } catch {
    // El sonido es opcional. Si el navegador lo bloquea, el timer sigue funcionando.
  }
}

function playBeep(enabled: boolean, count: 1 | 2) {
  if (!enabled || typeof window === "undefined") return;

  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const now = context.currentTime;

    Array.from({ length: count }).forEach((_, index) => {
      const start = now + index * 0.22;
      const gain = context.createGain();
      const oscillator = context.createOscillator();

      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(1320, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(beepGain, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.13);
    });

    window.setTimeout(() => void context.close(), count === 2 ? 620 : 420);
  } catch {
    // El aviso sonoro no debe cortar el entrenamiento.
  }
}
