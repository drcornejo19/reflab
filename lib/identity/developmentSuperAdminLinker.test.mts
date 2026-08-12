import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEVELOPMENT_SUPER_ADMIN_CANONICAL_USER_ID,
  DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER,
  assertDevelopmentSuperAdminIdentityLinkerEnvironment,
  assertDevelopmentSuperAdminIdentityLinkerRequest,
  executeDevelopmentSuperAdminIdentityLinkRoute,
  handleDevelopmentSuperAdminIdentityLinkRequest,
  linkDevelopmentSuperAdminClerkIdentity,
  type DevelopmentSuperAdminIdentityLinkStatus,
} from "./developmentSuperAdminLinker.ts";
import {
  DEVELOPMENT_SUPABASE_PROJECT_REF,
  DevelopmentIdentityLinkerConfigurationError,
  FORBIDDEN_PRODUCTION_PROJECT_REF,
} from "./developmentIdentityEnvironment.ts";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const migrationSource = read(
  "supabase/migrations/202608110002_development_super_admin_identity_link.sql"
);
const routeSource = read(
  "app/api/development/super-admin-identity-link/route.ts"
);
const proxySource = read("proxy.ts");
const linkerSource = read(
  "lib/identity/developmentSuperAdminLinker.ts"
);

const localSecret =
  "synthetic-super-admin-linker-secret-0000000000000001";

function read(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

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
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_synthetic",
    CLERK_SECRET_KEY: "sk_test_synthetic",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-value",
    ENABLE_DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINKER: "true",
    DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET: localSecret,
    ...overrides,
  };
}

