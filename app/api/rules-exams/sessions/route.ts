import { auth } from "@clerk/nextjs/server";
import { executeCreateExamSessionRequest } from "@/lib/exams/canonicalExam";
import { startCanonicalRulesExam } from "@/lib/exams/canonicalRulesExam";

export async function POST(request: Request) {
  return executeCreateExamSessionRequest(request, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    startExam: startCanonicalRulesExam,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
