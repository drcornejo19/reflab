import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import type {
  SmartNotification,
  SmartNotificationType,
} from "../notifications.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type NotificationContext = {
  appointmentId?: string | null;
  fixtureId?: string | null;
  sportType?: string | null;
};

export type ScheduledNotificationCandidate = {
  canonicalUserId: string;
  type: SmartNotificationType;
  overrides?: Partial<Pick<SmartNotification, "message" | "actionUrl">>;
  context?: NotificationContext;
};

export type ScheduledNotificationPlan = {
  processed: number;
  candidates: ScheduledNotificationCandidate[];
};

export type ScheduledNotificationSender = (
  supabase: SupabaseAdminClient,
  canonicalUserId: string,
  type: SmartNotificationType,
  overrides?: Partial<Pick<SmartNotification, "message" | "actionUrl">>,
  context?: NotificationContext
) => Promise<unknown>;

export async function buildScheduledNotificationPlan(
  supabase: SupabaseAdminClient,
  now = new Date()
): Promise<ScheduledNotificationPlan> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .eq("push_enabled", true)
    .limit(100);

  if (error) throw error;

  const requestedUserIds = uniqueStrings(
    (data ?? []).map((row) => row.user_id)
  );
  const canonicalUserIds = await retainCanonicalUserIds(
    supabase,
    requestedUserIds
  );
  const candidates: ScheduledNotificationCandidate[] = [];

  for (const canonicalUserId of canonicalUserIds) {
    const latestActivityAt = await getLatestActivityAt(
      supabase,
      canonicalUserId
    );

    if (
      latestActivityAt &&
      daysBetween(latestActivityAt, now) >= 7 &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "training_pending",
        24,
        now
      ))
    ) {
      candidates.push({ canonicalUserId, type: "training_pending" });
    }

    const weakTopic = await getWeakTopic(supabase, canonicalUserId);
    if (
      weakTopic &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "weakness_detected",
        48,
        now
      ))
    ) {
      candidates.push({
        canonicalUserId,
        type: "weakness_detected",
        overrides: {
          message: `Detectamos oportunidades de mejora en: ${weakTopic.topic}. Te recomendamos volver a entrenarlo.`,
          actionUrl: "/training",
        },
      });
    }

    const streakDays = await getTrainingStreakDays(
      supabase,
      canonicalUserId
    );
    if (
      [3, 7, 15, 30].includes(streakDays) &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "training_streak",
        20,
        now
      ))
    ) {
      candidates.push({
        canonicalUserId,
        type: "training_streak",
        overrides: {
          message: `Excelente trabajo. Mantenes una racha de ${streakDays} dias consecutivos entrenando en RefLab.`,
        },
      });
    }

    if (
      isSunday(now) &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "weekly_progress",
        144,
        now
      ))
    ) {
      candidates.push({ canonicalUserId, type: "weekly_progress" });
    }

    const upcomingAppointment = await getUpcomingAppointment(
      supabase,
      canonicalUserId,
      now
    );
    if (
      upcomingAppointment &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "match_reminder",
        12,
        now,
        upcomingAppointment.id
      ))
    ) {
      candidates.push({
        canonicalUserId,
        type: "match_reminder",
        overrides: {
          message: `Tienes ${upcomingAppointment.label} programado. Completa tu preparacion previa en RefLab.`,
          actionUrl: `/matches/${upcomingAppointment.id}`,
        },
        context: {
          appointmentId: upcomingAppointment.id,
          fixtureId: upcomingAppointment.fixture_id,
          sportType: upcomingAppointment.sport_type,
        },
      });
    }

    const pendingPostMatchAppointment = await getPendingPostMatchAppointment(
      supabase,
      canonicalUserId,
      now
    );
    if (
      pendingPostMatchAppointment &&
      !(await hasRecentNotification(
        supabase,
        canonicalUserId,
        "post_match_reminder",
        12,
        now,
        pendingPostMatchAppointment.id
      ))
    ) {
      candidates.push({
        canonicalUserId,
        type: "post_match_reminder",
        overrides: {
          message: `Quedo pendiente el cierre post partido de ${pendingPostMatchAppointment.label}.`,
          actionUrl: `/matches/${pendingPostMatchAppointment.id}`,
        },
        context: {
          appointmentId: pendingPostMatchAppointment.id,
          fixtureId: pendingPostMatchAppointment.fixture_id,
          sportType: pendingPostMatchAppointment.sport_type,
        },
      });
    }
  }

  return { processed: canonicalUserIds.length, candidates };
}

