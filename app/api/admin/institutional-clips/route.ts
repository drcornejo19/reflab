import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
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
      "id, institution_id, uploaded_by, title, description, match_context, incident_minute, category, topic, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at"
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
    topic?: string;
    correct_decision?: string;
    correct_restart?: string;
    correct_discipline?: string;
    final_expected_answer?: string;
    explanation?: string;
    ifab_var_criteria?: string;
    review_notes?: string;
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

  const update = {
    status: body.status,
    is_public: body.is_public,
    topic: nullableString(body.topic),
    correct_decision: nullableString(body.correct_decision),
    correct_restart: nullableString(body.correct_restart),
    correct_discipline: nullableString(body.correct_discipline),
    final_expected_answer: nullableString(body.final_expected_answer),
    explanation: nullableString(body.explanation),
    ifab_var_criteria: nullableString(body.ifab_var_criteria),
    review_notes: nullableString(body.review_notes),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await access.supabase
    .from("institutional_clips")
    .update(update)
    .eq("id", body.id)
    .select(
      "id, institution_id, uploaded_by, title, description, match_context, incident_minute, category, topic, correct_decision, correct_restart, correct_discipline, final_expected_answer, explanation, ifab_var_criteria, difficulty, mode, is_public, status, review_notes, source_url, storage_path, original_filename, created_at"
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

  const role = data?.role;
  if (error || (role !== "video_admin" && role !== "super_admin")) {
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
