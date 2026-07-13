import type { SportType } from "@/lib/sports";

export const appointmentStatusValues = [
  "draft",
  "pending_confirmation",
  "confirmed",
  "modified",
  "replaced",
  "cancelled",
  "suspended",
  "postponed",
  "completed",
] as const;

export const appointmentSourceTypeValues = [
  "manual",
  "institutional",
  "api",
] as const;

export const matchDataSourceTypeValues = [
  "manual",
  "institutional",
  "api",
] as const;

export const fixtureStatusValues = [
  "scheduled",
  "confirmed",
  "live",
  "completed",
  "postponed",
  "suspended",
  "cancelled",
] as const;

export const eligibilityModeValues = [
  "eligible",
  "view_only",
  "blocked",
] as const;

export const preparationStageValues = [
  "72_48_hours",
  "24_hours",
  "matchday",
] as const;

export const preparationStatusValues = [
  "draft",
  "completed",
] as const;

export const matchContextSnapshotTypeValues = [
  "standings",
  "form",
  "disciplinary",
  "official_note",
  "summary",
] as const;

export type AppointmentStatus = (typeof appointmentStatusValues)[number];
export type AppointmentSourceType = (typeof appointmentSourceTypeValues)[number];
export type MatchDataSourceType = (typeof matchDataSourceTypeValues)[number];
export type FixtureStatus = (typeof fixtureStatusValues)[number];
export type EligibilityMode = (typeof eligibilityModeValues)[number];
export type PreparationStage = (typeof preparationStageValues)[number];
export type PreparationStatus = (typeof preparationStatusValues)[number];
export type MatchContextSnapshotType = (typeof matchContextSnapshotTypeValues)[number];

export type RefereeRoleKey =
  | "referee"
  | "assistant_1"
  | "assistant_2"
  | "fourth_official"
  | "fifth_official"
  | "var"
  | "avar"
  | "reserve_assistant"
  | "first_referee"
  | "second_referee"
  | "third_referee"
  | "timekeeper"
  | "other";

