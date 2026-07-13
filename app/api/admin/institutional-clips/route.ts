import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeRole } from "@/lib/institutionalRoles";
import {
  getGoverningBodyForSport,
  isTopicAllowedForSport,
  normalizeSportType,
} from "@/lib/sports";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  institutionalClipStatuses,
  type InstitutionalClipStatus,
} from "@/lib/institutionalExperience";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;

  const { data, error } = await access.supabase
    .from("institutional_clips")
    .select(
      "id, institution_id, uploaded_by, title, description, match_context, incident_minute, category, topic, subtopic, rule_reference, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at, sport_type, season, source_version, source_official, governing_body, technical_resolution, disciplinary_resolution, normative_status, language, reviewed_at"
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los clips institucionales.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ clips: data ?? [], statuses: institutionalClipStatuses });
}

export async function PATCH(request: Request) {
  const access = await requireAdmin();
  if (access.response) return access.response;

  let body: {
    id?: string;
    status?: InstitutionalClipStatus;
    is_public?: boolean;
    sport_type?: string;
    topic?: string;
    subtopic?: string;
    rule_reference?: string;
    correct_decision?: string;
    correct_restart?: string;
    correct_discipline?: string;
    final_expected_answer?: string;
    explanation?: string;
    ifab_var_criteria?: string;
    review_notes?: string;
    season?: string;
    source_version?: string;
    source_official?: string;
    governing_body?: string;
    technical_resolution?: string;
    disciplinary_resolution?: string;
    normative_status?: string;
    language?: string;
    reviewed_at?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Clip invalido." }, { status: 400 });
  }

  if (body.status && !institutionalClipStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Estado invalido." }, { status: 400 });
  }

  const sportType = normalizeSportType(body.sport_type);
  const governingBody =
    body.governing_body?.trim() || getGoverningBodyForSport(sportType);

  if (body.topic && !isTopicAllowedForSport(sportType, body.topic)) {
    return NextResponse.json(
      { error: "El topico no coincide con la disciplina del clip." },
      { status: 400 }
    );
  }

  if (governingBody !== getGoverningBodyForSport(sportType)) {
    return NextResponse.json(
      { error: "El organismo rector no coincide con la disciplina del clip." },
      { status: 400 }
    );
  }

  const isPublishing = body.status === "published" || body.is_public === true;

  if (isPublishing && !body.source_official?.trim()) {
    return NextResponse.json(
      { error: "Para publicar un clip institucional se requiere fuente oficial." },
      { status: 400 }
    );
  }

  if (isPublishing && !body.rule_reference?.trim()) {
    return NextResponse.json(
      { error: "Para publicar un clip institucional se requiere referencia reglamentaria." },
      { status: 400 }
    );
  }

  if (isPublishing && !body.technical_resolution?.trim()) {
    return NextResponse.json(
      { error: "Para publicar un clip institucional se requiere resolucion tecnica." },
      { status: 400 }
    );
  }

  const update = {
    status: body.status,
    is_public: body.is_public,
    sport_type: body.sport_type === undefined ? undefined : sportType,
    topic: nullableString(body.topic),
    subtopic:
      body.subtopic === undefined ? undefined : nullableString(body.subtopic),
    rule_reference:
      body.rule_reference === undefined
        ? undefined
        : nullableString(body.rule_reference),
    correct_decision: nullableString(body.correct_decision),
    correct_restart: nullableString(body.correct_restart),
    correct_discipline: nullableString(body.correct_discipline),
    final_expected_answer: nullableString(body.final_expected_answer),
    explanation: nullableString(body.explanation),
    ifab_var_criteria: nullableString(body.ifab_var_criteria),
    review_notes: nullableString(body.review_notes),
    season:
      body.season === undefined ? undefined : nullableString(body.season),
    source_version:
      body.source_version === undefined
        ? undefined
        : nullableString(body.source_version),
    source_official:
      body.source_official === undefined
        ? undefined
        : nullableString(body.source_official),
    governing_body:
      body.governing_body === undefined
        ? undefined
        : governingBody,
    technical_resolution:
      body.technical_resolution === undefined
        ? undefined
        : nullableString(body.technical_resolution),
    disciplinary_resolution:
      body.disciplinary_resolution === undefined
        ? undefined
        : nullableString(body.disciplinary_resolution),
    normative_status:
      body.normative_status === undefined
        ? undefined
        : nullableString(body.normative_status),
    language:
      body.language === undefined ? undefined : nullableString(body.language),
    reviewed_at:
      body.reviewed_at === undefined
        ? undefined
        : nullableString(body.reviewed_at),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await access.supabase
    .from("institutional_clips")
    .update(update)
    .eq("id", body.id)
    .select(
      "id, institution_id, uploaded_by, title, description, match_context, incident_minute, category, topic, subtopic, rule_reference, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at, sport_type, season, source_version, source_official, governing_body, technical_resolution, disciplinary_resolution, normative_status, language, reviewed_at"
    )
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo actualizar el clip institucional.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ clip: data });
}

async function requireAdmin() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = normalizeRole(data?.role);
  if (error || role !== "super_admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { response: null, supabase };
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
