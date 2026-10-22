import { auth } from "@clerk/nextjs/server";
import { executeSubmitExamRequest, submitCanonicalExam } from "@/lib/exams/canonicalExam";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  return executeSubmitExamRequest(request, sessionId, {
    getAuthenticatedUserId: async () => (await auth()).userId,
    submitExam: submitCanonicalExam,
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
