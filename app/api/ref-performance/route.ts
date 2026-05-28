import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type CheckInType = "pre" | "post" | "rest_day";

type CheckInInput = {
  checkinType?: CheckInType;
  hasMatchToday?: boolean;
  hasTrainingToday?: boolean;
  activityType?: string;
  durationMinutes?: number | null;
  rpe?: number | null;
  fatigue?: number | null;
  sleepQuality?: string | null;
  sleepHours?: number | null;
  soreness?: string | null;
  emotionalScore?: number | null;
  completed?: boolean | null;
  recoveryMobility?: boolean | null;
  notes?: string | null;
};

type PhysicalTestInput = {
  testType?: string;
  score?: number;
  unit?: string | null;
  genderCategory?: string | null;
  targetValue?: number | null;
  notes?: string | null;
};

export async function GET() {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const data = await loadRefPerformanceData(supabase, userId);
    return NextResponse.json(data);
  } catch (error) {
    return migrationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const userId = await getClerkUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; payload?: CheckInInput | PhysicalTestInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido" }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (body.action === "save_checkin") {
      await saveCheckIn(supabase, userId, body.payload as CheckInInput);
      const data = await loadRefPerformanceData(supabase, userId);
      return NextResponse.json({ message: "Daily Ref Check-In guardado.", ...data });
    }

    if (body.action === "save_test") {
      await savePhysicalTest(supabase, userId, body.payload as PhysicalTestInput);
      const data = await loadRefPerformanceData(supabase, userId);
      return NextResponse.json({ message: "Test fisico guardado.", ...data });
    }

    return NextResponse.json({ error: "Accion no soportada" }, { status: 400 });
  } catch (error) {
    return migrationErrorResponse(error);
  }
}

async function getClerkUserId() {
  const session = await auth();
  return session.userId;
}

