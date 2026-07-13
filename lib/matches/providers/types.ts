import type { SportType } from "@/lib/sports";

export type MatchProviderId =
  | "institutional"
  | "manual_assisted"
  | "football_data"
  | "sportmonks"
  | "api_football";

export type MatchProviderPriority = 1 | 2 | 3;

export type MatchProviderCapability = {
  countries: boolean;
  associations: boolean;
  competitions: boolean;
  seasons: boolean;
  categories: boolean;
  fixtures: boolean;
  standings: boolean;
  teamForm: boolean;
  venues: boolean;
  disciplinaryContext: boolean;
  supportsFutsal: boolean;
};

export type MatchProviderDescriptor = {
  id: MatchProviderId;
  label: string;
  priority: MatchProviderPriority;
  sourceType: "institutional" | "manual" | "api";
  capabilities: MatchProviderCapability;
  sports: SportType[];
};

export type ProviderCountry = {
  id: string;
  name: string;
  code?: string | null;
};

export type ProviderAssociation = {
  id: string;
  countryId?: string | null;
  name: string;
  code?: string | null;
};

export type ProviderCompetition = {
  id: string;
  sportType: SportType;
  associationId?: string | null;
  name: string;
  shortName?: string | null;
};

export type ProviderSeason = {
  id: string;
  competitionId: string;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
};

export type ProviderCategory = {
  id: string;
  competitionId: string;
  seasonId?: string | null;
  sportType: SportType;
  name: string;
  refereeSystem?: string | null;
  varSupported?: boolean | null;
};

export type ProviderFixture = {
  id: string;
  sportType: SportType;
  competitionId?: string | null;
  seasonId?: string | null;
  categoryId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  venueId?: string | null;
  kickoffAt: string;
  roundLabel?: string | null;
  status?: string | null;
  varEnabled?: boolean | null;
};

export type ProviderStandingRow = {
  teamId: string;
  position?: number | null;
  points?: number | null;
  played?: number | null;
  goalDifference?: number | null;
};

export type ProviderTeamForm = {
  teamId: string;
  lastResults: string[];
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  streakLabel?: string | null;
};

export type ProviderMatchDetails = {
  fixture: ProviderFixture;
  standings?: ProviderStandingRow[];
  teamForm?: ProviderTeamForm[];
  raw?: Record<string, unknown> | null;
};

export interface SportsDataProvider {
  readonly descriptor: MatchProviderDescriptor;
  getCountries(): Promise<ProviderCountry[]>;
  getAssociations(countryId?: string): Promise<ProviderAssociation[]>;
  getCompetitions(input: {
    sportType: SportType;
    associationId?: string;
  }): Promise<ProviderCompetition[]>;
  getSeasons(competitionId: string): Promise<ProviderSeason[]>;
  getCategories(input: {
    competitionId: string;
    seasonId?: string;
  }): Promise<ProviderCategory[]>;
  getFixtures(input: {
    sportType: SportType;
    competitionId?: string;
    seasonId?: string;
    categoryId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<ProviderFixture[]>;
  getStandings(input: {
    competitionId: string;
    seasonId?: string;
    categoryId?: string;
  }): Promise<ProviderStandingRow[]>;
  getTeamForm(input: {
    teamId: string;
    competitionId?: string;
    seasonId?: string;
  }): Promise<ProviderTeamForm | null>;
  getMatchDetails(fixtureId: string): Promise<ProviderMatchDetails | null>;
}

export const matchProviderDescriptors: MatchProviderDescriptor[] = [
  {
    id: "institutional",
    label: "Carga institucional",
    priority: 1,
    sourceType: "institutional",
    capabilities: {
      countries: true,
      associations: true,
      competitions: true,
      seasons: true,
      categories: true,
      fixtures: true,
      standings: false,
      teamForm: false,
      venues: true,
      disciplinaryContext: false,
      supportsFutsal: true,
    },
    sports: ["football_11", "futsal"],
  },
  {
    id: "manual_assisted",
    label: "Carga manual asistida",
    priority: 3,
    sourceType: "manual",
    capabilities: {
      countries: true,
      associations: true,
      competitions: true,
      seasons: true,
      categories: true,
      fixtures: true,
      standings: false,
      teamForm: false,
      venues: true,
      disciplinaryContext: false,
      supportsFutsal: true,
    },
    sports: ["football_11", "futsal"],
  },
  {
    id: "football_data",
    label: "football-data.org",
    priority: 2,
    sourceType: "api",
    capabilities: {
      countries: true,
      associations: false,
      competitions: true,
      seasons: true,
      categories: false,
      fixtures: true,
      standings: true,
      teamForm: false,
      venues: false,
      disciplinaryContext: false,
      supportsFutsal: false,
    },
    sports: ["football_11"],
  },
  {
    id: "sportmonks",
    label: "Sportmonks",
    priority: 2,
    sourceType: "api",
    capabilities: {
      countries: true,
      associations: true,
      competitions: true,
      seasons: true,
      categories: true,
      fixtures: true,
      standings: true,
      teamForm: true,
      venues: true,
      disciplinaryContext: true,
      supportsFutsal: false,
    },
    sports: ["football_11"],
  },
  {
    id: "api_football",
    label: "API-Football",
    priority: 2,
    sourceType: "api",
    capabilities: {
      countries: true,
      associations: true,
      competitions: true,
      seasons: true,
      categories: true,
      fixtures: true,
      standings: true,
      teamForm: true,
      venues: true,
      disciplinaryContext: false,
      supportsFutsal: false,
    },
    sports: ["football_11"],
  },
];
