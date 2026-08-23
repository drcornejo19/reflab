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
]);

const DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_PATH =
  "/api/development/super-admin-identity-link";
const RANKING_API_PATH = "/api/ranking";
const isMatchesApiRoute = createRouteMatcher(["/api/matches(.*)"]);

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

  if (isMatchesApiRoute(req)) {
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
