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
      key: "fouls_contacts",
      label: "Faltas y contactos",
      shortLabel: "Faltas",
      description: "Reconocimiento de infraccion y consecuencia disciplinaria.",
      topics: ["Fouls and contact", "Faltas y contactos"],
      requiredFields: ["technical_correct", "disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "restarts_four_seconds",
      label: "Reanudaciones y cuatro segundos",
      shortLabel: "4 seg.",
      description: "Reinicio correcto y control del tiempo reglamentario.",
      topics: [
        "Direct free kick",
        "Indirect free kick",
        "Penalty kick",
        "Second penalty mark",
        "Four-second count",
        "Kick-in",
        "Goal clearance",
        "Corner kick",
        "Dropped ball",
      ],
      requiredFields: ["restart_correct", "four_second_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "discipline",
      label: "Disciplina",
      shortLabel: "Disc.",
      description: "Amonestaciones, expulsiones y gestion disciplinaria.",
      topics: [
        "Unsporting behaviour",
        "DOGSO",
        "SPA",
        "Reckless challenge",
        "Serious foul play",
        "Violent conduct",
        "Simulation",
        "Dissent",
      ],
      requiredFields: ["disciplinary_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "goalkeeper_flying_goalkeeper",
      label: "Guardameta y portero-jugador",
      shortLabel: "Portero",
      description: "Cesion, control en propia mitad y decisiones del portero-jugador.",
      topics: ["Goalkeeper", "Back-pass to goalkeeper", "Flying goalkeeper"],
      requiredFields: ["goalkeeper_correct", "four_second_correct"],
      emptyStateLabel: "Sin datos",
    },
    {
      key: "accumulated_special",
      label: "Faltas acumuladas y situaciones especiales",
      shortLabel: "Acum.",
      description: "Lectura del sexto foul, acumuladas y procedimientos especiales.",
      topics: [
        "Accumulated fouls",
        "Substitutions",
        "Substitution procedure",
        "Double touch",
        "Required distance",
        "Advantage",
        "Referee positioning",
        "Second referee teamwork",
        "Third referee and timekeeper",
      ],
      requiredFields: ["accumulated_foul_correct", "technical_correct"],
      emptyStateLabel: "Sin datos",
    },
  ],
};

export function getRadarAxesForSport(sportType: SportType) {
  return radarAxesBySport[sportType];
}
