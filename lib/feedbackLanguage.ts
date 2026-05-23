export type FeedbackLanguage = "es" | "en" | string;

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
  if (typeof navigator === "undefined") return "es";
  return getUserFeedbackLanguage({ browserLanguage: navigator.language });
}

export function normalizeFeedbackLanguage(value?: string | null): FeedbackLanguage {
  const language = value?.trim().toLowerCase();

  if (!language) return "es";
  if (language.startsWith("en")) return "en";
  if (language.startsWith("es")) return "es";

  return language.split("-")[0] || "es";
}

export function feedbackLanguageInstruction(language?: string | null) {
  const normalized = normalizeFeedbackLanguage(language);

  if (normalized === "en") {
    return "Write all feedback in English. If the exercise answer is in another language, evaluate it but explain the feedback in English.";
  }

  if (normalized === "es") {
    return "Escribi toda la devolucion en espanol. Si el ejercicio evalua una respuesta en ingles, corregi ese ingles pero explica la devolucion en espanol.";
  }

  return `Write all feedback in the user's interface language: ${normalized}. If the exercise answer is in English, evaluate the English answer but explain the feedback in ${normalized}.`;
}
