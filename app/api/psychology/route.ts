import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type PsychologyCheckInType = "pre_match" | "post_match" | "error_recovery";

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

type PsychologyFeedback = {
  summary: string;
  focus: string;
  action: string;
  risk: string;
};

export async function GET() {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("psychology_checkins")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;

    const checkins = (data ?? []) as SavedPsychologyRow[];
    return NextResponse.json({
      checkins,
      summary: buildSummary(checkins),
    });
  } catch (error) {
    return psychologyErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; payload?: PsychologyInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  if (body.action !== "save_checkin") {
    return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
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

    const { data: checkins, error: loadError } = await supabase
      .from("psychology_checkins")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40);

    if (loadError) throw loadError;

    return NextResponse.json({
      message: "Check-in psicologico guardado.",
      checkins: checkins ?? [],
      summary: buildSummary((checkins ?? []) as SavedPsychologyRow[]),
    });
  } catch (error) {
    return psychologyErrorResponse(error);
  }
}

async function getClerkUserId() {
  const session = await auth();
  return session.userId;
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

function isCheckInType(value: unknown): value is PsychologyCheckInType {
  return value === "pre_match" || value === "post_match" || value === "error_recovery";
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

function mentalStatus(score: number) {
  if (score < 50) return "Riesgo alto";
  if (score < 70) return "Necesita ajuste";
  if (score < 86) return "Preparado";
  return "Optimo";
}

function averageOf(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function psychologyErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const missingSchema = message.includes("Could not find the table") || message.includes("schema cache") || message.includes("psychology_checkins");

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
