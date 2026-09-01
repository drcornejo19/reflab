export type ApiAuthCategory =
  | "self_authorized"
  | "proxy_protected"
  | "public"
  | "internal";

export type SelfAuthorizedApiStrategy =
  | "strict_super_admin"
  | "canonical_identity"
  | "coach"
  | "development_super_admin_linker"
  | "exam"
  | "institution"
  | "matches"
  | "profile"
  | "ranking"
  | "sports_session"
  | "training";

type ApiAuthRoute = {
  route: string;
  samplePath: string;
  category: ApiAuthCategory;
  pattern?: RegExp;
  strategy?: SelfAuthorizedApiStrategy;
};

const SAMPLE_UUID = "11111111-1111-4111-8111-111111111111";
const UUID_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function selfAuthorized(
  route: string,
  strategy: SelfAuthorizedApiStrategy
): ApiAuthRoute {
  return { route, samplePath: route, category: "self_authorized", strategy };
}

function selfAuthorizedUuid(
  route: string,
  prefix: string,
  suffix: string,
  strategy: SelfAuthorizedApiStrategy
): ApiAuthRoute {
  return {
    route,
    samplePath: `${prefix}/${SAMPLE_UUID}${suffix}`,
    category: "self_authorized",
    strategy,
    pattern: new RegExp(
      `^${escapeRegex(prefix)}/${UUID_SEGMENT}${escapeRegex(suffix)}$`,
      "i"
    ),
  };
}

function classified(
  route: string,
  category: Exclude<ApiAuthCategory, "self_authorized">
): ApiAuthRoute {
  return { route, samplePath: route, category };
}

