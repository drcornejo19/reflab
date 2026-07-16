"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPinned,
  NotebookTabs,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useDiscipline } from "@/components/DisciplineProvider";
import { getDisciplineDefinition } from "@/lib/discipline";
import { appointmentSourceLabels } from "@/lib/matches/config";
import type {
  FixtureAppointmentPayload,
  ManualAppointmentPayload,
  MatchAppointmentListItem,
  MatchFixtureListItem,
  MatchesCatalogResponse,
} from "@/lib/matches/api";
import type { SportType } from "@/lib/sports";
import type { RefereeRoleKey } from "@/lib/matches/types";

type MatchesSetupIssue = {
  missingTables: string[];
  migrationId: string | null;
};

type MatchesLoadResult =
  | {
      ok: true;
      catalog: MatchesCatalogResponse;
      appointments: MatchAppointmentListItem[];
    }
  | {
      ok: false;
      error: string;
      setupIssue: MatchesSetupIssue | null;
    };

type AppointmentMutationResult =
  | {
      ok: true;
      appointmentId: string;
    }
  | {
      ok: false;
      error: string;
      setupIssue: MatchesSetupIssue | null;
      conflict:
        | {
            appointmentId: string;
            matchLabel: string;
            kickoffAt: string;
            roleLabel: string;
          }
        | null;
    };

type FiltersState = {
  sportType: SportType;
  countryId: string;
  associationId: string;
  competitionId: string;
  categoryId: string;
  selectedDate: string;
  teamSearch: string;
};

type ManualFormState = {
  kickoffAt: string;
  seasonLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string;
  venueCity: string;
  roleKey: RefereeRoleKey;
  varEnabled: boolean;
  observations: string;
};

type MatchesApiErrorPayload = {
  error?: string;
  technical?: string;
  setupRequired?: boolean;
  missingTables?: string[];
  migrationId?: string | null;
  conflict?: {
    appointmentId?: string;
    matchLabel?: string;
    kickoffAt?: string;
    roleLabel?: string;
  } | null;
};

const activeAppointmentStatuses = new Set([
  "draft",
  "pending_confirmation",
  "confirmed",
  "modified",
]);

const historyStatuses = new Set([
  "completed",
  "cancelled",
  "postponed",
  "suspended",
  "replaced",
]);

export function MatchesHubClient() {
  const { currentDiscipline } = useDiscipline();

  return (
    <MatchesHubExperience
      key={currentDiscipline}
      currentDiscipline={currentDiscipline}
    />
  );
}

