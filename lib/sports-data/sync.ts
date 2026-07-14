import "server-only";

import type {
  AssociationRecord,
  CompetitionCategoryRecord,
  CompetitionRecord,
  CompetitionSeasonRecord,
  CountryRecord,
  FixtureRecord,
  TeamRecord,
  VenueRecord,
} from "@/lib/matches/types";
import {
  buildSportsAutomationStatus,
  getSportAutomationSupport,
  normalizeDateKey,
  normalizeInclusiveDateKey,
  normalizeSportsText,
  resolveSeasonYear,
} from "@/lib/sports-data/normalize";
import {
  getSelectedSportsProviderId,
  getSportsProvider,
  getSportsProviderHealth,
  SportsProviderConfigError,
  SportsProviderRequestError,
} from "@/lib/sports-data/provider";
import type {
  SportsAutomationStatus,
  SportsCompetitionBundle,
  SportsFixtureBundle,
  SportsSyncResult,
} from "@/lib/sports-data/types";
import type { SportType } from "@/lib/sports";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type SupabaseAnyClient = ReturnType<typeof createSupabaseAdminClient>;

type SyncCatalogInput = {
  supabase: SupabaseAnyClient;
  sportType: SportType;
  countryId?: string | null;
  associationId?: string | null;
  competitionId?: string | null;
  seasonId?: string | null;
  categoryId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  actorCountryName?: string | null;
};

type PersistedCompetitionRefs = {
  country: CountryRecord;
  association: AssociationRecord | null;
  competition: CompetitionRecord;
  season: CompetitionSeasonRecord;
  category: CompetitionCategoryRecord | null;
};

type PersistedFixtureRefs = PersistedCompetitionRefs & {
  homeTeam: TeamRecord;
  awayTeam: TeamRecord;
  venue: VenueRecord | null;
};

type SyncLogRow = {
  id?: string | null;
  provider?: string | null;
  sport_type?: string | null;
  country_name?: string | null;
  competition_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  sync_status?: string | null;
  message?: string | null;
  created_at?: string | null;
};

type PersistenceContext = {
  countries: Map<string, CountryRecord>;
  associations: Map<string, AssociationRecord>;
  competitions: Map<string, CompetitionRecord>;
  seasons: Map<string, CompetitionSeasonRecord>;
  categories: Map<string, CompetitionCategoryRecord>;
  teams: Map<string, TeamRecord>;
  venues: Map<string, VenueRecord>;
};

const syncCooldownMinutes = 15;

