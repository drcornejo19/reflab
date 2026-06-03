import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFcmNotification } from "@/lib/firebaseAdmin";
import {
  defaultNotificationPreferences,
  getSmartNotification,
  normalizeNotificationPreferences,
  type NotificationPreferences,
  type SmartNotification,
  type SmartNotificationType,
} from "@/lib/notifications";

type SupabaseAnyClient = SupabaseClient<any, any, any>;

type NotificationPreferenceRow = {
  training_enabled?: boolean | null;
  exams_enabled?: boolean | null;
  evolution_enabled?: boolean | null;
  matches_enabled?: boolean | null;
  new_content_enabled?: boolean | null;
  push_enabled?: boolean | null;
};

type NotificationTokenRow = {
  id: string;
  token: string;
};

export function preferencesToRow(preferences: NotificationPreferences) {
  return {
    training_enabled: preferences.training,
    exams_enabled: preferences.exams,
    evolution_enabled: preferences.evolution,
    matches_enabled: preferences.matches,
    new_content_enabled: preferences.newContent,
    push_enabled: preferences.pushEnabled,
  };
}

export function rowToPreferences(
  row?: NotificationPreferenceRow | null
): NotificationPreferences {
  return normalizeNotificationPreferences({
    training: row?.training_enabled ?? defaultNotificationPreferences.training,
    exams: row?.exams_enabled ?? defaultNotificationPreferences.exams,
    evolution: row?.evolution_enabled ?? defaultNotificationPreferences.evolution,
    matches: row?.matches_enabled ?? defaultNotificationPreferences.matches,
    newContent: row?.new_content_enabled ?? defaultNotificationPreferences.newContent,
    pushEnabled: row?.push_enabled ?? defaultNotificationPreferences.pushEnabled,
  });
}

export async function getUserNotificationPreferences(
  supabase: SupabaseAnyClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "training_enabled, exams_enabled, evolution_enabled, matches_enabled, new_content_enabled, push_enabled"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return rowToPreferences(data);
}

export async function upsertUserNotificationPreferences(
  supabase: SupabaseAnyClient,
  userId: string,
  preferences: NotificationPreferences
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        ...preferencesToRow(preferences),
        updated_at: now,
      },
      { onConflict: "user_id" }
    )
    .select(
      "training_enabled, exams_enabled, evolution_enabled, matches_enabled, new_content_enabled, push_enabled"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return rowToPreferences(data);
}

export async function getEnabledNotificationTokens(
  supabase: SupabaseAnyClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("notification_tokens")
    .select("id, token")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as NotificationTokenRow[];
}

export async function recordNotificationEvent(
  supabase: SupabaseAnyClient,
  userId: string,
  notification: SmartNotification,
  status: "queued" | "sent" | "failed" | "skipped",
  error?: string | null
) {
  const now = new Date().toISOString();
  const { error: insertError } = await supabase.from("notification_events").insert({
    user_id: userId,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    message: notification.message,
    action_label: notification.actionLabel,
    action_url: notification.actionUrl,
    status,
    error,
    sent_at: status === "sent" ? now : null,
    created_at: now,
    updated_at: now,
  });

  if (insertError) {
    console.error("Notification event insertError", {
      userId,
      type: notification.type,
      status,
      error: insertError,
    });
  }
}

export async function sendSmartNotificationToUser(
  supabase: SupabaseAnyClient,
  userId: string,
  type: SmartNotificationType,
  overrides: Partial<Pick<SmartNotification, "message" | "actionUrl">> = {}
) {
  const notification = getSmartNotification(type, overrides);
  const preferences = await getUserNotificationPreferences(supabase, userId);

  if (!preferences.pushEnabled || !preferences[notification.category]) {
    await recordNotificationEvent(
      supabase,
      userId,
      notification,
      "skipped",
      "Preferencia desactivada."
    );

    return {
      success: true,
      skipped: true,
      reason: "Preferencia desactivada.",
      notification,
    };
  }

  const tokens = await getEnabledNotificationTokens(supabase, userId);
  if (tokens.length === 0) {
    await recordNotificationEvent(
      supabase,
      userId,
      notification,
      "skipped",
      "El usuario no tiene dispositivos registrados."
    );

    return {
      success: true,
      skipped: true,
      reason: "El usuario no tiene dispositivos registrados.",
      notification,
    };
  }

  const results = await Promise.all(
    tokens.map(async ({ token }) => sendFcmNotification(token, notification))
  );
  const failed = results.filter((result) => !result.ok);
  const successCount = results.length - failed.length;

  await recordNotificationEvent(
    supabase,
    userId,
    notification,
    successCount > 0 ? "sent" : "failed",
    failed.length > 0 ? failed.map((result) => result.error).join(" | ") : null
  );

  return {
    success: successCount > 0,
    notification,
    sent: successCount,
    failed: failed.length,
    results,
  };
}
