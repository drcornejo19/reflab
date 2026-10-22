import { jsonQuery, buildSqlBatch } from "../../production-preflight/queries.mjs";
import {
  ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ROLE_BOOTSTRAP_ROLE_ATTRIBUTES,
  ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES,
  ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES,
} from "../bootstrap/production-role-bootstrap-contract.mjs";
import { installerIdentityQuery } from "../bootstrap/run-production-installer-identity-attestation.mjs";

export const ROLE_MEMBERSHIP_FORENSIC_FORMAT = "REFLAB_64236_ROLE_MEMBERSHIP_FORENSIC_V1";
export const ROLE_MEMBERSHIP_QUERY_ID = "phase3_role_membership_forensic";
export const MEMBERSHIP_SCOPE = Object.freeze([...new Set([
  "postgres", "authenticator", "anon", "authenticated", "service_role",
  "reflab_rls_owner", "reflab_prod_preflight_ro", "reflab_preflight_audit_owner",
  "legacy_runtime", "supabase_admin", "supabase_privileged_role",
])]);
export const EFFECTIVE_SUBJECTS = Object.freeze([
  "postgres", "authenticator", "service_role", "reflab_rls_owner", "anon", "authenticated",
]);
export const EFFECTIVE_TARGETS = Object.freeze([
  "postgres", "authenticator", "service_role", "reflab_rls_owner",
  "reflab_preflight_audit_owner", "reflab_prod_preflight_ro", "anon", "authenticated",
  "supabase_admin", "supabase_privileged_role",
  "pg_create_subscription", "pg_monitor", "pg_read_all_data", "pg_signal_backend",
]);
const literals = (names) => names.map((name) => "'" + name + "'").join(", ");
const membershipSql = `(with scope as (
    select unnest(array[__SCOPE__]::text[]) as name
  ), memberships as (
    select m.roleid as granted_role_oid, granted.rolname as granted_role,
      m.member as member_role_oid, member_role.rolname as member_role,
      m.grantor as grantor_role_oid, grantor.rolname as grantor_role,
      m.admin_option, m.inherit_option, m.set_option
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles granted on granted.oid = m.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = m.member
    join pg_catalog.pg_roles grantor on grantor.oid = m.grantor
    where granted.rolname in (select name from scope)
      or member_role.rolname in (select name from scope)
  ), roles as (
    select r.oid, r.rolname, r.rolsuper, r.rolinherit, r.rolcreaterole,
      r.rolcreatedb, r.rolcanlogin, r.rolreplication, r.rolbypassrls
    from pg_catalog.pg_roles r
    where r.rolname in (select name from scope)
      or r.oid in (select granted_role_oid from memberships)
      or r.oid in (select member_role_oid from memberships)
      or r.oid in (select grantor_role_oid from memberships)
  ), effective as (
    select subject.rolname as subject_role, target.rolname as target_role,
      pg_catalog.pg_has_role(subject.oid, target.oid, 'MEMBER') as member,
      pg_catalog.pg_has_role(subject.oid, target.oid, 'USAGE') as usage,
      pg_catalog.pg_has_role(subject.oid, target.oid, 'SET') as set
    from roles subject cross join roles target
    where subject.rolname = any(array[__SUBJECTS__]::text[])
      and target.rolname = any(array[__TARGETS__]::text[])
  ) select pg_catalog.json_build_object(
    'session', pg_catalog.json_build_object(
      'current_user', current_user, 'session_user', session_user,
      'database', pg_catalog.current_database(),
      'server_version_num', pg_catalog.current_setting('server_version_num')::integer,
      'transaction_read_only', pg_catalog.current_setting('transaction_read_only')),
    'membership_count', (select pg_catalog.count(*) from memberships),
    'raw_memberships', (select coalesce(pg_catalog.json_agg(m order by
      granted_role_oid, member_role_oid, grantor_role_oid), '[]'::json) from memberships m),
    'role_attributes', (select coalesce(pg_catalog.json_agg(r order by oid), '[]'::json) from roles r),
    'effective_relationships', (select coalesce(pg_catalog.json_agg(e order by
      subject_role, target_role), '[]'::json) from effective e)
  ))`;
export const roleMembershipForensicQuery = jsonQuery(ROLE_MEMBERSHIP_QUERY_ID,
  membershipSql.replace("__SCOPE__", literals(MEMBERSHIP_SCOPE))
    .replace("__SUBJECTS__", literals(EFFECTIVE_SUBJECTS))
    .replace("__TARGETS__", literals(EFFECTIVE_TARGETS)));

export function buildRoleMembershipForensicBatch() {
  return buildSqlBatch([installerIdentityQuery, roleMembershipForensicQuery]);
}

