import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  apiAuthRouteManifest,
  classifyApiAuthPath,
  type SelfAuthorizedApiStrategy,
} from "./apiAuthBoundary.ts";

const root = process.cwd();
const proxySource = read("proxy.ts");

test("all 75 API route files belong to exactly one auth category", () => {
  const actualRoutes = collectApiRoutes();
  const manifestRoutes = apiAuthRouteManifest.map((entry) => entry.route).sort();

  assert.equal(actualRoutes.length, 75);
  assert.equal(new Set(manifestRoutes).size, manifestRoutes.length);
  assert.deepEqual(manifestRoutes, actualRoutes);
  assert.deepEqual(countCategories(), {
    self_authorized: 69,
    proxy_protected: 3,
    public: 1,
    internal: 2,
  });
});

test("every manifest sample resolves once to its declared category", () => {
  for (const entry of apiAuthRouteManifest) {
    const match = classifyApiAuthPath(entry.samplePath);
    assert.equal(match?.route, entry.route, entry.route);
    assert.equal(match?.category, entry.category, entry.route);
  }
});

test("self-authorized APIs have a local JSON 401 boundary", () => {
  for (const entry of apiAuthRouteManifest) {
    if (entry.category !== "self_authorized") continue;

    const entryFile = routeFile(entry.route);
    const routeSource = fs.readFileSync(entryFile, "utf8");
    const closure = collectLocalSourceClosure(entryFile);
    assert.match(closure, strategyMarker(entry.strategy!), entry.route);
    assert.match(
      closure,
      unauthorizedMarker(entry.strategy!),
      `${entry.route} must own its unauthenticated response`
    );
    assert.match(
      closure,
      /(?:Next)?Response\.json|institutionalJson/,
      entry.route
    );
    assert.doesNotMatch(
      routeSource,
      /(?:Next)?Response\.redirect|headers\.set\(["']Location["']/i,
      entry.route
    );
  }
});

test("dynamic routes accept only strict UUID paths", () => {
  const dynamicEntries = apiAuthRouteManifest.filter((entry) => entry.pattern);
  assert.equal(dynamicEntries.length, 16);

  for (const entry of dynamicEntries) {
    assert.equal(classifyApiAuthPath(`${entry.samplePath}/extra`), null);
    assert.equal(
      classifyApiAuthPath(
        entry.samplePath.replace(
          "11111111-1111-4111-8111-111111111111",
          "not-a-uuid"
        )
      ),
      null
    );
  }
});

test("invented and similar API paths remain protected by default", () => {
  for (const pathname of [
    "/api/ranking/preview",
    "/api/admin/clips-not-really",
    "/api/matches-private",
    "/api/notifications/preferences/other",
    "/api/institution/reports/export/extra",
    "/api/unknown",
  ]) {
    assert.equal(classifyApiAuthPath(pathname), null, pathname);
  }
});

test("library, support and the standard Development linker remain protected", () => {
  for (const pathname of [
    "/api/library",
    "/api/support",
    "/api/development/identity-link",
  ]) {
    assert.equal(classifyApiAuthPath(pathname)?.category, "proxy_protected");
  }
});

test("public and internal endpoints retain their exact classifications", () => {
  assert.equal(
    classifyApiAuthPath("/api/institutional-leads")?.category,
    "public"
  );
  assert.equal(
    classifyApiAuthPath("/api/notifications/scheduled")?.category,
    "internal"
  );
  assert.equal(
    classifyApiAuthPath("/api/notifications/scheduled/run")?.category,
    "internal"
  );
});

test("Proxy uses the manifest while Clerk still protects private pages", () => {
  assert.match(proxySource, /clerkMiddleware\(/);
  assert.match(proxySource, /classifyApiAuthPath\(req\.nextUrl\.pathname\)/);
  assert.match(proxySource, /apiRoute\?\.category === "self_authorized"/);
  assert.match(proxySource, /apiRoute\?\.category === "proxy_protected"/);
  assert.match(proxySource, /await auth\.protect\(\)/);
  assert.doesNotMatch(proxySource, /\/api\/\(\.\*\)/);
  assert.doesNotMatch(proxySource, /\/api\/matches\(\.\*\)/);

  for (const pathname of [
    "/performance",
    "/institution",
    "/matches",
    "/admin-clips",
  ]) {
    assert.equal(classifyApiAuthPath(pathname), null);
  }
});

function countCategories() {
  return apiAuthRouteManifest.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.category] = (counts[entry.category] ?? 0) + 1;
    return counts;
  }, {});
}

function collectApiRoutes() {
  return walk(path.join(root, "app", "api"))
    .filter((file) => file.endsWith(`${path.sep}route.ts`))
    .map((file) => {
      const directory = path.relative(
        path.join(root, "app", "api"),
        path.dirname(file)
      );
      return `/api/${directory.split(path.sep).join("/")}`;
    })
    .sort();
}

function routeFile(route: string) {
  return path.join(root, "app", route.slice(1), "route.ts");
}

function collectLocalSourceClosure(entryFile: string) {
  const pending = [entryFile];
  const visited = new Set<string>();
  const sources: string[] = [];

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file) || !fs.existsSync(file)) continue;
    visited.add(file);

    const source = fs.readFileSync(file, "utf8");
    sources.push(source);
    for (const specifier of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const resolved = resolveLocalImport(file, specifier[1]);
      if (resolved) pending.push(resolved);
    }
  }

  return sources.join("\n");
}

function resolveLocalImport(importer: string, specifier: string) {
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importer), specifier)
      : null;
  if (!base) return null;

  const candidates = path.extname(base)
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.mts`,
        path.join(base, "index.ts"),
      ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function strategyMarker(strategy: SelfAuthorizedApiStrategy) {
  const markers: Record<SelfAuthorizedApiStrategy, RegExp> = {
    strict_super_admin:
      /require(?:StrictSuperAdminAccess|SuperAdminReadAccess|SuperAdminAccess)/,
    canonical_identity:
      /requireCanonicalRequestIdentity|executeCanonicalPerformanceSummaryRequest/,
    coach: /prepareCoachRequest/,
    development_super_admin_linker:
      /executeDevelopmentSuperAdminIdentityLinkRoute/,
    exam: /execute(?:Create|Submit)ExamSession?Request|executeSubmitExamRequest/,
    institution: /requireInstitutionUserId|loadInvitationRequestContext/,
    matches: /requireMatchesActor/,
    profile: /async function get(?:Profile|Avatar)Access/,
    ranking: /executeCanonicalRankingRequest/,
    sports_session: /requireSportsUser/,
    training: /executeTraining(?:Attempt|Usage)Request/,
  };
  return markers[strategy];
}

function unauthorizedMarker(strategy: SelfAuthorizedApiStrategy) {
  const markers: Record<SelfAuthorizedApiStrategy, RegExp> = {
    strict_super_admin: /status:\s*401/,
    canonical_identity: /status:\s*401/,
    coach: /"UNAUTHORIZED",\s*401/,
    development_super_admin_linker: /status:\s*401/,
    exam: /status:\s*401/,
    institution:
      /InstitutionAccessError\("Unauthorized",\s*401\)|"unauthorized"[\s\S]{0,160}?401/,
    matches: /MatchesAccessError\("authentication_required",\s*401/,
    profile: /status:\s*401/,
    ranking: /status:\s*401/,
    sports_session: /status:\s*401/,
    training: /status:\s*401/,
  };
  return markers[strategy];
}

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
