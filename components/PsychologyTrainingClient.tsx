"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  Flame,
  HeartPulse,
  LifeBuoy,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

type CheckInType = "pre_match" | "post_match" | "error_recovery";

type PsychologyFeedback = {
  summary: string;
  focus: string;
  action: string;
  risk: string;
};

type PsychologyEntry = {
  id: string;
  checkin_type: CheckInType;
  mental_score: number | null;
  mental_status: string | null;
  activation_score: number | null;
  confidence_score: number | null;
  pressure_score: number | null;
  concentration_score: number | null;
  emotional_control_score: number | null;
  mental_fatigue_score: number | null;
  error_impact_score: number | null;
  recovery_score: number | null;
  process_orientation_score: number | null;
  feedback: PsychologyFeedback | null;
  created_at: string;
};

type PsychologySummary = {
  total: number;
  average: number | null;
  latestScore: number | null;
  latestStatus: string | null;
  latestType: CheckInType | null;
  pressureAverage: number | null;
  confidenceAverage: number | null;
  recoveryAverage: number | null;
};

type WellbeingFeedback = {
  summary: string;
  priority: string;
  action: string;
  protection: string;
  note: string;
};

type WellbeingEntry = {
  id: string;
  burnout_risk_score: number | null;
  burnout_risk_level: string | null;
  emotional_exhaustion_score: number | null;
  external_pressure_score: number | null;
  institutional_support_score: number | null;
  recovery_quality_score: number | null;
  feedback: WellbeingFeedback | null;
  created_at: string;
};

type WellbeingSummary = {
  total: number;
  latestRiskScore: number | null;
  latestRiskLevel: string | null;
  averageRiskScore: number | null;
  externalPressureAverage: number | null;
  supportAverage: number | null;
  recoveryAverage: number | null;
};

type ExerciseType = "focus_reset" | "pressure_scenario" | "self_talk" | "team_prebrief";

type ExerciseFeedback = {
  summary: string;
  learning: string;
  nextCue: string;
  application: string;
};

type ExerciseEntry = {
  id: string;
  exercise_type: ExerciseType;
  scenario_title: string | null;
  pressure_level: number | null;
  before_score: number | null;
  after_score: number | null;
  clarity_score: number | null;
  feedback: ExerciseFeedback | null;
  created_at: string;
};

type ExerciseSummary = {
  total: number;
  latestType: ExerciseType | null;
  latestScenario: string | null;
  averageImprovement: number | null;
  clarityAverage: number | null;
};

type FormState = {
  checkinType: CheckInType;
  matchContext: string;
  pressureSource: string;
  focusGoal: string;
  resetCue: string;
  incidentMinute: string;
  incidentSummary: string;
  errorFactors: string[];
  learning: string;
  nextAction: string;
  activationScore: number;
  confidenceScore: number;
  pressureScore: number;
  concentrationScore: number;
  emotionalControlScore: number;
  mentalFatigueScore: number;
  errorImpactScore: number;
  recoveryScore: number;
  processOrientationScore: number;
  notes: string;
};

type WellbeingFormState = {
  weekContext: string;
  stressors: string[];
  protectiveFactors: string[];
  emotionalExhaustionScore: number;
  cynicismScore: number;
  motivationScore: number;
  sleepDisruptionScore: number;
  concentrationDifficultyScore: number;
  externalPressureScore: number;
  institutionalSupportScore: number;
  violenceExposureScore: number;
  recoveryQualityScore: number;
  workloadScore: number;
  notes: string;
};

type ExerciseFormState = {
  exerciseType: ExerciseType;
  scenarioId: string;
  scenarioTitle: string;
  pressureLevel: number;
  beforeScore: number;
  afterScore: number;
  clarityScore: number;
  responseStrategy: string;
  internalDialogueBefore: string;
  internalDialogueAfter: string;
  communicationPhrase: string;
  actionPlan: string;
  notes: string;
};

type IconType = ComponentType<{ size?: number; className?: string }>;

const modeConfig: Record<
  CheckInType,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    icon: IconType;
  }
> = {
  pre_match: {
    label: "Pre partido",
    eyebrow: "Preparacion mental",
    title: "Llegar listo para decidir",
    description: "Activacion, confianza, foco y presion antes de competir.",
    icon: Target,
  },
  post_match: {
    label: "Post partido",
    eyebrow: "Cierre emocional",
    title: "Analizar y cerrar pagina",
    description: "Separar resultado, critica y aprendizaje para el proximo partido.",
    icon: CheckCircle2,
  },
  error_recovery: {
    label: "Gestion del error",
    eyebrow: "Del error al aprendizaje",
    title: "Reconstruir sin culpa",
    description: "Detectar factores, recuperar foco y convertir la situacion en mejora.",
    icon: RefreshCcw,
  },
};

const initialForm: FormState = {
  checkinType: "pre_match",
  matchContext: "",
  pressureSource: "Partido exigente",
  focusGoal: "Ver, interpretar y decidir la siguiente accion",
  resetCue: "Respiro, miro zona activa y vuelvo al juego",
  incidentMinute: "",
  incidentSummary: "",
  errorFactors: [],
  learning: "",
  nextAction: "",
  activationScore: 6,
  confidenceScore: 7,
  pressureScore: 5,
  concentrationScore: 7,
  emotionalControlScore: 7,
  mentalFatigueScore: 4,
  errorImpactScore: 5,
  recoveryScore: 6,
  processOrientationScore: 7,
  notes: "",
};

