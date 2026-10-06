import { ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS } from "../bootstrap/production-role-bootstrap-contract.mjs";

export const IDENTITY_PRE_MEMBERSHIPS = Object.freeze([
  ...ROLE_BOOTSTRAP_POST_PHASE2A_MEMBERSHIPS,
  ...["anon", "authenticated", "service_role"].map((grantedRole) => Object.freeze({
    grantedRole, memberRole: "authenticator", grantorRole: "supabase_admin",
    adminOption: false, inheritOption: false, setOption: true,
  })),
]);
export const IDENTITY_PRE_SCOPE = Object.freeze([
  "postgres", "anon", "authenticated", "service_role", "legacy_runtime",
  "reflab_rls_owner", "reflab_prod_preflight_ro", "reflab_preflight_audit_owner",
]);
export const IDENTITY_PRE_SUBJECTS = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);
export const IDENTITY_PRE_TARGETS = Object.freeze([
  "postgres", "reflab_rls_owner", "reflab_prod_preflight_ro", "reflab_preflight_audit_owner",
  "supabase_admin", "supabase_privileged_role",
]);
const literals = (names) => names.map((name) => `'${name}'`).join(", ");
const tuple = (r) => [r.grantedRole, r.memberRole, r.grantorRole,
  r.adminOption, r.inheritOption, r.setOption].join("|");
const fields = ["granted_role", "member_role", "grantor_role", "admin_option", "inherit_option", "set_option"];

export const IDENTITY_MEMBERSHIP_PRE_SQL = `(with expected(granted_role, member_role, grantor_role, admin_option, inherit_option, set_option) as (
  values
  ${IDENTITY_PRE_MEMBERSHIPS.map((r) => `('${r.grantedRole}', '${r.memberRole}', '${r.grantorRole}', ${r.adminOption}, ${r.inheritOption}, ${r.setOption})`).join(",\n  ")}
), actual as (
  select granted.rolname::text, member_role.rolname::text, grantor.rolname::text,
    membership.admin_option, membership.inherit_option, membership.set_option
  from pg_catalog.pg_auth_members membership
  join pg_catalog.pg_roles granted on granted.oid = membership.roleid
  join pg_catalog.pg_roles member_role on member_role.oid = membership.member
  join pg_catalog.pg_roles grantor on grantor.oid = membership.grantor
  where granted.rolname in (${literals(IDENTITY_PRE_SCOPE)})
     or member_role.rolname in (${literals(IDENTITY_PRE_SCOPE)})
), protected_access as (
  select subject.oid as subject_oid, target.oid as target_oid
  from pg_catalog.pg_roles subject cross join pg_catalog.pg_roles target
  where subject.rolname in (${literals(IDENTITY_PRE_SUBJECTS)})
    and target.rolname in (${literals(IDENTITY_PRE_TARGETS)})
)
select not exists (select * from expected except select * from actual)
  and not exists (select * from actual except select * from expected)
  and (select count(*) from protected_access) = 24
  and not exists (select 1 from protected_access
    where pg_catalog.pg_has_role(subject_oid, target_oid, 'MEMBER')
       or pg_catalog.pg_has_role(subject_oid, target_oid, 'USAGE')
       or pg_catalog.pg_has_role(subject_oid, target_oid, 'SET'))
  and pg_catalog.pg_has_role('postgres', 'reflab_rls_owner', 'MEMBER')
  and not pg_catalog.pg_has_role('postgres', 'reflab_rls_owner', 'USAGE')
  and pg_catalog.pg_has_role('postgres', 'reflab_rls_owner', 'SET'))`;

export function identityMembershipsExact(rows, relationships) {
  if (!Array.isArray(rows) || !Array.isArray(relationships)) return false;
  const relevant = rows.filter((r) => IDENTITY_PRE_SCOPE.includes(r.granted_role)
    || IDENTITY_PRE_SCOPE.includes(r.member_role));
  if (relevant.length !== IDENTITY_PRE_MEMBERSHIPS.length
      || relevant.some((r) => fields.slice(3).some((f) => typeof r[f] !== "boolean"))) return false;
  const expected = IDENTITY_PRE_MEMBERSHIPS.map(tuple).sort();
  const observed = relevant.map((r) => fields.map((f) => r[f]).join("|")).sort();
  if (!observed.every((value, i) => value === expected[i])) return false;
  const relation = (s, t) => relationships.filter((r) => r.subject_role === s && r.target_role === t);
  for (const subject of IDENTITY_PRE_SUBJECTS) {
    for (const target of IDENTITY_PRE_TARGETS) {
      const found = relation(subject, target);
      if (found.length !== 1 || !["member", "usage", "set"].every((f) => found[0][f] === false)) return false;
    }
  }
  const owner = relation("postgres", "reflab_rls_owner");
  return owner.length === 1 && owner[0].member === true && owner[0].usage === false && owner[0].set === true;
}

export const IDENTITY_PRE_HELPER_ACL = Object.freeze([
  "institution", "platform", "reflab",
].flatMap((name) => (name === "platform"
  ? ["postgres", "authenticated", "service_role"]
  : ["PUBLIC", "anon", "authenticated", "postgres", "service_role"])
  .map((grantee) => Object.freeze({ signature: `public.${name}_request_user_id()`,
    grantee, grantor: "postgres", privilege_type: "EXECUTE", is_grantable: false }))));

export const IDENTITY_HELPER_ACL_PRE_SQL = `(with expected(signature, grantee, grantor, privilege_type, is_grantable) as (
  values
  ${IDENTITY_PRE_HELPER_ACL.map((r) => `('${r.signature}', '${r.grantee}', '${r.grantor}', '${r.privilege_type}', false)`).join(",\n  ")}
), actual as (
  select expected_function.signature,
    case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee)::text end,
    pg_catalog.pg_get_userbyid(acl.grantor)::text, acl.privilege_type, acl.is_grantable
  from (select signature from expected group by signature) expected_function
  join pg_catalog.pg_proc routine on routine.oid = pg_catalog.to_regprocedure(expected_function.signature)
  cross join lateral pg_catalog.aclexplode(coalesce(routine.proacl,
    pg_catalog.acldefault('f', routine.proowner))) acl
)
select not exists (select * from expected except select * from actual)
  and not exists (select * from actual except select * from expected))`;

export function legacyServiceRoleAccessExact(rows) {
  return Array.isArray(rows) && ["institution", "platform", "reflab"].every((name) => {
    const grants = rows.filter((r) => r.signature === `public.${name}_request_user_id()`
      && r.grantee === "service_role");
    return grants.length === 1 && grants[0].grantor === "postgres"
      && grants[0].privilege_type === "EXECUTE" && grants[0].is_grantable === false;
  });
}
