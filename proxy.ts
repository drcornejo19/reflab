import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { classifyApiAuthPath } from "@/lib/auth/apiAuthBoundary";

const isPublicRoute = createRouteMatcher([
  "/",
  "/home",
  "/institutional(.*)",
  "/demo(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const apiRoute = classifyApiAuthPath(req.nextUrl.pathname);
  if (
    apiRoute?.category === "self_authorized" ||
    apiRoute?.category === "public" ||
    apiRoute?.category === "internal"
  ) {
    return;
  }

  if (apiRoute?.category === "proxy_protected") {
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
