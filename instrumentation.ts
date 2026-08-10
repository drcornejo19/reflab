export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertCanonicalIdentityEnvironmentAtStartup } = await import(
    "@/lib/identity/developmentLinker"
  );
  assertCanonicalIdentityEnvironmentAtStartup();
}