const initialWellbeingForm: WellbeingFormState = {
  weekContext: "",
  stressors: [],
  protectiveFactors: ["Rutina de recuperacion"],
  emotionalExhaustionScore: 4,
  cynicismScore: 2,
  motivationScore: 7,
  sleepDisruptionScore: 3,
  concentrationDifficultyScore: 3,
  externalPressureScore: 5,
  institutionalSupportScore: 6,
  violenceExposureScore: 1,
  recoveryQualityScore: 6,
  workloadScore: 5,
  notes: "",
};

const exerciseConfig: Record<
  ExerciseType,
  {
    label: string;
    eyebrow: string;
    title: string;
    description: string;
    icon: IconType;
  }
> = {
  focus_reset: {
    label: "Reset de foco",
    eyebrow: "Concentracion",
    title: "Volver al presente",
    description: "Una rutina breve para cortar ruido externo y recuperar la siguiente decision.",
    icon: Target,
  },
  pressure_scenario: {
    label: "Escenario de presion",
    eyebrow: "Presion competitiva",
    title: "Responder sin perder criterio",
    description: "Practica situaciones de banco, publico, jugadores o resultado cerrado.",
    icon: ShieldCheck,
  },
  self_talk: {
    label: "Dialogo interno",
    eyebrow: "Confianza arbitral",
    title: "Convertir pensamiento en consigna",
    description: "Transforma autocritica o miedo al error en una frase operativa.",
    icon: Brain,
  },
  team_prebrief: {
    label: "Charla arbitral",
    eyebrow: "Preparacion pre partido",
    title: "Ordenar al equipo antes de competir",
    description: "Define roles, foco comun y comunicacion para reducir improvisacion.",
    icon: ClipboardList,
  },
};

const scenarioOptions: Array<{
  id: string;
  exerciseType: ExerciseType;
  title: string;
  prompt: string;
  defaultStrategy: string;
  defaultCommunication: string;
  defaultAction: string;
}> = [
  {
    id: "reset-after-protest",
    exerciseType: "focus_reset",
    title: "Protesta fuerte despues de una decision",
    prompt: "Despues de una protesta intensa, necesitas volver al juego sin arbitrar desde el enojo o la duda.",
    defaultStrategy: "Respirar, ubicar zona activa y observar la siguiente accion sin compensar.",
    defaultCommunication: "Sigo en control, proxima decision.",
    defaultAction: "Retomar ubicacion, contacto visual con asistente y primera consigna simple.",
  },
  {
    id: "reset-after-mistake",
    exerciseType: "focus_reset",
    title: "Error percibido durante el partido",
    prompt: "Crees que pudiste equivocarte y aparece ruido mental mientras el partido sigue.",
    defaultStrategy: "Separar la jugada anterior de la siguiente y decidir solo con informacion observable.",
    defaultCommunication: "Una accion a la vez.",
    defaultAction: "Buscar angulo, bajar velocidad mental y no compensar.",
  },
  {
    id: "bench-pressure",
    exerciseType: "pressure_scenario",
    title: "Banco tecnico presiona una sancion",
    prompt: "Un banco tecnico insiste en condicionar tu criterio despues de una decision disciplinaria.",
    defaultStrategy: "Reconocer el reclamo sin debatir, mantener distancia y volver al criterio tecnico.",
    defaultCommunication: "Ya esta visto, seguimos jugando.",
    defaultAction: "Advertencia breve, registro mental del comportamiento y comunicacion con cuarto arbitro.",
  },
  {
    id: "late-match-pressure",
    exerciseType: "pressure_scenario",
    title: "Final cerrado con ambiente alto",
    prompt: "Ultimos minutos, resultado ajustado y cada contacto genera presion emocional.",
    defaultStrategy: "Simplificar umbral, priorizar angulo y sostener misma vara.",
    defaultCommunication: "Mismo criterio hasta el final.",
    defaultAction: "Ajustar proximidad, apoyarse en asistente y comunicar preventivamente.",
  },
  {
    id: "self-talk-fear",
    exerciseType: "self_talk",
    title: "Miedo a equivocarte en una jugada grande",
    prompt: "Aparece pensamiento de error posible justo antes de una decision importante.",
    defaultStrategy: "Pasar de juicio personal a tarea observable.",
    defaultCommunication: "Veo, interpreto, decido.",
    defaultAction: "Nombrar la consigna antes del reinicio y volver al proceso.",
  },
  {
    id: "self-talk-criticism",
    exerciseType: "self_talk",
    title: "Critica externa despues del partido anterior",
    prompt: "Llegas con comentarios externos de un partido anterior y necesitas competir con claridad.",
    defaultStrategy: "Separar opinion externa de informacion util.",
    defaultCommunication: "No arbitro comentarios, arbitro hechos.",
    defaultAction: "Elegir un objetivo tecnico y medirlo al cierre.",
  },
  {
    id: "team-prebrief-var",
    exerciseType: "team_prebrief",
    title: "Charla prepartido con foco en equipo arbitral",
    prompt: "Antes del partido, ordenas comunicacion, ayudas y criterios clave con el equipo.",
    defaultStrategy: "Definir zonas de ayuda, lenguaje breve y criterio disciplinario compartido.",
    defaultCommunication: "Informacion clara, corta y util.",
    defaultAction: "Acordar palabras clave, prioridades de asistencia y cierre post partido.",
  },
  {
    id: "team-prebrief-risk",
    exerciseType: "team_prebrief",
    title: "Partido con antecedentes de conflicto",
    prompt: "Hay antecedentes de protestas, tension o violencia verbal. Necesitas un plan mental y comunicacional.",
    defaultStrategy: "Anticipar focos de conflicto y acordar respuestas proporcionales.",
    defaultCommunication: "Prevencion, calma y respaldo.",
    defaultAction: "Protocolizar advertencias, registro de incidentes y pedido de apoyo si escala.",
  },
];

