import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AccessSnapshot } from "../access/types.ts";
import {
  AdminUsersMutationError,
  applyCanonicalAdminUserMutation,
  parseCanonicalAdminUserMutation,
  publicAdminUsersMutationError,
  sanitizeAdminUsersMutationError,
} from "./usersWrite.ts";

const baseAccess: AccessSnapshot = {
  userId: "user_dev_referee_a",
  globalRole: "referee",
  individualPlan: "basic",
  effectiveIndividualPlan: "basic",
  capabilities: [],
  sources: ["basic_default"],
  inheritedFromInstitutionIds: [],
};

test("canonical admin mutation validates and normalizes UI values", () => {
  assert.deepEqual(
    parseCanonicalAdminUserMutation({
      userId: "user_dev_referee_a",
      role: "individual_referee",
      subscriptionPlan: "free",
      reason: "  approved  ",
    }),
    {
      targetUserId: "user_dev_referee_a",
      role: "referee",
      plan: "basic",
      reason: "approved",
    }
  );
});

test("invalid plans, roles, and canonical targets are rejected", () => {
  for (const body of [
    { userId: "user_dev_referee_a", subscriptionPlan: "enterprise" },
    { userId: "user_dev_referee_a", role: "institution_admin" },
    { userId: " user_dev_referee_a", role: "super_admin" },
  ]) {
    assert.throws(
      () => parseCanonicalAdminUserMutation(body),
      AdminUsersMutationError
    );
  }
});

test("a Super Admin changes an individual plan through the canonical RPC", async () => {
  const calls: Array<{ name: string; parameters: unknown }> = [];
  let access = baseAccess;
  const supabase = {
    async rpc(name: string, parameters: unknown) {
      calls.push({ name, parameters });
      access = {
        ...access,
        individualPlan: "pro" as const,
        effectiveIndividualPlan: "pro" as const,
      };
      return { data: { status: "updated" }, error: null };
    },
  };

  const result = await applyCanonicalAdminUserMutation(
    supabase as never,
    "user_dev_super_admin",
    parseCanonicalAdminUserMutation({
      userId: "user_dev_referee_a",
      subscriptionPlan: "pro",
      reason: "upgrade",
    }),
    {
      async loadTargetAccess(_client, userId, options) {
        assert.equal(userId, "user_dev_referee_a");
        assert.deepEqual(options, { provisionMissing: false });
        return access;
      },
    }
  );

  assert.equal(result.status, "updated");
  assert.equal(result.access.individualPlan, "pro");
  assert.deepEqual(calls, [
    {
      name: "admin_set_canonical_user_plan",
      parameters: {
        p_actor_user_id: "user_dev_super_admin",
        p_target_user_id: "user_dev_referee_a",
        p_plan_key: "pro",
        p_reason: "upgrade",
      },
    },
  ]);
});

test("a Super Admin changes a global role through the canonical RPC", async () => {
  const calls: string[] = [];
  let access = baseAccess;
  const result = await applyCanonicalAdminUserMutation(
    {
      async rpc(name: string) {
        calls.push(name);
        access = { ...access, globalRole: "super_admin" as const };
        return { data: { status: "updated" }, error: null };
      },
    } as never,
    "user_dev_super_admin",
    parseCanonicalAdminUserMutation({
      userId: "user_dev_referee_a",
      role: "super_admin",
    }),
    { async loadTargetAccess() { return access; } }
  );

  assert.equal(result.access.globalRole, "super_admin");
  assert.deepEqual(calls, ["admin_set_canonical_global_role"]);
});

test("repeating an already-applied operation is idempotent", async () => {
  let rpcCalls = 0;
  const result = await applyCanonicalAdminUserMutation(
    { async rpc() { rpcCalls += 1; return { data: null, error: null }; } } as never,
    "user_dev_super_admin",
    parseCanonicalAdminUserMutation({
      userId: "user_dev_referee_a",
      subscriptionPlan: "free",
    }),
    { async loadTargetAccess() { return baseAccess; } }
  );

  assert.equal(result.status, "unchanged");
  assert.equal(rpcCalls, 0);
});

test("two effective changes are rejected before any RPC", async () => {
  let rpcCalls = 0;
  await assert.rejects(
    () =>
      applyCanonicalAdminUserMutation(
        { async rpc() { rpcCalls += 1; return { data: null, error: null }; } } as never,
        "user_dev_super_admin",
        parseCanonicalAdminUserMutation({
          userId: "user_dev_referee_a",
          role: "super_admin",
          subscriptionPlan: "pro",
        }),
        { async loadTargetAccess() { return baseAccess; } }
      ),
    (error: unknown) =>
      error instanceof AdminUsersMutationError &&
      error.code === "multiple_access_changes"
  );
  assert.equal(rpcCalls, 0);
});

test("a Super Admin cannot demote their own canonical identity", async () => {
  await assert.rejects(
    () =>
      applyCanonicalAdminUserMutation(
        {} as never,
        "user_dev_super_admin",
        parseCanonicalAdminUserMutation({
          userId: "user_dev_super_admin",
          role: "individual_referee",
        }),
        {
          async loadTargetAccess() {
            return {
              ...baseAccess,
              userId: "user_dev_super_admin",
              globalRole: "super_admin",
            };
          },
        }
      ),
    (error: unknown) =>
      error instanceof AdminUsersMutationError &&
      error.code === "self_demotion_forbidden"
  );
});

