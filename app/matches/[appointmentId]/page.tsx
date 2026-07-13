import { AppShell } from "@/components/AppShell";
import { MatchAppointmentDetailClient } from "@/components/MatchAppointmentDetailClient";

export const dynamic = "force-dynamic";

export default async function MatchAppointmentPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;

  return (
    <AppShell>
      <MatchAppointmentDetailClient appointmentId={appointmentId} />
    </AppShell>
  );
}
