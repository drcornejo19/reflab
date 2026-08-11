import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IdentityLinkRequiredError } from "../access/server.ts";
import {
  AdminUsersForbiddenError,
  authorizeCanonicalAdminUsersRead,
  loadCanonicalAdminUsers,
  sanitizeAdminUsersReadError,
} from "./usersRead.ts";

const superAdminAccess = {
  userId: "user_dev_super_admin",
  globalRole: "super_admin",
  individualPlan: "pro",
  effectiveIndividualPlan: "pro",
  capabilities: ["platform.admin"],
  sources: ["super_admin"],
  inheritedFromInstitutionIds: [],
};

test("a canonical Super Admin is authorized without provisioning", async () => {
  let options: unknown;
  const result = await authorizeCanonicalAdminUsersRead(
    {} as never,
    "clerk_subject",
    {
      async loadActorAccess(_supabase, externalUserId, receivedOptions) {
        assert.equal(externalUserId, "clerk_subject");
        options = receivedOptions;
        return superAdminAccess as never;
      },
    }
  );

  assert.equal(result.userId, "user_dev_super_admin");
  assert.deepEqual(options, { provisionMissing: false });
});

test("a non-Super Admin is rejected", async () => {
  await assert.rejects(
    () =>
      authorizeCanonicalAdminUsersRead({} as never, "clerk_subject", {
        async loadActorAccess() {
          return { ...superAdminAccess, globalRole: "referee" } as never;
        },
      }),
    AdminUsersForbiddenError
  );
});

test("an unlinked Development subject remains identity_link_required", async () => {
  await assert.rejects(
    () =>
      authorizeCanonicalAdminUsersRead({} as never, "unlinked_subject", {
        async loadActorAccess() {
          throw new IdentityLinkRequiredError();
        },
      }),
    IdentityLinkRequiredError
  );
});

test("canonical users are built without writes or Clerk identifiers", async () => {
  const tables: string[] = [];
  const writes: string[] = [];
  const supabase = {
    from(table: string) {
      tables.push(table);
      return {
        select() {
          if (table === "user_profiles") {
            return Promise.resolve({
              data: [
                {
                  user_id: "user_dev_referee_a",
                  email: "referee-a@example.test",
                  reflab_name: "Referee A",
                  first_name: "Referee",
                  last_name: "A",
                  ref_card_id: "RF-DEV-A",
                  avatar_url: null,
                  created_at: "2026-07-27T00:00:00.000Z",
                  updated_at: "2026-07-27T00:00:00.000Z",
                },
              ],
              error: null,
            });
          }
          if (table === "user_global_roles") {
            return Promise.resolve({
              data: [{ user_id: "user_dev_referee_a", role_key: "referee" }],
              error: null,
            });
          }
          if (table === "user_subscriptions") {
            return Promise.resolve({
              data: [{
                user_id: "user_dev_referee_a",
                plan_key: "pro",
                status: "active",
                starts_at: "2026-07-27T00:00:00.000Z",
                ends_at: null,
              }],
              error: null,
            });
          }
          return {
            async eq() {
              return {
                data: [{
                  user_id: "user_dev_referee_a",
                  institution_id: "institution-dev-a",
                  status: "active",
                }],
                error: null,
              };
            },
          };
        },
        insert() {
          writes.push(table);
        },
        update() {
          writes.push(table);
        },
        upsert() {
          writes.push(table);
        },
        delete() {
          writes.push(table);
        },
      };
    },
  };
  const users = await loadCanonicalAdminUsers(supabase as never);

  assert.deepEqual(tables, [
    "user_profiles",
    "user_global_roles",
    "user_subscriptions",
    "institution_memberships",
  ]);
  assert.deepEqual(writes, []);
  assert.equal(users.length, 1);
  assert.equal(users[0]?.userId, "user_dev_referee_a");
  assert.equal(users[0]?.role, "individual_referee");
  assert.equal(users[0]?.subscriptionPlan, "pro");
  assert.equal(users[0]?.institutionId, "institution-dev-a");
  assert.equal("clerkUserId" in (users[0] ?? {}), false);
  assert.doesNotMatch(JSON.stringify(users), /clerk_subject/);
});

test("Clerk-only users are neither listed nor provisioned", async () => {
  const writes: string[] = [];
  const supabase = {
    from(table: string) {
      return {
        select() {
          if (table === "institution_memberships") {
            return { async eq() { return { data: [], error: null }; } };
          }
          return Promise.resolve({ data: [], error: null });
        },
        insert() {
          writes.push(table);
        },
        update() {
          writes.push(table);
        },
        upsert() {
          writes.push(table);
        },
        delete() {
          writes.push(table);
        },
      };
    },
  };

  const users = await loadCanonicalAdminUsers(supabase as never);

  assert.deepEqual(users, []);
  assert.deepEqual(writes, []);
});

test("structured Supabase errors are sanitized", () => {
  assert.deepEqual(
    sanitizeAdminUsersReadError({
      code: "42P01",
      message: "relation missing Bearer secret-value",
    }),
    {
      code: "42P01",
      message: "relation missing Bearer [redacted]",
    }
  );
  assert.notEqual(
    sanitizeAdminUsersReadError({ code: "XX000" }).message,
    "[object Object]"
  );
});

test("GET is side-effect free and PATCH keeps its existing write flow", async () => {
  const [routeSource, pageSource, readerSource] = await Promise.all([
    readFile(new URL("../../app/api/admin/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../../app/admin/users/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("./usersRead.ts", import.meta.url), "utf8"),
  ]);
  const getSource = routeSource.slice(
    routeSource.indexOf("export async function GET"),
    routeSource.indexOf("export async function PATCH")
  );
  const patchSource = routeSource.slice(
    routeSource.indexOf("export async function PATCH")
  );

  assert.match(getSource, /requireSuperAdminReadAccess/);
  assert.match(getSource, /loadCanonicalAdminUsers/);
  assert.doesNotMatch(getSource, /ensureUserRecords|listClerkUsers|user_roles/);
  assert.doesNotMatch(getSource, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(getSource, /clerkUserId/);
  assert.doesNotMatch(pageSource, /clerkUserId|Clerk User ID/);
  assert.deepEqual(
    [...readerSource.matchAll(/\.from\("([^"]+)"\)/g)].map((match) => match[1]),
    [
      "user_profiles",
      "user_global_roles",
      "user_subscriptions",
      "institution_memberships",
    ]
  );
  assert.doesNotMatch(readerSource, /user_roles|ensureUserRecords|clerkClient/);
  assert.match(patchSource, /requireSuperAdminAccess/);
  assert.match(patchSource, /ensureUserRecords/);
  assert.match(patchSource, /admin_set_user_plan/);
  assert.match(patchSource, /admin_set_global_role/);
});
