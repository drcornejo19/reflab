import { NextResponse } from "next/server";
import { requireCanonicalRequestIdentity } from "@/lib/identity/canonicalRequestIdentity";
import {
  getUserNotificationPreferences,
  upsertUserNotificationPreferences,
} from "@/lib/notificationServer";
import {
  NotificationTokenOwnershipError,
  registerCanonicalNotificationToken,
} from "@/lib/notifications/tokenOwnership";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await requireCanonicalRequestIdentity();
  if (identity.response) return identity.response;

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
    const platform = detectPlatform(request.headers.get("user-agent"));
    console.info("[RefLab Push] token_registration_requested", {
      platform,
      isStandalone: Boolean(body.diagnostics?.isStandalone),
      permission: body.diagnostics?.permission ?? "unknown",
      isSecure: Boolean(body.diagnostics?.isSecure),
      hasServiceWorker: Boolean(body.diagnostics?.hasServiceWorker),
      tokenFingerprint: tokenFingerprint(token),
    });
    const registration = await registerCanonicalNotificationToken(
      identity.supabase,
      identity.canonicalUserId,
      {
        token,
        provider: "fcm",
        userAgent: request.headers.get("user-agent"),
        lastSeenAt: now,
      }
    );

    const preferences = await getUserNotificationPreferences(
      identity.supabase,
      identity.canonicalUserId
    );
    await upsertUserNotificationPreferences(
      identity.supabase,
      identity.canonicalUserId,
      {
      ...preferences,
      pushEnabled: true,
      }
    );

    console.info("[RefLab Push] token_registration_succeeded", {
      platform,
      status: registration.status,
      tokenFingerprint: tokenFingerprint(token),
    });

    return NextResponse.json({
      success: true,
      platform,
      status: registration.status,
    });
  } catch (error) {
    if (error instanceof NotificationTokenOwnershipError) {
      return NextResponse.json(
        { error: error.code },
        { status: 409 }
      );
    }

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
