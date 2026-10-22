import "server-only";

import { auth } from "@clerk/nextjs/server";
import { loadAccessSnapshot } from "../access/server.ts";
import { createSupabaseAdminClient } from "../supabaseAdmin.ts";
import { resolveCanonicalRequestIdentity } from "./canonicalRequestIdentityCore.ts";

export async function requireCanonicalRequestIdentity() {
  const externalSubject = (await auth()).userId;
  return resolveCanonicalRequestIdentity(externalSubject, {
    createSupabase: createSupabaseAdminClient,
    loadAccess: (supabase, externalSubject) =>
      loadAccessSnapshot(supabase, externalSubject, {
        provisionMissing: false,
      }),
    logError: (label, diagnostic) => console.error(label, diagnostic),
  });
}
