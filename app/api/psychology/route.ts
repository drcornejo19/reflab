import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type PsychologyCheckInType = "pre_match" | "post_match" | "error_recovery";
type PsychologyExerciseType = "focus_reset" | "pressure_scenario" | "self_talk" | "team_prebrief";

type PsychologyInput = {
  checkinType?: PsychologyCheckInType;
  matchContext?: unknown;
  pressureSource?: unknown;
  focusGoal?: unknown;
  resetCue?: unknown;
  incidentMinute?: unknown;
  incidentSummary?: unknown;
  errorFactors?: unknown;
  learning?: unknown;
  nextAction?: unknown;
  activationScore?: unknown;
  confidenceScore?: unknown;
  pressureScore?: unknown;
  concentrationScore?: unknown;
  emotionalControlScore?: unknown;
  mentalFatigueScore?: unknown;
  errorImpactScore?: unknown;
  recoveryScore?: unknown;
  processOrientationScore?: unknown;
  notes?: unknown;
};

type WellbeingInput = {
  weekContext?: unknown;
  stressors?: unknown;
  protectiveFactors?: unknown;
  emotionalExhaustionScore?: unknown;
  cynicismScore?: unknown;
  motivationScore?: unknown;
  sleepDisruptionScore?: unknown;
  concentrationDifficultyScore?: unknown;
  externalPressureScore?: unknown;
  institutionalSupportScore?: unknown;
  violenceExposureScore?: unknown;
  recoveryQualityScore?: unknown;
  workloadScore?: unknown;
  notes?: unknown;
};

type ExerciseInput = {
  exerciseType?: PsychologyExerciseType;
  scenarioId?: unknown;
  scenarioTitle?: unknown;
  pressureLevel?: unknown;
  beforeScore?: unknown;
  afterScore?: unknown;
  clarityScore?: unknown;
  responseStrategy?: unknown;
  internalDialogueBefore?: unknown;
  internalDialogueAfter?: unknown;
  communicationPhrase?: unknown;
  actionPlan?: unknown;
  notes?: unknown;
};

