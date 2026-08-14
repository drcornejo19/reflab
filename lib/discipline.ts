import {
  DEFAULT_SPORT_TYPE,
  SPORT_TYPES,
  isSportType,
  type SportType,
} from "./sports.ts";
import { FUTSAL_RF_LOGO_SRC, RF_LOGO_SRC } from "./brand.ts";

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

export type DisciplineActionKey = "primaryTraining" | "primaryEvaluation";

export type DisciplineTheme = {
  accent: string;
  accentSoft: string;
  border: string;
  glow: string;
  button: string;
  buttonHover: string;
  onAccent: string;
};

type DisciplineWelcomeCard = {
  eyebrow: string;
  description: string;
  imageSrc: string;
  imagePosition: string;
  tone: "football_11" | "futsal";
};

export type DisciplineModuleStatus =
  | "Disponible"
  | "Beta"
  | "Proximamente"
  | "En construccion";

export type DisciplineModuleIconKey =
  | "decision"
  | "video"
  | "var"
  | "communication"
  | "preparation"
  | "rules"
  | "performance"
  | "library"
  | "timer";

export type DisciplineModule = {
  title: string;
  category: string;
  description: string;
  href?: string;
  status: DisciplineModuleStatus;
  iconKey: DisciplineModuleIconKey;
  proOnly?: boolean;
  freeNote?: string;
};

type DisciplineExperience = {
  key: SportType;
  label: string;
  sessionLabel: string;
  heroDescription: string;
  logoSrc: string;
  theme: DisciplineTheme;
  routes: Record<DisciplineRouteKey, string>;
  actions: Record<DisciplineActionKey, string>;
  welcome: DisciplineWelcomeCard;
  trainingModules: DisciplineModule[];
  evaluationModules: DisciplineModule[];
};

