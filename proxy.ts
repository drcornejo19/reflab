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

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
