import {
  sportContentRegistry,
  type SportType,
} from "@/lib/sports-content";
import type {
  GoverningBody,
  SportContentDefinition,
  SportLibraryDefinition,
  SportTopicDefinition,
} from "@/lib/sports-content/types";

export type {
  GoverningBody,
  SportLibraryDefinition,
  SportTopicDefinition,
  SportType,
};
export type SportDefinition = SportContentDefinition;

export const DEFAULT_SPORT_TYPE: SportType = "football_11";
export const SPORT_TYPES = Object.keys(sportContentRegistry) as SportType[];
export const sportDefinitions = sportContentRegistry;

export function isSportType(value: unknown): value is SportType {
  return typeof value === "string" && value in sportDefinitions;
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

  const matched = findSportTopic(value, sportType);

  return matched?.label ?? value;
}

export function normalizeSportTopicKey(
  value: string | null | undefined,
  sportType: SportType
) {
  if (!value) return null;
  return findSportTopic(value, sportType)?.key ?? null;
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

  return false;
}

function normalizeTopicToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findSportTopic(value: string, sportType: SportType) {
  const normalizedTopic = normalizeTopicToken(value);

  return sportDefinitions[sportType].topics.find((item) => {
    const candidates = [item.key, item.label, ...(item.aliases ?? [])];
    return candidates.some(
      (candidate) => normalizeTopicToken(candidate) === normalizedTopic
    );
  });
}
