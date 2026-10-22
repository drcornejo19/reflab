import { auth } from "@clerk/nextjs/server";
import {
  executeCanonicalPerformanceSummaryRequest,
  loadCanonicalPerformanceSummary,
} from "@/lib/performance/canonicalSummary";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return executeCanonicalPerformanceSummaryRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    loadSummary: loadCanonicalPerformanceSummary,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
