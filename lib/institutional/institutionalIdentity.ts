import "server-only";

import {
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