const tupleFields = Object.freeze([
  "granted_role_oid", "granted_role", "member_role_oid", "member_role",
  "grantor_role_oid", "grantor_role", "admin_option", "inherit_option", "set_option",
]);
const roleFields = Object.freeze([
  "oid", "rolname", "rolsuper", "rolinherit", "rolcreaterole", "rolcreatedb",
  "rolcanlogin", "rolreplication", "rolbypassrls",
]);
const relationshipFields = Object.freeze(["subject_role", "target_role", "member", "usage", "set"]);
const roleName = (value) => typeof value === "string" && /^[a-z_][a-z0-9_]{0,62}$/.test(value);
const oid = (value) => (Number.isSafeInteger(value) ||
  (typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value)))
  && Number(value) > 0 && Number(value) <= 4294967295;
const bool = (value) => typeof value === "boolean";
const tupleKey = (row) => [
  row.granted_role, row.member_role, row.grantor_role,
  row.admin_option, row.inherit_option, row.set_option,
].join("|");
const expectedRows = ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS.map((row) => ({
  granted_role: row.grantedRole, member_role: row.memberRole, grantor_role: row.grantorRole,
  admin_option: row.adminOption, inherit_option: row.inheritOption, set_option: row.setOption,
}));
const protectedRoles = new Set(["postgres", "reflab_rls_owner", "reflab_preflight_audit_owner",
  "reflab_prod_preflight_ro", "supabase_admin", "supabase_privileged_role",
  "pg_create_subscription", "pg_monitor", "pg_read_all_data", "pg_signal_backend"]);
const exposedSubjects = ["anon", "authenticated", "authenticator", "service_role"];
const pick = (row, fields) => Object.fromEntries(fields.map((field) => [field, row[field]]));

function validEvidence(payload) {
  const session = payload?.session;
  if (!session || !roleName(session.current_user) || !roleName(session.session_user)
      || typeof session.database !== "string" || !Number.isInteger(session.server_version_num)
      || !["on", "off"].includes(session.transaction_read_only)
      || !Array.isArray(payload.raw_memberships) || !Array.isArray(payload.role_attributes)
      || !Array.isArray(payload.effective_relationships)
      || payload.membership_count !== payload.raw_memberships.length) return false;
  const roles = payload.role_attributes;
  if (!roles.every((r) => oid(r.oid) && roleName(r.rolname)
      && roleFields.slice(2).every((f) => bool(r[f])))
      || new Set(roles.map((r) => r.oid)).size !== roles.length
      || new Set(roles.map((r) => r.rolname)).size !== roles.length) return false;
  const byOid = new Map(roles.map((r) => [r.oid, r.rolname]));
  if (!payload.raw_memberships.every((m) =>
    ["granted", "member", "grantor"].every((prefix) =>
      oid(m[prefix + "_role_oid"]) && byOid.get(m[prefix + "_role_oid"]) === m[prefix + "_role"])
    && ["admin_option", "inherit_option", "set_option"].every((f) => bool(m[f])))) return false;
  if (new Set(payload.raw_memberships.map((m) =>
    [m.granted_role_oid, m.member_role_oid, m.grantor_role_oid].join("|"))).size
      !== payload.raw_memberships.length) return false;
  const relationships = payload.effective_relationships;
  return relationships.length === EFFECTIVE_SUBJECTS.length * EFFECTIVE_TARGETS.length
    && new Set(relationships.map((r) => r.subject_role + "|" + r.target_role)).size === relationships.length
    && relationships.every((r) => EFFECTIVE_SUBJECTS.includes(r.subject_role)
      && EFFECTIVE_TARGETS.includes(r.target_role)
      && ["member", "usage", "set"].every((f) => bool(r[f]))
      && roles.some((role) => role.rolname === r.subject_role)
      && roles.some((role) => role.rolname === r.target_role));
}

