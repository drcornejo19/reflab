import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  isCanonicalInstitutionSuperAdmin,
  resolveInstitutionalActorUserId,
  resolveInstitutionalInviteeIdentity,
} from "./institutionalIdentity.ts";

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

test("institutional identity delegates to canonical resolution without a subject fallback", async () => {
  const result = await resolveInstitutionalActorUserId(
    {} as never,
    "user_clerk_external",
    {
      async resolveCanonicalUserId(_supabase, externalUserId) {
        assert.equal(externalUserId, "user_clerk_external");
        return "user_canonical_referee";
      },
    }
  );

  assert.equal(result, "user_canonical_referee");
});

test("institutional super admin is granted only by the canonical global role", () => {
  assert.equal(isCanonicalInstitutionSuperAdmin("super_admin"), true);
  assert.equal(isCanonicalInstitutionSuperAdmin("video_admin"), false);
  assert.equal(isCanonicalInstitutionSuperAdmin("referee"), false);
  assert.equal(isCanonicalInstitutionSuperAdmin(null), false);
});

test("linked Clerk invitee resolves to the canonical user id", async () => {
  let receivedSubject: string | null = null;
  const identity = await resolveInstitutionalInviteeIdentity(
    {} as never,
    "clerk_subject_linked",
    {
      async resolveCanonicalUserId(_supabase, clerkSubject) {
        receivedSubject = clerkSubject;
        return "user_dev_referee_a";
      },
    }
  );

  assert.deepEqual(identity, {
    kind: "linked",
    userId: "user_dev_referee_a",
  });
  assert.equal(receivedSubject, "clerk_subject_linked");
});

test("unlinked Development Clerk invitee remains pending without exposing its subject", async () => {
  const identity = await resolveInstitutionalInviteeIdentity(
    {} as never,
    "clerk_subject_unlinked",
    {
      async resolveCanonicalUserId() {
        throw new IdentityLinkRequiredError();
      },
    }
  );

  assert.deepEqual(identity, { kind: "pending" });
  assert.equal("userId" in identity, false);
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
