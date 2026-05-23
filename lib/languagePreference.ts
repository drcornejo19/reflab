export type AppLanguage = "es" | "en" | "pt";

export const languageOptions: { value: AppLanguage; label: string; shortLabel: string }[] = [
  { value: "es", label: "Espanol", shortLabel: "ES" },
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "pt", label: "Portugues", shortLabel: "PT" },
];

export const languageStorageKey = "reflab-language";

export function normalizeAppLanguage(value?: string | null): AppLanguage {
  const language = value?.trim().toLowerCase();

  if (language?.startsWith("en")) return "en";
  if (language?.startsWith("pt")) return "pt";
  return "es";
}

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "es";

  const stored = window.localStorage.getItem(languageStorageKey);
  if (stored) return normalizeAppLanguage(stored);

  return normalizeAppLanguage(window.navigator.language);
}

export function setStoredLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(languageStorageKey, language);
  window.dispatchEvent(new CustomEvent("reflab-language-change", { detail: language }));
}

export function subscribeToLanguageChange(callback: (language: AppLanguage) => void) {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    callback((event as CustomEvent<AppLanguage>).detail ?? getStoredLanguage());
  };

  const storageHandler = (event: StorageEvent) => {
    if (event.key === languageStorageKey) callback(getStoredLanguage());
  };

  window.addEventListener("reflab-language-change", handler);
  window.addEventListener("storage", storageHandler);

  return () => {
    window.removeEventListener("reflab-language-change", handler);
    window.removeEventListener("storage", storageHandler);
  };
}