export const apiAuthRouteManifest: readonly ApiAuthRoute[] = [
  selfAuthorized("/api/admin/clips", "strict_super_admin"),
  selfAuthorizedUuid("/api/admin/clips/[clipId]", "/api/admin/clips", "", "strict_super_admin"),
  selfAuthorized("/api/admin/institutional-clips", "strict_super_admin"),
  selfAuthorized("/api/admin/institutional-leads", "strict_super_admin"),
  selfAuthorized("/api/admin/library", "strict_super_admin"),
  selfAuthorized("/api/admin/notifications", "strict_super_admin"),
  selfAuthorized("/api/admin/psychology", "strict_super_admin"),
  selfAuthorized("/api/admin/radar-audit", "strict_super_admin"),
  selfAuthorized("/api/admin/users", "strict_super_admin"),
  selfAuthorized("/api/ai-exam-analysis", "coach"),
  selfAuthorized("/api/ai-feedback", "coach"),
  classified("/api/development/identity-link", "proxy_protected"),
  selfAuthorized("/api/development/super-admin-identity-link", "development_super_admin_linker"),
  selfAuthorized("/api/english-feedback", "coach"),
  selfAuthorized("/api/exams/sessions", "exam"),
  selfAuthorizedUuid("/api/exams/sessions/[sessionId]/submit", "/api/exams/sessions", "/submit", "exam"),
  selfAuthorized("/api/institution/assessments", "institution"),
  selfAuthorizedUuid("/api/institution/assessments/[assessmentId]", "/api/institution/assessments", "", "institution"),
  selfAuthorized("/api/institution/cohorts", "institution"),
  selfAuthorizedUuid("/api/institution/cohorts/[cohortId]", "/api/institution/cohorts", "", "institution"),
  selfAuthorized("/api/institution/contents", "institution"),
  selfAuthorizedUuid("/api/institution/contents/[contentId]", "/api/institution/contents", "", "institution"),
  selfAuthorized("/api/institution/contents/upload", "institution"),
  selfAuthorized("/api/institution/context", "institution"),
  selfAuthorized("/api/institution/demo", "institution"),
  selfAuthorized("/api/institution/directory", "institution"),
  selfAuthorized("/api/institution/groups", "institution"),
  selfAuthorizedUuid("/api/institution/groups/[groupId]", "/api/institution/groups", "", "institution"),
  selfAuthorizedUuid("/api/institution/groups/[groupId]/members", "/api/institution/groups", "/members", "institution"),
  selfAuthorized("/api/institution/invitations", "institution"),
  selfAuthorizedUuid("/api/institution/invitations/[invitationMembershipId]/accept", "/api/institution/invitations", "/accept", "institution"),
  selfAuthorized("/api/institution/learning", "institution"),
  selfAuthorizedUuid("/api/institution/learning/assessments/[assignmentId]/start", "/api/institution/learning/assessments", "/start", "institution"),
  selfAuthorizedUuid("/api/institution/learning/sessions/[sessionId]", "/api/institution/learning/sessions", "", "institution"),
  selfAuthorized("/api/institution/members", "institution"),
  selfAuthorizedUuid("/api/institution/members/[membershipId]", "/api/institution/members", "", "institution"),
  selfAuthorized("/api/institution/metrics", "institution"),
  selfAuthorized("/api/institution/notifications", "institution"),
  selfAuthorizedUuid("/api/institution/notifications/[recipientId]", "/api/institution/notifications", "", "institution"),
  selfAuthorized("/api/institution/organizations", "institution"),
  selfAuthorized("/api/institution/overview", "institution"),
  selfAuthorized("/api/institution/reports", "institution"),
  selfAuthorized("/api/institution/reports/export", "institution"),
  selfAuthorized("/api/institution/videos", "institution"),
  classified("/api/institutional-leads", "public"),
  classified("/api/library", "proxy_protected"),
  selfAuthorized("/api/matches/appointments", "matches"),
  selfAuthorizedUuid("/api/matches/appointments/[appointmentId]", "/api/matches/appointments", "", "matches"),
  selfAuthorizedUuid("/api/matches/appointments/[appointmentId]/preparations", "/api/matches/appointments", "/preparations", "matches"),
  selfAuthorizedUuid("/api/matches/appointments/[appointmentId]/review", "/api/matches/appointments", "/review", "matches"),
  selfAuthorized("/api/matches/catalog", "matches"),
  selfAuthorized("/api/matches/catalog/sync", "matches"),
  selfAuthorized("/api/matches/providers", "matches"),
  selfAuthorized("/api/notifications/preferences", "canonical_identity"),
  selfAuthorized("/api/notifications/register-token", "canonical_identity"),
  classified("/api/notifications/scheduled", "internal"),
  classified("/api/notifications/scheduled/run", "internal"),
  selfAuthorized("/api/notifications/send", "canonical_identity"),
  selfAuthorized("/api/performance/summary", "canonical_identity"),
  selfAuthorized("/api/profile", "profile"),
  selfAuthorized("/api/profile/avatar", "profile"),
  selfAuthorized("/api/psychology", "canonical_identity"),
  selfAuthorized("/api/ranking", "ranking"),
  selfAuthorized("/api/ref-performance", "canonical_identity"),
  selfAuthorized("/api/rules-exams/sessions", "exam"),
  selfAuthorizedUuid("/api/rules-exams/sessions/[sessionId]/submit", "/api/rules-exams/sessions", "/submit", "exam"),
  selfAuthorized("/api/sports/competitions", "sports_session"),
  selfAuthorized("/api/sports/countries", "sports_session"),
  selfAuthorized("/api/sports/fixtures", "sports_session"),
  selfAuthorized("/api/sports/standings", "sports_session"),
  selfAuthorized("/api/sports/team-form", "sports_session"),
  classified("/api/support", "proxy_protected"),
  selfAuthorized("/api/training/attempts", "training"),
  selfAuthorized("/api/training/usage", "training"),
  selfAuthorized("/api/var-feedback", "coach"),
];

const exactRoutes = new Map(
  apiAuthRouteManifest
    .filter((entry) => !entry.pattern)
    .map((entry) => [entry.route, entry] as const)
);
const dynamicRoutes = apiAuthRouteManifest.filter((entry) => entry.pattern);

export function classifyApiAuthPath(pathname: string): ApiAuthRoute | null {
  const exact = exactRoutes.get(pathname);
  if (exact) return exact;

  const matches = dynamicRoutes.filter((entry) => entry.pattern!.test(pathname));
  return matches.length === 1 ? matches[0] : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
