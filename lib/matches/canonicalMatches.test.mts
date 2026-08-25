import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import type { AccessSnapshot } from "../access/types.ts";
import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "../institutional/types.ts";
import {
  MatchesAccessError,
  resolveMatchesActor,
} from "./canonicalActor.ts";

const root = process.cwd();

function read(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function access(
  globalRole: "referee" | "super_admin" = "referee"
): AccessSnapshot {
  return {
    userId: globalRole === "super_admin" ? "user_dev_super_admin" : "user_dev_referee_a",
    globalRole,
    individualPlan: "pro",
    effectiveIndividualPlan: "pro",
    capabilities: [],
    sources: globalRole === "super_admin" ? ["super_admin"] : ["individual"],
    inheritedFromInstitutionIds: [],
  };
}

function context(
  institutionId: string,
  permissionKeys: Array<"matches.read" | "matches.manage">,
  isSuperAdmin = false
): InstitutionContext {
  return {
    institution: {
      id: institutionId,
      slug: institutionId.toLowerCase(),
      name: `Institution ${institutionId}`,
      institutionType: "association",
      status: "active",
      country: "AR",
      provinceState: null,
      city: null,
      timezone: "America/Argentina/Buenos_Aires",
      logoUrl: null,
      brandColor: "#65a30d",
      enabledSports: ["football_11"],
      planKey: "academy",
      licenseLimit: 100,
      isDemo: false,
    },
    membership: isSuperAdmin
      ? null
      : {
          id: `membership-${institutionId}`,
          institutionId,
          userId: "user_dev_referee_a",
          status: "active",
          primarySport: "football_11",
          category: null,
          roleKeys: ["referee"],
          permissionKeys,
          joinedAt: null,
          lastActiveAt: null,
        },
    isSuperAdmin,
    simulatedRole: null,
    demoMode: false,
  };
}

function dependencies(input: {
  clerkSubject?: string | null;
  access?: AccessSnapshot;
  contexts?: InstitutionContext[];
  identityError?: Error;
}) {
  let accessReads = 0;
  const snapshot: InstitutionAccessSnapshot = {
    activeInstitutionId: null,
    contexts: input.contexts ?? [],
    isSuperAdmin: input.access?.globalRole === "super_admin",
  };

  return {
    clerkSubject: input.clerkSubject ?? null,
    get accessReads() {
      return accessReads;
    },
    value: {
      supabase: {} as never,
      loadAccess: async (clerkSubject: string) => {
        accessReads += 1;
        assert.equal(clerkSubject, input.clerkSubject);
        if (input.identityError) throw input.identityError;
        return input.access ?? access();
      },
      loadInstitutionAccess: async () => snapshot,
      getRequestedInstitutionId: async (explicit?: string | null) =>
        explicit ?? null,
      loadProfile: async () => ({
        user_id: input.access?.userId ?? access().userId,
        reflab_name: "Canonical referee",
        ref_card_id: "RF-DEV-A",
      }),
    },
  };
}

function authorize(
  input: {
    requestedInstitutionId?: string | null;
    requireInstitutionPermission?: "matches.read" | "matches.manage";
  },
  deps: ReturnType<typeof dependencies>
) {
  return resolveMatchesActor(
    deps.clerkSubject,
    input,
    deps.value as never
  );
}

test("linked Matches actor resolves to the canonical user without provisioning", async () => {
  const deps = dependencies({
    clerkSubject: "clerk_subject_never_persisted",
    access: access(),
    contexts: [context("A", ["matches.read"])],
  });
  const authorization = await authorize(
    { requestedInstitutionId: "A", requireInstitutionPermission: "matches.read" },
    deps
  );

  assert.equal(authorization.actor.userId, "user_dev_referee_a");
  assert.equal(authorization.actor.institutionId, "A");
  assert.equal(authorization.actor.canReadInstitution, true);
  assert.equal(authorization.actor.canManageInstitution, false);
  assert.equal(JSON.stringify(authorization).includes("clerk_subject"), false);
});

test("missing session returns a controlled 401 before canonical access", async () => {
  const deps = dependencies({ clerkSubject: null });
  await assert.rejects(
    authorize({}, deps),
    (error: unknown) =>
      error instanceof MatchesAccessError &&
      error.status === 401 &&
      error.code === "authentication_required"
  );
  assert.equal(deps.accessReads, 0);
});

test("unlinked Development identity returns 409 before downstream access", async () => {
  const deps = dependencies({
    clerkSubject: "clerk_subject_unlinked",
    identityError: new IdentityLinkRequiredError(),
  });
  await assert.rejects(
    authorize({}, deps),
    (error: unknown) =>
      error instanceof MatchesAccessError &&
      error.status === 409 &&
      error.code === "identity_link_required"
  );
});

test("institution capabilities distinguish read from manage", async () => {
  const deps = dependencies({
    clerkSubject: "clerk_subject",
    access: access(),
    contexts: [context("A", ["matches.read"])],
  });

  const readable = await authorize(
    { requestedInstitutionId: "A", requireInstitutionPermission: "matches.read" },
    deps
  );
  assert.equal(readable.actor.canReadInstitution, true);
  assert.equal(readable.actor.canManageInstitution, false);
  await assert.rejects(
    authorize(
      { requestedInstitutionId: "A", requireInstitutionPermission: "matches.manage" },
      deps
    ),
    (error: unknown) =>
      error instanceof MatchesAccessError && error.code === "matches_manage_forbidden"
  );
});

test("canonical super admin has Matches capabilities without legacy roles", async () => {
  const superAccess = access("super_admin");
  const deps = dependencies({
    clerkSubject: "clerk_super",
    access: superAccess,
    contexts: [context("A", [], true)],
  });
  const authorization = await authorize(
    { requestedInstitutionId: "A", requireInstitutionPermission: "matches.manage" },
    deps
  );
  assert.equal(authorization.actor.isSuperAdmin, true);
  assert.equal(authorization.actor.canReadInstitution, true);
  assert.equal(authorization.actor.canManageInstitution, true);
  assert.doesNotMatch(
    read("lib/matches/canonicalActor.ts"),
    /video_admin|institutional_instructor|user_roles/
  );
});

test("explicit unauthorized tenant never falls back to another institution", async () => {
  const deps = dependencies({
    clerkSubject: "clerk_subject",
    access: access(),
    contexts: [context("A", ["matches.read", "matches.manage"])],
  });
  await assert.rejects(
    authorize(
      { requestedInstitutionId: "B", requireInstitutionPermission: "matches.manage" },
      deps
    ),
    (error: unknown) =>
      error instanceof MatchesAccessError && error.code === "institution_forbidden"
  );
});

test("all seven handlers use canonical actor resolution and JSON auth errors", () => {
  const routeFiles = [
    "app/api/matches/catalog/route.ts",
    "app/api/matches/appointments/route.ts",
    "app/api/matches/appointments/[appointmentId]/route.ts",
    "app/api/matches/appointments/[appointmentId]/preparations/route.ts",
    "app/api/matches/appointments/[appointmentId]/review/route.ts",
  ];
  const source = routeFiles.map(read).join("\n");

  assert.equal(source.match(/requireMatchesActor\(/g)?.length, 7);
  assert.doesNotMatch(source, /getMatchActorContext|createSupabaseAdminClient|auth\(\)/);
  assert.match(source, /identity_fields_forbidden/);
  assert.match(source, /getMatchesAccessError/);
  assert.match(
    read("lib/matches/access.ts"),
    /if \(!clerkSubject\)[\s\S]*?authentication_required[\s\S]*?createSupabaseAdminClient\(\)/
  );
});

test("Matches GET handlers are read-only and catalog sync is explicit", () => {
  const catalog = read("app/api/matches/catalog/route.ts");
  const appointments = read("app/api/matches/appointments/route.ts");
  const detail = read("app/api/matches/appointments/[appointmentId]/route.ts");
  const sync = read("app/api/matches/catalog/sync/route.ts");
  const getSources = [
    catalog.slice(catalog.indexOf("export async function GET")),
    appointments.slice(
      appointments.indexOf("export async function GET"),
      appointments.indexOf("export async function POST")
    ),
    detail.slice(
      detail.indexOf("export async function GET"),
      detail.indexOf("export async function PATCH")
    ),
  ];

  for (const source of getSources) {
    assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(/);
  }
  assert.doesNotMatch(catalog, /syncSportsCatalogWindow/);
  assert.match(sync, /export async function POST/);
  assert.match(sync, /requireInstitutionPermission:[\s\S]*?"matches\.manage"/);
  assert.match(sync, /syncSportsCatalogWindow/);
});

test("institution assignment derives an active exact-tenant membership user", () => {
  const api = read("lib/matches/api.ts");
  const server = read("lib/matches/server.ts");
  const route = read("app/api/matches/appointments/route.ts");

  assert.match(api, /membershipId\?: string \| null/);
  assert.doesNotMatch(api, /targetUserId\?:/);
  assert.match(server, /\.from\("institution_memberships"\)/);
  assert.match(server, /\.eq\("id", normalizedMembershipId\)/);
  assert.match(server, /\.eq\("institution_id", actor\.institutionId\)/);
  assert.match(server, /\.eq\("status", "active"\)/);
  assert.match(server, /loadCanonicalAccessSnapshot\([\s\S]*?provisionMissing: false/);
  assert.match(route, /"targetUserId"/);
});

test("personal writes clear tenant and institutional writes use authorized tenant", () => {
  const server = read("lib/matches/server.ts");
  const assignments = server.match(
    /institution_id: sourceType === "institutional" \? actor\.institutionId : null/g
  );
  assert.equal(assignments?.length, 2);
  assert.match(server, /created_by: actor\.userId/);
  assert.match(server, /created_by_user_id: actor\.userId/);
  assert.match(server, /appointment_history"\)\.insert\([\s\S]*?user_id: targetUserId/);
  assert.match(server, /changed_by_user_id: actor\.userId/);
  assert.match(server, /match_officials"\)\.insert\([\s\S]*?user_id: targetUserId/);
  assert.match(server, /match_preparations"\)[\s\S]*?user_id: appointment\.user_id/);
  assert.match(server, /post_match_reviews"\)[\s\S]*?user_id: appointment\.user_id/);
  assert.match(server, /canonicalizeStoredAppointmentUser/);
});

test("recommended plan includes only attempts linked to official results", () => {
  const server = read("lib/matches/server.ts");
  const plan = server.slice(
    server.indexOf("async function buildRecommendedPlan"),
    server.indexOf("function calculateWeakestTopic")
  );

  assert.match(plan, /\.from\("exam_results"\)/);
  assert.match(plan, /\.eq\("user_id", userId\)/);
  assert.match(plan, /\.eq\("sport_type", sportType\)/);
  assert.match(plan, /\.not\("exam_result_id", "is", null\)/);
  assert.match(plan, /\.in\("exam_result_id", officialResultIds\)/);
  assert.doesNotMatch(plan, /communication_feedback/);
});

test("Matches API bypass is scoped to exact API routes while pages remain protected", () => {
  const proxy = read("proxy.ts");
  const manifest = read("lib/auth/apiAuthBoundary.ts");
  const providers = read("app/api/matches/providers/route.ts");
  for (const route of [
    "/api/matches/providers",
    "/api/matches/catalog",
    "/api/matches/catalog/sync",
    "/api/matches/appointments",
  ]) {
    assert.match(manifest, new RegExp(JSON.stringify(route)));
  }
  assert.match(manifest, /\/api\/matches\/appointments\/\[appointmentId\]/);
  assert.match(proxy, /classifyApiAuthPath\(req\.nextUrl\.pathname\)/);
  assert.doesNotMatch(proxy, /\/api\/matches\(\.\*\)/);
  assert.doesNotMatch(manifest, /selfAuthorized\("\/matches/);
  assert.match(providers, /requireMatchesActor\(\)/);
  assert.match(providers, /getMatchesAccessError/);
});

test("runtime has no active user_roles and Matches cannot provision defaults", () => {
  const files = collectRuntimeFiles(["app", "components", "lib"]);
  const source = files.map(read).join("\n");
  const matchesSource = collectRuntimeFiles(["app/api/matches", "lib/matches"])
    .map(read)
    .join("\n");
  assert.doesNotMatch(source, /user_roles/);
  assert.doesNotMatch(matchesSource, /automatic_default|provisionMissing:\s*true/);
});

function collectRuntimeFiles(directories: string[]) {
  const files: string[] = [];
  for (const directory of directories) walk(path.join(root, directory), files);
  return files
    .filter((file) => !file.includes(".test."))
    .map((file) => path.relative(root, file));
}

function walk(directory: string, files: string[]) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(absolute);
  }
}
