import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { loadAccessSnapshot } from "@/lib/access/server";
import { getRankingRows } from "@/lib/performance";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizeSportType } from "@/lib/sports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const access = await loadAccessSnapshot(supabase, userId);

    if (
      access.globalRole !== "super_admin" &&
      !access.capabilities.includes("advanced_individual")
    ) {
      return NextResponse.json(
        { error: "Tu plan actual no incluye el ranking completo." },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const sportType = normalizeSportType(url.searchParams.get("sport"));
    const [attemptsResult, profilesResult] = await Promise.all([
      supabase
        .from("attempts")
        .select("user_id,score,sport_type,mode,created_at")
        .eq("sport_type", sportType)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("user_profiles")
        .select(
          "user_id,ref_card_id,first_name,last_name,ranking_display_name,show_real_name_in_ranking"
        ),
    ]);

    if (attemptsResult.error) throw attemptsResult.error;
    if (profilesResult.error) throw profilesResult.error;

    const ranking = getRankingRows(
      attemptsResult.data ?? [],
      userId,
      profilesResult.data ?? [],
      sportType
    );

    return NextResponse.json({ ranking });
  } catch (error) {
    console.error("Ranking API failed:", getErrorMessage(error));
    return NextResponse.json(
      { error: "No se pudo cargar el ranking." },
      { status: 500 }
    );
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