export async function runScheduledNotificationPlan(
  supabase: SupabaseAdminClient,
  plan: ScheduledNotificationPlan,
  sendNotification: ScheduledNotificationSender
) {
  const results = [];

  for (const candidate of plan.candidates) {
    results.push(
      await sendNotification(
        supabase,
        candidate.canonicalUserId,
        candidate.type,
        candidate.overrides,
        candidate.context
      )
    );
  }

  return results;
}

export function summarizeScheduledNotificationPlan(
  plan: ScheduledNotificationPlan
) {
  const byType: Partial<Record<SmartNotificationType, number>> = {};
  for (const candidate of plan.candidates) {
    byType[candidate.type] = (byType[candidate.type] ?? 0) + 1;
  }

  return {
    processed: plan.processed,
    candidates: plan.candidates.length,
    byType,
  };
}

export function requireScheduledJobSecret(
  request: Request,
  expectedSecret = process.env.CRON_SECRET
) {
  if (!expectedSecret) {
    return Response.json(
      { error: "scheduled_notifications_unavailable" },
      { status: 503 }
    );
  }

  const authorization = request.headers.get("authorization");
  const prefix = "Bearer ";
  const providedSecret = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length)
    : "";

  if (!constantTimeEqual(providedSecret, expectedSecret)) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }

  return null;
}

async function retainCanonicalUserIds(
  supabase: SupabaseAdminClient,
  userIds: string[]
) {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id")
    .in("user_id", userIds);

  if (error) throw error;

  const canonicalIds = new Set(
    (data ?? []).map((row) => String(row.user_id))
  );
  return userIds.filter((userId) => canonicalIds.has(userId));
}

async function getLatestActivityAt(
  supabase: SupabaseAdminClient,
  canonicalUserId: string
) {
  const tables = ["attempts", "exam_results", "performance_checkins"];
  const dates: Date[] = [];

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("created_at")
      .eq("user_id", canonicalUserId)
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
  supabase: SupabaseAdminClient,
  canonicalUserId: string,
  now: Date
) {
  const limit = new Date(now.getTime() + 18 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,fixture_id,sport_type,fixtures!inner(kickoff_at,home_team_id,away_team_id,teams_home:teams!fixtures_home_team_id_fkey(name),teams_away:teams!fixtures_away_team_id_fkey(name))")
    .eq("user_id", canonicalUserId)
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
  supabase: SupabaseAdminClient,
  canonicalUserId: string,
  now: Date
) {
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("appointments")
    .select("id,fixture_id,sport_type,fixtures!inner(kickoff_at,teams_home:teams!fixtures_home_team_id_fkey(name),teams_away:teams!fixtures_away_team_id_fkey(name))")
    .eq("user_id", canonicalUserId)
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
        .eq("user_id", canonicalUserId)
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
  supabase: SupabaseAdminClient,
  canonicalUserId: string
) {
  const { data, error } = await supabase
    .from("attempts")
    .select("topic,score,exam_result_id,exam_results!inner(id,user_id)")
    .eq("user_id", canonicalUserId)
    .eq("exam_results.user_id", canonicalUserId)
    .not("exam_result_id", "is", null)
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
  supabase: SupabaseAdminClient,
  canonicalUserId: string
) {
  const tables = ["attempts", "exam_results", "performance_checkins"];
  const dates = new Set<string>();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("created_at")
      .eq("user_id", canonicalUserId)
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

  const cursor = dates.has(toDateKey(today))
    ? today
    : dates.has(toDateKey(yesterday))
      ? yesterday
      : null;
  if (!cursor) return 0;

  let streak = 0;
  while (dates.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

async function hasRecentNotification(
  supabase: SupabaseAdminClient,
  canonicalUserId: string,
  type: string,
  hours: number,
  now: Date,
  appointmentId?: string
) {
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("notification_events")
    .select("id")
    .eq("user_id", canonicalUserId)
    .eq("type", type)
    .gte("created_at", since);

  if (appointmentId) query = query.eq("appointment_id", appointmentId);

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

function uniqueStrings(values: unknown[]) {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
