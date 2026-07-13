"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Clock3,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TimerReset,
  Trophy,
} from "lucide-react";
import type {
  MatchAppointmentListItem,
  MatchesCatalogResponse,
} from "@/lib/matches/api";
import { DEFAULT_SPORT_TYPE, type SportType } from "@/lib/sports";

type MatchesLoadResult =
  | {
      ok: true;
      catalog: MatchesCatalogResponse;
      appointments: MatchAppointmentListItem[];
      scope: "self" | "institution" | "admin";
    }
  | {
      ok: false;
      error: string;
      setupIssue: MatchesSetupIssue | null;
    };

type AppointmentCreateResult =
  | {
      ok: true;
      appointmentId: string;
    }
  | {
      ok: false;
      error: string;
      setupIssue: MatchesSetupIssue | null;
    };

type MatchesSetupIssue = {
  missingTables: string[];
  migrationId: string | null;
};

type ManualFormState = {
  sportType: SportType;
  countryName: string;
  countryCode: string;
  associationName: string;
  competitionName: string;
  categoryName: string;
  seasonLabel: string;
  roundLabel: string;
  matchdayNumber: string;
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName: string;
  venueCity: string;
  refereeSystem: string;
  varEnabled: boolean;
  roleKey: string;
  status: "draft" | "pending_confirmation" | "confirmed";
  observations: string;
};

const initialForm: ManualFormState = {
  sportType: DEFAULT_SPORT_TYPE,
  countryName: "",
  countryCode: "",
  associationName: "",
  competitionName: "",
  categoryName: "",
  seasonLabel: "",
  roundLabel: "",
  matchdayNumber: "",
  kickoffAt: "",
  homeTeamName: "",
  awayTeamName: "",
  venueName: "",
  venueCity: "",
  refereeSystem: "",
  varEnabled: false,
  roleKey: "",
  status: "pending_confirmation",
  observations: "",
};

