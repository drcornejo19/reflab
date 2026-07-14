import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { normalizeSportType } from "@/lib/sports";
import {
  getMatchActorContext,
  getMatchesSetupIssue,
  loadMatchesCatalog,
} from "@/lib/matches/server";
import { syncSportsCatalogWindow } from "@/lib/sports-data/sync";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const { searchParams } = new URL(request.url);
    const sportParam = searchParams.get("sportType");
    const filters = {
      sportType: sportParam ? normalizeSportType(sportParam) : null,
      countryId: searchParams.get("countryId"),
      associationId: searchParams.get("associationId"),
      competitionId: searchParams.get("competitionId"),
      categoryId: searchParams.get("categoryId"),
      seasonId: searchParams.get("seasonId"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    };

    const automationStatus = await syncSportsCatalogWindow({
      supabase,
      sportType: filters.sportType ?? normalizeSportType(null),
      countryId: filters.countryId,
      associationId: filters.associationId,
      competitionId: filters.competitionId,
      categoryId: filters.categoryId,
      seasonId: filters.seasonId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      actorCountryName: actor.profile.country,
    });
    const data = await loadMatchesCatalog(supabase, actor, filters);

    return NextResponse.json({
      ...data,
      automationStatus,
    });
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
