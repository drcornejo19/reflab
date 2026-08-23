import "server-only";

import {
  IdentityLinkRequiredError,
  loadCanonicalAccessSnapshot,
  resolveCanonicalAccessUserId,
} from "@/lib/access/server";
import {
  appointmentSourceLabels,
  appointmentStatusLabels,
  fixtureStatusLabels,
} from "@/lib/matches/config";
import type {
  AppointmentRecord,
  AppointmentStatus,
  CompetitionCategoryRecord,
  CompetitionRecord,
  CompetitionSeasonRecord,
  CountryRecord,
  FixtureRecord,
  MatchContextSnapshotRecord,
  MatchOfficialRecord,
  MatchPreparationRecord,
  PostMatchReviewRecord,
  RefereeEligibilityRecord,
  RefereeRoleKey,
  RefereeRoleRecord,
  TeamRecord,
  VenueRecord,
  AssociationRecord,
} from "@/lib/matches/types";
import type {
  AppointmentUpdatePayload,
  FixtureAppointmentPayload,
  InstitutionMemberOption,
  ManualAppointmentPayload,
  MatchActorContext,
  MatchAppointmentDetail,
  MatchAppointmentListItem,
  MatchFixtureListItem,
  MatchPreparationPayload,
  MatchRecommendedPlan,
  MatchesCatalogResponse,
  PostMatchReviewPayload,
} from "@/lib/matches/api";
import { MatchesAccessError } from "@/lib/matches/access";
import { getSportDefinition, normalizeSportType, type SportType } from "@/lib/sports";
import type { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type SupabaseAnyClient = ReturnType<typeof createSupabaseAdminClient>;

type UserProfileRow = {
  user_id?: string | null;
  reflab_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  country?: string | null;
  association?: string | null;
  category?: string | null;
  main_role?: string | null;
  referee_type?: string | null;
  ref_card_id?: string | null;
  institution_id?: string | null;
};

type InstitutionRow = {
  id?: string | null;
  name?: string | null;
};

type Scope = "self" | "institution" | "admin";

type RefPerformanceMiniRow = {
  appointment_id?: string | null;
  readiness_score?: number | null;
  created_at?: string | null;
};

type PsychologyMiniRow = {
  appointment_id?: string | null;
  mental_score?: number | null;
  created_at?: string | null;
};

type MatchesCatalogFilters = {
  sportType?: SportType | null;
  countryId?: string | null;
  associationId?: string | null;
  competitionId?: string | null;
  categoryId?: string | null;
  seasonId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export class MatchesConflictError extends Error {
  constructor(
    message: string,
    public readonly conflict: {
      appointmentId: string;
      matchLabel: string;
      kickoffAt: string;
      roleLabel: string;
    }
  ) {
    super(message);
    this.name = "MatchesConflictError";
  }
}

export function isMatchesConflictError(error: unknown): error is MatchesConflictError {
  return error instanceof MatchesConflictError;
}

const activeAppointmentStatusesForConflicts: AppointmentStatus[] = [
  "draft",
  "pending_confirmation",
  "confirmed",
  "modified",
];

const matchesFoundationMigrationId = "202607130001_matches_foundation.sql";

const matchesFoundationTables = new Set([
  "countries",
  "associations",
  "competitions",
  "competition_seasons",
  "competition_categories",
  "teams",
  "venues",
  "referee_roles",
  "fixtures",
  "referee_eligibility",
  "appointments",
  "appointment_history",
  "match_officials",
  "match_context_snapshots",
  "match_preparations",
  "post_match_reviews",
]);

export type MatchesSetupIssue = {
  missingTables: string[];
  migrationId: string;
};

export function getMatchesSetupIssue(error: unknown): MatchesSetupIssue | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!message.toLowerCase().includes("schema cache")) {
    return null;
  }

  const missingTables = Array.from(
    new Set(
      Array.from(message.matchAll(/public\.([a-z_]+)/g))
        .map((match) => match[1])
        .filter((tableName) => matchesFoundationTables.has(tableName))
    )
  );

  if (!missingTables.length) {
    return null;
  }

  return {
    missingTables,
    migrationId: matchesFoundationMigrationId,
  };
}

export async function loadMatchesCatalog(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  filters: MatchesCatalogFilters = {}
): Promise<MatchesCatalogResponse> {
  const [
    countriesRes,
    associationsRes,
    competitionsRes,
    seasonsRes,
    categoriesRes,
    rolesRes,
    eligibilitiesRes,
    institutionMembers,
    fixtures,
  ] = await Promise.all([
    supabase.from("countries").select("*").order("name"),
    supabase.from("associations").select("*").order("name"),
    supabase.from("competitions").select("*").order("name"),
    supabase.from("competition_seasons").select("*").order("label", { ascending: false }),
    supabase.from("competition_categories").select("*").order("name"),
    supabase.from("referee_roles").select("*").eq("is_active", true).order("display_order"),
    supabase
      .from("referee_eligibility")
      .select("*")
      .eq("user_id", actor.userId)
      .eq("is_active", true),
    actor.canManageInstitution && actor.institutionId
      ? loadInstitutionMembers(supabase, actor.institutionId)
      : Promise.resolve([] as InstitutionMemberOption[]),
    listSelectableFixtures(supabase, filters),
  ]);

  throwIfError(countriesRes.error, "No se pudieron cargar los paises.");
  throwIfError(associationsRes.error, "No se pudieron cargar las asociaciones.");
  throwIfError(competitionsRes.error, "No se pudieron cargar las competiciones.");
  throwIfError(seasonsRes.error, "No se pudieron cargar las temporadas.");
  throwIfError(categoriesRes.error, "No se pudieron cargar las categorias.");
  throwIfError(rolesRes.error, "No se pudieron cargar los roles arbitrales.");
  throwIfError(
    eligibilitiesRes.error,
    "No se pudo cargar la matriz de elegibilidad."
  );

  const eligibilities = (eligibilitiesRes.data ?? []) as RefereeEligibilityRecord[];

  return {
    actor,
    countries: (countriesRes.data ?? []) as CountryRecord[],
    associations: (associationsRes.data ?? []) as AssociationRecord[],
    competitions: (competitionsRes.data ?? []) as CompetitionRecord[],
    seasons: (seasonsRes.data ?? []) as CompetitionSeasonRecord[],
    categories: (categoriesRes.data ?? []) as CompetitionCategoryRecord[],
    roles: (rolesRes.data ?? []) as RefereeRoleRecord[],
    eligibilities,
    institutionMembers,
    fixtures,
    supportsInstitutionAssignments: actor.canManageInstitution,
    fallbackMode: eligibilities.length > 0 ? "eligibility_matrix" : "manual_assisted",
  };
}

async function listSelectableFixtures(
  supabase: SupabaseAnyClient,
  filters: MatchesCatalogFilters
): Promise<MatchFixtureListItem[]> {
  let query = supabase
    .from("fixtures")
    .select("*")
    .order("kickoff_at", { ascending: true })
    .limit(240);

  if (filters.sportType) {
    query = query.eq("sport_type", filters.sportType);
  }
  if (filters.countryId) {
    query = query.eq("country_id", filters.countryId);
  }
  if (filters.associationId) {
    query = query.eq("association_id", filters.associationId);
  }
  if (filters.competitionId) {
    query = query.eq("competition_id", filters.competitionId);
  }
  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }
  if (filters.seasonId) {
    query = query.eq("season_id", filters.seasonId);
  }
  if (filters.dateFrom) {
    query = query.gte("kickoff_at", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lt("kickoff_at", filters.dateTo);
  }

  const fixturesRes = await query;
  throwIfError(fixturesRes.error, "No se pudieron cargar los partidos disponibles.");

  const fixtures = (fixturesRes.data ?? []) as FixtureRecord[];
  if (!fixtures.length) return [];

  const competitionIds = uniqueIds(fixtures.map((item) => item.competition_id));
  const seasonIds = uniqueIds(fixtures.map((item) => item.season_id));
  const categoryIds = uniqueIds(fixtures.map((item) => item.category_id));
  const associationIds = uniqueIds(fixtures.map((item) => item.association_id));
  const countryIds = uniqueIds(fixtures.map((item) => item.country_id));
  const teamIds = uniqueIds(
    fixtures.flatMap((item) => [item.home_team_id, item.away_team_id])
  );
  const venueIds = uniqueIds(fixtures.map((item) => item.venue_id));

  const [
    competitions,
    seasons,
    categories,
    associations,
    countries,
    teams,
    venues,
  ] = await Promise.all([
    getCompetitionsByIds(supabase, competitionIds),
    getSeasonsByIds(supabase, seasonIds),
    getCategoriesByIds(supabase, categoryIds),
    getAssociationsByIds(supabase, associationIds),
    getCountriesByIds(supabase, countryIds),
    getTeamsByIds(supabase, teamIds),
    getVenuesByIds(supabase, venueIds),
  ]);

  const competitionMap = indexById(competitions);
  const seasonMap = indexById(seasons);
  const categoryMap = indexById(categories);
  const associationMap = indexById(associations);
  const countryMap = indexById(countries);
  const teamMap = indexById(teams);
  const venueMap = indexById(venues);

  return fixtures.map((fixture) => {
    const status = fixture.status ?? "scheduled";
    const competition = fixture.competition_id
      ? competitionMap.get(fixture.competition_id) ?? null
      : null;
    const season = fixture.season_id ? seasonMap.get(fixture.season_id) ?? null : null;
    const category = fixture.category_id
      ? categoryMap.get(fixture.category_id) ?? null
      : null;
    const association = fixture.association_id
      ? associationMap.get(fixture.association_id) ?? null
      : null;
    const country = fixture.country_id
      ? countryMap.get(fixture.country_id) ?? null
      : null;
    const homeTeam = fixture.home_team_id
      ? teamMap.get(fixture.home_team_id) ?? null
      : null;
    const awayTeam = fixture.away_team_id
      ? teamMap.get(fixture.away_team_id) ?? null
      : null;
    const venue = fixture.venue_id ? venueMap.get(fixture.venue_id) ?? null : null;

    return {
      fixtureId: fixture.id,
      sportType: fixture.sport_type,
      status,
      statusLabel: fixtureStatusLabels[status],
      kickoffAt: fixture.kickoff_at,
      roundLabel:
        textOrNull(fixture.round_label) ??
        (fixture.matchday_number ? `Fecha ${fixture.matchday_number}` : null),
      matchdayNumber: fixture.matchday_number ?? null,
      refereeSystem: textOrNull(fixture.referee_system),
      varEnabled: Boolean(fixture.var_enabled),
      dataSource: fixture.data_source ?? null,
      competitionId: competition?.id ?? null,
      competitionName: competition?.name ?? null,
      seasonId: season?.id ?? null,
      seasonLabel: season?.label ?? null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      associationId: association?.id ?? null,
      associationName: association?.name ?? null,
      countryId: country?.id ?? null,
      countryName: country?.name ?? null,
      homeTeamId: homeTeam?.id ?? null,
      homeTeamName: homeTeam?.name ?? "Local",
      awayTeamId: awayTeam?.id ?? null,
      awayTeamName: awayTeam?.name ?? "Visitante",
      venueId: venue?.id ?? null,
      venueName: venue?.name ?? null,
      venueCity: venue?.city ?? null,
    };
  });
}

