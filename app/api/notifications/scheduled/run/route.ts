import { NextResponse } from "next/server";
import {
  buildScheduledNotificationPlan,
  requireScheduledJobSecret,
  runScheduledNotificationPlan,
  summarizeScheduledNotificationPlan,
} from "@/lib/notifications/scheduled";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const unauthorized = requireScheduledJobSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = createSupabaseAdminClient();
    const plan = await buildScheduledNotificationPlan(supabase);
    const results = await runScheduledNotificationPlan(
      supabase,
      plan,
      sendSmartNotificationToUser
    );

    return NextResponse.json({
      success: true,
      mode: "run",
      ...summarizeScheduledNotificationPlan(plan),
      results,
    });
  } catch (error) {
    console.error(
      "Scheduled notification run failed",
      sanitizeDiagnostic(error)
    );
    return NextResponse.json(
      {
        error: "scheduled_notification_run_failed",
        message: "No se pudieron ejecutar las notificaciones programadas.",
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
