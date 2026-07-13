import type { SystemRole } from "@/lib/institutionalRoles";
import type { SportType } from "@/lib/sports";
import type {
  AppointmentRecord,
  AppointmentStatus,
  CompetitionCategoryRecord,
  CompetitionRecord,
  CompetitionSeasonRecord,
  CountryRecord,
  FixtureRecord,
  MatchContextSnapshotRecord,
  MatchPreparationRecord,
  PostMatchReviewRecord,
  RefereeEligibilityRecord,
  RefereeRoleKey,
  RefereeRoleRecord,
  TeamRecord,
  VenueRecord,
  AssociationRecord,
  MatchOfficialRecord,
} from "@/lib/matches/types";

export type MatchActorProfileSummary = {
  displayName: string;
  refCardId: string | null;
  country: string | null;
  association: string | null;
  category: string | null;
  mainRole: string | null;
  refereeType: string | null;
};

export type MatchActorContext = {
  userId: string;
  role: SystemRole;
  institutionId: string | null;
  institutionName: string | null;
  canManageInstitution: boolean;
  isSuperAdmin: boolean;
  profile: MatchActorProfileSummary;
};

export type InstitutionMemberOption = {
  userId: string;
  displayName: string;
  refCardId: string | null;
  role: string | null;
  category: string | null;
};

export type MatchesCatalogResponse = {
  actor: MatchActorContext;
  countries: CountryRecord[];
  associations: AssociationRecord[];
  competitions: CompetitionRecord[];
  seasons: CompetitionSeasonRecord[];
  categories: CompetitionCategoryRecord[];
  roles: RefereeRoleRecord[];
  eligibilities: RefereeEligibilityRecord[];
  institutionMembers: InstitutionMemberOption[];
  supportsInstitutionAssignments: boolean;
  fallbackMode: "eligibility_matrix" | "manual_assisted";
};

export type MatchAppointmentListItem = {
  appointmentId: string;
  userId: string;
  userDisplayName: string;
  refCardId: string | null;
  sportType: SportType;
  status: AppointmentStatus;
  statusLabel: string;
  sourceType: AppointmentRecord["source_type"];
  sourceLabel: string;
  roleKey: RefereeRoleKey;
  roleLabel: string;
  kickoffAt: string;
  matchLabel: string;
  competitionName: string | null;
  categoryName: string | null;
  seasonLabel: string | null;
  associationName: string | null;
  countryName: string | null;
  venueName: string | null;
  venueCity: string | null;
  roundLabel: string | null;
  refereeSystem: string | null;
  varEnabled: boolean;
  hasPreparations: boolean;
  hasPostMatchReview: boolean;
  linkedPerformanceCount: number;
  linkedPsychologyCount: number;
  observations: string | null;
};

export type MatchRecommendedPlan = {
  dataAvailable: boolean;
  title: string;
  message: string;
  focusTechnical: string | null;
  focusCommunication: string | null;
  focusPhysical: string | null;
  focusPsychological: string | null;
  suggestedContent: string[];
  checklist: string[];
  reminders: string[];
  objectives: string[];
  evidence: string[];
};

export type MatchRelatedActivitySummary = {
  performanceCheckins: number;
  performanceSessions: number;
  psychologyCheckins: number;
  psychologyExercises: number;
  latestReadinessScore: number | null;
  latestMentalScore: number | null;
};

export type MatchAppointmentDetail = {
  actor: MatchActorContext;
  appointment: AppointmentRecord;
  fixture: FixtureRecord;
  role: RefereeRoleRecord | null;
  country: CountryRecord | null;
  association: AssociationRecord | null;
  competition: CompetitionRecord | null;
  season: CompetitionSeasonRecord | null;
  category: CompetitionCategoryRecord | null;
  homeTeam: TeamRecord | null;
  awayTeam: TeamRecord | null;
  venue: VenueRecord | null;
  appointmentUser: {
    userId: string;
    displayName: string;
    refCardId: string | null;
  };
  officials: Array<
    MatchOfficialRecord & {
      role: RefereeRoleRecord | null;
      displayName: string | null;
      refCardId: string | null;
    }
  >;
  contextSnapshots: MatchContextSnapshotRecord[];
  preparations: MatchPreparationRecord[];
  postMatchReview: PostMatchReviewRecord | null;
  relatedActivity: MatchRelatedActivitySummary;
  recommendedPlan: MatchRecommendedPlan;
  canManageInstitutionally: boolean;
};

export type ManualAppointmentPayload = {
  sportType: SportType;
  countryName: string;
  countryCode?: string | null;
  associationName: string;
  competitionName: string;
  categoryName: string;
  seasonLabel: string;
  roundLabel?: string | null;
  matchdayNumber?: number | null;
  kickoffAt: string;
  homeTeamName: string;
  awayTeamName: string;
  venueName?: string | null;
  venueCity?: string | null;
  refereeSystem?: string | null;
  varEnabled?: boolean;
  roleKey: RefereeRoleKey;
  status?: AppointmentStatus;
  observations?: string | null;
  sourceType?: "manual" | "institutional";
  targetUserId?: string | null;
};

export type MatchPreparationPayload = {
  stage: MatchPreparationRecord["stage"];
  status?: MatchPreparationRecord["status"];
  technicalFocus?: string | null;
  physicalFocus?: string | null;
  communicationFocus?: string | null;
  psychologicalFocus?: string | null;
  checklist?: string[];
  answers?: Record<string, unknown>;
  notes?: string | null;
};

export type PostMatchReviewPayload = {
  resultSummary?: string | null;
  minutesPlayed?: number | null;
  incidents?: string[];
  keyDecisions?: string[];
  perceivedLoad?: number | null;
  fatigueScore?: number | null;
  soreness?: string | null;
  emotionalState?: string | null;
  strengths?: string[];
  perceivedErrors?: string[];
  situationsToReview?: string[];
  notes?: string | null;
  closureText?: string | null;
};

export type AppointmentUpdatePayload = {
  status?: AppointmentStatus;
  observations?: string | null;
  roleKey?: RefereeRoleKey | null;
};
