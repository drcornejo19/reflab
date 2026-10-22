import { auth } from "@clerk/nextjs/server";
import {
  executeTrainingAttemptRequest,
  submitCanonicalTrainingAttempt,
} from "@/lib/training/attempts";

export async function POST(request: Request) {
  return executeTrainingAttemptRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    submitAttempt: submitCanonicalTrainingAttempt,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
