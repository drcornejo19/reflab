import { NextResponse } from "next/server";
import { requireCanonicalRequestIdentity } from "@/lib/identity/canonicalRequestIdentity";
import {
  getUserNotificationPreferences,
  upsertUserNotificationPreferences,
} from "@/lib/notificationServer";
import { normalizeNotificationPreferences } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await requireCanonicalRequestIdentity();
  if (identity.response) return identity.response;

  try {
    const preferences = await getUserNotificationPreferences(
      identity.supabase,
      identity.canonicalUserId
    );

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
  const identity = await requireCanonicalRequestIdentity();
  if (identity.response) return identity.response;

  try {
    const body = await request.json();
    const preferences = normalizeNotificationPreferences(body?.preferences ?? body);
    const saved = await upsertUserNotificationPreferences(
      identity.supabase,
      identity.canonicalUserId,
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
