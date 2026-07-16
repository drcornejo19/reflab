import {
  defineTopic,
  type SportContentDefinition,
} from "@/lib/sports-content/types";

export const futsalContent = {
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
  topics: [
    defineTopic("Handball", "Manos", "video", ["Mano", "Hands"]),
    defineTopic("Dispute", "Disputas", "video", [
      "Challenge",
      "Fouls and contact",
      "Faltas y contactos",
    ]),
    defineTopic("Tactical foul", "Faltas tacticas", "video", [
      "Tactical fouls",
    ]),
  ],
  disallowedTopics: ["Offside", "Fuera de juego", "VAR", "APP", "OFR"],
  defaultActivityTypes: [
    "video_training",
    "video_exam",
    "rules_practice",
    "rules_exam",
    "communication_training",
    "physical_training",
    "institutional_video",
  ],
} as const satisfies SportContentDefinition;
