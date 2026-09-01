import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_LINK_REQUIRED,
  IdentityLinkRequiredError,
  loadAccessSnapshot,
  resolveCanonicalAccessUserId,
} from "./server.ts";
import {
  CanonicalDataEnvironmentConfigurationError,
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
  ProductionCanonicalIdentityUnavailableError,
} from "../identity/developmentIdentityEnvironment.ts";

type GlobalRoleRecord = {
  role_key: string;
};

type SubscriptionRecord = {
  plan_key: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

type AccessFixture = {
  globalRoles?: Record<string, GlobalRoleRecord>;
  subscriptions?: Record<string, SubscriptionRecord>;
};

function developmentEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    APP_ENV: "development",
    CLERK_ENV: "development",
    NODE_ENV: "development",
    REFLAB_DATA_ENV: "development",
    SUPABASE_ENV: "development",
    SUPABASE_PROJECT_REF: DEVELOPMENT_SUPABASE_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${DEVELOPMENT_SUPABASE_PROJECT_REF}.supabase.co`,
    SUPABASE_SECRET_KEY: "sb_secret_synthetic-test-value",
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "true",
    DEVELOPMENT_IDENTITY_LINK_SECRET:
      "synthetic-development-linker-secret-0000000000000001",
    ...overrides,
  };
}

function productionEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    APP_ENV: "production",
    CLERK_ENV: "production",
    NODE_ENV: "production",
    REFLAB_DATA_ENV: "production",
    SUPABASE_ENV: "production",
    SUPABASE_PROJECT_REF: FORBIDDEN_PRODUCTION_PROJECT_REF,
    NEXT_PUBLIC_SUPABASE_URL:
      `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
    VERCEL_ENV: "production",
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
    ...overrides,
  };
}

function createAccessClient(fixture: AccessFixture = {}) {
  const globalRoles = new Map(
    Object.entries(fixture.globalRoles ?? {})
  );
  const subscriptions = new Map(
    Object.entries(fixture.subscriptions ?? {})
  );
  const reads: Array<{ table: string; userId: string }> = [];
  const writes: Array<{
    table: string;
    payload: Record<string, unknown>;
  }> = [];

  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, userId: string) {
              assert.equal(column, "user_id");
              reads.push({ table, userId });
              return {
                async maybeSingle() {
                  const data =
                    table === "user_global_roles"
                      ? globalRoles.get(userId) ?? null
                      : subscriptions.get(userId) ?? null;
                  return { data, error: null };
                },
              };
            },
          };
        },
        async upsert(payload: Record<string, unknown>) {
          writes.push({ table, payload });
          const userId = String(payload.user_id);

          if (table === "user_global_roles" && !globalRoles.has(userId)) {
            globalRoles.set(userId, {
              role_key: String(payload.role_key),
            });
          }

          if (table === "user_subscriptions" && !subscriptions.has(userId)) {
            subscriptions.set(userId, {
              plan_key: String(payload.plan_key),
              status: String(payload.status),
              starts_at: new Date().toISOString(),
              ends_at: null,
            });
          }

          return { error: null };
        },
      };
    },
  };

  return { client, reads, writes };
}

test("Development subject without a link requires identity linking and performs zero provisioning writes", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      resolveCanonicalAccessUserId(
        fake.client as never,
        "user_clerk_unlinked",
        {
          environment: developmentEnvironment(),
          resolveLinkedIdentity: async () => null,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof IdentityLinkRequiredError);
      assert.equal(error.code, IDENTITY_LINK_REQUIRED);
      assert.equal(error.message, "identity_link_required");
      return true;
    }
  );

  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});

test("a linked Development subject resolves to the canonical user", async () => {
  const fake = createAccessClient();
  const result = await resolveCanonicalAccessUserId(
    fake.client as never,
    "user_clerk_linked",
    {
      environment: developmentEnvironment(),
      resolveLinkedIdentity: async (subject: string) => {
        assert.equal(subject, "user_clerk_linked");
        return "user_dev_referee_a";
      },
    }
  );

  assert.equal(result, "user_dev_referee_a");
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.reads, []);
});

test("a disabled linker endpoint does not disable canonical Development identity resolution", async () => {
  const fake = createAccessClient();
  await assert.rejects(
    () =>
      resolveCanonicalAccessUserId(
        fake.client as never,
        "user_clerk_unlinked",
        {
          environment: developmentEnvironment({
            ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
          }),
          resolveLinkedIdentity: async () => null,
        }
      ),
    IdentityLinkRequiredError
  );

  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});

test("local production-mode builds still resolve Development data links", async () => {
  const fake = createAccessClient();
  const result = await resolveCanonicalAccessUserId(
    fake.client as never,
    "user_clerk_local_build",
    {
      environment: developmentEnvironment({ NODE_ENV: "production" }),
      resolveLinkedIdentity: async () => "user_dev_referee_a",
    }
  );

  assert.equal(result, "user_dev_referee_a");
  assert.deepEqual(fake.writes, []);
});

test("Vercel Preview resolves Development data links", async () => {
  const fake = createAccessClient();
  const result = await resolveCanonicalAccessUserId(
    fake.client as never,
    "user_clerk_preview",
    {
      environment: developmentEnvironment({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
      resolveLinkedIdentity: async () => "user_dev_referee_a",
    }
  );

  assert.equal(result, "user_dev_referee_a");
  assert.deepEqual(fake.writes, []);
});

test("an unlinked Vercel Preview subject fails before access reads or writes", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      resolveCanonicalAccessUserId(
        fake.client as never,
        "user_clerk_preview_unlinked",
        {
          environment: developmentEnvironment({
            NODE_ENV: "production",
            VERCEL_ENV: "preview",
          }),
          resolveLinkedIdentity: async () => null,
        }
      ),
    IdentityLinkRequiredError
  );

  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});

test("read-only access snapshots never provision missing canonical records", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      loadAccessSnapshot(fake.client as never, "user_normal_missing", {
        environment: developmentEnvironment(),
        provisionMissing: false,
        resolveLinkedIdentity: async () => "user_dev_missing",
      }),
    /Canonical access records are missing/
  );

  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.reads, [
    { table: "user_global_roles", userId: "user_dev_missing" },
    { table: "user_subscriptions", userId: "user_dev_missing" },
  ]);
});

test("Production target validation succeeds but identity resolution remains blocked", async () => {
  const fake = createAccessClient();
  let resolverCalled = false;

  await assert.rejects(
    () =>
      resolveCanonicalAccessUserId(
        fake.client as never,
        "user_production",
        {
          environment: productionEnvironment(),
          resolveLinkedIdentity: async () => {
            resolverCalled = true;
            return "user_production_canonical";
          },
        }
      ),
    ProductionCanonicalIdentityUnavailableError
  );

  assert.equal(resolverCalled, false);
  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});

test("Preview cannot target Production data", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      resolveCanonicalAccessUserId(fake.client as never, "user_preview", {
        environment: productionEnvironment({ VERCEL_ENV: "preview" }),
        resolveLinkedIdentity: async () => "never_called",
      }),
    CanonicalDataEnvironmentConfigurationError
  );

  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});
