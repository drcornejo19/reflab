import { BROWSER_TABLES, PG17_TABLE_PRIVILEGES } from "./phase3-browser-privilege-matrix.mjs";

export const SERVICE_TABLES = BROWSER_TABLES;
export const SERVICE_PRIVILEGES = PG17_TABLE_PRIVILEGES;
const freeze = (v) => { Object.values(v).forEach((x) => { if (x && typeof x === "object") freeze(x); }); return Object.freeze(v); };
export const CURRENT_SERVICE_MATRIX = freeze({
  user_profiles: ["SELECT", "UPDATE"],
  match_preparations: ["SELECT", "INSERT", "UPDATE"],
  post_match_reviews: ["SELECT", "INSERT", "UPDATE"],
  psychology_checkins: ["SELECT", "INSERT", "UPDATE"],
  psychology_wellbeing_assessments: ["SELECT", "INSERT", "UPDATE"],
  psychology_exercise_sessions: ["SELECT", "INSERT", "UPDATE"],
  attempts: ["SELECT"], exam_results: ["SELECT"], rules_exam_results: ["SELECT"],
  notification_events: ["SELECT", "INSERT"], user_global_roles: ["SELECT"], user_subscriptions: ["SELECT"],
  referee_exam_sessions: ["SELECT", "INSERT"],
});
export const serviceMatrix = (post = false) => SERVICE_TABLES.flatMap((table) => SERVICE_PRIVILEGES.map((privilege) => ({
  schema: "public", table, role: "service_role", privilege,
  granted: post ? CURRENT_SERVICE_MATRIX[table].includes(privilege) : table !== "referee_exam_sessions",
})));
export const serviceAcl = (post = false) => serviceMatrix(post).filter((r) => r.granted).map(({role, granted: _granted, ...r}) => {
  void _granted; return {...r, grantee: role, grantor: "postgres", grantable: false};
});
export function serviceMutationAccounting() {
  const before = serviceMatrix(), after = serviceMatrix(true);
  const revoked = before.filter((r, i) => r.granted && !after[i].granted);
  const granted = after.filter((r, i) => r.granted && !before[i].granted);
  const unchanged = after.filter((r, i) => r.granted === before[i].granted);
  const statements = SERVICE_TABLES.flatMap((table) => {
    const privileges = revoked.filter((r) => r.table === table).map((r) => r.privilege);
    return privileges.length ? [`revoke ${privileges.join(", ").toLowerCase()} on table public.${table} from service_role;`] : [];
  }).concat(granted.map((r) => `grant ${r.privilege.toLowerCase()} on table public.${r.table} to service_role;`));
  return {revoked, granted, unchanged, preGrantedCells: before.filter((r) => r.granted).length,
    postGrantedCells: after.filter((r) => r.granted).length, postAbsentCells: after.filter((r) => !r.granted).length,
    effectivePrivilegeEntryRevocations: revoked.length, effectivePrivilegeEntryGrants: granted.length,
    unchangedCells: unchanged.length, sqlRevokeStatementCount: new Set(revoked.map((r) => r.table)).size,
    sqlGrantStatementCount: granted.length, statements};
}
export const FUTURE_PROVIDER_ONLY = freeze([
  {table: "attempts", privilege: "INSERT"}, {table: "exam_results", privilege: "INSERT"},
  {table: "referee_exam_sessions", privilege: "UPDATE"},
]);
