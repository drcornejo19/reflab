import type { PsychologyModuleSlug } from "./psychology.ts";

export type PsychologyCheckInType =
  | "pre_match"
  | "post_match"
  | "error_recovery";

export type PsychologyExerciseType =
  | "focus_reset"
  | "pressure_scenario"
  | "self_talk"
  | "team_prebrief";

export const psychologyCheckinModuleByType: Readonly<
  Record<PsychologyCheckInType, PsychologyModuleSlug>
> = {
  pre_match: "preparacion-mental-pre-partido",
  post_match: "evaluacion-post-partido",
  error_recovery: "gestion-error",
};

export const psychologyExerciseModuleByType: Readonly<
  Record<PsychologyExerciseType, PsychologyModuleSlug>
> = {
  focus_reset: "concentracion-foco",
  pressure_scenario: "presion-competitiva",
  self_talk: "confianza-arbitral",
  team_prebrief: "preparacion-mental-pre-partido",
};

const wellbeingModuleSlug: PsychologyModuleSlug = "resiliencia";

export type PsychologyModuleResolution =
  | { ok: true; moduleSlug: PsychologyModuleSlug }
  | { ok: false; error: string };

export function isPsychologyCheckInType(
  value: unknown
): value is PsychologyCheckInType {
  return (
    value === "pre_match" ||
    value === "post_match" ||
    value === "error_recovery"
  );
}

export function isPsychologyExerciseType(
  value: unknown
): value is PsychologyExerciseType {
  return (
    value === "focus_reset" ||
    value === "pressure_scenario" ||
    value === "self_talk" ||
    value === "team_prebrief"
  );
}

function ensureRequestedSlugMatches(
  requestedSlug: unknown,
  canonicalSlug: PsychologyModuleSlug
): PsychologyModuleResolution {
  if (requestedSlug === undefined || requestedSlug === null) {
    return { ok: true, moduleSlug: canonicalSlug };
  }

  if (requestedSlug !== canonicalSlug) {
    return {
      ok: false,
      error: "El modulo no coincide con la clasificacion canonica del registro.",
    };
  }

  return { ok: true, moduleSlug: canonicalSlug };
}

export function resolvePsychologyCheckinModule(
  checkinType: unknown,
  requestedSlug?: unknown
): PsychologyModuleResolution {
  if (!isPsychologyCheckInType(checkinType)) {
    return {
      ok: false,
      error: "El tipo de check-in psicologico no tiene una clasificacion valida.",
    };
  }

  return ensureRequestedSlugMatches(
    requestedSlug,
    psychologyCheckinModuleByType[checkinType]
  );
}

export function resolvePsychologyExerciseModule(
  exerciseType: unknown,
  requestedSlug?: unknown
): PsychologyModuleResolution {
  if (!isPsychologyExerciseType(exerciseType)) {
    return {
      ok: false,
      error: "El tipo de ejercicio psicologico no tiene una clasificacion valida.",
    };
  }

  return ensureRequestedSlugMatches(
    requestedSlug,
    psychologyExerciseModuleByType[exerciseType]
  );
}

export function resolvePsychologyWellbeingModule(
  requestedSlug?: unknown
): PsychologyModuleResolution {
  return ensureRequestedSlugMatches(requestedSlug, wellbeingModuleSlug);
}
