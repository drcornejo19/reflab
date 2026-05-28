import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bucketName = "institutional-videos";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("institutional_clips")
    .select(
      "id, title, description, match_context, incident_minute, category, topic, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at"
    )
    .eq("uploaded_by", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar los videos institucionales.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ clips: data ?? [] });
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  const supabase = createSupabaseAdminClient();

  try {
    const payload = contentType.includes("multipart/form-data")
      ? await readFormPayload(request, supabase, userId)
      : await readJsonPayload(request);

    if (!payload.title || payload.title.trim().length < 3) {
      return NextResponse.json(
        { error: "El titulo del clip es obligatorio." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("institutional_clips")
      .insert({
        uploaded_by: userId,
        source_url: payload.source_url || null,
        storage_path: payload.storage_path || null,
        original_filename: payload.original_filename || null,
        title: payload.title.trim(),
        description: payload.description || null,
        match_context: payload.match_context || null,
        incident_minute: payload.incident_minute || null,
        category: payload.category || null,
        topic: payload.topic || null,
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
      })
      .select(
        "id, title, description, match_context, incident_minute, category, topic, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at"
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
      { status: 500 }
    );
  }
}

type ClipPayload = {
  title: string;
  description?: string;
  match_context?: string;
  incident_minute?: string;
  category?: string;
  topic?: string;
  correct_decision?: string;
  correct_restart?: string;
  correct_discipline?: string;
  final_expected_answer?: string;
  explanation?: string;
  ifab_var_criteria?: string;
  difficulty?: string;
  mode?: string;
  is_public?: boolean;
  source_url?: string;
  storage_path?: string;
  original_filename?: string;
};

async function readJsonPayload(request: Request): Promise<ClipPayload> {
  const body = (await request.json()) as Partial<ClipPayload>;
  return {
    title: String(body.title ?? ""),
    description: nullableString(body.description),
    match_context: nullableString(body.match_context),
    incident_minute: nullableString(body.incident_minute),
    category: nullableString(body.category),
    topic: nullableString(body.topic),
    correct_decision: nullableString(body.correct_decision),
    correct_restart: nullableString(body.correct_restart),
    correct_discipline: nullableString(body.correct_discipline),
    final_expected_answer: nullableString(body.final_expected_answer),
    explanation: nullableString(body.explanation),
    ifab_var_criteria: nullableString(body.ifab_var_criteria),
    difficulty: nullableString(body.difficulty),
    mode: nullableString(body.mode),
    is_public: Boolean(body.is_public),
    source_url: nullableString(body.source_url),
  };
}

async function readFormPayload(
  request: Request,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<ClipPayload> {
  const form = await request.formData();
  const file = form.get("video_file");
  let storagePath: string | undefined;
  let originalFilename: string | undefined;

  if (file instanceof File && file.size > 0) {
    originalFilename = file.name;
    const extension = file.name.split(".").pop() || "mp4";
    storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
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
    description: formString(form, "description"),
    match_context: formString(form, "match_context"),
    incident_minute: formString(form, "incident_minute"),
    category: formString(form, "category"),
    topic: formString(form, "topic"),
    correct_decision: formString(form, "correct_decision"),
    correct_restart: formString(form, "correct_restart"),
    correct_discipline: formString(form, "correct_discipline"),
    final_expected_answer: formString(form, "final_expected_answer"),
    explanation: formString(form, "explanation"),
    ifab_var_criteria: formString(form, "ifab_var_criteria"),
    difficulty: formString(form, "difficulty"),
    mode: formString(form, "mode") || "institutional_video",
    is_public: form.get("is_public") === "true",
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
