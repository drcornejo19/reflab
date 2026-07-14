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
    const competitionExternalId = requiredParam(
      searchParams.get("competitionExternalId"),
      "competitionExternalId"
    );
    const countryName = searchParams.get("countryName");
    const date = searchParams.get("date");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const seasonYearParam = searchParams.get("seasonYear");
    const seasonYear = seasonYearParam ? Number(seasonYearParam) : null;

    const fixtures = date
      ? await provider.getFixturesByDate({
          sportType,
          date,
          countryName,
          competitionExternalId,
          seasonYear: Number.isFinite(seasonYear) ? seasonYear : null,
        })
      : await provider.getFixturesByRange({
          sportType,
          dateFrom: requiredParam(dateFrom, "dateFrom"),
          dateTo: requiredParam(dateTo, "dateTo"),
          countryName,
          competitionExternalId,
          seasonYear: Number.isFinite(seasonYear) ? seasonYear : null,
        });

    return NextResponse.json({
      ...buildSportsProviderMeta(),
      sportType,
      competitionExternalId,
      fixtures,
    });
  } catch (error) {
    return buildSportsErrorResponse(error);
  }
}
