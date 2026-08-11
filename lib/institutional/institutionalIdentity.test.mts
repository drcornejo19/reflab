import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import { resolveInstitutionalActorUserId } from "./institutionalIdentity.ts";

test("a linked Clerk subject resolves to the canonical institutional actor", async () => {
  const result = await resolveInstitutionalActorUserId(
    {} as never,
    "clerk_subject_linked",
    {
      async resolveCanonicalUserId(_supabase, externalUserId) {
        assert.equal(externalUserId, "clerk_subject_linked");
        return "user_dev_referee_a";
      },
    }
  );

  assert.equal(result, "user_dev_referee_a");
});

test("an unlinked Development subject fails before institutional writes", async () => {
  let downstreamWrites = 0;
  const authorizeThenWrite = async () => {
    const actorUserId = await resolveInstitutionalActorUserId(
      {} as never,
      "clerk_subject_unlinked",
      {
        async resolveCanonicalUserId() {
          throw new IdentityLinkRequiredError();
        },
      }
    );
    downstreamWrites += 1;
    return actorUserId;
  };

  await assert.rejects(
    authorizeThenWrite,
    IdentityLinkRequiredError
  );

  assert.equal(downstreamWrites, 0);
});

test("non-Development identity behavior remains unchanged", async () => {
  const result = await resolveInstitutionalActorUserId(
    {} as never,
    "normal_user_id",
    {
      async resolveCanonicalUserId(_supabase, externalUserId) {
        return externalUserId;
      },
    }
  );

  assert.equal(result, "normal_user_id");
});

test("institutional authorization and actor writes share the canonical identity", async () => {
  const [
    serverSource,
    auditSource,
    directorySource,
    assessmentSource,
    contentSource,
    notificationSource,
  ] =
    await Promise.all([
      readFile(new URL("./server.ts", import.meta.url), "utf8"),
      readFile(new URL("./audit-server.ts", import.meta.url), "utf8"),
      readFile(new URL("./directory-server.ts", import.meta.url), "utf8"),
      readFile(new URL("./assessment-server.ts", import.meta.url), "utf8"),
      readFile(new URL("./content-server.ts", import.meta.url), "utf8"),
      readFile(new URL("./notification-server.ts", import.meta.url), "utf8"),
    ]);

  assert.match(
    serverSource,
    /const userId = await requireInstitutionUserId\(supabase\);[\s\S]*?loadInstitutionAccess\(userId, supabase\)/
  );
  assert.match(
    serverSource,
    /resolveInstitutionalActorUserId\([\s\S]*?supabase \?\? createSupabaseAdminClient\(\)[\s\S]*?session\.userId[\s\S]*?\)/
  );
  assert.match(
    serverSource,
    /error instanceof IdentityLinkRequiredError[\s\S]*?InstitutionAccessError\(error\.code, 409\)/
  );
  assert.doesNotMatch(serverSource, /return session\.userId/);
  assert.match(auditSource, /actor_user_id: authorization\.userId/);
  assert.match(directorySource, /invited_by_user_id: access\.userId/);
  assert.match(directorySource, /created_by_user_id: access\.userId/);
  assert.match(directorySource, /assigned_by_user_id: access\.userId/);
  assert.match(assessmentSource, /created_by_user_id: authorization\.userId/);
  assert.match(assessmentSource, /assigned_by_user_id: authorization\.userId/);
  assert.match(assessmentSource, /actor_user_id: authorization\.userId/);
  assert.match(contentSource, /author_user_id: authorization\.userId/);
  assert.match(contentSource, /assigned_by_user_id: authorization\.userId/);
  assert.match(notificationSource, /created_by_user_id: authorization\.userId/);
});

test("tenant isolation remains exact after canonical actor resolution", async () => {
  const [serverSource, tenantSource] = await Promise.all([
    readFile(new URL("./server.ts", import.meta.url), "utf8"),
    readFile(new URL("./tenantIsolation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    serverSource,
    /institutionId: context\.institution\.id/
  );
  assert.match(
    tenantSource,
    /requestedInstitutionId !== undefined && requestedInstitutionId !== null/
  );
  assert.match(tenantSource, /context\.institution\.id === requestedId/);
  assert.match(tenantSource, /\?\? null/);
});