export async function listAppointmentsForActor(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  scope: Scope = "self"
): Promise<MatchAppointmentListItem[]> {
  const targetScope = resolveScope(actor, scope);
  let query = supabase
    .from("appointments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(targetScope === "admin" ? 120 : 80);

  if (targetScope === "self") {
    query = query.eq("user_id", actor.userId);
  } else if (targetScope === "institution" && actor.institutionId) {
    query = query.eq("institution_id", actor.institutionId);
  }

  const appointmentsRes = await query;
  throwIfError(appointmentsRes.error, "No se pudieron cargar las designaciones.");

  const appointments = (appointmentsRes.data ?? []) as AppointmentRecord[];
  if (!appointments.length) return [];

  const fixtureIds = uniqueIds(appointments.map((item) => item.fixture_id));
  const roleIds = uniqueIds(appointments.map((item) => item.role_id));
  const userIds = uniqueIds(appointments.map((item) => item.user_id));
  const institutionIds = uniqueIds(appointments.map((item) => item.institution_id));

  const [
    fixtures,
    roles,
    profiles,
    institutions,
    preparations,
    reviews,
    performanceCheckins,
    psychologyCheckins,
  ] = await Promise.all([
    getFixturesByIds(supabase, fixtureIds),
    getRolesByIds(supabase, roleIds),
    getProfilesByUserIds(supabase, userIds),
    getInstitutionsByIds(supabase, institutionIds),
    getPreparationsByAppointmentIds(supabase, appointments.map((item) => item.id)),
    getReviewsByAppointmentIds(supabase, appointments.map((item) => item.id)),
    getPerformanceCheckinsByAppointmentIds(supabase, appointments.map((item) => item.id)),
    getPsychologyCheckinsByAppointmentIds(supabase, appointments.map((item) => item.id)),
  ]);

  const fixtureMap = indexById(fixtures);
  const roleMap = indexById(roles);
  const profileMap = new Map(profiles.map((item) => [item.userId, item]));
  const institutionMap = new Map(institutions.map((item) => [item.id, item]));
  const preparationsByAppointment = countBy(preparations, "appointment_id");
  const reviewsByAppointment = new Set(reviews.map((item) => item.appointment_id));
  const performanceByAppointment = countBy(performanceCheckins, "appointment_id");
  const psychologyByAppointment = countBy(psychologyCheckins, "appointment_id");

  const relatedCompetitionIds = uniqueIds(fixtures.map((item) => item.competition_id));
  const relatedCategoryIds = uniqueIds(fixtures.map((item) => item.category_id));
  const relatedSeasonIds = uniqueIds(fixtures.map((item) => item.season_id));
  const relatedAssociationIds = uniqueIds(fixtures.map((item) => item.association_id));
  const relatedCountryIds = uniqueIds(fixtures.map((item) => item.country_id));
  const relatedTeamIds = uniqueIds(
    fixtures.flatMap((item) => [item.home_team_id, item.away_team_id])
  );
  const relatedVenueIds = uniqueIds(fixtures.map((item) => item.venue_id));

  const [
    competitions,
    categories,
    seasons,
    associations,
    countries,
    teams,
    venues,
  ] = await Promise.all([
    getCompetitionsByIds(supabase, relatedCompetitionIds),
    getCategoriesByIds(supabase, relatedCategoryIds),
    getSeasonsByIds(supabase, relatedSeasonIds),
    getAssociationsByIds(supabase, relatedAssociationIds),
    getCountriesByIds(supabase, relatedCountryIds),
    getTeamsByIds(supabase, relatedTeamIds),
    getVenuesByIds(supabase, relatedVenueIds),
  ]);

  const competitionMap = indexById(competitions);
  const categoryMap = indexById(categories);
  const seasonMap = indexById(seasons);
  const associationMap = indexById(associations);
  const countryMap = indexById(countries);
  const teamMap = indexById(teams);
  const venueMap = indexById(venues);

  return appointments.map((appointment) => {
    const fixture = fixtureMap.get(appointment.fixture_id) ?? null;
    const role = roleMap.get(appointment.role_id) ?? null;
    const profile = profileMap.get(appointment.user_id) ?? null;
    const competition = fixture?.competition_id
      ? competitionMap.get(fixture.competition_id) ?? null
      : null;
    const category = fixture?.category_id
      ? categoryMap.get(fixture.category_id) ?? null
      : null;
    const season = fixture?.season_id ? seasonMap.get(fixture.season_id) ?? null : null;
    const association = fixture?.association_id
      ? associationMap.get(fixture.association_id) ?? null
      : null;
    const country = fixture?.country_id
      ? countryMap.get(fixture.country_id) ?? null
      : null;
    const homeTeam = fixture?.home_team_id
      ? teamMap.get(fixture.home_team_id) ?? null
      : null;
    const awayTeam = fixture?.away_team_id
      ? teamMap.get(fixture.away_team_id) ?? null
      : null;
    const venue = fixture?.venue_id ? venueMap.get(fixture.venue_id) ?? null : null;
    const institutionName = appointment.institution_id
      ? institutionMap.get(appointment.institution_id) ?? null
      : null;
    const status = appointment.status ?? "draft";
    const sourceType = appointment.source_type ?? "manual";

    return {
      appointmentId: appointment.id,
      fixtureId: appointment.fixture_id,
      userId: appointment.user_id,
      userDisplayName: profile?.displayName ?? actor.profile.displayName,
      refCardId: profile?.refCardId ?? null,
      sportType: appointment.sport_type,
      status,
      statusLabel: appointmentStatusLabels[status],
      sourceType,
      sourceLabel: appointmentSourceLabels[sourceType],
      roleKey: (role?.role_key ?? "other") as RefereeRoleKey,
      roleLabel: role?.label ?? "Rol sin definir",
      kickoffAt: fixture?.kickoff_at ?? appointment.created_at ?? new Date().toISOString(),
      matchLabel: buildMatchLabel(homeTeam?.name, awayTeam?.name),
      competitionId: competition?.id ?? fixture?.competition_id ?? null,
      competitionName: competition?.name ?? null,
      categoryId: category?.id ?? fixture?.category_id ?? null,
      categoryName: category?.name ?? null,
      seasonId: season?.id ?? fixture?.season_id ?? null,
      seasonLabel: season?.label ?? null,
      associationId: association?.id ?? fixture?.association_id ?? null,
      associationName: association?.name ?? institutionName?.name ?? null,
      countryId: country?.id ?? fixture?.country_id ?? null,
      countryName: country?.name ?? null,
      venueName: venue?.name ?? null,
      venueCity: venue?.city ?? null,
      roundLabel: fixture?.round_label ?? null,
      refereeSystem: fixture?.referee_system ?? category?.referee_system ?? null,
      varEnabled: Boolean(fixture?.var_enabled),
      hasPreparations: (preparationsByAppointment.get(appointment.id) ?? 0) > 0,
      hasPostMatchReview: reviewsByAppointment.has(appointment.id),
      linkedPerformanceCount: performanceByAppointment.get(appointment.id) ?? 0,
      linkedPsychologyCount: psychologyByAppointment.get(appointment.id) ?? 0,
      observations: appointment.observations ?? null,
    };
  });
}

export async function createAppointment(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  payload: ManualAppointmentPayload
) {
  const sportType = normalizeSportType(payload.sportType);
  const sourceType = payload.sourceType === "institutional" ? "institutional" : "manual";
  const targetUserId = await resolveAppointmentTargetUserId(
    supabase,
    actor,
    sourceType,
    payload.membershipId
  );
  const status = payload.status ?? (sourceType === "institutional" ? "confirmed" : "pending_confirmation");
  const role = await getRoleBySportAndKey(supabase, sportType, payload.roleKey);

  if (!role) {
    throw new Error("La funcion arbitral seleccionada no existe para esa disciplina.");
  }

  if (sourceType === "institutional" && !actor.canManageInstitution) {
    throw new Error("Tu perfil no puede generar designaciones institucionales.");
  }

  const countryName = requiredText(payload.countryName, "Indica el pais.");
  const associationName = requiredText(payload.associationName, "Indica la asociacion.");
  const competitionName = requiredText(payload.competitionName, "Indica la competicion.");
  const categoryName = requiredText(payload.categoryName, "Indica la categoria.");
  const seasonLabel = requiredText(payload.seasonLabel, "Indica la temporada.");
  const homeTeamName = requiredText(payload.homeTeamName, "Indica el equipo local.");
  const awayTeamName = requiredText(payload.awayTeamName, "Indica el equipo visitante.");
  const kickoffAt = normalizeDateTime(payload.kickoffAt);

  if (homeTeamName.toLowerCase() === awayTeamName.toLowerCase()) {
    throw new Error("El equipo local y visitante no pueden ser iguales.");
  }

  const country = await resolveCountry(
    supabase,
    countryName,
    payload.countryCode ?? null
  );
  const association = await resolveAssociation(supabase, country.id, associationName);
  const competition = await resolveCompetition(
    supabase,
    association.id,
    sportType,
    competitionName
  );
  const season = await resolveSeason(supabase, competition.id, seasonLabel);
  const category = await resolveCategory(
    supabase,
    competition.id,
    season.id,
    sportType,
    categoryName,
    payload.refereeSystem ?? null,
    Boolean(payload.varEnabled)
  );

  await ensureNoActiveAppointmentOnSameDate(supabase, {
    userId: targetUserId,
    kickoffAt,
  });

  await validateEligibilityIfNeeded(
    supabase,
    targetUserId,
    sportType,
    role.id,
    competition.id,
    category.id
  );

  const homeTeam = await resolveTeam(
    supabase,
    sportType,
    country.id,
    association.id,
    homeTeamName
  );
  const awayTeam = await resolveTeam(
    supabase,
    sportType,
    country.id,
    association.id,
    awayTeamName
  );
  const venue = payload.venueName
    ? await resolveVenue(
        supabase,
        country.id,
        association.id,
        payload.venueName,
        payload.venueCity ?? null
      )
    : null;

  const fixtureStatus = normalizeFixtureStatusFromAppointment(status);
  const now = new Date().toISOString();
  const { data: fixtureData, error: fixtureError } = await supabase
    .from("fixtures")
    .insert({
      sport_type: sportType,
      country_id: country.id,
      association_id: association.id,
      competition_id: competition.id,
      season_id: season.id,
      category_id: category.id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      venue_id: venue?.id ?? null,
      kickoff_at: kickoffAt,
      round_label: textOrNull(payload.roundLabel),
      matchday_number: normalizePositiveInt(payload.matchdayNumber),
      status: fixtureStatus,
      referee_system:
        textOrNull(payload.refereeSystem) ??
        textOrNull(category.referee_system) ??
        null,
      var_enabled: Boolean(payload.varEnabled),
      data_source: sourceType === "institutional" ? "institutional" : "manual",
      provider: "manual_assisted",
      raw_source_reference: {
        provider: "manual_assisted",
        created_by: actor.userId,
      },
      notes: textOrNull(payload.observations),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  throwIfError(fixtureError, "No se pudo crear el partido.");

  const fixture = fixtureData as FixtureRecord;
  const { data: appointmentData, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      user_id: targetUserId,
      fixture_id: fixture.id,
      role_id: role.id,
      sport_type: sportType,
      competition_id: competition.id,
      association_id: association.id,
      institution_id: sourceType === "institutional" ? actor.institutionId : null,
      source_type: sourceType,
      status,
      created_by_user_id: actor.userId,
      confirmed_at: status === "confirmed" ? now : null,
      observations: textOrNull(payload.observations),
      metadata: {
        registration_mode:
          sourceType === "institutional" ? "institution_assignment" : "manual_assisted",
        actor_role: actor.role,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  throwIfError(appointmentError, "No se pudo crear la designacion.");

  const appointment = appointmentData as AppointmentRecord;

  const historyWrite = supabase.from("appointment_history").insert({
    appointment_id: appointment.id,
    user_id: targetUserId,
    changed_by_user_id: actor.userId,
    change_type: "created",
    to_status: status,
    reason:
      sourceType === "institutional"
        ? "Designacion confirmada por la institucion."
        : "Designacion registrada por el usuario.",
    snapshot: {
      match_label: buildMatchLabel(homeTeam.name, awayTeam.name),
      competition: competition.name,
      category: category.name,
      role: role.label,
    },
    created_at: now,
  });

  const officialWrite = supabase.from("match_officials").insert({
    fixture_id: fixture.id,
    role_id: role.id,
    appointment_id: appointment.id,
    user_id: targetUserId,
    official_name:
      targetUserId === actor.userId ? actor.profile.displayName : null,
    source_type: sourceType,
    status: status === "confirmed" ? "confirmed" : "assigned",
    is_primary_assignment: true,
    created_at: now,
    updated_at: now,
  });

  const [historyResult, officialResult] = await Promise.all([
    historyWrite,
    officialWrite,
  ]);

  throwIfError(historyResult.error, "No se pudo registrar el historial de la designacion.");
  throwIfError(officialResult.error, "No se pudo registrar el equipo arbitral.");

  return appointment;
}

export async function createAppointmentFromFixture(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  payload: FixtureAppointmentPayload
) {
  const sourceType = payload.sourceType === "institutional" ? "institutional" : "manual";
  const targetUserId = await resolveAppointmentTargetUserId(
    supabase,
    actor,
    sourceType,
    payload.membershipId
  );
  const status = payload.status ?? "confirmed";

  if (sourceType === "institutional" && !actor.canManageInstitution) {
    throw new Error("Tu perfil no puede generar designaciones institucionales.");
  }

  const fixtureId = requiredText(payload.fixtureId, "Selecciona un partido.");
  const fixture = await getFixtureById(supabase, fixtureId);
  if (!fixture) {
    throw new Error("El partido seleccionado no existe o ya no esta disponible.");
  }

  const role = await getRoleBySportAndKey(supabase, fixture.sport_type, payload.roleKey);
  if (!role) {
    throw new Error("La funcion arbitral seleccionada no existe para esa disciplina.");
  }

  if (role.requires_var && !fixture.var_enabled) {
    throw new Error("Ese partido no tiene VAR habilitado para la funcion elegida.");
  }

  await ensureNoActiveAppointmentOnSameDate(supabase, {
    userId: targetUserId,
    kickoffAt: fixture.kickoff_at,
    allowSameDateOverride: Boolean(payload.allowSameDateOverride),
  });

  await validateEligibilityIfNeeded(
    supabase,
    targetUserId,
    fixture.sport_type,
    role.id,
    fixture.competition_id ?? null,
    fixture.category_id ?? null
  );

  const now = new Date().toISOString();
  const homeTeam = fixture.home_team_id
    ? await getTeamById(supabase, fixture.home_team_id)
    : null;
  const awayTeam = fixture.away_team_id
    ? await getTeamById(supabase, fixture.away_team_id)
    : null;
  const competition = fixture.competition_id
    ? await getCompetitionById(supabase, fixture.competition_id)
    : null;
  const category = fixture.category_id
    ? await getCategoryById(supabase, fixture.category_id)
    : null;

  const { data: appointmentData, error: appointmentError } = await supabase
    .from("appointments")
    .insert({
      user_id: targetUserId,
      fixture_id: fixture.id,
      role_id: role.id,
      sport_type: fixture.sport_type,
      competition_id: fixture.competition_id ?? null,
      association_id: fixture.association_id ?? null,
      institution_id: sourceType === "institutional" ? actor.institutionId : null,
      source_type: sourceType,
      status,
      created_by_user_id: actor.userId,
      confirmed_at: status === "confirmed" ? now : null,
      observations: textOrNull(payload.observations),
      metadata: {
        registration_mode:
          sourceType === "institutional" ? "institution_fixture" : "fixture_selection",
        actor_role: actor.role,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  throwIfError(appointmentError, "No se pudo crear la designacion.");

  const appointment = appointmentData as AppointmentRecord;

  const historyWrite = supabase.from("appointment_history").insert({
    appointment_id: appointment.id,
    user_id: targetUserId,
    changed_by_user_id: actor.userId,
    change_type: "created",
    to_status: status,
    reason:
      sourceType === "institutional"
        ? "Designacion confirmada por la institucion."
        : "Designacion registrada por el usuario.",
    snapshot: {
      match_label: buildMatchLabel(homeTeam?.name, awayTeam?.name),
      competition: competition?.name ?? null,
      category: category?.name ?? null,
      role: role.label,
      fixture_id: fixture.id,
    },
    created_at: now,
  });

  const officialWrite = supabase.from("match_officials").insert({
    fixture_id: fixture.id,
    role_id: role.id,
    appointment_id: appointment.id,
    user_id: targetUserId,
    official_name:
      targetUserId === actor.userId ? actor.profile.displayName : null,
    source_type: sourceType,
    status: status === "confirmed" ? "confirmed" : "assigned",
    is_primary_assignment: true,
    created_at: now,
    updated_at: now,
  });

  const [historyResult, officialResult] = await Promise.all([
    historyWrite,
    officialWrite,
  ]);

  throwIfError(historyResult.error, "No se pudo registrar el historial de la designacion.");
  throwIfError(officialResult.error, "No se pudo registrar el equipo arbitral.");

  return appointment;
}

export async function getAppointmentDetail(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  appointmentId: string
): Promise<MatchAppointmentDetail> {
  const appointmentRes = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();

  throwIfError(appointmentRes.error, "No se pudo cargar la designacion.");

  const storedAppointment = (appointmentRes.data ?? null) as AppointmentRecord | null;
  if (!storedAppointment) {
    throw new Error("La designacion no existe.");
  }

  const appointment = await canonicalizeStoredAppointmentUser(
    supabase,
    storedAppointment
  );
  enforceAppointmentAccess(actor, appointment, "read");

  const [
    fixture,
    role,
    appointmentProfile,
    preparations,
    review,
    officials,
    contextSnapshots,
    performanceCheckins,
    performanceSessions,
    psychologyCheckins,
    psychologyExercises,
  ] = await Promise.all([
    getFixtureById(supabase, appointment.fixture_id),
    getRoleById(supabase, appointment.role_id),
    getProfileByUserId(supabase, appointment.user_id),
    getPreparationsByAppointmentId(supabase, appointment.id),
    getReviewByAppointmentId(supabase, appointment.id),
    getOfficialsByFixtureId(supabase, appointment.fixture_id),
    getContextSnapshotsByFixtureId(supabase, appointment.fixture_id),
    getPerformanceCheckinsByAppointmentId(supabase, appointment.id),
    getPerformanceSessionsByAppointmentId(supabase, appointment.id),
    getPsychologyCheckinsByAppointmentId(supabase, appointment.id),
    getPsychologyExercisesByAppointmentId(supabase, appointment.id),
  ]);

  if (!fixture) {
    throw new Error("La designacion existe pero el partido asociado no pudo cargarse.");
  }

  const [
    country,
    association,
    competition,
    season,
    category,
    homeTeam,
    awayTeam,
    venue,
  ] = await Promise.all([
    fixture.country_id ? getCountryById(supabase, fixture.country_id) : Promise.resolve(null),
    fixture.association_id
      ? getAssociationById(supabase, fixture.association_id)
      : Promise.resolve(null),
    fixture.competition_id
      ? getCompetitionById(supabase, fixture.competition_id)
      : Promise.resolve(null),
    fixture.season_id ? getSeasonById(supabase, fixture.season_id) : Promise.resolve(null),
    fixture.category_id
      ? getCategoryById(supabase, fixture.category_id)
      : Promise.resolve(null),
    fixture.home_team_id ? getTeamById(supabase, fixture.home_team_id) : Promise.resolve(null),
    fixture.away_team_id ? getTeamById(supabase, fixture.away_team_id) : Promise.resolve(null),
    fixture.venue_id ? getVenueById(supabase, fixture.venue_id) : Promise.resolve(null),
  ]);

  const roleMap = indexById(
    await getRolesByIds(supabase, uniqueIds(officials.map((item) => item.role_id)))
  );
  const officialProfiles = await getProfilesByUserIds(
    supabase,
    uniqueIds(officials.map((item) => item.user_id))
  );
  const officialProfileMap = new Map(officialProfiles.map((item) => [item.userId, item]));
  const isAppointmentOwner = actor.userId === appointment.user_id;
  const privacyAccess = isAppointmentOwner
    ? fullAppointmentPrivacyAccess()
    : await getInstitutionAppointmentPrivacyAccess(
        supabase,
        appointment.institution_id ?? null,
        appointment.user_id
      );
  const recommendedPlan = isAppointmentOwner
    ? await buildRecommendedPlan(
        supabase,
        appointment.user_id,
        appointment.sport_type,
        (role?.role_key ?? "other") as RefereeRoleKey
      )
    : emptyPlan(
        "El plan personalizado es privado y solo esta disponible para el arbitro."
      );

  return {
    actor,
    appointment,
    fixture,
    role,
    country,
    association,
    competition,
    season,
    category,
    homeTeam,
    awayTeam,
    venue,
    appointmentUser: {
      userId: appointment.user_id,
      displayName: appointmentProfile?.displayName ?? "Arbitro RefLab",
      refCardId: appointmentProfile?.refCardId ?? null,
    },
    officials: officials.map((item) => {
      const officialProfile = item.user_id
        ? officialProfileMap.get(item.user_id) ?? null
        : null;

      return {
        ...item,
        role: roleMap.get(item.role_id) ?? null,
        displayName: officialProfile?.displayName ?? textOrNull(item.official_name),
        refCardId: officialProfile?.refCardId ?? null,
      };
    }),
    contextSnapshots,
    preparations,
    postMatchReview: review,
    relatedActivity: {
      performanceCheckins: privacyAccess.readinessSummary
        ? performanceCheckins.length
        : 0,
      performanceSessions: privacyAccess.physicalLoad
        ? performanceSessions.length
        : 0,
      psychologyCheckins: privacyAccess.psychologyCompliance
        ? psychologyCheckins.length
        : 0,
      psychologyExercises: privacyAccess.psychologyCompliance
        ? psychologyExercises.length
        : 0,
      latestReadinessScore:
        privacyAccess.readinessSummary
          ? performanceCheckins[0]?.readiness_score ?? null
          : null,
      latestMentalScore:
        privacyAccess.psychologyDetail
          ? psychologyCheckins[0]?.mental_score ?? null
          : null,
    },
    recommendedPlan,
    canManageInstitutionally:
      actor.canManageInstitution &&
      appointment.institution_id !== null &&
      appointment.institution_id === actor.institutionId,
  };
}

export async function updateAppointment(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  appointmentId: string,
  payload: AppointmentUpdatePayload
) {
  const appointmentRes = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();

  throwIfError(appointmentRes.error, "No se pudo cargar la designacion.");
  const storedAppointment = (appointmentRes.data ?? null) as AppointmentRecord | null;
  if (!storedAppointment) {
    throw new Error("La designacion no existe.");
  }

  const appointment = await canonicalizeStoredAppointmentUser(
    supabase,
    storedAppointment
  );
  enforceAppointmentAccess(actor, appointment, "manage");

  const patch: Record<string, unknown> = {};
  const roleId =
    payload.roleKey && payload.roleKey !== "other"
      ? await getRoleBySportAndKey(supabase, appointment.sport_type, payload.roleKey)
      : payload.roleKey === "other"
        ? await getRoleBySportAndKey(supabase, appointment.sport_type, "other")
        : null;

  if (roleId) {
    patch.role_id = roleId.id;
  }

  const nextStatus = payload.status ?? appointment.status ?? "draft";
  if (payload.status) {
    patch.status = payload.status;
    if (payload.status === "confirmed" && !appointment.confirmed_at) {
      patch.confirmed_at = new Date().toISOString();
    }
  }

  if (payload.observations !== undefined) {
    patch.observations = textOrNull(payload.observations);
  }

  if (!Object.keys(patch).length) {
    return appointment;
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("appointments")
    .update(patch)
    .eq("id", appointmentId)
    .select("*")
    .single();

  throwIfError(error, "No se pudo actualizar la designacion.");

  const updatedAppointment = data as AppointmentRecord;
  if (payload.roleKey || payload.status) {
    const officialPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (roleId) {
      officialPatch.role_id = roleId.id;
    }

    if (payload.status) {
      officialPatch.status =
        payload.status === "confirmed"
          ? "confirmed"
          : payload.status === "replaced"
            ? "replaced"
            : payload.status === "cancelled" ||
                payload.status === "suspended" ||
                payload.status === "postponed"
              ? "removed"
              : "assigned";
    }

    const { error: officialUpdateError } = await supabase
      .from("match_officials")
      .update(officialPatch)
      .eq("appointment_id", appointmentId);

    throwIfError(
      officialUpdateError,
      "No se pudo sincronizar el equipo arbitral de la designacion."
    );
  }

  await registerAppointmentHistory(supabase, {
    appointmentId,
    userId: appointment.user_id,
    changedByUserId: actor.userId,
    changeType:
      payload.status && payload.status !== appointment.status
        ? "status_changed"
        : payload.roleKey
          ? "role_changed"
          : "note_updated",
    fromStatus: appointment.status ?? null,
    toStatus: nextStatus,
    reason:
      payload.status && payload.status !== appointment.status
        ? `Estado actualizado a ${appointmentStatusLabels[nextStatus]}.`
        : payload.roleKey
          ? "Rol arbitral actualizado."
          : "Observaciones actualizadas.",
    snapshot: patch,
  });

  return updatedAppointment;
}

export async function saveMatchPreparation(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  appointmentId: string,
  payload: MatchPreparationPayload
) {
  const appointment = await requireOwnedOrInstitutionAppointment(
    supabase,
    actor,
    appointmentId
  );
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("match_preparations")
    .upsert(
      {
        appointment_id: appointment.id,
        user_id: appointment.user_id,
        sport_type: appointment.sport_type,
        stage: payload.stage,
        status: payload.status ?? "completed",
        technical_focus: textOrNull(payload.technicalFocus),
        physical_focus: textOrNull(payload.physicalFocus),
        communication_focus: textOrNull(payload.communicationFocus),
        psychological_focus: textOrNull(payload.psychologicalFocus),
        checklist: normalizeStringArray(payload.checklist),
        answers: normalizeObject(payload.answers),
        notes: textOrNull(payload.notes),
        updated_at: now,
      },
      {
        onConflict: "appointment_id,stage",
      }
    )
    .select("*")
    .single();

  throwIfError(error, "No se pudo guardar la preparacion del partido.");
  return data as MatchPreparationRecord;
}

export async function savePostMatchReview(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  appointmentId: string,
  payload: PostMatchReviewPayload
) {
  const appointment = await requireOwnedOrInstitutionAppointment(
    supabase,
    actor,
    appointmentId
  );
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("post_match_reviews")
    .upsert(
      {
        appointment_id: appointment.id,
        user_id: appointment.user_id,
        sport_type: appointment.sport_type,
        result_summary: textOrNull(payload.resultSummary),
        minutes_played: normalizePositiveInt(payload.minutesPlayed),
        incidents: normalizeStringArray(payload.incidents),
        key_decisions: normalizeStringArray(payload.keyDecisions),
        perceived_load: clampScale(payload.perceivedLoad),
        fatigue_score: clampScale(payload.fatigueScore),
        soreness: textOrNull(payload.soreness),
        emotional_state: textOrNull(payload.emotionalState),
        strengths: normalizeStringArray(payload.strengths),
        perceived_errors: normalizeStringArray(payload.perceivedErrors),
        situations_to_review: normalizeStringArray(payload.situationsToReview),
        notes: textOrNull(payload.notes),
        closure_text: textOrNull(payload.closureText),
        updated_at: now,
      },
      {
        onConflict: "appointment_id",
      }
    )
    .select("*")
    .single();

  throwIfError(error, "No se pudo guardar el cierre post partido.");

  if ((appointment.status ?? "draft") !== "completed") {
    await supabase
      .from("appointments")
      .update({ status: "completed", updated_at: now })
      .eq("id", appointment.id);

    await registerAppointmentHistory(supabase, {
      appointmentId: appointment.id,
      userId: appointment.user_id,
      changedByUserId: actor.userId,
      changeType: "status_changed",
      fromStatus: appointment.status ?? null,
      toStatus: "completed",
      reason: "Se registro el cierre post partido.",
      snapshot: {
        result_summary: textOrNull(payload.resultSummary),
      },
    });
  }

  return data as PostMatchReviewRecord;
}

async function requireOwnedOrInstitutionAppointment(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  appointmentId: string
) {
  const appointmentRes = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();

  throwIfError(appointmentRes.error, "No se pudo cargar la designacion.");
  const storedAppointment = (appointmentRes.data ?? null) as AppointmentRecord | null;

  if (!storedAppointment) {
    throw new Error("La designacion no existe.");
  }

  const appointment = await canonicalizeStoredAppointmentUser(
    supabase,
    storedAppointment
  );
  enforceAppointmentAccess(actor, appointment, "manage");
  return appointment;
}

function enforceAppointmentAccess(
  actor: MatchActorContext,
  appointment: AppointmentRecord,
  permission: "read" | "manage"
) {
  if (appointment.user_id === actor.userId) return;
  if (
    actor.isSuperAdmin ||
    ((permission === "read"
      ? actor.canReadInstitution
      : actor.canManageInstitution) &&
      actor.institutionId &&
      appointment.institution_id === actor.institutionId)
  ) {
    return;
  }

  throw new Error("No tienes permisos para acceder a esta designacion.");
}

function resolveScope(actor: MatchActorContext, requestedScope: Scope) {
  if (requestedScope === "admin" && actor.isSuperAdmin) return "admin" as const;
  if (requestedScope === "institution" && actor.canReadInstitution) {
    return "institution" as const;
  }
  return "self" as const;
}

async function resolveAppointmentTargetUserId(
  supabase: SupabaseAnyClient,
  actor: MatchActorContext,
  sourceType: "manual" | "institutional",
  membershipId?: string | null
) {
  if (sourceType === "manual") return actor.userId;
  if (!actor.canManageInstitution || !actor.institutionId) {
    throw new MatchesAccessError("matches_manage_forbidden", 403);
  }

  const normalizedMembershipId = textOrNull(membershipId);
  if (!normalizedMembershipId) {
    throw new MatchesAccessError("membership_required", 403);
  }

  const membershipResult = await supabase
    .from("institution_memberships")
    .select("id,institution_id,user_id,status")
    .eq("id", normalizedMembershipId)
    .eq("institution_id", actor.institutionId)
    .eq("status", "active")
    .maybeSingle();

  throwIfError(
    membershipResult.error,
    "No se pudo validar la membresia institucional."
  );

  const targetUserId = textOrNull(membershipResult.data?.user_id);
  if (!targetUserId) {
    throw new MatchesAccessError("membership_forbidden", 403);
  }

  try {
    const targetAccess = await loadCanonicalAccessSnapshot(
      supabase,
      targetUserId,
      { provisionMissing: false }
    );
    return targetAccess.userId;
  } catch {
    throw new MatchesAccessError("canonical_target_required", 409);
  }
}

async function canonicalizeStoredAppointmentUser(
  supabase: SupabaseAnyClient,
  appointment: AppointmentRecord
) {
  const storedUserId = requiredText(
    appointment.user_id,
    "La designacion no tiene una identidad valida."
  );

  try {
    const canonicalUserId = await resolveCanonicalAccessUserId(
      supabase,
      storedUserId,
      { provisionMissing: false }
    );
    await loadCanonicalAccessSnapshot(supabase, canonicalUserId, {
      provisionMissing: false,
    });
    return { ...appointment, user_id: canonicalUserId };
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      throw new MatchesAccessError("matches_legacy_identity_unresolved", 409);
    }
    throw error;
  }
}

async function validateEligibilityIfNeeded(
  supabase: SupabaseAnyClient,
  userId: string,
  sportType: SportType,
  roleId: string,
  competitionId: string | null,
  categoryId: string | null
) {
  const eligibilityRes = await supabase
    .from("referee_eligibility")
    .select("*")
    .eq("user_id", userId)
    .eq("sport_type", sportType)
    .eq("is_active", true);

  throwIfError(
    eligibilityRes.error,
    "No se pudo validar la matriz de elegibilidad."
  );

  const eligibilityRows = (eligibilityRes.data ?? []) as RefereeEligibilityRecord[];
  if (!eligibilityRows.length) return;

  const directMatch = eligibilityRows.find(
    (item) =>
      item.role_id === roleId &&
      (item.competition_id === null || item.competition_id === competitionId) &&
      (item.category_id === null || item.category_id === categoryId)
  );

  if (!directMatch || directMatch.eligibility_mode !== "eligible") {
    throw new Error(
      "La funcion o categoria seleccionada no esta habilitada en la matriz de elegibilidad."
    );
  }
}

async function buildRecommendedPlan(
  supabase: SupabaseAnyClient,
  userId: string,
  sportType: SportType,
  roleKey: RefereeRoleKey
): Promise<MatchRecommendedPlan> {
  const officialResultsRes = await supabase
    .from("exam_results")
    .select("id")
    .eq("user_id", userId)
    .eq("sport_type", sportType);

  if (officialResultsRes.error) {
    return emptyPlan(
      "No hay informacion suficiente para generar un plan personalizado."
    );
  }

  const officialResultIds = uniqueIds(
    (officialResultsRes.data ?? []).map((item: { id?: string | null }) => item.id)
  );
  const officialAttemptsQuery = supabase
    .from("attempts")
    .select(
      "topic,score,technical_correct,restart_correct,discipline_correct,disciplinary_correct,created_at,sport_type,exam_result_id"
    )
    .eq("user_id", userId)
    .eq("sport_type", sportType)
    .not("exam_result_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);

  const [attemptsRes, performanceRes, psychologyRes] = await Promise.all([
    officialResultIds.length
      ? officialAttemptsQuery.in("exam_result_id", officialResultIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("performance_checkins")
      .select("readiness_score,fatigue,sleep_hours,created_at,sport_type")
      .eq("user_id", userId)
      .eq("sport_type", sportType)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("psychology_checkins")
      .select(
        "mental_score,confidence_score,pressure_score,concentration_score,created_at,sport_type"
      )
      .eq("user_id", userId)
      .eq("sport_type", sportType)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (attemptsRes.error || performanceRes.error || psychologyRes.error) {
    return emptyPlan(
      "No hay informacion suficiente para generar un plan personalizado."
    );
  }

  const attempts = (attemptsRes.data ?? []) as Array<{
    topic?: string | null;
    score?: number | null;
    technical_correct?: boolean | null;
    restart_correct?: boolean | null;
    discipline_correct?: boolean | null;
    disciplinary_correct?: boolean | null;
  }>;
  const performanceRows = (performanceRes.data ?? []) as Array<{
    readiness_score?: number | null;
    fatigue?: number | null;
    sleep_hours?: number | null;
  }>;
  const psychologyRows = (psychologyRes.data ?? []) as Array<{
    mental_score?: number | null;
    confidence_score?: number | null;
    pressure_score?: number | null;
    concentration_score?: number | null;
  }>;

  const evidence: string[] = [];
  const suggestedContent: string[] = [];
  const checklist: string[] = [];
  const reminders: string[] = [];
  const objectives: string[] = [];

  let focusTechnical: string | null = null;
  let focusCommunication: string | null = null;
  let focusPhysical: string | null = null;
  let focusPsychological: string | null = null;

  const weakestTopic = calculateWeakestTopic(attempts);
  if (weakestTopic) {
    focusTechnical = `Prioriza ${weakestTopic.topic}: ${weakestTopic.average}% en ${weakestTopic.count} intentos reales.`;
    evidence.push(
      `Topico con menor precision: ${weakestTopic.topic} (${weakestTopic.average}% en ${weakestTopic.count} intentos).`
    );
    suggestedContent.push(getSuggestedContentForRole(roleKey, weakestTopic.topic, sportType));
    objectives.push(`Entrar al partido con un criterio claro para ${weakestTopic.topic}.`);
  }

  const weakestCriterion = calculateWeakestCriterion(attempts);
  if (weakestCriterion) {
    const label =
      weakestCriterion.key === "technical"
        ? "decision tecnica"
        : weakestCriterion.key === "restart"
          ? "reanudacion"
          : "disciplina";
    evidence.push(
      `Criterio mas inestable: ${label} (${weakestCriterion.accuracy}% de acierto).`
    );
    if (!focusTechnical) {
      focusTechnical = `Necesitas ordenar ${label} antes del partido.`;
    }
    checklist.push(`Revisar un bloque corto de ${label} antes del encuentro.`);
  }

  const latestPerformance = performanceRows[0] ?? null;
  if (latestPerformance?.readiness_score !== null && latestPerformance?.readiness_score !== undefined) {
    evidence.push(`Ultimo readiness registrado: ${latestPerformance.readiness_score}%.`);

    if ((latestPerformance.readiness_score ?? 0) < 60) {
      focusPhysical =
        "Llegas con readiness bajo. Prioriza descarga, hidratacion y activacion simple.";
      reminders.push("Evita agregar carga fisica extra el mismo dia del partido.");
    } else if ((latestPerformance.fatigue ?? 0) >= 7) {
      focusPhysical =
        "La fatiga reciente es alta. Manten la entrada en calor medida y controla la recuperacion.";
      reminders.push("Controla descanso y molestias antes de salir.");
    } else {
      focusPhysical =
        "Base fisica estable. Mantene una activacion progresiva y rutina habitual.";
    }
  }

  const latestPsychology = psychologyRows[0] ?? null;
  if (latestPsychology?.mental_score !== null && latestPsychology?.mental_score !== undefined) {
    evidence.push(`Ultimo score mental registrado: ${latestPsychology.mental_score}/100.`);
    if ((latestPsychology.pressure_score ?? 0) >= 7) {
      focusPsychological =
        "Hay presion subjetiva alta. Lleva una consigna breve de foco y reinicio.";
      checklist.push("Definir frase de reinicio para protestas o error percibido.");
    } else if ((latestPsychology.confidence_score ?? 0) <= 5) {
      focusPsychological =
        "La confianza reciente esta baja. Apoyate en objetivos de proceso y primera decision simple.";
    } else {
      focusPsychological =
        "Mentalmente llegas estable. Conserva foco en la siguiente accion y comunica claro.";
    }
  }

  if (roleKey === "fourth_official" || roleKey === "third_referee" || roleKey === "timekeeper") {
    focusCommunication =
      "Pon el acento en coordinacion operativa, mensajes breves y seguimiento del procedimiento.";
    suggestedContent.push(
      roleKey === "timekeeper"
        ? "Repasar control de tiempo, sustituciones y procedimiento operativo."
        : "Repasar protestas, manejo del banco y coordinacion con el equipo arbitral."
    );
  } else if (roleKey === "assistant_1" || roleKey === "assistant_2" || roleKey === "reserve_assistant") {
    focusCommunication =
      "Refuerza comunicacion preventiva, apoyo en decisiones criticas y consistencia con el arbitro.";
  } else {
    focusCommunication =
      "Planifica una comunicacion corta, firme y estable para los primeros minutos.";
  }

  if (!evidence.length) {
    return emptyPlan(
      "No hay informacion suficiente para generar un plan personalizado."
    );
  }

  if (!checklist.length) {
    checklist.push("Confirmar horario, uniforme, tarjetas, silbato y traslado.");
  }
  if (!reminders.length) {
    reminders.push("Registrar check-in previo y cierre post partido para mantener trazabilidad.");
  }
  if (!objectives.length) {
    objectives.push("Entrar al partido con foco en la primera decision observable.");
  }

  return {
    dataAvailable: true,
    title: `Plan recomendado para este partido de ${getSportDefinition(sportType).label}`,
    message:
      "El plan se genero con datos reales de rendimiento, readiness y psicologia ya registrados en RefLab.",
    focusTechnical,
    focusCommunication,
    focusPhysical,
    focusPsychological,
    suggestedContent: uniqueStrings(suggestedContent),
    checklist: uniqueStrings(checklist),
    reminders: uniqueStrings(reminders),
    objectives: uniqueStrings(objectives),
    evidence,
  };
}

function emptyPlan(message: string): MatchRecommendedPlan {
  return {
    dataAvailable: false,
    title: "Plan recomendado para este partido",
    message,
    focusTechnical: null,
    focusCommunication: null,
    focusPhysical: null,
    focusPsychological: null,
    suggestedContent: [],
    checklist: [],
    reminders: [],
    objectives: [],
    evidence: [],
  };
}

type AppointmentPrivacyAccess = {
  readinessSummary: boolean;
  physicalLoad: boolean;
  psychologyCompliance: boolean;
  psychologyDetail: boolean;
};

function fullAppointmentPrivacyAccess(): AppointmentPrivacyAccess {
  return {
    readinessSummary: true,
    physicalLoad: true,
    psychologyCompliance: true,
    psychologyDetail: true,
  };
}

async function getInstitutionAppointmentPrivacyAccess(
  supabase: SupabaseAnyClient,
  institutionId: string | null,
  userId: string
): Promise<AppointmentPrivacyAccess> {
  const privateByDefault: AppointmentPrivacyAccess = {
    readinessSummary: false,
    physicalLoad: false,
    psychologyCompliance: false,
    psychologyDetail: false,
  };
  if (!institutionId) return privateByDefault;

  const { data, error } = await supabase
    .from("institution_data_consents")
    .select(
      "data_category,share_summary,share_detail,granted_at,revoked_at,expires_at"
    )
    .eq("institution_id", institutionId)
    .eq("user_id", userId);

  if (error) {
    console.error("MATCH_PRIVACY_CONSENT_LOOKUP_ERROR", {
      institutionId,
      userId,
      message: error.message,
    });
    return privateByDefault;
  }

  const now = Date.now();
  const activeRows = ((data ?? []) as Array<{
    data_category?: string | null;
    share_summary?: boolean | null;
    share_detail?: boolean | null;
    granted_at?: string | null;
    revoked_at?: string | null;
    expires_at?: string | null;
  }>).filter((row) => {
    if (!row.granted_at || row.revoked_at) return false;
    if (!row.expires_at) return true;
    const expiresAt = new Date(row.expires_at).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  const consent = (category: string) =>
    activeRows.find((row) => row.data_category === category);

  return {
    readinessSummary: consent("readiness_summary")?.share_summary === true,
    physicalLoad: consent("physical_load")?.share_summary === true,
    psychologyCompliance:
      consent("psychology_compliance")?.share_summary === true,
    psychologyDetail: consent("psychology_detail")?.share_detail === true,
  };
}

function calculateWeakestTopic(
  attempts: Array<{ topic?: string | null; score?: number | null }>
) {
  const map = new Map<string, { total: number; count: number }>();

  for (const attempt of attempts) {
    const topic = textOrNull(attempt.topic);
    const score = normalizeScore(attempt.score);
    if (!topic || score === null) continue;
    const current = map.get(topic) ?? { total: 0, count: 0 };
    current.total += score;
    current.count += 1;
    map.set(topic, current);
  }

  let weakest: { topic: string; average: number; count: number } | null = null;
  for (const [topic, value] of map.entries()) {
    if (value.count < 2) continue;
    const average = Math.round(value.total / value.count);
    if (!weakest || average < weakest.average) {
      weakest = { topic, average, count: value.count };
    }
  }

  return weakest;
}

function calculateWeakestCriterion(
  attempts: Array<{
    technical_correct?: boolean | null;
    restart_correct?: boolean | null;
    discipline_correct?: boolean | null;
    disciplinary_correct?: boolean | null;
  }>
) {
  const criteria = [
    {
      key: "technical",
      values: attempts.map((item) => item.technical_correct),
    },
    {
      key: "restart",
      values: attempts.map((item) => item.restart_correct),
    },
    {
      key: "discipline",
      values: attempts.map((item) => item.discipline_correct ?? item.disciplinary_correct),
    },
  ] as const;

  let weakest:
    | {
        key: "technical" | "restart" | "discipline";
        accuracy: number;
      }
    | null = null;

  for (const criterion of criteria) {
    const valid = criterion.values.filter(
      (value): value is boolean => typeof value === "boolean"
    );
    if (valid.length < 2) continue;
    const accuracy = Math.round(
      (valid.filter(Boolean).length / valid.length) * 100
    );
    if (!weakest || accuracy < weakest.accuracy) {
      weakest = {
        key: criterion.key,
        accuracy,
      };
    }
  }

  return weakest;
}

function getSuggestedContentForRole(
  roleKey: RefereeRoleKey,
  topic: string,
  sportType: SportType
) {
  if (sportType === "football_11" && (roleKey === "assistant_1" || roleKey === "assistant_2")) {
    if (topic.toLowerCase().includes("offside") || topic.toLowerCase().includes("fuera")) {
      return "Repasar clips de fuera de juego y coordinacion con el arbitro principal.";
    }
  }

  if (sportType === "futsal" && roleKey === "timekeeper") {
    return "Repasar procedimiento de sustitucion, control de cuatro segundos y cronometraje.";
  }

  if (sportType === "futsal" && roleKey === "third_referee") {
    return "Repasar control del area tecnica, sustituciones y apoyo disciplinario.";
  }

  return `Volver a entrenar situaciones de ${topic} antes del partido.`;
}

async function ensureNoActiveAppointmentOnSameDate(
  supabase: SupabaseAnyClient,
  input: {
    userId: string;
    kickoffAt: string;
    allowSameDateOverride?: boolean;
    excludeAppointmentId?: string | null;
  }
) {
  if (input.allowSameDateOverride) return;

  let query = supabase
    .from("appointments")
    .select("*")
    .eq("user_id", input.userId)
    .in("status", activeAppointmentStatusesForConflicts);

  if (input.excludeAppointmentId) {
    query = query.neq("id", input.excludeAppointmentId);
  }

  const appointmentsRes = await query;
  throwIfError(
    appointmentsRes.error,
    "No se pudo validar si ya existe una designacion en esa fecha."
  );

  const appointments = (appointmentsRes.data ?? []) as AppointmentRecord[];
  if (!appointments.length) return;

  const fixtures = await getFixturesByIds(
    supabase,
    uniqueIds(appointments.map((item) => item.fixture_id))
  );
  const roles = await getRolesByIds(
    supabase,
    uniqueIds(appointments.map((item) => item.role_id))
  );
  const teams = await getTeamsByIds(
    supabase,
    uniqueIds(fixtures.flatMap((item) => [item.home_team_id, item.away_team_id]))
  );

  const fixtureMap = indexById(fixtures);
  const roleMap = indexById(roles);
  const teamMap = indexById(teams);
  const targetDate = toCalendarDateKey(input.kickoffAt);

  const conflictingAppointment = appointments.find((appointment) => {
    const fixture = fixtureMap.get(appointment.fixture_id);
    if (!fixture?.kickoff_at) return false;
    return toCalendarDateKey(fixture.kickoff_at) === targetDate;
  });

  if (!conflictingAppointment) return;

  const conflictingFixture = fixtureMap.get(conflictingAppointment.fixture_id) ?? null;
  const homeTeam = conflictingFixture?.home_team_id
    ? teamMap.get(conflictingFixture.home_team_id) ?? null
    : null;
  const awayTeam = conflictingFixture?.away_team_id
    ? teamMap.get(conflictingFixture.away_team_id) ?? null
    : null;
  const conflictingRole = roleMap.get(conflictingAppointment.role_id) ?? null;

  throw new MatchesConflictError(
    "Ya existe una designacion activa para esa misma fecha.",
    {
      appointmentId: conflictingAppointment.id,
      matchLabel: buildMatchLabel(homeTeam?.name, awayTeam?.name),
      kickoffAt:
        conflictingFixture?.kickoff_at ??
        conflictingAppointment.created_at ??
        input.kickoffAt,
      roleLabel: conflictingRole?.label ?? "Rol sin definir",
    }
  );
}

async function registerAppointmentHistory(
  supabase: SupabaseAnyClient,
  input: {
    appointmentId: string;
    userId: string;
    changedByUserId: string;
    changeType: "created" | "status_changed" | "role_changed" | "fixture_changed" | "note_updated" | "system_sync";
    fromStatus: AppointmentStatus | null;
    toStatus: AppointmentStatus | null;
    reason: string;
    snapshot: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("appointment_history").insert({
    appointment_id: input.appointmentId,
    user_id: input.userId,
    changed_by_user_id: input.changedByUserId,
    change_type: input.changeType,
    from_status: input.fromStatus,
    to_status: input.toStatus,
    reason: input.reason,
    snapshot: normalizeObject(input.snapshot),
    created_at: new Date().toISOString(),
  });

  throwIfError(error, "No se pudo guardar el historial de la designacion.");
}

async function resolveCountry(
  supabase: SupabaseAnyClient,
  name: string,
  code?: string | null
) {
  const trimmedName = name.trim();
  const normalizedCode = normalizeCountryCode(code, trimmedName);
  const existingByCode = await supabase
    .from("countries")
    .select("*")
    .eq("code", normalizedCode)
    .maybeSingle();

  throwIfError(existingByCode.error, "No se pudo validar el pais.");
  if (existingByCode.data) return existingByCode.data as CountryRecord;

  const existingByName = await supabase
    .from("countries")
    .select("*")
    .ilike("name", trimmedName)
    .maybeSingle();

  throwIfError(existingByName.error, "No se pudo validar el pais.");
  if (existingByName.data) return existingByName.data as CountryRecord;

  const insertRes = await supabase
    .from("countries")
    .insert({
      code: normalizedCode,
      name: trimmedName,
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear el pais.");
  return insertRes.data as CountryRecord;
}

async function resolveAssociation(
  supabase: SupabaseAnyClient,
  countryId: string,
  name: string
) {
  const existing = await supabase
    .from("associations")
    .select("*")
    .eq("country_id", countryId)
    .ilike("name", name.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar la asociacion.");
  if (existing.data) return existing.data as AssociationRecord;

  const insertRes = await supabase
    .from("associations")
    .insert({
      country_id: countryId,
      name: name.trim(),
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear la asociacion.");
  return insertRes.data as AssociationRecord;
}

async function resolveCompetition(
  supabase: SupabaseAnyClient,
  associationId: string,
  sportType: SportType,
  name: string
) {
  const existing = await supabase
    .from("competitions")
    .select("*")
    .eq("association_id", associationId)
    .eq("sport_type", sportType)
    .ilike("name", name.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar la competicion.");
  if (existing.data) return existing.data as CompetitionRecord;

  const insertRes = await supabase
    .from("competitions")
    .insert({
      association_id: associationId,
      sport_type: sportType,
      name: name.trim(),
      source_type: "manual",
      provider: "manual_assisted",
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear la competicion.");
  return insertRes.data as CompetitionRecord;
}

async function resolveSeason(
  supabase: SupabaseAnyClient,
  competitionId: string,
  label: string
) {
  const existing = await supabase
    .from("competition_seasons")
    .select("*")
    .eq("competition_id", competitionId)
    .ilike("label", label.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar la temporada.");
  if (existing.data) return existing.data as CompetitionSeasonRecord;

  const insertRes = await supabase
    .from("competition_seasons")
    .insert({
      competition_id: competitionId,
      label: label.trim(),
      status: "active",
      source_type: "manual",
      provider: "manual_assisted",
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear la temporada.");
  return insertRes.data as CompetitionSeasonRecord;
}

async function resolveCategory(
  supabase: SupabaseAnyClient,
  competitionId: string,
  seasonId: string,
  sportType: SportType,
  name: string,
  refereeSystem?: string | null,
  varSupported = false
) {
  const existing = await supabase
    .from("competition_categories")
    .select("*")
    .eq("competition_id", competitionId)
    .eq("season_id", seasonId)
    .ilike("name", name.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar la categoria.");
  if (existing.data) return existing.data as CompetitionCategoryRecord;

  const insertRes = await supabase
    .from("competition_categories")
    .insert({
      competition_id: competitionId,
      season_id: seasonId,
      sport_type: sportType,
      name: name.trim(),
      referee_system: textOrNull(refereeSystem),
      var_supported: varSupported,
      source_type: "manual",
      provider: "manual_assisted",
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear la categoria.");
  return insertRes.data as CompetitionCategoryRecord;
}

async function resolveTeam(
  supabase: SupabaseAnyClient,
  sportType: SportType,
  countryId: string,
  associationId: string,
  name: string
) {
  const existing = await supabase
    .from("teams")
    .select("*")
    .eq("sport_type", sportType)
    .eq("association_id", associationId)
    .ilike("name", name.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar el equipo.");
  if (existing.data) return existing.data as TeamRecord;

  const insertRes = await supabase
    .from("teams")
    .insert({
      sport_type: sportType,
      country_id: countryId,
      association_id: associationId,
      name: name.trim(),
      source_type: "manual",
      provider: "manual_assisted",
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear el equipo.");
  return insertRes.data as TeamRecord;
}

async function resolveVenue(
  supabase: SupabaseAnyClient,
  countryId: string,
  associationId: string,
  name: string,
  city?: string | null
) {
  const existing = await supabase
    .from("venues")
    .select("*")
    .eq("association_id", associationId)
    .ilike("name", name.trim())
    .maybeSingle();

  throwIfError(existing.error, "No se pudo validar el estadio.");
  if (existing.data) return existing.data as VenueRecord;

  const insertRes = await supabase
    .from("venues")
    .insert({
      country_id: countryId,
      association_id: associationId,
      name: name.trim(),
      city: textOrNull(city),
      source_type: "manual",
      provider: "manual_assisted",
    })
    .select("*")
    .single();

  throwIfError(insertRes.error, "No se pudo crear el estadio.");
  return insertRes.data as VenueRecord;
}

async function loadInstitutionMembers(
  supabase: SupabaseAnyClient,
  institutionId: string
) {
  const membersRes = await supabase
    .from("institution_memberships")
    .select("id,user_id,status")
    .eq("institution_id", institutionId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  throwIfError(
    membersRes.error,
    "No se pudieron cargar los arbitros de la institucion."
  );

  const memberRows = (membersRes.data ?? []) as Array<{
    id?: string | null;
    user_id?: string | null;
    status?: string | null;
  }>;
  const memberUserIds = uniqueIds(memberRows.map((item) => item.user_id));
  if (!memberUserIds.length) return [];

  const profiles = await getProfilesByUserIds(supabase, memberUserIds);
  const profileMap = new Map(profiles.map((item) => [item.userId, item]));

  return memberRows
    .map((member): InstitutionMemberOption | null => {
      const membershipId = textOrNull(member.id);
      const userId = textOrNull(member.user_id);
      if (!membershipId || !userId) return null;
      const profile = profileMap.get(userId);

      return {
        membershipId,
        displayName: profile?.displayName ?? userId,
        refCardId: profile?.refCardId ?? null,
        role: null,
        category: profile?.category ?? null,
      };
    })
    .filter((item): item is InstitutionMemberOption => item !== null);
}

async function getInstitutionsByIds(
  supabase: SupabaseAnyClient,
  ids: string[]
) {
  if (!ids.length) return [] as InstitutionRow[];
  const result = await supabase
    .from("institutions")
    .select("id,name")
    .in("id", ids);

  throwIfError(result.error, "No se pudieron cargar las instituciones.");
  return (result.data ?? []) as InstitutionRow[];
}

async function getProfileByUserId(supabase: SupabaseAnyClient, userId: string) {
  const profiles = await getProfilesByUserIds(supabase, [userId]);
  return profiles[0] ?? null;
}

async function getProfilesByUserIds(
  supabase: SupabaseAnyClient,
  userIds: string[]
) {
  if (!userIds.length) return [] as Array<{
    userId: string;
    displayName: string;
    refCardId: string | null;
    category: string | null;
  }>;

  const result = await supabase
    .from("user_profiles")
    .select("user_id,reflab_name,first_name,last_name,ref_card_id,category")
    .in("user_id", userIds);

  throwIfError(result.error, "No se pudieron cargar los perfiles arbitrales.");

  return ((result.data ?? []) as Array<{
    user_id?: string | null;
    reflab_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    ref_card_id?: string | null;
    category?: string | null;
  }>)
    .map((item) => {
      const userId = textOrNull(item.user_id);
      if (!userId) return null;

      return {
        userId,
        displayName: resolveDisplayName(item, userId),
        refCardId: textOrNull(item.ref_card_id),
        category: textOrNull(item.category),
      };
    })
    .filter(
      (
        item
      ): item is {
        userId: string;
        displayName: string;
        refCardId: string | null;
        category: string | null;
      } => item !== null
    );
}

async function getRoleBySportAndKey(
  supabase: SupabaseAnyClient,
  sportType: SportType,
  roleKey: RefereeRoleKey
) {
  const result = await supabase
    .from("referee_roles")
    .select("*")
    .eq("sport_type", sportType)
    .eq("role_key", roleKey)
    .maybeSingle();

  throwIfError(result.error, "No se pudo validar la funcion arbitral.");
  return (result.data ?? null) as RefereeRoleRecord | null;
}

async function getRoleById(supabase: SupabaseAnyClient, roleId: string) {
  const roles = await getRolesByIds(supabase, [roleId]);
  return roles[0] ?? null;
}

async function getRolesByIds(supabase: SupabaseAnyClient, roleIds: string[]) {
  if (!roleIds.length) return [] as RefereeRoleRecord[];
  const result = await supabase.from("referee_roles").select("*").in("id", roleIds);
  throwIfError(result.error, "No se pudieron cargar los roles arbitrales.");
  return (result.data ?? []) as RefereeRoleRecord[];
}

async function getFixtureById(supabase: SupabaseAnyClient, fixtureId: string) {
  const fixtures = await getFixturesByIds(supabase, [fixtureId]);
  return fixtures[0] ?? null;
}

async function getFixturesByIds(
  supabase: SupabaseAnyClient,
  fixtureIds: string[]
) {
  if (!fixtureIds.length) return [] as FixtureRecord[];
  const result = await supabase.from("fixtures").select("*").in("id", fixtureIds);
  throwIfError(result.error, "No se pudieron cargar los partidos.");
  return (result.data ?? []) as FixtureRecord[];
}

async function getCompetitionById(supabase: SupabaseAnyClient, id: string) {
  const result = await getCompetitionsByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getCompetitionsByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as CompetitionRecord[];
  const result = await supabase.from("competitions").select("*").in("id", ids);
  throwIfError(result.error, "No se pudieron cargar las competiciones.");
  return (result.data ?? []) as CompetitionRecord[];
}

async function getSeasonById(supabase: SupabaseAnyClient, id: string) {
  const result = await getSeasonsByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getSeasonsByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as CompetitionSeasonRecord[];
  const result = await supabase
    .from("competition_seasons")
    .select("*")
    .in("id", ids);
  throwIfError(result.error, "No se pudieron cargar las temporadas.");
  return (result.data ?? []) as CompetitionSeasonRecord[];
}

async function getCategoryById(supabase: SupabaseAnyClient, id: string) {
  const result = await getCategoriesByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getCategoriesByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as CompetitionCategoryRecord[];
  const result = await supabase
    .from("competition_categories")
    .select("*")
    .in("id", ids);
  throwIfError(result.error, "No se pudieron cargar las categorias.");
  return (result.data ?? []) as CompetitionCategoryRecord[];
}

async function getAssociationById(supabase: SupabaseAnyClient, id: string) {
  const result = await getAssociationsByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getAssociationsByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as AssociationRecord[];
  const result = await supabase.from("associations").select("*").in("id", ids);
  throwIfError(result.error, "No se pudieron cargar las asociaciones.");
  return (result.data ?? []) as AssociationRecord[];
}

async function getCountryById(supabase: SupabaseAnyClient, id: string) {
  const result = await getCountriesByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getCountriesByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as CountryRecord[];
  const result = await supabase.from("countries").select("*").in("id", ids);
  throwIfError(result.error, "No se pudieron cargar los paises.");
  return (result.data ?? []) as CountryRecord[];
}

async function getTeamById(supabase: SupabaseAnyClient, id: string) {
  const result = await getTeamsByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getTeamsByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as TeamRecord[];
  const result = await supabase.from("teams").select("*").in("id", ids);
  throwIfError(result.error, "No se pudieron cargar los equipos.");
  return (result.data ?? []) as TeamRecord[];
}

async function getVenueById(supabase: SupabaseAnyClient, id: string) {
  const result = await getVenuesByIds(supabase, [id]);
  return result[0] ?? null;
}

async function getVenuesByIds(supabase: SupabaseAnyClient, ids: string[]) {
  if (!ids.length) return [] as VenueRecord[];
  const result = await supabase.from("venues").select("*").in("id", ids);
  throwIfError(result.error, "No se pudieron cargar los estadios.");
  return (result.data ?? []) as VenueRecord[];
}

async function getOfficialsByFixtureId(
  supabase: SupabaseAnyClient,
  fixtureId: string
) {
  const result = await supabase
    .from("match_officials")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("created_at");
  throwIfError(result.error, "No se pudo cargar el equipo arbitral.");
  return (result.data ?? []) as MatchOfficialRecord[];
}

async function getContextSnapshotsByFixtureId(
  supabase: SupabaseAnyClient,
  fixtureId: string
) {
  const result = await supabase
    .from("match_context_snapshots")
    .select("*")
    .eq("fixture_id", fixtureId)
    .order("created_at", { ascending: false });
  throwIfError(result.error, "No se pudo cargar el contexto del partido.");
  return (result.data ?? []) as MatchContextSnapshotRecord[];
}

async function getPreparationsByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("match_preparations")
    .select("*")
    .eq("appointment_id", appointmentId)
    .order("created_at");
  throwIfError(result.error, "No se pudieron cargar las preparaciones.");
  return (result.data ?? []) as MatchPreparationRecord[];
}

async function getPreparationsByAppointmentIds(
  supabase: SupabaseAnyClient,
  appointmentIds: string[]
) {
  if (!appointmentIds.length) return [] as MatchPreparationRecord[];
  const result = await supabase
    .from("match_preparations")
    .select("appointment_id")
    .in("appointment_id", appointmentIds);
  throwIfError(result.error, "No se pudieron cargar las preparaciones.");
  return (result.data ?? []) as Array<Pick<MatchPreparationRecord, "appointment_id">>;
}

async function getReviewByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("post_match_reviews")
    .select("*")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  throwIfError(result.error, "No se pudo cargar el cierre post partido.");
  return (result.data ?? null) as PostMatchReviewRecord | null;
}

async function getReviewsByAppointmentIds(
  supabase: SupabaseAnyClient,
  appointmentIds: string[]
) {
  if (!appointmentIds.length) return [] as Array<Pick<PostMatchReviewRecord, "appointment_id">>;
  const result = await supabase
    .from("post_match_reviews")
    .select("appointment_id")
    .in("appointment_id", appointmentIds);
  throwIfError(result.error, "No se pudieron cargar los cierres post partido.");
  return (result.data ?? []) as Array<Pick<PostMatchReviewRecord, "appointment_id">>;
}

async function getPerformanceCheckinsByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("performance_checkins")
    .select("appointment_id,readiness_score,created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  throwIfError(result.error, "No se pudieron cargar los check-ins fisicos.");
  return (result.data ?? []) as RefPerformanceMiniRow[];
}

async function getPerformanceCheckinsByAppointmentIds(
  supabase: SupabaseAnyClient,
  appointmentIds: string[]
) {
  if (!appointmentIds.length) return [] as RefPerformanceMiniRow[];
  const result = await supabase
    .from("performance_checkins")
    .select("appointment_id,readiness_score,created_at")
    .in("appointment_id", appointmentIds);
  throwIfError(result.error, "No se pudieron cargar los check-ins fisicos.");
  return (result.data ?? []) as RefPerformanceMiniRow[];
}

async function getPerformanceSessionsByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("performance_sessions")
    .select("id")
    .eq("appointment_id", appointmentId);
  throwIfError(result.error, "No se pudieron cargar las sesiones fisicas vinculadas.");
  return result.data ?? [];
}

async function getPsychologyCheckinsByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("psychology_checkins")
    .select("appointment_id,mental_score,created_at")
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: false });
  throwIfError(result.error, "No se pudieron cargar los registros psicologicos.");
  return (result.data ?? []) as PsychologyMiniRow[];
}

async function getPsychologyCheckinsByAppointmentIds(
  supabase: SupabaseAnyClient,
  appointmentIds: string[]
) {
  if (!appointmentIds.length) return [] as PsychologyMiniRow[];
  const result = await supabase
    .from("psychology_checkins")
    .select("appointment_id,mental_score,created_at")
    .in("appointment_id", appointmentIds);
  throwIfError(result.error, "No se pudieron cargar los registros psicologicos.");
  return (result.data ?? []) as PsychologyMiniRow[];
}

async function getPsychologyExercisesByAppointmentId(
  supabase: SupabaseAnyClient,
  appointmentId: string
) {
  const result = await supabase
    .from("psychology_exercise_sessions")
    .select("id")
    .eq("appointment_id", appointmentId);
  throwIfError(result.error, "No se pudieron cargar los ejercicios psicologicos.");
  return result.data ?? [];
}

function resolveDisplayName(
  profile:
    | UserProfileRow
    | {
        reflab_name?: string | null;
        first_name?: string | null;
        last_name?: string | null;
      }
    | null
    | undefined,
  fallback: string
) {
  const reflabName = textOrNull(profile?.reflab_name);
  if (reflabName) return reflabName;

  const fullName = [textOrNull(profile?.first_name), textOrNull(profile?.last_name)]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) return fullName;
  return fallback;
}

function buildMatchLabel(homeTeam?: string | null, awayTeam?: string | null) {
  const home = textOrNull(homeTeam) ?? "Local";
  const away = textOrNull(awayTeam) ?? "Visitante";
  return `${home} vs ${away}`;
}

function normalizeDateTime(value: string) {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) {
    throw new Error("Indica fecha y hora del partido.");
  }

  const timestamp = new Date(trimmedValue);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("La fecha del partido no es valida.");
  }

  return timestamp.toISOString();
}

function toCalendarDateKey(value: string) {
  return normalizeDateTime(value).slice(0, 10);
}

function requiredText(value: string, errorMessage: string) {
  const normalized = textOrNull(value);
  if (!normalized) {
    throw new Error(errorMessage);
  }
  return normalized;
}

function normalizeCountryCode(value: string | null | undefined, countryName: string) {
  const fromInput = textOrNull(value)?.toUpperCase();
  if (fromInput) return fromInput.slice(0, 3);

  const letters = countryName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);

  return letters || "CNY";
}

function normalizeFixtureStatusFromAppointment(status: AppointmentStatus) {
  if (status === "cancelled") return "cancelled" as const;
  if (status === "postponed") return "postponed" as const;
  if (status === "suspended") return "suspended" as const;
  if (status === "completed") return "completed" as const;
  if (status === "confirmed") return "confirmed" as const;
  return "scheduled" as const;
}

function normalizeScore(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function clampScale(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(10, Math.round(number)));
}

function normalizePositiveInt(value: number | null | undefined) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number);
}

function normalizeStringArray(values?: string[] | null) {
  if (!Array.isArray(values)) return [];
  return uniqueStrings(
    values
      .map((value) => textOrNull(value))
      .filter((value): value is string => Boolean(value))
  );
}

function normalizeObject(value: Record<string, unknown> | undefined) {
  return value && typeof value === "object" ? value : {};
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => textOrNull(value)).filter((value): value is string => Boolean(value)))
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function indexById<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function countBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = textOrNull(item[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function throwIfError(
  error: { message?: string | null } | null,
  message: string
): asserts error is null {
  if (!error) return;
  throw new Error(`${message} ${error.message ?? ""}`.trim());
}
