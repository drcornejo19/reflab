import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { sendSmartNotificationToUser } from "@/lib/notificationServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PreferenceRow = {
  user_id: string;
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
    .select("user_id")
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
    const latestActivityAt = await getLatestActivityAt(supabase, userId);

    if (
      latestActivityAt &&
      daysBetween(latestActivityAt, new Date()) >= 7 &&
      !(await hasRecentNotification(supabase, userId, "training_pending", 24))
    ) {
      results.push(
        await sendSmartNotificationToUser(supabase, userId, "training_pending")
      );
    }

    const weakTopic = await getWeakTopic(supabase, userId);
    if (
      weakTopic &&
      !(await hasRecentNotification(supabase, userId, "weakness_detected", 48))
    ) {
      results.push(
        await sendSmartNotificationToUser(supabase, userId, "weakness_detected", {
          message: `Detectamos oportunidades de mejora en: ${weakTopic.topic}. Te recomendamos volver a entrenarlo.`,
          actionUrl: "/training",
        })
      );
    }

    const streakDays = await getTrainingStreakDays(supabase, userId);
    if (
      [3, 7, 15, 30].includes(streakDays) &&
      !(await hasRecentNotification(supabase, userId, "training_streak", 20))
    ) {
      results.push(
        await sendSmartNotificationToUser(supabase, userId, "training_streak", {
          message: `Excelente trabajo. Mantenes una racha de ${streakDays} dias consecutivos entrenando en RefLab.`,
        })
      );
    }

    if (
      isSunday(new Date()) &&
      !(await hasRecentNotification(supabase, userId, "weekly_progress", 144))
    ) {
      results.push(
        await sendSmartNotificationToUser(supabase, userId, "weekly_progress")
      );
    }

    const upcomingAppointment = await getUpcomingAppointment(supabase, userId);
    const pendingPostMatchAppointment = await getPendingPostMatchAppointment(
      supabase,
      userId
    );

    if (
      upcomingAppointment &&
      !(await hasRecentNotification(
        supabase,
        userId,
        "match_reminder",
        12,
        upcomingAppointment.id
      ))
    ) {
      results.push(
        await sendSmartNotificationToUser(
          supabase,
          userId,
          "match_reminder",
          {
            message: `Tienes ${upcomingAppointment.label} programado. Completa tu preparacion previa en RefLab.`,
            actionUrl: `/matches/${upcomingAppointment.id}`,
          },
          {
            appointmentId: upcomingAppointment.id,
            fixtureId: upcomingAppointment.fixture_id,
            sportType: upcomingAppointment.sport_type,
          }
        )
      );
    }

    if (
      pendingPostMatchAppointment &&
      !(await hasRecentNotification(
        supabase,
        userId,
        "post_match_reminder",
        12,
        pendingPostMatchAppointment.id
      ))
    ) {
      results.push(
        await sendSmartNotificationToUser(
          supabase,
          userId,
          "post_match_reminder",
          {
            message: `Quedo pendiente el cierre post partido de ${pendingPostMatchAppointment.label}.`,
            actionUrl: `/matches/${pendingPostMatchAppointment.id}`,
          },
          {
            appointmentId: pendingPostMatchAppointment.id,
            fixtureId: pendingPostMatchAppointment.fixture_id,
            sportType: pendingPostMatchAppointment.sport_type,
          }
        )
      );
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

async function getUpcomingAppointment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const now = new Date();
  const limit = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,fixture_id,sport_type,fixtures!inner(kickoff_at,home_team_id,away_team_id,teams_home:teams!fixtures_home_team_id_fkey(name),teams_away:teams!fixtures_away_team_id_fkey(name))")
    .eq("user_id", userId)
    .in("status", ["draft", "pending_confirmation", "confirmed", "modified"])
    .lte("fixtures.kickoff_at", limit)
    .gte("fixtures.kickoff_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;

  const fixture = Array.isArray((data as { fixtures?: unknown }).fixtures)
    ? null
    : ((data as { fixtures?: { teams_home?: { name?: string | null }; teams_away?: { name?: string | null } } }).fixtures ?? null);
  const label = fixture
    ? `${fixture.teams_home?.name ?? "Local"} vs ${fixture.teams_away?.name ?? "Visitante"}`
    : "tu partido";

  return {
    id: String(data.id),
    fixture_id: String(data.fixture_id ?? ""),
    sport_type: String(data.sport_type ?? ""),
    label,
  };
}

async function getPendingPostMatchAppointment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,fixture_id,sport_type,fixtures!inner(kickoff_at,teams_home:teams!fixtures_home_team_id_fkey(name),teams_away:teams!fixtures_away_team_id_fkey(name))")
    .eq("user_id", userId)
    .in("status", ["confirmed", "modified", "completed"])
    .gte("fixtures.kickoff_at", from)
    .lte("fixtures.kickoff_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return null;

  for (const row of data ?? []) {
    const appointmentId = String(row.id ?? "");
    if (!appointmentId) continue;

    const [reviewRes, postCheckinRes] = await Promise.all([
      supabase
        .from("post_match_reviews")
        .select("id")
        .eq("appointment_id", appointmentId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("performance_checkins")
        .select("id")
        .eq("appointment_id", appointmentId)
        .eq("checkin_type", "post")
        .limit(1)
        .maybeSingle(),
    ]);

    if (reviewRes.data?.id || postCheckinRes.data?.id) continue;

    const fixture = Array.isArray((row as { fixtures?: unknown }).fixtures)
      ? null
      : ((row as { fixtures?: { teams_home?: { name?: string | null }; teams_away?: { name?: string | null } } }).fixtures ?? null);

    return {
      id: appointmentId,
      fixture_id: String(row.fixture_id ?? ""),
      sport_type: String(row.sport_type ?? ""),
      label: fixture
        ? `${fixture.teams_home?.name ?? "Local"} vs ${fixture.teams_away?.name ?? "Visitante"}`
        : "tu partido",
    };
  }

  return null;
}

async function getWeakTopic(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const { data, error } = await supabase
    .from("attempts")
    .select("topic, score")
    .eq("user_id", userId)
    .not("topic", "is", null)
    .not("score", "is", null)
    .limit(500);

  if (error) return null;

  const topics = new Map<string, { total: number; count: number }>();
  for (const row of data ?? []) {
    const topic = String(row.topic ?? "").trim();
    const score = Number(row.score);
    if (!topic || Number.isNaN(score)) continue;

    const current = topics.get(topic) ?? { total: 0, count: 0 };
    current.total += score;
    current.count += 1;
    topics.set(topic, current);
  }

  let weakest: { topic: string; average: number } | null = null;
  for (const [topic, value] of topics.entries()) {
    if (value.count < 3) continue;
    const average = Math.round(value.total / value.count);
    if (average >= 70) continue;
    if (!weakest || average < weakest.average) {
      weakest = { topic, average };
    }
  }

  return weakest;
}

async function getTrainingStreakDays(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) {
  const tables = ["attempts", "exam_results", "performance_checkins"];
  const dates = new Set<string>();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) continue;
    for (const row of data ?? []) {
      if (row.created_at) {
        dates.add(new Date(String(row.created_at)).toISOString().slice(0, 10));
      }
    }
  }

  if (dates.size === 0) return 0;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const cursor = dates.has(toDateKey(today)) ? today : dates.has(toDateKey(yesterday)) ? yesterday : null;
  if (!cursor) return 0;

  let streak = 0;
  while (dates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

async function hasRecentNotification(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  type: string,
  hours: number,
  appointmentId?: string
) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("notification_events")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .gte("created_at", since);

  if (appointmentId) {
    query = query.eq("appointment_id", appointmentId);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  return !error && Boolean(data?.id);
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function isSunday(date: Date) {
  return date.getDay() === 0;
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
