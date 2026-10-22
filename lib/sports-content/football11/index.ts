import {
  defineTopic,
  type SportContentDefinition,
} from "../types.ts";

export const football11Content = {
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
  topics: [
    defineTopic("Dispute", "Disputas", "video", ["Challenge"]),
    defineTopic("Tactical foul", "Faltas tacticas", "video"),
    defineTopic("Offside", "Fuera de juego", "video"),
    defineTopic("Handball", "Manos", "video", ["Mano"]),
    defineTopic("VAR", "VAR", "video"),
  ],
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
} as const satisfies SportContentDefinition;