type SavedPsychologyRow = {
  id: string;
  user_id: string;
  checkin_type: PsychologyCheckInType;
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

type SavedWellbeingRow = {
  id: string;
  user_id: string;
  burnout_risk_score: number | null;
  burnout_risk_level: string | null;
  emotional_exhaustion_score: number | null;
  cynicism_score: number | null;
  motivation_score: number | null;
  external_pressure_score: number | null;
  institutional_support_score: number | null;
  violence_exposure_score: number | null;
  recovery_quality_score: number | null;
  workload_score: number | null;
  feedback: WellbeingFeedback | null;
  created_at: string;
};

type SavedExerciseRow = {
  id: string;
  user_id: string;
  exercise_type: PsychologyExerciseType;
  scenario_title: string | null;
  pressure_level: number | null;
  before_score: number | null;
  after_score: number | null;
  clarity_score: number | null;
  feedback: ExerciseFeedback | null;
  created_at: string;
};

type PsychologyFeedback = {
  summary: string;
  focus: string;
  action: string;
  risk: string;
};

type WellbeingFeedback = {
  summary: string;
  priority: string;
  action: string;
  protection: string;
  note: string;
};

type ExerciseFeedback = {
  summary: string;
  learning: string;
  nextCue: string;
  application: string;
};

export async function GET() {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    return NextResponse.json(await loadPsychologyData(supabase, userId));
  } catch (error) {
    return psychologyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; payload?: PsychologyInput | WellbeingInput | ExerciseInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (body.action === "save_exercise") {
      const payload = normalizeExerciseInput(body.payload as ExerciseInput);
      const feedback = buildExerciseFeedback(payload);
      const now = new Date().toISOString();

      const { error } = await supabase.from("psychology_exercise_sessions").insert([
        {
          user_id: userId,
          exercise_type: payload.exercise_type,
          scenario_id: payload.scenario_id,
          scenario_title: payload.scenario_title,
          pressure_level: payload.pressure_level,
          before_score: payload.before_score,
          after_score: payload.after_score,
          clarity_score: payload.clarity_score,
          response_strategy: payload.response_strategy,
          internal_dialogue_before: payload.internal_dialogue_before,
          internal_dialogue_after: payload.internal_dialogue_after,
          communication_phrase: payload.communication_phrase,
          action_plan: payload.action_plan,
          feedback,
          notes: payload.notes,
          source_documents: [
            "Preparacion psicologica de Arbitros",
            "Principios de cambio para jueces",
          ],
          created_at: now,
          updated_at: now,
        },
      ]);

      if (error) throw error;

      return NextResponse.json({
        message: "Ejercicio psicologico guardado.",
        ...(await loadPsychologyData(supabase, userId)),
      });
    }

    if (body.action === "save_wellbeing") {
      const payload = normalizeWellbeingInput(body.payload as WellbeingInput);
      const risk = calculateBurnoutRisk(payload);
      const feedback = buildWellbeingFeedback(payload, risk);
      const now = new Date().toISOString();

      const { error } = await supabase.from("psychology_wellbeing_assessments").insert([
        {
          user_id: userId,
          week_start: now.slice(0, 10),
          week_context: payload.week_context,
          emotional_exhaustion_score: payload.emotional_exhaustion_score,
          cynicism_score: payload.cynicism_score,
          motivation_score: payload.motivation_score,
          sleep_disruption_score: payload.sleep_disruption_score,
          concentration_difficulty_score: payload.concentration_difficulty_score,
          external_pressure_score: payload.external_pressure_score,
          institutional_support_score: payload.institutional_support_score,
          violence_exposure_score: payload.violence_exposure_score,
          recovery_quality_score: payload.recovery_quality_score,
          workload_score: payload.workload_score,
          burnout_risk_score: risk.value,
          burnout_risk_level: risk.level,
          stressors: payload.stressors,
          protective_factors: payload.protective_factors,
          feedback,
          notes: payload.notes,
          source_documents: ["Deterioro para organizaciones", "Preparacion psicologica de Arbitros"],
          created_at: now,
          updated_at: now,
        },
      ]);

      if (error) throw error;

      return NextResponse.json({
        message: "Evaluacion semanal de bienestar guardada.",
        ...(await loadPsychologyData(supabase, userId)),
      });
    }

    if (body.action !== "save_checkin") {
      return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
    }

    const payload = normalizeInput(body.payload ?? {});
    const score = calculateMentalScore(payload);
    const feedback = buildFeedback(payload, score);
    const now = new Date().toISOString();

    const { error } = await supabase.from("psychology_checkins").insert([
      {
        user_id: userId,
        checkin_type: payload.checkin_type,
        match_context: payload.match_context,
        pressure_source: payload.pressure_source,
        focus_goal: payload.focus_goal,
        reset_cue: payload.reset_cue,
        incident_minute: payload.incident_minute,
        incident_summary: payload.incident_summary,
        error_factors: payload.error_factors,
        learning: payload.learning,
        next_action: payload.next_action,
        activation_score: payload.activation_score,
        confidence_score: payload.confidence_score,
        pressure_score: payload.pressure_score,
        concentration_score: payload.concentration_score,
        emotional_control_score: payload.emotional_control_score,
        mental_fatigue_score: payload.mental_fatigue_score,
        error_impact_score: payload.error_impact_score,
        recovery_score: payload.recovery_score,
        process_orientation_score: payload.process_orientation_score,
        mental_score: score.value,
        mental_status: score.status,
        feedback,
        responses: {
          notes: payload.notes,
          source: "psychology_arbitral_mvp",
        },
        source_documents: [
          "Preparacion psicologica de Arbitros",
          "Principios de cambio para jueces",
          "Deterioro para organizaciones",
        ],
        created_at: now,
        updated_at: now,
      },
    ]);

    if (error) throw error;

    return NextResponse.json({
      message: "Check-in psicologico guardado.",
      ...(await loadPsychologyData(supabase, userId)),
    });
  } catch (error) {
    return psychologyErrorResponse(error);
  }
}

async function getClerkUserId() {
  const session = await auth();
  return session.userId;
}

