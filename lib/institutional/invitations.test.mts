import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  executeInstitutionInvitationAcceptPost,
  executeInstitutionInvitationsGet,
  filterPendingInstitutionInvitationRows,
  normalizeVerifiedEmails,
  type InvitationDependencies,
} from "./invitations.ts";

const invitationId = "a1000000-0000-4000-8000-000000000001";

function dependencies(
  overrides: Partial<InvitationDependencies> = {}
): InvitationDependencies {
  return {
    async getAuthenticatedUserId() {
      return "clerk_subject_current";
    },
    createAdminClient() {
      return {} as never;
    },
    async resolveCanonicalUserId(_supabase, clerkSubject) {
      assert.equal(clerkSubject, "clerk_subject_current");
      return "user_dev_referee_a";
    },
    async getVerifiedEmails(clerkSubject: string) {
      assert.equal(clerkSubject, "clerk_subject_current");
      return [" Referee@Example.test ", "referee@example.test"];
    },
    async listInvitations(_supabase, verifiedEmails) {
      assert.deepEqual(verifiedEmails, ["referee@example.test"]);
      return [];
    },
    async acceptInvitation(
      _supabase,
      canonicalUserId,
      receivedInvitationId,
      verifiedEmails
    ) {
      assert.equal(canonicalUserId, "user_dev_referee_a");
      assert.equal(receivedInvitationId, invitationId);
      assert.deepEqual(verifiedEmails, ["referee@example.test"]);
      return {
        status: "accepted" as const,
        institutionId: "b1000000-0000-4000-8000-000000000001",
        membershipId: invitationId,
        invitationMembershipId: invitationId,
        rolesAdded: 0,
        groupsAdded: 0,
      };
    },
    ...overrides,
  };
}

test("verified Clerk emails are normalized, deduplicated, and require verified status", () => {
  assert.deepEqual(
    normalizeVerifiedEmails([
      {
        emailAddress: " Referee@Example.test ",
        verification: { status: "verified" },
      },
      {
        emailAddress: "referee@example.test",
        verification: { status: "verified" },
      },
      {
        emailAddress: "foreign@example.test",
        verification: { status: "unverified" },
      },
    ]),
    ["referee@example.test"]
  );
});

test("only pending invitations matching a verified email are listed", () => {
  const visible = filterPendingInstitutionInvitationRows(
    [
      {
        id: "matching",
        status: "invited",
        user_id: "invitation:matching",
        metadata: { email: " Referee@Example.test " },
      },
      {
        id: "foreign",
        status: "invited",
        user_id: "invitation:foreign",
        metadata: { email: "foreign@example.test" },
      },
      {
        id: "active",
        status: "active",
        user_id: "user_canonical",
        metadata: { email: "referee@example.test" },
      },
    ],
    ["referee@example.test"]
  );

  assert.deepEqual(visible.map((row) => row.id), ["matching"]);
});

