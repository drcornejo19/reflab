import type { SportType } from "@/lib/sports";

export const institutionTypes = [
  "school",
  "league",
  "association",
  "federation",
  "private_academy",
  "other",
] as const;

export type InstitutionType = (typeof institutionTypes)[number];

export const institutionStatuses = [
  "pending",
  "active",
  "suspended",
  "archived",
] as const;

export type InstitutionStatus = (typeof institutionStatuses)[number];

export const institutionMembershipStatuses = [
  "invited",
  "active",
  "suspended",
  "revoked",
] as const;

export type InstitutionMembershipStatus =
  (typeof institutionMembershipStatuses)[number];

export const institutionLifecycleStatuses = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
] as const;

export type InstitutionLifecycleStatus =
  (typeof institutionLifecycleStatuses)[number];

export const institutionGroupTypes = [
  "course",
  "cohort",
  "commission",
  "category",
  "role",
  "training",
  "work_team",
] as const;

export type InstitutionGroupType = (typeof institutionGroupTypes)[number];

export const institutionGroupRoles = [
  "participant",
  "instructor",
  "coordinator",
  "observer",
] as const;

export type InstitutionGroupRole = (typeof institutionGroupRoles)[number];

export const institutionGroupMembershipStatuses = [
  "active",
  "completed",
  "removed",
] as const;

export type InstitutionGroupMembershipStatus =
  (typeof institutionGroupMembershipStatuses)[number];

export const institutionRoleKeys = [
  "institution_admin",
  "technical_coordinator",
  "instructor",
  "evaluator",
  "content_manager",
  "student",
  "referee",
  "invited_referee",
  "observer",
  "read_only",
] as const;

export type InstitutionRoleKey = (typeof institutionRoleKeys)[number];

export const institutionPermissionKeys = [
  "institution.read",
  "institution.manage",
  "members.read",
  "members.manage",
  "members.invite",
  "roles.read",
  "roles.manage",
  "groups.read",
  "groups.manage",
  "content.read",
  "content.manage",
  "content.publish",
  "assessments.read",
  "assessments.take",
  "assessments.manage",
  "assessments.grade",
  "metrics.read_own",
  "metrics.read_individual",
  "metrics.read_aggregate",
  "reports.read",
  "reports.export",
  "notifications.read",
  "notifications.send",
  "matches.read",
  "matches.manage",
  "audit.read",
  "demo.switch",
] as const;

export type InstitutionPermissionKey =
  (typeof institutionPermissionKeys)[number];

export const institutionAssessmentModalities = [
  "video_analysis",
  "rules_exam",
  "trivia",
  "referee_exam",
  "communication",
  "var",
  "futsal",
  "psychology_orientation",
  "physical",
  "custom",
] as const;

export type InstitutionAssessmentModality =
  (typeof institutionAssessmentModalities)[number];

export const institutionContentTypes = [
  "video",
  "question",
  "trivia",
  "document",
  "circular",
  "class",
  "exercise",
  "presentation",
  "pdf",
  "link",
  "audio",
  "case_study",
] as const;

export type InstitutionContentType = (typeof institutionContentTypes)[number];

export const institutionContentStatuses = [
  "draft",
  "in_review",
  "published",
  "archived",
  "expired",
] as const;

export type InstitutionContentStatus =
  (typeof institutionContentStatuses)[number];

export const institutionContentVisibilities = [
  "private",
  "institution",
  "assigned_groups",
  "public",
] as const;

export type InstitutionContentVisibility =
  (typeof institutionContentVisibilities)[number];

export const institutionAssessmentStatuses = [
  "draft",
  "scheduled",
  "open",
  "closed",
  "cancelled",
  "archived",
] as const;

export type InstitutionAssessmentStatus =
  (typeof institutionAssessmentStatuses)[number];

export const institutionAssessmentSessionStatuses = [
  "not_started",
  "in_progress",
  "submitted",
  "graded",
  "expired",
  "cancelled",
] as const;

