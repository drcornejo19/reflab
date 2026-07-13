import {
  getActiveSeasonForSport,
  getDefaultSourceVersionForSport,
  getSportTopicOptions,
  SPORT_TYPES,
  type GoverningBody,
  type SportType,
} from "@/lib/sports";

export type SelectOption = {
  value: string;
  label: string;
};

export const sportTypeOptions: Array<SelectOption & { value: SportType }> = [
  { value: "football_11", label: "Futbol 11" },
  { value: "futsal", label: "Futsal" },
];

export const governingBodyOptions: Array<SelectOption & { value: GoverningBody }> = [
  { value: "IFAB", label: "IFAB" },
  { value: "FIFA", label: "FIFA" },
];

export const languageOptions: SelectOption[] = [
  { value: "es", label: "Espanol" },
  { value: "en", label: "English" },
  { value: "pt", label: "Portugues" },
  { value: "multi", label: "Multilenguaje" },
];

export const normativeStatusOptions: SelectOption[] = [
  { value: "vigente", label: "Vigente" },
  { value: "proxima_actualizacion", label: "Proxima actualizacion" },
  { value: "archivado", label: "Archivado" },
];

export const clipDifficultyOptions: SelectOption[] = [
  { value: "basic", label: "Basica" },
  { value: "intermediate", label: "Intermedia" },
  { value: "advanced", label: "Avanzada" },
  { value: "elite", label: "Elite" },
];

export const libraryCategoryOptions: SelectOption[] = [
  { value: "reglas", label: "Reglas de Juego" },
  { value: "circular", label: "Circular reglamentaria" },
  { value: "resumen", label: "Resumen practico" },
  { value: "protocolo_var", label: "Protocolo VAR" },
  { value: "cambios_reglamentarios", label: "Cambios reglamentarios" },
  { value: "mundial", label: "Actualizacion internacional" },
  { value: "material_consulta", label: "Material de consulta" },
];

export function getVideoTopicOptionsForSport(sportType: SportType) {
  return getSportTopicOptions(sportType, "video");
}

export function getSportDefaults(sportType: SportType) {
  return {
    season: getActiveSeasonForSport(sportType),
    sourceVersion: getDefaultSourceVersionForSport(sportType),
  };
}

export function getSportDefaultMap() {
  return Object.fromEntries(
    SPORT_TYPES.map((sportType) => [sportType, getSportDefaults(sportType)])
  ) as Record<SportType, ReturnType<typeof getSportDefaults>>;
}
