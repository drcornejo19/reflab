import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import {
  getUserNotificationPreferences,
  upsertUserNotificationPreferences,
} from "@/lib/notificationServer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      token?: string;
      diagnostics?: {
        isIos?: boolean;
        isStandalone?: boolean;
        isSecure?: boolean;
        permission?: string;
        hasServiceWorker?: boolean;
      };
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (token.length < 20) {
      return NextResponse.json(
        { error: "Token de notificaciones invalido." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const supabase = createSupabaseAdminClient();
    const platform = detectPlatform(request.headers.get("user-agent"));
    console.info("[RefLab Push] token_registration_requested", {
      userId,
      platform,
      isStandalone: Boolean(body.diagnostics?.isStandalone),
      permission: body.diagnostics?.permission ?? "unknown",
      isSecure: Boolean(body.diagnostics?.isSecure),
      hasServiceWorker: Boolean(body.diagnostics?.hasServiceWorker),
      tokenFingerprint: tokenFingerprint(token),
    });
    const { error } = await supabase.from("notification_tokens").upsert(
      {
        user_id: userId,
        token,
        provider: "fcm",
        user_agent: request.headers.get("user-agent"),
        enabled: true,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "token" }
    );

    if (error) {
      console.error("[RefLab Push] token_registration_failed", {
        userId,
        platform,
        code: error.code,
        message: error.message,
      });
      return NextResponse.json(
        {
          error: "No se pudo registrar el dispositivo para notificaciones.",
          technical: error.message,
        },
        { status: 500 }
      );
    }

    const preferences = await getUserNotificationPreferences(supabase, userId);
    await upsertUserNotificationPreferences(supabase, userId, {
      ...preferences,
      pushEnabled: true,
    });

    console.info("[RefLab Push] token_registration_succeeded", {
      userId,
      platform,
      tokenFingerprint: tokenFingerprint(token),
    });

    return NextResponse.json({ success: true, platform });
  } catch (error) {
    return NextResponse.json(
      {
        error: "No se pudo activar las notificaciones.",
        technical: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

function detectPlatform(userAgent: string | null) {
  if (!userAgent) return "unknown";
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

function tokenFingerprint(token: string) {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}