export async function syncSportsCatalogWindow(
  input: SyncCatalogInput
): Promise<SportsAutomationStatus> {
  const supportMode = getSportAutomationSupport(input.sportType);
  const providerId = getSelectedSportsProviderId();
  const providerHealth = getSportsProviderHealth();

  if (!supportMode) {
    return buildSportsAutomationStatus({
      provider: providerId,
      configured: providerHealth.configured,
      supportsSport: false,
      mode: "manual_only",
      message:
        "La cobertura automatica para esta disciplina todavia no esta validada. Puedes usar carga institucional o registro manual.",
      lastSyncAt: null,
    });
  }

  if (!providerHealth.configured) {
    return buildSportsAutomationStatus({
      provider: providerHealth.provider,
      configured: false,
      supportsSport: true,
      mode: "not_configured",
      message:
        "La integracion deportiva todavia no esta configurada en el servidor. RefLab seguira funcionando con carga institucional y registro manual.",
      lastSyncAt: null,
    });
  }

  const countryName =
    (await resolveCountryName(input.supabase, input.countryId)) ??
    normalizeSportsText(input.actorCountryName) ??
    "Argentina";
  const dateFromKey = normalizeDateKey(input.dateFrom) ?? new Date().toISOString().slice(0, 10);
  const dateToKey = normalizeInclusiveDateKey(input.dateTo) ?? dateFromKey;
  const seasonYear = await resolveSeasonYearFromSelection(
    input.supabase,
    input.seasonId,
    input.dateFrom
  );
  const requestedCompetition = input.competitionId
    ? await getCompetitionById(input.supabase, input.competitionId)
    : null;

  if (
    requestedCompetition &&
    requestedCompetition.provider &&
    requestedCompetition.provider !== providerHealth.provider
  ) {
    return buildSportsAutomationStatus({
      provider: providerHealth.provider,
      configured: true,
      supportsSport: true,
      mode: "manual_only",
      message:
        "La competicion seleccionada no depende del proveedor automatico activo. Puedes continuar con carga institucional o registro manual.",
      lastSyncAt: null,
    });
  }

  const recentLog = await findRecentSyncLog(input.supabase, {
    provider: providerHealth.provider,
    sportType: input.sportType,
    countryName,
    competitionId: input.competitionId,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
  });

  if (recentLog && isRecentSuccessfulLog(recentLog.created_at)) {
    return buildSportsAutomationStatus({
      provider: providerHealth.provider,
      configured: true,
      supportsSport: true,
      mode: recentLog.sync_status === "error" ? "provider_error" : "automatic",
      message:
        normalizeSportsText(recentLog.message) ??
        "RefLab ya sincronizo esta ventana recientemente y reutilizara esos datos.",
      lastSyncAt: recentLog.created_at ?? null,
    });
  }

  try {
    const provider = getSportsProvider();
    const persistence = createPersistenceContext();
    const competitionBundles = await provider.getCompetitions({
      sportType: input.sportType,
      countryName,
      seasonYear,
    });

    if (!competitionBundles.length) {
      const result: SportsSyncResult = {
        provider: provider.id,
        configured: true,
        mode: "manual_only",
        supportsSport: true,
        synced: false,
        fixturesUpserted: 0,
        competitionsUpserted: 0,
        teamsUpserted: 0,
        venuesUpserted: 0,
        lastSyncAt: null,
        message:
          "El proveedor no informo competiciones automaticas para la seleccion actual. RefLab mantendra el fallback manual.",
      };
      await writeSyncLog(input.supabase, {
        provider: provider.id,
        sportType: input.sportType,
        countryName,
        competitionId: input.competitionId,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        syncStatus: "skipped",
        message: result.message,
      });
      return toAutomationStatus(result);
    }

    const bundleRefs = new Map<string, PersistedCompetitionRefs>();
    const uniqueBundles = dedupeCompetitionBundles(competitionBundles);
    let competitionsUpserted = 0;

    for (const bundle of uniqueBundles) {
      const refs = await ensureCompetitionBundle(
        input.supabase,
        persistence,
        bundle,
        input.sportType
      );
      bundleRefs.set(getCompetitionBundleKey(bundle), refs);
      competitionsUpserted += 1;
    }

    const selectedBundles = selectCompetitionBundles({
      competitionBundles: uniqueBundles,
      bundleRefs,
      requestedCompetitionId: input.competitionId,
      requestedSeasonId: input.seasonId,
      requestedCategoryId: input.categoryId,
      requestedAssociationId: input.associationId,
    });

    if (!selectedBundles.length) {
      const result: SportsSyncResult = {
        provider: provider.id,
        configured: true,
        mode: "manual_only",
        supportsSport: true,
        synced: false,
        fixturesUpserted: 0,
        competitionsUpserted,
        teamsUpserted: 0,
        venuesUpserted: 0,
        lastSyncAt: null,
        message:
          "La competicion filtrada no tiene una referencia automatica disponible en el proveedor seleccionado.",
      };
      await writeSyncLog(input.supabase, {
        provider: provider.id,
        sportType: input.sportType,
        countryName,
        competitionId: input.competitionId,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
        syncStatus: "skipped",
        message: result.message,
      });
      return toAutomationStatus(result);
    }

    let fixturesUpserted = 0;
    let teamsUpserted = 0;
    let venuesUpserted = 0;

    for (const bundle of selectedBundles) {
      const fixtureBundles = await provider.getFixturesByRange({
        sportType: input.sportType,
        countryName,
        competitionExternalId: bundle.competition.externalId,
        seasonYear: Number(bundle.season.externalId) || seasonYear,
        dateFrom: dateFromKey,
        dateTo: dateToKey,
      });

      for (const fixtureBundle of dedupeFixtureBundles(fixtureBundles)) {
        const refs =
          bundleRefs.get(getCompetitionBundleKeyFromFixture(fixtureBundle)) ??
          (await ensureCompetitionBundle(
            input.supabase,
            persistence,
            mapFixtureBundleToCompetitionBundle(fixtureBundle),
            input.sportType
          ));

        const persisted = await ensureFixtureBundle(
          input.supabase,
          persistence,
          fixtureBundle,
          refs,
          input.sportType
        );

        fixturesUpserted += persisted.fixtureWritten ? 1 : 0;
        teamsUpserted += persisted.teamsWritten;
        venuesUpserted += persisted.venueWritten ? 1 : 0;
      }
    }

    const lastSyncAt = new Date().toISOString();
    const syncResult: SportsSyncResult = {
      provider: provider.id,
      configured: true,
      mode: "automatic",
      supportsSport: true,
      synced: true,
      fixturesUpserted,
      competitionsUpserted,
      teamsUpserted,
      venuesUpserted,
      lastSyncAt,
      message:
        fixturesUpserted > 0
          ? `Sincronizacion automatica completada con ${fixturesUpserted} partido(s) actualizado(s) desde ${provider.label}.`
          : "La sincronizacion automatica finalizo, pero no se informaron partidos para esa ventana.",
    };

    await writeSyncLog(input.supabase, {
      provider: provider.id,
      sportType: input.sportType,
      countryName,
      competitionId: input.competitionId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      syncStatus: fixturesUpserted > 0 ? "success" : "partial",
      message: syncResult.message,
      fixturesUpserted,
      competitionsUpserted,
      teamsUpserted,
      venuesUpserted,
    });

    return toAutomationStatus(syncResult);
  } catch (error) {
    const lastSyncAt = new Date().toISOString();
    const message = describeSyncError(error);

    await writeSyncLog(input.supabase, {
      provider: providerHealth.provider,
      sportType: input.sportType,
      countryName,
      competitionId: input.competitionId,
      dateFrom: dateFromKey,
      dateTo: dateToKey,
      syncStatus: "error",
      message,
      errorPayload:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
            }
          : {
              message: "Error desconocido al sincronizar fixtures.",
            },
    });

    return buildSportsAutomationStatus({
      provider: providerHealth.provider,
      configured: true,
      supportsSport: true,
      mode: "provider_error",
      message,
      lastSyncAt,
    });
  }
}

