import { NextResponse } from "next/server";
import {
  buildScheduledNotificationPlan,
  requireScheduledJobSecret,
  summarizeScheduledNotificationPlan,
} from "@/lib/notifications/scheduled";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireScheduledJobSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createSupabaseAdminClient();
    const plan = await buildScheduledNotificationPlan(supabase);
    return NextResponse.json({
      success: true,
      mode: "preview",
      writesPlanned: false,
      ...summarizeScheduledNotificationPlan(plan),
    });
  } catch (error) {
    console.error(
      "Scheduled notification preview failed",
      sanitizeDiagnostic(error)
    );
    return NextResponse.json(
      {
        error: "scheduled_notification_preview_unavailable",
        message: "No se pudo calcular el preview de notificaciones.",
      },
      { status: 500 }
    );
  }
}

function sanitizeDiagnostic(error: unknown) {
  if (error instanceof Error) {
    return { code: "unexpected_error", message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : "unexpected_error",
      message:
        typeof record.message === "string"
          ? record.message
          : "Unknown scheduled notification error",
    };
  }
  return { code: "unexpected_error", message: String(error) };
}
