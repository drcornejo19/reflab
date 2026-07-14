import type { SportType } from "@/lib/sports";

export type SportsApiProviderId =
  | "api_football"
  | "sportmonks"
  | "football_data";

export type SportsCoverageMode =
  | "automatic"
  | "manual_only"
  | "not_configured"
  | "provider_error";

export type SportsAutomationStatus = {
  provider: SportsApiProviderId | null;
  configured: boolean;
  supportsSport: boolean;
  mode: SportsCoverageMode;
  message: string;
  lastSyncAt: string | null;
};

export type SportsCountry = {
  provider: SportsApiProviderId;
  externalId: string;
  name: string;
  code: string | null;
  flagUrl: string | null;
  sourceReference: Record<string, unknown>;
};

export type SportsAssociation = {
  provider: SportsApiProviderId;
  externalId: string | null;
  countryName: string;
  countryCode: string | null;
  name: string;
  code: string | null;
  sourceReference: Record<string, unknown>;
};

export type SportsCompetitionType =
  | "league"
  | "cup"
  | "playoff"
  | "friendly"
  | "tournament"
  | "other";

export type SportsCompetition = {
  provider: SportsApiProviderId;
  externalId: string;
  sportType: SportType;
  countryName: string;
  countryCode: string | null;
  associationName: string | null;
  associationCode: string | null;
  name: string;
  shortName: string | null;
  competitionType: SportsCompetitionType;
  categoryName: string | null;
  refereeSystem: string | null;
  varSupported: boolean | null;
  sourceReference: Record<string, unknown>;
};

export type SportsSeason = {
  provider: SportsApiProviderId;
  externalId: string;
  competitionExternalId: string;
  label: string;
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  sourceReference: Record<string, unknown>;
};

export type SportsCategory = {
  provider: SportsApiProviderId;
  externalId: string;
  competitionExternalId: string;
  seasonExternalId: string;
  sportType: SportType;
  name: string;
  refereeSystem: string | null;
  varSupported: boolean | null;
  sourceReference: Record<string, unknown>;
};

export type SportsCompetitionBundle = {
  country: SportsCountry;
  association: SportsAssociation | null;
  competition: SportsCompetition;
  season: SportsSeason;
  category: SportsCategory | null;
  raw: Record<string, unknown> | null;
};

export type SportsTeam = {
  provider: SportsApiProviderId;
  externalId: string;
  sportType: SportType;
  countryName: string | null;
  countryCode: string | null;
  associationName: string | null;
  name: string;
  shortName: string | null;
  crestUrl: string | null;
  sourceReference: Record<string, unknown>;
};

export type SportsVenue = {
  provider: SportsApiProviderId;
  externalId: string;
  countryName: string | null;
  countryCode: string | null;
  associationName: string | null;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceReference: Record<string, unknown>;
};

export type SportsFixtureStatus =
  | "scheduled"
  | "confirmed"
  | "live"
  | "completed"
  | "postponed"
  | "suspended"
  | "cancelled";

export type SportsFixture = {
  provider: SportsApiProviderId;
  externalId: string;
  sportType: SportType;
  countryName: string | null;
  countryCode: string | null;
  associationName: string | null;
  competitionExternalId: string;
  seasonExternalId: string;
  categoryExternalId: string | null;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  venueExternalId: string | null;
  kickoffAt: string;
  roundLabel: string | null;
  matchdayNumber: number | null;
  status: SportsFixtureStatus;
  refereeSystem: string | null;
  varEnabled: boolean;
  sourceReference: Record<string, unknown>;
};

export type SportsFixtureBundle = {
  country: SportsCountry;
  association: SportsAssociation | null;
  competition: SportsCompetition;
  season: SportsSeason;
  category: SportsCategory | null;
  homeTeam: SportsTeam;
  awayTeam: SportsTeam;
  venue: SportsVenue | null;
  fixture: SportsFixture;
  raw: Record<string, unknown> | null;
};

export type SportsStandingsRow = {
  teamExternalId: string;
  teamName: string;
  teamLogoUrl: string | null;
  position: number | null;
  points: number | null;
  played: number | null;
  goalDifference: number | null;
  form: string | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  sourceReference: Record<string, unknown>;
};

export type SportsStandingsSnapshot = {
  provider: SportsApiProviderId;
  competitionExternalId: string;
  seasonExternalId: string;
  updatedAt: string | null;
  rows: SportsStandingsRow[];
  raw: Record<string, unknown> | null;
};

export type SportsTeamForm = {
  provider: SportsApiProviderId;
  teamExternalId: string;
  competitionExternalId: string;
  seasonExternalId: string;
  form: string[];
  goalsFor: number | null;
  goalsAgainst: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  streakLabel: string | null;
  sourceReference: Record<string, unknown>;
  raw: Record<string, unknown> | null;
};

export type SportsProviderCapabilities = {
  supportsFootball11: boolean;
  supportsFutsal: boolean;
  supportsStandings: boolean;
  supportsTeamForm: boolean;
  supportsVenues: boolean;
};

export type SportsProviderHealth = {
  provider: SportsApiProviderId;
  configured: boolean;
  missingVariables: string[];
};

export type SportsProviderConfig = {
  provider: SportsApiProviderId;
  token: string;
  baseUrl: string;
};

export type SportsSyncResult = {
  provider: SportsApiProviderId | null;
  configured: boolean;
  mode: SportsCoverageMode;
  supportsSport: boolean;
  synced: boolean;
  fixturesUpserted: number;
  competitionsUpserted: number;
  teamsUpserted: number;
  venuesUpserted: number;
  lastSyncAt: string | null;
  message: string;
};

export interface SportsDataProvider {
  readonly id: SportsApiProviderId;
  readonly label: string;
  readonly capabilities: SportsProviderCapabilities;
  getCountries(): Promise<SportsCountry[]>;
  getCompetitions(input: {
    sportType: SportType;
    countryName?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsCompetitionBundle[]>;
  getSeasons(input: {
    sportType: SportType;
    countryName?: string | null;
    competitionExternalId: string;
  }): Promise<SportsSeason[]>;
  getFixturesByDate(input: {
    sportType: SportType;
    date: string;
    countryName?: string | null;
    competitionExternalId?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsFixtureBundle[]>;
  getFixturesByRange(input: {
    sportType: SportType;
    dateFrom: string;
    dateTo: string;
    countryName?: string | null;
    competitionExternalId?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsFixtureBundle[]>;
  getStandings(input: {
    sportType: SportType;
    competitionExternalId: string;
    seasonYear: number;
  }): Promise<SportsStandingsSnapshot | null>;
  getTeamForm(input: {
    sportType: SportType;
    teamExternalId: string;
    competitionExternalId: string;
    seasonYear: number;
  }): Promise<SportsTeamForm | null>;
  getVenue(input: {
    venueExternalId: string;
  }): Promise<SportsVenue | null>;
}