test("a missing canonical target is rejected before any RPC", async () => {
  let rpcCalls = 0;
  await assert.rejects(
    () =>
      applyCanonicalAdminUserMutation(
        { async rpc() { rpcCalls += 1; return { data: null, error: null }; } } as never,
        "user_dev_super_admin",
        parseCanonicalAdminUserMutation({
          userId: "missing_canonical_user",
          subscriptionPlan: "pro",
        }),
        {
          async loadTargetAccess() {
            throw new Error("Canonical access records are missing.");
          },
        }
      ),
    (error: unknown) =>
      error instanceof AdminUsersMutationError &&
      error.code === "canonical_target_not_found" &&
      error.status === 404
  );
  assert.equal(rpcCalls, 0);
});

test("database failures receive safe HTTP classifications", () => {
  assert.deepEqual(
    sanitizeAdminUsersMutationError({
      code: "P0002",
      message: "target missing Bearer secret-value",
    }),
    {
      code: "P0002",
      message: "target missing Bearer [redacted]",
      status: 404,
    }
  );
  assert.equal(
    sanitizeAdminUsersMutationError({ code: "42501", message: "denied" })
      .status,
    403
  );

  const publicError = publicAdminUsersMutationError({
    code: "23514",
    message:
      'new row violates check constraint "user_subscriptions_secret_constraint"',
  });
  assert.deepEqual(publicError, {
    error: "No se pudo guardar el usuario.",
    status: 500,
  });
  assert.doesNotMatch(
    JSON.stringify(publicError),
    /user_subscriptions|constraint|23514|technical/i
  );
});

test("PATCH and its RPC migration are canonical and server-only", async () => {
  const [routeSource, writerSource, migrationSource, verifierSource] =
    await Promise.all([
    readFile(new URL("../../app/api/admin/users/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./usersWrite.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../supabase/migrations/202608110001_canonical_admin_user_access.sql",
        import.meta.url
      ),
      "utf8"
    ),
    readFile(
      new URL(
        "../../scripts/security/verify-admin-access-schema.mjs",
        import.meta.url
      ),
      "utf8"
    ),
  ]);
  const getSource = routeSource.slice(
    routeSource.indexOf("export async function GET"),
    routeSource.indexOf("export async function PATCH")
  );
  const patchSource = routeSource.slice(
    routeSource.indexOf("export async function PATCH")
  );

  assert.match(getSource, /loadCanonicalAdminUsers/);
  assert.doesNotMatch(getSource, /applyCanonicalAdminUserMutation/);
  assert.match(patchSource, /requireSuperAdminReadAccess/);
  assert.match(patchSource, /applyCanonicalAdminUserMutation/);
  assert.doesNotMatch(patchSource, /technical\s*:/);
  assert.doesNotMatch(
    patchSource,
    /ensureUserRecords|user_roles|clerkClient|findClerkUser/
  );
  assert.doesNotMatch(
    writerSource,
    /ensureUserRecords|user_roles|automatic_default|clerk/i
  );
  assert.doesNotMatch(
    migrationSource,
    /\buser_roles\b|automatic_default|admin_set_user_plan\(|admin_set_global_role\(/
  );
  assert.equal((migrationSource.match(/security definer/gi) ?? []).length, 2);
  assert.equal(
    (migrationSource.match(/set search_path = pg_catalog/gi) ?? []).length,
    2
  );
  assert.match(
    migrationSource,
    /grant create on schema public to reflab_rls_owner;[\s\S]*alter function public\.admin_set_canonical_user_plan[\s\S]*alter function public\.admin_set_canonical_global_role[\s\S]*revoke create on schema public from reflab_rls_owner;/i
  );
  assert.match(
    migrationSource,
    /from public, anon, authenticated, service_role;[\s\S]*grant execute on function[\s\S]*admin_set_canonical_user_plan[\s\S]*to service_role;/i
  );
  assert.equal((migrationSource.match(/^create policy /gim) ?? []).length, 7);
  assert.match(
    migrationSource,
    /create policy user_global_roles_admin_actor_lock[\s\S]*for update[\s\S]*reflab\.admin_actor_user_id[\s\S]*with check \(false\);/i
  );
  assert.match(
    migrationSource,
    /p_plan_key is null[\s\S]*p_plan_key not in \('basic', 'pro'\)/i
  );
  assert.match(
    migrationSource,
    /p_role_key is null[\s\S]*p_role_key not in \('referee', 'super_admin'\)/i
  );
  assert.equal(
    (
      migrationSource.match(
        /where global_role\.user_id in \(actor_user_id, target_user_id\)[\s\S]*?order by global_role\.user_id[\s\S]*?for update;/gi
      ) ?? []
    ).length,
    2
  );
  assert.equal(
    (migrationSource.match(/Canonical target access records are incomplete/g) ?? [])
      .length,
    2
  );
  assert.match(verifierSource, /admin_set_canonical_user_plan/);
  assert.match(verifierSource, /admin_set_canonical_global_role/);
  assert.doesNotMatch(
    verifierSource,
    /\.rpc\(["']admin_set_user_plan["']|\.rpc\(["']admin_set_global_role["']/
  );
});
