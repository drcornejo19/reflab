export type SportType = "football_11" | "futsal";
export type GoverningBody = "IFAB" | "FIFA";

export type SportTopicDefinition = {
  key: string;
  label: string;
  group: "video" | "rules" | "library" | "institutional";
  aliases?: string[];
};

export type SportLibraryDefinition = {
  title: string;
  governingBody: GoverningBody;
  officialSourceBase: string;
  activeSeasonLabel: string;
  sourceVersionLabel: string;
};

export type SportDefinition = {
  key: SportType;
  label: string;
  shortLabel: string;
  heroDescription: string;
  governingBody: GoverningBody;
  library: SportLibraryDefinition;
  topics: SportTopicDefinition[];
  disallowedTopics: string[];
  defaultActivityTypes: string[];
};

export const DEFAULT_SPORT_TYPE: SportType = "football_11";
export const SPORT_TYPES: SportType[] = ["football_11", "futsal"];

function defineTopic(
  key: string,
  label: string,
  group: SportTopicDefinition["group"],
  aliases: string[] = []
): SportTopicDefinition {
  return { key, label, group, aliases };
}

const football11Topics: SportTopicDefinition[] = [
  defineTopic("Dispute", "Disputas", "video", ["Challenge"]),
  defineTopic("Tactical foul", "Faltas tacticas", "video"),
  defineTopic("Offside", "Fuera de juego", "video"),
  defineTopic("Handball", "Manos", "video", ["Mano"]),
  defineTopic("VAR", "VAR", "video"),
];

const futsalTopics: SportTopicDefinition[] = [
  defineTopic("Fouls and contact", "Faltas y contactos", "video"),
  defineTopic("Accumulated fouls", "Faltas acumuladas", "video"),
  defineTopic("Direct free kick", "Tiro libre directo", "video"),
  defineTopic("Indirect free kick", "Tiro libre indirecto", "video"),
  defineTopic("Penalty kick", "Penal", "video"),
  defineTopic("Second penalty mark", "Segundo punto penal", "video"),
  defineTopic("Four-second count", "Control de cuatro segundos", "video"),
  defineTopic("Substitutions", "Sustituciones", "video"),
  defineTopic("Substitution procedure", "Procedimiento de sustitucion", "video"),
  defineTopic("Goalkeeper", "Juego del guardameta", "video"),
  defineTopic("Back-pass to goalkeeper", "Cesion al guardameta", "video"),
  defineTopic("Flying goalkeeper", "Portero-jugador", "video"),
  defineTopic("Kick-in", "Saque de banda", "video"),
  defineTopic("Goal clearance", "Saque de meta", "video"),
  defineTopic("Corner kick", "Saque de esquina", "video"),
  defineTopic("Dropped ball", "Balon a tierra", "video"),
  defineTopic("Double touch", "Doble toque", "video"),
  defineTopic("Required distance", "Distancia reglamentaria", "video"),
  defineTopic("Unsporting behaviour", "Conducta antideportiva", "video"),
  defineTopic("DOGSO", "Impedir una ocasion manifiesta de gol", "video"),
  defineTopic("SPA", "Detener un ataque prometedor", "video"),
  defineTopic("Reckless challenge", "Entradas temerarias", "video"),
  defineTopic("Serious foul play", "Juego brusco grave", "video"),
  defineTopic("Violent conduct", "Conducta violenta", "video"),
  defineTopic("Simulation", "Simulacion", "video"),
  defineTopic("Dissent", "Protestas", "video"),
  defineTopic("Advantage", "Ventaja", "video"),
  defineTopic("Referee positioning", "Posicionamiento arbitral", "video"),
  defineTopic("Second referee teamwork", "Trabajo del segundo arbitro", "video"),
  defineTopic("Third referee and timekeeper", "Tercer arbitro y cronometrador", "video"),
];