export type InstitutionAssessmentSessionStatus =
  (typeof institutionAssessmentSessionStatuses)[number];

export type InstitutionAssignmentTarget = {
  id: string;
  name: string;
  detail: string | null;
  sportType: SportType | null;
};

export type InstitutionContentMetadata = {
  prompt?: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
  [key: string]: unknown;
};

export type InstitutionContentRecord = {
  id: string;
  institutionId: string;
  sportType: SportType;
  contentType: InstitutionContentType;
  title: string;
  description: string | null;
  authorUserId: string;
  topic: string | null;
  subtopic: string | null;
  ruleReference: string | null;
  difficulty: string | null;
  language: string;
  validFrom: string | null;
  validUntil: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  storagePath: string | null;
  accessUrl: string | null;
  visibility: InstitutionContentVisibility;
  status: InstitutionContentStatus;
  version: number;
  publishedAt: string | null;
  expiresAt: string | null;
  metadata: InstitutionContentMetadata;
  groupIds: string[];
  userIds: string[];
  availableFrom: string | null;
  dueAt: string | null;
  required: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InstitutionContentWorkspace = {
  institution: InstitutionRecord;
  capabilities: {
    canManage: boolean;
    canPublish: boolean;
  };
  contents: InstitutionContentRecord[];
  groups: InstitutionAssignmentTarget[];
  members: InstitutionAssignmentTarget[];
};

export type InstitutionAssessmentItemRecord = {
  id: string;
  itemType:
    | "global_clip"
    | "institutional_clip"
    | "rule_question"
    | "institution_content"
    | "manual";
  sourceId: string | null;
  title: string;
  contentType: InstitutionContentType | null;
  points: number;
  sortOrder: number;
  isRequired: boolean;
};

export type InstitutionAssessmentRecord = {
  id: string;
  institutionId: string;
  sportType: SportType;
  name: string;
  description: string | null;
  modality: InstitutionAssessmentModality;
  status: InstitutionAssessmentStatus;
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  durationMinutes: number | null;
  questionCount: number | null;
  videoCount: number | null;
  attemptsAllowed: number;
  immediateFeedback: boolean;
  freeNavigation: boolean;
  randomizeQuestions: boolean;
  randomizeVideos: boolean;
  minimumScore: number | null;
  penaltyValue: number | null;
  allowReview: boolean;
  settings: Record<string, unknown>;
  items: InstitutionAssessmentItemRecord[];
  groupIds: string[];
  userIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type InstitutionAssessmentWorkspace = {
  institution: InstitutionRecord;
  capabilities: {
    canManage: boolean;
    canGrade: boolean;
  };
  assessments: InstitutionAssessmentRecord[];
  contents: InstitutionContentRecord[];
  groups: InstitutionAssignmentTarget[];
  members: InstitutionAssignmentTarget[];
};

export type InstitutionLearningAvailability =
  | "available"
  | "upcoming"
  | "closed"
  | "completed"
  | "attempts_exhausted";

export type InstitutionLearningContent = InstitutionContentRecord & {
  assignmentId: string | null;
  assignedBy: "institution" | "group" | "user";
};

export type InstitutionLearningAssessment = InstitutionAssessmentRecord & {
  assignmentId: string;
  availability: InstitutionLearningAvailability;
  effectiveOpensAt: string | null;
  effectiveClosesAt: string | null;
  attemptsAllowed: number;
  attemptsUsed: number;
  latestSessionId: string | null;
  latestSessionStatus: InstitutionAssessmentSessionStatus | null;
  latestPercentage: number | null;
  passed: boolean | null;
};

export type InstitutionLearningWorkspace = {
  institution: InstitutionRecord;
  membership: InstitutionMembershipRecord;
  contents: InstitutionLearningContent[];
  assessments: InstitutionLearningAssessment[];
  summary: {
    assignedContents: number;
    availableAssessments: number;
    upcomingAssessments: number;
    completedAssessments: number;
  };
};

export type InstitutionSessionItem = {
  id: string;
  title: string;
  contentType: InstitutionContentType | null;
  description: string | null;
  sourceUrl: string | null;
  accessUrl: string | null;
  prompt: string | null;
  options: string[];
  points: number;
  sortOrder: number;
  isRequired: boolean;
  correctAnswer?: string;
  explanation?: string;
};

export type InstitutionAssessmentSessionRecord = {
  id: string;
  institutionId: string;
  assessmentId: string;
  assignmentId: string;
  userId: string;
  attemptNumber: number;
  status: InstitutionAssessmentSessionStatus;
  startedAt: string | null;
  submittedAt: string | null;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  timeSpentSeconds: number | null;
  assessment: Pick<
    InstitutionAssessmentRecord,
    | "name"
    | "description"
    | "sportType"
    | "modality"
    | "durationMinutes"
    | "immediateFeedback"
    | "freeNavigation"
    | "minimumScore"
    | "allowReview"
  >;
  items: InstitutionSessionItem[];
  answers: Record<string, string>;
};

export const institutionDataCategories = [
  "availability",
  "readiness_summary",
  "physical_load",
  "physical_detail",
  "medical_notes",
  "psychology_compliance",
  "psychology_detail",
  "post_match_review",
] as const;

export type InstitutionDataCategory =
  (typeof institutionDataCategories)[number];

export type InstitutionRecord = {
  id: string;
  slug: string;
  name: string;
  institutionType: InstitutionType;
  status: InstitutionStatus;
  country: string | null;
  provinceState: string | null;
  city: string | null;
  timezone: string;
  logoUrl: string | null;
  brandColor: string;
  enabledSports: SportType[];
  planKey: string;
  licenseLimit: number;
  isDemo: boolean;
};

export type InstitutionMembershipRecord = {
  id: string | null;
  institutionId: string;
  userId: string;
  status: InstitutionMembershipStatus;
  primarySport: SportType | null;
  category: string | null;
  roleKeys: InstitutionRoleKey[];
  permissionKeys: InstitutionPermissionKey[];
  joinedAt: string | null;
  lastActiveAt: string | null;
};

export type InstitutionContext = {
  institution: InstitutionRecord;
  membership: InstitutionMembershipRecord | null;
  isSuperAdmin: boolean;
  simulatedRole: InstitutionRoleKey | null;
  demoMode: boolean;
};

export type InstitutionAccessSnapshot = {
  activeInstitutionId: string | null;
  contexts: InstitutionContext[];
  isSuperAdmin: boolean;
};

export type InstitutionOverviewMember = {
  id: string;
  userId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  status: InstitutionMembershipStatus;
  primarySport: SportType | null;
  category: string | null;
  roleKeys: InstitutionRoleKey[];
  roleLabels: string[];
  joinedAt: string | null;
  lastActiveAt: string | null;
};

export type InstitutionOverviewRole = {
  id: string;
  roleKey: InstitutionRoleKey;
  name: string;
  description: string | null;
  isSystem: boolean;
  isAssignable: boolean;
  permissionCount: number;
};

export type InstitutionOverview = {
  institution: InstitutionRecord;
  membership: InstitutionMembershipRecord | null;
  capabilities: {
    canManageInstitution: boolean;
    canReadMembers: boolean;
    canManageMembers: boolean;
    canReadRoles: boolean;
    canManageRoles: boolean;
  };
  summary: {
    totalMemberships: number;
    activeMemberships: number;
    roleCount: number;
    licensesUsed: number;
    licensesAvailable: number | null;
  };
  members: InstitutionOverviewMember[];
  roles: InstitutionOverviewRole[];
};

export type InstitutionMetricValue = {
  value: number | null;
  attempts: number;
  available: boolean;
};

export type InstitutionMetricDimension = {
  key: string;
  label: string;
  average: number | null;
  decisions: number;
  sessions: number;
};

export type InstitutionMetricTrend = {
  period: string;
  label: string;
  average: number | null;
  sessions: number;
};

export type InstitutionGroupMetric = {
  id: string;
  name: string;
  participants: number;
  activeUsers: number;
  sessions: number;
  average: number | null;
  dispersion: number | null;
  passRate: number | null;
  compliance: number | null;
};

export type InstitutionMetricsWorkspace = {
  institution: InstitutionRecord;
  sportType: SportType;
  generatedAt: string;
  period: {
    from: string;
    to: string;
    label: string;
  };
  scope: "institution" | "groups" | "own";
  filters: {
    groupId: string | null;
    userId: string | null;
  };
  capabilities: {
    canReadIndividual: boolean;
    canReadAggregate: boolean;
    canExport: boolean;
  };
  summary: {
    average: InstitutionMetricValue;
    technicalAverage: InstitutionMetricValue;
    disciplinaryAverage: InstitutionMetricValue;
    restartAverage: InstitutionMetricValue;
    sessions: number;
    decisions: number;
    activeUsers: number;
    assignedUsers: number;
    completionRate: number | null;
    passRate: number | null;
    averageResponseSeconds: number | null;
    consistency: number | null;
  };
  topics: InstitutionMetricDimension[];
  criteria: InstitutionMetricDimension[];
  evolution: InstitutionMetricTrend[];
  groups: InstitutionGroupMetric[];
  strengths: InstitutionMetricDimension[];
  criticalTopics: InstitutionMetricDimension[];
  recommendations: string[];
  warnings: string[];
  availableGroups: Array<{ id: string; name: string }>;
};

export const institutionNotificationPriorities = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export type InstitutionNotificationPriority =
  (typeof institutionNotificationPriorities)[number];

export const institutionNotificationChannels = [
  "web",
  "pwa",
  "email",
  "push",
] as const;

export type InstitutionNotificationChannel =
  (typeof institutionNotificationChannels)[number];

export type InstitutionNotificationCampaign = {
  id: string;
  title: string;
  message: string;
  notificationType: string;
  priority: InstitutionNotificationPriority;
  channels: InstitutionNotificationChannel[];
  scheduledFor: string | null;
  expiresAt: string | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  recipientCount: number;
  readCount: number;
  createdAt: string;
};

export type InstitutionNotificationRecipient = {
  id: string;
  campaignId: string;
  title: string;
  message: string;
  notificationType: string;
  priority: InstitutionNotificationPriority;
  channels: InstitutionNotificationChannel[];
  scheduledFor: string | null;
  expiresAt: string | null;
  deliveryStatus: "pending" | "sent" | "failed" | "read" | "dismissed";
  readAt: string | null;
  createdAt: string;
};

export type InstitutionNotificationWorkspace = {
  institution: InstitutionRecord;
  capabilities: {
    canSend: boolean;
  };
  campaigns: InstitutionNotificationCampaign[];
  inbox: InstitutionNotificationRecipient[];
  audiences: {
    groups: Array<{ id: string; name: string }>;
    members: Array<{ userId: string; displayName: string; email: string | null }>;
  };
};

export type InstitutionDemoWorkspace = {
  institution: InstitutionRecord;
  active: boolean;
  simulatedRole: InstitutionRoleKey | null;
  expiresAt: string | null;
  availableRoles: Array<{
    key: InstitutionRoleKey;
    label: string;
    permissionCount: number;
  }>;
};

export type InstitutionDirectoryMember = InstitutionOverviewMember & {
  invitationEmail: string | null;
  invitationId: string | null;
  invitedAt: string | null;
  suspendedAt: string | null;
  groupIds: string[];
};

export type InstitutionCohortRecord = {
  id: string;
  institutionId: string;
  name: string;
  sportType: SportType;
  seasonLabel: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: InstitutionLifecycleStatus;
  groupCount: number;
  participantCount: number;
  createdAt: string;
};

export type InstitutionGroupMemberRecord = {
  id: string;
  groupId: string;
  membershipId: string;
  displayName: string;
  email: string | null;
  groupRole: InstitutionGroupRole;
  status: InstitutionGroupMembershipStatus;
  joinedAt: string;
};

export type InstitutionGroupRecord = {
  id: string;
  institutionId: string;
  cohortId: string | null;
  name: string;
  description: string | null;
  groupType: InstitutionGroupType;
  sportType: SportType;
  category: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: InstitutionLifecycleStatus;
  participantCount: number;
  instructorCount: number;
  members: InstitutionGroupMemberRecord[];
  createdAt: string;
};

export type InstitutionDirectory = {
  institution: InstitutionRecord;
  capabilities: {
    canReadMembers: boolean;
    canInviteMembers: boolean;
    canManageMembers: boolean;
    canReadRoles: boolean;
    canReadGroups: boolean;
    canManageGroups: boolean;
  };
  members: InstitutionDirectoryMember[];
  roles: InstitutionOverviewRole[];
  cohorts: InstitutionCohortRecord[];
  groups: InstitutionGroupRecord[];
};

export type InstitutionAssessmentWindow = {
  timezone: string;
  opensAt: string | null;
  closesAt: string | null;
  attemptsAllowed: number;
};

export function isInstitutionRoleKey(
  value: unknown
): value is InstitutionRoleKey {
  return institutionRoleKeys.includes(value as InstitutionRoleKey);
}

export function isInstitutionPermissionKey(
  value: unknown
): value is InstitutionPermissionKey {
  return institutionPermissionKeys.includes(value as InstitutionPermissionKey);
}

export function isInstitutionType(value: unknown): value is InstitutionType {
  return institutionTypes.includes(value as InstitutionType);
}

export function isInstitutionLifecycleStatus(
  value: unknown
): value is InstitutionLifecycleStatus {
  return institutionLifecycleStatuses.includes(
    value as InstitutionLifecycleStatus
  );
}

export function isInstitutionGroupType(
  value: unknown
): value is InstitutionGroupType {
  return institutionGroupTypes.includes(value as InstitutionGroupType);
}

export function isInstitutionGroupRole(
  value: unknown
): value is InstitutionGroupRole {
  return institutionGroupRoles.includes(value as InstitutionGroupRole);
}

export function isInstitutionMembershipStatus(
  value: unknown
): value is InstitutionMembershipStatus {
  return institutionMembershipStatuses.includes(
    value as InstitutionMembershipStatus
  );
}

export function isInstitutionContentType(
  value: unknown
): value is InstitutionContentType {
  return institutionContentTypes.includes(value as InstitutionContentType);
}

export function isInstitutionContentStatus(
  value: unknown
): value is InstitutionContentStatus {
  return institutionContentStatuses.includes(value as InstitutionContentStatus);
}

export function isInstitutionContentVisibility(
  value: unknown
): value is InstitutionContentVisibility {
  return institutionContentVisibilities.includes(
    value as InstitutionContentVisibility
  );
}

export function isInstitutionAssessmentModality(
  value: unknown
): value is InstitutionAssessmentModality {
  return institutionAssessmentModalities.includes(
    value as InstitutionAssessmentModality
  );
}

export function isInstitutionAssessmentStatus(
  value: unknown
): value is InstitutionAssessmentStatus {
  return institutionAssessmentStatuses.includes(
    value as InstitutionAssessmentStatus
  );
}

export function isInstitutionAssessmentSessionStatus(
  value: unknown
): value is InstitutionAssessmentSessionStatus {
  return institutionAssessmentSessionStatuses.includes(
    value as InstitutionAssessmentSessionStatus
  );
}
