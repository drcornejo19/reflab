import { auth } from "@clerk/nextjs/server";
import {
  executeTrainingUsageRequest,
  getCanonicalTrainingUsage,
} from "@/lib/training/attempts";

export async function GET(request: Request) {
  return executeTrainingUsageRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    loadUsage: getCanonicalTrainingUsage,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
