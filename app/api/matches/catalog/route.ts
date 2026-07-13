import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getMatchActorContext,
  getMatchesSetupIssue,
  loadMatchesCatalog,
} from "@/lib/matches/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const data = await loadMatchesCatalog(supabase, actor);
    return NextResponse.json(data);
  } catch (error) {
    const setupIssue = getMatchesSetupIssue(error);

    return NextResponse.json(
      {
        error: setupIssue
          ? "Falta aplicar la base de datos de Mis partidos."
          : "No se pudo cargar la configuracion de Mis partidos.",
        technical: error instanceof Error ? error.message : "Error desconocido",
        setupRequired: Boolean(setupIssue),
        missingTables: setupIssue?.missingTables ?? [],
        migrationId: setupIssue?.migrationId ?? null,
      },
      { status: setupIssue ? 503 : 500 }
    );
  }
}
