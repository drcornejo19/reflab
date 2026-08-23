import { NextResponse } from "next/server";
import type { MatchPreparationPayload } from "@/lib/matches/api";
import {
  getMatchesAccessError,
  requireMatchesActor,
} from "@/lib/matches/access";
import {
  saveMatchPreparation,
} from "@/lib/matches/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  let body: MatchPreparationPayload;
  try {
    body = (await request.json()) as MatchPreparationPayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const { appointmentId } = await params;
    const authorization = await requireMatchesActor({
      requestedInstitutionId: new URL(request.url).searchParams.get("institutionId"),
    });
    const preparation = await saveMatchPreparation(
      authorization.supabase,
      authorization.actor,
      appointmentId,
      body
    );
    return NextResponse.json({ success: true, preparation });
  } catch (error) {
    const accessError = getMatchesAccessError(error);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.code },
        { status: accessError.status }
      );
    }
    return NextResponse.json(
      { error: "No se pudo guardar la preparacion." },
      { status: 400 }
    );
  }
}
