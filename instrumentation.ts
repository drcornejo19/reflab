import { assertClerkAuthorizedPartiesAtStartup } from "@/lib/auth/clerkAuthorizedParties";
import { assertCanonicalIdentityEnvironmentAtStartup } from "@/lib/identity/developmentIdentityEnvironment";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  assertCanonicalIdentityEnvironmentAtStartup(process.env);
  assertClerkAuthorizedPartiesAtStartup(process.env);
}