export type MatchCatalogRecord = {
  id: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CountryRecord = MatchCatalogRecord & {
  code: string;
  name: string;
  is_active?: boolean | null;
};

export type AssociationRecord = MatchCatalogRecord & {
  country_id?: string | null;
  code?: string | null;
  name: string;
  is_active?: boolean | null;
};

export type CompetitionRecord = MatchCatalogRecord & {
  association_id?: string | null;
  sport_type: SportType;
  name: string;
  short_name?: string | null;
  competition_type?: string | null;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  external_id?: string | null;
  is_active?: boolean | null;
};

export type CompetitionSeasonRecord = MatchCatalogRecord & {
  competition_id: string;
  label: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: "draft" | "active" | "archived" | null;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  external_id?: string | null;
};

export type CompetitionCategoryRecord = MatchCatalogRecord & {
  competition_id: string;
  season_id?: string | null;
  sport_type: SportType;
  name: string;
  level_order?: number | null;
  referee_system?: string | null;
  var_supported?: boolean | null;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  external_id?: string | null;
  is_active?: boolean | null;
};

export type TeamRecord = MatchCatalogRecord & {
  sport_type: SportType;
  country_id?: string | null;
  association_id?: string | null;
  name: string;
  short_name?: string | null;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  external_id?: string | null;
  crest_url?: string | null;
  is_active?: boolean | null;
};

export type VenueRecord = MatchCatalogRecord & {
  country_id?: string | null;
  association_id?: string | null;
  name: string;
  city?: string | null;
  address?: string | null;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  external_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active?: boolean | null;
};

export type RefereeRoleRecord = MatchCatalogRecord & {
  sport_type: SportType;
  role_key: RefereeRoleKey;
  label: string;
  role_group?: string | null;
  requires_var?: boolean | null;
  is_reserve?: boolean | null;
  display_order?: number | null;
  is_active?: boolean | null;
};

export type FixtureRecord = MatchCatalogRecord & {
  sport_type: SportType;
  country_id?: string | null;
  association_id?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  category_id?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  venue_id?: string | null;
  kickoff_at: string;
  round_label?: string | null;
  matchday_number?: number | null;
  status?: FixtureStatus | null;
  referee_system?: string | null;
  var_enabled?: boolean | null;
  data_source?: MatchDataSourceType | null;
  provider?: string | null;
  external_id?: string | null;
  raw_source_reference?: Record<string, unknown> | null;
  notes?: string | null;
  last_synced_at?: string | null;
};

export type RefereeEligibilityRecord = MatchCatalogRecord & {
  user_id: string;
  institution_id?: string | null;
  sport_type: SportType;
  country_id?: string | null;
  association_id?: string | null;
  competition_id?: string | null;
  category_id?: string | null;
  role_id: string;
  eligibility_mode?: EligibilityMode | null;
  allow_lower_categories?: boolean | null;
  allow_higher_categories?: boolean | null;
  source_type?: "profile" | "institutional" | "admin" | "system" | null;
  is_active?: boolean | null;
  notes?: string | null;
};

export type AppointmentRecord = MatchCatalogRecord & {
  user_id: string;
  fixture_id: string;
  role_id: string;
  sport_type: SportType;
  competition_id?: string | null;
  association_id?: string | null;
  institution_id?: string | null;
  source_type?: AppointmentSourceType | null;
  status?: AppointmentStatus | null;
  created_by_user_id?: string | null;
  confirmed_at?: string | null;
  replaced_by_appointment_id?: string | null;
  observations?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AppointmentHistoryRecord = {
  id: string;
  appointment_id: string;
  user_id: string;
  changed_by_user_id?: string | null;
  change_type?: "created" | "status_changed" | "role_changed" | "fixture_changed" | "note_updated" | "system_sync" | null;
  from_status?: AppointmentStatus | null;
  to_status?: AppointmentStatus | null;
  reason?: string | null;
  snapshot?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type MatchOfficialRecord = MatchCatalogRecord & {
  fixture_id: string;
  role_id: string;
  appointment_id?: string | null;
  user_id?: string | null;
  official_name?: string | null;
  source_type?: AppointmentSourceType | null;
  status?: "assigned" | "confirmed" | "replaced" | "removed" | null;
  is_primary_assignment?: boolean | null;
};

export type MatchContextSnapshotRecord = MatchCatalogRecord & {
  fixture_id: string;
  sport_type: SportType;
  provider?: string | null;
  source_type?: MatchDataSourceType | null;
  snapshot_type: MatchContextSnapshotType;
  period_label?: string | null;
  updated_source_at?: string | null;
  payload?: Record<string, unknown> | null;
  summary?: string | null;
};

export type MatchPreparationRecord = MatchCatalogRecord & {
  appointment_id: string;
  user_id: string;
  sport_type: SportType;
  stage: PreparationStage;
  status?: PreparationStatus | null;
  technical_focus?: string | null;
  physical_focus?: string | null;
  communication_focus?: string | null;
  psychological_focus?: string | null;
  checklist?: unknown[] | null;
  answers?: Record<string, unknown> | null;
  notes?: string | null;
};

export type PostMatchReviewRecord = MatchCatalogRecord & {
  appointment_id: string;
  user_id: string;
  sport_type: SportType;
  result_summary?: string | null;
  minutes_played?: number | null;
  incidents?: unknown[] | null;
  key_decisions?: unknown[] | null;
  perceived_load?: number | null;
  fatigue_score?: number | null;
  soreness?: string | null;
  emotional_state?: string | null;
  strengths?: string[] | null;
  perceived_errors?: string[] | null;
  situations_to_review?: string[] | null;
  notes?: string | null;
  closure_text?: string | null;
};

export type ManualAppointmentDraft = {
  sport_type: SportType;
  country_id?: string | null;
  association_id?: string | null;
  competition_id?: string | null;
  season_id?: string | null;
  category_id?: string | null;
  fixture_id?: string | null;
  role_id?: string | null;
  source_type: "manual";
  status?: AppointmentStatus;
  observations?: string;
};
