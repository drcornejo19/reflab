"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  LifeBuoy,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  getPsychologyModuleDefinition,
  normalizePsychologyModuleSlug,
  psychologyInteractionLabels,
  psychologyModuleDefinitions,
  type PsychologyFutureMetrics,
  type PsychologyModuleOverview,
  type PsychologyModuleSlug,
  type PsychologyUnifiedRecord,
} from "@/lib/psychology";
import { useUserRole } from "@/lib/useUserRole";

type PsychologyPageData = {
  modules: PsychologyModuleOverview[];
  records: PsychologyUnifiedRecord[];
  futureMetrics: PsychologyFutureMetrics;
};

type ExerciseType = "focus_reset" | "pressure_scenario" | "self_talk";
type ExerciseModuleSlug =
  | "presion-competitiva"
  | "concentracion-foco"
  | "confianza-arbitral";

type PreMatchFormState = {
  matchContext: string;
  pressureSource: string;
  focusGoal: string;
  resetCue: string;
  activationScore: number;
  confidenceScore: number;
  pressureScore: number;
  concentrationScore: number;
  emotionalControlScore: number;
  mentalFatigueScore: number;
  notes: string;
};

type PostMatchFormState = {
  matchContext: string;
  incidentSummary: string;
  learning: string;
  nextAction: string;
  pressureScore: number;
  concentrationScore: number;
  emotionalControlScore: number;
  mentalFatigueScore: number;
  recoveryScore: number;
  processOrientationScore: number;
  notes: string;
};

