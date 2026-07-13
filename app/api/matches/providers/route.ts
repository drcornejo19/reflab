import { NextResponse } from "next/server";
import { getMatchProviderReadiness } from "@/lib/matches/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    providers: getMatchProviderReadiness(),
  });
}
