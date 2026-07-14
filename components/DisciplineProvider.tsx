"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_SPORT_TYPE, type SportType } from "@/lib/sports";
import {
  DISCIPLINE_COOKIE_KEY,
  DISCIPLINE_STORAGE_KEY,
  getDisciplineFromPathname,
  getDisciplineFromSearch,
  normalizeDisciplineValue,
} from "@/lib/discipline";

type DisciplineContextValue = {
  selectedDiscipline: SportType | null;
  currentDiscipline: SportType;
  hasSelectedDiscipline: boolean;
  isHydrated: boolean;
  setDiscipline: (discipline: SportType) => void;
};

const DisciplineContext = createContext<DisciplineContextValue | null>(null);

export function DisciplineProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const routeDiscipline = getDisciplineFromPathname(pathname);
  const [selectedDiscipline, setSelectedDiscipline] = useState<SportType | null>(
    null
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const persistDiscipline = useCallback((discipline: SportType) => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(DISCIPLINE_STORAGE_KEY, discipline);
    document.cookie = `${DISCIPLINE_COOKIE_KEY}=${discipline}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.discipline = discipline;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pathDiscipline = getDisciplineFromPathname(window.location.pathname);
    const queryDiscipline = getDisciplineFromSearch(window.location.search);
    const cookieDiscipline = readDisciplineFromCookie(document.cookie);
    const localDiscipline = normalizeDisciplineValue(
      window.localStorage.getItem(DISCIPLINE_STORAGE_KEY)
    );
    const initialDiscipline =
      pathDiscipline ??
      queryDiscipline ??
      cookieDiscipline ??
      localDiscipline ??
      null;

    if (initialDiscipline) {
      persistDiscipline(initialDiscipline);
      setSelectedDiscipline(initialDiscipline);
    }

    setIsHydrated(true);
  }, [persistDiscipline]);

  useEffect(() => {
    if (!isHydrated || typeof window === "undefined") return;

    const pathDiscipline = getDisciplineFromPathname(window.location.pathname);
    const queryDiscipline = getDisciplineFromSearch(window.location.search);
    const nextDiscipline = pathDiscipline ?? queryDiscipline;
    if (!nextDiscipline || nextDiscipline === selectedDiscipline) return;

    persistDiscipline(nextDiscipline);
    setSelectedDiscipline(nextDiscipline);
  }, [isHydrated, pathname, persistDiscipline, selectedDiscipline]);

  const setDiscipline = useCallback(
    (discipline: SportType) => {
      persistDiscipline(discipline);
      setSelectedDiscipline(discipline);
    },
    [persistDiscipline]
  );

  const value = useMemo<DisciplineContextValue>(
    () => ({
      selectedDiscipline,
      currentDiscipline:
        selectedDiscipline ?? routeDiscipline ?? DEFAULT_SPORT_TYPE,
      hasSelectedDiscipline: Boolean(selectedDiscipline ?? routeDiscipline),
      isHydrated,
      setDiscipline,
    }),
    [isHydrated, routeDiscipline, selectedDiscipline, setDiscipline]
  );

  return (
    <DisciplineContext.Provider value={value}>
      {children}
    </DisciplineContext.Provider>
  );
}

export function useDiscipline() {
  const context = useContext(DisciplineContext);

  if (!context) {
    throw new Error("useDiscipline debe usarse dentro de DisciplineProvider.");
  }

  return context;
}

function readDisciplineFromCookie(cookieValue: string) {
  const match = cookieValue.match(
    new RegExp(`(?:^|; )${DISCIPLINE_COOKIE_KEY}=([^;]+)`)
  );

  if (!match?.[1]) return null;
  return normalizeDisciplineValue(decodeURIComponent(match[1]));
}