test("GET resolves canonical identity and uses only server-side verified emails", async () => {
  let listCalls = 0;
  const response = await executeInstitutionInvitationsGet(
    dependencies({
      async listInvitations(_supabase, emails) {
        listCalls += 1;
        assert.deepEqual(emails, ["referee@example.test"]);
        return [
          {
            id: invitationId,
            institutionId: "b1000000-0000-4000-8000-000000000001",
            institutionName: "Institucion local",
            primarySport: "football_11",
            category: null,
            invitedAt: null,
          },
        ];
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal(listCalls, 1);
  assert.equal((await response.json()).invitations.length, 1);
});

test("missing session returns controlled 401 before Clerk or database access", async () => {
  let downstreamCalls = 0;
  const response = await executeInstitutionInvitationsGet(
    dependencies({
      async getAuthenticatedUserId() {
        return null;
      },
      createAdminClient() {
        downstreamCalls += 1;
        return {} as never;
      },
    })
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "unauthorized");
  assert.equal(downstreamCalls, 0);
});

test("unlinked Development identity returns 409 before email lookup or writes", async () => {
  let downstreamCalls = 0;
  const response = await executeInstitutionInvitationsGet(
    dependencies({
      async resolveCanonicalUserId() {
        throw new IdentityLinkRequiredError();
      },
      async getVerifiedEmails() {
        downstreamCalls += 1;
        return [];
      },
      async listInvitations() {
        downstreamCalls += 1;
        return [];
      },
    })
  );

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "identity_link_required");
  assert.equal(downstreamCalls, 0);
});

test("POST sends only canonical identity, path UUID, and verified emails to the RPC", async () => {
  let acceptCalls = 0;
  const response = await executeInstitutionInvitationAcceptPost(
    new Request(
      `http://localhost/api/institution/invitations/${invitationId}/accept`,
      { method: "POST" }
    ),
    invitationId,
    dependencies({
      async acceptInvitation(
        _supabase,
        canonicalUserId,
        receivedInvitationId,
        emails
      ) {
        acceptCalls += 1;
        assert.equal(canonicalUserId, "user_dev_referee_a");
        assert.notEqual(canonicalUserId, "clerk_subject_current");
        assert.equal(receivedInvitationId, invitationId);
        assert.deepEqual(emails, ["referee@example.test"]);
        return {
          status: "accepted",
          institutionId: "b1000000-0000-4000-8000-000000000001",
          membershipId: invitationId,
          invitationMembershipId: invitationId,
          rolesAdded: 0,
          groupsAdded: 0,
        };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "accepted");
  assert.equal(acceptCalls, 1);
});

test("POST rejects browser-controlled body and query before authentication or RPC", async () => {
  for (const request of [
    new Request(
      `http://localhost/api/institution/invitations/${invitationId}/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "attacker",
          institutionId: "tenant-b",
          verifiedEmails: ["attacker@example.test"],
        }),
      }
    ),
    new Request(
      `http://localhost/api/institution/invitations/${invitationId}/accept?institutionId=tenant-b`,
      { method: "POST" }
    ),
    new Request(
      `http://localhost/api/institution/invitations/${invitationId}/accept`,
      {
        method: "POST",
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("userId=attacker"));
            controller.close();
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" }
    ),
  ]) {
    let authCalls = 0;
    let acceptCalls = 0;
    const response = await executeInstitutionInvitationAcceptPost(
      request,
      invitationId,
      dependencies({
        async getAuthenticatedUserId() {
          authCalls += 1;
          return "clerk_subject_current";
        },
        async acceptInvitation() {
          acceptCalls += 1;
          throw new Error("must not execute");
        },
      })
    );
    assert.equal(response.status, 400);
    assert.equal(authCalls, 0);
    assert.equal(acceptCalls, 0);
  }
});

test("accepted replay is a successful HTTP result", async () => {
  const response = await executeInstitutionInvitationAcceptPost(
    new Request(
      `http://localhost/api/institution/invitations/${invitationId}/accept`,
      { method: "POST" }
    ),
    invitationId,
    dependencies({
      async acceptInvitation() {
        return {
          status: "already_accepted",
          institutionId: "b1000000-0000-4000-8000-000000000001",
          membershipId: invitationId,
          invitationMembershipId: invitationId,
          rolesAdded: 0,
          groupsAdded: 0,
        };
      },
    })
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "already_accepted");
});

test("database errors map to controlled public responses", async () => {
  for (const [code, expectedStatus] of [
    ["42501", 403],
    ["P0002", 404],
    ["55000", 409],
  ] as const) {
    const response = await executeInstitutionInvitationAcceptPost(
      new Request(
        `http://localhost/api/institution/invitations/${invitationId}/accept`,
        { method: "POST" }
      ),
      invitationId,
      dependencies({
        async acceptInvitation() {
          throw { code, message: "technical table detail user_secret" };
        },
      })
    );
    const body = await response.json();
    assert.equal(response.status, expectedStatus);
    assert.doesNotMatch(JSON.stringify(body), /technical|table|user_secret/);
  }
});

test("GET is read-only and UI accepts only after an explicit click", async () => {
  const [service, getRoute, postRoute, component] = await Promise.all([
    readFile(new URL("./invitations.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/institution/invitations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/api/institution/invitations/[invitationMembershipId]/accept/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/institutional/InstitutionInvitationsPanel.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(service, /resolveInstitutionalActorUserId/);
  assert.doesNotMatch(service, /loadAccessSnapshot|ensureUserRecords|user_roles/);
  assert.match(service, /\.in\("metadata->>email", verifiedEmails\)/);
  assert.doesNotMatch(getRoute, /POST|\.insert\(|\.update\(|\.upsert\(/);
  assert.match(postRoute, /invitationMembershipId/);
  assert.doesNotMatch(postRoute, /institutionId|verifiedEmails|userId/);
  assert.match(component, /"Aceptar"/);
  assert.match(component, /onClick=\{\(\) => void acceptInvitation\(invitation\)\}/);
  const effect = component.slice(
    component.indexOf("useEffect"),
    component.indexOf("async function acceptInvitation")
  );
  assert.doesNotMatch(effect, /method:\s*"POST"/);
});
