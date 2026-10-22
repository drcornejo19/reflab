import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  InstitutionTenantAccessError,
  requireAuthorizedInstitutionContext,
  selectActiveInstitutionContext,
} from "./tenantIsolation.ts";
import type {
  InstitutionAccessSnapshot,
  InstitutionContext,
} from "./types.ts";

function context(id: string, permissions: string[] = ["members.manage"]) {
  return {
    institution: { id },
    membership: { permissionKeys: permissions },
    isSuperAdmin: false,
    simulatedRole: null,
    demoMode: false,
  } as InstitutionContext;
}

function snapshot(
  contexts: InstitutionContext[],
  activeInstitutionId: string | null = null
) {
  return {
    contexts,
    activeInstitutionId,
    isSuperAdmin: false,
  } as InstitutionAccessSnapshot;
}

function expectForbidden(
  accessSnapshot: InstitutionAccessSnapshot,
  requestedInstitutionId: string
) {
  assert.throws(
    () =>
      requireAuthorizedInstitutionContext(
        accessSnapshot,
        requestedInstitutionId
      ),
    (error: unknown) =>
      error instanceof InstitutionTenantAccessError && error.status === 403
  );
}

test("a member of A may use A as the authorized default", () => {
  const institutionA = context("institution-a");
  const selected = requireAuthorizedInstitutionContext(snapshot([institutionA]));
  assert.equal(selected.institution.id, "institution-a");
});

test("a member of A may explicitly request A", () => {
  const selected = requireAuthorizedInstitutionContext(
    snapshot([context("institution-a")]),
    "institution-a"
  );
  assert.equal(selected.institution.id, "institution-a");
});

test("a member or administrator of A cannot explicitly request B", () => {
  const memberSnapshot = snapshot([context("institution-a", ["members.read"])]);
  const adminSnapshot = snapshot([context("institution-a", ["members.manage"])]);
  expectForbidden(memberSnapshot, "institution-b");
  expectForbidden(adminSnapshot, "institution-b");
});

test("an unknown institution UUID is rejected", () => {
  expectForbidden(
    snapshot([context("11111111-1111-4111-8111-111111111111")]),
    "99999999-9999-4999-8999-999999999999"
  );
});

test("a member of A and B may explicitly select B", () => {
  const selected = requireAuthorizedInstitutionContext(
    snapshot([context("institution-a"), context("institution-b")]),
    "institution-b"
  );
  assert.equal(selected.institution.id, "institution-b");
});

test("an institutional administrator retains the authorized permission set", () => {
  const selected = requireAuthorizedInstitutionContext(
    snapshot([
      context("institution-a", [
        "institution.manage",
        "members.manage",
        "roles.manage",
      ]),
    ]),
    "institution-a"
  );

  assert.deepEqual(selected.membership?.permissionKeys, [
    "institution.manage",
    "members.manage",
    "roles.manage",
  ]);
});

test("an explicit ID never falls back to the active or first context", () => {
  const accessSnapshot = snapshot(
    [context("institution-a"), context("institution-b")],
    "institution-a"
  );
  assert.equal(
    selectActiveInstitutionContext(accessSnapshot, "institution-c"),
    null
  );
});

test("the exact authorized ID is the only tenant sent to a service-role query", () => {
  const selected = requireAuthorizedInstitutionContext(
    snapshot([context("institution-a"), context("institution-b")]),
    "institution-b"
  );
  const queriedTenantIds: string[] = [];
  const queryWithServiceRole = (institutionId: string) => {
    queriedTenantIds.push(institutionId);
  };

  queryWithServiceRole(selected.institution.id);
  assert.deepEqual(queriedTenantIds, ["institution-b"]);
});

test("server authorization and directory queries use the selected tenant", async () => {
  const [serverSource, directorySource] = await Promise.all([
    readFile(new URL("./server.ts", import.meta.url), "utf8"),
    readFile(new URL("./directory-server.ts", import.meta.url), "utf8"),
  ]);

  assert.match(
    serverSource,
    /institutionId:\s*context\.institution\.id/
  );
  const mutationSource = directorySource.slice(
    directorySource.indexOf("export async function inviteInstitutionMember")
  );
  assert.equal(
    mutationSource.match(
      /const authorizedInstitutionId = access\.institutionId;/g
    )?.length,
    9
  );
});
