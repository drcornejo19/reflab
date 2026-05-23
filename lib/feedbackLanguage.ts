import { getStoredLanguage, normalizeAppLanguage, type AppLanguage } from "@/lib/languagePreference";

export type FeedbackLanguage = AppLanguage | string;

type FeedbackLanguageInput = {
  profileLanguage?: string | null;
  interfaceLanguage?: string | null;
  browserLanguage?: string | null;
};

export function getUserFeedbackLanguage({
  profileLanguage,
  interfaceLanguage,
  browserLanguage,
}: FeedbackLanguageInput = {}): FeedbackLanguage {
  return normalizeFeedbackLanguage(
    profileLanguage ?? interfaceLanguage ?? browserLanguage ?? "es"
  );
}

export function getBrowserFeedbackLanguage() {
  if (typeof window !== "undefined") return getStoredLanguage();
  if (typeof navigator === "undefined") return "es";
  return getUserFeedbackLanguage({ browserLanguage: navigator.language });
}

export function normalizeFeedbackLanguage(value?: string | null): FeedbackLanguage {
  return normalizeAppLanguage(value);
}

export function feedbackLanguageInstruction(language?: string | null) {
  const normalized = normalizeFeedbackLanguage(language);

  if (normalized === "en") {
    return "Write all feedback in English. If the exercise answer is in another language, evaluate it but explain the feedback in English.";
  }

  if (normalized === "pt") {
    return "Escreva todo o feedback em portugues. Se o exercicio avalia uma resposta em ingles, corrija o ingles, mas explique o feedback em portugues.";
  }

  return "Escribi toda la devolucion en espanol. Si el ejercicio evalua una respuesta en ingles, corregi ese ingles pero explica la devolucion en espanol.";
}