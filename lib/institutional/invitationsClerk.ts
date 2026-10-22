import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  createInstitutionInvitationDependencies,
  normalizeVerifiedEmails,
} from "@/lib/institutional/invitations";

export const institutionInvitationRouteDependencies =
  createInstitutionInvitationDependencies({
    getAuthenticatedUserId: async () => (await auth()).userId,
    getVerifiedEmails: async (clerkSubject) => {
      const clerk = await clerkClient();
      const user = await clerk.users.getUser(clerkSubject);
      return normalizeVerifiedEmails(user.emailAddresses);
    },
  });
