import { NextResponse } from "next/server";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import { getMatchProviderReadiness } from "@/lib/matches/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await requireMatchesActor();
    return NextResponse.json({
      providers: getMatchProviderReadiness(),
    });
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    return NextResponse.json(
      { error: "providers_unavailable" },
      { status: 500 }
    );
  }
}