function toAutomationStatus(result: SportsSyncResult) {
  return buildSportsAutomationStatus({
    provider: result.provider,
    configured: result.configured,
    supportsSport: result.supportsSport,
    mode: result.mode,
    message: result.message,
    lastSyncAt: result.lastSyncAt,
  });
}

async function resolveSeasonYearFromSelection(
  supabase: SupabaseAnyClient,
  seasonId: string | null | undefined,
  dateFrom: string | null | undefined
) {
  if (seasonId) {
    const season = await getSeasonById(supabase, seasonId);
    const label = normalizeSportsText(season?.label);
    const match = label?.match(/(\d{4})/);
    if (match) {
      const year = Number(match[1]);
      if (Number.isFinite(year)) return year;
    }
  }

  return resolveSeasonYear(dateFrom);
}

function selectCompetitionBundles(input: {
  competitionBundles: SportsCompetitionBundle[];
  bundleRefs: Map<string, PersistedCompetitionRefs>;
  requestedCompetitionId?: string | null;
  requestedSeasonId?: string | null;
  requestedCategoryId?: string | null;
  requestedAssociationId?: string | null;
}) {
  return input.competitionBundles.filter((bundle) => {
    const refs = input.bundleRefs.get(getCompetitionBundleKey(bundle));
    if (!refs) return false;
    if (input.requestedCompetitionId && refs.competition.id !== input.requestedCompetitionId) {
      return false;
    }
    if (input.requestedSeasonId && refs.season.id !== input.requestedSeasonId) {
      return false;
    }
    if (
      input.requestedCategoryId &&
      refs.category?.id !== input.requestedCategoryId
    ) {
      return false;
    }
    if (
      input.requestedAssociationId &&
      refs.association?.id !== input.requestedAssociationId
    ) {
      return false;
    }
    return true;
  });
}

