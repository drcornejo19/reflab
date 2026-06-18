"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Dumbbell,
  Gauge,
  HeartPulse,
  LineChart,
  Moon,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

type CheckInType = "pre" | "post" | "rest_day";

type TrainingType =
  | "Fuerza"
  | "Potencia"
  | "Resistencia"
  | "Intermitencia"
  | "Recuperacion"
  | "Movilidad"
  | "Core"
  | "Cognitivo"
  | "Partido"
  | "Gimnasio"
  | "Tecnica arbitral"
  | "Otro";

type SleepQuality = "Muy mala" | "Mala" | "Normal" | "Buena" | "Excelente";
type PainLevel = "Ninguna" | "Leve" | "Moderada" | "Alta";
type ReadinessStatus = "Bajo" | "Moderado" | "Optimo" | "Elite";

type CheckInForm = {
  checkinType: CheckInType;
  hasMatchToday: boolean;
  trainsToday: boolean;
  trainingType: TrainingType;
  durationMinutes: number;
  customDuration: string;
  rpe: number;
  fatigue: number;
  sleepQuality: SleepQuality;
  sleepHours: string;
  painLevel: PainLevel;
  emotionalScore: number;
  completed: boolean;
  recoveryMobility: boolean;
  notes: string;
};

type DailyCheckInRecord = {
  id?: string;
  user_id: string;
  date?: string | null;
  checkin_type?: CheckInType | null;
  has_match_today?: boolean | null;
  has_training_today?: boolean | null;
  trains_today?: boolean | null;
  activity_type?: string | null;
  training_type?: string | null;
  duration_minutes?: number | null;
  rpe?: number | null;
  fatigue?: number | null;
  sleep_quality?: string | null;
  sleep_hours?: number | null;
  soreness?: string | null;
  pain_level?: string | null;
  emotional_state?: string | null;
  emotional_score?: number | null;
  readiness_score?: number | null;
  readiness_status?: string | null;
  completed?: boolean | null;
  recovery_mobility?: boolean | null;
  internal_load?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type TrainingSessionRecord = {
  id?: string;
  user_id: string;
  session_type?: string | null;
  duration_minutes?: number | null;
  rpe?: number | null;
  internal_load?: number | null;
  fatigue_post?: number | null;
  soreness_post?: string | null;
  completed?: boolean | null;
  created_at?: string | null;
};

type PhysicalTestRecord = {
  id?: string;
  user_id: string;
  test_type?: string | null;
  score?: number | null;
  unit?: string | null;
  gender_category?: string | null;
  target_value?: number | null;
  notes?: string | null;
  test_date?: string | null;
  created_at?: string | null;
};

type AttemptMiniRecord = {
  id?: string;
  score?: number | null;
  topic?: string | null;
  mode?: string | null;
  module?: string | null;
  created_at?: string | null;
};

type LoadState = {
  checkins: DailyCheckInRecord[];
  sessions: TrainingSessionRecord[];
  tests: PhysicalTestRecord[];
  attempts: AttemptMiniRecord[];
  readinessScores?: unknown[];
  wellnessLogs?: unknown[];
};

const initialForm: CheckInForm = {
  checkinType: "pre",
  hasMatchToday: false,
  trainsToday: true,
  trainingType: "Intermitencia",
  durationMinutes: 60,
  customDuration: "",
  rpe: 6,
  fatigue: 4,
  sleepQuality: "Buena",
  sleepHours: "7.5",
  painLevel: "Ninguna",
  emotionalScore: 7,
  completed: true,
  recoveryMobility: false,
  notes: "",
};

const trainingTypes: TrainingType[] = [
  "Fuerza",
  "Potencia",
  "Resistencia",
  "Intermitencia",
  "Recuperacion",
  "Movilidad",
  "Core",
  "Cognitivo",
  "Partido",
  "Gimnasio",
  "Tecnica arbitral",
  "Otro",
];
const durationOptions = [30, 45, 60, 90];
const sleepOptions: SleepQuality[] = ["Muy mala", "Mala", "Normal", "Buena", "Excelente"];
const painOptions: PainLevel[] = ["Ninguna", "Leve", "Moderada", "Alta"];
type RefPerformanceResult =
  | { ok: true; data: LoadState; message?: string }
  | { ok: false; error: string };

async function fetchRefPerformance(): Promise<RefPerformanceResult> {
  try {
    const response = await fetch("/api/ref-performance", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: formatApiError(payload) };
    return { ok: true, data: normalizeLoadState(payload) };
  } catch (error) {
    return { ok: false, error: `No se pudo conectar con Ref Performance. ${error instanceof Error ? error.message : ""}` };
  }
}

async function postRefPerformance(action: string, payload: Record<string, unknown>): Promise<RefPerformanceResult> {
  try {
    const response = await fetch("/api/ref-performance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: formatApiError(result) };
    return { ok: true, data: normalizeLoadState(result), message: result.message };
  } catch (error) {
    return { ok: false, error: `No se pudo guardar en Supabase. ${error instanceof Error ? error.message : ""}` };
  }
}

function normalizeLoadState(payload: Record<string, unknown>): LoadState {
  return {
    checkins: Array.isArray(payload.checkins) ? (payload.checkins as DailyCheckInRecord[]) : [],
    sessions: Array.isArray(payload.sessions) ? (payload.sessions as TrainingSessionRecord[]) : [],
    tests: Array.isArray(payload.tests) ? (payload.tests as PhysicalTestRecord[]) : [],
    attempts: Array.isArray(payload.attempts) ? (payload.attempts as AttemptMiniRecord[]) : [],
    readinessScores: Array.isArray(payload.readinessScores) ? payload.readinessScores : [],
    wellnessLogs: Array.isArray(payload.wellnessLogs) ? payload.wellnessLogs : [],
  };
}

function formatApiError(payload: Record<string, unknown>) {
  const error = typeof payload.error === "string" ? payload.error : "No se pudo guardar en Supabase.";
  const technical = typeof payload.technical === "string" ? payload.technical : null;
  return technical ? `${error} Detalle tecnico: ${technical}` : error;
}

function validateCheckIn(form: CheckInForm) {
  const duration = resolveDuration(form);

  if (form.checkinType === "pre" && (form.hasMatchToday || form.trainsToday) && !form.trainingType) {
    return "Indica que tipo de actividad vas a hacer.";
  }

  if (form.checkinType === "post") {
    if (!form.trainingType) return "Indica que actividad hiciste.";
    if (!duration || duration <= 0) return "Carga la duracion de la actividad.";
    if (!form.rpe || form.rpe < 1) return "Carga la intensidad percibida RPE.";
  }

  const sleepHours = Number.parseFloat(form.sleepHours);
  if (form.checkinType !== "post" && (!Number.isFinite(sleepHours) || sleepHours < 0 || sleepHours > 24)) {
    return "Carga horas de sueno validas.";
  }

  return null;
}

export function RefPerformanceClient() {
  const { user, isLoaded } = useUser();
  const [form, setForm] = useState<CheckInForm>(initialForm);
  const [data, setData] = useState<LoadState>({ checkins: [], sessions: [], tests: [], attempts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [schemaMessage, setSchemaMessage] = useState<string | null>(null);

  const readiness = useMemo(() => calculateReadiness(form), [form]);
  const analytics = useMemo(() => buildAnalytics(data, readiness.score), [data, readiness.score]);
  const insights = useMemo(() => buildInsights(data, readiness.score), [data, readiness.score]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!isLoaded) return;
      if (!user) {
        if (active) {
          setData({ checkins: [], sessions: [], tests: [], attempts: [] });
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setSchemaMessage(null);

      const result = await fetchRefPerformance();

      if (!active) return;

      if (!result.ok) {
        setSchemaMessage(result.error);
        setData({ checkins: [], sessions: [], tests: [], attempts: [] });
        setLoading(false);
        return;
      }

      setData(result.data);
      setLoading(false);
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [isLoaded, user]);

  async function saveCheckIn() {
    if (!user) {
      setMessage("Inicia sesion para guardar tu Daily Ref Check-In.");
      return;
    }

    const validationError = validateCheckIn(form);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);
    setMessage(null);
    setSchemaMessage(null);

    const duration = resolveDuration(form);
    const result = await postRefPerformance("save_checkin", {
      checkinType: form.checkinType,
      hasMatchToday: form.checkinType === "rest_day" ? false : form.hasMatchToday,
      hasTrainingToday: form.checkinType === "rest_day" ? false : form.trainsToday,
      activityType: form.checkinType === "rest_day" ? "Descanso" : form.trainingType,
      durationMinutes: form.checkinType === "post" ? duration : null,
      rpe: form.checkinType === "post" ? form.rpe : null,
      fatigue: form.fatigue,
      sleepQuality: form.checkinType === "post" ? null : form.sleepQuality,
      sleepHours: form.checkinType === "post" ? null : Number.parseFloat(form.sleepHours) || null,
      soreness: form.painLevel,
      emotionalScore: form.checkinType === "post" ? null : form.emotionalScore,
      completed: form.checkinType === "post" ? form.completed : null,
      recoveryMobility: form.checkinType === "rest_day" ? form.recoveryMobility : null,
      notes: form.notes || null,
    });

    if (!result.ok) {
      setSchemaMessage(result.error);
      setSaving(false);
      return;
    }

    setData(result.data);
    setMessage(result.message ?? "Daily Ref Check-In guardado. Datos recargados desde Supabase.");
    setSaving(false);
  }

  if (!isLoaded || loading) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-zinc-400">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-[#6fc11f]" />
          Cargando Ref Performance...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-center shadow-2xl">
        <ShieldCheck className="mx-auto h-12 w-12 text-[#6fc11f]" />
        <h1 className="mt-4 text-3xl font-black">Ref Performance</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400">
          Inicia sesion para registrar wellness, carga, fatiga, sueno y readiness arbitral.
        </p>
        <Link href="/sign-in" className="mt-6 inline-flex min-h-12 items-center rounded-2xl bg-[#6fc11f] px-6 font-black text-black">
          Iniciar sesion
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-full space-y-5 overflow-hidden lg:max-w-[1180px] lg:space-y-6">
      <Hero readiness={readiness} />

      {schemaMessage && <Notice tone="warning">{schemaMessage}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <DailyCheckInPanel form={form} setForm={setForm} readiness={readiness} saving={saving} onSave={saveCheckIn} />
        <ReadinessPanel readiness={readiness} analytics={analytics} insights={insights} />
      </section>

      <AnalyticsPanel analytics={analytics} checkins={data.checkins} sessions={data.sessions} />
    </div>
  );
}

function Hero({ readiness }: { readiness: ReturnType<typeof calculateReadiness> }) {
  return (
    <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.2),transparent_36%),linear-gradient(145deg,#071019,#0b151f_62%,#111827)] p-4 shadow-2xl sm:p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f] sm:text-xs sm:tracking-[0.45em]">A. Como esta el arbitro hoy?</p>
          <h1 className="mt-3 break-words text-4xl font-black leading-tight text-white sm:text-5xl">Registro fisico / wellness / readiness</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
            Registro diario de estado fisico, disponibilidad, fatiga, sueno, dolor muscular, carga percibida, RPE y comentarios pre o post actividad.
          </p>
        </div>

        <div className="rounded-[30px] border border-[#6fc11f]/30 bg-black/30 p-4 shadow-[0_0_36px_rgba(111,193,31,0.12)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">Readiness today</p>
              <p className="mt-2 text-5xl font-black text-white">{readiness.score}%</p>
              <p className="mt-1 text-sm font-bold text-zinc-400">{readiness.status}</p>
            </div>
            <Gauge className="h-16 w-16 text-[#6fc11f]" />
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#6fc11f] shadow-[0_0_24px_rgba(111,193,31,0.45)]" style={{ width: `${readiness.score}%` }} />
          </div>
        </div>
      </div>
    </header>
  );
}

function DailyCheckInPanel({
  form,
  setForm,
  readiness,
  saving,
  onSave,
}: {
  form: CheckInForm;
  setForm: (value: CheckInForm | ((current: CheckInForm) => CheckInForm)) => void;
  readiness: ReturnType<typeof calculateReadiness>;
  saving: boolean;
  onSave: () => void;
}) {
  const duration = resolveDuration(form);
  const isPre = form.checkinType === "pre";
  const isPost = form.checkinType === "post";
  const isRest = form.checkinType === "rest_day";

  return (
    <Panel eyebrow="Daily Ref Check-In" title="Registro fisico, wellness y readiness" icon={HeartPulse}>
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { value: "pre", label: "Antes de entrenar / partido" },
            { value: "post", label: "Despues de entrenar / partido" },
            { value: "rest_day", label: "Dia sin actividad" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  checkinType: item.value as CheckInType,
                  hasMatchToday: item.value === "rest_day" ? false : current.hasMatchToday,
                  trainsToday: item.value === "rest_day" ? false : current.trainsToday,
                  trainingType: item.value === "rest_day" ? "Recuperacion" : current.trainingType,
                }))
              }
              className={`min-h-12 rounded-2xl border px-3 text-sm font-black transition ${
                form.checkinType === item.value
                  ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                  : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#6fc11f]/40"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {!isRest && (
          <>
            <ToggleRow label="Tenes partido hoy?" value={form.hasMatchToday} onChange={(value) => setForm((current) => ({ ...current, hasMatchToday: value, trainingType: value ? "Partido" : current.trainingType }))} />
            {isPre && <ToggleRow label="Entrenas hoy?" value={form.trainsToday} onChange={(value) => setForm((current) => ({ ...current, trainsToday: value }))} />}
            <SelectField label={isPost ? "Que actividad hiciste?" : "Que tipo de actividad vas a hacer?"} value={form.trainingType} options={trainingTypes} onChange={(value) => setForm((current) => ({ ...current, trainingType: value as TrainingType }))} />
          </>
        )}

        {isPost && (
          <div>
            <Label>Duracion</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {durationOptions.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, durationMinutes: minutes, customDuration: "" }))}
                  className={`min-h-11 rounded-2xl border text-sm font-black transition ${duration === minutes && form.customDuration === "" ? "border-[#6fc11f] bg-[#6fc11f] text-black" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}
                >
                  {minutes} min
                </button>
              ))}
              <input value={form.customDuration} onChange={(event) => setForm((current) => ({ ...current, customDuration: event.target.value }))} inputMode="numeric" placeholder="Otro" className="min-h-11 rounded-2xl border border-white/10 bg-[#101b24] px-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600" />
            </div>
          </div>
        )}

        {isPost && <RangeField label="Intensidad percibida (RPE)" value={form.rpe} onChange={(value) => setForm((current) => ({ ...current, rpe: value }))} />}
        <RangeField label={isPost ? "Fatiga post actividad" : "Fatiga actual"} value={form.fatigue} onChange={(value) => setForm((current) => ({ ...current, fatigue: value }))} />

        {!isPost && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Calidad de sueno" value={form.sleepQuality} options={sleepOptions} onChange={(value) => setForm((current) => ({ ...current, sleepQuality: value as SleepQuality }))} />
            <InputField label="Horas de sueno" value={form.sleepHours} onChange={(value) => setForm((current) => ({ ...current, sleepHours: value }))} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Dolor o molestias" value={form.painLevel} options={painOptions} onChange={(value) => setForm((current) => ({ ...current, painLevel: value as PainLevel }))} />
          {!isPost && <RangeField label="Estado mental / emocional" value={form.emotionalScore} onChange={(value) => setForm((current) => ({ ...current, emotionalScore: value }))} />}
        </div>

        {isPost && <ToggleRow label="Pudiste completar la sesion?" value={form.completed} onChange={(value) => setForm((current) => ({ ...current, completed: value }))} />}
        {isRest && <ToggleRow label="Hiciste recuperacion o movilidad?" value={form.recoveryMobility} onChange={(value) => setForm((current) => ({ ...current, recoveryMobility: value }))} />}

        <label className="block">
          <Label>{isPost ? "Notas post actividad" : isRest ? "Notas del dia" : "Notas previas"}</Label>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            rows={3}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600"
            placeholder="Sensaciones, molestias, contexto del partido o detalles utiles."
          />
        </label>

        {isPost && (
          <div className="rounded-[24px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">Carga interna</p>
              <p className="mt-1 text-2xl font-black">{duration * form.rpe} AU</p>
            </div>
            <Activity className="h-9 w-9 text-[#6fc11f]" />
          </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">Duracion x RPE. Se guarda como carga interna de la actividad.</p>
          </div>
        )}

        <button type="button" onClick={onSave} disabled={saving} className="min-h-14 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50">
          {saving ? "Guardando..." : isPost ? "Guardar post actividad" : isRest ? `Guardar descanso (${readiness.score}%)` : `Guardar pre actividad (${readiness.score}%)`}
        </button>
      </div>
    </Panel>
  );
}

