import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { PostMatchReviewPayload } from "@/lib/matches/api";
import {
  getMatchActorContext,
  savePostMatchReview,
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

  let body: PostMatchReviewPayload;
  try {
    body = (await request.json()) as PostMatchReviewPayload;
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  try {
    const { appointmentId } = await params;
    const supabase = createSupabaseAdminClient();
    const actor = await getMatchActorContext(supabase, userId);
    const review = await savePostMatchReview(
      supabase,
      actor,
      appointmentId,
      body
    );
    return NextResponse.json({ success: true, review });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo guardar el cierre post partido.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 400 }
    );
  }
}