function dedupeCompetitionBundles(bundles: SportsCompetitionBundle[]) {
  const unique = new Map<string, SportsCompetitionBundle>();
  for (const bundle of bundles) {
    unique.set(getCompetitionBundleKey(bundle), bundle);
  }
  return Array.from(unique.values());
}

function dedupeFixtureBundles(bundles: SportsFixtureBundle[]) {
  const unique = new Map<string, SportsFixtureBundle>();
  for (const bundle of bundles) {
    unique.set(bundle.fixture.externalId, bundle);
  }
  return Array.from(unique.values());
}

function getCompetitionBundleKey(bundle: SportsCompetitionBundle) {
  return `${bundle.competition.externalId}:${bundle.season.externalId}`;
}

function getCompetitionBundleKeyFromFixture(bundle: SportsFixtureBundle) {
  return `${bundle.competition.externalId}:${bundle.season.externalId}`;
}

function mapFixtureBundleToCompetitionBundle(bundle: SportsFixtureBundle): SportsCompetitionBundle {
  return {
    country: bundle.country,
    association: bundle.association,
    competition: bundle.competition,
    season: bundle.season,
    category: bundle.category,
    raw: bundle.raw,
  };
}

function createPersistenceContext(): PersistenceContext {
  return {
    countries: new Map(),
    associations: new Map(),
    competitions: new Map(),
    seasons: new Map(),
    categories: new Map(),
    teams: new Map(),
    venues: new Map(),
  };
}

async function ensureCompetitionBundle(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  bundle: SportsCompetitionBundle,
  sportType: SportType
): Promise<PersistedCompetitionRefs> {
  const country = await ensureCountry(supabase, context, bundle.country);
  const association = bundle.association
    ? await ensureAssociation(supabase, context, country.id, bundle.association)
    : null;
  const competition = await ensureCompetition(
    supabase,
    context,
    association?.id ?? null,
    bundle.competition,
    sportType
  );
  const season = await ensureSeason(supabase, context, competition.id, bundle.season);
  const category = bundle.category
    ? await ensureCategory(supabase, context, competition.id, season.id, bundle.category, sportType)
    : null;

  return {
    country,
    association,
    competition,
    season,
    category,
  };
}

async function ensureFixtureBundle(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  bundle: SportsFixtureBundle,
  refs: PersistedCompetitionRefs,
  sportType: SportType
) {
  const homeTeam = await ensureTeam(
    supabase,
    context,
    bundle.homeTeam,
    sportType,
    refs.country.id,
    refs.association?.id ?? null
  );
  const awayTeam = await ensureTeam(
    supabase,
    context,
    bundle.awayTeam,
    sportType,
    refs.country.id,
    refs.association?.id ?? null
  );
  const venue = bundle.venue
    ? await ensureVenue(
        supabase,
        context,
        bundle.venue,
        refs.country.id,
        refs.association?.id ?? null
      )
    : null;

  const fixtureWritten = await ensureFixture(
    supabase,
    bundle,
    {
      ...refs,
      homeTeam,
      awayTeam,
      venue,
    },
    sportType
  );

  return {
    fixtureWritten,
    teamsWritten: 2,
    venueWritten: Boolean(venue),
  };
}

async function ensureCountry(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  country: SportsCompetitionBundle["country"]
) {
  const cacheKey = country.code ?? country.externalId;
  const cached = context.countries.get(cacheKey);
  if (cached) return cached;

  const result = await supabase
    .from("countries")
    .upsert(
      {
        code: country.code ?? country.externalId,
        name: country.name,
        is_active: true,
      },
      {
        onConflict: "code",
      }
    )
    .select("*")
    .single();

  throwIfError(result.error, "No se pudo sincronizar el pais.");
  const record = result.data as CountryRecord;
  context.countries.set(cacheKey, record);
  return record;
}

async function ensureAssociation(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  countryId: string,
  association: NonNullable<SportsCompetitionBundle["association"]>
) {
  const cacheKey = `${countryId}:${association.name}`;
  const cached = context.associations.get(cacheKey);
  if (cached) return cached;

  const result = await supabase
    .from("associations")
    .upsert(
      {
        country_id: countryId,
        code: association.code,
        name: association.name,
        is_active: true,
      },
      {
        onConflict: "country_id,name",
      }
    )
    .select("*")
    .single();

  throwIfError(result.error, "No se pudo sincronizar la asociacion.");
  const record = result.data as AssociationRecord;
  context.associations.set(cacheKey, record);
  return record;
}

