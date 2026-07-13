import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { MatchPreparationPayload } from "@/lib/matches/api";
import {
  getMatchActorContext,
  saveMatchPreparation,
} from "@/lib/matches/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MatchPreparationPayload;
  try {
    body = (await request.json()) as MatchPreparationPayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const { appointmentId } = await params;
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const preparation = await saveMatchPreparation(
      supabase,
      actor,
      appointmentId,
      body
    );
    return NextResponse.json({ success: true, preparation });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo guardar la preparacion.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 400 }
    );
  }
}
