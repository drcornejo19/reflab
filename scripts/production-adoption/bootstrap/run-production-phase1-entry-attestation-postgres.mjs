import { pathToFileURL } from "node:url";
import { classifyInstallerIdentity, installerIdentityQuery } from "./run-production-installer-identity-attestation.mjs";
import { classifyPhase1Entry, phase1EntryQuery } from "./phase1-entry-attestation-contract.mjs";
import { psql, roleBootstrapSql, withCluster } from "./run-production-role-bootstrap-postgres.mjs";

const scenarios = Object.freeze([
  "reflab_meta_exists",
  "reflab_private_exists",
  "reflab_audit_exists",
  "state_table_exists",
  "marker_exists",
  "identity_links_exists",
  "development_rpc_exists",
  "partial_adoption_role_exists",
  "role_attribute_drift",
  "role_membership_drift",
]);

function queryPayload(environment, query) {
  const output = psql(
    environment,
    `begin read only; select (${query.payloadSql})::text; rollback;`,
    "reflab_prod_preflight_ro",
  ).stdout.trim();
  return JSON.parse(output);
}

function setupPhase1Scenario(environment, scenario) {
  const statements = {
    reflab_meta_exists: "create schema reflab_meta",
    reflab_private_exists: "create schema reflab_private",
    reflab_audit_exists: "create schema reflab_audit",
    state_table_exists: "create schema reflab_meta; create table reflab_meta.reflab_schema_state(id integer)",
    marker_exists: "create schema reflab_meta; create table reflab_meta.reflab_schema_state(installation_status text); insert into reflab_meta.reflab_schema_state values ('installed')",
    identity_links_exists: "create schema reflab_private; create table reflab_private.user_identity_links(id integer)",
    development_rpc_exists: "create function public.resolve_development_clerk_identity(text) returns text language sql as 'select null::text'",
    partial_adoption_role_exists: "create role reflab_preflight_audit_owner nologin",
    role_attribute_drift: "alter role reflab_rls_owner bypassrls",
    role_membership_drift: "create role unexpected_phase1_parent nologin; grant unexpected_phase1_parent to reflab_rls_owner",
  };
  psql(environment, `${statements[scenario]};`, "supabase_admin");
}

async function runScenario(scenario) {
  return withCluster("absent", async (environment) => {
    psql(environment, roleBootstrapSql);
    psql(environment, "alter role reflab_prod_preflight_ro login;", "supabase_admin");
    if (scenario !== "positive") setupPhase1Scenario(environment, scenario);

    const installerEvidence = queryPayload(environment, installerIdentityQuery);
    const phase1Evidence = queryPayload(environment, phase1EntryQuery);
    const installer = classifyInstallerIdentity(installerEvidence);
    const phase1 = classifyPhase1Entry(phase1Evidence, installer);
    const actualMajor = Math.trunc(installerEvidence.server_version_num / 10000);
    const expected = scenario === "positive" && actualMajor === 17 ? "READY" : "BLOCKER";
    const mutationDetected = scenario === "positive"
      ? phase1.callerExact && phase1.readOnlyExact && phase1.roleExact
        && phase1.absenceExact && phase1.noPartialAdoption
        && installer.lifecycleState === "POST_BOOTSTRAP"
        && installer.membershipFingerprintExact
      : scenario.startsWith("reflab_") || ["state_table_exists", "marker_exists", "identity_links_exists", "development_rpc_exists"].includes(scenario)
        ? phase1.absenceExact === false
        : scenario === "partial_adoption_role_exists"
          ? phase1.noPartialAdoption === false
          : phase1.roleExact === false;
    if (phase1.phase1Entry !== expected || !mutationDetected) {
      throw new Error(`Phase 1 entry scenario ${scenario} expected ${expected}, observed ${phase1.phase1Entry}; classification=${JSON.stringify({ installer, phase1 })}.`);
    }
    return {
      scenario,
      installerLifecycle: installer.lifecycleState,
      installerManagedProfile: installer.managedProfile,
      phase1Entry: phase1.phase1Entry,
      readOnly: phase1.readOnlyExact,
      actualPostgresMajor: actualMajor,
      versionGate: actualMajor === 17 ? "PASS" : "EXPECTED_BLOCKER_NON_PG17",
      mutationDetected,
      cleanup: "PASS",
    };
  });
}

export async function runPhase1EntryPostgresRehearsal() {
  const positive = await runScenario("positive");
  const negatives = {};
  for (const scenario of scenarios) negatives[scenario] = await runScenario(scenario);
  return {
    localOnly: true,
    positive,
    negatives,
    negativeCount: scenarios.length,
    cleanup: "PASS",
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPhase1EntryPostgresRehearsal()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`PHASE1_ENTRY_REHEARSAL_FAIL: ${error.message}\n`);
      process.exitCode = 1;
    });
}
