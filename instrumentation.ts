import { assertCanonicalIdentityEnvironmentAtStartup } from "@/lib/identity/developmentIdentityEnvironment";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  assertCanonicalIdentityEnvironmentAtStartup(process.env);
}