function authorizedRequest() {
  return new Request(
    "http://localhost/api/development/super-admin-identity-link",
    {
      method: "POST",
      headers: {
        [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
          localSecret,
        host: "localhost",
        origin: "http://localhost",
      },
    }
  );
}

function rpcClient(status: DevelopmentSuperAdminIdentityLinkStatus) {
  return {
    async rpc(
      functionName: "link_development_super_admin_clerk_identity",
      parameters: { p_external_subject: string }
    ) {
      assert.equal(
        functionName,
        "link_development_super_admin_clerk_identity"
      );
      assert.deepEqual(parameters, {
        p_external_subject: "user_clerk_super_admin_local",
      });
      return { data: status, error: null };
    },
  };
}

test("valid Development calls only the fixed Super Admin RPC", async () => {
  const status = await linkDevelopmentSuperAdminClerkIdentity(
    "user_clerk_super_admin_local",
    {
      environment: developmentEnvironment(),
      createClient: () => rpcClient("created"),
    }
  );

  assert.equal(status, "created");
  assert.equal(
    DEVELOPMENT_SUPER_ADMIN_CANONICAL_USER_ID,
    "user_dev_super_admin"
  );
});

test("the fixed linker preserves idempotent and conflict states", async () => {
  for (const expected of ["already_linked", "conflict"] as const) {
    const status = await linkDevelopmentSuperAdminClerkIdentity(
      "user_clerk_super_admin_local",
      {
        environment: developmentEnvironment(),
        createClient: () => rpcClient(expected),
      }
    );
    assert.equal(status, expected);
  }
});

test("environment guard blocks production, wrong projects, and non-Development Clerk", () => {
  const cases = [
    developmentEnvironment({ NODE_ENV: "production" }),
    developmentEnvironment({ NODE_ENV: "test" }),
    developmentEnvironment({ NODE_ENV: undefined }),
    developmentEnvironment({ APP_ENV: "production" }),
    developmentEnvironment({ CLERK_ENV: "production" }),
    developmentEnvironment({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_forbidden",
    }),
    developmentEnvironment({ CLERK_SECRET_KEY: "sk_live_forbidden" }),
    developmentEnvironment({ SUPABASE_ENV: "production" }),
    developmentEnvironment({ VERCEL: "1" }),
    developmentEnvironment({ VERCEL_ENV: "development" }),
    developmentEnvironment({ VERCEL_URL: "preview.example.test" }),
    developmentEnvironment({
      SUPABASE_PROJECT_REF: "wrong-development-project",
      NEXT_PUBLIC_SUPABASE_URL:
        "https://wrong-development-project.supabase.co",
    }),
    developmentEnvironment({
      SUPABASE_PROJECT_REF: FORBIDDEN_PRODUCTION_PROJECT_REF,
      NEXT_PUBLIC_SUPABASE_URL:
        `https://${FORBIDDEN_PRODUCTION_PROJECT_REF}.supabase.co`,
    }),
  ];

  for (const environment of cases) {
    assert.throws(
      () =>
        assertDevelopmentSuperAdminIdentityLinkerEnvironment(environment),
      DevelopmentIdentityLinkerConfigurationError
    );
  }
});

test("the endpoint is disabled by default and requires its own secret", async () => {
  const cases = [
    {
      request: authorizedRequest(),
      environment: developmentEnvironment({
        ENABLE_DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINKER: "false",
      }),
    },
    {
      request: new Request(
        "http://localhost/api/development/super-admin-identity-link",
        {
          method: "POST",
          headers: { host: "localhost", origin: "http://localhost" },
        }
      ),
      environment: developmentEnvironment(),
    },
    {
      request: new Request(
        "http://localhost/api/development/super-admin-identity-link",
        {
          method: "POST",
          headers: {
            [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
              "incorrect-super-admin-secret-000000000000000",
            host: "localhost",
            origin: "http://localhost",
          },
        }
      ),
      environment: developmentEnvironment(),
    },
  ];

  for (const currentCase of cases) {
    let serviceCalls = 0;
    const response = await handleDevelopmentSuperAdminIdentityLinkRequest(
      currentCase.request,
      {
        getAuthenticatedUserId: async () =>
          "user_clerk_super_admin_local",
        environment: currentCase.environment,
        linkIdentity: async () => {
          serviceCalls += 1;
          return "created";
        },
      }
    );

    assert.equal(response.status, 403);
    assert.equal(serviceCalls, 0);
  }
});

test("the endpoint requires Clerk and accepts no target input", async () => {
  let unauthorizedServiceCalls = 0;
  const unauthorized = await executeDevelopmentSuperAdminIdentityLinkRoute(
    authorizedRequest(),
    {
      getAuthenticatedUserId: async () => null,
      environment: developmentEnvironment(),
      linkIdentity: async () => {
        unauthorizedServiceCalls += 1;
        return "created";
      },
    }
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("location"), null);
  assert.match(
    unauthorized.headers.get("content-type") ?? "",
    /application\/json/i
  );
  assert.deepEqual(await unauthorized.json(), {
    error: "Debes iniciar sesion para continuar.",
  });
  assert.equal(unauthorizedServiceCalls, 0);

  const forgedRequests = [
    new Request(
      "http://localhost/api/development/super-admin-identity-link?canonicalUserId=user_dev_referee_b",
      {
        method: "POST",
        headers: { host: "localhost", origin: "http://localhost" },
      }
    ),
    new Request(
      "http://localhost/api/development/super-admin-identity-link",
      {
        method: "POST",
        headers: { host: "localhost", origin: "http://localhost" },
        body: JSON.stringify({
          canonicalUserId: "user_dev_referee_b",
          externalSubject: "forged",
        }),
      }
    ),
  ];

  for (const request of forgedRequests) {
    const response = await handleDevelopmentSuperAdminIdentityLinkRequest(
      request,
      {
        getAuthenticatedUserId: async () =>
          "user_clerk_super_admin_local",
        environment: developmentEnvironment(),
      }
    );
    assert.equal(response.status, 400);
  }
});

test("the endpoint accepts strict local headers added by Next", async () => {
  for (const forwardedFor of [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ]) {
    const request = new Request(
      "http://localhost:3000/api/development/super-admin-identity-link",
      {
        method: "POST",
        headers: {
          [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
            localSecret,
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "x-forwarded-for": forwardedFor,
          "x-forwarded-host": "localhost:3000",
          "x-forwarded-proto": "http",
        },
      }
    );

    let serviceCalls = 0;
    const response = await handleDevelopmentSuperAdminIdentityLinkRequest(
      request,
      {
        getAuthenticatedUserId: async () =>
          "user_clerk_super_admin_local",
        environment: developmentEnvironment(),
        linkIdentity: async () => {
          serviceCalls += 1;
          return "created";
        },
      }
    );

    assert.equal(response.status, 201);
    assert.equal(serviceCalls, 1);
  }
});

test("Next forwarded headers remain optional for a valid local request", () => {
  assert.doesNotThrow(() =>
    assertDevelopmentSuperAdminIdentityLinkerRequest(
      authorizedRequest(),
      developmentEnvironment()
    )
  );
});

test("the endpoint rejects non-local and ambiguous forwarding headers", async () => {
  const invalidForwardingHeaders: Array<Record<string, string>> = [
    { "x-forwarded-for": "127.0.0.1, 10.0.0.1" },
    { "x-forwarded-for": "" },
    { "x-forwarded-host": "example.test" },
    { "x-forwarded-host": "" },
    { "x-forwarded-host": "localhost, localhost" },
    { "x-forwarded-proto": "https" },
    { "x-forwarded-proto": "" },
    { "x-forwarded-proto": "http, https" },
    { forwarded: "for=127.0.0.1" },
  ];
  const cases = [
    new Request(
      "http://localhost/api/development/super-admin-identity-link",
      {
        method: "POST",
        headers: {
          [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
            localSecret,
          host: "localhost",
          origin: "https://preview.example.test",
        },
      }
    ),
    new Request(
      "http://localhost/api/development/super-admin-identity-link",
      {
        method: "POST",
        headers: {
          [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
            localSecret,
          host: "localhost",
          origin: "http://localhost",
          "x-forwarded-for": "10.0.0.1",
        },
      }
    ),
    new Request(
      "http://127.0.0.1/api/development/super-admin-identity-link",
      {
        method: "POST",
        headers: {
          [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
            localSecret,
          host: "127.0.0.1",
          origin: "http://localhost",
        },
      }
    ),
    ...invalidForwardingHeaders.map(
      (forwardingHeaders) =>
        new Request(
          "http://localhost/api/development/super-admin-identity-link",
          {
            method: "POST",
            headers: {
              [DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_SECRET_HEADER]:
                localSecret,
              host: "localhost",
              origin: "http://localhost",
              ...forwardingHeaders,
            },
          }
        )
    ),
  ];

  for (const request of cases) {
    let serviceCalls = 0;
    const response = await handleDevelopmentSuperAdminIdentityLinkRequest(
      request,
      {
        getAuthenticatedUserId: async () =>
          "user_clerk_super_admin_local",
        environment: developmentEnvironment(),
        linkIdentity: async () => {
          serviceCalls += 1;
          return "created";
        },
      }
    );
    assert.equal(response.status, 403);
    assert.equal(serviceCalls, 0);
  }
});

test("identity-like headers cannot alter the fixed target", async () => {
  const request = authorizedRequest();
  request.headers.set("x-canonical-user-id", "user_dev_referee_b");
  request.headers.set("x-external-subject", "forged-subject");
  request.headers.set("x-target-user-id", "user_dev_referee_b");

  let receivedSubject = "";
  const response = await handleDevelopmentSuperAdminIdentityLinkRequest(
    request,
    {
      getAuthenticatedUserId: async () =>
        "user_clerk_super_admin_local",
      environment: developmentEnvironment(),
      linkIdentity: async (externalSubject) => {
        receivedSubject = externalSubject;
        return "created";
      },
    }
  );

  assert.equal(response.status, 201);
  assert.equal(receivedSubject, "user_clerk_super_admin_local");
  assert.equal(
    DEVELOPMENT_SUPER_ADMIN_CANONICAL_USER_ID,
    "user_dev_super_admin"
  );
});

test("an authorized request reaches the fixed service exactly once", async () => {
  let serviceCalls = 0;
  const response = await executeDevelopmentSuperAdminIdentityLinkRoute(
    authorizedRequest(),
    {
      getAuthenticatedUserId: async () =>
        "user_clerk_super_admin_local",
      environment: developmentEnvironment(),
      linkIdentity: async (externalSubject) => {
        serviceCalls += 1;
        assert.equal(externalSubject, "user_clerk_super_admin_local");
        return "created";
      },
    }
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: "created" });
  assert.equal(serviceCalls, 1);
});

test("the route derives the subject only from Clerk auth", () => {
  assert.match(routeSource, /await auth\(\)/);
  assert.match(routeSource, /return session\.userId/);
  assert.doesNotMatch(
    routeSource,
    /request\.(?:json|formData)\(\)|searchParams\.get\(|SUPABASE_SERVICE_ROLE_KEY|console\./i
  );
  assert.doesNotMatch(routeSource, /request\.(?:headers|url).*user/i);
  assert.doesNotMatch(routeSource, /canonicalUserId|externalSubject|target/i);
  assert.match(linkerSource, /^import "server-only";/);
  assert.match(linkerSource, /from "node:crypto"/);
  assert.doesNotMatch(linkerSource, /console\.(?:log|warn|error)/);
});

test("Clerk middleware defers auth only for the exact Super Admin link route", () => {
  const configuredPath = proxySource.match(
    /const DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_PATH\s*=\s*\n?\s*"([^"]+)";/
  )?.[1];
  assert.equal(
    configuredPath,
    "/api/development/super-admin-identity-link"
  );
  assert.match(
    proxySource,
    /req\.nextUrl\.pathname\s*===\s*DEVELOPMENT_SUPER_ADMIN_IDENTITY_LINK_PATH/
  );
  assert.match(
    proxySource,
    /if \(!isPublicRoute\(req\)\) \{[\s\S]*?await auth\.protect\(\);/
  );
  assert.match(
    proxySource,
    /isProtectedDevelopmentIdentityLinkRoute\(req\)[\s\S]*?await auth\.protect\(\)/
  );

  const bypassesProtect = (pathname: string) => pathname === configuredPath;
  assert.equal(bypassesProtect(configuredPath), true);
  assert.equal(bypassesProtect(`${configuredPath}/nested`), false);
  assert.equal(bypassesProtect(`${configuredPath}-similar`), false);
  assert.equal(
    bypassesProtect("/api/development/identity-link"),
    false
  );
  assert.equal(bypassesProtect("/api/profile"), false);
  assert.doesNotMatch(
    proxySource,
    /\bfetch\s*\(|NextResponse\.(?:rewrite|redirect)|localhost:3000|127\.0\.0\.1:3000/i
  );
});

test("the migration fixes the target and grants only service_role execution", () => {
  const rpc = migrationSource.match(
    /create function public\.link_development_super_admin_clerk_identity\([\s\S]*?\$function\$;/i
  )?.[0];
  assert.ok(rpc);
  assert.match(
    rpc,
    /target_user_id constant text := 'user_dev_super_admin'/i
  );
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /set search_path = pg_catalog/i);
  assert.doesNotMatch(
    rpc,
    /p_(?:canonical_)?user_id|execute\s+format|user_dev_referee_a/i
  );
  assert.match(
    migrationSource,
    /alter function public\.link_development_super_admin_clerk_identity\(text\)\s+owner to reflab_rls_owner/i
  );
  assert.match(migrationSource, /user_identity_links_pkey/i);
  assert.match(
    migrationSource,
    /user_identity_links_provider_user_key/i
  );
  assert.doesNotMatch(rpc, /\bexecute\s|\bformat\s*\(/i);
  assert.match(
    migrationSource,
    /revoke all on function\s+public\.link_development_super_admin_clerk_identity\(text\)\s+from public, anon, authenticated, service_role/i
  );
  assert.match(
    migrationSource,
    /grant execute on function\s+public\.link_development_super_admin_clerk_identity\(text\)\s+to service_role/i
  );
});

test("the migration adds only fixed Super Admin policies and link insertion", () => {
  const policies = Array.from(
    migrationSource.matchAll(/create policy\s+([a-z0-9_]+)/gi),
    (match) => match[1]
  );
  assert.deepEqual(policies, [
    "user_identity_links_super_admin_rls_owner_insert",
    "user_profiles_super_admin_identity_rls_owner_read",
    "user_subscriptions_super_admin_identity_rls_owner_read",
  ]);
  assert.match(
    migrationSource,
    /user_identity_links_super_admin_rls_owner_insert[\s\S]*?user_id = 'user_dev_super_admin'/i
  );
  assert.doesNotMatch(
    migrationSource,
    /\b(?:insert into|update|delete from)\s+public\.(?:user_profiles|user_global_roles|user_subscriptions|institution_memberships|user_roles)/i
  );
  assert.equal(
    (
      migrationSource.match(
        /insert into reflab_private\.user_identity_links/gi
      ) ?? []
    ).length,
    1
  );
  assert.doesNotMatch(migrationSource, /automatic_default|public\.user_roles/i);
});