const initialScenario = scenarioOptions[0];

const initialExerciseForm: ExerciseFormState = {
  exerciseType: initialScenario.exerciseType,
  scenarioId: initialScenario.id,
  scenarioTitle: initialScenario.title,
  pressureLevel: 6,
  beforeScore: 5,
  afterScore: 7,
  clarityScore: 7,
  responseStrategy: initialScenario.defaultStrategy,
  internalDialogueBefore: "Me quede pensando en la jugada anterior.",
  internalDialogueAfter: initialScenario.defaultCommunication,
  communicationPhrase: initialScenario.defaultCommunication,
  actionPlan: initialScenario.defaultAction,
  notes: "",
};

const pressureOptions = [
  "Partido exigente",
  "Jugadores",
  "Banco tecnico",
  "Publico",
  "Redes / medios",
  "Designacion importante",
  "Error anterior",
];

const errorFactorOptions = [
  "Fatiga",
  "Ubicacion",
  "Presion externa",
  "Comunicacion",
  "Interpretacion",
  "Contexto del partido",
  "Ayuda VAR / asistente",
];

const stressorOptions = [
  "Critica publica",
  "Amenazas / insultos",
  "Carga de partidos",
  "Falta de apoyo",
  "Redes / medios",
  "Descanso alterado",
  "Molestias fisicas",
];

const protectiveOptions = [
  "Apoyo institucional",
  "Equipo arbitral",
  "Familia / entorno",
  "Preparacion fisica",
  "Rutina de recuperacion",
  "Mentor / asesor",
  "Desconexion de redes",
];

