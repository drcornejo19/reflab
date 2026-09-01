import { executeInstitutionInvitationAcceptPost } from "@/lib/institutional/invitations";
import { institutionInvitationRouteDependencies } from "@/lib/institutional/invitationsClerk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ invitationMembershipId: string }> }
) {
  const { invitationMembershipId } = await context.params;
  return executeInstitutionInvitationAcceptPost(
    request,
    invitationMembershipId,
    institutionInvitationRouteDependencies
  );
}
