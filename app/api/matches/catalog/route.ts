import { NextResponse } from "next/server";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import { normalizeSportType } from "@/lib/sports";
import {
  getMatchesSetupIssue,
  loadMatchesCatalog,
} from "@/lib/matches/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authorization = await requireMatchesActor({
      requestedInstitutionId: searchParams.get("institutionId"),
    });
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

    const data = await loadMatchesCatalog(
      authorization.supabase,
      authorization.actor,
      filters
    );

    return NextResponse.json(data);
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    const setupIssue = getMatchesSetupIssue(error);

    return NextResponse.json(
      {
        error: setupIssue
          ? "Falta aplicar la base de datos de Mis partidos."
          : "No se pudo cargar la configuracion de Mis partidos.",
        setupRequired: Boolean(setupIssue),
        missingTables: setupIssue?.missingTables ?? [],
        migrationId: setupIssue?.migrationId ?? null,
      },
      { status: setupIssue ? 503 : 500 }
    );
  }
}
