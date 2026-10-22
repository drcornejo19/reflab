import { auth } from "@clerk/nextjs/server";
import { executeDevelopmentIdentityLinkRoute } from "@/lib/identity/developmentLinker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  return executeDevelopmentIdentityLinkRoute(request, {
    getAuthenticatedUserId: async () => {
      const session = await auth();
      return session.userId;
    },
  });
}
