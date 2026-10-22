import { auth } from "@clerk/nextjs/server";
import { executeSubmitExamRequest } from "@/lib/exams/canonicalExam";
import { submitCanonicalRulesExam } from "@/lib/exams/canonicalRulesExam";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  return executeSubmitExamRequest(request, sessionId, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    submitExam: submitCanonicalRulesExam,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