export function PsychologyTrainingClient() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [wellbeingForm, setWellbeingForm] = useState<WellbeingFormState>(initialWellbeingForm);
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(initialExerciseForm);
  const [checkins, setCheckins] = useState<PsychologyEntry[]>([]);
  const [wellbeingAssessments, setWellbeingAssessments] = useState<WellbeingEntry[]>([]);
  const [exerciseSessions, setExerciseSessions] = useState<ExerciseEntry[]>([]);
  const [summary, setSummary] = useState<PsychologySummary | null>(null);
  const [wellbeingSummary, setWellbeingSummary] = useState<WellbeingSummary | null>(null);
  const [exerciseSummary, setExerciseSummary] = useState<ExerciseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWellbeing, setSavingWellbeing] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [wellbeingMessage, setWellbeingMessage] = useState<string | null>(null);
  const [exerciseMessage, setExerciseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPsychologyData() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/psychology", { cache: "no-store" });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No se pudo cargar Psicologia Arbitral.");
        }

        setCheckins(data.checkins ?? []);
        setSummary(data.summary ?? null);
        setWellbeingAssessments(data.wellbeingAssessments ?? []);
        setWellbeingSummary(data.wellbeingSummary ?? null);
        setExerciseSessions(data.exerciseSessions ?? []);
        setExerciseSummary(data.exerciseSummary ?? null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Psicologia Arbitral.");
      } finally {
        setLoading(false);
      }
    }

    void loadPsychologyData();
  }, []);

  const latestFeedback = checkins[0]?.feedback ?? null;
  const latestExerciseFeedback = exerciseSessions[0]?.feedback ?? null;
  const mode = modeConfig[form.checkinType];
  const ModeIcon = mode.icon;
  const exerciseMode = exerciseConfig[exerciseForm.exerciseType];
  const ExerciseIcon = exerciseMode.icon;
  const selectedScenario =
    scenarioOptions.find((scenario) => scenario.id === exerciseForm.scenarioId) ?? initialScenario;
  const visibleScenarios = scenarioOptions.filter((scenario) => scenario.exerciseType === exerciseForm.exerciseType);
  const localScore = useMemo(() => estimateLocalScore(form), [form]);
  const localWellbeingRisk = useMemo(() => estimateWellbeingRisk(wellbeingForm), [wellbeingForm]);
  const localExerciseImprovement = exerciseForm.afterScore - exerciseForm.beforeScore;

  function setMode(nextMode: CheckInType) {
    setForm((current) => ({
      ...current,
      checkinType: nextMode,
    }));
    setMessage(null);
    setError(null);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateWellbeingField<K extends keyof WellbeingFormState>(key: K, value: WellbeingFormState[K]) {
    setWellbeingForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateExerciseField<K extends keyof ExerciseFormState>(key: K, value: ExerciseFormState[K]) {
    setExerciseForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setExerciseType(nextType: ExerciseType) {
    const scenario = scenarioOptions.find((item) => item.exerciseType === nextType) ?? initialScenario;
    setExerciseForm((current) => ({
      ...current,
      exerciseType: nextType,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      responseStrategy: scenario.defaultStrategy,
      communicationPhrase: scenario.defaultCommunication,
      internalDialogueAfter: scenario.defaultCommunication,
      actionPlan: scenario.defaultAction,
    }));
    setExerciseMessage(null);
    setError(null);
  }

  function setExerciseScenario(nextScenarioId: string) {
    const scenario = scenarioOptions.find((item) => item.id === nextScenarioId) ?? selectedScenario;
    setExerciseForm((current) => ({
      ...current,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      responseStrategy: scenario.defaultStrategy,
      communicationPhrase: scenario.defaultCommunication,
      internalDialogueAfter: scenario.defaultCommunication,
      actionPlan: scenario.defaultAction,
    }));
  }

  function toggleErrorFactor(factor: string) {
    setForm((current) => ({
      ...current,
      errorFactors: current.errorFactors.includes(factor)
        ? current.errorFactors.filter((item) => item !== factor)
        : [...current.errorFactors, factor],
    }));
  }

  function toggleWellbeingList(key: "stressors" | "protectiveFactors", value: string) {
    setWellbeingForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }

  async function saveCheckIn() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/psychology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_checkin",
          payload: {
            ...form,
            incidentMinute: form.incidentMinute ? Number(form.incidentMinute) : null,
          },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el check-in.");
      }

      setCheckins(data.checkins ?? []);
      setSummary(data.summary ?? null);
      setWellbeingAssessments(data.wellbeingAssessments ?? []);
      setWellbeingSummary(data.wellbeingSummary ?? null);
      setExerciseSessions(data.exerciseSessions ?? []);
      setExerciseSummary(data.exerciseSummary ?? null);
      setMessage(data.message ?? "Check-in guardado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el check-in.");
    } finally {
      setSaving(false);
    }
  }

  async function saveWellbeing() {
    setSavingWellbeing(true);
    setWellbeingMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/psychology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_wellbeing",
          payload: wellbeingForm,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar bienestar semanal.");
      }

      setCheckins(data.checkins ?? []);
      setSummary(data.summary ?? null);
      setWellbeingAssessments(data.wellbeingAssessments ?? []);
      setWellbeingSummary(data.wellbeingSummary ?? null);
      setExerciseSessions(data.exerciseSessions ?? []);
      setExerciseSummary(data.exerciseSummary ?? null);
      setWellbeingMessage(data.message ?? "Bienestar semanal guardado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar bienestar semanal.");
    } finally {
      setSavingWellbeing(false);
    }
  }

  async function saveExercise() {
    setSavingExercise(true);
    setExerciseMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/psychology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_exercise",
          payload: exerciseForm,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el ejercicio.");
      }

      setCheckins(data.checkins ?? []);
      setSummary(data.summary ?? null);
      setWellbeingAssessments(data.wellbeingAssessments ?? []);
      setWellbeingSummary(data.wellbeingSummary ?? null);
      setExerciseSessions(data.exerciseSessions ?? []);
      setExerciseSummary(data.exerciseSummary ?? null);
      setExerciseMessage(data.message ?? "Ejercicio guardado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el ejercicio.");
    } finally {
      setSavingExercise(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_36%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Psicologia arbitral
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight md:text-5xl">
              Preparacion mental del arbitro
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
              Rutinas breves para foco, confianza, presion, cierre post partido y aprendizaje despues del error.
            </p>
          </div>

          <div className="rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
            <div className="mb-2 flex items-center gap-2 font-black">
              <AlertTriangle size={18} />
              Orientativo
            </div>
            No reemplaza acompanamiento profesional. Si hay malestar persistente, buscá apoyo especializado.
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard icon={Brain} label="Readiness mental" value={formatScore(summary?.latestScore)} detail={summary?.latestStatus ?? "Sin registros"} active />
        <MetricCard icon={Flame} label="Presion promedio" value={formatScale(summary?.pressureAverage)} detail="Ultimos check-ins" />
        <MetricCard icon={ShieldCheck} label="Confianza" value={formatScale(summary?.confidenceAverage)} detail="Promedio personal" />
        <MetricCard icon={Sparkles} label="Recuperacion" value={formatScale(summary?.recoveryAverage)} detail={`${summary?.total ?? 0} registros`} />
        <MetricCard icon={HeartPulse} label="Desgaste" value={formatScore(wellbeingSummary?.latestRiskScore)} detail={wellbeingSummary?.latestRiskLevel ?? "Sin lectura"} />
        <MetricCard icon={ClipboardList} label="Ejercicios" value={`${exerciseSummary?.total ?? 0}`} detail={formatImprovement(exerciseSummary?.averageImprovement)} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {(Object.keys(modeConfig) as CheckInType[]).map((key) => {
              const item = modeConfig[key];
              const Icon = item.icon;
              const active = form.checkinType === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded-[26px] border p-4 text-left transition ${
                    active
                      ? "border-[#6fc11f]/60 bg-[#6fc11f]/15 shadow-[0_0_28px_rgba(111,193,31,0.14)]"
                      : "border-white/10 bg-[#101b24] hover:border-[#6fc11f]/35"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                      <Icon size={22} />
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">
                      MVP
                    </span>
                  </div>
                  <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                    {item.eyebrow}
                  </p>
                  <h2 className="mt-2 text-lg font-black text-white">{item.label}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>
                </button>
              );
            })}
          </div>

          <article className="rounded-[28px] border border-white/10 bg-[#071019] p-5">
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
              Feedback actual
            </p>
            {latestFeedback ? (
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                <p className="text-xl font-black text-white">{latestFeedback.summary}</p>
                <p>{latestFeedback.focus}</p>
                <p>{latestFeedback.action}</p>
                <p className="text-[#b7ff8a]">{latestFeedback.risk}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                Guarda tu primer check-in para recibir una devolucion basada en foco, presion, confianza y recuperacion.
              </p>
            )}
          </article>
        </div>

        <div className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                {mode.eyebrow}
              </p>
              <h2 className="mt-3 text-3xl font-black">{mode.title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{mode.description}</p>
            </div>
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
              <ModeIcon size={28} />
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Field label="Contexto / partido">
              <input
                value={form.matchContext}
                onChange={(event) => updateField("matchContext", event.target.value)}
                placeholder="Ej: final cerrado, clasico, debut, partido normal"
                className="control-input"
              />
            </Field>

            <Field label="Fuente principal de presion">
              <select
                value={form.pressureSource}
                onChange={(event) => updateField("pressureSource", event.target.value)}
                className="control-input"
              >
                {pressureOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {form.checkinType === "error_recovery" && (
            <div className="mt-5 grid gap-4 lg:grid-cols-[160px_1fr]">
              <Field label="Minuto">
                <input
                  type="number"
                  min={0}
                  max={130}
                  value={form.incidentMinute}
                  onChange={(event) => updateField("incidentMinute", event.target.value)}
                  className="control-input"
                />
              </Field>
              <Field label="Situacion">
                <input
                  value={form.incidentSummary}
                  onChange={(event) => updateField("incidentSummary", event.target.value)}
                  placeholder="Que paso en la jugada o decision"
                  className="control-input"
                />
              </Field>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ScaleControl label="Activacion" value={form.activationScore} low="Baja" high="Muy alta" onChange={(value) => updateField("activationScore", value)} />
            <ScaleControl label="Confianza" value={form.confidenceScore} low="Fragil" high="Solida" onChange={(value) => updateField("confidenceScore", value)} />
            <ScaleControl label="Presion" value={form.pressureScore} low="Baja" high="Alta" onChange={(value) => updateField("pressureScore", value)} />
            <ScaleControl label="Concentracion" value={form.concentrationScore} low="Dispersa" high="Foco total" onChange={(value) => updateField("concentrationScore", value)} />
            <ScaleControl label="Control emocional" value={form.emotionalControlScore} low="Inestable" high="Sereno" onChange={(value) => updateField("emotionalControlScore", value)} />
            <ScaleControl label="Fatiga mental" value={form.mentalFatigueScore} low="Baja" high="Alta" onChange={(value) => updateField("mentalFatigueScore", value)} />
          </div>

          {form.checkinType !== "pre_match" && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <ScaleControl label="Recuperacion" value={form.recoveryScore} low="Arrastro carga" high="Cierro bien" onChange={(value) => updateField("recoveryScore", value)} />
              <ScaleControl label="Orientacion al proceso" value={form.processOrientationScore} low="Resultado/opinion" high="Proceso" onChange={(value) => updateField("processOrientationScore", value)} />
            </div>
          )}

          {form.checkinType === "error_recovery" && (
            <>
              <div className="mt-5 rounded-[26px] border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                  Factores posibles
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {errorFactorOptions.map((factor) => {
                    const active = form.errorFactors.includes(factor);
                    return (
                      <button
                        key={factor}
                        type="button"
                        onClick={() => toggleErrorFactor(factor)}
                        className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                          active
                            ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                            : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#6fc11f]/40"
                        }`}
                      >
                        {factor}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4">
                <ScaleControl label="Impacto del error" value={form.errorImpactScore} low="Bajo" high="Alto" onChange={(value) => updateField("errorImpactScore", value)} />
              </div>
            </>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Field label={form.checkinType === "pre_match" ? "Objetivo de proceso" : "Aprendizaje"}>
              <textarea
                value={form.checkinType === "pre_match" ? form.focusGoal : form.learning}
                onChange={(event) =>
                  form.checkinType === "pre_match"
                    ? updateField("focusGoal", event.target.value)
                    : updateField("learning", event.target.value)
                }
                rows={4}
                className="control-input min-h-28 resize-none"
              />
            </Field>

            <Field label={form.checkinType === "pre_match" ? "Frase de reset" : "Proxima accion"}>
              <textarea
                value={form.checkinType === "pre_match" ? form.resetCue : form.nextAction}
                onChange={(event) =>
                  form.checkinType === "pre_match"
                    ? updateField("resetCue", event.target.value)
                    : updateField("nextAction", event.target.value)
                }
                rows={4}
                className="control-input min-h-28 resize-none"
              />
            </Field>
          </div>

          <div className="mt-5">
            <Field label="Notas privadas">
              <textarea
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                rows={3}
                placeholder="Detalle libre para revisar despues"
                className="control-input min-h-24 resize-none"
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                Lectura estimada
              </p>
              <p className="mt-1 text-3xl font-black">{localScore}/100</p>
            </div>
            <button
              type="button"
              onClick={saveCheckIn}
              disabled={saving}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
            >
              <Save size={20} />
              {saving ? "Guardando..." : "Guardar check-in"}
            </button>
          </div>

          {message && (
            <div className="mt-4 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
              {error}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                <HeartPulse size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                  Bienestar semanal
                </p>
                <h2 className="text-2xl font-black">Riesgo de desgaste arbitral</h2>
              </div>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-400">
              Una lectura orientativa sobre agotamiento, presion externa, recuperacion, apoyo y exposicion a incidentes. Sirve para prevenir, no para diagnosticar.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Contexto de la semana">
                <input
                  value={wellbeingForm.weekContext}
                  onChange={(event) => updateWellbeingField("weekContext", event.target.value)}
                  placeholder="Ej: doble fecha, partido conflictivo, semana normal"
                  className="control-input"
                />
              </Field>

              <div className="rounded-[22px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#6fc11f]">
                  Lectura estimada
                </p>
                <p className="mt-1 text-3xl font-black">{localWellbeingRisk}/100</p>
                <p className="mt-1 text-xs font-bold text-zinc-300">{wellbeingRiskLabel(localWellbeingRisk)}</p>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Estresores presentes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {stressorOptions.map((item) => (
                  <Chip
                    key={item}
                    active={wellbeingForm.stressors.includes(item)}
                    onClick={() => toggleWellbeingList("stressors", item)}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-[26px] border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Factores protectores
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {protectiveOptions.map((item) => (
                  <Chip
                    key={item}
                    active={wellbeingForm.protectiveFactors.includes(item)}
                    onClick={() => toggleWellbeingList("protectiveFactors", item)}
                  >
                    {item}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <ScaleControl label="Agotamiento emocional" value={wellbeingForm.emotionalExhaustionScore} low="Bajo" high="Alto" onChange={(value) => updateWellbeingField("emotionalExhaustionScore", value)} />
              <ScaleControl label="Cinismo / irritabilidad" value={wellbeingForm.cynicismScore} low="Bajo" high="Alto" onChange={(value) => updateWellbeingField("cynicismScore", value)} />
              <ScaleControl label="Motivacion" value={wellbeingForm.motivationScore} low="Baja" high="Alta" onChange={(value) => updateWellbeingField("motivationScore", value)} />
              <ScaleControl label="Sueno alterado" value={wellbeingForm.sleepDisruptionScore} low="Bajo" high="Alto" onChange={(value) => updateWellbeingField("sleepDisruptionScore", value)} />
              <ScaleControl label="Dificultad de concentracion" value={wellbeingForm.concentrationDifficultyScore} low="Baja" high="Alta" onChange={(value) => updateWellbeingField("concentrationDifficultyScore", value)} />
              <ScaleControl label="Presion externa" value={wellbeingForm.externalPressureScore} low="Baja" high="Alta" onChange={(value) => updateWellbeingField("externalPressureScore", value)} />
              <ScaleControl label="Apoyo institucional" value={wellbeingForm.institutionalSupportScore} low="Bajo" high="Alto" onChange={(value) => updateWellbeingField("institutionalSupportScore", value)} />
              <ScaleControl label="Violencia / amenazas" value={wellbeingForm.violenceExposureScore} low="Nula" high="Alta" onChange={(value) => updateWellbeingField("violenceExposureScore", value)} />
              <ScaleControl label="Recuperacion" value={wellbeingForm.recoveryQualityScore} low="Mala" high="Buena" onChange={(value) => updateWellbeingField("recoveryQualityScore", value)} />
              <ScaleControl label="Carga arbitral" value={wellbeingForm.workloadScore} low="Baja" high="Alta" onChange={(value) => updateWellbeingField("workloadScore", value)} />
            </div>

            <div className="mt-5">
              <Field label="Notas privadas">
                <textarea
                  value={wellbeingForm.notes}
                  onChange={(event) => updateWellbeingField("notes", event.target.value)}
                  rows={3}
                  placeholder="Que necesitas cuidar antes de la proxima designacion"
                  className="control-input min-h-24 resize-none"
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4 text-sm leading-6 text-yellow-100">
                Esta lectura no reemplaza atencion profesional ni protocolos institucionales ante violencia.
              </div>
              <button
                type="button"
                onClick={saveWellbeing}
                disabled={savingWellbeing}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
              >
                <Save size={20} />
                {savingWellbeing ? "Guardando..." : "Guardar bienestar"}
              </button>
            </div>

            {wellbeingMessage && (
              <div className="mt-4 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
                {wellbeingMessage}
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <article className="rounded-[28px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
              <LifeBuoy className="text-[#6fc11f]" size={26} />
              <p className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">
                Ultima lectura
              </p>
              {wellbeingAssessments[0]?.feedback ? (
                <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-200">
                  <p className="text-2xl font-black text-white">{wellbeingAssessments[0].feedback.summary}</p>
                  <p>{wellbeingAssessments[0].feedback.priority}</p>
                  <p>{wellbeingAssessments[0].feedback.action}</p>
                  <p className="text-[#b7ff8a]">{wellbeingAssessments[0].feedback.protection}</p>
                  <p className="text-xs text-zinc-500">{wellbeingAssessments[0].feedback.note}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Guarda una lectura semanal para ver riesgo, prioridad y accion recomendada.
                </p>
              )}
            </article>

            <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Historial bienestar
              </p>
              <div className="mt-4 space-y-3">
                {wellbeingAssessments.length === 0 && (
                  <p className="text-sm text-zinc-400">Sin registros semanales.</p>
                )}

                {wellbeingAssessments.slice(0, 4).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black">{formatScore(entry.burnout_risk_score)}</p>
                      <span className="rounded-full border border-[#6fc11f]/25 px-3 py-1 text-[10px] font-black text-[#6fc11f]">
                        {entry.burnout_risk_level ?? "Nivel"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">{formatDate(entry.created_at)}</p>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </div>
      </section>

      <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-[28px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-black/30 text-[#6fc11f]">
                <ExerciseIcon size={24} />
              </div>
              <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
                Ejercicios guiados
              </p>
              <h2 className="mt-2 text-2xl font-black">Entrenamiento mental aplicado</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Practica situaciones reales de arbitraje: foco, presion, dialogo interno y charla prepartido.
              </p>
            </div>

            <div className="grid gap-3">
              {(Object.keys(exerciseConfig) as ExerciseType[]).map((key) => {
                const item = exerciseConfig[key];
                const Icon = item.icon;
                const active = exerciseForm.exerciseType === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setExerciseType(key)}
                    className={`rounded-[24px] border p-4 text-left transition ${
                      active
                        ? "border-[#6fc11f]/60 bg-[#6fc11f]/15"
                        : "border-white/10 bg-black/20 hover:border-[#6fc11f]/35"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                        <Icon size={20} />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6fc11f]">
                          {item.eyebrow}
                        </p>
                        <p className="mt-1 text-sm font-black text-white">{item.label}</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Ultimo ejercicio
              </p>
              {latestExerciseFeedback ? (
                <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
                  <p className="text-xl font-black text-white">{latestExerciseFeedback.summary}</p>
                  <p>{latestExerciseFeedback.learning}</p>
                  <p className="text-[#b7ff8a]">{latestExerciseFeedback.nextCue}</p>
                  <p>{latestExerciseFeedback.application}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-zinc-400">
                  Guarda un ejercicio para ver una devolucion sobre aplicacion, claridad y consigna mental.
                </p>
              )}
            </article>
          </aside>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                  {exerciseMode.eyebrow}
                </p>
                <h2 className="mt-3 text-3xl font-black">{exerciseMode.title}</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{exerciseMode.description}</p>
              </div>
              <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3 text-right">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6fc11f]">
                  Mejora estimada
                </p>
                <p className="mt-1 text-3xl font-black">{localExerciseImprovement >= 0 ? "+" : ""}{localExerciseImprovement}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_220px]">
              <Field label="Escenario">
                <select
                  value={exerciseForm.scenarioId}
                  onChange={(event) => setExerciseScenario(event.target.value)}
                  className="control-input"
                >
                  {visibleScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.title}
                    </option>
                  ))}
                </select>
              </Field>

              <ScaleControl
                label="Presion del escenario"
                value={exerciseForm.pressureLevel}
                low="Baja"
                high="Alta"
                onChange={(value) => updateExerciseField("pressureLevel", value)}
              />
            </div>

            <div className="mt-4 rounded-[26px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#6fc11f]">
                Situacion
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-200">{selectedScenario.prompt}</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <ScaleControl
                label="Antes"
                value={exerciseForm.beforeScore}
                low="Bloqueado"
                high="Claro"
                onChange={(value) => updateExerciseField("beforeScore", value)}
              />
              <ScaleControl
                label="Despues"
                value={exerciseForm.afterScore}
                low="Bloqueado"
                high="Claro"
                onChange={(value) => updateExerciseField("afterScore", value)}
              />
              <ScaleControl
                label="Claridad"
                value={exerciseForm.clarityScore}
                low="Confuso"
                high="Aplicable"
                onChange={(value) => updateExerciseField("clarityScore", value)}
              />
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Field label="Dialogo interno antes">
                <textarea
                  value={exerciseForm.internalDialogueBefore}
                  onChange={(event) => updateExerciseField("internalDialogueBefore", event.target.value)}
                  rows={4}
                  placeholder="Que pensamiento o ruido aparece"
                  className="control-input min-h-28 resize-none"
                />
              </Field>

              <Field label="Dialogo interno despues">
                <textarea
                  value={exerciseForm.internalDialogueAfter}
                  onChange={(event) => updateExerciseField("internalDialogueAfter", event.target.value)}
                  rows={4}
                  placeholder="Converti el pensamiento en una consigna breve"
                  className="control-input min-h-28 resize-none"
                />
              </Field>

              <Field label="Estrategia de respuesta">
                <textarea
                  value={exerciseForm.responseStrategy}
                  onChange={(event) => updateExerciseField("responseStrategy", event.target.value)}
                  rows={4}
                  placeholder="Que vas a hacer tecnica y emocionalmente"
                  className="control-input min-h-28 resize-none"
                />
              </Field>

              <Field label="Frase operativa / comunicacion">
                <textarea
                  value={exerciseForm.communicationPhrase}
                  onChange={(event) => updateExerciseField("communicationPhrase", event.target.value)}
                  rows={4}
                  placeholder="Frase breve para vos o para comunicar en cancha"
                  className="control-input min-h-28 resize-none"
                />
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Plan de accion">
                <textarea
                  value={exerciseForm.actionPlan}
                  onChange={(event) => updateExerciseField("actionPlan", event.target.value)}
                  rows={3}
                  placeholder="Como lo llevas al proximo partido o entrenamiento"
                  className="control-input min-h-24 resize-none"
                />
              </Field>
            </div>

            <div className="mt-5">
              <Field label="Notas privadas">
                <textarea
                  value={exerciseForm.notes}
                  onChange={(event) => updateExerciseField("notes", event.target.value)}
                  rows={3}
                  placeholder="Observaciones personales del ejercicio"
                  className="control-input min-h-24 resize-none"
                />
              </Field>
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-[26px] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                  Registro de practica
                </p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">
                  Queda guardado como ejercicio psicologico aplicado, separado del check-in.
                </p>
              </div>
              <button
                type="button"
                onClick={saveExercise}
                disabled={savingExercise}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
              >
                <Save size={20} />
                {savingExercise ? "Guardando..." : "Guardar ejercicio"}
              </button>
            </div>

            {exerciseMessage && (
              <div className="mt-4 rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-4 text-sm font-bold text-[#b7ff8a]">
                {exerciseMessage}
              </div>
            )}

            <div className="mt-6 grid gap-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
                Practicas recientes
              </p>
              {exerciseSessions.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                  Todavia no hay ejercicios guiados guardados.
                </div>
              )}
              {exerciseSessions.slice(0, 4).map((entry) => (
                <article key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[180px_1fr_110px] md:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6fc11f]">
                      {exerciseTypeLabel(entry.exercise_type)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">{formatDate(entry.created_at)}</p>
                  </div>
                  <p className="text-sm leading-6 text-zinc-300">
                    {entry.scenario_title ?? entry.feedback?.learning ?? "Ejercicio guardado."}
                  </p>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                    <p className="text-xl font-black text-white">
                      {formatImprovementValue(entry.before_score, entry.after_score)}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                      mejora
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[34px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <ClipboardList size={24} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
              Historial
            </p>
            <h2 className="text-2xl font-black">Ultimos registros</h2>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {loading && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Cargando registros...
            </div>
          )}

          {!loading && checkins.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
              Todavia no hay check-ins psicologicos guardados.
            </div>
          )}

          {!loading &&
            checkins.slice(0, 8).map((entry) => (
              <article key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[170px_1fr_120px] md:items-center">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[#6fc11f]">
                    {modeConfig[entry.checkin_type]?.label ?? "Check-in"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(entry.created_at)}</p>
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  {entry.feedback?.focus ?? "Registro guardado."}
                </p>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
                  <p className="text-xl font-black text-white">{formatScore(entry.mental_score)}</p>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
                    {entry.mental_status ?? "Estado"}
                  </p>
                </div>
              </article>
            ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  active = false,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <article className={`rounded-[26px] border p-4 shadow-2xl ${active ? "border-[#6fc11f]/40 bg-[#6fc11f]/10" : "border-white/10 bg-[#101b24]"}`}>
      <Icon className="text-[#6fc11f]" size={24} />
      <p className="mt-4 text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#6fc11f]">{detail}</p>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ScaleControl({
  label,
  value,
  low,
  high,
  onChange,
}: {
  label: string;
  value: number;
  low: string;
  high: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black text-white">{label}</p>
        <span className="rounded-full border border-[#6fc11f]/30 bg-[#6fc11f]/10 px-3 py-1 text-xs font-black text-[#6fc11f]">
          {value}/10
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-4 w-full accent-[#6fc11f]"
      />
      <div className="mt-2 flex justify-between text-[11px] font-bold text-zinc-500">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function Chip({
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
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-xs font-black transition ${
        active
          ? "border-[#6fc11f] bg-[#6fc11f] text-black"
          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-[#6fc11f]/40"
      }`}
    >
      {children}
    </button>
  );
}

function estimateLocalScore(form: FormState) {
  let score = 70;
  score -= Math.abs(form.activationScore - 6) * 5;
  score += (form.confidenceScore - 5) * 4;
  score += (form.concentrationScore - 5) * 3;
  score += (form.emotionalControlScore - 5) * 3;
  score += (form.processOrientationScore - 5) * 2;
  score -= form.pressureScore * 2.8;
  score -= form.mentalFatigueScore * 2.5;

  if (form.checkinType !== "pre_match") score += (form.recoveryScore - 5) * 4;
  if (form.checkinType === "error_recovery") {
    score -= form.errorImpactScore * 2.5;
    score += form.learning ? 5 : -4;
    score += form.nextAction ? 4 : -3;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function estimateWellbeingRisk(form: WellbeingFormState) {
  const invertedMotivation = invertScale(form.motivationScore);
  const invertedSupport = invertScale(form.institutionalSupportScore);
  const invertedRecovery = invertScale(form.recoveryQualityScore);
  const weighted =
    (form.emotionalExhaustionScore * 1.4 +
      form.cynicismScore * 1 +
      invertedMotivation * 1 +
      form.sleepDisruptionScore * 0.9 +
      form.concentrationDifficultyScore * 0.9 +
      form.externalPressureScore * 1.1 +
      invertedSupport * 1 +
      form.violenceExposureScore * 1.1 +
      invertedRecovery * 1.1 +
      form.workloadScore * 0.9) /
    10.4;

  return Math.max(0, Math.min(100, Math.round(((weighted - 1) / 9) * 100)));
}

function invertScale(value: number) {
  return 11 - value;
}

function wellbeingRiskLabel(score: number) {
  if (score < 35) return "Riesgo bajo";
  if (score < 60) return "Atencion preventiva";
  if (score < 80) return "Riesgo alto";
  return "Riesgo critico";
}

function exerciseTypeLabel(value: ExerciseType | null | undefined) {
  if (!value) return "Ejercicio";
  return exerciseConfig[value]?.label ?? "Ejercicio";
}

function formatImprovement(value: number | null | undefined) {
  if (typeof value !== "number") return "Sin practicas";
  return value > 0 ? `+${value} promedio` : `${value} promedio`;
}

function formatImprovementValue(before: number | null | undefined, after: number | null | undefined) {
  if (typeof before !== "number" || typeof after !== "number") return "--";
  const value = after - before;
  return value > 0 ? `+${value}` : `${value}`;
}

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/100` : "--";
}

function formatScale(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/10` : "--";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
