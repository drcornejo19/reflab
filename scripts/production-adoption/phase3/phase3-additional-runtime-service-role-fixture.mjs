import { currentServiceFixtureEvidence, buildCurrentServiceFixture } from "./phase3-current-service-role-fixture.mjs";
import { serviceMutationAccounting } from "./phase3-current-service-role-matrix.mjs";
import { refreshServiceFixtureCounts } from "./phase3-service-role-privilege-forensic-fixture.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { ADDITIONAL_SERVICE_TABLES, additionalAcls, additionalMatrix, additionalBrowserMatrix } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { ADDITIONAL_QUERY_ID, ADDITIONAL_PRESERVATION_ID } from "./phase3-additional-runtime-service-role-contract.mjs";

export function additionalFixtureEvidence(post = false) {
  const e = currentServiceFixtureEvidence(true), p = e.get(SERVICE_FORENSIC_QUERY_ID);
  if (!p.roleAttributes.some((r) => r.name === "anon")) p.roleAttributes.push({ name: "anon", rolsuper: false,
    rolinherit: true, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolreplication: false,
    rolbypassrls: false, rolconnlimit: -1, serviceRoleMember: false, serviceRoleInherits: false, serviceRoleCanSet: false });
  p.tableAcls = [...p.tableAcls.filter((r) => !ADDITIONAL_SERVICE_TABLES.includes(r.table)), ...additionalAcls(post)];
  p.effectiveTablePrivileges = [...p.effectiveTablePrivileges.filter((r) => !ADDITIONAL_SERVICE_TABLES.includes(r.table)), ...additionalMatrix(post)];
  e.set(ADDITIONAL_QUERY_ID, { columns: ADDITIONAL_SERVICE_TABLES.map((table) => ({ schema: "public", table, column: "id", rawAcl: null })),
    columnAcls: [], browser: additionalBrowserMatrix() });
  e.set(ADDITIONAL_PRESERVATION_ID, "b".repeat(32));
  refreshServiceFixtureCounts(p);
  return e;
}
export function buildAdditionalFixtureSetup() {
  const rows = ["-- SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH", "alter role service_role inherit;", ...serviceMutationAccounting().statements];
  for (const table of ADDITIONAL_SERVICE_TABLES) {
    rows.push(`revoke all on public.${table} from anon,authenticated,service_role,reflab_rls_owner,reflab_prod_preflight_ro;`);
    for (const role of ["anon", "authenticated", "service_role", "reflab_rls_owner", "reflab_prod_preflight_ro"]) {
      const privileges = additionalAcls().filter((a) => a.table === table && a.grantee === role).map((a) => a.privilege);
      if (privileges.length) rows.push(`grant ${privileges.join(",")} on public.${table} to ${role};`);
    }
  }
  return rows.join("\n");
}
export const buildAdditionalFixture = () => `${buildCurrentServiceFixture()}\n${buildAdditionalFixtureSetup()}`;
