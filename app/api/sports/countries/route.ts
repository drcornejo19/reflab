import { NextResponse } from "next/server";
import {
  buildSportsErrorResponse,
  buildSportsProviderMeta,
  requireSportsUser,
} from "@/app/api/sports/_shared";
import { getSportsProvider } from "@/lib/sports-data/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const unauthorized = await requireSportsUser();
  if (unauthorized) return unauthorized;

  try {
    const provider = getSportsProvider();
    const countries = await provider.getCountries();

    return NextResponse.json({
      ...buildSportsProviderMeta(),
      countries,
    });
  } catch (error) {
    return buildSportsErrorResponse(error);
  }
}
