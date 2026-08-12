import assert from "node:assert/strict";
import test from "node:test";
import {
  IDENTITY_LINK_REQUIRED,
  IdentityLinkRequiredError,
  ensureCanonicalAccessRecords,
  loadAccessSnapshot,
} from "./server.ts";
import {
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  DevelopmentIdentityLinkerConfigurationError,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
} from "../identity/developmentLinker.ts";

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

function normalEnvironment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: "test",
    CLERK_ENV: "test",
    NODE_ENV: "test",
    SUPABASE_ENV: "test",
    SUPABASE_PROJECT_REF: "synthetic-non-development-ref",
    NEXT_PUBLIC_SUPABASE_URL: "https://synthetic-non-development.supabase.co",
    ENABLE_DEVELOPMENT_IDENTITY_LINKER: "false",
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
      ensureCanonicalAccessRecords(
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

test("a linked Development subject reuses the synthetic canonical records", async () => {
  const fake = createAccessClient({
    globalRoles: {
      user_dev_referee_a: { role_key: "referee" },
    },
    subscriptions: {
      user_dev_referee_a: {
        plan_key: "basic",
        status: "active",
        starts_at: "2026-07-27T00:00:00.000Z",
        ends_at: null,
      },
    },
  });

  const result = await ensureCanonicalAccessRecords(
    fake.client as never,
    "user_clerk_linked",
    {
      environment: developmentEnvironment(),
      resolveLinkedIdentity: async (subject) => {
        assert.equal(subject, "user_clerk_linked");
        return "user_dev_referee_a";
      },
    }
  );

  assert.equal(result.userId, "user_dev_referee_a");
  assert.equal(result.globalRole.role_key, "referee");
  assert.equal(result.subscription.plan_key, "basic");
  assert.deepEqual(fake.writes, []);
  assert.ok(
    fake.reads.every((read) => read.userId === "user_dev_referee_a")
  );
});

test("a disabled linker endpoint does not disable canonical Development identity resolution", async () => {
  const fake = createAccessClient();
  await assert.rejects(
    () =>
      ensureCanonicalAccessRecords(
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

test("a non-Development project preserves automatic provisioning for a new user", async () => {
  const fake = createAccessClient();
  const result = await ensureCanonicalAccessRecords(
    fake.client as never,
    "user_normal_new",
    { environment: normalEnvironment() }
  );

  assert.equal(result.userId, "user_normal_new");
  assert.deepEqual(
    fake.writes.map((write) => ({
      table: write.table,
      userId: write.payload.user_id,
      source: write.payload.source,
    })),
    [
      {
        table: "user_global_roles",
        userId: "user_normal_new",
        source: "automatic_default",
      },
      {
        table: "user_subscriptions",
        userId: "user_normal_new",
        source: "automatic_default",
      },
    ]
  );
});

test("existing normal users keep their records without duplicate writes", async () => {
  const fake = createAccessClient({
    globalRoles: {
      user_normal_existing: { role_key: "referee" },
    },
    subscriptions: {
      user_normal_existing: {
        plan_key: "pro",
        status: "active",
        starts_at: "2026-07-01T00:00:00.000Z",
        ends_at: null,
      },
    },
  });

  const result = await ensureCanonicalAccessRecords(
    fake.client as never,
    "user_normal_existing",
    {
      environment: normalEnvironment(),
    }
  );

  assert.equal(result.userId, "user_normal_existing");
  assert.equal(result.subscription.plan_key, "pro");
  assert.deepEqual(fake.writes, []);
});

test("read-only access snapshots never provision missing canonical records", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      loadAccessSnapshot(fake.client as never, "user_normal_missing", {
        environment: normalEnvironment(),
        provisionMissing: false,
      }),
    /Canonical access records are missing/
  );

  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.reads, [
    { table: "user_global_roles", userId: "user_normal_missing" },
    { table: "user_subscriptions", userId: "user_normal_missing" },
  ]);
});

test("production cannot activate Development identity resolution", async () => {
  const fake = createAccessClient();

  await assert.rejects(
    () =>
      ensureCanonicalAccessRecords(
        fake.client as never,
        "user_production",
        {
          environment: developmentEnvironment({
            APP_ENV: "production",
            SUPABASE_ENV: "production",
            SUPABASE_PROJECT_REF: FORBIDDEN_PRODUCTION_PROJECT_REF,
            NEXT_PUBLIC_SUPABASE_URL:
              `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
          }),
          resolveLinkedIdentity: async () => "user_dev_referee_a",
        }
      ),
    DevelopmentIdentityLinkerConfigurationError
  );

  assert.deepEqual(fake.reads, []);
  assert.deepEqual(fake.writes, []);
});
