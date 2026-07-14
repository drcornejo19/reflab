import { NextResponse } from "next/server";
import {
  buildSportsErrorResponse,
  buildSportsProviderMeta,
  parseSportTypeParam,
  requireSportsUser,
  requiredParam,
} from "@/app/api/sports/_shared";
import { getSportsProvider } from "@/lib/sports-data/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = await requireSportsUser();
  if (unauthorized) return unauthorized;

  try {
    const provider = getSportsProvider();
    const { searchParams } = new URL(request.url);
    const sportType = parseSportTypeParam(searchParams.get("sportType"));
    const teamExternalId = requiredParam(searchParams.get("teamExternalId"), "teamExternalId");
    const competitionExternalId = requiredParam(
      searchParams.get("competitionExternalId"),
      "competitionExternalId"
    );
    const seasonYear = Number(requiredParam(searchParams.get("seasonYear"), "seasonYear"));

    const teamForm = await provider.getTeamForm({
      sportType,
      teamExternalId,
      competitionExternalId,
      seasonYear,
    });

    return NextResponse.json({
      ...buildSportsProviderMeta(),
      sportType,
      teamExternalId,
      competitionExternalId,
      seasonYear,
      teamForm,
    });
  } catch (error) {
    return buildSportsErrorResponse(error);
  }
}
