import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/home",
  "/institutional(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/institutional-leads",
  "/api/notifications/scheduled",
  "/api/notifications/scheduled/run",
]);

const DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_PATH =
  "/api/development/super-admin-identity-link";
const RANKING_API_PATH = "/api/ranking";
const ADMIN_CLIPS_API_PATH = "/api/admin/clips";
const adminClipItemPath =
  /^\/api\/admin\/clips\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isMatchesApiRoute = createRouteMatcher(["/api/matches(.*)"]);
const canonicalSelfAuthApiPaths = new Set([
  "/api/ref-performance",
  "/api/psychology",
  "/api/notifications/preferences",
  "/api/notifications/register-token",
  "/api/notifications/send",
]);

const isProtectedDevelopmentIdentityLinkRoute = createRouteMatcher([
  "/api/development/identity-link",
]);

export default clerkMiddleware(async (auth, req) => {
  if (
    req.nextUrl.pathname === DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_PATH
  ) {
    return;
  }

  if (req.nextUrl.pathname === RANKING_API_PATH) {
    return;
  }

  if (
    req.nextUrl.pathname === ADMIN_CLIPS_API_PATH ||
    adminClipItemPath.test(req.nextUrl.pathname)
  ) {
    return;
  }

  if (isMatchesApiRoute(req)) {
    return;
  }

  if (canonicalSelfAuthApiPaths.has(req.nextUrl.pathname)) {
    return;
  }

  if (isProtectedDevelopmentIdentityLinkRoute(req)) {
    await auth.protect();
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
