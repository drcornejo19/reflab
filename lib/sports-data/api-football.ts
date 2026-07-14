import "server-only";

import type { SportType } from "@/lib/sports";
import {
  extractMatchdayNumber,
  normalizeInclusiveDateKey,
  normalizeSportsCompetitionType,
  normalizeSportsCountryCode,
  normalizeSportsFixtureStatus,
  normalizeSportsText,
  resolveAssociationForCountry,
  resolveSeasonYear,
} from "@/lib/sports-data/normalize";
import {
  SportsProviderRequestError,
} from "@/lib/sports-data/provider";
import type {
  SportsCompetitionBundle,
  SportsCountry,
  SportsDataProvider,
  SportsFixtureBundle,
  SportsProviderConfig,
  SportsSeason,
  SportsStandingsRow,
  SportsStandingsSnapshot,
  SportsTeamForm,
  SportsVenue,
} from "@/lib/sports-data/types";

type ApiFootballEnvelope<T> = {
  errors?: Record<string, string> | null;
  response?: T;
};

type ApiFootballCountryResponse = {
  name?: string | null;
  code?: string | null;
  flag?: string | null;
};

type ApiFootballSeasonResponse = {
  year?: number | null;
  start?: string | null;
  end?: string | null;
  current?: boolean | null;
};

type ApiFootballLeagueResponse = {
  league?: {
    id?: number | null;
    name?: string | null;
    type?: string | null;
    logo?: string | null;
  } | null;
  country?: {
    name?: string | null;
    code?: string | null;
    flag?: string | null;
  } | null;
  seasons?: ApiFootballSeasonResponse[] | null;
};

type ApiFootballFixtureResponse = {
  fixture?: {
    id?: number | null;
    date?: string | null;
    status?: {
      short?: string | null;
    } | null;
    venue?: {
      id?: number | null;
      name?: string | null;
      city?: string | null;
      address?: string | null;
      lat?: string | number | null;
      lng?: string | number | null;
    } | null;
  } | null;
  league?: {
    id?: number | null;
    name?: string | null;
    country?: string | null;
    season?: number | null;
    round?: string | null;
  } | null;
  teams?: {
    home?: {
      id?: number | null;
      name?: string | null;
      logo?: string | null;
    } | null;
    away?: {
      id?: number | null;
      name?: string | null;
      logo?: string | null;
    } | null;
  } | null;
};

type ApiFootballStandingTeam = {
  id?: number | null;
  name?: string | null;
  logo?: string | null;
};

type ApiFootballStandingRow = {
  rank?: number | null;
  team?: ApiFootballStandingTeam | null;
  points?: number | null;
  goalsDiff?: number | null;
  form?: string | null;
  all?: {
    played?: number | null;
    win?: number | null;
    draw?: number | null;
    lose?: number | null;
    goals?: {
      for?: number | null;
      against?: number | null;
    } | null;
  } | null;
};

type ApiFootballStandingsResponse = {
  league?: {
    id?: number | null;
    season?: number | null;
    standings?: ApiFootballStandingRow[][] | null;
  } | null;
};

type ApiFootballTeamStatisticsResponse = {
  team?: {
    id?: number | null;
  } | null;
  league?: {
    id?: number | null;
    season?: number | null;
  } | null;
  form?: string | null;
  fixtures?: {
    played?: {
      total?: number | null;
    } | null;
    wins?: {
      total?: number | null;
    } | null;
    draws?: {
      total?: number | null;
    } | null;
    loses?: {
      total?: number | null;
    } | null;
  } | null;
  goals?: {
    "for"?: {
      total?: {
        total?: number | null;
      } | null;
    } | null;
    against?: {
      total?: {
        total?: number | null;
      } | null;
    } | null;
  } | null;
};

type ApiFootballVenueResponse = {
  id?: number | null;
  name?: string | null;
  city?: string | null;
  address?: string | null;
  country?: string | null;
  surface?: string | null;
  capacity?: number | null;
  image?: string | null;
};

