import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type NotificationTokenOwnerRow = {
  id: string;
  user_id: string;
};

export type CanonicalNotificationTokenInput = {
  token: string;
  provider: "fcm";
  userAgent: string | null;
  lastSeenAt: string;
};

export type CanonicalNotificationTokenStore = {
  loadOwner(token: string): Promise<NotificationTokenOwnerRow | null>;
  insert(
    canonicalUserId: string,
    input: CanonicalNotificationTokenInput
  ): Promise<"created" | "conflict">;
  update(
    tokenId: string,
    input: CanonicalNotificationTokenInput
  ): Promise<void>;
};

export class NotificationTokenOwnershipError extends Error {
  readonly code = "notification_token_conflict";

  constructor() {
    super("The notification token belongs to another canonical user.");
    this.name = "NotificationTokenOwnershipError";
  }
}

export async function registerCanonicalNotificationToken(
  supabase: SupabaseClient,
  canonicalUserId: string,
  input: CanonicalNotificationTokenInput,
  store = createCanonicalNotificationTokenStore(supabase)
) {
  const existing = await store.loadOwner(input.token);
  if (existing && existing.user_id !== canonicalUserId) {
    throw new NotificationTokenOwnershipError();
  }

  if (existing) {
    await store.update(existing.id, input);
    return { status: "already_registered" as const };
  }

  const insertStatus = await store.insert(canonicalUserId, input);
  if (insertStatus === "created") {
    return { status: "created" as const };
  }

  const concurrentOwner = await store.loadOwner(input.token);
  if (!concurrentOwner || concurrentOwner.user_id !== canonicalUserId) {
    throw new NotificationTokenOwnershipError();
  }

  await store.update(concurrentOwner.id, input);
  return { status: "already_registered" as const };
}

function createCanonicalNotificationTokenStore(
  supabase: SupabaseClient
): CanonicalNotificationTokenStore {
  return {
    loadOwner: async (token) => {
      const { data, error } = await supabase
        .from("notification_tokens")
        .select("id,user_id")
        .eq("token", token)
        .maybeSingle();

      if (error) throw error;
      return (data as NotificationTokenOwnerRow | null) ?? null;
    },
    insert: async (canonicalUserId, input) => {
      const { error } = await supabase.from("notification_tokens").insert({
        user_id: canonicalUserId,
        token: input.token,
        provider: input.provider,
        user_agent: input.userAgent,
        enabled: true,
        last_seen_at: input.lastSeenAt,
        updated_at: input.lastSeenAt,
      });

      if (!error) return "created";
      if (error.code === "23505") return "conflict";
      throw error;
    },
    update: async (tokenId, input) => {
      const { error } = await supabase
        .from("notification_tokens")
        .update({
          provider: input.provider,
          user_agent: input.userAgent,
          enabled: true,
          last_seen_at: input.lastSeenAt,
          updated_at: input.lastSeenAt,
        })
        .eq("id", tokenId);

      if (error) throw error;
    },
  };
}