export function MatchesHubClient() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<MatchesCatalogResponse | null>(null);
  const [appointments, setAppointments] = useState<MatchAppointmentListItem[]>([]);
  const [scope, setScope] = useState<"self" | "institution" | "admin">("self");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupIssue, setSetupIssue] = useState<MatchesSetupIssue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAllCompetitions, setShowAllCompetitions] = useState(false);
  const [form, setForm] = useState<ManualFormState>({
    ...initialForm,
    kickoffAt: buildDefaultKickoff(),
  });

  useEffect(() => {
    void loadData("self");
  }, []);

  useEffect(() => {
    if (!catalog) return;

    setForm((current) => {
      const nextRoleKey = resolveFirstRoleKey(catalog, current.sportType, current.varEnabled);

      return {
        ...current,
        countryName: current.countryName || catalog.actor.profile.country || "",
        associationName:
          current.associationName || catalog.actor.profile.association || "",
        categoryName: current.categoryName || catalog.actor.profile.category || "",
        roleKey: current.roleKey || nextRoleKey,
      };
    });
  }, [catalog]);

  const sportsRoles = useMemo(() => {
    if (!catalog) return [];
    const hasEligibilityMatrix = catalog.eligibilities.some(
      (item) => item.sport_type === form.sportType
    );
    const eligibleRoleIds = new Set(
      catalog.eligibilities
        .filter(
          (item) =>
            item.sport_type === form.sportType &&
            item.eligibility_mode === "eligible"
        )
        .map((item) => item.role_id)
    );

    return catalog.roles.filter((role) => {
      if (role.sport_type !== form.sportType) return false;
      if (!form.varEnabled && (role.role_key === "var" || role.role_key === "avar")) {
        return false;
      }
      if (!hasEligibilityMatrix) return true;
      return eligibleRoleIds.has(role.id);
    });
  }, [catalog, form.sportType, form.varEnabled]);

  const countrySuggestions = useMemo(() => {
    return catalog?.countries.map((item) => item.name) ?? [];
  }, [catalog]);

  const associationSuggestions = useMemo(() => {
    if (!catalog) return [];
    return catalog.associations
      .filter((item) => {
        if (!form.countryName.trim()) return true;
        const country = catalog.countries.find((countryItem) => countryItem.id === item.country_id);
        return country?.name?.toLowerCase() === form.countryName.trim().toLowerCase();
      })
      .map((item) => item.name);
  }, [catalog, form.countryName]);

  const competitionSuggestions = useMemo(() => {
    if (!catalog) return [];

    const allowedCompetitionIds = new Set(
      catalog.eligibilities
        .filter(
          (item) =>
            item.sport_type === form.sportType &&
            item.eligibility_mode === "eligible" &&
            item.competition_id
        )
        .map((item) => item.competition_id as string)
    );
    const hasEligibilityMatrix = allowedCompetitionIds.size > 0;

    return catalog.competitions
      .filter((item) => item.sport_type === form.sportType)
      .filter((item) => {
        if (!form.associationName.trim()) return true;
        const association = catalog.associations.find(
          (associationItem) => associationItem.id === item.association_id
        );
        return (
          association?.name?.toLowerCase() === form.associationName.trim().toLowerCase()
        );
      })
      .filter((item) => {
        if (!hasEligibilityMatrix || showAllCompetitions) return true;
        return allowedCompetitionIds.has(item.id);
      })
      .map((item) => item.name);
  }, [catalog, form.associationName, form.sportType, showAllCompetitions]);

  const categorySuggestions = useMemo(() => {
    if (!catalog) return [];

    const matchingCompetition = catalog.competitions.find(
      (item) =>
        item.sport_type === form.sportType &&
        item.name.toLowerCase() === form.competitionName.trim().toLowerCase()
    );

    const allowedCategoryIds = new Set(
      catalog.eligibilities
        .filter(
          (item) =>
            item.sport_type === form.sportType &&
            item.eligibility_mode === "eligible" &&
            item.category_id
        )
        .map((item) => item.category_id as string)
    );
    const hasEligibilityMatrix = allowedCategoryIds.size > 0;

    return catalog.categories
      .filter((item) => item.sport_type === form.sportType)
      .filter((item) => {
        if (!matchingCompetition) return true;
        return item.competition_id === matchingCompetition.id;
      })
      .filter((item) => {
        if (!hasEligibilityMatrix || showAllCompetitions) return true;
        return allowedCategoryIds.has(item.id);
      })
      .map((item) => item.name);
  }, [catalog, form.competitionName, form.sportType, showAllCompetitions]);

  const upcomingAppointments = useMemo(
    () =>
      [...appointments]
        .filter((item) =>
          ["draft", "pending_confirmation", "confirmed", "modified"].includes(item.status)
        )
        .sort(
          (a, b) =>
            new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
        ),
    [appointments]
  );

  const recentAppointments = useMemo(
    () =>
      [...appointments]
        .filter((item) =>
          ["completed", "cancelled", "postponed", "suspended"].includes(item.status)
        )
        .sort(
          (a, b) =>
            new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime()
        ),
    [appointments]
  );

  async function loadData(nextScope: "self" | "institution" | "admin") {
    setLoading(true);
    setError(null);
    setSetupIssue(null);

    const result = await fetchMatchesData(nextScope);
    if (!result.ok) {
      setError(result.error);
      setSetupIssue(result.setupIssue);
      setLoading(false);
      return;
    }

    setCatalog(result.catalog);
    setAppointments(result.appointments);
    setScope(result.scope);
    setSetupIssue(null);
    setLoading(false);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    setSetupIssue(null);
    setMessage(null);

    const result = await createManualAppointment(form);
    if (!result.ok) {
      setError(result.error);
      setSetupIssue(result.setupIssue);
      setSaving(false);
      return;
    }

    setMessage("Designacion registrada. Ya puedes abrir la ficha operativa del partido.");
    setSaving(false);
    router.push(`/matches/${result.appointmentId}`);
  }

  if (loading) {
    return (
      <div className="rounded-[32px] border border-white/10 bg-[#071019] p-6 text-zinc-300">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-[#6fc11f]" />
          Cargando Mis partidos...
        </div>
      </div>
    );
  }

  if (!catalog) {
    if (setupIssue) {
      return <MatchesSetupNotice error={error} setupIssue={setupIssue} />;
    }

    return <Notice tone="error">{error ?? "No se pudo cargar el modulo Mis partidos."}</Notice>;
  }

  const fallbackModeLabel =
    catalog.fallbackMode === "manual_assisted"
      ? "Modo manual asistido"
      : "Matriz de elegibilidad activa";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(111,193,31,0.18),transparent_38%),#0d1720] p-6 shadow-2xl sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.38em] text-[#6fc11f]">
              MIS PARTIDOS
            </p>
            <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
              Cada designacion se convierte en un proceso de preparacion
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-base">
              Registra tu partido, prepara foco tecnico, carga fisica y rutina mental,
              y deja conectado el seguimiento con Ref Performance y Psicologia Arbitral.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Badge label={fallbackModeLabel} tone="green" />
              <Badge
                label={
                  catalog.supportsInstitutionAssignments
                    ? "Vista institucional habilitada"
                    : "Uso individual activo"
                }
                tone="dark"
              />
              <Badge
                label={`Perfil: ${catalog.actor.profile.displayName}`}
                tone="dark"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={CalendarDays}
              label="Proximos partidos"
              value={String(upcomingAppointments.length)}
              detail="Designaciones activas"
            />
            <MetricCard
              icon={ShieldCheck}
              label="Confirmadas"
              value={String(
                appointments.filter((item) => item.status === "confirmed").length
              )}
              detail="Listas para competir"
            />
            <MetricCard
              icon={TimerReset}
              label="Preparacion"
              value={String(
                appointments.filter((item) => item.hasPreparations).length
              )}
              detail="Partidos con checklists"
            />
            <MetricCard
              icon={Trophy}
              label="Completadas"
              value={String(
                appointments.filter((item) => item.status === "completed").length
              )}
              detail="Historial con cierre"
            />
          </div>
        </div>
      </section>

      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-[#6fc11f]">
                Alta manual
              </p>
              <h2 className="mt-3 text-2xl font-black">Registrar designacion</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Usa catalogos sugeridos si existen y completa manualmente si la competencia
                todavia no fue cargada.
              </p>
            </div>
            <Sparkles className="h-8 w-8 text-[#6fc11f]" />
          </div>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectPillGroup
                label="Disciplina"
                value={form.sportType}
                options={[
                  { value: "football_11", label: "Futbol 11" },
                  { value: "futsal", label: "Futsal" },
                ]}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    sportType: value as SportType,
                    roleKey: resolveFirstRoleKey(
                      catalog,
                      value as SportType,
                      current.varEnabled
                    ),
                    varEnabled: value === "football_11" ? current.varEnabled : false,
                  }))
                }
              />
              <SelectPillGroup
                label="Estado inicial"
                value={form.status}
                options={[
                  { value: "pending_confirmation", label: "Pendiente" },
                  { value: "confirmed", label: "Confirmada" },
                  { value: "draft", label: "Borrador" },
                ]}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as ManualFormState["status"],
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DatalistField
                label="Pais"
                value={form.countryName}
                options={countrySuggestions}
                onChange={(value) =>
                  setForm((current) => ({ ...current, countryName: value }))
                }
              />
              <Field
                label="Codigo pais (opcional)"
                value={form.countryCode}
                onChange={(value) =>
                  setForm((current) => ({ ...current, countryCode: value.toUpperCase() }))
                }
                placeholder="ARG, BRA, URU"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DatalistField
                label="Asociacion"
                value={form.associationName}
                options={associationSuggestions}
                onChange={(value) =>
                  setForm((current) => ({ ...current, associationName: value }))
                }
              />
              <DatalistField
                label="Competicion"
                value={form.competitionName}
                options={competitionSuggestions}
                onChange={(value) =>
                  setForm((current) => ({ ...current, competitionName: value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <DatalistField
                label="Categoria"
                value={form.categoryName}
                options={categorySuggestions}
                onChange={(value) =>
                  setForm((current) => ({ ...current, categoryName: value }))
                }
              />
              <Field
                label="Temporada"
                value={form.seasonLabel}
                onChange={(value) =>
                  setForm((current) => ({ ...current, seasonLabel: value }))
                }
                placeholder="Torneo 2026"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <input
                id="show-all-competitions"
                type="checkbox"
                checked={showAllCompetitions}
                onChange={(event) => setShowAllCompetitions(event.target.checked)}
                className="h-4 w-4 rounded border-white/10 bg-black/20 accent-[#6fc11f]"
              />
              <label
                htmlFor="show-all-competitions"
                className="text-sm font-bold text-zinc-300"
              >
                Ver todas las competiciones y categorias cargadas, aunque no esten en mi
                matriz actual.
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Fecha y hora"
                type="datetime-local"
                value={form.kickoffAt}
                onChange={(value) =>
                  setForm((current) => ({ ...current, kickoffAt: value }))
                }
              />
              <Field
                label="Fecha / ronda"
                value={form.roundLabel}
                onChange={(value) =>
                  setForm((current) => ({ ...current, roundLabel: value }))
                }
                placeholder="Fecha 18"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Numero de fecha (opcional)"
                type="number"
                value={form.matchdayNumber}
                onChange={(value) =>
                  setForm((current) => ({ ...current, matchdayNumber: value }))
                }
                placeholder="18"
              />
              <Field
                label="Sistema arbitral"
                value={form.refereeSystem}
                onChange={(value) =>
                  setForm((current) => ({ ...current, refereeSystem: value }))
                }
                placeholder={form.sportType === "futsal" ? "2 arbitros + mesa" : "Arbitro + asistentes"}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Equipo local"
                value={form.homeTeamName}
                onChange={(value) =>
                  setForm((current) => ({ ...current, homeTeamName: value }))
                }
              />
              <Field
                label="Equipo visitante"
                value={form.awayTeamName}
                onChange={(value) =>
                  setForm((current) => ({ ...current, awayTeamName: value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Estadio"
                value={form.venueName}
                onChange={(value) =>
                  setForm((current) => ({ ...current, venueName: value }))
                }
                placeholder="Nombre del estadio o gimnasio"
              />
              <Field
                label="Ciudad"
                value={form.venueCity}
                onChange={(value) =>
                  setForm((current) => ({ ...current, venueCity: value }))
                }
                placeholder="Ciudad"
              />
            </div>

            {form.sportType === "football_11" && (
              <ToggleRow
                label="El partido utiliza VAR?"
                value={form.varEnabled}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    varEnabled: value,
                    roleKey:
                      current.roleKey === "var" || current.roleKey === "avar"
                        ? resolveFirstRoleKey(catalog, current.sportType, value)
                        : current.roleKey,
                  }))
                }
              />
            )}

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Funcion arbitral
              </span>
              <select
                value={form.roleKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, roleKey: event.target.value }))
                }
                className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none"
              >
                {sportsRoles.map((role) => (
                  <option key={role.id} value={role.role_key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                Observaciones
              </span>
              <textarea
                value={form.observations}
                onChange={(event) =>
                  setForm((current) => ({ ...current, observations: event.target.value }))
                }
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-zinc-600"
                placeholder="Horario de salida, observacion institucional, situacion del encuentro o nota personal."
              />
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="min-h-14 rounded-2xl bg-[#6fc11f] px-6 font-black text-black transition hover:bg-[#82dc2a] disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Registrando..." : "Registrar partido y abrir ficha"}
            </button>
          </div>
        </article>

        <article className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-[#6fc11f]">
                Agenda operativa
              </p>
              <h2 className="mt-3 text-2xl font-black">Proximos partidos</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Tus designaciones activas aparecen aca con acceso directo a la ficha.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadData("self")}
                className={`rounded-full border px-3 py-2 text-xs font-black ${
                  scope === "self"
                    ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                    : "border-white/10 bg-white/[0.04] text-zinc-300"
                }`}
              >
                Mis designaciones
              </button>
              {catalog.actor.canManageInstitution && (
                <button
                  type="button"
                  onClick={() => void loadData("institution")}
                  className={`rounded-full border px-3 py-2 text-xs font-black ${
                    scope === "institution"
                      ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                      : "border-white/10 bg-white/[0.04] text-zinc-300"
                  }`}
                >
                  Vista institucional
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {upcomingAppointments.length === 0 ? (
              <EmptyState
                title="Todavia no hay partidos activos"
                description="Registra tu primera designacion manual para activar la ficha operativa, los check-ins y el seguimiento post partido."
              />
            ) : (
              upcomingAppointments.slice(0, 8).map((item) => (
                <AppointmentCard key={item.appointmentId} item={item} />
              ))
            )}
          </div>
        </article>
      </section>

      <section className="rounded-[32px] border border-white/10 bg-[#071019] p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#6fc11f]">
              Historial
            </p>
            <h2 className="mt-3 text-2xl font-black">Partidos cerrados o reprogramados</h2>
          </div>
          <Target className="h-7 w-7 text-[#6fc11f]" />
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {recentAppointments.length === 0 ? (
            <EmptyState
              title="Sin historial todavia"
              description="Cuando cierres tu primer partido, aca vas a ver el recorrido junto con el enlace al post partido."
            />
          ) : (
            recentAppointments.slice(0, 8).map((item) => (
              <AppointmentCard key={item.appointmentId} item={item} compact />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

async function fetchMatchesData(
  scope: "self" | "institution" | "admin"
): Promise<MatchesLoadResult> {
  try {
    const [catalogResponse, appointmentsResponse] = await Promise.all([
      fetch("/api/matches/catalog", { cache: "no-store" }),
      fetch(`/api/matches/appointments?scope=${scope}`, { cache: "no-store" }),
    ]);

    const catalogPayload = (await catalogResponse.json().catch(() => ({}))) as unknown;
    const appointmentsPayload = (await appointmentsResponse
      .json()
      .catch(() => ({}))) as unknown;

    if (!catalogResponse.ok) {
      const catalogErrorPayload = catalogPayload as MatchesApiErrorPayload;
      return {
        ok: false,
        error: formatApiError(catalogErrorPayload),
        setupIssue: extractSetupIssue(catalogErrorPayload),
      };
    }

    if (!appointmentsResponse.ok) {
      const appointmentsErrorPayload = appointmentsPayload as MatchesApiErrorPayload;
      return {
        ok: false,
        error: formatApiError(appointmentsErrorPayload),
        setupIssue: extractSetupIssue(appointmentsErrorPayload),
      };
    }

    const catalogData = catalogPayload as MatchesCatalogResponse;
    const appointmentsData = appointmentsPayload as MatchesAppointmentsPayload;

    return {
      ok: true,
      catalog: catalogData,
      appointments: Array.isArray(appointmentsData.appointments)
        ? appointmentsData.appointments
        : [],
      scope: appointmentsData.scope ?? scope,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo conectar con Mis partidos.",
      setupIssue: null,
    };
  }
}

async function createManualAppointment(
  form: ManualFormState
): Promise<AppointmentCreateResult> {
  try {
    const response = await fetch("/api/matches/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sportType: form.sportType,
        countryName: form.countryName,
        countryCode: form.countryCode || null,
        associationName: form.associationName,
        competitionName: form.competitionName,
        categoryName: form.categoryName,
        seasonLabel: form.seasonLabel,
        roundLabel: form.roundLabel || null,
        matchdayNumber: form.matchdayNumber ? Number(form.matchdayNumber) : null,
        kickoffAt: new Date(form.kickoffAt).toISOString(),
        homeTeamName: form.homeTeamName,
        awayTeamName: form.awayTeamName,
        venueName: form.venueName || null,
        venueCity: form.venueCity || null,
        refereeSystem: form.refereeSystem || null,
        varEnabled: form.varEnabled,
        roleKey: form.roleKey,
        status: form.status,
        observations: form.observations || null,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      appointment?: { id?: string };
      error?: string;
      technical?: string;
      setupRequired?: boolean;
      missingTables?: string[];
      migrationId?: string | null;
    };

    if (!response.ok) {
      return {
        ok: false,
        error: formatApiError(payload),
        setupIssue: extractSetupIssue(payload),
      };
    }

    const appointmentId = payload.appointment?.id;
    if (!appointmentId) {
      return {
        ok: false,
        error: "La designacion se creo sin id de retorno.",
        setupIssue: null,
      };
    }

    return { ok: true, appointmentId };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo registrar la designacion.",
      setupIssue: null,
    };
  }
}

type MatchesApiErrorPayload = {
  error?: string;
  technical?: string;
  setupRequired?: boolean;
  missingTables?: string[];
  migrationId?: string | null;
};

type MatchesAppointmentsPayload = {
  actor?: MatchesCatalogResponse["actor"];
  appointments?: MatchAppointmentListItem[];
  scope?: "self" | "institution" | "admin";
};

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

function resolveFirstRoleKey(
  catalog: MatchesCatalogResponse,
  sportType: SportType,
  varEnabled: boolean
) {
  const fallbackRole =
    catalog.roles.find(
      (role) =>
        role.sport_type === sportType &&
        (varEnabled || (role.role_key !== "var" && role.role_key !== "avar"))
    ) ?? null;

  return fallbackRole?.role_key ?? "other";
}

function buildDefaultKickoff() {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + 1);
  nextDate.setHours(18, 0, 0, 0);

  const offset = nextDate.getTimezoneOffset();
  const localDate = new Date(nextDate.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AppointmentCard({
  item,
  compact = false,
}: {
  item: MatchAppointmentListItem;
  compact?: boolean;
}) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge label={item.statusLabel} tone="green" />
            <Badge label={item.sourceLabel} tone="dark" />
            <Badge label={item.sportType === "futsal" ? "Futsal" : "Futbol 11"} tone="dark" />
          </div>

          <h3 className="mt-3 text-xl font-black text-white">{item.matchLabel}</h3>
          <p className="mt-1 text-sm font-bold text-zinc-400">
            {item.competitionName || "Competicion manual"} {item.categoryName ? `· ${item.categoryName}` : ""}
          </p>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            {item.roleLabel} · {formatKickoff(item.kickoffAt)}
            {item.roundLabel ? ` · ${item.roundLabel}` : ""}
            {item.venueName ? ` · ${item.venueName}` : ""}
          </p>
          {!compact && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MiniInfo
                icon={MapPinned}
                text={`${item.venueCity || "Sin ciudad"}${item.countryName ? ` · ${item.countryName}` : ""}`}
              />
              <MiniInfo
                icon={ClipboardList}
                text={`${item.linkedPerformanceCount} check-ins · ${item.linkedPsychologyCount} registros psi.`}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
          <Link
            href={`/matches/${item.appointmentId}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#6fc11f] px-4 font-black text-black transition hover:bg-[#82dc2a]"
          >
            Abrir ficha
            <ArrowRight size={18} />
          </Link>
          {!compact && (
            <Link
              href={`/performance?sport=${item.sportType}&section=physical&appointmentId=${item.appointmentId}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-black text-zinc-200 transition hover:border-[#6fc11f]/40 hover:text-white"
            >
              Ref Performance
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-black/25 p-4">
      <Icon className="h-5 w-5 text-[#6fc11f]" />
      <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-2 text-xs font-bold text-zinc-400">{detail}</p>
    </div>
  );
}

function MiniInfo({
  icon: Icon,
  text,
}: {
  icon: typeof Clock3;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-zinc-400">
      <Icon className="h-4 w-4 text-[#6fc11f]" />
      <span>{text}</span>
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "dark";
}) {
  const classes =
    tone === "green"
      ? "border-[#6fc11f]/30 bg-[#6fc11f]/10 text-[#b7ff8a]"
      : "border-white/10 bg-white/[0.04] text-zinc-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${classes}`}
    >
      {label}
    </span>
  );
}

function SelectPillGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`min-h-12 rounded-2xl border px-3 text-sm font-black transition ${
              value === option.value
                ? "border-[#6fc11f] bg-[#6fc11f] text-black"
                : "border-white/10 bg-white/[0.04] text-zinc-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DatalistField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listId = `${label.toLowerCase().replace(/\s+/g, "-")}-options`;

  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </span>
      <input
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-[#101b24] px-4 text-sm font-bold text-white outline-none placeholder:text-zinc-600"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
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

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-3">
      <p className="text-sm font-black text-white">{label}</p>
      <div className="grid grid-cols-2 rounded-2xl border border-white/10 bg-[#101b24] p-1">
        {[{ label: "No", value: false }, { label: "Si", value: true }].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onChange(item.value)}
            className={`min-h-9 rounded-xl px-4 text-xs font-black transition ${
              value === item.value ? "bg-[#6fc11f] text-black" : "text-zinc-400"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-white/10 bg-black/20 p-6 text-center">
      <p className="text-lg font-black text-white">{title}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const classes =
    tone === "success"
      ? "border-[#6fc11f]/25 bg-[#6fc11f]/10 text-[#b7ff8a]"
      : "border-red-500/25 bg-red-500/10 text-red-200";

  return (
    <div className={`rounded-3xl border p-4 text-sm font-bold leading-6 ${classes}`}>
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
        tiene el esquema necesario para cargar el catalogo y mostrar el formulario.
      </p>

      <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200">
        <p>
          Aplica la migracion <code>{setupIssue.migrationId ?? "202607130001_matches_foundation.sql"}</code>
          {" "}y vuelve a cargar esta pantalla.
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
