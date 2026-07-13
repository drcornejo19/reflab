import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SPORT_TYPE } from "@/lib/sports";

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
  const primary = stripUndefined(normalizeAttemptPayload(primaryPayload));
  const validation = validateAttemptPayload(primary);

  if (validation.length > 0) {
    console.warn("[RefLab attempt validation]", validation);
    return {
      saved: false,
      usedFallback: false,
      error: validation.join(" "),
    };
  }

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

  const fallback = stripUndefined(normalizeAttemptPayload(fallbackPayload));
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

function normalizeAttemptPayload(payload: AttemptPayload) {
  const normalized = { ...payload };

  if (!textValue(normalized.sport_type)) {
    normalized.sport_type = DEFAULT_SPORT_TYPE;
  }

  if (
    typeof normalized.discipline_correct === "boolean" &&
    typeof normalized.disciplinary_correct !== "boolean"
  ) {
    normalized.disciplinary_correct = normalized.discipline_correct;
  }

  if (
    typeof normalized.disciplinary_correct === "boolean" &&
    typeof normalized.discipline_correct !== "boolean"
  ) {
    normalized.discipline_correct = normalized.disciplinary_correct;
  }

  if (!textValue(normalized.subtopic) && textValue(normalized.sub_type)) {
    normalized.subtopic = normalized.sub_type;
  }

  return normalized;
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

function validateAttemptPayload(payload: AttemptPayload) {
  const warnings: string[] = [];
  const topic = textValue(payload.topic);
  const mode = `${payload.mode ?? ""}`.toLowerCase();
  const moduleName = `${payload.module ?? ""}`.toLowerCase();
  const isVar = mode.includes("var") || moduleName.includes("var");
  const isNonTechnical =
    mode.includes("english") ||
    moduleName.includes("english") ||
    mode.includes("physical") ||
    moduleName.includes("preparation") ||
    moduleName.includes("communication");

  if (!topic) {
    warnings.push("Intento sin topico.");
  }

  if (!textValue(payload.sport_type)) {
    warnings.push("Intento sin sport_type.");
  }

  if (isNonTechnical) {
    return warnings;
  }

  if (!hasDecision(payload)) {
    warnings.push("Intento sin decision tecnica o respuesta correcta.");
  }

  if (!textValue(payload.restart) && !textValue(payload.selected_restart) && !textValue(payload.correct_restart)) {
    warnings.push("Intento sin reanudacion.");
  }

  if (!isVar && !textValue(payload.discipline) && !textValue(payload.selected_discipline) && !textValue(payload.correct_discipline)) {
    warnings.push("Intento sin decision disciplinaria.");
  }

  return warnings;
}

function hasDecision(payload: AttemptPayload) {
  return (
    textValue(payload.correct_decision) ||
    textValue(payload.selected_decision) ||
    typeof payload.foul === "boolean" ||
    typeof payload.technical_correct === "boolean" ||
    typeof payload.is_correct === "boolean"
  );
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}