export const sportDefinitions = {
  football_11: {
    key: "football_11",
    label: "Futbol 11",
    shortLabel: "F11",
    heroDescription:
      "Entrenamiento tecnico, reglamentario y audiovisual orientado a arbitraje de futbol 11.",
    governingBody: "IFAB",
    library: {
      title: "Biblioteca IFAB",
      governingBody: "IFAB",
      officialSourceBase: "https://www.theifab.com/laws-of-the-game-documents/",
      activeSeasonLabel: "2026/27",
      sourceVersionLabel: "Laws of the Game 2026/27",
    },
    topics: football11Topics,
    disallowedTopics: [],
    defaultActivityTypes: [
      "video_training",
      "video_exam",
      "rules_practice",
      "rules_exam",
      "var_training",
      "english_training",
      "communication_training",
      "physical_training",
    ],
  },
  futsal: {
    key: "futsal",
    label: "Futsal",
    shortLabel: "Futsal",
    heroDescription:
      "Entrenamiento tecnico, reglamentario y audiovisual especifico para futsal.",
    governingBody: "FIFA",
    library: {
      title: "Biblioteca FIFA Futsal",
      governingBody: "FIFA",
      officialSourceBase:
        "https://digitalhub.fifa.com/m/7b1da24ec7a25f67/original/Futsal-Laws-of-the-Game-2024-2025.pdf",
      activeSeasonLabel: "2024-25",
      sourceVersionLabel: "Futsal Laws of the Game 2024-25",
    },
    topics: futsalTopics,
    disallowedTopics: ["Offside", "Fuera de juego", "VAR"],
    defaultActivityTypes: [
      "video_training",
      "video_exam",
      "rules_practice",
      "rules_exam",
      "communication_training",
      "physical_training",
      "institutional_video",
    ],
  },
} as const satisfies Record<SportType, SportDefinition>;

export function isSportType(value: unknown): value is SportType {
  return value === "football_11" || value === "futsal";
}

export function normalizeSportType(
  value: unknown,
  fallback: SportType = DEFAULT_SPORT_TYPE
): SportType {
  return isSportType(value) ? value : fallback;
}

export function getSportDefinition(value: unknown) {
  return sportDefinitions[normalizeSportType(value)];
}

export function getSportLabel(value: unknown) {
  return getSportDefinition(value).label;
}

export function getLibraryTitleForSport(value: unknown) {
  return getSportDefinition(value).library.title;
}

export function getActiveSeasonForSport(value: unknown) {
  return getSportDefinition(value).library.activeSeasonLabel;
}

export function getDefaultSourceVersionForSport(value: unknown) {
  return getSportDefinition(value).library.sourceVersionLabel;
}

export function getGoverningBodyForSport(value: unknown) {
  return getSportDefinition(value).governingBody;
}

export function getSportTopics(value: unknown) {
  return getSportDefinition(value).topics;
}

export function getSportTopicOptions(
  value: unknown,
  group?: SportTopicDefinition["group"]
) {
  return getSportTopics(value)
    .filter((topic) => (group ? topic.group === group : true))
    .map((topic) => ({
      value: topic.key,
      label: topic.label,
    }));
}

export function getSportTopicLabels(value: unknown) {
  return getSportTopics(value).map((topic) => topic.label);
}

export function getSportTopicKeys(value: unknown) {
  return getSportTopics(value).map((topic) => topic.key);
}

export function normalizeSportTopic(
  value: string | null | undefined,
  sportType: SportType,
  fallback = "Sin topico"
) {
  if (!value) return fallback;

  const normalizedTopic = normalizeTopicToken(value);
  const matched = sportDefinitions[sportType].topics.find((item) => {
    const candidates = [item.key, item.label, ...(item.aliases ?? [])];
    return candidates.some(
      (candidate) => normalizeTopicToken(candidate) === normalizedTopic
    );
  });

  return matched?.label ?? value;
}

export function isTopicAllowedForSport(
  sportType: SportType,
  topic?: string | null
) {
  if (!topic) return true;

  const normalizedTopic = normalizeTopicToken(topic);
  const definition = sportDefinitions[sportType];
  const allowed = definition.topics.some((item) => {
    const candidates = [item.key, item.label, ...(item.aliases ?? [])];
    return candidates.some(
      (candidate) => normalizeTopicToken(candidate) === normalizedTopic
    );
  });

  if (allowed) return true;

  return !definition.disallowedTopics.some(
    (item) => normalizeTopicToken(item) === normalizedTopic
  );
}

function normalizeTopicToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
