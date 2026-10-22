import { additionalFixtureEvidence, buildAdditionalFixtureSetup } from "./phase3-additional-runtime-service-role-fixture.mjs";
import { additionalAccounting } from "./phase3-additional-runtime-service-role-matrix.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { QUERY_ID, COLUMN_TYPES, EXPECTED_POLICY, PRIVILEGES } from "./phase3-institutional-leads-insert-contract.mjs";

export function leadFixture(post = false) {
  const rows = additionalFixtureEvidence(true), p = rows.get(SERVICE_FORENSIC_QUERY_ID);
  if (post) {
    p.tableAcls.push({ schema: "public", table: "institutional_leads", grantee: "service_role", grantor: "postgres", privilege: "INSERT", grantable: false });
    p.effectiveTablePrivileges.find((r) => r.table === "institutional_leads" && r.privilege === "INSERT").granted = true;
    p.catalogCounts.tableAcls++;
  }
  const grants = post ? ["SELECT", "INSERT", "UPDATE"] : ["SELECT", "UPDATE"];
  rows.set(QUERY_ID, { tableCount: 1, owner: "postgres", rls: true, force: false,
    columns: Object.entries(COLUMN_TYPES).map(([column, type]) => ({ column, type })),
    rawService: grants.map((privilege) => ({ privilege, grantor: "postgres", grantable: false })),
    effectiveService: PRIVILEGES.map((privilege) => ({ privilege, granted: grants.includes(privilege) })),
    browser: ["PUBLIC", "anon", "authenticated"].flatMap((role) => PRIVILEGES.map((privilege) => ({ role, privilege, granted: false }))),
    columnWriteSubstitutes: 0, policies: structuredClone([EXPECTED_POLICY]), serviceBypass: true, serviceMemberships: 0,
    protected: "c".repeat(32) });
  return rows;
}

export function fixtureSetup() {
  return `-- LOCAL_SYNTHETIC_ONLY; completed Production migrations are not executed.
${buildAdditionalFixtureSetup()}
${additionalAccounting().statements.join("\n")}
drop table public.institutional_leads;
create table public.institutional_leads (${Object.entries(COLUMN_TYPES).map(([name,type]) => `${name} ${type}`).join(",")});
alter table public.institutional_leads enable row level security;
grant select,update on public.institutional_leads to service_role;
grant select on public.institutional_leads to reflab_prod_preflight_ro;
grant select(owner_user_id,converted_by_user_id) on public.institutional_leads to reflab_preflight_audit_owner;
create policy reflab_preflight_audit_owner_read on public.institutional_leads for select to reflab_preflight_audit_owner using(true);
`;
}
