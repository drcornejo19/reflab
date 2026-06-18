import type { SystemRole } from "@/lib/institutionalRoles";

export const subscriptionPlans = ["free", "pro"] as const;

export type SubscriptionPlan = (typeof subscriptionPlans)[number];

export const FREE_WEEKLY_CLIP_LIMIT = 5;
export const FREE_WEEKLY_EXAM_LIMIT = 1;

export const proBenefits = [
  "Todos los clips",
  "VAR Lab",
  "Examenes ilimitados",
  "Estadisticas completas",
  "Historial completo",
  "Comunicacion arbitral",
  "Preparacion Integral",
  "Ranking",
  "RefCard",
  "Evolucion avanzada",
  "Nuevos contenidos mensuales",
];

export const planLabels: Record<SubscriptionPlan, string> = {
  free: "FREE",
  pro: "PRO",
};

export function normalizeSubscriptionPlan(value?: string | null): SubscriptionPlan {
  return value === "pro" ? "pro" : "free";
}

export function hasProAccess(plan: SubscriptionPlan, role?: SystemRole | string | null) {
  return role === "super_admin" || plan === "pro";
}

export function isSubscriptionPlan(value?: string | null): value is SubscriptionPlan {
  return subscriptionPlans.includes(value as SubscriptionPlan);
}

export function getCurrentWeekStart(now = new Date()) {
  const date = new Date(now);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function countThisWeek<T extends { created_at?: string | null }>(items: T[], now = new Date()) {
  const weekStart = getCurrentWeekStart(now).getTime();

  return items.filter((item) => {
    if (!item.created_at) return false;
    const value = new Date(item.created_at).getTime();
    return Number.isFinite(value) && value >= weekStart;
  }).length;
}

export function getFreemiumUsage({
  attempts,
  examResults,
  rulesResults,
}: {
  attempts: { created_at?: string | null }[];
  examResults: { created_at?: string | null }[];
  rulesResults: { created_at?: string | null }[];
}) {
  const weeklyClips = countThisWeek(attempts);
  const weeklyExams = countThisWeek([...examResults, ...rulesResults]);

  return {
    weeklyClips,
    weeklyExams,
    clipLimit: FREE_WEEKLY_CLIP_LIMIT,
    examLimit: FREE_WEEKLY_EXAM_LIMIT,
    clipsRemaining: Math.max(FREE_WEEKLY_CLIP_LIMIT - weeklyClips, 0),
    examsRemaining: Math.max(FREE_WEEKLY_EXAM_LIMIT - weeklyExams, 0),
    clipLimitReached: weeklyClips >= FREE_WEEKLY_CLIP_LIMIT,
    examLimitReached: weeklyExams >= FREE_WEEKLY_EXAM_LIMIT,
  };
}