const apiFootballDefaultAssociationByCountry = new Map([
  ["argentina", "AFA"],
]);

export class ApiFootballProvider implements SportsDataProvider {
  readonly id = "api_football" as const;
  readonly label = "API-Football";
  readonly capabilities = {
    supportsFootball11: true,
    supportsFutsal: false,
    supportsStandings: true,
    supportsTeamForm: true,
    supportsVenues: true,
  } as const;

  constructor(private readonly config: SportsProviderConfig) {}

  async getCountries(): Promise<SportsCountry[]> {
    const payload = await this.request<ApiFootballCountryResponse[]>("countries", {}, 86400);
    const countries = Array.isArray(payload.response) ? payload.response : [];

    return countries
      .map((country) => this.mapCountry(country))
      .filter((item): item is SportsCountry => item !== null);
  }

  async getCompetitions(input: {
    sportType: SportType;
    countryName?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsCompetitionBundle[]> {
    this.assertSupportedSport(input.sportType);

    const seasonYear = input.seasonYear ?? resolveSeasonYear(new Date().toISOString());
    const payload = await this.request<ApiFootballLeagueResponse[]>(
      "leagues",
      {
        country: normalizeSportsText(input.countryName) ?? "Argentina",
        season: String(seasonYear),
      },
      3600
    );
    const leagues = Array.isArray(payload.response) ? payload.response : [];

    return leagues.flatMap((leagueRow) => this.mapLeagueToBundles(leagueRow, input.sportType, seasonYear));
  }

  async getSeasons(input: {
    sportType: SportType;
    countryName?: string | null;
    competitionExternalId: string;
  }): Promise<SportsSeason[]> {
    this.assertSupportedSport(input.sportType);

    const payload = await this.request<ApiFootballLeagueResponse[]>(
      "leagues",
      {
        id: input.competitionExternalId,
      },
      3600
    );
    const row = Array.isArray(payload.response) ? payload.response[0] : null;
    const competitionBundles = row
      ? this.mapLeagueToBundles(row, input.sportType, null)
      : [];

    return competitionBundles.map((item) => item.season);
  }

  async getFixturesByDate(input: {
    sportType: SportType;
    date: string;
    countryName?: string | null;
    competitionExternalId?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsFixtureBundle[]> {
    return this.getFixturesByRange({
      sportType: input.sportType,
      dateFrom: input.date,
      dateTo: input.date,
      countryName: input.countryName,
      competitionExternalId: input.competitionExternalId,
      seasonYear: input.seasonYear,
    });
  }

  async getFixturesByRange(input: {
    sportType: SportType;
    dateFrom: string;
    dateTo: string;
    countryName?: string | null;
    competitionExternalId?: string | null;
    seasonYear?: number | null;
  }): Promise<SportsFixtureBundle[]> {
    this.assertSupportedSport(input.sportType);

    const competitionExternalId = normalizeSportsText(input.competitionExternalId);
    if (!competitionExternalId) {
      throw new SportsProviderRequestError(
        "API-Football requiere una competicion para consultar fixtures.",
        this.id,
        400
      );
    }

    const seasonYear = input.seasonYear ?? resolveSeasonYear(input.dateFrom);
    const from = normalizeSportsText(input.dateFrom)?.slice(0, 10);
    const to =
      normalizeInclusiveDateKey(input.dateTo) ??
      normalizeSportsText(input.dateTo)?.slice(0, 10) ??
      from;

    const payload = await this.request<ApiFootballFixtureResponse[]>(
      "fixtures",
      {
        league: competitionExternalId,
        season: String(seasonYear),
        from: from ?? "",
        to: to ?? from ?? "",
        timezone: "America/Argentina/Buenos_Aires",
      },
      900
    );

    const rows = Array.isArray(payload.response) ? payload.response : [];
    return rows
      .map((row) =>
        this.mapFixtureRow({
          row,
          sportType: input.sportType,
          countryName: input.countryName,
          seasonYear,
        })
      )
      .filter((item): item is SportsFixtureBundle => item !== null);
  }

  async getStandings(input: {
    sportType: SportType;
    competitionExternalId: string;
    seasonYear: number;
  }): Promise<SportsStandingsSnapshot | null> {
    this.assertSupportedSport(input.sportType);

    const payload = await this.request<ApiFootballStandingsResponse[]>(
      "standings",
      {
        league: input.competitionExternalId,
        season: String(input.seasonYear),
      },
      900
    );
    const first = Array.isArray(payload.response) ? payload.response[0] : null;
    const standingsGroups = first?.league?.standings ?? [];
    const rows = Array.isArray(standingsGroups) ? standingsGroups.flat() : [];

    return {
      provider: this.id,
      competitionExternalId: input.competitionExternalId,
      seasonExternalId: String(input.seasonYear),
      updatedAt: new Date().toISOString(),
      rows: rows
        .map((row): SportsStandingsRow | null => {
          const teamId = row.team?.id;
          const teamName = normalizeSportsText(row.team?.name);
          if (!teamId || !teamName) return null;

          return {
            teamExternalId: String(teamId),
            teamName,
            teamLogoUrl: normalizeSportsText(row.team?.logo),
            position: toNumberOrNull(row.rank),
            points: toNumberOrNull(row.points),
            played: toNumberOrNull(row.all?.played),
            goalDifference: toNumberOrNull(row.goalsDiff),
            form: normalizeSportsText(row.form),
            won: toNumberOrNull(row.all?.win),
            drawn: toNumberOrNull(row.all?.draw),
            lost: toNumberOrNull(row.all?.lose),
            goalsFor: toNumberOrNull(row.all?.goals?.for),
            goalsAgainst: toNumberOrNull(row.all?.goals?.against),
            sourceReference: {
              provider: this.id,
              teamId: String(teamId),
              leagueId: input.competitionExternalId,
              season: input.seasonYear,
            },
          };
        })
        .filter((item): item is SportsStandingsRow => item !== null),
      raw: {
        provider: this.id,
        endpoint: "standings",
      },
    };
  }

  async getTeamForm(input: {
    sportType: SportType;
    teamExternalId: string;
    competitionExternalId: string;
    seasonYear: number;
  }): Promise<SportsTeamForm | null> {
    this.assertSupportedSport(input.sportType);

    const payload = await this.request<ApiFootballTeamStatisticsResponse>(
      "teams/statistics",
      {
        league: input.competitionExternalId,
        season: String(input.seasonYear),
        team: input.teamExternalId,
      },
      900
    );
    const response =
      payload.response && !Array.isArray(payload.response) ? payload.response : null;
    if (!response) return null;

    const form = normalizeSportsText(response.form);

    return {
      provider: this.id,
      teamExternalId: input.teamExternalId,
      competitionExternalId: input.competitionExternalId,
      seasonExternalId: String(input.seasonYear),
      form: form ? form.split("") : [],
      goalsFor: toNumberOrNull(response.goals?.for?.total?.total),
      goalsAgainst: toNumberOrNull(response.goals?.against?.total?.total),
      played: toNumberOrNull(response.fixtures?.played?.total),
      won: toNumberOrNull(response.fixtures?.wins?.total),
      drawn: toNumberOrNull(response.fixtures?.draws?.total),
      lost: toNumberOrNull(response.fixtures?.loses?.total),
      streakLabel: buildStreakLabel(form),
      sourceReference: {
        provider: this.id,
        teamId: input.teamExternalId,
        leagueId: input.competitionExternalId,
        season: input.seasonYear,
      },
      raw: {
        provider: this.id,
        endpoint: "teams/statistics",
      },
    } satisfies SportsTeamForm;
  }

  async getVenue(input: { venueExternalId: string }): Promise<SportsVenue | null> {
    const payload = await this.request<ApiFootballVenueResponse[]>(
      "venues",
      {
        id: input.venueExternalId,
      },
      86400
    );
    const row = Array.isArray(payload.response) ? payload.response[0] : null;
    if (!row) return null;

    return this.mapVenue({
      id: row.id,
      name: row.name,
      city: row.city,
      address: row.address,
      country: row.country,
      lat: null,
      lng: null,
    });
  }

  private assertSupportedSport(sportType: SportType) {
    if (sportType !== "football_11") {
      throw new SportsProviderRequestError(
        "API-Football no ofrece cobertura automatica validada para futsal en RefLab.",
        this.id,
        400
      );
    }
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string>,
    revalidateSeconds: number
  ) {
    const url = new URL(endpoint, `${this.config.baseUrl}/`);
    for (const [key, value] of Object.entries(params)) {
      if (!value) continue;
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": this.config.token,
      },
      next: {
        revalidate: revalidateSeconds,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 429) {
      throw new SportsProviderRequestError(
        "API-Football informo limite de consultas. RefLab mantendra el fallback manual mientras se libera el cupo.",
        this.id,
        429,
        parseRetryAfter(response.headers.get("retry-after"))
      );
    }

    if (!response.ok) {
      throw new SportsProviderRequestError(
        `API-Football respondio ${response.status}.`,
        this.id,
        response.status
      );
    }

    const payload = (await response.json()) as ApiFootballEnvelope<T>;
    const errors = payload.errors ?? null;
    if (errors && Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0] ?? "Error desconocido del proveedor.";
      throw new SportsProviderRequestError(firstError, this.id, response.status);
    }

    return payload;
  }

  private mapLeagueToBundles(
    row: ApiFootballLeagueResponse,
    sportType: SportType,
    seasonYear: number | null
  ): SportsCompetitionBundle[] {
    const country = this.mapCountry(row.country);
    const leagueId = row.league?.id;
    const competitionName = normalizeSportsText(row.league?.name);

    if (!country || !leagueId || !competitionName) {
      return [];
    }

    const associationInfo = resolveAssociationForCountry(country.name, country.code);
    const association =
      associationInfo ??
      (() => {
        const fallbackKey = apiFootballDefaultAssociationByCountry.get(
          country.name.toLowerCase()
        );
        return fallbackKey
          ? {
              name: fallbackKey,
              code: fallbackKey,
            }
          : null;
      })();

    const seasons = Array.isArray(row.seasons) ? row.seasons : [];
    const selectedSeasons = seasonYear
      ? seasons.filter((season) => season.year === seasonYear)
      : seasons.filter((season) => season.current === true).length
        ? seasons.filter((season) => season.current === true)
        : seasons;

    return selectedSeasons
      .map((season): SportsCompetitionBundle | null => {
        const year = season.year;
        if (!year) return null;

        const seasonExternalId = String(year);
        const associationRecord = association
          ? {
              provider: this.id,
              externalId: association.code,
              countryName: country.name,
              countryCode: country.code,
              name: association.name,
              code: association.code,
              sourceReference: {
                provider: this.id,
                country: country.name,
              },
            }
          : null;

        return {
          country,
          association: associationRecord,
          competition: {
            provider: this.id,
            externalId: String(leagueId),
            sportType,
            countryName: country.name,
            countryCode: country.code,
            associationName: associationRecord?.name ?? null,
            associationCode: associationRecord?.code ?? null,
            name: competitionName,
            shortName: normalizeSportsText(row.league?.name),
            competitionType: normalizeSportsCompetitionType(row.league?.type),
            categoryName: competitionName,
            refereeSystem: null,
            varSupported: false,
            sourceReference: {
              provider: this.id,
              leagueId: String(leagueId),
              season: year,
            },
          },
          season: {
            provider: this.id,
            externalId: seasonExternalId,
            competitionExternalId: String(leagueId),
            label: String(year),
            startDate: normalizeSportsText(season.start),
            endDate: normalizeSportsText(season.end),
            current: Boolean(season.current),
            sourceReference: {
              provider: this.id,
              leagueId: String(leagueId),
              season: year,
            },
          },
          category: {
            provider: this.id,
            externalId: `${leagueId}:${seasonExternalId}:default`,
            competitionExternalId: String(leagueId),
            seasonExternalId,
            sportType,
            name: competitionName,
            refereeSystem: null,
            varSupported: false,
            sourceReference: {
              provider: this.id,
              leagueId: String(leagueId),
              season: year,
            },
          },
          raw: {
            provider: this.id,
            league: row.league,
            country: row.country,
            season,
          },
        } satisfies SportsCompetitionBundle;
      })
      .filter((item): item is SportsCompetitionBundle => item !== null);
  }

  private mapFixtureRow(input: {
    row: ApiFootballFixtureResponse;
    sportType: SportType;
    countryName?: string | null;
    seasonYear: number;
  }): SportsFixtureBundle | null {
    const fixtureId = input.row.fixture?.id;
    const kickoffAt = normalizeSportsText(input.row.fixture?.date);
    const competitionId = input.row.league?.id;
    const season = input.row.league?.season ?? input.seasonYear;
    const homeTeamId = input.row.teams?.home?.id;
    const awayTeamId = input.row.teams?.away?.id;
    const homeTeamName = normalizeSportsText(input.row.teams?.home?.name);
    const awayTeamName = normalizeSportsText(input.row.teams?.away?.name);
    const countryName =
      normalizeSportsText(input.row.league?.country) ??
      normalizeSportsText(input.countryName) ??
      "Argentina";
    const countryCode = countryName === "Argentina" ? "AR" : null;

    if (
      !fixtureId ||
      !competitionId ||
      !kickoffAt ||
      !homeTeamId ||
      !awayTeamId ||
      !homeTeamName ||
      !awayTeamName
    ) {
      return null;
    }

    const country = this.mapCountry({
      name: countryName,
      code: countryCode,
      flag: null,
    });
    if (!country) return null;

    const associationInfo = resolveAssociationForCountry(country.name, country.code);
    const association =
      associationInfo
        ? {
            provider: this.id,
            externalId: associationInfo.code,
            countryName: country.name,
            countryCode: country.code,
            name: associationInfo.name,
            code: associationInfo.code,
            sourceReference: {
              provider: this.id,
              country: country.name,
            },
          }
        : null;

    const competitionName =
      normalizeSportsText(input.row.league?.name) ?? "Competicion oficial";
    const seasonExternalId = String(season);
    const venue = this.mapVenue({
      id: input.row.fixture?.venue?.id,
      name: input.row.fixture?.venue?.name,
      city: input.row.fixture?.venue?.city,
      address: input.row.fixture?.venue?.address,
      country: country.name,
      lat: input.row.fixture?.venue?.lat,
      lng: input.row.fixture?.venue?.lng,
    });

    return {
      country,
      association,
      competition: {
        provider: this.id,
        externalId: String(competitionId),
        sportType: input.sportType,
        countryName: country.name,
        countryCode: country.code,
        associationName: association?.name ?? null,
        associationCode: association?.code ?? null,
        name: competitionName,
        shortName: competitionName,
        competitionType: "league",
        categoryName: competitionName,
        refereeSystem: null,
        varSupported: false,
        sourceReference: {
          provider: this.id,
          leagueId: String(competitionId),
          season,
        },
      },
      season: {
        provider: this.id,
        externalId: seasonExternalId,
        competitionExternalId: String(competitionId),
        label: seasonExternalId,
        startDate: null,
        endDate: null,
        current: season === resolveSeasonYear(kickoffAt),
        sourceReference: {
          provider: this.id,
          leagueId: String(competitionId),
          season,
        },
      },
      category: {
        provider: this.id,
        externalId: `${competitionId}:${seasonExternalId}:default`,
        competitionExternalId: String(competitionId),
        seasonExternalId,
        sportType: input.sportType,
        name: competitionName,
        refereeSystem: null,
        varSupported: false,
        sourceReference: {
          provider: this.id,
          leagueId: String(competitionId),
          season,
        },
      },
      homeTeam: {
        provider: this.id,
        externalId: String(homeTeamId),
        sportType: input.sportType,
        countryName: country.name,
        countryCode: country.code,
        associationName: association?.name ?? null,
        name: homeTeamName,
        shortName: homeTeamName,
        crestUrl: normalizeSportsText(input.row.teams?.home?.logo),
        sourceReference: {
          provider: this.id,
          teamId: String(homeTeamId),
        },
      },
      awayTeam: {
        provider: this.id,
        externalId: String(awayTeamId),
        sportType: input.sportType,
        countryName: country.name,
        countryCode: country.code,
        associationName: association?.name ?? null,
        name: awayTeamName,
        shortName: awayTeamName,
        crestUrl: normalizeSportsText(input.row.teams?.away?.logo),
        sourceReference: {
          provider: this.id,
          teamId: String(awayTeamId),
        },
      },
      venue,
      fixture: {
        provider: this.id,
        externalId: String(fixtureId),
        sportType: input.sportType,
        countryName: country.name,
        countryCode: country.code,
        associationName: association?.name ?? null,
        competitionExternalId: String(competitionId),
        seasonExternalId,
        categoryExternalId: `${competitionId}:${seasonExternalId}:default`,
        homeTeamExternalId: String(homeTeamId),
        awayTeamExternalId: String(awayTeamId),
        venueExternalId: venue?.externalId ?? null,
        kickoffAt,
        roundLabel: normalizeSportsText(input.row.league?.round),
        matchdayNumber: extractMatchdayNumber(input.row.league?.round),
        status: normalizeSportsFixtureStatus(input.row.fixture?.status?.short),
        refereeSystem: null,
        varEnabled: false,
        sourceReference: {
          provider: this.id,
          fixtureId: String(fixtureId),
          leagueId: String(competitionId),
          season,
        },
      },
      raw: {
        provider: this.id,
        fixture: input.row.fixture,
        league: input.row.league,
        teams: input.row.teams,
      },
    } satisfies SportsFixtureBundle;
  }

  private mapCountry(country: {
    name?: string | null;
    code?: string | null;
    flag?: string | null;
  } | null | undefined): SportsCountry | null {
    const name = normalizeSportsText(country?.name);
    const code = normalizeSportsCountryCode(country?.code);
    if (!name || !code) return null;

    return {
      provider: this.id,
      externalId: code,
      name,
      code,
      flagUrl: normalizeSportsText(country?.flag),
      sourceReference: {
        provider: this.id,
        country: name,
      },
    } satisfies SportsCountry;
  }

  private mapVenue(venue: {
    id?: number | null;
    name?: string | null;
    city?: string | null;
    address?: string | null;
    country?: string | null;
    lat?: string | number | null;
    lng?: string | number | null;
  }): SportsVenue | null {
    const venueId = venue.id;
    const name = normalizeSportsText(venue.name);
    if (!venueId || !name) return null;

    const countryName = normalizeSportsText(venue.country);
    return {
      provider: this.id,
      externalId: String(venueId),
      countryName,
      countryCode: countryName === "Argentina" ? "AR" : null,
      associationName: countryName === "Argentina" ? "AFA" : null,
      name,
      city: normalizeSportsText(venue.city),
      address: normalizeSportsText(venue.address),
      latitude: toNumberOrNull(venue.lat),
      longitude: toNumberOrNull(venue.lng),
      sourceReference: {
        provider: this.id,
        venueId: String(venueId),
      },
    };
  }
}

function buildStreakLabel(form: string | null) {
  const normalized = normalizeSportsText(form);
  if (!normalized) return null;

  const tokens = normalized.split("");
  const first = tokens[0];
  if (!first) return null;

  let streak = 0;
  for (const token of tokens) {
    if (token === first) {
      streak += 1;
      continue;
    }
    break;
  }

  const label =
    first === "W" ? "victorias" : first === "D" ? "empates" : first === "L" ? "derrotas" : "partidos";
  return `${streak} ${label} consecutivas`;
}

function toNumberOrNull(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(number) ? number : null;
}

function parseRetryAfter(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