export function classifyRoleMembershipEvidence(payload) {
  const unknownSummary = Object.fromEntries([
    "browserRolesCanBecomePostgres", "browserRolesCanSetRlsOwner",
    "authenticatorCanSetRlsOwner", "serviceRoleCanSetRlsOwner", "postgresCanSetRlsOwner",
    "unexpectedAdminOptionPresent", "unexpectedInheritOptionPresent", "unexpectedSetOptionPresent",
  ].map((key) => [key, "UNKNOWN"]));
  if (!validEvidence(payload)) return {
    classification: "MEMBERSHIP_STATE_UNKNOWN", transactionReadOnly: "UNKNOWN",
    rawMemberships: [], authenticatorMemberships: [], rlsOwnerPostgresMemberships: [],
    roleAttributes: [], effectiveRelationships: [], securitySummary: unknownSummary,
    failedChecks: [], unknownChecks: ["EVIDENCE_INCOMPLETE_OR_MALFORMED"],
  };
  // Only whitelisted catalog fields are returned; arbitrary payload keys never reach stdout.
  const raw = payload.raw_memberships.map((r) => pick(r, tupleFields));
  const roles = payload.role_attributes.map((r) => pick(r, roleFields));
  const relationships = payload.effective_relationships.map((r) => pick(r, relationshipFields));
  const relation = (subject, target) => relationships.find((r) =>
    r.subject_role === subject && r.target_role === target);
  const failedChecks = [];
  const unknownChecks = [];
  const seen = new Set(raw.map(tupleKey));
  for (const row of expectedRows) {
    if (!seen.has(tupleKey(row))) failedChecks.push("APPROVED_TUPLE_DRIFT:" +
      [row.granted_role, row.member_role, row.grantor_role].join(":"));
  }
  const expectedKeys = new Set(expectedRows.map(tupleKey));
  const extra = raw.filter((r) => !expectedKeys.has(tupleKey(r)));
  const unsafeExtra = extra.filter((r) =>
    protectedRoles.has(r.granted_role) || protectedRoles.has(r.member_role));
  if (unsafeExtra.length) failedChecks.push("UNAPPROVED_PROTECTED_ROLE_MEMBERSHIP");
  const unreviewedExtra = extra.filter((r) => !unsafeExtra.includes(r));
  if (unreviewedExtra.length) unknownChecks.push("NO_AUTHORITATIVE_EXPECTATION_FOR_ADDITIONAL_TUPLES");
  for (const subject of exposedSubjects) {
    for (const target of protectedRoles) {
      const r = relation(subject, target);
      if (r.usage || r.set) failedChecks.push("PROTECTED_ROLE_ACCESS:" + subject + ":" + target);
    }
  }
  for (const name of ["anon", "authenticated", "authenticator"]) {
    const role = roles.find((r) => r.rolname === name);
    if (role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls) {
      failedChecks.push("BROWSER_ENDPOINT_ROLE_ATTRIBUTES:" + name);
    }
  }
  for (const [name, expected] of [
    ["postgres", ROLE_BOOTSTRAP_MANAGED_INSTALLER_ATTRIBUTES],
    ["reflab_rls_owner", ROLE_BOOTSTRAP_ROLE_ATTRIBUTES],
    ["reflab_preflight_audit_owner", ROLE_BOOTSTRAP_SEMANTIC_AUDIT_OWNER_ATTRIBUTES],
  ]) {
    const role = roles.find((r) => r.rolname === name);
    if (!role || role.rolreplication !== (expected.rolreplication ?? false)
        || Object.entries(expected).some(([f, v]) => role[f] !== v)) {
      failedChecks.push("PROTECTED_ROLE_ATTRIBUTES:" + name);
    }
  }
  if (!relation("postgres", "reflab_rls_owner").member
      || !relation("postgres", "reflab_rls_owner").set
      || relation("postgres", "reflab_rls_owner").usage) failedChecks.push("INSTALLER_OWNER_CAPABILITIES");
  const session = payload.session;
  if (session.current_user !== "postgres" || session.session_user !== "postgres"
      || session.database !== "postgres" || Math.trunc(session.server_version_num / 10000) !== 17) {
    failedChecks.push("SESSION_NOT_EXACT");
  }
  if (session.transaction_read_only !== "on") failedChecks.push("TRANSACTION_NOT_READ_ONLY");
  const optionUnexpected = (field) => {
    if (unsafeExtra.some((r) => r[field])) return true;
    if (unreviewedExtra.length) return "UNKNOWN";
    return false;
  };
  return {
    classification: failedChecks.length ? "UNSAFE_MEMBERSHIP_DRIFT"
      : unknownChecks.length ? "MEMBERSHIP_STATE_UNKNOWN" : "EXACT_APPROVED_MEMBERSHIP_STATE",
    transactionReadOnly: session.transaction_read_only === "on",
    membershipDirection: "granted_role -> member_role means member_role is the member",
    rawMemberships: raw,
    authenticatorMemberships: raw.filter((r) => r.member_role === "authenticator"
      && ["anon", "authenticated", "service_role"].includes(r.granted_role)),
    rlsOwnerPostgresMemberships: raw.filter((r) =>
      r.granted_role === "reflab_rls_owner" && r.member_role === "postgres"),
    roleAttributes: roles, effectiveRelationships: relationships,
    securitySummary: {
      browserRolesCanBecomePostgres: ["anon", "authenticated"].some((s) =>
        relation(s, "postgres").usage || relation(s, "postgres").set),
      browserRolesCanSetRlsOwner: ["anon", "authenticated"].some((s) => relation(s, "reflab_rls_owner").set),
      authenticatorCanSetRlsOwner: relation("authenticator", "reflab_rls_owner").set,
      serviceRoleCanSetRlsOwner: relation("service_role", "reflab_rls_owner").set,
      postgresCanSetRlsOwner: relation("postgres", "reflab_rls_owner").set,
      unexpectedAdminOptionPresent: optionUnexpected("admin_option"),
      unexpectedInheritOptionPresent: optionUnexpected("inherit_option"),
      unexpectedSetOptionPresent: optionUnexpected("set_option"),
    },
    failedChecks, unknownChecks,
  };
}
