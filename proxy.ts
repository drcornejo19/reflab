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

const isDevelopmentIdentityLinkRoute = createRouteMatcher([
  "/api/development/identity-link",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isDevelopmentIdentityLinkRoute(req)) {
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
