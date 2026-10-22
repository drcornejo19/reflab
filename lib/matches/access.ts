import "server-only";

import { auth } from "@clerk/nextjs/server";
import { loadAccessSnapshot } from "@/lib/access/server";
import {
  getRequestedInstitutionId,
  loadInstitutionAccess,
} from "@/lib/institutional/server";
import {
  getMatchesAccessError,
  MatchesAccessError,
  resolveMatchesActor,
  type RequireMatchesActorInput,
} from "@/lib/matches/canonicalActor";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export { getMatchesAccessError, MatchesAccessError };

export async function requireMatchesActor(
  input: RequireMatchesActorInput = {}
) {
  const clerkSubject = (await auth()).userId;
  if (!clerkSubject) {
    throw new MatchesAccessError("authentication_required", 401);
  }
  const supabase = createSupabaseAdminClient();

  return resolveMatchesActor(clerkSubject, input, {
    supabase,
    loadAccess: (subject) =>
      loadAccessSnapshot(supabase, subject, { provisionMissing: false }),
    loadInstitutionAccess: (canonicalUserId) =>
      loadInstitutionAccess(canonicalUserId, supabase),
    getRequestedInstitutionId,
    loadProfile: async (canonicalUserId) => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select(
          "user_id,reflab_name,first_name,last_name,country,association,category,main_role,referee_type,ref_card_id"
        )
        .eq("user_id", canonicalUserId)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    },
  });
}