async function ensureCompetition(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  associationId: string | null,
  competition: SportsCompetitionBundle["competition"],
  sportType: SportType
) {
  const cacheKey = `${associationId ?? "global"}:${sportType}:${competition.name}`;
  const cached = context.competitions.get(cacheKey);
  if (cached) return cached;

  const result = await supabase
    .from("competitions")
    .upsert(
      {
        association_id: associationId,
        sport_type: sportType,
        name: competition.name,
        short_name: competition.shortName,
        competition_type: competition.competitionType,
        provider: competition.provider,
        source_type: "api",
        external_id: competition.externalId,
        is_active: true,
      },
      {
        onConflict: "association_id,sport_type,name",
      }
    )
    .select("*")
    .single();

  throwIfError(result.error, "No se pudo sincronizar la competicion.");
  const record = result.data as CompetitionRecord;
  context.competitions.set(cacheKey, record);
  return record;
}

async function ensureSeason(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  competitionId: string,
  season: SportsCompetitionBundle["season"]
) {
  const cacheKey = `${competitionId}:${season.label}`;
  const cached = context.seasons.get(cacheKey);
  if (cached) return cached;

  const result = await supabase
    .from("competition_seasons")
    .upsert(
      {
        competition_id: competitionId,
        label: season.label,
        start_date: season.startDate,
        end_date: season.endDate,
        status: season.current ? "active" : "archived",
        provider: season.provider,
        source_type: "api",
        external_id: season.externalId,
      },
      {
        onConflict: "competition_id,label",
      }
    )
    .select("*")
    .single();

  throwIfError(result.error, "No se pudo sincronizar la temporada.");
  const record = result.data as CompetitionSeasonRecord;
  context.seasons.set(cacheKey, record);
  return record;
}

async function ensureCategory(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  competitionId: string,
  seasonId: string,
  category: NonNullable<SportsCompetitionBundle["category"]>,
  sportType: SportType
) {
  const cacheKey = `${competitionId}:${seasonId}:${category.name}`;
  const cached = context.categories.get(cacheKey);
  if (cached) return cached;

  const result = await supabase
    .from("competition_categories")
    .upsert(
      {
        competition_id: competitionId,
        season_id: seasonId,
        sport_type: sportType,
        name: category.name,
        referee_system: category.refereeSystem,
        var_supported: Boolean(category.varSupported),
        provider: category.provider,
        source_type: "api",
        external_id: category.externalId,
        is_active: true,
      },
      {
        onConflict: "competition_id,season_id,name",
      }
    )
    .select("*")
    .single();

  throwIfError(result.error, "No se pudo sincronizar la categoria.");
  const record = result.data as CompetitionCategoryRecord;
  context.categories.set(cacheKey, record);
  return record;
}

async function ensureTeam(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  team: SportsFixtureBundle["homeTeam"],
  sportType: SportType,
  countryId: string,
  associationId: string | null
) {
  const cacheKey = `${team.provider}:${team.externalId}`;
  const cached = context.teams.get(cacheKey);
  if (cached) return cached;

  const existing = await supabase
    .from("teams")
    .select("*")
    .eq("provider", team.provider)
    .eq("external_id", team.externalId)
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar el equipo sincronizado.");

  const payload = {
    sport_type: sportType,
    country_id: countryId,
    association_id: associationId,
    name: team.name,
    short_name: team.shortName,
    provider: team.provider,
    source_type: "api" as const,
    external_id: team.externalId,
    crest_url: team.crestUrl,
    is_active: true,
  };

  if (existing.data) {
    const updateRes = await supabase
      .from("teams")
      .update(payload)
      .eq("id", (existing.data as TeamRecord).id)
      .select("*")
      .single();

    throwIfError(updateRes.error, "No se pudo actualizar el equipo sincronizado.");
    const record = updateRes.data as TeamRecord;
    context.teams.set(cacheKey, record);
    return record;
  }

  const insertRes = await supabase.from("teams").insert(payload).select("*").single();
  throwIfError(insertRes.error, "No se pudo crear el equipo sincronizado.");
  const record = insertRes.data as TeamRecord;
  context.teams.set(cacheKey, record);
  return record;
}

