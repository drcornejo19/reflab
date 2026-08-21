import { auth } from "@clerk/nextjs/server";
import {
  executeCanonicalRankingRequest,
  loadCanonicalGlobalRanking,
} from "@/lib/ranking/canonicalRanking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return executeCanonicalRankingRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    loadRanking: loadCanonicalGlobalRanking,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