async function loadPsychologyData(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const [checkinsRes, wellbeingRes, exercisesRes] = await Promise.all([
    supabase
      .from("psychology_checkins")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("psychology_wellbeing_assessments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("psychology_exercise_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (checkinsRes.error) throw checkinsRes.error;
  if (wellbeingRes.error) throw wellbeingRes.error;
  if (exercisesRes.error) throw exercisesRes.error;

  const checkins = (checkinsRes.data ?? []) as SavedPsychologyRow[];
  const wellbeingAssessments = (wellbeingRes.data ?? []) as SavedWellbeingRow[];
  const exerciseSessions = (exercisesRes.data ?? []) as SavedExerciseRow[];

  return {
    checkins,
    summary: buildSummary(checkins),
    wellbeingAssessments,
    wellbeingSummary: buildWellbeingSummary(wellbeingAssessments),
    exerciseSessions,
    exerciseSummary: buildExerciseSummary(exerciseSessions),
  };
}

function normalizeInput(input: PsychologyInput) {
  const checkinType = isCheckInType(input.checkinType) ? input.checkinType : "pre_match";

  return {
    checkin_type: checkinType,
    match_context: cleanText(input.matchContext),
    pressure_source: cleanText(input.pressureSource),
    focus_goal: cleanText(input.focusGoal),
    reset_cue: cleanText(input.resetCue),
    incident_minute: toMinute(input.incidentMinute),
    incident_summary: cleanText(input.incidentSummary),
    error_factors: cleanTextArray(input.errorFactors),
    learning: cleanText(input.learning),
    next_action: cleanText(input.nextAction),
    activation_score: clampScale(input.activationScore),
    confidence_score: clampScale(input.confidenceScore),
    pressure_score: clampScale(input.pressureScore),
    concentration_score: clampScale(input.concentrationScore),
    emotional_control_score: clampScale(input.emotionalControlScore),
    mental_fatigue_score: clampScale(input.mentalFatigueScore),
    error_impact_score: clampScale(input.errorImpactScore),
    recovery_score: clampScale(input.recoveryScore),
    process_orientation_score: clampScale(input.processOrientationScore),
    notes: cleanText(input.notes),
  };
}

function normalizeWellbeingInput(input: WellbeingInput) {
  return {
    week_context: cleanText(input.weekContext),
    stressors: cleanTextArray(input.stressors),
    protective_factors: cleanTextArray(input.protectiveFactors),
    emotional_exhaustion_score: clampScale(input.emotionalExhaustionScore),
    cynicism_score: clampScale(input.cynicismScore),
    motivation_score: clampScale(input.motivationScore),
    sleep_disruption_score: clampScale(input.sleepDisruptionScore),
    concentration_difficulty_score: clampScale(input.concentrationDifficultyScore),
    external_pressure_score: clampScale(input.externalPressureScore),
    institutional_support_score: clampScale(input.institutionalSupportScore),
    violence_exposure_score: clampScale(input.violenceExposureScore),
    recovery_quality_score: clampScale(input.recoveryQualityScore),
    workload_score: clampScale(input.workloadScore),
    notes: cleanText(input.notes),
  };
}

function normalizeExerciseInput(input: ExerciseInput) {
  const exerciseType = isExerciseType(input.exerciseType) ? input.exerciseType : "focus_reset";

  return {
    exercise_type: exerciseType,
    scenario_id: cleanText(input.scenarioId),
    scenario_title: cleanText(input.scenarioTitle),
    pressure_level: clampScale(input.pressureLevel),
    before_score: clampScale(input.beforeScore),
    after_score: clampScale(input.afterScore),
    clarity_score: clampScale(input.clarityScore),
    response_strategy: cleanText(input.responseStrategy),
    internal_dialogue_before: cleanText(input.internalDialogueBefore),
    internal_dialogue_after: cleanText(input.internalDialogueAfter),
    communication_phrase: cleanText(input.communicationPhrase),
    action_plan: cleanText(input.actionPlan),
    notes: cleanText(input.notes),
  };
}

function calculateMentalScore(payload: ReturnType<typeof normalizeInput>) {
  let score = 70;
  const activation = payload.activation_score ?? 6;

  score -= Math.abs(activation - 6) * 5;
  score += scoreDelta(payload.confidence_score, 4);
  score += scoreDelta(payload.concentration_score, 3);
  score += scoreDelta(payload.emotional_control_score, 3);
  score += scoreDelta(payload.process_orientation_score, 2);
  score -= (payload.pressure_score ?? 5) * 2.8;
  score -= (payload.mental_fatigue_score ?? 5) * 2.5;

  if (payload.checkin_type === "post_match") {
    score += scoreDelta(payload.recovery_score, 4);
  }

  if (payload.checkin_type === "error_recovery") {
    score -= (payload.error_impact_score ?? 5) * 2.5;
    score += scoreDelta(payload.recovery_score, 5);
    score += payload.learning ? 5 : -4;
    score += payload.next_action ? 4 : -3;
  }

  const value = Math.max(0, Math.min(100, Math.round(score)));
  return {
    value,
    status: mentalStatus(value),
  };
}

function calculateBurnoutRisk(payload: ReturnType<typeof normalizeWellbeingInput>) {
  const invertedMotivation = invertScale(payload.motivation_score);
  const invertedSupport = invertScale(payload.institutional_support_score);
  const invertedRecovery = invertScale(payload.recovery_quality_score);

  const weighted =
    (scaleOrDefault(payload.emotional_exhaustion_score, 5) * 1.4 +
      scaleOrDefault(payload.cynicism_score, 4) * 1 +
      invertedMotivation * 1 +
      scaleOrDefault(payload.sleep_disruption_score, 4) * 0.9 +
      scaleOrDefault(payload.concentration_difficulty_score, 4) * 0.9 +
      scaleOrDefault(payload.external_pressure_score, 5) * 1.1 +
      invertedSupport * 1 +
      scaleOrDefault(payload.violence_exposure_score, 1) * 1.1 +
      invertedRecovery * 1.1 +
      scaleOrDefault(payload.workload_score, 5) * 0.9) /
    10.4;

  const value = Math.max(0, Math.min(100, Math.round(((weighted - 1) / 9) * 100)));

  return {
    value,
    level: burnoutRiskLevel(value),
  };
}

function buildFeedback(
  payload: ReturnType<typeof normalizeInput>,
  score: ReturnType<typeof calculateMentalScore>
): PsychologyFeedback {
  const activation = payload.activation_score ?? 6;
  const pressure = payload.pressure_score ?? 5;
  const fatigue = payload.mental_fatigue_score ?? 5;
  const focusGoal = payload.focus_goal || "sostener foco en cada accion";
  const resetCue = payload.reset_cue || "respiro, miro zona activa y vuelvo a decidir";

  let focus = `Objetivo de proceso: ${focusGoal}.`;
  let action = `Rutina corta: ${resetCue}.`;
  let risk = "Riesgo controlado si mantenes foco en la siguiente decision.";

  if (activation >= 8) {
    action = "Baja revoluciones antes del partido: respiracion breve, primer desplazamiento simple y comunicacion clara.";
  } else if (activation <= 3) {
    action = "Subi activacion: entrada en calor con intencion, postura firme y primera consigna verbal clara.";
  }

  if (pressure >= 8) {
    risk = "Presion externa alta: evita arbitrar desde el miedo al error y volve al criterio observable.";
  }

  if (fatigue >= 8) {
    focus = "Fatiga mental alta: simplifica objetivos, prioriza ubicacion y comunicacion con el equipo arbitral.";
  }

  if (payload.checkin_type === "post_match") {
    focus = "Cierre post partido: separar resultado, critica externa y aprendizaje tecnico.";
    action = payload.learning
      ? `Aprendizaje registrado: ${payload.learning}`
      : "Anota un aprendizaje concreto antes de cerrar pagina.";
  }

  if (payload.checkin_type === "error_recovery") {
    focus = "Gestion del error: no buscar culpa, reconstruir contexto y detectar factores modificables.";
    action = payload.next_action
      ? `Proxima accion: ${payload.next_action}`
      : "Define una accion concreta para el proximo partido o entrenamiento.";
    risk =
      payload.error_factors.length >= 3
        ? "El error tuvo factores multiples. Conviene trabajarlo como situacion sistemica, no como falla aislada."
        : "El error parece acotado. Convertirlo en aprendizaje evita arrastrarlo al siguiente partido.";
  }

  return {
    summary: `${score.status} (${score.value}/100)`,
    focus,
    action,
    risk,
  };
}

function buildWellbeingFeedback(
  payload: ReturnType<typeof normalizeWellbeingInput>,
  risk: ReturnType<typeof calculateBurnoutRisk>
): WellbeingFeedback {
  const topRisk = topRiskFactor(payload);
  const hasViolence = scaleOrDefault(payload.violence_exposure_score, 1) >= 6 || payload.stressors.some((item) => item.toLowerCase().includes("amenaza"));
  const lowSupport = scaleOrDefault(payload.institutional_support_score, 6) <= 4;
  const lowRecovery = scaleOrDefault(payload.recovery_quality_score, 6) <= 4;

  let action = "Mantene una rutina simple: descanso, foco en proceso y revision breve sin sobreanalizar.";

  if (hasViolence) {
    action = "Registra el incidente, evita normalizar amenazas y busca respaldo institucional antes del proximo partido.";
  } else if (lowSupport) {
    action = "Prioriza pedir acompanamiento a un asesor, mentor o referente. No dejes el analisis solo en autocritica.";
  } else if (lowRecovery) {
    action = "Planifica recuperacion real: descanso, desconexion de redes y una tarea tecnica concreta, no mas de una.";
  } else if (risk.value >= 60) {
    action = "Baja carga si es posible y evita encadenar partidos exigentes sin cierre emocional previo.";
  }

  return {
    summary: `${risk.level} (${risk.value}/100)`,
    priority: `Principal foco de la semana: ${topRisk}.`,
    action,
    protection: payload.protective_factors.length
      ? `Factores protectores activos: ${payload.protective_factors.join(", ")}.`
      : "Suma al menos un factor protector concreto: apoyo, descanso, mentor o rutina de recuperacion.",
    note: "Lectura orientativa de bienestar arbitral; no es diagnostico clinico.",
  };
}

function buildExerciseFeedback(payload: ReturnType<typeof normalizeExerciseInput>): ExerciseFeedback {
  const before = payload.before_score ?? 5;
  const after = payload.after_score ?? before;
  const clarity = payload.clarity_score ?? 5;
  const improvement = after - before;
  const cue =
    payload.internal_dialogue_after ||
    payload.communication_phrase ||
    payload.action_plan ||
    "Ver, interpretar, decidir la siguiente accion";

  let learning = "El ejercicio fortalece foco y vuelta al presente.";
  let application = "Usalo como rutina breve antes del partido o despues de una accion critica.";

  if (payload.exercise_type === "pressure_scenario") {
    learning = "Entrenaste respuesta ante presion externa sin salir del criterio observable.";
    application = "Aplicalo cuando banco, jugadores o ambiente intenten modificar tu umbral de decision.";
  }

  if (payload.exercise_type === "self_talk") {
    learning = "Transformaste dialogo interno en una consigna operativa.";
    application = "Aplicalo cuando aparezcan pensamientos de juicio, miedo al error o exceso de responsabilidad.";
  }

  if (payload.exercise_type === "team_prebrief") {
    learning = "Ordenaste comunicacion y roles para reducir improvisacion del equipo arbitral.";
    application = "Usalo en la charla pre partido con asistentes, cuarto arbitro o VAR.";
  }

  return {
    summary: improvement > 1 ? `Mejora percibida +${improvement}` : improvement < 0 ? `Baja percibida ${improvement}` : `Estabilidad ${after}/10`,
    learning,
    nextCue: `Consigna util: ${cue}.`,
    application: clarity >= 7 ? application : `${application} Reforza claridad antes de llevarlo al partido.`,
  };
}

function buildSummary(checkins: SavedPsychologyRow[]) {
  const scores = checkins
    .map((item) => item.mental_score)
    .filter((value): value is number => typeof value === "number");

  const latest = checkins[0] ?? null;
  const average = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : null;

  return {
    total: checkins.length,
    average,
    latestScore: latest?.mental_score ?? null,
    latestStatus: latest?.mental_status ?? null,
    latestType: latest?.checkin_type ?? null,
    pressureAverage: averageOf(checkins.map((item) => item.pressure_score)),
    confidenceAverage: averageOf(checkins.map((item) => item.confidence_score)),
    recoveryAverage: averageOf(checkins.map((item) => item.recovery_score)),
  };
}

function buildWellbeingSummary(items: SavedWellbeingRow[]) {
  const latest = items[0] ?? null;

  return {
    total: items.length,
    latestRiskScore: latest?.burnout_risk_score ?? null,
    latestRiskLevel: latest?.burnout_risk_level ?? null,
    averageRiskScore: averageOf(items.map((item) => item.burnout_risk_score)),
    externalPressureAverage: averageOf(items.map((item) => item.external_pressure_score)),
    supportAverage: averageOf(items.map((item) => item.institutional_support_score)),
    recoveryAverage: averageOf(items.map((item) => item.recovery_quality_score)),
  };
}

function buildExerciseSummary(items: SavedExerciseRow[]) {
  const latest = items[0] ?? null;
  const improvements = items
    .map((item) =>
      typeof item.before_score === "number" && typeof item.after_score === "number"
        ? item.after_score - item.before_score
        : null
    )
    .filter((value): value is number => typeof value === "number");

  return {
    total: items.length,
    latestType: latest?.exercise_type ?? null,
    latestScenario: latest?.scenario_title ?? null,
    averageImprovement: improvements.length
      ? Math.round((improvements.reduce((sum, value) => sum + value, 0) / improvements.length) * 10) / 10
      : null,
    clarityAverage: averageOf(items.map((item) => item.clarity_score)),
  };
}

function isCheckInType(value: unknown): value is PsychologyCheckInType {
  return value === "pre_match" || value === "post_match" || value === "error_recovery";
}

function isExerciseType(value: unknown): value is PsychologyExerciseType {
  return value === "focus_reset" || value === "pressure_scenario" || value === "self_talk" || value === "team_prebrief";
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function clampScale(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(10, Math.round(number)));
}

function toMinute(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(130, Math.round(number)));
}

function scoreDelta(value: number | null, weight: number) {
  if (typeof value !== "number") return 0;
  return (value - 5) * weight;
}

function scaleOrDefault(value: number | null, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function invertScale(value: number | null) {
  return 11 - scaleOrDefault(value, 6);
}

function mentalStatus(score: number) {
  if (score < 50) return "Riesgo alto";
  if (score < 70) return "Necesita ajuste";
  if (score < 86) return "Preparado";
  return "Optimo";
}

function burnoutRiskLevel(score: number) {
  if (score < 35) return "Bajo";
  if (score < 60) return "Atencion";
  if (score < 80) return "Alto";
  return "Critico";
}

function topRiskFactor(payload: ReturnType<typeof normalizeWellbeingInput>) {
  const factors = [
    ["agotamiento emocional", scaleOrDefault(payload.emotional_exhaustion_score, 5)],
    ["presion externa", scaleOrDefault(payload.external_pressure_score, 5)],
    ["carga de partidos", scaleOrDefault(payload.workload_score, 5)],
    ["descanso alterado", scaleOrDefault(payload.sleep_disruption_score, 4)],
    ["baja recuperacion", invertScale(payload.recovery_quality_score)],
    ["bajo apoyo percibido", invertScale(payload.institutional_support_score)],
    ["exposicion a violencia o amenazas", scaleOrDefault(payload.violence_exposure_score, 1)],
  ] as const;

  return [...factors].sort((a, b) => b[1] - a[1])[0][0];
}

function averageOf(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function psychologyErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const missingSchema =
    message.includes("Could not find the table") ||
    message.includes("schema cache") ||
    message.includes("psychology_checkins") ||
    message.includes("psychology_wellbeing_assessments") ||
    message.includes("psychology_exercise_sessions");

  return NextResponse.json(
    {
      error: missingSchema
        ? "No se pudo guardar porque falta aplicar la migracion de Psicologia Arbitral."
        : "No se pudo guardar el check-in psicologico.",
      technical: message,
    },
    { status: 500 }
  );
}