function ReadinessPanel({ readiness, analytics, insights }: { readiness: ReturnType<typeof calculateReadiness>; analytics: ReturnType<typeof buildAnalytics>; insights: string[] }) {
  return (
    <Panel eyebrow="Ref Readiness Score" title="Preparacion arbitral para hoy" icon={Gauge}>
      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[28px] border border-[#6fc11f]/30 bg-black/30 p-5 text-center">
          <div className="mx-auto grid h-44 w-44 place-items-center rounded-full border border-[#6fc11f]/30 bg-[conic-gradient(#6fc11f_var(--score),rgba(255,255,255,0.08)_0)] p-3 shadow-[0_0_36px_rgba(111,193,31,0.18)]" style={{ "--score": `${readiness.score}%` } as CSSProperties}>
            <div className="grid h-full w-full place-items-center rounded-full bg-[#071019]">
              <div>
                <p className="text-5xl font-black text-white">{readiness.score}</p>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">{readiness.status}</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">{readiness.message}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MiniMetric icon={Moon} label="Sueno promedio" value={analytics.avgSleep} />
          <MiniMetric icon={AlertTriangle} label="Fatiga promedio" value={analytics.avgFatigue} />
          <MiniMetric icon={Dumbbell} label="Carga semanal" value={analytics.weeklyLoad} />
          <MiniMetric icon={LineChart} label="Precision reciente" value={analytics.recentDecisionScore} />
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {insights.map((insight) => (
          <div key={insight} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-zinc-300">
            {insight}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AnalyticsPanel({ analytics, checkins, sessions }: { analytics: ReturnType<typeof buildAnalytics>; checkins: DailyCheckInRecord[]; sessions: TrainingSessionRecord[] }) {
  return (
    <Panel eyebrow="Metricas y analytics" title="Carga, fatiga, recuperacion y consistencia" icon={BarChart3}>
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <ChartBox title="Evolucion de readiness" empty="Sin check-ins todavia. Guarda tu primer Daily Ref Check-In para activar la tendencia." values={checkins.slice(0, 10).reverse().map((item) => item.readiness_score ?? 0)} />
        <ChartBox title="Carga interna reciente" empty="Sin sesiones fisicas registradas." values={sessions.slice(0, 10).reverse().map((item) => Math.min(100, Math.round((item.internal_load ?? 0) / 10)))} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Consistencia" value={analytics.consistency} detail="Check-ins y sesiones en los ultimos 7 dias." />
        <MetricCard label="Recuperacion" value={analytics.recoveryStatus} detail="Sueno, fatiga, molestias y estado emocional." />
        <MetricCard label="Frecuencia" value={analytics.frequency} detail="Entrenamientos / partidos registrados." />
        <MetricCard label="Tendencia" value={analytics.trend} detail="Lectura combinada de carga y readiness." />
      </div>
    </Panel>
  );
}

function Panel({ eyebrow, title, icon: Icon, children }: { eyebrow: string; title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="max-w-full overflow-hidden rounded-[32px] border border-white/10 bg-[#071019] p-4 shadow-2xl sm:p-5 lg:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <p className="break-words text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f] sm:text-xs sm:tracking-[0.32em]">{eyebrow}</p>
          <h2 className="mt-2 break-words text-2xl font-black leading-tight text-white">{title}</h2>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-sm font-black text-white">{label}</p>
      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-[#101b24] p-1">
        {[{ label: "No", value: false }, { label: "Si", value: true }].map((item) => (
          <button key={item.label} type="button" onClick={() => onChange(item.value)} className={`min-h-9 rounded-xl px-4 text-xs font-black transition ${value === item.value ? "bg-[#6fc11f] text-black" : "text-zinc-400"}`}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RangeField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-xs font-black text-[#6fc11f]">{value}/10</span>
      </div>
      <input type="range" min={1} max={10} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[#6fc11f]" />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none placeholder:text-zinc-600" />
    </label>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-black uppercase tracking-[0.16em] text-zinc-500">{children}</span>;
}

function Notice({ tone, children }: { tone: "success" | "warning"; children: ReactNode }) {
  const style = tone === "success" ? "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#b7ff8a]" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100";
  return <div className={`rounded-3xl border p-4 text-sm font-bold leading-6 ${style}`}>{children}</div>;
}

function MiniMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <Icon className="h-5 w-5 text-[#6fc11f]" />
      <p className="mt-3 text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#101b24] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#6fc11f]">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}

function ChartBox({ title, empty, values }: { title: string; empty: string; values: number[] }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-black text-white">{title}</p>
      {values.length === 0 ? <EmptyBlock text={empty} /> : <BarSeries values={values} />}
    </div>
  );
}

function BarSeries({ values }: { values: number[] }) {
  return (
    <div className="mt-4 flex h-40 items-end gap-2 overflow-hidden">
      {values.map((value, index) => (
        <div key={`${value}-${index}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end rounded-full bg-white/5 p-1">
            <div className="w-full rounded-full bg-[#6fc11f] shadow-[0_0_18px_rgba(111,193,31,0.35)]" style={{ height: `${Math.max(4, Math.min(value, 100))}%` }} />
          </div>
          <span className="text-[10px] font-bold text-zinc-500">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-5 text-center text-sm leading-6 text-zinc-500">{text}</div>;
}

function calculateReadiness(form: CheckInForm) {
  const sleepHours = form.checkinType === "post" ? 0 : Number.parseFloat(form.sleepHours) || 0;
  let score = form.checkinType === "post" ? 76 : 82;

  if (form.checkinType !== "post") {
    score += sleepQualityScore(form.sleepQuality);
    score += Math.min(10, Math.max(-14, (sleepHours - 7) * 4));
    score += (form.emotionalScore - 5) * 3;
  }

  score -= form.fatigue * 3.8;
  score -= painPenalty(form.painLevel);

  if (form.checkinType === "post") {
    score -= Math.max(0, form.rpe - 6) * 2.5;
    score -= resolveDuration(form) > 90 ? 5 : 0;
  }

  if (form.checkinType === "rest_day" && form.recoveryMobility) score += 5;

  if (form.hasMatchToday && form.fatigue >= 7) score -= 8;
  if (form.checkinType !== "post" && form.sleepQuality === "Excelente" && form.fatigue <= 3) score += 6;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const status = readinessStatus(normalized);

  return {
    score: normalized,
    status,
    message: readinessMessage(status),
    factors: {
      checkin_type: form.checkinType,
      sleep_quality: form.sleepQuality,
      sleep_hours: sleepHours,
      fatigue: form.fatigue,
      soreness: form.painLevel,
      emotional_score: form.emotionalScore,
      rpe: form.rpe,
      duration_minutes: resolveDuration(form),
      has_match_today: form.hasMatchToday,
      has_training_today: form.trainsToday,
    },
  };
}

function buildAnalytics(data: LoadState, currentReadiness: number) {
  const recentCheckins = data.checkins.slice(0, 7);
  const recentSessions = data.sessions.filter((session) => isWithinDays(session.created_at, 7));
  const recentAttempts = data.attempts.slice(0, 8).filter((attempt) => typeof attempt.score === "number");
  const avgSleep = average(recentCheckins.map((item) => item.sleep_hours ?? null));
  const avgFatigue = average(recentCheckins.map((item) => item.fatigue ?? null));
  const weeklyLoad = recentSessions.reduce((acc, item) => acc + (item.internal_load ?? 0), 0);
  const recentScore = average(recentAttempts.map((item) => item.score ?? null));

  return {
    avgSleep: avgSleep === null ? "Sin datos" : `${avgSleep.toFixed(1)} h`,
    avgFatigue: avgFatigue === null ? "Sin datos" : `${avgFatigue.toFixed(1)}/10`,
    weeklyLoad: weeklyLoad > 0 ? `${weeklyLoad} AU` : "Sin datos",
    recentDecisionScore: recentScore === null ? "Sin datos" : `${Math.round(recentScore)}/100`,
    consistency: recentCheckins.length === 0 ? "Sin datos" : `${recentCheckins.length}/7 dias`,
    recoveryStatus: currentReadiness >= 80 ? "Recuperacion solida" : currentReadiness >= 60 ? "Controlar carga" : "Priorizar descarga",
    frequency: recentSessions.length === 0 ? "Sin datos" : `${recentSessions.length} sesiones`,
    trend: buildTrendLabel(data.checkins),
  };
}

function buildInsights(data: LoadState, currentReadiness: number) {
  const insights: string[] = [];
  const avgFatigue = average(data.checkins.slice(0, 7).map((item) => item.fatigue ?? null));
  const recentAttempts = data.attempts.slice(0, 8).filter((attempt) => typeof attempt.score === "number");
  const historicalAttempts = data.attempts.slice(8).filter((attempt) => typeof attempt.score === "number");
  const recentScore = average(recentAttempts.map((item) => item.score ?? null));
  const historicalScore = average(historicalAttempts.map((item) => item.score ?? null));

  if (currentReadiness < 55) insights.push("Readiness bajo: se recomienda recuperacion, movilidad suave y evitar cargas maximas antes de competir.");
  else if (currentReadiness >= 85) insights.push("Readiness alto: buen momento para trabajo de intensidad o simulaciones exigentes, si el calendario lo permite.");
  else insights.push("Readiness moderado: mantener carga controlada y priorizar calidad tecnica sobre volumen.");

  if (avgFatigue !== null && avgFatigue >= 7) insights.push("Se detecta fatiga elevada esta semana. RefLab recomienda bajar volumen y sostener movilidad/recuperacion.");

  if (recentScore !== null && historicalScore !== null && recentScore + 5 < historicalScore) {
    insights.push("Tu rendimiento tecnico reciente bajo respecto del promedio historico. Revisar si coincide con alta carga o poco descanso.");
  } else if (recentScore !== null) {
    insights.push("Relacion tecnica activa: tus intentos arbitrales ya se cruzan con readiness y carga para futuras recomendaciones.");
  } else {
    insights.push("Completa clips o evaluaciones para cruzar carga fisica con precision arbitral.");
  }

  return insights;
}

function sleepQualityScore(value: SleepQuality) {
  const map: Record<SleepQuality, number> = { "Muy mala": -16, Mala: -10, Normal: 0, Buena: 7, Excelente: 12 };
  return map[value];
}

function painPenalty(value: PainLevel) {
  const map: Record<PainLevel, number> = { Ninguna: 0, Leve: 5, Moderada: 13, Alta: 24 };
  return map[value];
}

function readinessStatus(score: number): ReadinessStatus {
  if (score < 50) return "Bajo";
  if (score < 70) return "Moderado";
  if (score < 86) return "Optimo";
  return "Elite";
}

function readinessMessage(status: ReadinessStatus) {
  const map: Record<ReadinessStatus, string> = {
    Bajo: "Dia para priorizar recuperacion, sueno y control de molestias.",
    Moderado: "Carga controlada. Evitar picos si hay partido cerca.",
    Optimo: "Buen estado para entrenar con calidad y foco arbitral.",
    Elite: "Condicion muy favorable para alta exigencia o simulacion competitiva.",
  };
  return map[status];
}

function resolveDuration(form: CheckInForm) {
  const custom = Number.parseInt(form.customDuration, 10);
  return Number.isFinite(custom) && custom > 0 ? custom : form.durationMinutes;
}

function average(values: (number | null | undefined)[]) {
  const realValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (realValues.length === 0) return null;
  return realValues.reduce((acc, value) => acc + value, 0) / realValues.length;
}

function isWithinDays(date?: string | null, days = 7) {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function buildTrendLabel(checkins: DailyCheckInRecord[]) {
  if (checkins.length < 3) return "Sin datos suficientes";
  const last = average(checkins.slice(0, 3).map((item) => item.readiness_score ?? null));
  const previous = average(checkins.slice(3, 6).map((item) => item.readiness_score ?? null));
  if (last === null || previous === null) return "Sin datos suficientes";
  if (last > previous + 4) return "Subiendo";
  if (last < previous - 4) return "Bajando";
  return "Estable";
}

