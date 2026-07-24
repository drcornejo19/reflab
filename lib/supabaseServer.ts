import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createAuthenticatedSupabaseClient } from "@/lib/supabaseAuthenticated";

export async function createSupabaseServerClient() {
  const session = await auth();

  return createAuthenticatedSupabaseClient(() => session.getToken());
}
