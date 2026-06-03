import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreferenceRow = {
  user_id: string;
  training_enabled?: boolean | null;
  matches_enabled?: boolean | null;
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id, training_enabled, matches_enabled")
    .eq("push_enabled", true)
    .limit(100);

  if (error) {
    return NextResponse.json(
      {
        error: "No se pudieron cargar usuarios para notificaciones programadas.",
        technical: error.message,
      },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as PreferenceRow[];
  const results = [];

  for (const row of rows) {
    const userId = row.user_id;

    if (row.training_enabled) {
      const latestActivityAt = await getLatestActivityAt(supabase, userId);
      const alreadySent = await hasRecentNotification(
        supabase,
        userId,
        "training_pending",
        24
      );

      if (
        latestActivityAt &&
        daysBetween(latestActivityAt, new Date()) >= 4 &&
        !alreadySent
      ) {
        results.push(
          await sendSmartNotificationToUser(supabase, userId, "training_pending")
        );
      }
    }

    if (row.matches_enabled) {
      const hasMatchToday = await hasTodayMatchCheckin(supabase, userId);
      const hasPostMatchToday = await hasTodayPostActivity(supabase, userId);

      if (
        hasMatchToday &&
        !(await hasRecentNotification(supabase, userId, "match_reminder", 12))
      ) {
        results.push(
          await sendSmartNotificationToUser(supabase, userId, "match_reminder")
        );
      }

      if (
        hasMatchToday &&
        !hasPostMatchToday &&
        !(await hasRecentNotification(supabase, userId, "post_match_reminder", 12))
      ) {
        results.push(
          await sendSmartNotificationToUser(supabase, userId, "post_match_reminder")
        );
      }
    }
  }

  return NextResponse.json({ success: true, processed: rows.length, results });
}

async function getLatestActivityAt(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const tables = ["attempts", "exam_results", "performance_checkins"];
  const dates: Date[] = [];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.created_at) {
      dates.push(new Date(String(data.created_at)));
    }
  }

  if (dates.length === 0) return null;
  return dates.sort((a, b) => b.getTime() - a.getTime())[0];
}

async function hasTodayMatchCheckin(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("performance_checkins")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("has_match_today", true)
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data?.id);
}

async function hasTodayPostActivity(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("performance_checkins")
    .select("id")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("checkin_type", "post")
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data?.id);
}

async function hasRecentNotification(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  type: string,
  hours: number
) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data?.id);
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}
