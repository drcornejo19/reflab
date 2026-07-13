import {
  DEFAULT_SPORT_TYPE,
  SPORT_TYPES,
  getSportDefinition,
  isSportType,
  type SportType,
} from "@/lib/sports";

export const DISCIPLINE_STORAGE_KEY = "reflab.selectedDiscipline";
export const DISCIPLINE_COOKIE_KEY = "reflab_selected_discipline";

export type DisciplineRouteKey =
  | "dashboard"
  | "trainingHub"
  | "evaluationsHub"
  | "videoAnalysis"
  | "rulesPractice"
  | "rulesExam"
  | "performance"
  | "library"
  | "profile"
  | "stats"
  | "ranking"
  | "mobileDashboard"
  | "mobileStats"
  | "matches";

type DisciplineTheme = {
  accent: string;
  accentSoft: string;
  border: string;
  glow: string;
  button: string;
  buttonHover: string;
};

type DisciplineWelcomeCard = {
  eyebrow: string;
  description: string;
  imageSrc: string;
  imagePosition: string;
  tone: "football_11" | "futsal";
};

type DisciplineExperience = {
  key: SportType;
  label: string;
  sessionLabel: string;
  heroDescription: string;
  theme: DisciplineTheme;
  routes: Record<DisciplineRouteKey, string>;
  welcome: DisciplineWelcomeCard;
};

export const disciplineDefinitions: Record<SportType, DisciplineExperience> = {
  football_11: {
    key: "football_11",
    label: getSportDefinition("football_11").label,
    sessionLabel: "Fútbol 11",
    heroDescription:
      "Entrenamiento, análisis y evaluación para árbitros de Fútbol 11.",
    theme: {
      accent: "#6fc11f",
      accentSoft: "rgba(111,193,31,0.18)",
      border: "rgba(111,193,31,0.55)",
      glow: "rgba(111,193,31,0.36)",
      button: "#6fc11f",
      buttonHover: "#83da2b",
    },
    routes: {
      dashboard: "/dashboard",
      trainingHub: "/training",
      evaluationsHub: "/evaluations",
      videoAnalysis: "/training/video-analysis",
      rulesPractice: "/training/rules-practice",
      rulesExam: "/training/rules-exam",
      performance: "/performance",
      library: "/learning",
      profile: "/profile",
      stats: "/stats",
      ranking: "/ranking",
      mobileDashboard: "/mobile-dashboard",
      mobileStats: "/mobile-stats",
      matches: "/matches",
    },
    welcome: {
      eyebrow: "Plataforma FIFA / IFAB",
      description:
        "Entrenamiento, análisis y evaluación para árbitros de Fútbol 11.",
      imageSrc: "/home-hero-referee.png",
      imagePosition: "center",
      tone: "football_11",
    },
  },
  futsal: {
    key: "futsal",
    label: getSportDefinition("futsal").label,
    sessionLabel: "Futsal",
    heroDescription:
      "Entrenamiento, análisis y evaluación para árbitros de Futsal.",
    theme: {
      accent: "#16b8ff",
      accentSoft: "rgba(22,184,255,0.18)",
      border: "rgba(34,195,255,0.52)",
      glow: "rgba(24,189,255,0.34)",
      button: "#1498ff",
      buttonHover: "#31b8ff",
    },
    routes: {
      dashboard: "/dashboard",
      trainingHub: "/futsal/rules-practice",
      evaluationsHub: "/futsal/video-analysis",
      videoAnalysis: "/futsal/video-analysis",
      rulesPractice: "/futsal/rules-practice",
      rulesExam: "/futsal/rules-exam",
      performance: "/performance",
      library: "/learning",
      profile: "/profile",
      stats: "/stats",
      ranking: "/ranking",
      mobileDashboard: "/mobile-dashboard",
      mobileStats: "/mobile-stats",
      matches: "/matches",
    },
    welcome: {
      eyebrow: "Plataforma FIFA Futsal",
      description:
        "Entrenamiento, análisis y evaluación para árbitros de Futsal.",
      imageSrc: "/home-referee-hero.png",
      imagePosition: "center",
      tone: "futsal",
    },
  },
};

export function getDisciplineDefinition(value: unknown) {
  return disciplineDefinitions[normalizeDisciplineValue(value) ?? DEFAULT_SPORT_TYPE];
}

export function getDisciplineRoute(
  value: unknown,
  routeKey: DisciplineRouteKey
) {
  return getDisciplineDefinition(value).routes[routeKey];
}

export function getAllDisciplines() {
  return SPORT_TYPES.map((sportType) => disciplineDefinitions[sportType]);
}

export function normalizeDisciplineValue(value: unknown): SportType | null {
  return isSportType(value) ? value : null;
}

export function getDisciplineFromSearch(search: string) {
  const params = new URLSearchParams(search);
  return normalizeDisciplineValue(params.get("sport"));
}

export function sanitizeInternalPath(
  value: string | string[] | null | undefined
) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

export function resolveDisciplinePath(
  currentPath: string | null | undefined,
  sportType: SportType
) {
  const sanitizedPath = sanitizeInternalPath(currentPath) ?? "/dashboard";
  const basePath = sanitizedPath.split("?")[0]?.split("#")[0] ?? "/dashboard";

  if (
    basePath.startsWith("/training/video-analysis") ||
    basePath.startsWith("/futsal/video-analysis")
  ) {
    return getDisciplineRoute(sportType, "videoAnalysis");
  }

  if (
    basePath.startsWith("/training/rules-practice") ||
    basePath.startsWith("/futsal/rules-practice")
  ) {
    return getDisciplineRoute(sportType, "rulesPractice");
  }

  if (
    basePath.startsWith("/training/rules-exam") ||
    basePath.startsWith("/futsal/rules-exam")
  ) {
    return getDisciplineRoute(sportType, "rulesExam");
  }

  if (basePath.startsWith("/training")) {
    return getDisciplineRoute(sportType, "trainingHub");
  }

  if (basePath.startsWith("/evaluations")) {
    return getDisciplineRoute(sportType, "evaluationsHub");
  }

  if (basePath.startsWith("/futsal")) {
    return getDisciplineRoute(sportType, "trainingHub");
  }

  if (basePath.startsWith("/performance")) {
    return getDisciplineRoute(sportType, "performance");
  }

  if (basePath.startsWith("/learning")) {
    return getDisciplineRoute(sportType, "library");
  }

  if (basePath.startsWith("/profile")) {
    return getDisciplineRoute(sportType, "profile");
  }

  if (basePath.startsWith("/stats")) {
    return getDisciplineRoute(sportType, "stats");
  }

  if (basePath.startsWith("/ranking")) {
    return getDisciplineRoute(sportType, "ranking");
  }

  if (basePath.startsWith("/mobile-dashboard")) {
    return getDisciplineRoute(sportType, "mobileDashboard");
  }

  if (basePath.startsWith("/mobile-stats")) {
    return getDisciplineRoute(sportType, "mobileStats");
  }

  if (basePath.startsWith("/matches")) {
    return getDisciplineRoute(sportType, "matches");
  }

  if (basePath.startsWith("/institution/rules")) {
    return "/institution/rules";
  }

  return getDisciplineRoute(sportType, "dashboard");
}
