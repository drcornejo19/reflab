"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarDays,
  Dumbbell,
  Gauge,
  HeartPulse,
  LineChart,
  Moon,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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
type EmotionalState = "Muy bajo" | "Bajo" | "Normal" | "Bueno" | "Excelente";
type ReadinessStatus = "Bajo" | "Moderado" | "Optimo" | "Elite";

type CheckInForm = {
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
  emotionalState: EmotionalState;
};

type DailyCheckInRecord = {
  id?: string;
  user_id: string;
  has_match_today?: boolean | null;
  trains_today?: boolean | null;
  training_type?: string | null;
  duration_minutes?: number | null;
  rpe?: number | null;
  fatigue?: number | null;
  sleep_quality?: string | null;
  sleep_hours?: number | null;
  pain_level?: string | null;
  emotional_state?: string | null;
  readiness_score?: number | null;
  readiness_status?: string | null;
  created_at?: string | null;
};

type TrainingSessionRecord = {
  id?: string;
  user_id: string;
  session_type?: string | null;
  duration_minutes?: number | null;
  rpe?: number | null;
  internal_load?: number | null;
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
};

const initialForm: CheckInForm = {
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
  emotionalState: "Bueno",
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
const emotionalOptions: EmotionalState[] = ["Muy bajo", "Bajo", "Normal", "Bueno", "Excelente"];
const physicalTestTypes = ["Yo-Yo", "40x75", "Sprint", "CODA", "RSA", "Agilidad", "Intermitencia"];

export function RefPerformanceClient() {
  const { user, isLoaded } = useUser();
  const [form, setForm] = useState<CheckInForm>(initialForm);
  const [data, setData] = useState<LoadState>({ checkins: [], sessions: [], tests: [], attempts: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [schemaMessage, setSchemaMessage] = useState<string | null>(null);
  const [testType, setTestType] = useState("Yo-Yo");
  const [testScore, setTestScore] = useState("");
  const [testUnit, setTestUnit] = useState("nivel");
  const [testGender, setTestGender] = useState("masculino");
  const [testTarget, setTestTarget] = useState("");
  const [testNotes, setTestNotes] = useState("");
  const [savingTest, setSavingTest] = useState(false);

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

      const [checkinsRes, sessionsRes, testsRes, attemptsRes] = await Promise.all([
        supabase.from("daily_checkins").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
        supabase.from("training_sessions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60),
        supabase.from("physical_tests").select("*").eq("user_id", user.id).order("test_date", { ascending: false }).limit(30),
        supabase.from("attempts").select("id,score,topic,mode,module,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80),
      ]);

      if (!active) return;

      if (checkinsRes.error || sessionsRes.error || testsRes.error) {
        setSchemaMessage("Ref Performance esta listo. Aplica la migracion de Supabase para activar historiales fisicos, wellness y tests.");
      }

      setData({
        checkins: checkinsRes.error ? [] : ((checkinsRes.data ?? []) as DailyCheckInRecord[]),
        sessions: sessionsRes.error ? [] : ((sessionsRes.data ?? []) as TrainingSessionRecord[]),
        tests: testsRes.error ? [] : ((testsRes.data ?? []) as PhysicalTestRecord[]),
        attempts: attemptsRes.error ? [] : ((attemptsRes.data ?? []) as AttemptMiniRecord[]),
      });
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

    setSaving(true);
    setMessage(null);

    const now = new Date().toISOString();
    const duration = resolveDuration(form);
    const sleepHours = Number.parseFloat(form.sleepHours) || null;
    const checkInPayload: DailyCheckInRecord = {
      user_id: user.id,
      has_match_today: form.hasMatchToday,
      trains_today: form.trainsToday,
      training_type: form.trainsToday || form.hasMatchToday ? form.trainingType : null,
      duration_minutes: form.trainsToday || form.hasMatchToday ? duration : null,
      rpe: form.trainsToday || form.hasMatchToday ? form.rpe : null,
      fatigue: form.fatigue,
      sleep_quality: form.sleepQuality,
      sleep_hours: sleepHours,
      pain_level: form.painLevel,
      emotional_state: form.emotionalState,
      readiness_score: readiness.score,
      readiness_status: readiness.status,
      created_at: now,
    };

    const { data: savedCheckIn, error } = await supabase
      .from("daily_checkins")
      .insert([checkInPayload])
      .select("*")
      .maybeSingle();

    if (error) {
      setMessage("No se pudo guardar en Supabase. Revisa que la migracion de Ref Performance este aplicada.");
      setSaving(false);
      return;
    }

    const internalLoad = form.trainsToday || form.hasMatchToday ? duration * form.rpe : 0;

    await Promise.all([
      supabase.from("readiness_scores").insert([{ user_id: user.id, daily_checkin_id: savedCheckIn?.id ?? null, score: readiness.score, status: readiness.status, factors: readiness.factors, created_at: now }]),
      supabase.from("fatigue_logs").insert([{ user_id: user.id, fatigue: form.fatigue, pain_level: form.painLevel, emotional_state: form.emotionalState, created_at: now }]),
      supabase.from("sleep_logs").insert([{ user_id: user.id, sleep_quality: form.sleepQuality, sleep_hours: sleepHours, created_at: now }]),
      form.trainsToday || form.hasMatchToday
        ? supabase.from("training_sessions").insert([{ user_id: user.id, daily_checkin_id: savedCheckIn?.id ?? null, session_type: form.hasMatchToday ? "Partido" : form.trainingType, duration_minutes: duration, rpe: form.rpe, internal_load: internalLoad, completed: true, created_at: now }])
        : Promise.resolve({ error: null }),
    ]);

    setData((current) => ({
      ...current,
      checkins: [((savedCheckIn ?? checkInPayload) as DailyCheckInRecord), ...current.checkins].slice(0, 30),
      sessions:
        form.trainsToday || form.hasMatchToday
          ? [{ user_id: user.id, session_type: form.hasMatchToday ? "Partido" : form.trainingType, duration_minutes: duration, rpe: form.rpe, internal_load: internalLoad, completed: true, created_at: now }, ...current.sessions].slice(0, 60)
          : current.sessions,
    }));

    setMessage("Daily Ref Check-In guardado. Readiness actualizado para hoy.");
    setSaving(false);
  }

  async function savePhysicalTest() {
    if (!user) {
      setMessage("Inicia sesion para guardar tests fisicos.");
      return;
    }

    const score = Number.parseFloat(testScore);
    if (!Number.isFinite(score)) {
      setMessage("Carga un score valido para el test fisico.");
      return;
    }

    setSavingTest(true);
    setMessage(null);

    const payload: PhysicalTestRecord = {
      user_id: user.id,
      test_type: testType,
      score,
      unit: testUnit || null,
      gender_category: testGender,
      target_value: Number.parseFloat(testTarget) || null,
      notes: testNotes || null,
      test_date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
    };

    const { data: savedTest, error } = await supabase.from("physical_tests").insert([payload]).select("*").maybeSingle();

    if (error) {
      setMessage("No se pudo guardar el test. Revisa la migracion de Supabase.");
      setSavingTest(false);
      return;
    }

    setData((current) => ({ ...current, tests: [((savedTest ?? payload) as PhysicalTestRecord), ...current.tests].slice(0, 30) }));
    setTestScore("");
    setTestNotes("");
    setMessage("Test fisico guardado para Ref Performance.");
    setSavingTest(false);
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
          Inicia sesion para registrar wellness, carga fisica, tests y readiness arbitral.
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

      <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <PhysicalTestsPanel
          tests={data.tests}
          testType={testType}
          setTestType={setTestType}
          testScore={testScore}
          setTestScore={setTestScore}
          testUnit={testUnit}
          setTestUnit={setTestUnit}
          testGender={testGender}
          setTestGender={setTestGender}
          testTarget={testTarget}
          setTestTarget={setTestTarget}
          testNotes={testNotes}
          setTestNotes={setTestNotes}
          savingTest={savingTest}
          onSave={savePhysicalTest}
        />
        <PlannerPanel />
      </section>

      <EducationPanel />
    </div>
  );
}

function Hero({ readiness }: { readiness: ReturnType<typeof calculateReadiness> }) {
  return (
    <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.2),transparent_36%),linear-gradient(145deg,#071019,#0b151f_62%,#111827)] p-4 shadow-2xl sm:p-6 lg:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[#6fc11f] sm:text-xs sm:tracking-[0.45em]">High performance center</p>
          <h1 className="mt-3 break-words text-4xl font-black leading-tight text-white sm:text-5xl">Ref Performance</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
            Seguimiento integral para arbitros: carga fisica, wellness, readiness, tests, planificacion y relacion con el rendimiento tecnico.
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

  return (
    <Panel eyebrow="Daily Ref Check-In" title="Como llega tu cuerpo al dia arbitral" icon={HeartPulse}>
      <div className="grid gap-4">
        <ToggleRow label="Tenes partido hoy?" value={form.hasMatchToday} onChange={(value) => setForm((current) => ({ ...current, hasMatchToday: value, trainingType: value ? "Partido" : current.trainingType }))} />
        <ToggleRow label="Entrenas hoy?" value={form.trainsToday} onChange={(value) => setForm((current) => ({ ...current, trainsToday: value }))} />
        <SelectField label="Tipo de entrenamiento" value={form.trainingType} options={trainingTypes} onChange={(value) => setForm((current) => ({ ...current, trainingType: value as TrainingType }))} />

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

        <RangeField label="Intensidad percibida (RPE)" value={form.rpe} onChange={(value) => setForm((current) => ({ ...current, rpe: value }))} />
        <RangeField label="Fatiga actual" value={form.fatigue} onChange={(value) => setForm((current) => ({ ...current, fatigue: value }))} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Calidad de sueno" value={form.sleepQuality} options={sleepOptions} onChange={(value) => setForm((current) => ({ ...current, sleepQuality: value as SleepQuality }))} />
          <InputField label="Horas de sueno" value={form.sleepHours} onChange={(value) => setForm((current) => ({ ...current, sleepHours: value }))} />
          <SelectField label="Dolor o molestias" value={form.painLevel} options={painOptions} onChange={(value) => setForm((current) => ({ ...current, painLevel: value as PainLevel }))} />
          <SelectField label="Estado emocional" value={form.emotionalState} options={emotionalOptions} onChange={(value) => setForm((current) => ({ ...current, emotionalState: value as EmotionalState }))} />
        </div>

        <div className="rounded-[24px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">Carga interna estimada</p>
              <p className="mt-1 text-2xl font-black">{duration * form.rpe} AU</p>
            </div>
            <Activity className="h-9 w-9 text-[#6fc11f]" />
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">Duracion x RPE. No reemplaza planificacion profesional, ayuda a leer carga arbitral.</p>
        </div>

        <button type="button" onClick={onSave} disabled={saving} className="min-h-14 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a] disabled:opacity-50">
          {saving ? "Guardando..." : `Guardar check-in (${readiness.score}%)`}
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

function PhysicalTestsPanel(props: {
  tests: PhysicalTestRecord[];
  testType: string;
  setTestType: (value: string) => void;
  testScore: string;
  setTestScore: (value: string) => void;
  testUnit: string;
  setTestUnit: (value: string) => void;
  testGender: string;
  setTestGender: (value: string) => void;
  testTarget: string;
  setTestTarget: (value: string) => void;
  testNotes: string;
  setTestNotes: (value: string) => void;
  savingTest: boolean;
  onSave: () => void;
}) {
  return (
    <Panel eyebrow="Physical Tests" title="Tests fisicos del arbitro" icon={Trophy}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Test" value={props.testType} options={physicalTestTypes} onChange={props.setTestType} />
        <InputField label="Score / marca" value={props.testScore} onChange={props.setTestScore} />
        <InputField label="Unidad" value={props.testUnit} onChange={props.setTestUnit} />
        <SelectField label="Categoria" value={props.testGender} options={["masculino", "femenino", "mixto"]} onChange={props.setTestGender} />
        <InputField label="Objetivo recomendado" value={props.testTarget} onChange={props.setTestTarget} />
        <InputField label="Notas" value={props.testNotes} onChange={props.setTestNotes} />
      </div>

      <button type="button" onClick={props.onSave} disabled={props.savingTest} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-4 font-black text-[#6fc11f] transition hover:bg-[#6fc11f]/15 disabled:opacity-50">
        <Plus size={18} />
        {props.savingTest ? "Guardando test..." : "Guardar test fisico"}
      </button>

      <div className="mt-5 space-y-3">
        {props.tests.length === 0 ? (
          <EmptyBlock text="Sin tests registrados. Carga Yo-Yo, 40x75, Sprint, CODA, RSA, agilidad o intermitencia." />
        ) : (
          props.tests.slice(0, 5).map((test) => (
            <div key={`${test.id ?? test.test_type}-${test.created_at}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-white">{test.test_type}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatShortDate(test.test_date ?? test.created_at)} - {test.gender_category}</p>
                </div>
                <p className="text-2xl font-black text-[#6fc11f]">{test.score ?? "-"} <span className="text-xs text-zinc-500">{test.unit}</span></p>
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-400">Objetivo: {test.target_value ?? "Pendiente"} {test.unit ?? ""}. {test.notes ?? "Sin notas."}</p>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function PlannerPanel() {
  const planner = [
    { day: "Lunes", title: "Recuperacion + movilidad", load: "Baja", detail: "Descarga post partido o post alta carga." },
    { day: "Martes", title: "Fuerza + core", load: "Media", detail: "Base funcional, prevencion y estabilidad." },
    { day: "Miercoles", title: "Intermitencia 15/15", load: "Alta", detail: "Estimulo arbitral para cambios de ritmo." },
    { day: "Jueves", title: "Tecnica arbitral + cognitivo", load: "Media", detail: "Clips, toma de decisiones y foco." },
    { day: "Viernes", title: "Activacion pre partido", load: "Baja", detail: "Velocidad corta, movilidad y confianza." },
    { day: "Sabado/Domingo", title: "Partido / evaluacion", load: "Variable", detail: "Registrar RPE y sensaciones post partido." },
  ];

  return (
    <Panel eyebrow="Training Planner" title="Planificacion semanal arbitral" icon={CalendarDays}>
      <div className="space-y-3">
        {planner.map((item) => (
          <div key={item.day} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6fc11f]">{item.day}</p>
                <p className="mt-1 font-black text-white">{item.title}</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-zinc-300">{item.load}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-400">{item.detail}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function EducationPanel() {
  const categories = [
    { title: "Fuerza", icon: Dumbbell, text: "Protocolos, rutinas base y progresiones para el arbitro." },
    { title: "Potencia", icon: Activity, text: "Aceleracion, cambios de ritmo y sprints cortos." },
    { title: "Movilidad", icon: HeartPulse, text: "Preparacion articular, descarga y prevencion." },
    { title: "Core", icon: ShieldCheck, text: "Estabilidad, tronco y prevencion de lesiones." },
    { title: "Cognitivo", icon: Brain, text: "Decision bajo fatiga, atencion y lectura de juego." },
    { title: "Recuperacion", icon: Moon, text: "Sueno, carga, fatiga y readiness pre partido." },
  ];

  return (
    <Panel eyebrow="Contenido educativo" title="Biblioteca de alto rendimiento arbitral" icon={Brain}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {categories.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-[24px] border border-white/10 bg-[#101b24] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                  <Icon size={21} />
                </div>
                <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-200">En construccion</span>
              </div>
              <h3 className="mt-4 text-lg font-black">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
            </article>
          );
        })}
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
  const sleepHours = Number.parseFloat(form.sleepHours) || 0;
  let score = 82;
  score += sleepQualityScore(form.sleepQuality);
  score += Math.min(10, Math.max(-14, (sleepHours - 7) * 4));
  score -= form.fatigue * 3.8;
  score -= painPenalty(form.painLevel);
  score += emotionalScore(form.emotionalState);

  if (form.trainsToday || form.hasMatchToday) {
    score -= Math.max(0, form.rpe - 6) * 2.5;
    score -= resolveDuration(form) > 90 ? 5 : 0;
  }

  if (form.hasMatchToday && form.fatigue >= 7) score -= 8;
  if (form.sleepQuality === "Excelente" && form.fatigue <= 3) score += 6;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  const status = readinessStatus(normalized);

  return {
    score: normalized,
    status,
    message: readinessMessage(status),
    factors: {
      sleep_quality: form.sleepQuality,
      sleep_hours: sleepHours,
      fatigue: form.fatigue,
      pain_level: form.painLevel,
      emotional_state: form.emotionalState,
      rpe: form.rpe,
      duration_minutes: resolveDuration(form),
      has_match_today: form.hasMatchToday,
      trains_today: form.trainsToday,
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

function emotionalScore(value: EmotionalState) {
  const map: Record<EmotionalState, number> = { "Muy bajo": -14, Bajo: -8, Normal: 0, Bueno: 5, Excelente: 9 };
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

function formatShortDate(value?: string | null) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
