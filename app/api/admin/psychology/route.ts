import { NextResponse } from "next/server";
import {
  requireSuperAdminAccess,
  requireSuperAdminReadAccess,
} from "@/lib/adminAuthorization";
import {
  buildPsychologyInterfaceData,
  normalizePsychologyModuleSlug,
  type PsychologyCheckinRecord,
  type PsychologyExerciseRecord,
  type PsychologyWellbeingRecord,
} from "@/lib/psychology";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type UpdateCategoryBody = {
  source?: unknown;
  recordId?: unknown;
  moduleSlug?: unknown;
};

export async function GET() {
  const access = await requireSuperAdminReadAccess();
  if (access.response) return access.response;

  const [checkinsRes, wellbeingRes, exercisesRes] = await Promise.all([
    access.supabase
      .from("psychology_checkins")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(90),
    access.supabase
      .from("psychology_wellbeing_assessments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(60),
    access.supabase
      .from("psychology_exercise_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(90),
  ]);

  const error = checkinsRes.error || wellbeingRes.error || exercisesRes.error;
  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo cargar Admin de Psicologia Arbitral.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  const modularData = buildPsychologyInterfaceData({
    checkins: (checkinsRes.data ?? []) as PsychologyCheckinRecord[],
    wellbeingAssessments: (wellbeingRes.data ?? []) as PsychologyWellbeingRecord[],
    exerciseSessions: (exercisesRes.data ?? []) as PsychologyExerciseRecord[],
  });

  return NextResponse.json({
    records: modularData.records,
    modules: modularData.modules,
    futureMetrics: modularData.futureMetrics,
    pendingClassification: modularData.records.filter(
      (record) => record.classificationStatus === "Sin clasificar"
    ).length,
  });
}

export async function PATCH(request: Request) {
  const access = await requireSuperAdminAccess();
  if (access.response) return access.response;

  let body: UpdateCategoryBody;
  try {
    body = (await request.json()) as UpdateCategoryBody;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const source = parseSource(body.source);
  const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
  const moduleSlug =
    typeof body.moduleSlug === "string" && body.moduleSlug.trim()
      ? normalizePsychologyModuleSlug(body.moduleSlug.trim())
      : null;

  if (!source || !recordId || !moduleSlug) {
    return NextResponse.json({ error: "Faltan datos para actualizar la categoria." }, { status: 400 });
  }

  const table =
    source === "checkin"
      ? "psychology_checkins"
      : source === "wellbeing"
        ? "psychology_wellbeing_assessments"
        : "psychology_exercise_sessions";

  const { error } = await access.supabase
    .from(table)
    .update({ module_slug: moduleSlug })
    .eq("id", recordId);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo actualizar la categoria.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

function parseSource(value: unknown) {
  if (value === "checkin" || value === "wellbeing" || value === "exercise") {
    return value;
  }

  return null;
}
