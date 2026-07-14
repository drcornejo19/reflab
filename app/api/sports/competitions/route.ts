import { NextResponse } from "next/server";
import {
  buildSportsErrorResponse,
  buildSportsProviderMeta,
  parseSportTypeParam,
  requireSportsUser,
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
    const countryName = searchParams.get("countryName");
    const seasonYearParam = searchParams.get("seasonYear");
    const seasonYear = seasonYearParam ? Number(seasonYearParam) : null;

    const competitions = await provider.getCompetitions({
      sportType,
      countryName,
      seasonYear: Number.isFinite(seasonYear) ? seasonYear : null,
    });

    return NextResponse.json({
      ...buildSportsProviderMeta(),
      sportType,
      countryName,
      competitions,
    });
  } catch (error) {
    return buildSportsErrorResponse(error);
  }
}
