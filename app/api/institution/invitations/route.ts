import { executeInstitutionInvitationsGet } from "@/lib/institutional/invitations";
import { institutionInvitationRouteDependencies } from "@/lib/institutional/invitationsClerk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return executeInstitutionInvitationsGet(
    institutionInvitationRouteDependencies
  );
}
