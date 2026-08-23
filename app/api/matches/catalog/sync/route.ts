import { NextResponse } from "next/server";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import { normalizeSportType } from "@/lib/sports";
import { syncSportsCatalogWindow } from "@/lib/sports-data/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CatalogSyncBody = {
  institutionId?: string | null;
  sportType?: string | null;
  countryId?: string | null;
  associationId?: string | null;
  competitionId?: string | null;
  categoryId?: string | null;
  seasonId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export async function POST(request: Request) {
  let body: CatalogSyncBody;
  try {
    body = (await request.json()) as CatalogSyncBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const authorization = await requireMatchesActor({
      requestedInstitutionId: body.institutionId,
      requireInstitutionContext: Boolean(body.institutionId),
      requireInstitutionPermission: body.institutionId
        ? "matches.manage"
        : undefined,
    });
    if (
      !authorization.actor.isSuperAdmin &&
      !authorization.actor.canManageInstitution
    ) {
      return NextResponse.json(
        { error: "matches_manage_forbidden" },
        { status: 403 }
      );
    }

    const automationStatus = await syncSportsCatalogWindow({
      supabase: authorization.supabase,
      sportType: normalizeSportType(body.sportType),
      countryId: body.countryId ?? null,
      associationId: body.associationId ?? null,
      competitionId: body.competitionId ?? null,
      categoryId: body.categoryId ?? null,
      seasonId: body.seasonId ?? null,
      dateFrom: body.dateFrom ?? null,
      dateTo: body.dateTo ?? null,
      actorCountryName: authorization.actor.profile.country,
    });

    return NextResponse.json({ automationStatus });
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    return NextResponse.json(
      { error: "catalog_sync_failed" },
      { status: 500 }
    );
  }
}
