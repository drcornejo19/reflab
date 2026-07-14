import type { SportType } from "@/lib/sports";
import type {
  SportsApiProviderId,
  SportsAutomationStatus,
  SportsCompetitionType,
  SportsCoverageMode,
  SportsFixtureStatus,
} from "@/lib/sports-data/types";

export function normalizeSportsText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeSportsCountryCode(value: unknown) {
  const normalized = normalizeSportsText(value)?.toUpperCase();
  if (!normalized) return null;
  return normalized.slice(0, 3);
}

export function normalizeSportsCompetitionType(value: unknown): SportsCompetitionType {
  const normalized = normalizeSportsText(value)?.toLowerCase();
  if (!normalized) return "other";
  if (normalized.includes("league")) return "league";
  if (normalized.includes("cup")) return "cup";
  if (normalized.includes("playoff")) return "playoff";
  if (normalized.includes("friendly")) return "friendly";
  if (normalized.includes("tournament")) return "tournament";
  return "other";
}

export function normalizeSportsFixtureStatus(value: unknown): SportsFixtureStatus {
  const normalized = normalizeSportsText(value)?.toUpperCase();
  if (!normalized) return "scheduled";

  if (["FT", "AET", "PEN"].includes(normalized)) return "completed";
  if (["1H", "2H", "HT", "ET", "BT", "LIVE", "INT"].includes(normalized)) {
    return "live";
  }
  if (normalized === "PST") return "postponed";
  if (normalized === "SUSP") return "suspended";
  if (["CANC", "ABD", "AWD", "WO"].includes(normalized)) return "cancelled";
  if (normalized === "NS") return "scheduled";
  if (normalized === "TBD") return "scheduled";
  return "scheduled";
}

export function buildSportsAutomationStatus(input: {
  provider: SportsApiProviderId | null;
  configured: boolean;
  supportsSport: boolean;
  mode: SportsCoverageMode;
  message: string;
  lastSyncAt?: string | null;
}): SportsAutomationStatus {
  return {
    provider: input.provider,
    configured: input.configured,
    supportsSport: input.supportsSport,
    mode: input.mode,
    message: input.message,
    lastSyncAt: input.lastSyncAt ?? null,
  };
}

export function resolveAssociationForCountry(
  countryName: string | null | undefined,
  countryCode?: string | null
) {
  const normalizedName = normalizeToken(countryName);
  const normalizedCode = normalizeSportsCountryCode(countryCode);

  if (normalizedName === "argentina" || normalizedCode === "AR" || normalizedCode === "ARG") {
    return {
      name: "AFA",
      code: "AFA",
    };
  }

  return null;
}

export function normalizeToken(value: unknown) {
  const normalized = normalizeSportsText(value);
  if (!normalized) return "";
  return normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeDateKey(value: string | null | undefined) {
  const normalized = normalizeSportsText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeInclusiveDateKey(value: string | null | undefined) {
  const normalized = normalizeSportsText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return null;
  parsed.setUTCMinutes(parsed.getUTCMinutes() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function resolveSeasonYear(
  dateFrom: string | null | undefined,
  fallback = new Date().getUTCFullYear()
) {
  const parsed = normalizeDateKey(dateFrom);
  if (!parsed) return fallback;
  const year = Number(parsed.slice(0, 4));
  return Number.isFinite(year) ? year : fallback;
}

export function extractMatchdayNumber(value: string | null | undefined) {
  const normalized = normalizeSportsText(value);
  if (!normalized) return null;

  const match = normalized.match(/(\d+)/);
  if (!match) return null;

  const number = Number(match[1]);
  return Number.isFinite(number) ? number : null;
}

export function getSportAutomationSupport(sportType: SportType) {
  return sportType === "football_11";
}
