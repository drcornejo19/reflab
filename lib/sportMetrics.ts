import type { SportType } from "@/lib/sports";

export type MetricFieldKey =
  | "technical_correct"
  | "restart_correct"
  | "disciplinary_correct"
  | "subtype_correct"
  | "accumulated_foul_correct"
  | "four_second_correct"
  | "goalkeeper_correct";

export type RadarAxisDefinition = {
  key: string;
  label: string;
  shortLabel: string;
  description: string;
  topics: string[];
  requiredFields: MetricFieldKey[];
  emptyStateLabel: string;
};

export const radarAxesBySport: Record<SportType, RadarAxisDefinition[]> = {
  football_11: [
    {
      key: "var",
      label: "VAR",
      shortLabel: "VAR",
      description: "Criterio y protocolo VAR sobre registros reales.",
      topics: ["VAR"],
      requiredFields: ["technical_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "offside",
      label: "Fuera de juego",
      shortLabel: "FDJ",
      description: "Lectura de offside y subtipo.",
      topics: ["Fuera de juego", "Offside"],
      requiredFields: ["technical_correct", "subtype_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "handball",
      label: "Manos",
      shortLabel: "Manos",
      description: "Decision de mano y disciplina asociada.",
      topics: ["Manos", "Handball"],
      requiredFields: ["technical_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "disputes",
      label: "Disputas",
      shortLabel: "Disp.",
      description: "Contactos, duelos y consecuencia disciplinaria.",
      topics: ["Disputas", "Dispute", "Challenge"],
      requiredFields: ["technical_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "tactical_fouls",
      label: "Faltas tacticas",
      shortLabel: "FT",
      description: "SPA, DOGSO y reanudacion.",
      topics: ["Faltas tacticas", "Tactical foul"],
      requiredFields: ["technical_correct", "restart_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
  ],
  futsal: [
    {
      key: "handball",
      label: "Manos",
      shortLabel: "Manos",
      description: "Reconocimiento tecnico de mano y consecuencia disciplinaria.",
      topics: ["Handball", "Manos"],
      requiredFields: ["technical_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "disputes",
      label: "Disputas",
      shortLabel: "Disp.",
      description: "Lectura de contactos, intensidad y consecuencia disciplinaria.",
      topics: ["Dispute", "Disputas", "Fouls and contact"],
      requiredFields: ["technical_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "tactical_fouls",
      label: "Faltas tacticas",
      shortLabel: "FT",
      description: "Lectura de SPA, DOGSO, reanudacion y consecuencia disciplinaria.",
      topics: ["Tactical foul", "Faltas tacticas"],
      requiredFields: [
        "technical_correct",
        "restart_correct",
        "disciplinary_correct",
        "accumulated_foul_correct",
      ],
      emptyStateLabel: "Sin datos",
    },
  ],
};

export function getRadarAxesForSport(sportType: SportType) {
  return radarAxesBySport[sportType];
}
