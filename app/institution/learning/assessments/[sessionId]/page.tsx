import { InstitutionAssessmentRunner } from "@/components/institutional/InstitutionAssessmentRunner";

export default async function InstitutionAssessmentSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <InstitutionAssessmentRunner sessionId={sessionId} />;
}
