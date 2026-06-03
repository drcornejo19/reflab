import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sendFcmNotification } from "@/lib/firebaseAdmin";
import { normalizeRole } from "@/lib/institutionalRoles";
import {
  getEnabledNotificationTokens,
  getUserNotificationPreferences,
  recordNotificationEvent,
} from "@/lib/notificationServer";
import type { SmartNotification } from "@/lib/notifications";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreferenceUserRow = {
  user_id?: string | null;
};

export async function POST(request: Request) {
  const access = await requireSuperAdmin();
  if (access.response) return access.response;

  let body: {
    title?: string;
    message?: string;
    actionLabel?: string;
    actionUrl?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body invalido." }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const message = String(body.message ?? "").trim();
  const actionLabel = String(body.actionLabel ?? "Abrir RefLab").trim() || "Abrir RefLab";
  const actionUrl = normalizeActionUrl(body.actionUrl);

  if (title.length < 3 || message.length < 8) {
    return NextResponse.json(
      { error: "Completa un titulo y un mensaje para enviar la notificacion." },
      { status: 400 }
    );
  }

  const notification: SmartNotification = {
    type: "admin_broadcast",
    category: "newContent",
    title,
    message,
    actionLabel,
    actionUrl,
  };

  const { data, error } = await access.supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("push_enabled", true)
    .limit(1000);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar usuarios con notificaciones activas.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  const userIds = Array.from(
    new Set(
      ((data ?? []) as PreferenceUserRow[])
        .map((row) => row.user_id)
        .filter((userId): userId is string => Boolean(userId))
    )
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const userId of userIds) {
    try {
      const preferences = await getUserNotificationPreferences(access.supabase, userId);
      if (!preferences.pushEnabled) {
        skipped += 1;
        await recordNotificationEvent(
          access.supabase,
          userId,
          notification,
          "skipped",
          "Notificaciones desactivadas."
        );
        continue;
      }

      const tokens = await getEnabledNotificationTokens(access.supabase, userId);
      if (tokens.length === 0) {
        skipped += 1;
        await recordNotificationEvent(
          access.supabase,
          userId,
          notification,
          "skipped",
          "El usuario no tiene dispositivos registrados."
        );
        continue;
      }

      const results = await Promise.all(
        tokens.map(({ token }) => sendFcmNotification(token, notification))
      );
      const okCount = results.filter((result) => result.ok).length;
      const errorText = results
        .filter((result) => !result.ok)
        .map((result) => result.error)
        .join(" | ");

      if (okCount > 0) sent += 1;
      else failed += 1;

      await recordNotificationEvent(
        access.supabase,
        userId,
        notification,
        okCount > 0 ? "sent" : "failed",
        errorText || null
      );
    } catch (error) {
      failed += 1;
      await recordNotificationEvent(
        access.supabase,
        userId,
        notification,
        "failed",
        error instanceof Error ? error.message : "Error desconocido."
      );
    }
  }

  return NextResponse.json({
    success: true,
    processed: userIds.length,
    sent,
    skipped,
    failed,
  });
}

async function requireSuperAdmin() {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      supabase: null as never,
    };
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  const role = normalizeRole(data?.role);
  if (error || role !== "super_admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      supabase,
    };
  }

  return { response: null, supabase };
}

function normalizeActionUrl(value: unknown) {
  const url = String(value ?? "/dashboard").trim();
  if (!url || !url.startsWith("/")) return "/dashboard";
  return url;
}
