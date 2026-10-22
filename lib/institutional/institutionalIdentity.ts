import "server-only";

import {
  IdentityLinkRequiredError,
  resolveCanonicalAccessUserId,
} from "../access/server.ts";
import type { createSupabaseAdminClient } from "../supabaseAdmin.ts";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

type InstitutionalIdentityDependencies = {
  resolveCanonicalUserId: typeof resolveCanonicalAccessUserId;
};

const defaultDependencies: InstitutionalIdentityDependencies = {
  resolveCanonicalUserId: resolveCanonicalAccessUserId,
};

export async function resolveInstitutionalActorUserId(
  supabase: SupabaseAdminClient,
  clerkSubject: string,
  dependencies: InstitutionalIdentityDependencies = defaultDependencies
) {
  return dependencies.resolveCanonicalUserId(supabase, clerkSubject);
}

export function isCanonicalInstitutionSuperAdmin(roleKey: unknown) {
  return roleKey === "super_admin";
}

export async function resolveInstitutionalInviteeIdentity(
  supabase: SupabaseAdminClient,
  clerkSubject: string,
  dependencies: InstitutionalIdentityDependencies = defaultDependencies
) {
  try {
    return {
      kind: "linked" as const,
      userId: await dependencies.resolveCanonicalUserId(
        supabase,
        clerkSubject
      ),
    };
  } catch (error) {
    if (error instanceof IdentityLinkRequiredError) {
      return { kind: "pending" as const };
    }
    throw error;
  }
}
