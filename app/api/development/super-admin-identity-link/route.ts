import { auth } from "@clerk/nextjs/server";
import { executeDevelopmentSuperAdminIdentityLinkRoute } from "@/lib/identity/developmentSuperAdminLinker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return executeDevelopmentSuperAdminIdentityLinkRoute(request, {
    getAuthenticatedUserId: async () => {
      const session = await auth();
      return session.userId;
    },
  });
}
