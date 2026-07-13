import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { DEFAULT_SPORT_TYPE, normalizeSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sportType = normalizeSportType(
    searchParams.get("sport"),
    DEFAULT_SPORT_TYPE
  );

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ifab_library_documents")
    .select(
      "id,title,category,language,source_official,effective_date,status,summary,file_url,storage_path,uploaded_by,created_at,updated_at,sport_type,governing_body,season,published_at,reviewed_at,source_version"
    )
    .eq("sport_type", sportType)
    .order("created_at", { ascending: false })
    .limit(120);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudo cargar la biblioteca publica.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ documents: data ?? [] });
}
