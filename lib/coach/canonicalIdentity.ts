export type CoachIdentityDependencies<Client> = {
  getAuthenticatedUserId(): Promise<string | null>;
  createAdminClient(): Client;
  loadAccess(
    client: Client,
    externalSubject: string
  ): Promise<{ userId: string }>;
};

export async function resolveCanonicalCoachIdentity<Client>(
  dependencies: CoachIdentityDependencies<Client>
) {
  const externalSubject = await dependencies.getAuthenticatedUserId();
  if (!externalSubject) return null;

  const client = dependencies.createAdminClient();
  const access = await dependencies.loadAccess(client, externalSubject);

  return {
    client,
    userId: access.userId,
  };
}
