import { serviceRoleFixtureEvidence, buildServiceRoleMechanicalFixture, refreshServiceFixtureCounts } from "./phase3-service-role-privilege-forensic-fixture.mjs";
import { SERVICE_FORENSIC_QUERY_ID } from "./phase3-service-role-privilege-forensic-contract.mjs";
import { BROWSER_FORENSIC_QUERY_ID } from "./phase3-browser-privilege-baseline-forensic-contract.mjs";
import { CORE_POLICY_QUERY_ID } from "./phase3-core-policy-contract.mjs";
import { CURRENT_FUNCTIONS, CURRENT_EXECUTE_ACLS, PRESERVATION_QUERY_ID, currentTableAcls } from "./phase3-current-service-role-contract.mjs";
import { SERVICE_TABLES, serviceMatrix } from "./phase3-current-service-role-matrix.mjs";

export function currentServiceFixtureEvidence(post = false) {
  const e = serviceRoleFixtureEvidence(), p = e.get(SERVICE_FORENSIC_QUERY_ID), b = e.get(BROWSER_FORENSIC_QUERY_ID);
  p.relevantFunctions = CURRENT_FUNCTIONS.map((f) => ({...structuredClone(f), ...(f.exists ? {rawAcl: []} : {})}));
  p.functionExecuteAcls = structuredClone(CURRENT_EXECUTE_ACLS);
  p.tableAcls = [...p.tableAcls.filter((a) => !SERVICE_TABLES.includes(a.table)), ...currentTableAcls(post)];
  p.effectiveTablePrivileges = [...p.effectiveTablePrivileges.filter((a) => !SERVICE_TABLES.includes(a.table)), ...serviceMatrix(post)];
  p.effectiveColumnPrivileges = p.columns.flatMap(({table, column}) => ["SELECT", "INSERT", "UPDATE", "REFERENCES"].map((privilege) =>
    ({schema: "public", table, column, role: "service_role", privilege,
      granted: serviceMatrix(post).some((r) => r.table === table && r.privilege === privilege && r.granted)})));
  b.tableAcls = currentTableAcls(post); b.catalogCounts.tableAcls = b.tableAcls.length;
  e.get(CORE_POLICY_QUERY_ID).table_acl = b.tableAcls.filter((a) => SERVICE_TABLES.slice(0, 10).includes(a.table));
  refreshServiceFixtureCounts(p);
  e.set(PRESERVATION_QUERY_ID, "a".repeat(32));
  return e;
}
// Exact observed signatures/modes/owners/EXECUTE topology, but synthetic bodies and rows.
// Production classifiers never accept the synthetic source hashes or historical proof.
export function buildCurrentServiceFixture() {
  const rows = [buildServiceRoleMechanicalFixture(), "-- SYNTHETIC_FIXTURE_ONLY_NOT_PRODUCTION_TRUTH"];
  for (const f of CURRENT_FUNCTIONS) {
    rows.push(`drop function public.${f.name}();`);
    if (!f.exists) continue;
    rows.push("set session authorization supabase_admin;", `grant create on schema public to ${f.owner};`,
      `set session authorization ${f.owner};`,
      `create function ${f.signature} returns jsonb language plpgsql security definer set search_path=${f.configuration[0].split("=")[1]}
        as $fixture$begin return '{}'::jsonb; end$fixture$;`,
      `revoke all on function ${f.signature} from public;`, `grant execute on function ${f.signature} to service_role;`,
      "set session authorization supabase_admin;", ...(f.owner === "postgres" ? [] : [`revoke create on schema public from ${f.owner};`]));
  }
  rows.push("reset session authorization;");
  return rows.join("\n");
}