export const disciplineDefinitions: Record<SportType, DisciplineExperience> = {
  football_11: {
    key: "football_11",
    label: "Futbol 11",
    sessionLabel: "Futbol 11",
    heroDescription:
      "Entrenamiento, analisis y evaluacion para arbitros de Futbol 11.",
    logoSrc: RF_LOGO_SRC,
    theme: {
      accent: "#6fc11f",
      accentSoft: "rgba(111,193,31,0.18)",
      border: "rgba(111,193,31,0.55)",
      glow: "rgba(111,193,31,0.36)",
      button: "#6fc11f",
      buttonHover: "#83da2b",
      onAccent: "#04110a",
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
    actions: {
      primaryTraining: "/training/decision",
      primaryEvaluation: "/training/exam",
    },
    welcome: {
      eyebrow: "Plataforma FIFA / IFAB",
      description:
        "Entrenamiento, analisis y evaluacion para arbitros de Futbol 11.",
      imageSrc: "/home-hero-referee.png",
      imagePosition: "center",
      tone: "football_11",
    },
    trainingModules: [
      {
        title: "Entrenamiento con clips",
        category: "Tecnica",
        description:
          "Entrena reglas, interpretacion, reanudaciones, disciplina, manos, fuera de juego y faltas tacticas.",
        href: "/training/decision",
        status: "Disponible",
        iconKey: "decision",
      },
      {
        title: "Videoanalisis",
        category: "Audiovisual",
        description:
          "Analiza jugadas reales y entrena criterio tecnico, disciplinario y de reanudacion.",
        href: "/training/video-analysis",
        status: "Disponible",
        iconKey: "video",
      },
      {
        title: "VAR Lab",
        category: "Protocolo",
        description:
          "Practica protocolo VAR, OFR, APP, factual vs interpretativo y decision final.",
        href: "/training/var",
        status: "Beta",
        iconKey: "var",
        proOnly: true,
        freeNote: "VAR Lab es exclusivo de RefLab Pro.",
      },
      {
        title: "Comunicacion arbitral",
        category: "Comunicacion",
        description:
          "Explica decisiones en espanol, entrena ingles arbitral IFAB y aprende vocabulario tecnico.",
        href: "/training/english",
        status: "Beta",
        iconKey: "communication",
        proOnly: true,
        freeNote: "Comunicacion arbitral se desbloquea con RefLab Pro.",
      },
      {
        title: "Preparacion integral",
        category: "Desarrollo",
        description:
          "Entrenamiento fisico, Tabata, psicologia arbitral, preparacion mental y rutinas pre y post partido.",
        href: "/training/referee-preparation",
        status: "Disponible",
        iconKey: "preparation",
        proOnly: true,
        freeNote: "Preparacion integral se desbloquea con RefLab Pro.",
      },
    ],
    evaluationModules: [
      {
        title: "Examen arbitral",
        category: "Decision",
        description:
          "Serie formal de casos arbitrales para medir criterio, ritmo y consistencia.",
        href: "/training/exam",
        status: "Disponible",
        iconKey: "decision",
      },
      {
        title: "Examen de reglas",
        category: "Reglas",
        description:
          "Prueba reglamentaria por topicos y criterios con resultado final y trazabilidad.",
        href: "/training/rules-exam",
        status: "Disponible",
        iconKey: "rules",
      },
      {
        title: "Evaluacion de comunicacion",
        category: "Comunicacion",
        description:
          "Practica lenguaje arbitral, claridad explicativa y terminologia tecnica.",
        href: "/training/communication",
        status: "Beta",
        iconKey: "communication",
      },
      {
        title: "VAR Check",
        category: "Protocolo",
        description:
          "Validacion especifica de protocolo VAR, OFR, APP y comunicacion del equipo.",
        status: "Proximamente",
        iconKey: "var",
      },
      {
        title: "Simulacion temporalizada",
        category: "Ritmo competitivo",
        description:
          "Bloque continuo de decisiones para trabajar lectura, tiempo y presion.",
        status: "Proximamente",
        iconKey: "timer",
      },
    ],
  },
  futsal: {
    key: "futsal",
    label: "Futsal",
    sessionLabel: "Futsal",
    heroDescription:
      "Entrenamiento, analisis y evaluacion para arbitros de Futsal.",
    logoSrc: FUTSAL_RF_LOGO_SRC,
    theme: {
      accent: "#2abaff",
      accentSoft: "rgba(42,186,255,0.18)",
      border: "rgba(75,202,255,0.56)",
      glow: "rgba(42,186,255,0.42)",
      button: "#159fff",
      buttonHover: "#4ac7ff",
      onAccent: "#03111d",
    },
    routes: {
      dashboard: "/dashboard",
      trainingHub: "/training",
      evaluationsHub: "/evaluations",
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
    actions: {
      primaryTraining: "/futsal/video-analysis",
      primaryEvaluation: "/futsal/rules-exam",
    },
    welcome: {
      eyebrow: "Plataforma FIFA Futsal",
      description:
        "Entrenamiento, analisis y evaluacion para arbitros de Futsal.",
      imageSrc: "/home-referee-hero.png",
      imagePosition: "center",
      tone: "futsal",
    },
    trainingModules: [
      {
        title: "Videoanalisis de futsal",
        category: "Tecnica",
        description:
          "Analiza jugadas de manos, disputas y faltas tacticas con criterios propios de futsal.",
        href: "/futsal/video-analysis",
        status: "Disponible",
        iconKey: "video",
      },
      {
        title: "Trivia FIFA Futsal",
        category: "Reglas",
        description:
          "Practica normativa oficial con feedback inmediato, explicacion por regla y dificultad progresiva.",
        href: "/futsal/rules-practice",
        status: "Disponible",
        iconKey: "rules",
      },
      {
        title: "Rendimiento de futsal",
        category: "Metricas",
        description:
          "Consulta radar, fortalezas, puntos criticos e historial real sin mezclar datos de futbol 11.",
        href: "/performance",
        status: "Disponible",
        iconKey: "performance",
      },
      {
        title: "Biblioteca FIFA Futsal",
        category: "Biblioteca",
        description:
          "Accede a reglamento, circulares y documentos oficiales activos de la disciplina.",
        href: "/learning",
        status: "Disponible",
        iconKey: "library",
      },
    ],
    evaluationModules: [
      {
        title: "Examen de reglas FIFA Futsal",
        category: "Reglas",
        description:
          "Examen formal sin feedback inmediato, con analisis final por regla, topico y criterio.",
        href: "/futsal/rules-exam",
        status: "Disponible",
        iconKey: "rules",
      },
      {
        title: "Trivia reglamentaria",
        category: "Practica",
        description:
          "Modo de practica para consolidar interpretacion antes de rendir el examen formal.",
        href: "/futsal/rules-practice",
        status: "Disponible",
        iconKey: "decision",
      },
      {
        title: "Simulacion formal de clips",
        category: "Evaluacion",
        description:
          "Bloque consecutivo de jugadas para transformar el videoanalisis en una instancia de examen.",
        status: "Proximamente",
        iconKey: "timer",
      },
    ],
  },
};

export function getDisciplineDefinition(value: unknown) {
  return disciplineDefinitions[normalizeDisciplineValue(value) ?? DEFAULT_SPORT_TYPE];
}

export function getDisciplineRoute(value: unknown, routeKey: DisciplineRouteKey) {
  return getDisciplineDefinition(value).routes[routeKey];
}

export function getDisciplineAction(value: unknown, actionKey: DisciplineActionKey) {
  return getDisciplineDefinition(value).actions[actionKey];
}

export function getDisciplineTrainingModules(value: unknown) {
  return getDisciplineDefinition(value).trainingModules;
}

export function getDisciplineEvaluationModules(value: unknown) {
  return getDisciplineDefinition(value).evaluationModules;
}

export function getAllDisciplines() {
  return SPORT_TYPES.map((sportType) => disciplineDefinitions[sportType]);
}

const FUTSAL_ROUTE_PREFIXES = ["/futsal"];
const FOOTBALL_11_ROUTE_PREFIXES = [
  "/training/communication",
  "/training/decision",
  "/training/english",
  "/training/exam",
  "/training/field",
  "/training/psychology",
  "/training/referee-preparation",
  "/training/rules-exam",
  "/training/rules-practice",
  "/training/rules-premium-practice",
  "/training/var",
  "/training/video-analysis",
  "/mobile-var",
];

export function normalizeDisciplineValue(value: unknown): SportType | null {
  return isSportType(value) ? value : null;
}

export function getDisciplineFromPathname(pathname: string | null | undefined) {
  if (!pathname) return null;

  if (
    FUTSAL_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return "futsal" as const;
  }

  if (
    FOOTBALL_11_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return "football_11" as const;
  }

  return null;
}

export function getDisciplineFromSearch(search: string) {
  const params = new URLSearchParams(search);
  return normalizeDisciplineValue(params.get("sport"));
}

export function sanitizeInternalPath(value: string | string[] | null | undefined) {
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
