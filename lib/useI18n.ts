"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getStoredLanguage,
  subscribeToLanguageChange,
  translate,
  type AppLanguage,
  type TranslationKey,
} from "@/lib/languagePreference";

export function useAppLanguage() {
  const [language, setLanguage] = useState<AppLanguage>("es");

  useEffect(() => {
    setLanguage(getStoredLanguage());
    return subscribeToLanguageChange(setLanguage);
  }, []);

  return language;
}

export function useI18n() {
  const language = useAppLanguage();

  return useMemo(
    () => ({
      language,
      t: (key: TranslationKey) => translate(language, key),
    }),
    [language]
  );
}
