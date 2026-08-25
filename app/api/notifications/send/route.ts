import { NextResponse } from "next/server";
import { requireCanonicalRequestIdentity } from "@/lib/identity/canonicalRequestIdentity";
import {
  isSmartNotificationType,
  type SmartNotification,
} from "@/lib/notifications";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await requireCanonicalRequestIdentity();
  if (identity.response) return identity.response;

  try {
    const body = (await request.json()) as {
      type?: unknown;
      overrides?: Partial<Pick<SmartNotification, "message" | "actionUrl">>;
    };

    if (!isSmartNotificationType(body.type)) {
      return NextResponse.json(
        { error: "Tipo de notificacion invalido." },
        { status: 400 }
      );
    }

    const result = await sendSmartNotificationToUser(
      identity.supabase,
      identity.canonicalUserId,
      body.type,
      body.overrides
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo enviar la notificacion.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
