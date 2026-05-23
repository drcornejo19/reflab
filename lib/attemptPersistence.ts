import type { SupabaseClient } from "@supabase/supabase-js";

type AttemptPayload = Record<string, unknown>;

type SaveAttemptResult = {
  saved: boolean;
  usedFallback: boolean;
  error?: string;
};

type SupabaseInsertError = {
  code?: string;
  message?: string;
  details?: string;
};

export async function insertAttemptSafely(
  supabase: SupabaseClient,
  primaryPayload: AttemptPayload,
  fallbackPayload?: AttemptPayload
): Promise<SaveAttemptResult> {
  const primary = stripUndefined(primaryPayload);
  const primaryResult = await supabase.from("attempts").insert([primary]);

  if (!primaryResult.error) {
    return { saved: true, usedFallback: false };
  }

  if (!fallbackPayload || !isSchemaCompatibilityError(primaryResult.error)) {
    return {
      saved: false,
      usedFallback: false,
      error: formatSupabaseError(primaryResult.error),
    };
  }

  const fallback = stripUndefined(fallbackPayload);
  const fallbackResult = await supabase.from("attempts").insert([fallback]);

  if (!fallbackResult.error) {
    return { saved: true, usedFallback: true };
  }

  return {
    saved: false,
    usedFallback: true,
    error: formatSupabaseError(fallbackResult.error),
  };
}

export function stripUndefined(payload: AttemptPayload): AttemptPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

function isSchemaCompatibilityError(error: SupabaseInsertError) {
  const message = `${error.code ?? ""} ${error.message ?? ""} ${
    error.details ?? ""
  }`.toLowerCase();

  return (
    message.includes("pgrst204") ||
    message.includes("could not find") ||
    message.includes("schema cache") ||
    message.includes("column") ||
    message.includes("relationship")
  );
}

function formatSupabaseError(error: SupabaseInsertError) {
  return [error.code, error.message, error.details].filter(Boolean).join(" - ");
}
