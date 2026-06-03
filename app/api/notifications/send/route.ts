import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  isSmartNotificationType,
  type SmartNotification,
} from "@/lib/notifications";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const supabase = createSupabaseAdminClient();
    const result = await sendSmartNotificationToUser(
      supabase,
      userId,
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
