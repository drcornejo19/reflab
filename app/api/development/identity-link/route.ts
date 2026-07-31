import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { handleDevelopmentIdentityLinkRequest } from "@/lib/identity/developmentLinker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const result = await handleDevelopmentIdentityLinkRequest(request, {
    getAuthenticatedUserId: async () => {
      const session = await auth();
      return session.userId;
    },
  });

  return NextResponse.json(result.body, { status: result.status });
}