function MatchesHubExperience({
  currentDiscipline,
}: {
  currentDiscipline: SportType;
}) {
  const selectionRef = useRef<HTMLElement | null>(null);
  const bootstrappedSportsRef = useRef<Set<SportType>>(new Set());
  const requestIdRef = useRef(0);
  const [filters, setFilters] = useState<FiltersState>(() =>
    buildInitialFilters(currentDiscipline)
  );
  const [catalog, setCatalog] = useState<MatchesCatalogResponse | null>(null);
  const [appointments, setAppointments] = useState<MatchAppointmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [setupIssue, setSetupIssue] = useState<MatchesSetupIssue | null>(null);
  const [selectedFixture, setSelectedFixture] = useState<MatchFixtureListItem | null>(
    null
  );
  const [selectedRoleKey, setSelectedRoleKey] = useState<RefereeRoleKey | "">("");
  const [roleObservations, setRoleObservations] = useState("");
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(
    null
  );
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualForm, setManualForm] = useState<ManualFormState>(() =>
    buildInitialManualForm(currentDiscipline, getNextSaturdayDateKey())
  );

  const deferredTeamSearch = useDeferredValue(filters.teamSearch);
  const theme = getDisciplineDefinition(filters.sportType).theme;

  useEffect(() => {
    void loadData(filters);
  }, [
    filters.associationId,
    filters.categoryId,
    filters.competitionId,
    filters.countryId,
    filters.selectedDate,
    filters.sportType,
  ]);

  useEffect(() => {
    if (!catalog) return;
    if (bootstrappedSportsRef.current.has(filters.sportType)) return;

    bootstrappedSportsRef.current.add(filters.sportType);
    const defaults = resolveDefaultFilters(catalog, filters.sportType);
    if (!defaults) return;

    setFilters((current) => ({
      ...current,
      countryId: defaults.countryId ?? current.countryId,
      associationId: defaults.associationId ?? current.associationId,
      categoryId: defaults.categoryId ?? current.categoryId,
    }));
  }, [catalog, filters.sportType]);

  useEffect(() => {
    if (!catalog || !selectedFixture) return;

    const availableRoles = getAvailableRolesForFixture(catalog, selectedFixture);
    if (!availableRoles.length) {
      setSelectedRoleKey("");
      return;
    }

    const selectedStillAvailable = availableRoles.some(
      (item) => item.role_key === selectedRoleKey
    );
    if (!selectedStillAvailable) {
      setSelectedRoleKey(availableRoles[0]?.role_key ?? "");
    }
  }, [catalog, selectedFixture, selectedRoleKey]);

  useEffect(() => {
    if (!editingAppointmentId) return;
    if (appointments.some((item) => item.appointmentId === editingAppointmentId)) return;
    setEditingAppointmentId(null);
  }, [appointments, editingAppointmentId]);

  useEffect(() => {
    setManualForm((current) => {
      if (!current.kickoffAt) {
        return {
          ...current,
          kickoffAt: buildDefaultKickoff(filters.selectedDate),
        };
      }

      const currentDate = current.kickoffAt.slice(0, 10);
      if (currentDate === filters.selectedDate) return current;

      return {
        ...current,
        kickoffAt: buildDefaultKickoff(filters.selectedDate),
      };
    });
  }, [filters.selectedDate]);

  const countries = catalog?.countries ?? [];
  const associations = (catalog?.associations ?? []).filter(
    (item) => !filters.countryId || item.country_id === filters.countryId
  );
  const competitions = (catalog?.competitions ?? []).filter(
    (item) =>
      item.sport_type === filters.sportType &&
      (!filters.associationId || item.association_id === filters.associationId)
  );
  const categories = (catalog?.categories ?? []).filter(
    (item) =>
      item.sport_type === filters.sportType &&
      (!filters.competitionId || item.competition_id === filters.competitionId)
  );
  const currentCompetition =
    catalog?.competitions.find((item) => item.id === filters.competitionId) ?? null;
  const currentCategory =
    catalog?.categories.find((item) => item.id === filters.categoryId) ?? null;
  const currentCountry =
    catalog?.countries.find((item) => item.id === filters.countryId) ?? null;
  const currentAssociation =
    catalog?.associations.find((item) => item.id === filters.associationId) ?? null;
  const automationStatus = catalog?.automationStatus ?? null;
  const seasonLabel = resolveSeasonLabel(catalog, filters.competitionId, filters.categoryId);
  const visibleFixtures = (catalog?.fixtures ?? []).filter((fixture) =>
    filterFixtureByTeamSearch(fixture, deferredTeamSearch)
  );
  const disciplineAppointments = appointments.filter(
    (item) => item.sportType === filters.sportType
  );
  const allActiveAppointments = [...appointments]
    .filter((item) => activeAppointmentStatuses.has(item.status))
    .sort(
      (left, right) =>
        new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime()
    );
  const sortedActiveAppointments = [...disciplineAppointments]
    .filter((item) => activeAppointmentStatuses.has(item.status))
    .sort(
      (left, right) =>
        new Date(left.kickoffAt).getTime() - new Date(right.kickoffAt).getTime()
    );
  const nextAppointment = sortedActiveAppointments[0] ?? null;
  const additionalActiveAppointments = sortedActiveAppointments.slice(1, 4);
  const historyAppointments = [...disciplineAppointments]
    .filter((item) => historyStatuses.has(item.status))
    .sort(
      (left, right) =>
        new Date(right.kickoffAt).getTime() - new Date(left.kickoffAt).getTime()
    )
    .slice(0, 6);
  const editingAppointment =
    editingAppointmentId === null
      ? null
      : appointments.find((item) => item.appointmentId === editingAppointmentId) ?? null;
  const sameDateAppointment = allActiveAppointments.find((item) => {
    if (editingAppointmentId && item.appointmentId === editingAppointmentId) return false;
    return toDateKey(item.kickoffAt) === filters.selectedDate;
  });
  const weekendSaturday = getWeekendAnchorDate(filters.selectedDate);
  const weekendSunday = addDays(weekendSaturday, 1);
  const selectedFixtureRoles =
    catalog && selectedFixture
      ? getAvailableRolesForFixture(catalog, selectedFixture)
      : [];
  const preparationState = nextAppointment
    ? getPreparationStateLabel(nextAppointment)
    : null;

  async function loadData(nextFilters: FiltersState) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(null);
    setSetupIssue(null);

    if (catalog) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const result = await fetchMatchesData(nextFilters);
    if (requestId !== requestIdRef.current) return;

    if (!result.ok) {
      setError(result.error);
      setSetupIssue(result.setupIssue);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    setCatalog(result.catalog);
    setAppointments(result.appointments);
    setRefreshing(false);
    setLoading(false);
  }

  function handleSelectFixture(fixture: MatchFixtureListItem) {
    setMessage(null);
    setError(null);

    if (sameDateAppointment && !editingAppointmentId) {
      setError(
        `Ya tienes una designacion para ${formatDateLong(
          sameDateAppointment.kickoffAt
        )}. Usa "Modificar designacion" o cancela el registro actual antes de elegir otro partido.`
      );
      return;
    }

    if (!catalog) return;
    const availableRoles = getAvailableRolesForFixture(catalog, fixture);
    if (!availableRoles.length) {
      setError(
        "No encontramos funciones arbitrales habilitadas para este partido con tu configuracion actual."
      );
      return;
    }

    setSelectedFixture(fixture);
    setSelectedRoleKey(availableRoles[0]?.role_key ?? "");
    setRoleObservations(editingAppointment?.observations ?? "");
  }

  function handleCloseModal() {
    setSelectedFixture(null);
    setSelectedRoleKey("");
    setRoleObservations("");
  }

  async function handleConfirmSelection() {
    if (!selectedFixture || !selectedRoleKey) {
      setError("Selecciona una funcion arbitral antes de confirmar.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const isEditing = Boolean(editingAppointment);
    const editingSameFixture =
      Boolean(editingAppointment) &&
      editingAppointment?.fixtureId === selectedFixture.fixtureId;

    try {
      if (editingAppointment && editingSameFixture) {
        const updateResult = await updateAppointmentRecord(
          editingAppointment.appointmentId,
          {
            roleKey: selectedRoleKey,
            status: "confirmed",
            observations: roleObservations || null,
          }
        );

        if (!updateResult.ok) {
          setError(updateResult.error);
          setSetupIssue(updateResult.setupIssue);
          return;
        }

        setMessage("Tu designacion se actualizo correctamente.");
      } else {
        const createResult = await createFixtureAppointment({
          fixtureId: selectedFixture.fixtureId,
          roleKey: selectedRoleKey,
          status: "confirmed",
          observations: roleObservations || null,
          allowSameDateOverride: isEditing,
        });

        if (!createResult.ok) {
          setError(createResult.error);
          setSetupIssue(createResult.setupIssue);
          if (createResult.conflict) {
            setEditingAppointmentId(createResult.conflict.appointmentId);
          }
          return;
        }

        if (editingAppointment) {
          const replaceResult = await updateAppointmentRecord(
            editingAppointment.appointmentId,
            { status: "replaced" }
          );

          if (!replaceResult.ok) {
            setError(
              `${replaceResult.error} La nueva designacion ya fue creada, pero la anterior necesita revision manual.`
            );
          }
        }

        setMessage(
          isEditing
            ? "Tu nueva designacion quedo registrada y reemplazo la anterior."
            : "Tu designacion quedo confirmada y ya figura como tu proxima designacion."
        );
      }

      setEditingAppointmentId(null);
      handleCloseModal();
      await loadData(filters);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManualRegistration() {
    if (!catalog) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const result = await createManualAppointment({
      sportType: filters.sportType,
      countryName: currentCountry?.name ?? catalog.actor.profile.country ?? "",
      countryCode: currentCountry?.code ?? null,
      associationName:
        currentAssociation?.name ?? catalog.actor.profile.association ?? "",
      competitionName: currentCompetition?.name ?? "",
      categoryName: currentCategory?.name ?? catalog.actor.profile.category ?? "",
      seasonLabel: manualForm.seasonLabel || seasonLabel || "",
      kickoffAt: manualForm.kickoffAt,
      homeTeamName: manualForm.homeTeamName,
      awayTeamName: manualForm.awayTeamName,
      venueName: manualForm.venueName || null,
      venueCity: manualForm.venueCity || null,
      refereeSystem:
        currentCategory?.referee_system ??
        (filters.sportType === "futsal" ? "2 arbitros + mesa" : "Arbitro + asistentes"),
      varEnabled: filters.sportType === "football_11" ? manualForm.varEnabled : false,
      roleKey: manualForm.roleKey || "other",
      status: "confirmed",
      observations: manualForm.observations || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      setSetupIssue(result.setupIssue);
      return;
    }

    setShowManualFallback(false);
    setMessage("El partido manual se registro correctamente en Mis partidos.");
    setManualForm(buildInitialManualForm(filters.sportType, filters.selectedDate));
    await loadData(filters);
  }

  async function handleCancelAppointment(appointmentId: string) {
    const confirmed = window.confirm(
      "Vas a cancelar esta designacion registrada en Mis partidos. Deseas continuar?"
    );
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setMessage(null);

    const result = await updateAppointmentRecord(appointmentId, {
      status: "cancelled",
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      setSetupIssue(result.setupIssue);
      return;
    }

    if (editingAppointmentId === appointmentId) {
      setEditingAppointmentId(null);
    }
    setMessage("La designacion quedo cancelada.");
    await loadData(filters);
  }

  function handleEditAppointment(appointment: MatchAppointmentListItem) {
    setEditingAppointmentId(appointment.appointmentId);
    setSelectedFixture(null);
    setSelectedRoleKey("");
    setRoleObservations(appointment.observations ?? "");

    setFilters((current) => ({
      ...current,
      sportType: appointment.sportType,
      countryId: appointment.countryId ?? "",
      associationId: appointment.associationId ?? "",
      competitionId: appointment.competitionId ?? "",
      categoryId: appointment.categoryId ?? "",
      selectedDate: toDateKey(appointment.kickoffAt),
      teamSearch: "",
    }));

    selectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMessage(
      "Modo edicion activo. Selecciona un nuevo partido o cambia la funcion arbitral para reemplazar la designacion actual."
    );
  }

  if (loading) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-zinc-300">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin" style={{ color: theme.accent }} />
          Cargando Mis partidos...
        </div>
      </div>
    );
  }

  if (!catalog) {
    if (setupIssue) {
      return <MatchesSetupNotice error={error} setupIssue={setupIssue} />;
    }

    return (
      <Notice theme={theme} tone="error">
        {error ?? "No se pudo cargar Mis partidos."}
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      <section
        className="overflow-hidden rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-8"
        style={buildHeroStyle(theme)}
      >
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.36em]"
              style={{ color: theme.accent }}
            >
              MIS PARTIDOS
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Selecciona tu designacion en segundos
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
              Filtra por pais, asociacion, competicion y fecha. Elige tu
              partido, confirma tu funcion arbitral y deja conectado el resto del
              flujo con Ref Performance, Psicologia y ficha operativa.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Badge label={catalog.actor.profile.displayName} tone="dark" />
              <Badge
                label={
                  filters.sportType === "futsal" ? "Vista futsal activa" : "Vista futbol 11 activa"
                }
                tone="accent"
                theme={theme}
              />
              <Badge
                label={`${visibleFixtures.length} partido(s) visibles`}
                tone="dark"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              label="Fecha activa"
              value={formatDateLong(filters.selectedDate)}
              detail="Lista cargada automaticamente"
              icon={CalendarDays}
              theme={theme}
            />
            <MetricCard
              label="Partidos"
              value={String(visibleFixtures.length)}
              detail="Segun filtros actuales"
              icon={NotebookTabs}
              theme={theme}
            />
            <MetricCard
              label="Designaciones activas"
              value={String(sortedActiveAppointments.length)}
              detail="Tu agenda operativa"
              icon={ShieldCheck}
              theme={theme}
            />
            <MetricCard
              label="Historial"
              value={String(historyAppointments.length)}
              detail="Registros cerrados recientes"
              icon={Target}
              theme={theme}
            />
          </div>
        </div>
      </section>

      {editingAppointment ? (
        <Notice theme={theme} tone="warning">
          Modo edicion activo para <b>{editingAppointment.matchLabel}</b>. Puedes cambiar
          el partido o la funcion y el sistema reemplazara la designacion anterior.
        </Notice>
      ) : null}
      {error ? (
        <Notice theme={theme} tone="error">
          {error}
        </Notice>
      ) : null}
      {message ? (
        <Notice theme={theme} tone="success">
          {message}
        </Notice>
      ) : null}

      {nextAppointment ? (
        <NextAppointmentCard
          appointment={nextAppointment}
          preparationState={preparationState ?? "Pendiente"}
          theme={theme}
          onEdit={() => handleEditAppointment(nextAppointment)}
          onCancel={() => void handleCancelAppointment(nextAppointment.appointmentId)}
        />
      ) : (
        <section className="rounded-[32px] border border-dashed border-white/10 bg-[#071019] p-6">
          <p
            className="text-xs font-black uppercase tracking-[0.26em]"
            style={{ color: theme.accent }}
          >
            MI PROXIMA DESIGNACION
          </p>
          <h2 className="mt-3 text-2xl font-black text-white">
            Aun no registraste tu proximo partido
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
            Usa los filtros de abajo para ver todos los partidos de la fecha, elegir
            el encuentro correcto y guardarlo como tu proxima designacion.
          </p>
        </section>
      )}

      <section
        ref={selectionRef}
        className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.24em]"
              style={{ color: theme.accent }}
            >
              SELECCION RAPIDA
            </p>
            <h2 className="mt-3 text-2xl font-black">Filtra y elige tu partido</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              La disciplina activa se toma del header. Ajusta la fecha, pais, asociacion,
              competicion y categoria hasta ver el listado correcto.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowManualFallback((current) => !current)}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
            >
              {showManualFallback
                ? "Ocultar registro manual"
                : "Registrar partido manualmente"}
            </button>
            <Link
              href="/institutional"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
            >
              Solicitar carga a la institucion
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                  Fecha
                </p>
                <p className="mt-2 text-sm font-bold text-white">
                  Fin de semana {formatDayMonth(weekendSaturday)}
                </p>
              </div>
              {refreshing ? (
                <RefreshCw className="h-4 w-4 animate-spin text-zinc-400" />
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    selectedDate: toDateKey(addDays(weekendSaturday, -7)),
                  }))
                }
                className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-white/20"
                aria-label="Fin de semana anterior"
              >
                <ArrowLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    selectedDate: toDateKey(weekendSaturday),
                  }))
                }
                className={buildDayButtonClass(
                  filters.selectedDate === toDateKey(weekendSaturday)
                )}
                style={
                  filters.selectedDate === toDateKey(weekendSaturday)
                    ? buildAccentButtonStyle(theme)
                    : undefined
                }
              >
                Sab {formatDayMonth(weekendSaturday)}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    selectedDate: toDateKey(weekendSunday),
                  }))
                }
                className={buildDayButtonClass(
                  filters.selectedDate === toDateKey(weekendSunday)
                )}
                style={
                  filters.selectedDate === toDateKey(weekendSunday)
                    ? buildAccentButtonStyle(theme)
                    : undefined
                }
              >
                Dom {formatDayMonth(weekendSunday)}
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    selectedDate: toDateKey(addDays(weekendSaturday, 7)),
                  }))
                }
                className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-200 transition hover:border-white/20"
                aria-label="Fin de semana siguiente"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Elegir otra fecha
              </span>
              <input
                type="date"
                value={filters.selectedDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    selectedDate: event.target.value,
                  }))
                }
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <SelectField
            label="Pais"
            value={filters.countryId}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                countryId: value,
                associationId: "",
                competitionId: "",
                categoryId: "",
              }))
            }
            options={countries.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="Todos los paises"
          />
          <SelectField
            label="Asociacion"
            value={filters.associationId}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                associationId: value,
                competitionId: "",
                categoryId: "",
              }))
            }
            options={associations.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="Todas las asociaciones"
          />
          <SelectField
            label="Competicion"
            value={filters.competitionId}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                competitionId: value,
                categoryId: "",
              }))
            }
            options={competitions.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="Todas las competiciones"
          />
          <SelectField
            label="Categoria"
            value={filters.categoryId}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                categoryId: value,
              }))
            }
            options={categories.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            placeholder="Todas las categorias"
          />
          <SearchField
            label="Buscador de equipos"
            value={filters.teamSearch}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                teamSearch: value,
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.24em]"
              style={{ color: theme.accent }}
            >
              PARTIDOS DE LA FECHA
            </p>
            <h2 className="mt-3 text-2xl font-black">
              {visibleFixtures.length
                ? `${visibleFixtures.length} partido(s) para ${formatDateLong(
                    filters.selectedDate
                  )}`
                : "Sin partidos visibles por ahora"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {buildFiltersSummary(filters, currentCountry?.name, currentAssociation?.name, currentCompetition?.name, currentCategory?.name)}
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-zinc-300">
            <Search size={16} className="text-zinc-500" />
            {deferredTeamSearch.trim()
              ? `Busqueda activa: ${deferredTeamSearch.trim()}`
              : "Seleccion rapida y visual"}
          </div>
        </div>

        <div className="mt-6">
          {automationStatus ? (
            <AutomationStatusNotice theme={theme} status={automationStatus} />
          ) : null}

          {visibleFixtures.length === 0 ? (
            <EmptyFixtureState
              theme={theme}
              showManualFallback={showManualFallback}
              automationStatus={automationStatus}
              onToggleManual={() => setShowManualFallback((current) => !current)}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleFixtures.map((fixture) => (
                <FixtureCard
                  key={fixture.fixtureId}
                  fixture={fixture}
                  theme={getDisciplineDefinition(fixture.sportType).theme}
                  disabled={
                    Boolean(sameDateAppointment && !editingAppointmentId) ||
                    nextAppointment?.fixtureId === fixture.fixtureId
                  }
                  disabledReason={
                    nextAppointment?.fixtureId === fixture.fixtureId
                      ? "Ya es tu designacion activa"
                      : sameDateAppointment && !editingAppointmentId
                        ? "Ya tienes una designacion en esa fecha"
                        : null
                  }
                  onSelect={() => handleSelectFixture(fixture)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {showManualFallback ? (
        <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.24em]"
                style={{ color: theme.accent }}
              >
                REGISTRO MANUAL
              </p>
              <h2 className="mt-3 text-2xl font-black">Cargar partido fuera del listado</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Usa esta opcion solo si la fecha no tiene cobertura todavia. El partido
                quedara guardado con la disciplina y el contexto que seleccionaste arriba.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualFallback(false)}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-white/20 hover:text-white"
              aria-label="Cerrar registro manual"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InputField
              label="Temporada"
              value={manualForm.seasonLabel}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, seasonLabel: value }))
              }
              placeholder={seasonLabel || "Torneo 2026"}
            />
            <InputField
              label="Fecha y hora"
              type="datetime-local"
              value={manualForm.kickoffAt}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, kickoffAt: value }))
              }
            />
            <InputField
              label="Equipo local"
              value={manualForm.homeTeamName}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, homeTeamName: value }))
              }
              placeholder="Equipo local"
            />
            <InputField
              label="Equipo visitante"
              value={manualForm.awayTeamName}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, awayTeamName: value }))
              }
              placeholder="Equipo visitante"
            />
            <InputField
              label="Estadio"
              value={manualForm.venueName}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, venueName: value }))
              }
              placeholder="Estadio o sede"
            />
            <InputField
              label="Ciudad"
              value={manualForm.venueCity}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, venueCity: value }))
              }
              placeholder="Ciudad"
            />
            <SelectField
              label="Funcion arbitral"
              value={manualForm.roleKey}
              onChange={(value) =>
                setManualForm((current) => ({
                  ...current,
                  roleKey: value as RefereeRoleKey,
                }))
              }
              options={getManualRoleOptions(catalog, filters.sportType, manualForm.varEnabled)}
              placeholder="Selecciona tu funcion"
            />
            <ToggleField
              label="VAR habilitado"
              value={manualForm.varEnabled}
              disabled={filters.sportType !== "football_11"}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, varEnabled: value }))
              }
              theme={theme}
            />
          </div>

          <div className="mt-4">
            <TextAreaField
              label="Observaciones"
              value={manualForm.observations}
              onChange={(value) =>
                setManualForm((current) => ({ ...current, observations: value }))
              }
              placeholder="Horario de salida, nota institucional o detalle operativo."
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleManualRegistration()}
              disabled={submitting}
              className="inline-flex min-h-14 items-center justify-center rounded-2xl px-6 font-black text-black transition disabled:cursor-wait disabled:opacity-60"
              style={buildPrimaryButtonStyle(theme)}
            >
              {submitting ? "Guardando..." : "Confirmar mi designacion"}
            </button>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Si faltan pais, asociacion, competicion o categoria, completa primero los
              filtros principales para mantener la trazabilidad correcta.
            </p>
          </div>
        </section>
      ) : null}

      {additionalActiveAppointments.length > 0 ? (
        <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.24em]"
                style={{ color: theme.accent }}
              >
                OTRAS DESIGNACIONES
              </p>
              <h2 className="mt-3 text-2xl font-black">Agenda activa</h2>
            </div>
            <Target className="h-6 w-6" style={{ color: theme.accent }} />
          </div>
          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {additionalActiveAppointments.map((appointment) => (
              <CompactAppointmentCard
                key={appointment.appointmentId}
                appointment={appointment}
                onEdit={() => handleEditAppointment(appointment)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {historyAppointments.length > 0 ? (
        <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.24em]"
                style={{ color: theme.accent }}
              >
                HISTORIAL RECIENTE
              </p>
              <h2 className="mt-3 text-2xl font-black">Partidos cerrados o actualizados</h2>
            </div>
            <Sparkles className="h-6 w-6" style={{ color: theme.accent }} />
          </div>
          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {historyAppointments.map((appointment) => (
              <CompactAppointmentCard
                key={appointment.appointmentId}
                appointment={appointment}
              />
            ))}
          </div>
        </section>
      ) : null}

      {selectedFixture ? (
        <RoleSelectionModal
          fixture={selectedFixture}
          roles={selectedFixtureRoles}
          selectedRoleKey={selectedRoleKey}
          observations={roleObservations}
          onSelectRole={setSelectedRoleKey}
          onChangeObservations={setRoleObservations}
          onClose={handleCloseModal}
          onConfirm={() => void handleConfirmSelection()}
          submitting={submitting}
          theme={getDisciplineDefinition(selectedFixture.sportType).theme}
          isEditing={Boolean(editingAppointment)}
        />
      ) : null}
    </div>
  );
}

async function fetchMatchesData(filters: FiltersState): Promise<MatchesLoadResult> {
  try {
    const params = new URLSearchParams();
    params.set("sportType", filters.sportType);
    if (filters.countryId) params.set("countryId", filters.countryId);
    if (filters.associationId) params.set("associationId", filters.associationId);
    if (filters.competitionId) params.set("competitionId", filters.competitionId);
    if (filters.categoryId) params.set("categoryId", filters.categoryId);

    const { dateFrom, dateTo } = buildDateRange(filters.selectedDate);
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);

    const [catalogResponse, appointmentsResponse] = await Promise.all([
      fetch(`/api/matches/catalog?${params.toString()}`, { cache: "no-store" }),
      fetch("/api/matches/appointments?scope=self", { cache: "no-store" }),
    ]);

    const catalogPayload = (await catalogResponse.json().catch(() => ({}))) as
      | MatchesCatalogResponse
      | MatchesApiErrorPayload;
    const appointmentsPayload = (await appointmentsResponse
      .json()
      .catch(() => ({}))) as
      | { appointments?: MatchAppointmentListItem[] }
      | MatchesApiErrorPayload;

    if (!catalogResponse.ok) {
      const errorPayload = catalogPayload as MatchesApiErrorPayload;
      return {
        ok: false,
        error: formatApiError(errorPayload),
        setupIssue: extractSetupIssue(errorPayload),
      };
    }

    if (!appointmentsResponse.ok) {
      const errorPayload = appointmentsPayload as MatchesApiErrorPayload;
      return {
        ok: false,
        error: formatApiError(errorPayload),
        setupIssue: extractSetupIssue(errorPayload),
      };
    }

    return {
      ok: true,
      catalog: catalogPayload as MatchesCatalogResponse,
      appointments: Array.isArray(
        (appointmentsPayload as { appointments?: MatchAppointmentListItem[] }).appointments
      )
        ? ((appointmentsPayload as { appointments?: MatchAppointmentListItem[] })
            .appointments as MatchAppointmentListItem[])
        : [],
    };
  } catch (loadError) {
    return {
      ok: false,
      error:
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar Mis partidos.",
      setupIssue: null,
    };
  }
}

async function createFixtureAppointment(
  payload: FixtureAppointmentPayload
): Promise<AppointmentMutationResult> {
  try {
    const response = await fetch("/api/matches/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => ({}))) as {
      appointment?: { id?: string };
      error?: string;
      technical?: string;
      setupRequired?: boolean;
      missingTables?: string[];
      migrationId?: string | null;
      conflict?: {
        appointmentId?: string;
        matchLabel?: string;
        kickoffAt?: string;
        roleLabel?: string;
      } | null;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: formatApiError(result),
        setupIssue: extractSetupIssue(result),
        conflict: normalizeConflict(result.conflict),
      };
    }

    const appointmentId = result.appointment?.id;
    if (!appointmentId) {
      return {
        ok: false,
        error: "La designacion se creo sin id de retorno.",
        setupIssue: null,
        conflict: null,
      };
    }

    return {
      ok: true,
      appointmentId,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la designacion.",
      setupIssue: null,
      conflict: null,
    };
  }
}