async function ensureVenue(
  supabase: SupabaseAnyClient,
  context: PersistenceContext,
  venue: NonNullable<SportsFixtureBundle["venue"]>,
  countryId: string,
  associationId: string | null
) {
  const cacheKey = `${venue.provider}:${venue.externalId}`;
  const cached = context.venues.get(cacheKey);
  if (cached) return cached;

  const existing = await supabase
    .from("venues")
    .select("*")
    .eq("provider", venue.provider)
    .eq("external_id", venue.externalId)
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar el estadio sincronizado.");

  const payload = {
    country_id: countryId,
    association_id: associationId,
    name: venue.name,
    city: venue.city,
    address: venue.address,
    provider: venue.provider,
    source_type: "api" as const,
    external_id: venue.externalId,
    latitude: venue.latitude,
    longitude: venue.longitude,
    is_active: true,
  };

  if (existing.data) {
    const updateRes = await supabase
      .from("venues")
      .update(payload)
      .eq("id", (existing.data as VenueRecord).id)
      .select("*")
      .single();

    throwIfError(updateRes.error, "No se pudo actualizar el estadio sincronizado.");
    const record = updateRes.data as VenueRecord;
    context.venues.set(cacheKey, record);
    return record;
  }

  const insertRes = await supabase.from("venues").insert(payload).select("*").single();
  throwIfError(insertRes.error, "No se pudo crear el estadio sincronizado.");
  const record = insertRes.data as VenueRecord;
  context.venues.set(cacheKey, record);
  return record;
}

async function ensureFixture(
  supabase: SupabaseAnyClient,
  bundle: SportsFixtureBundle,
  refs: PersistedFixtureRefs,
  sportType: SportType
) {
  const existing = await supabase
    .from("fixtures")
    .select("*")
    .eq("provider", bundle.fixture.provider)
    .eq("external_id", bundle.fixture.externalId)
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar el fixture sincronizado.");

  const payload = {
    sport_type: sportType,
    country_id: refs.country.id,
    association_id: refs.association?.id ?? null,
    competition_id: refs.competition.id,
    season_id: refs.season.id,
    category_id: refs.category?.id ?? null,
    home_team_id: refs.homeTeam.id,
    away_team_id: refs.awayTeam.id,
    venue_id: refs.venue?.id ?? null,
    kickoff_at: bundle.fixture.kickoffAt,
    round_label: bundle.fixture.roundLabel,
    matchday_number: bundle.fixture.matchdayNumber,
    status: bundle.fixture.status,
    referee_system: bundle.fixture.refereeSystem,
    var_enabled: bundle.fixture.varEnabled,
    data_source: "api" as const,
    provider: bundle.fixture.provider,
    external_id: bundle.fixture.externalId,
    raw_source_reference: bundle.raw ?? bundle.fixture.sourceReference,
    last_synced_at: new Date().toISOString(),
  };

  if (existing.data) {
    const updateRes = await supabase
      .from("fixtures")
      .update(payload)
      .eq("id", (existing.data as FixtureRecord).id)
      .select("id")
      .single();

    throwIfError(updateRes.error, "No se pudo actualizar el fixture sincronizado.");
    return true;
  }

  const insertRes = await supabase.from("fixtures").insert(payload).select("id").single();
  throwIfError(insertRes.error, "No se pudo crear el fixture sincronizado.");
  return Boolean(insertRes.data);
}

async function resolveCountryName(
  supabase: SupabaseAnyClient,
  countryId: string | null | undefined
) {
  const normalizedId = normalizeSportsText(countryId);
  if (!normalizedId) return null;

  const result = await supabase.from("countries").select("name").eq("id", normalizedId).maybeSingle();
  throwIfError(result.error, "No se pudo resolver el pais filtrado.");
  return normalizeSportsText((result.data as { name?: string | null } | null)?.name);
}

