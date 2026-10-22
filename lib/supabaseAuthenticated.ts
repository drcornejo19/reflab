import { createClient } from "@supabase/supabase-js";

export type SupabaseAccessToken = () => Promise<string | null>;

export function createAuthenticatedSupabaseClient(
  accessToken: SupabaseAccessToken
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createClient(supabaseUrl, publishableKey, {
    accessToken,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
