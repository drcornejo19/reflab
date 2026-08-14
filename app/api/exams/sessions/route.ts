import { auth } from "@clerk/nextjs/server";
import { executeCreateExamSessionRequest, startCanonicalExam } from "@/lib/exams/canonicalExam";

export async function POST(request: Request) {
  return executeCreateExamSessionRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    startExam: startCanonicalExam,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