async function getCompetitionById(
  supabase: SupabaseAnyClient,
  competitionId: string
) {
  const result = await supabase
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .maybeSingle();

  throwIfError(result.error, "No se pudo validar la competicion filtrada.");
  return (result.data ?? null) as CompetitionRecord | null;
}

async function getSeasonById(supabase: SupabaseAnyClient, seasonId: string) {
  const result = await supabase
    .from("competition_seasons")
    .select("id,label")
    .eq("id", seasonId)
    .maybeSingle();

  throwIfError(result.error, "No se pudo validar la temporada filtrada.");
  return (result.data ?? null) as Pick<CompetitionSeasonRecord, "id" | "label"> | null;
}

async function findRecentSyncLog(
  supabase: SupabaseAnyClient,
  input: {
    provider: string;
    sportType: SportType;
    countryName: string;
    competitionId?: string | null;
    dateFrom: string;
    dateTo: string;
  }
) {
  const query = supabase
    .from("fixture_sync_logs")
    .select("id,provider,sport_type,country_name,competition_id,date_from,date_to,sync_status,message,created_at")
    .eq("provider", input.provider)
    .eq("sport_type", input.sportType)
    .eq("country_name", input.countryName)
    .eq("date_from", input.dateFrom)
    .eq("date_to", input.dateTo)
    .order("created_at", { ascending: false })
    .limit(1);

  const finalQuery = input.competitionId
    ? query.eq("competition_id", input.competitionId)
    : query.is("competition_id", null);

  const result = await finalQuery.maybeSingle();
  if (result.error) {
    if (isOptionalSyncLogTableError(result.error.message)) {
      return null;
    }
    throw new Error(`No se pudo leer el historial de sincronizacion. ${result.error.message}`);
  }

  return (result.data ?? null) as SyncLogRow | null;
}

async function writeSyncLog(
  supabase: SupabaseAnyClient,
  input: {
    provider: string;
    sportType: SportType;
    countryName: string;
    competitionId?: string | null;
    dateFrom: string;
    dateTo: string;
    syncStatus: "success" | "partial" | "error" | "skipped";
    message: string;
    fixturesUpserted?: number;
    competitionsUpserted?: number;
    teamsUpserted?: number;
    venuesUpserted?: number;
    errorPayload?: Record<string, unknown>;
  }
) {
  const result = await supabase.from("fixture_sync_logs").insert({
    provider: input.provider,
    sport_type: input.sportType,
    country_name: input.countryName,
    competition_id: input.competitionId ?? null,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    sync_status: input.syncStatus,
    message: input.message,
    fixtures_upserted: input.fixturesUpserted ?? 0,
    competitions_upserted: input.competitionsUpserted ?? 0,
    teams_upserted: input.teamsUpserted ?? 0,
    venues_upserted: input.venuesUpserted ?? 0,
    error_payload: input.errorPayload ?? {},
  });

  if (result.error && !isOptionalSyncLogTableError(result.error.message)) {
    throw new Error(`No se pudo guardar el log de sincronizacion. ${result.error.message}`);
  }
}

function isRecentSuccessfulLog(value: string | null | undefined) {
  const normalized = normalizeSportsText(value);
  if (!normalized) return false;

  const createdAt = new Date(normalized);
  if (!Number.isFinite(createdAt.getTime())) return false;

  const ageMs = Date.now() - createdAt.getTime();
  return ageMs < syncCooldownMinutes * 60 * 1000;
}

function isOptionalSyncLogTableError(message: string | null | undefined) {
  const normalized = normalizeSportsText(message)?.toLowerCase() ?? "";
  return (
    normalized.includes("fixture_sync_logs") &&
    (normalized.includes("schema cache") || normalized.includes("does not exist"))
  );
}

function describeSyncError(error: unknown) {
  if (error instanceof SportsProviderConfigError) {
    return error.message;
  }

  if (error instanceof SportsProviderRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return `No pudimos actualizar el listado automatico en este momento. ${error.message}`;
  }

  return "No pudimos actualizar el listado automatico en este momento.";
}

function throwIfError(
  error: { message?: string | null } | null,
  message: string
): asserts error is null {
  if (!error) return;
  throw new Error(`${message} ${error.message ?? ""}`.trim());
}
