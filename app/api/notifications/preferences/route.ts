import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  getUserNotificationPreferences,
  upsertUserNotificationPreferences,
} from "@/lib/notificationServer";
import { normalizeNotificationPreferences } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const preferences = await getUserNotificationPreferences(supabase, userId);

    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar las preferencias de notificaciones.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const preferences = normalizeNotificationPreferences(body?.preferences ?? body);
    const supabase = createSupabaseAdminClient();
    const saved = await upsertUserNotificationPreferences(
      supabase,
      userId,
      preferences
    );

    return NextResponse.json({ success: true, preferences: saved });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudieron guardar las preferencias de notificaciones.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
