import { NextResponse } from "next/server";
import {
  DEFAULT_SPORT_TYPE,
  getGoverningBodyForSport,
  isTopicAllowedForSport,
  normalizeSportType,
} from "@/lib/sports";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  assertInstitutionWriteAllowed,
  InstitutionAccessError,
  requireInstitutionPermission,
} from "@/lib/institutional/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bucketName = "institutional-videos";

export async function GET() {
  try {
    const access = await requireInstitutionPermission("content.read");
    const { data, error } = await access.supabase
      .from("institutional_clips")
      .select(
        "id, title, description, match_context, incident_minute, category, topic, subtopic, rule_reference, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at, sport_type, season, source_version, source_official, governing_body, technical_resolution, disciplinary_resolution, normative_status, language, reviewed_at"
      )
      .eq("institution_id", access.context.institution.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(error.message);
    return NextResponse.json({ clips: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los videos institucionales.",
        technical: error instanceof Error ? error.message : String(error),
      },
      { status: error instanceof InstitutionAccessError ? error.status : 500 }
    );
  }
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  try {
    const access = await requireInstitutionPermission("content.manage");
    assertInstitutionWriteAllowed(access);
    const userId = access.userId;
    const supabase = access.supabase;
    const institutionId = access.context.institution.id;
    const payload = contentType.includes("multipart/form-data")
      ? await readFormPayload(request, supabase, userId, institutionId)
      : await readJsonPayload(request);

    if (!payload.title || payload.title.trim().length < 3) {
      return NextResponse.json(
        { error: "El titulo del clip es obligatorio." },
        { status: 400 }
      );
    }

    const sportType = normalizeSportType(payload.sport_type ?? DEFAULT_SPORT_TYPE);
    const governingBody =
      payload.governing_body || getGoverningBodyForSport(sportType);

    if (!isTopicAllowedForSport(sportType, payload.topic)) {
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

    const { data, error } = await supabase
      .from("institutional_clips")
      .insert({
        institution_id: institutionId,
        uploaded_by: userId,
        sport_type: sportType,
        source_url: payload.source_url || null,
        storage_path: payload.storage_path || null,
        original_filename: payload.original_filename || null,
        title: payload.title.trim(),
        description: payload.description || null,
        match_context: payload.match_context || null,
        incident_minute: payload.incident_minute || null,
        category: payload.category || null,
        topic: payload.topic || null,
        subtopic: payload.subtopic || null,
        rule_reference: payload.rule_reference || null,
        correct_decision: payload.correct_decision || null,
        correct_restart: payload.correct_restart || null,
        correct_discipline: payload.correct_discipline || null,
        final_expected_answer: payload.final_expected_answer || null,
        explanation: payload.explanation || null,
        ifab_var_criteria: payload.ifab_var_criteria || null,
        difficulty: payload.difficulty || null,
        mode: payload.mode || "institutional_video",
        is_public: Boolean(payload.is_public),
        status: "uploaded",
        season: payload.season || null,
        source_version: payload.source_version || null,
        source_official: payload.source_official || null,
        governing_body: governingBody,
        technical_resolution: payload.technical_resolution || null,
        disciplinary_resolution: payload.disciplinary_resolution || null,
        normative_status: payload.normative_status || null,
        language: payload.language || null,
        reviewed_at: payload.reviewed_at || null,
      })
      .select(
        "id, title, description, match_context, incident_minute, category, topic, subtopic, rule_reference, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at, sport_type, season, source_version, source_official, governing_body, technical_resolution, disciplinary_resolution, normative_status, language, reviewed_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        {
          error: "No se pudo guardar el video institucional.",
          technical: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ clip: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo procesar el envio del video.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: error instanceof InstitutionAccessError ? error.status : 500 }
    );
  }
}

type ClipPayload = {
  title: string;
  sport_type?: string;
  description?: string;
  match_context?: string;
  incident_minute?: string;
  category?: string;
  topic?: string;
  subtopic?: string;
  rule_reference?: string;
  correct_decision?: string;
  correct_restart?: string;
  correct_discipline?: string;
  final_expected_answer?: string;
  explanation?: string;
  ifab_var_criteria?: string;
  difficulty?: string;
  mode?: string;
  is_public?: boolean;
  season?: string;
  source_version?: string;
  source_official?: string;
  governing_body?: string;
  technical_resolution?: string;
  disciplinary_resolution?: string;
  normative_status?: string;
  language?: string;
  reviewed_at?: string;
  source_url?: string;
  storage_path?: string;
  original_filename?: string;
};

async function readJsonPayload(request: Request): Promise<ClipPayload> {
  const body = (await request.json()) as Partial<ClipPayload>;
  return {
    title: String(body.title ?? ""),
    sport_type: nullableString(body.sport_type),
    description: nullableString(body.description),
    match_context: nullableString(body.match_context),
    incident_minute: nullableString(body.incident_minute),
    category: nullableString(body.category),
    topic: nullableString(body.topic),
    subtopic: nullableString(body.subtopic),
    rule_reference: nullableString(body.rule_reference),
    correct_decision: nullableString(body.correct_decision),
    correct_restart: nullableString(body.correct_restart),
    correct_discipline: nullableString(body.correct_discipline),
    final_expected_answer: nullableString(body.final_expected_answer),
    explanation: nullableString(body.explanation),
    ifab_var_criteria: nullableString(body.ifab_var_criteria),
    difficulty: nullableString(body.difficulty),
    mode: nullableString(body.mode),
    is_public: Boolean(body.is_public),
    season: nullableString(body.season),
    source_version: nullableString(body.source_version),
    source_official: nullableString(body.source_official),
    governing_body: nullableString(body.governing_body),
    technical_resolution: nullableString(body.technical_resolution),
    disciplinary_resolution: nullableString(body.disciplinary_resolution),
    normative_status: nullableString(body.normative_status),
    language: nullableString(body.language),
    reviewed_at: nullableString(body.reviewed_at),
    source_url: nullableString(body.source_url),
  };
}

async function readFormPayload(
  request: Request,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  institutionId: string
): Promise<ClipPayload> {
  const form = await request.formData();
  const file = form.get("video_file");
  let storagePath: string | undefined;
  let originalFilename: string | undefined;

  if (file instanceof File && file.size > 0) {
    originalFilename = file.name;
    const extension = file.name.split(".").pop() || "mp4";
    storagePath = `${institutionId}/${userId}/${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }
  }

  return {
    title: formString(form, "title") ?? "",
    sport_type: formString(form, "sport_type") ?? DEFAULT_SPORT_TYPE,
    description: formString(form, "description"),
    match_context: formString(form, "match_context"),
    incident_minute: formString(form, "incident_minute"),
    category: formString(form, "category"),
    topic: formString(form, "topic"),
    subtopic: formString(form, "subtopic"),
    rule_reference: formString(form, "rule_reference"),
    correct_decision: formString(form, "correct_decision"),
    correct_restart: formString(form, "correct_restart"),
    correct_discipline: formString(form, "correct_discipline"),
    final_expected_answer: formString(form, "final_expected_answer"),
    explanation: formString(form, "explanation"),
    ifab_var_criteria: formString(form, "ifab_var_criteria"),
    difficulty: formString(form, "difficulty"),
    mode: formString(form, "mode") || "institutional_video",
    is_public: form.get("is_public") === "true",
    season: formString(form, "season"),
    source_version: formString(form, "source_version"),
    source_official: formString(form, "source_official"),
    governing_body: formString(form, "governing_body"),
    technical_resolution: formString(form, "technical_resolution"),
    disciplinary_resolution: formString(form, "disciplinary_resolution"),
    normative_status: formString(form, "normative_status"),
    language: formString(form, "language"),
    reviewed_at: formString(form, "reviewed_at"),
    source_url: formString(form, "source_url"),
    storage_path: storagePath,
    original_filename: originalFilename,
  };
}

function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