async function createManualAppointment(
  payload: ManualAppointmentPayload
): Promise<AppointmentMutationResult> {
  try {
    const response = await fetch("/api/matches/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        kickoffAt: normalizeDateTimeLocal(payload.kickoffAt),
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      appointment?: { id?: string };
      error?: string;
      technical?: string;
      setupRequired?: boolean;
      missingTables?: string[];
      migrationId?: string | null;
      conflict?: {
        appointmentId?: string;
        matchLabel?: string;
        kickoffAt?: string;
        roleLabel?: string;
      } | null;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: formatApiError(result),
        setupIssue: extractSetupIssue(result),
        conflict: normalizeConflict(result.conflict),
      };
    }

    const appointmentId = result.appointment?.id;
    if (!appointmentId) {
      return {
        ok: false,
        error: "La designacion se creo sin id de retorno.",
        setupIssue: null,
        conflict: null,
      };
    }

    return {
      ok: true,
      appointmentId,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la designacion.",
      setupIssue: null,
      conflict: null,
    };
  }
}

async function updateAppointmentRecord(
  appointmentId: string,
  payload: {
    status?: string;
    observations?: string | null;
    roleKey?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string; setupIssue: MatchesSetupIssue | null }> {
  try {
    const response = await fetch(`/api/matches/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json().catch(() => ({}))) as MatchesApiErrorPayload;
    if (!response.ok) {
      return {
        ok: false,
        error: formatApiError(result),
        setupIssue: extractSetupIssue(result),
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la designacion.",
      setupIssue: null,
    };
  }
}

function NextAppointmentCard({
  appointment,
  preparationState,
  theme,
  onEdit,
  onCancel,
}: {
  appointment: MatchAppointmentListItem;
  preparationState: string;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  onEdit: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      className="overflow-hidden rounded-[34px] border border-white/10 p-6 shadow-2xl sm:p-8"
      style={buildHeroStyle(theme)}
    >
      <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <p
            className="text-xs font-black uppercase tracking-[0.36em]"
            style={{ color: theme.accent }}
          >
            MI PROXIMA DESIGNACION
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight">
            {appointment.matchLabel}
          </h2>
          <p className="mt-3 text-sm font-bold text-zinc-300">
            {appointment.competitionName || "Competicion"}{" "}
            {appointment.categoryName ? `· ${appointment.categoryName}` : ""}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <MiniStat icon={CalendarDays} text={formatDateLong(appointment.kickoffAt)} />
            <MiniStat icon={Clock3} text={formatTime(appointment.kickoffAt)} />
            <MiniStat
              icon={MapPinned}
              text={`${appointment.venueName || "Sin estadio"}${
                appointment.venueCity ? ` · ${appointment.venueCity}` : ""
              }`}
            />
            <MiniStat
              icon={ShieldCheck}
              text={`${appointment.roleLabel} · ${appointment.statusLabel}`}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Badge label={`Cuenta regresiva: ${getCountdownLabel(appointment.kickoffAt)}`} tone="accent" theme={theme} />
            <Badge label={`Preparacion: ${preparationState}`} tone="dark" />
            <Badge label={appointment.sourceLabel} tone="dark" />
          </div>
        </div>

        <div className="grid gap-3 rounded-[28px] border border-white/10 bg-black/20 p-4">
          <Link
            href={`/matches/${appointment.appointmentId}`}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl px-5 font-black text-black transition"
            style={buildPrimaryButtonStyle(theme)}
          >
            Preparar partido
          </Link>
          <Link
            href={`/matches/${appointment.appointmentId}`}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
          >
            Ver ficha
          </Link>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
          >
            Modificar designacion
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 px-5 font-black text-red-100 transition hover:border-red-400/40"
          >
            Cancelar registro
          </button>
        </div>
      </div>
    </section>
  );
}

function FixtureCard({
  fixture,
  theme,
  disabled,
  disabledReason,
  onSelect,
}: {
  fixture: MatchFixtureListItem;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  disabled: boolean;
  disabledReason: string | null;
  onSelect: () => void;
}) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-black/30">
      <div className="flex flex-wrap gap-2">
        <Badge label={fixture.statusLabel} tone="accent" theme={theme} />
        <Badge
          label={fixture.varEnabled ? "VAR" : "Sin VAR"}
          tone="dark"
        />
        <Badge
          label={fixture.sportType === "futsal" ? "Futsal" : "Futbol 11"}
          tone="dark"
        />
      </div>

      <h3 className="mt-4 text-2xl font-black text-white">
        {fixture.homeTeamName} vs {fixture.awayTeamName}
      </h3>
      <p className="mt-2 text-sm font-bold text-zinc-400">
        {fixture.competitionName || "Competicion"}{" "}
        {fixture.categoryName ? `· ${fixture.categoryName}` : ""}
      </p>

      <div className="mt-5 grid gap-2">
        <FixtureInfo icon={CalendarDays} text={formatDateLong(fixture.kickoffAt)} />
        <FixtureInfo icon={Clock3} text={formatTime(fixture.kickoffAt)} />
        <FixtureInfo
          icon={MapPinned}
          text={`${fixture.venueName || "Sin estadio"}${
            fixture.venueCity ? ` · ${fixture.venueCity}` : ""
          }`}
        />
        <FixtureInfo
          icon={NotebookTabs}
          text={fixture.roundLabel || "Sin fecha cargada"}
        />
      </div>

      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 font-black text-black transition disabled:cursor-not-allowed disabled:opacity-55"
        style={buildPrimaryButtonStyle(theme)}
        title={disabledReason ?? undefined}
      >
        {disabledReason ?? "Seleccionar partido"}
      </button>
    </article>
  );
}

function RoleSelectionModal({
  fixture,
  roles,
  selectedRoleKey,
  observations,
  onSelectRole,
  onChangeObservations,
  onClose,
  onConfirm,
  submitting,
  theme,
  isEditing,
}: {
  fixture: MatchFixtureListItem;
  roles: Array<MatchesCatalogResponse["roles"][number]>;
  selectedRoleKey: RefereeRoleKey | "";
  observations: string;
  onSelectRole: (value: RefereeRoleKey) => void;
  onChangeObservations: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  isEditing: boolean;
}) {
  const selectedRole = roles.find((item) => item.role_key === selectedRoleKey) ?? null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-4xl items-center">
        <div className="max-h-full w-full overflow-y-auto rounded-[34px] border border-white/10 bg-[#071019] p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.28em]"
                style={{ color: theme.accent }}
              >
                FUNCION ARBITRAL
              </p>
              <h2 className="mt-3 text-3xl font-black">
                {fixture.homeTeamName} vs {fixture.awayTeamName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Selecciona la funcion con la que fuiste designado y revisa el resumen
                antes de confirmar.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-white/20 hover:text-white"
              aria-label="Cerrar selector de funcion"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Funciones disponibles
              </p>
              <div className="mt-4 grid gap-3">
                {roles.map((role) => {
                  const active = role.role_key === selectedRoleKey;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => onSelectRole(role.role_key)}
                      className={`rounded-[22px] border px-4 py-4 text-left text-sm font-black transition ${
                        active
                          ? "text-black"
                          : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:text-white"
                      }`}
                      style={active ? buildAccentButtonStyle(theme) : undefined}
                    >
                      {role.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-5">
                <TextAreaField
                  label="Observaciones"
                  value={observations}
                  onChange={onChangeObservations}
                  placeholder="Fuente de la designacion, nota personal o detalle operativo."
                />
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Resumen
              </p>
              <div className="mt-4 grid gap-3">
                <SummaryRow
                  label="Partido"
                  value={`${fixture.homeTeamName} vs ${fixture.awayTeamName}`}
                />
                <SummaryRow
                  label="Fecha"
                  value={formatDateLong(fixture.kickoffAt)}
                />
                <SummaryRow label="Hora" value={formatTime(fixture.kickoffAt)} />
                <SummaryRow
                  label="Estadio"
                  value={fixture.venueName || "Sin estadio"}
                />
                <SummaryRow
                  label="Competicion"
                  value={`${fixture.competitionName || "Competicion"}${
                    fixture.categoryName ? ` · ${fixture.categoryName}` : ""
                  }`}
                />
                <SummaryRow
                  label="Funcion elegida"
                  value={selectedRole?.label ?? "Selecciona una funcion"}
                />
                <SummaryRow
                  label="Fuente de la designacion"
                  value={appointmentSourceLabels.manual}
                />
              </div>

              <button
                type="button"
                onClick={onConfirm}
                disabled={submitting || !selectedRole}
                className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-5 font-black text-black transition disabled:cursor-not-allowed disabled:opacity-60"
                style={buildPrimaryButtonStyle(theme)}
              >
                {submitting
                  ? "Guardando..."
                  : isEditing
                    ? "Guardar cambio de designacion"
                    : "Confirmar mi designacion"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactAppointmentCard({
  appointment,
  onEdit,
}: {
  appointment: MatchAppointmentListItem;
  onEdit?: () => void;
}) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge label={appointment.statusLabel} tone="dark" />
            <Badge label={appointment.roleLabel} tone="dark" />
          </div>
          <h3 className="mt-3 text-xl font-black text-white">{appointment.matchLabel}</h3>
          <p className="mt-1 text-sm font-bold text-zinc-400">
            {appointment.competitionName || "Competicion"}{" "}
            {appointment.categoryName ? `· ${appointment.categoryName}` : ""}
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {formatDateLong(appointment.kickoffAt)} · {formatTime(appointment.kickoffAt)}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Link
            href={`/matches/${appointment.appointmentId}`}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
          >
            Ver ficha
          </Link>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
            >
              Modificar
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EmptyFixtureState({
  theme,
  showManualFallback,
  automationStatus,
  onToggleManual,
}: {
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  showManualFallback: boolean;
  automationStatus: MatchesCatalogResponse["automationStatus"] | null;
  onToggleManual: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-center">
      <p className="text-lg font-black text-white">
        No encontramos partidos para esta competicion y fecha.
      </p>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
        {automationStatus?.message
          ? `${automationStatus.message} Puedes cambiar los filtros, registrar el partido manualmente o solicitar la carga a la institucion.`
          : "Puedes cambiar los filtros, registrar el partido manualmente o solicitar la carga a la institucion."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onToggleManual}
          className="inline-flex min-h-12 items-center justify-center rounded-2xl px-5 font-black text-black transition"
          style={buildPrimaryButtonStyle(theme)}
        >
          {showManualFallback
            ? "Ocultar registro manual"
            : "Registrar partido manualmente"}
        </button>
        <Link
          href="/institutional"
          className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-5 font-black text-zinc-200 transition hover:border-white/20 hover:text-white"
        >
          Solicitar carga a la institucion
        </Link>
      </div>
    </div>
  );
}

function AutomationStatusNotice({
  theme,
  status,
}: {
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  status: NonNullable<MatchesCatalogResponse["automationStatus"]>;
}) {
  const automatic = status.mode === "automatic";
  const iconColor = automatic ? theme.accent : "#facc15";
  const borderColor = automatic ? `${theme.accent}40` : "rgba(250, 204, 21, 0.28)";
  const backgroundColor = automatic ? `${theme.accentSoft}` : "rgba(250, 204, 21, 0.08)";

  return (
    <div
      className="mb-5 rounded-[24px] border px-4 py-4"
      style={{
        borderColor,
        background: backgroundColor,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
          style={{
            borderColor,
            color: iconColor,
          }}
        >
          {automatic ? <Sparkles size={18} /> : <ShieldCheck size={18} />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.18em]" style={{ color: iconColor }}>
            {automatic ? "Sincronizacion automatica" : "Cobertura del proveedor"}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-200">{status.message}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {status.provider ? `Proveedor: ${status.provider}` : "Proveedor no definido"}
            {status.lastSyncAt ? ` · Ultima actualizacion ${formatDateTime(status.lastSyncAt)}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <div className="mt-2 flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-[#101b24] px-4">
        <Search size={16} className="text-zinc-500" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Buscar por nombre de equipo"
          className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-zinc-600"
        />
      </div>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none placeholder:text-zinc-600"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600"
      />
    </label>
  );
}

function ToggleField({
  label,
  value,
  disabled,
  onChange,
  theme,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-3">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </p>
        <p className="mt-1 text-sm font-bold text-zinc-300">
          {disabled ? "Solo disponible para futbol 11." : "Activa o desactiva soporte VAR."}
        </p>
      </div>
      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-[#101b24] p-1">
        {[false, true].map((item) => {
          const active = item === value;
          return (
            <button
              key={String(item)}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item)}
              className={`min-h-9 rounded-xl px-4 text-xs font-black transition ${
                active ? "text-black" : "text-zinc-400"
              }`}
              style={active ? buildAccentButtonStyle(theme) : undefined}
            >
              {item ? "Si" : "No"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Notice({
  theme,
  tone,
  children,
}: {
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
  tone: "success" | "error" | "warning";
  children: ReactNode;
}) {
  const classes =
    tone === "success"
      ? "text-white"
      : tone === "warning"
        ? "border-amber-400/25 bg-amber-400/10 text-amber-100"
        : "border-red-500/25 bg-red-500/10 text-red-200";
  const style = tone === "success" ? buildAccentBadgeStyle(theme) : undefined;

  return (
    <div
      className={`rounded-3xl border p-4 text-sm font-bold leading-6 ${classes}`}
      style={style}
    >
      {children}
    </div>
  );
}

function MatchesSetupNotice({
  error,
  setupIssue,
}: {
  error: string | null;
  setupIssue: MatchesSetupIssue;
}) {
  return (
    <section className="rounded-[32px] border border-amber-500/30 bg-amber-500/10 p-6 shadow-2xl">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-200">
        Configuracion pendiente
      </p>
      <h2 className="mt-3 text-3xl font-black text-white">
        Mis partidos necesita su migracion base
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-amber-50/85">
        El modulo ya esta integrado en la app, pero la base activa todavia no
        tiene el esquema necesario para cargar el catalogo y mostrar esta vista.
      </p>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200">
        <p>
          Aplica la migracion{" "}
          <code>
            {setupIssue.migrationId ?? "202607130001_matches_foundation.sql"}
          </code>{" "}
          y vuelve a cargar esta pantalla.
        </p>
        {setupIssue.missingTables.length > 0 ? (
          <p className="mt-3 text-zinc-300">
            Tablas detectadas como ausentes: {setupIssue.missingTables.join(", ")}.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-zinc-400">Detalle: {error}</p> : null}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  theme,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarDays;
  theme: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
      <Icon className="h-5 w-5" style={{ color: theme.accent }} />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs font-bold text-zinc-400">{detail}</p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  text,
}: {
  icon: typeof CalendarDays;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-300">
      <Icon className="h-4 w-4 text-zinc-500" />
      <span>{text}</span>
    </div>
  );
}

function FixtureInfo({
  icon: Icon,
  text,
}: {
  icon: typeof CalendarDays;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-zinc-300">
      <Icon className="h-4 w-4 text-zinc-500" />
      <span>{text}</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function Badge({
  label,
  tone,
  theme,
}: {
  label: string;
  tone: "accent" | "dark";
  theme?: ReturnType<typeof getDisciplineDefinition>["theme"];
}) {
  const classes =
    tone === "accent"
      ? "text-white"
      : "border-white/10 bg-white/[0.04] text-zinc-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${classes}`}
      style={tone === "accent" && theme ? buildAccentBadgeStyle(theme) : undefined}
    >
      {label}
    </span>
  );
}

function buildInitialFilters(sportType: SportType): FiltersState {
  return {
    sportType,
    countryId: "",
    associationId: "",
    competitionId: "",
    categoryId: "",
    selectedDate: getNextSaturdayDateKey(),
    teamSearch: "",
  };
}

function buildInitialManualForm(sportType: SportType, selectedDate: string): ManualFormState {
  return {
    kickoffAt: buildDefaultKickoff(selectedDate),
    seasonLabel: "",
    homeTeamName: "",
    awayTeamName: "",
    venueName: "",
    venueCity: "",
    roleKey: sportType === "futsal" ? "first_referee" : "referee",
    varEnabled: false,
    observations: "",
  };
}

function resolveDefaultFilters(catalog: MatchesCatalogResponse, sportType: SportType) {
  const countryId = findIdByName(catalog.countries, catalog.actor.profile.country);
  const associationId = findIdByName(
    catalog.associations.filter((item) =>
      countryId ? item.country_id === countryId : true
    ),
    catalog.actor.profile.association
  );
  const categoryId = findIdByName(
    catalog.categories.filter((item) => item.sport_type === sportType),
    catalog.actor.profile.category
  );

  if (!countryId && !associationId && !categoryId) return null;

  return {
    countryId,
    associationId,
    categoryId,
  };
}

function findIdByName<T extends { id: string; name: string }>(
  items: T[],
  value: string | null
) {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;
  const matches = items.filter((item) => normalizeText(item.name) === normalized);
  if (matches.length !== 1) return undefined;
  return matches[0]?.id;
}

function getAvailableRolesForFixture(
  catalog: MatchesCatalogResponse,
  fixture: MatchFixtureListItem
) {
  const roles = catalog.roles.filter(
    (item) => item.sport_type === fixture.sportType && item.is_active !== false
  );
  const eligibilityRows = catalog.eligibilities.filter(
    (item) =>
      item.sport_type === fixture.sportType &&
      item.is_active !== false
  );
  const hasEligibilityMatrix = eligibilityRows.length > 0;

  return roles.filter((role) => {
    if (!fixture.varEnabled && (role.role_key === "var" || role.role_key === "avar")) {
      return false;
    }

    if (!hasEligibilityMatrix) {
      return true;
    }

    const matchingRows = eligibilityRows.filter((item) => item.role_id === role.id);
    if (!matchingRows.length) return false;

    return matchingRows.some((item) => {
      if ((item.eligibility_mode ?? "eligible") !== "eligible") return false;
      if (item.country_id && item.country_id !== fixture.countryId) return false;
      if (item.association_id && item.association_id !== fixture.associationId) return false;
      if (item.competition_id && item.competition_id !== fixture.competitionId) return false;
      if (item.category_id && item.category_id !== fixture.categoryId) return false;
      return true;
    });
  });
}

function getManualRoleOptions(
  catalog: MatchesCatalogResponse,
  sportType: SportType,
  varEnabled: boolean
) {
  return catalog.roles
    .filter((item) => item.sport_type === sportType && item.is_active !== false)
    .filter((item) => varEnabled || (item.role_key !== "var" && item.role_key !== "avar"))
    .map((item) => ({
      value: item.role_key,
      label: item.label,
    }));
}

function resolveSeasonLabel(
  catalog: MatchesCatalogResponse | null,
  competitionId: string,
  categoryId: string
) {
  if (!catalog) return "";

  if (categoryId) {
    const category = catalog.categories.find((item) => item.id === categoryId);
    if (category?.season_id) {
      const season = catalog.seasons.find((item) => item.id === category.season_id);
      if (season?.label) return season.label;
    }
  }

  if (competitionId) {
    const seasons = catalog.seasons.filter((item) => item.competition_id === competitionId);
    const activeSeason =
      seasons.find((item) => item.status === "active") ??
      seasons[0] ??
      null;
    return activeSeason?.label ?? "";
  }

  return "";
}

function buildDateRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString(),
  };
}

function buildDefaultKickoff(dateKey: string) {
  return `${dateKey}T18:00`;
}

function normalizeDateTimeLocal(value: string) {
  const trimmedValue = String(value ?? "").trim();
  if (!trimmedValue) return trimmedValue;
  return new Date(trimmedValue).toISOString();
}

function buildHeroStyle(theme: ReturnType<typeof getDisciplineDefinition>["theme"]): CSSProperties {
  return {
    background: `radial-gradient(circle at top left, ${theme.accentSoft}, transparent 38%), #0d1720`,
    boxShadow: `0 32px 80px ${theme.glow}`,
  };
}

function buildPrimaryButtonStyle(
  theme: ReturnType<typeof getDisciplineDefinition>["theme"]
): CSSProperties {
  return {
    backgroundColor: theme.button,
    color: "#04110a",
    boxShadow: `0 0 24px ${theme.glow}`,
  };
}

function buildAccentButtonStyle(
  theme: ReturnType<typeof getDisciplineDefinition>["theme"]
): CSSProperties {
  return {
    backgroundColor: theme.button,
    borderColor: theme.border,
    boxShadow: `0 0 20px ${theme.glow}`,
  };
}

function buildAccentBadgeStyle(
  theme: ReturnType<typeof getDisciplineDefinition>["theme"]
): CSSProperties {
  return {
    borderColor: theme.border,
    backgroundColor: theme.accentSoft,
    color: "#ffffff",
  };
}

function buildDayButtonClass(active: boolean) {
  return `min-h-11 rounded-2xl border px-4 text-sm font-black transition ${
    active
      ? "border-transparent text-black"
      : "border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20"
  }`;
}

function getNextSaturdayDateKey() {
  const now = new Date();
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilSaturday = day <= 6 ? (6 - day + 7) % 7 || 7 : 6;
  next.setDate(next.getDate() + daysUntilSaturday);
  return toDateKey(next);
}

function getWeekendAnchorDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();

  if (day === 6) return date;
  if (day === 0) return addDays(date, -1);
  return addDays(date, 6 - day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLong(value: string | Date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function formatDayMonth(value: string | Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getCountdownLabel(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "en curso o pasada";

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getPreparationStateLabel(appointment: MatchAppointmentListItem) {
  if (appointment.hasPostMatchReview) return "Cierre completado";
  if (appointment.hasPreparations) return "Preparacion iniciada";
  if (appointment.linkedPerformanceCount > 0 || appointment.linkedPsychologyCount > 0) {
    return "Check-ins registrados";
  }
  return "Pendiente";
}

function filterFixtureByTeamSearch(
  fixture: MatchFixtureListItem,
  teamSearch: string
) {
  const normalizedSearch = normalizeText(teamSearch);
  if (!normalizedSearch) return true;

  const haystack = normalizeText(
    `${fixture.homeTeamName} ${fixture.awayTeamName} ${fixture.competitionName ?? ""}`
  );
  return haystack.includes(normalizedSearch);
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildFiltersSummary(
  filters: FiltersState,
  countryName?: string | null,
  associationName?: string | null,
  competitionName?: string | null,
  categoryName?: string | null
) {
  const parts = [
    filters.sportType === "futsal" ? "Futsal" : "Futbol 11",
    countryName || "Todos los paises",
    associationName || "Todas las asociaciones",
    competitionName || "Todas las competiciones",
    categoryName || "Todas las categorias",
  ];

  return parts.join(" · ");
}

function formatApiError(payload: MatchesApiErrorPayload) {
  if (payload.setupRequired) {
    return payload.error ?? "Falta aplicar la base de datos de Mis partidos.";
  }

  if (!payload.technical) return payload.error ?? "No se pudo completar la accion.";
  return `${payload.error ?? "No se pudo completar la accion."} ${payload.technical}`;
}

function extractSetupIssue(payload: MatchesApiErrorPayload): MatchesSetupIssue | null {
  if (!payload.setupRequired) return null;
  return {
    missingTables: Array.isArray(payload.missingTables) ? payload.missingTables : [],
    migrationId: payload.migrationId ?? null,
  };
}

function normalizeConflict(conflict: MatchesApiErrorPayload["conflict"]) {
  if (!conflict?.appointmentId || !conflict.matchLabel || !conflict.kickoffAt) {
    return null;
  }

  return {
    appointmentId: conflict.appointmentId,
    matchLabel: conflict.matchLabel,
    kickoffAt: conflict.kickoffAt,
    roleLabel: conflict.roleLabel ?? "Rol sin definir",
  };
}