async function loadRefPerformanceData(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const [checkinsRes, sessionsRes, testsRes, readinessRes, wellnessRes, attemptsRes] = await Promise.all([
    supabase.from("performance_checkins").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
    supabase.from("performance_sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
    supabase.from("physical_tests").select("*").eq("user_id", userId).order("test_date", { ascending: false }).limit(40),
    supabase.from("readiness_scores").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
    supabase.from("wellness_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
    supabase.from("attempts").select("id,score,topic,mode,module,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(80),
  ]);

  const primaryError = checkinsRes.error || sessionsRes.error || testsRes.error || readinessRes.error || wellnessRes.error;
  if (primaryError) throw primaryError;

  return {
    checkins: checkinsRes.data ?? [],
    sessions: sessionsRes.data ?? [],
    tests: testsRes.data ?? [],
    readinessScores: readinessRes.data ?? [],
    wellnessLogs: wellnessRes.data ?? [],
    attempts: attemptsRes.error ? [] : attemptsRes.data ?? [],
    attemptsWarning: attemptsRes.error?.message ?? null,
  };
}

async function saveCheckIn(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string, input: CheckInInput = {}) {
  const payload = normalizeCheckIn(input);
  const readiness = calculateReadiness(payload);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const internalLoad = payload.checkin_type === "post" && payload.duration_minutes && payload.rpe
    ? payload.duration_minutes * payload.rpe
    : null;

  const { data: savedCheckIn, error: checkinError } = await supabase
    .from("performance_checkins")
    .insert([
      {
        user_id: userId,
        date: today,
        checkin_type: payload.checkin_type,
        has_match_today: payload.has_match_today,
        has_training_today: payload.has_training_today,
        activity_type: payload.activity_type,
        duration_minutes: payload.duration_minutes,
        rpe: payload.rpe,
        fatigue: payload.fatigue,
        sleep_quality: payload.sleep_quality,
        sleep_hours: payload.sleep_hours,
        soreness: payload.soreness,
        emotional_state: payload.emotional_score ? `${payload.emotional_score}/10` : null,
        emotional_score: payload.emotional_score,
        readiness_score: readiness.score,
        readiness_status: readiness.status,
        completed: payload.completed,
        recovery_mobility: payload.recovery_mobility,
        internal_load: internalLoad,
        notes: payload.notes,
        created_at: now,
        updated_at: now,
      },
    ])
    .select("*")
    .single();

  if (checkinError) throw checkinError;

  const checkinId = savedCheckIn?.id ?? null;
  const writes = [
    supabase.from("readiness_scores").insert([
      {
        user_id: userId,
        checkin_id: checkinId,
        score: readiness.score,
        status: readiness.status,
        factors: readiness.factors,
        created_at: now,
      },
    ]),
    supabase.from("wellness_logs").insert([
      {
        user_id: userId,
        checkin_id: checkinId,
        date: today,
        sleep_quality: payload.sleep_quality,
        sleep_hours: payload.sleep_hours,
        fatigue: payload.fatigue,
        soreness: payload.soreness,
        emotional_state: payload.emotional_score ? `${payload.emotional_score}/10` : null,
        emotional_score: payload.emotional_score,
        recovery_mobility: payload.recovery_mobility,
        notes: payload.notes,
        created_at: now,
        updated_at: now,
      },
    ]),
  ];

  if (payload.checkin_type === "post") {
    writes.push(
      supabase.from("performance_sessions").insert([
        {
          user_id: userId,
          checkin_id: checkinId,
          session_date: today,
          session_type: payload.activity_type ?? "Actividad arbitral",
          duration_minutes: payload.duration_minutes,
          rpe: payload.rpe,
          internal_load: internalLoad,
          fatigue_post: payload.fatigue,
          soreness_post: payload.soreness,
          completed: payload.completed ?? true,
          notes: payload.notes,
          created_at: now,
          updated_at: now,
        },
      ])
    );
  }

  const results = await Promise.all(writes);
  const secondaryError = results.find((result) => result.error)?.error;
  if (secondaryError) throw secondaryError;
}

async function savePhysicalTest(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string, input: PhysicalTestInput = {}) {
  const score = Number(input.score);
  if (!input.testType || !Number.isFinite(score)) {
    throw new Error("Carga un test y una marca valida.");
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("physical_tests").insert([
    {
      user_id: userId,
      test_type: input.testType,
      score,
      unit: input.unit || null,
      gender_category: input.genderCategory || null,
      target_value: Number.isFinite(Number(input.targetValue)) ? Number(input.targetValue) : null,
      notes: input.notes || null,
      test_date: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    },
  ]);

  if (error) throw error;
}

function normalizeCheckIn(input: CheckInInput) {
  const checkinType = input.checkinType ?? "pre";
  const hasActivity = checkinType !== "rest_day" && (input.hasMatchToday || input.hasTrainingToday || checkinType === "post");
  const duration = toPositiveInt(input.durationMinutes);
  const rpe = clampScale(input.rpe);

  if (checkinType === "post") {
    if (!input.activityType) throw new Error("Indica que actividad hiciste.");
    if (!duration) throw new Error("La duracion es obligatoria para post actividad.");
    if (!rpe) throw new Error("El RPE es obligatorio para post actividad.");
  }

  if (checkinType === "pre" && hasActivity && !input.activityType) {
    throw new Error("Indica que actividad vas a hacer.");
  }

  return {
    checkin_type: checkinType,
    has_match_today: checkinType === "rest_day" ? false : Boolean(input.hasMatchToday),
    has_training_today: checkinType === "rest_day" ? false : Boolean(input.hasTrainingToday),
    activity_type: checkinType === "rest_day" ? "Descanso" : input.activityType || null,
    duration_minutes: checkinType === "post" ? duration : null,
    rpe: checkinType === "post" ? rpe : null,
    fatigue: clampScale(input.fatigue),
    sleep_quality: input.sleepQuality || null,
    sleep_hours: toSleepHours(input.sleepHours),
    soreness: input.soreness || null,
    emotional_score: clampScale(input.emotionalScore),
    completed: checkinType === "post" ? input.completed ?? true : null,
    recovery_mobility: checkinType === "rest_day" ? Boolean(input.recoveryMobility) : input.recoveryMobility ?? null,
    notes: input.notes || null,
  };
}

function calculateReadiness(payload: ReturnType<typeof normalizeCheckIn>) {
  let score = 78;
  const sleepHours = payload.sleep_hours;
  const fatigue = payload.fatigue;
  const emotional = payload.emotional_score;

  if (payload.sleep_quality) score += sleepQualityScore(payload.sleep_quality);
  if (typeof sleepHours === "number") score += Math.min(10, Math.max(-16, (sleepHours - 7) * 4));
  if (typeof fatigue === "number") score -= fatigue * 4;
  if (payload.soreness) score -= sorenessPenalty(payload.soreness);
  if (typeof emotional === "number") score += (emotional - 5) * 3;
  if (payload.checkin_type === "post" && payload.rpe && payload.duration_minutes) {
    score -= Math.max(0, payload.rpe - 6) * 3;
    score -= payload.duration_minutes >= 90 ? 5 : 0;
  }
  if (payload.checkin_type === "rest_day" && payload.recovery_mobility) score += 4;

  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: normalized,
    status: readinessStatus(normalized),
    factors: {
      checkin_type: payload.checkin_type,
      sleep_quality: payload.sleep_quality,
      sleep_hours: payload.sleep_hours,
      fatigue: payload.fatigue,
      soreness: payload.soreness,
      emotional_score: payload.emotional_score,
      rpe: payload.rpe,
      duration_minutes: payload.duration_minutes,
      internal_load: payload.duration_minutes && payload.rpe ? payload.duration_minutes * payload.rpe : null,
    },
  };
}

function migrationErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Error desconocido";
  const missingSchema = message.includes("Could not find the table") || message.includes("schema cache") || message.includes("performance_");

  return NextResponse.json(
    {
      error: missingSchema
        ? "No se pudo guardar en Supabase porque falta aplicar la migracion de Ref Performance."
        : "No se pudo guardar en Supabase.",
      technical: message,
    },
    { status: 500 }
  );
}

function toPositiveInt(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number);
}

function clampScale(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(10, Math.round(number)));
}

function toSleepHours(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 24) return null;
  return Math.round(number * 10) / 10;
}

function sleepQualityScore(value: string) {
  const map: Record<string, number> = { "Muy mala": -16, Mala: -10, Normal: 0, Buena: 7, Excelente: 12 };
  return map[value] ?? 0;
}

function sorenessPenalty(value: string) {
  const map: Record<string, number> = { Ninguna: 0, Leve: 5, Moderada: 13, Alta: 24 };
  return map[value] ?? 0;
}

function readinessStatus(score: number) {
  if (score < 50) return "Bajo";
  if (score < 70) return "Moderado";
  if (score < 86) return "Optimo";
  return "Elite";
}
