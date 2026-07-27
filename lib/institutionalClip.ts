import type { SportType } from "./sports-content/index.ts";

const institutionalClipSportTypes = new Set<SportType>([
  "football_11",
  "futsal",
]);

export type InstitutionalClipSportTypeResult =
  | { ok: true; value: SportType }
  | { ok: false; error: string };

export function parseInstitutionalClipSportType(
  value: unknown
): InstitutionalClipSportTypeResult {
  if (typeof value !== "string" || value.length === 0) {
    return {
      ok: false,
      error: "La disciplina del clip es obligatoria.",
    };
  }

  const sportType = value as SportType;
  if (!institutionalClipSportTypes.has(sportType)) {
    return {
      ok: false,
      error: "La disciplina debe ser football_11 o futsal.",
    };
  }

  return { ok: true, value: sportType };
}
