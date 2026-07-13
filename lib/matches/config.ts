import type { SportType } from "@/lib/sports";
import {
  appointmentSourceTypeValues,
  appointmentStatusValues,
  fixtureStatusValues,
  preparationStageValues,
  type RefereeRoleKey,
} from "@/lib/matches/types";

export const appointmentStatusLabels = {
  draft: "Borrador",
  pending_confirmation: "Pendiente de confirmacion",
  confirmed: "Confirmada",
  modified: "Modificada",
  replaced: "Reemplazada",
  cancelled: "Cancelada",
  suspended: "Suspendida",
  postponed: "Postergada",
  completed: "Completada",
} as const satisfies Record<(typeof appointmentStatusValues)[number], string>;

export const appointmentSourceLabels = {
  manual: "Designacion registrada por el usuario",
  institutional: "Designacion confirmada por la institucion",
  api: "Designacion importada por proveedor",
} as const satisfies Record<(typeof appointmentSourceTypeValues)[number], string>;

export const fixtureStatusLabels = {
  scheduled: "Programado",
  confirmed: "Confirmado",
  live: "En juego",
  completed: "Completado",
  postponed: "Postergado",
  suspended: "Suspendido",
  cancelled: "Cancelado",
} as const satisfies Record<(typeof fixtureStatusValues)[number], string>;

export const preparationStageDefinitions = {
  "72_48_hours": {
    key: "72_48_hours",
    label: "72-48 horas antes",
    shortLabel: "72-48h",
    description: "Carga reciente, descanso, estado emocional y objetivo tecnico.",
  },
  "24_hours": {
    key: "24_hours",
    label: "24 horas antes",
    shortLabel: "24h",
    description: "Checklist logistico, reglamentario, hidratacion y rutina mental.",
  },
  matchday: {
    key: "matchday",
    label: "Dia del partido",
    shortLabel: "Partido",
    description: "Readiness final, foco, activacion y estrategia de los primeros minutos.",
  },
} as const satisfies Record<
  (typeof preparationStageValues)[number],
  {
    key: (typeof preparationStageValues)[number];
    label: string;
    shortLabel: string;
    description: string;
  }
>;

export const refereeRoleCatalog: Record<
  SportType,
  Array<{
    key: RefereeRoleKey;
    label: string;
    roleGroup: "field" | "assistant" | "support" | "video" | "other";
    requiresVar?: boolean;
    isReserve?: boolean;
  }>
> = {
  football_11: [
    { key: "referee", label: "Arbitro", roleGroup: "field" },
    { key: "assistant_1", label: "Arbitro asistente n. 1", roleGroup: "assistant" },
    { key: "assistant_2", label: "Arbitro asistente n. 2", roleGroup: "assistant" },
    { key: "fourth_official", label: "Cuarto arbitro", roleGroup: "support" },
    { key: "fifth_official", label: "Quinto arbitro", roleGroup: "support" },
    { key: "var", label: "VAR", roleGroup: "video", requiresVar: true },
    { key: "avar", label: "AVAR", roleGroup: "video", requiresVar: true },
    { key: "reserve_assistant", label: "Asistente de reserva", roleGroup: "assistant", isReserve: true },
    { key: "other", label: "Otro rol configurable", roleGroup: "other" },
  ],
  futsal: [
    { key: "first_referee", label: "Primer arbitro", roleGroup: "field" },
    { key: "second_referee", label: "Segundo arbitro", roleGroup: "field" },
    { key: "third_referee", label: "Tercer arbitro", roleGroup: "support" },
    { key: "timekeeper", label: "Cronometrador", roleGroup: "support" },
    { key: "reserve_assistant", label: "Arbitro asistente de reserva", roleGroup: "support", isReserve: true },
    { key: "other", label: "Otro rol configurable", roleGroup: "other" },
  ],
};

export function getRefereeRoleCatalog(sportType: SportType) {
  return refereeRoleCatalog[sportType];
}