type ErrorRecoveryFormState = {
  matchContext: string;
  incidentMinute: string;
  incidentSummary: string;
  errorFactors: string[];
  learning: string;
  nextAction: string;
  confidenceScore: number;
  pressureScore: number;
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
  motivationScore: number;
  externalPressureScore: number;
  institutionalSupportScore: number;
  recoveryQualityScore: number;
  concentrationDifficultyScore: number;
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

type ScenarioOption = {
  id: string;
  exerciseType: ExerciseType;
  title: string;
  prompt: string;
  defaultStrategy: string;
  defaultCommunication: string;
  defaultAction: string;
  defaultBefore: string;
};

type IconType = ComponentType<{ size?: number; className?: string }>;

const moduleIconMap: Record<PsychologyModuleSlug, IconType> = {
  "gestion-error": RefreshCcw,
  "presion-competitiva": ShieldCheck,
  "concentracion-foco": Target,
  "confianza-arbitral": Brain,
  resiliencia: LifeBuoy,
  "preparacion-mental-pre-partido": Sparkles,
  "evaluacion-post-partido": CheckCircle2,
  "sin-clasificar": ClipboardList,
};

const defaultModules: PsychologyModuleOverview[] = psychologyModuleDefinitions
  .filter((moduleDefinition) => moduleDefinition.slug !== "sin-clasificar")
  .map((moduleDefinition) => ({
    ...moduleDefinition,
    statusLabel: moduleDefinition.status === "available" ? "Disponible" : "En construccion",
    recordCount: 0,
    progressLabel: "Sin iniciar",
    lastActivityAt: null,
    lastSummary: null,
  }));

const emptyFutureMetrics: PsychologyFutureMetrics = {
  completedRecords: 0,
  workedModules: 0,
  emotionalAverage: null,
  confidenceAverage: null,
  focusAverage: null,
  weeklyEvolution: [],
};

const pressureOptions = [
  "Partido exigente",
  "Jugadores",
  "Banco tecnico",
  "Publico",
  "Designacion importante",
  "Evaluacion",
  "Error anterior",
];

const errorFactorOptions = [
  "Fatiga",
  "Ubicacion",
  "Presion externa",
  "Comunicacion",
  "Interpretacion",
  "Contexto del partido",
  "Ayuda del equipo arbitral",
];

const stressorOptions = [
  "Critica publica",
  "Amenazas o insultos",
  "Carga de partidos",
  "Falta de apoyo",
  "Redes o medios",
  "Descanso alterado",
  "Molestias fisicas",
];

const protectiveOptions = [
  "Apoyo institucional",
  "Equipo arbitral",
  "Familia o entorno",
  "Preparacion fisica",
  "Rutina de recuperacion",
  "Mentor o asesor",
  "Desconexion de redes",
];

const scenarioOptions: ScenarioOption[] = [
  {
    id: "bench-pressure",
    exerciseType: "pressure_scenario",
    title: "Banco tecnico presiona una sancion",
    prompt:
      "Un banco tecnico insiste en condicionar tu criterio despues de una decision disciplinaria.",
    defaultStrategy:
      "Reconocer el reclamo sin debatir, mantener distancia y volver al criterio tecnico.",
    defaultCommunication: "Ya esta visto, seguimos jugando.",
    defaultAction:
      "Advertencia breve, contacto con el equipo arbitral y regreso inmediato al foco observable.",
    defaultBefore: "Siento que me quieren sacar del criterio.",
  },
  {
    id: "late-match-pressure",
    exerciseType: "pressure_scenario",
    title: "Final cerrado con ambiente alto",
    prompt:
      "Ultimos minutos, resultado ajustado y cada contacto genera presion emocional.",
    defaultStrategy: "Simplificar umbral, priorizar angulo y sostener la misma vara.",
    defaultCommunication: "Mismo criterio hasta el final.",
    defaultAction: "Ajustar proximidad, respirar corto y comunicar preventivamente.",
    defaultBefore: "Todo parece mas pesado por el contexto del partido.",
  },
  {
    id: "reset-after-protest",
    exerciseType: "focus_reset",
    title: "Protesta fuerte despues de una decision",
    prompt:
      "Despues de una protesta intensa, necesitas volver al juego sin arbitrar desde el enojo o la duda.",
    defaultStrategy:
      "Respirar, ubicar zona activa y observar la siguiente accion sin compensar.",
    defaultCommunication: "Respiro, miro, vuelvo al juego.",
    defaultAction: "Retomar ubicacion y buscar la proxima decision simple.",
    defaultBefore: "Sigo atrapado en la protesta y me cuesta volver al presente.",
  },
  {
    id: "reset-after-mistake",
    exerciseType: "focus_reset",
    title: "Error percibido durante el partido",
    prompt:
      "Crees que pudiste equivocarte y aparece ruido mental mientras el partido sigue.",
    defaultStrategy:
      "Separar la jugada anterior de la siguiente y decidir solo con informacion observable.",
    defaultCommunication: "Una accion a la vez.",
    defaultAction: "Bajar velocidad mental, mirar zona activa y no compensar.",
    defaultBefore: "Sigo pensando en la jugada anterior.",
  },
  {
    id: "self-talk-fear",
    exerciseType: "self_talk",
    title: "Miedo a equivocarte en una jugada grande",
    prompt:
      "Aparece pensamiento de error posible justo antes de una decision importante.",
    defaultStrategy: "Pasar de juicio personal a tarea observable.",
    defaultCommunication: "Veo, interpreto, decido.",
    defaultAction: "Nombrar la consigna antes del reinicio y volver al proceso.",
    defaultBefore: "Si me equivoco aca, arruino todo el partido.",
  },
  {
    id: "self-talk-criticism",
    exerciseType: "self_talk",
    title: "Critica externa despues del partido anterior",
    prompt:
      "Llegas con comentarios externos de un partido anterior y necesitas competir con claridad.",
    defaultStrategy: "Separar opinion externa de informacion util.",
    defaultCommunication: "No arbitro comentarios, arbitro hechos.",
    defaultAction: "Elegir un objetivo tecnico y medirlo al cierre.",
    defaultBefore: "Sigo escuchando la critica del partido pasado.",
  },
];

const initialPreMatchForm: PreMatchFormState = {
  matchContext: "",
  pressureSource: "Partido exigente",
  focusGoal: "Ver, interpretar y decidir la siguiente accion",
  resetCue: "Respiro, miro zona activa y vuelvo al juego",
  activationScore: 6,
  confidenceScore: 7,
  pressureScore: 5,
  concentrationScore: 7,
  emotionalControlScore: 7,
  mentalFatigueScore: 4,
  notes: "",
};

const initialPostMatchForm: PostMatchFormState = {
  matchContext: "",
  incidentSummary: "",
  learning: "",
  nextAction: "",
  pressureScore: 5,
  concentrationScore: 7,
  emotionalControlScore: 7,
  mentalFatigueScore: 4,
  recoveryScore: 6,
  processOrientationScore: 7,
  notes: "",
};

const initialErrorRecoveryForm: ErrorRecoveryFormState = {
  matchContext: "",
  incidentMinute: "",
  incidentSummary: "",
  errorFactors: [],
  learning: "",
  nextAction: "",
  confidenceScore: 6,
  pressureScore: 6,
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
  motivationScore: 7,
  externalPressureScore: 5,
  institutionalSupportScore: 6,
  recoveryQualityScore: 6,
  concentrationDifficultyScore: 3,
  notes: "",
};

export function PsychologyTrainingClient() {
  const searchParams = useSearchParams();
  const { isVideoAdmin } = useUserRole();

  const [data, setData] = useState<PsychologyPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [preMatchForm, setPreMatchForm] = useState<PreMatchFormState>(initialPreMatchForm);
  const [postMatchForm, setPostMatchForm] = useState<PostMatchFormState>(initialPostMatchForm);
  const [errorRecoveryForm, setErrorRecoveryForm] =
    useState<ErrorRecoveryFormState>(initialErrorRecoveryForm);
  const [wellbeingForm, setWellbeingForm] = useState<WellbeingFormState>(initialWellbeingForm);
  const [exerciseForms, setExerciseForms] = useState<
    Record<ExerciseModuleSlug, ExerciseFormState>
  >({
    "presion-competitiva": createExerciseFormForModule("presion-competitiva"),
    "concentracion-foco": createExerciseFormForModule("concentracion-foco"),
    "confianza-arbitral": createExerciseFormForModule("confianza-arbitral"),
  });

  const selectedModuleSlug = normalizePsychologyModuleSlug(searchParams.get("module"));
  const modules = data?.modules?.length ? data.modules : defaultModules;
  const records = data?.records ?? [];
  const futureMetrics = data?.futureMetrics ?? emptyFutureMetrics;
  const activeModule =
    selectedModuleSlug === null
      ? null
      : modules.find((module) => module.slug === selectedModuleSlug) ??
        {
          ...getPsychologyModuleDefinition(selectedModuleSlug),
          statusLabel:
            getPsychologyModuleDefinition(selectedModuleSlug).status === "available"
              ? "Disponible"
              : "En construccion",
          recordCount: 0,
          progressLabel: "Sin iniciar",
          lastActivityAt: null,
          lastSummary: null,
        };
  const moduleRecords = activeModule
    ? records.filter((record) => record.moduleSlug === activeModule.slug)
    : [];
  const latestModuleRecord = moduleRecords[0] ?? null;
  const latestWeeklyMetric = futureMetrics.weeklyEvolution[0] ?? null;
  const activeExerciseForm =
    activeModule && isExerciseModuleSlug(activeModule.slug)
      ? exerciseForms[activeModule.slug]
      : null;

  useEffect(() => {
    async function loadPsychology() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/psychology", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "No se pudo cargar Psicologia Arbitral.");
        }

        setData(parsePsychologyPayload(payload));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar Psicologia Arbitral."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadPsychology();
  }, []);

  async function savePsychology(
    action: "save_checkin" | "save_wellbeing" | "save_exercise",
    payload: Record<string, unknown>,
    nextMessage: string
  ) {
    setSavingKey(action);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/psychology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo guardar el registro.");
      }

      setData(parsePsychologyPayload(result));
      setMessage(result.message ?? nextMessage);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar el registro."
      );
    } finally {
      setSavingKey(null);
    }
  }

  function updatePreMatchField<K extends keyof PreMatchFormState>(
    key: K,
    value: PreMatchFormState[K]
  ) {
    setPreMatchForm((current) => ({ ...current, [key]: value }));
  }

  function updatePostMatchField<K extends keyof PostMatchFormState>(
    key: K,
    value: PostMatchFormState[K]
  ) {
    setPostMatchForm((current) => ({ ...current, [key]: value }));
  }

  function updateErrorRecoveryField<K extends keyof ErrorRecoveryFormState>(
    key: K,
    value: ErrorRecoveryFormState[K]
  ) {
    setErrorRecoveryForm((current) => ({ ...current, [key]: value }));
  }

  function updateWellbeingField<K extends keyof WellbeingFormState>(
    key: K,
    value: WellbeingFormState[K]
  ) {
    setWellbeingForm((current) => ({ ...current, [key]: value }));
  }

  function updateExerciseField<K extends keyof ExerciseFormState>(
    key: K,
    value: ExerciseFormState[K]
  ) {
    if (!activeModule || !isExerciseModuleSlug(activeModule.slug)) return;
    const activeSlug = activeModule.slug;

    setExerciseForms((current) => ({
      ...current,
      [activeSlug]: {
        ...current[activeSlug],
        [key]: value,
      },
    }));
  }

  function toggleErrorFactor(value: string) {
    setErrorRecoveryForm((current) => ({
      ...current,
      errorFactors: current.errorFactors.includes(value)
        ? current.errorFactors.filter((item) => item !== value)
        : [...current.errorFactors, value],
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

  function changeExerciseScenario(nextScenarioId: string) {
    if (!activeModule || !isExerciseModuleSlug(activeModule.slug)) return;
    const activeSlug = activeModule.slug;

    const selectedScenario =
      scenarioOptions.find((scenario) => scenario.id === nextScenarioId) ??
      scenarioOptions[0];

    setExerciseForms((current) => ({
      ...current,
      [activeSlug]: {
        ...current[activeSlug],
        scenarioId: selectedScenario.id,
        scenarioTitle: selectedScenario.title,
        responseStrategy: selectedScenario.defaultStrategy,
        communicationPhrase: selectedScenario.defaultCommunication,
        internalDialogueAfter: selectedScenario.defaultCommunication,
        actionPlan: selectedScenario.defaultAction,
      },
    }));
  }

  async function handleSavePreMatch() {
    await savePsychology(
      "save_checkin",
      {
        moduleSlug: "preparacion-mental-pre-partido",
        checkinType: "pre_match",
        ...preMatchForm,
      },
      "Registro pre partido guardado."
    );
  }

  async function handleSavePostMatch() {
    await savePsychology(
      "save_checkin",
      {
        moduleSlug: "evaluacion-post-partido",
        checkinType: "post_match",
        matchContext: postMatchForm.matchContext,
        incidentSummary: postMatchForm.incidentSummary,
        learning: postMatchForm.learning,
        nextAction: postMatchForm.nextAction,
        pressureScore: postMatchForm.pressureScore,
        concentrationScore: postMatchForm.concentrationScore,
        emotionalControlScore: postMatchForm.emotionalControlScore,
        mentalFatigueScore: postMatchForm.mentalFatigueScore,
        recoveryScore: postMatchForm.recoveryScore,
        processOrientationScore: postMatchForm.processOrientationScore,
        notes: postMatchForm.notes,
      },
      "Evaluacion post partido guardada."
    );
  }

  async function handleSaveErrorRecovery() {
    await savePsychology(
      "save_checkin",
      {
        moduleSlug: "gestion-error",
        checkinType: "error_recovery",
        matchContext: errorRecoveryForm.matchContext,
        incidentMinute: errorRecoveryForm.incidentMinute
          ? Number(errorRecoveryForm.incidentMinute)
          : null,
        incidentSummary: errorRecoveryForm.incidentSummary,
        errorFactors: errorRecoveryForm.errorFactors,
        learning: errorRecoveryForm.learning,
        nextAction: errorRecoveryForm.nextAction,
        confidenceScore: errorRecoveryForm.confidenceScore,
        pressureScore: errorRecoveryForm.pressureScore,
        errorImpactScore: errorRecoveryForm.errorImpactScore,
        recoveryScore: errorRecoveryForm.recoveryScore,
        processOrientationScore: errorRecoveryForm.processOrientationScore,
        notes: errorRecoveryForm.notes,
      },
      "Gestion del error guardada."
    );
  }

  async function handleSaveWellbeing() {
    await savePsychology(
      "save_wellbeing",
      {
        moduleSlug: "resiliencia",
        weekContext: wellbeingForm.weekContext,
        stressors: wellbeingForm.stressors,
        protectiveFactors: wellbeingForm.protectiveFactors,
        emotionalExhaustionScore: wellbeingForm.emotionalExhaustionScore,
        motivationScore: wellbeingForm.motivationScore,
        externalPressureScore: wellbeingForm.externalPressureScore,
        institutionalSupportScore: wellbeingForm.institutionalSupportScore,
        recoveryQualityScore: wellbeingForm.recoveryQualityScore,
        concentrationDifficultyScore: wellbeingForm.concentrationDifficultyScore,
        notes: wellbeingForm.notes,
      },
      "Chequeo de resiliencia guardado."
    );
  }

  async function handleSaveExercise() {
    const moduleSlug = activeModule?.slug;
    const currentExerciseForm = activeExerciseForm;
    if (
      moduleSlug !== "presion-competitiva" &&
      moduleSlug !== "concentracion-foco" &&
      moduleSlug !== "confianza-arbitral"
    ) {
      return;
    }

    if (!currentExerciseForm) return;

    await savePsychology(
      "save_exercise",
      {
        moduleSlug,
        exerciseType: currentExerciseForm.exerciseType,
        scenarioId: currentExerciseForm.scenarioId,
        scenarioTitle: currentExerciseForm.scenarioTitle,
        pressureLevel: currentExerciseForm.pressureLevel,
        beforeScore: currentExerciseForm.beforeScore,
        afterScore: currentExerciseForm.afterScore,
        clarityScore: currentExerciseForm.clarityScore,
        responseStrategy: currentExerciseForm.responseStrategy,
        internalDialogueBefore: currentExerciseForm.internalDialogueBefore,
        internalDialogueAfter: currentExerciseForm.internalDialogueAfter,
        communicationPhrase: currentExerciseForm.communicationPhrase,
        actionPlan: currentExerciseForm.actionPlan,
        notes: currentExerciseForm.notes,
      },
      "Ejercicio guiado guardado."
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[34px] border border-[#6fc11f]/25 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_34%),#071019] p-5 shadow-2xl lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#6fc11f]">
              Entrenamiento / Preparacion Integral / Psicologia Arbitral
            </p>
            <h1 className="mt-4 text-3xl font-black md:text-5xl">
              Psicologia arbitral por modulitos
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-300">
              Cada registro deja de vivir en una lista mezclada y pasa a su propio
              modulito: error, presion, foco, confianza, resiliencia, rutina previa
              y cierre post partido.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-4 py-3 text-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#6fc11f]">
                Estructura lista
              </p>
              <p className="mt-1 font-black text-white">
                Modulos, categorias editables y base de metricas futuras.
              </p>
            </div>

            {isVideoAdmin && (
              <Link
                href="/admin/psychology"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white transition hover:bg-white/10"
              >
                Administrar categorias
                <ArrowRight size={18} />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={ClipboardList}
          label="Registros completados"
          value={String(futureMetrics.completedRecords)}
          detail="Base activa para seguimiento"
        />
        <MetricCard
          icon={Sparkles}
          label="Modulos trabajados"
          value={`${futureMetrics.workedModules}/7`}
          detail="Cobertura por modulitos"
        />
        <MetricCard
          icon={HeartPulse}
          label="Estado emocional"
          value={formatScale(futureMetrics.emotionalAverage)}
          detail="Promedio orientativo"
        />
        <MetricCard
          icon={Brain}
          label="Confianza"
          value={formatScale(futureMetrics.confidenceAverage)}
          detail="Promedio orientativo"
        />
        <MetricCard
          icon={Target}
          label="Foco"
          value={formatScale(futureMetrics.focusAverage)}
          detail={
            latestWeeklyMetric
              ? `Semana ${formatShortDate(latestWeeklyMetric.weekStart)}`
              : "Evolucion semanal lista"
          }
        />
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      {activeModule ? (
        <div className="space-y-6">
          <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Link
                  href="/training/psychology"
                  className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-500 transition hover:text-[#6fc11f]"
                >
                  <ArrowLeft size={16} />
                  Volver a modulitos
                </Link>
                <p className="mt-4 text-xs font-black uppercase tracking-[0.3em] text-[#6fc11f]">
                  {activeModule.statusLabel}
                </p>
                <h2 className="mt-3 text-3xl font-black">{activeModule.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
                  {activeModule.introduction}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <InlineStat
                  label="Registros"
                  value={String(activeModule.recordCount)}
                  detail={activeModule.progressLabel}
                />
                <InlineStat
                  label="Progreso"
                  value={activeModule.progressLabel}
                  detail="Estado del modulo"
                />
                <InlineStat
                  label="Ultimo movimiento"
                  value={activeModule.lastActivityAt ? formatCompactDate(activeModule.lastActivityAt) : "--"}
                  detail="Actividad reciente"
                />
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[340px_1fr]">
            <aside className="space-y-4">
              <ModuleSupportRail module={activeModule} latestRecord={latestModuleRecord} />
            </aside>

            <div className="rounded-[30px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-6">
              {renderActiveWorkspace({
                activeModule,
                preMatchForm,
                postMatchForm,
                errorRecoveryForm,
                wellbeingForm,
                exerciseForm: activeExerciseForm,
                savingKey,
                updatePreMatchField,
                updatePostMatchField,
                updateErrorRecoveryField,
                updateWellbeingField,
                updateExerciseField,
                toggleErrorFactor,
                toggleWellbeingList,
                changeExerciseScenario,
                onSavePreMatch: handleSavePreMatch,
                onSavePostMatch: handleSavePostMatch,
                onSaveErrorRecovery: handleSaveErrorRecovery,
                onSaveWellbeing: handleSaveWellbeing,
                onSaveExercise: handleSaveExercise,
              })}
            </div>
          </section>

          <section className="rounded-[30px] border border-white/10 bg-[#071019] p-5 shadow-2xl lg:p-7">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
                <ClipboardList size={24} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
                  Registros del modulo
                </p>
                <h3 className="text-2xl font-black">Contenido guardado</h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {loading && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                  Cargando registros...
                </div>
              )}

              {!loading && moduleRecords.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">
                  Todavia no hay registros guardados en este modulito.
                </div>
              )}

              {!loading &&
                moduleRecords.map((record) => (
                  <UnifiedRecordCard key={`${record.source}-${record.id}`} record={record} />
                ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <ModuleCard key={module.slug} module={module} />
          ))}
        </section>
      )}
    </div>
  );
}

function renderActiveWorkspace({
  activeModule,
  preMatchForm,
  postMatchForm,
  errorRecoveryForm,
  wellbeingForm,
  exerciseForm,
  savingKey,
  updatePreMatchField,
  updatePostMatchField,
  updateErrorRecoveryField,
  updateWellbeingField,
  updateExerciseField,
  toggleErrorFactor,
  toggleWellbeingList,
  changeExerciseScenario,
  onSavePreMatch,
  onSavePostMatch,
  onSaveErrorRecovery,
  onSaveWellbeing,
  onSaveExercise,
}: {
  activeModule: PsychologyModuleOverview;
  preMatchForm: PreMatchFormState;
  postMatchForm: PostMatchFormState;
  errorRecoveryForm: ErrorRecoveryFormState;
  wellbeingForm: WellbeingFormState;
  exerciseForm: ExerciseFormState | null;
  savingKey: string | null;
  updatePreMatchField: <K extends keyof PreMatchFormState>(
    key: K,
    value: PreMatchFormState[K]
  ) => void;
  updatePostMatchField: <K extends keyof PostMatchFormState>(
    key: K,
    value: PostMatchFormState[K]
  ) => void;
  updateErrorRecoveryField: <K extends keyof ErrorRecoveryFormState>(
    key: K,
    value: ErrorRecoveryFormState[K]
  ) => void;
  updateWellbeingField: <K extends keyof WellbeingFormState>(
    key: K,
    value: WellbeingFormState[K]
  ) => void;
  updateExerciseField: <K extends keyof ExerciseFormState>(
    key: K,
    value: ExerciseFormState[K]
  ) => void;
  toggleErrorFactor: (value: string) => void;
  toggleWellbeingList: (key: "stressors" | "protectiveFactors", value: string) => void;
  changeExerciseScenario: (value: string) => void;
  onSavePreMatch: () => Promise<void>;
  onSavePostMatch: () => Promise<void>;
  onSaveErrorRecovery: () => Promise<void>;
  onSaveWellbeing: () => Promise<void>;
  onSaveExercise: () => Promise<void>;
}) {
  if (activeModule.slug === "gestion-error") {
    return (
      <WorkspaceCard
        eyebrow="Del error al aprendizaje"
        title="Registro de recuperacion mental"
        description="Reflexiona, mide impacto, detecta factores y define una accion concreta para la siguiente decision."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Partido o contexto">
            <textarea
              value={errorRecoveryForm.matchContext}
              onChange={(event) =>
                updateErrorRecoveryField("matchContext", event.target.value)
              }
              rows={3}
              placeholder="Ej. semifinal, ambiente alto, protesta reiterada"
              className="control-input min-h-24 resize-none"
            />
          </Field>

          <Field label="Minuto o momento">
            <input
              type="number"
              value={errorRecoveryForm.incidentMinute}
              onChange={(event) =>
                updateErrorRecoveryField("incidentMinute", event.target.value)
              }
              placeholder="Ej. 67"
              className="control-input"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Que paso">
            <textarea
              value={errorRecoveryForm.incidentSummary}
              onChange={(event) =>
                updateErrorRecoveryField("incidentSummary", event.target.value)
              }
              rows={4}
              placeholder="Describe la jugada, protesta o decision dificil"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Checklist de factores">
            <div className="mt-1 flex flex-wrap gap-2">
              {errorFactorOptions.map((item) => (
                <Chip
                  key={item}
                  active={errorRecoveryForm.errorFactors.includes(item)}
                  onClick={() => toggleErrorFactor(item)}
                >
                  {item}
                </Chip>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ScaleControl
            label="Confianza"
            value={errorRecoveryForm.confidenceScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updateErrorRecoveryField("confidenceScore", value)}
          />
          <ScaleControl
            label="Presion"
            value={errorRecoveryForm.pressureScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updateErrorRecoveryField("pressureScore", value)}
          />
          <ScaleControl
            label="Impacto del error"
            value={errorRecoveryForm.errorImpactScore}
            low="Acotado"
            high="Alto"
            onChange={(value) => updateErrorRecoveryField("errorImpactScore", value)}
          />
          <ScaleControl
            label="Recuperacion"
            value={errorRecoveryForm.recoveryScore}
            low="Lenta"
            high="Rapida"
            onChange={(value) => updateErrorRecoveryField("recoveryScore", value)}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Field label="Aprendizaje">
            <textarea
              value={errorRecoveryForm.learning}
              onChange={(event) =>
                updateErrorRecoveryField("learning", event.target.value)
              }
              rows={4}
              placeholder="Que te deja esta situacion"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Proxima accion">
            <textarea
              value={errorRecoveryForm.nextAction}
              onChange={(event) =>
                updateErrorRecoveryField("nextAction", event.target.value)
              }
              rows={4}
              placeholder="Que vas a hacer la proxima vez"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Notas privadas">
            <textarea
              value={errorRecoveryForm.notes}
              onChange={(event) => updateErrorRecoveryField("notes", event.target.value)}
              rows={3}
              placeholder="Observaciones personales"
              className="control-input min-h-24 resize-none"
            />
          </Field>
        </div>

        <SaveBar
          label="Registro listo para reflexion guiada, checklist y seguimiento del error."
          actionLabel={savingKey === "save_checkin" ? "Guardando..." : "Guardar registro"}
          onClick={onSaveErrorRecovery}
          disabled={savingKey === "save_checkin"}
        />
      </WorkspaceCard>
    );
  }

  if (activeModule.slug === "preparacion-mental-pre-partido") {
    return (
      <WorkspaceCard
        eyebrow="Rutina previa"
        title="Registro mental antes del partido"
        description="Ordena activacion, foco, confianza y frase operativa antes de competir."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Partido o designacion">
            <textarea
              value={preMatchForm.matchContext}
              onChange={(event) => updatePreMatchField("matchContext", event.target.value)}
              rows={3}
              placeholder="Ej. clasico juvenil, partido definitorio, campo dificil"
              className="control-input min-h-24 resize-none"
            />
          </Field>

          <Field label="Fuente principal de presion">
            <select
              value={preMatchForm.pressureSource}
              onChange={(event) =>
                updatePreMatchField("pressureSource", event.target.value)
              }
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Objetivo del partido">
            <textarea
              value={preMatchForm.focusGoal}
              onChange={(event) => updatePreMatchField("focusGoal", event.target.value)}
              rows={4}
              placeholder="Que proceso quieres sostener hoy"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Frase de reset">
            <textarea
              value={preMatchForm.resetCue}
              onChange={(event) => updatePreMatchField("resetCue", event.target.value)}
              rows={4}
              placeholder="Consigna breve para volver al proceso"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ScaleControl
            label="Activacion"
            value={preMatchForm.activationScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePreMatchField("activationScore", value)}
          />
          <ScaleControl
            label="Confianza"
            value={preMatchForm.confidenceScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePreMatchField("confidenceScore", value)}
          />
          <ScaleControl
            label="Presion"
            value={preMatchForm.pressureScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePreMatchField("pressureScore", value)}
          />
          <ScaleControl
            label="Foco"
            value={preMatchForm.concentrationScore}
            low="Disperso"
            high="Claro"
            onChange={(value) => updatePreMatchField("concentrationScore", value)}
          />
          <ScaleControl
            label="Control emocional"
            value={preMatchForm.emotionalControlScore}
            low="Inestable"
            high="Firme"
            onChange={(value) => updatePreMatchField("emotionalControlScore", value)}
          />
          <ScaleControl
            label="Fatiga mental"
            value={preMatchForm.mentalFatigueScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePreMatchField("mentalFatigueScore", value)}
          />
        </div>

        <div className="mt-5">
          <Field label="Notas privadas">
            <textarea
              value={preMatchForm.notes}
              onChange={(event) => updatePreMatchField("notes", event.target.value)}
              rows={3}
              placeholder="Checklist mental o detalles previos"
              className="control-input min-h-24 resize-none"
            />
          </Field>
        </div>

        <SaveBar
          label="Registro listo para rutina previa, escala 1 a 10 y seguimiento antes del partido."
          actionLabel={savingKey === "save_checkin" ? "Guardando..." : "Guardar registro"}
          onClick={onSavePreMatch}
          disabled={savingKey === "save_checkin"}
        />
      </WorkspaceCard>
    );
  }

  if (activeModule.slug === "evaluacion-post-partido") {
    return (
      <WorkspaceCard
        eyebrow="Cierre post partido"
        title="Lectura de partido y accion siguiente"
        description="Resume lo importante del cierre y transforma la reflexion en un aprendizaje accionable."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Partido o contexto">
            <textarea
              value={postMatchForm.matchContext}
              onChange={(event) => updatePostMatchField("matchContext", event.target.value)}
              rows={3}
              placeholder="Ej. partido caliente, cierre tenso, partido controlado"
              className="control-input min-h-24 resize-none"
            />
          </Field>

          <Field label="Lectura del partido">
            <textarea
              value={postMatchForm.incidentSummary}
              onChange={(event) =>
                updatePostMatchField("incidentSummary", event.target.value)
              }
              rows={3}
              placeholder="Que paso y como lo viviste"
              className="control-input min-h-24 resize-none"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Que hice bien">
            <textarea
              value={postMatchForm.learning}
              onChange={(event) => updatePostMatchField("learning", event.target.value)}
              rows={4}
              placeholder="Un aprendizaje o acierto concreto"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Que debo ajustar">
            <textarea
              value={postMatchForm.nextAction}
              onChange={(event) => updatePostMatchField("nextAction", event.target.value)}
              rows={4}
              placeholder="Una accion concreta para el proximo partido"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ScaleControl
            label="Presion residual"
            value={postMatchForm.pressureScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePostMatchField("pressureScore", value)}
          />
          <ScaleControl
            label="Foco"
            value={postMatchForm.concentrationScore}
            low="Disperso"
            high="Claro"
            onChange={(value) => updatePostMatchField("concentrationScore", value)}
          />
          <ScaleControl
            label="Control emocional"
            value={postMatchForm.emotionalControlScore}
            low="Bajo"
            high="Alto"
            onChange={(value) => updatePostMatchField("emotionalControlScore", value)}
          />
          <ScaleControl
            label="Fatiga mental"
            value={postMatchForm.mentalFatigueScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updatePostMatchField("mentalFatigueScore", value)}
          />
          <ScaleControl
            label="Recuperacion"
            value={postMatchForm.recoveryScore}
            low="Lenta"
            high="Buena"
            onChange={(value) => updatePostMatchField("recoveryScore", value)}
          />
          <ScaleControl
            label="Orientacion al proceso"
            value={postMatchForm.processOrientationScore}
            low="Difusa"
            high="Clara"
            onChange={(value) =>
              updatePostMatchField("processOrientationScore", value)
            }
          />
        </div>

        <div className="mt-5">
          <Field label="Notas privadas">
            <textarea
              value={postMatchForm.notes}
              onChange={(event) => updatePostMatchField("notes", event.target.value)}
              rows={3}
              placeholder="Registro emocional, detalles y observaciones"
              className="control-input min-h-24 resize-none"
            />
          </Field>
        </div>

        <SaveBar
          label="Registro listo para evaluacion post partido y aprendizaje acumulado."
          actionLabel={savingKey === "save_checkin" ? "Guardando..." : "Guardar evaluacion"}
          onClick={onSavePostMatch}
          disabled={savingKey === "save_checkin"}
        />
      </WorkspaceCard>
    );
  }

  if (activeModule.slug === "resiliencia") {
    return (
      <WorkspaceCard
        eyebrow="Continuidad y recuperacion"
        title="Chequeo semanal de resiliencia"
        description="Mide desgaste, proteccion y capacidad de volver a competir con claridad."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Contexto de la semana">
            <textarea
              value={wellbeingForm.weekContext}
              onChange={(event) => updateWellbeingField("weekContext", event.target.value)}
              rows={4}
              placeholder="Que tipo de semana arbitral estas atravesando"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Notas privadas">
            <textarea
              value={wellbeingForm.notes}
              onChange={(event) => updateWellbeingField("notes", event.target.value)}
              rows={4}
              placeholder="Observaciones personales"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Field label="Factores de desgaste">
            <div className="mt-1 flex flex-wrap gap-2">
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
          </Field>

          <Field label="Factores protectores">
            <div className="mt-1 flex flex-wrap gap-2">
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
          </Field>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ScaleControl
            label="Agotamiento emocional"
            value={wellbeingForm.emotionalExhaustionScore}
            low="Bajo"
            high="Alto"
            onChange={(value) =>
              updateWellbeingField("emotionalExhaustionScore", value)
            }
          />
          <ScaleControl
            label="Motivacion"
            value={wellbeingForm.motivationScore}
            low="Baja"
            high="Alta"
            onChange={(value) => updateWellbeingField("motivationScore", value)}
          />
          <ScaleControl
            label="Presion externa"
            value={wellbeingForm.externalPressureScore}
            low="Baja"
            high="Alta"
            onChange={(value) =>
              updateWellbeingField("externalPressureScore", value)
            }
          />
          <ScaleControl
            label="Apoyo institucional"
            value={wellbeingForm.institutionalSupportScore}
            low="Bajo"
            high="Alto"
            onChange={(value) =>
              updateWellbeingField("institutionalSupportScore", value)
            }
          />
          <ScaleControl
            label="Recuperacion"
            value={wellbeingForm.recoveryQualityScore}
            low="Mala"
            high="Buena"
            onChange={(value) =>
              updateWellbeingField("recoveryQualityScore", value)
            }
          />
          <ScaleControl
            label="Dificultad de foco"
            value={wellbeingForm.concentrationDifficultyScore}
            low="Baja"
            high="Alta"
            onChange={(value) =>
              updateWellbeingField("concentrationDifficultyScore", value)
            }
          />
        </div>

        <SaveBar
          label="Registro listo para resiliencia, autodiagnostico y seguimiento semanal."
          actionLabel={savingKey === "save_wellbeing" ? "Guardando..." : "Guardar chequeo"}
          onClick={onSaveWellbeing}
          disabled={savingKey === "save_wellbeing"}
        />
      </WorkspaceCard>
    );
  }

  if (
    activeModule.slug === "presion-competitiva" ||
    activeModule.slug === "concentracion-foco" ||
    activeModule.slug === "confianza-arbitral"
  ) {
    if (!exerciseForm) return null;

    const visibleScenarios = scenarioOptions.filter(
      (scenario) => scenario.exerciseType === exerciseForm.exerciseType
    );
    const selectedScenario =
      scenarioOptions.find((scenario) => scenario.id === exerciseForm.scenarioId) ??
      visibleScenarios[0];
    const eyebrow =
      activeModule.slug === "presion-competitiva"
        ? "Situacion competitiva"
        : activeModule.slug === "concentracion-foco"
          ? "Rutina de foco"
          : "Dialogo interno";
    const title =
      activeModule.slug === "presion-competitiva"
        ? "Practica tu respuesta bajo presion"
        : activeModule.slug === "concentracion-foco"
          ? "Vuelta al presente"
          : "Consigna de confianza arbitral";
    const description =
      activeModule.slug === "presion-competitiva"
        ? "Trabaja banco, publico o contexto exigente sin perder criterio observable."
        : activeModule.slug === "concentracion-foco"
          ? "Corta el ruido mental y recupera lectura del juego en una secuencia breve."
          : "Convierte la duda o la autocritica en una frase operativa util.";

    return (
      <WorkspaceCard eyebrow={eyebrow} title={title} description={description}>
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <Field label="Escenario">
            <select
              value={exerciseForm.scenarioId}
              onChange={(event) => changeExerciseScenario(event.target.value)}
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
            Situacion practica
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">
            {selectedScenario?.prompt}
          </p>
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
            low="Confusa"
            high="Aplicable"
            onChange={(value) => updateExerciseField("clarityScore", value)}
          />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Field label="Dialogo interno antes">
            <textarea
              value={exerciseForm.internalDialogueBefore}
              onChange={(event) =>
                updateExerciseField("internalDialogueBefore", event.target.value)
              }
              rows={4}
              placeholder="Que aparece en tu cabeza"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Dialogo interno despues">
            <textarea
              value={exerciseForm.internalDialogueAfter}
              onChange={(event) =>
                updateExerciseField("internalDialogueAfter", event.target.value)
              }
              rows={4}
              placeholder="Transformalo en una consigna breve"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Estrategia de respuesta">
            <textarea
              value={exerciseForm.responseStrategy}
              onChange={(event) =>
                updateExerciseField("responseStrategy", event.target.value)
              }
              rows={4}
              placeholder="Que vas a hacer tecnica y mentalmente"
              className="control-input min-h-28 resize-none"
            />
          </Field>

          <Field label="Frase operativa">
            <textarea
              value={exerciseForm.communicationPhrase}
              onChange={(event) =>
                updateExerciseField("communicationPhrase", event.target.value)
              }
              rows={4}
              placeholder="La frase que te ordena"
              className="control-input min-h-28 resize-none"
            />
          </Field>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Field label="Plan de accion">
            <textarea
              value={exerciseForm.actionPlan}
              onChange={(event) => updateExerciseField("actionPlan", event.target.value)}
              rows={3}
              placeholder="Como lo llevas al partido o entrenamiento"
              className="control-input min-h-24 resize-none"
            />
          </Field>

          <Field label="Notas privadas">
            <textarea
              value={exerciseForm.notes}
              onChange={(event) => updateExerciseField("notes", event.target.value)}
              rows={3}
              placeholder="Observaciones del ejercicio"
              className="control-input min-h-24 resize-none"
            />
          </Field>
        </div>

        <SaveBar
          label="Registro listo para situacion practica, escala 1 a 10 y reflexion aplicada."
          actionLabel={savingKey === "save_exercise" ? "Guardando..." : "Guardar ejercicio"}
          onClick={onSaveExercise}
          disabled={savingKey === "save_exercise"}
        />
      </WorkspaceCard>
    );
  }

  return (
    <WorkspaceCard
      eyebrow="Pendiente de categoria"
      title="Registro temporalmente sin clasificar"
      description="Este espacio mantiene visibles los registros sin metadata completa. Puedes asignar su modulo correcto desde Admin."
    >
      <div className="rounded-[26px] border border-yellow-400/25 bg-yellow-400/10 p-5 text-sm leading-6 text-yellow-100">
        Usa Admin para pasar este registro a Gestion del error, Presion competitiva,
        Concentracion y foco, Confianza arbitral, Resiliencia, Preparacion mental
        pre partido o Evaluacion post partido.
      </div>
      <div className="mt-5">
        <Link
          href="/admin/psychology"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-5 font-black text-black transition hover:bg-[#82dc2a]"
        >
          Abrir Admin de Psicologia
          <ArrowRight size={18} />
        </Link>
      </div>
    </WorkspaceCard>
  );
}

function ModuleSupportRail({
  module,
  latestRecord,
}: {
  module: PsychologyModuleOverview;
  latestRecord: PsychologyUnifiedRecord | null;
}) {
  const Icon = moduleIconMap[module.slug];

  return (
    <>
      <article className="rounded-[28px] border border-[#6fc11f]/25 bg-[#6fc11f]/10 p-5">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-black/25 text-[#6fc11f]">
          <Icon size={24} />
        </div>
        <p className="mt-4 text-xs font-black uppercase tracking-[0.25em] text-[#6fc11f]">
          Interacciones listas
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {module.interactionModes.map((interactionMode) => (
            <span
              key={interactionMode}
              className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-[11px] font-black text-zinc-200"
            >
              {psychologyInteractionLabels[interactionMode]}
            </span>
          ))}
        </div>
      </article>

      <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
          Ejercicios disponibles
        </p>
        <div className="mt-4 space-y-3">
          {module.exerciseTitles.map((title) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-zinc-200"
            >
              {title}
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
          Reflexion guiada
        </p>
        <p className="mt-4 text-sm leading-6 text-zinc-300">
          {module.guidedReflection}
        </p>
      </article>

      <article className="rounded-[28px] border border-white/10 bg-black/20 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-500">
          Feedback reciente
        </p>
        {latestRecord ? (
          <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
            <p className="text-lg font-black text-white">{latestRecord.title}</p>
            <p>{latestRecord.summary}</p>
            {latestRecord.detail && <p className="text-[#b7ff8a]">{latestRecord.detail}</p>}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Guarda tu primer registro de este modulito para activar el feedback.
          </p>
        )}
      </article>
    </>
  );
}

function ModuleCard({ module }: { module: PsychologyModuleOverview }) {
  const Icon = moduleIconMap[module.slug];
  const available = module.statusLabel === "Disponible";

  return (
    <article className="flex min-h-[270px] flex-col justify-between rounded-[30px] border border-white/10 bg-[#101b24] p-5 shadow-2xl transition hover:border-[#6fc11f]/50 hover:bg-[#13212b]">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#6fc11f]">
            <Icon size={28} />
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
              available
                ? "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#6fc11f]"
                : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"
            }`}
          >
            {module.statusLabel}
          </span>
        </div>

        <h2 className="mt-6 text-2xl font-black">{module.title}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{module.description}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniData
            label="Registros"
            value={String(module.recordCount)}
            detail="contenidos disponibles"
          />
          <MiniData label="Progreso" value={module.progressLabel} detail="estado actual" />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500">
            Ingresar
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {module.lastSummary ?? "Abre el modulo y empieza a trabajar."}
          </p>
        </div>
        <Link
          href={`/training/psychology?module=${module.slug}`}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 font-black text-black transition hover:bg-[#82dc2a]"
        >
          Ingresar
          <ArrowRight size={18} />
        </Link>
      </div>
    </article>
  );
}

function UnifiedRecordCard({ record }: { record: PsychologyUnifiedRecord }) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#6fc11f]/25 bg-[#6fc11f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#6fc11f]">
              {record.sourceLabel}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-300">
              {record.subtypeLabel}
            </span>
            {record.classificationStatus !== "Clasificado" && (
              <span className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-yellow-100">
                {record.classificationStatus}
              </span>
            )}
          </div>

          <h4 className="mt-3 text-lg font-black text-white">{record.title}</h4>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{record.summary}</p>
          {record.detail && (
            <p className="mt-2 text-sm leading-6 text-[#b7ff8a]">{record.detail}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {record.interactionModes.map((interactionMode) => (
              <span
                key={`${record.id}-${interactionMode}`}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black text-zinc-300"
              >
                {psychologyInteractionLabels[interactionMode]}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <MetricChip label="Fecha" value={formatCompactDate(record.createdAt)} />
          <MetricChip label="Puntaje" value={record.metrics.score === null ? "--" : `${record.metrics.score}`} />
          <MetricChip label="Confianza" value={formatScale(record.metrics.confidence)} />
          <MetricChip label="Foco" value={formatScale(record.metrics.focus)} />
        </div>
      </div>
    </article>
  );
}

function WorkspaceCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.28em] text-[#6fc11f]">
        {eyebrow}
      </p>
      <h3 className="mt-3 text-3xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
      <div className="mt-6">{children}</div>
    </>
  );
}

function SaveBar({
  label,
  actionLabel,
  onClick,
  disabled,
}: {
  label: string;
  actionLabel: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-[26px] border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-6 text-zinc-300">{label}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
      >
        <Save size={20} />
        {actionLabel}
      </button>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: IconType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[26px] border border-white/10 bg-[#101b24] p-4 shadow-2xl">
      <Icon className="text-[#6fc11f]" size={22} />
      <p className="mt-4 text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#6fc11f]">{detail}</p>
    </article>
  );
}

function InlineStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      <p className="text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function MiniData({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-white">{value}</p>
      <p className="text-xs text-zinc-400">{detail}</p>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[110px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#b7ff8a]"
      : "border-red-500/30 bg-red-500/10 text-red-200";

  return <div className={`rounded-2xl border p-4 text-sm font-bold ${toneClass}`}>{children}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </span>
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
  children: ReactNode;
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

function parsePsychologyPayload(payload: {
  modules?: unknown;
  records?: unknown;
  futureMetrics?: unknown;
}) {
  return {
    modules: Array.isArray(payload.modules)
      ? (payload.modules as PsychologyModuleOverview[])
      : defaultModules,
    records: Array.isArray(payload.records)
      ? (payload.records as PsychologyUnifiedRecord[])
      : [],
    futureMetrics:
      payload.futureMetrics && typeof payload.futureMetrics === "object"
        ? (payload.futureMetrics as PsychologyFutureMetrics)
        : emptyFutureMetrics,
  };
}

function createExerciseFormForModule(moduleSlug: PsychologyModuleSlug): ExerciseFormState {
  const scenario =
    scenarioOptions.find((item) =>
      moduleSlug === "presion-competitiva"
        ? item.exerciseType === "pressure_scenario"
        : moduleSlug === "concentracion-foco"
          ? item.exerciseType === "focus_reset"
          : item.exerciseType === "self_talk"
    ) ?? scenarioOptions[0];

  return {
    exerciseType: scenario.exerciseType,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    pressureLevel: 6,
    beforeScore: 5,
    afterScore: 7,
    clarityScore: 7,
    responseStrategy: scenario.defaultStrategy,
    internalDialogueBefore: scenario.defaultBefore,
    internalDialogueAfter: scenario.defaultCommunication,
    communicationPhrase: scenario.defaultCommunication,
    actionPlan: scenario.defaultAction,
    notes: "",
  };
}

function isExerciseModuleSlug(value: PsychologyModuleSlug): value is ExerciseModuleSlug {
  return (
    value === "presion-competitiva" ||
    value === "concentracion-foco" ||
    value === "confianza-arbitral"
  );
}

function formatScale(value: number | null | undefined) {
  return typeof value === "number" ? `${value}/10` : "--";
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}
