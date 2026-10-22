export const BROWSER_TABLES = Object.freeze([
  "user_profiles", "match_preparations", "post_match_reviews", "psychology_checkins",
  "psychology_wellbeing_assessments", "psychology_exercise_sessions", "attempts", "exam_results",
  "rules_exam_results", "notification_events", "user_global_roles", "user_subscriptions", "referee_exam_sessions",
]);
export const PG17_TABLE_PRIVILEGES = Object.freeze(["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]);
export const PROFILE_INSERT_COLUMNS = Object.freeze([
  "user_id", "email", "reflab_name", "first_name", "last_name", "country", "city", "association", "association_id",
  "referee_type", "main_role", "referee_role", "category", "level", "birth_date", "ranking_display_name",
  "show_real_name_in_ranking", "public_profile", "hide_ranking_name", "preferred_sport_type",
]);
export const PROFILE_UPDATE_COLUMNS = Object.freeze(PROFILE_INSERT_COLUMNS.filter((column) => column !== "user_id"));
export const OWNED_WRITE_TABLES = Object.freeze(BROWSER_TABLES.slice(1, 6));
export const ANON_PRE_TABLES = Object.freeze([...OWNED_WRITE_TABLES, "notification_events"]);
export const browserPostPrivileges = (table, role) => role === "anon" ? []
  : OWNED_WRITE_TABLES.includes(table) ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT"];
export const browserPrePrivileges = (table, role) => role === "anon"
  ? ANON_PRE_TABLES.includes(table) ? PG17_TABLE_PRIVILEGES : []
  : table === "referee_exam_sessions" ? [] : PG17_TABLE_PRIVILEGES;
